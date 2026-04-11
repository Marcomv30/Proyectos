-- Configuración contable para módulo CXP (compras/comprobantes recibidos)
DROP TABLE IF EXISTS empresa_config_cxp;
CREATE TABLE empresa_config_cxp (
  empresa_id              INTEGER PRIMARY KEY,
  cuenta_cxp_id           BIGINT,
  cuenta_gasto_id         BIGINT,
  cuenta_iva_credito_id   BIGINT,
  cuenta_iva_gasto_id     BIGINT,
  cuenta_otros_cargos_id  BIGINT,
  categoria_compras_id    BIGINT,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE empresa_config_cxp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_config_cxp_all" ON empresa_config_cxp
  FOR ALL USING (true) WITH CHECK (true);
