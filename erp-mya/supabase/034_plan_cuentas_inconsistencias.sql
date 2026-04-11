-- Diagnostico de inconsistencias en plan de cuentas (base y empresa).
-- Requiere funciones de 033_plan_cuentas_validacion_jerarquia.sql
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.get_plan_cuentas_inconsistencias(bigint);

create or replace function public.get_plan_cuentas_inconsistencias(
  p_empresa_id bigint
)
returns table (
  scope text,
  codigo text,
  nombre text,
  nivel integer,
  issue text,
  parent_codigo text,
  parent_nombre text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     and current_user not in ('postgres', 'service_role')
  then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not public.has_empresa_access(p_empresa_id)
  then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not (
       public.has_permission(p_empresa_id, 'contabilidad', 'ver')
       or public.has_permission(p_empresa_id, 'contabilidad', 'editar')
       or public.has_permission(p_empresa_id, 'contabilidad', 'aprobar')
     )
  then
    raise exception 'No tiene permisos para diagnostico contable';
  end if;

  return query
  with base_src as (
    select
      'BASE'::text as scope,
      b.codigo::text as codigo,
      b.nombre::text as nombre,
      b.nivel::integer as nivel,
      public.plan_cuentas_infer_nivel(b.codigo) as nivel_infer,
      public.plan_cuentas_parent_codigo(b.codigo, b.nivel) as parent_codigo
    from public.plan_cuentas_base b
  ),
  base_issues as (
    select
      s.scope,
      s.codigo,
      s.nombre,
      s.nivel,
      case
        when s.nivel_infer is null then 'FORMATO_CODIGO_INVALIDO'
        when s.nivel_infer <> s.nivel then 'NIVEL_NO_CORRESPONDE_CODIGO'
        when s.nivel > 1 and not exists (
          select 1 from public.plan_cuentas_base p where p.codigo = s.parent_codigo
        ) then 'FALTA_CUENTA_PADRE'
        else null
      end as issue,
      s.parent_codigo,
      p.nombre::text as parent_nombre
    from base_src s
    left join public.plan_cuentas_base p on p.codigo = s.parent_codigo
  ),
  emp_src as (
    select
      'EMPRESA'::text as scope,
      e.codigo::text as codigo,
      e.nombre::text as nombre,
      coalesce(public.plan_cuentas_infer_nivel(e.codigo), 0)::integer as nivel,
      public.plan_cuentas_parent_codigo(e.codigo, coalesce(public.plan_cuentas_infer_nivel(e.codigo), 0)) as parent_codigo
    from public.plan_cuentas_empresa e
    where e.empresa_id = p_empresa_id
  ),
  emp_issues as (
    select
      s.scope,
      s.codigo,
      s.nombre,
      s.nivel,
      case
        when s.nivel = 0 then 'FORMATO_CODIGO_INVALIDO'
        when s.nivel > 1 and not exists (
          select 1
          from public.plan_cuentas_empresa p
          where p.empresa_id = p_empresa_id
            and p.codigo = s.parent_codigo
        ) then 'FALTA_CUENTA_PADRE'
        else null
      end as issue,
      s.parent_codigo,
      p.nombre::text as parent_nombre
    from emp_src s
    left join public.plan_cuentas_empresa p
      on p.empresa_id = p_empresa_id
     and p.codigo = s.parent_codigo
  )
  select i.scope, i.codigo, i.nombre, i.nivel, i.issue, i.parent_codigo, i.parent_nombre
  from (
    select * from base_issues
    union all
    select * from emp_issues
  ) i
  where i.issue is not null
  order by i.scope, i.codigo;
end;
$$;

grant execute on function public.get_plan_cuentas_inconsistencias(bigint) to authenticated;
grant execute on function public.get_plan_cuentas_inconsistencias(bigint) to service_role;

commit;
