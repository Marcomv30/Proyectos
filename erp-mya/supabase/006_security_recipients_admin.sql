-- Admin seguro de destinatarios de alertas con RLS habilitado
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.has_security_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    join public.usuarios_empresas ue on ue.usuario_id = u.id
    where u.auth_user_id = auth.uid()
      and ue.activo = true
      and public.has_permission(ue.empresa_id, 'mantenimientos', 'editar')
  );
$$;

grant execute on function public.has_security_admin_access() to authenticated;

create or replace function public.upsert_security_alert_recipient(
  p_email text,
  p_activo boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if not public.has_security_admin_access() then
    raise exception 'No tiene permisos para administrar destinatarios';
  end if;

  if v_email = '' then
    raise exception 'Email requerido';
  end if;

  insert into public.security_alert_recipients (email, activo)
  values (v_email, coalesce(p_activo, true))
  on conflict (email)
  do update set activo = excluded.activo
  returning id into v_id;

  perform public.audit_event(
    'security_alert_recipient_upsert',
    'security_alert_recipients',
    v_id::text,
    jsonb_build_object('email', v_email, 'activo', coalesce(p_activo, true))
  );

  return v_id;
end;
$$;

create or replace function public.set_security_alert_recipient_active(
  p_id bigint,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if not public.has_security_admin_access() then
    raise exception 'No tiene permisos para administrar destinatarios';
  end if;

  update public.security_alert_recipients
  set activo = coalesce(p_activo, true)
  where id = p_id
  returning email into v_email;

  if not found then
    raise exception 'Destinatario no encontrado';
  end if;

  perform public.audit_event(
    'security_alert_recipient_toggle',
    'security_alert_recipients',
    p_id::text,
    jsonb_build_object('email', v_email, 'activo', coalesce(p_activo, true))
  );
end;
$$;

create or replace function public.delete_security_alert_recipient(
  p_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if not public.has_security_admin_access() then
    raise exception 'No tiene permisos para administrar destinatarios';
  end if;

  delete from public.security_alert_recipients
  where id = p_id
  returning email into v_email;

  if not found then
    raise exception 'Destinatario no encontrado';
  end if;

  perform public.audit_event(
    'security_alert_recipient_delete',
    'security_alert_recipients',
    p_id::text,
    jsonb_build_object('email', v_email)
  );
end;
$$;

grant execute on function public.upsert_security_alert_recipient(text, boolean) to authenticated;
grant execute on function public.set_security_alert_recipient_active(bigint, boolean) to authenticated;
grant execute on function public.delete_security_alert_recipient(bigint) to authenticated;

commit;

