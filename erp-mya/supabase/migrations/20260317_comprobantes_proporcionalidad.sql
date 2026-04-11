-- Proporcionalidad del IVA por comprobante (prorrata de crédito fiscal)
-- 100 = crédito total, 0 = sin crédito, valores intermedios = prorrata
ALTER TABLE comprobantes_recibidos
  ADD COLUMN IF NOT EXISTS proporcionalidad NUMERIC(5,2) DEFAULT 100;
