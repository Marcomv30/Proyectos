-- Cierre de caja consolidado para recaudacion

begin;

create or replace view public.vw_recaudacion_cierre_caja as
select
  p.empresa_id,
  p.fecha_pago,
  p.moneda,
  p.created_by as cajero_auth_user_id,
  coalesce(u.nombre, p.created_by::text, 'N/D') as cajero_nombre,
  coalesce(u.username, 'N/D') as cajero_username,
  p.medio_pago,
  count(*)::int as pagos,
  sum(p.monto_total)::numeric(18,2) as total_recaudado,
  sum(coalesce(p.monto_ajuste, 0))::numeric(18,2) as total_ajuste,
  sum(coalesce(p.monto_aplicado, 0))::numeric(18,2) as total_aplicado,
  sum(coalesce(p.monto_no_aplicado, 0))::numeric(18,2) as total_no_aplicado
from public.recaudacion_pagos p
left join public.usuarios u
  on u.auth_user_id = p.created_by
where p.estado in ('confirmado', 'contabilizado', 'conciliado')
group by
  p.empresa_id,
  p.fecha_pago,
  p.moneda,
  p.created_by,
  coalesce(u.nombre, p.created_by::text, 'N/D'),
  coalesce(u.username, 'N/D'),
  p.medio_pago;

grant select on public.vw_recaudacion_cierre_caja to authenticated, service_role;

commit;
