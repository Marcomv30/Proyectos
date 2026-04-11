-- ============================================================
-- Migración: Agregar campos de crédito a pos_ventas
-- Fecha: 2026-04-10
-- ============================================================

-- Agregar columnas para soporte de venta a crédito
ALTER TABLE pos_ventas
ADD COLUMN IF NOT EXISTS tercero_id INTEGER REFERENCES terceros(id),
ADD COLUMN IF NOT EXISTS dias_credito INTEGER DEFAULT 0;

-- Crear índice para búsquedas por tercero
CREATE INDEX IF NOT EXISTS idx_pos_ventas_tercero_id ON pos_ventas(tercero_id);
CREATE INDEX IF NOT EXISTS idx_pos_ventas_tipo_pago ON pos_ventas(tipo_pago);

COMMENT ON COLUMN pos_ventas.tercero_id IS 'ID del cliente para ventas a crédito';
COMMENT ON COLUMN pos_ventas.dias_credito IS 'Plazo de crédito en días (se usa para calcular fecha_vencimiento en cxc_documentos)';
