-- Autocompleta montos multimoneda en asiento_lineas.
-- Objetivo: mantener CRC y USD en cada linea cuando exista TC disponible.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.trg_asiento_lineas_autofill_multimoneda()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_moneda text;
  v_tc numeric;
begin
  select
    upper(coalesce(a.moneda, 'CRC')),
    coalesce(nullif(a.tipo_cambio, 0), h.venta, h.compra)
  into v_moneda, v_tc
  from public.asientos a
  left join lateral (
    select t.compra, t.venta
    from public.tipo_cambio_historial t
    where t.empresa_id = a.empresa_id
      and t.fecha = a.fecha
    limit 1
  ) h on true
  where a.id = new.asiento_id
  limit 1;

  new.debito_crc := coalesce(new.debito_crc, 0);
  new.credito_crc := coalesce(new.credito_crc, 0);
  new.debito_usd := coalesce(new.debito_usd, 0);
  new.credito_usd := coalesce(new.credito_usd, 0);

  -- Evita que una misma moneda quede con debito y credito en la misma linea.
  if new.debito_crc > 0 then new.credito_crc := 0; end if;
  if new.credito_crc > 0 then new.debito_crc := 0; end if;
  if new.debito_usd > 0 then new.credito_usd := 0; end if;
  if new.credito_usd > 0 then new.debito_usd := 0; end if;

  -- Si no hay TC utilizable, no intenta conversion.
  if coalesce(v_tc, 0) <= 0 then
    return new;
  end if;

  if v_moneda = 'CRC' then
    if new.debito_crc > 0 and new.debito_usd = 0 then
      new.debito_usd := round(new.debito_crc / v_tc, 2);
    end if;
    if new.credito_crc > 0 and new.credito_usd = 0 then
      new.credito_usd := round(new.credito_crc / v_tc, 2);
    end if;
  elsif v_moneda = 'USD' then
    if new.debito_usd > 0 and new.debito_crc = 0 then
      new.debito_crc := round(new.debito_usd * v_tc, 2);
    end if;
    if new.credito_usd > 0 and new.credito_crc = 0 then
      new.credito_crc := round(new.credito_usd * v_tc, 2);
    end if;
  else
    -- AMBAS: completa solo el lado faltante en cada monto.
    if new.debito_crc > 0 and new.debito_usd = 0 then
      new.debito_usd := round(new.debito_crc / v_tc, 2);
    elsif new.debito_usd > 0 and new.debito_crc = 0 then
      new.debito_crc := round(new.debito_usd * v_tc, 2);
    end if;

    if new.credito_crc > 0 and new.credito_usd = 0 then
      new.credito_usd := round(new.credito_crc / v_tc, 2);
    elsif new.credito_usd > 0 and new.credito_crc = 0 then
      new.credito_crc := round(new.credito_usd * v_tc, 2);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asiento_lineas_autofill_multimoneda on public.asiento_lineas;
create trigger trg_asiento_lineas_autofill_multimoneda
before insert or update of asiento_id, debito_crc, credito_crc, debito_usd, credito_usd
on public.asiento_lineas
for each row
execute function public.trg_asiento_lineas_autofill_multimoneda();

-- Backfill de datos existentes: completa USD desde CRC.
update public.asiento_lineas l
set debito_usd = round(l.debito_crc / x.tc, 2)
from (
  select
    a.id as asiento_id,
    coalesce(nullif(a.tipo_cambio, 0), h.venta, h.compra) as tc
  from public.asientos a
  left join lateral (
    select t.compra, t.venta
    from public.tipo_cambio_historial t
    where t.empresa_id = a.empresa_id
      and t.fecha = a.fecha
    limit 1
  ) h on true
) x
where l.asiento_id = x.asiento_id
  and coalesce(l.debito_crc, 0) > 0
  and coalesce(l.debito_usd, 0) = 0
  and coalesce(x.tc, 0) > 0;

update public.asiento_lineas l
set credito_usd = round(l.credito_crc / x.tc, 2)
from (
  select
    a.id as asiento_id,
    coalesce(nullif(a.tipo_cambio, 0), h.venta, h.compra) as tc
  from public.asientos a
  left join lateral (
    select t.compra, t.venta
    from public.tipo_cambio_historial t
    where t.empresa_id = a.empresa_id
      and t.fecha = a.fecha
    limit 1
  ) h on true
) x
where l.asiento_id = x.asiento_id
  and coalesce(l.credito_crc, 0) > 0
  and coalesce(l.credito_usd, 0) = 0
  and coalesce(x.tc, 0) > 0;

-- Backfill de datos existentes: completa CRC desde USD.
update public.asiento_lineas l
set debito_crc = round(l.debito_usd * x.tc, 2)
from (
  select
    a.id as asiento_id,
    coalesce(nullif(a.tipo_cambio, 0), h.venta, h.compra) as tc
  from public.asientos a
  left join lateral (
    select t.compra, t.venta
    from public.tipo_cambio_historial t
    where t.empresa_id = a.empresa_id
      and t.fecha = a.fecha
    limit 1
  ) h on true
) x
where l.asiento_id = x.asiento_id
  and coalesce(l.debito_usd, 0) > 0
  and coalesce(l.debito_crc, 0) = 0
  and coalesce(x.tc, 0) > 0;

update public.asiento_lineas l
set credito_crc = round(l.credito_usd * x.tc, 2)
from (
  select
    a.id as asiento_id,
    coalesce(nullif(a.tipo_cambio, 0), h.venta, h.compra) as tc
  from public.asientos a
  left join lateral (
    select t.compra, t.venta
    from public.tipo_cambio_historial t
    where t.empresa_id = a.empresa_id
      and t.fecha = a.fecha
    limit 1
  ) h on true
) x
where l.asiento_id = x.asiento_id
  and coalesce(l.credito_usd, 0) > 0
  and coalesce(l.credito_crc, 0) = 0
  and coalesce(x.tc, 0) > 0;

commit;
