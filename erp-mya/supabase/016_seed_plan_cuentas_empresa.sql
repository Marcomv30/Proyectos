-- Seed idempotente del catalogo contable por empresa.
-- Objetivo: copiar plan_cuentas_base hacia plan_cuentas_empresa cuando la empresa no tenga filas.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.seed_plan_cuentas_empresa(
  p_empresa_id bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  -- Solo usuarios con acceso de lectura al modulo contabilidad en la empresa.
  if not public.has_permission(p_empresa_id, 'contabilidad', 'ver') then
    raise exception 'No tiene permisos para inicializar catalogo contable';
  end if;

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
  return v_inserted;
end;
$$;

grant execute on function public.seed_plan_cuentas_empresa(bigint) to authenticated;
grant execute on function public.seed_plan_cuentas_empresa(bigint) to service_role;

commit;
