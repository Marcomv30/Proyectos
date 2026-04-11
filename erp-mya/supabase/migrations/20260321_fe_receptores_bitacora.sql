create table if not exists public.fe_receptores_bitacora (
  id                          bigserial primary key,
  empresa_id                  integer not null,
  tipo_identificacion         varchar(4),
  identificacion              varchar(30) not null,
  razon_social                text not null,
  actividad_tributaria_id     bigint null references public.actividad_tributaria(id) on delete restrict,
  actividad_codigo            varchar(6),
  actividad_descripcion       text,
  email                       text,
  telefono                    varchar(30),
  direccion                   text,
  origen_mh                   boolean not null default false,
  payload_json                jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (empresa_id, identificacion)
);

alter table public.fe_documentos
  add column if not exists receptor_bitacora_id bigint null references public.fe_receptores_bitacora(id) on delete set null,
  add column if not exists receptor_origen text null,
  add column if not exists receptor_tipo_identificacion varchar(4) null,
  add column if not exists receptor_identificacion varchar(30) null,
  add column if not exists receptor_nombre text null,
  add column if not exists receptor_actividad_codigo varchar(6) null,
  add column if not exists receptor_actividad_descripcion text null,
  add column if not exists receptor_email text null,
  add column if not exists receptor_telefono varchar(30) null,
  add column if not exists receptor_direccion text null;

alter table public.fe_receptores_bitacora enable row level security;

drop policy if exists fe_receptores_bitacora_select on public.fe_receptores_bitacora;
create policy fe_receptores_bitacora_select on public.fe_receptores_bitacora
  for select using (public.has_empresa_access(empresa_id));

drop policy if exists fe_receptores_bitacora_write on public.fe_receptores_bitacora;
create policy fe_receptores_bitacora_write on public.fe_receptores_bitacora
  for all using (public.has_empresa_access(empresa_id))
  with check (public.has_empresa_access(empresa_id));

create index if not exists fe_receptores_bitacora_empresa_ident_idx
  on public.fe_receptores_bitacora (empresa_id, identificacion);
