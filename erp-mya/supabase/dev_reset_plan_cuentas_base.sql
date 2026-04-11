-- Reset controlado del plan de cuentas BASE.
-- Ejecutar en SQL Editor con rol postgres.
--
-- Uso recomendado:
-- 1) Asegurarse de que plan_cuentas_empresa ya este vacio
--    o que conscientemente se quiera romper la herencia previa.
-- 2) Ejecutar este script.
-- 3) Importar el nuevo modelo general al BASE.
--
-- No toca Combustibles / Fusion.

begin;

do $$
declare
  v_cuentas_empresa bigint := 0;
  v_asientos bigint := 0;
begin
  if to_regclass('public.plan_cuentas_empresa') is not null then
    select count(*) into v_cuentas_empresa from public.plan_cuentas_empresa;
  end if;

  if to_regclass('public.asientos') is not null then
    select count(*) into v_asientos from public.asientos;
  end if;

  if v_cuentas_empresa > 0 then
    raise exception
      'No se puede resetear plan_cuentas_base porque plan_cuentas_empresa aun tiene % registros. Vacie primero el catalogo empresa.',
      v_cuentas_empresa;
  end if;

  if v_asientos > 0 then
    raise exception
      'No se puede resetear plan_cuentas_base porque aun existen % asientos. Limpie la operacion contable primero.',
      v_asientos;
  end if;

  if to_regclass('public.plan_cuentas_base') is not null then
    truncate table public.plan_cuentas_base restart identity cascade;
  end if;

  raise notice 'Plan de cuentas BASE reiniciado. Ya puede importar un modelo general limpio.';
end
$$;

commit;
