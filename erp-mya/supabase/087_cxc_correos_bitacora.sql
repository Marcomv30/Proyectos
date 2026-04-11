-- Bitacora de correos de gestion de cobro.
-- Ejecutar con rol postgres.

begin;

create table if not exists public.cxc_correos_bitacora (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  tercero_id bigint not null references public.terceros(id) on delete cascade,
  documento_id bigint null references public.cxc_documentos(id) on delete set null,
  etiqueta_envio text not null default 'estado_cuenta',
  to_email text not null,
  reply_to text null,
  subject text not null,
  body_text text null,
  provider text not null default 'resend',
  provider_message_id text null,
  estado text not null default 'enviado' check (estado in ('enviado', 'error')),
  attachments_count integer not null default 0,
  attachments jsonb not null default '[]'::jsonb,
  error_code text null,
  error_detail text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid null,
  check (attachments_count >= 0)
);

create index if not exists idx_cxc_correos_bitacora_lookup
  on public.cxc_correos_bitacora(empresa_id, tercero_id, created_at desc, id desc);

alter table public.cxc_correos_bitacora enable row level security;

drop policy if exists cxc_correos_bitacora_select_authenticated on public.cxc_correos_bitacora;
create policy cxc_correos_bitacora_select_authenticated
on public.cxc_correos_bitacora
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'cxc', 'ver')
);

create or replace view public.vw_cxc_correos_bitacora as
select
  b.id,
  b.empresa_id,
  b.tercero_id,
  t.razon_social as tercero_nombre,
  t.identificacion as tercero_identificacion,
  b.documento_id,
  d.numero_documento,
  b.etiqueta_envio,
  b.to_email,
  b.reply_to,
  b.subject,
  b.body_text,
  b.provider,
  b.provider_message_id,
  b.estado,
  b.attachments_count,
  b.attachments,
  b.error_code,
  b.error_detail,
  b.payload,
  b.created_at,
  b.created_by,
  coalesce(u.nombre, u.username, b.created_by::text) as created_by_nombre
from public.cxc_correos_bitacora b
join public.terceros t on t.id = b.tercero_id
left join public.cxc_documentos d on d.id = b.documento_id
left join public.usuarios u on u.auth_user_id = b.created_by;

grant select on public.cxc_correos_bitacora to authenticated;
grant select on public.cxc_correos_bitacora to service_role;
grant select on public.vw_cxc_correos_bitacora to authenticated;
grant select on public.vw_cxc_correos_bitacora to service_role;

commit;
