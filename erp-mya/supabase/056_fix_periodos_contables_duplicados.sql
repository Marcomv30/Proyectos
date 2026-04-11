-- Saneamiento y blindaje de periodos contables duplicados por empresa/rango.
-- Ejecutar en SQL Editor con rol postgres.

begin;

do $$
declare
  v_dup_deleted integer := 0;
begin
  if to_regclass('public.periodos_contables') is null then
    raise exception 'No existe tabla public.periodos_contables';
  end if;

  -- 1) Elimina duplicados exactos (empresa_id + fecha_inicio + fecha_fin).
  -- Prioriza conservar ABIERTO y luego el id mas bajo.
  with ranked as (
    select
      p.id,
      row_number() over (
        partition by p.empresa_id, p.fecha_inicio, p.fecha_fin
        order by
          case when upper(coalesce(p.estado, '')) = 'ABIERTO' then 0 else 1 end,
          p.id asc
      ) as rn
    from public.periodos_contables p
  )
  delete from public.periodos_contables p
  using ranked r
  where p.id = r.id
    and r.rn > 1;

  get diagnostics v_dup_deleted = row_count;

  -- 2) Regla base de consistencia de fechas.
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'periodos_contables'
      and c.conname = 'chk_periodos_contables_fechas_validas'
  ) then
    alter table public.periodos_contables
      add constraint chk_periodos_contables_fechas_validas
      check (fecha_inicio <= fecha_fin);
  end if;

  -- 3) Blindaje: no permitir otro periodo con el mismo rango exacto para la misma empresa.
  create unique index if not exists ux_periodos_contables_empresa_rango
    on public.periodos_contables (empresa_id, fecha_inicio, fecha_fin);

  raise notice 'Periodos contables saneados. duplicados_eliminados=%', v_dup_deleted;
end
$$;

commit;

