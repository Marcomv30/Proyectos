begin;

create table if not exists public.inv_producto_proveedores (
  id bigserial primary key,
  empresa_id bigint not null,
  producto_id bigint not null references public.inv_productos(id) on delete cascade,
  tercero_id bigint not null references public.terceros(id),
  codigo_proveedor text null,
  descripcion_proveedor text null,
  unidad_compra text null,
  factor_conversion numeric(15,4) not null default 1,
  precio_bruto_proveedor numeric(15,4) not null default 0,
  descuento_compra_pct numeric(15,4) not null default 0,
  bonificacion_unidades numeric(15,4) not null default 0,
  impuesto_consumo_monto numeric(15,4) not null default 0,
  flete_monto numeric(15,4) not null default 0,
  incluir_flete_en_costo boolean not null default false,
  es_principal boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_inv_producto_proveedores_empresa_producto_tercero
  on public.inv_producto_proveedores (empresa_id, producto_id, tercero_id);

create index if not exists idx_inv_producto_proveedores_producto
  on public.inv_producto_proveedores (producto_id, es_principal);

create or replace function public.trg_inv_producto_proveedores_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_inv_producto_proveedores_updated_at on public.inv_producto_proveedores;
create trigger trg_inv_producto_proveedores_updated_at
before update on public.inv_producto_proveedores
for each row execute function public.trg_inv_producto_proveedores_updated_at();

commit;
