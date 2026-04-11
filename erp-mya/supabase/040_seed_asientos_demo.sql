-- Seed de asientos demo con detalle en asiento_lineas (CRC/USD/AMBAS).
-- Ejecutar en SQL Editor con rol postgres.
--
-- Requisitos previos:
-- - Catalogo base cargado (plan_cuentas_base).
-- - Categoria de asiento activa en asiento_categorias.
-- - Migraciones de tipo de cambio y regla TC venta aplicadas (027 y 030).
--
-- Nota:
-- - Usa numero_formato unico por asiento para evitar choques con indice unico de confirmados.

begin;

do $$
declare
  v_empresa_id bigint := 1; -- cambiar empresa aqui
  v_uid uuid := null;       -- opcional para auditoria

  v_categoria_id bigint;
  v_cuenta_activo bigint;
  v_cuenta_ingreso bigint;
  v_cuenta_costo bigint;
  v_cuenta_gasto bigint;
  v_cuenta_pasivo bigint;
  v_codigo_activo text;
  v_codigo_ingreso text;
  v_codigo_costo text;
  v_codigo_gasto text;
  v_codigo_pasivo text;
  v_nivel_activo integer;
  v_nivel_ingreso integer;
  v_nivel_costo integer;
  v_nivel_gasto integer;
  v_nivel_pasivo integer;

  v_tc_2026_03_05 numeric := 477.48;
  v_tc_2026_03_06 numeric := 479.79;
  v_tc_2026_03_07 numeric := 478.70;
  v_moneda_ambas text := 'AMBAS';

  v_a_id bigint;
begin
  if v_empresa_id is null then
    raise exception 'Empresa requerida (v_empresa_id)';
  end if;

  -- Compatibilidad: si moneda es varchar(3), no cabe 'AMBAS'.
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'asientos'
      and c.column_name = 'moneda'
      and c.character_maximum_length is not null
      and c.character_maximum_length <= 3
  ) then
    v_moneda_ambas := 'USD';
  end if;

  if not exists (select 1 from public.empresas e where e.id = v_empresa_id) then
    raise exception 'Empresa % no existe', v_empresa_id;
  end if;

  -- Limpia seed demo anterior para evitar que queden asientos viejos mal apuntados.
  delete from public.asiento_lineas l
  using public.asientos a
  where a.id = l.asiento_id
    and a.empresa_id = v_empresa_id
    and a.numero_formato like 'DEMO-%-2026';

  delete from public.asientos a
  where a.empresa_id = v_empresa_id
    and a.numero_formato like 'DEMO-%-2026';

  select c.id
    into v_categoria_id
  from public.asiento_categorias c
  where coalesce(c.activo, true) = true
  order by c.id
  limit 1;

  if v_categoria_id is null then
    raise exception 'No hay categoria activa en asiento_categorias';
  end if;

  -- Cuentas de movimiento demo:
  -- toma solo cuentas cuyo codigo efectivo (empresa/base) sea nivel 5,
  -- para respetar patron padre/hijo en reportes que priorizan codigo empresa.
  select
    b.id,
    coalesce(e.codigo, b.codigo),
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0)
  into v_cuenta_activo, v_codigo_activo, v_nivel_activo
  from public.plan_cuentas_base b
  left join public.plan_cuentas_empresa e
    on e.empresa_id = v_empresa_id
   and e.cuenta_base_id = b.id
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'ACTIVO'
  order by
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0) desc,
    coalesce(e.codigo, b.codigo)
  limit 1;

  select
    b.id,
    coalesce(e.codigo, b.codigo),
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0)
  into v_cuenta_ingreso, v_codigo_ingreso, v_nivel_ingreso
  from public.plan_cuentas_base b
  left join public.plan_cuentas_empresa e
    on e.empresa_id = v_empresa_id
   and e.cuenta_base_id = b.id
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'INGRESO'
  order by
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0) desc,
    coalesce(e.codigo, b.codigo)
  limit 1;

  select
    b.id,
    coalesce(e.codigo, b.codigo),
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0)
  into v_cuenta_costo, v_codigo_costo, v_nivel_costo
  from public.plan_cuentas_base b
  left join public.plan_cuentas_empresa e
    on e.empresa_id = v_empresa_id
   and e.cuenta_base_id = b.id
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'COSTO'
  order by
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0) desc,
    coalesce(e.codigo, b.codigo)
  limit 1;

  select
    b.id,
    coalesce(e.codigo, b.codigo),
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0)
  into v_cuenta_gasto, v_codigo_gasto, v_nivel_gasto
  from public.plan_cuentas_base b
  left join public.plan_cuentas_empresa e
    on e.empresa_id = v_empresa_id
   and e.cuenta_base_id = b.id
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'GASTO'
  order by
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0) desc,
    coalesce(e.codigo, b.codigo)
  limit 1;

  select
    b.id,
    coalesce(e.codigo, b.codigo),
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0)
  into v_cuenta_pasivo, v_codigo_pasivo, v_nivel_pasivo
  from public.plan_cuentas_base b
  left join public.plan_cuentas_empresa e
    on e.empresa_id = v_empresa_id
   and e.cuenta_base_id = b.id
  where coalesce(b.activo, true) = true
    and coalesce(b.acepta_movimiento, false) = true
    and b.tipo = 'PASIVO'
  order by
    coalesce(public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo)), 0) desc,
    coalesce(e.codigo, b.codigo)
  limit 1;

  if v_cuenta_activo is null or v_nivel_activo <> 5 then
    raise exception 'ACTIVO sin nivel 5 efectivo. Codigo=% nivel=%', coalesce(v_codigo_activo, '[NULL]'), coalesce(v_nivel_activo, 0);
  end if;

  if v_cuenta_ingreso is null or v_nivel_ingreso <> 5 then
    raise exception 'INGRESO sin nivel 5 efectivo. Codigo=% nivel=%', coalesce(v_codigo_ingreso, '[NULL]'), coalesce(v_nivel_ingreso, 0);
  end if;

  if v_cuenta_pasivo is null or v_nivel_pasivo <> 5 then
    raise exception 'PASIVO sin nivel 5 efectivo. Codigo=% nivel=%', coalesce(v_codigo_pasivo, '[NULL]'), coalesce(v_nivel_pasivo, 0);
  end if;

  if (v_cuenta_costo is null or v_nivel_costo <> 5)
     and (v_cuenta_gasto is null or v_nivel_gasto <> 5) then
    raise exception
      'Sin nivel 5 efectivo en COSTO/GASTO. COSTO(codigo=%,nivel=%) GASTO(codigo=%,nivel=%)',
      coalesce(v_codigo_costo, '[NULL]'),
      coalesce(v_nivel_costo, 0),
      coalesce(v_codigo_gasto, '[NULL]'),
      coalesce(v_nivel_gasto, 0);
  end if;

  -- Garantiza TC del dia para asientos USD/AMBAS confirmados.
  insert into public.tipo_cambio_historial (
    empresa_id, fecha, compra, venta, fuente, raw_data, created_by, updated_by
  ) values
    (v_empresa_id, date '2026-03-05', 472.42, v_tc_2026_03_05, 'DEMO', null, v_uid, v_uid),
    (v_empresa_id, date '2026-03-06', 475.26, v_tc_2026_03_06, 'DEMO', null, v_uid, v_uid),
    (v_empresa_id, date '2026-03-07', 473.35, v_tc_2026_03_07, 'DEMO', null, v_uid, v_uid)
  on conflict (empresa_id, fecha) do update
  set compra = excluded.compra,
      venta = excluded.venta,
      fuente = excluded.fuente,
      raw_data = excluded.raw_data,
      updated_at = now(),
      updated_by = excluded.updated_by;

  -- 1) CRC: venta contado
  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, numero_formato
  ) values (
    v_empresa_id, v_categoria_id, date '2026-03-05',
    'DEMO CRC - VENTA CONTADO', 'CRC', v_tc_2026_03_05, 'CONFIRMADO', 'DEMO-CRC-001-2026'
  )
  returning id into v_a_id;

  if v_a_id is not null then
    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia, debito_crc, credito_crc, debito_usd, credito_usd
    ) values
      (v_a_id, 1, v_cuenta_activo,  'Ingreso efectivo CRC', 'DEMO-CRC-001-2026', 250000, 0, round(250000 / v_tc_2026_03_05, 2), 0),
      (v_a_id, 2, v_cuenta_ingreso, 'Venta local CRC',      'DEMO-CRC-001-2026', 0, 250000, 0, round(250000 / v_tc_2026_03_05, 2));
  end if;

  -- 2) CRC: gasto/pago contado
  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, numero_formato
  ) values (
    v_empresa_id, v_categoria_id, date '2026-03-06',
    'DEMO CRC - GASTO CONTADO', 'CRC', v_tc_2026_03_06, 'CONFIRMADO', 'DEMO-CRC-002-2026'
  )
  returning id into v_a_id;

  if v_a_id is not null then
    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia, debito_crc, credito_crc, debito_usd, credito_usd
    ) values
      (v_a_id, 1, coalesce(v_cuenta_gasto, v_cuenta_costo), 'Registro gasto operativo', 'DEMO-CRC-002-2026', 60000, 0, round(60000 / v_tc_2026_03_06, 2), 0),
      (v_a_id, 2, v_cuenta_activo,                           'Salida de caja',            'DEMO-CRC-002-2026', 0, 60000, 0, round(60000 / v_tc_2026_03_06, 2));
  end if;

  -- 3) CRC: compra a credito
  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, numero_formato
  ) values (
    v_empresa_id, v_categoria_id, date '2026-03-07',
    'DEMO CRC - COMPRA A CREDITO', 'CRC', v_tc_2026_03_07, 'CONFIRMADO', 'DEMO-CRC-003-2026'
  )
  returning id into v_a_id;

  if v_a_id is not null then
    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia, debito_crc, credito_crc, debito_usd, credito_usd
    ) values
      (v_a_id, 1, coalesce(v_cuenta_costo, v_cuenta_gasto), 'Compra/consumo a credito', 'DEMO-CRC-003-2026', 125000, 0, round(125000 / v_tc_2026_03_07, 2), 0),
      (v_a_id, 2, v_cuenta_pasivo,                          'Cuenta por pagar',          'DEMO-CRC-003-2026', 0, 125000, 0, round(125000 / v_tc_2026_03_07, 2));
  end if;

  -- 4) USD: venta contado (TC venta del dia)
  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, numero_formato
  ) values (
    v_empresa_id, v_categoria_id, date '2026-03-07',
    'DEMO USD - VENTA CONTADO', 'USD', v_tc_2026_03_07, 'CONFIRMADO', 'DEMO-USD-001-2026'
  )
  returning id into v_a_id;

  if v_a_id is not null then
    -- 1,000 USD @ 478.70 = 478,700 CRC
    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia, debito_crc, credito_crc, debito_usd, credito_usd
    ) values
      (v_a_id, 1, v_cuenta_activo,  'Ingreso efectivo USD', 'DEMO-USD-001-2026', 478700, 0, 1000, 0),
      (v_a_id, 2, v_cuenta_ingreso, 'Venta exportacion',    'DEMO-USD-001-2026', 0, 478700, 0, 1000);
  end if;

  -- 5) AMBAS/USD: cancelacion parcial de pasivo en USD (lineas con CRC+USD)
  insert into public.asientos (
    empresa_id, categoria_id, fecha, descripcion, moneda, tipo_cambio, estado, numero_formato
  ) values (
    v_empresa_id, v_categoria_id, date '2026-03-06',
    'DEMO AMBAS - PAGO PARCIAL PASIVO', v_moneda_ambas, v_tc_2026_03_06, 'CONFIRMADO', 'DEMO-AMB-001-2026'
  )
  returning id into v_a_id;

  if v_a_id is not null then
    -- 300 USD @ 479.79 = 143,937 CRC
    insert into public.asiento_lineas (
      asiento_id, linea, cuenta_id, descripcion, referencia, debito_crc, credito_crc, debito_usd, credito_usd
    ) values
      (v_a_id, 1, v_cuenta_pasivo, 'Cancela cuenta por pagar USD', 'DEMO-AMB-001-2026', 143937, 0, 300, 0),
      (v_a_id, 2, v_cuenta_activo, 'Salida de banco/caja USD',     'DEMO-AMB-001-2026', 0, 143937, 0, 300);
  end if;

  -- Recalculo de saldos si la funcion existe.
  if to_regprocedure('public.actualizar_saldos_asiento(bigint)') is not null then
    perform public.actualizar_saldos_asiento(a.id)
    from public.asientos a
    where a.empresa_id = v_empresa_id
      and a.numero_formato like 'DEMO-%-2026'
      and a.estado = 'CONFIRMADO';
  end if;

  raise notice 'Seed asientos demo completado para empresa_id=%.', v_empresa_id;
end
$$;

commit;
