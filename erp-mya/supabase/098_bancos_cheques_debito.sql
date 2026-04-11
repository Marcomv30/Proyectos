begin;

create table if not exists public.bancos_cheques_debito (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  cuenta_banco_id bigint not null references public.cuentas_bancarias_empresa(id) on delete restrict,
  tercero_id bigint null references public.terceros(id) on delete set null,
  fecha_movimiento date not null,
  tipo_movimiento text not null check (tipo_movimiento in ('cheque', 'nota_debito', 'transferencia_emitida', 'otro')),
  moneda text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  monto numeric(18,2) not null check (monto > 0),
  referencia text null,
  detalle text not null,
  cuenta_principal_id bigint not null references public.plan_cuentas_empresa(id) on delete restrict,
  asiento_id bigint null references public.asientos(id) on delete set null,
  estado text not null default 'registrado' check (estado in ('registrado', 'anulado')),
  estado_conciliacion text not null default 'pendiente' check (estado_conciliacion in ('pendiente', 'conciliado', 'anulado')),
  conciliado_en timestamptz null,
  observacion_anulacion text null,
  anulado_en timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null
);

create index if not exists idx_bancos_cheques_lookup
  on public.bancos_cheques_debito(empresa_id, cuenta_banco_id, fecha_movimiento desc, id desc);

drop trigger if exists trg_bancos_cheques_debito_updated_at on public.bancos_cheques_debito;
create trigger trg_bancos_cheques_debito_updated_at
before update on public.bancos_cheques_debito
for each row execute function public.tg_set_updated_at_recaudacion();

alter table public.bancos_cheques_debito enable row level security;

drop policy if exists bancos_cheques_debito_select on public.bancos_cheques_debito;
create policy bancos_cheques_debito_select
on public.bancos_cheques_debito
for select
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'ver'));

drop policy if exists bancos_cheques_debito_write on public.bancos_cheques_debito;
create policy bancos_cheques_debito_write
on public.bancos_cheques_debito
for all
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'editar'))
with check (public.has_permission(empresa_id, 'bancos', 'editar'));

grant select, insert, update, delete on public.bancos_cheques_debito to authenticated;

create table if not exists public.bancos_cheques_debito_lineas (
  id bigserial primary key,
  movimiento_id bigint not null references public.bancos_cheques_debito(id) on delete cascade,
  linea integer not null,
  cuenta_contable_id bigint not null references public.plan_cuentas_empresa(id) on delete restrict,
  detalle text null,
  debe numeric(18,2) not null default 0,
  haber numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  constraint bancos_cheq_deb_linea_unique unique (movimiento_id, linea),
  constraint bancos_cheq_deb_linea_monto_chk check (debe >= 0 and haber >= 0 and (debe > 0 or haber > 0))
);

create index if not exists idx_bancos_cheq_deb_lineas_mov
  on public.bancos_cheques_debito_lineas(movimiento_id, linea);

drop trigger if exists trg_bancos_cheques_debito_lineas_updated_at on public.bancos_cheques_debito_lineas;
create trigger trg_bancos_cheques_debito_lineas_updated_at
before update on public.bancos_cheques_debito_lineas
for each row execute function public.tg_set_updated_at_recaudacion();

alter table public.bancos_cheques_debito_lineas enable row level security;

drop policy if exists bancos_cheques_debito_lineas_select on public.bancos_cheques_debito_lineas;
create policy bancos_cheques_debito_lineas_select
on public.bancos_cheques_debito_lineas
for select
to authenticated
using (
  exists (
    select 1
    from public.bancos_cheques_debito m
    where m.id = movimiento_id
      and public.has_permission(m.empresa_id, 'bancos', 'ver')
  )
);

drop policy if exists bancos_cheques_debito_lineas_write on public.bancos_cheques_debito_lineas;
create policy bancos_cheques_debito_lineas_write
on public.bancos_cheques_debito_lineas
for all
to authenticated
using (
  exists (
    select 1
    from public.bancos_cheques_debito m
    where m.id = movimiento_id
      and public.has_permission(m.empresa_id, 'bancos', 'editar')
  )
)
with check (
  exists (
    select 1
    from public.bancos_cheques_debito m
    where m.id = movimiento_id
      and public.has_permission(m.empresa_id, 'bancos', 'editar')
  )
);

grant select, insert, update, delete on public.bancos_cheques_debito_lineas to authenticated;

create or replace view public.vw_bancos_cheques_debito as
select
  b.id,
  b.empresa_id,
  b.cuenta_banco_id,
  cb.codigo as cuenta_banco_codigo,
  cb.alias as cuenta_banco_alias,
  cb.banco_nombre,
  b.tercero_id,
  t.razon_social as tercero_nombre,
  b.fecha_movimiento,
  b.tipo_movimiento,
  b.moneda,
  b.monto,
  b.referencia,
  b.detalle,
  b.cuenta_principal_id,
  pce.codigo as cuenta_principal_codigo,
  pce.nombre as cuenta_principal_nombre,
  b.asiento_id,
  a.numero_formato as asiento_numero,
  b.estado,
  b.estado_conciliacion,
  b.conciliado_en,
  b.created_at
from public.bancos_cheques_debito b
join public.cuentas_bancarias_empresa cb on cb.id = b.cuenta_banco_id
join public.plan_cuentas_empresa pce on pce.id = b.cuenta_principal_id
left join public.terceros t on t.id = b.tercero_id
left join public.asientos a on a.id = b.asiento_id;

grant select on public.vw_bancos_cheques_debito to authenticated, service_role;

create or replace view public.vw_bancos_cheques_debito_lineas as
select
  l.id,
  l.movimiento_id,
  l.linea,
  l.cuenta_contable_id,
  pce.codigo as cuenta_codigo,
  pce.nombre as cuenta_nombre,
  l.detalle,
  l.debe,
  l.haber,
  l.created_at
from public.bancos_cheques_debito_lineas l
join public.plan_cuentas_empresa pce on pce.id = l.cuenta_contable_id;

grant select on public.vw_bancos_cheques_debito_lineas to authenticated, service_role;

create or replace function public.registrar_bancos_cheque_debito_compuesto(
  p_empresa_id bigint,
  p_cuenta_banco_id bigint,
  p_fecha_movimiento date,
  p_tipo_movimiento text,
  p_moneda text,
  p_referencia text default null,
  p_detalle text default null,
  p_lineas jsonb default '[]'::jsonb,
  p_tercero_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_usuario_id integer;
  v_moneda text := upper(coalesce(p_moneda, 'CRC'));
  v_tc numeric(18,6);
  v_cuenta_banco_emp bigint;
  v_cuenta_banco_base bigint;
  v_principal_cuenta_id bigint;
  v_periodo_id bigint;
  v_categoria_id bigint;
  v_seq integer;
  v_year text;
  v_numero_fmt text;
  v_asiento_id bigint;
  v_movimiento_id bigint;
  v_total numeric(18,2) := 0;
  v_detalle text := nullif(trim(coalesce(p_detalle, '')), '');
  v_doc text := nullif(trim(coalesce(p_referencia, '')), '');
  v_linea record;
  v_line_num integer := 1;
  v_cuenta_base_linea bigint;
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;

  select u.id
    into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = v_user
  limit 1;

  if p_empresa_id is null or p_cuenta_banco_id is null or p_fecha_movimiento is null then
    raise exception 'empresa_cuenta_fecha_requeridos';
  end if;

  if p_tipo_movimiento not in ('cheque', 'nota_debito', 'transferencia_emitida', 'otro') then
    raise exception 'tipo_movimiento_invalido';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'lineas_requeridas';
  end if;

  select cbe.cuenta_contable_id, pce.cuenta_base_id
    into v_cuenta_banco_emp, v_cuenta_banco_base
  from public.cuentas_bancarias_empresa cbe
  join public.plan_cuentas_empresa pce on pce.id = cbe.cuenta_contable_id
  where cbe.id = p_cuenta_banco_id
    and cbe.empresa_id = p_empresa_id
    and cbe.activo = true;

  if v_cuenta_banco_emp is null or v_cuenta_banco_base is null then
    raise exception 'cuenta_bancaria_contable_invalida';
  end if;

  for v_linea in
    select
      nullif((value->>'cuenta_contable_id')::bigint, 0) as cuenta_contable_id,
      round(coalesce((value->>'monto')::numeric, 0), 2) as monto,
      nullif(trim(coalesce(value->>'detalle', '')), '') as detalle
    from jsonb_array_elements(p_lineas)
  loop
    if v_linea.cuenta_contable_id is null or v_linea.monto <= 0 then
      continue;
    end if;

    if v_principal_cuenta_id is null then
      v_principal_cuenta_id := v_linea.cuenta_contable_id;
    end if;
    v_total := v_total + v_linea.monto;
  end loop;

  v_total := round(v_total, 2);
  if v_total <= 0 then
    raise exception 'lineas_sin_monto';
  end if;

  select id into v_periodo_id
  from public.periodos_contables
  where empresa_id = p_empresa_id
    and p_fecha_movimiento between fecha_inicio and fecha_fin
  order by fecha_inicio desc
  limit 1;

  if v_periodo_id is null then
    raise exception 'periodo_fiscal_no_encontrado';
  end if;

  select c.id
    into v_categoria_id
  from public.asiento_categorias c
  where coalesce(c.activo, true) = true
  order by c.id
  limit 1;

  select t.venta
    into v_tc
  from public.tipo_cambio_historial t
  where t.empresa_id = p_empresa_id
    and t.fecha = p_fecha_movimiento
  order by t.created_at desc
  limit 1;

  if coalesce(v_tc, 0) <= 0 then
    raise exception 'tipo_cambio_no_encontrado';
  end if;

  v_year := to_char(p_fecha_movimiento, 'YYYY');
  select coalesce(max(nullif(regexp_replace(numero_formato, '^BAN-EGR-(\d+)-\d{4}$', '\1'), '')::integer), 0) + 1
    into v_seq
  from public.asientos
  where empresa_id = p_empresa_id
    and numero_formato like 'BAN-EGR-%-' || v_year;

  v_numero_fmt := 'BAN-EGR-' || lpad(v_seq::text, 3, '0') || '-' || v_year;

  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, origen, usuario_id, numero_formato
  ) values (
    p_empresa_id, v_categoria_id, p_fecha_movimiento,
    coalesce(v_detalle, 'Cheque / nota de debito bancaria'),
    v_moneda, v_tc, 'CONFIRMADO', 'MANUAL', v_usuario_id, v_numero_fmt
  )
  returning id into v_asiento_id;

  insert into public.bancos_cheques_debito (
    empresa_id, cuenta_banco_id, tercero_id, fecha_movimiento, tipo_movimiento, moneda, monto,
    referencia, detalle, cuenta_principal_id, asiento_id, estado, estado_conciliacion,
    created_by, updated_by
  ) values (
    p_empresa_id, p_cuenta_banco_id, p_tercero_id, p_fecha_movimiento, p_tipo_movimiento, coalesce(p_moneda, 'CRC'), v_total,
    v_doc, coalesce(v_detalle, 'Cheque / nota de debito bancaria'), v_principal_cuenta_id, v_asiento_id, 'registrado', 'pendiente',
    v_user, v_user
  )
  returning id into v_movimiento_id;

  for v_linea in
    select
      nullif((value->>'cuenta_contable_id')::bigint, 0) as cuenta_contable_id,
      round(coalesce((value->>'monto')::numeric, 0), 2) as monto,
      nullif(trim(coalesce(value->>'detalle', '')), '') as detalle
    from jsonb_array_elements(p_lineas)
  loop
    if v_linea.cuenta_contable_id is null or v_linea.monto <= 0 then
      continue;
    end if;

    select cuenta_base_id into v_cuenta_base_linea
    from public.plan_cuentas_empresa
    where id = v_linea.cuenta_contable_id
      and empresa_id = p_empresa_id
      and activo = true;

    if v_cuenta_base_linea is null then
      raise exception 'cuenta_contrapartida_invalida';
    end if;

    insert into public.bancos_cheques_debito_lineas (
      movimiento_id, linea, cuenta_contable_id, detalle, debe, haber, created_by, updated_by
    ) values (
      v_movimiento_id, v_line_num, v_linea.cuenta_contable_id,
      coalesce(v_linea.detalle, v_detalle, 'Cheque / nota de debito bancaria'),
      v_linea.monto, 0, v_user, v_user
    );

    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia,
      debito_crc, credito_crc, debito_usd, credito_usd
    ) values (
      v_asiento_id, v_line_num, v_cuenta_base_linea,
      coalesce(v_linea.detalle, v_detalle, 'Cheque / nota de debito bancaria'),
      v_doc,
      case when v_moneda = 'USD' then 0 else v_linea.monto end,
      0,
      case when v_moneda = 'USD' then v_linea.monto else 0 end,
      0
    );

    v_line_num := v_line_num + 1;
  end loop;

  insert into public.bancos_cheques_debito_lineas (
    movimiento_id, linea, cuenta_contable_id, detalle, debe, haber, created_by, updated_by
  ) values (
    v_movimiento_id, v_line_num, v_cuenta_banco_emp, coalesce(v_detalle, 'Cheque / nota de debito bancaria'), 0, v_total, v_user, v_user
  );

  insert into public.asiento_lineas (
    asiento_id, linea, cuenta_id, descripcion, referencia,
    debito_crc, credito_crc, debito_usd, credito_usd
  ) values (
    v_asiento_id, v_line_num, v_cuenta_banco_base,
    coalesce(v_detalle, 'Cheque / nota de debito bancaria'),
    v_doc,
    0,
    case when v_moneda = 'USD' then 0 else v_total end,
    0,
    case when v_moneda = 'USD' then v_total else 0 end
  );

  if to_regprocedure('public.registrar_recaudacion_bitacora(bigint,text,text,bigint,bigint,bigint,text)') is not null then
    perform public.registrar_recaudacion_bitacora(
      p_empresa_id,
      'BANCO_EGRESO_REGISTRADO',
      'bancos_cheques_debito',
      v_movimiento_id,
      null,
      null,
      coalesce(v_detalle, 'Cheque / nota de debito bancaria')
    );
  end if;

  return v_movimiento_id;
end;
$$;

grant execute on function public.registrar_bancos_cheque_debito_compuesto(bigint, bigint, date, text, text, text, text, jsonb, bigint) to authenticated;

create or replace function public.marcar_bancos_cheque_debito_conciliado(
  p_movimiento_id bigint,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov public.bancos_cheques_debito%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;

  select * into v_mov
  from public.bancos_cheques_debito
  where id = p_movimiento_id
  for update;

  if not found then
    raise exception 'movimiento_no_encontrado';
  end if;

  if not public.has_permission(v_mov.empresa_id, 'bancos', 'editar') then
    raise exception 'sin_permiso';
  end if;

  if v_mov.estado = 'anulado' then
    raise exception 'movimiento_anulado';
  end if;

  update public.bancos_cheques_debito
  set estado_conciliacion = 'conciliado',
      conciliado_en = now(),
      updated_at = now(),
      updated_by = v_user
  where id = p_movimiento_id;

  if to_regprocedure('public.registrar_recaudacion_bitacora(bigint,text,text,bigint,bigint,bigint,text)') is not null then
    perform public.registrar_recaudacion_bitacora(
      v_mov.empresa_id,
      'BANCO_EGRESO_CONCILIADO',
      'bancos_cheques_debito',
      p_movimiento_id,
      null,
      null,
      coalesce(nullif(trim(coalesce(p_detalle, '')), ''), 'Movimiento conciliado desde modulo Bancos')
    );
  end if;
end;
$$;

grant execute on function public.marcar_bancos_cheque_debito_conciliado(bigint, text) to authenticated;

create or replace function public.deshacer_bancos_cheque_debito_conciliacion(
  p_movimiento_id bigint,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov public.bancos_cheques_debito%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;

  select * into v_mov
  from public.bancos_cheques_debito
  where id = p_movimiento_id
  for update;

  if not found then
    raise exception 'movimiento_no_encontrado';
  end if;

  if not public.has_permission(v_mov.empresa_id, 'bancos', 'editar') then
    raise exception 'sin_permiso';
  end if;

  if v_mov.estado = 'anulado' then
    raise exception 'movimiento_anulado';
  end if;

  update public.bancos_cheques_debito
  set estado_conciliacion = 'pendiente',
      conciliado_en = null,
      updated_at = now(),
      updated_by = v_user
  where id = p_movimiento_id;

  if to_regprocedure('public.registrar_recaudacion_bitacora(bigint,text,text,bigint,bigint,bigint,text)') is not null then
    perform public.registrar_recaudacion_bitacora(
      v_mov.empresa_id,
      'BANCO_EGRESO_DESCONCILIADO',
      'bancos_cheques_debito',
      p_movimiento_id,
      null,
      null,
      coalesce(nullif(trim(coalesce(p_detalle, '')), ''), 'Movimiento devuelto a pendiente desde modulo Bancos')
    );
  end if;
end;
$$;

grant execute on function public.deshacer_bancos_cheque_debito_conciliacion(bigint, text) to authenticated;

create or replace view public.vw_bancos_movimientos_conciliacion as
select
  'cobro'::text as origen_tipo,
  a.id as origen_id,
  a.empresa_id,
  a.cuenta_banco_id,
  a.fecha_movimiento,
  a.moneda,
  a.monto,
  a.referencia,
  ('Cobro cliente - #' || a.pago_id::text || coalesce(' - ' || a.tercero_nombre, ''))::text as detalle,
  a.estado_conciliacion,
  a.estado_pago as estado_origen,
  a.pago_id,
  null::bigint as cierre_caja_id,
  a.tercero_id,
  a.tercero_nombre,
  a.asiento_id
from public.vw_recaudacion_auxiliar_banco a

union all

select
  'deposito_ingreso'::text as origen_tipo,
  b.id as origen_id,
  b.empresa_id,
  b.cuenta_banco_id,
  b.fecha_movimiento,
  b.moneda,
  b.monto,
  b.referencia,
  b.detalle,
  b.estado_conciliacion,
  b.estado as estado_origen,
  null::bigint as pago_id,
  b.cierre_caja_id,
  b.tercero_id,
  b.tercero_nombre,
  b.asiento_id
from public.vw_bancos_depositos_ingresos b
where b.estado <> 'anulado'

union all

select
  'egreso_bancario'::text as origen_tipo,
  e.id as origen_id,
  e.empresa_id,
  e.cuenta_banco_id,
  e.fecha_movimiento,
  e.moneda,
  (e.monto * -1)::numeric(18,2) as monto,
  e.referencia,
  e.detalle,
  e.estado_conciliacion,
  e.estado as estado_origen,
  null::bigint as pago_id,
  null::bigint as cierre_caja_id,
  e.tercero_id,
  e.tercero_nombre,
  e.asiento_id
from public.vw_bancos_cheques_debito e
where e.estado <> 'anulado';

grant select on public.vw_bancos_movimientos_conciliacion to authenticated, service_role;

commit;
