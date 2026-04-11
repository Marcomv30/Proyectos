-- Agregar campo exento a inv_productos para el módulo POS
-- Permite marcar productos exentos de IVA directamente en el catálogo.
ALTER TABLE inv_productos
  ADD COLUMN IF NOT EXISTS exento BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN inv_productos.exento IS
  'Verdadero si el producto está exento de IVA (ej. canasta básica). El POS usa este valor para calcular la tarifa correcta.';
