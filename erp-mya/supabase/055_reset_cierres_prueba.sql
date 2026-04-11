-- Reset manual de cierres para pruebas (NO usar en produccion).
-- Elimina asientos de cierre CER-* en un rango y empresa.
-- Ejecutar en SQL Editor con rol postgres.

begin;

do $$
declare
v_empresa_id bigint := 1;
v_fecha_desde date := null;
v_fecha_hasta date := null;
v_moneda text := null;
v_limpiar_auditoria boolean := true;
v_resetear_parametros_cierre boolean := true;
  v_del_lineas integer := 0;
  v_del_asientos integer := 0;
  v_del_auditoria integer := 0;
  v_upd_parametros integer := 0;
begin
  if v_empresa_id is null then
    raise exception 'Debe indicar la empresa activa en v_empresa_id. Este script no permite ejecucion global.';
  end if;

  create temporary table tmp_cierres_target on commit drop as
  select a.id
  from public.asientos a
  where upper(coalesce(a.numero_formato, '')) like 'CER-%'
    and a.empresa_id = v_empresa_id
    and (v_fecha_desde is null or a.fecha >= v_fecha_desde)
    and (v_fecha_hasta is null or a.fecha <= v_fecha_hasta)
    and (v_moneda is null or upper(coalesce(a.moneda, '')) = upper(v_moneda));

  delete from public.asiento_lineas l
  using tmp_cierres_target t
  where l.asiento_id = t.id;
  get diagnostics v_del_lineas = row_count;

  delete from public.asientos a
  using tmp_cierres_target t
  where a.id = t.id;
  get diagnostics v_del_asientos = row_count;

  if v_limpiar_auditoria then
    delete from public.security_audit_log s
    where s.entidad = 'empresa_parametros'
      and s.evento in ('cierre_contable_aplicado', 'cierre_contable_revertido')
      and coalesce((s.detalle->>'empresa_id')::bigint, 0) = v_empresa_id
      and (
        v_fecha_desde is null
        or coalesce(
          nullif(s.detalle->>'fecha_desde', '')::date,
          nullif(s.detalle->>'cierre_anterior_fecha_inicio', '')::date
        ) >= v_fecha_desde
      )
      and (
        v_fecha_hasta is null
        or coalesce(
          nullif(s.detalle->>'fecha_hasta', '')::date,
          nullif(s.detalle->>'cierre_anterior_fecha_fin', '')::date
        ) <= v_fecha_hasta
      );
    get diagnostics v_del_auditoria = row_count;
  end if;

  if v_resetear_parametros_cierre then
    update public.empresa_parametros ep
    set
      cierre_contable = jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(ep.cierre_contable, public.empresa_parametros_defaults()->'cierre_contable'),
            '{activo}', 'false'::jsonb, true
          ),
          '{fecha_inicio}', 'null'::jsonb, true
        ),
        '{fecha_fin}', 'null'::jsonb, true
      ),
      updated_at = now(),
      updated_by = coalesce(auth.uid(), ep.updated_by)
    where ep.empresa_id = v_empresa_id;
    get diagnostics v_upd_parametros = row_count;
  end if;

  raise notice 'Reset cierres prueba => lineas_eliminadas=% | asientos_eliminados=% | auditoria_eliminada=% | parametros_reset=%',
    v_del_lineas, v_del_asientos, v_del_auditoria, v_upd_parametros;
end
$$;

commit;
