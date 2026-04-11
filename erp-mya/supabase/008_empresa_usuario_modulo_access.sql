-- Control de acceso efectivo por:
-- 1) Modulos habilitados por empresa
-- 2) Modulos habilitados por usuario dentro de la empresa
-- 3) Permisos por rol (ver/crear/editar/eliminar/aprobar)
-- Ejecutar en SQL Editor con rol postgres.

begin;

-- 1) Tabla puente: usuario_empresa -> modulos permitidos para ese usuario
create table if not exists public.usuarios_empresas_modulos (
  id bigserial primary key,
  usuario_empresa_id bigint not null references public.usuarios_empresas(id) on delete cascade,
  modulo_id bigint not null references public.modulos(id) on delete cascade,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (usuario_empresa_id, modulo_id)
);

create index if not exists idx_uem_usuario_empresa on public.usuarios_empresas_modulos(usuario_empresa_id);
create index if not exists idx_uem_modulo on public.usuarios_empresas_modulos(modulo_id);
create index if not exists idx_uem_activo on public.usuarios_empresas_modulos(activo);

alter table public.usuarios_empresas_modulos enable row level security;

drop policy if exists usuarios_empresas_modulos_read_authenticated on public.usuarios_empresas_modulos;
create policy usuarios_empresas_modulos_read_authenticated
on public.usuarios_empresas_modulos
for select
to authenticated
using (true);

-- 2) Funcion: acceso a modulo (empresa + usuario + restricciones)
create or replace function public.has_module_access(
  p_empresa_id bigint,
  p_modulo_codigo text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_modulo_id bigint;
  v_usuario_empresa_id bigint;
  v_empresa_tiene_restriccion boolean := false;
  v_usuario_tiene_restriccion boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  select m.id
    into v_modulo_id
  from public.modulos m
  where lower(m.codigo) = lower(coalesce(p_modulo_codigo, ''))
  limit 1;

  if v_modulo_id is null then
    return false;
  end if;

  -- Usuario debe tener acceso a la empresa
  select ue.id
    into v_usuario_empresa_id
  from public.usuarios u
  join public.usuarios_empresas ue on ue.usuario_id = u.id
  where u.auth_user_id = v_uid
    and ue.empresa_id = p_empresa_id
    and coalesce(ue.activo, true) = true
  limit 1;

  if v_usuario_empresa_id is null then
    return false;
  end if;

  -- Restriccion por empresa (si existe info en empresa_modulos)
  select exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = 'empresa_modulos'
  ) into v_empresa_tiene_restriccion;

  if v_empresa_tiene_restriccion then
    if not exists (
      select 1
      from public.empresa_modulos em
      where em.empresa_id = p_empresa_id
        and em.modulo_id = v_modulo_id
        and coalesce(em.activo, true) = true
    ) then
      return false;
    end if;
  end if;

  -- Restriccion por usuario dentro de la empresa (si hay filas, aplica whitelist)
  select exists (
    select 1
    from public.usuarios_empresas_modulos uem
    where uem.usuario_empresa_id = v_usuario_empresa_id
  ) into v_usuario_tiene_restriccion;

  if v_usuario_tiene_restriccion then
    if not exists (
      select 1
      from public.usuarios_empresas_modulos uem
      where uem.usuario_empresa_id = v_usuario_empresa_id
        and uem.modulo_id = v_modulo_id
        and coalesce(uem.activo, true) = true
    ) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

grant execute on function public.has_module_access(bigint, text) to authenticated;

-- 3) Endurecer has_permission para incluir acceso a modulo efectivo
create or replace function public.has_permission(
  p_empresa_id bigint,
  p_modulo_codigo text,
  p_accion text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_module_access(p_empresa_id, p_modulo_codigo)
    and exists (
      select 1
      from public.usuarios u
      join public.usuarios_empresas ue on ue.usuario_id = u.id
      join public.roles_permisos rp on rp.rol_id = ue.rol_id
      join public.permisos p on p.id = rp.permiso_id
      join public.modulos m on m.id = p.modulo_id
      where u.auth_user_id = auth.uid()
        and ue.empresa_id = p_empresa_id
        and coalesce(ue.activo, true) = true
        and lower(m.codigo) = lower(p_modulo_codigo)
        and (
          p.accion = p_accion
          or p.accion = 'aprobar'
        )
    );
$$;

grant execute on function public.has_permission(bigint, text, text) to authenticated;

-- 4) RPC para frontend: permisos efectivos del usuario en la empresa
create or replace function public.get_effective_permissions(
  p_empresa_id bigint
)
returns table (
  modulo_codigo text,
  accion text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct lower(m.codigo) as modulo_codigo, lower(p.accion) as accion
  from public.usuarios u
  join public.usuarios_empresas ue on ue.usuario_id = u.id
  join public.roles_permisos rp on rp.rol_id = ue.rol_id
  join public.permisos p on p.id = rp.permiso_id
  join public.modulos m on m.id = p.modulo_id
  where u.auth_user_id = auth.uid()
    and ue.empresa_id = p_empresa_id
    and coalesce(ue.activo, true) = true
    and public.has_module_access(p_empresa_id, m.codigo);
$$;

grant execute on function public.get_effective_permissions(bigint) to authenticated;

-- 5) Admin RPC para asignar modulos por usuario-empresa
create or replace function public.set_user_empresa_modules(
  p_usuario_empresa_id bigint,
  p_modulo_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  select ue.empresa_id
    into v_empresa_id
  from public.usuarios_empresas ue
  where ue.id = p_usuario_empresa_id
  limit 1;

  if v_empresa_id is null then
    raise exception 'Relacion usuario/empresa no encontrada';
  end if;

  if not public.has_permission(v_empresa_id, 'mantenimientos', 'editar') then
    raise exception 'No tiene permisos para modificar modulos de usuario';
  end if;

  delete from public.usuarios_empresas_modulos
  where usuario_empresa_id = p_usuario_empresa_id;

  if coalesce(array_length(p_modulo_ids, 1), 0) > 0 then
    insert into public.usuarios_empresas_modulos (usuario_empresa_id, modulo_id, activo)
    select p_usuario_empresa_id, unnest(p_modulo_ids), true
    on conflict (usuario_empresa_id, modulo_id)
    do update set activo = true;
  end if;
end;
$$;

grant execute on function public.set_user_empresa_modules(bigint, bigint[]) to authenticated;

commit;
