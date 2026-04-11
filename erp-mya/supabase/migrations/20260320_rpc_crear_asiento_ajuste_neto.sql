-- RPC: crear_asiento_ajuste_neto
-- Recibe una lista de movimientos ya registrados y crea UN asiento contable neto,
-- luego actualiza inv_movimientos.asiento_id para cada uno.
-- Usa SECURITY DEFINER para bypassear RLS en asientos / asiento_lineas.

CREATE OR REPLACE FUNCTION crear_asiento_ajuste_neto(
  p_empresa_id      INTEGER,
  p_fecha           DATE,
  p_mov_ids         BIGINT[],
  p_referencia      TEXT    DEFAULT NULL,
  p_cuenta_inv_id   BIGINT  DEFAULT NULL,
  p_cuenta_ajuste_id BIGINT DEFAULT NULL,
  p_categoria_id    BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_periodo_id   INTEGER;
  v_asiento_id   BIGINT;
  v_seq          INTEGER;
  v_numero_fmt   TEXT;
  v_monto_neto   NUMERIC;
  v_es_entrada   BOOLEAN;
  v_year         TEXT;
  v_cuenta_inv   BIGINT;
  v_cuenta_ajuste BIGINT;
BEGIN
  -- Validar parámetros mínimos
  IF p_mov_ids IS NULL OR array_length(p_mov_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin movimientos');
  END IF;

  -- Calcular monto neto desde los movimientos
  SELECT COALESCE(SUM(cantidad * costo_unitario), 0)
  INTO v_monto_neto
  FROM inv_movimientos
  WHERE id = ANY(p_mov_ids)
    AND empresa_id = p_empresa_id;

  IF v_monto_neto = 0 THEN
    RETURN jsonb_build_object('ok', true, 'asiento_id', NULL, 'mensaje', 'Monto neto cero, sin asiento');
  END IF;

  v_es_entrada := v_monto_neto > 0;
  v_monto_neto := ABS(v_monto_neto);

  -- Cuentas contables
  v_cuenta_inv    := p_cuenta_inv_id;
  v_cuenta_ajuste := p_cuenta_ajuste_id;

  -- Si no se pasaron, leer de config empresa
  IF v_cuenta_inv IS NULL THEN
    SELECT cuenta_inventario_id INTO v_cuenta_inv
    FROM empresa_config_inventario WHERE empresa_id = p_empresa_id;
  END IF;
  IF v_cuenta_ajuste IS NULL THEN
    SELECT cuenta_ajuste_inv_id INTO v_cuenta_ajuste
    FROM empresa_config_inventario WHERE empresa_id = p_empresa_id;
  END IF;

  IF v_cuenta_inv IS NULL OR v_cuenta_ajuste IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cuentas contables no configuradas');
  END IF;

  -- Período fiscal activo
  SELECT id INTO v_periodo_id
  FROM periodos_fiscales
  WHERE empresa_id = p_empresa_id
    AND fecha_inicio <= p_fecha
    AND fecha_fin    >= p_fecha
  LIMIT 1;

  IF v_periodo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay período fiscal activo para la fecha ' || p_fecha::TEXT);
  END IF;

  -- Consecutivo INV-XXX-YYYY
  v_year := EXTRACT(YEAR FROM p_fecha)::TEXT;
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(numero_formato, '^INV-(\d+)-\d{4}$', '\1'), '')::INTEGER
  ), 0) + 1
  INTO v_seq
  FROM asientos
  WHERE empresa_id = p_empresa_id
    AND numero_formato LIKE 'INV-%-' || v_year;

  v_numero_fmt := 'INV-' || LPAD(v_seq::TEXT, 3, '0') || '-' || v_year;

  -- Crear asiento
  INSERT INTO asientos (
    empresa_id, periodo_id, fecha, descripcion, numero_formato, categoria_id, estado
  ) VALUES (
    p_empresa_id,
    v_periodo_id,
    p_fecha,
    'Ajuste inventario' || COALESCE(' — ' || p_referencia, '') || ' | ' || p_fecha::TEXT,
    v_numero_fmt,
    p_categoria_id,
    'CONFIRMADO'
  )
  RETURNING id INTO v_asiento_id;

  -- Líneas del asiento (neto)
  IF v_es_entrada THEN
    INSERT INTO asiento_lineas (asiento_id, cuenta_id, tipo, monto, descripcion) VALUES
      (v_asiento_id, v_cuenta_inv,    'DB', v_monto_neto, 'Ajuste entrada inventario'),
      (v_asiento_id, v_cuenta_ajuste, 'CR', v_monto_neto, 'Ajuste entrada inventario');
  ELSE
    INSERT INTO asiento_lineas (asiento_id, cuenta_id, tipo, monto, descripcion) VALUES
      (v_asiento_id, v_cuenta_ajuste, 'DB', v_monto_neto, 'Ajuste salida inventario'),
      (v_asiento_id, v_cuenta_inv,    'CR', v_monto_neto, 'Ajuste salida inventario');
  END IF;

  -- Actualizar saldos
  PERFORM actualizar_saldos_asiento(v_asiento_id);

  -- Vincular movimientos al asiento
  UPDATE inv_movimientos
  SET asiento_id = v_asiento_id
  WHERE id = ANY(p_mov_ids)
    AND empresa_id = p_empresa_id;

  RETURN jsonb_build_object(
    'ok',           true,
    'asiento_id',   v_asiento_id,
    'numero',       v_numero_fmt,
    'monto',        v_monto_neto,
    'es_entrada',   v_es_entrada
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
