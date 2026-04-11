-- ============================================================
-- EMPACADORA — Configuración extendida de clientes
-- Fecha: 2026-03-24
-- Liga emp_clientes con terceros del ERP y agrega config
-- ============================================================

-- ─── Campos adicionales en emp_clientes ───────────────────────────────────────
ALTER TABLE emp_clientes
  ADD COLUMN IF NOT EXISTS tercero_id   BIGINT REFERENCES terceros(id),
  ADD COLUMN IF NOT EXISTS destino_id   UUID   REFERENCES emp_destinos(id),
  ADD COLUMN IF NOT EXISTS naviera      TEXT;

-- ─── Marcas por cliente (many-to-many) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_cliente_marcas (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  cliente_id  UUID    NOT NULL REFERENCES emp_clientes(id) ON DELETE CASCADE,
  marca_id    UUID    NOT NULL REFERENCES emp_marcas(id)   ON DELETE CASCADE,
  UNIQUE (empresa_id, cliente_id, marca_id)
);
