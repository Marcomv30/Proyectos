-- ============================================================
-- MYA ERP — Brazaletes y lectores HID
-- Catálogo de brazaletes NFC/RFID por empresa y config de
-- lectores USB HID mapeados a bombas.
-- ============================================================

-- Catálogo de brazaletes
CREATE TABLE IF NOT EXISTS comb_brazaletes (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
  bracelet_id     VARCHAR(50)  NOT NULL,           -- ID leído por el lector (ej. "3045679459")
  operador_nombre VARCHAR(100) NOT NULL,
  attendant_id    VARCHAR(100),                    -- referencia informativa a Fusion attendant
  estado          VARCHAR(20)  NOT NULL DEFAULT 'activo',  -- activo | inactivo
  notas           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, bracelet_id)
);

CREATE INDEX IF NOT EXISTS idx_comb_brazaletes_empresa
  ON comb_brazaletes (empresa_id, estado);

-- Config de lectores HID por empresa
-- Mapea vendor_id + product_id → pump_id
CREATE TABLE IF NOT EXISTS comb_hid_lectores (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id),
  vendor_id     INTEGER NOT NULL,    -- VID en decimal (ej. 5824 = 0x16C0)
  product_id    INTEGER NOT NULL,    -- PID en decimal (ej. 10203 = 0x27DB)
  pump_id       INTEGER NOT NULL,
  descripcion   VARCHAR(100),        -- "Cara A — Bomba 1"
  activo        BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (empresa_id, vendor_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_comb_hid_lectores_empresa
  ON comb_hid_lectores (empresa_id, activo);

-- RLS
ALTER TABLE comb_brazaletes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE comb_hid_lectores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brazaletes_select"
  ON comb_brazaletes FOR SELECT TO authenticated USING (true);

CREATE POLICY "hid_lectores_select"
  ON comb_hid_lectores FOR SELECT TO authenticated USING (true);

-- Seed: los dos lectores detectados (empresa_id 4)
INSERT INTO comb_hid_lectores (empresa_id, vendor_id, product_id, pump_id, descripcion)
VALUES
  (4, 5824,  10203, 1, 'Cara A — Bomba 1'),   -- VID_16C0 / PID_27DB
  (4, 22671, 37460, 2, 'Cara B — Bomba 2')    -- VID_058F / PID_9254
ON CONFLICT (empresa_id, vendor_id, product_id) DO NOTHING;
