-- ============================================================
-- MÓDULO PLANILLA / COLABORADORES — MYA ERP
-- Legislación Costa Rica (Código de Trabajo + CCSS + MH)
-- ============================================================

-- -------------------------------------------------------
-- 1. CATÁLOGOS BASE
-- -------------------------------------------------------

-- Departamentos / áreas organizacionales
CREATE TABLE IF NOT EXISTS pl_departamentos (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre        VARCHAR(120) NOT NULL,
  codigo        VARCHAR(20),
  descripcion   TEXT,
  tipo          VARCHAR(30) DEFAULT 'oficina' CHECK (tipo IN ('oficina','campo','produccion','ventas','logistica','mixto')),
  -- tipo='campo' habilita integración futura con módulo APLICACIONES
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

-- Cargos / puestos por empresa
CREATE TABLE IF NOT EXISTS pl_cargos (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  departamento_id BIGINT REFERENCES pl_departamentos(id),
  nombre          VARCHAR(120) NOT NULL,
  codigo          VARCHAR(20),
  categoria       VARCHAR(30) DEFAULT 'operario'
    CHECK (categoria IN ('operario','tecnico','profesional','gerencial','directivo','otro')),
  salario_base_ref NUMERIC(14,2),  -- salario mínimo de referencia para este cargo
  tipo_trabajo    VARCHAR(20) DEFAULT 'oficina' CHECK (tipo_trabajo IN ('oficina','campo','mixto')),
  descripcion     TEXT,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

-- -------------------------------------------------------
-- 2. COLABORADORES
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS pl_colaboradores (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Datos de identificación
  numero_empleado     VARCHAR(20),           -- código interno
  tipo_identificacion VARCHAR(20) DEFAULT 'cedula'
    CHECK (tipo_identificacion IN ('cedula','dimex','pasaporte','otro')),
  identificacion      VARCHAR(30) NOT NULL,
  nombre_completo     VARCHAR(200) NOT NULL,
  primer_apellido     VARCHAR(80),
  segundo_apellido    VARCHAR(80),
  nombre              VARCHAR(80),

  -- Datos personales
  fecha_nacimiento    DATE,
  sexo                VARCHAR(10) CHECK (sexo IN ('masculino','femenino','otro')),
  estado_civil        VARCHAR(20) CHECK (estado_civil IN ('soltero','casado','divorciado','viudo','union_libre','otro')),
  nacionalidad        VARCHAR(60) DEFAULT 'costarricense',

  -- Contacto
  email               VARCHAR(120),
  email_personal      VARCHAR(120),
  telefono            VARCHAR(20),
  telefono_emergencia VARCHAR(20),
  contacto_emergencia VARCHAR(120),        -- nombre contacto de emergencia

  -- Dirección
  provincia           VARCHAR(60),
  canton              VARCHAR(80),
  distrito            VARCHAR(80),
  direccion_detalle   TEXT,

  -- Datos laborales
  departamento_id     BIGINT REFERENCES pl_departamentos(id),
  cargo_id            BIGINT REFERENCES pl_cargos(id),
  fecha_ingreso       DATE NOT NULL,
  fecha_salida        DATE,
  motivo_salida       VARCHAR(50) CHECK (motivo_salida IN (
    'renuncia','despido_justificado','despido_sin_causa','mutuo_acuerdo',
    'fin_contrato','jubilacion','fallecimiento','otro')),

  -- Tipo de contrato y salario
  tipo_contrato       VARCHAR(30) DEFAULT 'indefinido'
    CHECK (tipo_contrato IN ('indefinido','plazo_fijo','obra_determinada','aprendizaje')),
  tipo_salario        VARCHAR(20) DEFAULT 'mensual'
    CHECK (tipo_salario IN ('mensual','quincenal','semanal','jornal','hora')),
  salario             NUMERIC(14,2) NOT NULL DEFAULT 0,
  moneda_salario      VARCHAR(5) DEFAULT 'CRC',
  jornada             VARCHAR(20) DEFAULT 'ordinaria'
    CHECK (jornada IN ('ordinaria','mixta','nocturna','parcial')),
  horas_semana        NUMERIC(5,2) DEFAULT 48,  -- jornada ordinaria CR = 48h/sem

  -- Banco para pago
  banco               VARCHAR(80),
  tipo_cuenta         VARCHAR(20) CHECK (tipo_cuenta IN ('corriente','ahorros','sinpe')),
  numero_cuenta       VARCHAR(30),

  -- CCSS
  numero_asegurado    VARCHAR(20),           -- número asegurado CCSS
  regimen_pensiones   VARCHAR(30) DEFAULT 'ccss'
    CHECK (regimen_pensiones IN ('ccss','magisterio','poder_judicial','opc','otro')),

  -- QR de asistencia
  qr_token            UUID DEFAULT gen_random_uuid() UNIQUE,  -- token para QR de marcación

  -- Usuario del sistema (opcional — colaborador puede o no ser usuario ERP)
  usuario_erp_id      BIGINT,               -- FK a usuarios si aplica (no obligatorio)

  -- Perfil laboral / campo (para módulo APLICACIONES)
  apto_campo          BOOLEAN DEFAULT FALSE,
  licencia_conducir   VARCHAR(20),           -- categoría licencia si aplica
  notas               TEXT,

  estado              VARCHAR(20) DEFAULT 'activo'
    CHECK (estado IN ('activo','inactivo','incapacitado','vacaciones','suspendido')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(empresa_id, identificacion),
  UNIQUE(empresa_id, numero_empleado)
);

-- Historial de salarios (cada cambio genera un registro)
CREATE TABLE IF NOT EXISTS pl_salarios_hist (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id  BIGINT NOT NULL REFERENCES pl_colaboradores(id) ON DELETE CASCADE,
  fecha_vigencia  DATE NOT NULL,
  salario_anterior NUMERIC(14,2) NOT NULL DEFAULT 0,
  salario_nuevo   NUMERIC(14,2) NOT NULL,
  motivo          VARCHAR(50) CHECK (motivo IN (
    'ingreso','aumento_merito','aumento_ley','ajuste','accion_personal','otro')),
  porcentaje_cambio NUMERIC(6,3),           -- calculado automáticamente
  referencia_accion BIGINT,                 -- FK a pl_acciones_personal
  notas           TEXT,
  registrado_por  VARCHAR(120),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- 3. HORARIOS Y TURNOS
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS pl_horarios (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          VARCHAR(80) NOT NULL,
  descripcion     TEXT,
  hora_entrada    TIME NOT NULL,
  hora_salida     TIME NOT NULL,
  minutos_almuerzo INTEGER DEFAULT 60,
  dias_laborales  SMALLINT[] DEFAULT '{1,2,3,4,5}'::SMALLINT[],  -- 0=dom,1=lun..6=sab
  activo          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asignación de horario a colaborador (historial)
CREATE TABLE IF NOT EXISTS pl_horarios_colaborador (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id  BIGINT NOT NULL REFERENCES pl_colaboradores(id) ON DELETE CASCADE,
  horario_id      BIGINT NOT NULL REFERENCES pl_horarios(id),
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- 4. CONTROL DE ASISTENCIA
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS pl_marcaciones (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id  BIGINT NOT NULL REFERENCES pl_colaboradores(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada','salida','inicio_almuerzo','fin_almuerzo')),
  hora_marcacion  TIMESTAMPTZ NOT NULL,
  metodo          VARCHAR(20) DEFAULT 'manual'
    CHECK (metodo IN ('manual','qr','gafete','biometrico','importacion','api')),
  dispositivo     VARCHAR(80),               -- ID del terminal o dispositivo
  latitud         NUMERIC(10,7),             -- geolocalización opcional
  longitud        NUMERIC(10,7),
  ip_origen       VARCHAR(45),
  notas           TEXT,
  registrado_por  VARCHAR(120),              -- usuario ERP que registró si fue manual
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vista: resumen diario de asistencia
CREATE OR REPLACE VIEW v_asistencia_diaria AS
SELECT
  e.id                    AS empresa_id,
  c.id                    AS colaborador_id,
  c.nombre_completo,
  c.numero_empleado,
  m.fecha,
  MIN(CASE WHEN m.tipo = 'entrada' THEN m.hora_marcacion END)       AS hora_entrada,
  MAX(CASE WHEN m.tipo = 'salida'  THEN m.hora_marcacion END)       AS hora_salida,
  MIN(CASE WHEN m.tipo = 'inicio_almuerzo' THEN m.hora_marcacion END) AS inicio_almuerzo,
  MAX(CASE WHEN m.tipo = 'fin_almuerzo'    THEN m.hora_marcacion END) AS fin_almuerzo,
  EXTRACT(EPOCH FROM (
    MAX(CASE WHEN m.tipo = 'salida' THEN m.hora_marcacion END) -
    MIN(CASE WHEN m.tipo = 'entrada' THEN m.hora_marcacion END)
  ))/3600                 AS horas_brutas,
  COUNT(DISTINCT m.tipo)  AS marcaciones_count
FROM pl_marcaciones m
JOIN pl_colaboradores c ON c.id = m.colaborador_id
JOIN empresas e ON e.id = c.empresa_id
GROUP BY e.id, c.id, c.nombre_completo, c.numero_empleado, m.fecha;

-- -------------------------------------------------------
-- 5. AUSENCIAS Y PERMISOS
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS pl_tipos_ausencia (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre        VARCHAR(80) NOT NULL,
  codigo        VARCHAR(20),
  tipo_base     VARCHAR(30) DEFAULT 'permiso'
    CHECK (tipo_base IN ('vacaciones','incapacidad_ccss','incapacidad_ins',
                         'permiso_con_goce','permiso_sin_goce','maternidad',
                         'paternidad','duelo','otro')),
  descuenta_vacaciones BOOLEAN DEFAULT FALSE,
  remunerado    BOOLEAN DEFAULT TRUE,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Datos iniciales de tipos de ausencia (legislación CR)
INSERT INTO pl_tipos_ausencia (empresa_id, nombre, codigo, tipo_base, descuenta_vacaciones, remunerado)
SELECT DISTINCT
  e.id,
  t.nombre, t.codigo, t.tipo_base, t.descuenta_vacaciones, t.remunerado
FROM empresas e
CROSS JOIN (VALUES
  ('Vacaciones', 'VAC', 'vacaciones', TRUE, TRUE),
  ('Incapacidad CCSS', 'INC-CCSS', 'incapacidad_ccss', FALSE, TRUE),
  ('Incapacidad INS (accidente)', 'INC-INS', 'incapacidad_ins', FALSE, TRUE),
  ('Permiso con goce de salario', 'PCS', 'permiso_con_goce', FALSE, TRUE),
  ('Permiso sin goce de salario', 'PSG', 'permiso_sin_goce', FALSE, FALSE),
  ('Licencia de maternidad', 'MAT', 'maternidad', FALSE, TRUE),
  ('Licencia de paternidad', 'PAT', 'paternidad', FALSE, TRUE),
  ('Permiso por duelo', 'DUE', 'duelo', FALSE, TRUE)
) AS t(nombre, codigo, tipo_base, descuenta_vacaciones, remunerado)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS pl_ausencias (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id  BIGINT NOT NULL REFERENCES pl_colaboradores(id) ON DELETE CASCADE,
  tipo_ausencia_id BIGINT NOT NULL REFERENCES pl_tipos_ausencia(id),
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  dias_habiles    NUMERIC(6,2),              -- calculado
  dias_naturales  INTEGER,                   -- calculado
  remunerada      BOOLEAN DEFAULT TRUE,
  numero_expediente VARCHAR(40),             -- número expediente CCSS si aplica
  porcentaje_pago NUMERIC(5,2) DEFAULT 100, -- % del salario pagado durante ausencia
  aprobado        BOOLEAN DEFAULT FALSE,
  aprobado_por    VARCHAR(120),
  notas           TEXT,
  adjunto_url     TEXT,                      -- URL documento respaldo
  estado          VARCHAR(20) DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','aprobada','rechazada','cancelada')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saldo de vacaciones por colaborador
CREATE TABLE IF NOT EXISTS pl_vacaciones_saldo (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id  BIGINT NOT NULL REFERENCES pl_colaboradores(id) ON DELETE CASCADE,
  periodo_inicio  DATE NOT NULL,
  periodo_fin     DATE NOT NULL,
  dias_generados  NUMERIC(6,2) NOT NULL DEFAULT 0,
  dias_disfrutados NUMERIC(6,2) NOT NULL DEFAULT 0,
  dias_saldo      NUMERIC(6,2) GENERATED ALWAYS AS (dias_generados - dias_disfrutados) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(colaborador_id, periodo_inicio)
);

-- -------------------------------------------------------
-- 6. CONFIGURACIÓN DEDUCCIONES / RUBROS
-- -------------------------------------------------------

-- Escala progresiva impuesto sobre la renta (empleados dependientes CR)
-- Actualizable por año fiscal — datos 2025
CREATE TABLE IF NOT EXISTS pl_escala_renta (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  anio            INTEGER NOT NULL,
  tramo           SMALLINT NOT NULL,        -- 1, 2, 3... orden del tramo
  limite_inferior NUMERIC(14,2) NOT NULL,
  limite_superior NUMERIC(14,2),            -- NULL = sin límite superior
  tasa            NUMERIC(5,4) NOT NULL,    -- 0.10 = 10%
  UNIQUE(empresa_id, anio, tramo)
);

-- Escala renta 2025 (Decreto MH — base mensual CRC)
INSERT INTO pl_escala_renta (empresa_id, anio, tramo, limite_inferior, limite_superior, tasa)
SELECT
  e.id, 2025, t.tramo, t.lim_inf, t.lim_sup, t.tasa
FROM empresas e
CROSS JOIN (VALUES
  (1,        0.00,   929000.00, 0.0000),
  (2,   929000.01,  1362000.00, 0.1000),
  (3,  1362000.01,  2414000.00, 0.1500),
  (4,  2414000.01,  4827000.00, 0.2000),
  (5,  4827000.01,       NULL,  0.2500)
) AS t(tramo, lim_inf, lim_sup, tasa)
ON CONFLICT DO NOTHING;

-- Configuración de deducciones (CCSS y otras — por empresa)
CREATE TABLE IF NOT EXISTS pl_config_deducciones (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- Tasas CCSS vigentes 2025
  tasa_ccss_obrero    NUMERIC(6,4) NOT NULL DEFAULT 0.1067,   -- 10.67%
  tasa_ccss_patronal  NUMERIC(6,4) NOT NULL DEFAULT 0.2667,   -- 26.67%
  tasa_banco_popular  NUMERIC(6,4) NOT NULL DEFAULT 0.0100,   -- 1%
  tasa_asfa           NUMERIC(6,4) NOT NULL DEFAULT 0.0100,   -- 1% Asociación Solidarista (configurable)
  incluir_asfa        BOOLEAN DEFAULT FALSE,
  tasa_fondo_pension  NUMERIC(6,4) NOT NULL DEFAULT 0.0100,   -- OPC pensión complementaria
  incluir_pension_comp BOOLEAN DEFAULT FALSE,
  -- Contabilidad
  cuenta_sueldos      VARCHAR(20),
  cuenta_ccss_obrero  VARCHAR(20),
  cuenta_ccss_patronal VARCHAR(20),
  cuenta_renta        VARCHAR(20),
  cuenta_banco_popular VARCHAR(20),
  cuenta_asfa         VARCHAR(20),
  cuenta_provision_aguinaldo  VARCHAR(20),
  cuenta_provision_vacaciones VARCHAR(20),
  cuenta_provision_cesantia   VARCHAR(20),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id)
);

-- Rubros variables por colaborador (embargos, adelantos, bonos)
CREATE TABLE IF NOT EXISTS pl_rubros_colaborador (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id  BIGINT NOT NULL REFERENCES pl_colaboradores(id) ON DELETE CASCADE,
  tipo            VARCHAR(20) NOT NULL
    CHECK (tipo IN ('embargo','adelanto','bono','comision','hora_extra','otro_ingreso','otro_descuento')),
  descripcion     VARCHAR(120),
  monto           NUMERIC(14,2) NOT NULL,
  recurrente      BOOLEAN DEFAULT FALSE,
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE,
  activo          BOOLEAN DEFAULT TRUE,
  referencia      VARCHAR(80),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- 7. PERÍODOS Y PLANILLA
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS pl_periodos (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          VARCHAR(80) NOT NULL,      -- ej: "Quincena 1 Enero 2026"
  frecuencia      VARCHAR(20) DEFAULT 'mensual'
    CHECK (frecuencia IN ('semanal','quincenal','mensual')),
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  estado          VARCHAR(20) DEFAULT 'abierto'
    CHECK (estado IN ('abierto','calculado','cerrado','contabilizado')),
  asiento_id      BIGINT,                    -- FK asiento contable generado
  total_bruto     NUMERIC(14,2) DEFAULT 0,
  total_deducciones NUMERIC(14,2) DEFAULT 0,
  total_neto      NUMERIC(14,2) DEFAULT 0,
  total_patronal  NUMERIC(14,2) DEFAULT 0,
  notas           TEXT,
  creado_por      VARCHAR(120),
  cerrado_por     VARCHAR(120),
  fecha_cierre    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Líneas de planilla (una por colaborador por período)
CREATE TABLE IF NOT EXISTS pl_planilla_lineas (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  periodo_id          BIGINT NOT NULL REFERENCES pl_periodos(id) ON DELETE CASCADE,
  colaborador_id      BIGINT NOT NULL REFERENCES pl_colaboradores(id),

  -- Salario base del período
  salario_base        NUMERIC(14,2) NOT NULL DEFAULT 0,
  dias_laborados      NUMERIC(6,2)  DEFAULT 30,
  horas_extra_diurnas NUMERIC(6,2)  DEFAULT 0,
  horas_extra_nocturnas NUMERIC(6,2) DEFAULT 0,

  -- Ingresos adicionales
  bonificacion        NUMERIC(14,2) DEFAULT 0,
  comision            NUMERIC(14,2) DEFAULT 0,
  otros_ingresos      NUMERIC(14,2) DEFAULT 0,
  total_bruto         NUMERIC(14,2) DEFAULT 0,   -- calculado

  -- Deducciones obreras (descuentos del salario del empleado)
  ded_ccss_obrero     NUMERIC(14,2) DEFAULT 0,   -- 10.67%
  ded_banco_popular   NUMERIC(14,2) DEFAULT 0,   -- 1%
  ded_renta           NUMERIC(14,2) DEFAULT 0,   -- impuesto renta
  ded_pension_comp    NUMERIC(14,2) DEFAULT 0,   -- OPC opcional
  ded_asfa            NUMERIC(14,2) DEFAULT 0,   -- solidarista opcional
  ded_embargo         NUMERIC(14,2) DEFAULT 0,
  ded_adelanto        NUMERIC(14,2) DEFAULT 0,
  ded_otras           NUMERIC(14,2) DEFAULT 0,
  total_deducciones   NUMERIC(14,2) DEFAULT 0,   -- calculado

  salario_neto        NUMERIC(14,2) DEFAULT 0,   -- calculado

  -- Cargas sociales patronales (gasto empresa)
  ccss_patronal       NUMERIC(14,2) DEFAULT 0,   -- 26.67%
  provision_aguinaldo NUMERIC(14,2) DEFAULT 0,   -- 8.33% (1/12 salario)
  provision_vacaciones NUMERIC(14,2) DEFAULT 0,  -- 4.17% (2 semanas/año)
  provision_cesantia  NUMERIC(14,2) DEFAULT 0,   -- escala CT art 29
  total_costo_empresa NUMERIC(14,2) DEFAULT 0,   -- calculado

  estado              VARCHAR(20) DEFAULT 'borrador'
    CHECK (estado IN ('borrador','calculado','aprobado')),
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(periodo_id, colaborador_id)
);

-- -------------------------------------------------------
-- 8. PRESTACIONES LEGALES
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS pl_prestaciones (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      BIGINT NOT NULL REFERENCES pl_colaboradores(id) ON DELETE CASCADE,
  fecha_calculo       DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_ingreso       DATE NOT NULL,
  fecha_salida        DATE NOT NULL,
  motivo_salida       VARCHAR(50) NOT NULL,

  -- Salario promedio para cálculo (últimos 6 meses)
  salario_promedio_6m NUMERIC(14,2) NOT NULL DEFAULT 0,
  anios_servicio      NUMERIC(6,3)  NOT NULL DEFAULT 0,

  -- Preaviso (art 28 Código de Trabajo)
  dias_preaviso       NUMERIC(6,2)  DEFAULT 0,
  monto_preaviso      NUMERIC(14,2) DEFAULT 0,

  -- Cesantía (art 29 CT — escala por años)
  dias_cesantia       NUMERIC(6,2)  DEFAULT 0,
  monto_cesantia      NUMERIC(14,2) DEFAULT 0,
  tope_cesantia       NUMERIC(14,2) DEFAULT 0,  -- tope: 8 años

  -- Vacaciones proporcionales
  dias_vacaciones_prop NUMERIC(6,2) DEFAULT 0,
  monto_vacaciones    NUMERIC(14,2) DEFAULT 0,

  -- Aguinaldo proporcional (art 1 Ley Aguinaldo)
  meses_aguinaldo     NUMERIC(5,2)  DEFAULT 0,
  monto_aguinaldo     NUMERIC(14,2) DEFAULT 0,

  -- Total
  total_prestaciones  NUMERIC(14,2) DEFAULT 0,  -- calculado

  estado              VARCHAR(20) DEFAULT 'borrador'
    CHECK (estado IN ('borrador','aprobado','pagado','cancelado')),
  aprobado_por        VARCHAR(120),
  asiento_id          BIGINT,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- 9. ACCIONES DE PERSONAL
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS pl_acciones_personal (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      BIGINT NOT NULL REFERENCES pl_colaboradores(id) ON DELETE CASCADE,
  tipo                VARCHAR(40) NOT NULL
    CHECK (tipo IN (
      'ingreso','aumento_salario','traslado_departamento','traslado_cargo',
      'cambio_horario','amonestacion_verbal','amonestacion_escrita',
      'suspension','reintegro','nombramiento','reconocimiento',
      'cambio_contrato','desvinculacion','otro'
    )),
  fecha_efectiva      DATE NOT NULL,
  descripcion         TEXT NOT NULL,

  -- Datos antes del cambio (snapshot)
  departamento_anterior_id BIGINT REFERENCES pl_departamentos(id),
  cargo_anterior_id        BIGINT REFERENCES pl_cargos(id),
  salario_anterior         NUMERIC(14,2),

  -- Datos después del cambio
  departamento_nuevo_id    BIGINT REFERENCES pl_departamentos(id),
  cargo_nuevo_id           BIGINT REFERENCES pl_cargos(id),
  salario_nuevo            NUMERIC(14,2),

  aprobado_por        VARCHAR(120),
  adjunto_url         TEXT,
  estado              VARCHAR(20) DEFAULT 'vigente'
    CHECK (estado IN ('vigente','anulado')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- 10. FUNCIONES AUXILIARES
-- -------------------------------------------------------

-- Calcular impuesto renta mensual CR (escala progresiva)
CREATE OR REPLACE FUNCTION fn_calcular_renta_empleado(
  p_empresa_id    BIGINT,
  p_salario_bruto NUMERIC,
  p_anio          INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
) RETURNS NUMERIC AS $$
DECLARE
  v_renta NUMERIC := 0;
  v_tramo RECORD;
  v_base  NUMERIC;
BEGIN
  FOR v_tramo IN
    SELECT limite_inferior, limite_superior, tasa
    FROM pl_escala_renta
    WHERE empresa_id = p_empresa_id AND anio = p_anio
    ORDER BY tramo
  LOOP
    IF p_salario_bruto <= v_tramo.limite_inferior THEN
      EXIT;
    END IF;
    v_base := LEAST(p_salario_bruto, COALESCE(v_tramo.limite_superior, p_salario_bruto))
              - v_tramo.limite_inferior;
    IF v_base > 0 THEN
      v_renta := v_renta + (v_base * v_tramo.tasa);
    END IF;
  END LOOP;
  RETURN ROUND(v_renta, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- Calcular días de cesantía según art 29 CT Costa Rica
CREATE OR REPLACE FUNCTION fn_dias_cesantia(p_anios NUMERIC) RETURNS NUMERIC AS $$
DECLARE
  v_dias NUMERIC := 0;
  v_anio_completo INTEGER;
BEGIN
  -- Art 29 CT: escala de días por año de servicio (tope 8 años)
  v_anio_completo := LEAST(FLOOR(p_anios)::INTEGER, 8);
  CASE v_anio_completo
    WHEN 0 THEN v_dias := 0;
    WHEN 1 THEN v_dias := 19.5;
    WHEN 2 THEN v_dias := 20;
    WHEN 3 THEN v_dias := 20.5;
    WHEN 4 THEN v_dias := 21;
    WHEN 5 THEN v_dias := 21.24;
    WHEN 6 THEN v_dias := 21.5;
    WHEN 7 THEN v_dias := 22;
    ELSE         v_dias := 22; -- 8+ años: máximo 22 días * 8 = caps en 8 años
  END CASE;
  -- Proporcional si no completó el año
  -- días completos según años trabajados (escala)
  RETURN ROUND(v_dias * LEAST(p_anios, 8), 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Días de preaviso art 28 CT (en días calendario)
CREATE OR REPLACE FUNCTION fn_dias_preaviso(p_anios NUMERIC) RETURNS INTEGER AS $$
BEGIN
  IF p_anios < 0.25 THEN RETURN 0;        -- menos de 3 meses: no aplica
  ELSIF p_anios < 0.5 THEN RETURN 7;      -- 3 a 6 meses: 1 semana
  ELSIF p_anios < 1   THEN RETURN 14;     -- 6m a 1 año: 2 semanas
  ELSE RETURN 30;                          -- más de 1 año: 1 mes
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- -------------------------------------------------------
-- 11. ÍNDICES
-- -------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_pl_colaboradores_empresa ON pl_colaboradores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pl_colaboradores_depto   ON pl_colaboradores(departamento_id);
CREATE INDEX IF NOT EXISTS idx_pl_marcaciones_colab_fecha ON pl_marcaciones(colaborador_id, fecha);
CREATE INDEX IF NOT EXISTS idx_pl_ausencias_colab       ON pl_ausencias(colaborador_id, fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_pl_planilla_lineas_periodo ON pl_planilla_lineas(periodo_id);
CREATE INDEX IF NOT EXISTS idx_pl_acciones_colab        ON pl_acciones_personal(colaborador_id, fecha_efectiva DESC);
CREATE INDEX IF NOT EXISTS idx_pl_colaboradores_qr      ON pl_colaboradores(qr_token);

-- -------------------------------------------------------
-- 12. RLS (Row Level Security)
-- -------------------------------------------------------

ALTER TABLE pl_departamentos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_cargos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_colaboradores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_salarios_hist        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_horarios             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_horarios_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_marcaciones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_tipos_ausencia       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_ausencias            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_vacaciones_saldo     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_escala_renta         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_config_deducciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_rubros_colaborador   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_periodos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_planilla_lineas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_prestaciones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_acciones_personal    ENABLE ROW LEVEL SECURITY;

-- Policies: acceso por empresa_id para service role (backend)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pl_departamentos','pl_cargos','pl_colaboradores','pl_salarios_hist',
    'pl_horarios','pl_horarios_colaborador','pl_marcaciones',
    'pl_tipos_ausencia','pl_ausencias','pl_vacaciones_saldo',
    'pl_escala_renta','pl_config_deducciones','pl_rubros_colaborador',
    'pl_periodos','pl_planilla_lineas','pl_prestaciones','pl_acciones_personal'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'allow_authenticated_' || t, t
    );
  END LOOP;
END $$;
