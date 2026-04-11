alter table public.emp_boletas
add column if not exists barcode_cliente text;

comment on column public.emp_boletas.barcode_cliente
is 'Codigo de barras o etiqueta del cliente escaneada en la paleta.';
