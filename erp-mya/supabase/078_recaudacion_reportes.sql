-- Reportes de Cobro y Recaudacion

begin;

create or replace view public.vw_recaudacion_auxiliar_banco as
select
  a.id,
  a.empresa_id,
  a.pago_id,
  p.tercero_id,
  t.razon_social as tercero_nombre,
  t.identificacion as tercero_identificacion,
  a.fecha_movimiento,
  a.moneda,
  a.monto,
  a.referencia,
  a.estado_conciliacion,
  a.conciliado_en,
  p.estado as estado_pago,
  p.asiento_id
from public.recaudacion_auxiliar_banco a
join public.recaudacion_pagos p on p.id = a.pago_id
join public.terceros t on t.id = p.tercero_id;

grant select on public.vw_recaudacion_auxiliar_banco to authenticated, service_role;

commit;
