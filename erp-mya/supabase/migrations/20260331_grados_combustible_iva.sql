-- ============================================================
-- MYA ERP — grados_combustible: tarifa IVA para FE
-- ============================================================

ALTER TABLE public.grados_combustible
  ADD COLUMN IF NOT EXISTS tarifa_iva_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_iva_codigo     VARCHAR(2)   NOT NULL DEFAULT '01';

COMMENT ON COLUMN public.grados_combustible.tarifa_iva_porcentaje IS
  'Porcentaje IVA aplicable al grado (0 = exento, 1 = 1%, 13 = 13%, etc). Usado al generar lineas FE.';

COMMENT ON COLUMN public.grados_combustible.tarifa_iva_codigo IS
  'Codigo CodigoTarifaIVA del MH (01=Tarifas diferenciales, 08=13%, 10=Exento, etc).';
