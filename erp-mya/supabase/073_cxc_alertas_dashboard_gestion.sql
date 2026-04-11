-- CXC Fase 1.3
-- Alertas de vencimiento, dashboard ejecutivo y seguimiento de cobro.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.cxc_gestion_cobro (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  tercero_id bigint not null references public.terceros(id) on delete restrict,
  documento_id bigint null references public.cxc_documentos(id) on delete set null,
  fecha_gestion timestamptz not null default now(),
  canal text not null default 'LLAMADA',
  resultado text not null default 'PENDIENTE',
  compromiso_fecha date null,
  compromiso_monto numeric(18,2) null,
  observacion text null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  check (canal in ('LLAMADA', 'WHATSAPP', 'CORREO', 'VISITA', 'ACUERDO_PAGO', 'OTRO')),
  check (resultado in ('PENDIENTE', 'PROMESA_PAGO', 'NO_LOCALIZADO', 'RECHAZO', 'PAGO_REALIZADO', 'OTRO')),
  check (compromiso_monto is null or compromiso_monto >= 0)
);

create index if not exists idx_cxc_gestion_lookup
  on public.cxc_gestion_cobro(empresa_id, tercero_id, fecha_gestion desc, id desc);

alter table public.cxc_gestion_cobro enable row level security;

drop policy if exists cxc_gestion_select_authenticated on public.cxc_gestion_cobro;
create policy cxc_gestion_select_authenticated
on public.cxc_gestion_cobro
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists cxc_gestion_write_authenticated on public.cxc_gestion_cobro;
create policy cxc_gestion_write_authenticated
on public.cxc_gestion_cobro
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

create or replace function public.get_cxc_alertas_vencimiento(
  p_empresa_id bigint,
  p_fecha_corte date default current_date,
  p_dias_desde integer default 1,
  p_dias_hasta integer default 99999,
  p_tercero_id bigint default null,
  p_moneda text default null
)
returns table (
  documento_id bigint,
  tercero_id bigint,
  tercero_nombre text,
  tercero_identificacion text,
  numero_documento text,
  tipo_documento text,
  fecha_vencimiento date,
  dias_vencidos integer,
  moneda text,
  monto_pendiente numeric,
  bucket text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde integer := greatest(coalesce(p_dias_desde, 1), 1);
  v_hasta integer := greatest(coalesce(p_dias_hasta, 99999), v_desde);
begin
  return query
  select
    d.documento_id,
    d.tercero_id,
    d.tercero_nombre,
    d.tercero_identificacion,
    d.numero_documento,
    d.tipo_documento,
    d.fecha_vencimiento,
    d.dias_vencidos,
    d.moneda,
    d.monto_pendiente,
    d.bucket
  from public.get_cxc_documentos_cartera(
    p_empresa_id => p_empresa_id,
    p_fecha_corte => p_fecha_corte,
    p_tercero_id => p_tercero_id,
    p_moneda => p_moneda
  ) d
  where d.dias_vencidos between v_desde and v_hasta
  order by d.dias_vencidos desc, d.monto_pendiente desc, d.tercero_nombre;
end;
$$;

create or replace function public.get_cxc_dashboard_resumen(
  p_empresa_id bigint,
  p_fecha_corte date default current_date,
  p_moneda text default null
)
returns table (
  moneda text,
  cartera_total numeric,
  cartera_vencida numeric,
  porcentaje_morosidad numeric,
  docs_total integer,
  docs_vencidos integer,
  clientes_con_saldo integer
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
    d.moneda,
    round(coalesce(sum(d.monto_pendiente), 0), 2)::numeric as cartera_total,
    round(coalesce(sum(case when d.dias_vencidos > 0 then d.monto_pendiente else 0 end), 0), 2)::numeric as cartera_vencida,
    round(
      case when coalesce(sum(d.monto_pendiente), 0) <= 0 then 0
      else (coalesce(sum(case when d.dias_vencidos > 0 then d.monto_pendiente else 0 end), 0) / sum(d.monto_pendiente)) * 100.0
      end
    , 2)::numeric as porcentaje_morosidad,
    count(*)::integer as docs_total,
    count(*) filter (where d.dias_vencidos > 0)::integer as docs_vencidos,
    count(distinct d.tercero_id)::integer as clientes_con_saldo
  from d
  group by d.moneda
  order by d.moneda;
end;
$$;

create or replace function public.get_cxc_dashboard_top_deudores(
  p_empresa_id bigint,
  p_fecha_corte date default current_date,
  p_moneda text default null,
  p_limite integer default 10
)
returns table (
  tercero_id bigint,
  tercero_nombre text,
  tercero_identificacion text,
  moneda text,
  total_pendiente numeric,
  total_vencido numeric,
  docs integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limite integer := greatest(coalesce(p_limite, 10), 1);
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
    round(coalesce(sum(d.monto_pendiente), 0), 2)::numeric as total_pendiente,
    round(coalesce(sum(case when d.dias_vencidos > 0 then d.monto_pendiente else 0 end), 0), 2)::numeric as total_vencido,
    count(*)::integer as docs
  from d
  group by d.tercero_id, d.moneda
  order by sum(d.monto_pendiente) desc, min(d.tercero_nombre)
  limit v_limite;
end;
$$;

create or replace function public.registrar_cxc_gestion_cobro(
  p_empresa_id bigint,
  p_tercero_id bigint,
  p_documento_id bigint default null,
  p_canal text default 'LLAMADA',
  p_resultado text default 'PENDIENTE',
  p_compromiso_fecha date default null,
  p_compromiso_monto numeric default null,
  p_observacion text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id bigint;
begin
  if v_user is null and current_user not in ('postgres', 'service_role') then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if p_tercero_id is null then
    raise exception 'Cliente requerido';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not public.has_empresa_access(p_empresa_id)
  then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not public.has_permission(p_empresa_id, 'cxc', 'editar')
  then
    raise exception 'No tiene permisos para registrar gestion CXC';
  end if;

  if p_documento_id is not null then
    if not exists (
      select 1
      from public.cxc_documentos d
      where d.id = p_documento_id
        and d.empresa_id = p_empresa_id
        and d.tercero_id = p_tercero_id
    ) then
      raise exception 'Documento no corresponde a empresa/cliente';
    end if;
  end if;

  insert into public.cxc_gestion_cobro (
    empresa_id,
    tercero_id,
    documento_id,
    canal,
    resultado,
    compromiso_fecha,
    compromiso_monto,
    observacion,
    created_by
  ) values (
    p_empresa_id,
    p_tercero_id,
    p_documento_id,
    upper(coalesce(nullif(btrim(p_canal), ''), 'LLAMADA')),
    upper(coalesce(nullif(btrim(p_resultado), ''), 'PENDIENTE')),
    p_compromiso_fecha,
    p_compromiso_monto,
    nullif(btrim(coalesce(p_observacion, '')), ''),
    v_user
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace view public.vw_cxc_gestion_cobro as
select
  g.id,
  g.empresa_id,
  g.tercero_id,
  t.razon_social as tercero_nombre,
  t.identificacion as tercero_identificacion,
  g.documento_id,
  d.numero_documento,
  g.fecha_gestion,
  g.canal,
  g.resultado,
  g.compromiso_fecha,
  g.compromiso_monto,
  g.observacion,
  g.created_at,
  g.created_by
from public.cxc_gestion_cobro g
join public.terceros t on t.id = g.tercero_id
left join public.cxc_documentos d on d.id = g.documento_id;

grant execute on function public.get_cxc_alertas_vencimiento(bigint, date, integer, integer, bigint, text) to authenticated;
grant execute on function public.get_cxc_alertas_vencimiento(bigint, date, integer, integer, bigint, text) to service_role;
grant execute on function public.get_cxc_dashboard_resumen(bigint, date, text) to authenticated;
grant execute on function public.get_cxc_dashboard_resumen(bigint, date, text) to service_role;
grant execute on function public.get_cxc_dashboard_top_deudores(bigint, date, text, integer) to authenticated;
grant execute on function public.get_cxc_dashboard_top_deudores(bigint, date, text, integer) to service_role;
grant execute on function public.registrar_cxc_gestion_cobro(bigint, bigint, bigint, text, text, date, numeric, text) to authenticated;
grant execute on function public.registrar_cxc_gestion_cobro(bigint, bigint, bigint, text, text, date, numeric, text) to service_role;

grant select on table public.cxc_gestion_cobro to authenticated;
grant select on table public.cxc_gestion_cobro to service_role;
grant select on public.vw_cxc_gestion_cobro to authenticated;
grant select on public.vw_cxc_gestion_cobro to service_role;

commit;
