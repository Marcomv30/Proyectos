alter table public.emp_parcelas
add column if not exists geojson jsonb;

comment on column public.emp_parcelas.geojson
is 'Geometria GeoJSON de la parcela o lote para visualizacion y cruces GPS en empacadora.';
