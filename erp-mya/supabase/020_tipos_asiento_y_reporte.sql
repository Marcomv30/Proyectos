-- Tipos de asiento + consolidado por tipo.
-- Ejecutar en SQL Editor con rol postgres.

begin;

create table if not exists public.asiento_tipos (
  id bigserial primary key,
  codigo text not null unique,
  nombre text not null,
  descripcion text null,
  color text not null default '#16a34a',
  orden integer not null default 100,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_asiento_tipos_activo on public.asiento_tipos(activo);
create index if not exists idx_asiento_tipos_orden on public.asiento_tipos(orden, codigo);

alter table public.asiento_tipos enable row level security;

drop policy if exists asiento_tipos_select_authenticated on public.asiento_tipos;
create policy asiento_tipos_select_authenticated
on public.asiento_tipos
for select
to authenticated
using (true);

create or replace function public.has_contabilidad_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    join public.usuarios_empresas ue on ue.usuario_id = u.id
    where u.auth_user_id = auth.uid()
      and coalesce(ue.activo, true) = true
      and public.has_permission(ue.empresa_id, 'contabilidad', 'editar')
  );
$$;

grant execute on function public.has_contabilidad_admin_access() to authenticated;

drop policy if exists asiento_tipos_write_authenticated on public.asiento_tipos;
create policy asiento_tipos_write_authenticated
on public.asiento_tipos
for all
to authenticated
using (public.has_contabilidad_admin_access())
with check (public.has_contabilidad_admin_access());

insert into public.asiento_tipos (codigo, nombre, descripcion, color, orden, activo)
values
  ('DIARIO', 'Diario', 'Asientos generales del dia a dia', '#0ea5e9', 10, true),
  ('COMPRAS', 'Compras', 'Asientos de compras e inventario', '#f59e0b', 20, true),
  ('GASTOS', 'Gastos', 'Asientos de gastos operativos', '#ef4444', 30, true),
  ('INGRESOS', 'Ingresos', 'Asientos de ventas e ingresos', '#10b981', 40, true),
  ('AJUSTES', 'Ajustes', 'Asientos de ajuste y reclasificacion', '#8b5cf6', 50, true),
  ('CIERRE', 'Cierre', 'Asientos de cierre mensual/anual', '#334155', 60, true)
on conflict (codigo) do update
set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  color = excluded.color,
  orden = excluded.orden,
  activo = excluded.activo;

alter table public.asiento_categorias
  add column if not exists tipo_id bigint null references public.asiento_tipos(id);

create index if not exists idx_asiento_categorias_tipo_id on public.asiento_categorias(tipo_id);

-- Mapeo inicial por descripcion/codigo existente.
update public.asiento_categorias c
set tipo_id = t.id
from public.asiento_tipos t
where c.tipo_id is null
  and (
    (t.codigo = 'COMPRAS' and (lower(c.descripcion) like '%compra%' or lower(c.codigo) like '%comp%'))
    or (t.codigo = 'GASTOS' and (lower(c.descripcion) like '%gasto%' or lower(c.codigo) like '%gast%'))
    or (t.codigo = 'INGRESOS' and (lower(c.descripcion) like '%ingreso%' or lower(c.descripcion) like '%venta%' or lower(c.codigo) like '%ing%'))
    or (t.codigo = 'AJUSTES' and (lower(c.descripcion) like '%ajuste%' or lower(c.codigo) like '%aj%'))
    or (t.codigo = 'CIERRE' and (lower(c.descripcion) like '%cierre%' or lower(c.codigo) like '%cier%'))
  );

-- Fallback: lo que quede nulo pasa a DIARIO.
update public.asiento_categorias c
set tipo_id = t.id
from public.asiento_tipos t
where c.tipo_id is null
  and t.codigo = 'DIARIO';

create or replace function public.reporte_asientos_por_tipo(
  p_empresa_id bigint,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  tipo_id bigint,
  tipo_codigo text,
  tipo_nombre text,
  cantidad_asientos bigint,
  total_debito_crc numeric,
  total_credito_crc numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as tipo_id,
    t.codigo as tipo_codigo,
    t.nombre as tipo_nombre,
    count(distinct a.id) as cantidad_asientos,
    coalesce(sum(l.debito_crc), 0) as total_debito_crc,
    coalesce(sum(l.credito_crc), 0) as total_credito_crc
  from public.asientos a
  join public.asiento_categorias c on c.id = a.categoria_id
  join public.asiento_tipos t on t.id = c.tipo_id
  left join public.asiento_lineas l on l.asiento_id = a.id
  where a.empresa_id = p_empresa_id
    and public.has_empresa_access(a.empresa_id)
    and a.estado = 'CONFIRMADO'
    and (p_fecha_desde is null or a.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or a.fecha <= p_fecha_hasta)
  group by t.id, t.codigo, t.nombre
  order by t.codigo;
$$;

grant execute on function public.reporte_asientos_por_tipo(bigint, date, date) to authenticated;
grant execute on function public.reporte_asientos_por_tipo(bigint, date, date) to service_role;

commit;

