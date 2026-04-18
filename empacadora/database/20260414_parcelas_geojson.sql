-- Migración: columna geojson en emp_parcelas
-- 2026-04-14
-- Almacena la geometría del lote como GeoJSON (Polygon/MultiPolygon/Feature)

ALTER TABLE emp_parcelas
  ADD COLUMN IF NOT EXISTS geojson JSONB DEFAULT NULL;

COMMENT ON COLUMN emp_parcelas.geojson IS
  'Geometría del lote en formato GeoJSON (Feature, Polygon o MultiPolygon). '
  'Generada desde archivos .MRK del dron o dibujada manualmente en el mapa.';
