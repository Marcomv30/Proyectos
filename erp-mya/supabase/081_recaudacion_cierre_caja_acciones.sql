-- Acciones de cierre de caja: anular / reabrir + bitacora

begin;

alter table public.recaudacion_cierres_caja
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid null;

create table if not exists public.recaudacion_cierres_caja_bitacora (
  id bigserial primary key,
  cierre_id bigint not null references public.recaudacion_cierres_caja(id) on delete cascade,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  accion text not null check (accion in ('cerrar', 'anular', 'reabrir')),
  detalle text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid null
);

create index if not exists idx_recaudacion_cierres_bitacora_lookup
  on public.recaudacion_cierres_caja_bitacora(empresa_id, cierre_id, created_at desc, id desc);

create or replace function public.tg_set_updated_at_recaudacion_cierres()
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

drop trigger if exists trg_recaudacion_cierres_updated_at on public.recaudacion_cierres_caja;
create trigger trg_recaudacion_cierres_updated_at
before update on public.recaudacion_cierres_caja
for each row execute function public.tg_set_updated_at_recaudacion_cierres();

create or replace function public.cerrar_recaudacion_caja(
  p_empresa_id bigint,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_moneda text default null,
  p_observacion text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cierre_id bigint;
  v_pagos int;
  v_total_recaudado numeric(18,2);
  v_total_ajuste numeric(18,2);
  v_total_aplicado numeric(18,2);
  v_total_no_aplicado numeric(18,2);
  v_efectivo numeric(18,2);
  v_no_efectivo numeric(18,2);
  v_cajero_nombre text;
begin
  if p_empresa_id is null or p_fecha_desde is null or p_fecha_hasta is null then
    raise exception 'empresa_fechas_requeridas';
  end if;
  if p_fecha_desde > p_fecha_hasta then
    raise exception 'rango_fechas_invalido';
  end if;
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;

  select coalesce(u.nombre, u.username, v_user::text)
    into v_cajero_nombre
  from public.usuarios u
  where u.auth_user_id = v_user
  limit 1;

  select
    count(*)::int,
    coalesce(sum(p.monto_total), 0)::numeric(18,2),
    coalesce(sum(coalesce(p.monto_ajuste, 0)), 0)::numeric(18,2),
    coalesce(sum(coalesce(p.monto_aplicado, 0)), 0)::numeric(18,2),
    coalesce(sum(coalesce(p.monto_no_aplicado, 0)), 0)::numeric(18,2),
    coalesce(sum(case when upper(coalesce(p.medio_pago, '')) = 'EFECTIVO' then p.monto_total else 0 end), 0)::numeric(18,2),
    coalesce(sum(case when upper(coalesce(p.medio_pago, '')) <> 'EFECTIVO' then p.monto_total else 0 end), 0)::numeric(18,2)
  into
    v_pagos, v_total_recaudado, v_total_ajuste, v_total_aplicado, v_total_no_aplicado, v_efectivo, v_no_efectivo
  from public.recaudacion_pagos p
  where p.empresa_id = p_empresa_id
    and p.fecha_pago between p_fecha_desde and p_fecha_hasta
    and p.created_by = v_user
    and p.estado in ('confirmado', 'contabilizado', 'conciliado')
    and (p_moneda is null or p.moneda = upper(p_moneda));

  if coalesce(v_pagos, 0) = 0 then
    raise exception 'sin_pagos_confirmados_para_cerrar';
  end if;

  insert into public.recaudacion_cierres_caja(
    empresa_id, fecha_desde, fecha_hasta, moneda, cajero_auth_user_id, cajero_nombre,
    pagos, total_recaudado, total_ajuste, total_aplicado, total_no_aplicado, efectivo_liquidar, no_efectivo,
    observacion, estado, created_by, updated_by
  )
  values (
    p_empresa_id, p_fecha_desde, p_fecha_hasta, upper(p_moneda), v_user, v_cajero_nombre,
    v_pagos, v_total_recaudado, v_total_ajuste, v_total_aplicado, v_total_no_aplicado, v_efectivo, v_no_efectivo,
    p_observacion, 'cerrado', v_user, v_user
  )
  returning id into v_cierre_id;

  insert into public.recaudacion_cierres_caja_detalle(cierre_id, medio_pago, moneda, pagos, total_recaudado)
  select
    v_cierre_id,
    upper(coalesce(p.medio_pago, 'OTROS')) as medio_pago,
    p.moneda,
    count(*)::int as pagos,
    coalesce(sum(p.monto_total), 0)::numeric(18,2) as total_recaudado
  from public.recaudacion_pagos p
  where p.empresa_id = p_empresa_id
    and p.fecha_pago between p_fecha_desde and p_fecha_hasta
    and p.created_by = v_user
    and p.estado in ('confirmado', 'contabilizado', 'conciliado')
    and (p_moneda is null or p.moneda = upper(p_moneda))
  group by upper(coalesce(p.medio_pago, 'OTROS')), p.moneda;

  insert into public.recaudacion_cierres_caja_bitacora(cierre_id, empresa_id, accion, detalle, payload, created_by)
  values (
    v_cierre_id,
    p_empresa_id,
    'cerrar',
    coalesce(p_observacion, 'Cierre de caja generado'),
    jsonb_build_object(
      'fecha_desde', p_fecha_desde,
      'fecha_hasta', p_fecha_hasta,
      'moneda', upper(p_moneda),
      'pagos', v_pagos,
      'total_recaudado', v_total_recaudado
    ),
    v_user
  );

  return v_cierre_id;
end;
$$;

create or replace function public.anular_recaudacion_cierre_caja(
  p_cierre_id bigint,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cierre public.recaudacion_cierres_caja%rowtype;
begin
  if p_cierre_id is null then
    raise exception 'cierre_requerido';
  end if;
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;

  select * into v_cierre
  from public.recaudacion_cierres_caja c
  where c.id = p_cierre_id
  for update;

  if not found then
    raise exception 'cierre_no_encontrado';
  end if;
  if v_cierre.estado = 'anulado' then
    return;
  end if;

  update public.recaudacion_cierres_caja
  set
    estado = 'anulado',
    updated_by = v_user,
    observacion = case
      when coalesce(trim(p_motivo), '') = '' then observacion
      when coalesce(trim(observacion), '') = '' then trim(p_motivo)
      else observacion || ' | ANULADO: ' || trim(p_motivo)
    end
  where id = v_cierre.id;

  insert into public.recaudacion_cierres_caja_bitacora(cierre_id, empresa_id, accion, detalle, payload, created_by)
  values (
    v_cierre.id,
    v_cierre.empresa_id,
    'anular',
    coalesce(nullif(trim(p_motivo), ''), 'Cierre anulado'),
    jsonb_build_object('estado_anterior', v_cierre.estado, 'estado_nuevo', 'anulado'),
    v_user
  );
end;
$$;

create or replace function public.reabrir_recaudacion_cierre_caja(
  p_cierre_id bigint,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cierre public.recaudacion_cierres_caja%rowtype;
begin
  if p_cierre_id is null then
    raise exception 'cierre_requerido';
  end if;
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;

  select * into v_cierre
  from public.recaudacion_cierres_caja c
  where c.id = p_cierre_id
  for update;

  if not found then
    raise exception 'cierre_no_encontrado';
  end if;
  if v_cierre.estado = 'cerrado' then
    return;
  end if;

  update public.recaudacion_cierres_caja
  set
    estado = 'cerrado',
    updated_by = v_user,
    observacion = case
      when coalesce(trim(p_motivo), '') = '' then observacion
      when coalesce(trim(observacion), '') = '' then trim(p_motivo)
      else observacion || ' | REABIERTO: ' || trim(p_motivo)
    end
  where id = v_cierre.id;

  insert into public.recaudacion_cierres_caja_bitacora(cierre_id, empresa_id, accion, detalle, payload, created_by)
  values (
    v_cierre.id,
    v_cierre.empresa_id,
    'reabrir',
    coalesce(nullif(trim(p_motivo), ''), 'Cierre reabierto'),
    jsonb_build_object('estado_anterior', v_cierre.estado, 'estado_nuevo', 'cerrado'),
    v_user
  );
end;
$$;

alter table public.recaudacion_cierres_caja_bitacora enable row level security;

drop policy if exists recaudacion_cierres_caja_bitacora_select_authenticated on public.recaudacion_cierres_caja_bitacora;
create policy recaudacion_cierres_caja_bitacora_select_authenticated
on public.recaudacion_cierres_caja_bitacora
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

grant execute on function public.cerrar_recaudacion_caja(bigint, date, date, text, text) to authenticated, service_role;
grant execute on function public.anular_recaudacion_cierre_caja(bigint, text) to authenticated, service_role;
grant execute on function public.reabrir_recaudacion_cierre_caja(bigint, text) to authenticated, service_role;
grant select on public.recaudacion_cierres_caja_bitacora to authenticated;

commit;
