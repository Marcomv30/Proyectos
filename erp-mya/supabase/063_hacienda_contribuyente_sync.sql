-- Sincronizacion de contribuyente MH por empresa + actividades tributarias.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.actividad_tributaria (
  id bigserial primary key,
  codigo text not null unique,
  descripcion text not null,
  categoria text null,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.empresa_actividad_tributaria (
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  actividad_tributaria_id bigint not null references public.actividad_tributaria(id) on delete restrict,
  principal boolean not null default false,
  fuente text not null default 'MH_API',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, actividad_tributaria_id)
);

create unique index if not exists ux_empresa_actividad_tributaria_principal
  on public.empresa_actividad_tributaria(empresa_id)
  where principal = true;

create table if not exists public.empresa_hacienda_snapshot (
  empresa_id bigint primary key references public.empresas(id) on delete cascade,
  cedula text null,
  nombre text null,
  tipo_identificacion text null,
  situacion text null,
  regimen text null,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

alter table public.actividad_tributaria enable row level security;
alter table public.empresa_actividad_tributaria enable row level security;
alter table public.empresa_hacienda_snapshot enable row level security;

drop policy if exists actividad_tributaria_select_authenticated on public.actividad_tributaria;
create policy actividad_tributaria_select_authenticated
on public.actividad_tributaria
for select
to authenticated
using (true);

drop policy if exists empresa_hacienda_snapshot_select_authenticated on public.empresa_hacienda_snapshot;
create policy empresa_hacienda_snapshot_select_authenticated
on public.empresa_hacienda_snapshot
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'ver')
);

drop policy if exists empresa_hacienda_snapshot_write_authenticated on public.empresa_hacienda_snapshot;
create policy empresa_hacienda_snapshot_write_authenticated
on public.empresa_hacienda_snapshot
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

drop policy if exists empresa_actividad_tributaria_select_authenticated on public.empresa_actividad_tributaria;
create policy empresa_actividad_tributaria_select_authenticated
on public.empresa_actividad_tributaria
for select
to authenticated
using (
  public.has_empresa_access(empresa_id)
  and public.has_permission(empresa_id, 'mantenimientos', 'ver')
);

drop policy if exists empresa_actividad_tributaria_write_authenticated on public.empresa_actividad_tributaria;
create policy empresa_actividad_tributaria_write_authenticated
on public.empresa_actividad_tributaria
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

create or replace function public.sync_empresa_hacienda(
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
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_cedula text;
  v_nombre text;
  v_tipo_identificacion text;
  v_situacion text;
  v_regimen text;
  v_tipo_contribuyente text := 'persona_juridica';
  v_actividades jsonb := '[]'::jsonb;
  v_item jsonb;
  v_codigo text;
  v_descripcion text;
  v_categoria text;
  v_actividad_id bigint;
  v_i integer := 0;
  v_count bigint := 0;
  v_impuestos jsonb;
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

  if current_user not in ('postgres', 'service_role')
     and not public.has_permission(p_empresa_id, 'mantenimientos', 'editar')
  then
    raise exception 'No tiene permisos para sincronizar datos de contribuyente';
  end if;

  v_cedula := coalesce(
    nullif(v_payload->>'cedula', ''),
    nullif(v_payload->>'identificacion', ''),
    nullif(v_payload#>>'{contribuyente,cedula}', ''),
    nullif(v_payload#>>'{contribuyente,identificacion}', '')
  );
  v_nombre := coalesce(
    nullif(v_payload->>'nombre', ''),
    nullif(v_payload#>>'{contribuyente,nombre}', ''),
    nullif(v_payload#>>'{data,nombre}', '')
  );
  v_tipo_identificacion := coalesce(
    nullif(v_payload->>'tipo_identificacion', ''),
    nullif(v_payload#>>'{contribuyente,tipo_identificacion}', ''),
    nullif(v_payload#>>'{data,tipo_identificacion}', '')
  );
  v_situacion := coalesce(
    nullif(v_payload->>'situacion', ''),
    nullif(v_payload#>>'{contribuyente,situacion}', ''),
    nullif(v_payload#>>'{data,situacion}', '')
  );
  v_regimen := coalesce(
    nullif(v_payload->>'regimen', ''),
    nullif(v_payload#>>'{contribuyente,regimen}', ''),
    nullif(v_payload#>>'{data,regimen}', '')
  );

  if jsonb_typeof(v_payload->'actividades') = 'array' then
    v_actividades := v_payload->'actividades';
  elsif jsonb_typeof(v_payload#>'{contribuyente,actividades}') = 'array' then
    v_actividades := v_payload#>'{contribuyente,actividades}';
  elsif jsonb_typeof(v_payload#>'{data,actividades}') = 'array' then
    v_actividades := v_payload#>'{data,actividades}';
  else
    v_actividades := '[]'::jsonb;
  end if;

  if position('FISICA' in upper(coalesce(v_tipo_identificacion, ''))) > 0
     or position('FISICA' in upper(coalesce(v_payload->>'tipo_contribuyente', ''))) > 0
  then
    v_tipo_contribuyente := 'persona_fisica';
  else
    v_tipo_contribuyente := 'persona_juridica';
  end if;

  insert into public.empresa_hacienda_snapshot (
    empresa_id,
    cedula,
    nombre,
    tipo_identificacion,
    situacion,
    regimen,
    raw_payload,
    updated_at,
    updated_by
  )
  values (
    p_empresa_id,
    v_cedula,
    v_nombre,
    v_tipo_identificacion,
    v_situacion,
    v_regimen,
    v_payload,
    now(),
    v_uid
  )
  on conflict (empresa_id) do update
  set
    cedula = excluded.cedula,
    nombre = excluded.nombre,
    tipo_identificacion = excluded.tipo_identificacion,
    situacion = excluded.situacion,
    regimen = excluded.regimen,
    raw_payload = excluded.raw_payload,
    updated_at = now(),
    updated_by = v_uid;

  delete from public.empresa_actividad_tributaria
  where empresa_id = p_empresa_id;

  for v_item in
    select x
    from jsonb_array_elements(v_actividades) t(x)
  loop
    v_codigo := coalesce(
      nullif(v_item->>'codigo', ''),
      nullif(v_item->>'codigo_actividad', ''),
      nullif(v_item->>'codActividad', ''),
      nullif(v_item->>'id', '')
    );
    v_descripcion := coalesce(
      nullif(v_item->>'descripcion', ''),
      nullif(v_item->>'detalle', ''),
      nullif(v_item->>'nombre', ''),
      nullif(v_item->>'actividad', '')
    );
    v_categoria := coalesce(
      nullif(v_item->>'categoria', ''),
      nullif(v_item->>'grupo', '')
    );

    if v_codigo is null or v_descripcion is null then
      continue;
    end if;

    insert into public.actividad_tributaria (codigo, descripcion, categoria, activo, updated_at)
    values (v_codigo, v_descripcion, v_categoria, true, now())
    on conflict (codigo) do update
    set
      descripcion = excluded.descripcion,
      categoria = excluded.categoria,
      activo = true,
      updated_at = now()
    returning id into v_actividad_id;

    v_i := v_i + 1;
    insert into public.empresa_actividad_tributaria (
      empresa_id,
      actividad_tributaria_id,
      principal,
      fuente,
      created_at,
      updated_at
    )
    values (
      p_empresa_id,
      v_actividad_id,
      case when v_i = 1 then true else false end,
      'MH_API',
      now(),
      now()
    );
    v_count := v_count + 1;
  end loop;

  select coalesce(ep.impuestos, public.empresa_parametros_defaults()->'impuestos')
    into v_impuestos
  from public.empresa_parametros ep
  where ep.empresa_id = p_empresa_id
  limit 1;

  v_impuestos := jsonb_set(
    coalesce(v_impuestos, '{}'::jsonb),
    '{tipo_contribuyente}',
    to_jsonb(v_tipo_contribuyente),
    true
  );

  insert into public.empresa_parametros (
    empresa_id, fiscal, cierre_contable, impuestos, facturacion, redondeo, varios, version, updated_at, updated_by
  )
  values (
    p_empresa_id,
    public.empresa_parametros_defaults()->'fiscal',
    public.empresa_parametros_defaults()->'cierre_contable',
    v_impuestos,
    public.empresa_parametros_defaults()->'facturacion',
    public.empresa_parametros_defaults()->'redondeo',
    public.empresa_parametros_defaults()->'varios',
    1,
    now(),
    v_uid
  )
  on conflict (empresa_id) do update
  set
    impuestos = v_impuestos,
    version = public.empresa_parametros.version + 1,
    updated_at = now(),
    updated_by = v_uid;

  return jsonb_build_object(
    'ok', true,
    'empresa_id', p_empresa_id,
    'cedula', v_cedula,
    'nombre', v_nombre,
    'tipo_contribuyente', v_tipo_contribuyente,
    'actividades_count', v_count
  );
end;
$$;

grant execute on function public.sync_empresa_hacienda(bigint, jsonb) to authenticated;
grant execute on function public.sync_empresa_hacienda(bigint, jsonb) to service_role;

grant select on table public.actividad_tributaria to authenticated;
grant select, insert, update, delete on table public.empresa_actividad_tributaria to authenticated;
grant select, insert, update on table public.empresa_hacienda_snapshot to authenticated;

commit;

