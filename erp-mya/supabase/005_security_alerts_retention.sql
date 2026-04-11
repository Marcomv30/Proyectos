-- Alertas de seguridad por correo + retencion/archivo de bitacora
-- Ejecutar en SQL Editor con rol postgres.

begin;

-- 1) Destinatarios de alertas
create table if not exists public.security_alert_recipients (
  id bigserial primary key,
  email text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.security_alert_recipients enable row level security;

drop policy if exists security_alert_recipients_read_authenticated on public.security_alert_recipients;
create policy security_alert_recipients_read_authenticated
on public.security_alert_recipients
for select
to authenticated
using (true);

-- 2) Cola de envio de alertas (la envia un worker/edge function)
create table if not exists public.security_alert_outbox (
  id bigserial primary key,
  audit_id bigint not null references public.security_audit_log(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  unique (audit_id, recipient_email)
);

create index if not exists idx_security_alert_outbox_status on public.security_alert_outbox(status, created_at);
create index if not exists idx_security_alert_outbox_audit_id on public.security_alert_outbox(audit_id);

alter table public.security_alert_outbox enable row level security;

drop policy if exists security_alert_outbox_read_authenticated on public.security_alert_outbox;
create policy security_alert_outbox_read_authenticated
on public.security_alert_outbox
for select
to authenticated
using (true);

-- 3) Encolar alertas automaticas en eventos criticos
create or replace function public.enqueue_security_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_body text;
begin
  -- Define aqui los eventos que consideras graves
  if new.evento not in ('login_blocked') then
    return new;
  end if;

  v_subject := format('[SEGURIDAD] Evento critico: %s', new.evento);
  v_body := format(
    'Fecha: %s\nEvento: %s\nEntidad: %s\nEntidad ID: %s\nDetalle: %s',
    new.created_at::text,
    new.evento,
    coalesce(new.entidad, ''),
    coalesce(new.entidad_id, ''),
    coalesce(new.detalle::text, '{}')
  );

  insert into public.security_alert_outbox (audit_id, recipient_email, subject, body)
  select new.id, r.email, v_subject, v_body
  from public.security_alert_recipients r
  where r.activo = true
  on conflict (audit_id, recipient_email) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_security_alerts on public.security_audit_log;
create trigger trg_enqueue_security_alerts
after insert on public.security_audit_log
for each row execute function public.enqueue_security_alerts();

-- 4) RPC para worker: tomar pendientes
create or replace function public.claim_security_alerts(
  p_limit integer default 20
)
returns table (
  id bigint,
  audit_id bigint,
  recipient_email text,
  subject text,
  body text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cte as (
    select o.id
    from public.security_alert_outbox o
    where o.status = 'pending'
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 200))
    for update skip locked
  )
  update public.security_alert_outbox o
  set status = 'processing',
      attempts = o.attempts + 1
  from cte
  where o.id = cte.id
  returning o.id, o.audit_id, o.recipient_email, o.subject, o.body;
end;
$$;

create or replace function public.complete_security_alert(
  p_outbox_id bigint,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.security_alert_outbox
  set status = case when p_success then 'sent' else 'failed' end,
      sent_at = case when p_success then now() else sent_at end,
      last_error = case when p_success then null else left(coalesce(p_error, 'unknown_error'), 1000) end
  where id = p_outbox_id;
end;
$$;

grant execute on function public.claim_security_alerts(integer) to authenticated;
grant execute on function public.complete_security_alert(bigint, boolean, text) to authenticated;
grant execute on function public.claim_security_alerts(integer) to service_role;
grant execute on function public.complete_security_alert(bigint, boolean, text) to service_role;

-- 5) Archivo y retencion de bitacora
create table if not exists public.security_audit_log_archive (
  id bigint primary key,
  created_at timestamptz not null,
  actor_uid uuid null,
  actor_usuario_id bigint null,
  evento text not null,
  entidad text not null,
  entidad_id text null,
  detalle jsonb not null default '{}'::jsonb,
  ip text null,
  user_agent text null,
  archived_at timestamptz not null default now()
);

create index if not exists idx_security_audit_archive_created_at on public.security_audit_log_archive(created_at desc);
create index if not exists idx_security_audit_archive_evento on public.security_audit_log_archive(evento);

alter table public.security_audit_log_archive enable row level security;

drop policy if exists security_audit_archive_read_authenticated on public.security_audit_log_archive;
create policy security_audit_archive_read_authenticated
on public.security_audit_log_archive
for select
to authenticated
using (true);

create or replace function public.archive_security_audit_log(
  p_keep_days integer default 180,
  p_batch integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer := 0;
begin
  with old_rows as (
    select *
    from public.security_audit_log
    where created_at < now() - make_interval(days => greatest(1, coalesce(p_keep_days, 180)))
    order by created_at
    limit greatest(1, least(coalesce(p_batch, 5000), 50000))
  ),
  ins as (
    insert into public.security_audit_log_archive (
      id, created_at, actor_uid, actor_usuario_id, evento, entidad, entidad_id, detalle, ip, user_agent
    )
    select id, created_at, actor_uid, actor_usuario_id, evento, entidad, entidad_id, detalle, ip, user_agent
    from old_rows
    on conflict (id) do nothing
    returning id
  )
  delete from public.security_audit_log s
  using ins
  where s.id = ins.id;

  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

create or replace function public.purge_security_audit_archive(
  p_keep_days integer default 3650
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.security_audit_log_archive
  where created_at < now() - make_interval(days => greatest(30, coalesce(p_keep_days, 3650)));

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.archive_security_audit_log(integer, integer) to authenticated;
grant execute on function public.purge_security_audit_archive(integer) to authenticated;
grant execute on function public.archive_security_audit_log(integer, integer) to service_role;
grant execute on function public.purge_security_audit_archive(integer) to service_role;

commit;

-- EJECUCION OPERATIVA RECOMENDADA:
-- 1) Insertar destinatarios:
--    insert into public.security_alert_recipients(email) values ('seguridad@tuempresa.com');
--
-- 2) Worker (edge function o backend) cada 1-5 minutos:
--    - select * from public.claim_security_alerts(20);
--    - enviar correos
--    - select public.complete_security_alert(id, true/false, 'error opcional');
--
-- 3) Retencion diaria (scheduler):
--    - select public.archive_security_audit_log(180, 5000);
--    - select public.purge_security_audit_archive(3650);
