-- ============================================================
-- Configuración visual para impresiones empacadora
-- Agrega campos a fe_config_empresa (compartida ERP+empacadora)
-- ============================================================
ALTER TABLE public.fe_config_empresa
  ADD COLUMN IF NOT EXISTS logo_url     TEXT,          -- URL o base64 del logo
  ADD COLUMN IF NOT EXISTS nombre_planta TEXT;         -- Ej: "PLANTA EMPACADORA Thialez"
