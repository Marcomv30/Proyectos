-- Provisioning seguro de usuarios: Auth + public.usuarios + usuarios_empresas
-- Ejecutar en SQL Editor con rol postgres.

create or replace function public.create_user_with_access(
  p_username text,
  p_nombre text,
  p_email text,
  p_password text,
  p_empresa_id bigint,
  p_rol_id bigint,
  p_activo boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_uid uuid := auth.uid();
  v_auth_id uuid;
  v_user_id bigint;
begin
  if v_caller_uid is null then
    raise exception 'Sesión inválida';
  end if;

  if coalesce(trim(p_username), '') = ''
     or coalesce(trim(p_nombre), '') = ''
     or coalesce(trim(p_email), '') = ''
     or coalesce(trim(p_password), '') = '' then
    raise exception 'Datos incompletos';
  end if;

  if not exists (
    select 1
    from public.usuarios u
    join public.usuarios_empresas ue on ue.usuario_id = u.id
    where u.auth_user_id = v_caller_uid
      and ue.empresa_id = p_empresa_id
      and coalesce(ue.activo, true) = true
  ) then
    raise exception 'No tiene acceso a la empresa seleccionada';
  end if;

  select id into v_auth_id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_auth_id is null then
    v_auth_id := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
    )
    values (
      v_auth_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      lower(trim(p_email)),
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      false,
      false
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        updated_at = now(),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        banned_until = null
    where id = v_auth_id;
  end if;

  -- Evita errores del motor de Auth cuando algunos tokens quedan nulos.
  update auth.users
  set confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      phone_change = coalesce(phone_change, ''),
      phone_change_token = coalesce(phone_change_token, ''),
      reauthentication_token = coalesce(reauthentication_token, ''),
      updated_at = now()
  where id = v_auth_id;

  if not exists (
    select 1 from auth.identities
    where user_id = v_auth_id and provider = 'email'
  ) then
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at, id
    )
    values (
      v_auth_id::text,
      v_auth_id,
      jsonb_build_object('sub', v_auth_id::text, 'email', lower(trim(p_email))),
      'email',
      now(),
      now(),
      now(),
      gen_random_uuid()
    );
  end if;

  select id into v_user_id
  from public.usuarios
  where lower(username) = lower(trim(p_username))
  limit 1;

  if v_user_id is null then
    insert into public.usuarios (username, nombre, email, activo, auth_user_id, password)
    values (trim(p_username), trim(p_nombre), lower(trim(p_email)), p_activo, v_auth_id, 'AUTH_MANAGED')
    returning id into v_user_id;
  else
    update public.usuarios
    set nombre = trim(p_nombre),
        email = lower(trim(p_email)),
        activo = p_activo,
        auth_user_id = v_auth_id
    where id = v_user_id;
  end if;

  if exists (
    select 1 from public.usuarios_empresas
    where usuario_id = v_user_id and empresa_id = p_empresa_id
  ) then
    update public.usuarios_empresas
    set rol_id = p_rol_id,
        activo = true
    where usuario_id = v_user_id and empresa_id = p_empresa_id;
  else
    insert into public.usuarios_empresas (usuario_id, empresa_id, rol_id, activo)
    values (v_user_id, p_empresa_id, p_rol_id, true);
  end if;

  return v_user_id;
end;
$$;

grant execute on function public.create_user_with_access(text, text, text, text, bigint, bigint, boolean) to authenticated;

-- Reset seguro de password para usuarios existentes (solo si comparten al menos 1 empresa activa)
create or replace function public.reset_user_password_with_access(
  p_usuario_id bigint,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_uid uuid := auth.uid();
  v_auth_id uuid;
begin
  if v_caller_uid is null then
    raise exception 'Sesion invalida';
  end if;

  if coalesce(trim(p_password), '') = '' or length(p_password) < 6 then
    raise exception 'La contrasena debe tener al menos 6 caracteres';
  end if;

  if not exists (
    select 1
    from public.usuarios u_admin
    join public.usuarios_empresas ue_admin on ue_admin.usuario_id = u_admin.id
    join public.usuarios_empresas ue_target on ue_target.empresa_id = ue_admin.empresa_id
    where u_admin.auth_user_id = v_caller_uid
      and ue_admin.activo = true
      and ue_target.usuario_id = p_usuario_id
      and ue_target.activo = true
  ) then
    raise exception 'No tiene permisos para resetear la contrasena de este usuario';
  end if;

  select u.auth_user_id
    into v_auth_id
  from public.usuarios u
  where u.id = p_usuario_id
  limit 1;

  if v_auth_id is null then
    raise exception 'El usuario no esta vinculado con Supabase Auth';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now(),
      banned_until = null
  where id = v_auth_id;

  if not found then
    raise exception 'No existe el usuario en auth.users';
  end if;

  update auth.users
  set confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      phone_change = coalesce(phone_change, ''),
      phone_change_token = coalesce(phone_change_token, ''),
      reauthentication_token = coalesce(reauthentication_token, ''),
      updated_at = now()
  where id = v_auth_id;
end;
$$;

grant execute on function public.reset_user_password_with_access(bigint, text) to authenticated;

-- Endurecimiento de datos maestros de usuario (case-insensitive)
create unique index if not exists ux_usuarios_username_ci
  on public.usuarios (lower(trim(username)));

create unique index if not exists ux_usuarios_email_ci
  on public.usuarios (lower(trim(email)))
  where email is not null and btrim(email) <> '';
