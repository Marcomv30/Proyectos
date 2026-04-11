-- Datos demo contables (no destructivo) para pruebas end-to-end.
-- Ejecutar en SQL Editor con rol postgres.
--
-- Que hace:
-- 1) Inserta TC demo en tipo_cambio_historial (upsert por fecha).
-- 2) Inserta 3 asientos CONFIRMADO en CRC, balanceados.
-- 3) Inserta lineas contables asociadas.
--
-- Nota: usa cuentas/categorias existentes; no crea catalogo base.

begin;

do $$
declare
  v_empresa_id bigint := 1; -- cambiar aqui la empresa objetivo
  v_user_id uuid := null;   -- opcional: dejar null

  v_categoria_id bigint;
  v_caja_id bigint;
  v_ingreso_id bigint;
  v_gasto_id bigint;
  v_pasivo_id bigint;

  v_a1_id bigint;
  v_a2_id bigint;
  v_a3_id bigint;
begin
  if v_empresa_id is null then
    raise exception 'Empresa requerida (v_empresa_id)';
  end if;

  if not exists (select 1 from public.empresas e where e.id = v_empresa_id) then
    raise exception 'Empresa % no existe', v_empresa_id;
  end if;

  -- Categoria activa para los asientos demo.
  select c.id
    into v_categoria_id
  from public.asiento_categorias c
  where coalesce(c.activo, true) = true
  order by c.id
  limit 1;

  if v_categoria_id is null then
    raise exception 'No hay categorias activas en asiento_categorias';
  end if;

  -- Cuentas de movimiento por tipo.
  select b.id into v_caja_id
  from public.plan_cuentas_base b
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'ACTIVO'
  order by b.codigo
  limit 1;

  select b.id into v_ingreso_id
  from public.plan_cuentas_base b
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'INGRESO'
  order by b.codigo
  limit 1;

  select b.id into v_gasto_id
  from public.plan_cuentas_base b
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo in ('COSTO', 'GASTO')
  order by case when b.tipo = 'COSTO' then 0 else 1 end, b.codigo
  limit 1;

  select b.id into v_pasivo_id
  from public.plan_cuentas_base b
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'PASIVO'
  order by b.codigo
  limit 1;

  if v_caja_id is null or v_ingreso_id is null or v_gasto_id is null or v_pasivo_id is null then
    raise exception
      'Faltan cuentas de movimiento requeridas. Necesita al menos: ACTIVO, INGRESO, COSTO/GASTO y PASIVO (acepta_movimiento=true).';
  end if;

  -- TC demo (por si luego quiere asientos USD/AMBAS).
  insert into public.tipo_cambio_historial (
    empresa_id, fecha, compra, venta, fuente, raw_data, created_by, updated_by
  ) values
    (v_empresa_id, date '2026-03-05', 472.420000, 477.480000, 'DEMO', null, v_user_id, v_user_id),
    (v_empresa_id, date '2026-03-06', 475.260000, 479.790000, 'DEMO', null, v_user_id, v_user_id),
    (v_empresa_id, date '2026-03-07', 473.350000, 478.700000, 'DEMO', null, v_user_id, v_user_id)
  on conflict (empresa_id, fecha) do update
  set compra = excluded.compra,
      venta = excluded.venta,
      fuente = excluded.fuente,
      raw_data = excluded.raw_data,
      updated_at = now(),
      updated_by = excluded.updated_by;

  -- Asiento 1: venta contado (Caja / Ingreso)
  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, numero_formato, updated_by
  ) values (
    v_empresa_id, v_categoria_id, date '2026-03-05',
    'VENTA CONTADO DEMO', 'CRC', 1, 'CONFIRMADO', 'DEMO-001-2026', v_user_id
  )
  on conflict do nothing
  returning id into v_a1_id;

  if v_a1_id is not null then
    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia, debito_crc, credito_crc, debito_usd, credito_usd
    ) values
      (v_a1_id, 1, v_caja_id,    'Ingreso de efectivo', 'DEMO-001-2026', 100000, 0, 0, 0),
      (v_a1_id, 2, v_ingreso_id, 'Registro de venta',   'DEMO-001-2026', 0, 100000, 0, 0);
  end if;

  -- Asiento 2: gasto contado (Gasto/Costo / Caja)
  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, numero_formato, updated_by
  ) values (
    v_empresa_id, v_categoria_id, date '2026-03-06',
    'PAGO GASTO DEMO', 'CRC', 1, 'CONFIRMADO', 'DEMO-002-2026', v_user_id
  )
  on conflict do nothing
  returning id into v_a2_id;

  if v_a2_id is not null then
    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia, debito_crc, credito_crc, debito_usd, credito_usd
    ) values
      (v_a2_id, 1, v_gasto_id, 'Gasto operativo demo', 'DEMO-002-2026', 25000, 0, 0, 0),
      (v_a2_id, 2, v_caja_id,  'Salida de efectivo',   'DEMO-002-2026', 0, 25000, 0, 0);
  end if;

  -- Asiento 3: compra a credito (Gasto/Costo / Pasivo)
  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, numero_formato, updated_by
  ) values (
    v_empresa_id, v_categoria_id, date '2026-03-07',
    'COMPRA A CREDITO DEMO', 'CRC', 1, 'CONFIRMADO', 'DEMO-003-2026', v_user_id
  )
  on conflict do nothing
  returning id into v_a3_id;

  if v_a3_id is not null then
    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia, debito_crc, credito_crc, debito_usd, credito_usd
    ) values
      (v_a3_id, 1, v_gasto_id,  'Compra/consumo demo',  'DEMO-003-2026', 50000, 0, 0, 0),
      (v_a3_id, 2, v_pasivo_id, 'Cuenta por pagar demo','DEMO-003-2026', 0, 50000, 0, 0);
  end if;

  -- Si existe la funcion de saldos, la ejecuta.
  if to_regprocedure('public.actualizar_saldos_asiento(bigint)') is not null then
    if v_a1_id is not null then perform public.actualizar_saldos_asiento(v_a1_id); end if;
    if v_a2_id is not null then perform public.actualizar_saldos_asiento(v_a2_id); end if;
    if v_a3_id is not null then perform public.actualizar_saldos_asiento(v_a3_id); end if;
  end if;

  raise notice 'Seed DEMO aplicado para empresa_id=% (asientos nuevos: %, %, %).',
    v_empresa_id,
    coalesce(v_a1_id::text, 'existia'),
    coalesce(v_a2_id::text, 'existia'),
    coalesce(v_a3_id::text, 'existia');
end
$$;

commit;

