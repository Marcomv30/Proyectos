-- Agrega columnas de totales por tipo de pago a pos_sesiones para el cierre de caja
-- total_sinpe, total_tarjeta y total_transferencia se usan en la función cerrarTurno

ALTER TABLE pos_sesiones ADD COLUMN IF NOT EXISTS total_sinpe NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_sesiones ADD COLUMN IF NOT EXISTS total_tarjeta NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_sesiones ADD COLUMN IF NOT EXISTS total_transferencia NUMERIC(12,2) DEFAULT 0;
