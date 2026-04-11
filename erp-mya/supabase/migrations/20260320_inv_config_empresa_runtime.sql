-- Normaliza empresa_config_inventario para usar plan_cuentas_empresa.id en runtime.
-- Mantiene compatibilidad migrando valores viejos que hayan quedado como plan_cuentas_base.id.

begin;

update public.empresa_config_inventario cfg
set cuenta_inventario_id = pce.id
from public.plan_cuentas_empresa pce
where cfg.empresa_id = pce.empresa_id
  and pce.cuenta_base_id = cfg.cuenta_inventario_id
  and not exists (
    select 1
    from public.plan_cuentas_empresa actual
    where actual.empresa_id = cfg.empresa_id
      and actual.id = cfg.cuenta_inventario_id
  );

update public.empresa_config_inventario cfg
set cuenta_costo_ventas_id = pce.id
from public.plan_cuentas_empresa pce
where cfg.empresa_id = pce.empresa_id
  and pce.cuenta_base_id = cfg.cuenta_costo_ventas_id
  and not exists (
    select 1
    from public.plan_cuentas_empresa actual
    where actual.empresa_id = cfg.empresa_id
      and actual.id = cfg.cuenta_costo_ventas_id
  );

update public.empresa_config_inventario cfg
set cuenta_ajuste_inv_id = pce.id
from public.plan_cuentas_empresa pce
where cfg.empresa_id = pce.empresa_id
  and pce.cuenta_base_id = cfg.cuenta_ajuste_inv_id
  and not exists (
    select 1
    from public.plan_cuentas_empresa actual
    where actual.empresa_id = cfg.empresa_id
      and actual.id = cfg.cuenta_ajuste_inv_id
  );

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.empresa_config_inventario'::regclass
      and c.confrelid = 'public.plan_cuentas_base'::regclass
  loop
    execute format('alter table public.empresa_config_inventario drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.empresa_config_inventario
  add constraint empresa_config_inventario_cuenta_inventario_empresa_fk
  foreign key (cuenta_inventario_id) references public.plan_cuentas_empresa(id) on delete set null;

alter table public.empresa_config_inventario
  add constraint empresa_config_inventario_cuenta_costo_ventas_empresa_fk
  foreign key (cuenta_costo_ventas_id) references public.plan_cuentas_empresa(id) on delete set null;

alter table public.empresa_config_inventario
  add constraint empresa_config_inventario_cuenta_ajuste_empresa_fk
  foreign key (cuenta_ajuste_inv_id) references public.plan_cuentas_empresa(id) on delete set null;

comment on column public.empresa_config_inventario.cuenta_inventario_id is 'plan_cuentas_empresa.id en runtime';
comment on column public.empresa_config_inventario.cuenta_costo_ventas_id is 'plan_cuentas_empresa.id en runtime';
comment on column public.empresa_config_inventario.cuenta_ajuste_inv_id is 'plan_cuentas_empresa.id en runtime';

commit;
