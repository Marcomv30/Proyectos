-- Reinicializa el catalogo contable de una empresa desde plan_cuentas_base.
-- No elimina filas: restaura codigo/nombre/activo y agrega faltantes.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.reset_plan_cuentas_empresa(
  p_empresa_id bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
  v_inserted integer := 0;
  v_nivel integer;
  v_lvl_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if not public.has_permission(p_empresa_id, 'contabilidad', 'editar') then
    raise exception 'No tiene permisos para reinicializar el catalogo contable';
  end if;

  -- Actualiza en orden jerarquico (padre->hijo) para no violar validacion de padre.
  for v_nivel in 1..5 loop
    update public.plan_cuentas_empresa e
    set
      codigo = b.codigo,
      nombre = b.nombre,
      activo = true
    from public.plan_cuentas_base b
    where e.empresa_id = p_empresa_id
      and e.cuenta_base_id = b.id
      and coalesce(b.activo, true) = true
      and coalesce(b.nivel, 0) = v_nivel;

    get diagnostics v_lvl_updated = row_count;
    v_updated := v_updated + v_lvl_updated;
  end loop;

  insert into public.plan_cuentas_empresa (
    empresa_id,
    cuenta_base_id,
    codigo,
    nombre,
    activo
  )
  select
    p_empresa_id,
    b.id,
    b.codigo,
    b.nombre,
    true
  from public.plan_cuentas_base b
  where coalesce(b.activo, true) = true
    and not exists (
      select 1
      from public.plan_cuentas_empresa e
      where e.empresa_id = p_empresa_id
        and e.cuenta_base_id = b.id
    )
  order by coalesce(b.nivel, 99), b.codigo;

  get diagnostics v_inserted = row_count;
  return v_updated + v_inserted;
end;
$$;

grant execute on function public.reset_plan_cuentas_empresa(bigint) to authenticated;
grant execute on function public.reset_plan_cuentas_empresa(bigint) to service_role;

commit;
