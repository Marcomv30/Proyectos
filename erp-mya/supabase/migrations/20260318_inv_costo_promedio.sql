-- ============================================================
-- MYA ERP — Inventarios: Costo Promedio Ponderado
-- Actualiza fn_inv_actualizar_stock para calcular el costo
-- promedio ponderado (método aceptado por MH-CR) en cada
-- movimiento de entrada.
--
-- Regla:
--   Entrada (delta > 0) y costo_unitario > 0:
--     nuevo_costo = (stock_ant × costo_ant + delta × costo_nuevo)
--                  / nuevo_stock
--   Salida / ajuste negativo: costo_promedio no cambia.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_inv_actualizar_stock()
RETURNS TRIGGER AS $$
DECLARE
  delta          NUMERIC;
  v_stock_ant    NUMERIC;
  v_costo_ant    NUMERIC;
  v_nuevo_stock  NUMERIC;
  v_nuevo_costo  NUMERIC;
BEGIN
  -- Determinar delta según tipo de movimiento
  IF NEW.tipo = 'entrada' THEN
    delta := NEW.cantidad;
  ELSIF NEW.tipo = 'salida' THEN
    delta := -ABS(NEW.cantidad);   -- salida siempre reduce
  ELSE
    delta := NEW.cantidad;         -- ajuste: el usuario pasa el delta directo
  END IF;

  -- Leer valores actuales antes de modificar
  SELECT stock_actual, COALESCE(costo_promedio, 0)
    INTO v_stock_ant, v_costo_ant
    FROM inv_productos
   WHERE id = NEW.producto_id;

  v_nuevo_stock := v_stock_ant + delta;

  -- Calcular nuevo costo promedio ponderado solo en entradas con costo
  IF delta > 0 AND NEW.costo_unitario > 0 AND v_nuevo_stock > 0 THEN
    v_nuevo_costo := ROUND(
      (v_stock_ant * v_costo_ant + delta * NEW.costo_unitario) / v_nuevo_stock,
      4
    );
  ELSE
    -- Salida, ajuste negativo, o entrada sin costo → mantener costo anterior
    v_nuevo_costo := v_costo_ant;
  END IF;

  UPDATE inv_productos
     SET stock_actual   = v_nuevo_stock,
         costo_promedio = v_nuevo_costo,
         updated_at     = NOW()
   WHERE id = NEW.producto_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe; solo se reemplaza la función.
-- Si no existe, se crea.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_inv_actualizar_stock'
  ) THEN
    CREATE TRIGGER trg_inv_actualizar_stock
    AFTER INSERT ON inv_movimientos
    FOR EACH ROW EXECUTE FUNCTION fn_inv_actualizar_stock();
  END IF;
END;
$$;
