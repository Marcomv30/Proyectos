-- ============================================================
-- MYA ERP — Inventarios: campos FE v4.4
-- Agrega codigo_tarifa_iva y actualiza unidad_medida
-- ============================================================

-- 1. Agregar codigo_tarifa_iva (nota 8.1 de FE v4.4)
ALTER TABLE inv_productos
  ADD COLUMN IF NOT EXISTS codigo_tarifa_iva CHAR(2);

-- 2. Backfill desde tarifa_iva existente
UPDATE inv_productos SET codigo_tarifa_iva =
  CASE
    WHEN tarifa_iva = 13   THEN '13'   -- tarifa general 13%
    WHEN tarifa_iva = 8    THEN '08'   -- tarifa reducida 8%
    WHEN tarifa_iva = 4    THEN '06'   -- tarifa 4%
    WHEN tarifa_iva = 2    THEN '05'   -- tarifa 2%
    WHEN tarifa_iva = 1    THEN '04'   -- tarifa 1%
    ELSE                       '01'   -- exento / 0%
  END
WHERE codigo_tarifa_iva IS NULL;

-- 3. Default para nuevos registros
ALTER TABLE inv_productos
  ALTER COLUMN codigo_tarifa_iva SET DEFAULT '13';
