-- CONSOLA / Combustible: catalogo de dispositivos de identificacion

create table if not exists public.comb_dispositivos_identidad (
  id bigserial primary key,
  empresa_id integer not null references public.empresas(id) on delete cascade,
  tipo_dispositivo text not null default 'tag',
  identificador_uid text not null,
  alias text,
  estado text not null default 'activo',
  usuario_id integer references public.usuarios(id) on delete set null,
  attendant_id varchar(60),
  operador_nombre text,
  vehiculo_codigo text,
  placa text,
  pump_id_preferido integer,
  grade_id_preferido integer,
  payment_type text,
  payment_info text,
  notas text,
  ultimo_leido_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, identificador_uid)
);

create index if not exists idx_comb_dispositivos_empresa
  on public.comb_dispositivos_identidad(empresa_id);

create index if not exists idx_comb_dispositivos_attendant
  on public.comb_dispositivos_identidad(empresa_id, attendant_id);

create index if not exists idx_comb_dispositivos_usuario
  on public.comb_dispositivos_identidad(empresa_id, usuario_id);

alter table public.comb_dispositivos_identidad enable row level security;

drop policy if exists comb_dispositivos_identidad_all on public.comb_dispositivos_identidad;
create policy comb_dispositivos_identidad_all
on public.comb_dispositivos_identidad
for all
using (true)
with check (true);

create or replace function public.set_comb_dispositivos_identidad_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_comb_dispositivos_identidad_updated_at on public.comb_dispositivos_identidad;
create trigger trg_comb_dispositivos_identidad_updated_at
before update on public.comb_dispositivos_identidad
for each row
execute function public.set_comb_dispositivos_identidad_updated_at();
