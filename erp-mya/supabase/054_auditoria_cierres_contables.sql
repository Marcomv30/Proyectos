-- Auditoria de cierres contables (aplicados/revertidos).
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.get_auditoria_cierres_contables(bigint, timestamptz, timestamptz);

create or replace function public.get_auditoria_cierres_contables(
  p_empresa_id bigint,
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns table (
  fecha_hora timestamptz,
  accion text,
  usuario text,
  asiento_id bigint,
  fecha_desde date,
  fecha_hasta date,
  moneda text,
  motivo text,
  actor_uid uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     and current_user not in ('postgres', 'service_role')
  then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not public.has_empresa_access(p_empresa_id)
  then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  -- Solo superusuario puede consultar auditoria de cierres.
  if current_user not in ('postgres', 'service_role')
     and not public.is_superuser(auth.uid())
  then
    raise exception 'Solo superusuario puede ver auditoria de cierres';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not (
       public.has_permission(p_empresa_id, 'contabilidad', 'ver')
       or public.has_permission(p_empresa_id, 'contabilidad', 'editar')
       or public.has_permission(p_empresa_id, 'contabilidad', 'aprobar')
     )
  then
    raise exception 'No tiene permisos para ver auditoria de cierres';
  end if;

  return query
  select
    s.created_at as fecha_hora,
    case
      when s.evento = 'cierre_contable_aplicado' then 'APLICADO'
      when s.evento = 'cierre_contable_revertido' then 'REVERTIDO'
      else upper(coalesce(s.evento, ''))
    end::text as accion,
    coalesce(
      nullif(btrim(u.nombre), ''),
      nullif(btrim(u.username), ''),
      s.actor_uid::text,
      'SISTEMA'
    )::text as usuario,
    nullif(coalesce(s.detalle->>'asiento_id', ''), '')::bigint as asiento_id,
    coalesce(
      nullif(coalesce(s.detalle->>'fecha_desde', ''), '')::date,
      nullif(coalesce(s.detalle->>'cierre_anterior_fecha_inicio', ''), '')::date,
      nullif(coalesce(s.detalle->>'cierre_resultante_fecha_inicio', ''), '')::date
    ) as fecha_desde,
    coalesce(
      nullif(coalesce(s.detalle->>'fecha_hasta', ''), '')::date,
      nullif(coalesce(s.detalle->>'cierre_anterior_fecha_fin', ''), '')::date,
      nullif(coalesce(s.detalle->>'cierre_resultante_fecha_fin', ''), '')::date
    ) as fecha_hasta,
    coalesce(s.detalle->>'moneda', '')::text as moneda,
    coalesce(nullif(btrim(s.detalle->>'motivo'), ''), '')::text as motivo,
    s.actor_uid
  from public.security_audit_log s
  left join public.usuarios u
    on (
      (s.actor_usuario_id is not null and u.id = s.actor_usuario_id)
      or (s.actor_usuario_id is null and s.actor_uid is not null and u.auth_user_id = s.actor_uid)
    )
  where s.entidad = 'empresa_parametros'
    and s.evento in ('cierre_contable_aplicado', 'cierre_contable_revertido')
    and coalesce((s.detalle->>'empresa_id')::bigint, 0) = p_empresa_id
    and (p_desde is null or s.created_at >= p_desde)
    and (p_hasta is null or s.created_at <= p_hasta)
  order by s.created_at desc, s.id desc;
end;
$$;

grant execute on function public.get_auditoria_cierres_contables(bigint, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_auditoria_cierres_contables(bigint, timestamptz, timestamptz) to service_role;

commit;
