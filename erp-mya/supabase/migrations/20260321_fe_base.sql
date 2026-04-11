-- ============================================================
-- MYA ERP - Facturacion Electronica (base operativa)
-- Fase 1: configuracion FE, exoneraciones MH y estructura base
-- ============================================================

create table if not exists public.fe_config_empresa (
  empresa_id                  integer primary key,
  ambiente                    text not null default 'pruebas' check (ambiente in ('pruebas', 'produccion')),
  actividad_codigo            varchar(6),
  sucursal                    varchar(3) not null default '001',
  punto_venta                 varchar(5) not null default '00001',
  tipo_documento_defecto      varchar(2) not null default '01',
  condicion_venta_defecto     varchar(2) not null default '01',
  medio_pago_defecto          varchar(2) not null default '01',
  plazo_credito_dias          integer not null default 0,
  telefono                    varchar(30),
  correo_respuesta            text,
  consulta_exoneracion_mh     boolean not null default true,
  activo                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table if not exists public.fe_exoneraciones (
  id                          bigserial primary key,
  empresa_id                  integer not null,
  autorizacion                varchar(60) not null,
  identificacion              varchar(30),
  nombre_contribuyente        text,
  nombre_institucion          text,
  fecha_emision               date,
  fecha_vencimiento           date,
  porcentaje_exoneracion      numeric(7,4) not null default 0,
  tipo_autorizacion           text,
  tipo_documento_codigo       varchar(10),
  tipo_documento_descripcion  text,
  posee_cabys                 boolean not null default false,
  payload_json                jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (empresa_id, autorizacion)
);

create table if not exists public.fe_exoneraciones_cabys (
  id                          bigserial primary key,
  exoneracion_id              bigint not null references public.fe_exoneraciones(id) on delete cascade,
  cabys                       varchar(20) not null,
  detalle                     text,
  iva                         numeric(7,4) not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (exoneracion_id, cabys)
);

create or replace view public.vw_fe_exoneraciones as
select
  e.id,
  e.empresa_id,
  e.autorizacion,
  e.identificacion,
  e.nombre_contribuyente,
  e.nombre_institucion,
  e.fecha_emision,
  e.fecha_vencimiento,
  e.porcentaje_exoneracion,
  e.tipo_autorizacion,
  e.tipo_documento_codigo,
  e.tipo_documento_descripcion,
  e.posee_cabys,
  e.created_at,
  e.updated_at,
  case
    when e.fecha_vencimiento is null then true
    when e.fecha_vencimiento >= current_date then true
    else false
  end as vigente,
  (
    select count(*)
    from public.fe_exoneraciones_cabys c
    where c.exoneracion_id = e.id
  )::integer as cabys_count
from public.fe_exoneraciones e;

create table if not exists public.fe_documentos (
  id                          bigserial primary key,
  empresa_id                  integer not null,
  tipo_documento              varchar(2) not null check (tipo_documento in ('01', '02', '03', '04')),
  origen                      text not null default 'facturacion' check (origen in ('facturacion', 'pos')),
  estado                      text not null default 'borrador' check (estado in ('borrador', 'confirmado', 'anulado')),
  tercero_id                  integer,
  fecha_emision               date not null default current_date,
  moneda                      varchar(3) not null default 'CRC' check (moneda in ('CRC', 'USD')),
  condicion_venta             varchar(2),
  medio_pago                  varchar(2),
  plazo_credito_dias          integer not null default 0,
  exoneracion_id              bigint,
  observacion                 text,
  subtotal                    numeric(18,5) not null default 0,
  total_descuento             numeric(18,5) not null default 0,
  total_impuesto              numeric(18,5) not null default 0,
  total_comprobante           numeric(18,5) not null default 0,
  numero_consecutivo          varchar(20),
  clave                       varchar(60),
  xml_estado                  text,
  asiento_id                  bigint,
  inventario_generado         boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table if not exists public.fe_documento_lineas (
  id                          bigserial primary key,
  documento_id                bigint not null references public.fe_documentos(id) on delete cascade,
  linea                       integer not null,
  tipo_linea                  text not null default 'mercaderia' check (tipo_linea in ('mercaderia', 'servicio')),
  producto_id                 integer,
  codigo_interno              varchar(60),
  cabys                       varchar(20),
  descripcion                 text not null,
  unidad_medida               varchar(20),
  cantidad                    numeric(18,5) not null default 1,
  precio_unitario             numeric(18,5) not null default 0,
  descuento_monto             numeric(18,5) not null default 0,
  descuento_naturaleza        text,
  tarifa_iva_codigo           varchar(2),
  tarifa_iva_porcentaje       numeric(7,4) not null default 0,
  exoneracion_id              bigint,
  subtotal                    numeric(18,5) not null default 0,
  impuesto_monto              numeric(18,5) not null default 0,
  total_linea                 numeric(18,5) not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (documento_id, linea)
);

alter table public.fe_config_empresa enable row level security;
alter table public.fe_exoneraciones enable row level security;
alter table public.fe_exoneraciones_cabys enable row level security;
alter table public.fe_documentos enable row level security;
alter table public.fe_documento_lineas enable row level security;

drop policy if exists fe_config_empresa_select on public.fe_config_empresa;
create policy fe_config_empresa_select on public.fe_config_empresa
  for select using (public.has_empresa_access(empresa_id));

drop policy if exists fe_config_empresa_write on public.fe_config_empresa;
create policy fe_config_empresa_write on public.fe_config_empresa
  for all using (public.has_empresa_access(empresa_id))
  with check (public.has_empresa_access(empresa_id));

drop policy if exists fe_exoneraciones_select on public.fe_exoneraciones;
create policy fe_exoneraciones_select on public.fe_exoneraciones
  for select using (public.has_empresa_access(empresa_id));

drop policy if exists fe_exoneraciones_write on public.fe_exoneraciones;
create policy fe_exoneraciones_write on public.fe_exoneraciones
  for all using (public.has_empresa_access(empresa_id))
  with check (public.has_empresa_access(empresa_id));

drop policy if exists fe_exoneraciones_cabys_select on public.fe_exoneraciones_cabys;
create policy fe_exoneraciones_cabys_select on public.fe_exoneraciones_cabys
  for select using (
    exists (
      select 1
      from public.fe_exoneraciones e
      where e.id = fe_exoneraciones_cabys.exoneracion_id
        and public.has_empresa_access(e.empresa_id)
    )
  );

drop policy if exists fe_exoneraciones_cabys_write on public.fe_exoneraciones_cabys;
create policy fe_exoneraciones_cabys_write on public.fe_exoneraciones_cabys
  for all using (
    exists (
      select 1
      from public.fe_exoneraciones e
      where e.id = fe_exoneraciones_cabys.exoneracion_id
        and public.has_empresa_access(e.empresa_id)
    )
  )
  with check (
    exists (
      select 1
      from public.fe_exoneraciones e
      where e.id = fe_exoneraciones_cabys.exoneracion_id
        and public.has_empresa_access(e.empresa_id)
    )
  );

drop policy if exists fe_documentos_select on public.fe_documentos;
create policy fe_documentos_select on public.fe_documentos
  for select using (public.has_empresa_access(empresa_id));

drop policy if exists fe_documentos_write on public.fe_documentos;
create policy fe_documentos_write on public.fe_documentos
  for all using (public.has_empresa_access(empresa_id))
  with check (public.has_empresa_access(empresa_id));

drop policy if exists fe_documento_lineas_select on public.fe_documento_lineas;
create policy fe_documento_lineas_select on public.fe_documento_lineas
  for select using (
    exists (
      select 1
      from public.fe_documentos d
      where d.id = fe_documento_lineas.documento_id
        and public.has_empresa_access(d.empresa_id)
    )
  );

drop policy if exists fe_documento_lineas_write on public.fe_documento_lineas;
create policy fe_documento_lineas_write on public.fe_documento_lineas
  for all using (
    exists (
      select 1
      from public.fe_documentos d
      where d.id = fe_documento_lineas.documento_id
        and public.has_empresa_access(d.empresa_id)
    )
  )
  with check (
    exists (
      select 1
      from public.fe_documentos d
      where d.id = fe_documento_lineas.documento_id
        and public.has_empresa_access(d.empresa_id)
    )
  );

grant select on public.vw_fe_exoneraciones to authenticated, service_role;
