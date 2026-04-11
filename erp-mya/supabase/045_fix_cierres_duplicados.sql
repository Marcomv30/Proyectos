-- Saneamiento de cierres duplicados (numero_formato CER-*).
-- Estrategia: mantener 1 CONFIRMADO por numero_formato y anular el resto.
-- No elimina asientos ni lineas (preserva historial).
-- Ejecutar en SQL Editor con rol postgres.

begin;

do $$
declare
  v_empresa_id bigint := null; -- null = todas las empresas, o fijar un id especifico
  v_anulados integer := 0;
begin
  with candidatos as (
    select
      a.id,
      a.empresa_id,
      lower(btrim(coalesce(a.numero_formato, ''))) as numero_norm,
      row_number() over (
        partition by a.empresa_id, lower(btrim(coalesce(a.numero_formato, '')))
        order by a.id asc
      ) as rn
    from public.asientos a
    where a.estado = 'CONFIRMADO'
      and nullif(btrim(coalesce(a.numero_formato, '')), '') is not null
      and upper(btrim(coalesce(a.numero_formato, ''))) like 'CER-%'
      and (v_empresa_id is null or a.empresa_id = v_empresa_id)
  ),
  duplicados as (
    select c.*
    from candidatos c
    where c.rn > 1
  )
  update public.asientos a
  set
    estado = 'ANULADO',
    descripcion = left(
      coalesce(a.descripcion, '') || ' [AUTO-ANULADO DUP CIERRE ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']',
      500
    )
  from duplicados d
  where a.id = d.id
    and a.estado = 'CONFIRMADO';

  get diagnostics v_anulados = row_count;
  raise notice 'Cierres duplicados anulados: %', v_anulados;
end
$$;

commit;
