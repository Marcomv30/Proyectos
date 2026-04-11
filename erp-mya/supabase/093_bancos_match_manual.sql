begin;

create table if not exists public.bancos_conciliacion_matches (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  periodo_id bigint not null references public.bancos_conciliacion_periodos(id) on delete cascade,
  estado_linea_id bigint not null references public.bancos_estado_importado(id) on delete cascade,
  auxiliar_id bigint not null references public.recaudacion_auxiliar_banco(id) on delete cascade,
  observacion text null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  unique (estado_linea_id),
  unique (auxiliar_id)
);

create index if not exists idx_bancos_conciliacion_matches_lookup
  on public.bancos_conciliacion_matches(empresa_id, periodo_id, created_at desc, id desc);

alter table public.bancos_conciliacion_matches enable row level security;

drop policy if exists bancos_conciliacion_matches_select on public.bancos_conciliacion_matches;
create policy bancos_conciliacion_matches_select
on public.bancos_conciliacion_matches
for select
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'ver'));

drop policy if exists bancos_conciliacion_matches_write on public.bancos_conciliacion_matches;
create policy bancos_conciliacion_matches_write
on public.bancos_conciliacion_matches
for all
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'editar'))
with check (public.has_permission(empresa_id, 'bancos', 'editar'));

grant select, insert, delete on public.bancos_conciliacion_matches to authenticated;

create or replace view public.vw_bancos_conciliacion_matches as
select
  m.id,
  m.empresa_id,
  m.periodo_id,
  m.estado_linea_id,
  m.auxiliar_id,
  m.observacion,
  m.created_at,
  e.fecha_movimiento as banco_fecha,
  e.descripcion as banco_descripcion,
  e.referencia as banco_referencia,
  e.debito,
  e.credito,
  e.saldo,
  a.fecha_movimiento as erp_fecha,
  a.pago_id,
  a.monto as erp_monto,
  a.referencia as erp_referencia,
  t.razon_social as tercero_nombre
from public.bancos_conciliacion_matches m
join public.bancos_estado_importado e on e.id = m.estado_linea_id
join public.recaudacion_auxiliar_banco a on a.id = m.auxiliar_id
join public.recaudacion_pagos p on p.id = a.pago_id
join public.terceros t on t.id = p.tercero_id;

grant select on public.vw_bancos_conciliacion_matches to authenticated, service_role;

create or replace function public.marcar_bancos_match_manual(
  p_periodo_id bigint,
  p_estado_linea_id bigint,
  p_auxiliar_id bigint,
  p_observacion text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_periodo public.bancos_conciliacion_periodos%rowtype;
  v_estado public.bancos_estado_importado%rowtype;
  v_aux public.recaudacion_auxiliar_banco%rowtype;
  v_id bigint;
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;
  if p_periodo_id is null or p_estado_linea_id is null or p_auxiliar_id is null then
    raise exception 'periodo_linea_auxiliar_requeridos';
  end if;

  select * into v_periodo
  from public.bancos_conciliacion_periodos
  where id = p_periodo_id
  for update;

  if not found then
    raise exception 'periodo_no_encontrado';
  end if;
  if v_periodo.estado = 'cerrado' then
    raise exception 'periodo_cerrado_no_permite_match';
  end if;

  select * into v_estado
  from public.bancos_estado_importado
  where id = p_estado_linea_id
    and periodo_id = p_periodo_id
  for update;

  if not found then
    raise exception 'linea_estado_no_encontrada';
  end if;
  if v_estado.conciliado then
    raise exception 'linea_estado_ya_conciliada';
  end if;

  select * into v_aux
  from public.recaudacion_auxiliar_banco
  where id = p_auxiliar_id
  for update;

  if not found then
    raise exception 'movimiento_auxiliar_no_encontrado';
  end if;
  if v_aux.estado_conciliacion <> 'pendiente' then
    raise exception 'movimiento_auxiliar_no_pendiente';
  end if;

  insert into public.bancos_conciliacion_matches(
    empresa_id, periodo_id, estado_linea_id, auxiliar_id, observacion, created_by
  )
  values (
    v_periodo.empresa_id, p_periodo_id, p_estado_linea_id, p_auxiliar_id, p_observacion, v_user
  )
  returning id into v_id;

  update public.bancos_estado_importado
  set conciliado = true, updated_at = now(), updated_by = v_user
  where id = p_estado_linea_id;

  perform public.marcar_recaudacion_conciliada(v_aux.pago_id, coalesce(p_observacion, 'Match manual con estado bancario'));

  return v_id;
end;
$$;

create or replace function public.deshacer_bancos_match_manual(
  p_match_id bigint,
  p_observacion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_match public.bancos_conciliacion_matches%rowtype;
  v_aux public.recaudacion_auxiliar_banco%rowtype;
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;
  if p_match_id is null then
    raise exception 'match_requerido';
  end if;

  select * into v_match
  from public.bancos_conciliacion_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match_no_encontrado';
  end if;

  select * into v_aux
  from public.recaudacion_auxiliar_banco
  where id = v_match.auxiliar_id;

  update public.bancos_estado_importado
  set conciliado = false, updated_at = now(), updated_by = v_user
  where id = v_match.estado_linea_id;

  if found and v_aux.estado_conciliacion = 'conciliado' then
    perform public.deshacer_recaudacion_conciliacion(v_aux.pago_id, coalesce(p_observacion, 'Match manual revertido'));
  end if;

  delete from public.bancos_conciliacion_matches
  where id = p_match_id;
end;
$$;

grant execute on function public.marcar_bancos_match_manual(bigint, bigint, bigint, text) to authenticated, service_role;
grant execute on function public.deshacer_bancos_match_manual(bigint, text) to authenticated, service_role;

commit;
