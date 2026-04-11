-- Acceso a modulos por empresa + rol:
-- 1) Si hay empresa_modulos para la empresa, usa esa whitelist.
-- 2) Si no hay empresa_modulos, usa modulos heredados por actividad_modulos.
-- 3) Si no hay actividad o no hay modulos heredados, no hay acceso a modulos.
-- Ejecutar en SQL Editor con rol postgres.

begin;

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
  v_empresa_tiene_tabla_modulos boolean := false;
  v_empresa_modulos_tiene_activo boolean := false;
  v_empresa_tiene_filas_modulos boolean := false;
  v_empresa_actividad_id bigint;
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
  ) into v_empresa_tiene_tabla_modulos;

  if v_empresa_tiene_tabla_modulos then
    select exists (
      select 1
      from public.empresa_modulos em
      where em.empresa_id = p_empresa_id
    ) into v_empresa_tiene_filas_modulos;
  end if;

  -- Prioridad 1: whitelist explicita por empresa_modulos.
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
  else
    -- Prioridad 2: herencia por actividad_modulos.
    select e.actividad_id
      into v_empresa_actividad_id
    from public.empresas e
    where e.id = p_empresa_id
    limit 1;

    if v_empresa_actividad_id is null then
      return false;
    end if;

    if not exists (
      select 1
      from public.actividad_modulos am
      where am.actividad_id = v_empresa_actividad_id
        and am.modulo_id = v_modulo_id
    ) then
      return false;
    end if;
  end if;

  -- Filtro opcional adicional por usuario/empresa (whitelist).
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

commit;

