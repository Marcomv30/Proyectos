-- Cierre automatico de Estado de Resultados.
-- Genera asiento de cierre para llevar INGRESO/COSTO/GASTO a cero
-- contra una cuenta de CAPITAL (resultados/utilidad).
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.generar_cierre_estado_resultados(
  p_empresa_id bigint,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_moneda text default 'CRC'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moneda text := upper(coalesce(p_moneda, 'CRC'));
  v_categoria_id bigint;
  v_cuenta_resultado_id bigint;
  v_tc_cierre numeric := 1;
  v_numero_formato text;
  v_asiento_id bigint;
  v_asiento_existente bigint;
  v_linea integer := 0;
  v_total_debe numeric := 0;
  v_total_haber numeric := 0;
  v_diferencia numeric := 0;
  r_line record;
begin
  if auth.uid() is null
     and current_user not in ('postgres', 'service_role')
  then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if p_fecha_desde is null or p_fecha_hasta is null then
    raise exception 'Rango de fechas requerido';
  end if;

  if p_fecha_desde > p_fecha_hasta then
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
       public.has_permission(p_empresa_id, 'contabilidad', 'editar')
       or public.has_permission(p_empresa_id, 'contabilidad', 'aprobar')
     )
  then
    raise exception 'No tiene permisos para generar cierre contable';
  end if;

  -- Categoria CIERRE (fallback: primera activa).
  select c.id
    into v_categoria_id
  from public.asiento_categorias c
  left join public.asiento_tipos t on t.id = c.tipo_id
  where coalesce(c.activo, true) = true
    and (
      upper(coalesce(t.codigo, '')) = 'CIERRE'
      or upper(coalesce(c.codigo, '')) like 'CIER%'
      or lower(coalesce(c.descripcion, '')) like '%cierre%'
    )
  order by c.id
  limit 1;

  if v_categoria_id is null then
    select c.id
      into v_categoria_id
    from public.asiento_categorias c
    where coalesce(c.activo, true) = true
    order by c.id
    limit 1;
  end if;

  if v_categoria_id is null then
    raise exception 'No hay categoria activa para asiento de cierre';
  end if;

  -- Cuenta de contrapartida en CAPITAL (obligatoriamente nivel 5 efectivo).
  select b.id
    into v_cuenta_resultado_id
  from public.plan_cuentas_base b
  left join public.plan_cuentas_empresa e
    on e.empresa_id = p_empresa_id
   and e.cuenta_base_id = b.id
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'CAPITAL'
    and coalesce(
      case
        when public.plan_cuentas_infer_nivel(coalesce(e.codigo, '')) = 5 then 5
        else null
      end,
      public.plan_cuentas_infer_nivel(coalesce(b.codigo, '')),
      b.nivel,
      0
    ) = 5
    and (
      upper(coalesce(b.nombre, '')) like '%RESULTAD%'
      or upper(coalesce(b.nombre, '')) like '%UTILIDAD%'
    )
  order by coalesce(b.nivel, 0) desc, b.codigo
  limit 1;

  if v_cuenta_resultado_id is null then
    select b.id
      into v_cuenta_resultado_id
    from public.plan_cuentas_base b
    left join public.plan_cuentas_empresa e
      on e.empresa_id = p_empresa_id
     and e.cuenta_base_id = b.id
    where coalesce(b.activo, true) = true
      and coalesce(b.acepta_movimiento, false) = true
      and b.tipo = 'CAPITAL'
      and coalesce(
        case
          when public.plan_cuentas_infer_nivel(coalesce(e.codigo, '')) = 5 then 5
          else null
        end,
        public.plan_cuentas_infer_nivel(coalesce(b.codigo, '')),
        b.nivel,
        0
      ) = 5
    order by coalesce(b.nivel, 0) desc, b.codigo
    limit 1;
  end if;

  if v_cuenta_resultado_id is null then
    raise exception 'No existe cuenta CAPITAL de movimiento nivel 5 para contrapartida del cierre';
  end if;

  if v_moneda = 'USD' then
    select coalesce(t.venta, t.compra)
      into v_tc_cierre
    from public.tipo_cambio_historial t
    where t.empresa_id = p_empresa_id
      and t.fecha = p_fecha_hasta
    order by t.fecha desc
    limit 1;

    if coalesce(v_tc_cierre, 0) <= 0 then
      raise exception 'No hay tipo de cambio para fecha % (empresa %)', p_fecha_hasta, p_empresa_id;
    end if;
  else
    select coalesce(t.venta, t.compra, 1)
      into v_tc_cierre
    from public.tipo_cambio_historial t
    where t.empresa_id = p_empresa_id
      and t.fecha = p_fecha_hasta
    order by t.fecha desc
    limit 1;
    v_tc_cierre := coalesce(v_tc_cierre, 1);
  end if;

  -- Numero deterministico <= 20 chars: CER-YYMMDD-YYMMDD-X
  v_numero_formato :=
    'CER-' ||
    to_char(p_fecha_desde, 'YYMMDD') || '-' ||
    to_char(p_fecha_hasta, 'YYMMDD') || '-' ||
    substring(v_moneda, 1, 1);

  -- Evita doble generacion por doble clic/concurrencia.
  perform pg_advisory_xact_lock(hashtext('cierre-er-' || p_empresa_id::text || '-' || v_numero_formato));

  select a.id
    into v_asiento_existente
  from public.asientos a
  where a.empresa_id = p_empresa_id
    and a.estado = 'CONFIRMADO'
    and lower(btrim(coalesce(a.numero_formato, ''))) = lower(btrim(v_numero_formato))
  order by a.id desc
  limit 1;

  if v_asiento_existente is not null then
    return v_asiento_existente;
  end if;

  create temporary table tmp_cierre_er_lineas (
    cuenta_id bigint not null,
    codigo text not null,
    nombre text not null,
    debito_cierre numeric not null default 0,
    credito_cierre numeric not null default 0
  ) on commit drop;

  insert into tmp_cierre_er_lineas (cuenta_id, codigo, nombre, debito_cierre, credito_cierre)
  with mov as (
    select
      b.id as cuenta_id,
      b.codigo,
      b.nombre,
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
    join public.plan_cuentas_base b on b.id = l.cuenta_id
    left join lateral (
      select e.codigo
      from public.plan_cuentas_empresa e
      where e.empresa_id = a.empresa_id
        and e.cuenta_base_id = b.id
      order by e.id
      limit 1
    ) ce on true
    left join lateral (
      select h.compra, h.venta
      from public.tipo_cambio_historial h
      where h.empresa_id = a.empresa_id
        and h.fecha = a.fecha
      limit 1
    ) tc on true
    where a.empresa_id = p_empresa_id
      and a.estado = 'CONFIRMADO'
      and a.fecha >= p_fecha_desde
      and a.fecha <= p_fecha_hasta
      and b.tipo in ('INGRESO', 'COSTO', 'GASTO')
      and coalesce(
        case
          when public.plan_cuentas_infer_nivel(coalesce(ce.codigo, '')) = 5 then 5
          else null
        end,
        public.plan_cuentas_infer_nivel(coalesce(b.codigo, '')),
        b.nivel,
        0
      ) = 5
  ),
  agg as (
    select
      m.cuenta_id,
      m.codigo,
      m.nombre,
      sum(m.debe_monto) as debe_sum,
      sum(m.haber_monto) as haber_sum
    from mov m
    group by m.cuenta_id, m.codigo, m.nombre
  )
  select
    a.cuenta_id,
    a.codigo,
    a.nombre,
    greatest(a.haber_sum - a.debe_sum, 0) as debito_cierre,
    greatest(a.debe_sum - a.haber_sum, 0) as credito_cierre
  from agg a
  where abs(coalesce(a.debe_sum, 0) - coalesce(a.haber_sum, 0)) > 0.000001;

  select coalesce(sum(t.debito_cierre), 0), coalesce(sum(t.credito_cierre), 0)
    into v_total_debe, v_total_haber
  from tmp_cierre_er_lineas t;

  if abs(v_total_debe) <= 0.000001 and abs(v_total_haber) <= 0.000001 then
    raise exception 'No hay saldos de resultados para cerrar en el rango indicado';
  end if;

  v_diferencia := v_total_debe - v_total_haber;

  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, numero_formato
  ) values (
    p_empresa_id,
    v_categoria_id,
    p_fecha_hasta,
    'CIERRE AUTOMATICO ER ' || to_char(p_fecha_desde, 'YYYY-MM-DD') || ' A ' || to_char(p_fecha_hasta, 'YYYY-MM-DD'),
    v_moneda,
    v_tc_cierre,
    'CONFIRMADO',
    v_numero_formato
  )
  returning id into v_asiento_id;

  for r_line in
    select t.cuenta_id, t.codigo, t.nombre, t.debito_cierre, t.credito_cierre
    from tmp_cierre_er_lineas t
    order by t.codigo
  loop
    v_linea := v_linea + 1;
    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia,
      debito_crc, credito_crc, debito_usd, credito_usd
    ) values (
      v_asiento_id,
      v_linea,
      r_line.cuenta_id,
      'Cierre ER cuenta ' || r_line.codigo || ' - ' || r_line.nombre,
      v_numero_formato,
      case when v_moneda = 'CRC' then round(r_line.debito_cierre, 2) else 0 end,
      case when v_moneda = 'CRC' then round(r_line.credito_cierre, 2) else 0 end,
      case when v_moneda = 'USD' then round(r_line.debito_cierre, 2) else 0 end,
      case when v_moneda = 'USD' then round(r_line.credito_cierre, 2) else 0 end
    );
  end loop;

  -- Contrapartida a cuenta de capital.
  v_linea := v_linea + 1;
  insert into public.asiento_lineas (
    asiento_id, linea, cuenta_id, descripcion, referencia,
    debito_crc, credito_crc, debito_usd, credito_usd
  ) values (
    v_asiento_id,
    v_linea,
    v_cuenta_resultado_id,
    'Contrapartida cierre ER',
    v_numero_formato,
    case when v_moneda = 'CRC' then round(greatest(-v_diferencia, 0), 2) else 0 end,
    case when v_moneda = 'CRC' then round(greatest(v_diferencia, 0), 2) else 0 end,
    case when v_moneda = 'USD' then round(greatest(-v_diferencia, 0), 2) else 0 end,
    case when v_moneda = 'USD' then round(greatest(v_diferencia, 0), 2) else 0 end
  );

  if to_regprocedure('public.actualizar_saldos_asiento(bigint)') is not null then
    perform public.actualizar_saldos_asiento(v_asiento_id);
  end if;

  return v_asiento_id;
end;
$$;

grant execute on function public.generar_cierre_estado_resultados(bigint, date, date, text) to authenticated;
grant execute on function public.generar_cierre_estado_resultados(bigint, date, date, text) to service_role;

commit;
