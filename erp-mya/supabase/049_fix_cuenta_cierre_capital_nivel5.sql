-- Repara/garantiza cuenta de cierre en CAPITAL nivel 5 para contrapartida de ER.
-- Crea o reactiva jerarquia:
--   03
--   0302
--   0302-01
--   0302-01-001
--   0302-01-001-001  <-- movimiento (nivel 5)
-- Tambien sincroniza filas faltantes en plan_cuentas_empresa.
-- Ejecutar en SQL Editor con rol postgres.

begin;

do $$
declare
  v_b03 bigint;
  v_b0302 bigint;
  v_b0302_01 bigint;
  v_b0302_01_001 bigint;
  v_b0302_01_001_001 bigint;
  v_insert_emp integer := 0;
  v_update_emp integer := 0;
begin
  -- 03 CAPITAL
  update public.plan_cuentas_base
  set
    nombre = 'CAPITAL',
    nivel = 1,
    tipo = 'CAPITAL',
    naturaleza = 'CREDITO',
    acepta_movimiento = false,
    activo = true
  where codigo = '03';

  if not found then
    insert into public.plan_cuentas_base (codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, activo)
    values ('03', 'CAPITAL', 1, 'CAPITAL', 'CREDITO', false, true);
  end if;

  select id into v_b03 from public.plan_cuentas_base where codigo = '03' limit 1;

  -- 0302 RESULTADOS ACUMULADOS
  update public.plan_cuentas_base
  set
    nombre = 'RESULTADOS ACUMULADOS',
    nivel = 2,
    tipo = 'CAPITAL',
    naturaleza = 'CREDITO',
    acepta_movimiento = false,
    activo = true,
    padre_id = v_b03
  where codigo = '0302';

  if not found then
    insert into public.plan_cuentas_base (codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, activo, padre_id)
    values ('0302', 'RESULTADOS ACUMULADOS', 2, 'CAPITAL', 'CREDITO', false, true, v_b03);
  end if;

  select id into v_b0302 from public.plan_cuentas_base where codigo = '0302' limit 1;

  -- 0302-01 RESULTADOS DEL PERIODO
  update public.plan_cuentas_base
  set
    nombre = 'RESULTADOS DEL PERIODO',
    nivel = 3,
    tipo = 'CAPITAL',
    naturaleza = 'CREDITO',
    acepta_movimiento = false,
    activo = true,
    padre_id = v_b0302
  where codigo = '0302-01';

  if not found then
    insert into public.plan_cuentas_base (codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, activo, padre_id)
    values ('0302-01', 'RESULTADOS DEL PERIODO', 3, 'CAPITAL', 'CREDITO', false, true, v_b0302);
  end if;

  select id into v_b0302_01 from public.plan_cuentas_base where codigo = '0302-01' limit 1;

  -- 0302-01-001 UTILIDAD O PERDIDA ACUMULADA
  update public.plan_cuentas_base
  set
    nombre = 'UTILIDAD O PERDIDA ACUMULADA',
    nivel = 4,
    tipo = 'CAPITAL',
    naturaleza = 'CREDITO',
    acepta_movimiento = false,
    activo = true,
    padre_id = v_b0302_01
  where codigo = '0302-01-001';

  if not found then
    insert into public.plan_cuentas_base (codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, activo, padre_id)
    values ('0302-01-001', 'UTILIDAD O PERDIDA ACUMULADA', 4, 'CAPITAL', 'CREDITO', false, true, v_b0302_01);
  end if;

  select id into v_b0302_01_001 from public.plan_cuentas_base where codigo = '0302-01-001' limit 1;

  -- 0302-01-001-001 UTILIDAD O PERDIDA DEL EJERCICIO (nivel 5 de movimiento)
  update public.plan_cuentas_base
  set
    nombre = 'UTILIDAD O PERDIDA DEL EJERCICIO',
    nivel = 5,
    tipo = 'CAPITAL',
    naturaleza = 'CREDITO',
    acepta_movimiento = true,
    activo = true,
    padre_id = v_b0302_01_001
  where codigo = '0302-01-001-001';

  if not found then
    insert into public.plan_cuentas_base (codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento, activo, padre_id)
    values ('0302-01-001-001', 'UTILIDAD O PERDIDA DEL EJERCICIO', 5, 'CAPITAL', 'CREDITO', true, true, v_b0302_01_001);
  end if;

  select id into v_b0302_01_001_001 from public.plan_cuentas_base where codigo = '0302-01-001-001' limit 1;

  -- Sincroniza catalogo por empresa (solo crea faltantes y reactiva existentes para esta jerarquia).
  insert into public.plan_cuentas_empresa (empresa_id, cuenta_base_id, codigo, nombre, activo)
  select
    e.id as empresa_id,
    b.id as cuenta_base_id,
    b.codigo,
    b.nombre,
    true
  from public.empresas e
  cross join public.plan_cuentas_base b
  where b.codigo in ('03', '0302', '0302-01', '0302-01-001', '0302-01-001-001')
    and coalesce(e.activo, true) = true
    and not exists (
      select 1
      from public.plan_cuentas_empresa pe
      where pe.empresa_id = e.id
        and pe.cuenta_base_id = b.id
    );

  get diagnostics v_insert_emp = row_count;

  update public.plan_cuentas_empresa pe
  set activo = true
  from public.plan_cuentas_base b
  where pe.cuenta_base_id = b.id
    and b.codigo in ('03', '0302', '0302-01', '0302-01-001', '0302-01-001-001')
    and coalesce(pe.activo, true) = false;

  get diagnostics v_update_emp = row_count;

  raise notice 'Fix cierre CAPITAL nivel5 aplicado. base_contrapartida_id=% | empresa_insertadas=% | empresa_reactivadas=%',
    v_b0302_01_001_001, v_insert_emp, v_update_emp;
end
$$;

commit;

