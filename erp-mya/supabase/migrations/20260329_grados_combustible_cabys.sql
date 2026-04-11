alter table public.grados_combustible
  add column if not exists codigo_cabys varchar(20);

comment on column public.grados_combustible.codigo_cabys is
  'Codigo CABYS asociado al grado de combustible para FE/TE del modulo de combustible.';
