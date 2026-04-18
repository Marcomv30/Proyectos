-- ============================================================
-- DATOS DE PRUEBA — MÓDULO PLANILLA MYA ERP
-- Empresa ID: 1  (ajustar si su empresa_id es diferente)
-- Legislación Costa Rica — nombres y datos ficticios
-- ============================================================

DO $$
DECLARE
  v_emp   BIGINT := 4;   -- empresa_id real

  -- IDs departamentos
  d_adm   BIGINT;
  d_cont  BIGINT;
  d_ventas BIGINT;
  d_bodega BIGINT;
  d_campo BIGINT;

  -- IDs cargos
  c_gerente   BIGINT;
  c_contador  BIGINT;
  c_asistente BIGINT;
  c_vendedor  BIGINT;
  c_bodeguero BIGINT;
  c_operario  BIGINT;
  c_chofer    BIGINT;

  -- IDs colaboradores
  col1 BIGINT; col2 BIGINT; col3 BIGINT; col4 BIGINT; col5 BIGINT;
  col6 BIGINT; col7 BIGINT; col8 BIGINT; col9 BIGINT; col10 BIGINT;

  -- ID período
  per1 BIGINT;
BEGIN

-- -------------------------------------------------------
-- 1. HORARIO ESTÁNDAR
-- -------------------------------------------------------
INSERT INTO pl_horarios (empresa_id, nombre, descripcion, hora_entrada, hora_salida, minutos_almuerzo, dias_laborales, activo)
VALUES (v_emp, 'Jornada Ordinaria 7-4', 'Lunes a viernes 7:00am a 4:00pm', '07:00', '16:00', 60, '{1,2,3,4,5}', TRUE)
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- 2. DEPARTAMENTOS
-- -------------------------------------------------------
INSERT INTO pl_departamentos (empresa_id, nombre, codigo, tipo, activo)
VALUES
  (v_emp, 'Administración',       'ADM',    'oficina',  TRUE),
  (v_emp, 'Contabilidad',         'CONT',   'oficina',  TRUE),
  (v_emp, 'Ventas',               'VEN',    'ventas',   TRUE),
  (v_emp, 'Bodega y Logística',   'BOD',    'logistica',TRUE),
  (v_emp, 'Operaciones Campo',    'CAMPO',  'campo',    TRUE)
ON CONFLICT DO NOTHING;

SELECT id INTO d_adm    FROM pl_departamentos WHERE empresa_id = v_emp AND codigo = 'ADM';
SELECT id INTO d_cont   FROM pl_departamentos WHERE empresa_id = v_emp AND codigo = 'CONT';
SELECT id INTO d_ventas FROM pl_departamentos WHERE empresa_id = v_emp AND codigo = 'VEN';
SELECT id INTO d_bodega FROM pl_departamentos WHERE empresa_id = v_emp AND codigo = 'BOD';
SELECT id INTO d_campo  FROM pl_departamentos WHERE empresa_id = v_emp AND codigo = 'CAMPO';

-- -------------------------------------------------------
-- 3. CARGOS
-- -------------------------------------------------------
INSERT INTO pl_cargos (empresa_id, departamento_id, nombre, codigo, categoria, salario_base_ref, tipo_trabajo, activo)
VALUES
  (v_emp, d_adm,    'Gerente General',          'GG',    'gerencial',   2800000, 'oficina', TRUE),
  (v_emp, d_cont,   'Contador',                 'CONT1', 'profesional', 1400000, 'oficina', TRUE),
  (v_emp, d_adm,    'Asistente Administrativo', 'ASIST', 'tecnico',      700000, 'oficina', TRUE),
  (v_emp, d_ventas, 'Ejecutivo de Ventas',      'VEND1', 'tecnico',      750000, 'mixto',   TRUE),
  (v_emp, d_bodega, 'Bodeguero',                'BOD1',  'operario',     600000, 'mixto',   TRUE),
  (v_emp, d_campo,  'Operario de Campo',        'OPC1',  'operario',     580000, 'campo',   TRUE),
  (v_emp, d_bodega, 'Chofer de Reparto',        'CHO1',  'tecnico',      650000, 'mixto',   TRUE)
ON CONFLICT DO NOTHING;

SELECT id INTO c_gerente   FROM pl_cargos WHERE empresa_id = v_emp AND codigo = 'GG';
SELECT id INTO c_contador  FROM pl_cargos WHERE empresa_id = v_emp AND codigo = 'CONT1';
SELECT id INTO c_asistente FROM pl_cargos WHERE empresa_id = v_emp AND codigo = 'ASIST';
SELECT id INTO c_vendedor  FROM pl_cargos WHERE empresa_id = v_emp AND codigo = 'VEND1';
SELECT id INTO c_bodeguero FROM pl_cargos WHERE empresa_id = v_emp AND codigo = 'BOD1';
SELECT id INTO c_operario  FROM pl_cargos WHERE empresa_id = v_emp AND codigo = 'OPC1';
SELECT id INTO c_chofer    FROM pl_cargos WHERE empresa_id = v_emp AND codigo = 'CHO1';

-- -------------------------------------------------------
-- 4. CONFIGURACIÓN DEDUCCIONES (tasas CR 2025)
-- -------------------------------------------------------
INSERT INTO pl_config_deducciones (empresa_id, tasa_ccss_obrero, tasa_ccss_patronal, tasa_banco_popular, incluir_asfa, incluir_pension_comp)
VALUES (v_emp, 0.1067, 0.2667, 0.0100, FALSE, FALSE)
ON CONFLICT (empresa_id) DO NOTHING;

-- -------------------------------------------------------
-- 5. COLABORADORES (10 ficticios)
-- -------------------------------------------------------
INSERT INTO pl_colaboradores (
  empresa_id, numero_empleado, tipo_identificacion, identificacion, nombre_completo,
  primer_apellido, segundo_apellido, nombre, fecha_nacimiento, sexo, estado_civil,
  nacionalidad, email, telefono, provincia, canton, distrito,
  departamento_id, cargo_id, fecha_ingreso, tipo_contrato, tipo_salario,
  salario, jornada, horas_semana, banco, tipo_cuenta, numero_cuenta,
  numero_asegurado, regimen_pensiones, apto_campo, estado
)
VALUES
  -- 1. Gerente General
  (v_emp,'EMP001','cedula','1-0845-0321','Carlos Mora Jiménez',
   'Mora','Jiménez','Carlos','1978-03-15','masculino','casado',
   'costarricense','carlos.mora@empresa.cr','8801-2345','San José','Central','El Carmen',
   d_adm, c_gerente,'2018-01-15','indefinido','mensual',
   2800000,'ordinaria',48,'BAC San José','corriente','001234567890',
   '109234567','ccss',FALSE,'activo'),

  -- 2. Contadora
  (v_emp,'EMP002','cedula','2-0567-0890','Ana Vargas Solano',
   'Vargas','Solano','Ana','1985-07-22','femenino','soltero',
   'costarricense','ana.vargas@empresa.cr','8902-3456','Alajuela','Central','La Garita',
   d_cont, c_contador,'2019-03-01','indefinido','mensual',
   1400000,'ordinaria',48,'Banco Nacional','ahorros','002345678901',
   '205678901','ccss',FALSE,'activo'),
  -- (estado_civil usa valor neutro 'soltero' para ambos géneros)

  -- 3. Asistente Administrativa
  (v_emp,'EMP003','cedula','3-0456-0234','María Ramírez Castro',
   'Ramírez','Castro','María','1993-11-08','femenino','soltero',
   'costarricense','maria.ramirez@empresa.cr','8753-4567','Cartago','Central','Occidental',
   d_adm, c_asistente,'2020-06-15','indefinido','mensual',
   700000,'ordinaria',48,'Banco de Costa Rica','corriente','003456789012',
   '309456789','ccss',FALSE,'activo'),

  -- 4. Ejecutivo de Ventas 1
  (v_emp,'EMP004','cedula','1-1234-0567','Luis Hernández Pérez',
   'Hernández','Pérez','Luis','1990-04-30','masculino','casado',
   'costarricense','luis.hernandez@empresa.cr','8654-5678','San José','Escazú','San Rafael',
   d_ventas, c_vendedor,'2020-09-01','indefinido','mensual',
   750000,'ordinaria',48,'BAC San José','ahorros','004567890123',
   '112345678','ccss',FALSE,'activo'),

  -- 5. Ejecutiva de Ventas 2
  (v_emp,'EMP005','cedula','4-0789-0123','Sofía Quesada Blanco',
   'Quesada','Blanco','Sofía','1995-09-12','femenino','soltero',
   'costarricense','sofia.quesada@empresa.cr','8855-6789','Heredia','Central','Mercedes',
   d_ventas, c_vendedor,'2021-02-01','indefinido','mensual',
   750000,'ordinaria',48,'Banco Popular','sinpe','88556789',
   '412345678','ccss',FALSE,'activo'),

  -- 6. Bodeguero
  (v_emp,'EMP006','cedula','6-0321-0789','Roberto Ureña Fallas',
   'Ureña','Fallas','Roberto','1988-01-25','masculino','casado',
   'costarricense','roberto.urena@empresa.cr','8706-7890','Guanacaste','Liberia','Central',
   d_bodega, c_bodeguero,'2019-11-01','indefinido','mensual',
   600000,'ordinaria',48,'Banco Nacional','ahorros','005678901234',
   '612345678','ccss',FALSE,'activo'),

  -- 7. Chofer
  (v_emp,'EMP007','cedula','5-0654-0456','Javier Solís Montoya',
   'Solís','Montoya','Javier','1982-06-18','masculino','casado',
   'costarricense','javier.solis@empresa.cr','8607-8901','Puntarenas','Central','El Roble',
   d_bodega, c_chofer,'2020-03-15','indefinido','mensual',
   650000,'ordinaria',48,'Banco de Costa Rica','corriente','006789012345',
   '523456789','ccss',TRUE,'activo'),

  -- 8. Operario de Campo 1
  (v_emp,'EMP008','cedula','7-0987-0321','Diego Badilla Chaves',
   'Badilla','Chaves','Diego','1992-08-03','masculino','soltero',
   'costarricense','diego.badilla@empresa.cr','8508-9012','Limón','Central','Cieneguita',
   d_campo, c_operario,'2021-07-01','indefinido','mensual',
   580000,'ordinaria',48,'Banco Popular','sinpe','85089012',
   '734567890','ccss',TRUE,'activo'),

  -- 9. Operaria de Campo 2
  (v_emp,'EMP009','cedula','8-0123-0654','Lucía Mora Vega',
   'Mora','Vega','Lucía','1997-12-20','femenino','soltero',
   'costarricense','lucia.mora@empresa.cr','8409-0123','San José','Desamparados','Central',
   d_campo, c_operario,'2022-01-15','indefinido','mensual',
   580000,'ordinaria',48,'Banco Nacional','ahorros','007890123456',
   '845678901','ccss',TRUE,'activo'),

  -- 10. DIMEX (trabajador extranjero)
  (v_emp,'EMP010','dimex','700123456789','Pedro González Fuentes',
   'González','Fuentes','Pedro','1986-05-10','masculino','casado',
   'nicaragüense','pedro.gonzalez@empresa.cr','8310-1234','Alajuela','San Carlos','Ciudad Quesada',
   d_campo, c_operario,'2022-06-01','indefinido','mensual',
   580000,'ordinaria',48,'Banco Popular','sinpe','83101234',
   NULL,'ccss',TRUE,'activo')
ON CONFLICT (empresa_id, identificacion) DO NOTHING;

-- Obtener IDs de colaboradores
SELECT id INTO col1  FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP001';
SELECT id INTO col2  FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP002';
SELECT id INTO col3  FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP003';
SELECT id INTO col4  FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP004';
SELECT id INTO col5  FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP005';
SELECT id INTO col6  FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP006';
SELECT id INTO col7  FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP007';
SELECT id INTO col8  FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP008';
SELECT id INTO col9  FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP009';
SELECT id INTO col10 FROM pl_colaboradores WHERE empresa_id = v_emp AND numero_empleado = 'EMP010';

-- -------------------------------------------------------
-- 6. HORARIOS ASIGNADOS
-- -------------------------------------------------------
INSERT INTO pl_horarios_colaborador (empresa_id, colaborador_id, horario_id, fecha_inicio)
SELECT v_emp, c.id,
  (SELECT id FROM pl_horarios WHERE empresa_id = v_emp LIMIT 1),
  '2024-01-01'
FROM pl_colaboradores c
WHERE c.empresa_id = v_emp
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- 7. HISTORIAL SALARIAL
-- -------------------------------------------------------
INSERT INTO pl_salarios_hist (empresa_id, colaborador_id, fecha_vigencia, salario_anterior, salario_nuevo, motivo, registrado_por)
VALUES
  (v_emp, col1, '2018-01-15', 0,       2800000, 'ingreso',        'Sistema'),
  (v_emp, col1, '2022-01-01', 2500000, 2800000, 'aumento_merito', 'Gerencia'),
  (v_emp, col2, '2019-03-01', 0,       1200000, 'ingreso',        'Sistema'),
  (v_emp, col2, '2023-01-01', 1200000, 1400000, 'aumento_ley',    'RRHH'),
  (v_emp, col3, '2020-06-15', 0,       650000,  'ingreso',        'Sistema'),
  (v_emp, col3, '2024-01-01', 650000,  700000,  'aumento_ley',    'RRHH'),
  (v_emp, col4, '2020-09-01', 0,       700000,  'ingreso',        'Sistema'),
  (v_emp, col4, '2023-06-01', 700000,  750000,  'aumento_merito', 'Ventas'),
  (v_emp, col5, '2021-02-01', 0,       750000,  'ingreso',        'Sistema'),
  (v_emp, col6, '2019-11-01', 0,       560000,  'ingreso',        'Sistema'),
  (v_emp, col6, '2023-01-01', 560000,  600000,  'aumento_ley',    'RRHH'),
  (v_emp, col7, '2020-03-15', 0,       600000,  'ingreso',        'Sistema'),
  (v_emp, col7, '2024-01-01', 600000,  650000,  'aumento_ley',    'RRHH'),
  (v_emp, col8, '2021-07-01', 0,       580000,  'ingreso',        'Sistema'),
  (v_emp, col9, '2022-01-15', 0,       580000,  'ingreso',        'Sistema'),
  (v_emp, col10,'2022-06-01', 0,       580000,  'ingreso',        'Sistema');

-- -------------------------------------------------------
-- 8. MARCACIONES DE ASISTENCIA (últimos 5 días hábiles)
-- -------------------------------------------------------
-- Insertar marcaciones para una semana de trabajo
INSERT INTO pl_marcaciones (empresa_id, colaborador_id, fecha, tipo, hora_marcacion, metodo)
SELECT
  v_emp,
  c.id,
  d.fecha,
  m.tipo,
  (d.fecha::TIMESTAMP AT TIME ZONE 'America/Costa_Rica' + m.offset_min * INTERVAL '1 minute') AT TIME ZONE 'America/Costa_Rica',
  m.metodo
FROM pl_colaboradores c
CROSS JOIN (VALUES
  ('2026-04-07'::DATE),
  ('2026-04-08'::DATE),
  ('2026-04-09'::DATE),
  ('2026-04-10'::DATE)
) AS d(fecha)
CROSS JOIN (VALUES
  ('entrada',       420,  'qr'),     -- 7:00am
  ('inicio_almuerzo',720, 'manual'), -- 12:00pm
  ('fin_almuerzo',  780,  'manual'), -- 1:00pm
  ('salida',        960,  'qr')      -- 4:00pm
) AS m(tipo, offset_min, metodo)
WHERE c.empresa_id = v_emp
  AND c.estado = 'activo'
ON CONFLICT DO NOTHING;

-- Simular que col3 llegó tarde el martes y col8 no entró el miércoles
-- (ya no insertar salida para col8 en 2026-04-09 — queda incompleto)

-- -------------------------------------------------------
-- 9. AUSENCIAS REGISTRADAS
-- -------------------------------------------------------
INSERT INTO pl_ausencias (empresa_id, colaborador_id, tipo_ausencia_id, fecha_inicio, fecha_fin, dias_naturales, dias_habiles, remunerada, porcentaje_pago, estado, aprobado, aprobado_por, notas)
SELECT
  v_emp, col3,
  (SELECT id FROM pl_tipos_ausencia WHERE empresa_id = v_emp AND codigo = 'VAC' LIMIT 1),
  '2026-04-14', '2026-04-18', 5, 5, TRUE, 100, 'aprobada', TRUE, 'Carlos Mora', 'Vacaciones período 2025-2026'
WHERE col3 IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO pl_ausencias (empresa_id, colaborador_id, tipo_ausencia_id, fecha_inicio, fecha_fin, dias_naturales, dias_habiles, remunerada, porcentaje_pago, numero_expediente, estado, aprobado, aprobado_por, notas)
SELECT
  v_emp, col8,
  (SELECT id FROM pl_tipos_ausencia WHERE empresa_id = v_emp AND codigo = 'INC-CCSS' LIMIT 1),
  '2026-04-02', '2026-04-06', 5, 5, TRUE, 100, 'EXP-2026-04-0892', 'aprobada', TRUE, 'Ana Vargas', 'Incapacidad por gripe — CCSS'
WHERE col8 IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO pl_ausencias (empresa_id, colaborador_id, tipo_ausencia_id, fecha_inicio, fecha_fin, dias_naturales, dias_habiles, remunerada, porcentaje_pago, estado, aprobado, notas)
SELECT
  v_emp, col5,
  (SELECT id FROM pl_tipos_ausencia WHERE empresa_id = v_emp AND codigo = 'PCS' LIMIT 1),
  '2026-04-17', '2026-04-17', 1, 1, TRUE, 100, 'pendiente', FALSE, 'Cita médica'
WHERE col5 IS NOT NULL
ON CONFLICT DO NOTHING;

-- Saldos de vacaciones
INSERT INTO pl_vacaciones_saldo (empresa_id, colaborador_id, periodo_inicio, periodo_fin, dias_generados, dias_disfrutados)
SELECT v_emp, c.id, '2025-01-01', '2025-12-31',
  CASE
    WHEN c.numero_empleado IN ('EMP001','EMP002','EMP006') THEN 14.00
    WHEN c.numero_empleado IN ('EMP003','EMP004','EMP007') THEN 14.00
    ELSE 14.00
  END,
  CASE WHEN c.numero_empleado = 'EMP003' THEN 5.00 ELSE 0.00 END
FROM pl_colaboradores c WHERE c.empresa_id = v_emp
ON CONFLICT (colaborador_id, periodo_inicio) DO NOTHING;

-- -------------------------------------------------------
-- 10. PERÍODO DE PLANILLA — MARZO 2026 (calculado)
-- -------------------------------------------------------
INSERT INTO pl_periodos (empresa_id, nombre, frecuencia, fecha_inicio, fecha_fin, estado, total_bruto, total_deducciones, total_neto, total_patronal, creado_por)
VALUES (v_emp, 'Planilla Mensual Marzo 2026', 'mensual', '2026-03-01', '2026-03-31', 'cerrado', 0, 0, 0, 0, 'Sistema')
ON CONFLICT DO NOTHING;

SELECT id INTO per1 FROM pl_periodos WHERE empresa_id = v_emp AND nombre = 'Planilla Mensual Marzo 2026';

-- Líneas de planilla (cálculos reales CR)
INSERT INTO pl_planilla_lineas (
  empresa_id, periodo_id, colaborador_id,
  salario_base, dias_laborados,
  horas_extra_diurnas, horas_extra_nocturnas,
  bonificacion, comision, otros_ingresos, total_bruto,
  ded_ccss_obrero, ded_banco_popular, ded_renta,
  ded_pension_comp, ded_asfa, ded_embargo, ded_adelanto, ded_otras,
  total_deducciones, salario_neto,
  ccss_patronal, provision_aguinaldo, provision_vacaciones, provision_cesantia,
  total_costo_empresa, estado
)
SELECT
  v_emp, per1, c.id,
  c.salario, 30,
  0, 0, 0, 0, 0,
  c.salario AS total_bruto,
  -- CCSS obrero 10.67%
  ROUND(c.salario * 0.1067, 0),
  -- Banco Popular 1%
  ROUND(c.salario * 0.01, 0),
  -- Renta (escala progresiva aproximada)
  CASE
    WHEN c.salario <= 929000  THEN 0
    WHEN c.salario <= 1362000 THEN ROUND((c.salario - 929000) * 0.10, 0)
    WHEN c.salario <= 2414000 THEN ROUND(43300 + (c.salario - 1362000) * 0.15, 0)
    WHEN c.salario <= 4827000 THEN ROUND(43300 + 157800 + (c.salario - 2414000) * 0.20, 0)
    ELSE ROUND(43300 + 157800 + 482600 + (c.salario - 4827000) * 0.25, 0)
  END,
  0, 0, 0, 0, 0,
  -- total_deducciones
  ROUND(c.salario * 0.1067, 0) + ROUND(c.salario * 0.01, 0) +
  CASE
    WHEN c.salario <= 929000  THEN 0
    WHEN c.salario <= 1362000 THEN ROUND((c.salario - 929000) * 0.10, 0)
    WHEN c.salario <= 2414000 THEN ROUND(43300 + (c.salario - 1362000) * 0.15, 0)
    WHEN c.salario <= 4827000 THEN ROUND(43300 + 157800 + (c.salario - 2414000) * 0.20, 0)
    ELSE ROUND(43300 + 157800 + 482600 + (c.salario - 4827000) * 0.25, 0)
  END,
  -- salario_neto
  c.salario - (
    ROUND(c.salario * 0.1067, 0) + ROUND(c.salario * 0.01, 0) +
    CASE
      WHEN c.salario <= 929000  THEN 0
      WHEN c.salario <= 1362000 THEN ROUND((c.salario - 929000) * 0.10, 0)
      WHEN c.salario <= 2414000 THEN ROUND(43300 + (c.salario - 1362000) * 0.15, 0)
      WHEN c.salario <= 4827000 THEN ROUND(43300 + 157800 + (c.salario - 2414000) * 0.20, 0)
      ELSE ROUND(43300 + 157800 + 482600 + (c.salario - 4827000) * 0.25, 0)
    END
  ),
  -- ccss_patronal 26.67%
  ROUND(c.salario * 0.2667, 0),
  -- provision_aguinaldo (1/12)
  ROUND(c.salario / 12, 0),
  -- provision_vacaciones 4.17%
  ROUND(c.salario * 2 / 48, 0),
  -- provision_cesantia
  ROUND((c.salario / 30) * 22 / 12, 0),
  -- total_costo_empresa
  c.salario + ROUND(c.salario * 0.2667, 0) + ROUND(c.salario / 12, 0) + ROUND(c.salario * 2 / 48, 0) + ROUND((c.salario / 30) * 22 / 12, 0),
  'aprobado'
FROM pl_colaboradores c
WHERE c.empresa_id = v_emp AND c.estado = 'activo'
ON CONFLICT (periodo_id, colaborador_id) DO NOTHING;

-- Actualizar totales del período
UPDATE pl_periodos
SET
  total_bruto       = (SELECT SUM(total_bruto)         FROM pl_planilla_lineas WHERE periodo_id = per1),
  total_deducciones = (SELECT SUM(total_deducciones)    FROM pl_planilla_lineas WHERE periodo_id = per1),
  total_neto        = (SELECT SUM(salario_neto)         FROM pl_planilla_lineas WHERE periodo_id = per1),
  total_patronal    = (SELECT SUM(ccss_patronal + provision_aguinaldo + provision_vacaciones + provision_cesantia) FROM pl_planilla_lineas WHERE periodo_id = per1),
  updated_at        = NOW()
WHERE id = per1;

-- -------------------------------------------------------
-- 11. PERÍODO ABRIL 2026 (abierto — para probar cálculo)
-- -------------------------------------------------------
INSERT INTO pl_periodos (empresa_id, nombre, frecuencia, fecha_inicio, fecha_fin, estado, creado_por)
VALUES (v_emp, 'Planilla Mensual Abril 2026', 'mensual', '2026-04-01', '2026-04-30', 'abierto', 'Sistema')
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- 12. ACCIONES DE PERSONAL
-- -------------------------------------------------------
INSERT INTO pl_acciones_personal (empresa_id, colaborador_id, tipo, fecha_efectiva, descripcion, salario_anterior, salario_nuevo, aprobado_por, estado)
VALUES
  (v_emp, col1, 'ingreso',        '2018-01-15', 'Ingreso a la empresa como Gerente General', NULL, 2800000, 'Junta Directiva', 'vigente'),
  (v_emp, col2, 'ingreso',        '2019-03-01', 'Ingreso como Contador/a', NULL, 1400000, 'Gerencia', 'vigente'),
  (v_emp, col3, 'ingreso',        '2020-06-15', 'Ingreso como Asistente Administrativa', NULL, 700000, 'Gerencia', 'vigente'),
  (v_emp, col1, 'aumento_salario','2022-01-01', 'Aumento por desempeño sobresaliente año 2021', 2500000, 2800000, 'Junta Directiva', 'vigente'),
  (v_emp, col2, 'aumento_salario','2023-01-01', 'Ajuste por aumento salario mínimo MTSS', 1200000, 1400000, 'Gerencia', 'vigente'),
  (v_emp, col3, 'aumento_salario','2024-01-01', 'Ajuste por aumento salario mínimo MTSS', 650000, 700000, 'Gerencia', 'vigente'),
  (v_emp, col6, 'amonestacion_escrita','2023-08-10', 'Llegadas tardías reiteradas en el mes de julio. Tercera amonestación del período.', NULL, NULL, 'Supervisor Bodega', 'vigente'),
  (v_emp, col4, 'nombramiento',   '2023-06-01', 'Nombramiento como Coordinador de Zona Norte — responsabilidades ampliadas', NULL, NULL, 'Gerencia Ventas', 'vigente'),
  (v_emp, col7, 'aumento_salario','2024-01-01', 'Ajuste por aumento salario mínimo MTSS', 600000, 650000, 'Gerencia', 'vigente'),
  (v_emp, col8, 'ingreso',        '2021-07-01', 'Ingreso como Operario de Campo', NULL, 580000, 'Supervisor Campo', 'vigente'),
  (v_emp, col5, 'reconocimiento', '2025-12-15', 'Reconocimiento — Mejor vendedor del año 2025. Alcanzó 132% de la meta anual.', NULL, NULL, 'Gerencia Ventas', 'vigente');

-- -------------------------------------------------------
-- 13. LIQUIDACIÓN DE EJEMPLO (colaborador ya salió)
-- -------------------------------------------------------
-- Registrar una prestación histórica de un ex-colaborador no incluido en los activos
-- (Solo para que el módulo de prestaciones muestre datos)
INSERT INTO pl_colaboradores (
  empresa_id, numero_empleado, tipo_identificacion, identificacion, nombre_completo,
  primer_apellido, segundo_apellido, nombre, fecha_nacimiento, sexo, estado_civil,
  nacionalidad, email, telefono, provincia, canton,
  departamento_id, cargo_id, fecha_ingreso, fecha_salida, motivo_salida,
  tipo_contrato, tipo_salario, salario, jornada, estado
)
VALUES (
  v_emp,'EMP000','cedula','9-0222-0111','José Picado Arroyo',
  'Picado','Arroyo','José','1975-05-12','masculino','divorciado',
  'costarricense','jose.picado@excolaborador.cr','8201-0000','San José','Alajuelita',
  d_ventas, c_vendedor, '2015-03-01','2025-12-31','renuncia',
  'indefinido','mensual',900000,'ordinaria','inactivo'
)
ON CONFLICT (empresa_id, identificacion) DO NOTHING;

INSERT INTO pl_prestaciones (
  empresa_id, colaborador_id, fecha_calculo, fecha_ingreso, fecha_salida, motivo_salida,
  salario_promedio_6m, anios_servicio, dias_preaviso, monto_preaviso,
  dias_cesantia, monto_cesantia, tope_cesantia,
  dias_vacaciones_prop, monto_vacaciones, meses_aguinaldo, monto_aguinaldo,
  total_prestaciones, estado, aprobado_por, notas
)
SELECT
  v_emp, c.id, '2025-12-31', '2015-03-01', '2025-12-31', 'renuncia',
  900000, 10.84,
  0, 0,
  -- Cesantía: renuncia aplica con tope 8 años (aplica en CR para renuncia en contratos indefinidos + más de 3 meses)
  -- Art. 29 reformado: renuncia voluntaria también da derecho a auxilio
  176, ROUND(176 * (900000/30)),  ROUND(22 * 8 * (900000/30)),
  7.0, ROUND(7 * (900000/30)),
  11.5, ROUND((11.5/12) * 900000),
  ROUND(176 * (900000/30)) + ROUND(7 * (900000/30)) + ROUND((11.5/12) * 900000),
  'pagado', 'Carlos Mora', 'Renuncia con preaviso. Liquidación pagada el 15/01/2026.'
FROM pl_colaboradores c
WHERE c.empresa_id = v_emp AND c.numero_empleado = 'EMP000'
ON CONFLICT DO NOTHING;

RAISE NOTICE '✅ Datos de prueba planilla insertados correctamente para empresa_id = %', v_emp;
RAISE NOTICE '   Departamentos: 5 | Cargos: 7 | Colaboradores: 11 (10 activos + 1 inactivo)';
RAISE NOTICE '   Marcaciones: ~4 días × 10 colaboradores × 4 tipos = ~160 registros';
RAISE NOTICE '   Períodos: Marzo 2026 (cerrado) + Abril 2026 (abierto)';
RAISE NOTICE '   Ausencias: 3 | Acciones personal: 11 | Prestaciones: 1';

END $$;
