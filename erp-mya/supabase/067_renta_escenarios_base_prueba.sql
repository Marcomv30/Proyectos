-- Base de escenarios de prueba para impuesto sobre la renta.
-- Permite mantener periodos/valores y copiar escenario a empresa para pruebas.
-- No reemplaza tablas oficiales MH; es catalogo de simulacion/control interno.

begin;

create table if not exists public.impuesto_renta_escenario_base (
  id bigserial primary key,
  codigo text not null unique,
  nombre text not null,
  descripcion text null,
  persona_tipo text not null check (persona_tipo in ('persona_fisica', 'persona_juridica')),
  regimen_codigo text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.impuesto_renta_escenario_periodo (
  id bigserial primary key,
  escenario_id bigint not null references public.impuesto_renta_escenario_base(id) on delete cascade,
  anio integer not null,
  tope_ingreso_bruto numeric(18,2) null,
  tasa_plana numeric(8,4) not null default 30,
  juridica_tope_logica text not null default 'TASA_PLANA' check (juridica_tope_logica in ('ULTIMO_TRAMO', 'TASA_PLANA')),
  ingreso_bruto_prueba numeric(18,2) null,
  nota text null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escenario_id, anio)
);

create table if not exists public.impuesto_renta_escenario_tramo (
  id bigserial primary key,
  periodo_id bigint not null references public.impuesto_renta_escenario_periodo(id) on delete cascade,
  tramo_orden integer not null,
  desde numeric(18,2) not null default 0,
  hasta numeric(18,2) null,
  tasa numeric(8,4) not null,
  descripcion text null,
  activo boolean not null default true,
  unique (periodo_id, tramo_orden)
);

create index if not exists idx_ir_esc_base_tipo_regimen
  on public.impuesto_renta_escenario_base(persona_tipo, regimen_codigo, activo);

create index if not exists idx_ir_esc_periodo_lookup
  on public.impuesto_renta_escenario_periodo(escenario_id, anio, activo);

create index if not exists idx_ir_esc_tramo_lookup
  on public.impuesto_renta_escenario_tramo(periodo_id, tramo_orden, activo);

alter table public.impuesto_renta_escenario_base enable row level security;
alter table public.impuesto_renta_escenario_periodo enable row level security;
alter table public.impuesto_renta_escenario_tramo enable row level security;

drop policy if exists ir_esc_base_select_authenticated on public.impuesto_renta_escenario_base;
create policy ir_esc_base_select_authenticated
on public.impuesto_renta_escenario_base
for select
to authenticated
using (true);

drop policy if exists ir_esc_periodo_select_authenticated on public.impuesto_renta_escenario_periodo;
create policy ir_esc_periodo_select_authenticated
on public.impuesto_renta_escenario_periodo
for select
to authenticated
using (true);

drop policy if exists ir_esc_tramo_select_authenticated on public.impuesto_renta_escenario_tramo;
create policy ir_esc_tramo_select_authenticated
on public.impuesto_renta_escenario_tramo
for select
to authenticated
using (true);

drop policy if exists ir_esc_base_write_superuser on public.impuesto_renta_escenario_base;
create policy ir_esc_base_write_superuser
on public.impuesto_renta_escenario_base
for all
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));

drop policy if exists ir_esc_periodo_write_superuser on public.impuesto_renta_escenario_periodo;
create policy ir_esc_periodo_write_superuser
on public.impuesto_renta_escenario_periodo
for all
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));

drop policy if exists ir_esc_tramo_write_superuser on public.impuesto_renta_escenario_tramo;
create policy ir_esc_tramo_write_superuser
on public.impuesto_renta_escenario_tramo
for all
to authenticated
using (public.is_superuser(auth.uid()))
with check (public.is_superuser(auth.uid()));

create or replace view public.vw_impuesto_renta_escenario_base
with (security_invoker = true)
as
select
  b.id,
  b.codigo,
  b.nombre,
  b.descripcion,
  b.persona_tipo,
  b.regimen_codigo,
  b.activo,
  b.created_at,
  b.updated_at
from public.impuesto_renta_escenario_base b;

create or replace view public.vw_impuesto_renta_escenario_periodo
with (security_invoker = true)
as
select
  p.id,
  p.escenario_id,
  b.codigo as escenario_codigo,
  b.nombre as escenario_nombre,
  p.anio,
  p.tope_ingreso_bruto,
  p.tasa_plana,
  p.juridica_tope_logica,
  p.ingreso_bruto_prueba,
  p.nota,
  p.activo,
  p.created_at,
  p.updated_at
from public.impuesto_renta_escenario_periodo p
join public.impuesto_renta_escenario_base b on b.id = p.escenario_id;

create or replace view public.vw_impuesto_renta_escenario_tramo
with (security_invoker = true)
as
select
  t.id,
  t.periodo_id,
  p.escenario_id,
  b.codigo as escenario_codigo,
  p.anio,
  t.tramo_orden,
  t.desde,
  t.hasta,
  t.tasa,
  t.descripcion,
  t.activo
from public.impuesto_renta_escenario_tramo t
join public.impuesto_renta_escenario_periodo p on p.id = t.periodo_id
join public.impuesto_renta_escenario_base b on b.id = p.escenario_id;

-- Seed escenarios base (3 escenarios solicitados).
insert into public.impuesto_renta_escenario_base (codigo, nombre, descripcion, persona_tipo, regimen_codigo, activo)
values
  ('PF_LUCRATIVA', 'Persona fisica lucrativa', 'Escenario progresivo por tramos para persona fisica', 'persona_fisica', 'PERSONA_FISICA_LUCRATIVA', true),
  ('PJ_PYME_TRAMOS', 'Persona juridica pyme (ingreso <= tope)', 'Escenario juridico por tramos cuando ingreso bruto no supera tope', 'persona_juridica', 'PERSONA_JURIDICA_PYME', true),
  ('PJ_PYME_TOPE_PLANA', 'Persona juridica pyme (ingreso > tope)', 'Escenario juridico con tarifa plana al superar tope de ingreso bruto', 'persona_juridica', 'PERSONA_JURIDICA_PYME', true)
on conflict (codigo) do update
set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  persona_tipo = excluded.persona_tipo,
  regimen_codigo = excluded.regimen_codigo,
  activo = excluded.activo,
  updated_at = now();

insert into public.impuesto_renta_escenario_periodo (
  escenario_id, anio, tope_ingreso_bruto, tasa_plana, juridica_tope_logica, ingreso_bruto_prueba, nota, activo
)
select b.id, 2026, null, 0, 'TASA_PLANA', null, 'Valores 2026 persona fisica (excel)', true
from public.impuesto_renta_escenario_base b
where b.codigo = 'PF_LUCRATIVA'
on conflict (escenario_id, anio) do update
set
  tope_ingreso_bruto = excluded.tope_ingreso_bruto,
  tasa_plana = excluded.tasa_plana,
  juridica_tope_logica = excluded.juridica_tope_logica,
  ingreso_bruto_prueba = excluded.ingreso_bruto_prueba,
  nota = excluded.nota,
  activo = excluded.activo,
  updated_at = now();

insert into public.impuesto_renta_escenario_periodo (
  escenario_id, anio, tope_ingreso_bruto, tasa_plana, juridica_tope_logica, ingreso_bruto_prueba, nota, activo
)
select b.id, 2026, 119174000, 30, 'TASA_PLANA', 98874154, 'Juridica escenario 1: ingreso bruto menor o igual al tope', true
from public.impuesto_renta_escenario_base b
where b.codigo = 'PJ_PYME_TRAMOS'
on conflict (escenario_id, anio) do update
set
  tope_ingreso_bruto = excluded.tope_ingreso_bruto,
  tasa_plana = excluded.tasa_plana,
  juridica_tope_logica = excluded.juridica_tope_logica,
  ingreso_bruto_prueba = excluded.ingreso_bruto_prueba,
  nota = excluded.nota,
  activo = excluded.activo,
  updated_at = now();

insert into public.impuesto_renta_escenario_periodo (
  escenario_id, anio, tope_ingreso_bruto, tasa_plana, juridica_tope_logica, ingreso_bruto_prueba, nota, activo
)
select b.id, 2026, 119174000, 30, 'TASA_PLANA', 145841015, 'Juridica escenario 2: ingreso bruto mayor al tope', true
from public.impuesto_renta_escenario_base b
where b.codigo = 'PJ_PYME_TOPE_PLANA'
on conflict (escenario_id, anio) do update
set
  tope_ingreso_bruto = excluded.tope_ingreso_bruto,
  tasa_plana = excluded.tasa_plana,
  juridica_tope_logica = excluded.juridica_tope_logica,
  ingreso_bruto_prueba = excluded.ingreso_bruto_prueba,
  nota = excluded.nota,
  activo = excluded.activo,
  updated_at = now();

-- Seed tramos PF.
insert into public.impuesto_renta_escenario_tramo (periodo_id, tramo_orden, desde, hasta, tasa, descripcion, activo)
select p.id, x.tramo_orden, x.desde, x.hasta, x.tasa, x.descripcion, true
from public.impuesto_renta_escenario_periodo p
join public.impuesto_renta_escenario_base b on b.id = p.escenario_id
join (
  values
    (1, 0::numeric, 6244000::numeric, 0::numeric, 'Menor a'),
    (2, 6244000::numeric, 8329000::numeric, 10::numeric, 'Exceso de'),
    (3, 8329000::numeric, 10414000::numeric, 15::numeric, 'Exceso de'),
    (4, 10414000::numeric, 20872000::numeric, 20::numeric, 'Exceso de'),
    (5, 20872000::numeric, null::numeric, 25::numeric, 'Sobre el exceso')
) as x(tramo_orden, desde, hasta, tasa, descripcion) on true
where b.codigo = 'PF_LUCRATIVA' and p.anio = 2026
on conflict (periodo_id, tramo_orden) do update
set
  desde = excluded.desde,
  hasta = excluded.hasta,
  tasa = excluded.tasa,
  descripcion = excluded.descripcion,
  activo = excluded.activo;

-- Seed tramos PJ (mismos para escenario 1 y 2).
insert into public.impuesto_renta_escenario_tramo (periodo_id, tramo_orden, desde, hasta, tasa, descripcion, activo)
select p.id, x.tramo_orden, x.desde, x.hasta, x.tasa, x.descripcion, true
from public.impuesto_renta_escenario_periodo p
join public.impuesto_renta_escenario_base b on b.id = p.escenario_id
join (
  values
    (1, 0::numeric, 5621000::numeric, 5::numeric, 'Menor a'),
    (2, 5621000::numeric, 8433000::numeric, 10::numeric, 'Exceso de'),
    (3, 8433000::numeric, 11243000::numeric, 15::numeric, 'Exceso de'),
    (4, 11243000::numeric, null::numeric, 20::numeric, 'Sobre el exceso')
) as x(tramo_orden, desde, hasta, tasa, descripcion) on true
where b.codigo in ('PJ_PYME_TRAMOS', 'PJ_PYME_TOPE_PLANA') and p.anio = 2026
on conflict (periodo_id, tramo_orden) do update
set
  desde = excluded.desde,
  hasta = excluded.hasta,
  tasa = excluded.tasa,
  descripcion = excluded.descripcion,
  activo = excluded.activo;

create or replace function public.copiar_escenario_renta_base_a_empresa(
  p_empresa_id bigint,
  p_periodo_id bigint,
  p_reemplazar boolean default true,
  p_usar_ingreso_bruto_prueba boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_periodo record;
  v_impuestos jsonb;
  v_rows integer := 0;
begin
  if v_uid is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if p_periodo_id is null then
    raise exception 'Periodo de escenario requerido';
  end if;

  if not public.has_empresa_access(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if not public.has_permission(p_empresa_id, 'mantenimientos', 'editar') then
    raise exception 'No tiene permisos para aplicar escenario de renta';
  end if;

  select
    p.id as periodo_id,
    p.anio,
    p.tope_ingreso_bruto,
    p.tasa_plana,
    p.juridica_tope_logica,
    p.ingreso_bruto_prueba,
    b.codigo as escenario_codigo,
    b.nombre as escenario_nombre,
    b.persona_tipo,
    b.regimen_codigo
  into v_periodo
  from public.impuesto_renta_escenario_periodo p
  join public.impuesto_renta_escenario_base b on b.id = p.escenario_id
  where p.id = p_periodo_id
    and p.activo = true
    and b.activo = true
  limit 1;

  if v_periodo.periodo_id is null then
    raise exception 'Periodo de escenario no encontrado o inactivo';
  end if;

  if p_reemplazar then
    delete from public.empresa_impuesto_renta_tramo t
    where t.empresa_id = p_empresa_id
      and t.anio = v_periodo.anio
      and t.regimen_codigo = v_periodo.regimen_codigo;
  end if;

  insert into public.empresa_impuesto_renta_tramo (
    empresa_id,
    anio,
    regimen_codigo,
    persona_tipo,
    periodicidad,
    tramo_orden,
    desde,
    hasta,
    tasa,
    credito_hijo,
    credito_conyuge,
    tope_ingreso_bruto,
    activo
  )
  select
    p_empresa_id,
    v_periodo.anio,
    v_periodo.regimen_codigo,
    v_periodo.persona_tipo,
    'anual',
    t.tramo_orden,
    t.desde,
    t.hasta,
    t.tasa,
    0,
    0,
    v_periodo.tope_ingreso_bruto,
    coalesce(t.activo, true)
  from public.impuesto_renta_escenario_tramo t
  where t.periodo_id = v_periodo.periodo_id
  on conflict (empresa_id, anio, regimen_codigo, tramo_orden) do update
  set
    persona_tipo = excluded.persona_tipo,
    periodicidad = excluded.periodicidad,
    desde = excluded.desde,
    hasta = excluded.hasta,
    tasa = excluded.tasa,
    credito_hijo = excluded.credito_hijo,
    credito_conyuge = excluded.credito_conyuge,
    tope_ingreso_bruto = excluded.tope_ingreso_bruto,
    activo = excluded.activo,
    updated_at = now();

  get diagnostics v_rows = row_count;

  select coalesce(ep.impuestos, public.empresa_parametros_defaults()->'impuestos')
    into v_impuestos
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  if v_impuestos is null then
    v_impuestos := public.empresa_parametros_defaults()->'impuestos';
  end if;

  v_impuestos := jsonb_set(v_impuestos, '{tipo_contribuyente}', to_jsonb(v_periodo.persona_tipo::text), true);
  v_impuestos := jsonb_set(v_impuestos, '{regimen_renta}', to_jsonb(v_periodo.regimen_codigo::text), true);
  v_impuestos := jsonb_set(v_impuestos, '{juridica_tope_logica}', to_jsonb(v_periodo.juridica_tope_logica::text), true);
  v_impuestos := jsonb_set(v_impuestos, '{impuesto_renta}', to_jsonb(v_periodo.tasa_plana), true);

  if p_usar_ingreso_bruto_prueba and v_periodo.ingreso_bruto_prueba is not null then
    v_impuestos := jsonb_set(v_impuestos, '{ingreso_bruto_anual}', to_jsonb(v_periodo.ingreso_bruto_prueba), true);
  end if;

  insert into public.empresa_parametros (
    empresa_id,
    impuestos,
    updated_by
  ) values (
    p_empresa_id,
    v_impuestos,
    v_uid
  )
  on conflict (empresa_id) do update
  set
    impuestos = excluded.impuestos,
    version = empresa_parametros.version + 1,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return jsonb_build_object(
    'ok', true,
    'empresa_id', p_empresa_id,
    'escenario_codigo', v_periodo.escenario_codigo,
    'escenario_nombre', v_periodo.escenario_nombre,
    'anio', v_periodo.anio,
    'regimen_codigo', v_periodo.regimen_codigo,
    'tramos_copiados', v_rows,
    'tope_ingreso_bruto', v_periodo.tope_ingreso_bruto,
    'juridica_tope_logica', v_periodo.juridica_tope_logica,
    'ingreso_bruto_anual', case when p_usar_ingreso_bruto_prueba then v_periodo.ingreso_bruto_prueba else null end
  );
end;
$$;

grant select on table public.impuesto_renta_escenario_base to authenticated;
grant select on table public.impuesto_renta_escenario_periodo to authenticated;
grant select on table public.impuesto_renta_escenario_tramo to authenticated;
grant select, insert, update, delete on table public.impuesto_renta_escenario_base to authenticated;
grant select, insert, update, delete on table public.impuesto_renta_escenario_periodo to authenticated;
grant select, insert, update, delete on table public.impuesto_renta_escenario_tramo to authenticated;
grant select on public.vw_impuesto_renta_escenario_base to authenticated;
grant select on public.vw_impuesto_renta_escenario_periodo to authenticated;
grant select on public.vw_impuesto_renta_escenario_tramo to authenticated;
grant execute on function public.copiar_escenario_renta_base_a_empresa(bigint, bigint, boolean, boolean) to authenticated;
grant execute on function public.copiar_escenario_renta_base_a_empresa(bigint, bigint, boolean, boolean) to service_role;

commit;
