-- ============================================================
-- MYA ERP — Nota de Crédito Electrónica: campos de referencia
-- Fe v4.4 MH CR — InformacionReferencia es OBLIGATORIO para NC/ND
-- ============================================================
-- Agrega columnas ref_* que alimentan el bloque <InformacionReferencia>
-- del XML según esquema MH v4.4.
--
-- Codigos de motivo MH (ref_codigo):
--   01 = Anula documento
--   02 = Corrige texto de documento
--   03 = Corrige monto
--   04 = Referencia a otro documento
--   05 = Sustituye comprobante provisional por contingencia

ALTER TABLE public.fe_documentos
  ADD COLUMN IF NOT EXISTS ref_tipo_doc      VARCHAR(2),   -- tipo del doc referenciado (01,02,03,04,09)
  ADD COLUMN IF NOT EXISTS ref_numero        VARCHAR(60),  -- clave MH (50 dígitos) del doc referenciado
  ADD COLUMN IF NOT EXISTS ref_fecha_emision DATE,         -- fecha_emision del doc referenciado
  ADD COLUMN IF NOT EXISTS ref_codigo        VARCHAR(2),   -- código motivo MH (01-05)
  ADD COLUMN IF NOT EXISTS ref_razon         TEXT,         -- descripción del motivo
  ADD COLUMN IF NOT EXISTS ref_doc_id        BIGINT;       -- ID interno del doc referenciado (sin FK para evitar auto-referencia)

COMMENT ON COLUMN public.fe_documentos.ref_tipo_doc      IS 'TipoDocIR: tipo del documento de referencia para NC/ND (01=FE, 02=ND, 03=NC, 04=TE, 09=FEE)';
COMMENT ON COLUMN public.fe_documentos.ref_numero        IS 'Clave MH (50 dígitos) del documento de referencia — va en <Numero> de InformacionReferencia del XML';
COMMENT ON COLUMN public.fe_documentos.ref_fecha_emision IS 'Fecha de emisión del documento de referencia';
COMMENT ON COLUMN public.fe_documentos.ref_codigo        IS 'Código de motivo NC/ND según MH: 01=Anula, 02=Corrige texto, 03=Corrige monto, 04=Referencia, 05=Sustituye contingencia';
COMMENT ON COLUMN public.fe_documentos.ref_razon         IS 'Razón o descripción del motivo de la NC/ND';
COMMENT ON COLUMN public.fe_documentos.ref_doc_id        IS 'ID interno del documento referenciado si existe en fe_documentos de este sistema';
