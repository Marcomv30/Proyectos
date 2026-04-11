-- Balance de Situacion (Balance General) multimoneda por fecha de corte.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.get_balance_situacion(
  p_empresa_id bigint,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
)
returns table (
  cuenta text,
  nombre text,
  tipo text,
  nivel integer,
  saldo numeric
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
        'ACTIVO'
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
      and (p_fecha_hasta is null or a.fecha <= p_fecha_hasta)
  ),
  agg as (
    select
      m.cuenta_codigo,
      m.cuenta_nombre,
      m.cuenta_tipo,
      m.cuenta_nivel,
      m.naturaleza,
      coalesce(sum(m.debe_monto), 0)::numeric as debe_calc,
      coalesce(sum(m.haber_monto), 0)::numeric as haber_calc
    from mov m
    where m.cuenta_tipo in ('ACTIVO', 'PASIVO', 'CAPITAL')
    group by m.cuenta_codigo, m.cuenta_nombre, m.cuenta_tipo, m.cuenta_nivel, m.naturaleza
  ),
  saldos_base as (
    select
      a.cuenta_codigo::text as cuenta,
      a.cuenta_nombre::text as nombre,
      a.cuenta_tipo::text as tipo,
      a.cuenta_nivel::integer as nivel,
      (
        case
          when a.naturaleza = 'CREDITO' then (a.haber_calc - a.debe_calc)
          else (a.debe_calc - a.haber_calc)
        end
      )::numeric as saldo
    from agg a
  ),
  totales_base as (
    select
      coalesce(sum(case when sb.tipo = 'ACTIVO' then sb.saldo else 0 end), 0)::numeric as total_activo,
      coalesce(sum(case when sb.tipo = 'PASIVO' then sb.saldo else 0 end), 0)::numeric as total_pasivo,
      coalesce(sum(case when sb.tipo = 'CAPITAL' then sb.saldo else 0 end), 0)::numeric as total_capital
    from saldos_base sb
  ),
  utilidad_periodo as (
    select
      '0399-99-999-999'::text as cuenta,
      'UTILIDAD DEL PERIODO'::text as nombre,
      'CAPITAL'::text as tipo,
      5::integer as nivel,
      (t.total_activo - t.total_pasivo - t.total_capital)::numeric as saldo
    from totales_base t
  )
  select
    x.cuenta,
    x.nombre,
    x.tipo,
    x.nivel,
    x.saldo
  from (
    select sb.cuenta, sb.nombre, sb.tipo, sb.nivel, sb.saldo
    from saldos_base sb
    where abs(sb.saldo) > 0.000001

    union all

    select u.cuenta, u.nombre, u.tipo, u.nivel, u.saldo
    from utilidad_periodo u
    where abs(u.saldo) > 0.000001
  ) x
  order by x.cuenta;
end;
$$;

grant execute on function public.get_balance_situacion(bigint, date, text) to authenticated;
grant execute on function public.get_balance_situacion(bigint, date, text) to service_role;

commit;
