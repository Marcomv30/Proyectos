-- Enlaza recaudacion con turno de caja y exige turno abierto

begin;

alter table public.recaudacion_pagos
  add column if not exists punto_venta_id bigint null references public.puntos_venta(id) on delete restrict,
  add column if not exists caja_id bigint null references public.cajas(id) on delete restrict,
  add column if not exists turno_id bigint null references public.caja_turnos(id) on delete restrict;

create index if not exists idx_recaudacion_pagos_turno_lookup
  on public.recaudacion_pagos(empresa_id, turno_id, fecha_pago desc, id desc);

create or replace function public.registrar_recaudacion_pago(
  p_empresa_id bigint,
  p_tercero_id bigint,
  p_fecha_pago date default current_date,
  p_moneda text default 'CRC',
  p_tipo_cambio numeric default 1,
  p_monto_total numeric default 0,
  p_monto_ajuste numeric default 0,
  p_medio_pago text default 'TRANSFERENCIA',
  p_referencia text default null,
  p_cuenta_banco_id bigint default null,
  p_observacion text default null,
  p_motivo_diferencia text default null,
  p_punto_venta_id bigint default null,
  p_caja_id bigint default null,
  p_turno_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id bigint;
  v_turno public.caja_turnos%rowtype;
begin
  if p_empresa_id is null or p_tercero_id is null or coalesce(p_monto_total, 0) <= 0 then
    raise exception 'empresa_cliente_monto_requeridos';
  end if;
  if coalesce(p_monto_ajuste, 0) < 0 then
    raise exception 'monto_ajuste_invalido';
  end if;
  if coalesce(p_monto_ajuste, 0) > 0 and btrim(coalesce(p_motivo_diferencia, '')) = '' then
    raise exception 'motivo_diferencia_requerido';
  end if;
  if p_turno_id is null then
    raise exception 'turno_caja_requerido';
  end if;

  select *
    into v_turno
  from public.caja_turnos t
  where t.id = p_turno_id
    and t.empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'turno_no_encontrado';
  end if;
  if v_turno.estado <> 'abierto' then
    raise exception 'turno_no_abierto';
  end if;
  if v_user is null or v_turno.cajero_auth_user_id <> v_user then
    raise exception 'turno_no_pertenece_al_usuario';
  end if;
  if p_caja_id is not null and v_turno.caja_id <> p_caja_id then
    raise exception 'turno_no_corresponde_caja';
  end if;
  if p_punto_venta_id is not null and v_turno.punto_venta_id <> p_punto_venta_id then
    raise exception 'turno_no_corresponde_punto_venta';
  end if;

  insert into public.recaudacion_pagos(
    empresa_id, tercero_id, fecha_pago, moneda, tipo_cambio, monto_total, monto_ajuste,
    medio_pago, referencia, cuenta_banco_id, observacion, motivo_diferencia,
    punto_venta_id, caja_id, turno_id,
    estado, created_by, updated_by
  )
  values (
    p_empresa_id, p_tercero_id, coalesce(p_fecha_pago, current_date), upper(coalesce(p_moneda, 'CRC')),
    coalesce(p_tipo_cambio, 1), round(p_monto_total, 2), round(coalesce(p_monto_ajuste, 0), 2),
    upper(coalesce(p_medio_pago, 'TRANSFERENCIA')), p_referencia, p_cuenta_banco_id,
    p_observacion, p_motivo_diferencia,
    v_turno.punto_venta_id, v_turno.caja_id, v_turno.id,
    'borrador', v_user, v_user
  )
  returning id into v_id;

  insert into public.recaudacion_bitacora(empresa_id, pago_id, accion, detalle, payload, created_by)
  values (
    p_empresa_id,
    v_id,
    'crear_borrador',
    'Pago creado en estado borrador',
    jsonb_build_object(
      'monto_total', p_monto_total,
      'monto_ajuste', coalesce(p_monto_ajuste, 0),
      'motivo_diferencia', p_motivo_diferencia,
      'turno_id', v_turno.id,
      'caja_id', v_turno.caja_id,
      'punto_venta_id', v_turno.punto_venta_id
    ),
    v_user
  );

  return v_id;
end;
$$;

create or replace view public.vw_recaudacion_pagos as
select
  p.id,
  p.empresa_id,
  p.tercero_id,
  t.razon_social as tercero_nombre,
  t.identificacion as tercero_identificacion,
  p.fecha_pago,
  p.moneda,
  p.tipo_cambio,
  p.monto_total,
  p.monto_aplicado,
  p.monto_no_aplicado,
  p.medio_pago,
  p.referencia,
  p.cuenta_banco_id,
  p.observacion,
  p.estado,
  p.asiento_id,
  p.conciliado_en,
  p.created_at,
  p.updated_at,
  p.monto_ajuste,
  p.motivo_diferencia,
  p.punto_venta_id,
  p.caja_id,
  p.turno_id
from public.recaudacion_pagos p
join public.terceros t on t.id = p.tercero_id;

create or replace function public.cerrar_caja_turno(
  p_turno_id bigint,
  p_saldo_final_fisico numeric default null,
  p_observacion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_turno public.caja_turnos%rowtype;
  v_total_recaudado numeric(18,2);
  v_total_ajuste numeric(18,2);
  v_total_aplicado numeric(18,2);
  v_total_no_aplicado numeric(18,2);
  v_total_efectivo numeric(18,2);
  v_total_no_efectivo numeric(18,2);
  v_saldo_final_sistema numeric(18,2);
  v_diferencia numeric(18,2);
begin
  if p_turno_id is null then
    raise exception 'turno_requerido';
  end if;
  if v_user is null then
    raise exception 'usuario_no_autenticado';
  end if;

  select * into v_turno
  from public.caja_turnos t
  where t.id = p_turno_id
  for update;

  if not found then
    raise exception 'turno_no_encontrado';
  end if;
  if v_turno.estado <> 'abierto' then
    raise exception 'solo_turno_abierto_se_puede_cerrar';
  end if;
  if v_turno.cajero_auth_user_id <> v_user then
    raise exception 'solo_el_cajero_del_turno_puede_cerrar';
  end if;

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
  where p.empresa_id = v_turno.empresa_id
    and p.turno_id = v_turno.id
    and p.estado in ('confirmado', 'contabilizado', 'conciliado');

  v_saldo_final_sistema := round(v_turno.saldo_inicial + v_total_efectivo, 2);
  v_diferencia := case
    when p_saldo_final_fisico is null then null
    else round(p_saldo_final_fisico - v_saldo_final_sistema, 2)
  end;

  delete from public.caja_turno_medios where turno_id = v_turno.id;

  insert into public.caja_turno_medios(turno_id, medio_pago, moneda, pagos, total_recaudado)
  select
    v_turno.id,
    upper(coalesce(p.medio_pago, 'OTROS')) as medio_pago,
    p.moneda,
    count(*)::int as pagos,
    coalesce(sum(p.monto_total), 0)::numeric(18,2) as total_recaudado
  from public.recaudacion_pagos p
  where p.empresa_id = v_turno.empresa_id
    and p.turno_id = v_turno.id
    and p.estado in ('confirmado', 'contabilizado', 'conciliado')
  group by upper(coalesce(p.medio_pago, 'OTROS')), p.moneda;

  update public.caja_turnos
  set
    fecha_hora_cierre = now(),
    estado = 'cerrado',
    total_recaudado = v_total_recaudado,
    total_ajuste = v_total_ajuste,
    total_aplicado = v_total_aplicado,
    total_no_aplicado = v_total_no_aplicado,
    total_efectivo = v_total_efectivo,
    total_no_efectivo = v_total_no_efectivo,
    saldo_final_sistema = v_saldo_final_sistema,
    saldo_final_fisico = case when p_saldo_final_fisico is null then null else round(p_saldo_final_fisico, 2) end,
    diferencia_cierre = v_diferencia,
    observacion = case
      when coalesce(trim(p_observacion), '') = '' then observacion
      when coalesce(trim(observacion), '') = '' then trim(p_observacion)
      else observacion || ' | ' || trim(p_observacion)
    end,
    updated_by = v_user
  where id = v_turno.id;

  insert into public.caja_turno_bitacora(turno_id, empresa_id, accion, detalle, payload, created_by)
  values (
    v_turno.id, v_turno.empresa_id, 'cerrar', coalesce(p_observacion, 'Turno cerrado'),
    jsonb_build_object(
      'total_recaudado', v_total_recaudado,
      'total_efectivo', v_total_efectivo,
      'saldo_final_sistema', v_saldo_final_sistema,
      'saldo_final_fisico', p_saldo_final_fisico,
      'diferencia_cierre', v_diferencia
    ),
    v_user
  );
end;
$$;

grant execute on function public.registrar_recaudacion_pago(bigint, bigint, date, text, numeric, numeric, numeric, text, text, bigint, text, text, bigint, bigint, bigint) to authenticated, service_role;
grant execute on function public.cerrar_caja_turno(bigint, numeric, text) to authenticated, service_role;

commit;
