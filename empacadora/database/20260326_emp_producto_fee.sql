-- ============================================================
-- Producto de exportación en programas
-- Reemplaza los campos cabys/partida/notas_fee manuales por
-- una referencia al catálogo general de productos del ERP.
-- ============================================================

ALTER TABLE public.emp_programas
  ADD COLUMN IF NOT EXISTS producto_fee_id BIGINT REFERENCES public.inv_productos(id) ON DELETE SET NULL;

-- Los campos cabys / partida_arancelaria / notas_fee se mantienen
-- como NULL en los registros existentes. La lógica de generación
-- de FEE ahora los lee desde inv_productos vía producto_fee_id.
