-- EEFF Fase 4
-- Unificacion de utilidad neta (ER + impuesto renta estimado) para Flujo, Capital y Smoke.
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.get_eeff_utilidad_neta(bigint, date, date, text);
create or replace function public.get_eeff_utilidad_neta(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
)
returns table (
  utilidad_antes_impuesto numeric,
  impuesto_usado numeric,
  utilidad_neta numeric,
  fuente_impuesto text
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
  with er_base as (
    select
      coalesce(sum(case when x.tipo = 'INGRESO' then x.neto else 0 end), 0)::numeric as ingresos,
      coalesce(sum(case when x.tipo = 'COSTO' then x.neto else 0 end), 0)::numeric as costos,
      coalesce(
        sum(
          case
            when x.tipo = 'GASTO'
                 and not (
                   upper(coalesce(x.nombre, '')) like '%IMPUESTO%RENTA%'
                   or upper(coalesce(x.nombre, '')) like '%RENTA%'
                 )
            then x.neto
            else 0
          end
        ),
        0
      )::numeric as gastos_operativos,
      coalesce(
        sum(
          case
            when x.tipo = 'GASTO'
                 and (
                   upper(coalesce(x.nombre, '')) like '%IMPUESTO%RENTA%'
                   or upper(coalesce(x.nombre, '')) like '%RENTA%'
                 )
            then x.neto
            else 0
          end
        ),
        0
      )::numeric as impuesto_contable
    from public.get_estado_resultados(p_empresa_id, v_fecha_desde, v_fecha_hasta, v_moneda) x
  ),
  er_calc as (
    select
      round((b.ingresos - b.costos - b.gastos_operativos), 2)::numeric as utilidad_antes,
      b.impuesto_contable,
      case
        when b.impuesto_contable > 0 then b.impuesto_contable
        when (b.ingresos - b.costos - b.gastos_operativos) > 0 then
          coalesce(public.calcular_impuesto_renta(p_empresa_id, (b.ingresos - b.costos - b.gastos_operativos), v_fecha_hasta), 0)::numeric
        else 0::numeric
      end as impuesto_aplicado,
      case
        when b.impuesto_contable > 0 then 'CONTABLE_REGISTRADO'::text
        when (b.ingresos - b.costos - b.gastos_operativos) > 0 then 'ESTIMADO_FUNCION'::text
        else 'SIN_IMPUESTO'::text
      end as fuente
    from er_base b
  )
  select
    c.utilidad_antes::numeric,
    round(c.impuesto_aplicado, 2)::numeric,
    round(c.utilidad_antes - c.impuesto_aplicado, 2)::numeric,
    c.fuente::text
  from er_calc c;
end;
$$;

grant execute on function public.get_eeff_utilidad_neta(bigint, date, date, text) to authenticated;
grant execute on function public.get_eeff_utilidad_neta(bigint, date, date, text) to service_role;

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
    select coalesce(u.utilidad_neta, 0)::numeric as utilidad_neta
    from public.get_eeff_utilidad_neta(p_empresa_id, v_fecha_desde, v_fecha_hasta, v_moneda) u
    limit 1
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

create or replace function public.get_eeff_estado_cambios_capital(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
)
returns table (
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
  with mov_cap as (
    select
      a.fecha::date as fecha,
      upper(coalesce(a.numero_formato, ''))::text as numero_formato,
      coalesce(cb.tipo::text, cb_ref.tipo::text, 'ACTIVO')::text as cuenta_tipo,
      coalesce(cb.naturaleza::text, cb_ref.naturaleza::text, 'DEBITO')::text as naturaleza,
      (
        case
          when v_moneda = 'USD' then
            case
              when coalesce(l.debito_usd, 0) <> 0 then coalesce(l.debito_usd, 0)
              when coalesce(l.debito_crc, 0) <> 0 and coalesce(a.tipo_cambio, tc.venta, tc.compra, 0) > 0 then coalesce(l.debito_crc, 0) / coalesce(a.tipo_cambio, tc.venta, tc.compra, 0)
              else 0
            end
          else
            case
              when coalesce(l.debito_crc, 0) <> 0 then coalesce(l.debito_crc, 0)
              when coalesce(l.debito_usd, 0) <> 0 and coalesce(a.tipo_cambio, tc.venta, tc.compra, 0) > 0 then coalesce(l.debito_usd, 0) * coalesce(a.tipo_cambio, tc.venta, tc.compra, 0)
              else 0
            end
        end
      )::numeric as debe_monto,
      (
        case
          when v_moneda = 'USD' then
            case
              when coalesce(l.credito_usd, 0) <> 0 then coalesce(l.credito_usd, 0)
              when coalesce(l.credito_crc, 0) <> 0 and coalesce(a.tipo_cambio, tc.venta, tc.compra, 0) > 0 then coalesce(l.credito_crc, 0) / coalesce(a.tipo_cambio, tc.venta, tc.compra, 0)
              else 0
            end
          else
            case
              when coalesce(l.credito_crc, 0) <> 0 then coalesce(l.credito_crc, 0)
              when coalesce(l.credito_usd, 0) <> 0 and coalesce(a.tipo_cambio, tc.venta, tc.compra, 0) > 0 then coalesce(l.credito_usd, 0) * coalesce(a.tipo_cambio, tc.venta, tc.compra, 0)
              else 0
            end
        end
      )::numeric as haber_monto
    from public.asiento_lineas l
    join public.asientos a on a.id = l.asiento_id
    left join public.plan_cuentas_base cb on cb.id = l.cuenta_id
    left join lateral (
      select e.cuenta_base_id
      from public.plan_cuentas_empresa e
      where e.empresa_id = a.empresa_id
        and (
          (cb.id is not null and e.cuenta_base_id = cb.id)
          or (cb.id is null and e.id = l.cuenta_id)
        )
      order by
        case
          when cb.id is not null and e.cuenta_base_id = cb.id then 0
          when cb.id is null and e.id = l.cuenta_id then 0
          else 1
        end
      limit 1
    ) ce on true
    left join lateral (
      select h.compra, h.venta
      from public.tipo_cambio_historial h
      where h.empresa_id = a.empresa_id
        and h.fecha = a.fecha
      limit 1
    ) tc on true
    left join public.plan_cuentas_base cb_ref on cb_ref.id = ce.cuenta_base_id
    where a.empresa_id = p_empresa_id
      and a.estado = 'CONFIRMADO'
  ),
  mov_cap_directos as (
    select
      coalesce(
        sum(
          case
            when m.cuenta_tipo = 'CAPITAL'
                 and m.fecha >= v_fecha_desde
                 and m.fecha <= v_fecha_hasta
                 and m.numero_formato not like 'CER-%'
            then
              case
                when m.naturaleza = 'CREDITO' then (m.haber_monto - m.debe_monto)
                else (m.debe_monto - m.haber_monto)
              end
            else 0
          end
        ),
        0
      )::numeric as monto
    from mov_cap m
  ),
  cap_ini as (
    select
      coalesce(
        sum(
          case
            when m.cuenta_tipo = 'CAPITAL' and m.fecha <= (v_fecha_desde - 1) then
              case
                when m.naturaleza = 'CREDITO' then (m.haber_monto - m.debe_monto)
                else (m.debe_monto - m.haber_monto)
              end
            else 0
          end
        ),
        0
      )::numeric as monto
    from mov_cap m
  ),
  cap_fin as (
    select
      coalesce(
        sum(
          case
            when m.cuenta_tipo = 'CAPITAL' and m.fecha <= v_fecha_hasta then
              case
                when m.naturaleza = 'CREDITO' then (m.haber_monto - m.debe_monto)
                else (m.debe_monto - m.haber_monto)
              end
            else 0
          end
        ),
        0
      )::numeric as monto
    from mov_cap m
  ),
  er as (
    select coalesce(u.utilidad_neta, 0)::numeric as utilidad_neta
    from public.get_eeff_utilidad_neta(p_empresa_id, v_fecha_desde, v_fecha_hasta, v_moneda) u
    limit 1
  ),
  bs_tot as (
    select
      coalesce(sum(case when b.tipo = 'ACTIVO' then b.saldo else 0 end), 0)::numeric as total_activo,
      coalesce(sum(case when b.tipo = 'PASIVO' then b.saldo else 0 end), 0)::numeric as total_pasivo,
      coalesce(sum(case when b.tipo = 'CAPITAL' and b.cuenta <> '0399-99-999-999' then b.saldo else 0 end), 0)::numeric as total_capital_real
    from public.get_balance_situacion(p_empresa_id, v_fecha_hasta, v_moneda) b
  ),
  ctx as (
    select coalesce(c.es_preliminar, true) as es_preliminar
    from public.get_eeff_contexto(p_empresa_id, v_fecha_hasta) c
    limit 1
  ),
  base as (
    select
      i.monto::numeric as capital_inicial,
      f.monto::numeric as capital_final,
      e.utilidad_neta::numeric as utilidad_neta,
      (bs.total_activo - bs.total_pasivo - bs.total_capital_real)::numeric as utilidad_bs,
      md.monto::numeric as movimientos_directos_real,
      c.es_preliminar
    from cap_ini i
    cross join cap_fin f
    cross join er e
    cross join bs_tot bs
    cross join mov_cap_directos md
    cross join ctx c
  ),
  calc as (
    select
      b.capital_inicial,
      b.utilidad_neta::numeric as utilidad_presentada,
      (
        case
          when b.es_preliminar then (b.capital_final + b.utilidad_neta)
          else b.capital_final
        end
      )::numeric as capital_final_presentado,
      b.movimientos_directos_real::numeric as movimientos_directos_real
    from base b
  ),
  final_calc as (
    select
      c.capital_inicial,
      c.utilidad_presentada,
      c.movimientos_directos_real,
      (c.capital_final_presentado - c.capital_inicial - c.utilidad_presentada - c.movimientos_directos_real)::numeric as ajuste_conciliacion,
      c.capital_final_presentado
    from calc c
  )
  select 'Capital inicial'::text, c.capital_inicial, 10::integer from final_calc c
  union all
  select 'Utilidad neta del periodo'::text, c.utilidad_presentada, 20::integer from final_calc c
  union all
  select 'Movimientos directos de capital'::text, c.movimientos_directos_real, 30::integer from final_calc c
  union all
  select 'Ajuste conciliacion capital'::text, c.ajuste_conciliacion, 40::integer from final_calc c
  union all
  select 'Capital final'::text, c.capital_final_presentado, 100::integer from final_calc c
  order by 3;
end;
$$;

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
    select coalesce(u.utilidad_neta, 0)::numeric as utilidad
    from public.get_eeff_utilidad_neta(p_empresa_id, v_fecha_desde, v_fecha_hasta, v_moneda) u
    limit 1
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

commit;
