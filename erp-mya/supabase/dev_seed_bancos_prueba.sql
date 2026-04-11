-- Seed de prueba para modulo Bancos
-- Objetivo:
-- 1) crear/reutilizar una cuenta bancaria de prueba
-- 2) crear dos pagos en auxiliar bancario
-- 3) crear un periodo de conciliacion del mes actual
-- 4) cargar tres lineas de estado bancario:
--    - dos depositos que deben sugerirse / conciliarse
--    - una comision bancaria para probar diferencias
--
-- Ejecutar en SQL Editor con rol postgres.
-- Ajuste opcional: cambiar v_empresa_id si desea otra empresa.

begin;

do $$
declare
  v_empresa_id bigint := 1;
  v_mes_desde date := date_trunc('month', current_date)::date;
  v_mes_hasta date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;

  v_tercero_id bigint;
  v_cuenta_banco_id bigint;
  v_cuenta_banco_codigo text;
  v_cuenta_banco_alias text;
  v_cuenta_banco_contable_id bigint;
  v_cuenta_diferencia_id bigint;
  v_cuenta_diferencia_codigo text;
  v_cuenta_diferencia_nombre text;
  v_periodo_id bigint;
  v_pago_1 bigint;
  v_pago_2 bigint;
begin
  if not exists (select 1 from public.empresas where id = v_empresa_id) then
    raise exception 'empresa_no_encontrada: %', v_empresa_id;
  end if;

  -- Limpieza seed anterior
  delete from public.bancos_conciliacion_periodos
  where empresa_id = v_empresa_id
    and observacion like '[SEED_BANCOS]%';

  delete from public.recaudacion_pagos
  where empresa_id = v_empresa_id
    and referencia like 'SEED-BAN-%';

  delete from public.cxc_documentos
  where empresa_id = v_empresa_id
    and numero_documento like 'SEED-BAN-%';

  -- Cliente demo
  select id
    into v_tercero_id
  from public.terceros
  where empresa_id = v_empresa_id
    and lower(coalesce(tipo_identificacion, '')) = lower('CEDULA')
    and lower(coalesce(identificacion, '')) = lower('3101999999')
  limit 1;

  if v_tercero_id is null then
    insert into public.terceros (
      empresa_id, codigo, tipo_identificacion, identificacion, razon_social, email, activo
    )
    values (
      v_empresa_id, 'CL-SEED-BAN', 'CEDULA', '3101999999', 'CLIENTE PRUEBA BANCOS', 'seed-bancos@local.test', true
    )
    returning id into v_tercero_id;
  else
    update public.terceros
    set
      codigo = 'CL-SEED-BAN',
      razon_social = 'CLIENTE PRUEBA BANCOS',
      email = 'seed-bancos@local.test',
      activo = true,
      updated_at = now()
    where id = v_tercero_id;
  end if;

  perform public.ensure_tercero_rol(v_tercero_id, 'cliente', true, null);

  -- Cuenta bancaria demo: intenta reutilizar una existente, si no crea una con una cuenta bancaria libre
  select id, codigo, alias, cuenta_contable_id
    into v_cuenta_banco_id, v_cuenta_banco_codigo, v_cuenta_banco_alias, v_cuenta_banco_contable_id
  from public.cuentas_bancarias_empresa
  where empresa_id = v_empresa_id
    and codigo = 'SEED-BAN-CRC'
  limit 1;

  if v_cuenta_banco_id is null then
    with recursive bancos_base as (
      select id, padre_id
      from public.plan_cuentas_base
      where upper(trim(nombre)) = 'BANCOS'
      union all
      select b.id, b.padre_id
      from public.plan_cuentas_base b
      join bancos_base bb on bb.id = b.padre_id
    ),
    libres as (
      select pce.id, pce.codigo, pce.nombre
      from public.plan_cuentas_empresa pce
      where pce.empresa_id = v_empresa_id
        and pce.activo = true
        and pce.cuenta_base_id in (select id from bancos_base)
        and not exists (
          select 1
          from public.cuentas_bancarias_empresa cb
          where cb.empresa_id = v_empresa_id
            and cb.cuenta_contable_id = pce.id
        )
      order by pce.codigo
      limit 1
    )
    select id, codigo, nombre
      into v_cuenta_banco_contable_id, v_cuenta_banco_codigo, v_cuenta_banco_alias
    from libres;

    if v_cuenta_banco_contable_id is not null then
      insert into public.cuentas_bancarias_empresa (
        empresa_id, codigo, alias, banco_nombre, titular, moneda, numero_cuenta, cuenta_contable_id, activo
      )
      values (
        v_empresa_id,
        'SEED-BAN-CRC',
        'Cuenta Prueba Bancos',
        'BCR',
        'Empresa Demo',
        'CRC',
        '001-TEST-CRC',
        v_cuenta_banco_contable_id,
        true
      )
      returning id, codigo, alias, cuenta_contable_id
      into v_cuenta_banco_id, v_cuenta_banco_codigo, v_cuenta_banco_alias, v_cuenta_banco_contable_id;
    end if;
  end if;

  if v_cuenta_banco_id is null then
    select id, codigo, alias, cuenta_contable_id
      into v_cuenta_banco_id, v_cuenta_banco_codigo, v_cuenta_banco_alias, v_cuenta_banco_contable_id
    from public.cuentas_bancarias_empresa
    where empresa_id = v_empresa_id
      and activo = true
      and moneda = 'CRC'
    order by codigo
    limit 1;
  end if;

  if v_cuenta_banco_id is null then
    raise exception 'No se encontro ni se pudo crear una cuenta bancaria de prueba para empresa_id=%', v_empresa_id;
  end if;

  -- Cuenta sugerida para diferencia bancaria (no banco)
  with recursive bancos_base as (
    select id, padre_id
    from public.plan_cuentas_base
    where upper(trim(nombre)) = 'BANCOS'
    union all
    select b.id, b.padre_id
    from public.plan_cuentas_base b
    join bancos_base bb on bb.id = b.padre_id
  )
  select pce.id, pce.codigo, pce.nombre
    into v_cuenta_diferencia_id, v_cuenta_diferencia_codigo, v_cuenta_diferencia_nombre
  from public.plan_cuentas_empresa pce
  join public.plan_cuentas_base pcb on pcb.id = pce.cuenta_base_id
  where pce.empresa_id = v_empresa_id
    and pce.activo = true
    and coalesce(pcb.acepta_movimiento, false) = true
    and pce.cuenta_base_id not in (select id from bancos_base)
  order by
    case
      when pce.codigo like '06%' then 0
      when pce.codigo like '05%' then 1
      when pce.codigo like '07%' then 2
      else 9
    end,
    pce.codigo
  limit 1;

  -- Dos pagos de prueba en auxiliar bancario
  insert into public.recaudacion_pagos (
    empresa_id, tercero_id, fecha_pago, moneda, tipo_cambio, monto_total,
    monto_aplicado, monto_no_aplicado, medio_pago, referencia, cuenta_banco_id,
    observacion, estado
  ) values (
    v_empresa_id, v_tercero_id, v_mes_desde + 10, 'CRC', 1, 125000,
    125000, 0, 'TRANSFERENCIA', 'SEED-BAN-PAGO-001', v_cuenta_banco_id,
    '[SEED_BANCOS] Pago demo 1', 'confirmado'
  )
  returning id into v_pago_1;

  insert into public.recaudacion_auxiliar_banco (
    empresa_id, pago_id, fecha_movimiento, moneda, monto, referencia, estado_conciliacion
  ) values (
    v_empresa_id, v_pago_1, v_mes_desde + 10, 'CRC', 125000, 'SEED-BAN-PAGO-001', 'pendiente'
  );

  insert into public.recaudacion_pagos (
    empresa_id, tercero_id, fecha_pago, moneda, tipo_cambio, monto_total,
    monto_aplicado, monto_no_aplicado, medio_pago, referencia, cuenta_banco_id,
    observacion, estado
  ) values (
    v_empresa_id, v_tercero_id, v_mes_desde + 14, 'CRC', 1, 80000,
    80000, 0, 'DEPOSITO', 'SEED-BAN-PAGO-002', v_cuenta_banco_id,
    '[SEED_BANCOS] Pago demo 2', 'confirmado'
  )
  returning id into v_pago_2;

  insert into public.recaudacion_auxiliar_banco (
    empresa_id, pago_id, fecha_movimiento, moneda, monto, referencia, estado_conciliacion
  ) values (
    v_empresa_id, v_pago_2, v_mes_desde + 14, 'CRC', 80000, 'SEED-BAN-PAGO-002', 'pendiente'
  );

  -- Periodo de conciliacion del mes
  insert into public.bancos_conciliacion_periodos (
    empresa_id, cuenta_banco_id, fecha_desde, fecha_hasta,
    saldo_libros, saldo_banco, diferencia, observacion, estado
  ) values (
    v_empresa_id, v_cuenta_banco_id, v_mes_desde, v_mes_hasta,
    0, 202500, 0, '[SEED_BANCOS] Periodo demo para pruebas de conciliacion', 'borrador'
  )
  returning id into v_periodo_id;

  -- Recalcular contra auxiliar (debe quedar 205000 libros vs 202500 banco => diferencia 2500)
  perform public.recalcular_bancos_conciliacion_periodo(v_periodo_id);

  -- Estado bancario importado demo
  insert into public.bancos_estado_importado (
    empresa_id, cuenta_banco_id, periodo_id, fecha_movimiento,
    descripcion, referencia, debito, credito, saldo, conciliado
  ) values
    (v_empresa_id, v_cuenta_banco_id, v_periodo_id, v_mes_desde + 10, 'TRANSFERENCIA CLIENTE DEMO', 'SEED-BAN-PAGO-001', 0, 125000, 125000, false),
    (v_empresa_id, v_cuenta_banco_id, v_periodo_id, v_mes_desde + 14, 'DEPOSITO CLIENTE DEMO', 'SEED-BAN-PAGO-002', 0, 80000, 205000, false),
    (v_empresa_id, v_cuenta_banco_id, v_periodo_id, v_mes_desde + 18, 'COMISION BANCARIA', 'SEED-BAN-COM-001', 2500, 0, 202500, false);

  raise notice 'SEED BANCOS listo. Empresa=% | Cuenta=% - % | Periodo=%', v_empresa_id, v_cuenta_banco_codigo, v_cuenta_banco_alias, v_periodo_id;
  raise notice 'Auxiliar seed: pagos % y % | saldo libros esperado=205000 | saldo banco=202500 | diferencia=2500', v_pago_1, v_pago_2;
  raise notice 'Cuenta sugerida para probar diferencia bancaria: % - % (id=%)', coalesce(v_cuenta_diferencia_codigo, '<no encontrada>'), coalesce(v_cuenta_diferencia_nombre, '<no encontrada>'), coalesce(v_cuenta_diferencia_id, 0);
end $$;

commit;
