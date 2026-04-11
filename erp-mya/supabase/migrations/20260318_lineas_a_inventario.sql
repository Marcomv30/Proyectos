-- ============================================================
-- MYA ERP — Override destino contable por línea de comprobante
-- NULL  = automático (usa tipo_linea del XML: M→inventario, S→gasto)
-- true  = forzar a cuenta de Inventario
-- false = forzar a cuenta de Gasto
-- ============================================================

ALTER TABLE comprobantes_lineas
  ADD COLUMN IF NOT EXISTS a_inventario boolean DEFAULT NULL;

COMMENT ON COLUMN comprobantes_lineas.a_inventario IS
  'NULL=auto por tipo_linea, true=forzar inventario, false=forzar gasto';
