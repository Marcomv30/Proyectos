-- Quick-check de sanidad para cuentas huerfanas (BASE y EMPRESA).
-- No modifica datos; solo reporta posibles problemas.
-- Ejecutar en SQL Editor con rol postgres.

begin;

do $$
declare
  v_base_huerfanas_activas integer := 0;
  v_base_huerfanas_con_mov integer := 0;
  v_empresa_sin_base integer := 0;
  v_empresa_con_base_inactiva integer := 0;
begin
  -- 1) BASE activas nivel<5 sin hijas activas (no deberian quedar tras 047).
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

  -- 2) BASE huerfanas que ademas tienen movimientos historicos.
  select count(*)
    into v_base_huerfanas_con_mov
  from public.plan_cuentas_base b
  where coalesce(b.nivel, 0) between 1 and 4
    and not exists (
      select 1
      from public.plan_cuentas_base h
      where h.padre_id = b.id
        and coalesce(h.activo, true) = true
    )
    and exists (
      select 1
      from public.asiento_lineas l
      where l.cuenta_id = b.id
    );

  -- 3) EMPRESA con cuenta_base_id inexistente.
  select count(*)
    into v_empresa_sin_base
  from public.plan_cuentas_empresa e
  left join public.plan_cuentas_base b on b.id = e.cuenta_base_id
  where b.id is null;

  -- 4) EMPRESA activas cuyo base esta inactiva.
  select count(*)
    into v_empresa_con_base_inactiva
  from public.plan_cuentas_empresa e
  join public.plan_cuentas_base b on b.id = e.cuenta_base_id
  where coalesce(e.activo, true) = true
    and coalesce(b.activo, true) = false;

  raise notice 'QC huerfanas -> base_activas_sin_hijas=% | base_huerfanas_con_mov=% | empresa_sin_base=% | empresa_activa_con_base_inactiva=%',
    v_base_huerfanas_activas,
    v_base_huerfanas_con_mov,
    v_empresa_sin_base,
    v_empresa_con_base_inactiva;
end
$$;

-- Detalle A: BASE activas nivel<5 sin hijas activas.
select
  b.id,
  b.codigo,
  b.nombre,
  b.nivel,
  b.activo,
  exists (select 1 from public.asiento_lineas l where l.cuenta_id = b.id) as tiene_movimientos
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

-- Detalle B: EMPRESA con cuenta_base_id inexistente.
select
  e.id,
  e.empresa_id,
  e.cuenta_base_id,
  e.codigo,
  e.nombre,
  e.activo
from public.plan_cuentas_empresa e
left join public.plan_cuentas_base b on b.id = e.cuenta_base_id
where b.id is null
order by e.empresa_id, e.codigo;

-- Detalle C: EMPRESA activas cuyo base esta inactiva.
select
  e.id,
  e.empresa_id,
  e.codigo as codigo_empresa,
  e.nombre as nombre_empresa,
  e.activo as empresa_activa,
  b.id as base_id,
  b.codigo as codigo_base,
  b.nombre as nombre_base,
  b.activo as base_activa
from public.plan_cuentas_empresa e
join public.plan_cuentas_base b on b.id = e.cuenta_base_id
where coalesce(e.activo, true) = true
  and coalesce(b.activo, true) = false
order by e.empresa_id, e.codigo;

commit;

