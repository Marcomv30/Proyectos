-- SOLO VPS / PRODUCCION
-- No ejecutar en local si los datos locales ya quedaron correctos.
--
-- Caso que corrige:
-- El backend interpretó timestamps de Fusion (hora Costa Rica) usando la zona
-- horaria del servidor Node del VPS. Eso dejó horas desplazadas 6 horas hacia atrás
-- al mostrarlas en America/Costa_Rica.
--
-- Este script recompone los datos historicos ya guardados en tablas de combustible
-- desplazando +6 horas los timestamps persistidos por ese bug.
--
-- Recomendado:
-- 1. Desplegar primero el fix de codigo backend.
-- 2. Respaldar la base antes de ejecutar este script.
-- 3. Ejecutarlo solo una vez en el VPS afectado.

begin;

update public.ventas_combustible
set
  start_at = start_at + interval '6 hours',
  end_at = end_at + interval '6 hours'
where start_at is not null or end_at is not null;

update public.turnos_combustible
set
  start_at = start_at + interval '6 hours',
  end_at = end_at + interval '6 hours'
where start_at is not null or end_at is not null;

update public.niveles_tanque
set leido_at = leido_at + interval '6 hours'
where leido_at is not null;

update public.alarmas_fusion
set
  alarm_at = case when alarm_at is not null then alarm_at + interval '6 hours' else null end,
  ack_at = case when ack_at is not null then ack_at + interval '6 hours' else null end,
  last_modified_at = case when last_modified_at is not null then last_modified_at + interval '6 hours' else null end
where alarm_at is not null
   or ack_at is not null
   or last_modified_at is not null;

commit;

-- Validaciones sugeridas:
-- select sale_id, end_at from public.ventas_combustible order by sale_id desc limit 10;
-- select period_id, start_at, end_at from public.turnos_combustible order by period_id desc limit 10;
-- select tank_id, leido_at from public.niveles_tanque order by leido_at desc limit 10;
