begin;

create or replace function public.siguiente_tercero_codigo(p_empresa_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  if p_empresa_id is null then
    raise exception 'p_empresa_id es requerido';
  end if;

  perform pg_advisory_xact_lock(922337, p_empresa_id::integer);

  select coalesce(max(nullif(regexp_replace(coalesce(codigo, ''), '[^0-9]', '', 'g'), '')::bigint), 0) + 1
    into v_next
  from public.terceros
  where empresa_id = p_empresa_id;

  return lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.trg_terceros_codigo_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.codigo is null or btrim(new.codigo) = '' then
    new.codigo := public.siguiente_tercero_codigo(new.empresa_id);
  else
    new.codigo := lpad(regexp_replace(new.codigo, '[^0-9]', '', 'g'), 6, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_terceros_codigo_auto_bi on public.terceros;

create trigger trg_terceros_codigo_auto_bi
before insert on public.terceros
for each row
execute function public.trg_terceros_codigo_auto();

grant execute on function public.siguiente_tercero_codigo(bigint) to authenticated;
grant execute on function public.siguiente_tercero_codigo(bigint) to service_role;

commit;
