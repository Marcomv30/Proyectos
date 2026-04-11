-- Smoke E2E de cierre contable controlado.
-- Valida:
-- 1) Regla de recierre/reversion
-- 2) Bloqueo estricto de movimientos (insert/update/delete) en rango cerrado
-- 3) Consulta de auditoria de cierres
--
-- Ejecutar en SQL Editor con rol postgres.
-- IMPORTANTE: este script hace pruebas reales, pero termina en ROLLBACK.

begin;

do $$
declare
v_empresa_id bigint := 1;               -- tu empresa activa
v_fecha_desde date := date '2026-01-01';
v_fecha_hasta date := date '2026-03-31';
  v_moneda text := 'CRC';      -- 'CRC' | 'USD'

  v_row record;
  v_asiento_id bigint;
  v_msg text;
  v_def text;
  v_def_up text;
  v_cc jsonb;
  v_cc_activo boolean := false;
  v_cc_ini date;
  v_cc_fin date;
  v_span_dias integer := 0;
  v_cnt bigint := 0;
begin
  if v_empresa_id is null then
    raise exception 'SMOKE: Debe indicar v_empresa_id.';
  end if;
  if v_fecha_desde is null or v_fecha_hasta is null then
    raise exception 'SMOKE: Debe indicar v_fecha_desde y v_fecha_hasta.';
  end if;
  if v_fecha_desde > v_fecha_hasta then
    raise exception 'SMOKE: Rango invalido (% > %).', v_fecha_desde, v_fecha_hasta;
  end if;

  -- Preflight: si el rango de prueba ya cae en cierre activo, el trigger bloqueara la prueba.
  select coalesce(ep.cierre_contable, public.empresa_parametros_defaults()->'cierre_contable')
    into v_cc
  from public.empresa_parametros ep
  where ep.empresa_id = v_empresa_id
  limit 1;

  if v_cc is null then
    v_cc := public.empresa_parametros_defaults()->'cierre_contable';
  end if;

  v_cc_activo := coalesce((v_cc->>'activo')::boolean, false);
  v_cc_ini := nullif(coalesce(v_cc->>'fecha_inicio', ''), '')::date;
  v_cc_fin := nullif(coalesce(v_cc->>'fecha_fin', ''), '')::date;

  if v_cc_activo and v_cc_ini is not null and v_cc_fin is not null
     and not (v_fecha_hasta < v_cc_ini or v_fecha_desde > v_cc_fin)
  then
    v_span_dias := greatest(0, v_fecha_hasta - v_fecha_desde);
    v_fecha_desde := v_cc_fin + 1;
    v_fecha_hasta := v_fecha_desde + v_span_dias;

    raise notice
      'SMOKE: Rango original se cruzaba con cierre activo (% a %). Rango ajustado automaticamente a %..%',
      v_cc_ini, v_cc_fin, v_fecha_desde, v_fecha_hasta;
  end if;

  -- Validacion estructural: trigger debe cubrir INSERT/UPDATE/DELETE.
  select pg_get_triggerdef(t.oid)
    into v_def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'asientos'
    and t.tgname = 'trg_asientos_bloqueo_cierre'
    and not t.tgisinternal
  limit 1;

  v_def_up := upper(coalesce(v_def, ''));
  if v_def_up = ''
     or position('BEFORE' in v_def_up) = 0
     or position('INSERT' in v_def_up) = 0
     or position('UPDATE' in v_def_up) = 0
     or position('DELETE' in v_def_up) = 0
  then
    raise exception 'SMOKE: Trigger trg_asientos_bloqueo_cierre no esta configurado para BEFORE INSERT/UPDATE/DELETE. Def=%', coalesce(v_def, '<null>');
  end if;

  -- 1) Ejecutar cierre.
  begin
    select *
      into v_row
    from public.ejecutar_cierre_mensual_controlado(
      v_empresa_id, v_fecha_desde, v_fecha_hasta, upper(coalesce(v_moneda, 'CRC')), true
    )
    limit 1;
  exception
    when others then
      raise exception 'SMOKE: No se pudo ejecutar cierre. Detalle=%', sqlerrm;
  end;

  v_asiento_id := v_row.asiento_id;
  if v_asiento_id is null then
    raise exception 'SMOKE: Cierre ejecutado pero no devolvio asiento_id.';
  end if;

  -- 2) Intentar recierre duplicado exacto: debe fallar.
  begin
    perform public.ejecutar_cierre_mensual_controlado(
      v_empresa_id, v_fecha_desde, v_fecha_hasta, upper(coalesce(v_moneda, 'CRC')), true
    );
    raise exception 'SMOKE: FALLO - se permitio recierre duplicado.';
  exception
    when others then
      v_msg := lower(coalesce(sqlerrm, ''));
      if position('ya existe cierre confirmado' in v_msg) = 0 then
        raise exception 'SMOKE: Recierre duplicado fallo con mensaje inesperado: %', sqlerrm;
      end if;
  end;

  -- 3) Bloqueo estricto: UPDATE en asiento del rango cerrado debe fallar.
  begin
    update public.asientos a
       set descripcion = coalesce(a.descripcion, '')
     where a.id = v_asiento_id;
    raise exception 'SMOKE: FALLO - se permitio UPDATE en fecha cerrada.';
  exception
    when others then
      v_msg := lower(coalesce(sqlerrm, ''));
      if position('periodo contable cerrado' in v_msg) = 0 then
        raise exception 'SMOKE: UPDATE bloqueado con mensaje inesperado: %', sqlerrm;
      end if;
  end;

  -- 4) Bloqueo estricto: DELETE en asiento del rango cerrado debe fallar.
  begin
    delete from public.asientos a
    where a.id = v_asiento_id;
    raise exception 'SMOKE: FALLO - se permitio DELETE en fecha cerrada.';
  exception
    when others then
      v_msg := lower(coalesce(sqlerrm, ''));
      if position('periodo contable cerrado' in v_msg) = 0 then
        raise exception 'SMOKE: DELETE bloqueado con mensaje inesperado: %', sqlerrm;
      end if;
  end;

  -- 5) Revertir cierre activo (debe funcionar).
  begin
    perform public.revertir_cierre_contable(v_empresa_id, 'SMOKE_E2E');
  exception
    when others then
      raise exception 'SMOKE: No se pudo revertir cierre. Detalle=%', sqlerrm;
  end;

  -- 6) Intentar recierre despues de reversion: debe fallar por regla de reversion previa.
  begin
    perform public.ejecutar_cierre_mensual_controlado(
      v_empresa_id, v_fecha_desde, v_fecha_hasta, upper(coalesce(v_moneda, 'CRC')), true
    );
    raise exception 'SMOKE: FALLO - se permitio recierre despues de reversion.';
  exception
    when others then
      v_msg := lower(coalesce(sqlerrm, ''));
      if position('ya fue revertido previamente' in v_msg) = 0 then
        raise exception 'SMOKE: Recierre post-reversion fallo con mensaje inesperado: %', sqlerrm;
      end if;
  end;

  -- 7) Auditoria de cierres: deben existir al menos 2 eventos en esta transaccion.
  begin
    select count(*)::bigint
      into v_cnt
    from public.get_auditoria_cierres_contables(v_empresa_id, null, null) x
    where x.accion in ('APLICADO', 'REVERTIDO');
  exception
    when others then
      raise exception 'SMOKE: No se pudo consultar auditoria de cierres. Detalle=%', sqlerrm;
  end;

  if v_cnt < 2 then
    raise exception 'SMOKE: Auditoria insuficiente. Se esperaban >=2 eventos, encontrados=%', v_cnt;
  end if;

  raise notice 'SMOKE OK: empresa=% rango=%..% asiento=% eventos_auditoria=%',
    v_empresa_id, v_fecha_desde, v_fecha_hasta, v_asiento_id, v_cnt;
end
$$;

-- No deja datos de prueba.
rollback;
