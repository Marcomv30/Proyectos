alter table public.fe_config_empresa
add column if not exists codigo_exportador_default text,
add column if not exists ggn_global_gap_default text;

comment on column public.fe_config_empresa.codigo_exportador_default
is 'Codigo exportador por defecto para empacadora y etiquetas por paleta.';

comment on column public.fe_config_empresa.ggn_global_gap_default
is 'GGN GlobalG.A.P. por defecto para empacadora y etiquetas por paleta.';
