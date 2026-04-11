-- Columna para rastrear envío automático de email FE en background
ALTER TABLE pos_ventas
  ADD COLUMN IF NOT EXISTS fe_email_enviado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cliente_telefono  TEXT;

COMMENT ON COLUMN pos_ventas.fe_email_enviado  IS 'TRUE cuando el email del comprobante FE fue enviado automáticamente al aceptarse por MH';
COMMENT ON COLUMN pos_ventas.cliente_telefono  IS 'Teléfono del cliente al momento de la venta';

