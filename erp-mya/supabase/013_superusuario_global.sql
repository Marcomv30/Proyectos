-- Super Usuario global sin restricciones de empresa/modulo/rol.
-- Ejecutar en SQL Editor con rol postgres.

begin;

alter table public.usuarios
  add column if not exists es_superusuario boolean not null default false;

create index if not exists idx_usuarios_superusuario on public.usuarios(es_superusuario);

create or replace function public.is_superuser(
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = p_uid
      and coalesce(u.activo, true) = true
      and coalesce(u.es_superusuario, false) = true
  );
$$;

grant execute on function public.is_superuser(uuid) to authenticated;

create or replace function public.has_empresa_access(p_empresa_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superuser(auth.uid())
    or exists (
      select 1
      from public.usuarios u
      join public.usuarios_empresas ue on ue.usuario_id = u.id
      where u.auth_user_id = auth.uid()
        and ue.empresa_id = p_empresa_id
        and coalesce(ue.activo, true) = true
    );
$$;

grant execute on function public.has_empresa_access(bigint) to authenticated;

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
  v_empresa_modulos_tiene_activo boolean := false;
  v_empresa_tiene_filas_modulos boolean := false;
  v_usuario_tiene_restriccion boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  if public.is_superuser(v_uid) then
    return true;
  end if;

  select m.id
    into v_modulo_id
  from public.modulos m
  where lower(m.codigo) = lower(coalesce(p_modulo_codigo, ''))
  limit 1;

  if v_modulo_id is null then
    return false;
  end if;

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

  select exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = 'empresa_modulos'
  ) into v_empresa_tiene_restriccion;

  if v_empresa_tiene_restriccion then
    select exists (
      select 1
      from public.empresa_modulos em
      where em.empresa_id = p_empresa_id
    ) into v_empresa_tiene_filas_modulos;

    if v_empresa_tiene_filas_modulos then
      select exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'empresa_modulos'
          and c.column_name = 'activo'
      ) into v_empresa_modulos_tiene_activo;

      if v_empresa_modulos_tiene_activo then
        if not exists (
          select 1
          from public.empresa_modulos em
          where em.empresa_id = p_empresa_id
            and em.modulo_id = v_modulo_id
            and coalesce(em.activo, true) = true
        ) then
          return false;
        end if;
      else
        if not exists (
          select 1
          from public.empresa_modulos em
          where em.empresa_id = p_empresa_id
            and em.modulo_id = v_modulo_id
        ) then
          return false;
        end if;
      end if;
    end if;
  end if;

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
    public.is_superuser(auth.uid())
    or (
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
          and (p.accion = p_accion or p.accion = 'aprobar')
      )
    );
$$;

grant execute on function public.has_permission(bigint, text, text) to authenticated;

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
  from public.permisos p
  join public.modulos m on m.id = p.modulo_id
  where public.is_superuser(auth.uid())

  union

  select distinct lower(m.codigo) as modulo_codigo, lower(p.accion) as accion
  from public.usuarios u
  join public.usuarios_empresas ue on ue.usuario_id = u.id
  join public.roles_permisos rp on rp.rol_id = ue.rol_id
  join public.permisos p on p.id = rp.permiso_id
  join public.modulos m on m.id = p.modulo_id
  where not public.is_superuser(auth.uid())
    and u.auth_user_id = auth.uid()
    and ue.empresa_id = p_empresa_id
    and coalesce(ue.activo, true) = true
    and public.has_module_access(p_empresa_id, m.codigo);
$$;

grant execute on function public.get_effective_permissions(bigint) to authenticated;

create or replace function public.get_user_effective_permissions_admin(
  p_usuario_id bigint,
  p_empresa_id bigint
)
returns table (
  modulo_codigo text,
  accion text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_uid uuid := auth.uid();
  v_target_ue_id bigint;
  v_target_uid uuid;
  v_target_super boolean := false;
  v_empresa_tiene_restriccion boolean := false;
  v_empresa_modulos_tiene_activo boolean := false;
  v_empresa_tiene_filas_modulos boolean := false;
  v_target_tiene_restriccion boolean := false;
begin
  if v_actor_uid is null then
    raise exception 'Sesion invalida';
  end if;

  if not public.has_permission(p_empresa_id, 'mantenimientos', 'editar') then
    raise exception 'No tiene permisos para ver el estado de acceso';
  end if;

  select u.auth_user_id, coalesce(u.es_superusuario, false)
    into v_target_uid, v_target_super
  from public.usuarios u
  where u.id = p_usuario_id
  limit 1;

  if v_target_super then
    return query
    select distinct lower(m.codigo) as modulo_codigo, lower(p.accion) as accion
    from public.permisos p
    join public.modulos m on m.id = p.modulo_id;
    return;
  end if;

  select ue.id
    into v_target_ue_id
  from public.usuarios_empresas ue
  where ue.usuario_id = p_usuario_id
    and ue.empresa_id = p_empresa_id
    and coalesce(ue.activo, true) = true
  limit 1;

  if v_target_ue_id is null then
    return;
  end if;

  select exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = 'empresa_modulos'
  ) into v_empresa_tiene_restriccion;

  if v_empresa_tiene_restriccion then
    select exists (
      select 1
      from public.empresa_modulos em
      where em.empresa_id = p_empresa_id
    ) into v_empresa_tiene_filas_modulos;

    if v_empresa_tiene_filas_modulos then
      select exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'empresa_modulos'
          and c.column_name = 'activo'
      ) into v_empresa_modulos_tiene_activo;
    end if;
  end if;

  select exists (
    select 1
    from public.usuarios_empresas_modulos uem
    where uem.usuario_empresa_id = v_target_ue_id
  ) into v_target_tiene_restriccion;

  if (not v_empresa_tiene_restriccion) or (not v_empresa_tiene_filas_modulos) then
    return query
    select distinct lower(m.codigo) as modulo_codigo, lower(p.accion) as accion
    from public.usuarios_empresas ue
    join public.roles_permisos rp on rp.rol_id = ue.rol_id
    join public.permisos p on p.id = rp.permiso_id
    join public.modulos m on m.id = p.modulo_id
    where ue.id = v_target_ue_id
      and (
        not v_target_tiene_restriccion
        or exists (
          select 1
          from public.usuarios_empresas_modulos uem
          where uem.usuario_empresa_id = v_target_ue_id
            and uem.modulo_id = m.id
            and coalesce(uem.activo, true) = true
        )
      );
    return;
  end if;

  if v_empresa_modulos_tiene_activo then
    return query
    select distinct lower(m.codigo) as modulo_codigo, lower(p.accion) as accion
    from public.usuarios_empresas ue
    join public.roles_permisos rp on rp.rol_id = ue.rol_id
    join public.permisos p on p.id = rp.permiso_id
    join public.modulos m on m.id = p.modulo_id
    where ue.id = v_target_ue_id
      and exists (
        select 1
        from public.empresa_modulos em
        where em.empresa_id = p_empresa_id
          and em.modulo_id = m.id
          and coalesce(em.activo, true) = true
      )
      and (
        not v_target_tiene_restriccion
        or exists (
          select 1
          from public.usuarios_empresas_modulos uem
          where uem.usuario_empresa_id = v_target_ue_id
            and uem.modulo_id = m.id
            and coalesce(uem.activo, true) = true
        )
      );
    return;
  end if;

  return query
  select distinct lower(m.codigo) as modulo_codigo, lower(p.accion) as accion
  from public.usuarios_empresas ue
  join public.roles_permisos rp on rp.rol_id = ue.rol_id
  join public.permisos p on p.id = rp.permiso_id
  join public.modulos m on m.id = p.modulo_id
  where ue.id = v_target_ue_id
    and exists (
      select 1
      from public.empresa_modulos em
      where em.empresa_id = p_empresa_id
        and em.modulo_id = m.id
    )
    and (
      not v_target_tiene_restriccion
      or exists (
        select 1
        from public.usuarios_empresas_modulos uem
        where uem.usuario_empresa_id = v_target_ue_id
          and uem.modulo_id = m.id
          and coalesce(uem.activo, true) = true
      )
    );
end;
$$;

grant execute on function public.get_user_effective_permissions_admin(bigint, bigint) to authenticated;

commit;

