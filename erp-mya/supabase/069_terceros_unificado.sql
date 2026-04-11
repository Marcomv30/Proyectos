-- Catalogo unificado de terceros (clientes, proveedores y contactos)
-- Base para CXC/CXP y mantenimientos.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.terceros (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  codigo text null,
  tipo_identificacion text null,
  identificacion text null,
  razon_social text not null,
  nombre_comercial text null,
  alias text null,
  email text null,
  telefono_1 text null,
  telefono_2 text null,
  direccion jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  notas text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null
);

create unique index if not exists ux_terceros_empresa_codigo
  on public.terceros(empresa_id, lower(codigo))
  where codigo is not null and btrim(codigo) <> '';

create unique index if not exists ux_terceros_empresa_identificacion
  on public.terceros(empresa_id, lower(tipo_identificacion), lower(identificacion))
  where tipo_identificacion is not null
    and identificacion is not null
    and btrim(tipo_identificacion) <> ''
    and btrim(identificacion) <> '';

create index if not exists idx_terceros_empresa_nombre
  on public.terceros(empresa_id, lower(razon_social));

create table if not exists public.tercero_roles (
  id bigserial primary key,
  tercero_id bigint not null references public.terceros(id) on delete cascade,
  rol text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  unique (tercero_id, rol),
  check (rol in ('cliente', 'proveedor', 'contacto'))
);

create index if not exists idx_tercero_roles_lookup
  on public.tercero_roles(tercero_id, rol, activo);

create table if not exists public.tercero_cliente_parametros (
  tercero_id bigint primary key references public.terceros(id) on delete cascade,
  limite_credito numeric(18,2) not null default 0,
  dias_credito integer not null default 0,
  moneda_credito text not null default 'CRC',
  condicion_pago text null,
  clase_cliente text null,
  ubicacion text null,
  aplica_descuentos boolean not null default false,
  descuento_maximo_pct numeric(8,4) not null default 0,
  exonerado boolean not null default false,
  exoneracion jsonb not null default '{}'::jsonb,
  vendedor text null,
  observaciones text null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (moneda_credito in ('CRC', 'USD', 'AMBAS')),
  check (dias_credito >= 0),
  check (limite_credito >= 0),
  check (descuento_maximo_pct >= 0)
);

create table if not exists public.tercero_proveedor_parametros (
  tercero_id bigint primary key references public.terceros(id) on delete cascade,
  dias_credito integer not null default 0,
  condicion_pago text null,
  clase_proveedor text null,
  ubicacion text null,
  aplica_retencion boolean not null default false,
  retencion_pct numeric(8,4) not null default 0,
  exonerado boolean not null default false,
  exoneracion jsonb not null default '{}'::jsonb,
  banco jsonb not null default '{}'::jsonb,
  observaciones text null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  check (dias_credito >= 0),
  check (retencion_pct >= 0)
);

create table if not exists public.tercero_contactos (
  id bigserial primary key,
  tercero_id bigint not null references public.terceros(id) on delete cascade,
  nombre text not null,
  cargo text null,
  email text null,
  telefono text null,
  es_principal boolean not null default false,
  activo boolean not null default true,
  notas text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create index if not exists idx_tercero_contactos_lookup
  on public.tercero_contactos(tercero_id, activo, es_principal);

create unique index if not exists ux_tercero_contacto_principal
  on public.tercero_contactos(tercero_id)
  where es_principal = true and activo = true;

create or replace function public.tg_set_updated_at_terceros()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ensure_tercero_rol(
  p_tercero_id bigint,
  p_rol text,
  p_activo boolean default true,
  p_updated_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tercero_id is null or p_rol is null then
    return;
  end if;

  insert into public.tercero_roles (tercero_id, rol, activo, updated_by)
  values (p_tercero_id, lower(p_rol), coalesce(p_activo, true), p_updated_by)
  on conflict (tercero_id, rol)
  do update set
    activo = excluded.activo,
    updated_at = now(),
    updated_by = excluded.updated_by;
end;
$$;

create or replace function public.trg_tercero_cliente_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_tercero_rol(new.tercero_id, 'cliente', true, new.updated_by);
  return new;
end;
$$;

create or replace function public.trg_tercero_proveedor_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_tercero_rol(new.tercero_id, 'proveedor', true, new.updated_by);
  return new;
end;
$$;

create or replace function public.trg_tercero_contactos_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_tercero_rol(new.tercero_id, 'contacto', true, new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_terceros_updated_at on public.terceros;
create trigger trg_terceros_updated_at
before update on public.terceros
for each row
execute function public.tg_set_updated_at_terceros();

drop trigger if exists trg_tercero_roles_updated_at on public.tercero_roles;
create trigger trg_tercero_roles_updated_at
before update on public.tercero_roles
for each row
execute function public.tg_set_updated_at_terceros();

drop trigger if exists trg_tercero_cliente_parametros_updated_at on public.tercero_cliente_parametros;
create trigger trg_tercero_cliente_parametros_updated_at
before update on public.tercero_cliente_parametros
for each row
execute function public.tg_set_updated_at_terceros();

drop trigger if exists trg_tercero_proveedor_parametros_updated_at on public.tercero_proveedor_parametros;
create trigger trg_tercero_proveedor_parametros_updated_at
before update on public.tercero_proveedor_parametros
for each row
execute function public.tg_set_updated_at_terceros();

drop trigger if exists trg_tercero_contactos_updated_at on public.tercero_contactos;
create trigger trg_tercero_contactos_updated_at
before update on public.tercero_contactos
for each row
execute function public.tg_set_updated_at_terceros();

drop trigger if exists trg_tercero_cliente_roles on public.tercero_cliente_parametros;
create trigger trg_tercero_cliente_roles
after insert or update on public.tercero_cliente_parametros
for each row
execute function public.trg_tercero_cliente_roles();

drop trigger if exists trg_tercero_proveedor_roles on public.tercero_proveedor_parametros;
create trigger trg_tercero_proveedor_roles
after insert or update on public.tercero_proveedor_parametros
for each row
execute function public.trg_tercero_proveedor_roles();

drop trigger if exists trg_tercero_contactos_roles on public.tercero_contactos;
create trigger trg_tercero_contactos_roles
after insert or update on public.tercero_contactos
for each row
execute function public.trg_tercero_contactos_roles();

alter table public.terceros enable row level security;
alter table public.tercero_roles enable row level security;
alter table public.tercero_cliente_parametros enable row level security;
alter table public.tercero_proveedor_parametros enable row level security;
alter table public.tercero_contactos enable row level security;

-- terceros

drop policy if exists terceros_select_authenticated on public.terceros;
create policy terceros_select_authenticated
on public.terceros
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'ver')
);

drop policy if exists terceros_write_authenticated on public.terceros;
create policy terceros_write_authenticated
on public.terceros
for all
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'editar')
)
with check (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'editar')
);

-- tercero_roles

drop policy if exists tercero_roles_select_authenticated on public.tercero_roles;
create policy tercero_roles_select_authenticated
on public.tercero_roles
for select
to authenticated
using (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_roles.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'ver')
  )
);

drop policy if exists tercero_roles_write_authenticated on public.tercero_roles;
create policy tercero_roles_write_authenticated
on public.tercero_roles
for all
to authenticated
using (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_roles.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'editar')
  )
)
with check (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_roles.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'editar')
  )
);

-- tercero_cliente_parametros

drop policy if exists tercero_cliente_parametros_select_authenticated on public.tercero_cliente_parametros;
create policy tercero_cliente_parametros_select_authenticated
on public.tercero_cliente_parametros
for select
to authenticated
using (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_cliente_parametros.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'ver')
  )
);

drop policy if exists tercero_cliente_parametros_write_authenticated on public.tercero_cliente_parametros;
create policy tercero_cliente_parametros_write_authenticated
on public.tercero_cliente_parametros
for all
to authenticated
using (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_cliente_parametros.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'editar')
  )
)
with check (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_cliente_parametros.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'editar')
  )
);

-- tercero_proveedor_parametros

drop policy if exists tercero_proveedor_parametros_select_authenticated on public.tercero_proveedor_parametros;
create policy tercero_proveedor_parametros_select_authenticated
on public.tercero_proveedor_parametros
for select
to authenticated
using (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_proveedor_parametros.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'ver')
  )
);

drop policy if exists tercero_proveedor_parametros_write_authenticated on public.tercero_proveedor_parametros;
create policy tercero_proveedor_parametros_write_authenticated
on public.tercero_proveedor_parametros
for all
to authenticated
using (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_proveedor_parametros.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'editar')
  )
)
with check (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_proveedor_parametros.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'editar')
  )
);

-- tercero_contactos

drop policy if exists tercero_contactos_select_authenticated on public.tercero_contactos;
create policy tercero_contactos_select_authenticated
on public.tercero_contactos
for select
to authenticated
using (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_contactos.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'ver')
  )
);

drop policy if exists tercero_contactos_write_authenticated on public.tercero_contactos;
create policy tercero_contactos_write_authenticated
on public.tercero_contactos
for all
to authenticated
using (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_contactos.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'editar')
  )
)
with check (
  exists (
    select 1
    from public.terceros t
    where t.id = tercero_contactos.tercero_id
      and public.has_empresa_access(t.empresa_id)
      and public.has_permission(t.empresa_id, 'mantenimientos', 'editar')
  )
);

create or replace view public.vw_terceros as
select
  t.id,
  t.empresa_id,
  t.codigo,
  t.tipo_identificacion,
  t.identificacion,
  t.razon_social,
  t.nombre_comercial,
  t.alias,
  t.email,
  t.telefono_1,
  t.telefono_2,
  t.direccion,
  t.activo,
  t.notas,
  t.created_at,
  t.updated_at,
  t.created_by,
  t.updated_by
from public.terceros t;

create or replace view public.vw_tercero_roles as
select
  r.id,
  r.tercero_id,
  r.rol,
  r.activo,
  r.created_at,
  r.updated_at,
  r.updated_by
from public.tercero_roles r;

create or replace view public.vw_tercero_cliente_parametros as
select
  p.tercero_id,
  p.limite_credito,
  p.dias_credito,
  p.moneda_credito,
  p.condicion_pago,
  p.clase_cliente,
  p.ubicacion,
  p.aplica_descuentos,
  p.descuento_maximo_pct,
  p.exonerado,
  p.exoneracion,
  p.vendedor,
  p.observaciones,
  p.updated_at,
  p.updated_by
from public.tercero_cliente_parametros p;

create or replace view public.vw_tercero_proveedor_parametros as
select
  p.tercero_id,
  p.dias_credito,
  p.condicion_pago,
  p.clase_proveedor,
  p.ubicacion,
  p.aplica_retencion,
  p.retencion_pct,
  p.exonerado,
  p.exoneracion,
  p.banco,
  p.observaciones,
  p.updated_at,
  p.updated_by
from public.tercero_proveedor_parametros p;

create or replace view public.vw_tercero_contactos as
select
  c.id,
  c.tercero_id,
  c.nombre,
  c.cargo,
  c.email,
  c.telefono,
  c.es_principal,
  c.activo,
  c.notas,
  c.created_at,
  c.updated_at,
  c.updated_by
from public.tercero_contactos c;

create or replace view public.vw_terceros_catalogo as
with roles as (
  select
    r.tercero_id,
    array_agg(r.rol order by r.rol) filter (where r.activo = true) as roles_activos
  from public.tercero_roles r
  group by r.tercero_id
)
select
  t.id,
  t.empresa_id,
  t.codigo,
  t.tipo_identificacion,
  t.identificacion,
  t.razon_social,
  t.nombre_comercial,
  t.alias,
  t.email,
  t.telefono_1,
  t.telefono_2,
  t.activo,
  coalesce(r.roles_activos, array[]::text[]) as roles,
  (coalesce(r.roles_activos, array[]::text[]) @> array['cliente']::text[]) as es_cliente,
  (coalesce(r.roles_activos, array[]::text[]) @> array['proveedor']::text[]) as es_proveedor,
  (coalesce(r.roles_activos, array[]::text[]) @> array['contacto']::text[]) as es_contacto,
  t.updated_at
from public.terceros t
left join roles r on r.tercero_id = t.id;

grant execute on function public.ensure_tercero_rol(bigint, text, boolean, uuid) to authenticated;
grant execute on function public.ensure_tercero_rol(bigint, text, boolean, uuid) to service_role;

grant select, insert, update, delete on table public.terceros to authenticated;
grant select, insert, update, delete on table public.tercero_roles to authenticated;
grant select, insert, update, delete on table public.tercero_cliente_parametros to authenticated;
grant select, insert, update, delete on table public.tercero_proveedor_parametros to authenticated;
grant select, insert, update, delete on table public.tercero_contactos to authenticated;

grant select, insert, update, delete on public.vw_terceros to authenticated;
grant select, insert, update, delete on public.vw_tercero_roles to authenticated;
grant select, insert, update, delete on public.vw_tercero_cliente_parametros to authenticated;
grant select, insert, update, delete on public.vw_tercero_proveedor_parametros to authenticated;
grant select, insert, update, delete on public.vw_tercero_contactos to authenticated;
grant select on public.vw_terceros_catalogo to authenticated;

grant select on table public.terceros to service_role;
grant select on table public.tercero_roles to service_role;
grant select on table public.tercero_cliente_parametros to service_role;
grant select on table public.tercero_proveedor_parametros to service_role;
grant select on table public.tercero_contactos to service_role;

grant select on public.vw_terceros to service_role;
grant select on public.vw_tercero_roles to service_role;
grant select on public.vw_tercero_cliente_parametros to service_role;
grant select on public.vw_tercero_proveedor_parametros to service_role;
grant select on public.vw_tercero_contactos to service_role;
grant select on public.vw_terceros_catalogo to service_role;

commit;
