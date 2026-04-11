-- Seed demo CXC: clientes, documentos, abonos y gestiones.
-- Ejecutar en SQL Editor (rol postgres) en ambiente de pruebas.
-- Idempotente: elimina e inserta nuevamente solo datos con prefijo SEED-CXC.

begin;

do $$
declare
  v_empresa_id bigint := 1; -- Cambiar si desea otra empresa
  v_doc_id bigint;
begin
  if not exists (select 1 from public.empresas e where e.id = v_empresa_id) then
    raise exception 'No existe la empresa_id=%', v_empresa_id;
  end if;

  -- 1) Crear/actualizar terceros demo
  create temp table tmp_seed_clientes (
    codigo text,
    tipo_identificacion text,
    identificacion text,
    razon_social text,
    email text,
    telefono text
  ) on commit drop;

  insert into tmp_seed_clientes(codigo, tipo_identificacion, identificacion, razon_social, email, telefono)
  values
    ('CXC-001', 'JURIDICA', '3101100001', 'ALIMENTOS DEL VALLE S.A.', 'cobros@alimentosvalle.cr', '2222-1001'),
    ('CXC-002', 'JURIDICA', '3101100002', 'TRANSPORTES MONTAÑA S.R.L.', 'pagos@tmontana.cr', '2222-1002'),
    ('CXC-003', 'FISICA',   '203450100',  'CARLOS MORALES RUIZ', 'carlos.morales@email.cr', '8888-1003'),
    ('CXC-004', 'JURIDICA', '3101100004', 'FERRETERIA CENTRAL CR S.A.', 'tesoreria@ferrecentral.cr', '2222-1004'),
    ('CXC-005', 'JURIDICA', '3101100005', 'SERVICIOS AGRICOLAS DEL NORTE S.A.', 'admin@sagronorte.cr', '2222-1005'),
    ('CXC-006', 'FISICA',   '117890456',  'MARIA EUGENIA CHAVES', 'maria.chaves@email.cr', '8888-1006');

  insert into public.terceros (
    empresa_id, codigo, tipo_identificacion, identificacion, razon_social,
    email, telefono_1, activo, notas
  )
  select
    v_empresa_id, s.codigo, s.tipo_identificacion, s.identificacion, s.razon_social,
    s.email, s.telefono, true, '[SEED-CXC]'
  from tmp_seed_clientes s
  where not exists (
    select 1
    from public.terceros t
    where t.empresa_id = v_empresa_id
      and lower(coalesce(t.tipo_identificacion, '')) = lower(coalesce(s.tipo_identificacion, ''))
      and lower(coalesce(t.identificacion, '')) = lower(coalesce(s.identificacion, ''))
  );

  -- Marcar como clientes (dispara trigger de rol cliente)
  insert into public.tercero_cliente_parametros (
    tercero_id, limite_credito, dias_credito, moneda_credito, condicion_pago, observaciones
  )
  select
    t.id,
    2500000,
    30,
    'AMBAS',
    'CREDITO 30',
    '[SEED-CXC]'
  from public.terceros t
  join tmp_seed_clientes s
    on lower(t.identificacion) = lower(s.identificacion)
   and lower(t.tipo_identificacion) = lower(s.tipo_identificacion)
  where t.empresa_id = v_empresa_id
  on conflict (tercero_id) do update
    set limite_credito = excluded.limite_credito,
        dias_credito = excluded.dias_credito,
        moneda_credito = excluded.moneda_credito,
        condicion_pago = excluded.condicion_pago,
        observaciones = excluded.observaciones,
        updated_at = now();

  -- 2) Limpiar data previa del seed
  delete from public.cxc_gestion_cobro g
  where g.empresa_id = v_empresa_id
    and (
      g.observacion like '[SEED-CXC]%'
      or exists (
        select 1
        from public.cxc_documentos d
        where d.id = g.documento_id
          and d.empresa_id = v_empresa_id
          and d.numero_documento like 'SEED-CXC-%'
      )
    );

  delete from public.cxc_documentos d
  where d.empresa_id = v_empresa_id
    and d.numero_documento like 'SEED-CXC-%';

  -- 3) Insertar documentos (mezcla de al dia / vencidos)
  insert into public.cxc_documentos (
    empresa_id, tercero_id, tipo_documento, numero_documento, referencia,
    fecha_emision, fecha_vencimiento, moneda, tipo_cambio,
    monto_original, monto_pendiente, estado, descripcion
  )
  select
    v_empresa_id,
    t.id,
    x.tipo_documento,
    x.numero_documento,
    x.referencia,
    x.fecha_emision,
    x.fecha_vencimiento,
    x.moneda,
    x.tipo_cambio,
    x.monto_original,
    x.monto_original,
    'pendiente',
    x.descripcion
  from (
    values
      ('3101100001','JURIDICA','FACTURA','SEED-CXC-0001-F001','PED-1001', current_date - 90, current_date - 60,'CRC',1.00, 420000.00,'Venta contado extendido'),
      ('3101100001','JURIDICA','FACTURA','SEED-CXC-0001-F002','PED-1002', current_date - 40, current_date - 10,'CRC',1.00, 180000.00,'Reposicion mensual'),
      ('3101100002','JURIDICA','FACTURA','SEED-CXC-0002-F001','PED-2001', current_date - 65, current_date - 35,'USD',510.00, 2200.00,'Servicio transporte'),
      ('3101100002','JURIDICA','FACTURA','SEED-CXC-0002-F002','PED-2002', current_date - 20, current_date + 10,'USD',512.00, 980.00,'Servicio urgente'),
      ('203450100','FISICA','SALDO_INICIAL','SEED-CXC-0003-S001','MIG-0003', current_date - 120, current_date - 90,'CRC',1.00, 95000.00,'Saldo migrado'),
      ('3101100004','JURIDICA','FACTURA','SEED-CXC-0004-F001','PED-4001', current_date - 15, current_date + 15,'CRC',1.00, 310000.00,'Pedido ferreteria'),
      ('3101100005','JURIDICA','FACTURA','SEED-CXC-0005-F001','PED-5001', current_date - 75, current_date - 45,'CRC',1.00, 510000.00,'Insumos agricolas'),
      ('117890456','FISICA','FACTURA','SEED-CXC-0006-F001','PED-6001', current_date - 8,  current_date + 22,'CRC',1.00, 125000.00,'Venta mostrador')
  ) as x(identificacion, tipo_identificacion, tipo_documento, numero_documento, referencia, fecha_emision, fecha_vencimiento, moneda, tipo_cambio, monto_original, descripcion)
  join public.terceros t
    on t.empresa_id = v_empresa_id
   and lower(t.identificacion) = lower(x.identificacion)
   and lower(t.tipo_identificacion) = lower(x.tipo_identificacion);

  -- 4) Abonos parciales (recalcula pendiente/estado por trigger)
  insert into public.cxc_aplicaciones (
    empresa_id, documento_id, fecha_aplicacion, tipo_aplicacion, monto, referencia, observaciones, estado
  )
  select v_empresa_id, d.id, current_date - 20, 'ABONO', 150000.00, 'REC-0001', '[SEED-CXC] abono parcial', 'activo'
  from public.cxc_documentos d
  where d.empresa_id = v_empresa_id and d.numero_documento = 'SEED-CXC-0001-F001';

  insert into public.cxc_aplicaciones (
    empresa_id, documento_id, fecha_aplicacion, tipo_aplicacion, monto, referencia, observaciones, estado
  )
  select v_empresa_id, d.id, current_date - 5, 'ABONO', 500.00, 'REC-0002', '[SEED-CXC] abono parcial USD', 'activo'
  from public.cxc_documentos d
  where d.empresa_id = v_empresa_id and d.numero_documento = 'SEED-CXC-0002-F001';

  insert into public.cxc_aplicaciones (
    empresa_id, documento_id, fecha_aplicacion, tipo_aplicacion, monto, referencia, observaciones, estado
  )
  select v_empresa_id, d.id, current_date - 2, 'ABONO', 95000.00, 'REC-0003', '[SEED-CXC] pago total', 'activo'
  from public.cxc_documentos d
  where d.empresa_id = v_empresa_id and d.numero_documento = 'SEED-CXC-0003-S001';

  -- 5) Gestiones de cobro demo
  select d.id into v_doc_id
  from public.cxc_documentos d
  where d.empresa_id = v_empresa_id and d.numero_documento = 'SEED-CXC-0005-F001'
  limit 1;

  perform public.registrar_cxc_gestion_cobro(
    p_empresa_id => v_empresa_id,
    p_tercero_id => (select d.tercero_id from public.cxc_documentos d where d.id = v_doc_id),
    p_documento_id => v_doc_id,
    p_canal => 'LLAMADA',
    p_resultado => 'PROMESA_PAGO',
    p_compromiso_fecha => current_date + 7,
    p_compromiso_monto => 250000,
    p_observacion => '[SEED-CXC] Cliente promete abono en una semana'
  );

  select d.id into v_doc_id
  from public.cxc_documentos d
  where d.empresa_id = v_empresa_id and d.numero_documento = 'SEED-CXC-0001-F002'
  limit 1;

  perform public.registrar_cxc_gestion_cobro(
    p_empresa_id => v_empresa_id,
    p_tercero_id => (select d.tercero_id from public.cxc_documentos d where d.id = v_doc_id),
    p_documento_id => v_doc_id,
    p_canal => 'CORREO',
    p_resultado => 'PENDIENTE',
    p_compromiso_fecha => null,
    p_compromiso_monto => null,
    p_observacion => '[SEED-CXC] Se envio estado de cuenta al correo de facturacion'
  );

  select d.id into v_doc_id
  from public.cxc_documentos d
  where d.empresa_id = v_empresa_id and d.numero_documento = 'SEED-CXC-0002-F001'
  limit 1;

  perform public.registrar_cxc_gestion_cobro(
    p_empresa_id => v_empresa_id,
    p_tercero_id => (select d.tercero_id from public.cxc_documentos d where d.id = v_doc_id),
    p_documento_id => v_doc_id,
    p_canal => 'WHATSAPP',
    p_resultado => 'NO_LOCALIZADO',
    p_compromiso_fecha => null,
    p_compromiso_monto => null,
    p_observacion => '[SEED-CXC] Sin respuesta por whatsapp, escalar a tramite'
  );
end $$;

commit;

-- Verificacion rapida
select
  t.razon_social as cliente,
  t.identificacion,
  count(*) as docs,
  round(sum(d.monto_original), 2) as total_original,
  round(sum(d.monto_pendiente), 2) as total_pendiente
from public.cxc_documentos d
join public.terceros t on t.id = d.tercero_id
where d.numero_documento like 'SEED-CXC-%'
group by t.razon_social, t.identificacion
order by total_pendiente desc;
