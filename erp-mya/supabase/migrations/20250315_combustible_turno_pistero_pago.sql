-- ============================================================
-- MYA ERP — Combustible: Turno, Pistero y Forma de Pago
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUMNAS NUEVAS EN ventas_combustible
-- ------------------------------------------------------------

ALTER TABLE ventas_combustible
  ADD COLUMN IF NOT EXISTS turno_id     INTEGER,   -- FK a turnos_combustible
  ADD COLUMN IF NOT EXISTS attendant_id VARCHAR(60); -- ID del pistero (de KHD)

-- ------------------------------------------------------------
-- 2. TABLA: pagos_combustible
--    Origen: ssf_addin_payments_data (PPD)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pagos_combustible (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
  sale_id         BIGINT  NOT NULL,
  payment_type    VARCHAR(40),   -- CASH, CARD, FLEET, etc.
  payment_info    TEXT,
  registrado_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, sale_id)
);

CREATE INDEX IF NOT EXISTS idx_pagos_comb_empresa_sale
  ON pagos_combustible (empresa_id, sale_id);

-- ------------------------------------------------------------
-- 3. TABLA: tkt_ventas_combustible
--    Encabezado de ticket simplificado (KHD) para obtener pistero
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tkt_ventas_combustible (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
  tkt_trans_id    BIGINT  NOT NULL,
  sale_id         BIGINT,         -- sale_id de la bomba (de KDT.tkt_spirit_sale_id)
  attendant_id    VARCHAR(60),    -- pistero
  tkt_date        DATE,
  tkt_time        VARCHAR(6),
  tkt_type        VARCHAR(20),    -- FACTURA / CREDITO
  customer_name   VARCHAR(120),
  customer_tax_id VARCHAR(30),
  net_amount      NUMERIC(12,2),
  total_amount    NUMERIC(12,2),
  registrado_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, tkt_trans_id)
);

CREATE INDEX IF NOT EXISTS idx_tkt_ventas_sale
  ON tkt_ventas_combustible (empresa_id, sale_id);

-- RLS
ALTER TABLE pagos_combustible     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tkt_ventas_combustible ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pagos_comb_select" ON pagos_combustible;
DROP POLICY IF EXISTS "tkt_ventas_comb_select" ON tkt_ventas_combustible;

CREATE POLICY "pagos_comb_select"     ON pagos_combustible     FOR SELECT TO authenticated USING (true);
CREATE POLICY "tkt_ventas_comb_select" ON tkt_ventas_combustible FOR SELECT TO authenticated USING (true);

-- ------------------------------------------------------------
-- 4. FUNCIÓN ACTUALIZADA: registrar_venta_combustible
--    Agrega asignación automática de turno_id
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
  -- Un turno cubre sale_ids entre start_trans_id y end_trans_id
  -- Si el turno está abierto (end_trans_id NULL o -1), tomar el más reciente cuyo
  -- start_trans_id <= p_sale_id
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

  -- Período fiscal activo
  SELECT id INTO v_periodo_id
  FROM periodos_fiscales
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

-- ------------------------------------------------------------
-- 5. VISTAS DE REPORTE
-- ------------------------------------------------------------

-- Ventas por turno
CREATE OR REPLACE VIEW v_ventas_por_turno AS
SELECT
  vc.empresa_id,
  tc.period_id                          AS turno_numero,
  tc.start_at                           AS turno_inicio,
  tc.end_at                             AS turno_fin,
  tc.period_status                      AS turno_estado,
  vc.pump_id,
  d.descripcion                         AS bomba,
  gc.nombre                             AS combustible,
  COUNT(*)                              AS transacciones,
  SUM(vc.volume)                        AS litros_total,
  SUM(vc.money)                         AS monto_total
FROM ventas_combustible vc
LEFT JOIN turnos_combustible  tc ON tc.id          = vc.turno_id
LEFT JOIN dispensadores        d  ON d.empresa_id  = vc.empresa_id AND d.pump_id   = vc.pump_id
LEFT JOIN grados_combustible  gc ON gc.empresa_id  = vc.empresa_id AND gc.grade_id = vc.grade_id
GROUP BY vc.empresa_id, tc.period_id, tc.start_at, tc.end_at, tc.period_status,
         vc.pump_id, d.descripcion, gc.nombre;

-- Ventas por pistero
CREATE OR REPLACE VIEW v_ventas_por_pistero AS
SELECT
  vc.empresa_id,
  COALESCE(vc.attendant_id, tv.attendant_id, 'Sin asignar') AS pistero,
  vc.end_at::DATE                       AS fecha,
  COUNT(*)                              AS transacciones,
  SUM(vc.volume)                        AS litros_total,
  SUM(vc.money)                         AS monto_total
FROM ventas_combustible vc
LEFT JOIN tkt_ventas_combustible tv ON tv.empresa_id = vc.empresa_id AND tv.sale_id = vc.sale_id
GROUP BY vc.empresa_id, COALESCE(vc.attendant_id, tv.attendant_id, 'Sin asignar'), vc.end_at::DATE;

-- Ventas por forma de pago
CREATE OR REPLACE VIEW v_ventas_por_pago AS
SELECT
  vc.empresa_id,
  vc.end_at::DATE                       AS fecha,
  COALESCE(pc.payment_type, 'Sin info') AS forma_pago,
  COUNT(*)                              AS transacciones,
  SUM(vc.volume)                        AS litros_total,
  SUM(vc.money)                         AS monto_total
FROM ventas_combustible vc
LEFT JOIN pagos_combustible pc ON pc.empresa_id = vc.empresa_id AND pc.sale_id = vc.sale_id
GROUP BY vc.empresa_id, vc.end_at::DATE, COALESCE(pc.payment_type, 'Sin info');

-- ------------------------------------------------------------
-- 6. RETROACTIVO: asignar turno_id a ventas existentes
-- ------------------------------------------------------------
UPDATE ventas_combustible vc
SET turno_id = (
  SELECT tc.id
  FROM turnos_combustible tc
  WHERE tc.empresa_id   = vc.empresa_id
    AND tc.period_type  = 'S'
    AND (tc.start_trans_id IS NULL OR tc.start_trans_id <= vc.sale_id)
    AND (tc.end_trans_id IS NULL OR tc.end_trans_id = -1 OR tc.end_trans_id >= vc.sale_id)
  ORDER BY tc.start_trans_id DESC NULLS LAST
  LIMIT 1
)
WHERE turno_id IS NULL;
