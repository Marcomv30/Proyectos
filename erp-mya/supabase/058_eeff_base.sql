-- Base de Estados Financieros (EEFF) - Fase 1
-- Wrappers para BS/ER y estructura inicial para Flujo de Efectivo.
-- Ejecutar en SQL Editor con rol postgres.

begin;

drop function if exists public.get_eeff_balance_situacion(bigint, date, text);
create or replace function public.get_eeff_balance_situacion(
  p_empresa_id bigint,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
)
returns table (
  cuenta text,
  nombre text,
  tipo text,
  nivel integer,
  saldo numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.get_balance_situacion(p_empresa_id, p_fecha_hasta, p_moneda);
$$;

grant execute on function public.get_eeff_balance_situacion(bigint, date, text) to authenticated;
grant execute on function public.get_eeff_balance_situacion(bigint, date, text) to service_role;

drop function if exists public.get_eeff_estado_resultados(bigint, date, date, text);
create or replace function public.get_eeff_estado_resultados(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
)
returns table (
  cuenta text,
  nombre text,
  tipo text,
  nivel integer,
  debe numeric,
  haber numeric,
  neto numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.get_estado_resultados(p_empresa_id, p_fecha_desde, p_fecha_hasta, p_moneda);
$$;

grant execute on function public.get_eeff_estado_resultados(bigint, date, date, text) to authenticated;
grant execute on function public.get_eeff_estado_resultados(bigint, date, date, text) to service_role;

drop function if exists public.get_eeff_flujo_efectivo_base(bigint, date, date, text);
create or replace function public.get_eeff_flujo_efectivo_base(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_moneda text default 'CRC'
)
returns table (
  categoria text,
  concepto text,
  monto numeric,
  orden integer
)
language sql
stable
security definer
set search_path = public
as $$
  with er as (
    select coalesce(
      sum(
        case
          when x.tipo = 'INGRESO' then x.neto
          when x.tipo in ('COSTO', 'GASTO') then -x.neto
          else 0
        end
      ),
      0
    )::numeric as utilidad_neta
    from public.get_estado_resultados(p_empresa_id, p_fecha_desde, p_fecha_hasta, p_moneda) x
  )
  select
    'OPERATIVO'::text as categoria,
    'Utilidad neta del periodo (base EEFF)'::text as concepto,
    er.utilidad_neta::numeric as monto,
    10::integer as orden
  from er;
$$;

grant execute on function public.get_eeff_flujo_efectivo_base(bigint, date, date, text) to authenticated;
grant execute on function public.get_eeff_flujo_efectivo_base(bigint, date, date, text) to service_role;

commit;
