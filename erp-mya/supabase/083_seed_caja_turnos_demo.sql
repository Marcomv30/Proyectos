-- Seed demo: Puntos de venta + cajas para probar turnos de caja
-- Ejecutar despues de 082_caja_turnos_mvp.sql

begin;

do $$
declare
  v_empresa_id bigint;
  v_pv_main_id bigint;
  v_pv_sec_id bigint;
begin
  -- Toma la primera empresa activa; cambia esta logica si quieres una empresa especifica
  select e.id
    into v_empresa_id
  from public.empresas e
  where e.activo = true
  order by e.id
  limit 1;

  if v_empresa_id is null then
    raise exception 'No hay empresa activa para generar seed de caja.';
  end if;

  insert into public.puntos_venta(empresa_id, codigo, nombre, activo)
  values
    (v_empresa_id, 'PV-001', 'Punto de Venta Principal', true),
    (v_empresa_id, 'PV-002', 'Punto de Venta Secundario', true)
  on conflict (empresa_id, codigo) do update
    set nombre = excluded.nombre,
        activo = true,
        updated_at = now();

  select id into v_pv_main_id
  from public.puntos_venta
  where empresa_id = v_empresa_id
    and codigo = 'PV-001'
  limit 1;

  select id into v_pv_sec_id
  from public.puntos_venta
  where empresa_id = v_empresa_id
    and codigo = 'PV-002'
  limit 1;

  if v_pv_main_id is null or v_pv_sec_id is null then
    raise exception 'No se pudieron resolver puntos de venta seed.';
  end if;

  insert into public.cajas(empresa_id, punto_venta_id, codigo, nombre, activo)
  values
    (v_empresa_id, v_pv_main_id, 'CAJA-01', 'Caja Principal 01', true),
    (v_empresa_id, v_pv_main_id, 'CAJA-02', 'Caja Principal 02', true),
    (v_empresa_id, v_pv_sec_id, 'CAJA-01', 'Caja Secundaria 01', true)
  on conflict (empresa_id, punto_venta_id, codigo) do update
    set nombre = excluded.nombre,
        activo = true,
        updated_at = now();

  raise notice 'Seed caja turnos aplicado para empresa_id=%', v_empresa_id;
end $$;

commit;
