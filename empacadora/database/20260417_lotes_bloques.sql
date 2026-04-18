-- =============================================================================
-- Lotes y Bloques — estructura para DronMosaico
-- 2026-04-17
-- =============================================================================

-- ── 1. Columnas adicionales en emp_parcelas ────────────────────────────────
ALTER TABLE emp_parcelas
  ADD COLUMN IF NOT EXISTS tipo_finca     VARCHAR(10) DEFAULT 'propia'
    CHECK (tipo_finca IN ('propia', 'alquilada')),
  ADD COLUMN IF NOT EXISTS area_ha_perimetro  DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS area_ha_sembrada   DECIMAL(10,4);

COMMENT ON COLUMN emp_parcelas.tipo_finca IS
  'propia = finca propiedad de la empresa | alquilada = finca en arriendo';
COMMENT ON COLUMN emp_parcelas.area_ha_perimetro IS
  'Área total del perímetro del lote (calculada desde geojson al guardar)';
COMMENT ON COLUMN emp_parcelas.area_ha_sembrada IS
  'Suma de áreas de bloques tipo siembra (actualizada al guardar bloques)';

-- ── 2. Tabla emp_bloques ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_bloques (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   INTEGER NOT NULL,
  parcela_id   UUID NOT NULL REFERENCES emp_parcelas(id) ON DELETE CASCADE,
  tipo         VARCHAR(20) NOT NULL
    CHECK (tipo IN ('siembra', 'camino', 'proteccion', 'otro')),
  num          INTEGER NOT NULL,          -- autoincremental por tipo dentro del lote
  geojson      JSONB,                     -- polígono en formato GeoJSON Feature
  area_ha      DECIMAL(10,4),
  plant_count  INTEGER DEFAULT 0,         -- inventario de plantas (solo siembra)
  notas        TEXT,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parcela_id, tipo, num)
);

COMMENT ON TABLE emp_bloques IS
  'Zonas dentro de un lote/parcela: bloques de siembra, caminos, protección, otros. '
  'Dibujados desde DronMosaico y asociados a la parcela padre.';

CREATE INDEX IF NOT EXISTS idx_emp_bloques_parcela
  ON emp_bloques (empresa_id, parcela_id);
CREATE INDEX IF NOT EXISTS idx_emp_bloques_tipo
  ON emp_bloques (parcela_id, tipo);

-- RLS
ALTER TABLE emp_bloques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_bloques_all" ON emp_bloques
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. Trigger: actualizar updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION emp_fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emp_bloques_updated_at ON emp_bloques;
CREATE TRIGGER trg_emp_bloques_updated_at
  BEFORE UPDATE ON emp_bloques
  FOR EACH ROW EXECUTE FUNCTION emp_fn_set_updated_at();

-- ── 4. Vista resumen por parcela ───────────────────────────────────────────
CREATE OR REPLACE VIEW emp_v_parcelas_resumen AS
SELECT
  p.id,
  p.empresa_id,
  p.proveedor_id,
  prov.nombre                                     AS proveedor_nombre,
  p.codigo,
  p.nombre,
  p.tipo_finca,
  p.activo,
  p.geojson,
  p.area_ha_perimetro,
  p.area_ha_sembrada,
  COUNT(b.id) FILTER (WHERE b.tipo = 'siembra' AND b.activo)  AS bloques_siembra,
  COUNT(b.id) FILTER (WHERE b.tipo = 'camino'  AND b.activo)  AS bloques_camino,
  COUNT(b.id) FILTER (WHERE b.tipo = 'proteccion' AND b.activo) AS bloques_proteccion,
  COUNT(b.id) FILTER (WHERE b.tipo = 'otro'    AND b.activo)  AS bloques_otro,
  COALESCE(SUM(b.area_ha) FILTER (WHERE b.tipo = 'siembra' AND b.activo), 0) AS area_sembrada_calc,
  COALESCE(SUM(b.area_ha) FILTER (WHERE b.tipo = 'camino'  AND b.activo), 0) AS area_caminos,
  COALESCE(SUM(b.area_ha) FILTER (WHERE b.tipo = 'proteccion' AND b.activo), 0) AS area_proteccion,
  COALESCE(SUM(b.area_ha) FILTER (WHERE b.tipo = 'otro'    AND b.activo), 0) AS area_otros,
  COALESCE(SUM(b.plant_count) FILTER (WHERE b.tipo = 'siembra' AND b.activo), 0) AS total_plantas
FROM emp_parcelas p
LEFT JOIN emp_proveedores_fruta prov ON prov.id = p.proveedor_id
LEFT JOIN emp_bloques b ON b.parcela_id = p.id
GROUP BY p.id, p.empresa_id, p.proveedor_id, prov.nombre,
         p.codigo, p.nombre, p.tipo_finca, p.activo,
         p.geojson, p.area_ha_perimetro, p.area_ha_sembrada;

COMMENT ON VIEW emp_v_parcelas_resumen IS
  'Resumen por parcela: áreas, conteo de bloques y plantas. Usar en reportes y dashboards.';
