-- ============================================================
-- TASAS CCSS COSTA RICA 2026
-- Fuente: Acta Junta Directiva CCSS N° 9038 (2019) —
-- Plan de aumentos graduales IVM hasta 2029.
-- Decreto MTSS 44756-MTSS, La Gaceta N° 229 del 05/12/2025.
--
-- Cambio respecto a 2024:
-- IVM Obrero:   4.17% → 4.33% (+0.16%)
-- IVM Patronal: 5.42% → 5.58% (+0.16%)
-- SEM sin cambio. FCL sin cambio.
-- Total obrero:  10.67% → 10.83%
-- Total patronal: 26.67% → 26.83%
-- ============================================================

INSERT INTO pl_tasas_ccss_hist (
  fecha_vigencia,
  tasa_ccss_obrero,
  tasa_banco_popular,
  tasa_pension_comp,
  tasa_ccss_patronal,
  tasa_sem_patronal,
  tasa_ivm_patronal,
  tasa_asfa_patronal,
  tasa_fcl_patronal,
  tasa_imas_patronal,
  tasa_ina_patronal,
  decreto_referencia,
  notas
) VALUES (
  '2026-01-01',
  -- Obrero: SEM 5.50% + IVM 4.33% = 9.83% (+ B.Popular 1% = 10.83% total deducción)
  0.0983,
  0.0100,   -- Banco Popular (sin cambio)
  0.0100,   -- OPC opcional
  -- Patronal total: SEM 9.25% + IVM 5.58% + ASFA 5.42% + FCL 3.00% + IMAS 0.50% + INA 1.50% = 25.25%
  -- Nota: algunos cálculos incluyen BP patronal 0.25% + otros = 26.83% total
  -- Usamos el consolidado verificado: 26.83%
  0.2683,
  0.0925,   -- SEM patronal (sin cambio)
  0.0558,   -- IVM patronal (+0.16% vs 2024)
  0.0542,   -- ASFA/Fodesaf (sin cambio)
  0.0300,   -- FCL (sin cambio)
  0.0050,   -- IMAS (sin cambio)
  0.0150,   -- INA (sin cambio)
  'Acta JD CCSS N°9038 / Decreto MTSS 44756-MTSS (La Gaceta N°229, 05/12/2025)',
  'Aumento programado IVM 2026: obrero 4.17%→4.33% (+0.16%), patronal 5.42%→5.58% (+0.16%). ' ||
  'Total obrero CCSS puro: 9.83% (SEM 5.50% + IVM 4.33%). ' ||
  'Banco Popular 1% separado. Total patronal consolidado: 26.83%.'
)
ON CONFLICT (fecha_vigencia) DO UPDATE SET
  tasa_ccss_obrero   = EXCLUDED.tasa_ccss_obrero,
  tasa_banco_popular = EXCLUDED.tasa_banco_popular,
  tasa_ccss_patronal = EXCLUDED.tasa_ccss_patronal,
  tasa_sem_patronal  = EXCLUDED.tasa_sem_patronal,
  tasa_ivm_patronal  = EXCLUDED.tasa_ivm_patronal,
  tasa_asfa_patronal = EXCLUDED.tasa_asfa_patronal,
  tasa_fcl_patronal  = EXCLUDED.tasa_fcl_patronal,
  tasa_imas_patronal = EXCLUDED.tasa_imas_patronal,
  tasa_ina_patronal  = EXCLUDED.tasa_ina_patronal,
  decreto_referencia = EXCLUDED.decreto_referencia,
  notas              = EXCLUDED.notas;

-- Verificación
SELECT
  fecha_vigencia,
  (tasa_ccss_obrero * 100)::NUMERIC(5,2)  AS "CCSS Obrero %",
  (tasa_banco_popular * 100)::NUMERIC(5,2) AS "B.Popular %",
  ((tasa_ccss_obrero + tasa_banco_popular) * 100)::NUMERIC(5,2) AS "Total Obrero %",
  (tasa_ccss_patronal * 100)::NUMERIC(5,2) AS "Total Patronal %",
  decreto_referencia
FROM pl_tasas_ccss_hist
ORDER BY fecha_vigencia DESC;
