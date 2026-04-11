-- ============================================================
-- MYA ERP - Facturacion Electronica
-- Extiende lineas FE con datos explicitos de exoneracion
-- para mantener compatibilidad con la logica actual de XML
-- y comprobantes recibidos.
-- ============================================================

alter table if exists public.fe_documento_lineas
  add column if not exists exoneracion_autorizacion varchar(60);

alter table if exists public.fe_documento_lineas
  add column if not exists exoneracion_porcentaje numeric(7,4) not null default 0;

alter table if exists public.fe_documento_lineas
  add column if not exists exoneracion_monto numeric(18,5) not null default 0;
