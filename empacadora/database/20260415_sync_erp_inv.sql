-- =============================================================================
-- Sincronización ERP → Empacadora BG
-- Trigger: inv_movimientos (ERP) → emp_mov_materiales + emp_inv_materiales
-- 2026-04-15
-- =============================================================================

-- ── 1. Asegurar que emp_materiales.inv_producto_id sea BIGINT ────────────────
--    (inv_productos.id es BIGSERIAL = BIGINT)
ALTER TABLE emp_materiales
  ALTER COLUMN inv_producto_id TYPE BIGINT
  USING inv_producto_id::BIGINT;

COMMENT ON COLUMN emp_materiales.inv_producto_id IS
  'FK lógica a inv_productos.id del ERP. Permite sincronizar entradas de FE automáticamente.';

-- ── 2. Función trigger: inv_movimientos → emp BG ─────────────────────────────
CREATE OR REPLACE FUNCTION fn_sync_inv_to_emp_bg()
RETURNS TRIGGER AS $$
DECLARE
  v_emp_mat   RECORD;
  v_bodega_bg UUID;
  v_conv      RECORD;
  v_unidades  NUMERIC;
  v_cajas     NUMERIC;
BEGIN
  -- Solo procesar entradas originadas en FE / XML
  IF NEW.tipo != 'entrada' OR NEW.origen NOT IN ('fe', 'xml') THEN
    RETURN NEW;
  END IF;

  -- ¿Hay un material de empacadora vinculado a este producto ERP?
  SELECT * INTO v_emp_mat
  FROM emp_materiales
  WHERE inv_producto_id = NEW.producto_id
    AND empresa_id      = NEW.empresa_id
    AND activo          = true
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Obtener bodega BG de la empresa
  SELECT id INTO v_bodega_bg
  FROM emp_bodegas
  WHERE empresa_id = NEW.empresa_id
    AND tipo       = 'BG'
    AND activo     = true
  ORDER BY es_principal DESC
  LIMIT 1;

  IF v_bodega_bg IS NULL THEN RETURN NEW; END IF;

  -- ¿Tiene conversión de unidades (caja → unidades sueltas)?
  SELECT * INTO v_conv
  FROM emp_inv_conversion
  WHERE empresa_id  = NEW.empresa_id
    AND material_id = v_emp_mat.id
    AND activo      = true;

  IF FOUND AND v_conv.unidades_por_paquete > 0 THEN
    -- inv_movimientos registra en unidad de compra (cajas/rollos)
    v_cajas    := NEW.cantidad;
    v_unidades := NEW.cantidad * v_conv.unidades_por_paquete;
  ELSE
    v_cajas    := NULL;
    v_unidades := NEW.cantidad;
  END IF;

  -- ── Crear movimiento de entrada en empacadora (BG) ────────────────────────
  INSERT INTO emp_mov_materiales
    (empresa_id, material_id, bodega_id,
     tipo, cantidad, cantidad_paquetes,
     referencia, notas,
     fecha, origen_tipo,
     erp_sincronizado, erp_mov_id)
  VALUES
    (NEW.empresa_id, v_emp_mat.id, v_bodega_bg,
     'entrada', v_unidades, v_cajas,
     NEW.referencia,
     'Sync ERP — ' || COALESCE(NEW.referencia, 'ID ' || NEW.id::text),
     NEW.fecha, 'xml_fe',
     true, NEW.id);

  -- ── Actualizar saldo en emp_inv_materiales ────────────────────────────────
  INSERT INTO emp_inv_materiales
    (empresa_id, material_id, bodega_id, stock_actual, stock_paquetes, ultima_actualizacion)
  VALUES
    (NEW.empresa_id, v_emp_mat.id, v_bodega_bg,
     v_unidades,
     COALESCE(v_cajas, 0),
     NOW())
  ON CONFLICT (empresa_id, material_id, bodega_id) DO UPDATE
    SET stock_actual        = emp_inv_materiales.stock_actual + v_unidades,
        stock_paquetes      = emp_inv_materiales.stock_paquetes + COALESCE(v_cajas, 0),
        ultima_actualizacion = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Crear trigger en inv_movimientos ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_inv_to_emp ON inv_movimientos;

CREATE TRIGGER trg_sync_inv_to_emp
  AFTER INSERT ON inv_movimientos
  FOR EACH ROW EXECUTE FUNCTION fn_sync_inv_to_emp_bg();

-- ── 4. Función de backfill: sincronizar entradas históricas no procesadas ────
-- Uso: SELECT emp_backfill_inv_sync(empresa_id);
CREATE OR REPLACE FUNCTION emp_backfill_inv_sync(p_empresa_id INTEGER)
RETURNS TABLE (sincronizados INTEGER, omitidos INTEGER) AS $$
DECLARE
  v_sync  INTEGER := 0;
  v_skip  INTEGER := 0;
  r       RECORD;
BEGIN
  FOR r IN
    SELECT im.*
    FROM inv_movimientos im
    WHERE im.empresa_id = p_empresa_id
      AND im.tipo       = 'entrada'
      AND im.origen     IN ('fe', 'xml')
      -- Solo los que aún no tienen movimiento en empacadora
      AND NOT EXISTS (
        SELECT 1 FROM emp_mov_materiales em
        WHERE em.erp_mov_id = im.id
          AND em.empresa_id = p_empresa_id
      )
    ORDER BY im.fecha, im.id
  LOOP
    -- Intentar sincronizar simulando el trigger
    DECLARE
      v_emp_mat   RECORD;
      v_bodega_bg UUID;
      v_conv      RECORD;
      v_unidades  NUMERIC;
      v_cajas     NUMERIC;
    BEGIN
      SELECT * INTO v_emp_mat
      FROM emp_materiales
      WHERE inv_producto_id = r.producto_id
        AND empresa_id      = p_empresa_id
        AND activo          = true
      LIMIT 1;

      IF NOT FOUND THEN
        v_skip := v_skip + 1;
        CONTINUE;
      END IF;

      SELECT id INTO v_bodega_bg
      FROM emp_bodegas
      WHERE empresa_id = p_empresa_id AND tipo = 'BG' AND activo = true
      ORDER BY es_principal DESC LIMIT 1;

      IF v_bodega_bg IS NULL THEN
        v_skip := v_skip + 1;
        CONTINUE;
      END IF;

      SELECT * INTO v_conv
      FROM emp_inv_conversion
      WHERE empresa_id = p_empresa_id AND material_id = v_emp_mat.id AND activo = true;

      IF FOUND AND v_conv.unidades_por_paquete > 0 THEN
        v_cajas    := r.cantidad;
        v_unidades := r.cantidad * v_conv.unidades_por_paquete;
      ELSE
        v_cajas    := NULL;
        v_unidades := r.cantidad;
      END IF;

      INSERT INTO emp_mov_materiales
        (empresa_id, material_id, bodega_id,
         tipo, cantidad, cantidad_paquetes,
         referencia, notas, fecha, origen_tipo,
         erp_sincronizado, erp_mov_id)
      VALUES
        (p_empresa_id, v_emp_mat.id, v_bodega_bg,
         'entrada', v_unidades, v_cajas,
         r.referencia,
         'Backfill ERP — ' || COALESCE(r.referencia, 'ID ' || r.id::text),
         r.fecha, 'xml_fe', true, r.id);

      INSERT INTO emp_inv_materiales
        (empresa_id, material_id, bodega_id, stock_actual, stock_paquetes, ultima_actualizacion)
      VALUES
        (p_empresa_id, v_emp_mat.id, v_bodega_bg,
         v_unidades, COALESCE(v_cajas, 0), NOW())
      ON CONFLICT (empresa_id, material_id, bodega_id) DO UPDATE
        SET stock_actual         = emp_inv_materiales.stock_actual + v_unidades,
            stock_paquetes       = emp_inv_materiales.stock_paquetes + COALESCE(v_cajas, 0),
            ultima_actualizacion = NOW();

      v_sync := v_sync + 1;

    EXCEPTION WHEN OTHERS THEN
      v_skip := v_skip + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_sync, v_skip;
END;
$$ LANGUAGE plpgsql;

-- ── 5. Índice de apoyo para la búsqueda por inv_producto_id ─────────────────
CREATE INDEX IF NOT EXISTS idx_emp_materiales_inv_producto
  ON emp_materiales (empresa_id, inv_producto_id)
  WHERE inv_producto_id IS NOT NULL;

-- ── 6. Índice en emp_mov_materiales para lookup de duplicados ────────────────
CREATE INDEX IF NOT EXISTS idx_emp_mov_erp_mov_id
  ON emp_mov_materiales (empresa_id, erp_mov_id)
  WHERE erp_mov_id IS NOT NULL;
