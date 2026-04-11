-- Transición recomendada a Supabase Auth (ejecutar por bloques)

-- A) Diagnóstico: usuarios pendientes de vincular con Auth
select id, username, email, auth_user_id, activo
from public.usuarios
where coalesce(activo, true) = true
order by username;

-- B) Vincular usuarios por email (si ya existen en auth.users)
update public.usuarios u
set auth_user_id = a.id
from auth.users a
where lower(u.email) = lower(a.email)
  and u.auth_user_id is null;

-- C) Verificar pendientes
select id, username, email
from public.usuarios
where coalesce(activo, true) = true
  and auth_user_id is null
order by username;

-- D) (Opcional) Endurecer tabla usuarios para modo Auth-only
-- Ejecuta solo cuando todos los usuarios activos estén vinculados y con email válido.
-- update public.usuarios set password = 'AUTH_MANAGED' where password is null or trim(password) = '';
-- alter table public.usuarios alter column email set not null;
-- alter table public.usuarios alter column password set default 'AUTH_MANAGED';

-- E) Eliminar políticas temporales anon, si las llegaste a crear
drop policy if exists usuarios_empresas_read_anon on public.usuarios_empresas;
drop policy if exists roles_permisos_read_anon on public.roles_permisos;
drop policy if exists permisos_read_anon on public.permisos;

