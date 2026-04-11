-- CXC Fase 1.2
-- Validaciones de integridad para aplicaciones (abonos/notas) en CXC.
-- Evita sobre-aplicaciones y cruces de empresa/documento.

begin;

create or replace function public.trg_cxc_aplicaciones_validar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.cxc_documentos%rowtype;
  v_total_otras numeric(18,2) := 0;
  v_total_resultante numeric(18,2) := 0;
begin
  if new.documento_id is null then
    raise exception 'Documento requerido';
  end if;

  select d.*
    into v_doc
  from public.cxc_documentos d
  where d.id = new.documento_id
  for update;

  if not found then
    raise exception 'Documento CXC no existe';
  end if;

  if new.empresa_id is null then
    new.empresa_id := v_doc.empresa_id;
  end if;

  if new.empresa_id <> v_doc.empresa_id then
    raise exception 'Empresa de la aplicacion no coincide con el documento';
  end if;

  if v_doc.estado = 'anulado' then
    raise exception 'No se puede aplicar sobre un documento anulado';
  end if;

  if coalesce(new.estado, 'activo') <> 'activo' then
    return new;
  end if;

  select coalesce(sum(a.monto), 0)
    into v_total_otras
  from public.cxc_aplicaciones a
  where a.documento_id = new.documento_id
    and a.estado = 'activo'
    and (tg_op <> 'UPDATE' or a.id <> old.id);

  v_total_resultante := round(v_total_otras + coalesce(new.monto, 0), 2);

  if v_total_resultante > round(coalesce(v_doc.monto_original, 0), 2) then
    raise exception
      'Aplicacion excede saldo del documento. Monto maximo permitido: %',
      round(greatest(v_doc.monto_original - v_total_otras, 0), 2);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cxc_aplicaciones_validar on public.cxc_aplicaciones;
create trigger trg_cxc_aplicaciones_validar
before insert or update on public.cxc_aplicaciones
for each row
execute function public.trg_cxc_aplicaciones_validar();

commit;
