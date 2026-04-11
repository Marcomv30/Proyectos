-- CXC Fase 1
-- Documentos por cobrar, aplicaciones (abonos/notas) y consultas de cartera/aging.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.cxc_documentos (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  tercero_id bigint not null references public.terceros(id) on delete restrict,
  tipo_documento text not null,
  numero_documento text not null,
  referencia text null,
  fecha_emision date not null,
  fecha_vencimiento date null,
  moneda text not null default 'CRC',
  tipo_cambio numeric(18,6) not null default 1,
  monto_original numeric(18,2) not null,
  monto_pendiente numeric(18,2) not null,
  estado text not null default 'pendiente',
  descripcion text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  check (tipo_documento in ('FACTURA', 'NOTA_DEBITO', 'NOTA_CREDITO', 'SALDO_INICIAL', 'AJUSTE')),
  check (moneda in ('CRC', 'USD')),
  check (monto_original >= 0),
  check (monto_pendiente >= 0),
  check (tipo_cambio > 0),
  check (estado in ('pendiente', 'parcial', 'pagado', 'anulado')),
  unique (empresa_id, tipo_documento, numero_documento)
);

create index if not exists idx_cxc_documentos_lookup
  on public.cxc_documentos(empresa_id, tercero_id, estado, fecha_vencimiento, fecha_emision);

create table if not exists public.cxc_aplicaciones (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  documento_id bigint not null references public.cxc_documentos(id) on delete cascade,
  fecha_aplicacion date not null default current_date,
  tipo_aplicacion text not null default 'ABONO',
  monto numeric(18,2) not null,
  referencia text null,
  observaciones text null,
  estado text not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  check (tipo_aplicacion in ('ABONO', 'NOTA_CREDITO', 'AJUSTE')),
  check (monto > 0),
  check (estado in ('activo', 'anulado'))
);

create index if not exists idx_cxc_aplicaciones_lookup
  on public.cxc_aplicaciones(empresa_id, documento_id, fecha_aplicacion, estado);

create or replace function public.tg_set_updated_at_cxc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.recalcular_cxc_documento(
  p_documento_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.cxc_documentos%rowtype;
  v_total_aplicado numeric(18,2) := 0;
  v_pendiente numeric(18,2) := 0;
  v_estado text;
begin
  if p_documento_id is null then
    return;
  end if;

  select * into v_doc
  from public.cxc_documentos d
  where d.id = p_documento_id
  limit 1;

  if not found then
    return;
  end if;

  if v_doc.estado = 'anulado' then
    return;
  end if;

  select coalesce(sum(a.monto), 0)
    into v_total_aplicado
  from public.cxc_aplicaciones a
  where a.documento_id = p_documento_id
    and a.estado = 'activo';

  v_pendiente := greatest(round(v_doc.monto_original - v_total_aplicado, 2), 0);

  if v_pendiente <= 0 then
    v_estado := 'pagado';
  elsif v_pendiente < v_doc.monto_original then
    v_estado := 'parcial';
  else
    v_estado := 'pendiente';
  end if;

  update public.cxc_documentos
  set
    monto_pendiente = v_pendiente,
    estado = v_estado,
    updated_at = now()
  where id = p_documento_id;
end;
$$;

create or replace function public.trg_cxc_documentos_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.monto_pendiente is null then
    new.monto_pendiente := new.monto_original;
  end if;

  if new.estado is null or btrim(new.estado) = '' then
    if coalesce(new.monto_pendiente, 0) <= 0 then
      new.estado := 'pagado';
    elsif coalesce(new.monto_pendiente, 0) < coalesce(new.monto_original, 0) then
      new.estado := 'parcial';
    else
      new.estado := 'pendiente';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.trg_cxc_aplicaciones_recalcular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_id bigint;
begin
  v_doc_id := coalesce(new.documento_id, old.documento_id);
  perform public.recalcular_cxc_documento(v_doc_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_cxc_documentos_updated_at on public.cxc_documentos;
create trigger trg_cxc_documentos_updated_at
before update on public.cxc_documentos
for each row
execute function public.tg_set_updated_at_cxc();

drop trigger if exists trg_cxc_aplicaciones_updated_at on public.cxc_aplicaciones;
create trigger trg_cxc_aplicaciones_updated_at
before update on public.cxc_aplicaciones
for each row
execute function public.tg_set_updated_at_cxc();

drop trigger if exists trg_cxc_documentos_defaults on public.cxc_documentos;
create trigger trg_cxc_documentos_defaults
before insert or update on public.cxc_documentos
for each row
execute function public.trg_cxc_documentos_defaults();

drop trigger if exists trg_cxc_aplicaciones_recalcular on public.cxc_aplicaciones;
create trigger trg_cxc_aplicaciones_recalcular
after insert or update or delete on public.cxc_aplicaciones
for each row
execute function public.trg_cxc_aplicaciones_recalcular();

alter table public.cxc_documentos enable row level security;
alter table public.cxc_aplicaciones enable row level security;

drop policy if exists cxc_documentos_select_authenticated on public.cxc_documentos;
create policy cxc_documentos_select_authenticated
on public.cxc_documentos
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists cxc_documentos_write_authenticated on public.cxc_documentos;
create policy cxc_documentos_write_authenticated
on public.cxc_documentos
for all
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'editar')
)
with check (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'editar')
);

drop policy if exists cxc_aplicaciones_select_authenticated on public.cxc_aplicaciones;
create policy cxc_aplicaciones_select_authenticated
on public.cxc_aplicaciones
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists cxc_aplicaciones_write_authenticated on public.cxc_aplicaciones;
create policy cxc_aplicaciones_write_authenticated
on public.cxc_aplicaciones
for all
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'editar')
)
with check (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'editar')
);

create or replace function public.get_cxc_documentos_cartera(
  p_empresa_id bigint,
  p_fecha_corte date default current_date,
  p_tercero_id bigint default null,
  p_moneda text default null
)
returns table (
  documento_id bigint,
  tercero_id bigint,
  tercero_nombre text,
  tercero_identificacion text,
  tipo_documento text,
  numero_documento text,
  fecha_emision date,
  fecha_vencimiento date,
  moneda text,
  monto_original numeric,
  monto_pendiente numeric,
  dias_vencidos integer,
  bucket text,
  estado text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fecha_corte date := coalesce(p_fecha_corte, current_date);
  v_moneda text := case when p_moneda is null or btrim(p_moneda) = '' then null else upper(p_moneda) end;
begin
  if auth.uid() is null and current_user not in ('postgres', 'service_role') then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not public.has_empresa_access(p_empresa_id)
  then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not (
       public.has_permission(p_empresa_id, 'cxc', 'ver')
       or public.has_permission(p_empresa_id, 'cxc', 'editar')
     )
  then
    raise exception 'No tiene permisos para ver CXC';
  end if;

  return query
  with base as (
    select
      d.id as documento_id,
      d.tercero_id,
      t.razon_social as tercero_nombre,
      coalesce(t.identificacion, '') as tercero_identificacion,
      d.tipo_documento,
      d.numero_documento,
      d.fecha_emision,
      d.fecha_vencimiento,
      d.moneda,
      d.monto_original,
      d.monto_pendiente,
      d.estado,
      case
        when d.fecha_vencimiento is null then 0
        else greatest((v_fecha_corte - d.fecha_vencimiento), 0)
      end::integer as dias_vencidos
    from public.cxc_documentos d
    join public.terceros t on t.id = d.tercero_id
    where d.empresa_id = p_empresa_id
      and d.estado <> 'anulado'
      and d.fecha_emision <= v_fecha_corte
      and d.monto_pendiente > 0
      and (p_tercero_id is null or d.tercero_id = p_tercero_id)
      and (v_moneda is null or d.moneda = v_moneda)
  )
  select
    b.documento_id,
    b.tercero_id,
    b.tercero_nombre,
    b.tercero_identificacion,
    b.tipo_documento,
    b.numero_documento,
    b.fecha_emision,
    b.fecha_vencimiento,
    b.moneda,
    b.monto_original,
    b.monto_pendiente,
    b.dias_vencidos,
    case
      when b.dias_vencidos <= 0 then 'AL_DIA'
      when b.dias_vencidos between 1 and 30 then '01_30'
      when b.dias_vencidos between 31 and 60 then '31_60'
      when b.dias_vencidos between 61 and 90 then '61_90'
      else '91_MAS'
    end::text as bucket,
    b.estado
  from base b
  order by b.tercero_nombre, b.fecha_vencimiento nulls last, b.numero_documento;
end;
$$;

create or replace function public.get_cxc_cartera_resumen(
  p_empresa_id bigint,
  p_fecha_corte date default current_date,
  p_moneda text default null
)
returns table (
  tercero_id bigint,
  tercero_nombre text,
  tercero_identificacion text,
  moneda text,
  docs integer,
  total_pendiente numeric,
  al_dia numeric,
  d01_30 numeric,
  d31_60 numeric,
  d61_90 numeric,
  d91_mas numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with d as (
    select *
    from public.get_cxc_documentos_cartera(
      p_empresa_id => p_empresa_id,
      p_fecha_corte => p_fecha_corte,
      p_tercero_id => null,
      p_moneda => p_moneda
    )
  )
  select
    d.tercero_id,
    min(d.tercero_nombre)::text as tercero_nombre,
    min(d.tercero_identificacion)::text as tercero_identificacion,
    d.moneda,
    count(*)::integer as docs,
    round(coalesce(sum(d.monto_pendiente), 0), 2)::numeric as total_pendiente,
    round(coalesce(sum(case when d.bucket = 'AL_DIA' then d.monto_pendiente else 0 end), 0), 2)::numeric as al_dia,
    round(coalesce(sum(case when d.bucket = '01_30' then d.monto_pendiente else 0 end), 0), 2)::numeric as d01_30,
    round(coalesce(sum(case when d.bucket = '31_60' then d.monto_pendiente else 0 end), 0), 2)::numeric as d31_60,
    round(coalesce(sum(case when d.bucket = '61_90' then d.monto_pendiente else 0 end), 0), 2)::numeric as d61_90,
    round(coalesce(sum(case when d.bucket = '91_MAS' then d.monto_pendiente else 0 end), 0), 2)::numeric as d91_mas
  from d
  group by d.tercero_id, d.moneda
  order by min(d.tercero_nombre), d.moneda;
end;
$$;

create or replace view public.vw_cxc_documentos as
select
  d.id,
  d.empresa_id,
  d.tercero_id,
  t.razon_social as tercero_nombre,
  t.identificacion as tercero_identificacion,
  d.tipo_documento,
  d.numero_documento,
  d.referencia,
  d.fecha_emision,
  d.fecha_vencimiento,
  d.moneda,
  d.tipo_cambio,
  d.monto_original,
  d.monto_pendiente,
  d.estado,
  d.descripcion,
  d.created_at,
  d.updated_at
from public.cxc_documentos d
join public.terceros t on t.id = d.tercero_id;

create or replace view public.vw_cxc_aplicaciones as
select
  a.id,
  a.empresa_id,
  a.documento_id,
  d.numero_documento,
  d.tipo_documento,
  a.fecha_aplicacion,
  a.tipo_aplicacion,
  a.monto,
  a.referencia,
  a.observaciones,
  a.estado,
  a.created_at,
  a.updated_at
from public.cxc_aplicaciones a
join public.cxc_documentos d on d.id = a.documento_id;

grant execute on function public.recalcular_cxc_documento(bigint) to authenticated;
grant execute on function public.recalcular_cxc_documento(bigint) to service_role;
grant execute on function public.get_cxc_documentos_cartera(bigint, date, bigint, text) to authenticated;
grant execute on function public.get_cxc_documentos_cartera(bigint, date, bigint, text) to service_role;
grant execute on function public.get_cxc_cartera_resumen(bigint, date, text) to authenticated;
grant execute on function public.get_cxc_cartera_resumen(bigint, date, text) to service_role;

grant select, insert, update, delete on table public.cxc_documentos to authenticated;
grant select, insert, update, delete on table public.cxc_aplicaciones to authenticated;
grant select on table public.cxc_documentos to service_role;
grant select on table public.cxc_aplicaciones to service_role;

grant select, insert, update, delete on public.vw_cxc_documentos to authenticated;
grant select, insert, update, delete on public.vw_cxc_aplicaciones to authenticated;
grant select on public.vw_cxc_documentos to service_role;
grant select on public.vw_cxc_aplicaciones to service_role;

commit;
