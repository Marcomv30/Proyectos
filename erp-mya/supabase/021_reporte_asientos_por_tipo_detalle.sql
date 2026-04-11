-- Reporte detallado de asientos por tipo.
-- Ejecutar en SQL Editor con rol postgres.

begin;

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
  total_credito_crc numeric
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
    coalesce(sum(l.credito_crc), 0) as total_credito_crc
  from public.asientos a
  join public.asiento_categorias c on c.id = a.categoria_id
  join public.asiento_tipos t on t.id = c.tipo_id
  left join public.asiento_lineas l on l.asiento_id = a.id
  where a.empresa_id = p_empresa_id
    and public.has_empresa_access(a.empresa_id)
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

commit;

