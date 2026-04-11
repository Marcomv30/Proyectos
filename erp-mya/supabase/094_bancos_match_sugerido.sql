begin;

create or replace function public.get_bancos_match_sugerido(
  p_empresa_id bigint,
  p_periodo_id bigint,
  p_cuenta_banco_id bigint
)
returns table (
  estado_linea_id bigint,
  auxiliar_id bigint,
  banco_fecha date,
  banco_descripcion text,
  banco_referencia text,
  banco_monto numeric,
  erp_fecha date,
  pago_id bigint,
  tercero_nombre text,
  erp_referencia text,
  erp_monto numeric,
  diferencia_monto numeric,
  diferencia_dias integer,
  score integer
)
language sql
security definer
set search_path = public
as $$
  with banco as (
    select
      e.id,
      e.fecha_movimiento,
      e.descripcion,
      e.referencia,
      round(greatest(coalesce(e.debito, 0), coalesce(e.credito, 0)), 2) as monto
    from public.bancos_estado_importado e
    where e.empresa_id = p_empresa_id
      and e.periodo_id = p_periodo_id
      and e.cuenta_banco_id = p_cuenta_banco_id
      and coalesce(e.conciliado, false) = false
  ),
  erp as (
    select
      a.id,
      a.fecha_movimiento,
      a.monto,
      a.referencia,
      a.pago_id,
      t.razon_social as tercero_nombre
    from public.recaudacion_auxiliar_banco a
    join public.recaudacion_pagos p on p.id = a.pago_id
    join public.terceros t on t.id = p.tercero_id
    where a.empresa_id = p_empresa_id
      and p.cuenta_banco_id = p_cuenta_banco_id
      and a.estado_conciliacion = 'pendiente'
  ),
  candidatos as (
    select
      b.id as estado_linea_id,
      e.id as auxiliar_id,
      b.fecha_movimiento as banco_fecha,
      b.descripcion as banco_descripcion,
      b.referencia as banco_referencia,
      b.monto as banco_monto,
      e.fecha_movimiento as erp_fecha,
      e.pago_id,
      e.tercero_nombre,
      e.referencia as erp_referencia,
      e.monto as erp_monto,
      round(abs(b.monto - e.monto), 2) as diferencia_monto,
      abs(b.fecha_movimiento - e.fecha_movimiento) as diferencia_dias,
      (
        case when round(abs(b.monto - e.monto), 2) = 0 then 70
             when round(abs(b.monto - e.monto), 2) <= 1 then 45
             else 0 end
      ) +
      (
        case when abs(b.fecha_movimiento - e.fecha_movimiento) = 0 then 20
             when abs(b.fecha_movimiento - e.fecha_movimiento) <= 3 then 12
             when abs(b.fecha_movimiento - e.fecha_movimiento) <= 7 then 6
             else 0 end
      ) +
      (
        case
          when coalesce(nullif(btrim(coalesce(b.referencia, '')), ''), '#') <> '#'
           and coalesce(nullif(btrim(coalesce(e.referencia, '')), ''), '#') <> '#'
           and upper(coalesce(b.referencia, '')) = upper(coalesce(e.referencia, '')) then 10
          when coalesce(nullif(btrim(coalesce(b.referencia, '')), ''), '#') <> '#'
           and coalesce(nullif(btrim(coalesce(e.referencia, '')), ''), '#') <> '#'
           and (
             upper(coalesce(b.referencia, '')) like '%' || upper(coalesce(e.referencia, '')) || '%'
             or upper(coalesce(e.referencia, '')) like '%' || upper(coalesce(b.referencia, '')) || '%'
           ) then 5
          else 0
        end
      ) as score,
      row_number() over (
        partition by b.id
        order by
          (
            case when round(abs(b.monto - e.monto), 2) = 0 then 70
                 when round(abs(b.monto - e.monto), 2) <= 1 then 45
                 else 0 end
          ) +
          (
            case when abs(b.fecha_movimiento - e.fecha_movimiento) = 0 then 20
                 when abs(b.fecha_movimiento - e.fecha_movimiento) <= 3 then 12
                 when abs(b.fecha_movimiento - e.fecha_movimiento) <= 7 then 6
                 else 0 end
          ) desc,
          round(abs(b.monto - e.monto), 2) asc,
          abs(b.fecha_movimiento - e.fecha_movimiento) asc,
          e.id asc
      ) as rn
    from banco b
    join erp e
      on round(abs(b.monto - e.monto), 2) <= 1
     and abs(b.fecha_movimiento - e.fecha_movimiento) <= 7
  )
  select
    estado_linea_id,
    auxiliar_id,
    banco_fecha,
    banco_descripcion,
    banco_referencia,
    banco_monto,
    erp_fecha,
    pago_id,
    tercero_nombre,
    erp_referencia,
    erp_monto,
    diferencia_monto,
    diferencia_dias,
    score
  from candidatos
  where rn = 1
    and score >= 57
  order by score desc, banco_fecha desc, estado_linea_id desc;
$$;

grant execute on function public.get_bancos_match_sugerido(bigint, bigint, bigint) to authenticated, service_role;

commit;
