-- ============================================================
-- MYA ERP — Valorización de Inventario
-- 1. Agrega costo_promedio_resultante a inv_movimientos
-- 2. Actualiza trigger para almacenar el costo tras cada mov
-- 3. Vista v_inv_valorizacion (snapshot actual)
-- ============================================================

-- 1. Columna costo_promedio_resultante
ALTER TABLE inv_movimientos
  ADD COLUMN IF NOT EXISTS costo_promedio_resultante NUMERIC(15,4);

-- 2. Trigger actualizado: guarda el costo resultante en el movimiento
CREATE OR REPLACE FUNCTION fn_inv_actualizar_stock()
RETURNS TRIGGER AS $$
DECLARE
  delta          NUMERIC;
  v_stock_ant    NUMERIC;
  v_costo_ant    NUMERIC;
  v_nuevo_stock  NUMERIC;
  v_nuevo_costo  NUMERIC;
BEGIN
  IF NEW.tipo = 'entrada' THEN
    delta := NEW.cantidad;
  ELSIF NEW.tipo = 'salida' THEN
    delta := -ABS(NEW.cantidad);
  ELSE
    delta := NEW.cantidad;
  END IF;

  SELECT stock_actual, COALESCE(costo_promedio, 0)
    INTO v_stock_ant, v_costo_ant
    FROM inv_productos
   WHERE id = NEW.producto_id;

  v_nuevo_stock := v_stock_ant + delta;

  IF delta > 0 AND NEW.costo_unitario > 0 AND v_nuevo_stock > 0 THEN
    v_nuevo_costo := ROUND(
      (v_stock_ant * v_costo_ant + delta * NEW.costo_unitario) / v_nuevo_stock, 4
    );
  ELSE
    v_nuevo_costo := v_costo_ant;
  END IF;

  UPDATE inv_productos
     SET stock_actual   = v_nuevo_stock,
         costo_promedio = v_nuevo_costo,
         updated_at     = NOW()
   WHERE id = NEW.producto_id;

  -- Guardar el costo resultante en el movimiento para consultas históricas
  NEW.costo_promedio_resultante := v_nuevo_costo;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrear trigger como BEFORE para poder modificar NEW
DROP TRIGGER IF EXISTS trg_inv_actualizar_stock ON inv_movimientos;
CREATE TRIGGER trg_inv_actualizar_stock
  BEFORE INSERT ON inv_movimientos
  FOR EACH ROW EXECUTE FUNCTION fn_inv_actualizar_stock();

-- 3. Vista snapshot actual
CREATE OR REPLACE VIEW v_inv_valorizacion AS
SELECT
  p.id                                          AS producto_id,
  p.empresa_id,
  p.codigo,
  p.descripcion,
  p.unidad_medida,
  p.tarifa_iva,
  COALESCE(c.nombre, 'Sin categoría')           AS categoria,
  p.stock_actual,
  p.costo_promedio,
  ROUND(p.stock_actual * p.costo_promedio, 2)   AS valor_inventario,
  p.stock_minimo,
  p.precio_venta
FROM inv_productos p
LEFT JOIN inv_categorias c ON c.id = p.categoria_id
WHERE p.activo = true
  AND p.tipo = 'producto';
