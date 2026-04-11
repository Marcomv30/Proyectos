-- RBAC + RLS base para ERP MYA
-- Ejecutar en Supabase SQL Editor con rol de administrador.

begin;

-- 1) Catálogo de permisos por módulo/acción
create table if not exists public.permisos (
  id bigserial primary key,
  modulo_id bigint not null references public.modulos(id) on delete cascade,
  accion text not null check (accion in ('ver', 'crear', 'editar', 'eliminar', 'aprobar')),
  created_at timestamptz not null default now(),
  unique (modulo_id, accion)
);

create index if not exists idx_permisos_modulo on public.permisos(modulo_id);
create index if not exists idx_permisos_accion on public.permisos(accion);

create table if not exists public.roles_permisos (
  id bigserial primary key,
  rol_id bigint not null references public.roles(id) on delete cascade,
  permiso_id bigint not null references public.permisos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (rol_id, permiso_id)
);

create index if not exists idx_roles_permisos_rol on public.roles_permisos(rol_id);
create index if not exists idx_roles_permisos_permiso on public.roles_permisos(permiso_id);

-- 2) Seed inicial: crea todas las acciones para cada módulo existente
insert into public.permisos (modulo_id, accion)
select m.id, a.accion
from public.modulos m
cross join (
  values ('ver'), ('crear'), ('editar'), ('eliminar'), ('aprobar')
) as a(accion)
on conflict (modulo_id, accion) do nothing;

-- 3) Vinculación con auth.uid() para RLS
alter table public.usuarios
  add column if not exists auth_user_id uuid unique;

-- 4) Funciones de autorización
create or replace function public.has_empresa_access(p_empresa_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    join public.usuarios_empresas ue on ue.usuario_id = u.id
    where u.auth_user_id = auth.uid()
      and ue.empresa_id = p_empresa_id
      and coalesce(ue.activo, true) = true
  );
$$;

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
  select exists (
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

grant execute on function public.has_empresa_access(bigint) to authenticated;
grant execute on function public.has_permission(bigint, text, text) to authenticated;

-- 5) RLS automático para todas las tablas con empresa_id
do $$
declare
  t record;
begin
  for t in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables it
      on it.table_schema = c.table_schema
     and it.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'empresa_id'
      and it.table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I enable row level security', t.table_name);

    execute format('drop policy if exists %I on public.%I', t.table_name || '_empresa_select', t.table_name);
    execute format('drop policy if exists %I on public.%I', t.table_name || '_empresa_insert', t.table_name);
    execute format('drop policy if exists %I on public.%I', t.table_name || '_empresa_update', t.table_name);
    execute format('drop policy if exists %I on public.%I', t.table_name || '_empresa_delete', t.table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_empresa_access(empresa_id))',
      t.table_name || '_empresa_select',
      t.table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_empresa_access(empresa_id))',
      t.table_name || '_empresa_insert',
      t.table_name
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_empresa_access(empresa_id)) with check (public.has_empresa_access(empresa_id))',
      t.table_name || '_empresa_update',
      t.table_name
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_empresa_access(empresa_id))',
      t.table_name || '_empresa_delete',
      t.table_name
    );
  end loop;
end $$;

-- 6) RLS de lectura para tablas de permisos (writes solo service_role por defecto)
alter table public.permisos enable row level security;
alter table public.roles_permisos enable row level security;

drop policy if exists permisos_read_authenticated on public.permisos;
create policy permisos_read_authenticated
on public.permisos
for select
to authenticated
using (true);

drop policy if exists roles_permisos_read_authenticated on public.roles_permisos;
create policy roles_permisos_read_authenticated
on public.roles_permisos
for select
to authenticated
using (true);

commit;
