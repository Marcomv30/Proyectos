-- ============================================================
-- Agrega sale_id_fusion a fe_documentos para referenciar
-- la venta en Fusion PG sin necesitar tabla ventas_combustible.
-- Supabase solo recibe FE — la data transaccional vive en Fusion.
-- ============================================================

ALTER TABLE fe_documentos
  ADD COLUMN IF NOT EXISTS sale_id_fusion INTEGER;

CREATE INDEX IF NOT EXISTS fe_documentos_sale_id_fusion_idx
  ON fe_documentos (empresa_id, sale_id_fusion)
  WHERE sale_id_fusion IS NOT NULL;

COMMENT ON COLUMN fe_documentos.sale_id_fusion IS
  'sale_id de Fusion PG (ssf_pump_sales). Permite saber si una venta ya fue facturada sin copiar data transaccional a Supabase.';
