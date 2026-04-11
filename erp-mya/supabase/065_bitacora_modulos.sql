-- Bitacora funcional por modulos (inmutable) para trazabilidad operativa.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.bitacora_modulos (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  modulo text not null,
  accion text not null,
  entidad text not null default '',
  entidad_id text null,
  descripcion text null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid null,
  created_by_usuario_id bigint null references public.usuarios(id) on delete set null,
  user_agent text null
);

create index if not exists idx_bitacora_modulos_empresa_fecha
  on public.bitacora_modulos (empresa_id, created_at desc);

create index if not exists idx_bitacora_modulos_modulo_accion
  on public.bitacora_modulos (modulo, accion, created_at desc);

alter table public.bitacora_modulos enable row level security;

drop policy if exists bitacora_modulos_select_authenticated on public.bitacora_modulos;
create policy bitacora_modulos_select_authenticated
on public.bitacora_modulos
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'ver')
);

create or replace function public.log_modulo_evento(
  p_empresa_id bigint,
  p_modulo text,
  p_accion text,
  p_entidad text default null,
  p_entidad_id text default null,
  p_descripcion text default null,
  p_detalle jsonb default '{}'::jsonb,
  p_user_agent text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_uid uuid := auth.uid();
  v_actor_usuario_id bigint := null;
  v_id bigint;
begin
  if v_actor_uid is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if coalesce(trim(p_modulo), '') = '' then
    raise exception 'Modulo requerido';
  end if;

  if coalesce(trim(p_accion), '') = '' then
    raise exception 'Accion requerida';
  end if;

  if not public.has_empresa_access(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  select u.id
    into v_actor_usuario_id
  from public.usuarios u
  where u.auth_user_id = v_actor_uid
  limit 1;

  insert into public.bitacora_modulos (
    empresa_id,
    modulo,
    accion,
    entidad,
    entidad_id,
    descripcion,
    detalle,
    created_by,
    created_by_usuario_id,
    user_agent
  ) values (
    p_empresa_id,
    lower(trim(p_modulo)),
    lower(trim(p_accion)),
    coalesce(trim(p_entidad), ''),
    nullif(trim(p_entidad_id), ''),
    nullif(trim(p_descripcion), ''),
    coalesce(p_detalle, '{}'::jsonb),
    v_actor_uid,
    v_actor_usuario_id,
    nullif(trim(p_user_agent), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.trg_bitacora_modulos_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'La bitacora es inmutable: no se permite %', tg_op;
end;
$$;

drop trigger if exists trg_bitacora_modulos_immutable on public.bitacora_modulos;
create trigger trg_bitacora_modulos_immutable
before update or delete on public.bitacora_modulos
for each row
execute function public.trg_bitacora_modulos_immutable();

create or replace view public.vw_bitacora_modulos
with (security_invoker = true)
as
select
  b.id,
  b.empresa_id,
  b.modulo,
  b.accion,
  b.entidad,
  b.entidad_id,
  b.descripcion,
  b.detalle,
  b.created_at,
  b.created_by,
  b.created_by_usuario_id,
  coalesce(u.nombre, u.username, 'sistema') as actor_nombre,
  u.username as actor_username,
  b.user_agent
from public.bitacora_modulos b
left join public.usuarios u on u.id = b.created_by_usuario_id;

grant execute on function public.log_modulo_evento(bigint, text, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.log_modulo_evento(bigint, text, text, text, text, text, jsonb, text) to service_role;
grant select on public.vw_bitacora_modulos to authenticated;
grant select on public.vw_bitacora_modulos to service_role;

commit;
