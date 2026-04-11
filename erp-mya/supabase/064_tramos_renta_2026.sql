-- Tablas oficiales de impuesto sobre la renta 2026 (Costa Rica) + relacion por empresa.
-- Fuente: TramosRenta2026.pdf
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.impuesto_renta_tramo_oficial (
  id bigserial primary key,
  anio integer not null,
  regimen_codigo text not null,
  persona_tipo text not null,
  periodicidad text not null,
  tramo_orden integer not null,
  desde numeric(18,2) not null default 0,
  hasta numeric(18,2) null,
  tasa numeric(8,4) not null,
  credito_hijo numeric(18,2) not null default 0,
  credito_conyuge numeric(18,2) not null default 0,
  tope_ingreso_bruto numeric(18,2) null,
  fuente text not null default 'MH_2026',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (anio, regimen_codigo, tramo_orden)
);

create index if not exists idx_impuesto_renta_tramo_oficial_lookup
  on public.impuesto_renta_tramo_oficial(anio, regimen_codigo, activo, tramo_orden);

create table if not exists public.empresa_impuesto_renta_tramo (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  anio integer not null,
  regimen_codigo text not null,
  persona_tipo text not null,
  periodicidad text not null,
  tramo_orden integer not null,
  desde numeric(18,2) not null default 0,
  hasta numeric(18,2) null,
  tasa numeric(8,4) not null,
  credito_hijo numeric(18,2) not null default 0,
  credito_conyuge numeric(18,2) not null default 0,
  tope_ingreso_bruto numeric(18,2) null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, anio, regimen_codigo, tramo_orden)
);

create index if not exists idx_empresa_impuesto_renta_tramo_lookup
  on public.empresa_impuesto_renta_tramo(empresa_id, anio, regimen_codigo, activo, tramo_orden);

alter table public.impuesto_renta_tramo_oficial enable row level security;
alter table public.empresa_impuesto_renta_tramo enable row level security;

drop policy if exists impuesto_renta_tramo_oficial_select_authenticated on public.impuesto_renta_tramo_oficial;
create policy impuesto_renta_tramo_oficial_select_authenticated
on public.impuesto_renta_tramo_oficial
for select
to authenticated
using (true);

drop policy if exists empresa_impuesto_renta_tramo_select_authenticated on public.empresa_impuesto_renta_tramo;
create policy empresa_impuesto_renta_tramo_select_authenticated
on public.empresa_impuesto_renta_tramo
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'ver')
);

drop policy if exists empresa_impuesto_renta_tramo_write_authenticated on public.empresa_impuesto_renta_tramo;
create policy empresa_impuesto_renta_tramo_write_authenticated
on public.empresa_impuesto_renta_tramo
for all
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'editar')
)
with check (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'editar')
);

create or replace view public.vw_impuesto_renta_tramos_oficiales as
select
  id,
  anio,
  regimen_codigo,
  persona_tipo,
  periodicidad,
  tramo_orden,
  desde,
  hasta,
  tasa,
  credito_hijo,
  credito_conyuge,
  tope_ingreso_bruto,
  fuente,
  activo,
  created_at,
  updated_at
from public.impuesto_renta_tramo_oficial;

create or replace view public.vw_empresa_impuesto_renta_tramos as
select
  id,
  empresa_id,
  anio,
  regimen_codigo,
  persona_tipo,
  periodicidad,
  tramo_orden,
  desde,
  hasta,
  tasa,
  credito_hijo,
  credito_conyuge,
  tope_ingreso_bruto,
  activo,
  created_at,
  updated_at
from public.empresa_impuesto_renta_tramo;

grant select on public.vw_impuesto_renta_tramos_oficiales to authenticated;
grant select on public.vw_impuesto_renta_tramos_oficiales to service_role;
grant select, insert, update, delete on public.vw_empresa_impuesto_renta_tramos to authenticated;
grant select, insert, update, delete on public.vw_empresa_impuesto_renta_tramos to service_role;

-- Seed oficial 2026 (MH).
insert into public.impuesto_renta_tramo_oficial (
  anio, regimen_codigo, persona_tipo, periodicidad, tramo_orden, desde, hasta, tasa, credito_hijo, credito_conyuge, tope_ingreso_bruto, fuente, activo
) values
  -- 1) Asalariados, jubilados y pensionados (mensual)
  (2026, 'ASALARIADO_JUBILADO', 'persona_fisica', 'mensual', 1, 0, 918000, 0, 1710, 2590, null, 'MH_2026', true),
  (2026, 'ASALARIADO_JUBILADO', 'persona_fisica', 'mensual', 2, 918000, 1347000, 10, 1710, 2590, null, 'MH_2026', true),
  (2026, 'ASALARIADO_JUBILADO', 'persona_fisica', 'mensual', 3, 1347000, 2364000, 15, 1710, 2590, null, 'MH_2026', true),
  (2026, 'ASALARIADO_JUBILADO', 'persona_fisica', 'mensual', 4, 2364000, 4727000, 20, 1710, 2590, null, 'MH_2026', true),
  (2026, 'ASALARIADO_JUBILADO', 'persona_fisica', 'mensual', 5, 4727000, null, 25, 1710, 2590, null, 'MH_2026', true),

  -- 2) Persona fisica con actividad lucrativa (anual)
  (2026, 'PERSONA_FISICA_LUCRATIVA', 'persona_fisica', 'anual', 1, 0, 6244000, 0, 20520, 31080, null, 'MH_2026', true),
  (2026, 'PERSONA_FISICA_LUCRATIVA', 'persona_fisica', 'anual', 2, 6244000, 8329000, 10, 20520, 31080, null, 'MH_2026', true),
  (2026, 'PERSONA_FISICA_LUCRATIVA', 'persona_fisica', 'anual', 3, 8329000, 10414000, 15, 20520, 31080, null, 'MH_2026', true),
  (2026, 'PERSONA_FISICA_LUCRATIVA', 'persona_fisica', 'anual', 4, 10414000, 20872000, 20, 20520, 31080, null, 'MH_2026', true),
  (2026, 'PERSONA_FISICA_LUCRATIVA', 'persona_fisica', 'anual', 5, 20872000, null, 25, 20520, 31080, null, 'MH_2026', true),

  -- 3) Persona juridica pyme (renta bruta <= 119.174.000,00)
  (2026, 'PERSONA_JURIDICA_PYME', 'persona_juridica', 'anual', 1, 0, 5621000, 5, 0, 0, 119174000, 'MH_2026', true),
  (2026, 'PERSONA_JURIDICA_PYME', 'persona_juridica', 'anual', 2, 5621000, 8433000, 10, 0, 0, 119174000, 'MH_2026', true),
  (2026, 'PERSONA_JURIDICA_PYME', 'persona_juridica', 'anual', 3, 8433000, 11243000, 15, 0, 0, 119174000, 'MH_2026', true),
  (2026, 'PERSONA_JURIDICA_PYME', 'persona_juridica', 'anual', 4, 11243000, null, 20, 0, 0, 119174000, 'MH_2026', true)
on conflict (anio, regimen_codigo, tramo_orden) do update
set
  persona_tipo = excluded.persona_tipo,
  periodicidad = excluded.periodicidad,
  desde = excluded.desde,
  hasta = excluded.hasta,
  tasa = excluded.tasa,
  credito_hijo = excluded.credito_hijo,
  credito_conyuge = excluded.credito_conyuge,
  tope_ingreso_bruto = excluded.tope_ingreso_bruto,
  fuente = excluded.fuente,
  activo = excluded.activo,
  updated_at = now();

create or replace function public.calcular_impuesto_renta_detalle(
  p_empresa_id bigint,
  p_utilidad_gravable numeric,
  p_fecha_corte date default current_date
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
  tasa_plana numeric,
  impuesto_calculado numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_utilidad numeric := coalesce(p_utilidad_gravable, 0);
  v_anio integer := extract(year from coalesce(p_fecha_corte, current_date));
  v_impuestos jsonb := '{}'::jsonb;
  v_tipo text := 'persona_juridica';
  v_regimen text;
  v_tasa_plana numeric := 30;
  v_tasa_ultimo_tramo numeric := null;
  v_tasa_tope numeric := null;
  v_logica_tope text := 'TASA_PLANA';
  v_ingreso_bruto_anual numeric := null;
  v_tope numeric := null;
  v_prev_limite numeric := 0;
  v_base_tramo numeric := 0;
  v_total numeric := 0;
  v_metodo text := 'TRAMOS';
  v_hay_tramos boolean := false;
  v_tiene_tramo_abierto boolean := false;
  v_ultimo_tramo_orden integer := 0;
  r record;
begin
  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if v_utilidad <= 0 then
    return query
    select
      p_empresa_id,
      v_anio,
      v_tipo,
      null::text,
      v_utilidad,
      null::numeric,
      null::numeric,
      'SIN_UTILIDAD'::text,
      0::numeric,
      0::numeric;
    return;
  end if;

  select coalesce(ep.impuestos, public.empresa_parametros_defaults()->'impuestos')
    into v_impuestos
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  v_tipo := lower(coalesce(nullif(v_impuestos->>'tipo_contribuyente', ''), 'persona_juridica'));
  v_tasa_plana := coalesce(nullif(v_impuestos->>'impuesto_renta', '')::numeric, 30);
  if v_tipo = 'persona_fisica' then
    v_tasa_plana := 0;
  end if;
  v_logica_tope := upper(coalesce(nullif(v_impuestos->>'juridica_tope_logica', ''), 'TASA_PLANA'));
  v_ingreso_bruto_anual := nullif(v_impuestos->>'ingreso_bruto_anual', '')::numeric;

  v_regimen := upper(coalesce(nullif(v_impuestos->>'regimen_renta', ''), ''));
  if v_regimen = '' then
    if v_tipo = 'persona_fisica' then
      v_regimen := 'PERSONA_FISICA_LUCRATIVA';
    else
      v_regimen := 'PERSONA_JURIDICA_PYME';
    end if;
  end if;

  select min(t.tope_ingreso_bruto)
    into v_tope
  from public.empresa_impuesto_renta_tramo t
  where t.empresa_id = p_empresa_id
    and t.anio = v_anio
    and t.regimen_codigo = v_regimen
    and t.activo = true;

  if v_tope is null then
    select min(t.tope_ingreso_bruto)
      into v_tope
    from public.impuesto_renta_tramo_oficial t
    where t.anio = v_anio
      and t.regimen_codigo = v_regimen
      and t.activo = true;
  end if;

  if v_tipo = 'persona_juridica'
     and v_tope is not null
     and v_ingreso_bruto_anual is not null
     and v_ingreso_bruto_anual > v_tope
  then
    select max(s.tasa)
      into v_tasa_ultimo_tramo
    from (
      select t.tasa
      from public.empresa_impuesto_renta_tramo t
      where t.empresa_id = p_empresa_id
        and t.anio = v_anio
        and t.regimen_codigo = v_regimen
        and t.activo = true
      union all
      select t2.tasa
      from public.impuesto_renta_tramo_oficial t2
      where t2.anio = v_anio
        and t2.regimen_codigo = v_regimen
        and t2.activo = true
        and not exists (
          select 1
          from public.empresa_impuesto_renta_tramo x
          where x.empresa_id = p_empresa_id
            and x.anio = v_anio
            and x.regimen_codigo = v_regimen
            and x.activo = true
        )
    ) s;

    v_tasa_tope := v_tasa_plana;
    v_metodo := 'TASA_PLANA_TOPE_INGRESO';

    return query
    select
      p_empresa_id,
      v_anio,
      v_tipo,
      v_regimen,
      v_utilidad,
      v_ingreso_bruto_anual,
      v_tope,
      v_metodo,
      v_tasa_plana,
      round(v_utilidad * v_tasa_tope / 100.0, 2);
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
      where t.empresa_id = p_empresa_id
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
        and not exists (
          select 1
          from public.empresa_impuesto_renta_tramo x
          where x.empresa_id = p_empresa_id
            and x.anio = v_anio
            and x.regimen_codigo = v_regimen
            and x.activo = true
        )
    )
    select s.tramo_orden, s.desde, s.hasta, s.tasa
    from src s
    order by s.tramo_orden
  loop
    v_hay_tramos := true;
    v_ultimo_tramo_orden := coalesce(r.tramo_orden, v_ultimo_tramo_orden);
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

  -- Compatibilidad: si no viene tramo abierto, aplica ultimo factor al excedente del ultimo limite.
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
      v_total := 0;
    else
      v_metodo := 'TASA_PLANA_SIN_TRAMOS';
      v_total := round(v_utilidad * v_tasa_plana / 100.0, 2);
    end if;
  else
    v_metodo := 'TRAMOS_EMPRESA_O_OFICIAL';
    v_total := round(v_total, 2);
  end if;

  return query
  select
    p_empresa_id,
    v_anio,
    v_tipo,
    v_regimen,
    v_utilidad,
    v_ingreso_bruto_anual,
    v_tope,
    v_metodo,
    v_tasa_plana,
    v_total;
end;
$$;

create or replace function public.calcular_impuesto_renta_escalonado(
  p_empresa_id bigint,
  p_utilidad_gravable numeric,
  p_fecha_corte date default current_date
)
returns table (
  empresa_id bigint,
  anio integer,
  tipo_contribuyente text,
  regimen_codigo text,
  tramo_orden integer,
  desde numeric,
  hasta numeric,
  tasa numeric,
  base_tramo numeric,
  impuesto_tramo numeric,
  impuesto_acumulado numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_utilidad numeric := coalesce(p_utilidad_gravable, 0);
  v_anio integer := extract(year from coalesce(p_fecha_corte, current_date));
  v_impuestos jsonb := '{}'::jsonb;
  v_tipo text := 'persona_juridica';
  v_regimen text;
  v_tasa_plana numeric := 30;
  v_tasa_ultimo_tramo numeric := null;
  v_tasa_tope numeric := null;
  v_logica_tope text := 'TASA_PLANA';
  v_ingreso_bruto_anual numeric := null;
  v_tope numeric := null;
  v_prev_limite numeric := 0;
  v_base_tramo numeric := 0;
  v_impuesto_tramo numeric := 0;
  v_acumulado numeric := 0;
  v_tiene_tramo_abierto boolean := false;
  v_ultimo_tramo_orden integer := 0;
  r record;
begin
  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if v_utilidad <= 0 then
    return;
  end if;

  select coalesce(ep.impuestos, public.empresa_parametros_defaults()->'impuestos')
    into v_impuestos
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  v_tipo := lower(coalesce(nullif(v_impuestos->>'tipo_contribuyente', ''), 'persona_juridica'));
  v_tasa_plana := coalesce(nullif(v_impuestos->>'impuesto_renta', '')::numeric, 30);
  if v_tipo = 'persona_fisica' then
    v_tasa_plana := 0;
  end if;
  v_logica_tope := upper(coalesce(nullif(v_impuestos->>'juridica_tope_logica', ''), 'TASA_PLANA'));
  v_ingreso_bruto_anual := nullif(v_impuestos->>'ingreso_bruto_anual', '')::numeric;

  v_regimen := upper(coalesce(nullif(v_impuestos->>'regimen_renta', ''), ''));
  if v_regimen = '' then
    if v_tipo = 'persona_fisica' then
      v_regimen := 'PERSONA_FISICA_LUCRATIVA';
    else
      v_regimen := 'PERSONA_JURIDICA_PYME';
    end if;
  end if;

  select min(t.tope_ingreso_bruto)
    into v_tope
  from public.empresa_impuesto_renta_tramo t
  where t.empresa_id = p_empresa_id
    and t.anio = v_anio
    and t.regimen_codigo = v_regimen
    and t.activo = true;

  if v_tope is null then
    select min(t.tope_ingreso_bruto)
      into v_tope
    from public.impuesto_renta_tramo_oficial t
    where t.anio = v_anio
      and t.regimen_codigo = v_regimen
      and t.activo = true;
  end if;

  -- Si juridica supera tope PYME, se aplica tasa plana como un solo tramo.
  if v_tipo = 'persona_juridica'
     and v_tope is not null
     and v_ingreso_bruto_anual is not null
     and v_ingreso_bruto_anual > v_tope
  then
    select max(s.tasa)
      into v_tasa_ultimo_tramo
    from (
      select t.tasa
      from public.empresa_impuesto_renta_tramo t
      where t.empresa_id = p_empresa_id
        and t.anio = v_anio
        and t.regimen_codigo = v_regimen
        and t.activo = true
      union all
      select t2.tasa
      from public.impuesto_renta_tramo_oficial t2
      where t2.anio = v_anio
        and t2.regimen_codigo = v_regimen
        and t2.activo = true
        and not exists (
          select 1
          from public.empresa_impuesto_renta_tramo x
          where x.empresa_id = p_empresa_id
            and x.anio = v_anio
            and x.regimen_codigo = v_regimen
            and x.activo = true
        )
    ) s;

    v_tasa_tope := v_tasa_plana;

    return query
    select
      p_empresa_id,
      v_anio,
      v_tipo,
      v_regimen,
      1,
      0::numeric,
      null::numeric,
      v_tasa_tope,
      round(v_utilidad, 2),
      round(v_utilidad * v_tasa_tope / 100.0, 2),
      round(v_utilidad * v_tasa_tope / 100.0, 2);
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
      where t.empresa_id = p_empresa_id
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
        and not exists (
          select 1
          from public.empresa_impuesto_renta_tramo x
          where x.empresa_id = p_empresa_id
            and x.anio = v_anio
            and x.regimen_codigo = v_regimen
            and x.activo = true
        )
    )
    select s.tramo_orden, s.desde, s.hasta, s.tasa
    from src s
    order by s.tramo_orden
  loop
    v_ultimo_tramo_orden := coalesce(r.tramo_orden, v_ultimo_tramo_orden);
    v_tasa_ultimo_tramo := coalesce(r.tasa, v_tasa_ultimo_tramo);
    if r.hasta is null then
      v_tiene_tramo_abierto := true;
    end if;

    if r.hasta is null then
      v_base_tramo := greatest(v_utilidad - greatest(v_prev_limite, r.desde), 0);
    else
      v_base_tramo := greatest(least(v_utilidad, r.hasta) - greatest(v_prev_limite, r.desde), 0);
    end if;

    v_impuesto_tramo := round(v_base_tramo * coalesce(r.tasa, 0) / 100.0, 2);
    v_acumulado := round(v_acumulado + v_impuesto_tramo, 2);

    return query
    select
      p_empresa_id,
      v_anio,
      v_tipo,
      v_regimen,
      r.tramo_orden,
      r.desde,
      r.hasta,
      r.tasa,
      round(v_base_tramo, 2),
      v_impuesto_tramo,
      v_acumulado;

    if r.hasta is not null then
      v_prev_limite := r.hasta;
    end if;
  end loop;

  -- Compatibilidad: si no existe tramo abierto, aplica ultimo factor al excedente del ultimo limite.
  if not v_tiene_tramo_abierto
     and v_tasa_ultimo_tramo is not null
     and v_tasa_ultimo_tramo > 0
     and v_utilidad > v_prev_limite
  then
    v_base_tramo := greatest(v_utilidad - v_prev_limite, 0);
    v_impuesto_tramo := round(v_base_tramo * v_tasa_ultimo_tramo / 100.0, 2);
    v_acumulado := round(v_acumulado + v_impuesto_tramo, 2);

    return query
    select
      p_empresa_id,
      v_anio,
      v_tipo,
      v_regimen,
      greatest(v_ultimo_tramo_orden, 0) + 1,
      v_prev_limite,
      null::numeric,
      v_tasa_ultimo_tramo,
      round(v_base_tramo, 2),
      v_impuesto_tramo,
      v_acumulado;
  end if;

  -- Fallback si no hay tramos.
  if v_acumulado <= 0 then
    if v_tipo = 'persona_fisica' then
      return query
      select
        p_empresa_id,
        v_anio,
        v_tipo,
        v_regimen,
        1,
        0::numeric,
        null::numeric,
        0::numeric,
        round(v_utilidad, 2),
        0::numeric,
        0::numeric;
    else
      return query
      select
        p_empresa_id,
        v_anio,
        v_tipo,
        v_regimen,
        1,
        0::numeric,
        null::numeric,
        v_tasa_plana,
        round(v_utilidad, 2),
        round(v_utilidad * v_tasa_plana / 100.0, 2),
        round(v_utilidad * v_tasa_plana / 100.0, 2);
    end if;
  end if;
end;
$$;

create or replace function public.calcular_impuesto_renta(
  p_empresa_id bigint,
  p_utilidad_gravable numeric,
  p_fecha_corte date default current_date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_impuesto numeric := 0;
begin
  select coalesce(max(e.impuesto_acumulado), 0)
    into v_impuesto
  from public.calcular_impuesto_renta_escalonado(p_empresa_id, p_utilidad_gravable, p_fecha_corte) e;

  return coalesce(v_impuesto, 0);
end;
$$;

grant execute on function public.calcular_impuesto_renta_escalonado(bigint, numeric, date) to authenticated;
grant execute on function public.calcular_impuesto_renta_escalonado(bigint, numeric, date) to service_role;
grant execute on function public.calcular_impuesto_renta_detalle(bigint, numeric, date) to authenticated;
grant execute on function public.calcular_impuesto_renta_detalle(bigint, numeric, date) to service_role;
grant execute on function public.calcular_impuesto_renta(bigint, numeric, date) to authenticated;
grant execute on function public.calcular_impuesto_renta(bigint, numeric, date) to service_role;

grant select on table public.impuesto_renta_tramo_oficial to authenticated;
grant select, insert, update, delete on table public.empresa_impuesto_renta_tramo to authenticated;

commit;
