-- Agregar campos de cuadre al procesamiento de XML de comprobantes
ALTER TABLE comprobantes_recibidos
  ADD COLUMN IF NOT EXISTS total_otros_cargos NUMERIC(18,5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_devuelto        NUMERIC(18,5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuadra              BOOLEAN,
  ADD COLUMN IF NOT EXISTS diferencia_cuadre   NUMERIC(18,5) DEFAULT 0;
