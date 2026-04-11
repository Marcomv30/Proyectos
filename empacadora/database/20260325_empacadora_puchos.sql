-- Agrega campo para cajas enviadas al pool de puchos desde una tarima
ALTER TABLE emp_boletas
  ADD COLUMN IF NOT EXISTS cajas_a_puchos INTEGER NOT NULL DEFAULT 0;
