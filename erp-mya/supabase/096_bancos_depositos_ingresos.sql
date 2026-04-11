begin;

create table if not exists public.bancos_depositos_ingresos (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  cuenta_banco_id bigint not null references public.cuentas_bancarias_empresa(id) on delete restrict,
  cierre_caja_id bigint null references public.recaudacion_cierres_caja(id) on delete set null,
  tercero_id bigint null references public.terceros(id) on delete set null,
  fecha_movimiento date not null,
  tipo_movimiento text not null check (tipo_movimiento in ('deposito_caja', 'ingreso_directo', 'transferencia_recibida', 'interes_bancario', 'ajuste_favor', 'otro')),
  moneda text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  monto numeric(18,2) not null check (monto > 0),
  referencia text null,
  detalle text not null,
  cuenta_contrapartida_id bigint not null references public.plan_cuentas_empresa(id) on delete restrict,
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

create index if not exists idx_bancos_dep_ing_lookup
  on public.bancos_depositos_ingresos(empresa_id, cuenta_banco_id, fecha_movimiento desc, id desc);

create index if not exists idx_bancos_dep_ing_cierre
  on public.bancos_depositos_ingresos(cierre_caja_id)
  where cierre_caja_id is not null and estado <> 'anulado';

drop trigger if exists trg_bancos_depositos_ingresos_updated_at on public.bancos_depositos_ingresos;
create trigger trg_bancos_depositos_ingresos_updated_at
before update on public.bancos_depositos_ingresos
for each row execute function public.tg_set_updated_at_recaudacion();

create or replace view public.vw_bancos_depositos_ingresos as
select
  b.id,
  b.empresa_id,
  b.cuenta_banco_id,
  cb.codigo as cuenta_banco_codigo,
  cb.alias as cuenta_banco_alias,
  cb.banco_nombre,
  b.cierre_caja_id,
  b.tercero_id,
  t.razon_social as tercero_nombre,
  b.fecha_movimiento,
  b.tipo_movimiento,
  b.moneda,
  b.monto,
  b.referencia,
  b.detalle,
  b.cuenta_contrapartida_id,
  pce.codigo as cuenta_contrapartida_codigo,
  pce.nombre as cuenta_contrapartida_nombre,
  b.asiento_id,
  a.numero_formato as asiento_numero,
  b.estado,
  b.estado_conciliacion,
  b.conciliado_en,
  b.created_at
from public.bancos_depositos_ingresos b
join public.cuentas_bancarias_empresa cb on cb.id = b.cuenta_banco_id
join public.plan_cuentas_empresa pce on pce.id = b.cuenta_contrapartida_id
left join public.terceros t on t.id = b.tercero_id
left join public.asientos a on a.id = b.asiento_id;

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
where b.estado <> 'anulado';

grant select on public.vw_bancos_depositos_ingresos to authenticated, service_role;
grant select on public.vw_bancos_movimientos_conciliacion to authenticated, service_role;

alter table public.bancos_depositos_ingresos enable row level security;

drop policy if exists bancos_depositos_ingresos_select on public.bancos_depositos_ingresos;
create policy bancos_depositos_ingresos_select
on public.bancos_depositos_ingresos
for select
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'ver'));

drop policy if exists bancos_depositos_ingresos_write on public.bancos_depositos_ingresos;
create policy bancos_depositos_ingresos_write
on public.bancos_depositos_ingresos
for all
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'editar'))
with check (public.has_permission(empresa_id, 'bancos', 'editar'));

grant select, insert, update, delete on public.bancos_depositos_ingresos to authenticated;

create or replace function public.recalcular_bancos_conciliacion_periodo(
  p_periodo_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo public.bancos_conciliacion_periodos%rowtype;
  v_saldo_libros numeric(18,2);
  v_user uuid := auth.uid();
begin
  if p_periodo_id is null then
    raise exception 'periodo_requerido';
  end if;

  select * into v_periodo
  from public.bancos_conciliacion_periodos
  where id = p_periodo_id
  for update;

  if not found then
    raise exception 'periodo_no_encontrado';
  end if;

  select
    coalesce((
      select sum(case when m.estado_conciliacion <> 'anulado' then m.monto else 0 end)
      from public.vw_bancos_movimientos_conciliacion m
      where m.empresa_id = v_periodo.empresa_id
        and m.cuenta_banco_id = v_periodo.cuenta_banco_id
        and m.fecha_movimiento between v_periodo.fecha_desde and v_periodo.fecha_hasta
    ), 0)
    +
    coalesce((
      select sum(case when d.sentido = 'suma' then d.monto else -d.monto end)
      from public.bancos_conciliacion_diferencias d
      where d.periodo_id = v_periodo.id
        and d.estado = 'registrada'
    ), 0)
  into v_saldo_libros;

  update public.bancos_conciliacion_periodos
  set
    saldo_libros = round(coalesce(v_saldo_libros, 0), 2),
    diferencia = round(coalesce(v_saldo_libros, 0) - coalesce(saldo_banco, 0), 2),
    updated_at = now(),
    updated_by = coalesce(v_user, updated_by)
  where id = v_periodo.id;
end;
$$;

create or replace function public.registrar_bancos_deposito_ingreso(
  p_empresa_id bigint,
  p_cuenta_banco_id bigint,
  p_fecha_movimiento date,
  p_tipo_movimiento text,
  p_moneda text,
  p_monto numeric,
  p_referencia text default null,
  p_detalle text default null,
  p_cuenta_contrapartida_id bigint default null,
  p_tercero_id bigint default null,
  p_cierre_caja_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cuenta_banco_emp bigint;
  v_cuenta_banco_base bigint;
  v_cuenta_contra_base bigint;
  v_periodo_fiscal_id bigint;
  v_seq integer;
  v_year text;
  v_numero_fmt text;
  v_asiento_id bigint;
  v_id bigint;
  v_cierre public.recaudacion_cierres_caja%rowtype;
  v_monto numeric(18,2);
  v_detalle text;
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;
  if p_empresa_id is null or p_cuenta_banco_id is null or p_fecha_movimiento is null or p_cuenta_contrapartida_id is null then
    raise exception 'empresa_cuenta_fecha_contrapartida_requeridos';
  end if;
  if p_tipo_movimiento not in ('deposito_caja', 'ingreso_directo', 'transferencia_recibida', 'interes_bancario', 'ajuste_favor', 'otro') then
    raise exception 'tipo_movimiento_invalido';
  end if;

  v_monto := round(coalesce(p_monto, 0), 2);
  v_detalle := nullif(trim(coalesce(p_detalle, '')), '');

  if p_tipo_movimiento = 'deposito_caja' then
    if p_cierre_caja_id is null then
      raise exception 'cierre_caja_requerido';
    end if;
    select * into v_cierre
    from public.recaudacion_cierres_caja
    where id = p_cierre_caja_id
      and empresa_id = p_empresa_id
      and estado = 'cerrado';

    if not found then
      raise exception 'cierre_caja_no_encontrado';
    end if;

    if exists (
      select 1
      from public.bancos_depositos_ingresos x
      where x.cierre_caja_id = p_cierre_caja_id
        and x.estado <> 'anulado'
    ) then
      raise exception 'cierre_caja_ya_depositado';
    end if;

    v_monto := round(coalesce(v_cierre.efectivo_liquidar, 0), 2);
    if v_monto <= 0 then
      raise exception 'cierre_caja_sin_efectivo_para_depositar';
    end if;

    if v_detalle is null then
      v_detalle := 'Deposito de cierre de caja #' || v_cierre.id::text;
    end if;
  else
    if v_monto <= 0 then
      raise exception 'monto_invalido';
    end if;
    if v_detalle is null then
      v_detalle := 'Ingreso bancario directo';
    end if;
  end if;

  select cb.cuenta_contable_id
    into v_cuenta_banco_emp
  from public.cuentas_bancarias_empresa cb
  where cb.id = p_cuenta_banco_id
    and cb.empresa_id = p_empresa_id
    and cb.activo = true;

  if v_cuenta_banco_emp is null then
    raise exception 'cuenta_bancaria_no_encontrada';
  end if;

  select cuenta_base_id into v_cuenta_banco_base
  from public.plan_cuentas_empresa
  where id = v_cuenta_banco_emp and empresa_id = p_empresa_id;

  select cuenta_base_id into v_cuenta_contra_base
  from public.plan_cuentas_empresa
  where id = p_cuenta_contrapartida_id and empresa_id = p_empresa_id;

  if v_cuenta_banco_base is null then
    raise exception 'cuenta_banco_sin_base';
  end if;
  if v_cuenta_contra_base is null then
    raise exception 'cuenta_contrapartida_sin_base';
  end if;

  select id into v_periodo_fiscal_id
  from public.periodos_fiscales
  where empresa_id = p_empresa_id
    and fecha_inicio <= p_fecha_movimiento
    and fecha_fin >= p_fecha_movimiento
  limit 1;

  if v_periodo_fiscal_id is null then
    raise exception 'periodo_fiscal_no_encontrado';
  end if;

  v_year := extract(year from p_fecha_movimiento)::text;
  select coalesce(max(nullif(regexp_replace(numero_formato, '^BAN-ING-(\\d+)-\\d{4}$', '\\1'), '')::integer), 0) + 1
    into v_seq
  from public.asientos
  where empresa_id = p_empresa_id
    and numero_formato like 'BAN-ING-%-' || v_year;

  v_numero_fmt := 'BAN-ING-' || lpad(v_seq::text, 3, '0') || '-' || v_year;

  insert into public.asientos (
    empresa_id, periodo_id, fecha, descripcion, numero_formato, estado
  ) values (
    p_empresa_id,
    v_periodo_fiscal_id,
    p_fecha_movimiento,
    v_detalle,
    v_numero_fmt,
    'CONFIRMADO'
  )
  returning id into v_asiento_id;

  insert into public.asiento_lineas (asiento_id, cuenta_id, debito_crc, credito_crc, debito_usd, credito_usd, descripcion, linea)
  values
    (v_asiento_id, v_cuenta_banco_base, round(v_monto, 2), 0, 0, 0, v_detalle, 1),
    (v_asiento_id, v_cuenta_contra_base, 0, round(v_monto, 2), 0, 0, v_detalle, 2);

  perform public.actualizar_saldos_asiento(v_asiento_id::integer);

  insert into public.bancos_depositos_ingresos (
    empresa_id, cuenta_banco_id, cierre_caja_id, tercero_id, fecha_movimiento,
    tipo_movimiento, moneda, monto, referencia, detalle, cuenta_contrapartida_id,
    asiento_id, estado, estado_conciliacion, created_by, updated_by
  ) values (
    p_empresa_id, p_cuenta_banco_id, p_cierre_caja_id, p_tercero_id, p_fecha_movimiento,
    p_tipo_movimiento, upper(coalesce(p_moneda, 'CRC')), v_monto, nullif(trim(coalesce(p_referencia, '')), ''), v_detalle,
    p_cuenta_contrapartida_id, v_asiento_id, 'registrado', 'pendiente', v_user, v_user
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.marcar_bancos_deposito_ingreso_conciliado(
  p_movimiento_id bigint,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'usuario_no_autenticado';
  end if;

  update public.bancos_depositos_ingresos
  set
    estado_conciliacion = 'conciliado',
    conciliado_en = now(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_movimiento_id
    and estado <> 'anulado';
end;
$$;

create or replace function public.deshacer_bancos_deposito_ingreso_conciliacion(
  p_movimiento_id bigint,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'usuario_no_autenticado';
  end if;

  update public.bancos_depositos_ingresos
  set
    estado_conciliacion = 'pendiente',
    conciliado_en = null,
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_movimiento_id
    and estado <> 'anulado';
end;
$$;

grant execute on function public.registrar_bancos_deposito_ingreso(bigint, bigint, date, text, text, numeric, text, text, bigint, bigint, bigint) to authenticated, service_role;
grant execute on function public.marcar_bancos_deposito_ingreso_conciliado(bigint, text) to authenticated, service_role;
grant execute on function public.deshacer_bancos_deposito_ingreso_conciliacion(bigint, text) to authenticated, service_role;

commit;
