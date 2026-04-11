-- Fix RLS para actividad_modulos (pantalla Mantenimientos > Actividades)
-- Ejecutar con rol postgres en SQL Editor.

begin;

create or replace function public.has_mantenimientos_view_access()
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
      and ue.activo = true
      and public.has_permission(ue.empresa_id, 'mantenimientos', 'ver')
  );
$$;

create or replace function public.has_mantenimientos_edit_access()
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
      and ue.activo = true
      and public.has_permission(ue.empresa_id, 'mantenimientos', 'editar')
  );
$$;

grant execute on function public.has_mantenimientos_view_access() to authenticated;
grant execute on function public.has_mantenimientos_edit_access() to authenticated;

alter table public.actividad_modulos enable row level security;

drop policy if exists actividad_modulos_select_authenticated on public.actividad_modulos;
create policy actividad_modulos_select_authenticated
on public.actividad_modulos
for select
to authenticated
using (public.has_mantenimientos_view_access());

drop policy if exists actividad_modulos_insert_authenticated on public.actividad_modulos;
create policy actividad_modulos_insert_authenticated
on public.actividad_modulos
for insert
to authenticated
with check (public.has_mantenimientos_edit_access());

drop policy if exists actividad_modulos_update_authenticated on public.actividad_modulos;
create policy actividad_modulos_update_authenticated
on public.actividad_modulos
for update
to authenticated
using (public.has_mantenimientos_edit_access())
with check (public.has_mantenimientos_edit_access());

drop policy if exists actividad_modulos_delete_authenticated on public.actividad_modulos;
create policy actividad_modulos_delete_authenticated
on public.actividad_modulos
for delete
to authenticated
using (public.has_mantenimientos_edit_access());

commit;
