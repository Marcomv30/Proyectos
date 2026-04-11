-- Snapshot de acceso efectivo por usuario/empresa para depuracion admin.
-- Ejecutar en SQL Editor con rol postgres.

begin;

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
