-- MVP Turnos de Caja para recaudacion / facturacion

begin;

create table if not exists public.puntos_venta (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  unique (empresa_id, codigo)
);

create table if not exists public.cajas (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  punto_venta_id bigint not null references public.puntos_venta(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  unique (empresa_id, punto_venta_id, codigo)
);

create table if not exists public.caja_turnos (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  punto_venta_id bigint not null references public.puntos_venta(id) on delete restrict,
  caja_id bigint not null references public.cajas(id) on delete restrict,
  cajero_auth_user_id uuid not null,
  fecha_hora_apertura timestamptz not null default now(),
  fecha_hora_cierre timestamptz null,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'anulado')),
  saldo_inicial numeric(18,2) not null default 0,
  total_recaudado numeric(18,2) not null default 0,
  total_ajuste numeric(18,2) not null default 0,
  total_aplicado numeric(18,2) not null default 0,
  total_no_aplicado numeric(18,2) not null default 0,
  total_efectivo numeric(18,2) not null default 0,
  total_no_efectivo numeric(18,2) not null default 0,
  saldo_final_sistema numeric(18,2) not null default 0,
  saldo_final_fisico numeric(18,2) null,
  diferencia_cierre numeric(18,2) null,
  observacion text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null
);

create index if not exists idx_caja_turnos_lookup
  on public.caja_turnos(empresa_id, estado, fecha_hora_apertura desc, id desc);

create table if not exists public.caja_turno_medios (
  id bigserial primary key,
  turno_id bigint not null references public.caja_turnos(id) on delete cascade,
  medio_pago text not null,
  moneda text not null check (moneda in ('CRC', 'USD')),
  pagos int not null default 0,
  total_recaudado numeric(18,2) not null default 0
);

create index if not exists idx_caja_turno_medios_lookup
  on public.caja_turno_medios(turno_id, medio_pago, moneda);

create table if not exists public.caja_turno_bitacora (
  id bigserial primary key,
  turno_id bigint not null references public.caja_turnos(id) on delete cascade,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  accion text not null check (accion in ('abrir', 'cerrar', 'anular', 'reabrir')),
  detalle text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid null
);

create index if not exists idx_caja_turno_bitacora_lookup
  on public.caja_turno_bitacora(empresa_id, turno_id, created_at desc, id desc);

create or replace function public.tg_set_updated_at_caja_turnos()
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

drop trigger if exists trg_puntos_venta_updated_at on public.puntos_venta;
create trigger trg_puntos_venta_updated_at
before update on public.puntos_venta
for each row execute function public.tg_set_updated_at_caja_turnos();

drop trigger if exists trg_cajas_updated_at on public.cajas;
create trigger trg_cajas_updated_at
before update on public.cajas
for each row execute function public.tg_set_updated_at_caja_turnos();

drop trigger if exists trg_caja_turnos_updated_at on public.caja_turnos;
create trigger trg_caja_turnos_updated_at
before update on public.caja_turnos
for each row execute function public.tg_set_updated_at_caja_turnos();

create or replace function public.abrir_caja_turno(
  p_empresa_id bigint,
  p_punto_venta_id bigint,
  p_caja_id bigint,
  p_saldo_inicial numeric default 0,
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
  v_dummy bigint;
begin
  if p_empresa_id is null or p_punto_venta_id is null or p_caja_id is null then
    raise exception 'empresa_punto_caja_requeridos';
  end if;
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;
  if coalesce(p_saldo_inicial, 0) < 0 then
    raise exception 'saldo_inicial_invalido';
  end if;

  select c.id into v_dummy
  from public.cajas c
  where c.id = p_caja_id
    and c.empresa_id = p_empresa_id
    and c.punto_venta_id = p_punto_venta_id
    and c.activo = true;
  if not found then
    raise exception 'caja_no_valida';
  end if;

  select t.id into v_dummy
  from public.caja_turnos t
  where t.empresa_id = p_empresa_id
    and t.caja_id = p_caja_id
    and t.estado = 'abierto'
  limit 1;
  if found then
    raise exception 'caja_con_turno_abierto';
  end if;

  select t.id into v_dummy
  from public.caja_turnos t
  where t.empresa_id = p_empresa_id
    and t.cajero_auth_user_id = v_user
    and t.estado = 'abierto'
  limit 1;
  if found then
    raise exception 'cajero_ya_tiene_turno_abierto';
  end if;

  insert into public.caja_turnos(
    empresa_id, punto_venta_id, caja_id, cajero_auth_user_id, fecha_hora_apertura, estado,
    saldo_inicial, saldo_final_sistema, observacion, created_by, updated_by
  )
  values (
    p_empresa_id, p_punto_venta_id, p_caja_id, v_user, now(), 'abierto',
    round(coalesce(p_saldo_inicial, 0), 2), round(coalesce(p_saldo_inicial, 0), 2),
    p_observacion, v_user, v_user
  )
  returning id into v_id;

  insert into public.caja_turno_bitacora(turno_id, empresa_id, accion, detalle, payload, created_by)
  values (
    v_id, p_empresa_id, 'abrir', coalesce(p_observacion, 'Turno abierto'),
    jsonb_build_object('saldo_inicial', round(coalesce(p_saldo_inicial, 0), 2)),
    v_user
  );

  return v_id;
end;
$$;

create or replace function public.cerrar_caja_turno(
  p_turno_id bigint,
  p_saldo_final_fisico numeric default null,
  p_observacion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_turno public.caja_turnos%rowtype;
  v_total_recaudado numeric(18,2);
  v_total_ajuste numeric(18,2);
  v_total_aplicado numeric(18,2);
  v_total_no_aplicado numeric(18,2);
  v_total_efectivo numeric(18,2);
  v_total_no_efectivo numeric(18,2);
  v_saldo_final_sistema numeric(18,2);
  v_diferencia numeric(18,2);
begin
  if p_turno_id is null then
    raise exception 'turno_requerido';
  end if;
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;

  select * into v_turno
  from public.caja_turnos t
  where t.id = p_turno_id
  for update;

  if not found then
    raise exception 'turno_no_encontrado';
  end if;
  if v_turno.estado <> 'abierto' then
    raise exception 'solo_turno_abierto_se_puede_cerrar';
  end if;
  if v_turno.cajero_auth_user_id <> v_user then
    raise exception 'solo_el_cajero_del_turno_puede_cerrar';
  end if;

  select
    coalesce(sum(p.monto_total), 0)::numeric(18,2),
    coalesce(sum(coalesce(p.monto_ajuste, 0)), 0)::numeric(18,2),
    coalesce(sum(coalesce(p.monto_aplicado, 0)), 0)::numeric(18,2),
    coalesce(sum(coalesce(p.monto_no_aplicado, 0)), 0)::numeric(18,2),
    coalesce(sum(case when upper(coalesce(p.medio_pago, '')) = 'EFECTIVO' then p.monto_total else 0 end), 0)::numeric(18,2),
    coalesce(sum(case when upper(coalesce(p.medio_pago, '')) <> 'EFECTIVO' then p.monto_total else 0 end), 0)::numeric(18,2)
  into
    v_total_recaudado, v_total_ajuste, v_total_aplicado, v_total_no_aplicado, v_total_efectivo, v_total_no_efectivo
  from public.recaudacion_pagos p
  where p.empresa_id = v_turno.empresa_id
    and p.created_by = v_turno.cajero_auth_user_id
    and p.fecha_pago between (v_turno.fecha_hora_apertura at time zone 'UTC')::date and now()::date
    and p.estado in ('confirmado', 'contabilizado', 'conciliado');

  v_saldo_final_sistema := round(v_turno.saldo_inicial + v_total_efectivo, 2);
  v_diferencia := case
    when p_saldo_final_fisico is null then null
    else round(p_saldo_final_fisico - v_saldo_final_sistema, 2)
  end;

  delete from public.caja_turno_medios where turno_id = v_turno.id;

  insert into public.caja_turno_medios(turno_id, medio_pago, moneda, pagos, total_recaudado)
  select
    v_turno.id,
    upper(coalesce(p.medio_pago, 'OTROS')) as medio_pago,
    p.moneda,
    count(*)::int as pagos,
    coalesce(sum(p.monto_total), 0)::numeric(18,2) as total_recaudado
  from public.recaudacion_pagos p
  where p.empresa_id = v_turno.empresa_id
    and p.created_by = v_turno.cajero_auth_user_id
    and p.fecha_pago between (v_turno.fecha_hora_apertura at time zone 'UTC')::date and now()::date
    and p.estado in ('confirmado', 'contabilizado', 'conciliado')
  group by upper(coalesce(p.medio_pago, 'OTROS')), p.moneda;

  update public.caja_turnos
  set
    fecha_hora_cierre = now(),
    estado = 'cerrado',
    total_recaudado = v_total_recaudado,
    total_ajuste = v_total_ajuste,
    total_aplicado = v_total_aplicado,
    total_no_aplicado = v_total_no_aplicado,
    total_efectivo = v_total_efectivo,
    total_no_efectivo = v_total_no_efectivo,
    saldo_final_sistema = v_saldo_final_sistema,
    saldo_final_fisico = case when p_saldo_final_fisico is null then null else round(p_saldo_final_fisico, 2) end,
    diferencia_cierre = v_diferencia,
    observacion = case
      when coalesce(trim(p_observacion), '') = '' then observacion
      when coalesce(trim(observacion), '') = '' then trim(p_observacion)
      else observacion || ' | ' || trim(p_observacion)
    end,
    updated_by = v_user
  where id = v_turno.id;

  insert into public.caja_turno_bitacora(turno_id, empresa_id, accion, detalle, payload, created_by)
  values (
    v_turno.id, v_turno.empresa_id, 'cerrar', coalesce(p_observacion, 'Turno cerrado'),
    jsonb_build_object(
      'total_recaudado', v_total_recaudado,
      'total_efectivo', v_total_efectivo,
      'saldo_final_sistema', v_saldo_final_sistema,
      'saldo_final_fisico', p_saldo_final_fisico,
      'diferencia_cierre', v_diferencia
    ),
    v_user
  );
end;
$$;

create or replace view public.vw_caja_turnos as
select
  t.id,
  t.empresa_id,
  t.punto_venta_id,
  pv.codigo as punto_venta_codigo,
  pv.nombre as punto_venta_nombre,
  t.caja_id,
  c.codigo as caja_codigo,
  c.nombre as caja_nombre,
  t.cajero_auth_user_id,
  coalesce(u.nombre, u.username, t.cajero_auth_user_id::text) as cajero_nombre,
  t.fecha_hora_apertura,
  t.fecha_hora_cierre,
  t.estado,
  t.saldo_inicial,
  t.total_recaudado,
  t.total_ajuste,
  t.total_aplicado,
  t.total_no_aplicado,
  t.total_efectivo,
  t.total_no_efectivo,
  t.saldo_final_sistema,
  t.saldo_final_fisico,
  t.diferencia_cierre,
  t.observacion,
  t.created_at,
  t.updated_at
from public.caja_turnos t
join public.puntos_venta pv on pv.id = t.punto_venta_id
join public.cajas c on c.id = t.caja_id
left join public.usuarios u on u.auth_user_id = t.cajero_auth_user_id;

create or replace view public.vw_caja_turno_medios as
select
  d.id,
  d.turno_id,
  t.empresa_id,
  t.fecha_hora_apertura,
  t.fecha_hora_cierre,
  t.estado as turno_estado,
  d.medio_pago,
  d.moneda,
  d.pagos,
  d.total_recaudado
from public.caja_turno_medios d
join public.caja_turnos t on t.id = d.turno_id;

alter table public.puntos_venta enable row level security;
alter table public.cajas enable row level security;
alter table public.caja_turnos enable row level security;
alter table public.caja_turno_medios enable row level security;
alter table public.caja_turno_bitacora enable row level security;

drop policy if exists puntos_venta_select_authenticated on public.puntos_venta;
create policy puntos_venta_select_authenticated
on public.puntos_venta
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists puntos_venta_write_authenticated on public.puntos_venta;
create policy puntos_venta_write_authenticated
on public.puntos_venta
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

drop policy if exists cajas_select_authenticated on public.cajas;
create policy cajas_select_authenticated
on public.cajas
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists cajas_write_authenticated on public.cajas;
create policy cajas_write_authenticated
on public.cajas
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

drop policy if exists caja_turnos_select_authenticated on public.caja_turnos;
create policy caja_turnos_select_authenticated
on public.caja_turnos
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists caja_turnos_write_authenticated on public.caja_turnos;
create policy caja_turnos_write_authenticated
on public.caja_turnos
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

drop policy if exists caja_turno_medios_select_authenticated on public.caja_turno_medios;
create policy caja_turno_medios_select_authenticated
on public.caja_turno_medios
for select
to authenticated
using (
  exists (
    select 1
    from public.caja_turnos t
    where t.id = caja_turno_medios.turno_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'cxc', 'ver')
  )
);

drop policy if exists caja_turno_bitacora_select_authenticated on public.caja_turno_bitacora;
create policy caja_turno_bitacora_select_authenticated
on public.caja_turno_bitacora
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

grant execute on function public.abrir_caja_turno(bigint, bigint, bigint, numeric, text) to authenticated, service_role;
grant execute on function public.cerrar_caja_turno(bigint, numeric, text) to authenticated, service_role;

grant select, insert, update, delete on public.puntos_venta to authenticated;
grant select, insert, update, delete on public.cajas to authenticated;
grant select, insert, update, delete on public.caja_turnos to authenticated;
grant select, insert, update, delete on public.caja_turno_medios to authenticated;
grant select on public.caja_turno_bitacora to authenticated;

grant select on public.vw_caja_turnos to authenticated, service_role;
grant select on public.vw_caja_turno_medios to authenticated, service_role;

commit;
