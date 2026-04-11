-- Roles de prueba para validar visibilidad/acciones por permisos en Mantenimientos
-- Ejecutar en Supabase SQL Editor con rol postgres.

begin;

-- 1) Validar modulo mantenimientos y asegurar catalogo de permisos base
do $$
declare
  v_modulo_id bigint;
begin
  select m.id
    into v_modulo_id
  from public.modulos m
  where lower(m.codigo) = 'mantenimientos'
  limit 1;

  if v_modulo_id is null then
    raise exception 'No existe el modulo "mantenimientos" en public.modulos';
  end if;

  insert into public.permisos (modulo_id, accion)
  select v_modulo_id, x.accion
  from (values ('ver'), ('crear'), ('editar'), ('eliminar'), ('aprobar')) as x(accion)
  on conflict (modulo_id, accion) do nothing;
end $$;

-- 2) Definir 6 perfiles de prueba
create temporary table tmp_roles_prueba (
  nombre text primary key,
  descripcion text,
  acciones text[] not null
) on commit drop;

insert into tmp_roles_prueba (nombre, descripcion, acciones) values
  ('QA - Mantenimientos Solo Lectura', 'Prueba: solo ve vistas de mantenimientos', array['ver']),
  ('QA - Mantenimientos Creador', 'Prueba: ver + crear', array['ver','crear']),
  ('QA - Mantenimientos Editor', 'Prueba: ver + editar', array['ver','editar']),
  ('QA - Mantenimientos Eliminador', 'Prueba: ver + eliminar', array['ver','eliminar']),
  ('QA - Mantenimientos Full', 'Prueba: ver + crear + editar + eliminar', array['ver','crear','editar','eliminar']),
  ('QA - Sin Acceso Mantenimientos', 'Prueba: sin permiso de mantenimientos', array[]::text[]);

-- 3) Upsert de roles y sincronizacion exacta de permisos del modulo mantenimientos
do $$
declare
  r record;
  v_rol_id bigint;
begin
  for r in
    select *
    from tmp_roles_prueba
  loop
    select ro.id
      into v_rol_id
    from public.roles ro
    where lower(ro.nombre) = lower(r.nombre)
    limit 1;

    if v_rol_id is null then
      insert into public.roles (nombre, descripcion)
      values (r.nombre, r.descripcion)
      returning id into v_rol_id;
    else
      update public.roles
      set descripcion = r.descripcion
      where id = v_rol_id;
    end if;

    -- Limpiar solo permisos del modulo mantenimientos para este rol
    delete from public.roles_permisos rp
    using public.permisos p
    join public.modulos m on m.id = p.modulo_id
    where rp.permiso_id = p.id
      and rp.rol_id = v_rol_id
      and lower(m.codigo) = 'mantenimientos';

    -- Reasignar permisos segun perfil
    if cardinality(r.acciones) > 0 then
      insert into public.roles_permisos (rol_id, permiso_id)
      select v_rol_id, p.id
      from public.permisos p
      join public.modulos m on m.id = p.modulo_id
      where lower(m.codigo) = 'mantenimientos'
        and p.accion = any (r.acciones)
      on conflict (rol_id, permiso_id) do nothing;
    end if;
  end loop;
end $$;

commit;

-- Verificacion sugerida:
-- select ro.nombre, m.codigo as modulo, p.accion
-- from public.roles ro
-- left join public.roles_permisos rp on rp.rol_id = ro.id
-- left join public.permisos p on p.id = rp.permiso_id
-- left join public.modulos m on m.id = p.modulo_id
-- where ro.nombre like 'QA - %'
-- order by ro.nombre, p.accion;
