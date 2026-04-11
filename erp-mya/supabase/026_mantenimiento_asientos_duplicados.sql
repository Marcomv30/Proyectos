-- Mantenimiento de asientos duplicados por numero_formato confirmado.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.get_asientos_confirmados_duplicados(
  p_empresa_id bigint
)
returns table (
  numero_formato text,
  cantidad bigint,
  ids bigint[],
  keep_sugerido_id bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      a.id,
      a.empresa_id,
      btrim(a.numero_formato) as numero_formato
    from public.asientos a
    where a.empresa_id = p_empresa_id
      and a.estado = 'CONFIRMADO'
      and nullif(btrim(a.numero_formato), '') is not null
  )
  select
    min(b.numero_formato) as numero_formato,
    count(*) as cantidad,
    array_agg(b.id order by b.id) as ids,
    min(b.id) as keep_sugerido_id
  from base b
  group by lower(b.numero_formato)
  having count(*) > 1
  order by min(b.numero_formato);
$$;

grant execute on function public.get_asientos_confirmados_duplicados(bigint) to authenticated;
grant execute on function public.get_asientos_confirmados_duplicados(bigint) to service_role;

create or replace function public.resolver_asientos_duplicados_numero(
  p_empresa_id bigint,
  p_numero_formato text,
  p_keep_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_numero text := btrim(coalesce(p_numero_formato, ''));
  v_keep bigint;
  v_total integer := 0;
  v_anulados integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if v_numero = '' then
    raise exception 'Numero de asiento requerido';
  end if;

  if not public.has_empresa_access(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if not public.has_permission(p_empresa_id, 'mantenimientos', 'editar') then
    raise exception 'No tiene permisos para resolver duplicados';
  end if;

  select count(*), min(a.id)
    into v_total, v_keep
  from public.asientos a
  where a.empresa_id = p_empresa_id
    and a.estado = 'CONFIRMADO'
    and lower(btrim(a.numero_formato)) = lower(v_numero);

  if v_total <= 1 then
    return jsonb_build_object(
      'ok', true,
      'mensaje', 'No hay duplicados para resolver',
      'total_confirmados', v_total,
      'keep_id', v_keep,
      'anulados', 0
    );
  end if;

  if p_keep_id is not null then
    if exists (
      select 1
      from public.asientos a
      where a.id = p_keep_id
        and a.empresa_id = p_empresa_id
        and a.estado = 'CONFIRMADO'
        and lower(btrim(a.numero_formato)) = lower(v_numero)
    ) then
      v_keep := p_keep_id;
    else
      raise exception 'El asiento a conservar no pertenece al grupo duplicado';
    end if;
  end if;

  for r in
    select a.id
    from public.asientos a
    where a.empresa_id = p_empresa_id
      and a.estado = 'CONFIRMADO'
      and lower(btrim(a.numero_formato)) = lower(v_numero)
      and a.id <> v_keep
    order by a.id
  loop
    perform public.revertir_saldos_asiento(r.id);
    update public.asientos
      set estado = 'ANULADO'
    where id = r.id
      and estado = 'CONFIRMADO';
    v_anulados := v_anulados + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mensaje', 'Duplicados resueltos',
    'numero_formato', v_numero,
    'keep_id', v_keep,
    'anulados', v_anulados
  );
end;
$$;

grant execute on function public.resolver_asientos_duplicados_numero(bigint, text, bigint) to authenticated;
grant execute on function public.resolver_asientos_duplicados_numero(bigint, text, bigint) to service_role;

commit;

