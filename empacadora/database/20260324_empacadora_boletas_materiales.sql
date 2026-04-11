-- ============================================================
-- EMPACADORA — Agregar materiales de empaque a boletas
-- Fecha: 2026-03-24
-- ============================================================

ALTER TABLE emp_boletas
  ADD COLUMN IF NOT EXISTS material_caja_id    UUID REFERENCES emp_materiales(id),
  ADD COLUMN IF NOT EXISTS material_colilla_id UUID REFERENCES emp_materiales(id);

CREATE INDEX IF NOT EXISTS idx_emp_bol_mat_caja    ON emp_boletas(material_caja_id);
CREATE INDEX IF NOT EXISTS idx_emp_bol_mat_colilla ON emp_boletas(material_colilla_id);
