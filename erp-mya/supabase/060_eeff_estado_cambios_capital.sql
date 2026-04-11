-- EEFF Fase 3
-- Estado de Cambios en el Capital (base operativa)
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.get_eeff_estado_cambios_capital(bigint, date, date, text);
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
      -- FE y EC deben presentar la misma utilidad del periodo: utilidad neta de ER.
      b.utilidad_neta::numeric as utilidad_presentada,
      (
        case
          -- En preliminar, se adiciona la utilidad neta para presentar capital estimado al cierre.
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

grant execute on function public.get_eeff_estado_cambios_capital(bigint, date, date, text) to authenticated;
grant execute on function public.get_eeff_estado_cambios_capital(bigint, date, date, text) to service_role;

drop function if exists public.get_eeff_movimientos_capital_detalle(bigint, date, date, text);
create or replace function public.get_eeff_movimientos_capital_detalle(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
)
returns table (
  fecha date,
  asiento_id bigint,
  numero_formato text,
  descripcion text,
  clasificacion text,
  monto numeric
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
  with mov as (
    select
      a.fecha::date as fecha,
      a.id::bigint as asiento_id,
      coalesce(a.numero_formato, '')::text as numero_formato,
      coalesce(a.descripcion, '')::text as descripcion,
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
      and a.fecha >= v_fecha_desde
      and a.fecha <= v_fecha_hasta
  ),
  cap_asiento as (
    select
      m.fecha,
      m.asiento_id,
      m.numero_formato,
      m.descripcion,
      coalesce(
        sum(
          case
            when m.cuenta_tipo = 'CAPITAL' then
              case
                when m.naturaleza = 'CREDITO' then (m.haber_monto - m.debe_monto)
                else (m.debe_monto - m.haber_monto)
              end
            else 0
          end
        ),
        0
      )::numeric as monto
    from mov m
    group by m.fecha, m.asiento_id, m.numero_formato, m.descripcion
  )
  select
    c.fecha,
    c.asiento_id,
    c.numero_formato,
    c.descripcion,
    (
      case
        when upper(coalesce(c.numero_formato, '')) like 'CER-%' then 'CIERRE_RESULTADOS'
        when upper(coalesce(c.descripcion, '')) like '%APORTE%' then 'APORTE'
        when upper(coalesce(c.descripcion, '')) like '%DIVIDEND%' then 'DIVIDENDO'
        when upper(coalesce(c.descripcion, '')) like '%RETIRO%' then 'RETIRO'
        when upper(coalesce(c.descripcion, '')) like '%CAPITAL%' then 'MOVIMIENTO_CAPITAL'
        else 'OTRO_CAPITAL'
      end
    )::text as clasificacion,
    c.monto
  from cap_asiento c
  where abs(coalesce(c.monto, 0)) > 0.000001
    and upper(coalesce(c.numero_formato, '')) not like 'CER-%'
  order by c.fecha, c.asiento_id;
end;
$$;

grant execute on function public.get_eeff_movimientos_capital_detalle(bigint, date, date, text) to authenticated;
grant execute on function public.get_eeff_movimientos_capital_detalle(bigint, date, date, text) to service_role;

commit;
