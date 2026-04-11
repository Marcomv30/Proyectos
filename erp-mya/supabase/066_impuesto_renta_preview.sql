-- Simulador de impuesto sobre la renta (solo prueba, no persiste datos).
-- Permite probar escenarios por utilidad/tipo/regimen y ver resultado en tabla.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.simular_impuesto_renta_detalle(
  p_empresa_id bigint,
  p_anio integer,
  p_tipo_contribuyente text,
  p_regimen_codigo text,
  p_ingreso_bruto_anual numeric default null,
  p_utilidad_gravable numeric default 0,
  p_juridica_tope_logica text default 'TASA_PLANA',
  p_tasa_plana numeric default 30
)
returns table (
  empresa_id bigint,
  anio integer,
  tipo_contribuyente text,
  regimen_codigo text,
  utilidad_gravable numeric,
  ingreso_bruto_anual numeric,
  tope_ingreso_bruto numeric,
  metodo text,
  tasa_aplicada numeric,
  impuesto_calculado numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa_id bigint := p_empresa_id;
  v_anio integer := coalesce(p_anio, extract(year from current_date)::integer);
  v_tipo text := lower(coalesce(nullif(p_tipo_contribuyente, ''), 'persona_juridica'));
  v_regimen text := upper(coalesce(nullif(p_regimen_codigo, ''), ''));
  v_ingreso numeric := p_ingreso_bruto_anual;
  v_utilidad numeric := coalesce(p_utilidad_gravable, 0);
  v_tope numeric := null;
  v_tasa_plana numeric := coalesce(p_tasa_plana, 30);
  v_logica_tope text := upper(coalesce(nullif(p_juridica_tope_logica, ''), 'TASA_PLANA'));
  v_prev_limite numeric := 0;
  v_base_tramo numeric := 0;
  v_total numeric := 0;
  v_hay_tramos boolean := false;
  v_tiene_tramo_abierto boolean := false;
  v_tasa_ultimo_tramo numeric := null;
  v_tasa_aplicada numeric := 0;
  v_metodo text := 'TRAMOS';
  r record;
begin
  if v_regimen = '' then
    if v_tipo = 'persona_fisica' then
      v_regimen := 'PERSONA_FISICA_LUCRATIVA';
    else
      v_regimen := 'PERSONA_JURIDICA_PYME';
    end if;
  end if;

  if v_tipo = 'persona_fisica' then
    v_tasa_plana := 0;
  end if;

  if v_utilidad <= 0 then
    return query
    select
      v_empresa_id,
      v_anio,
      v_tipo,
      v_regimen,
      v_utilidad,
      v_ingreso,
      null::numeric,
      'SIN_UTILIDAD'::text,
      0::numeric,
      0::numeric;
    return;
  end if;

  -- Tope (solo relevante para juridica).
  if v_empresa_id is not null then
    select min(t.tope_ingreso_bruto)
      into v_tope
    from public.empresa_impuesto_renta_tramo t
    where t.empresa_id = v_empresa_id
      and t.anio = v_anio
      and t.regimen_codigo = v_regimen
      and t.activo = true;
  end if;

  if v_tope is null then
    select min(t.tope_ingreso_bruto)
      into v_tope
    from public.impuesto_renta_tramo_oficial t
    where t.anio = v_anio
      and t.regimen_codigo = v_regimen
      and t.activo = true;
  end if;

  -- Regla juridica: si supera tope, usa ultimo tramo o tasa plana segun configuracion.
  if v_tipo = 'persona_juridica'
     and v_tope is not null
     and v_ingreso is not null
     and v_ingreso > v_tope
  then
    with src as (
      select t.tasa
      from public.empresa_impuesto_renta_tramo t
      where v_empresa_id is not null
        and t.empresa_id = v_empresa_id
        and t.anio = v_anio
        and t.regimen_codigo = v_regimen
        and t.activo = true
      union all
      select t2.tasa
      from public.impuesto_renta_tramo_oficial t2
      where t2.anio = v_anio
        and t2.regimen_codigo = v_regimen
        and t2.activo = true
        and (
          v_empresa_id is null
          or not exists (
            select 1
            from public.empresa_impuesto_renta_tramo x
            where x.empresa_id = v_empresa_id
              and x.anio = v_anio
              and x.regimen_codigo = v_regimen
              and x.activo = true
          )
        )
    )
    select max(s.tasa) into v_tasa_ultimo_tramo
    from src s;

    v_tasa_aplicada := v_tasa_plana;
    v_metodo := 'TASA_PLANA_TOPE_INGRESO';

    return query
    select
      v_empresa_id,
      v_anio,
      v_tipo,
      v_regimen,
      v_utilidad,
      v_ingreso,
      v_tope,
      v_metodo,
      v_tasa_aplicada,
      round(v_utilidad * v_tasa_aplicada / 100.0, 2);
    return;
  end if;

  -- Tramos progresivos (empresa override o tabla oficial).
  for r in
    with src as (
      select
        t.tramo_orden,
        t.desde,
        t.hasta,
        t.tasa
      from public.empresa_impuesto_renta_tramo t
      where v_empresa_id is not null
        and t.empresa_id = v_empresa_id
        and t.anio = v_anio
        and t.regimen_codigo = v_regimen
        and t.activo = true
      union all
      select
        t2.tramo_orden,
        t2.desde,
        t2.hasta,
        t2.tasa
      from public.impuesto_renta_tramo_oficial t2
      where t2.anio = v_anio
        and t2.regimen_codigo = v_regimen
        and t2.activo = true
        and (
          v_empresa_id is null
          or not exists (
            select 1
            from public.empresa_impuesto_renta_tramo x
            where x.empresa_id = v_empresa_id
              and x.anio = v_anio
              and x.regimen_codigo = v_regimen
              and x.activo = true
          )
        )
    )
    select s.tramo_orden, s.desde, s.hasta, s.tasa
    from src s
    order by s.tramo_orden
  loop
    v_hay_tramos := true;
    v_tasa_ultimo_tramo := coalesce(r.tasa, v_tasa_ultimo_tramo);
    if r.hasta is null then
      v_tiene_tramo_abierto := true;
    end if;

    if r.tasa <= 0 then
      if r.hasta is not null then
        v_prev_limite := r.hasta;
      end if;
      continue;
    end if;

    if r.hasta is null then
      v_base_tramo := greatest(v_utilidad - greatest(v_prev_limite, r.desde), 0);
    else
      v_base_tramo := greatest(least(v_utilidad, r.hasta) - greatest(v_prev_limite, r.desde), 0);
    end if;

    v_total := v_total + (v_base_tramo * r.tasa / 100.0);

    if r.hasta is not null then
      v_prev_limite := r.hasta;
    end if;
  end loop;

  -- Compatibilidad para tablas antiguas sin tramo abierto.
  if v_hay_tramos
     and not v_tiene_tramo_abierto
     and v_tasa_ultimo_tramo is not null
     and v_tasa_ultimo_tramo > 0
     and v_utilidad > v_prev_limite
  then
    v_base_tramo := greatest(v_utilidad - v_prev_limite, 0);
    v_total := v_total + (v_base_tramo * v_tasa_ultimo_tramo / 100.0);
  end if;

  if not v_hay_tramos or v_total <= 0 then
    if v_tipo = 'persona_fisica' then
      v_metodo := 'SIN_TRAMOS_PERSONA_FISICA';
      v_tasa_aplicada := 0;
      v_total := 0;
    else
      v_metodo := 'TASA_PLANA_SIN_TRAMOS';
      v_tasa_aplicada := v_tasa_plana;
      v_total := round(v_utilidad * v_tasa_plana / 100.0, 2);
    end if;
  else
    v_metodo := 'TRAMOS_EMPRESA_O_OFICIAL';
    v_tasa_aplicada := null;
    v_total := round(v_total, 2);
  end if;

  return query
  select
    v_empresa_id,
    v_anio,
    v_tipo,
    v_regimen,
    v_utilidad,
    v_ingreso,
    v_tope,
    v_metodo,
    v_tasa_aplicada,
    v_total;
end;
$$;

create or replace function public.simular_impuesto_renta_tabla(
  p_empresa_id bigint,
  p_anio integer,
  p_tipo_contribuyente text,
  p_regimen_codigo text,
  p_ingreso_bruto_anual numeric default null,
  p_juridica_tope_logica text default 'TASA_PLANA',
  p_tasa_plana numeric default 30,
  p_utilidades numeric[] default array[0, 500000, 1000000, 2500000, 5000000, 10000000, 25000000]
)
returns table (
  utilidad_gravable numeric,
  impuesto_calculado numeric,
  tasa_efectiva_pct numeric,
  metodo text,
  tope_ingreso_bruto numeric,
  tipo_contribuyente text,
  regimen_codigo text
)
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select unnest(coalesce(p_utilidades, array[]::numeric[])) as utilidad
  )
  select
    d.utilidad_gravable,
    d.impuesto_calculado,
    case
      when d.utilidad_gravable > 0 then round((d.impuesto_calculado / d.utilidad_gravable) * 100.0, 4)
      else 0
    end as tasa_efectiva_pct,
    d.metodo,
    d.tope_ingreso_bruto,
    d.tipo_contribuyente,
    d.regimen_codigo
  from u
  cross join lateral public.simular_impuesto_renta_detalle(
    p_empresa_id,
    p_anio,
    p_tipo_contribuyente,
    p_regimen_codigo,
    p_ingreso_bruto_anual,
    u.utilidad,
    p_juridica_tope_logica,
    p_tasa_plana
  ) d
  order by d.utilidad_gravable;
$$;

create or replace function public.simular_impuesto_renta_escalonado(
  p_empresa_id bigint,
  p_anio integer,
  p_tipo_contribuyente text,
  p_regimen_codigo text,
  p_ingreso_bruto_anual numeric default null,
  p_utilidad_gravable numeric default 0,
  p_juridica_tope_logica text default 'TASA_PLANA',
  p_tasa_plana numeric default 30
)
returns table (
  tramo_orden integer,
  tramo_descripcion text,
  desde numeric,
  hasta numeric,
  monto_gravado numeric,
  impuesto_pct numeric,
  total numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa_id bigint := p_empresa_id;
  v_anio integer := coalesce(p_anio, extract(year from current_date)::integer);
  v_tipo text := lower(coalesce(nullif(p_tipo_contribuyente, ''), 'persona_juridica'));
  v_regimen text := upper(coalesce(nullif(p_regimen_codigo, ''), ''));
  v_ingreso numeric := p_ingreso_bruto_anual;
  v_utilidad numeric := coalesce(p_utilidad_gravable, 0);
  v_tope numeric := null;
  v_tasa_plana numeric := coalesce(p_tasa_plana, 30);
  v_logica_tope text := upper(coalesce(nullif(p_juridica_tope_logica, ''), 'TASA_PLANA'));
  v_prev_limite numeric := 0;
  v_base_tramo numeric := 0;
  v_tasa_ultimo_tramo numeric := null;
  v_orden integer := 0;
  v_tiene_tramo_abierto boolean := false;
  v_aplica_tope_juridica boolean := false;
  r record;
begin
  if v_regimen = '' then
    if v_tipo = 'persona_fisica' then
      v_regimen := 'PERSONA_FISICA_LUCRATIVA';
    else
      v_regimen := 'PERSONA_JURIDICA_PYME';
    end if;
  end if;

  if v_tipo = 'persona_fisica' then
    v_tasa_plana := 0;
  end if;

  if v_utilidad <= 0 then
    return;
  end if;

  if v_empresa_id is not null then
    select min(t.tope_ingreso_bruto)
      into v_tope
    from public.empresa_impuesto_renta_tramo t
    where t.empresa_id = v_empresa_id
      and t.anio = v_anio
      and t.regimen_codigo = v_regimen
      and t.activo = true;
  end if;

  if v_tope is null then
    select min(t.tope_ingreso_bruto)
      into v_tope
    from public.impuesto_renta_tramo_oficial t
    where t.anio = v_anio
      and t.regimen_codigo = v_regimen
      and t.activo = true;
  end if;

  v_aplica_tope_juridica := (
    v_tipo = 'persona_juridica'
    and v_tope is not null
    and v_ingreso is not null
    and v_ingreso > v_tope
  );

  if v_aplica_tope_juridica then
    with src as (
      select t.tasa
      from public.empresa_impuesto_renta_tramo t
      where v_empresa_id is not null
        and t.empresa_id = v_empresa_id
        and t.anio = v_anio
        and t.regimen_codigo = v_regimen
        and t.activo = true
      union all
      select t2.tasa
      from public.impuesto_renta_tramo_oficial t2
      where t2.anio = v_anio
        and t2.regimen_codigo = v_regimen
        and t2.activo = true
        and (
          v_empresa_id is null
          or not exists (
            select 1
            from public.empresa_impuesto_renta_tramo x
            where x.empresa_id = v_empresa_id
              and x.anio = v_anio
              and x.regimen_codigo = v_regimen
              and x.activo = true
          )
        )
    )
    select max(s.tasa) into v_tasa_ultimo_tramo
    from src s;

    return query
    select
      1,
      'Tarifa plana'::text,
      0::numeric,
      v_utilidad,
      round(v_utilidad, 2),
      v_tasa_plana,
      round(v_utilidad * v_tasa_plana / 100.0, 2);
    return;
  end if;

  for r in
    with src as (
      select
        t.tramo_orden,
        t.desde,
        t.hasta,
        t.tasa
      from public.empresa_impuesto_renta_tramo t
      where v_empresa_id is not null
        and t.empresa_id = v_empresa_id
        and t.anio = v_anio
        and t.regimen_codigo = v_regimen
        and t.activo = true
      union all
      select
        t2.tramo_orden,
        t2.desde,
        t2.hasta,
        t2.tasa
      from public.impuesto_renta_tramo_oficial t2
      where t2.anio = v_anio
        and t2.regimen_codigo = v_regimen
        and t2.activo = true
        and (
          v_empresa_id is null
          or not exists (
            select 1
            from public.empresa_impuesto_renta_tramo x
            where x.empresa_id = v_empresa_id
              and x.anio = v_anio
              and x.regimen_codigo = v_regimen
              and x.activo = true
          )
        )
    )
    select s.tramo_orden, s.desde, s.hasta, s.tasa
    from src s
    order by s.tramo_orden
  loop
    v_orden := coalesce(r.tramo_orden, v_orden + 1);
    v_tasa_ultimo_tramo := coalesce(r.tasa, v_tasa_ultimo_tramo);
    if r.hasta is null then
      v_tiene_tramo_abierto := true;
    end if;

    if r.tasa <= 0 then
      return query
      select
        v_orden,
        'Menor a'::text,
        null::numeric,
        r.hasta,
        null::numeric,
        0::numeric,
        null::numeric;
      if r.hasta is not null then
        v_prev_limite := r.hasta;
      end if;
      continue;
    end if;

    if r.hasta is null then
      v_base_tramo := greatest(v_utilidad - greatest(v_prev_limite, r.desde), 0);
    else
      v_base_tramo := greatest(least(v_utilidad, r.hasta) - greatest(v_prev_limite, r.desde), 0);
    end if;

    if v_base_tramo > 0 then
      return query
      select
        v_orden,
        case when r.hasta is null then 'Sobre el exceso' else 'Exceso de' end,
        r.desde,
        coalesce(r.hasta, v_utilidad),
        round(v_base_tramo, 2),
        r.tasa,
        round(v_base_tramo * r.tasa / 100.0, 2);
    end if;

    if r.hasta is not null then
      v_prev_limite := r.hasta;
    end if;
  end loop;

  -- Compatibilidad para tablas sin tramo abierto.
  if not v_tiene_tramo_abierto
     and v_tasa_ultimo_tramo is not null
     and v_tasa_ultimo_tramo > 0
     and v_utilidad > v_prev_limite
  then
    v_base_tramo := greatest(v_utilidad - v_prev_limite, 0);
    return query
    select
      v_orden + 1,
      'Sobre el exceso',
      v_prev_limite,
      v_utilidad,
      round(v_base_tramo, 2),
      v_tasa_ultimo_tramo,
      round(v_base_tramo * v_tasa_ultimo_tramo / 100.0, 2);
  end if;
end;
$$;

grant execute on function public.simular_impuesto_renta_detalle(bigint, integer, text, text, numeric, numeric, text, numeric) to authenticated;
grant execute on function public.simular_impuesto_renta_detalle(bigint, integer, text, text, numeric, numeric, text, numeric) to service_role;
grant execute on function public.simular_impuesto_renta_tabla(bigint, integer, text, text, numeric, text, numeric, numeric[]) to authenticated;
grant execute on function public.simular_impuesto_renta_tabla(bigint, integer, text, text, numeric, text, numeric, numeric[]) to service_role;
grant execute on function public.simular_impuesto_renta_escalonado(bigint, integer, text, text, numeric, numeric, text, numeric) to authenticated;
grant execute on function public.simular_impuesto_renta_escalonado(bigint, integer, text, text, numeric, numeric, text, numeric) to service_role;

commit;
