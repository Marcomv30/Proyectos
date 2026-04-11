alter table public.fe_documento_lineas
  add column if not exists exoneracion_porcentaje numeric(7,4) not null default 0,
  add column if not exists exoneracion_monto numeric(18,5) not null default 0;
