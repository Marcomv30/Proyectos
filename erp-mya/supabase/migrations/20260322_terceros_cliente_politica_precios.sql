begin;

alter table public.tercero_cliente_parametros
  add column if not exists escala_precio smallint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tercero_cliente_parametros_escala_precio_check'
  ) then
    alter table public.tercero_cliente_parametros
      add constraint tercero_cliente_parametros_escala_precio_check
      check (escala_precio between 1 and 4);
  end if;
end$$;

drop view if exists public.vw_tercero_cliente_parametros;

create view public.vw_tercero_cliente_parametros as
select
  p.tercero_id,
  p.limite_credito,
  p.dias_credito,
  p.moneda_credito,
  p.condicion_pago,
  p.clase_cliente,
  p.ubicacion,
  p.aplica_descuentos,
  p.descuento_maximo_pct,
  p.escala_precio,
  p.exonerado,
  p.exoneracion,
  p.vendedor,
  p.observaciones,
  p.updated_at,
  p.updated_by
from public.tercero_cliente_parametros p;

grant select, insert, update, delete on public.vw_tercero_cliente_parametros to authenticated;
grant select on public.vw_tercero_cliente_parametros to service_role;

commit;
