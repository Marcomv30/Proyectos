-- Sanidad de datos para Balance de Comprobacion.
-- Detecta problemas de mapeo base/empresa que pueden romper arbol padre/hijo.
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.get_balance_comprobacion_sanity(bigint, date, date);

create or replace function public.get_balance_comprobacion_sanity(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  issue text,
  severity text,
  asiento_id bigint,
  numero_formato text,
  fecha date,
  linea integer,
  cuenta_id bigint,
  codigo_base text,
  codigo_empresa text,
  codigo_efectivo text,
  nivel_efectivo integer,
  detalle text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     and current_user not in ('postgres', 'service_role')
  then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if p_fecha_desde is not null and p_fecha_hasta is not null and p_fecha_desde > p_fecha_hasta then
    raise exception 'Rango de fechas invalido';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not public.has_empresa_access(p_empresa_id)
  then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not (
       public.has_permission(p_empresa_id, 'contabilidad', 'ver')
       or public.has_permission(p_empresa_id, 'contabilidad', 'editar')
       or public.has_permission(p_empresa_id, 'contabilidad', 'aprobar')
     )
  then
    raise exception 'No tiene permisos para diagnostico contable';
  end if;

  return query
  with lineas as (
    select
      a.id::bigint as asiento_id,
      a.numero_formato,
      a.fecha,
      l.linea,
      l.cuenta_id::bigint as cuenta_id,
      cb.id::bigint as base_id,
      cb.codigo as codigo_base,
      cb.acepta_movimiento as base_acepta_movimiento,
      ce_base.codigo as codigo_empresa_por_base,
      ce_id.codigo as codigo_empresa_por_id,
      case
        when cb.id is not null and ce_base.codigo is not null then ce_base.codigo
        when cb.id is null and ce_id.codigo is not null then ce_id.codigo
        else cb.codigo
      end as codigo_efectivo
    from public.asiento_lineas l
    join public.asientos a on a.id = l.asiento_id
    left join public.plan_cuentas_base cb on cb.id = l.cuenta_id
    left join public.plan_cuentas_empresa ce_base
      on ce_base.empresa_id = a.empresa_id
     and cb.id is not null
     and ce_base.cuenta_base_id = cb.id
    left join public.plan_cuentas_empresa ce_id
      on ce_id.empresa_id = a.empresa_id
     and cb.id is null
     and ce_id.id = l.cuenta_id
    where a.empresa_id = p_empresa_id
      and a.estado = 'CONFIRMADO'
      and (p_fecha_desde is null or a.fecha >= p_fecha_desde)
      and (p_fecha_hasta is null or a.fecha <= p_fecha_hasta)
  ),
  flags as (
    -- 1) Linea sin cuenta base referenciable.
    select
      'LINEA_SIN_CUENTA_BASE'::text as issue,
      'ERROR'::text as severity,
      x.asiento_id,
      x.numero_formato,
      x.fecha,
      x.linea,
      x.cuenta_id,
      x.codigo_base,
      x.codigo_empresa_por_base as codigo_empresa,
      x.codigo_efectivo,
      public.plan_cuentas_infer_nivel(x.codigo_efectivo) as nivel_efectivo,
      'La linea apunta a cuenta_id sin fila en plan_cuentas_base'::text as detalle
    from lineas x
    where x.base_id is null

    union all

    -- 2) Codigo efectivo invalido para jerarquia.
    select
      'CODIGO_EFECTIVO_INVALIDO'::text as issue,
      'ERROR'::text as severity,
      x.asiento_id,
      x.numero_formato,
      x.fecha,
      x.linea,
      x.cuenta_id,
      x.codigo_base,
      x.codigo_empresa_por_base as codigo_empresa,
      x.codigo_efectivo,
      public.plan_cuentas_infer_nivel(x.codigo_efectivo) as nivel_efectivo,
      'El codigo efectivo no cumple formato jerarquico reconocido'::text as detalle
    from lineas x
    where x.codigo_efectivo is not null
      and public.plan_cuentas_infer_nivel(x.codigo_efectivo) is null

    union all

    -- 3) Asientos en cuentas no-movimiento.
    select
      'CUENTA_NO_ACEPTA_MOVIMIENTO'::text as issue,
      'WARN'::text as severity,
      x.asiento_id,
      x.numero_formato,
      x.fecha,
      x.linea,
      x.cuenta_id,
      x.codigo_base,
      x.codigo_empresa_por_base as codigo_empresa,
      x.codigo_efectivo,
      public.plan_cuentas_infer_nivel(x.codigo_efectivo) as nivel_efectivo,
      'La cuenta base tiene acepta_movimiento=false'::text as detalle
    from lineas x
    where x.base_id is not null
      and coalesce(x.base_acepta_movimiento, false) = false

    union all

    -- 4) Nivel efectivo distinto de 5 en lineas confirmadas (esperado para movimientos).
    select
      'NIVEL_EFECTIVO_NO_ES_5'::text as issue,
      'WARN'::text as severity,
      x.asiento_id,
      x.numero_formato,
      x.fecha,
      x.linea,
      x.cuenta_id,
      x.codigo_base,
      x.codigo_empresa_por_base as codigo_empresa,
      x.codigo_efectivo,
      public.plan_cuentas_infer_nivel(x.codigo_efectivo) as nivel_efectivo,
      'Movimiento contable en codigo efectivo de nivel distinto de 5'::text as detalle
    from lineas x
    where x.codigo_efectivo is not null
      and public.plan_cuentas_infer_nivel(x.codigo_efectivo) is not null
      and public.plan_cuentas_infer_nivel(x.codigo_efectivo) <> 5

    union all

    -- 5) Riesgo historico por colision de ids (empresa.id = cuenta_id base).
    select
      'COLISION_ID_BASE_EMPRESA'::text as issue,
      'WARN'::text as severity,
      x.asiento_id,
      x.numero_formato,
      x.fecha,
      x.linea,
      x.cuenta_id,
      x.codigo_base,
      x.codigo_empresa_por_id as codigo_empresa,
      x.codigo_efectivo,
      public.plan_cuentas_infer_nivel(x.codigo_efectivo) as nivel_efectivo,
      'Existe cuenta empresa con id=l.cuenta_id pero distinta a cuenta_base_id (riesgo de mapeo incorrecto en logica antigua)'::text as detalle
    from lineas x
    where x.base_id is not null
      and x.codigo_empresa_por_id is not null
      and x.codigo_empresa_por_base is distinct from x.codigo_empresa_por_id
  )
  select
    f.issue::text,
    f.severity::text,
    f.asiento_id::bigint,
    f.numero_formato::text,
    f.fecha::date,
    f.linea::integer,
    f.cuenta_id::bigint,
    f.codigo_base::text,
    f.codigo_empresa::text,
    f.codigo_efectivo::text,
    f.nivel_efectivo::integer,
    f.detalle::text
  from flags f
  order by
    case f.severity when 'ERROR' then 0 else 1 end,
    f.fecha,
    f.numero_formato,
    f.linea;
end;
$$;

grant execute on function public.get_balance_comprobacion_sanity(bigint, date, date) to authenticated;
grant execute on function public.get_balance_comprobacion_sanity(bigint, date, date) to service_role;

commit;
