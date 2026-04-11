-- ============================================================
-- EMPACADORA — Color identificador por cliente
-- Fecha: 2026-03-25
-- ============================================================

ALTER TABLE emp_clientes
  ADD COLUMN IF NOT EXISTS color TEXT;
