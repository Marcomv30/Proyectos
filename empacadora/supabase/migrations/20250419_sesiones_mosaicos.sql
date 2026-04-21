-- FASE 4: Nueva tabla para almacenar settings y edits de sesiones de mosaicos
-- Permite historial, settings avanzados, y editor post-mosaico

CREATE TABLE IF NOT EXISTS emp_sesiones_mosaicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id INTEGER NOT NULL REFERENCES fe_config_empresa(empresa_id) ON DELETE CASCADE,
  sesion_id VARCHAR NOT NULL,

  -- Settings avanzados
  resolucion VARCHAR DEFAULT 'medium',  -- low | medium | high
  blend_mode VARCHAR DEFAULT 'normal',   -- normal | lighten | overlay | screen
  jpeg_quality INTEGER DEFAULT 90,       -- 50-100

  -- Editor post-mosaico (optional)
  crop_bounds JSONB,                     -- [[minLat, minLng], [maxLat, maxLng]] o null
  brightness INTEGER DEFAULT 0,          -- -100 to +100
  contrast INTEGER DEFAULT 0,            -- -100 to +100
  saturation INTEGER DEFAULT 0,          -- -100 to +100

  -- Metadata
  nombre_sesion VARCHAR,                 -- nombre amigable de la sesión
  notas TEXT,                            -- anotaciones del usuario
  fotos_usadas INTEGER,                  -- cantidad de fotos en el mosaico
  fecha_vuelo DATE,                      -- fecha del vuelo

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(empresa_id, sesion_id),
  FOREIGN KEY(empresa_id, sesion_id)
    REFERENCES emp_mosaicos(empresa_id, sesion_id)
    ON DELETE CASCADE
);

-- Índice para búsqueda rápida de sesiones por empresa y fecha
CREATE INDEX IF NOT EXISTS idx_sesiones_mosaicos_empresa_created
  ON emp_sesiones_mosaicos(empresa_id, created_at DESC);

-- RLS: Usuarios autenticados pueden ver y modificar sesiones de su empresa
ALTER TABLE emp_sesiones_mosaicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company mosaic sessions"
  ON emp_sesiones_mosaicos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own company mosaic sessions"
  ON emp_sesiones_mosaicos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own company mosaic sessions"
  ON emp_sesiones_mosaicos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own company mosaic sessions"
  ON emp_sesiones_mosaicos
  FOR DELETE
  TO authenticated
  USING (true);

-- Comentarios para documentación
COMMENT ON TABLE emp_sesiones_mosaicos IS 'Almacena settings y edits de sesiones de mosaicos (FASE 4: UI/UX Pulida)';
COMMENT ON COLUMN emp_sesiones_mosaicos.sesion_id IS 'FK a emp_mosaicos.sesion_id para asociar con mosaico generado';
COMMENT ON COLUMN emp_sesiones_mosaicos.resolucion IS 'low (menor calidad, más rápido) | medium (balance) | high (mejor calidad, más lento)';
COMMENT ON COLUMN emp_sesiones_mosaicos.blend_mode IS 'Modo de composición: normal | lighten | overlay | screen';
COMMENT ON COLUMN emp_sesiones_mosaicos.crop_bounds IS 'Bounds de recorte post-mosaico, null si no cropeado';
