-- Agregar columnas de terminal a fe_documentos para soporte multi-terminal
ALTER TABLE public.fe_documentos
  ADD COLUMN IF NOT EXISTS sucursal    VARCHAR(3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS punto_venta VARCHAR(5) DEFAULT NULL;

COMMENT ON COLUMN fe_documentos.sucursal    IS 'Terminal: sucursal (3 dígitos). NULL = usa default de fe_config_empresa';
COMMENT ON COLUMN fe_documentos.punto_venta IS 'Terminal: punto de venta (5 dígitos). NULL = usa default de fe_config_empresa';
