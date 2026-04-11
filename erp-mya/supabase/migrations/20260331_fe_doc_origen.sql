-- ============================================================
-- MYA ERP — fe_documentos: trazabilidad re-emisión subsanada
-- ============================================================
-- Cuando un documento es rechazado por MH y se crea uno nuevo
-- corregido, doc_origen_id apunta al documento rechazado original.
-- Esto permite trazabilidad interna sin afectar la numeración fiscal.

ALTER TABLE public.fe_documentos
  ADD COLUMN IF NOT EXISTS doc_origen_id INTEGER REFERENCES public.fe_documentos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fe_documentos.doc_origen_id IS
  'ID del documento rechazado que originó esta re-emisión subsanada. NULL si es documento original.';
