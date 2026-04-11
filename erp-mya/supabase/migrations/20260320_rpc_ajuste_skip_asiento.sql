-- Corrige registrar_ajuste_inventario:
-- Agrega UPDATE inv_movimientos SET asiento_id al final del RPC
-- para que la trazabilidad movimiento → asiento quede en la BD.

CREATE OR REPLACE FUNCTION registrar_ajuste_inventario(
  p_empresa_id      INTEGER,
  p_producto_id     BIGINT,
  p_cantidad        NUMERIC,
  p_costo_unitario  NUMERIC DEFAULT 0,
  p_referencia      TEXT DEFAULT NULL,
  p_notas           TEXT DEFAULT NULL,
  p_cuenta_ajuste_id BIGINT DEFAULT NULL,
  p_categoria_id     BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov_id          BIGINT;
  v_producto        RECORD;
  v_asiento_id      BIGINT;
  v_seq             INTEGER;
  v_numero_fmt      TEXT;
  v_fecha           DATE;
  v_monto           NUMERIC;
  v_cuenta_inv_id   BIGINT;
  v_cuenta_ajuste   BIGINT;
  v_base_inv_id     BIGINT;
  v_base_ajuste_id  BIGINT;
  v_asiento_error   TEXT;
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
    SELECT cuenta_inventario_id INTO v_cuenta_inv_id FROM empresa_config_inventario WHERE empresa_id = p_empresa_id;
  END IF;

  -- Cuenta de ajuste: parámetro dinámico > empresa_config_inventario
  IF p_cuenta_ajuste_id IS NOT NULL THEN
    v_cuenta_ajuste := p_cuenta_ajuste_id;
  ELSE
    SELECT cuenta_ajuste_inv_id INTO v_cuenta_ajuste FROM empresa_config_inventario WHERE empresa_id = p_empresa_id;
  END IF;

  IF v_monto > 0 AND v_cuenta_inv_id IS NOT NULL AND v_cuenta_ajuste IS NOT NULL THEN
    BEGIN
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
        empresa_id, fecha, descripcion, numero_formato, categoria_id, estado
      ) VALUES (
        p_empresa_id, v_fecha,
        'Ajuste inventario — ' || v_producto.descripcion
          || COALESCE(' — ' || p_referencia, ''),
        v_numero_fmt, p_categoria_id, 'CONFIRMADO'
      )
      RETURNING id INTO v_asiento_id;

      -- Obtener cuenta_base_id para asiento_lineas (FK a plan_cuentas_base)
      SELECT cuenta_base_id INTO v_base_inv_id    FROM plan_cuentas_empresa WHERE id = v_cuenta_inv_id;
      SELECT cuenta_base_id INTO v_base_ajuste_id FROM plan_cuentas_empresa WHERE id = v_cuenta_ajuste;

      IF v_base_inv_id IS NULL OR v_base_ajuste_id IS NULL THEN
        RAISE EXCEPTION 'cuenta_base_id no encontrado para inv=% ajuste=%', v_cuenta_inv_id, v_cuenta_ajuste;
      END IF;

      IF p_cantidad > 0 THEN
        -- Entrada: DB Inventario / CR Ajuste
        INSERT INTO asiento_lineas (asiento_id, cuenta_id, debito_crc, credito_crc, debito_usd, credito_usd, descripcion, linea) VALUES
          (v_asiento_id, v_base_inv_id,    v_monto, 0,       0, 0, 'Ajuste entrada inventario — ' || v_producto.descripcion, 1),
          (v_asiento_id, v_base_ajuste_id, 0,       v_monto, 0, 0, 'Ajuste entrada inventario — ' || v_producto.descripcion, 2);
      ELSE
        -- Salida: DB Ajuste / CR Inventario
        INSERT INTO asiento_lineas (asiento_id, cuenta_id, debito_crc, credito_crc, debito_usd, credito_usd, descripcion, linea) VALUES
          (v_asiento_id, v_base_ajuste_id, v_monto, 0,       0, 0, 'Ajuste salida inventario — ' || v_producto.descripcion, 1),
          (v_asiento_id, v_base_inv_id,    0,       v_monto, 0, 0, 'Ajuste salida inventario — ' || v_producto.descripcion, 2);
      END IF;

      PERFORM actualizar_saldos_asiento(v_asiento_id::INTEGER);

      -- ← Vincular movimiento al asiento (trazabilidad)
      UPDATE inv_movimientos SET asiento_id = v_asiento_id WHERE id = v_mov_id;
    EXCEPTION WHEN OTHERS THEN
      v_asiento_error := SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'movimiento_id', v_mov_id,
    'asiento_id',    v_asiento_id,
    'con_asiento',   v_asiento_id IS NOT NULL,
    'asiento_error', v_asiento_error
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
