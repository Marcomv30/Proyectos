alter table public.inv_categorias
  add column if not exists codigo_prefijo text;

update public.inv_categorias
set codigo_prefijo = upper(left(regexp_replace(coalesce(nombre, ''), '[^A-Za-z0-9]+', '', 'g'), 3))
where coalesce(codigo_prefijo, '') = ''
  and coalesce(nombre, '') <> '';

comment on column public.inv_categorias.codigo_prefijo is 'Prefijo sugerido para generar el codigo interno de articulos por categoria.';

