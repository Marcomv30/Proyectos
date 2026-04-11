-- CXC Fase 1.1
-- Operaciones seguras de mantenimiento: editar/anular documento y anular abono.

begin;

create or replace function public.update_cxc_documento_basico(
  p_documento_id bigint,
  p_numero_documento text,
  p_referencia text,
  p_fecha_emision date,
  p_fecha_vencimiento date,
  p_monto_original numeric,
  p_descripcion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.cxc_documentos%rowtype;
  v_aplicado numeric(18,2) := 0;
begin
  if auth.uid() is null and current_user not in ('postgres', 'service_role') then
    raise exception 'Sesion invalida';
  end if;

  if p_documento_id is null then
    raise exception 'Documento requerido';
  end if;

  select * into v_doc
  from public.cxc_documentos d
  where d.id = p_documento_id
  limit 1;

  if not found then
    raise exception 'Documento no existe';
  end if;

  if current_user not in ('postgres', 'service_role') then
    if not public.has_empresa_access(v_doc.empresa_id)
       or not public.has_permission(v_doc.empresa_id, 'cxc', 'editar')
    then
      raise exception 'No tiene permisos para editar CXC';
    end if;
  end if;

  if v_doc.estado = 'anulado' then
    raise exception 'Documento anulado no puede editarse';
  end if;

  select coalesce(sum(a.monto), 0)
    into v_aplicado
  from public.cxc_aplicaciones a
  where a.documento_id = p_documento_id
    and a.estado = 'activo';

  if coalesce(p_monto_original, 0) < v_aplicado then
    raise exception 'Monto original no puede ser menor al aplicado (%)', v_aplicado;
  end if;

  update public.cxc_documentos
  set
    numero_documento = coalesce(nullif(btrim(p_numero_documento), ''), numero_documento),
    referencia = p_referencia,
    fecha_emision = coalesce(p_fecha_emision, fecha_emision),
    fecha_vencimiento = p_fecha_vencimiento,
    monto_original = coalesce(p_monto_original, monto_original),
    descripcion = p_descripcion,
    updated_at = now()
  where id = p_documento_id;

  perform public.recalcular_cxc_documento(p_documento_id);
end;
$$;

create or replace function public.anular_cxc_aplicacion(
  p_aplicacion_id bigint,
  p_observacion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.cxc_aplicaciones%rowtype;
begin
  if auth.uid() is null and current_user not in ('postgres', 'service_role') then
    raise exception 'Sesion invalida';
  end if;

  if p_aplicacion_id is null then
    raise exception 'Aplicacion requerida';
  end if;

  select * into v_app
  from public.cxc_aplicaciones a
  where a.id = p_aplicacion_id
  limit 1;

  if not found then
    raise exception 'Aplicacion no existe';
  end if;

  if current_user not in ('postgres', 'service_role') then
    if not public.has_empresa_access(v_app.empresa_id)
       or not public.has_permission(v_app.empresa_id, 'cxc', 'editar')
    then
      raise exception 'No tiene permisos para editar CXC';
    end if;
  end if;

  if v_app.estado = 'anulado' then
    return;
  end if;

  update public.cxc_aplicaciones
  set
    estado = 'anulado',
    observaciones = concat_ws(' | ', coalesce(observaciones, ''), nullif(btrim(p_observacion), '')),
    updated_at = now()
  where id = p_aplicacion_id;

  perform public.recalcular_cxc_documento(v_app.documento_id);
end;
$$;

create or replace function public.anular_cxc_documento(
  p_documento_id bigint,
  p_observacion text default null,
  p_anular_aplicaciones boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.cxc_documentos%rowtype;
begin
  if auth.uid() is null and current_user not in ('postgres', 'service_role') then
    raise exception 'Sesion invalida';
  end if;

  if p_documento_id is null then
    raise exception 'Documento requerido';
  end if;

  select * into v_doc
  from public.cxc_documentos d
  where d.id = p_documento_id
  limit 1;

  if not found then
    raise exception 'Documento no existe';
  end if;

  if current_user not in ('postgres', 'service_role') then
    if not public.has_empresa_access(v_doc.empresa_id)
       or not public.has_permission(v_doc.empresa_id, 'cxc', 'editar')
    then
      raise exception 'No tiene permisos para editar CXC';
    end if;
  end if;

  if v_doc.estado = 'anulado' then
    return;
  end if;

  if p_anular_aplicaciones then
    update public.cxc_aplicaciones
    set
      estado = 'anulado',
      observaciones = concat_ws(' | ', coalesce(observaciones, ''), 'Anulado por anulacion de documento'),
      updated_at = now()
    where documento_id = p_documento_id
      and estado = 'activo';
  elsif exists (
    select 1 from public.cxc_aplicaciones a
    where a.documento_id = p_documento_id
      and a.estado = 'activo'
  ) then
    raise exception 'No se puede anular documento con aplicaciones activas';
  end if;

  update public.cxc_documentos
  set
    estado = 'anulado',
    monto_pendiente = 0,
    descripcion = concat_ws(' | ', coalesce(descripcion, ''), nullif(btrim(p_observacion), '')),
    updated_at = now()
  where id = p_documento_id;
end;
$$;

grant execute on function public.update_cxc_documento_basico(bigint, text, text, date, date, numeric, text) to authenticated;
grant execute on function public.update_cxc_documento_basico(bigint, text, text, date, date, numeric, text) to service_role;
grant execute on function public.anular_cxc_aplicacion(bigint, text) to authenticated;
grant execute on function public.anular_cxc_aplicacion(bigint, text) to service_role;
grant execute on function public.anular_cxc_documento(bigint, text, boolean) to authenticated;
grant execute on function public.anular_cxc_documento(bigint, text, boolean) to service_role;

commit;
