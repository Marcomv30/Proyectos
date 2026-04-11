begin;

create table if not exists public.bancos_conciliacion_diferencias (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  periodo_id bigint not null references public.bancos_conciliacion_periodos(id) on delete cascade,
  cuenta_banco_id bigint not null references public.cuentas_bancarias_empresa(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('comision', 'cargo', 'interes', 'ajuste')),
  sentido text not null check (sentido in ('resta', 'suma')),
  descripcion text not null,
  referencia text null,
  cuenta_contable_id bigint not null references public.plan_cuentas_empresa(id) on delete restrict,
  monto numeric(18,2) not null check (monto > 0),
  asiento_id bigint null references public.asientos(id) on delete set null,
  estado text not null default 'registrada' check (estado in ('registrada', 'anulada')),
  observacion_anulacion text null,
  anulado_en timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null
);

create index if not exists idx_bancos_conc_dif_periodo
  on public.bancos_conciliacion_diferencias(periodo_id, estado, fecha desc, id desc);

create index if not exists idx_bancos_conc_dif_cuenta
  on public.bancos_conciliacion_diferencias(empresa_id, cuenta_banco_id, fecha desc, id desc);

drop trigger if exists trg_bancos_conciliacion_diferencias_updated_at on public.bancos_conciliacion_diferencias;
create trigger trg_bancos_conciliacion_diferencias_updated_at
before update on public.bancos_conciliacion_diferencias
for each row execute function public.tg_set_updated_at_recaudacion();

create or replace view public.vw_bancos_conciliacion_diferencias as
select
  d.id,
  d.empresa_id,
  d.periodo_id,
  d.cuenta_banco_id,
  cb.codigo as cuenta_banco_codigo,
  cb.alias as cuenta_banco_alias,
  cb.moneda,
  d.fecha,
  d.tipo,
  d.sentido,
  d.descripcion,
  d.referencia,
  d.cuenta_contable_id,
  pc.codigo as cuenta_contable_codigo,
  pc.nombre as cuenta_contable_nombre,
  d.monto,
  d.asiento_id,
  a.numero_formato as asiento_numero,
  d.estado,
  d.observacion_anulacion,
  d.anulado_en,
  d.created_at,
  d.updated_at
from public.bancos_conciliacion_diferencias d
join public.cuentas_bancarias_empresa cb on cb.id = d.cuenta_banco_id
join public.plan_cuentas_empresa pc on pc.id = d.cuenta_contable_id
left join public.asientos a on a.id = d.asiento_id;

grant select on public.vw_bancos_conciliacion_diferencias to authenticated, service_role;

alter table public.bancos_conciliacion_diferencias enable row level security;

drop policy if exists bancos_conciliacion_diferencias_select on public.bancos_conciliacion_diferencias;
create policy bancos_conciliacion_diferencias_select
on public.bancos_conciliacion_diferencias
for select
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'ver'));

drop policy if exists bancos_conciliacion_diferencias_write on public.bancos_conciliacion_diferencias;
create policy bancos_conciliacion_diferencias_write
on public.bancos_conciliacion_diferencias
for all
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'editar'))
with check (public.has_permission(empresa_id, 'bancos', 'editar'));

grant select, insert, update, delete on public.bancos_conciliacion_diferencias to authenticated;

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
      select sum(case when a.estado_conciliacion <> 'anulado' then a.monto else 0 end)
      from public.vw_recaudacion_auxiliar_banco a
      where a.empresa_id = v_periodo.empresa_id
        and a.cuenta_banco_id = v_periodo.cuenta_banco_id
        and a.fecha_movimiento between v_periodo.fecha_desde and v_periodo.fecha_hasta
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

grant execute on function public.recalcular_bancos_conciliacion_periodo(bigint) to authenticated, service_role;

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

  insert into public.bancos_conciliacion_periodos(
    empresa_id, cuenta_banco_id, fecha_desde, fecha_hasta,
    saldo_libros, saldo_banco, diferencia, observacion,
    estado, created_by, updated_by
  )
  values (
    p_empresa_id, p_cuenta_banco_id, p_fecha_desde, p_fecha_hasta,
    0,
    round(coalesce(p_saldo_banco, 0), 2),
    0,
    p_observacion, 'borrador', v_user, v_user
  )
  on conflict (empresa_id, cuenta_banco_id, fecha_desde, fecha_hasta)
  do update set
    saldo_banco = excluded.saldo_banco,
    observacion = excluded.observacion,
    updated_at = now(),
    updated_by = v_user
  returning id into v_id;

  perform public.recalcular_bancos_conciliacion_periodo(v_id);
  return v_id;
end;
$$;

create or replace function public.registrar_bancos_conciliacion_diferencia(
  p_empresa_id bigint,
  p_periodo_id bigint,
  p_cuenta_banco_id bigint,
  p_fecha date,
  p_tipo text,
  p_sentido text,
  p_descripcion text,
  p_referencia text default null,
  p_cuenta_contable_id bigint default null,
  p_monto numeric default 0
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_periodo public.bancos_conciliacion_periodos%rowtype;
  v_cuenta_banco_emp bigint;
  v_cuenta_banco_base bigint;
  v_cuenta_detalle_base bigint;
  v_periodo_fiscal_id bigint;
  v_seq integer;
  v_year text;
  v_numero_fmt text;
  v_asiento_id bigint;
  v_diferencia_id bigint;
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;
  if p_empresa_id is null or p_periodo_id is null or p_cuenta_banco_id is null or p_fecha is null or coalesce(trim(p_descripcion), '') = '' then
    raise exception 'empresa_periodo_cuenta_fecha_descripcion_requeridos';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'monto_invalido';
  end if;
  if p_tipo not in ('comision', 'cargo', 'interes', 'ajuste') then
    raise exception 'tipo_diferencia_invalido';
  end if;
  if p_sentido not in ('resta', 'suma') then
    raise exception 'sentido_diferencia_invalido';
  end if;

  select * into v_periodo
  from public.bancos_conciliacion_periodos
  where id = p_periodo_id
  for update;

  if not found then
    raise exception 'periodo_no_encontrado';
  end if;
  if v_periodo.empresa_id <> p_empresa_id or v_periodo.cuenta_banco_id <> p_cuenta_banco_id then
    raise exception 'periodo_cuenta_no_coinciden';
  end if;
  if p_fecha < v_periodo.fecha_desde or p_fecha > v_periodo.fecha_hasta then
    raise exception 'fecha_fuera_del_periodo';
  end if;

  select cb.cuenta_contable_id
    into v_cuenta_banco_emp
  from public.cuentas_bancarias_empresa cb
  where cb.id = p_cuenta_banco_id
    and cb.empresa_id = p_empresa_id;

  if v_cuenta_banco_emp is null then
    raise exception 'cuenta_bancaria_no_encontrada';
  end if;

  if p_cuenta_contable_id is null then
    raise exception 'cuenta_contable_requerida';
  end if;

  select cuenta_base_id into v_cuenta_banco_base
  from public.plan_cuentas_empresa
  where id = v_cuenta_banco_emp
    and empresa_id = p_empresa_id;

  select cuenta_base_id into v_cuenta_detalle_base
  from public.plan_cuentas_empresa
  where id = p_cuenta_contable_id
    and empresa_id = p_empresa_id;

  if v_cuenta_banco_base is null then
    raise exception 'cuenta_banco_sin_base';
  end if;
  if v_cuenta_detalle_base is null then
    raise exception 'cuenta_contable_sin_base';
  end if;

  select id into v_periodo_fiscal_id
  from public.periodos_fiscales
  where empresa_id = p_empresa_id
    and fecha_inicio <= p_fecha
    and fecha_fin >= p_fecha
  limit 1;

  if v_periodo_fiscal_id is null then
    raise exception 'periodo_fiscal_no_encontrado';
  end if;

  v_year := extract(year from p_fecha)::text;
  select coalesce(max(nullif(regexp_replace(numero_formato, '^BAN-DIF-(\\d+)-\\d{4}$', '\\1'), '')::integer), 0) + 1
    into v_seq
  from public.asientos
  where empresa_id = p_empresa_id
    and numero_formato like 'BAN-DIF-%-' || v_year;

  v_numero_fmt := 'BAN-DIF-' || lpad(v_seq::text, 3, '0') || '-' || v_year;

  insert into public.asientos (
    empresa_id, periodo_id, fecha, descripcion, numero_formato, estado
  ) values (
    p_empresa_id,
    v_periodo_fiscal_id,
    p_fecha,
    'Diferencia bancaria ' || upper(p_tipo) || ' - ' || coalesce(trim(p_descripcion), 'Sin detalle'),
    v_numero_fmt,
    'CONFIRMADO'
  )
  returning id into v_asiento_id;

  if p_sentido = 'resta' then
    insert into public.asiento_lineas (asiento_id, cuenta_id, debito_crc, credito_crc, debito_usd, credito_usd, descripcion, linea)
    values
      (v_asiento_id, v_cuenta_detalle_base, round(p_monto, 2), 0, 0, 0, 'Diferencia bancaria - contrapartida', 1),
      (v_asiento_id, v_cuenta_banco_base, 0, round(p_monto, 2), 0, 0, 'Diferencia bancaria - banco', 2);
  else
    insert into public.asiento_lineas (asiento_id, cuenta_id, debito_crc, credito_crc, debito_usd, credito_usd, descripcion, linea)
    values
      (v_asiento_id, v_cuenta_banco_base, round(p_monto, 2), 0, 0, 0, 'Diferencia bancaria - banco', 1),
      (v_asiento_id, v_cuenta_detalle_base, 0, round(p_monto, 2), 0, 0, 'Diferencia bancaria - contrapartida', 2);
  end if;

  perform public.actualizar_saldos_asiento(v_asiento_id::integer);

  insert into public.bancos_conciliacion_diferencias (
    empresa_id, periodo_id, cuenta_banco_id, fecha, tipo, sentido,
    descripcion, referencia, cuenta_contable_id, monto, asiento_id, estado, created_by, updated_by
  ) values (
    p_empresa_id, p_periodo_id, p_cuenta_banco_id, p_fecha, p_tipo, p_sentido,
    trim(p_descripcion), nullif(trim(coalesce(p_referencia, '')), ''), p_cuenta_contable_id, round(p_monto, 2),
    v_asiento_id, 'registrada', v_user, v_user
  )
  returning id into v_diferencia_id;

  perform public.recalcular_bancos_conciliacion_periodo(p_periodo_id);
  return v_diferencia_id;
end;
$$;

create or replace function public.deshacer_bancos_conciliacion_diferencia(
  p_diferencia_id bigint,
  p_observacion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.bancos_conciliacion_diferencias%rowtype;
begin
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;
  if p_diferencia_id is null then
    raise exception 'diferencia_requerida';
  end if;

  select * into v_row
  from public.bancos_conciliacion_diferencias
  where id = p_diferencia_id
  for update;

  if not found then
    raise exception 'diferencia_no_encontrada';
  end if;
  if v_row.estado = 'anulada' then
    return;
  end if;

  update public.bancos_conciliacion_diferencias
  set
    estado = 'anulada',
    observacion_anulacion = nullif(trim(coalesce(p_observacion, '')), ''),
    anulado_en = now(),
    updated_at = now(),
    updated_by = v_user
  where id = p_diferencia_id;

  if v_row.asiento_id is not null then
    update public.asientos
    set estado = 'ANULADO'
    where id = v_row.asiento_id
      and estado <> 'ANULADO';
  end if;

  perform public.recalcular_bancos_conciliacion_periodo(v_row.periodo_id);
end;
$$;

grant execute on function public.guardar_bancos_conciliacion_periodo(bigint, bigint, date, date, numeric, text) to authenticated, service_role;
grant execute on function public.registrar_bancos_conciliacion_diferencia(bigint, bigint, bigint, date, text, text, text, text, bigint, numeric) to authenticated, service_role;
grant execute on function public.deshacer_bancos_conciliacion_diferencia(bigint, text) to authenticated, service_role;

commit;
