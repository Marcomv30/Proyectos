-- Módulo CXP: documentos por pagar a proveedores

-- 1. Tabla principal de documentos CXP
CREATE TABLE IF NOT EXISTS cxp_documentos (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          INTEGER  NOT NULL,
  comprobante_id      BIGINT   REFERENCES comprobantes_recibidos(id),
  proveedor_id        BIGINT   NOT NULL,
  tipo                VARCHAR(10) NOT NULL,          -- FE, FEC, FEE, NCE, NDE
  numero_comprobante  VARCHAR(50),
  fecha_emision       DATE,
  fecha_vencimiento   DATE,
  moneda              VARCHAR(3)    DEFAULT 'CRC',
  tipo_cambio         NUMERIC(12,5) DEFAULT 1,
  monto_total         NUMERIC(18,5) NOT NULL DEFAULT 0,
  saldo               NUMERIC(18,5) NOT NULL DEFAULT 0,
  asiento_id          BIGINT   REFERENCES asientos(id),
  estado              VARCHAR(20)   DEFAULT 'pendiente', -- pendiente, parcial, pagado, anulado
  notas               TEXT,
  created_at          TIMESTAMPTZ   DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cxp_empresa      ON cxp_documentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cxp_proveedor    ON cxp_documentos (empresa_id, proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cxp_estado       ON cxp_documentos (empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_cxp_comprobante  ON cxp_documentos (comprobante_id);

-- 2. Vínculos en comprobantes_recibidos
ALTER TABLE comprobantes_recibidos
  ADD COLUMN IF NOT EXISTS contabilizado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS asiento_id    BIGINT  REFERENCES asientos(id);

-- 3. Parámetros de empresa para cuentas contables por defecto (CXP)
--    Se almacenan en parametros_empresa (key-value) con las siguientes claves:
--    cuenta_gasto_compras_id    → plan_cuentas_empresa.id  (gasto por defecto por línea)
--    cuenta_iva_credito_id      → plan_cuentas_empresa.id  (IVA crédito fiscal acreditable)
--    cuenta_iva_gasto_id        → plan_cuentas_empresa.id  (IVA no acreditable → gasto)
--    cuenta_otros_cargos_id     → plan_cuentas_empresa.id  (Cruz Roja, 911, Bomberos)
--    categoria_compras_id       → asiento_categorias.id    (categoría para asientos de compras)
