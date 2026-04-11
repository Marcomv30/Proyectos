begin;

create or replace function public.marcar_recaudacion_conciliada(
  p_pago_id bigint,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pago public.recaudacion_pagos%rowtype;
  v_aux public.recaudacion_auxiliar_banco%rowtype;
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
  if v_pago.estado = 'anulado' then
    raise exception 'pago_anulado_no_se_puede_conciliar';
  end if;

  select * into v_aux
  from public.recaudacion_auxiliar_banco a
  where a.pago_id = p_pago_id
  for update;

  if not found then
    raise exception 'auxiliar_bancario_no_encontrado';
  end if;
  if v_aux.estado_conciliacion = 'anulado' then
    raise exception 'movimiento_anulado_no_se_puede_conciliar';
  end if;
  if v_aux.estado_conciliacion = 'conciliado' and v_pago.estado = 'conciliado' then
    return;
  end if;

  update public.recaudacion_auxiliar_banco
  set
    estado_conciliacion = 'conciliado',
    conciliado_en = now(),
    updated_at = now()
  where pago_id = p_pago_id;

  update public.recaudacion_pagos
  set
    estado = 'conciliado',
    conciliado_en = now(),
    updated_at = now(),
    updated_by = v_user
  where id = p_pago_id;

  insert into public.recaudacion_bitacora(empresa_id, pago_id, accion, detalle, payload, created_by)
  values (
    v_pago.empresa_id,
    v_pago.id,
    'conciliar',
    coalesce(p_detalle, 'Movimiento bancario conciliado'),
    jsonb_build_object(
      'estado_pago_anterior', v_pago.estado,
      'estado_conciliacion_anterior', v_aux.estado_conciliacion,
      'asiento_id', v_pago.asiento_id
    ),
    v_user
  );
end;
$$;

create or replace function public.deshacer_recaudacion_conciliacion(
  p_pago_id bigint,
  p_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pago public.recaudacion_pagos%rowtype;
  v_aux public.recaudacion_auxiliar_banco%rowtype;
  v_estado_retorno text;
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
  if v_pago.estado = 'anulado' then
    raise exception 'pago_anulado_no_permite_deshacer_conciliacion';
  end if;

  select * into v_aux
  from public.recaudacion_auxiliar_banco a
  where a.pago_id = p_pago_id
  for update;

  if not found then
    raise exception 'auxiliar_bancario_no_encontrado';
  end if;
  if v_aux.estado_conciliacion <> 'conciliado' then
    raise exception 'movimiento_no_esta_conciliado';
  end if;

  v_estado_retorno := case when v_pago.asiento_id is not null then 'contabilizado' else 'confirmado' end;

  update public.recaudacion_auxiliar_banco
  set
    estado_conciliacion = 'pendiente',
    conciliado_en = null,
    updated_at = now()
  where pago_id = p_pago_id;

  update public.recaudacion_pagos
  set
    estado = v_estado_retorno,
    conciliado_en = null,
    updated_at = now(),
    updated_by = v_user
  where id = p_pago_id;

  insert into public.recaudacion_bitacora(empresa_id, pago_id, accion, detalle, payload, created_by)
  values (
    v_pago.empresa_id,
    v_pago.id,
    'deshacer_conciliacion',
    coalesce(p_detalle, 'Conciliacion bancaria revertida'),
    jsonb_build_object(
      'estado_pago_retorno', v_estado_retorno,
      'asiento_id', v_pago.asiento_id
    ),
    v_user
  );
end;
$$;

grant execute on function public.marcar_recaudacion_conciliada(bigint, text) to authenticated, service_role;
grant execute on function public.deshacer_recaudacion_conciliacion(bigint, text) to authenticated, service_role;

commit;
