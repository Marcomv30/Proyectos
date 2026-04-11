begin;

create table if not exists public.bancos_estado_importado (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  cuenta_banco_id bigint not null references public.cuentas_bancarias_empresa(id) on delete cascade,
  periodo_id bigint not null references public.bancos_conciliacion_periodos(id) on delete cascade,
  fecha_movimiento date not null,
  descripcion text not null,
  referencia text null,
  debito numeric(18,2) not null default 0,
  credito numeric(18,2) not null default 0,
  saldo numeric(18,2) null,
  conciliado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  unique (periodo_id, fecha_movimiento, descripcion, referencia, debito, credito, saldo)
);

create index if not exists idx_bancos_estado_importado_lookup
  on public.bancos_estado_importado(empresa_id, cuenta_banco_id, periodo_id, fecha_movimiento desc, id desc);

drop trigger if exists trg_bancos_estado_importado_updated_at on public.bancos_estado_importado;
create trigger trg_bancos_estado_importado_updated_at
before update on public.bancos_estado_importado
for each row execute function public.tg_set_updated_at_recaudacion();

create or replace view public.vw_bancos_estado_importado as
select
  e.id,
  e.empresa_id,
  e.cuenta_banco_id,
  cb.codigo as cuenta_banco_codigo,
  cb.alias as cuenta_banco_alias,
  e.periodo_id,
  p.fecha_desde,
  p.fecha_hasta,
  e.fecha_movimiento,
  e.descripcion,
  e.referencia,
  e.debito,
  e.credito,
  e.saldo,
  e.conciliado,
  e.created_at
from public.bancos_estado_importado e
join public.cuentas_bancarias_empresa cb on cb.id = e.cuenta_banco_id
join public.bancos_conciliacion_periodos p on p.id = e.periodo_id;

grant select on public.vw_bancos_estado_importado to authenticated, service_role;

alter table public.bancos_estado_importado enable row level security;

drop policy if exists bancos_estado_importado_select on public.bancos_estado_importado;
create policy bancos_estado_importado_select
on public.bancos_estado_importado
for select
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'ver'));

drop policy if exists bancos_estado_importado_write on public.bancos_estado_importado;
create policy bancos_estado_importado_write
on public.bancos_estado_importado
for all
to authenticated
using (public.has_permission(empresa_id, 'bancos', 'editar'))
with check (public.has_permission(empresa_id, 'bancos', 'editar'));

grant select, insert, update, delete on public.bancos_estado_importado to authenticated;

commit;
