-- ============================================================
-- MYA ERP - Facturacion Electronica
-- Datos del emisor: actividad tributaria y certificado de firma
-- ============================================================

alter table if exists public.fe_config_empresa
  add column if not exists actividad_tributaria_id bigint null references public.actividad_tributaria(id) on delete restrict;

alter table if exists public.fe_config_empresa
  add column if not exists correo_envio text null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_nombre_archivo text null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_ruta_interna text null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_pin_encriptado text null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_password_encriptada text null;

alter table if exists public.fe_config_empresa
  add column if not exists clave_aplicacion_encriptada text null;

alter table if exists public.fe_config_empresa
  add column if not exists stag_usuario text null;

alter table if exists public.fe_config_empresa
  add column if not exists stag_password_encriptada text null;

alter table if exists public.fe_config_empresa
  add column if not exists stag_usuario_produccion text null;

alter table if exists public.fe_config_empresa
  add column if not exists stag_password_produccion_encriptada text null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_vence_en date null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_actualizado_at timestamptz null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_nombre_archivo_produccion text null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_ruta_interna_produccion text null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_pin_produccion_encriptado text null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_password_produccion_encriptada text null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_vence_produccion_en date null;

alter table if exists public.fe_config_empresa
  add column if not exists certificado_actualizado_produccion_at timestamptz null;
