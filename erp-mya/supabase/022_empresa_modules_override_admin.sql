-- Override de modulos por empresa (modelo mixto con herencia por actividad).
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.set_empresa_modules(
  p_empresa_id bigint,
  p_modulo_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_table boolean := false;
  v_has_activo boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if not public.has_permission(p_empresa_id, 'mantenimientos', 'editar') then
    raise exception 'No tiene permisos para modificar modulos por empresa';
  end if;

  select exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = 'empresa_modulos'
  ) into v_has_table;

  if not v_has_table then
    raise exception 'No existe la tabla public.empresa_modulos';
  end if;

  delete from public.empresa_modulos
  where empresa_id = p_empresa_id;

  if coalesce(array_length(p_modulo_ids, 1), 0) = 0 then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'empresa_modulos'
      and c.column_name = 'activo'
  ) into v_has_activo;

  if v_has_activo then
    insert into public.empresa_modulos (empresa_id, modulo_id, activo)
    select
      p_empresa_id,
      x.modulo_id,
      true
    from (
      select distinct unnest(p_modulo_ids) as modulo_id
    ) x
    join public.modulos m on m.id = x.modulo_id
    on conflict do nothing;
  else
    insert into public.empresa_modulos (empresa_id, modulo_id)
    select
      p_empresa_id,
      x.modulo_id
    from (
      select distinct unnest(p_modulo_ids) as modulo_id
    ) x
    join public.modulos m on m.id = x.modulo_id
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.set_empresa_modules(bigint, bigint[]) to authenticated;

create or replace function public.clear_empresa_modules_override(
  p_empresa_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if not public.has_permission(p_empresa_id, 'mantenimientos', 'editar') then
    raise exception 'No tiene permisos para limpiar override de modulos por empresa';
  end if;

  delete from public.empresa_modulos
  where empresa_id = p_empresa_id;
end;
$$;

grant execute on function public.clear_empresa_modules_override(bigint) to authenticated;

commit;

