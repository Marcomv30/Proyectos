-- Cierre de caja con snapshot auditable

begin;

create table if not exists public.recaudacion_cierres_caja (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  fecha_desde date not null,
  fecha_hasta date not null,
  moneda text null check (moneda in ('CRC', 'USD')),
  cajero_auth_user_id uuid not null,
  cajero_nombre text null,
  pagos int not null default 0,
  total_recaudado numeric(18,2) not null default 0,
  total_ajuste numeric(18,2) not null default 0,
  total_aplicado numeric(18,2) not null default 0,
  total_no_aplicado numeric(18,2) not null default 0,
  efectivo_liquidar numeric(18,2) not null default 0,
  no_efectivo numeric(18,2) not null default 0,
  observacion text null,
  estado text not null default 'cerrado' check (estado in ('cerrado', 'anulado')),
  created_at timestamptz not null default now(),
  created_by uuid null
);

create index if not exists idx_recaudacion_cierres_caja_lookup
  on public.recaudacion_cierres_caja(empresa_id, fecha_hasta desc, id desc);

create table if not exists public.recaudacion_cierres_caja_detalle (
  id bigserial primary key,
  cierre_id bigint not null references public.recaudacion_cierres_caja(id) on delete cascade,
  medio_pago text not null,
  moneda text not null check (moneda in ('CRC', 'USD')),
  pagos int not null default 0,
  total_recaudado numeric(18,2) not null default 0
);

create index if not exists idx_recaudacion_cierres_caja_detalle_lookup
  on public.recaudacion_cierres_caja_detalle(cierre_id, medio_pago, moneda);

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
    observacion, estado, created_by
  )
  values (
    p_empresa_id, p_fecha_desde, p_fecha_hasta, upper(p_moneda), v_user, v_cajero_nombre,
    v_pagos, v_total_recaudado, v_total_ajuste, v_total_aplicado, v_total_no_aplicado, v_efectivo, v_no_efectivo,
    p_observacion, 'cerrado', v_user
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

  return v_cierre_id;
end;
$$;

create or replace view public.vw_recaudacion_cierres_caja as
select
  c.id,
  c.empresa_id,
  c.fecha_desde,
  c.fecha_hasta,
  c.moneda,
  c.cajero_auth_user_id,
  c.cajero_nombre,
  c.pagos,
  c.total_recaudado,
  c.total_ajuste,
  c.total_aplicado,
  c.total_no_aplicado,
  c.efectivo_liquidar,
  c.no_efectivo,
  c.observacion,
  c.estado,
  c.created_at,
  c.created_by
from public.recaudacion_cierres_caja c;

alter table public.recaudacion_cierres_caja enable row level security;
alter table public.recaudacion_cierres_caja_detalle enable row level security;

drop policy if exists recaudacion_cierres_caja_select_authenticated on public.recaudacion_cierres_caja;
create policy recaudacion_cierres_caja_select_authenticated
on public.recaudacion_cierres_caja
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists recaudacion_cierres_caja_write_authenticated on public.recaudacion_cierres_caja;
create policy recaudacion_cierres_caja_write_authenticated
on public.recaudacion_cierres_caja
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

drop policy if exists recaudacion_cierres_caja_detalle_select_authenticated on public.recaudacion_cierres_caja_detalle;
create policy recaudacion_cierres_caja_detalle_select_authenticated
on public.recaudacion_cierres_caja_detalle
for select
to authenticated
using (
  exists (
    select 1
    from public.recaudacion_cierres_caja c
    where c.id = recaudacion_cierres_caja_detalle.cierre_id
      and public.has_empresa_access(c.empresa_id)
      and public.has_permission(c.empresa_id, 'cxc', 'ver')
  )
);

grant execute on function public.cerrar_recaudacion_caja(bigint, date, date, text, text) to authenticated, service_role;
grant select, insert, update, delete on public.recaudacion_cierres_caja to authenticated;
grant select on public.recaudacion_cierres_caja_detalle to authenticated;
grant select on public.vw_recaudacion_cierres_caja to authenticated, service_role;

commit;
