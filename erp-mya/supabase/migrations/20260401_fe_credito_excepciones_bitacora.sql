create table if not exists public.fe_credito_excepciones_bitacora (
  id bigserial primary key,
  empresa_id bigint not null,
  documento_id bigint null references public.fe_documentos(id) on delete set null,
  tercero_id bigint null,
  tipo_documento varchar(2) null,
  numero_consecutivo varchar(20) null,
  estado_credito text not null default 'alerta',
  autorizado_por text not null,
  motivo text not null,
  reglas jsonb not null default '[]'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid null default auth.uid()
);

create index if not exists idx_fe_credito_excepciones_lookup
  on public.fe_credito_excepciones_bitacora (empresa_id, documento_id, tercero_id, created_at desc, id desc);

alter table public.fe_credito_excepciones_bitacora enable row level security;

drop policy if exists fe_credito_excepciones_select on public.fe_credito_excepciones_bitacora;
create policy fe_credito_excepciones_select on public.fe_credito_excepciones_bitacora
  for select using (public.has_empresa_access(empresa_id));

drop policy if exists fe_credito_excepciones_insert on public.fe_credito_excepciones_bitacora;
create policy fe_credito_excepciones_insert on public.fe_credito_excepciones_bitacora
  for insert with check (public.has_empresa_access(empresa_id));

grant select, insert on public.fe_credito_excepciones_bitacora to authenticated;
grant select, insert on public.fe_credito_excepciones_bitacora to service_role;
