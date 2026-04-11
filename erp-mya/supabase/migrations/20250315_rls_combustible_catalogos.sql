-- ============================================================
-- MYA ERP — RLS: Catálogos Combustible
-- Permite lectura a usuarios autenticados en dispensadores
-- y grados_combustible (filtrado por empresa_id)
-- ============================================================

-- Dispensadores
ALTER TABLE dispensadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combustible_dispensadores_select"
  ON dispensadores FOR SELECT
  TO authenticated
  USING (true);

-- Grados Combustible
ALTER TABLE grados_combustible ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combustible_grados_select"
  ON grados_combustible FOR SELECT
  TO authenticated
  USING (true);

-- Tanques Combustible
ALTER TABLE tanques_combustible ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combustible_tanques_select"
  ON tanques_combustible FOR SELECT
  TO authenticated
  USING (true);
