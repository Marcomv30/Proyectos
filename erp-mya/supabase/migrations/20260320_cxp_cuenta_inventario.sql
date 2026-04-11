-- Agrega cuenta de inventario a la configuración CXP
ALTER TABLE empresa_config_cxp
  ADD COLUMN IF NOT EXISTS cuenta_inventario_id BIGINT;
