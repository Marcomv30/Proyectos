-- EEFF Fase 2
-- 1) Contexto de corte (preliminar/oficial)
-- 2) Flujo de efectivo (metodo indirecto base)
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.get_eeff_contexto(bigint, date);
create or replace function public.get_eeff_contexto(
  p_empresa_id bigint,
  p_fecha_hasta date default null
)
returns table (
  cierre_activo boolean,
  cierre_fecha_inicio date,
  cierre_fecha_fin date,
  estado_corte text,
  es_preliminar boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fecha_corte date := coalesce(p_fecha_hasta, current_date);
  v_cc jsonb;
  v_activo boolean := false;
  v_ini date;
  v_fin date;
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
     and not (
       public.has_permission(p_empresa_id, 'contabilidad', 'ver')
       or public.has_permission(p_empresa_id, 'contabilidad', 'editar')
       or public.has_permission(p_empresa_id, 'contabilidad', 'aprobar')
     )
  then
    raise exception 'No tiene permisos para ver EEFF';
  end if;

  select coalesce(ep.cierre_contable, public.empresa_parametros_defaults()->'cierre_contable')
    into v_cc
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  if v_cc is null then
    v_cc := public.empresa_parametros_defaults()->'cierre_contable';
  end if;

  v_activo := coalesce((v_cc->>'activo')::boolean, false);
  v_ini := nullif(coalesce(v_cc->>'fecha_inicio', ''), '')::date;
  v_fin := nullif(coalesce(v_cc->>'fecha_fin', ''), '')::date;

  return query
  select
    v_activo as cierre_activo,
    v_ini as cierre_fecha_inicio,
    v_fin as cierre_fecha_fin,
    case
      when v_activo and v_ini is not null and v_fin is not null and v_fecha_corte <= v_fin then 'OFICIAL_CERRADO'
      else 'PRELIMINAR'
    end::text as estado_corte,
    case
      when v_activo and v_ini is not null and v_fin is not null and v_fecha_corte <= v_fin then false
      else true
    end::boolean as es_preliminar;
end;
$$;

grant execute on function public.get_eeff_contexto(bigint, date) to authenticated;
grant execute on function public.get_eeff_contexto(bigint, date) to service_role;

drop function if exists public.get_eeff_flujo_efectivo_indirecto(bigint, date, date, text);
create or replace function public.get_eeff_flujo_efectivo_indirecto(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
)
returns table (
  categoria text,
  concepto text,
  monto numeric,
  orden integer
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

  return query
  with er as (
    select coalesce(
      sum(
        case
          when x.tipo = 'INGRESO' then x.neto
          when x.tipo in ('COSTO', 'GASTO') then -x.neto
          else 0
        end
      ),
      0
    )::numeric as utilidad_neta
    from public.get_estado_resultados(p_empresa_id, v_fecha_desde, v_fecha_hasta, v_moneda) x
  ),
  efectivo_ini as (
    select coalesce(sum(b.saldo), 0)::numeric as monto
    from public.get_balance_situacion(p_empresa_id, (v_fecha_desde - 1), v_moneda) b
    where b.tipo = 'ACTIVO'
      and (
        b.cuenta like '0101%'
        or upper(coalesce(b.nombre, '')) like '%CAJA%'
        or upper(coalesce(b.nombre, '')) like '%BANCO%'
      )
  ),
  efectivo_fin as (
    select coalesce(sum(b.saldo), 0)::numeric as monto
    from public.get_balance_situacion(p_empresa_id, v_fecha_hasta, v_moneda) b
    where b.tipo = 'ACTIVO'
      and (
        b.cuenta like '0101%'
        or upper(coalesce(b.nombre, '')) like '%CAJA%'
        or upper(coalesce(b.nombre, '')) like '%BANCO%'
      )
  ),
  cxc_ini as (
    select coalesce(sum(b.saldo), 0)::numeric as monto
    from public.get_balance_situacion(p_empresa_id, (v_fecha_desde - 1), v_moneda) b
    where b.tipo = 'ACTIVO'
      and (
        upper(coalesce(b.nombre, '')) like '%CLIENTE%'
        or upper(coalesce(b.nombre, '')) like '%CUENTA%COBRAR%'
      )
  ),
  cxc_fin as (
    select coalesce(sum(b.saldo), 0)::numeric as monto
    from public.get_balance_situacion(p_empresa_id, v_fecha_hasta, v_moneda) b
    where b.tipo = 'ACTIVO'
      and (
        upper(coalesce(b.nombre, '')) like '%CLIENTE%'
        or upper(coalesce(b.nombre, '')) like '%CUENTA%COBRAR%'
      )
  ),
  inv_ini as (
    select coalesce(sum(b.saldo), 0)::numeric as monto
    from public.get_balance_situacion(p_empresa_id, (v_fecha_desde - 1), v_moneda) b
    where b.tipo = 'ACTIVO'
      and upper(coalesce(b.nombre, '')) like '%INVENTAR%'
  ),
  inv_fin as (
    select coalesce(sum(b.saldo), 0)::numeric as monto
    from public.get_balance_situacion(p_empresa_id, v_fecha_hasta, v_moneda) b
    where b.tipo = 'ACTIVO'
      and upper(coalesce(b.nombre, '')) like '%INVENTAR%'
  ),
  cxp_ini as (
    select coalesce(sum(b.saldo), 0)::numeric as monto
    from public.get_balance_situacion(p_empresa_id, (v_fecha_desde - 1), v_moneda) b
    where b.tipo = 'PASIVO'
      and (
        upper(coalesce(b.nombre, '')) like '%PROVEEDOR%'
        or upper(coalesce(b.nombre, '')) like '%CUENTA%PAGAR%'
      )
  ),
  cxp_fin as (
    select coalesce(sum(b.saldo), 0)::numeric as monto
    from public.get_balance_situacion(p_empresa_id, v_fecha_hasta, v_moneda) b
    where b.tipo = 'PASIVO'
      and (
        upper(coalesce(b.nombre, '')) like '%PROVEEDOR%'
        or upper(coalesce(b.nombre, '')) like '%CUENTA%PAGAR%'
      )
  ),
  base as (
    select
      er.utilidad_neta::numeric as utilidad_neta,
      (ef.monto - ei.monto)::numeric as variacion_efectivo,
      (cf.monto - ci.monto)::numeric as var_cxc,
      (ifn.monto - iin.monto)::numeric as var_inventario,
      (pf.monto - pi.monto)::numeric as var_cxp
    from er
    cross join efectivo_ini ei
    cross join efectivo_fin ef
    cross join cxc_ini ci
    cross join cxc_fin cf
    cross join inv_ini iin
    cross join inv_fin ifn
    cross join cxp_ini pi
    cross join cxp_fin pf
  ),
  calc as (
    select
      b.*,
      (
        b.utilidad_neta
        - b.var_cxc
        - b.var_inventario
        + b.var_cxp
      )::numeric as flujo_operativo_estimado
    from base b
  )
  select 'OPERATIVO'::text, 'Utilidad neta del periodo'::text, b.utilidad_neta::numeric, 10::integer
  from calc b
  union all
  select 'OPERATIVO'::text, '(-) Variacion CxC'::text, (-b.var_cxc)::numeric, 20::integer
  from calc b
  union all
  select 'OPERATIVO'::text, '(-) Variacion Inventario'::text, (-b.var_inventario)::numeric, 30::integer
  from calc b
  union all
  select 'OPERATIVO'::text, '(+) Variacion CxP'::text, b.var_cxp::numeric, 40::integer
  from calc b
  union all
  select 'OPERATIVO'::text, 'Flujo operativo estimado'::text, b.flujo_operativo_estimado::numeric, 50::integer
  from calc b
  union all
  select 'CONCILIACION'::text, 'Variacion neta de efectivo'::text, b.variacion_efectivo::numeric, 90::integer
  from calc b
  union all
  select 'CONCILIACION'::text, 'Ajuste de clasificacion pendiente'::text, (b.variacion_efectivo - b.flujo_operativo_estimado)::numeric, 95::integer
  from calc b
  union all
  select 'TOTAL'::text, 'Flujo neto del periodo'::text, b.variacion_efectivo::numeric, 100::integer
  from calc b
  order by 4;
end;
$$;

grant execute on function public.get_eeff_flujo_efectivo_indirecto(bigint, date, date, text) to authenticated;
grant execute on function public.get_eeff_flujo_efectivo_indirecto(bigint, date, date, text) to service_role;

commit;
