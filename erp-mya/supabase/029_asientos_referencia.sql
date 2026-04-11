-- Agrega referencia de usuario en asiento_lineas.
-- Si queda en blanco, UI lo llena con numero_formato del asiento.
-- Ejecutar en SQL Editor con rol postgres.

begin;

alter table public.asiento_lineas
  add column if not exists referencia text null;

-- Backfill inicial para registros existentes sin referencia.
update public.asiento_lineas l
set referencia = a.numero_formato
from public.asientos a
where a.id = l.asiento_id
  and nullif(btrim(coalesce(l.referencia, '')), '') is null
  and nullif(btrim(coalesce(a.numero_formato, '')), '') is not null;

commit;
