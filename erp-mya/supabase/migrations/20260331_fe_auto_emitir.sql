-- Columna auto_emitir en fe_documentos
-- Cuando true, el cron de FE emite el documento automáticamente
-- sin intervención del usuario (uso principal: TE de combustible POS)

ALTER TABLE fe_documentos
  ADD COLUMN IF NOT EXISTS auto_emitir boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN fe_documentos.auto_emitir IS
  'Si true, el cron feConsultaCron emite el doc automáticamente al MH cuando está en estado confirmado sin clave_mh';
