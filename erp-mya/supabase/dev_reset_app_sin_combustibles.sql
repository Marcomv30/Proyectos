-- Reset operativo del ERP sin tocar Combustibles / Fusion.
-- Ejecutar en SQL Editor con rol postgres.
--
-- Objetivo:
-- - Limpiar datos de prueba de modulos operativos
-- - Preservar Combustibles/Fusion
-- - Dejar plan_cuentas_empresa vacio (sin sembrar desde base)
--
-- Uso:
--   1) Ajustar v_empresa_id:
--      null = todas las empresas
--      N    = solo una empresa
--   2) Ajustar los flags de preservacion segun necesidad
--
-- Recomendacion inicial:
--   - Conservar plan_cuentas_base
--   - Conservar usuarios/empresas/permisos
--   - Conservar snapshots MH y actividades tributarias
--   - Limpiar operacion, FE, bancos, CXC/CXP, inventarios y catalogo empresa

begin;

do $$
declare
  v_empresa_id bigint := null;

  v_preservar_plan_base boolean := true;
  v_preservar_snapshot_hacienda boolean := true;
  v_preservar_terceros boolean := false;
  v_preservar_fe_config boolean := false;
  v_preservar_cajas_puntos_venta boolean := true;
  v_preservar_configs_empresa boolean := true;
begin
  -- =========================
  -- CONTABILIDAD
  -- =========================
  if to_regclass('public.asiento_lineas') is not null and to_regclass('public.asientos') is not null then
    if v_empresa_id is null then
      execute 'delete from public.asiento_lineas l using public.asientos a where a.id = l.asiento_id';
    else
      execute 'delete from public.asiento_lineas l using public.asientos a where a.id = l.asiento_id and a.empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.asientos') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.asientos restart identity cascade';
    else
      execute 'delete from public.asientos where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.asiento_numeracion') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.asiento_numeracion restart identity cascade';
    else
      execute 'delete from public.asiento_numeracion where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.asiento_categorias_empresa') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.asiento_categorias_empresa restart identity cascade';
    else
      execute 'delete from public.asiento_categorias_empresa where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.tipo_cambio_historial') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.tipo_cambio_historial restart identity cascade';
    else
      execute 'delete from public.tipo_cambio_historial where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.plan_cuentas_empresa') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.plan_cuentas_empresa restart identity cascade';
    else
      execute 'delete from public.plan_cuentas_empresa where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if not v_preservar_plan_base and to_regclass('public.plan_cuentas_base') is not null then
    execute 'truncate table public.plan_cuentas_base restart identity cascade';
  end if;

  -- =========================
  -- FE
  -- =========================
  if to_regclass('public.fe_documento_lineas') is not null and to_regclass('public.fe_documentos') is not null then
    if v_empresa_id is null then
      execute 'delete from public.fe_documento_lineas l using public.fe_documentos d where d.id = l.documento_id';
    else
      execute 'delete from public.fe_documento_lineas l using public.fe_documentos d where d.id = l.documento_id and d.empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.fe_documentos') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.fe_documentos restart identity cascade';
    else
      execute 'delete from public.fe_documentos where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.fe_exoneraciones_cabys') is not null and to_regclass('public.fe_exoneraciones') is not null then
    if v_empresa_id is null then
      execute 'delete from public.fe_exoneraciones_cabys c using public.fe_exoneraciones e where e.id = c.exoneracion_id';
    else
      execute 'delete from public.fe_exoneraciones_cabys c using public.fe_exoneraciones e where e.id = c.exoneracion_id and e.empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.fe_exoneraciones') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.fe_exoneraciones restart identity cascade';
    else
      execute 'delete from public.fe_exoneraciones where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.fe_receptores_bitacora') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.fe_receptores_bitacora restart identity cascade';
    else
      execute 'delete from public.fe_receptores_bitacora where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if not v_preservar_fe_config and to_regclass('public.fe_config_empresa') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.fe_config_empresa restart identity cascade';
    else
      execute 'delete from public.fe_config_empresa where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  -- =========================
  -- BANCOS
  -- =========================
  if to_regclass('public.bancos_cheques_debito_lineas') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.bancos_cheques_debito_lineas restart identity cascade';
    else
      execute 'delete from public.bancos_cheques_debito_lineas where movimiento_id in (select id from public.bancos_cheques_debito where empresa_id = $1)' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.bancos_cheques_debito') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.bancos_cheques_debito restart identity cascade';
    else
      execute 'delete from public.bancos_cheques_debito where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.bancos_depositos_ingresos_lineas') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.bancos_depositos_ingresos_lineas restart identity cascade';
    else
      execute 'delete from public.bancos_depositos_ingresos_lineas where movimiento_id in (select id from public.bancos_depositos_ingresos where empresa_id = $1)' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.bancos_depositos_ingresos') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.bancos_depositos_ingresos restart identity cascade';
    else
      execute 'delete from public.bancos_depositos_ingresos where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.bancos_conciliacion_matches') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.bancos_conciliacion_matches restart identity cascade';
    else
      execute 'delete from public.bancos_conciliacion_matches where periodo_id in (select id from public.bancos_conciliacion_periodos where empresa_id = $1)' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.bancos_estado_importado') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.bancos_estado_importado restart identity cascade';
    else
      execute 'delete from public.bancos_estado_importado where periodo_id in (select id from public.bancos_conciliacion_periodos where empresa_id = $1)' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.bancos_conciliacion_diferencias') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.bancos_conciliacion_diferencias restart identity cascade';
    else
      execute 'delete from public.bancos_conciliacion_diferencias where periodo_id in (select id from public.bancos_conciliacion_periodos where empresa_id = $1)' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.bancos_conciliacion_periodos') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.bancos_conciliacion_periodos restart identity cascade';
    else
      execute 'delete from public.bancos_conciliacion_periodos where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.cuentas_bancarias_empresa') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.cuentas_bancarias_empresa restart identity cascade';
    else
      execute 'delete from public.cuentas_bancarias_empresa where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  -- =========================
  -- CXC / RECAUDACION
  -- =========================
  if to_regclass('public.recaudacion_pago_detalle') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.recaudacion_pago_detalle restart identity cascade';
    else
      execute 'delete from public.recaudacion_pago_detalle where pago_id in (select id from public.recaudacion_pagos where empresa_id = $1)' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.recaudacion_auxiliar_banco') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.recaudacion_auxiliar_banco restart identity cascade';
    else
      execute 'delete from public.recaudacion_auxiliar_banco where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.recaudacion_bitacora') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.recaudacion_bitacora restart identity cascade';
    else
      execute 'delete from public.recaudacion_bitacora where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.recaudacion_pagos') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.recaudacion_pagos restart identity cascade';
    else
      execute 'delete from public.recaudacion_pagos where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.recaudacion_cierres_caja_bitacora') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.recaudacion_cierres_caja_bitacora restart identity cascade';
    else
      execute 'delete from public.recaudacion_cierres_caja_bitacora where cierre_id in (select id from public.recaudacion_cierres_caja where empresa_id = $1)' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.recaudacion_cierres_caja_detalle') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.recaudacion_cierres_caja_detalle restart identity cascade';
    else
      execute 'delete from public.recaudacion_cierres_caja_detalle where cierre_id in (select id from public.recaudacion_cierres_caja where empresa_id = $1)' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.recaudacion_cierres_caja') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.recaudacion_cierres_caja restart identity cascade';
    else
      execute 'delete from public.recaudacion_cierres_caja where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.cxc_gestion_cobro') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.cxc_gestion_cobro restart identity cascade';
    else
      execute 'delete from public.cxc_gestion_cobro where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.cxc_aplicaciones') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.cxc_aplicaciones restart identity cascade';
    else
      execute 'delete from public.cxc_aplicaciones where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.cxc_documentos') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.cxc_documentos restart identity cascade';
    else
      execute 'delete from public.cxc_documentos where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.cxc_correos_bitacora') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.cxc_correos_bitacora restart identity cascade';
    else
      execute 'delete from public.cxc_correos_bitacora where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  -- =========================
  -- INVENTARIOS / CXP
  -- =========================
  if to_regclass('public.inv_movimientos') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.inv_movimientos restart identity cascade';
    else
      execute 'delete from public.inv_movimientos where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.inv_codigos_proveedor') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.inv_codigos_proveedor restart identity cascade';
    else
      execute 'delete from public.inv_codigos_proveedor where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.inv_producto_escalas') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.inv_producto_escalas restart identity cascade';
    else
      execute 'delete from public.inv_producto_escalas where producto_id in (select id from public.inv_productos where empresa_id = $1)' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.inv_productos') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.inv_productos restart identity cascade';
    else
      execute 'delete from public.inv_productos where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.inv_categorias') is not null then
    if v_empresa_id is null then
      execute 'truncate table public.inv_categorias restart identity cascade';
    else
      execute 'delete from public.inv_categorias where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.empresa_config_cxp') is not null and not v_preservar_configs_empresa then
    if v_empresa_id is null then
      execute 'truncate table public.empresa_config_cxp restart identity cascade';
    else
      execute 'delete from public.empresa_config_cxp where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  if to_regclass('public.empresa_config_inventario') is not null and not v_preservar_configs_empresa then
    if v_empresa_id is null then
      execute 'truncate table public.empresa_config_inventario restart identity cascade';
    else
      execute 'delete from public.empresa_config_inventario where empresa_id = $1' using v_empresa_id;
    end if;
  end if;

  -- =========================
  -- TERCEROS / PARAMETROS
  -- =========================
  if not v_preservar_terceros then
    if to_regclass('public.tercero_contactos') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.tercero_contactos restart identity cascade';
      else
        execute 'delete from public.tercero_contactos where tercero_id in (select id from public.terceros where empresa_id = $1)' using v_empresa_id;
      end if;
    end if;

    if to_regclass('public.tercero_cliente_parametros') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.tercero_cliente_parametros restart identity cascade';
      else
        execute 'delete from public.tercero_cliente_parametros where tercero_id in (select id from public.terceros where empresa_id = $1)' using v_empresa_id;
      end if;
    end if;

    if to_regclass('public.tercero_proveedor_parametros') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.tercero_proveedor_parametros restart identity cascade';
      else
        execute 'delete from public.tercero_proveedor_parametros where tercero_id in (select id from public.terceros where empresa_id = $1)' using v_empresa_id;
      end if;
    end if;

    if to_regclass('public.tercero_roles') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.tercero_roles restart identity cascade';
      else
        execute 'delete from public.tercero_roles where tercero_id in (select id from public.terceros where empresa_id = $1)' using v_empresa_id;
      end if;
    end if;

    if to_regclass('public.terceros') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.terceros restart identity cascade';
      else
        execute 'delete from public.terceros where empresa_id = $1' using v_empresa_id;
      end if;
    end if;
  end if;

  -- =========================
  -- CAJAS / PUNTOS DE VENTA
  -- =========================
  if not v_preservar_cajas_puntos_venta then
    if to_regclass('public.caja_turno_medios') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.caja_turno_medios restart identity cascade';
      else
        execute 'delete from public.caja_turno_medios where turno_id in (select id from public.caja_turnos where empresa_id = $1)' using v_empresa_id;
      end if;
    end if;

    if to_regclass('public.caja_turno_bitacora') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.caja_turno_bitacora restart identity cascade';
      else
        execute 'delete from public.caja_turno_bitacora where turno_id in (select id from public.caja_turnos where empresa_id = $1)' using v_empresa_id;
      end if;
    end if;

    if to_regclass('public.caja_turnos') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.caja_turnos restart identity cascade';
      else
        execute 'delete from public.caja_turnos where empresa_id = $1' using v_empresa_id;
      end if;
    end if;

    if to_regclass('public.cajas') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.cajas restart identity cascade';
      else
        execute 'delete from public.cajas where empresa_id = $1' using v_empresa_id;
      end if;
    end if;

    if to_regclass('public.puntos_venta') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.puntos_venta restart identity cascade';
      else
        execute 'delete from public.puntos_venta where empresa_id = $1' using v_empresa_id;
      end if;
    end if;
  end if;

  -- =========================
  -- DATOS MH EMPRESA
  -- =========================
  if not v_preservar_snapshot_hacienda then
    if to_regclass('public.empresa_actividad_tributaria') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.empresa_actividad_tributaria restart identity cascade';
      else
        execute 'delete from public.empresa_actividad_tributaria where empresa_id = $1' using v_empresa_id;
      end if;
    end if;

    if to_regclass('public.empresa_hacienda_snapshot') is not null then
      if v_empresa_id is null then
        execute 'truncate table public.empresa_hacienda_snapshot restart identity cascade';
      else
        execute 'delete from public.empresa_hacienda_snapshot where empresa_id = $1' using v_empresa_id;
      end if;
    end if;
  end if;

  raise notice 'Reset completado. plan_cuentas_empresa queda vacio y Combustibles/Fusion no se toco.';
end
$$;

commit;
