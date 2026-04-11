-- Inventario de pista para adicionales en FE Combustibles

alter table public.inv_productos
  add column if not exists vendible_en_pista boolean not null default false;

create table if not exists public.comb_pista_bodegas (
  id bigserial primary key,
  empresa_id integer not null,
  pump_id integer not null,
  bodega_id bigint not null references public.inv_bodegas(id) on delete cascade,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, pump_id)
);

create index if not exists idx_comb_pista_bodegas_empresa on public.comb_pista_bodegas(empresa_id);
create index if not exists idx_comb_pista_bodegas_bodega on public.comb_pista_bodegas(bodega_id);

alter table public.comb_pista_bodegas enable row level security;
drop policy if exists comb_pista_bodegas_all on public.comb_pista_bodegas;
create policy comb_pista_bodegas_all on public.comb_pista_bodegas
  for all using (true) with check (true);

alter table public.fe_documentos
  add column if not exists pista_bodega_id bigint references public.inv_bodegas(id),
  add column if not exists pista_stock_movido boolean not null default false,
  add column if not exists pista_stock_movido_at timestamptz;

create or replace function public.registrar_salida_pista_fe(
  p_empresa_id integer,
  p_documento_id bigint,
  p_bodega_id bigint,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_linea jsonb;
  v_producto_id bigint;
  v_cantidad numeric;
  v_stock numeric;
  v_costo numeric;
begin
  select id, pista_stock_movido
    into v_doc
  from public.fe_documentos
  where id = p_documento_id
    and empresa_id = p_empresa_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Documento FE no encontrado.');
  end if;

  if coalesce(v_doc.pista_stock_movido, false) then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  if p_bodega_id is null then
    return jsonb_build_object('ok', false, 'error', 'La venta no tiene bodega de pista configurada.');
  end if;

  for v_linea in
    select value
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_producto_id := nullif((v_linea ->> 'producto_id')::bigint, 0);
    v_cantidad := coalesce((v_linea ->> 'cantidad')::numeric, 0);

    if v_producto_id is null or v_cantidad <= 0 then
      continue;
    end if;

    select coalesce(stock_actual, 0)
      into v_stock
    from public.inv_stock_bodega
    where empresa_id = p_empresa_id
      and bodega_id = p_bodega_id
      and producto_id = v_producto_id;

    if coalesce(v_stock, 0) < v_cantidad then
      return jsonb_build_object(
        'ok', false,
        'error', format('Stock insuficiente en bodega de pista para producto %s. Disponible: %s, requerido: %s.', v_producto_id, coalesce(v_stock, 0), v_cantidad)
      );
    end if;
  end loop;

  for v_linea in
    select value
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_producto_id := nullif((v_linea ->> 'producto_id')::bigint, 0);
    v_cantidad := coalesce((v_linea ->> 'cantidad')::numeric, 0);

    if v_producto_id is null or v_cantidad <= 0 then
      continue;
    end if;

    select coalesce(costo_promedio, 0)
      into v_costo
    from public.inv_productos
    where id = v_producto_id
      and empresa_id = p_empresa_id;

    insert into public.inv_movimientos (
      empresa_id,
      fecha,
      tipo,
      origen,
      producto_id,
      cantidad,
      costo_unitario,
      referencia,
      notas,
      bodega_id
    )
    values (
      p_empresa_id,
      (now() at time zone 'America/Costa_Rica')::date,
      'salida',
      'fe',
      v_producto_id,
      v_cantidad,
      coalesce(v_costo, 0),
      format('FE-COMB-%s', p_documento_id),
      coalesce(v_linea ->> 'descripcion', 'Salida automatica por FE Combustibles'),
      p_bodega_id
    );
  end loop;

  update public.fe_documentos
     set pista_bodega_id = p_bodega_id,
         pista_stock_movido = true,
         pista_stock_movido_at = now()
   where id = p_documento_id
     and empresa_id = p_empresa_id;

  return jsonb_build_object('ok', true);
end;
$$;
