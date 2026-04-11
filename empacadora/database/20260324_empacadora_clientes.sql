-- ============================================================
-- EMPACADORA — Tabla de clientes exportadores
-- Fecha: 2026-03-24
-- ============================================================

CREATE TABLE IF NOT EXISTS emp_clientes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  INTEGER      NOT NULL,
  nombre      TEXT         NOT NULL,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_emp_clientes_empresa ON emp_clientes(empresa_id);

-- Agregar cliente_id (UUID) a marcas y destinos
-- Se mantiene el cliente_id INTEGER anterior (ERP) como campo separado
ALTER TABLE emp_marcas
  ADD COLUMN IF NOT EXISTS emp_cliente_id UUID REFERENCES emp_clientes(id);

ALTER TABLE emp_destinos
  ADD COLUMN IF NOT EXISTS emp_cliente_id UUID REFERENCES emp_clientes(id);

ALTER TABLE emp_programas
  ADD COLUMN IF NOT EXISTS emp_cliente_id UUID REFERENCES emp_clientes(id);

CREATE INDEX IF NOT EXISTS idx_emp_marcas_cliente    ON emp_marcas(emp_cliente_id);
CREATE INDEX IF NOT EXISTS idx_emp_destinos_cliente  ON emp_destinos(emp_cliente_id);
CREATE INDEX IF NOT EXISTS idx_emp_programas_cliente ON emp_programas(emp_cliente_id);
