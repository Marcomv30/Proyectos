-- Módulo POS — Contabilización de cierres de caja
-- Agrega campos de asiento a pos_sesiones y crea tabla de configuración contable POS

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extender pos_sesiones con campos de contabilización
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pos_sesiones ADD COLUMN IF NOT EXISTS asiento_id BIGINT REFERENCES asientos(id);
ALTER TABLE pos_sesiones ADD COLUMN IF NOT EXISTS contabilizado BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabla de configuración contable POS por empresa
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empresa_config_pos (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id),

  -- Categoría de asientos POS (ej. "Cierres de Caja")
  categoria_pos_id BIGINT REFERENCES asiento_categorias(id),

  -- Cuentas contables por tipo de pago (débitos)
  cuenta_efectivo_id        BIGINT REFERENCES plan_cuentas_empresa(id),
  cuenta_sinpe_id           BIGINT REFERENCES plan_cuentas_empresa(id),
  cuenta_tarjeta_id         BIGINT REFERENCES plan_cuentas_empresa(id),
  cuenta_transferencia_id   BIGINT REFERENCES plan_cuentas_empresa(id),

  -- Cuentas de ingresos (créditos)
  cuenta_ventas_id          BIGINT REFERENCES plan_cuentas_empresa(id),
  cuenta_iva_ventas_id      BIGINT REFERENCES plan_cuentas_empresa(id),
  cuenta_diferencias_id     BIGINT REFERENCES plan_cuentas_empresa(id),  -- para diferencias de caja

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(empresa_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_empresa_config_pos_empresa ON empresa_config_pos(empresa_id);

-- RLS
ALTER TABLE empresa_config_pos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_empresa_config_pos" ON empresa_config_pos USING (auth.role() = 'service_role');
