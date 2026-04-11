-- Ajuste de permisos para Mayor General:
-- permitir acceso si tiene contabilidad:ver O contabilidad:editar.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.get_mayor_general_movimientos(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_cuenta_codigo text default null,
  p_moneda text default 'CRC'
)
returns table (
  empresa_id bigint,
  asiento_id bigint,
  fecha date,
  asiento text,
  categoria text,
  cuenta text,
  nombre text,
  detalle text,
  debe numeric,
  haber numeric,
  naturaleza text
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
      a.empresa_id::bigint as empresa_id,
      a.id::bigint as asiento_id,
      a.fecha::date as fecha,
      a.numero_formato::text as asiento,
      coalesce(cat.codigo, '')::text as categoria,
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
      a.descripcion::text as detalle,
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
      )::numeric as debe,
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
      )::numeric as haber,
      coalesce(cb.naturaleza::text, cb_ref.naturaleza::text, 'DEBITO')::text as naturaleza,
      l.linea
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
    left join public.asiento_categorias cat on cat.id = a.categoria_id
    where a.empresa_id = p_empresa_id
      and a.estado = 'CONFIRMADO'
      and (p_fecha_desde is null or a.fecha >= p_fecha_desde)
      and (p_fecha_hasta is null or a.fecha <= p_fecha_hasta)
  )
  select
    m.empresa_id,
    m.asiento_id,
    m.fecha,
    m.asiento,
    m.categoria,
    m.cuenta_codigo as cuenta,
    m.cuenta_nombre as nombre,
    m.detalle,
    m.debe,
    m.haber,
    m.naturaleza
  from mov m
  where
    nullif(btrim(coalesce(p_cuenta_codigo, '')), '') is null
    or m.cuenta_codigo = btrim(p_cuenta_codigo)
  order by m.cuenta_codigo, m.fecha, m.asiento_id, m.linea;
end;
$$;

grant execute on function public.get_mayor_general_movimientos(bigint, date, date, text, text) to authenticated;
grant execute on function public.get_mayor_general_movimientos(bigint, date, date, text, text) to service_role;

commit;
