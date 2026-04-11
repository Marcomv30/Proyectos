-- RPC: reiniciar_catalogo_empresa
-- Borra todo el catálogo contable de una empresa (asientos, catálogo, tipo de cambio).
-- Solo debe llamarse desde el frontend con sesión de superusuario.
-- SECURITY DEFINER para bypassear RLS.

create or replace function public.reiniciar_catalogo_empresa(p_empresa_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid;
  v_es_su       boolean;
  v_lineas      bigint := 0;
  v_asientos    bigint := 0;
  v_cuentas     bigint := 0;
  v_tc          bigint := 0;
begin
  -- Verificar sesión activa
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sesion invalida';
  end if;

  -- Verificar que el llamante es superusuario
  select es_superusuario into v_es_su
  from public.usuarios
  where auth_user_id::uuid = v_uid
  limit 1;

  if not coalesce(v_es_su, false) then
    raise exception 'Acceso denegado: solo superusuarios pueden reiniciar el catalogo';
  end if;

  -- 1. Líneas de asientos
  delete from public.asiento_lineas
  using public.asientos
  where public.asientos.id = public.asiento_lineas.asiento_id
    and public.asientos.empresa_id = p_empresa_id;
  get diagnostics v_lineas = row_count;

  -- 2. Asientos
  delete from public.asientos
  where empresa_id = p_empresa_id;
  get diagnostics v_asientos = row_count;

  -- 3. Catálogo empresa
  delete from public.plan_cuentas_empresa
  where empresa_id = p_empresa_id;
  get diagnostics v_cuentas = row_count;

  -- 4. Historial tipo de cambio
  delete from public.tipo_cambio_historial
  where empresa_id = p_empresa_id;
  get diagnostics v_tc = row_count;

  return jsonb_build_object(
    'ok',        true,
    'lineas',    v_lineas,
    'asientos',  v_asientos,
    'cuentas',   v_cuentas,
    'tipo_cambio', v_tc
  );
end;
$$;

-- Solo el rol authenticated puede llamar esta función
revoke all on function public.reiniciar_catalogo_empresa(bigint) from public, anon;
grant execute on function public.reiniciar_catalogo_empresa(bigint) to authenticated;

comment on function public.reiniciar_catalogo_empresa(bigint) is
  'Borra todo el catálogo contable de una empresa. Requiere sesión de superusuario.';
