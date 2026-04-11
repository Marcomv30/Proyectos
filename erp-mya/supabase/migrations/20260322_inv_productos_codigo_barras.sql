alter table public.inv_productos
  add column if not exists codigo_barras text;

create index if not exists idx_inv_productos_empresa_codigo_barras
  on public.inv_productos (empresa_id, codigo_barras);

comment on column public.inv_productos.codigo_barras is 'Codigo de barras o codigo escaneable para POS. Si no existe, el sistema puede usar el codigo interno.';

