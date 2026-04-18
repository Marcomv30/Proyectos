-- ============================================================
-- MEJORAS MÓDULO PLANILLA — MYA ERP
-- 1. Historial de tasas CCSS (varían regularmente en CR)
-- 2. Campo aplica_ccss por colaborador
-- 3. Tipo bisemanal en períodos
-- 4. Factor horas extra por jornada en cargos
-- ============================================================

-- -------------------------------------------------------
-- 1. HISTORIAL DE TASAS CCSS — TABLA UNIVERSAL
-- Las tasas CCSS son definidas por ley en Costa Rica,
-- son iguales para TODAS las empresas. No llevan empresa_id.
-- Solo el Superusuario MYA actualiza esta tabla cuando la
-- CCSS emite un nuevo decreto.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS pl_tasas_ccss_hist (
  id                  BIGSERIAL PRIMARY KEY,
  -- SIN empresa_id: tabla global del sistema
  fecha_vigencia      DATE NOT NULL UNIQUE,
  -- Cargas obreras (descuentos al trabajador)
  tasa_ccss_obrero    NUMERIC(6,4) NOT NULL,   -- SEM + IVM obrero
  tasa_banco_popular  NUMERIC(6,4) NOT NULL DEFAULT 0.0100,  -- Ley 1644
  tasa_pension_comp   NUMERIC(6,4) NOT NULL DEFAULT 0.0100,  -- OPC voluntario
  -- Cargas patronales (gasto de la empresa)
  tasa_ccss_patronal  NUMERIC(6,4) NOT NULL,   -- Total patronal consolidado
  -- Desglose patronal (referencia informativa)
  tasa_sem_patronal   NUMERIC(6,4),            -- Seguro Enfermedad y Maternidad
  tasa_ivm_patronal   NUMERIC(6,4),            -- Invalidez, Vejez y Muerte
  tasa_asfa_patronal  NUMERIC(6,4),            -- Asignaciones Familiares (Fodesaf)
  tasa_fcl_patronal   NUMERIC(6,4),            -- Fondo Capitalización Laboral
  tasa_imas_patronal  NUMERIC(6,4),            -- IMAS
  tasa_ina_patronal   NUMERIC(6,4),            -- INA
  -- Metadatos
  decreto_referencia  VARCHAR(120),            -- ej: "Acuerdo Junta Directiva CCSS N°9876-2024"
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasas históricas CR — Fuente: CCSS, acuerdos Junta Directiva
INSERT INTO pl_tasas_ccss_hist (
  fecha_vigencia,
  tasa_ccss_obrero, tasa_banco_popular, tasa_pension_comp,
  tasa_ccss_patronal,
  tasa_sem_patronal, tasa_ivm_patronal, tasa_asfa_patronal,
  tasa_fcl_patronal, tasa_imas_patronal, tasa_ina_patronal,
  decreto_referencia, notas
) VALUES
  -- 2024 — vigente al momento de creación del módulo
  ('2024-01-01', 0.1067, 0.0100, 0.0100, 0.2667,
   0.0950, 0.0584, 0.0542, 0.0300, 0.0050, 0.0150,
   'Acuerdo JD CCSS 2024',
   'Obrero 10.67%: SEM 5.50% + IVM 4.17% + BN 1%. Patronal 26.67%: SEM 9.50% + IVM 5.84% + ASFA 5.42% + FCL 3.00% + IMAS 0.50% + INA 1.50%'),
  -- 2019 — reforma Fondo Capitalización Laboral
  ('2019-01-01', 0.1050, 0.0100, 0.0100, 0.2617,
   0.0950, 0.0584, 0.0542, 0.0250, 0.0050, 0.0150,
   'Acuerdo JD CCSS 2019',
   'Antes de ajuste FCL 2024. Obrero 10.50%'),
  -- 2015
  ('2015-01-01', 0.1050, 0.0100, 0.0100, 0.2517,
   0.0950, 0.0584, 0.0542, 0.0150, 0.0050, 0.0150,
   'Acuerdo JD CCSS 2015',
   'FCL 1.50% antes de reforma')
ON CONFLICT (fecha_vigencia) DO NOTHING;

-- Vista: tasa CCSS vigente — la más reciente <= hoy (una sola fila, global)
CREATE OR REPLACE VIEW v_tasas_ccss_vigente AS
SELECT
  id, fecha_vigencia,
  tasa_ccss_obrero, tasa_banco_popular, tasa_pension_comp,
  tasa_ccss_patronal,
  tasa_sem_patronal, tasa_ivm_patronal, tasa_asfa_patronal,
  tasa_fcl_patronal, tasa_imas_patronal, tasa_ina_patronal,
  decreto_referencia, notas
FROM pl_tasas_ccss_hist
WHERE fecha_vigencia <= CURRENT_DATE
ORDER BY fecha_vigencia DESC
LIMIT 1;

-- -------------------------------------------------------
-- 2. MEJORAS EN pl_colaboradores
-- -------------------------------------------------------

-- Exención de cargas sociales (pensionados reingresados, etc.)
ALTER TABLE pl_colaboradores
  ADD COLUMN IF NOT EXISTS aplica_ccss        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS aplica_renta       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS aplica_banco_popular BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS observacion_deducciones TEXT; -- razón de exención si aplica

COMMENT ON COLUMN pl_colaboradores.aplica_ccss IS
  'FALSE = colaborador exento de CCSS (ej. pensionado reingresado, régimen especial)';
COMMENT ON COLUMN pl_colaboradores.aplica_renta IS
  'FALSE = no aplica retención de impuesto sobre la renta (certificación MH)';

-- -------------------------------------------------------
-- 3. TIPO bisemanal EN PERÍODOS
-- -------------------------------------------------------
-- Ampliar CHECK constraint de frecuencia
ALTER TABLE pl_periodos
  DROP CONSTRAINT IF EXISTS pl_periodos_frecuencia_check;

ALTER TABLE pl_periodos
  ADD CONSTRAINT pl_periodos_frecuencia_check
  CHECK (frecuencia IN ('semanal','bisemanal','quincenal','mensual'));

-- -------------------------------------------------------
-- 4. FACTOR HORAS EXTRA POR JORNADA EN CARGOS/COLABORADORES
-- -------------------------------------------------------
-- Agregar horas_base_mes según jornada (para cálculo correcto del valor hora)
-- Jornada ordinaria diurna:  240h/mes (8h × 30 días)
-- Jornada mixta:             216h/mes (7.2h × 30 días)
-- Jornada nocturna:          180h/mes (6h × 30 días)
-- Jornada parcial:           configurable

ALTER TABLE pl_colaboradores
  ADD COLUMN IF NOT EXISTS horas_mes_base NUMERIC(6,2) DEFAULT 240;

COMMENT ON COLUMN pl_colaboradores.horas_mes_base IS
  'Base mensual de horas para calcular valor hora. Diurna=240, Mixta=216, Nocturna=180';

-- Actualizar horas_mes_base según jornada existente
UPDATE pl_colaboradores SET horas_mes_base =
  CASE jornada
    WHEN 'ordinaria' THEN 240
    WHEN 'mixta'     THEN 216
    WHEN 'nocturna'  THEN 180
    WHEN 'parcial'   THEN horas_semana * 4.33
    ELSE 240
  END
WHERE horas_mes_base IS NULL OR horas_mes_base = 240;

-- -------------------------------------------------------
-- 5. DESGLOSE DE HORAS EXTRA EN LÍNEAS DE PLANILLA
-- -------------------------------------------------------
ALTER TABLE pl_planilla_lineas
  ADD COLUMN IF NOT EXISTS horas_extra_feriado NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_hora_ordinaria NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_he_diurnas    NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_he_nocturnas  NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_he_feriado    NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN pl_planilla_lineas.valor_hora_ordinaria IS
  'Calculado: salario / horas_mes_base del colaborador';
COMMENT ON COLUMN pl_planilla_lineas.monto_he_diurnas IS
  'horas_extra_diurnas × valor_hora × 1.5';
COMMENT ON COLUMN pl_planilla_lineas.monto_he_nocturnas IS
  'horas_extra_nocturnas × valor_hora × 2.0';
COMMENT ON COLUMN pl_planilla_lineas.monto_he_feriado IS
  'horas_extra_feriado × valor_hora × 2.0';

-- -------------------------------------------------------
-- 6. FUNCIÓN: calcular valor hora según jornada CR
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_valor_hora_colaborador(
  p_salario      NUMERIC,
  p_jornada      VARCHAR,
  p_horas_semana NUMERIC DEFAULT 48
) RETURNS NUMERIC AS $$
DECLARE
  v_horas_mes NUMERIC;
BEGIN
  v_horas_mes := CASE p_jornada
    WHEN 'ordinaria' THEN 240    -- CT art 136: 8h × 30
    WHEN 'mixta'     THEN 216    -- CT art 136: 7.2h × 30
    WHEN 'nocturna'  THEN 180    -- CT art 136: 6h × 30
    WHEN 'parcial'   THEN COALESCE(p_horas_semana, 48) * 4.333
    ELSE 240
  END;
  RETURN ROUND(p_salario / v_horas_mes, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- -------------------------------------------------------
-- 7. FUNCIÓN: calcular monto horas extra CR
-- Art 139 CT: diurnas 1.5×, nocturnas y feriados 2×
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calcular_horas_extra(
  p_salario           NUMERIC,
  p_jornada           VARCHAR,
  p_horas_semana      NUMERIC,
  p_he_diurnas        NUMERIC DEFAULT 0,
  p_he_nocturnas      NUMERIC DEFAULT 0,
  p_he_feriado        NUMERIC DEFAULT 0
) RETURNS TABLE(
  valor_hora    NUMERIC,
  monto_diurnas NUMERIC,
  monto_noct    NUMERIC,
  monto_feriado NUMERIC,
  total_he      NUMERIC
) AS $$
DECLARE
  v_hora NUMERIC;
BEGIN
  v_hora := fn_valor_hora_colaborador(p_salario, p_jornada, p_horas_semana);
  RETURN QUERY SELECT
    v_hora,
    ROUND(p_he_diurnas   * v_hora * 1.5, 2),
    ROUND(p_he_nocturnas * v_hora * 2.0, 2),
    ROUND(p_he_feriado   * v_hora * 2.0, 2),
    ROUND(
      (p_he_diurnas * v_hora * 1.5) +
      (p_he_nocturnas * v_hora * 2.0) +
      (p_he_feriado * v_hora * 2.0),
    2);
END;
$$ LANGUAGE plpgsql STABLE;

-- -------------------------------------------------------
-- 8. FUNCIÓN MEJORADA: calcular días del período según frecuencia
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_dias_periodo(
  p_frecuencia VARCHAR,
  p_fecha_inicio DATE,
  p_fecha_fin    DATE
) RETURNS NUMERIC AS $$
DECLARE
  v_dias_naturales INTEGER;
BEGIN
  v_dias_naturales := (p_fecha_fin - p_fecha_inicio) + 1;
  -- Para efectos de cálculo de salario proporcional usamos:
  -- Mensual: 30 días fijos (base CR)
  -- Quincenal: 15 días fijos
  -- Bisemanal: 14 días
  -- Semanal: 7 días
  RETURN CASE p_frecuencia
    WHEN 'mensual'    THEN 30
    WHEN 'quincenal'  THEN 15
    WHEN 'bisemanal'  THEN 14
    WHEN 'semanal'    THEN 7
    ELSE v_dias_naturales
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- -------------------------------------------------------
-- 9. RLS para tabla universal de tasas
-- Lectura para todos los autenticados — escritura solo desde backend
-- -------------------------------------------------------
ALTER TABLE pl_tasas_ccss_hist ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_read_pl_tasas_ccss_hist
  ON pl_tasas_ccss_hist FOR SELECT TO authenticated
  USING (true);

-- Solo el service role (backend) puede insertar/actualizar
-- cuando CCSS emite nuevas tasas

-- -------------------------------------------------------
-- 10. ÍNDICE
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pl_tasas_ccss_hist_fecha
  ON pl_tasas_ccss_hist(fecha_vigencia DESC);
