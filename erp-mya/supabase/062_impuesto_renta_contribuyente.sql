-- Calculo de impuesto de renta por tipo de contribuyente (persona juridica/fisica).
-- Ejecutar en SQL Editor con rol postgres.

begin;

-- Agrega llaves base al JSON de impuestos para empresas existentes.
update public.empresa_parametros ep
set impuestos =
  jsonb_set(
    coalesce(ep.impuestos, '{}'::jsonb),
    '{tipo_contribuyente}',
    to_jsonb(coalesce(nullif(ep.impuestos->>'tipo_contribuyente', ''), 'persona_juridica')),
    true
  )
where ep.impuestos is null
   or ep.impuestos->>'tipo_contribuyente' is null
   or ep.impuestos->>'tipo_contribuyente' = '';

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
  v_utilidad numeric := coalesce(p_utilidad_gravable, 0);
  v_impuestos jsonb := '{}'::jsonb;
  v_tipo text := 'persona_juridica';
  v_tasa_plana numeric := 30;
  v_tabla jsonb := '[]'::jsonb;
  v_tramo jsonb;
  v_hasta numeric;
  v_tasa numeric;
  v_prev_limite numeric := 0;
  v_base_tramo numeric := 0;
  v_total numeric := 0;
begin
  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if v_utilidad <= 0 then
    return 0;
  end if;

  select coalesce(ep.impuestos, public.empresa_parametros_defaults()->'impuestos')
    into v_impuestos
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  if v_impuestos is null then
    v_impuestos := public.empresa_parametros_defaults()->'impuestos';
  end if;

  v_tipo := lower(coalesce(nullif(v_impuestos->>'tipo_contribuyente', ''), 'persona_juridica'));
  v_tasa_plana := coalesce(nullif(v_impuestos->>'impuesto_renta', '')::numeric, 30);

  if v_tipo = 'persona_fisica' then
    v_tabla := coalesce(v_impuestos->'renta_tabla_fisica', '[]'::jsonb);
  else
    v_tabla := coalesce(v_impuestos->'renta_tabla_juridica', '[]'::jsonb);
  end if;

  if jsonb_typeof(v_tabla) <> 'array' or jsonb_array_length(v_tabla) = 0 then
    return round(v_utilidad * v_tasa_plana / 100.0, 2);
  end if;

  for v_tramo in
    select t.value
    from jsonb_array_elements(v_tabla) t
    order by
      case
        when nullif(t.value->>'hasta', '') is null then 999999999999::numeric
        else (t.value->>'hasta')::numeric
      end asc
  loop
    v_hasta := nullif(v_tramo->>'hasta', '')::numeric;
    v_tasa := coalesce(nullif(v_tramo->>'tasa', '')::numeric, 0);

    if v_tasa <= 0 then
      continue;
    end if;

    if v_hasta is null then
      v_base_tramo := greatest(v_utilidad - v_prev_limite, 0);
    else
      v_base_tramo := greatest(least(v_utilidad, v_hasta) - v_prev_limite, 0);
    end if;

    v_total := v_total + (v_base_tramo * v_tasa / 100.0);

    if v_hasta is not null then
      v_prev_limite := v_hasta;
    end if;
  end loop;

  return round(v_total, 2);
end;
$$;

grant execute on function public.calcular_impuesto_renta(bigint, numeric, date) to authenticated;
grant execute on function public.calcular_impuesto_renta(bigint, numeric, date) to service_role;

commit;

