-- Agrega GGN/GLN al proveedor para auto-llenado en recepción
ALTER TABLE emp_proveedores_fruta
  ADD COLUMN IF NOT EXISTS ggn_gln VARCHAR(50);
