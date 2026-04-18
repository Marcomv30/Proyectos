-- Crear bucket público para fotos de colaboradores
-- Ejecutar en el SQL Editor del dashboard de Supabase

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fotos-colaboradores',
  'fotos-colaboradores',
  true,
  3145728,  -- 3 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Política: cualquier usuario autenticado puede subir/actualizar su propia carpeta
CREATE POLICY "Autenticados pueden subir fotos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'fotos-colaboradores');

CREATE POLICY "Autenticados pueden actualizar fotos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'fotos-colaboradores');

-- Política: lectura pública (para mostrar foto en gafete sin autenticación)
CREATE POLICY "Fotos colaboradores son públicas"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'fotos-colaboradores');
