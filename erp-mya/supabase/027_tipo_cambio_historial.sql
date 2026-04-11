-- Historial de tipos de cambio por empresa.
-- Regla: por empresa/fecha solo puede existir un registro (upsert diario).
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.tipo_cambio_historial (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  fecha date not null,
  compra numeric(14,6) not null check (compra > 0),
  venta numeric(14,6) not null check (venta > 0),
  fuente text not null default 'BCCR',
  raw_data jsonb null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  unique (empresa_id, fecha)
);

create index if not exists idx_tipo_cambio_hist_empresa_fecha
  on public.tipo_cambio_historial (empresa_id, fecha desc);

alter table public.tipo_cambio_historial enable row level security;

drop policy if exists tipo_cambio_hist_select_authenticated on public.tipo_cambio_historial;
create policy tipo_cambio_hist_select_authenticated
on public.tipo_cambio_historial
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'ver')
);

drop policy if exists tipo_cambio_hist_write_authenticated on public.tipo_cambio_historial;
create policy tipo_cambio_hist_write_authenticated
on public.tipo_cambio_historial
for all
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'editar')
)
with check (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'editar')
);

create or replace function public.get_tipo_cambio_historial(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  id bigint,
  fecha date,
  compra numeric,
  venta numeric,
  fuente text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if not public.has_empresa_access(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if not public.has_permission(p_empresa_id, 'mantenimientos', 'ver') then
    raise exception 'No tiene permisos para ver tipo de cambio';
  end if;

  return query
  select
    t.id,
    t.fecha,
    t.compra,
    t.venta,
    t.fuente,
    t.updated_at
  from public.tipo_cambio_historial t
  where t.empresa_id = p_empresa_id
    and (p_fecha_desde is null or t.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
  order by t.fecha desc;
end;
$$;

grant execute on function public.get_tipo_cambio_historial(bigint, date, date) to authenticated;
grant execute on function public.get_tipo_cambio_historial(bigint, date, date) to service_role;

create or replace function public.set_tipo_cambio_dia(
  p_empresa_id bigint,
  p_fecha date,
  p_compra numeric,
  p_venta numeric,
  p_fuente text default 'BCCR',
  p_raw_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existente_id bigint;
begin
  if v_uid is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if p_fecha is null then
    raise exception 'Fecha requerida';
  end if;

  if coalesce(p_compra, 0) <= 0 or coalesce(p_venta, 0) <= 0 then
    raise exception 'Compra y venta deben ser mayores a cero';
  end if;

  if not public.has_empresa_access(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if not public.has_permission(p_empresa_id, 'mantenimientos', 'editar') then
    raise exception 'No tiene permisos para actualizar tipo de cambio';
  end if;

  select t.id
    into v_existente_id
  from public.tipo_cambio_historial t
  where t.empresa_id = p_empresa_id
    and t.fecha = p_fecha
  limit 1;

  insert into public.tipo_cambio_historial (
    empresa_id,
    fecha,
    compra,
    venta,
    fuente,
    raw_data,
    created_by,
    updated_by
  ) values (
    p_empresa_id,
    p_fecha,
    p_compra,
    p_venta,
    coalesce(nullif(btrim(p_fuente), ''), 'BCCR'),
    p_raw_data,
    v_uid,
    v_uid
  )
  on conflict (empresa_id, fecha) do update
  set
    compra = excluded.compra,
    venta = excluded.venta,
    fuente = excluded.fuente,
    raw_data = excluded.raw_data,
    updated_at = now(),
    updated_by = v_uid;

  return jsonb_build_object(
    'ok', true,
    'accion', case when v_existente_id is null then 'insert' else 'update' end,
    'empresa_id', p_empresa_id,
    'fecha', p_fecha,
    'compra', p_compra,
    'venta', p_venta
  );
end;
$$;

grant execute on function public.set_tipo_cambio_dia(bigint, date, numeric, numeric, text, jsonb) to authenticated;
grant execute on function public.set_tipo_cambio_dia(bigint, date, numeric, numeric, text, jsonb) to service_role;

grant select on public.tipo_cambio_historial to authenticated;

commit;

