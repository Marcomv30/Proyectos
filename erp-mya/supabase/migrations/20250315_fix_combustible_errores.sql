-- ============================================================
-- MYA ERP — Fix errores migración combustible turno/pistero/pago
-- 1. periodos_fiscales → periodos_contables
-- 2. RLS INSERT para pagos_combustible y tkt_ventas_combustible
-- ============================================================

-- ------------------------------------------------------------
-- 1. RLS: permitir INSERT al service_role
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "pagos_comb_insert" ON pagos_combustible;
DROP POLICY IF EXISTS "tkt_ventas_comb_insert" ON tkt_ventas_combustible;
DROP POLICY IF EXISTS "pagos_comb_update" ON pagos_combustible;
DROP POLICY IF EXISTS "tkt_ventas_comb_update" ON tkt_ventas_combustible;

CREATE POLICY "pagos_comb_insert"
  ON pagos_combustible FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "tkt_ventas_comb_insert"
  ON tkt_ventas_combustible FOR INSERT TO service_role WITH CHECK (true);

-- También permitir UPDATE para ON CONFLICT DO UPDATE
CREATE POLICY "pagos_comb_update"
  ON pagos_combustible FOR UPDATE TO service_role USING (true);

CREATE POLICY "tkt_ventas_comb_update"
  ON tkt_ventas_combustible FOR UPDATE TO service_role USING (true);

-- ------------------------------------------------------------
-- 2. Corregir función: periodos_fiscales → periodos_contables
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_venta_combustible(
  p_empresa_id     INTEGER,
  p_sale_id        BIGINT,
  p_pump_id        INTEGER,
  p_hose_id        INTEGER,
  p_grade_id       INTEGER,
  p_volume         NUMERIC,
  p_money          NUMERIC,
  p_ppu            NUMERIC,
  p_sale_type      SMALLINT,
  p_start_at       TIMESTAMPTZ,
  p_end_at         TIMESTAMPTZ,
  p_price_level    INTEGER   DEFAULT 1,
  p_initial_volume NUMERIC   DEFAULT NULL,
  p_final_volume   NUMERIC   DEFAULT NULL,
  p_site_id        INTEGER   DEFAULT NULL,
  p_preset_amount  NUMERIC   DEFAULT NULL
)
RETURNS TABLE (venta_id BIGINT, asiento_id INTEGER, es_nueva BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  v_venta_id      BIGINT;
  v_asiento_id    INTEGER;
  v_es_nueva      BOOLEAN := FALSE;
  v_grade         RECORD;
  v_periodo_id    INTEGER;
  v_turno_id      INTEGER;
  v_fecha         DATE;
  v_numero_fmt    VARCHAR(30);
  v_seq           INTEGER;
BEGIN
  -- Deduplicación por sale_id
  SELECT id INTO v_venta_id
  FROM ventas_combustible
  WHERE empresa_id = p_empresa_id AND sale_id = p_sale_id;

  IF v_venta_id IS NOT NULL THEN
    RETURN QUERY SELECT v_venta_id, NULL::INTEGER, FALSE;
    RETURN;
  END IF;

  -- Grado combustible y cuenta contable
  SELECT gc.codigo_cuenta, gc.nombre INTO v_grade
  FROM grados_combustible gc
  WHERE gc.empresa_id = p_empresa_id AND gc.grade_id = p_grade_id;

  v_fecha := p_end_at::DATE;

  -- Buscar turno (shift S) al que pertenece esta venta
  SELECT id INTO v_turno_id
  FROM turnos_combustible
  WHERE empresa_id    = p_empresa_id
    AND period_type   = 'S'
    AND (start_trans_id IS NULL OR start_trans_id <= p_sale_id)
    AND (
      end_trans_id IS NULL
      OR end_trans_id = -1
      OR end_trans_id >= p_sale_id
    )
  ORDER BY start_trans_id DESC NULLS LAST
  LIMIT 1;

  -- Período contable activo (CORREGIDO: periodos_contables)
  SELECT id INTO v_periodo_id
  FROM periodos_contables
  WHERE empresa_id = p_empresa_id
    AND fecha_inicio <= v_fecha
    AND fecha_fin    >= v_fecha
  LIMIT 1;

  -- Número formato asiento (prefijo CB)
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(numero_formato, '^CB-(\d+)-\d{4}$', '\1'), '')::INTEGER
  ), 0) + 1
  INTO v_seq
  FROM asientos
  WHERE empresa_id = p_empresa_id
    AND numero_formato LIKE 'CB-%-' || EXTRACT(YEAR FROM v_fecha)::TEXT;

  v_numero_fmt := 'CB-' || LPAD(v_seq::TEXT, 3, '0') || '-' || EXTRACT(YEAR FROM v_fecha)::TEXT;

  -- Insertar venta con turno_id
  INSERT INTO ventas_combustible (
    empresa_id, site_id, sale_id, pump_id, hose_id, grade_id,
    volume, money, ppu, price_level, sale_type,
    initial_volume, final_volume, preset_amount,
    start_at, end_at, turno_id
  ) VALUES (
    p_empresa_id, p_site_id, p_sale_id, p_pump_id, p_hose_id, p_grade_id,
    p_volume, p_money, p_ppu, p_price_level, p_sale_type,
    p_initial_volume, p_final_volume, p_preset_amount,
    p_start_at, p_end_at, v_turno_id
  )
  RETURNING id INTO v_venta_id;

  v_es_nueva := TRUE;

  -- Asiento contable automático (si hay cuenta configurada)
  IF v_grade.codigo_cuenta IS NOT NULL AND v_periodo_id IS NOT NULL THEN
    INSERT INTO asientos (
      empresa_id, periodo_id, fecha, descripcion,
      numero_formato, categoria, estado
    ) VALUES (
      p_empresa_id, v_periodo_id, v_fecha,
      'Venta combustible ' || COALESCE(v_grade.nombre, 'grade ' || p_grade_id::TEXT)
        || ' — bomba ' || p_pump_id || ' manguera ' || p_hose_id
        || ' — ' || p_volume || ' lt',
      v_numero_fmt, 'CB', 'CONFIRMADO'
    )
    RETURNING id INTO v_asiento_id;

    INSERT INTO asiento_lineas (asiento_id, cuenta_id, tipo, monto, descripcion)
    SELECT v_asiento_id, pc.id, 'DB', p_money,
           'Cobro venta combustible sale#' || p_sale_id
    FROM plan_cuentas_empresa pce
    JOIN plan_cuentas pc ON pc.id = pce.cuenta_id
    WHERE pce.empresa_id = p_empresa_id
      AND pc.codigo = (
        SELECT valor FROM parametros_empresa
        WHERE empresa_id = p_empresa_id AND clave = 'cuenta_caja_combustible'
      )
    LIMIT 1;

    INSERT INTO asiento_lineas (asiento_id, cuenta_id, tipo, monto, descripcion)
    SELECT v_asiento_id, pc.id, 'CR', p_money,
           'Venta combustible sale#' || p_sale_id
    FROM plan_cuentas_empresa pce
    JOIN plan_cuentas pc ON pc.id = pce.cuenta_id
    WHERE pce.empresa_id = p_empresa_id
      AND pc.codigo = v_grade.codigo_cuenta
    LIMIT 1;

    PERFORM actualizar_saldos_asiento(v_asiento_id);

    UPDATE ventas_combustible
    SET asiento_id = v_asiento_id
    WHERE id = v_venta_id;
  END IF;

  -- Actualizar control de sync
  UPDATE fusion_sync_control
  SET ultimo_id     = GREATEST(ultimo_id, p_sale_id),
      ultima_sync   = NOW(),
      registros_hoy = registros_hoy + 1,
      errores_consec = 0
  WHERE empresa_id = p_empresa_id AND tabla_fusion = 'ssf_pump_sales';

  RETURN QUERY SELECT v_venta_id, v_asiento_id, v_es_nueva;
END;
$$;
