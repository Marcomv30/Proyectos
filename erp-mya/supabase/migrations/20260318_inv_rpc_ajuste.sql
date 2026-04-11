-- ============================================================
-- RPC: registrar_ajuste_inventario
-- Inserta movimiento de ajuste + asiento contable automático
-- ============================================================

CREATE OR REPLACE FUNCTION registrar_ajuste_inventario(
  p_empresa_id      INTEGER,
  p_producto_id     BIGINT,
  p_cantidad        NUMERIC,   -- positivo = aumenta, negativo = reduce
  p_costo_unitario  NUMERIC DEFAULT 0,
  p_referencia      TEXT DEFAULT NULL,
  p_notas           TEXT DEFAULT NULL,
  p_cuenta_ajuste_id BIGINT DEFAULT NULL  -- cuenta contable de contrapartida (dinámica)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mov_id          BIGINT;
  v_producto        RECORD;
  v_periodo_id      INTEGER;
  v_asiento_id      BIGINT;
  v_seq             INTEGER;
  v_numero_fmt      TEXT;
  v_fecha           DATE;
  v_monto           NUMERIC;
  v_cuenta_inv_id   BIGINT;
  v_cuenta_ajuste   BIGINT;
BEGIN
  v_fecha := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;

  -- Datos del producto
  SELECT * INTO v_producto FROM inv_productos WHERE id = p_producto_id AND empresa_id = p_empresa_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado');
  END IF;

  -- Insertar movimiento (el trigger actualiza stock_actual)
  INSERT INTO inv_movimientos (
    empresa_id, fecha, tipo, origen,
    producto_id, cantidad, costo_unitario, referencia, notas
  ) VALUES (
    p_empresa_id, v_fecha, 'ajuste', 'ajuste',
    p_producto_id, p_cantidad,
    COALESCE(NULLIF(p_costo_unitario, 0), v_producto.costo_promedio, 0),
    p_referencia, p_notas
  )
  RETURNING id INTO v_mov_id;

  -- ── Asiento contable (solo si hay cuentas configuradas) ───

  v_monto := ABS(p_cantidad) * COALESCE(NULLIF(p_costo_unitario, 0), v_producto.costo_promedio, 0);

  -- Cuenta de inventario: del producto o del parámetro empresa
  SELECT cuenta_inventario_id INTO v_cuenta_inv_id FROM inv_productos WHERE id = p_producto_id;

  IF v_cuenta_inv_id IS NULL THEN
    SELECT pc.id INTO v_cuenta_inv_id
    FROM parametros_empresa pe
    JOIN plan_cuentas_empresa pce ON pce.empresa_id = pe.empresa_id
    JOIN plan_cuentas pc ON pc.id = pce.cuenta_id AND pc.codigo = pe.valor
    WHERE pe.empresa_id = p_empresa_id AND pe.clave = 'cuenta_inventario'
    LIMIT 1;
  END IF;

  -- Cuenta de ajuste: parámetro dinámico > parámetro empresa
  IF p_cuenta_ajuste_id IS NOT NULL THEN
    v_cuenta_ajuste := p_cuenta_ajuste_id;
  ELSE
    SELECT pc.id INTO v_cuenta_ajuste
    FROM parametros_empresa pe
    JOIN plan_cuentas_empresa pce ON pce.empresa_id = pe.empresa_id
    JOIN plan_cuentas pc ON pc.id = pce.cuenta_id AND pc.codigo = pe.valor
    WHERE pe.empresa_id = p_empresa_id AND pe.clave = 'cuenta_ajuste_inventario'
    LIMIT 1;
  END IF;

  IF v_monto > 0 AND v_cuenta_inv_id IS NOT NULL AND v_cuenta_ajuste IS NOT NULL THEN
    -- Período fiscal activo
    SELECT id INTO v_periodo_id
    FROM periodos_fiscales
    WHERE empresa_id = p_empresa_id
      AND fecha_inicio <= v_fecha
      AND fecha_fin    >= v_fecha
    LIMIT 1;

    IF v_periodo_id IS NOT NULL THEN
      -- Consecutivo INV-XXX-YYYY
      SELECT COALESCE(MAX(
        NULLIF(regexp_replace(numero_formato, '^INV-(\d+)-\d{4}$', '\1'), '')::INTEGER
      ), 0) + 1
      INTO v_seq
      FROM asientos
      WHERE empresa_id = p_empresa_id
        AND numero_formato LIKE 'INV-%-' || EXTRACT(YEAR FROM v_fecha)::TEXT;

      v_numero_fmt := 'INV-' || LPAD(v_seq::TEXT, 3, '0') || '-' || EXTRACT(YEAR FROM v_fecha)::TEXT;

      INSERT INTO asientos (
        empresa_id, periodo_id, fecha, descripcion, numero_formato, categoria, estado
      ) VALUES (
        p_empresa_id, v_periodo_id, v_fecha,
        'Ajuste inventario — ' || v_producto.descripcion
          || COALESCE(' — ' || p_referencia, ''),
        v_numero_fmt, 'INV', 'CONFIRMADO'
      )
      RETURNING id INTO v_asiento_id;

      IF p_cantidad > 0 THEN
        -- Aumento: DB Inventario / CR Ajuste
        INSERT INTO asiento_lineas (asiento_id, cuenta_id, tipo, monto, descripcion) VALUES
          (v_asiento_id, v_cuenta_inv_id, 'DB', v_monto, 'Ajuste entrada inventario — ' || v_producto.descripcion),
          (v_asiento_id, v_cuenta_ajuste, 'CR', v_monto, 'Ajuste entrada inventario — ' || v_producto.descripcion);
      ELSE
        -- Reducción: DB Ajuste / CR Inventario
        INSERT INTO asiento_lineas (asiento_id, cuenta_id, tipo, monto, descripcion) VALUES
          (v_asiento_id, v_cuenta_ajuste, 'DB', v_monto, 'Ajuste salida inventario — ' || v_producto.descripcion),
          (v_asiento_id, v_cuenta_inv_id, 'CR', v_monto, 'Ajuste salida inventario — ' || v_producto.descripcion);
      END IF;

      PERFORM actualizar_saldos_asiento(v_asiento_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'movimiento_id', v_mov_id,
    'asiento_id', v_asiento_id,
    'con_asiento', v_asiento_id IS NOT NULL
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
