-- Blindaje fiscal: en asientos CONFIRMADO con moneda USD/AMBAS
-- el tipo_cambio debe ser exactamente el TC de VENTA del dia.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.trg_asientos_validar_tc_venta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moneda text := upper(coalesce(new.moneda, 'CRC'));
  v_tc_venta numeric;
  v_tc_asiento numeric := coalesce(new.tipo_cambio, 0);
begin
  -- Solo aplica a asientos confirmados en moneda USD/AMBAS.
  if coalesce(new.estado, 'BORRADOR') <> 'CONFIRMADO' then
    return new;
  end if;

  if v_moneda not in ('USD', 'AMBAS') then
    return new;
  end if;

  if new.empresa_id is null or new.fecha is null then
    raise exception 'Empresa y fecha son requeridas para validar tipo de cambio';
  end if;

  select t.venta
    into v_tc_venta
  from public.tipo_cambio_historial t
  where t.empresa_id = new.empresa_id
    and t.fecha = new.fecha
  limit 1;

  if coalesce(v_tc_venta, 0) <= 0 then
    raise exception 'No existe tipo de cambio de venta para la fecha %', new.fecha;
  end if;

  if abs(v_tc_asiento - v_tc_venta) > 0.0001 then
    raise exception
      'TC invalido para fecha %: asiento=% venta_dia=% (norma: usar TC de venta)',
      new.fecha, v_tc_asiento, v_tc_venta;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asientos_validar_tc_venta on public.asientos;
create trigger trg_asientos_validar_tc_venta
before insert or update of empresa_id, fecha, estado, moneda, tipo_cambio
on public.asientos
for each row
execute function public.trg_asientos_validar_tc_venta();

commit;

