-- Cierre mensual controlado:
-- 1) Pre-check de errores graves (smoke)
-- 2) Genera asiento de cierre ER
-- 3) Bloquea periodo contable hasta la fecha de cierre
-- Ejecutar en SQL Editor con rol postgres.
--
-- REGLAS OFICIALES (alineadas con empresa_parametros):
-- 1) Periodo fiscal siempre aplica si tiene rango definido.
-- 2) Cierre contable:
--    - activo = false  -> no bloquea por cierre.
--    - activo = true   -> solo permite fechas dentro de fecha_inicio/fecha_fin del cierre.
-- 3) El trigger de asientos valida primero fiscal y luego cierre.
-- 4) El estado/mensajes de UI deben interpretar estas reglas sin invertir condiciones.

begin;

drop function if exists public.ejecutar_cierre_mensual_controlado(bigint, date, date, text, boolean);

create or replace function public.ejecutar_cierre_mensual_controlado(
  p_empresa_id bigint,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_moneda text default 'CRC',
  p_bloquear_periodo boolean default true
)
returns table (
  asiento_id bigint,
  cierre_activo boolean,
  cierre_fecha_inicio date,
  cierre_fecha_fin date,
  precheck_errores bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_moneda text := upper(coalesce(p_moneda, 'CRC'));
  v_precheck_errores bigint := 0;
  v_asiento_id bigint;
  v_numero_formato text;
  v_asiento_existente bigint;
  v_reversion_previa bigint := 0;
  v_defaults jsonb := public.empresa_parametros_defaults();
  v_existing public.empresa_parametros%rowtype;
  v_fiscal jsonb;
  v_cierre jsonb;
  v_impuestos jsonb;
  v_facturacion jsonb;
  v_redondeo jsonb;
  v_varios jsonb;
  v_ini_exist date;
  v_fin_exist date;
  v_ini_nuevo date;
  v_fin_nuevo date;
  v_cierre_result jsonb;
  v_cierre_result_activo boolean := false;
  v_cierre_result_ini date;
  v_cierre_result_fin date;
begin
  if v_uid is null
     and current_user not in ('postgres', 'service_role')
  then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if p_fecha_desde is null or p_fecha_hasta is null then
    raise exception 'Rango de fechas requerido';
  end if;

  if p_fecha_desde > p_fecha_hasta then
    raise exception 'Rango de fechas invalido';
  end if;

  if v_moneda not in ('CRC', 'USD') then
    v_moneda := 'CRC';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not public.has_empresa_access(p_empresa_id)
  then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not (
       public.has_permission(p_empresa_id, 'contabilidad', 'editar')
       or public.has_permission(p_empresa_id, 'contabilidad', 'aprobar')
     )
  then
    raise exception 'No tiene permisos para ejecutar cierre mensual';
  end if;

  -- Evita doble ejecucion concurrente para mismo rango.
  perform pg_advisory_xact_lock(
    hashtext('cierre-mensual-' || p_empresa_id::text || '-' || to_char(p_fecha_desde, 'YYYYMMDD') || '-' || to_char(p_fecha_hasta, 'YYYYMMDD'))
  );

  -- Advertencia dura: no permitir volver a cerrar exactamente el mismo rango/moneda.
  v_numero_formato :=
    'CER-' ||
    to_char(p_fecha_desde, 'YYMMDD') || '-' ||
    to_char(p_fecha_hasta, 'YYMMDD') || '-' ||
    substring(v_moneda, 1, 1);

  -- Si ya se revirtió este mismo rango (o una reversion sin rango), no permitir recierre automático.
  select count(*)::bigint
    into v_reversion_previa
  from public.security_audit_log s
  where s.entidad = 'empresa_parametros'
    and s.evento = 'cierre_contable_revertido'
    and coalesce((s.detalle->>'empresa_id')::bigint, 0) = p_empresa_id
    and (
      (
        coalesce(
          nullif(s.detalle->>'cierre_anterior_fecha_inicio', '')::date,
          nullif(s.detalle->>'fecha_desde', '')::date
        ) = p_fecha_desde
        and
        coalesce(
          nullif(s.detalle->>'cierre_anterior_fecha_fin', '')::date,
          nullif(s.detalle->>'fecha_hasta', '')::date
        ) = p_fecha_hasta
      )
      or (
        coalesce(
          nullif(s.detalle->>'cierre_anterior_fecha_inicio', '')::date,
          nullif(s.detalle->>'fecha_desde', '')::date
        ) is null
        and
        coalesce(
          nullif(s.detalle->>'cierre_anterior_fecha_fin', '')::date,
          nullif(s.detalle->>'fecha_hasta', '')::date
        ) is null
      )
    );

  if v_reversion_previa > 0 then
    raise exception 'Este rango ya fue revertido previamente (% a %). Para recerrar, primero haga limpieza manual de cierres de prueba.', p_fecha_desde, p_fecha_hasta;
  end if;

  select a.id
    into v_asiento_existente
  from public.asientos a
  where a.empresa_id = p_empresa_id
    and a.estado = 'CONFIRMADO'
    and lower(btrim(coalesce(a.numero_formato, ''))) = lower(btrim(v_numero_formato))
  order by a.id desc
  limit 1;

  if v_asiento_existente is not null then
    raise exception 'Ya existe cierre confirmado para el rango/moneda (numero_formato=% , asiento_id=%)', v_numero_formato, v_asiento_existente;
  end if;

  select coalesce(sum(s.total), 0)::bigint
    into v_precheck_errores
  from public.get_contabilidad_smoke(p_empresa_id, p_fecha_desde, p_fecha_hasta) s
  where s.severity = 'ERROR';

  if v_precheck_errores > 0 then
    raise exception 'Pre-check con errores: % hallazgos ERROR. Revise Smoke Contable antes de cerrar.', v_precheck_errores;
  end if;

  v_asiento_id := public.generar_cierre_estado_resultados(
    p_empresa_id,
    p_fecha_desde,
    p_fecha_hasta,
    v_moneda
  );

  if p_bloquear_periodo then
    select *
      into v_existing
    from public.empresa_parametros ep
    where ep.empresa_id = p_empresa_id
    limit 1;

    v_fiscal := coalesce(v_existing.fiscal, v_defaults->'fiscal');
    v_cierre := coalesce(v_existing.cierre_contable, v_defaults->'cierre_contable');
    v_impuestos := coalesce(v_existing.impuestos, v_defaults->'impuestos');
    v_facturacion := coalesce(v_existing.facturacion, v_defaults->'facturacion');
    v_redondeo := coalesce(v_existing.redondeo, v_defaults->'redondeo');
    v_varios := coalesce(v_existing.varios, v_defaults->'varios');

    v_ini_exist := nullif(coalesce(v_cierre->>'fecha_inicio', ''), '')::date;
    v_fin_exist := nullif(coalesce(v_cierre->>'fecha_fin', ''), '')::date;

    v_ini_nuevo := case
      when v_ini_exist is null then p_fecha_desde
      else least(v_ini_exist, p_fecha_desde)
    end;

    v_fin_nuevo := case
      when v_fin_exist is null then p_fecha_hasta
      else greatest(v_fin_exist, p_fecha_hasta)
    end;

    v_cierre := jsonb_set(v_cierre, '{activo}', 'true'::jsonb, true);
    v_cierre := jsonb_set(v_cierre, '{fecha_inicio}', to_jsonb(v_ini_nuevo), true);
    v_cierre := jsonb_set(v_cierre, '{fecha_fin}', to_jsonb(v_fin_nuevo), true);
    v_cierre := jsonb_set(
      v_cierre,
      '{modulos_aplica}',
      jsonb_build_array(
        'contabilidad',
        'compras',
        'gastos',
        'ingresos',
        'facturacion',
        'bancos',
        'cxp',
        'cxc',
        'planilla',
        'inventarios',
        'activos',
        'costos'
      ),
      true
    );

    insert into public.empresa_parametros (
      empresa_id, fiscal, cierre_contable, impuestos, facturacion, redondeo, varios, version, updated_at, updated_by
    ) values (
      p_empresa_id, v_fiscal, v_cierre, v_impuestos, v_facturacion, v_redondeo, v_varios, 1, now(), v_uid
    )
    on conflict (empresa_id) do update
    set
      fiscal = excluded.fiscal,
      cierre_contable = excluded.cierre_contable,
      impuestos = excluded.impuestos,
      facturacion = excluded.facturacion,
      redondeo = excluded.redondeo,
      varios = excluded.varios,
      version = public.empresa_parametros.version + 1,
      updated_at = now(),
      updated_by = v_uid;
  end if;

  select coalesce(ep.cierre_contable, v_defaults->'cierre_contable')
    into v_cierre_result
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  if v_cierre_result is null then
    v_cierre_result := v_defaults->'cierre_contable';
  end if;

  v_cierre_result_activo := coalesce((v_cierre_result->>'activo')::boolean, false);
  v_cierre_result_ini := nullif(coalesce(v_cierre_result->>'fecha_inicio', ''), '')::date;
  v_cierre_result_fin := nullif(coalesce(v_cierre_result->>'fecha_fin', ''), '')::date;

  perform public.audit_event(
    'cierre_contable_aplicado',
    'empresa_parametros',
    p_empresa_id::text,
    jsonb_build_object(
      'empresa_id', p_empresa_id,
      'fecha_desde', p_fecha_desde,
      'fecha_hasta', p_fecha_hasta,
      'moneda', v_moneda,
      'asiento_id', v_asiento_id,
      'numero_formato', v_numero_formato,
      'bloquear_periodo', p_bloquear_periodo,
      'cierre_resultante_activo', v_cierre_result_activo,
      'cierre_resultante_fecha_inicio', v_cierre_result_ini,
      'cierre_resultante_fecha_fin', v_cierre_result_fin
    )
  );

  return query
  select
    v_asiento_id,
    coalesce((ep.cierre_contable->>'activo')::boolean, false) as cierre_activo,
    nullif(coalesce(ep.cierre_contable->>'fecha_inicio', ''), '')::date as cierre_fecha_inicio,
    nullif(coalesce(ep.cierre_contable->>'fecha_fin', ''), '')::date as cierre_fecha_fin,
    v_precheck_errores
  from (select 1 as dummy) d
  left join public.empresa_parametros ep
    on ep.empresa_id = p_empresa_id;
end;
$$;

grant execute on function public.ejecutar_cierre_mensual_controlado(bigint, date, date, text, boolean) to authenticated;
grant execute on function public.ejecutar_cierre_mensual_controlado(bigint, date, date, text, boolean) to service_role;

drop function if exists public.revertir_cierre_contable(bigint, text);

create or replace function public.revertir_cierre_contable(
  p_empresa_id bigint,
  p_motivo text default null
)
returns table (
  cierre_activo boolean,
  cierre_fecha_inicio date,
  cierre_fecha_fin date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_defaults jsonb := public.empresa_parametros_defaults();
  v_existing public.empresa_parametros%rowtype;
  v_fiscal jsonb;
  v_cierre jsonb;
  v_impuestos jsonb;
  v_facturacion jsonb;
  v_redondeo jsonb;
  v_varios jsonb;
  v_old_ini date;
  v_old_fin date;
  v_old_activo boolean := false;
  v_cierre_result jsonb;
  v_cierre_result_activo boolean := false;
  v_cierre_result_ini date;
  v_cierre_result_fin date;
begin
  if v_uid is null
     and current_user not in ('postgres', 'service_role')
  then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if current_user not in ('postgres', 'service_role')
     and not public.has_empresa_access(p_empresa_id)
  then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  -- Solo Admin/Superusuario.
  if current_user not in ('postgres', 'service_role')
     and not (
       public.is_superuser(v_uid)
       or public.has_permission(p_empresa_id, 'mantenimientos', 'editar')
       or public.has_permission(p_empresa_id, 'contabilidad', 'aprobar')
     )
  then
    raise exception 'No tiene permisos para revertir cierre contable';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('revertir-cierre-contable-' || p_empresa_id::text)
  );

  select *
    into v_existing
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  v_fiscal := coalesce(v_existing.fiscal, v_defaults->'fiscal');
  v_cierre := coalesce(v_existing.cierre_contable, v_defaults->'cierre_contable');
  v_impuestos := coalesce(v_existing.impuestos, v_defaults->'impuestos');
  v_facturacion := coalesce(v_existing.facturacion, v_defaults->'facturacion');
  v_redondeo := coalesce(v_existing.redondeo, v_defaults->'redondeo');
  v_varios := coalesce(v_existing.varios, v_defaults->'varios');

  v_old_activo := coalesce((v_cierre->>'activo')::boolean, false);
  v_old_ini := nullif(coalesce(v_cierre->>'fecha_inicio', ''), '')::date;
  v_old_fin := nullif(coalesce(v_cierre->>'fecha_fin', ''), '')::date;

  if not v_old_activo or v_old_ini is null or v_old_fin is null then
    raise exception 'No hay cierre contable activo para revertir en la empresa %', p_empresa_id;
  end if;

  -- Reversion: deja sin cierre activo.
  v_cierre := jsonb_set(v_cierre, '{activo}', 'false'::jsonb, true);
  v_cierre := jsonb_set(v_cierre, '{fecha_inicio}', 'null'::jsonb, true);
  v_cierre := jsonb_set(v_cierre, '{fecha_fin}', 'null'::jsonb, true);
  v_cierre := jsonb_set(
    v_cierre,
    '{modulos_aplica}',
    jsonb_build_array(
      'contabilidad',
      'compras',
      'gastos',
      'ingresos',
      'facturacion',
      'bancos',
      'cxp',
      'cxc',
      'planilla',
      'inventarios',
      'activos',
      'costos'
    ),
    true
  );

  insert into public.empresa_parametros (
    empresa_id, fiscal, cierre_contable, impuestos, facturacion, redondeo, varios, version, updated_at, updated_by
  ) values (
    p_empresa_id, v_fiscal, v_cierre, v_impuestos, v_facturacion, v_redondeo, v_varios, 1, now(), v_uid
  )
  on conflict (empresa_id) do update
  set
    fiscal = excluded.fiscal,
    cierre_contable = excluded.cierre_contable,
    impuestos = excluded.impuestos,
    facturacion = excluded.facturacion,
    redondeo = excluded.redondeo,
    varios = excluded.varios,
    version = public.empresa_parametros.version + 1,
    updated_at = now(),
    updated_by = v_uid;

  select coalesce(ep.cierre_contable, v_defaults->'cierre_contable')
    into v_cierre_result
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  if v_cierre_result is null then
    v_cierre_result := v_defaults->'cierre_contable';
  end if;

  v_cierre_result_activo := coalesce((v_cierre_result->>'activo')::boolean, false);
  v_cierre_result_ini := nullif(coalesce(v_cierre_result->>'fecha_inicio', ''), '')::date;
  v_cierre_result_fin := nullif(coalesce(v_cierre_result->>'fecha_fin', ''), '')::date;

  perform public.audit_event(
    'cierre_contable_revertido',
    'empresa_parametros',
    p_empresa_id::text,
    jsonb_build_object(
      'empresa_id', p_empresa_id,
      'motivo', coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'SIN_MOTIVO'),
      'fecha_desde', v_old_ini,
      'fecha_hasta', v_old_fin,
      'cierre_anterior_activo', v_old_activo,
      'cierre_anterior_fecha_inicio', v_old_ini,
      'cierre_anterior_fecha_fin', v_old_fin,
      'cierre_resultante_activo', v_cierre_result_activo,
      'cierre_resultante_fecha_inicio', v_cierre_result_ini,
      'cierre_resultante_fecha_fin', v_cierre_result_fin
    )
  );

  return query
  select
    coalesce((ep.cierre_contable->>'activo')::boolean, false) as cierre_activo,
    nullif(coalesce(ep.cierre_contable->>'fecha_inicio', ''), '')::date as cierre_fecha_inicio,
    nullif(coalesce(ep.cierre_contable->>'fecha_fin', ''), '')::date as cierre_fecha_fin
  from (select 1 as dummy) d
  left join public.empresa_parametros ep
    on ep.empresa_id = p_empresa_id;
end;
$$;

grant execute on function public.revertir_cierre_contable(bigint, text) to authenticated;
grant execute on function public.revertir_cierre_contable(bigint, text) to service_role;

-- Bloqueo por cierre activo: solo bloquea cuando existe rango cerrado activo.
create or replace function public.trg_asientos_bloqueo_cierre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id bigint;
  v_fecha date;
  v_cc jsonb;
  v_fiscal jsonb;
  v_activo boolean := false;
  v_fiscal_ini date;
  v_fiscal_fin date;
  v_ini date;
  v_fin date;
begin
  if tg_op = 'DELETE' then
    v_empresa_id := old.empresa_id;
    v_fecha := old.fecha;
  else
    v_empresa_id := new.empresa_id;
    v_fecha := new.fecha;
  end if;

  if v_empresa_id is null or v_fecha is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Si no hay cierre activo/rango definido, se permite registrar.
  select
    coalesce(ep.cierre_contable, public.empresa_parametros_defaults()->'cierre_contable'),
    coalesce(ep.fiscal, public.empresa_parametros_defaults()->'fiscal')
    into v_cc, v_fiscal
  from public.empresa_parametros ep
  where ep.empresa_id = v_empresa_id
  limit 1;

  if v_cc is null then
    v_cc := public.empresa_parametros_defaults()->'cierre_contable';
  end if;
  if v_fiscal is null then
    v_fiscal := public.empresa_parametros_defaults()->'fiscal';
  end if;

  v_activo := coalesce((v_cc->>'activo')::boolean, false);
  v_fiscal_ini := nullif(v_fiscal->>'fecha_inicio', '')::date;
  v_fiscal_fin := nullif(v_fiscal->>'fecha_fin', '')::date;
  v_ini := nullif(v_cc->>'fecha_inicio', '')::date;
  v_fin := nullif(v_cc->>'fecha_fin', '')::date;

  -- Siempre restringe fuera de periodo fiscal cuando existe rango fiscal configurado.
  if v_fiscal_ini is not null and v_fiscal_fin is not null
     and (v_fecha < v_fiscal_ini or v_fecha > v_fiscal_fin) then
    raise exception 'Fecha % fuera del periodo fiscal (% a %)', v_fecha, v_fiscal_ini, v_fiscal_fin;
  end if;

  if not v_activo or v_ini is null or v_fin is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Con cierre activo, solo se permite registrar dentro del rango configurado.
  if v_fecha < v_ini or v_fecha > v_fin then
    raise exception 'Fecha % fuera del periodo contable habilitado (% a %)', v_fecha, v_ini, v_fin;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asientos_bloqueo_cierre on public.asientos;
create trigger trg_asientos_bloqueo_cierre
before insert or update or delete
on public.asientos
for each row
execute function public.trg_asientos_bloqueo_cierre();

commit;
