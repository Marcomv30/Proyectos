-- Agrega columna color a grados_combustible para resaltar el producto en la UI

ALTER TABLE public.grados_combustible
  ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT NULL;

COMMENT ON COLUMN public.grados_combustible.color IS
  'Color hex del grado para UI (ej. #22c55e para Regular, #3b82f6 para Super, #f59e0b para Diesel)';
