ALTER TABLE inv_movimientos ADD COLUMN IF NOT EXISTS asiento_id BIGINT REFERENCES asientos(id);
