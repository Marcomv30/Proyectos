-- Parametros de empresa (modelo base + override por empresa) con historial.
-- Ejecutar en SQL Editor con rol postgres.
--
-- REGLAS OFICIALES (periodo fiscal + cierre contable):
-- 1) El periodo fiscal SIEMPRE aplica si tiene fecha_inicio y fecha_fin.
--    - Fuera de ese rango fiscal: bloqueado.
-- 2) Cierre contable:
--    - activo = false  -> no bloquea por cierre (solo aplica regla fiscal).
--    - activo = true   -> bloquea fuera de cierre_contable.fecha_inicio/fecha_fin.
-- 3) Si cierre activo no tiene rango completo (inicio/fin), no bloquea por cierre.
-- 4) La validacion de UI debe reflejar exactamente estas reglas.

begin;

create table if not exists public.empresa_parametros (
  empresa_id bigint primary key references public.empresas(id) on delete cascade,
  fiscal jsonb not null default '{}'::jsonb,
  cierre_contable jsonb not null default '{}'::jsonb,
  impuestos jsonb not null default '{}'::jsonb,
  facturacion jsonb not null default '{}'::jsonb,
  redondeo jsonb not null default '{}'::jsonb,
  varios jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

alter table public.empresa_parametros
  add column if not exists cierre_contable jsonb not null default '{}'::jsonb;

create table if not exists public.empresa_parametros_hist (
  id bigserial primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid null
);

create index if not exists idx_empresa_parametros_hist_empresa on public.empresa_parametros_hist(empresa_id, id desc);

alter table public.empresa_parametros enable row level security;
alter table public.empresa_parametros_hist enable row level security;

drop policy if exists empresa_parametros_select_authenticated on public.empresa_parametros;
create policy empresa_parametros_select_authenticated
on public.empresa_parametros
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'ver')
);

drop policy if exists empresa_parametros_write_authenticated on public.empresa_parametros;
create policy empresa_parametros_write_authenticated
on public.empresa_parametros
for all
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'editar')
)
with check (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'editar')
);

drop policy if exists empresa_parametros_hist_select_authenticated on public.empresa_parametros_hist;
create policy empresa_parametros_hist_select_authenticated
on public.empresa_parametros_hist
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'ver')
);

create or replace function public.empresa_parametros_defaults()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'fiscal', jsonb_build_object(
      'fecha_inicio', null,
      'fecha_fin', null,
      'semana_inicia_en', 1
    ),
    'impuestos', jsonb_build_object(
      'impuesto_ventas', 13,
      'otros_impuestos', 0,
      'impuesto_renta', 30,
      'impuesto_consumo', 0,
      'tipo_contribuyente', 'persona_juridica',
      'juridica_tope_logica', 'TASA_PLANA',
      'regimen_renta', 'PERSONA_JURIDICA_PYME',
      'ingreso_bruto_anual', null
    ),
    'cierre_contable', jsonb_build_object(
      'activo', false,
      'fecha_inicio', null,
      'fecha_fin', null,
      'modulos_aplica', jsonb_build_array('contabilidad')
    ),
    'facturacion', jsonb_build_object(
      'tipo_facturacion', 'inventario',
      'impuesto_venta_incluido', true,
      'facturar_en_negativo', false,
      'impresion_en_linea', false,
      'ver_saldo_inventario', false,
      'consulta_hacienda', false,
      'lineas_por_factura', 0
    ),
    'redondeo', jsonb_build_object(
      'modo', '0.05',
      'descripcion', 'A 5 centimos'
    ),
    'varios', jsonb_build_object(
      'aplica_proyectos', false,
      'catalogo_unico_proveedores', false,
      'planilla_por_horas', false,
      'aplica_cobros_contabilidad', false,
      'aplica_descuentos', false,
      'imprimir_cheques_formularios', false,
      'control_limite_credito', false,
      'aplica_compras_contabilidad', false,
      'control_cheques_postfechados', false,
      'eeff_umbral_alerta_conciliacion', 10000,
      'tipo_cambio', jsonb_build_object(
        'fecha', null,
        'compra', 0,
        'venta', 0,
        'fijar', 0
      )
    )
  );
$$;

grant execute on function public.empresa_parametros_defaults() to authenticated;
grant execute on function public.empresa_parametros_defaults() to service_role;

create or replace function public.log_empresa_parametros_hist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.empresa_parametros_hist (
    empresa_id,
    version,
    snapshot,
    changed_by
  ) values (
    new.empresa_id,
    new.version,
    jsonb_build_object(
      'fiscal', new.fiscal,
      'cierre_contable', new.cierre_contable,
      'impuestos', new.impuestos,
      'facturacion', new.facturacion,
      'redondeo', new.redondeo,
      'varios', new.varios
    ),
    new.updated_by
  );
  return new;
end;
$$;

drop trigger if exists trg_log_empresa_parametros_hist on public.empresa_parametros;
create trigger trg_log_empresa_parametros_hist
after insert or update on public.empresa_parametros
for each row
execute function public.log_empresa_parametros_hist();

create or replace function public.get_empresa_parametros(
  p_empresa_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_defaults jsonb := public.empresa_parametros_defaults();
  v_row public.empresa_parametros%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if not public.has_empresa_access(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if not public.has_permission(p_empresa_id, 'mantenimientos', 'ver') then
    raise exception 'No tiene permisos para ver parametros de empresa';
  end if;

  select *
    into v_row
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  if v_row.empresa_id is null then
    return v_defaults || jsonb_build_object('_meta', jsonb_build_object(
      'empresa_id', p_empresa_id,
      'version', 0,
      'modo', 'default',
      'updated_at', null
    ));
  end if;

  return jsonb_build_object(
    'fiscal', coalesce(v_row.fiscal, v_defaults->'fiscal'),
    'cierre_contable', coalesce(v_row.cierre_contable, v_defaults->'cierre_contable'),
    'impuestos', coalesce(v_row.impuestos, v_defaults->'impuestos'),
    'facturacion', coalesce(v_row.facturacion, v_defaults->'facturacion'),
    'redondeo', coalesce(v_row.redondeo, v_defaults->'redondeo'),
    'varios', coalesce(v_row.varios, v_defaults->'varios'),
    '_meta', jsonb_build_object(
      'empresa_id', v_row.empresa_id,
      'version', v_row.version,
      'modo', 'override_empresa',
      'updated_at', v_row.updated_at
    )
  );
end;
$$;

grant execute on function public.get_empresa_parametros(bigint) to authenticated;
grant execute on function public.get_empresa_parametros(bigint) to service_role;

create or replace function public.set_empresa_parametros(
  p_empresa_id bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_defaults jsonb := public.empresa_parametros_defaults();
  v_existing public.empresa_parametros%rowtype;
  v_fiscal jsonb;
  v_cierre_contable jsonb;
  v_impuestos jsonb;
  v_facturacion jsonb;
  v_redondeo jsonb;
  v_varios jsonb;
  v_fiscal_ini date;
  v_fiscal_fin date;
  v_cierre_activo boolean := false;
  v_cierre_ini date;
  v_cierre_fin date;
begin
  if v_uid is null then
    raise exception 'Sesion invalida';
  end if;

  if p_empresa_id is null then
    raise exception 'Empresa requerida';
  end if;

  if not public.has_empresa_access(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa';
  end if;

  if not public.has_permission(p_empresa_id, 'mantenimientos', 'editar') then
    raise exception 'No tiene permisos para actualizar parametros de empresa';
  end if;

  select *
    into v_existing
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  v_fiscal := coalesce(p_payload->'fiscal', v_existing.fiscal, v_defaults->'fiscal');
  v_cierre_contable := coalesce(p_payload->'cierre_contable', v_existing.cierre_contable, v_defaults->'cierre_contable');
  v_impuestos := coalesce(p_payload->'impuestos', v_existing.impuestos, v_defaults->'impuestos');
  v_facturacion := coalesce(p_payload->'facturacion', v_existing.facturacion, v_defaults->'facturacion');
  v_redondeo := coalesce(p_payload->'redondeo', v_existing.redondeo, v_defaults->'redondeo');
  v_varios := coalesce(p_payload->'varios', v_existing.varios, v_defaults->'varios');

  -- Validaciones de coherencia para evitar estados invalidos por llamadas RPC directas.
  v_fiscal_ini := nullif(v_fiscal->>'fecha_inicio', '')::date;
  v_fiscal_fin := nullif(v_fiscal->>'fecha_fin', '')::date;
  if v_fiscal_ini is not null and v_fiscal_fin is not null and v_fiscal_ini > v_fiscal_fin then
    raise exception 'Rango fiscal invalido: fecha_inicio (%) no puede ser mayor que fecha_fin (%)', v_fiscal_ini, v_fiscal_fin;
  end if;

  v_cierre_activo := coalesce((v_cierre_contable->>'activo')::boolean, false);
  v_cierre_ini := nullif(v_cierre_contable->>'fecha_inicio', '')::date;
  v_cierre_fin := nullif(v_cierre_contable->>'fecha_fin', '')::date;
  if v_cierre_activo and (v_cierre_ini is null or v_cierre_fin is null) then
    raise exception 'Cierre contable activo requiere fecha_inicio y fecha_fin';
  end if;
  if v_cierre_ini is not null and v_cierre_fin is not null and v_cierre_ini > v_cierre_fin then
    raise exception 'Rango de cierre invalido: fecha_inicio (%) no puede ser mayor que fecha_fin (%)', v_cierre_ini, v_cierre_fin;
  end if;

  insert into public.empresa_parametros (
    empresa_id,
    fiscal,
    cierre_contable,
    impuestos,
    facturacion,
    redondeo,
    varios,
    version,
    updated_at,
    updated_by
  ) values (
    p_empresa_id,
    v_fiscal,
    v_cierre_contable,
    v_impuestos,
    v_facturacion,
    v_redondeo,
    v_varios,
    1,
    now(),
    v_uid
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

  return public.get_empresa_parametros(p_empresa_id);
end;
$$;

grant execute on function public.set_empresa_parametros(bigint, jsonb) to authenticated;
grant execute on function public.set_empresa_parametros(bigint, jsonb) to service_role;

create or replace function public.reset_empresa_parametros(
  p_empresa_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.set_empresa_parametros(p_empresa_id, public.empresa_parametros_defaults());
end;
$$;

grant execute on function public.reset_empresa_parametros(bigint) to authenticated;
grant execute on function public.reset_empresa_parametros(bigint) to service_role;

grant select, insert, update on table public.empresa_parametros to authenticated;
grant select on table public.empresa_parametros_hist to authenticated;

commit;

begin;

-- Regla de periodo contable permitido (aplica sobre fecha de asiento).
-- Si cierre_contable.activo=false o no hay rango definido, no se restringe.
create or replace function public.is_fecha_en_periodo_contable(
  p_empresa_id bigint,
  p_fecha date
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cc jsonb;
  v_fiscal jsonb;
  v_activo boolean := false;
  v_fiscal_ini date;
  v_fiscal_fin date;
  v_ini date;
  v_fin date;
begin
  if p_empresa_id is null or p_fecha is null then
    return true;
  end if;

  select
    coalesce(ep.cierre_contable, public.empresa_parametros_defaults()->'cierre_contable'),
    coalesce(ep.fiscal, public.empresa_parametros_defaults()->'fiscal')
    into v_cc, v_fiscal
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
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

  if v_fiscal_ini is not null and v_fiscal_fin is not null
     and (p_fecha < v_fiscal_ini or p_fecha > v_fiscal_fin) then
    return false;
  end if;

  if not v_activo or v_ini is null or v_fin is null then
    return true;
  end if;

  return p_fecha between v_ini and v_fin;
end;
$$;

grant execute on function public.is_fecha_en_periodo_contable(bigint, date) to authenticated;
grant execute on function public.is_fecha_en_periodo_contable(bigint, date) to service_role;

create or replace function public.is_fecha_en_periodo_contable_modulo(
  p_empresa_id bigint,
  p_fecha date,
  p_modulo_codigo text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cc jsonb;
  v_modulos jsonb;
  v_modulo text := lower(coalesce(p_modulo_codigo, ''));
begin
  if p_empresa_id is null or p_fecha is null then
    return true;
  end if;

  if v_modulo = '' then
    return true;
  end if;

  select coalesce(ep.cierre_contable, public.empresa_parametros_defaults()->'cierre_contable')
    into v_cc
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  if v_cc is null then
    v_cc := public.empresa_parametros_defaults()->'cierre_contable';
  end if;

  v_modulos := coalesce(v_cc->'modulos_aplica', public.empresa_parametros_defaults()->'cierre_contable'->'modulos_aplica');

  if not exists (
    select 1
    from jsonb_array_elements_text(v_modulos) x
    where lower(x) = v_modulo
  ) then
    -- Si el modulo no esta marcado, no se aplica restriccion de periodo.
    return true;
  end if;

  return public.is_fecha_en_periodo_contable(p_empresa_id, p_fecha);
end;
$$;

grant execute on function public.is_fecha_en_periodo_contable_modulo(bigint, date, text) to authenticated;
grant execute on function public.is_fecha_en_periodo_contable_modulo(bigint, date, text) to service_role;

create or replace function public.assert_periodo_contable_abierto(
  p_empresa_id bigint,
  p_fecha date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_fecha_en_periodo_contable_modulo(p_empresa_id, p_fecha, 'contabilidad') then
    raise exception 'Fecha % fuera del periodo contable permitido', p_fecha;
  end if;
end;
$$;

grant execute on function public.assert_periodo_contable_abierto(bigint, date) to authenticated;
grant execute on function public.assert_periodo_contable_abierto(bigint, date) to service_role;

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

-- Compatibilidad hacia atras (nombres antiguos).
create or replace function public.is_fecha_en_cierre_contable(
  p_empresa_id bigint,
  p_fecha date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_fecha_en_periodo_contable(p_empresa_id, p_fecha);
$$;

grant execute on function public.is_fecha_en_cierre_contable(bigint, date) to authenticated;
grant execute on function public.is_fecha_en_cierre_contable(bigint, date) to service_role;

create or replace function public.is_fecha_en_cierre_contable_modulo(
  p_empresa_id bigint,
  p_fecha date,
  p_modulo_codigo text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_fecha_en_periodo_contable_modulo(p_empresa_id, p_fecha, p_modulo_codigo);
$$;

grant execute on function public.is_fecha_en_cierre_contable_modulo(bigint, date, text) to authenticated;
grant execute on function public.is_fecha_en_cierre_contable_modulo(bigint, date, text) to service_role;

drop trigger if exists trg_asientos_bloqueo_cierre on public.asientos;
create trigger trg_asientos_bloqueo_cierre
before insert or update or delete on public.asientos
for each row
execute function public.trg_asientos_bloqueo_cierre();

commit;
