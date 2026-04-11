-- Reportes contables multimoneda (CRC/USD) desde asientos_lineas confirmados.
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.reporte_asientos_por_tipo(bigint, date, date);
create or replace function public.reporte_asientos_por_tipo(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  tipo_id bigint,
  tipo_codigo text,
  tipo_nombre text,
  cantidad_asientos bigint,
  total_debito_crc numeric,
  total_credito_crc numeric,
  total_debito_usd numeric,
  total_credito_usd numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as tipo_id,
    t.codigo as tipo_codigo,
    t.nombre as tipo_nombre,
    count(distinct a.id) as cantidad_asientos,
    coalesce(sum(l.debito_crc), 0) as total_debito_crc,
    coalesce(sum(l.credito_crc), 0) as total_credito_crc,
    coalesce(sum(l.debito_usd), 0) as total_debito_usd,
    coalesce(sum(l.credito_usd), 0) as total_credito_usd
  from public.asientos a
  join public.asiento_categorias c on c.id = a.categoria_id
  join public.asiento_tipos t on t.id = c.tipo_id
  left join public.asiento_lineas l on l.asiento_id = a.id
  where a.empresa_id = p_empresa_id
    and (
      current_user in ('postgres', 'service_role')
      or public.has_empresa_access(a.empresa_id)
    )
    and a.estado = 'CONFIRMADO'
    and (p_fecha_desde is null or a.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or a.fecha <= p_fecha_hasta)
  group by t.id, t.codigo, t.nombre
  order by t.codigo;
$$;

grant execute on function public.reporte_asientos_por_tipo(bigint, date, date) to authenticated;
grant execute on function public.reporte_asientos_por_tipo(bigint, date, date) to service_role;

drop function if exists public.reporte_asientos_por_tipo_detalle(bigint, date, date, bigint);
create or replace function public.reporte_asientos_por_tipo_detalle(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_tipo_id bigint default null
)
returns table (
  asiento_id bigint,
  numero_formato text,
  fecha date,
  estado text,
  tipo_id bigint,
  tipo_codigo text,
  tipo_nombre text,
  categoria_id bigint,
  categoria_codigo text,
  categoria_descripcion text,
  descripcion text,
  total_debito_crc numeric,
  total_credito_crc numeric,
  total_debito_usd numeric,
  total_credito_usd numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id as asiento_id,
    a.numero_formato,
    a.fecha,
    a.estado,
    t.id as tipo_id,
    t.codigo as tipo_codigo,
    t.nombre as tipo_nombre,
    c.id as categoria_id,
    c.codigo as categoria_codigo,
    c.descripcion as categoria_descripcion,
    a.descripcion,
    coalesce(sum(l.debito_crc), 0) as total_debito_crc,
    coalesce(sum(l.credito_crc), 0) as total_credito_crc,
    coalesce(sum(l.debito_usd), 0) as total_debito_usd,
    coalesce(sum(l.credito_usd), 0) as total_credito_usd
  from public.asientos a
  join public.asiento_categorias c on c.id = a.categoria_id
  join public.asiento_tipos t on t.id = c.tipo_id
  left join public.asiento_lineas l on l.asiento_id = a.id
  where a.empresa_id = p_empresa_id
    and (
      current_user in ('postgres', 'service_role')
      or public.has_empresa_access(a.empresa_id)
    )
    and a.estado = 'CONFIRMADO'
    and (p_fecha_desde is null or a.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or a.fecha <= p_fecha_hasta)
    and (p_tipo_id is null or t.id = p_tipo_id)
  group by
    a.id, a.numero_formato, a.fecha, a.estado,
    t.id, t.codigo, t.nombre,
    c.id, c.codigo, c.descripcion, a.descripcion
  order by a.fecha, a.id;
$$;

grant execute on function public.reporte_asientos_por_tipo_detalle(bigint, date, date, bigint) to authenticated;
grant execute on function public.reporte_asientos_por_tipo_detalle(bigint, date, date, bigint) to service_role;

create or replace function public.get_mayor_general_movimientos(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_cuenta_codigo text default null,
  p_moneda text default 'CRC'
)
returns table (
  empresa_id bigint,
  asiento_id bigint,
  fecha date,
  asiento text,
  categoria text,
  cuenta text,
  nombre text,
  detalle text,
  debe numeric,
  haber numeric,
  naturaleza text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_moneda text := upper(coalesce(p_moneda, 'CRC'));
begin
  if auth.uid() is null
     and current_user not in ('postgres', 'service_role')
  then
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
     and not public.has_permission(p_empresa_id, 'contabilidad', 'ver')
  then
    raise exception 'No tiene permisos para ver reportes contables';
  end if;

  if v_moneda not in ('CRC', 'USD') then
    v_moneda := 'CRC';
  end if;

  return query
  select
    a.empresa_id,
    a.id as asiento_id,
    a.fecha,
    a.numero_formato as asiento,
    coalesce(cat.codigo, '') as categoria,
    c.codigo as cuenta,
    c.nombre,
    a.descripcion as detalle,
    case when v_moneda = 'USD' then coalesce(l.debito_usd, 0) else coalesce(l.debito_crc, 0) end as debe,
    case when v_moneda = 'USD' then coalesce(l.credito_usd, 0) else coalesce(l.credito_crc, 0) end as haber,
    coalesce(c.naturaleza, 'DEBITO') as naturaleza
  from public.asiento_lineas l
  join public.asientos a on a.id = l.asiento_id
  join public.plan_cuentas_base c on c.id = l.cuenta_id
  left join public.asiento_categorias cat on cat.id = a.categoria_id
  where a.empresa_id = p_empresa_id
    and a.estado = 'CONFIRMADO'
    and (p_fecha_desde is null or a.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or a.fecha <= p_fecha_hasta)
    and (nullif(btrim(coalesce(p_cuenta_codigo, '')), '') is null or c.codigo = btrim(p_cuenta_codigo))
  order by c.codigo, a.fecha, a.id, l.linea;
end;
$$;

grant execute on function public.get_mayor_general_movimientos(bigint, date, date, text, text) to authenticated;
grant execute on function public.get_mayor_general_movimientos(bigint, date, date, text, text) to service_role;

commit;
