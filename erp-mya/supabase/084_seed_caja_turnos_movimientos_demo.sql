-- Seed demo: Turno de caja cerrado + pagos de recaudacion asociados
-- Requiere: 082_caja_turnos_mvp.sql y 083_seed_caja_turnos_demo.sql

begin;

do $$
declare
  v_empresa_id bigint;
  v_pv_id bigint;
  v_caja_id bigint;
  v_tercero_id bigint;
  v_user uuid;
  v_fecha date := current_date - 1;
  v_turno_id bigint;
  v_saldo_inicial numeric(18,2) := 50000;
  v_total_recaudado numeric(18,2);
  v_total_ajuste numeric(18,2);
  v_total_aplicado numeric(18,2);
  v_total_no_aplicado numeric(18,2);
  v_total_efectivo numeric(18,2);
  v_total_no_efectivo numeric(18,2);
  v_saldo_final_sistema numeric(18,2);
begin
  select e.id
    into v_empresa_id
  from public.empresas e
  where e.activo = true
  order by e.id
  limit 1;

  if v_empresa_id is null then
    raise exception 'No hay empresa activa para seed.';
  end if;

  select pv.id
    into v_pv_id
  from public.puntos_venta pv
  where pv.empresa_id = v_empresa_id
    and pv.activo = true
  order by pv.id
  limit 1;

  select c.id
    into v_caja_id
  from public.cajas c
  where c.empresa_id = v_empresa_id
    and c.punto_venta_id = v_pv_id
    and c.activo = true
  order by c.id
  limit 1;

  if v_pv_id is null or v_caja_id is null then
    raise exception 'No existen punto de venta/caja para seed. Ejecute 083 primero.';
  end if;

  select t.id
    into v_tercero_id
  from public.vw_terceros_catalogo t
  where t.empresa_id = v_empresa_id
    and t.es_cliente = true
    and t.activo = true
  order by t.id
  limit 1;

  if v_tercero_id is null then
    raise exception 'No hay cliente activo en terceros para seed.';
  end if;

  select u.auth_user_id
    into v_user
  from public.usuarios u
  where u.auth_user_id is not null
  order by u.id
  limit 1;

  if v_user is null then
    v_user := '00000000-0000-0000-0000-000000000001'::uuid;
  end if;

  -- Limpieza seed previa
  delete from public.recaudacion_auxiliar_banco a
  using public.recaudacion_pagos p
  where a.pago_id = p.id
    and p.empresa_id = v_empresa_id
    and p.referencia like 'SEED-TURNO-%';

  delete from public.recaudacion_pagos p
  where p.empresa_id = v_empresa_id
    and p.referencia like 'SEED-TURNO-%';

  delete from public.caja_turnos t
  where t.empresa_id = v_empresa_id
    and coalesce(t.observacion, '') like '[SEED_TURNO]%';

  -- Pagos demo (confirmados)
  insert into public.recaudacion_pagos(
    empresa_id, tercero_id, fecha_pago, moneda, tipo_cambio,
    monto_total, monto_ajuste, monto_aplicado, monto_no_aplicado,
    medio_pago, referencia, observacion, estado,
    created_by, updated_by
  )
  values
    (v_empresa_id, v_tercero_id, v_fecha, 'CRC', 1, 120000, 0, 120000, 0, 'EFECTIVO', 'SEED-TURNO-EFE-001', '[SEED_TURNO] pago efectivo', 'confirmado', v_user, v_user),
    (v_empresa_id, v_tercero_id, v_fecha, 'CRC', 1, 85000, 0, 85000, 0, 'TRANSFERENCIA', 'SEED-TURNO-TRF-001', '[SEED_TURNO] pago transferencia', 'confirmado', v_user, v_user),
    (v_empresa_id, v_tercero_id, v_fecha, 'CRC', 1, 43000, 2000, 45000, 0, 'DEPOSITO', 'SEED-TURNO-DEP-001', '[SEED_TURNO] pago deposito con ajuste', 'contabilizado', v_user, v_user),
    (v_empresa_id, v_tercero_id, v_fecha, 'CRC', 1, 56000, 0, 56000, 0, 'TARJETA', 'SEED-TURNO-TAR-001', '[SEED_TURNO] pago tarjeta', 'conciliado', v_user, v_user);

  insert into public.recaudacion_auxiliar_banco(
    empresa_id, pago_id, fecha_movimiento, moneda, monto, referencia, estado_conciliacion
  )
  select
    p.empresa_id,
    p.id,
    p.fecha_pago,
    p.moneda,
    p.monto_total,
    p.referencia,
    case when p.estado = 'conciliado' then 'conciliado' else 'pendiente' end
  from public.recaudacion_pagos p
  where p.empresa_id = v_empresa_id
    and p.referencia like 'SEED-TURNO-%'
  on conflict (pago_id) do update
    set fecha_movimiento = excluded.fecha_movimiento,
        moneda = excluded.moneda,
        monto = excluded.monto,
        referencia = excluded.referencia,
        estado_conciliacion = excluded.estado_conciliacion,
        updated_at = now();

  select
    coalesce(sum(p.monto_total), 0)::numeric(18,2),
    coalesce(sum(coalesce(p.monto_ajuste, 0)), 0)::numeric(18,2),
    coalesce(sum(coalesce(p.monto_aplicado, 0)), 0)::numeric(18,2),
    coalesce(sum(coalesce(p.monto_no_aplicado, 0)), 0)::numeric(18,2),
    coalesce(sum(case when upper(coalesce(p.medio_pago, '')) = 'EFECTIVO' then p.monto_total else 0 end), 0)::numeric(18,2),
    coalesce(sum(case when upper(coalesce(p.medio_pago, '')) <> 'EFECTIVO' then p.monto_total else 0 end), 0)::numeric(18,2)
  into
    v_total_recaudado, v_total_ajuste, v_total_aplicado, v_total_no_aplicado, v_total_efectivo, v_total_no_efectivo
  from public.recaudacion_pagos p
  where p.empresa_id = v_empresa_id
    and p.referencia like 'SEED-TURNO-%';

  v_saldo_final_sistema := round(v_saldo_inicial + v_total_efectivo, 2);

  insert into public.caja_turnos(
    empresa_id, punto_venta_id, caja_id, cajero_auth_user_id,
    fecha_hora_apertura, fecha_hora_cierre, estado,
    saldo_inicial, total_recaudado, total_ajuste, total_aplicado, total_no_aplicado,
    total_efectivo, total_no_efectivo, saldo_final_sistema, saldo_final_fisico, diferencia_cierre,
    observacion, created_by, updated_by
  )
  values (
    v_empresa_id, v_pv_id, v_caja_id, v_user,
    (v_fecha::text || ' 08:00:00')::timestamptz,
    (v_fecha::text || ' 17:30:00')::timestamptz,
    'cerrado',
    v_saldo_inicial, v_total_recaudado, v_total_ajuste, v_total_aplicado, v_total_no_aplicado,
    v_total_efectivo, v_total_no_efectivo, v_saldo_final_sistema, v_saldo_final_sistema, 0,
    '[SEED_TURNO] turno demo cerrado', v_user, v_user
  )
  returning id into v_turno_id;

  insert into public.caja_turno_medios(turno_id, medio_pago, moneda, pagos, total_recaudado)
  select
    v_turno_id,
    upper(coalesce(p.medio_pago, 'OTROS')) as medio_pago,
    p.moneda,
    count(*)::int,
    coalesce(sum(p.monto_total), 0)::numeric(18,2)
  from public.recaudacion_pagos p
  where p.empresa_id = v_empresa_id
    and p.referencia like 'SEED-TURNO-%'
  group by upper(coalesce(p.medio_pago, 'OTROS')), p.moneda;

  insert into public.caja_turno_bitacora(turno_id, empresa_id, accion, detalle, payload, created_by)
  values
    (
      v_turno_id, v_empresa_id, 'abrir', 'Turno demo abierto',
      jsonb_build_object('saldo_inicial', v_saldo_inicial), v_user
    ),
    (
      v_turno_id, v_empresa_id, 'cerrar', 'Turno demo cerrado',
      jsonb_build_object(
        'total_recaudado', v_total_recaudado,
        'total_efectivo', v_total_efectivo,
        'saldo_final_sistema', v_saldo_final_sistema
      ),
      v_user
    );

  raise notice 'Seed turnos/movimientos aplicado: empresa_id=%, turno_id=%', v_empresa_id, v_turno_id;
end $$;

commit;
