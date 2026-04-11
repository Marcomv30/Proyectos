-- Solo superusuario puede cambiar el flag es_superusuario.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create or replace function public.set_user_superuser(
  p_usuario_id bigint,
  p_es_superusuario boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesion invalida';
  end if;

  if not public.is_superuser(auth.uid()) then
    raise exception 'Solo un superusuario puede cambiar este campo';
  end if;

  update public.usuarios
  set es_superusuario = coalesce(p_es_superusuario, false)
  where id = p_usuario_id;

  if not found then
    raise exception 'Usuario no encontrado';
  end if;
end;
$$;

grant execute on function public.set_user_superuser(bigint, boolean) to authenticated;

commit;

