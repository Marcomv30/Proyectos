-- Validaciones de jerarquia en plan de cuentas:
-- no permite niveles huerfanos (N2 sin N1, N3 sin N2, etc.).
-- Aplica sobre plan_cuentas_base y plan_cuentas_empresa.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.plan_cuentas_infer_nivel(
  p_codigo text
)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_codigo text := btrim(coalesce(p_codigo, ''));
begin
  if v_codigo = '' then
    return null;
  end if;

  -- Formato requerido: 01 / 0101 / 0101-01 / 0101-01-001 / 0101-01-001-001
  if v_codigo ~ '^\d$' then return 1; end if;
  if v_codigo ~ '^\d{2}$' then return 1; end if;
  if v_codigo ~ '^\d{4}$' then return 2; end if;
  if v_codigo ~ '^\d{4}-\d{2}$' then return 3; end if;
  if v_codigo ~ '^\d{4}-\d{2}-\d{3}$' then return 4; end if;
  if v_codigo ~ '^\d{4}-\d{2}-\d{3}-\d{3}$' then return 5; end if;

  -- Compatibilidad con codigos historicos por puntos.
  if position('.' in v_codigo) > 0 then
    return cardinality(regexp_split_to_array(v_codigo, '\.'));
  end if;

  -- Compatibilidad con codigos historicos por guiones.
  if position('-' in v_codigo) > 0 then
    return cardinality(regexp_split_to_array(v_codigo, '-'));
  end if;

  -- Fallback: numerico par (01, 0101, 010101, ...).
  if v_codigo ~ '^\d+$' and char_length(v_codigo) % 2 = 0 then
    return char_length(v_codigo) / 2;
  end if;

  -- Compatibilidad minima: raiz numerica simple.
  if v_codigo ~ '^\d+$' and char_length(v_codigo) = 1 then
    return 1;
  end if;

  return null;
end;
$$;

create or replace function public.plan_cuentas_parent_codigo(
  p_codigo text,
  p_nivel integer
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_codigo text := btrim(coalesce(p_codigo, ''));
begin
  if v_codigo = '' or coalesce(p_nivel, 0) <= 1 then
    return null;
  end if;

  -- Formato requerido.
  if v_codigo ~ '^\d{4}$' and p_nivel = 2 then
    return substr(v_codigo, 1, 2);
  end if;
  if v_codigo ~ '^\d{4}-\d{2}$' and p_nivel = 3 then
    return substr(v_codigo, 1, 4);
  end if;
  if v_codigo ~ '^\d{4}-\d{2}-\d{3}$' and p_nivel = 4 then
    return regexp_replace(v_codigo, '-\d{3}$', '');
  end if;
  if v_codigo ~ '^\d{4}-\d{2}-\d{3}-\d{3}$' and p_nivel = 5 then
    return regexp_replace(v_codigo, '-\d{3}$', '');
  end if;

  -- Compatibilidad puntos/guiones.
  if position('.' in v_codigo) > 0 then
    return regexp_replace(v_codigo, '\.[^.]+$', '');
  end if;
  if position('-' in v_codigo) > 0 then
    return regexp_replace(v_codigo, '-[^-]+$', '');
  end if;

  -- Fallback numerico por bloques de 2.
  if v_codigo ~ '^\d+$' and char_length(v_codigo) > 2 then
    return substr(v_codigo, 1, char_length(v_codigo) - 2);
  end if;

  return null;
end;
$$;

create or replace function public.trg_plan_cuentas_base_validar_jerarquia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := btrim(coalesce(new.codigo, ''));
  v_nivel_infer integer;
  v_parent_codigo text;
  v_parent_id bigint;
begin
  if v_codigo = '' then
    raise exception 'Codigo de cuenta requerido';
  end if;

  v_nivel_infer := public.plan_cuentas_infer_nivel(v_codigo);
  if v_nivel_infer is not null and coalesce(new.nivel, 0) <> v_nivel_infer then
    raise exception 'Nivel invalido para codigo %: esperado=% recibido=%', v_codigo, v_nivel_infer, coalesce(new.nivel, 0);
  end if;

  if coalesce(new.nivel, 0) > 1 then
    v_parent_codigo := public.plan_cuentas_parent_codigo(v_codigo, new.nivel);
    if nullif(v_parent_codigo, '') is null then
      raise exception 'No se pudo determinar cuenta padre para codigo % nivel %', v_codigo, new.nivel;
    end if;

    select b.id
      into v_parent_id
    from public.plan_cuentas_base b
    where b.codigo = v_parent_codigo
      and (new.id is null or b.id <> new.id)
    limit 1;

    if v_parent_id is null then
      raise exception 'Jerarquia invalida: falta cuenta padre % para %', v_parent_codigo, v_codigo;
    end if;

    if new.padre_id is null then
      new.padre_id := v_parent_id;
    elsif new.padre_id <> v_parent_id then
      raise exception 'Padre invalido para %: debe apuntar a codigo %', v_codigo, v_parent_codigo;
    end if;
  else
    new.padre_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_plan_cuentas_base_validar_jerarquia on public.plan_cuentas_base;
create trigger trg_plan_cuentas_base_validar_jerarquia
before insert or update of codigo, nivel, padre_id
on public.plan_cuentas_base
for each row
execute function public.trg_plan_cuentas_base_validar_jerarquia();

create or replace function public.trg_plan_cuentas_empresa_validar_jerarquia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := btrim(coalesce(new.codigo, ''));
  v_nivel integer;
  v_parent_codigo text;
begin
  if v_codigo = '' then
    raise exception 'Codigo de cuenta requerido';
  end if;

  v_nivel := coalesce(public.plan_cuentas_infer_nivel(v_codigo), 1);
  if v_nivel > 1 then
    v_parent_codigo := public.plan_cuentas_parent_codigo(v_codigo, v_nivel);
    if nullif(v_parent_codigo, '') is null then
      raise exception 'No se pudo determinar cuenta padre para codigo %', v_codigo;
    end if;

    if not exists (
      select 1
      from public.plan_cuentas_empresa e
      where e.empresa_id = new.empresa_id
        and e.codigo = v_parent_codigo
        and (new.id is null or e.id <> new.id)
    ) then
      raise exception 'Jerarquia invalida: falta cuenta padre % para % en empresa %', v_parent_codigo, v_codigo, new.empresa_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_plan_cuentas_empresa_validar_jerarquia on public.plan_cuentas_empresa;
create trigger trg_plan_cuentas_empresa_validar_jerarquia
before insert or update of codigo
on public.plan_cuentas_empresa
for each row
execute function public.trg_plan_cuentas_empresa_validar_jerarquia();

grant execute on function public.plan_cuentas_infer_nivel(text) to authenticated;
grant execute on function public.plan_cuentas_parent_codigo(text, integer) to authenticated;

commit;
