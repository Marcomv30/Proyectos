-- Corrige crear_asiento_ajuste_neto para el modelo actual de asientos/asiento_lineas.
-- Genera UN asiento resumen agrupando las lineas por cuenta base contable.

CREATE OR REPLACE FUNCTION crear_asiento_ajuste_neto(
  p_empresa_id       INTEGER,
  p_fecha            DATE,
  p_mov_ids          BIGINT[],
  p_referencia       TEXT DEFAULT NULL,
  p_cuenta_inv_id    BIGINT DEFAULT NULL,
  p_cuenta_ajuste_id BIGINT DEFAULT NULL,
  p_categoria_id     BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo_id        INTEGER;
  v_asiento_id        BIGINT;
  v_seq               INTEGER;
  v_numero_fmt        TEXT;
  v_year              TEXT;
  v_cuenta_ajuste_emp BIGINT;
  v_cuenta_ajuste_base BIGINT;
  v_linea             INTEGER := 1;
  v_total_debito      NUMERIC := 0;
  v_total_credito     NUMERIC := 0;
  v_total_movs        INTEGER := 0;
  r                   RECORD;
BEGIN
  IF p_mov_ids IS NULL OR array_length(p_mov_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin movimientos para resumir');
  END IF;

  SELECT COUNT(*)
  INTO v_total_movs
  FROM inv_movimientos
  WHERE empresa_id = p_empresa_id
    AND id = ANY(p_mov_ids);

  IF v_total_movs = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se encontraron movimientos validos');
  END IF;

  SELECT id INTO v_periodo_id
  FROM periodos_fiscales
  WHERE empresa_id = p_empresa_id
    AND fecha_inicio <= p_fecha
    AND fecha_fin    >= p_fecha
  LIMIT 1;

  IF v_periodo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay periodo fiscal activo para la fecha ' || p_fecha::TEXT);
  END IF;

  v_cuenta_ajuste_emp := p_cuenta_ajuste_id;
  IF v_cuenta_ajuste_emp IS NULL THEN
    SELECT cuenta_ajuste_inv_id
    INTO v_cuenta_ajuste_emp
    FROM empresa_config_inventario
    WHERE empresa_id = p_empresa_id;
  END IF;

  IF v_cuenta_ajuste_emp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay cuenta de ajuste configurada');
  END IF;

  SELECT cuenta_base_id
  INTO v_cuenta_ajuste_base
  FROM plan_cuentas_empresa
  WHERE id = v_cuenta_ajuste_emp;

  IF v_cuenta_ajuste_base IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta de ajuste no tiene cuenta_base_id');
  END IF;

  v_year := EXTRACT(YEAR FROM p_fecha)::TEXT;
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(numero_formato, '^INV-(\d+)-\d{4}$', '\1'), '')::INTEGER
  ), 0) + 1
  INTO v_seq
  FROM asientos
  WHERE empresa_id = p_empresa_id
    AND numero_formato LIKE 'INV-%-' || v_year;

  v_numero_fmt := 'INV-' || LPAD(v_seq::TEXT, 3, '0') || '-' || v_year;

  INSERT INTO asientos (
    empresa_id, periodo_id, fecha, descripcion, numero_formato, categoria_id, estado
  ) VALUES (
    p_empresa_id,
    v_periodo_id,
    p_fecha,
    'Ajuste inventario resumen' || COALESCE(' - ' || p_referencia, ''),
    v_numero_fmt,
    p_categoria_id,
    'CONFIRMADO'
  )
  RETURNING id INTO v_asiento_id;

  FOR r IN
    WITH movs AS (
      SELECT
        m.id,
        m.cantidad,
        ABS(m.cantidad * COALESCE(m.costo_unitario, 0)) AS monto,
        COALESCE(p.cuenta_inventario_id, p_cuenta_inv_id, cfg.cuenta_inventario_id) AS cuenta_inv_emp_id
      FROM inv_movimientos m
      JOIN inv_productos p
        ON p.id = m.producto_id
       AND p.empresa_id = m.empresa_id
      LEFT JOIN empresa_config_inventario cfg
        ON cfg.empresa_id = m.empresa_id
      WHERE m.empresa_id = p_empresa_id
        AND m.id = ANY(p_mov_ids)
    ),
    movs_resueltos AS (
      SELECT
        m.id,
        m.cantidad,
        m.monto,
        pce.cuenta_base_id AS cuenta_inv_base_id
      FROM movs m
      LEFT JOIN plan_cuentas_empresa pce
        ON pce.id = m.cuenta_inv_emp_id
    ),
    lineas AS (
      SELECT
        cuenta_inv_base_id AS cuenta_id,
        CASE WHEN cantidad > 0 THEN monto ELSE 0 END AS debito_crc,
        CASE WHEN cantidad < 0 THEN monto ELSE 0 END AS credito_crc
      FROM movs_resueltos
      UNION ALL
      SELECT
        v_cuenta_ajuste_base AS cuenta_id,
        CASE WHEN cantidad < 0 THEN monto ELSE 0 END AS debito_crc,
        CASE WHEN cantidad > 0 THEN monto ELSE 0 END AS credito_crc
      FROM movs_resueltos
    )
    SELECT
      cuenta_id,
      ROUND(SUM(debito_crc), 2) AS debito_crc,
      ROUND(SUM(credito_crc), 2) AS credito_crc
    FROM lineas
    WHERE cuenta_id IS NOT NULL
    GROUP BY cuenta_id
    HAVING ROUND(SUM(debito_crc), 2) <> 0 OR ROUND(SUM(credito_crc), 2) <> 0
    ORDER BY cuenta_id
  LOOP
    INSERT INTO asiento_lineas (
      asiento_id, cuenta_id, debito_crc, credito_crc, debito_usd, credito_usd, descripcion, linea
    ) VALUES (
      v_asiento_id,
      r.cuenta_id,
      r.debito_crc,
      r.credito_crc,
      0,
      0,
      'Ajuste inventario resumen',
      v_linea
    );
    v_total_debito := v_total_debito + COALESCE(r.debito_crc, 0);
    v_total_credito := v_total_credito + COALESCE(r.credito_crc, 0);
    v_linea := v_linea + 1;
  END LOOP;

  IF v_linea = 1 THEN
    DELETE FROM asientos WHERE id = v_asiento_id;
    RETURN jsonb_build_object('ok', false, 'error', 'No fue posible resolver las cuentas contables del ajuste');
  END IF;

  IF ROUND(v_total_debito, 2) <> ROUND(v_total_credito, 2) THEN
    DELETE FROM asiento_lineas WHERE asiento_id = v_asiento_id;
    DELETE FROM asientos WHERE id = v_asiento_id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El asiento resumen no quedo balanceado',
      'debito', v_total_debito,
      'credito', v_total_credito
    );
  END IF;

  PERFORM actualizar_saldos_asiento(v_asiento_id::INTEGER);

  UPDATE inv_movimientos
  SET asiento_id = v_asiento_id
  WHERE empresa_id = p_empresa_id
    AND id = ANY(p_mov_ids);

  RETURN jsonb_build_object(
    'ok', true,
    'asiento_id', v_asiento_id,
    'numero', v_numero_fmt,
    'movimientos', v_total_movs,
    'lineas_asiento', v_linea - 1
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
