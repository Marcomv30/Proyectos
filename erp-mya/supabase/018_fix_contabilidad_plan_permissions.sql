-- Fix de permisos/RLS para modulo contable (plan_cuentas_base y plan_cuentas_empresa).
-- Objetivo: evitar consultas vacias por falta de GRANT/POLICY.
-- Ejecutar en SQL Editor con rol postgres.

begin;

-- 1) Grants explicitos
grant select on table public.plan_cuentas_base to authenticated;
grant insert, update, delete on table public.plan_cuentas_base to authenticated;

grant select on table public.plan_cuentas_empresa to authenticated;
grant insert, update, delete on table public.plan_cuentas_empresa to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- 2) RLS para plan_cuentas_base (catalogo maestro)
alter table public.plan_cuentas_base enable row level security;

drop policy if exists plan_cuentas_base_select_authenticated on public.plan_cuentas_base;
create policy plan_cuentas_base_select_authenticated
on public.plan_cuentas_base
for select
to authenticated
using (true);

drop policy if exists plan_cuentas_base_write_authenticated on public.plan_cuentas_base;
create policy plan_cuentas_base_write_authenticated
on public.plan_cuentas_base
for all
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    join public.usuarios_empresas ue on ue.usuario_id = u.id
    where u.auth_user_id = auth.uid()
      and coalesce(ue.activo, true) = true
      and public.has_permission(ue.empresa_id, 'mantenimientos', 'editar')
  )
)
with check (
  exists (
    select 1
    from public.usuarios u
    join public.usuarios_empresas ue on ue.usuario_id = u.id
    where u.auth_user_id = auth.uid()
      and coalesce(ue.activo, true) = true
      and public.has_permission(ue.empresa_id, 'mantenimientos', 'editar')
  )
);

-- 3) RLS para plan_cuentas_empresa (catalogo por empresa)
alter table public.plan_cuentas_empresa enable row level security;

drop policy if exists plan_cuentas_empresa_select_authenticated on public.plan_cuentas_empresa;
create policy plan_cuentas_empresa_select_authenticated
on public.plan_cuentas_empresa
for select
to authenticated
using (public.has_empresa_access(empresa_id));

drop policy if exists plan_cuentas_empresa_insert_authenticated on public.plan_cuentas_empresa;
create policy plan_cuentas_empresa_insert_authenticated
on public.plan_cuentas_empresa
for insert
to authenticated
with check (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'contabilidad', 'editar')
);

drop policy if exists plan_cuentas_empresa_update_authenticated on public.plan_cuentas_empresa;
create policy plan_cuentas_empresa_update_authenticated
on public.plan_cuentas_empresa
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

drop policy if exists plan_cuentas_empresa_delete_authenticated on public.plan_cuentas_empresa;
create policy plan_cuentas_empresa_delete_authenticated
on public.plan_cuentas_empresa
for delete
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'contabilidad', 'editar')
);

commit;

-- Verificacion sugerida:
-- select count(*) as base_count from public.plan_cuentas_base;
-- select empresa_id, count(*) as empresa_count
-- from public.plan_cuentas_empresa
-- group by empresa_id
-- order by empresa_id;

