-- Hardening inicial de seguridad:
-- 1) Auditoria de eventos sensibles
-- 2) Bloqueo temporal por intentos fallidos de login
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.security_audit_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_uid uuid null,
  actor_usuario_id bigint null references public.usuarios(id) on delete set null,
  evento text not null,
  entidad text not null,
  entidad_id text null,
  detalle jsonb not null default '{}'::jsonb,
  ip text null,
  user_agent text null
);

create index if not exists idx_security_audit_log_created_at on public.security_audit_log(created_at desc);
create index if not exists idx_security_audit_log_evento on public.security_audit_log(evento);
create index if not exists idx_security_audit_log_entidad on public.security_audit_log(entidad);
create index if not exists idx_security_audit_log_actor_uid on public.security_audit_log(actor_uid);

alter table public.security_audit_log enable row level security;

drop policy if exists security_audit_log_read_authenticated on public.security_audit_log;
create policy security_audit_log_read_authenticated
on public.security_audit_log
for select
to authenticated
using (true);

create or replace function public.audit_event(
  p_evento text,
  p_entidad text,
  p_entidad_id text default null,
  p_detalle jsonb default '{}'::jsonb,
  p_ip text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_uid uuid := auth.uid();
  v_actor_usuario_id bigint;
begin
  if v_actor_uid is not null then
    select u.id into v_actor_usuario_id
    from public.usuarios u
    where u.auth_user_id = v_actor_uid
    limit 1;
  end if;

  insert into public.security_audit_log (
    actor_uid, actor_usuario_id, evento, entidad, entidad_id, detalle, ip, user_agent
  ) values (
    v_actor_uid, v_actor_usuario_id, p_evento, p_entidad, p_entidad_id, coalesce(p_detalle, '{}'::jsonb), p_ip, p_user_agent
  );
end;
$$;

grant execute on function public.audit_event(text, text, text, jsonb, text, text) to authenticated;

create table if not exists public.login_guard (
  username_key text primary key,
  failed_attempts integer not null default 0,
  locked_until timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.login_guard enable row level security;

create or replace function public.check_login_allowed(
  p_username text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_username, '')));
  v_locked_until timestamptz;
begin
  if v_key = '' then
    return 'Complete usuario';
  end if;

  select lg.locked_until
    into v_locked_until
  from public.login_guard lg
  where lg.username_key = v_key;

  if v_locked_until is not null and v_locked_until > now() then
    return 'Usuario bloqueado temporalmente por intentos fallidos. Intente de nuevo en unos minutos.';
  end if;

  return null;
end;
$$;

create or replace function public.register_login_attempt(
  p_username text,
  p_success boolean,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_username, '')));
  v_attempts integer;
  v_locked_until timestamptz;
begin
  if v_key = '' then
    return;
  end if;

  if p_success then
    insert into public.login_guard (username_key, failed_attempts, locked_until, updated_at)
    values (v_key, 0, null, now())
    on conflict (username_key)
    do update set
      failed_attempts = 0,
      locked_until = null,
      updated_at = now();

    perform public.audit_event(
      'login_success',
      'usuarios',
      v_key,
      jsonb_build_object('username', v_key),
      null,
      p_user_agent
    );
    return;
  end if;

  insert into public.login_guard (username_key, failed_attempts, locked_until, updated_at)
  values (v_key, 1, null, now())
  on conflict (username_key)
  do update set
    failed_attempts = public.login_guard.failed_attempts + 1,
    updated_at = now()
  returning failed_attempts into v_attempts;

  if v_attempts >= 5 then
    update public.login_guard
    set failed_attempts = 0,
        locked_until = now() + interval '15 minutes',
        updated_at = now()
    where username_key = v_key
    returning locked_until into v_locked_until;

    perform public.audit_event(
      'login_blocked',
      'usuarios',
      v_key,
      jsonb_build_object('username', v_key, 'locked_until', v_locked_until),
      null,
      p_user_agent
    );
  else
    perform public.audit_event(
      'login_failed',
      'usuarios',
      v_key,
      jsonb_build_object('username', v_key, 'attempts', v_attempts),
      null,
      p_user_agent
    );
  end if;
end;
$$;

grant execute on function public.check_login_allowed(text) to anon, authenticated;
grant execute on function public.register_login_attempt(text, boolean, text) to anon, authenticated;

create or replace function public.unlock_login_guard(
  p_username text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_username, '')));
  v_has_access boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if v_key = '' then
    raise exception 'Usuario requerido';
  end if;

  -- Solo usuarios con permiso de mantenimiento en alguna empresa activa
  select exists (
    select 1
    from public.usuarios u
    join public.usuarios_empresas ue on ue.usuario_id = u.id
    where u.auth_user_id = auth.uid()
      and ue.activo = true
      and public.has_permission(ue.empresa_id, 'mantenimientos', 'editar')
  ) into v_has_access;

  if not v_has_access then
    raise exception 'No tiene permisos para desbloquear usuarios';
  end if;

  update public.login_guard
  set failed_attempts = 0,
      locked_until = null,
      updated_at = now()
  where username_key = v_key;

  perform public.audit_event(
    'login_unlocked',
    'usuarios',
    v_key,
    jsonb_build_object('username', v_key)
  );
end;
$$;

grant execute on function public.unlock_login_guard(text) to authenticated;

-- Auditoria de cambios sensibles: roles_permisos
create or replace function public.trg_audit_roles_permisos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_event(
      'roles_permisos_insert',
      'roles_permisos',
      new.id::text,
      jsonb_build_object('rol_id', new.rol_id, 'permiso_id', new.permiso_id)
    );
    return new;
  elsif tg_op = 'DELETE' then
    perform public.audit_event(
      'roles_permisos_delete',
      'roles_permisos',
      old.id::text,
      jsonb_build_object('rol_id', old.rol_id, 'permiso_id', old.permiso_id)
    );
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_roles_permisos on public.roles_permisos;
create trigger trg_audit_roles_permisos
after insert or delete on public.roles_permisos
for each row execute function public.trg_audit_roles_permisos();

-- Auditoria de cambios sensibles: usuarios_empresas
create or replace function public.trg_audit_usuarios_empresas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_event(
      'usuarios_empresas_insert',
      'usuarios_empresas',
      new.id::text,
      jsonb_build_object('usuario_id', new.usuario_id, 'empresa_id', new.empresa_id, 'rol_id', new.rol_id, 'activo', new.activo)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.audit_event(
      'usuarios_empresas_update',
      'usuarios_empresas',
      new.id::text,
      jsonb_build_object(
        'before', jsonb_build_object('rol_id', old.rol_id, 'activo', old.activo),
        'after', jsonb_build_object('rol_id', new.rol_id, 'activo', new.activo)
      )
    );
    return new;
  elsif tg_op = 'DELETE' then
    perform public.audit_event(
      'usuarios_empresas_delete',
      'usuarios_empresas',
      old.id::text,
      jsonb_build_object('usuario_id', old.usuario_id, 'empresa_id', old.empresa_id, 'rol_id', old.rol_id)
    );
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_usuarios_empresas on public.usuarios_empresas;
create trigger trg_audit_usuarios_empresas
after insert or update or delete on public.usuarios_empresas
for each row execute function public.trg_audit_usuarios_empresas();

commit;
