-- Seed minimo del plan de cuentas base.
-- Objetivo: dejar solo estructura raiz estandar para luego importar catalogo completo desde Excel.
-- No reemplaza 017_seed_plan_cuentas_base.sql; es una alternativa liviana.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create temporary table tmp_plan_cuentas_seed_minimo (
  codigo text primary key,
  nombre text not null,
  nivel integer not null,
  tipo text not null,
  naturaleza text not null,
  acepta_movimiento boolean not null,
  padre_codigo text null
) on commit drop;

insert into tmp_plan_cuentas_seed_minimo (
  codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, padre_codigo
) values
  ('01', 'ACTIVO', 1, 'ACTIVO', 'DEBITO', false, null),
  ('02', 'PASIVO', 1, 'PASIVO', 'CREDITO', false, null),
  ('03', 'CAPITAL', 1, 'CAPITAL', 'CREDITO', false, null),
  ('04', 'INGRESOS', 1, 'INGRESO', 'CREDITO', false, null),
  ('05', 'COSTOS', 1, 'COSTO', 'DEBITO', false, null),
  ('06', 'GASTOS', 1, 'GASTO', 'DEBITO', false, null);

-- 1) Update por codigo (si ya existe).
update public.plan_cuentas_base b
set
  nombre = s.nombre,
  nivel = s.nivel,
  tipo = s.tipo,
  naturaleza = s.naturaleza,
  acepta_movimiento = s.acepta_movimiento,
  activo = true
from tmp_plan_cuentas_seed_minimo s
where b.codigo = s.codigo;

-- 2) Insert de codigos faltantes.
insert into public.plan_cuentas_base (
  codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, activo
)
select
  s.codigo, s.nombre, s.nivel, s.tipo, s.naturaleza, s.acepta_movimiento, true
from tmp_plan_cuentas_seed_minimo s
where not exists (
  select 1
  from public.plan_cuentas_base b
  where b.codigo = s.codigo
);

-- 3) Resolver padre_id (en este seed todos son raiz).
update public.plan_cuentas_base b
set padre_id = null
from tmp_plan_cuentas_seed_minimo s
where b.codigo = s.codigo
  and b.padre_id is not null;

commit;

