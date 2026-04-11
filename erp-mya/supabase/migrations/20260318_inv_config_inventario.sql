-- ============================================================
-- MYA ERP — Parámetros contables de inventario por empresa
-- Cuentas: inventario (activo), costo de ventas, ajustes
-- ============================================================

CREATE TABLE IF NOT EXISTS empresa_config_inventario (
  empresa_id              INTEGER PRIMARY KEY,
  cuenta_inventario_id    BIGINT REFERENCES plan_cuentas_base(id) ON DELETE SET NULL,
  cuenta_costo_ventas_id  BIGINT REFERENCES plan_cuentas_base(id) ON DELETE SET NULL,
  cuenta_ajuste_inv_id    BIGINT REFERENCES plan_cuentas_base(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE empresa_config_inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_config_inv_all"
  ON empresa_config_inventario FOR ALL USING (true) WITH CHECK (true);
