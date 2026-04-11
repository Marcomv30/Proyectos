-- ============================================================
-- MYA ERP — Seed: Dispensadores (Bombas de Combustible)
-- empresa_id = 1
-- Layout:
--   Pistas 1-4: cada pista tiene Cara A y Cara B, 3 mangueras c/u
--   Pista 5:    Gas LP, Cara A y Cara B, 1 manguera c/u
-- ============================================================

INSERT INTO dispensadores (empresa_id, pump_id, descripcion, ubicacion, activo)
VALUES
  (1,  1, 'Pista 1 - Cara A', 'Pista 1', TRUE),
  (1,  2, 'Pista 1 - Cara B', 'Pista 1', TRUE),
  (1,  3, 'Pista 2 - Cara A', 'Pista 2', TRUE),
  (1,  4, 'Pista 2 - Cara B', 'Pista 2', TRUE),
  (1,  5, 'Pista 3 - Cara A', 'Pista 3', TRUE),
  (1,  6, 'Pista 3 - Cara B', 'Pista 3', TRUE),
  (1,  7, 'Pista 4 - Cara A', 'Pista 4', TRUE),
  (1,  8, 'Pista 4 - Cara B', 'Pista 4', TRUE),
  (1,  9, 'Pista 5 - Cara A', 'Pista 5 (Gas LP)', TRUE),
  (1, 10, 'Pista 5 - Cara B', 'Pista 5 (Gas LP)', TRUE)
ON CONFLICT (empresa_id, pump_id) DO UPDATE
  SET descripcion = EXCLUDED.descripcion,
      ubicacion   = EXCLUDED.ubicacion,
      activo      = EXCLUDED.activo;
