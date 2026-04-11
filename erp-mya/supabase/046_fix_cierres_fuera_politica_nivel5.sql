-- Anula cierres CONFIRMADO (CER-*) con lineas fuera de politica nivel 5 efectivo.
-- No elimina registros; solo cambia estado a ANULADO para poder regenerar cierre correcto.
-- Ejecutar en SQL Editor con rol postgres.

begin;

do $$
declare
  v_empresa_id bigint := null; -- null=todas, o fijar empresa
  v_anulados integer := 0;
begin
  with cierres_invalidos as (
    select distinct a.id
    from public.asientos a
    join public.asiento_lineas l on l.asiento_id = a.id
    join public.plan_cuentas_base b on b.id = l.cuenta_id
    left join public.plan_cuentas_empresa e
      on e.empresa_id = a.empresa_id
     and e.cuenta_base_id = b.id
    where a.estado = 'CONFIRMADO'
      and upper(coalesce(a.numero_formato, '')) like 'CER-%'
      and (v_empresa_id is null or a.empresa_id = v_empresa_id)
      and coalesce(
        public.plan_cuentas_infer_nivel(coalesce(e.codigo, b.codigo, '')),
        b.nivel,
        0
      ) <> 5
  )
  update public.asientos a
  set
    estado = 'ANULADO',
    descripcion = left(
      coalesce(a.descripcion, '') || ' [AUTO-ANULADO NIVEL!=5 ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']',
      500
    )
  from cierres_invalidos x
  where a.id = x.id
    and a.estado = 'CONFIRMADO';

  get diagnostics v_anulados = row_count;
  raise notice 'Cierres anulados por incumplir nivel 5: %', v_anulados;
end
$$;

commit;
