-- Blindaje contable: valida combinaciones tipo/naturaleza en plan_cuentas_base.
-- Ejecutar en SQL Editor con rol postgres.
--
-- Reglas:
-- ACTIVO -> DEBITO
-- COSTO  -> DEBITO
-- GASTO  -> DEBITO
-- PASIVO -> CREDITO
-- CAPITAL-> CREDITO
-- INGRESO-> CREDITO

begin;

create or replace function public.trg_plan_cuentas_base_validar_tipo_naturaleza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text := upper(btrim(coalesce(new.tipo, '')));
  v_nat text := upper(btrim(coalesce(new.naturaleza, '')));
begin
  if v_tipo = '' then
    raise exception 'Tipo de cuenta requerido';
  end if;

  if v_nat = '' then
    raise exception 'Naturaleza de cuenta requerida';
  end if;

  if v_tipo not in ('ACTIVO', 'PASIVO', 'CAPITAL', 'INGRESO', 'COSTO', 'GASTO') then
    raise exception
      'Tipo invalido: %. Permitidos: ACTIVO, PASIVO, CAPITAL, INGRESO, COSTO, GASTO',
      v_tipo;
  end if;

  if v_nat not in ('DEBITO', 'CREDITO') then
    raise exception 'Naturaleza invalida: %. Permitidos: DEBITO, CREDITO', v_nat;
  end if;

  if v_tipo in ('ACTIVO', 'COSTO', 'GASTO') and v_nat <> 'DEBITO' then
    raise exception 'Combinacion invalida: tipo % debe usar naturaleza DEBITO', v_tipo;
  end if;

  if v_tipo in ('PASIVO', 'CAPITAL', 'INGRESO') and v_nat <> 'CREDITO' then
    raise exception 'Combinacion invalida: tipo % debe usar naturaleza CREDITO', v_tipo;
  end if;

  new.tipo := v_tipo;
  new.naturaleza := v_nat;
  return new;
end;
$$;

drop trigger if exists trg_plan_cuentas_base_validar_tipo_naturaleza on public.plan_cuentas_base;
create trigger trg_plan_cuentas_base_validar_tipo_naturaleza
before insert or update of tipo, naturaleza
on public.plan_cuentas_base
for each row
execute function public.trg_plan_cuentas_base_validar_tipo_naturaleza();

commit;

