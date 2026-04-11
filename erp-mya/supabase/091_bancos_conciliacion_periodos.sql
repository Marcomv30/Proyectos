begin;

create table if not exists public.bancos_conciliacion_periodos (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  cuenta_banco_id bigint not null references public.cuentas_bancarias_empresa(id) on delete cascade,
  fecha_desde date not null,
  fecha_hasta date not null,
  saldo_libros numeric(18,2) not null default 0,
  saldo_banco numeric(18,2) not null default 0,
  diferencia numeric(18,2) not null default 0,
  observacion text null,
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrado')),
  cerrado_en timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  unique (empresa_id, cuenta_banco_id, fecha_desde, fecha_hasta)
);

create index if not exists idx_bancos_conc_periodos_lookup
  on public.bancos_conciliacion_periodos(empresa_id, cuenta_banco_id, fecha_desde desc, fecha_hasta desc, id desc);

drop trigger if exists trg_bancos_conciliacion_periodos_updated_at on public.bancos_conciliacion_periodos;
create trigger trg_bancos_conciliacion_periodos_updated_at
before update on public.bancos_conciliacion_periodos
for each row execute function public.tg_set_updated_at_recaudacion();

create or replace view public.vw_bancos_conciliacion_periodos as
select
  p.id,
  p.empresa_id,
  p.cuenta_banco_id,
  cb.codigo as cuenta_banco_codigo,
  cb.alias as cuenta_banco_alias,
  cb.banco_nombre,
  cb.moneda,
  p.fecha_desde,
  p.fecha_hasta,
  p.saldo_libros,
  p.saldo_banco,
  p.diferencia,
  p.observacion,
  p.estado,
  p.cerrado_en,
  p.created_at,
  p.updated_at
from public.bancos_conciliacion_periodos p
join public.cuentas_bancarias_empresa cb on cb.id = p.cuenta_banco_id;

grant select on public.vw_bancos_conciliacion_periodos to authenticated, service_role;

alter table public.bancos_conciliacion_periodos enable row level security;

drop policy if exists bancos_conciliacion_periodos_select on public.bancos_conciliacion_periodos;
create policy bancos_conciliacion_periodos_select
on public.bancos_conciliacion_periodos
for select
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'ver'));

drop policy if exists bancos_conciliacion_periodos_write on public.bancos_conciliacion_periodos;
create policy bancos_conciliacion_periodos_write
on public.bancos_conciliacion_periodos
for all
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'editar'))
with check (public.has_permission(empresa_id, 'bancos', 'editar'));

grant select, insert, update, delete on public.bancos_conciliacion_periodos to authenticated;

create or replace function public.guardar_bancos_conciliacion_periodo(
  p_empresa_id bigint,
  p_cuenta_banco_id bigint,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_saldo_banco numeric default 0,
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
  v_saldo_libros numeric(18,2);
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;
  if p_empresa_id is null or p_cuenta_banco_id is null or p_fecha_desde is null or p_fecha_hasta is null then
    raise exception 'empresa_cuenta_periodo_requeridos';
  end if;
  if p_fecha_desde > p_fecha_hasta then
    raise exception 'rango_periodo_invalido';
  end if;

  select coalesce(sum(case when a.estado_conciliacion <> 'anulado' then a.monto else 0 end), 0)::numeric(18,2)
    into v_saldo_libros
  from public.vw_recaudacion_auxiliar_banco a
  where a.empresa_id = p_empresa_id
    and a.cuenta_banco_id = p_cuenta_banco_id
    and a.fecha_movimiento between p_fecha_desde and p_fecha_hasta;

  insert into public.bancos_conciliacion_periodos(
    empresa_id, cuenta_banco_id, fecha_desde, fecha_hasta,
    saldo_libros, saldo_banco, diferencia, observacion,
    estado, created_by, updated_by
  )
  values (
    p_empresa_id, p_cuenta_banco_id, p_fecha_desde, p_fecha_hasta,
    v_saldo_libros, round(coalesce(p_saldo_banco, 0), 2),
    round(v_saldo_libros - coalesce(p_saldo_banco, 0), 2),
    p_observacion, 'borrador', v_user, v_user
  )
  on conflict (empresa_id, cuenta_banco_id, fecha_desde, fecha_hasta)
  do update set
    saldo_libros = excluded.saldo_libros,
    saldo_banco = excluded.saldo_banco,
    diferencia = excluded.diferencia,
    observacion = excluded.observacion,
    updated_at = now(),
    updated_by = v_user
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cerrar_bancos_conciliacion_periodo(
  p_periodo_id bigint,
  p_observacion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_periodo public.bancos_conciliacion_periodos%rowtype;
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;
  if p_periodo_id is null then
    raise exception 'periodo_requerido';
  end if;

  select * into v_periodo
  from public.bancos_conciliacion_periodos p
  where p.id = p_periodo_id
  for update;

  if not found then
    raise exception 'periodo_no_encontrado';
  end if;
  if v_periodo.estado = 'cerrado' then
    return;
  end if;

  update public.bancos_conciliacion_periodos
  set
    estado = 'cerrado',
    observacion = coalesce(p_observacion, observacion),
    cerrado_en = now(),
    updated_at = now(),
    updated_by = v_user
  where id = p_periodo_id;
end;
$$;

grant execute on function public.guardar_bancos_conciliacion_periodo(bigint, bigint, date, date, numeric, text) to authenticated, service_role;
grant execute on function public.cerrar_bancos_conciliacion_periodo(bigint, text) to authenticated, service_role;

commit;
