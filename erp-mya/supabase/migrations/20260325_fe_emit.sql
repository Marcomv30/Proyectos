-- ============================================================
-- MYA ERP — Facturación Electrónica: emisión completa
-- Agrega FEE (09), estado_mh, xml_firmado, consecutivos atómicos
-- ============================================================

-- ── 1. Ampliar tipo_documento para incluir FEE (09) ──────────────────────────
ALTER TABLE public.fe_documentos
  DROP CONSTRAINT IF EXISTS fe_documentos_tipo_documento_check;

ALTER TABLE public.fe_documentos
  ADD CONSTRAINT fe_documentos_tipo_documento_check
    CHECK (tipo_documento IN ('01', '02', '03', '04', '09'));

-- ── 2. Columnas de estado MH y XML ───────────────────────────────────────────
ALTER TABLE public.fe_documentos
  ADD COLUMN IF NOT EXISTS estado_mh        TEXT
    CHECK (estado_mh IN ('pendiente', 'enviado', 'aceptado', 'rechazado', 'error')),
  ADD COLUMN IF NOT EXISTS respuesta_mh_json JSONB,
  ADD COLUMN IF NOT EXISTS xml_firmado       TEXT,
  ADD COLUMN IF NOT EXISTS clave_mh          VARCHAR(60);

-- ── 3. Tabla de consecutivos atómicos por tipo/sucursal/punto_venta ──────────
CREATE TABLE IF NOT EXISTS public.fe_consecutivos (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    INTEGER     NOT NULL,
  tipo          VARCHAR(2)  NOT NULL,   -- 01,02,03,04,09
  sucursal      VARCHAR(3)  NOT NULL DEFAULT '001',
  punto_venta   VARCHAR(5)  NOT NULL DEFAULT '00001',
  ultimo        INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (empresa_id, tipo, sucursal, punto_venta)
);

ALTER TABLE public.fe_consecutivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fe_consecutivos_all ON public.fe_consecutivos;
CREATE POLICY fe_consecutivos_all ON public.fe_consecutivos
  FOR ALL USING (public.has_empresa_access(empresa_id))
  WITH CHECK (public.has_empresa_access(empresa_id));

-- ── 4. Función atómica para obtener el siguiente consecutivo ─────────────────
CREATE OR REPLACE FUNCTION public.fe_siguiente_consecutivo(
  p_empresa_id  INTEGER,
  p_tipo        VARCHAR(2),
  p_sucursal    VARCHAR(3),
  p_punto_venta VARCHAR(5)
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_siguiente INTEGER;
BEGIN
  INSERT INTO public.fe_consecutivos (empresa_id, tipo, sucursal, punto_venta, ultimo)
  VALUES (p_empresa_id, p_tipo, p_sucursal, p_punto_venta, 1)
  ON CONFLICT (empresa_id, tipo, sucursal, punto_venta)
  DO UPDATE SET ultimo = fe_consecutivos.ultimo + 1
  RETURNING ultimo INTO v_siguiente;

  RETURN v_siguiente;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fe_siguiente_consecutivo TO authenticated, service_role;

-- ── 5. Columna exoneracion_autorizacion / porcentaje en fe_documento_lineas ──
-- (puede ya existir si otro migration las agregó)
ALTER TABLE public.fe_documento_lineas
  ADD COLUMN IF NOT EXISTS exoneracion_autorizacion TEXT,
  ADD COLUMN IF NOT EXISTS exoneracion_porcentaje    NUMERIC(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exoneracion_monto         NUMERIC(18,5) NOT NULL DEFAULT 0;

-- ── 6. Columnas de empresa para XML: nombre, identificacion, actividad ───────
--  (fe_config_empresa ya tiene actividad_codigo, sucursal, punto_venta)
--  Necesitamos también nombre_emisor e identificacion para el XML
ALTER TABLE public.fe_config_empresa
  ADD COLUMN IF NOT EXISTS nombre_emisor         TEXT,
  ADD COLUMN IF NOT EXISTS tipo_identificacion   VARCHAR(4),
  ADD COLUMN IF NOT EXISTS numero_identificacion VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nombre_comercial      TEXT,
  ADD COLUMN IF NOT EXISTS provincia             VARCHAR(1),
  ADD COLUMN IF NOT EXISTS canton                VARCHAR(2),
  ADD COLUMN IF NOT EXISTS distrito              VARCHAR(2),
  ADD COLUMN IF NOT EXISTS barrio                VARCHAR(2),
  ADD COLUMN IF NOT EXISTS otras_senas           TEXT,
  ADD COLUMN IF NOT EXISTS telefono_emisor       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tipo_cambio_usd       NUMERIC(12,5) NOT NULL DEFAULT 530;
