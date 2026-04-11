-- Recaudacion y Aplicacion de Pagos
-- Flujo: borrador -> confirmado -> contabilizado -> conciliado / anulado
-- Seguridad: validaciones por estado, trazabilidad y operaciones atomicas.

begin;

create table if not exists public.recaudacion_pagos (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  tercero_id bigint not null references public.terceros(id) on delete restrict,
  fecha_pago date not null default current_date,
  moneda text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  tipo_cambio numeric(18,6) not null default 1 check (tipo_cambio > 0),
  monto_total numeric(18,2) not null check (monto_total > 0),
  monto_aplicado numeric(18,2) not null default 0 check (monto_aplicado >= 0),
  monto_no_aplicado numeric(18,2) not null default 0 check (monto_no_aplicado >= 0),
  medio_pago text not null default 'TRANSFERENCIA',
  referencia text null,
  cuenta_banco_id bigint null,
  observacion text null,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'confirmado', 'contabilizado', 'conciliado', 'anulado')),
  asiento_id bigint null,
  conciliado_en timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null
);

create index if not exists idx_recaudacion_pagos_lookup
  on public.recaudacion_pagos(empresa_id, estado, fecha_pago desc, id desc);

create table if not exists public.recaudacion_pago_detalle (
  id bigserial primary key,
  pago_id bigint not null references public.recaudacion_pagos(id) on delete cascade,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  documento_id bigint not null references public.cxc_documentos(id) on delete restrict,
  monto_aplicado numeric(18,2) not null check (monto_aplicado > 0),
  observacion text null,
  estado text not null default 'activo' check (estado in ('activo', 'anulado')),
  cxc_aplicacion_id bigint null references public.cxc_aplicaciones(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  unique (pago_id, documento_id)
);

create index if not exists idx_recaudacion_detalle_lookup
  on public.recaudacion_pago_detalle(empresa_id, pago_id, estado, documento_id);

create table if not exists public.recaudacion_auxiliar_banco (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  pago_id bigint not null references public.recaudacion_pagos(id) on delete cascade,
  fecha_movimiento date not null,
  moneda text not null check (moneda in ('CRC', 'USD')),
  monto numeric(18,2) not null check (monto > 0),
  referencia text null,
  estado_conciliacion text not null default 'pendiente'
    check (estado_conciliacion in ('pendiente', 'conciliado', 'anulado')),
  conciliado_en timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pago_id)
);

create index if not exists idx_recaudacion_aux_banco_lookup
  on public.recaudacion_auxiliar_banco(empresa_id, estado_conciliacion, fecha_movimiento desc, id desc);

create table if not exists public.recaudacion_bitacora (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  pago_id bigint not null references public.recaudacion_pagos(id) on delete cascade,
  accion text not null,
  detalle text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid null
);

create index if not exists idx_recaudacion_bitacora_lookup
  on public.recaudacion_bitacora(empresa_id, pago_id, created_at desc, id desc);

create or replace function public.tg_set_updated_at_recaudacion()
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

create or replace function public.recaudacion_recalcular_totales(p_pago_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(18,2);
  v_monto_total numeric(18,2);
begin
  if p_pago_id is null then
    return;
  end if;

  select coalesce(sum(d.monto_aplicado), 0)::numeric(18,2)
    into v_total
  from public.recaudacion_pago_detalle d
  where d.pago_id = p_pago_id
    and d.estado = 'activo';

  select p.monto_total
    into v_monto_total
  from public.recaudacion_pagos p
  where p.id = p_pago_id;

  if v_monto_total is null then
    return;
  end if;

  update public.recaudacion_pagos
  set
    monto_aplicado = v_total,
    monto_no_aplicado = greatest(v_monto_total - v_total, 0),
    updated_at = now()
  where id = p_pago_id;
end;
$$;

create or replace function public.trg_recaudacion_detalle_recalcular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago_id bigint;
begin
  v_pago_id := coalesce(new.pago_id, old.pago_id);
  perform public.recaudacion_recalcular_totales(v_pago_id);
  return coalesce(new, old);
end;
$$;

create or replace function public.recaudacion_guardar_detalle(
  p_pago_id bigint,
  p_documento_id bigint,
  p_monto_aplicado numeric,
  p_observacion text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pago public.recaudacion_pagos%rowtype;
  v_doc public.cxc_documentos%rowtype;
  v_id bigint;
begin
  if p_pago_id is null or p_documento_id is null or coalesce(p_monto_aplicado, 0) <= 0 then
    raise exception 'pago_documento_monto_requeridos';
  end if;

  select * into v_pago
  from public.recaudacion_pagos p
  where p.id = p_pago_id
  for update;

  if not found then
    raise exception 'pago_no_encontrado';
  end if;
  if v_pago.estado <> 'borrador' then
    raise exception 'solo_borrador_permite_edicion';
  end if;

  select * into v_doc
  from public.cxc_documentos d
  where d.id = p_documento_id
    and d.empresa_id = v_pago.empresa_id
    and d.estado in ('pendiente', 'parcial')
  for update;

  if not found then
    raise exception 'documento_no_valido';
  end if;
  if v_doc.tercero_id <> v_pago.tercero_id then
    raise exception 'documento_no_pertenece_al_cliente_del_pago';
  end if;
  if p_monto_aplicado > v_doc.monto_pendiente then
    raise exception 'monto_supera_saldo_documento';
  end if;

  insert into public.recaudacion_pago_detalle(
    pago_id, empresa_id, documento_id, monto_aplicado, observacion, estado, created_by, updated_by
  )
  values (
    v_pago.id, v_pago.empresa_id, v_doc.id, round(p_monto_aplicado, 2), p_observacion, 'activo', v_user, v_user
  )
  on conflict (pago_id, documento_id)
  do update set
    monto_aplicado = excluded.monto_aplicado,
    observacion = excluded.observacion,
    estado = 'activo',
    updated_at = now(),
    updated_by = excluded.updated_by
  returning id into v_id;

  perform public.recaudacion_recalcular_totales(v_pago.id);
  return v_id;
end;
$$;

create or replace function public.recaudacion_eliminar_detalle(
  p_detalle_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_det public.recaudacion_pago_detalle%rowtype;
  v_pago public.recaudacion_pagos%rowtype;
begin
  if p_detalle_id is null then
    raise exception 'detalle_requerido';
  end if;

  select * into v_det
  from public.recaudacion_pago_detalle d
  where d.id = p_detalle_id
  for update;

  if not found then
    raise exception 'detalle_no_encontrado';
  end if;

  select * into v_pago
  from public.recaudacion_pagos p
  where p.id = v_det.pago_id
  for update;

  if v_pago.estado <> 'borrador' then
    raise exception 'solo_borrador_permite_edicion';
  end if;

  delete from public.recaudacion_pago_detalle where id = v_det.id;
  perform public.recaudacion_recalcular_totales(v_det.pago_id);
end;
$$;

create or replace function public.registrar_recaudacion_pago(
  p_empresa_id bigint,
  p_tercero_id bigint,
  p_fecha_pago date default current_date,
  p_moneda text default 'CRC',
  p_tipo_cambio numeric default 1,
  p_monto_total numeric default 0,
  p_medio_pago text default 'TRANSFERENCIA',
  p_referencia text default null,
  p_cuenta_banco_id bigint default null,
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
  if p_empresa_id is null or p_tercero_id is null or coalesce(p_monto_total, 0) <= 0 then
    raise exception 'empresa_cliente_monto_requeridos';
  end if;

  insert into public.recaudacion_pagos(
    empresa_id, tercero_id, fecha_pago, moneda, tipo_cambio, monto_total,
    medio_pago, referencia, cuenta_banco_id, observacion, estado, created_by, updated_by
  )
  values (
    p_empresa_id, p_tercero_id, coalesce(p_fecha_pago, current_date), upper(coalesce(p_moneda, 'CRC')),
    coalesce(p_tipo_cambio, 1), round(p_monto_total, 2), upper(coalesce(p_medio_pago, 'TRANSFERENCIA')),
    p_referencia, p_cuenta_banco_id, p_observacion, 'borrador', v_user, v_user
  )
  returning id into v_id;

  insert into public.recaudacion_bitacora(empresa_id, pago_id, accion, detalle, payload, created_by)
  values (p_empresa_id, v_id, 'crear_borrador', 'Pago creado en estado borrador', '{}'::jsonb, v_user);

  return v_id;
end;
$$;

create or replace function public.confirmar_recaudacion_pago(
  p_pago_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pago public.recaudacion_pagos%rowtype;
  v_det record;
  v_total_aplicado numeric(18,2);
  v_app_id bigint;
begin
  if p_pago_id is null then
    raise exception 'pago_requerido';
  end if;

  select * into v_pago
  from public.recaudacion_pagos p
  where p.id = p_pago_id
  for update;

  if not found then
    raise exception 'pago_no_encontrado';
  end if;
  if v_pago.estado <> 'borrador' then
    raise exception 'solo_borrador_se_puede_confirmar';
  end if;

  perform public.recaudacion_recalcular_totales(v_pago.id);
  select * into v_pago from public.recaudacion_pagos where id = v_pago.id;

  v_total_aplicado := coalesce(v_pago.monto_aplicado, 0);
  if v_total_aplicado > v_pago.monto_total then
    raise exception 'aplicacion_supera_monto_total';
  end if;

  for v_det in
    select d.*
    from public.recaudacion_pago_detalle d
    where d.pago_id = v_pago.id
      and d.estado = 'activo'
    for update
  loop
    if v_det.cxc_aplicacion_id is null then
      insert into public.cxc_aplicaciones(
        empresa_id, documento_id, fecha_aplicacion, tipo_aplicacion, monto,
        referencia, observaciones, estado, created_by, updated_by
      )
      values (
        v_pago.empresa_id, v_det.documento_id, v_pago.fecha_pago, 'ABONO', v_det.monto_aplicado,
        v_pago.referencia, coalesce(v_det.observacion, '[RECAUDACION] aplicacion de pago'), 'activo', v_user, v_user
      )
      returning id into v_app_id;

      update public.recaudacion_pago_detalle
      set cxc_aplicacion_id = v_app_id, updated_at = now(), updated_by = v_user
      where id = v_det.id;
    end if;
  end loop;

  update public.recaudacion_pagos
  set
    estado = 'confirmado',
    updated_at = now(),
    updated_by = v_user
  where id = v_pago.id;

  insert into public.recaudacion_auxiliar_banco(
    empresa_id, pago_id, fecha_movimiento, moneda, monto, referencia, estado_conciliacion
  )
  values (
    v_pago.empresa_id, v_pago.id, v_pago.fecha_pago, v_pago.moneda, v_pago.monto_total, v_pago.referencia, 'pendiente'
  )
  on conflict (pago_id) do update
    set fecha_movimiento = excluded.fecha_movimiento,
        moneda = excluded.moneda,
        monto = excluded.monto,
        referencia = excluded.referencia,
        updated_at = now();

  insert into public.recaudacion_bitacora(empresa_id, pago_id, accion, detalle, payload, created_by)
  values (
    v_pago.empresa_id, v_pago.id, 'confirmar',
    'Pago confirmado y enviado a auxiliar bancario',
    jsonb_build_object('monto_total', v_pago.monto_total, 'monto_aplicado', v_pago.monto_aplicado),
    v_user
  );
end;
$$;

create or replace function public.marcar_recaudacion_contabilizada(
  p_pago_id bigint,
  p_asiento_id bigint,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pago public.recaudacion_pagos%rowtype;
begin
  if p_pago_id is null or p_asiento_id is null then
    raise exception 'pago_asiento_requeridos';
  end if;

  select * into v_pago
  from public.recaudacion_pagos p
  where p.id = p_pago_id
  for update;

  if not found then
    raise exception 'pago_no_encontrado';
  end if;
  if v_pago.estado <> 'confirmado' then
    raise exception 'solo_confirmado_se_puede_contabilizar';
  end if;

  update public.recaudacion_pagos
  set
    estado = 'contabilizado',
    asiento_id = p_asiento_id,
    updated_at = now(),
    updated_by = v_user
  where id = p_pago_id;

  insert into public.recaudacion_bitacora(empresa_id, pago_id, accion, detalle, payload, created_by)
  values (
    v_pago.empresa_id, v_pago.id, 'contabilizar',
    coalesce(p_detalle, 'Pago marcado como contabilizado'),
    jsonb_build_object('asiento_id', p_asiento_id),
    v_user
  );
end;
$$;

create or replace function public.anular_recaudacion_pago(
  p_pago_id bigint,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pago public.recaudacion_pagos%rowtype;
  v_det record;
begin
  if p_pago_id is null then
    raise exception 'pago_requerido';
  end if;

  select * into v_pago
  from public.recaudacion_pagos p
  where p.id = p_pago_id
  for update;

  if not found then
    raise exception 'pago_no_encontrado';
  end if;
  if v_pago.estado = 'anulado' then
    return;
  end if;
  if v_pago.estado = 'conciliado' then
    raise exception 'pago_conciliado_no_se_puede_anular';
  end if;

  for v_det in
    select d.*
    from public.recaudacion_pago_detalle d
    where d.pago_id = v_pago.id
      and d.estado = 'activo'
  loop
    if v_det.cxc_aplicacion_id is not null then
      perform public.anular_cxc_aplicacion(v_pago.empresa_id, v_det.cxc_aplicacion_id, coalesce(p_motivo, 'Anulacion de pago'));
    end if;

    update public.recaudacion_pago_detalle
    set estado = 'anulado', updated_at = now(), updated_by = v_user
    where id = v_det.id;
  end loop;

  update public.recaudacion_auxiliar_banco
  set estado_conciliacion = 'anulado', updated_at = now()
  where pago_id = v_pago.id;

  update public.recaudacion_pagos
  set
    estado = 'anulado',
    updated_at = now(),
    updated_by = v_user
  where id = v_pago.id;

  insert into public.recaudacion_bitacora(empresa_id, pago_id, accion, detalle, payload, created_by)
  values (
    v_pago.empresa_id, v_pago.id, 'anular',
    coalesce(p_motivo, 'Pago anulado'),
    '{}'::jsonb,
    v_user
  );
end;
$$;

drop trigger if exists trg_recaudacion_pagos_updated_at on public.recaudacion_pagos;
create trigger trg_recaudacion_pagos_updated_at
before update on public.recaudacion_pagos
for each row execute function public.tg_set_updated_at_recaudacion();

drop trigger if exists trg_recaudacion_detalle_updated_at on public.recaudacion_pago_detalle;
create trigger trg_recaudacion_detalle_updated_at
before update on public.recaudacion_pago_detalle
for each row execute function public.tg_set_updated_at_recaudacion();

drop trigger if exists trg_recaudacion_auxiliar_updated_at on public.recaudacion_auxiliar_banco;
create trigger trg_recaudacion_auxiliar_updated_at
before update on public.recaudacion_auxiliar_banco
for each row execute function public.tg_set_updated_at_recaudacion();

drop trigger if exists trg_recaudacion_detalle_recalcular on public.recaudacion_pago_detalle;
create trigger trg_recaudacion_detalle_recalcular
after insert or update or delete on public.recaudacion_pago_detalle
for each row execute function public.trg_recaudacion_detalle_recalcular();

create or replace view public.vw_recaudacion_pagos as
select
  p.id,
  p.empresa_id,
  p.tercero_id,
  t.razon_social as tercero_nombre,
  t.identificacion as tercero_identificacion,
  p.fecha_pago,
  p.moneda,
  p.tipo_cambio,
  p.monto_total,
  p.monto_aplicado,
  p.monto_no_aplicado,
  p.medio_pago,
  p.referencia,
  p.cuenta_banco_id,
  p.observacion,
  p.estado,
  p.asiento_id,
  p.conciliado_en,
  p.created_at,
  p.updated_at
from public.recaudacion_pagos p
join public.terceros t on t.id = p.tercero_id;

create or replace view public.vw_recaudacion_pago_detalle as
select
  d.id,
  d.pago_id,
  d.empresa_id,
  d.documento_id,
  doc.numero_documento,
  doc.tipo_documento,
  doc.fecha_emision,
  doc.fecha_vencimiento,
  doc.moneda,
  doc.monto_original,
  doc.monto_pendiente,
  d.monto_aplicado,
  d.observacion,
  d.estado,
  d.cxc_aplicacion_id,
  d.created_at,
  d.updated_at
from public.recaudacion_pago_detalle d
join public.cxc_documentos doc on doc.id = d.documento_id;

create or replace view public.vw_recaudacion_auxiliar_banco_pendiente as
select
  a.id,
  a.empresa_id,
  a.pago_id,
  p.tercero_id,
  t.razon_social as tercero_nombre,
  t.identificacion as tercero_identificacion,
  a.fecha_movimiento,
  a.moneda,
  a.monto,
  a.referencia,
  a.estado_conciliacion,
  p.estado as estado_pago,
  p.asiento_id
from public.recaudacion_auxiliar_banco a
join public.recaudacion_pagos p on p.id = a.pago_id
join public.terceros t on t.id = p.tercero_id
where a.estado_conciliacion = 'pendiente';

alter table public.recaudacion_pagos enable row level security;
alter table public.recaudacion_pago_detalle enable row level security;
alter table public.recaudacion_auxiliar_banco enable row level security;
alter table public.recaudacion_bitacora enable row level security;

drop policy if exists recaudacion_pagos_select_authenticated on public.recaudacion_pagos;
create policy recaudacion_pagos_select_authenticated
on public.recaudacion_pagos
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists recaudacion_pagos_write_authenticated on public.recaudacion_pagos;
create policy recaudacion_pagos_write_authenticated
on public.recaudacion_pagos
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

drop policy if exists recaudacion_detalle_select_authenticated on public.recaudacion_pago_detalle;
create policy recaudacion_detalle_select_authenticated
on public.recaudacion_pago_detalle
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists recaudacion_detalle_write_authenticated on public.recaudacion_pago_detalle;
create policy recaudacion_detalle_write_authenticated
on public.recaudacion_pago_detalle
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

drop policy if exists recaudacion_aux_select_authenticated on public.recaudacion_auxiliar_banco;
create policy recaudacion_aux_select_authenticated
on public.recaudacion_auxiliar_banco
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

drop policy if exists recaudacion_aux_write_authenticated on public.recaudacion_auxiliar_banco;
create policy recaudacion_aux_write_authenticated
on public.recaudacion_auxiliar_banco
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

drop policy if exists recaudacion_bitacora_select_authenticated on public.recaudacion_bitacora;
create policy recaudacion_bitacora_select_authenticated
on public.recaudacion_bitacora
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

grant execute on function public.registrar_recaudacion_pago(bigint, bigint, date, text, numeric, numeric, text, text, bigint, text) to authenticated, service_role;
grant execute on function public.recaudacion_guardar_detalle(bigint, bigint, numeric, text) to authenticated, service_role;
grant execute on function public.recaudacion_eliminar_detalle(bigint) to authenticated, service_role;
grant execute on function public.confirmar_recaudacion_pago(bigint) to authenticated, service_role;
grant execute on function public.marcar_recaudacion_contabilizada(bigint, bigint, text) to authenticated, service_role;
grant execute on function public.anular_recaudacion_pago(bigint, text) to authenticated, service_role;

grant select, insert, update, delete on public.recaudacion_pagos to authenticated;
grant select, insert, update, delete on public.recaudacion_pago_detalle to authenticated;
grant select, insert, update, delete on public.recaudacion_auxiliar_banco to authenticated;
grant select on public.recaudacion_bitacora to authenticated;

grant select on public.vw_recaudacion_pagos to authenticated, service_role;
grant select on public.vw_recaudacion_pago_detalle to authenticated, service_role;
grant select on public.vw_recaudacion_auxiliar_banco_pendiente to authenticated, service_role;

commit;
