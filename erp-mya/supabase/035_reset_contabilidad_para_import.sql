-- Reset contable para reiniciar catalogo/importacion.
-- Ejecutar en SQL Editor con rol postgres.
--
-- MODO USO:
-- 1) Global (todo el proyecto): dejar v_empresa_id = null.
-- 2) Solo una empresa: asignar v_empresa_id (ej: 1).
--
-- QUE LIMPIA:
-- - Movimientos contables (asientos + lineas asociadas)
-- - Catalogo por empresa (plan_cuentas_empresa)
-- - Historial TC por empresa (opcional operativo)
-- - Catalogo base (solo en modo global)
--
-- ADVERTENCIA: Operacion destructiva.

begin;

do $$
declare
  -- null = reset global. Cambiar a un id para reset por empresa.
  v_empresa_id bigint := null;
begin
  if v_empresa_id is null then
    -- Reset global completo.
    if to_regclass('public.asiento_lineas') is not null then
      execute 'truncate table public.asiento_lineas restart identity cascade';
    end if;

    if to_regclass('public.asientos') is not null then
      execute 'truncate table public.asientos restart identity cascade';
    end if;

    if to_regclass('public.plan_cuentas_empresa') is not null then
      execute 'truncate table public.plan_cuentas_empresa restart identity cascade';
    end if;

    if to_regclass('public.tipo_cambio_historial') is not null then
      execute 'truncate table public.tipo_cambio_historial restart identity cascade';
    end if;

    if to_regclass('public.plan_cuentas_base') is not null then
      execute 'truncate table public.plan_cuentas_base restart identity cascade';
    end if;

    raise notice 'Reset GLOBAL completado. Puede importar catalogo nuevo en plan_cuentas_base.';
  else
    -- Reset solo para una empresa.
    if to_regclass('public.asiento_lineas') is not null
       and to_regclass('public.asientos') is not null then
      execute $sql$
        delete from public.asiento_lineas l
        using public.asientos a
        where a.id = l.asiento_id
          and a.empresa_id = $1
      $sql$ using v_empresa_id;
    end if;

    if to_regclass('public.asientos') is not null then
      execute 'delete from public.asientos where empresa_id = $1' using v_empresa_id;
    end if;

    if to_regclass('public.plan_cuentas_empresa') is not null then
      execute 'delete from public.plan_cuentas_empresa where empresa_id = $1' using v_empresa_id;
    end if;

    if to_regclass('public.tipo_cambio_historial') is not null then
      execute 'delete from public.tipo_cambio_historial where empresa_id = $1' using v_empresa_id;
    end if;

    raise notice 'Reset por empresa completado (empresa_id=%).', v_empresa_id;
  end if;
end
$$;

commit;

