-- ============================================================
-- MYA ERP — Cierres de turno propios (independiente de Fusion)
-- Fusion puede tener el turno abierto desde 2024; MYA registra
-- sus propios cierres usando ventas ya sincronizadas en Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS comb_cierres_turno (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
  turno_nombre        VARCHAR(20) NOT NULL,          -- 'Mañana', 'Tarde', 'Noche'
  inicio_at           TIMESTAMPTZ NOT NULL,           -- inicio del período (= cierre anterior o inicio sistema)
  cierre_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cerrado_por         VARCHAR(100),                   -- nombre usuario que cerró
  fusion_period_id    INTEGER,                        -- referencia informativa al period_id de Fusion
  total_ventas        INTEGER NOT NULL DEFAULT 0,
  total_litros        NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_monto         NUMERIC(14,2) NOT NULL DEFAULT 0,
  resumen_grados      JSONB,   -- [{grade_id, nombre, litros, monto, ventas}]
  resumen_pisteros    JSONB,   -- [{attendant_id, nombre, litros, monto, ventas}]
  resumen_bombas      JSONB,   -- [{pump_id, litros, monto, ventas}]
  notas               TEXT
);

CREATE INDEX IF NOT EXISTS idx_comb_cierres_empresa_cierre
  ON comb_cierres_turno (empresa_id, cierre_at DESC);

-- RLS: el servidor escribe con service_role (bypasea RLS)
-- authenticated puede leer (el filtro por empresa_id lo hace la app)
ALTER TABLE comb_cierres_turno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cierres_turno_select"
  ON comb_cierres_turno FOR SELECT
  TO authenticated
  USING (true);
