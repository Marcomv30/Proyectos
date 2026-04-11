-- Precheck de consistencia tipo/naturaleza en plan_cuentas_base.
-- Uso:
-- 1) Diagnostico (recomendado): dejar v_fix = false.
-- 2) Correccion automatica: cambiar v_fix = true.
--
-- Reglas esperadas:
-- ACTIVO/COSTO/GASTO -> DEBITO
-- PASIVO/CAPITAL/INGRESO -> CREDITO

begin;

do $$
declare
  v_fix boolean := false; -- cambiar a true para corregir automaticamente
  v_bad_count integer := 0;
  v_fixed_count integer := 0;
begin
  with inconsistentes as (
    select
      b.id,
      b.codigo,
      b.nombre,
      upper(btrim(coalesce(b.tipo, ''))) as tipo_actual,
      upper(btrim(coalesce(b.naturaleza, ''))) as naturaleza_actual,
      case
        when upper(btrim(coalesce(b.tipo, ''))) in ('ACTIVO', 'COSTO', 'GASTO') then 'DEBITO'
        when upper(btrim(coalesce(b.tipo, ''))) in ('PASIVO', 'CAPITAL', 'INGRESO') then 'CREDITO'
        else null
      end as naturaleza_esperada
    from public.plan_cuentas_base b
  )
  select count(*)
    into v_bad_count
  from inconsistentes i
  where i.naturaleza_esperada is null
     or i.naturaleza_actual not in ('DEBITO', 'CREDITO')
     or i.naturaleza_actual <> i.naturaleza_esperada;

  raise notice 'Precheck tipo/naturaleza: % inconsistencia(s) detectada(s).', v_bad_count;

  if v_bad_count > 0 then
    raise notice 'Detalle (primeras 50):';
    perform 1;
  end if;

  -- Muestra detalle de inconsistencias (query visible en SQL Editor).
  create temporary table if not exists tmp_plan_cuentas_inconsistencias_tipo_nat on commit drop as
  select
    b.id,
    b.codigo,
    b.nombre,
    upper(btrim(coalesce(b.tipo, ''))) as tipo_actual,
    upper(btrim(coalesce(b.naturaleza, ''))) as naturaleza_actual,
    case
      when upper(btrim(coalesce(b.tipo, ''))) in ('ACTIVO', 'COSTO', 'GASTO') then 'DEBITO'
      when upper(btrim(coalesce(b.tipo, ''))) in ('PASIVO', 'CAPITAL', 'INGRESO') then 'CREDITO'
      else null
    end as naturaleza_esperada
  from public.plan_cuentas_base b
  where
    case
      when upper(btrim(coalesce(b.tipo, ''))) in ('ACTIVO', 'COSTO', 'GASTO') then 'DEBITO'
      when upper(btrim(coalesce(b.tipo, ''))) in ('PASIVO', 'CAPITAL', 'INGRESO') then 'CREDITO'
      else null
    end is null
    or upper(btrim(coalesce(b.naturaleza, ''))) not in ('DEBITO', 'CREDITO')
    or upper(btrim(coalesce(b.naturaleza, ''))) <>
      case
        when upper(btrim(coalesce(b.tipo, ''))) in ('ACTIVO', 'COSTO', 'GASTO') then 'DEBITO'
        when upper(btrim(coalesce(b.tipo, ''))) in ('PASIVO', 'CAPITAL', 'INGRESO') then 'CREDITO'
        else upper(btrim(coalesce(b.naturaleza, '')))
      end;

  if v_fix then
    update public.plan_cuentas_base b
    set naturaleza = i.naturaleza_esperada
    from tmp_plan_cuentas_inconsistencias_tipo_nat i
    where i.id = b.id
      and i.naturaleza_esperada is not null
      and b.naturaleza is distinct from i.naturaleza_esperada;

    get diagnostics v_fixed_count = row_count;
    raise notice 'Correccion aplicada: % fila(s) actualizada(s).', v_fixed_count;
  else
    raise notice 'Modo diagnostico: no se aplicaron cambios (v_fix=false).';
  end if;
end
$$;

-- Resultado legible del diagnostico:
select
  id,
  codigo,
  nombre,
  tipo_actual as tipo,
  naturaleza_actual as naturaleza,
  naturaleza_esperada
from tmp_plan_cuentas_inconsistencias_tipo_nat
order by codigo
limit 200;

commit;

