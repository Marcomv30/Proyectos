-- ============================================================
-- EMPACADORA — RLS para emp_clientes y tabla de marcas por cliente
-- Fecha: 2026-03-25
-- ============================================================

ALTER TABLE emp_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY emp_clientes_all ON emp_clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE emp_cliente_marcas ENABLE ROW LEVEL SECURITY;
CREATE POLICY emp_cliente_marcas_all ON emp_cliente_marcas FOR ALL TO authenticated USING (true) WITH CHECK (true);
