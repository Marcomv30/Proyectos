create or replace function public.confirmar_recaudacion_pago(
  p_pago_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pago public.recaudacion_pagos%rowtype;
  v_det record;
  v_total_aplicado numeric(18,2);
  v_total_disponible numeric(18,2);
  v_efectivo_restante numeric(18,2);
  v_ajuste_restante numeric(18,2);
  v_abono numeric(18,2);
  v_ajuste numeric(18,2);
  v_app_id bigint;
begin
  if p_pago_id is null then
    raise exception 'pago_requerido';
  end if;

  select * into v_pago
  from public.recaudacion_pagos p
  where p.id = p_pago_id
  for update;

  if not found then
    raise exception 'pago_no_encontrado';
  end if;
  if v_pago.estado <> 'borrador' then
    raise exception 'solo_borrador_se_puede_confirmar';
  end if;

  perform public.recaudacion_recalcular_totales(v_pago.id);
  select * into v_pago from public.recaudacion_pagos where id = v_pago.id;

  v_total_aplicado := coalesce(v_pago.monto_aplicado, 0);
  v_total_disponible := coalesce(v_pago.monto_total, 0) + coalesce(v_pago.monto_ajuste, 0);

  if v_total_aplicado > v_total_disponible then
    raise exception 'aplicacion_supera_total_disponible';
  end if;

  v_efectivo_restante := coalesce(v_pago.monto_total, 0);
  v_ajuste_restante := coalesce(v_pago.monto_ajuste, 0);

  for v_det in
    select d.*
    from public.recaudacion_pago_detalle d
    where d.pago_id = v_pago.id
      and d.estado = 'activo'
    for update
  loop
    v_abono := least(v_det.monto_aplicado, v_efectivo_restante);
    v_ajuste := v_det.monto_aplicado - v_abono;

    if v_abono > 0 then
      insert into public.cxc_aplicaciones(
        empresa_id, documento_id, fecha_aplicacion, tipo_aplicacion, monto,
        referencia, observaciones, estado, created_by, updated_by
      )
      values (
        v_pago.empresa_id, v_det.documento_id, v_pago.fecha_pago, 'ABONO', v_abono,
        v_pago.referencia, coalesce(v_det.observacion, '[RECAUDACION] abono'), 'activo', v_user, v_user
      )
      returning id into v_app_id;

      update public.recaudacion_pago_detalle
      set cxc_aplicacion_id = v_app_id, updated_at = now(), updated_by = v_user
      where id = v_det.id;
    end if;

    if v_ajuste > 0 then
      if v_ajuste > v_ajuste_restante then
        raise exception 'ajuste_insuficiente_para_cubrir_aplicacion';
      end if;

      insert into public.cxc_aplicaciones(
        empresa_id, documento_id, fecha_aplicacion, tipo_aplicacion, monto,
        referencia, observaciones, estado, created_by, updated_by
      )
      values (
        v_pago.empresa_id, v_det.documento_id, v_pago.fecha_pago, 'AJUSTE', v_ajuste,
        v_pago.referencia, coalesce(v_pago.motivo_diferencia, '[RECAUDACION] ajuste por diferencia'), 'activo', v_user, v_user
      );

      v_ajuste_restante := v_ajuste_restante - v_ajuste;
    end if;

    v_efectivo_restante := greatest(v_efectivo_restante - v_abono, 0);
  end loop;

  update public.recaudacion_pagos
  set
    estado = 'confirmado',
    monto_no_aplicado = greatest(v_total_disponible - v_total_aplicado, 0),
    updated_at = now(),
    updated_by = v_user
  where id = v_pago.id;

  insert into public.recaudacion_auxiliar_banco(
    empresa_id, pago_id, fecha_movimiento, moneda, monto, referencia, estado_conciliacion
  )
  values (
    v_pago.empresa_id, v_pago.id, v_pago.fecha_pago, v_pago.moneda, v_pago.monto_total, v_pago.referencia, 'pendiente'
  )
  on conflict (pago_id) do update
    set fecha_movimiento = excluded.fecha_movimiento,
        moneda = excluded.moneda,
        monto = excluded.monto,
        referencia = excluded.referencia,
        updated_at = now();

  insert into public.recaudacion_bitacora(empresa_id, pago_id, accion, detalle, payload, created_by)
  values (
    v_pago.empresa_id,
    v_pago.id,
    'confirmar',
    'Pago confirmado y enviado a auxiliar bancario',
    jsonb_build_object(
      'monto_total', v_pago.monto_total,
      'monto_ajuste', v_pago.monto_ajuste,
      'monto_aplicado', v_total_aplicado,
      'monto_no_aplicado', greatest(v_total_disponible - v_total_aplicado, 0)
    ),
    v_user
  );
end;
$$;

notify pgrst, 'reload schema';
