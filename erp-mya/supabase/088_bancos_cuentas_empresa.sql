begin;

create table if not exists public.cuentas_bancarias_empresa (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  codigo text not null,
  alias text not null,
  banco_nombre text not null,
  titular text null,
  moneda text not null default 'CRC' check (moneda in ('CRC', 'USD')),
  numero_cuenta text not null,
  cuenta_contable_id bigint not null references public.plan_cuentas_empresa(id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null default auth.uid(),
  updated_by uuid null default auth.uid()
);

create unique index if not exists idx_cuentas_bancarias_empresa_codigo
  on public.cuentas_bancarias_empresa(empresa_id, codigo);

create index if not exists idx_cuentas_bancarias_empresa_lookup
  on public.cuentas_bancarias_empresa(empresa_id, activo, moneda, banco_nombre);

create or replace function public.trg_cuentas_bancarias_empresa_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_cuentas_bancarias_empresa_updated_at on public.cuentas_bancarias_empresa;
create trigger trg_cuentas_bancarias_empresa_updated_at
before update on public.cuentas_bancarias_empresa
for each row execute function public.trg_cuentas_bancarias_empresa_updated_at();

create or replace view public.vw_cuentas_bancarias_empresa as
select
  cb.id,
  cb.empresa_id,
  cb.codigo,
  cb.alias,
  cb.banco_nombre,
  cb.titular,
  cb.moneda,
  cb.numero_cuenta,
  cb.cuenta_contable_id,
  ce.codigo as cuenta_contable_codigo,
  ce.nombre as cuenta_contable_nombre,
  cb.activo,
  cb.created_at,
  cb.updated_at
from public.cuentas_bancarias_empresa cb
join public.plan_cuentas_empresa ce on ce.id = cb.cuenta_contable_id;

alter table public.cuentas_bancarias_empresa enable row level security;

drop policy if exists cuentas_bancarias_empresa_select_authenticated on public.cuentas_bancarias_empresa;
create policy cuentas_bancarias_empresa_select_authenticated
on public.cuentas_bancarias_empresa
for select
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'ver'));

drop policy if exists cuentas_bancarias_empresa_insert_authenticated on public.cuentas_bancarias_empresa;
create policy cuentas_bancarias_empresa_insert_authenticated
on public.cuentas_bancarias_empresa
for insert
to authenticated
with check (public.has_permission(empresa_id, 'bancos', 'editar'));

drop policy if exists cuentas_bancarias_empresa_update_authenticated on public.cuentas_bancarias_empresa;
create policy cuentas_bancarias_empresa_update_authenticated
on public.cuentas_bancarias_empresa
for update
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'editar'))
with check (public.has_permission(empresa_id, 'bancos', 'editar'));

drop policy if exists cuentas_bancarias_empresa_delete_authenticated on public.cuentas_bancarias_empresa;
create policy cuentas_bancarias_empresa_delete_authenticated
on public.cuentas_bancarias_empresa
for delete
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'editar'));

grant select, insert, update, delete on public.cuentas_bancarias_empresa to authenticated;
grant usage, select on sequence public.cuentas_bancarias_empresa_id_seq to authenticated;
grant select on public.vw_cuentas_bancarias_empresa to authenticated, service_role;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recaudacion_pagos'
      and column_name = 'cuenta_banco_id'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'recaudacion_pagos_cuenta_banco_fk'
  ) then
    alter table public.recaudacion_pagos
      add constraint recaudacion_pagos_cuenta_banco_fk
      foreign key (cuenta_banco_id)
      references public.cuentas_bancarias_empresa(id);
  end if;
end $$;

commit;
