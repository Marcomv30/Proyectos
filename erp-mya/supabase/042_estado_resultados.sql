-- Estado de Resultados multimoneda por rango de fechas.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.get_estado_resultados(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
)
returns table (
  cuenta text,
  nombre text,
  tipo text,
  nivel integer,
  debe numeric,
  haber numeric,
  neto numeric
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
    raise exception 'No tiene permisos para ver reportes contables';
  end if;

  if v_moneda not in ('CRC', 'USD') then
    v_moneda := 'CRC';
  end if;

  return query
  with mov as (
    select
      coalesce(
        case
          when public.plan_cuentas_infer_nivel(coalesce(ce.codigo, '')) is not null then ce.codigo
          else null
        end,
        cb.codigo,
        '[SIN-CUENTA-' || l.cuenta_id::text || ']'
      )::text as cuenta_codigo,
      coalesce(
        case
          when public.plan_cuentas_infer_nivel(coalesce(ce.codigo, '')) is not null then ce.nombre
          else null
        end,
        cb.nombre,
        'Cuenta no encontrada'
      )::text as cuenta_nombre,
      coalesce(
        cb.tipo::text,
        cb_ref.tipo::text,
        'GASTO'
      )::text as cuenta_tipo,
      coalesce(
        public.plan_cuentas_infer_nivel(
          coalesce(
            case
              when public.plan_cuentas_infer_nivel(coalesce(ce.codigo, '')) is not null then ce.codigo
              else null
            end,
            cb.codigo,
            ''
          )
        ),
        cb.nivel,
        cb_ref.nivel,
        5
      )::integer as cuenta_nivel,
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
      select e.codigo, e.nombre, e.cuenta_base_id
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
      -- Los asientos de cierre (CER-*) no deben distorsionar el resultado operativo del periodo.
      and upper(coalesce(a.numero_formato, '')) not like 'CER-%'
      and (p_fecha_desde is null or a.fecha >= p_fecha_desde)
      and (p_fecha_hasta is null or a.fecha <= p_fecha_hasta)
  ),
  agg as (
    select
      m.cuenta_codigo,
      m.cuenta_nombre,
      m.cuenta_tipo,
      m.cuenta_nivel,
      coalesce(sum(m.debe_monto), 0)::numeric as debe_calc,
      coalesce(sum(m.haber_monto), 0)::numeric as haber_calc
    from mov m
    where m.cuenta_tipo in ('INGRESO', 'COSTO', 'GASTO')
    group by m.cuenta_codigo, m.cuenta_nombre, m.cuenta_tipo, m.cuenta_nivel
  )
  select
    a.cuenta_codigo::text as cuenta,
    a.cuenta_nombre::text as nombre,
    a.cuenta_tipo::text as tipo,
    a.cuenta_nivel::integer as nivel,
    a.debe_calc::numeric as debe,
    a.haber_calc::numeric as haber,
    (
      case
        when a.cuenta_tipo = 'INGRESO' then (a.haber_calc - a.debe_calc)
        else (a.debe_calc - a.haber_calc)
      end
    )::numeric as neto
  from agg a
  where
    abs(coalesce(a.debe_calc, 0)) > 0.000001
    or abs(coalesce(a.haber_calc, 0)) > 0.000001
  order by a.cuenta_codigo;
end;
$$;

grant execute on function public.get_estado_resultados(bigint, date, date, text) to authenticated;
grant execute on function public.get_estado_resultados(bigint, date, date, text) to service_role;

commit;
