-- Blindaje de numeracion: evita duplicados de numero_formato en asientos confirmados.
-- Ejecutar en SQL Editor con rol postgres.

begin;

-- Validacion previa: si existen duplicados confirmados, se aborta con detalle.
do $$
declare
  v_dup record;
begin
  select
    a.empresa_id,
    lower(btrim(a.numero_formato)) as numero_formato_norm,
    count(*) as cantidad
  into v_dup
  from public.asientos a
  where a.estado = 'CONFIRMADO'
    and nullif(btrim(a.numero_formato), '') is not null
  group by a.empresa_id, lower(btrim(a.numero_formato))
  having count(*) > 1
  limit 1;

  if v_dup is not null then
    raise exception
      'Existen asientos confirmados duplicados para empresa_id=% numero_formato=% (cantidad=%). Limpie esos registros antes de crear el indice unico.',
      v_dup.empresa_id, v_dup.numero_formato_norm, v_dup.cantidad;
  end if;
end
$$;

create unique index if not exists ux_asientos_empresa_numero_confirmado
  on public.asientos (empresa_id, lower(btrim(numero_formato)))
  where estado = 'CONFIRMADO'
    and nullif(btrim(numero_formato), '') is not null;

commit;

