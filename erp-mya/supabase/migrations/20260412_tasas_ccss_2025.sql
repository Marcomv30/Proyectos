-- ============================================================
-- TASAS CCSS COSTA RICA 2025
-- Fuente: Acta JD CCSS N° 9038 (plan gradual IVM 2019-2029)
-- Decreto MTSS 44756-MTSS, La Gaceta N°232, 10/12/2024
--
-- Cambio respecto a 2024:
-- IVM Obrero:   4.17% → 4.25% (+0.08% — ajuste bianual plan)
-- IVM Patronal: 5.42% → 5.50% (+0.08%)
-- SEM, FCL, ASFA, IMAS, INA sin cambio
-- Total obrero CCSS puro: 9.75% (SEM 5.50% + IVM 4.25%)
-- + Banco Popular 1.00% = 10.75% total deducción
-- Total patronal: 26.75%
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
  '2025-01-01',
  0.0975,   -- SEM 5.50% + IVM 4.25%
  0.0100,   -- Banco Popular (sin cambio)
  0.0100,   -- OPC opcional
  0.2675,   -- SEM 9.25% + IVM 5.50% + ASFA 5.42% + FCL 3.00% + IMAS 0.50% + INA 1.50%
  0.0925,   -- SEM patronal (sin cambio)
  0.0550,   -- IVM patronal (+0.08% vs 2024)
  0.0542,   -- ASFA/Fodesaf (sin cambio)
  0.0300,   -- FCL (sin cambio)
  0.0050,   -- IMAS (sin cambio)
  0.0150,   -- INA (sin cambio)
  'Acta JD CCSS N°9038 / Decreto MTSS 44756-MTSS (La Gaceta N°232, 10/12/2024)',
  'Ajuste bianual IVM 2025: obrero 4.17%→4.25% (+0.08%), patronal 5.42%→5.50% (+0.08%). ' ||
  'SEM, FCL, ASFA, IMAS, INA sin variación. ' ||
  'Total obrero CCSS puro: 9.75%. Con Banco Popular: 10.75%. Total patronal: 26.75%.'
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

-- Verificación comparativa 2024-2025-2026
SELECT
  fecha_vigencia                                           AS "Vigencia",
  (tasa_ccss_obrero * 100)::NUMERIC(5,2)                  AS "CCSS Ob%",
  (tasa_banco_popular * 100)::NUMERIC(5,2)                AS "B.Pop%",
  ((tasa_ccss_obrero+tasa_banco_popular)*100)::NUMERIC(5,2) AS "Tot.Ob%",
  (tasa_ivm_patronal * 100)::NUMERIC(5,2)                 AS "IVM Pat%",
  (tasa_ccss_patronal * 100)::NUMERIC(5,2)                AS "Tot.Pat%",
  decreto_referencia                                       AS "Decreto"
FROM pl_tasas_ccss_hist
WHERE fecha_vigencia >= '2024-01-01'
ORDER BY fecha_vigencia;
