-- Reset catálogo contable empresa_id = 2 para reimportación desde VFP.
-- Ejecutar en Supabase SQL Editor (rol postgres / service_role).
--
-- Si la empresa YA tuviera asientos, este script los borra también.
-- Seguro de correr en DEV; revisar antes de usar en producción.

begin;

do $$
declare
  v_empresa_id bigint := 2;
  v_asientos   bigint;
  v_cuentas    bigint;
begin
  -- Contar asientos para advertir si existieran
  select count(*) into v_asientos
  from public.asientos
  where empresa_id = v_empresa_id;

  if v_asientos > 0 then
    raise notice 'ADVERTENCIA: empresa % tiene % asiento(s). Se eliminarán.', v_empresa_id, v_asientos;
  end if;

  -- 1. Líneas de asientos
  if to_regclass('public.asiento_lineas') is not null
     and to_regclass('public.asientos') is not null then
    delete from public.asiento_lineas l
    using public.asientos a
    where a.id = l.asiento_id
      and a.empresa_id = v_empresa_id;
  end if;

  -- 2. Asientos
  if to_regclass('public.asientos') is not null then
    delete from public.asientos where empresa_id = v_empresa_id;
  end if;

  -- 3. Catálogo empresa
  if to_regclass('public.plan_cuentas_empresa') is not null then
    delete from public.plan_cuentas_empresa where empresa_id = v_empresa_id;
    get diagnostics v_cuentas = row_count;
    raise notice 'Cuentas eliminadas de plan_cuentas_empresa: %', v_cuentas;
  end if;

  -- 4. Historial tipo de cambio (opcional — comentar si no se desea borrar)
  if to_regclass('public.tipo_cambio_historial') is not null then
    delete from public.tipo_cambio_historial where empresa_id = v_empresa_id;
  end if;

  raise notice 'Reset completado para empresa_id = %.', v_empresa_id;
  raise notice 'Listo para importar catálogo desde VFP.';
end
$$;

commit;
