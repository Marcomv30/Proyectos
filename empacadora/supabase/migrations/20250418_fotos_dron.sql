-- Fase 2: Guardar fotos y mosaicos desde dron
-- Tablas para persistencia de fotos DJI + mosaicos generados

CREATE TABLE IF NOT EXISTS emp_fotos_dron (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id INTEGER NOT NULL REFERENCES fe_config_empresa(empresa_id) ON DELETE CASCADE,
  sesion_id VARCHAR NOT NULL,  -- timestamp (ej: 20250418_143022)
  indice INTEGER NOT NULL,     -- 0-599, secuencia dentro sesión
  nombre VARCHAR NOT NULL,     -- nombre original DJI (ej: DJI_20260226113443_0001_D.JPG)
  url_storage VARCHAR NOT NULL, -- URL pública de la foto en Storage
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  alt DECIMAL(8,2),
  yaw DECIMAL(6,2),
  xmp_raw JSONB,  -- metadatos XMP completos (para debugging)
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(empresa_id, sesion_id, indice)
);

CREATE TABLE IF NOT EXISTS emp_mosaicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id INTEGER NOT NULL REFERENCES fe_config_empresa(empresa_id) ON DELETE CASCADE,
  sesion_id VARCHAR NOT NULL UNIQUE,  -- timestampde la sesión
  nombre VARCHAR,
  url_jpeg_storage VARCHAR NOT NULL,  -- URL del mosaico JPEG
  url_geotiff_storage VARCHAR,        -- futuro: URL del GeoTIFF
  bounds JSONB,  -- [[minLat, minLng], [maxLat, maxLng]]
  fotos_count INTEGER,  -- cantidad de fotos usadas
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_fotos_dron_sesion
  ON emp_fotos_dron(empresa_id, sesion_id);

CREATE INDEX IF NOT EXISTS idx_fotos_dron_coords
  ON emp_fotos_dron(empresa_id) WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mosaicos_empresa
  ON emp_mosaicos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_mosaicos_sesion
  ON emp_mosaicos(empresa_id, sesion_id);

-- Comentarios para documentación
COMMENT ON TABLE emp_fotos_dron IS 'Fotos individuales capturadas por dron, con metadata GPS y XMP';
COMMENT ON TABLE emp_mosaicos IS 'Mosaicos generados desde sesiones de fotos dron';
COMMENT ON COLUMN emp_fotos_dron.sesion_id IS 'ID de sesión (timestamp format: YYYYMMDDhhmmss)';
COMMENT ON COLUMN emp_fotos_dron.xmp_raw IS 'Metadatos XMP completos en JSONB para auditoria/debugging';
COMMENT ON COLUMN emp_mosaicos.bounds IS 'Bounding box geográfico: [[minLat, minLng], [maxLat, maxLng]]';
