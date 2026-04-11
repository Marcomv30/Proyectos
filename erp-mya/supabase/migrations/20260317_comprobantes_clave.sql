-- Clave única de Hacienda (50 dígitos) para deduplicación de comprobantes
ALTER TABLE comprobantes_recibidos
  ADD COLUMN IF NOT EXISTS clave VARCHAR(60);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comprobantes_clave
  ON comprobantes_recibidos (empresa_id, clave)
  WHERE clave IS NOT NULL;
