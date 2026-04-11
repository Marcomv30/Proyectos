-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Materiales de Empaque
-- Fuente: AppSheet.ViewData.2026-03-25.csv
-- empresa_id = 3
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO emp_materiales
  (id, empresa_id, codigo, nombre, tipo, marca, unidad_medida, stock_minimo, activo)
VALUES

-- ── Bandejas (tipo: carton) ──────────────────────────────────────────────────
(gen_random_uuid(), 3, 'BK-0669', 'BANDEJA GENERICA KRAFT NEGRA MINI',          'carton',   'Genérica, CND-V, CND-C, ITACU',    'Unidad', 0, true),
(gen_random_uuid(), 3, 'BK-0500', 'BANDEJA GENERICA KRAFT VERDE',               'carton',   'Genérica, CND-V, CND-C',            'Unidad', 0, true),
(gen_random_uuid(), 3, 'BM-0707', 'BANDEJA ORSERO PACK ORO PIÑA BAJA BLANCA',  'carton',   'Orsero, Orsero C, Orsero CRW',      'Unidad', 0, true),
(gen_random_uuid(), 3, 'BM-0811', 'BANDEJA ORSERO PIÑA BAJA BLANCA (637)',      'carton',   'Orsero, Orsero C, Orsero CRW',      'Unidad', 0, true),
(gen_random_uuid(), 3, 'BM-0857', 'BANDEJA ORSERO PIÑA MINI BLANCA (636)',      'carton',   'Orsero, Orsero C, Orsero CRW',      'Unidad', 0, true),
(gen_random_uuid(), 3, 'BK-0096', 'BANDEJA PIÑA GENERICA NEGRA BAJA KRAFT',    'carton',   'Genérica, CND-V, CND-C',            'Unidad', 0, true),
(gen_random_uuid(), 3, 'BK-0742', 'BANDEJA PIÑA SIMBA BAJA KRAFT (637)',        'carton',   'Simba, Simba CRW, Simba G',         'Unidad', 0, true),
(gen_random_uuid(), 3, 'BK-0766', 'BANDEJA PIÑA SIMBA MINI KRAFT (636)',        'carton',   'Simba, Simba CRW, Simba G',         'Unidad', 0, true),

-- ── Colillas (tipo: colilla) ─────────────────────────────────────────────────
(gen_random_uuid(), 3, '3046',    'COLILLA CONAD',                              'colilla',  'CND-V, CND-C',                      'Unidad', 0, true),
(gen_random_uuid(), 3, '001',     'COLILLA GENERICA',                           'colilla',  'Genérica',                          'Unidad', 0, true),
(gen_random_uuid(), 3, '3027',    'COLILLA ORSERO #5',                          'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3028',    'COLILLA ORSERO #6',                          'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3029',    'COLILLA ORSERO #7',                          'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3031',    'COLILLA ORSERO #8',                          'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3032',    'COLILLA ORSERO #9',                          'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3040',    'COLILLA ORSERO ORO #5',                      'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3041',    'COLILLA ORSERO ORO #6',                      'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3042',    'COLILLA ORSERO ORO #7',                      'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3043',    'COLILLA ORSERO ORO #8',                      'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3044',    'COLILLA ORSERO ORO #9',                      'colilla',  'Orsero, Orsero C',                  'Unidad', 0, true),
(gen_random_uuid(), 3, '3034',    'COLILLA SIMBA #5',                           'colilla',  'Simba, Simba G',                    'Unidad', 0, true),
(gen_random_uuid(), 3, '3035',    'COLILLA SIMBA #6',                           'colilla',  'Simba, Simba G',                    'Unidad', 0, true),
(gen_random_uuid(), 3, '3036',    'COLILLA SIMBA #7',                           'colilla',  'Simba, Simba G',                    'Unidad', 0, true),
(gen_random_uuid(), 3, '3037',    'COLILLA SIMBA #8',                           'colilla',  'Simba, Simba G',                    'Unidad', 0, true),
(gen_random_uuid(), 3, '3038',    'COLILLA SIMBA #9',                           'colilla',  'Simba, Simba G',                    'Unidad', 0, true),
(gen_random_uuid(), 3, '3039',    'COLILLA SIMBA #10',                          'colilla',  'Simba',                             'Unidad', 0, true),

-- ── Divisores y Láminas (tipo: accesorio) ────────────────────────────────────
(gen_random_uuid(), 3, 'DK-0028', 'DIVISOR PIÑA ALTURA 13CM KRAFT (262)',       'accesorio','Genérica, CND-V, CND-C',            'Unidad', 0, true),
(gen_random_uuid(), 3, 'DK-0029', 'DIVISOR PIÑA ALTURA 14 CM KRAFT (261)',      'accesorio','Genérica, CND-V, CND-C',            'Unidad', 0, true),
(gen_random_uuid(), 3, 'LK-0091', 'LAMINA 6 HUECOS KRAFT (642)',                'accesorio','Genérica, CND-V, CND-C',            'Unidad', 0, true)

;
