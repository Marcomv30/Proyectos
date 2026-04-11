-- Patron herencia + override para categorias de asiento por empresa.
-- Fase 1: backend listo, sin romper flujos actuales.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.asiento_categorias_empresa (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  categoria_base_id bigint not null references public.asiento_categorias(id) on delete cascade,
  codigo text not null,
  descripcion text not null,
  tipo_id bigint null references public.asiento_tipos(id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, categoria_base_id)
);

create index if not exists idx_asiento_cat_emp_empresa on public.asiento_categorias_empresa(empresa_id);
create index if not exists idx_asiento_cat_emp_base on public.asiento_categorias_empresa(categoria_base_id);
create index if not exists idx_asiento_cat_emp_activo on public.asiento_categorias_empresa(activo);

alter table public.asiento_categorias_empresa enable row level security;

drop policy if exists asiento_cat_emp_select_authenticated on public.asiento_categorias_empresa;
create policy asiento_cat_emp_select_authenticated
on public.asiento_categorias_empresa
for select
to authenticated
using (public.has_empresa_access(empresa_id));

drop policy if exists asiento_cat_emp_insert_authenticated on public.asiento_categorias_empresa;
create policy asiento_cat_emp_insert_authenticated
on public.asiento_categorias_empresa
for insert
to authenticated
with check (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'contabilidad', 'editar')
);

drop policy if exists asiento_cat_emp_update_authenticated on public.asiento_categorias_empresa;
create policy asiento_cat_emp_update_authenticated
on public.asiento_categorias_empresa
for update
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'contabilidad', 'editar')
)
with check (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'contabilidad', 'editar')
);

drop policy if exists asiento_cat_emp_delete_authenticated on public.asiento_categorias_empresa;
create policy asiento_cat_emp_delete_authenticated
on public.asiento_categorias_empresa
for delete
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'contabilidad', 'editar')
);

create or replace function public.seed_asiento_categorias_empresa(
  p_empresa_id bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if not public.has_permission(p_empresa_id, 'contabilidad', 'ver') then
    raise exception 'No tiene permisos para inicializar categorias de asiento';
  end if;

  insert into public.asiento_categorias_empresa (
    empresa_id,
    categoria_base_id,
    codigo,
    descripcion,
    tipo_id,
    activo
  )
  select
    p_empresa_id,
    c.id,
    c.codigo,
    c.descripcion,
    c.tipo_id,
    coalesce(c.activo, true)
  from public.asiento_categorias c
  where not exists (
    select 1
    from public.asiento_categorias_empresa ce
    where ce.empresa_id = p_empresa_id
      and ce.categoria_base_id = c.id
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.seed_asiento_categorias_empresa(bigint) to authenticated;
grant execute on function public.seed_asiento_categorias_empresa(bigint) to service_role;

create or replace function public.reset_asiento_categorias_empresa(
  p_empresa_id bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if not public.has_permission(p_empresa_id, 'contabilidad', 'editar') then
    raise exception 'No tiene permisos para restaurar categorias de asiento';
  end if;

  update public.asiento_categorias_empresa ce
  set
    codigo = c.codigo,
    descripcion = c.descripcion,
    tipo_id = c.tipo_id,
    activo = coalesce(c.activo, true)
  from public.asiento_categorias c
  where ce.empresa_id = p_empresa_id
    and ce.categoria_base_id = c.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.reset_asiento_categorias_empresa(bigint) to authenticated;
grant execute on function public.reset_asiento_categorias_empresa(bigint) to service_role;

create or replace function public.get_asiento_categorias_effective(
  p_empresa_id bigint
)
returns table (
  categoria_id bigint,
  categoria_base_id bigint,
  codigo text,
  descripcion text,
  tipo_id bigint,
  activo boolean,
  modo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_override boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if not public.has_empresa_access(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  select exists (
    select 1
    from public.asiento_categorias_empresa ce
    where ce.empresa_id = p_empresa_id
  ) into v_has_override;

  if v_has_override then
    return query
    select
      ce.id as categoria_id,
      ce.categoria_base_id,
      ce.codigo,
      ce.descripcion,
      ce.tipo_id,
      ce.activo,
      'override_empresa'::text as modo
    from public.asiento_categorias_empresa ce
    where ce.empresa_id = p_empresa_id
      and coalesce(ce.activo, true) = true
    order by ce.codigo;
    return;
  end if;

  return query
  select
    c.id as categoria_id,
    c.id as categoria_base_id,
    c.codigo,
    c.descripcion,
    c.tipo_id,
    coalesce(c.activo, true) as activo,
    'herencia_base'::text as modo
  from public.asiento_categorias c
  where coalesce(c.activo, true) = true
  order by c.codigo;
end;
$$;

grant execute on function public.get_asiento_categorias_effective(bigint) to authenticated;
grant execute on function public.get_asiento_categorias_effective(bigint) to service_role;

commit;

