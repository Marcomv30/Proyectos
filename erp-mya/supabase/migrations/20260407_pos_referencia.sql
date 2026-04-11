-- Agrega campo referencia_pago a pos_ventas (comprobante SINPE, autorización tarjeta, etc.)
ALTER TABLE pos_ventas ADD COLUMN IF NOT EXISTS referencia_pago TEXT;

-- Agrega total_sinpe a pos_sesiones para cierre de caja
ALTER TABLE pos_sesiones ADD COLUMN IF NOT EXISTS total_sinpe NUMERIC(12,2) NOT NULL DEFAULT 0;
