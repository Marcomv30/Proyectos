-- Reset catálogo contable para cualquier empresa.
-- ► Busque y reemplace el número 3 por el empresa_id que necesite.
-- Ejecutar en Supabase SQL Editor (rol postgres / service_role).

begin;

-- RLS off para toda la transacción (debe ir ANTES de los DELETEs)
set local row_security = off;

-- 1. Líneas de asientos de la empresa
delete from public.asiento_lineas l
using public.asientos a
where a.id = l.asiento_id
  and a.empresa_id = 3;       -- ◄ CAMBIAR

-- 2. Asientos
delete from public.asientos
where empresa_id = 3;          -- ◄ CAMBIAR

-- 3. Catálogo empresa
delete from public.plan_cuentas_empresa
where empresa_id = 3;          -- ◄ CAMBIAR

-- 4. Historial tipo de cambio
delete from public.tipo_cambio_historial
where empresa_id = 3;          -- ◄ CAMBIAR

-- Verificar que quedó vacío
select count(*) as cuentas_restantes
from public.plan_cuentas_empresa
where empresa_id = 3;          -- ◄ CAMBIAR

commit;
