-- Seed base del plan de cuentas (idempotente).
-- Objetivo: poblar public.plan_cuentas_base con cuentas iniciales si no existen,
-- y actualizar definiciones existentes por codigo.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create temporary table tmp_plan_cuentas_seed (
  codigo text primary key,
  nombre text not null,
  nivel integer not null,
  tipo text not null,
  naturaleza text not null,
  acepta_movimiento boolean not null,
  padre_codigo text null
) on commit drop;

insert into tmp_plan_cuentas_seed (
  codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, padre_codigo
) values
  ('01', 'ACTIVO', 1, 'ACTIVO', 'DEBITO', false, null),
  ('0101', 'ACTIVO CIRCULANTE', 2, 'ACTIVO', 'DEBITO', false, '01'),
  ('0101-01', 'CAJA Y BANCOS', 3, 'ACTIVO', 'DEBITO', false, '0101'),
  ('0101-01-001', 'CAJA', 4, 'ACTIVO', 'DEBITO', false, '0101-01'),
  ('0101-01-001-001', 'CAJA GENERAL COLONES', 5, 'ACTIVO', 'DEBITO', true, '0101-01-001'),
  ('0101-01-001-002', 'CAJA GENERAL DOLARES', 5, 'ACTIVO', 'DEBITO', true, '0101-01-001'),
  ('0101-01-002', 'BANCOS', 4, 'ACTIVO', 'DEBITO', false, '0101-01'),
  ('0101-01-002-001', 'BANCO BCR COLONES', 5, 'ACTIVO', 'DEBITO', true, '0101-01-002'),
  ('0101-01-002-002', 'BANCO BCR DOLARES', 5, 'ACTIVO', 'DEBITO', true, '0101-01-002'),
  ('0101-02', 'CUENTAS POR COBRAR', 3, 'ACTIVO', 'DEBITO', false, '0101'),
  ('0101-02-001', 'CLIENTES', 4, 'ACTIVO', 'DEBITO', false, '0101-02'),
  ('0101-02-001-001', 'CLIENTES NACIONALES', 5, 'ACTIVO', 'DEBITO', true, '0101-02-001'),
  ('0101-02-001-002', 'CLIENTES EXTRANJEROS', 5, 'ACTIVO', 'DEBITO', true, '0101-02-001'),

  ('02', 'PASIVO', 1, 'PASIVO', 'CREDITO', false, null),
  ('0201', 'PASIVO CORRIENTE', 2, 'PASIVO', 'CREDITO', false, '02'),
  ('0201-01', 'CUENTAS POR PAGAR', 3, 'PASIVO', 'CREDITO', false, '0201'),
  ('0201-01-001', 'PROVEEDORES', 4, 'PASIVO', 'CREDITO', false, '0201-01'),
  ('0201-01-001-001', 'PROVEEDORES NACIONALES', 5, 'PASIVO', 'CREDITO', true, '0201-01-001'),
  ('0201-01-001-002', 'PROVEEDORES EXTRANJEROS', 5, 'PASIVO', 'CREDITO', true, '0201-01-001'),

  ('03', 'CAPITAL', 1, 'CAPITAL', 'CREDITO', false, null),
  ('0301', 'CAPITAL SOCIAL', 2, 'CAPITAL', 'CREDITO', false, '03'),
  ('0301-01', 'APORTES DE SOCIOS', 3, 'CAPITAL', 'CREDITO', true, '0301'),
  ('0302', 'RESULTADOS ACUMULADOS', 2, 'CAPITAL', 'CREDITO', true, '03'),

  ('04', 'INGRESOS', 1, 'INGRESO', 'CREDITO', false, null),
  ('0401', 'INGRESOS OPERATIVOS', 2, 'INGRESO', 'CREDITO', false, '04'),
  ('0401-01', 'VENTAS', 3, 'INGRESO', 'CREDITO', false, '0401'),
  ('0401-01-001', 'VENTAS DE MERCADERIAS', 4, 'INGRESO', 'CREDITO', false, '0401-01'),
  ('0401-01-001-001', 'VENTAS NACIONALES', 5, 'INGRESO', 'CREDITO', true, '0401-01-001'),

  ('05', 'COSTOS', 1, 'COSTO', 'DEBITO', false, null),
  ('0501', 'COSTOS DE VENTAS', 2, 'COSTO', 'DEBITO', false, '05'),
  ('0501-01', 'COMPRAS', 3, 'COSTO', 'DEBITO', false, '0501'),
  ('0501-01-001', 'COMPRAS LOCALES', 4, 'COSTO', 'DEBITO', false, '0501-01'),
  ('0501-01-001-001', 'MERCADERIA NACIONAL', 5, 'COSTO', 'DEBITO', true, '0501-01-001'),

  ('06', 'GASTOS', 1, 'GASTO', 'DEBITO', false, null),
  ('0601', 'GASTOS OPERATIVOS', 2, 'GASTO', 'DEBITO', false, '06'),
  ('0601-01', 'GASTOS DE ADMINISTRACION', 3, 'GASTO', 'DEBITO', false, '0601'),
  ('0601-01-001', 'GASTOS DE PERSONAL', 4, 'GASTO', 'DEBITO', false, '0601-01'),
  ('0601-01-001-001', 'SUELDOS Y SALARIOS', 5, 'GASTO', 'DEBITO', true, '0601-01-001'),
  ('0601-01-001-002', 'CARGAS SOCIALES', 5, 'GASTO', 'DEBITO', true, '0601-01-001');

-- 1) Update por codigo (si ya existe).
update public.plan_cuentas_base b
set
  nombre = s.nombre,
  nivel = s.nivel,
  tipo = s.tipo,
  naturaleza = s.naturaleza,
  acepta_movimiento = s.acepta_movimiento,
  activo = true
from tmp_plan_cuentas_seed s
where b.codigo = s.codigo;

-- 2) Insert de codigos faltantes.
insert into public.plan_cuentas_base (
  codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, activo
)
select
  s.codigo, s.nombre, s.nivel, s.tipo, s.naturaleza, s.acepta_movimiento, true
from tmp_plan_cuentas_seed s
where not exists (
  select 1
  from public.plan_cuentas_base b
  where b.codigo = s.codigo
);

-- 3) Resolver padre_id por padre_codigo.
update public.plan_cuentas_base b
set padre_id = p.id
from tmp_plan_cuentas_seed s
left join public.plan_cuentas_base p on p.codigo = s.padre_codigo
where b.codigo = s.codigo
  and b.padre_id is distinct from p.id;

commit;

-- Verificacion sugerida:
-- select codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, padre_id
-- from public.plan_cuentas_base
-- order by codigo;
