-- Columnas FE adicionales en pos_ventas
ALTER TABLE pos_ventas
  ADD COLUMN IF NOT EXISTS fe_doc_id     BIGINT,
  ADD COLUMN IF NOT EXISTS fe_consecutivo TEXT,
  ADD COLUMN IF NOT EXISTS fe_estado     TEXT;

-- Columna de referencia inversa en fe_documentos para trazabilidad POS
ALTER TABLE fe_documentos
  ADD COLUMN IF NOT EXISTS pos_venta_id BIGINT REFERENCES pos_ventas(id) ON DELETE SET NULL;

COMMENT ON COLUMN pos_ventas.fe_doc_id      IS 'ID del fe_documento generado al emitir el comprobante electrónico';
COMMENT ON COLUMN pos_ventas.fe_consecutivo IS 'Número consecutivo MH (20 dígitos) asignado por Hacienda';
COMMENT ON COLUMN pos_ventas.fe_estado      IS 'Estado MH: enviado, aceptado, rechazado';
COMMENT ON COLUMN fe_documentos.pos_venta_id IS 'Venta POS que originó este documento electrónico';
