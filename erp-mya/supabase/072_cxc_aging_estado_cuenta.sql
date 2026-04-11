-- CXC Fase 1.2
-- Aging consolidado y estado de cuenta por cliente (consulta/exportacion).
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.get_cxc_aging_totales(
  p_empresa_id bigint,
  p_fecha_corte date default current_date,
  p_moneda text default null,
  p_tercero_id bigint default null
)
returns table (
  moneda text,
  bucket text,
  docs integer,
  monto numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with d as (
    select *
    from public.get_cxc_documentos_cartera(
      p_empresa_id => p_empresa_id,
      p_fecha_corte => p_fecha_corte,
      p_tercero_id => p_tercero_id,
      p_moneda => p_moneda
    )
  )
  select
    d.moneda,
    d.bucket,
    count(*)::integer as docs,
    round(coalesce(sum(d.monto_pendiente), 0), 2)::numeric as monto
  from d
  group by d.moneda, d.bucket
  order by d.moneda, d.bucket;
end;
$$;

create or replace function public.get_cxc_estado_cuenta(
  p_empresa_id bigint,
  p_tercero_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default current_date,
  p_moneda text default null
)
returns table (
  fecha date,
  movimiento text,
  detalle text,
  referencia text,
  documento_id bigint,
  numero_documento text,
  moneda text,
  debito numeric,
  credito numeric,
  saldo numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fecha_desde date := p_fecha_desde;
  v_fecha_hasta date := coalesce(p_fecha_hasta, current_date);
  v_moneda text := case when p_moneda is null or btrim(p_moneda) = '' then null else upper(p_moneda) end;
  v_saldo_anterior numeric := 0;
begin
  if auth.uid() is null and current_user not in ('postgres', 'service_role') then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if p_tercero_id is null then
    raise exception 'Cliente requerido';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not public.has_empresa_access(p_empresa_id)
  then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not (
       public.has_permission(p_empresa_id, 'cxc', 'ver')
       or public.has_permission(p_empresa_id, 'cxc', 'editar')
     )
  then
    raise exception 'No tiene permisos para ver CXC';
  end if;

  with mov as (
    select
      d.fecha_emision as fecha,
      'DOCUMENTO'::text as movimiento,
      d.tipo_documento::text as detalle,
      d.referencia::text as referencia,
      d.id as documento_id,
      d.numero_documento::text as numero_documento,
      d.moneda::text as moneda,
      d.monto_original::numeric as debito,
      0::numeric as credito,
      1::integer as orden_tipo,
      d.id::bigint as orden_id
    from public.cxc_documentos d
    where d.empresa_id = p_empresa_id
      and d.tercero_id = p_tercero_id
      and d.estado <> 'anulado'
      and d.fecha_emision <= v_fecha_hasta
      and (v_moneda is null or d.moneda = v_moneda)

    union all

    select
      a.fecha_aplicacion as fecha,
      'APLICACION'::text as movimiento,
      a.tipo_aplicacion::text as detalle,
      coalesce(a.referencia, a.observaciones)::text as referencia,
      d.id as documento_id,
      d.numero_documento::text as numero_documento,
      d.moneda::text as moneda,
      0::numeric as debito,
      a.monto::numeric as credito,
      2::integer as orden_tipo,
      a.id::bigint as orden_id
    from public.cxc_aplicaciones a
    join public.cxc_documentos d on d.id = a.documento_id
    where a.empresa_id = p_empresa_id
      and d.tercero_id = p_tercero_id
      and a.estado = 'activo'
      and d.estado <> 'anulado'
      and a.fecha_aplicacion <= v_fecha_hasta
      and (v_moneda is null or d.moneda = v_moneda)
  )
  select round(coalesce(sum(m.debito - m.credito), 0), 2)
    into v_saldo_anterior
  from mov m
  where v_fecha_desde is not null
    and m.fecha < v_fecha_desde;

  if v_fecha_desde is not null then
    return query
    select
      v_fecha_desde as fecha,
      'SALDO_ANTERIOR'::text as movimiento,
      'Saldo anterior al periodo'::text as detalle,
      null::text as referencia,
      null::bigint as documento_id,
      null::text as numero_documento,
      coalesce(v_moneda, 'MIXTA')::text as moneda,
      0::numeric as debito,
      0::numeric as credito,
      round(coalesce(v_saldo_anterior, 0), 2)::numeric as saldo;
  end if;

  return query
  with mov as (
    select
      d.fecha_emision as fecha,
      'DOCUMENTO'::text as movimiento,
      d.tipo_documento::text as detalle,
      d.referencia::text as referencia,
      d.id as documento_id,
      d.numero_documento::text as numero_documento,
      d.moneda::text as moneda,
      d.monto_original::numeric as debito,
      0::numeric as credito,
      1::integer as orden_tipo,
      d.id::bigint as orden_id
    from public.cxc_documentos d
    where d.empresa_id = p_empresa_id
      and d.tercero_id = p_tercero_id
      and d.estado <> 'anulado'
      and d.fecha_emision <= v_fecha_hasta
      and (v_moneda is null or d.moneda = v_moneda)

    union all

    select
      a.fecha_aplicacion as fecha,
      'APLICACION'::text as movimiento,
      a.tipo_aplicacion::text as detalle,
      coalesce(a.referencia, a.observaciones)::text as referencia,
      d.id as documento_id,
      d.numero_documento::text as numero_documento,
      d.moneda::text as moneda,
      0::numeric as debito,
      a.monto::numeric as credito,
      2::integer as orden_tipo,
      a.id::bigint as orden_id
    from public.cxc_aplicaciones a
    join public.cxc_documentos d on d.id = a.documento_id
    where a.empresa_id = p_empresa_id
      and d.tercero_id = p_tercero_id
      and a.estado = 'activo'
      and d.estado <> 'anulado'
      and a.fecha_aplicacion <= v_fecha_hasta
      and (v_moneda is null or d.moneda = v_moneda)
  ),
  mov_filtrado as (
    select *
    from mov m
    where v_fecha_desde is null or m.fecha >= v_fecha_desde
  )
  select
    m.fecha,
    m.movimiento,
    m.detalle,
    m.referencia,
    m.documento_id,
    m.numero_documento,
    m.moneda,
    round(m.debito, 2)::numeric as debito,
    round(m.credito, 2)::numeric as credito,
    round(
      coalesce(v_saldo_anterior, 0)
      + sum(m.debito - m.credito) over (
        order by m.fecha, m.orden_tipo, m.orden_id
        rows between unbounded preceding and current row
      ),
      2
    )::numeric as saldo
  from mov_filtrado m
  order by m.fecha, m.orden_tipo, m.orden_id;
end;
$$;

grant execute on function public.get_cxc_aging_totales(bigint, date, text, bigint) to authenticated;
grant execute on function public.get_cxc_aging_totales(bigint, date, text, bigint) to service_role;
grant execute on function public.get_cxc_estado_cuenta(bigint, bigint, date, date, text) to authenticated;
grant execute on function public.get_cxc_estado_cuenta(bigint, bigint, date, date, text) to service_role;

commit;
