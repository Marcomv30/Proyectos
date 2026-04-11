-- Smoke test contable (resumen de sanidad por empresa y rango de fechas).
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.get_contabilidad_smoke(bigint, date, date);

create or replace function public.get_contabilidad_smoke(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  issue text,
  severity text,
  total bigint
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
  with asientos_scope as (
    select
      a.id,
      a.empresa_id,
      a.fecha,
      a.tipo_cambio
    from public.asientos a
    where a.empresa_id = p_empresa_id
      and a.estado = 'CONFIRMADO'
      and (p_fecha_desde is null or a.fecha >= p_fecha_desde)
      and (p_fecha_hasta is null or a.fecha <= p_fecha_hasta)
  ),
  sumas_asiento as (
    select
      s.id as asiento_id,
      coalesce(sum(coalesce(l.debito_crc, 0)), 0)::numeric as deb_crc,
      coalesce(sum(coalesce(l.credito_crc, 0)), 0)::numeric as hab_crc,
      coalesce(sum(coalesce(l.debito_usd, 0)), 0)::numeric as deb_usd,
      coalesce(sum(coalesce(l.credito_usd, 0)), 0)::numeric as hab_usd
    from asientos_scope s
    left join public.asiento_lineas l on l.asiento_id = s.id
    group by s.id
  ),
  lineas_scope as (
    select
      l.asiento_id,
      l.cuenta_id,
      l.debito_crc,
      l.credito_crc,
      l.debito_usd,
      l.credito_usd,
      b.codigo as codigo_base,
      b.nivel as nivel_base,
      ce.codigo as codigo_empresa
    from public.asiento_lineas l
    join asientos_scope a on a.id = l.asiento_id
    left join public.plan_cuentas_base b on b.id = l.cuenta_id
    left join lateral (
      select e.codigo
      from public.plan_cuentas_empresa e
      where e.empresa_id = a.empresa_id
        and e.cuenta_base_id = b.id
      order by e.id
      limit 1
    ) ce on true
  ),
  capital_lvl5 as (
    select count(*)::bigint as cnt
    from public.plan_cuentas_base b
    where coalesce(b.activo, true) = true
      and coalesce(b.acepta_movimiento, false) = true
      and b.tipo = 'CAPITAL'
      and coalesce(
        public.plan_cuentas_infer_nivel(coalesce(b.codigo, '')),
        b.nivel,
        0
      ) = 5
  )
  select 'ASIENTOS_CONFIRMADOS'::text, 'INFO'::text, count(*)::bigint
  from asientos_scope

  union all

  select 'ASIENTOS_DESCUADRADOS_CRC'::text, 'ERROR'::text, count(*)::bigint
  from sumas_asiento s
  where abs(coalesce(s.deb_crc, 0) - coalesce(s.hab_crc, 0)) > 0.01

  union all

  select 'ASIENTOS_DESCUADRADOS_USD'::text, 'WARN'::text, count(*)::bigint
  from sumas_asiento s
  where abs(coalesce(s.deb_usd, 0) - coalesce(s.hab_usd, 0)) > 0.01

  union all

  select 'LINEAS_NIVEL_EFECTIVO_NO_5'::text, 'WARN'::text, count(*)::bigint
  from lineas_scope l
  where coalesce(
    public.plan_cuentas_infer_nivel(coalesce(l.codigo_empresa, l.codigo_base, '')),
    l.nivel_base,
    0
  ) <> 5

  union all

  select 'LINEAS_SIN_TC_PARA_CONVERSION'::text, 'WARN'::text, count(*)::bigint
  from public.asiento_lineas l
  join asientos_scope a on a.id = l.asiento_id
  left join lateral (
    select h.compra, h.venta
    from public.tipo_cambio_historial h
    where h.empresa_id = a.empresa_id
      and h.fecha = a.fecha
    limit 1
  ) tc on true
  where (
      (coalesce(l.debito_crc, 0) > 0 and coalesce(l.debito_usd, 0) = 0)
      or (coalesce(l.credito_crc, 0) > 0 and coalesce(l.credito_usd, 0) = 0)
      or (coalesce(l.debito_usd, 0) > 0 and coalesce(l.debito_crc, 0) = 0)
      or (coalesce(l.credito_usd, 0) > 0 and coalesce(l.credito_crc, 0) = 0)
    )
    and coalesce(a.tipo_cambio, tc.venta, tc.compra, 0) <= 0

  union all

  select 'CIERRES_DUPLICADOS_CONFIRMADOS'::text, 'ERROR'::text, count(*)::bigint
  from (
    select a.empresa_id, lower(btrim(coalesce(a.numero_formato, ''))) as numero_norm
    from public.asientos a
    where a.empresa_id = p_empresa_id
      and a.estado = 'CONFIRMADO'
      and upper(btrim(coalesce(a.numero_formato, ''))) like 'CER-%'
    group by a.empresa_id, lower(btrim(coalesce(a.numero_formato, '')))
    having count(*) > 1
  ) d

  union all

  select 'BASE_HUERFANAS_ACTIVAS'::text, 'WARN'::text, count(*)::bigint
  from public.plan_cuentas_base b
  where coalesce(b.activo, true) = true
    and coalesce(b.nivel, 0) between 1 and 4
    and not exists (
      select 1
      from public.plan_cuentas_base h
      where h.padre_id = b.id
        and coalesce(h.activo, true) = true
    )

  union all

  select 'EMPRESA_SIN_BASE'::text, 'ERROR'::text, count(*)::bigint
  from public.plan_cuentas_empresa e
  left join public.plan_cuentas_base b on b.id = e.cuenta_base_id
  where e.empresa_id = p_empresa_id
    and b.id is null

  union all

  select 'CAPITAL_NIVEL5_MOVIMIENTO'::text, 'INFO'::text, c.cnt
  from capital_lvl5 c

  order by 1;
end;
$$;

grant execute on function public.get_contabilidad_smoke(bigint, date, date) to authenticated;
grant execute on function public.get_contabilidad_smoke(bigint, date, date) to service_role;

commit;

