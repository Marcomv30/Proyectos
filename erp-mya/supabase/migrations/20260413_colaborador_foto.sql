-- ============================================================
-- Agrega foto_url a pl_colaboradores para gafete con QR
-- ============================================================

ALTER TABLE pl_colaboradores
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- Storage bucket para fotos (ejecutar en el dashboard de Supabase si no existe):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('fotos-colaboradores', 'fotos-colaboradores', true)
-- ON CONFLICT (id) DO NOTHING;
