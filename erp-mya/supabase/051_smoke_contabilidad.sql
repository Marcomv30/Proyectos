-- Smoke test contable (no destructivo).
-- Objetivo: validar salud basica del ciclo contable antes de pasar a otros modulos.
-- Ejecutar en SQL Editor con rol postgres.
--
-- Parametros editables:
--   v_empresa_id = null  -> todas las empresas
--   v_fecha_desde/hasta  -> null = sin filtro

begin;

do $$
declare
  v_empresa_id bigint := null;
  v_fecha_desde date := null;
  v_fecha_hasta date := null;

  v_total_asientos integer := 0;
  v_asientos_descuadrados_crc integer := 0;
  v_asientos_descuadrados_usd integer := 0;
  v_lineas_nivel_no_5 integer := 0;
  v_tc_faltante_para_conversion integer := 0;
  v_cierres_duplicados integer := 0;
  v_base_huerfanas_activas integer := 0;
  v_empresa_sin_base integer := 0;
  v_capital_nivel5_mov integer := 0;
begin
  if v_fecha_desde is not null and v_fecha_hasta is not null and v_fecha_desde > v_fecha_hasta then
    raise exception 'Rango invalido: fecha_desde > fecha_hasta';
  end if;

  create temporary table tmp_smoke_asientos on commit drop as
  select
    a.id,
    a.empresa_id,
    a.fecha,
    a.numero_formato,
    coalesce(sum(coalesce(l.debito_crc, 0)), 0)::numeric as deb_crc,
    coalesce(sum(coalesce(l.credito_crc, 0)), 0)::numeric as hab_crc,
    coalesce(sum(coalesce(l.debito_usd, 0)), 0)::numeric as deb_usd,
    coalesce(sum(coalesce(l.credito_usd, 0)), 0)::numeric as hab_usd
  from public.asientos a
  join public.asiento_lineas l on l.asiento_id = a.id
  where a.estado = 'CONFIRMADO'
    and (v_empresa_id is null or a.empresa_id = v_empresa_id)
    and (v_fecha_desde is null or a.fecha >= v_fecha_desde)
    and (v_fecha_hasta is null or a.fecha <= v_fecha_hasta)
  group by a.id, a.empresa_id, a.fecha, a.numero_formato;

  select count(*) into v_total_asientos from tmp_smoke_asientos;

  select count(*)
    into v_asientos_descuadrados_crc
  from tmp_smoke_asientos t
  where abs(coalesce(t.deb_crc, 0) - coalesce(t.hab_crc, 0)) > 0.01;

  select count(*)
    into v_asientos_descuadrados_usd
  from tmp_smoke_asientos t
  where abs(coalesce(t.deb_usd, 0) - coalesce(t.hab_usd, 0)) > 0.01;

  select count(*)
    into v_lineas_nivel_no_5
  from public.asiento_lineas l
  join public.asientos a on a.id = l.asiento_id
  left join public.plan_cuentas_base b on b.id = l.cuenta_id
  left join public.plan_cuentas_empresa e
    on e.empresa_id = a.empresa_id
   and e.cuenta_base_id = b.id
  where a.estado = 'CONFIRMADO'
    and (v_empresa_id is null or a.empresa_id = v_empresa_id)
    and (v_fecha_desde is null or a.fecha >= v_fecha_desde)
    and (v_fecha_hasta is null or a.fecha <= v_fecha_hasta)
    and coalesce(
      case
        when public.plan_cuentas_infer_nivel(coalesce(e.codigo, '')) = 5 then 5
        else null
      end,
      public.plan_cuentas_infer_nivel(coalesce(b.codigo, '')),
      b.nivel,
      0
    ) <> 5;

  select count(*)
    into v_tc_faltante_para_conversion
  from public.asiento_lineas l
  join public.asientos a on a.id = l.asiento_id
  left join lateral (
    select h.compra, h.venta
    from public.tipo_cambio_historial h
    where h.empresa_id = a.empresa_id
      and h.fecha = a.fecha
    limit 1
  ) tc on true
  where a.estado = 'CONFIRMADO'
    and (v_empresa_id is null or a.empresa_id = v_empresa_id)
    and (v_fecha_desde is null or a.fecha >= v_fecha_desde)
    and (v_fecha_hasta is null or a.fecha <= v_fecha_hasta)
    and (
      (coalesce(l.debito_crc, 0) > 0 and coalesce(l.debito_usd, 0) = 0)
      or (coalesce(l.credito_crc, 0) > 0 and coalesce(l.credito_usd, 0) = 0)
      or (coalesce(l.debito_usd, 0) > 0 and coalesce(l.debito_crc, 0) = 0)
      or (coalesce(l.credito_usd, 0) > 0 and coalesce(l.credito_crc, 0) = 0)
    )
    and coalesce(nullif(a.tipo_cambio, 0), tc.venta, tc.compra, 0) <= 0;

  select count(*)
    into v_cierres_duplicados
  from (
    select a.empresa_id, lower(btrim(coalesce(a.numero_formato, ''))) as numero_norm, count(*) as qty
    from public.asientos a
    where a.estado = 'CONFIRMADO'
      and upper(coalesce(a.numero_formato, '')) like 'CER-%'
      and (v_empresa_id is null or a.empresa_id = v_empresa_id)
    group by a.empresa_id, lower(btrim(coalesce(a.numero_formato, '')))
    having count(*) > 1
  ) d;

  select count(*)
    into v_base_huerfanas_activas
  from public.plan_cuentas_base b
  where coalesce(b.activo, true) = true
    and coalesce(b.nivel, 0) between 1 and 4
    and not exists (
      select 1
      from public.plan_cuentas_base h
      where h.padre_id = b.id
        and coalesce(h.activo, true) = true
    );

  select count(*)
    into v_empresa_sin_base
  from public.plan_cuentas_empresa e
  left join public.plan_cuentas_base b on b.id = e.cuenta_base_id
  where b.id is null
    and (v_empresa_id is null or e.empresa_id = v_empresa_id);

  select count(*)
    into v_capital_nivel5_mov
  from public.plan_cuentas_base b
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'CAPITAL'
    and coalesce(public.plan_cuentas_infer_nivel(coalesce(b.codigo, '')), b.nivel, 0) = 5;

  raise notice 'SMOKE Contabilidad -> asientos=% | descuadre_crc=% | descuadre_usd=% | lineas_nivel!=5=% | tc_faltante_conversion=%',
    v_total_asientos, v_asientos_descuadrados_crc, v_asientos_descuadrados_usd, v_lineas_nivel_no_5, v_tc_faltante_para_conversion;

  raise notice 'SMOKE Estructura -> cierres_duplicados=% | base_huerfanas_activas=% | empresa_sin_base=% | capital_nivel5_mov=%',
    v_cierres_duplicados, v_base_huerfanas_activas, v_empresa_sin_base, v_capital_nivel5_mov;
end
$$;

-- Detalle 1: Asientos descuadrados (CRC/USD).
select
  t.empresa_id,
  t.id as asiento_id,
  t.fecha,
  t.numero_formato,
  t.deb_crc,
  t.hab_crc,
  (t.deb_crc - t.hab_crc) as dif_crc,
  t.deb_usd,
  t.hab_usd,
  (t.deb_usd - t.hab_usd) as dif_usd
from tmp_smoke_asientos t
where abs(coalesce(t.deb_crc, 0) - coalesce(t.hab_crc, 0)) > 0.01
   or abs(coalesce(t.deb_usd, 0) - coalesce(t.hab_usd, 0)) > 0.01
order by t.empresa_id, t.fecha, t.id;

-- Detalle 2: Cierres duplicados.
select
  a.empresa_id,
  lower(btrim(coalesce(a.numero_formato, ''))) as numero_formato_norm,
  count(*) as confirmados
from public.asientos a
where a.estado = 'CONFIRMADO'
  and upper(coalesce(a.numero_formato, '')) like 'CER-%'
group by a.empresa_id, lower(btrim(coalesce(a.numero_formato, '')))
having count(*) > 1
order by a.empresa_id, numero_formato_norm;

-- Detalle 3: Cuentas BASE huerfanas activas.
select
  b.id,
  b.codigo,
  b.nombre,
  b.nivel,
  b.tipo,
  b.activo
from public.plan_cuentas_base b
where coalesce(b.activo, true) = true
  and coalesce(b.nivel, 0) between 1 and 4
  and not exists (
    select 1
    from public.plan_cuentas_base h
    where h.padre_id = b.id
      and coalesce(h.activo, true) = true
  )
order by b.codigo;

commit;

