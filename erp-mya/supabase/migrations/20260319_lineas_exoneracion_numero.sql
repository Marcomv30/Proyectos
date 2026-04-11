-- Agrega número de documento y nombre de institución de exoneración a líneas de comprobante.
alter table public.comprobantes_lineas
  add column if not exists exoneracion_numero      varchar(40)  null,
  add column if not exists exoneracion_institucion varchar(160) null;

comment on column public.comprobantes_lineas.exoneracion_numero      is 'NumeroDocumento del bloque <Exoneracion> en el XML FE';
comment on column public.comprobantes_lineas.exoneracion_institucion is 'NombreInstitucion del bloque <Exoneracion> en el XML FE';
