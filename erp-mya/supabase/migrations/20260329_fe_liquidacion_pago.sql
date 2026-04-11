alter table public.fe_documentos
  add column if not exists liquidacion_pago_json jsonb not null default '[]'::jsonb;

alter table public.fe_documentos
  add column if not exists turno_id bigint null references public.caja_turnos(id) on delete set null;

comment on column public.fe_documentos.liquidacion_pago_json is
  'Detalle de liquidacion de medios de pago del comprobante FE: tipo_medio_pago, subtipo, monto, referencia y detalle operativo para cierre de caja y asiento contable.';

create or replace view public.vw_fe_documento_pagos as
select
  d.empresa_id,
  d.id as documento_id,
  d.origen,
  d.estado,
  d.turno_id,
  d.fecha_emision,
  d.numero_consecutivo,
  d.tipo_documento,
  d.asiento_id,
  d.moneda,
  d.receptor_nombre,
  d.receptor_identificacion,
  coalesce((p.item ->> 'linea')::int, 0) as linea,
  nullif(p.item ->> 'tipo_medio_pago', '') as tipo_medio_pago,
  nullif(p.item ->> 'subtipo', '') as subtipo,
  case
    when p.item ->> 'tipo_medio_pago' = '01' then 'EFECTIVO'
    when p.item ->> 'tipo_medio_pago' = '02' then 'TARJETA'
    when p.item ->> 'tipo_medio_pago' = '03' and lower(coalesce(p.item ->> 'subtipo', '')) like 'sinpe%' then 'SINPE'
    when p.item ->> 'tipo_medio_pago' = '03' and lower(coalesce(p.item ->> 'subtipo', '')) = 'deposito' then 'DEPOSITO'
    when p.item ->> 'tipo_medio_pago' = '03' then 'TRANSFERENCIA'
    when p.item ->> 'tipo_medio_pago' = '04' then 'RECAUDADO TERCEROS'
    when p.item ->> 'tipo_medio_pago' = '05' then 'COLECTURIA'
    when p.item ->> 'tipo_medio_pago' = '06' then 'DOCUMENTO FISCAL'
    when p.item ->> 'tipo_medio_pago' = '07' then 'OTROS'
    when p.item ->> 'tipo_medio_pago' = '99' then 'NO APLICA'
    else 'N/D'
  end as medio_caja,
  coalesce((p.item ->> 'monto')::numeric, 0) as monto,
  nullif(p.item ->> 'referencia', '') as referencia,
  nullif(p.item ->> 'detalle', '') as detalle
from public.fe_documentos d
cross join lateral jsonb_array_elements(coalesce(d.liquidacion_pago_json, '[]'::jsonb)) as p(item);

grant select on public.vw_fe_documento_pagos to authenticated, service_role;

create or replace view public.vw_caja_turno_medios_fe as
select
  p.documento_id as id,
  p.turno_id,
  p.empresa_id,
  t.fecha_hora_apertura::date as fecha_pago,
  p.fecha_emision,
  p.numero_consecutivo,
  p.tipo_documento,
  p.asiento_id,
  p.moneda,
  p.medio_caja as medio_pago,
  count(*) as pagos,
  sum(p.monto)::numeric(18,2) as total_recaudado,
  0::numeric(18,2) as total_ajuste,
  sum(p.monto)::numeric(18,2) as total_aplicado,
  0::numeric(18,2) as total_no_aplicado,
  t.cajero_auth_user_id,
  coalesce(u.nombre, 'N/D') as cajero_nombre,
  coalesce(u.username, 'N/D') as cajero_username
from public.vw_fe_documento_pagos p
join public.caja_turnos t on t.id = p.turno_id
left join public.usuarios u on u.auth_user_id = t.cajero_auth_user_id
where p.turno_id is not null
  and p.estado <> 'borrador'
group by
  p.documento_id, p.turno_id, p.empresa_id, t.fecha_hora_apertura, p.fecha_emision,
  p.numero_consecutivo, p.tipo_documento, p.asiento_id, p.moneda, p.medio_caja,
  t.cajero_auth_user_id, u.nombre, u.username;

grant select on public.vw_caja_turno_medios_fe to authenticated, service_role;
