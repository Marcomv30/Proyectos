-- Smoke test EEFF (consistencia de reportes financieros base).
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.get_eeff_smoke(bigint, date, date, text);

create or replace function public.get_eeff_smoke(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
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
declare
  v_moneda text := upper(coalesce(p_moneda, 'CRC'));
  v_fecha_hasta date := coalesce(p_fecha_hasta, current_date);
  v_fecha_desde date := coalesce(p_fecha_desde, date_trunc('year', coalesce(p_fecha_hasta, current_date))::date);
begin
  if auth.uid() is null
     and current_user not in ('postgres', 'service_role')
  then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if v_fecha_desde > v_fecha_hasta then
    raise exception 'Rango de fechas invalido';
  end if;

  if v_moneda not in ('CRC', 'USD') then
    v_moneda := 'CRC';
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
    raise exception 'No tiene permisos para diagnostico EEFF';
  end if;

  return query
  with flujo as (
    select *
    from public.get_eeff_flujo_efectivo_indirecto(p_empresa_id, v_fecha_desde, v_fecha_hasta, v_moneda)
  ),
  capital as (
    select *
    from public.get_eeff_estado_cambios_capital(p_empresa_id, v_fecha_desde, v_fecha_hasta, v_moneda)
  ),
  er as (
    select coalesce(
      sum(
        case
          when x.tipo = 'INGRESO' then x.neto
          when x.tipo in ('COSTO', 'GASTO') then -x.neto
          else 0
        end
      ),
      0
    )::numeric as utilidad
    from public.get_estado_resultados(p_empresa_id, v_fecha_desde, v_fecha_hasta, v_moneda) x
  ),
  flujo_vals as (
    select
      coalesce(sum(case when f.concepto = 'Flujo neto del periodo' then f.monto else 0 end), 0)::numeric as flujo_neto,
      coalesce(sum(case when f.concepto = 'Variacion neta de efectivo' then f.monto else 0 end), 0)::numeric as variacion_efectivo,
      coalesce(sum(case when f.concepto = 'Flujo operativo estimado' then f.monto else 0 end), 0)::numeric as flujo_operativo,
      coalesce(sum(case when f.concepto = 'Ajuste de clasificacion pendiente' then f.monto else 0 end), 0)::numeric as ajuste_clasificacion,
      count(*)::bigint as filas
    from flujo f
  ),
  capital_vals as (
    select
      coalesce(sum(case when c.concepto = 'Capital inicial' then c.monto else 0 end), 0)::numeric as capital_inicial,
      coalesce(sum(case when c.concepto in ('Utilidad del periodo', 'Utilidad neta del periodo') then c.monto else 0 end), 0)::numeric as utilidad_periodo,
      coalesce(sum(case when c.concepto = 'Movimientos directos de capital' then c.monto else 0 end), 0)::numeric as mov_directos,
      coalesce(sum(case when c.concepto = 'Ajuste conciliacion capital' then c.monto else 0 end), 0)::numeric as ajuste_capital,
      coalesce(sum(case when c.concepto = 'Capital final' then c.monto else 0 end), 0)::numeric as capital_final,
      count(*)::bigint as filas
    from capital c
  ),
  cierres as (
    select count(*)::bigint as total
    from public.asientos a
    where a.empresa_id = p_empresa_id
      and a.estado = 'CONFIRMADO'
      and upper(coalesce(a.numero_formato, '')) like 'CER-%'
      and a.fecha >= v_fecha_desde
      and a.fecha <= v_fecha_hasta
  )
  select 'EEFF_ER_FILAS'::text, 'INFO'::text, count(*)::bigint
  from public.get_estado_resultados(p_empresa_id, v_fecha_desde, v_fecha_hasta, v_moneda)

  union all

  select 'EEFF_CIERRES_CER_EN_RANGO'::text, 'INFO'::text, c.total
  from cierres c

  union all

  select 'EEFF_FLUJO_FILAS_ESPERADAS'::text, 'WARN'::text,
         case when f.filas >= 8 then 0 else 1 end::bigint
  from flujo_vals f

  union all

  select 'EEFF_CAPITAL_FILAS_ESPERADAS'::text, 'WARN'::text,
         case when c.filas >= 5 then 0 else 1 end::bigint
  from capital_vals c

  union all

  select 'EEFF_FLUJO_NETO_VS_VARIACION'::text, 'ERROR'::text,
         case when abs(f.flujo_neto - f.variacion_efectivo) <= 0.01 then 0 else 1 end::bigint
  from flujo_vals f

  union all

  select 'EEFF_FLUJO_OPERATIVO_MAS_AJUSTE'::text, 'WARN'::text,
         case when abs((f.flujo_operativo + f.ajuste_clasificacion) - f.variacion_efectivo) <= 0.01 then 0 else 1 end::bigint
  from flujo_vals f

  union all

  select 'EEFF_CAPITAL_ECUACION_BASE'::text, 'ERROR'::text,
         case
           when abs((c.capital_inicial + c.utilidad_periodo + c.mov_directos + c.ajuste_capital) - c.capital_final) <= 0.01 then 0
           else 1
         end::bigint
  from capital_vals c

  union all

  select 'EEFF_ER_VS_CAPITAL_UTILIDAD'::text, 'ERROR'::text,
         case when abs(e.utilidad - c.utilidad_periodo) <= 0.01 then 0 else 1 end::bigint
  from er e
  cross join capital_vals c

  order by 1;
end;
$$;

grant execute on function public.get_eeff_smoke(bigint, date, date, text) to authenticated;
grant execute on function public.get_eeff_smoke(bigint, date, date, text) to service_role;

commit;
