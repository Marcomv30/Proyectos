-- Agrega campo contacto a fe_config_empresa
ALTER TABLE public.fe_config_empresa
  ADD COLUMN IF NOT EXISTS contacto TEXT;  -- Nombre de la persona de contacto
