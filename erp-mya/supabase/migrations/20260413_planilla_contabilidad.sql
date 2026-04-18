-- ============================================================
-- PLANILLA — CONFIGURACIÓN CUENTAS CONTABLES
-- Agrega campos de cuenta a pl_config_deducciones para
-- generar el asiento contable al cerrar una planilla.
-- ============================================================

-- Agregar columnas de cuenta_id (FK a cuentas_catalogo)
ALTER TABLE pl_config_deducciones
  ADD COLUMN IF NOT EXISTS cuenta_sueldos_id          BIGINT,
  ADD COLUMN IF NOT EXISTS cuenta_ccss_obrero_id      BIGINT,
  ADD COLUMN IF NOT EXISTS cuenta_ccss_patronal_id    BIGINT,
  ADD COLUMN IF NOT EXISTS cuenta_renta_id            BIGINT,
  ADD COLUMN IF NOT EXISTS cuenta_banco_popular_id    BIGINT,
  ADD COLUMN IF NOT EXISTS cuenta_solidarista_id      BIGINT,
  ADD COLUMN IF NOT EXISTS cuenta_prov_aguinaldo_id   BIGINT,
  ADD COLUMN IF NOT EXISTS cuenta_prov_vacaciones_id  BIGINT,
  ADD COLUMN IF NOT EXISTS cuenta_prov_cesantia_id    BIGINT,
  ADD COLUMN IF NOT EXISTS cuenta_sueldos_pagar_id    BIGINT,  -- pasivo: sueldos por pagar
  ADD COLUMN IF NOT EXISTS categoria_asiento_id       BIGINT;  -- tipo de asiento contable

COMMENT ON COLUMN pl_config_deducciones.cuenta_sueldos_id        IS 'Gasto sueldos (débito)';
COMMENT ON COLUMN pl_config_deducciones.cuenta_ccss_obrero_id    IS 'CCSS obrero por pagar (crédito pasivo)';
COMMENT ON COLUMN pl_config_deducciones.cuenta_ccss_patronal_id  IS 'CCSS patronal por pagar (crédito pasivo)';
COMMENT ON COLUMN pl_config_deducciones.cuenta_renta_id          IS 'Impuesto renta retenido por pagar (crédito pasivo)';
COMMENT ON COLUMN pl_config_deducciones.cuenta_banco_popular_id  IS 'Banco Popular por pagar (crédito pasivo)';
COMMENT ON COLUMN pl_config_deducciones.cuenta_prov_aguinaldo_id IS 'Provisión aguinaldo (crédito pasivo)';
COMMENT ON COLUMN pl_config_deducciones.cuenta_prov_vacaciones_id IS 'Provisión vacaciones (crédito pasivo)';
COMMENT ON COLUMN pl_config_deducciones.cuenta_prov_cesantia_id  IS 'Provisión cesantía (crédito pasivo)';
COMMENT ON COLUMN pl_config_deducciones.cuenta_sueldos_pagar_id  IS 'Sueldos netos por pagar (crédito pasivo)';
