-- Limpieza segura de cuentas huerfanas en plan_cuentas_base.
-- Definicion operativa de huerfana:
-- - Cuenta con nivel < 5
-- - Sin hijas activas en plan_cuentas_base
--
-- Regla de saneamiento:
-- - Si NO tiene referencias historicas: elimina la cuenta base y sus copias empresa.
-- - Si SI tiene referencias (asiento_lineas): no elimina por FK; la desactiva y bloquea movimiento.
--
-- Ejecutar en SQL Editor con rol postgres.

begin;

do $$
declare
  v_deleted integer := 0;
  v_soft_locked integer := 0;
begin
  create temporary table tmp_cuentas_huerfanas_base on commit drop as
  with candidatas as (
    select
      b.id,
      b.codigo,
      b.nombre,
      coalesce(b.nivel, 0) as nivel
    from public.plan_cuentas_base b
    where coalesce(b.activo, true) = true
      and coalesce(b.nivel, 0) between 1 and 4
      and not exists (
        select 1
        from public.plan_cuentas_base h
        where h.padre_id = b.id
          and coalesce(h.activo, true) = true
      )
  )
  select
    c.*,
    exists (
      select 1
      from public.asiento_lineas l
      where l.cuenta_id = c.id
    ) as tiene_movimientos
  from candidatas c;

  -- 1) Cuentas sin movimientos: eliminar copias empresa y base.
  delete from public.plan_cuentas_empresa e
  using tmp_cuentas_huerfanas_base t
  where e.cuenta_base_id = t.id
    and t.tiene_movimientos = false;

  delete from public.plan_cuentas_base b
  using tmp_cuentas_huerfanas_base t
  where b.id = t.id
    and t.tiene_movimientos = false;

  get diagnostics v_deleted = row_count;

  -- 2) Cuentas con movimientos: bloqueo suave (no borrar por integridad historica).
  update public.plan_cuentas_base b
  set
    acepta_movimiento = false,
    activo = false,
    nombre = left(coalesce(b.nombre, '') || ' [DESACTIVADA-HUERFANA]', 255)
  from tmp_cuentas_huerfanas_base t
  where b.id = t.id
    and t.tiene_movimientos = true
    and (
      coalesce(b.acepta_movimiento, false) = true
      or coalesce(b.activo, true) = true
      or coalesce(b.nombre, '') not like '%[DESACTIVADA-HUERFANA]%'
    );

  get diagnostics v_soft_locked = row_count;

  raise notice 'Plan cuentas huerfanas: eliminadas=% bloqueadas_por_historial=%', v_deleted, v_soft_locked;
end
$$;

commit;
