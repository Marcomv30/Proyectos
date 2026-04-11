-- ============================================================
-- MYA ERP — Seed: Grados de Combustible
-- empresa_id = 1
-- Mapeo confirmado con sistema Fusion:
--   grade_id 1 = Super    (~¢633/L)
--   grade_id 2 = Regular  (~¢607/L)
--   grade_id 3 = Diesel   (~¢530/L)
--   grade_id 4 = Gas LP
-- ============================================================

INSERT INTO grados_combustible (empresa_id, grade_id, nombre, activo)
VALUES
  (1, 1, 'Super',   TRUE),
  (1, 2, 'Regular', TRUE),
  (1, 3, 'Diesel',  TRUE),
  (1, 4, 'Gas LP',  TRUE)
ON CONFLICT (empresa_id, grade_id) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      activo = EXCLUDED.activo;
