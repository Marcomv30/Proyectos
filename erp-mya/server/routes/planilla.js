/**
 * planilla.js — Rutas API Módulo Planilla / Colaboradores
 * MYA ERP — Legislación Costa Rica
 */
import express from 'express';
import { requirePermission, adminSb } from '../lib/authz.js';
import { sendMail } from '../services/mailer.js';

const router = express.Router();

// -------------------------------------------------------
// GET /api/planilla/qr/:token
// Registro de marcación vía QR (terminal o app móvil)
// No requiere auth para permitir escaneo desde terminal externo
// -------------------------------------------------------
router.get('/qr/:token', async (req, res) => {
  const { token } = req.params;
  const { tipo } = req.query;
  const ip = req.ip;
  const sb = adminSb();

  const { data: colab, error: errColab } = await sb
    .from('pl_colaboradores')
    .select('id, nombre_completo, empresa_id, estado')
    .eq('qr_token', token)
    .maybeSingle();

  if (errColab || !colab) {
    return res.status(404).json({ ok: false, error: 'Token QR no encontrado.' });
  }
  if (!['activo', 'vacaciones', 'incapacitado'].includes(colab.estado)) {
    return res.status(403).json({ ok: false, error: 'Colaborador inactivo.' });
  }

  const hoy = new Date().toISOString().slice(0, 10);
  let tipoMarcacion = tipo || 'entrada';
  if (!tipo) {
    const { data: marcasHoy } = await sb
      .from('pl_marcaciones').select('tipo')
      .eq('colaborador_id', colab.id).eq('fecha', hoy).order('hora_marcacion');
    const tipos = (marcasHoy || []).map(m => m.tipo);
    if (!tipos.includes('entrada')) tipoMarcacion = 'entrada';
    else if (!tipos.includes('salida')) tipoMarcacion = 'salida';
    else tipoMarcacion = 'entrada';
  }

  const { error: errIns } = await sb.from('pl_marcaciones').insert({
    empresa_id: colab.empresa_id,
    colaborador_id: colab.id,
    fecha: hoy,
    tipo: tipoMarcacion,
    hora_marcacion: new Date().toISOString(),
    metodo: 'qr',
    ip_origen: ip,
  });

  if (errIns) return res.status(500).json({ ok: false, error: errIns.message });

  return res.json({
    ok: true,
    colaborador: colab.nombre_completo,
    tipo: tipoMarcacion,
    hora: new Date().toLocaleTimeString('es-CR'),
  });
});

// -------------------------------------------------------
// POST /api/planilla/marcacion-codigo
// Registro por número de identificación o código empleado
// Body: { empresa_id, codigo, tipo? }
// -------------------------------------------------------
router.post('/marcacion-codigo', async (req, res) => {
  const { empresa_id, codigo, tipo } = req.body;
  if (!empresa_id || !codigo) return res.status(400).json({ ok: false, error: 'empresa_id y codigo son requeridos.' });

  const sb = adminSb();
  const { data: colab } = await sb
    .from('pl_colaboradores')
    .select('id, nombre_completo, empresa_id, estado')
    .eq('empresa_id', empresa_id)
    .or(`identificacion.eq.${codigo},numero_empleado.eq.${codigo}`)
    .maybeSingle();

  if (!colab) return res.status(404).json({ ok: false, error: 'Colaborador no encontrado.' });
  if (!['activo', 'vacaciones'].includes(colab.estado)) return res.status(403).json({ ok: false, error: 'Colaborador inactivo.' });

  const hoy = new Date().toISOString().slice(0, 10);
  let tipoMarcacion = tipo || 'entrada';
  if (!tipo) {
    const { data: marcas } = await sb.from('pl_marcaciones').select('tipo')
      .eq('colaborador_id', colab.id).eq('fecha', hoy).order('hora_marcacion');
    const tipos = (marcas || []).map(m => m.tipo);
    tipoMarcacion = !tipos.includes('entrada') ? 'entrada' : 'salida';
  }

  await sb.from('pl_marcaciones').insert({
    empresa_id, colaborador_id: colab.id, fecha: hoy, tipo: tipoMarcacion,
    hora_marcacion: new Date().toISOString(), metodo: 'gafete',
  });

  return res.json({ ok: true, colaborador: colab.nombre_completo, tipo: tipoMarcacion });
});

// -------------------------------------------------------
// GET /api/planilla/resumen-mes/:empresa_id
// -------------------------------------------------------
router.get('/resumen-mes/:empresa_id', async (req, res) => {
  const { empresa_id } = req.params;
  const ctx = await requirePermission(req, res, Number(empresa_id), 'planilla:ver');
  if (!ctx) return;

  const sb = adminSb();
  const mesInicio = new Date().toISOString().slice(0, 7) + '-01';
  const mesFin = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

  const [
    { count: activos },
    { count: ausencias },
    { data: planilla },
  ] = await Promise.all([
    sb.from('pl_colaboradores').select('*', { count: 'exact', head: true }).eq('empresa_id', empresa_id).eq('estado', 'activo'),
    sb.from('pl_ausencias').select('*', { count: 'exact', head: true }).eq('empresa_id', empresa_id).gte('fecha_inicio', mesInicio).lte('fecha_inicio', mesFin).eq('estado', 'aprobada'),
    sb.from('pl_periodos').select('nombre,total_bruto,total_neto,total_patronal,estado').eq('empresa_id', empresa_id).gte('fecha_inicio', mesInicio).order('fecha_inicio', { ascending: false }).limit(1),
  ]);

  return res.json({
    ok: true,
    colaboradores_activos: activos ?? 0,
    ausencias_mes: ausencias ?? 0,
    planilla_activa: planilla?.[0] ?? null,
  });
});

// -------------------------------------------------------
// GET /api/planilla/colilla/:periodo_id/:colaborador_id
// -------------------------------------------------------
router.get('/colilla/:periodo_id/:colaborador_id', async (req, res) => {
  const { periodo_id, colaborador_id } = req.params;

  // Obtener empresa_id desde la línea de planilla
  const sb = adminSb();
  const { data: linea } = await sb.from('pl_planilla_lineas').select('*').eq('periodo_id', periodo_id).eq('colaborador_id', colaborador_id).maybeSingle();
  if (!linea) return res.status(404).json({ ok: false, error: 'Línea no encontrada.' });

  const ctx = await requirePermission(req, res, linea.empresa_id, 'planilla:ver');
  if (!ctx) return;

  const [{ data: colab }, { data: periodo }] = await Promise.all([
    sb.from('pl_colaboradores').select('nombre_completo,identificacion,numero_empleado,numero_asegurado,cargo_id,departamento_id').eq('id', colaborador_id).maybeSingle(),
    sb.from('pl_periodos').select('nombre,fecha_inicio,fecha_fin').eq('id', periodo_id).maybeSingle(),
  ]);

  return res.json({ ok: true, linea, colaborador: colab, periodo });
});

// -------------------------------------------------------
// GET /api/planilla/periodos/:periodo_id/preparar-asiento
// Dry-run: construye las líneas del asiento sin guardarlo
// -------------------------------------------------------
router.get('/periodos/:periodo_id/preparar-asiento', async (req, res) => {
  const { periodo_id } = req.params;
  const sb = adminSb();

  const { data: periodo } = await sb.from('pl_periodos').select('*').eq('id', periodo_id).maybeSingle();
  if (!periodo) return res.status(404).json({ ok: false, error: 'Período no encontrado.' });

  const ctx = await requirePermission(req, res, periodo.empresa_id, 'planilla:editar');
  if (!ctx) return;

  if (periodo.estado === 'contabilizado') return res.json({ ok: false, error: 'Este período ya está contabilizado.' });
  if (!['cerrado'].includes(periodo.estado)) return res.json({ ok: false, error: 'El período debe estar cerrado antes de contabilizar.' });

  // Cargar configuración de cuentas
  const { data: cfg } = await sb.from('pl_config_deducciones').select('*').eq('empresa_id', periodo.empresa_id).maybeSingle();
  if (!cfg) return res.json({ ok: false, error: 'No hay configuración de cuentas contables para planilla. Configure las cuentas primero.' });

  // Totales del período
  const { data: lineas } = await sb.from('pl_planilla_lineas').select('*').eq('periodo_id', periodo_id);
  if (!lineas?.length) return res.json({ ok: false, error: 'No hay líneas de planilla calculadas.' });

  const tot = lineas.reduce((acc, l) => ({
    bruto:       acc.bruto       + (l.total_bruto ?? 0),
    ccss_ob:     acc.ccss_ob     + (l.ded_ccss_obrero ?? 0),
    bp:          acc.bp          + (l.ded_banco_popular ?? 0),
    renta:       acc.renta       + (l.ded_renta ?? 0),
    pension:     acc.pension     + (l.ded_pension_comp ?? 0),
    asfa:        acc.asfa        + (l.ded_asfa ?? 0),
    embargo:     acc.embargo     + (l.ded_embargo ?? 0),
    adelanto:    acc.adelanto    + (l.ded_adelanto ?? 0),
    otras_ded:   acc.otras_ded   + (l.ded_otras ?? 0),
    neto:        acc.neto        + (l.salario_neto ?? 0),
    ccss_pat:    acc.ccss_pat    + (l.ccss_patronal ?? 0),
    aguinaldo:   acc.aguinaldo   + (l.provision_aguinaldo ?? 0),
    vacaciones:  acc.vacaciones  + (l.provision_vacaciones ?? 0),
    cesantia:    acc.cesantia    + (l.provision_cesantia ?? 0),
  }), { bruto:0, ccss_ob:0, bp:0, renta:0, pension:0, asfa:0, embargo:0, adelanto:0, otras_ded:0, neto:0, ccss_pat:0, aguinaldo:0, vacaciones:0, cesantia:0 });

  // Construir líneas del asiento contable
  // Estructura:
  //   DÉBITO:  Gasto Sueldos (bruto + cargas patronales + provisiones)
  //   CRÉDITO: CCSS por pagar (obrero + patronal)
  //            Renta por pagar
  //            Banco Popular por pagar
  //            Provisión aguinaldo
  //            Provisión vacaciones
  //            Provisión cesantía
  //            Sueldos netos por pagar

  const lineasAsiento = [];
  let lineaNum = 1;
  const ref = `PL-${periodo_id}`;

  const addLinea = (cuenta_id, descripcion, debito, credito) => {
    if (!cuenta_id || (debito === 0 && credito === 0)) return;
    lineasAsiento.push({ linea: lineaNum++, cuenta_id: Number(cuenta_id), descripcion, referencia: ref, debito_crc: Math.round(debito), credito_crc: Math.round(credito), debito_usd: 0, credito_usd: 0 });
  };

  // Débitos — gastos
  addLinea(cfg.cuenta_sueldos_id,           'Gasto sueldos — ' + periodo.nombre,       tot.bruto, 0);
  addLinea(cfg.cuenta_ccss_patronal_id,      'CCSS patronal — ' + periodo.nombre,        tot.ccss_pat, 0);
  addLinea(cfg.cuenta_prov_aguinaldo_id,     'Provisión aguinaldo — ' + periodo.nombre,  tot.aguinaldo, 0);
  addLinea(cfg.cuenta_prov_vacaciones_id,    'Provisión vacaciones — ' + periodo.nombre, tot.vacaciones, 0);
  addLinea(cfg.cuenta_prov_cesantia_id,      'Provisión cesantía — ' + periodo.nombre,   tot.cesantia, 0);

  // Créditos — pasivos
  addLinea(cfg.cuenta_ccss_obrero_id,        'CCSS obrero por pagar — '  + periodo.nombre, 0, tot.ccss_ob);
  addLinea(cfg.cuenta_ccss_patronal_id,      'CCSS patronal por pagar — ' + periodo.nombre, 0, tot.ccss_pat);
  addLinea(cfg.cuenta_renta_id,              'Renta retenida por pagar — ' + periodo.nombre, 0, tot.renta);
  addLinea(cfg.cuenta_banco_popular_id,      'Banco Popular por pagar — '  + periodo.nombre, 0, tot.bp);
  addLinea(cfg.cuenta_prov_aguinaldo_id,     'Provisión aguinaldo — ' + periodo.nombre,  0, tot.aguinaldo);
  addLinea(cfg.cuenta_prov_vacaciones_id,    'Provisión vacaciones — ' + periodo.nombre, 0, tot.vacaciones);
  addLinea(cfg.cuenta_prov_cesantia_id,      'Provisión cesantía — ' + periodo.nombre,   0, tot.cesantia);
  addLinea(cfg.cuenta_sueldos_pagar_id,      'Sueldos netos por pagar — ' + periodo.nombre, 0, tot.neto);

  // Verificar cuadre
  const totalDebito  = lineasAsiento.reduce((s, l) => s + l.debito_crc, 0);
  const totalCredito = lineasAsiento.reduce((s, l) => s + l.credito_crc, 0);

  // Obtener nombres de cuentas
  const cuentaIds = [...new Set(lineasAsiento.map(l => l.cuenta_id))];
  const { data: cuentas } = await sb.from('cuentas_catalogo').select('id,codigo,nombre').in('id', cuentaIds);
  const cuentaMap = Object.fromEntries((cuentas || []).map(c => [c.id, c]));
  lineasAsiento.forEach(l => {
    const info = cuentaMap[l.cuenta_id];
    l.cuenta_codigo = info?.codigo || '';
    l.cuenta_nombre = info?.nombre || '';
  });

  return res.json({
    ok: true,
    periodo: { id: periodo.id, nombre: periodo.nombre, fecha_inicio: periodo.fecha_inicio, fecha_fin: periodo.fecha_fin },
    totales: tot,
    lineas: lineasAsiento,
    total_debito: totalDebito,
    total_credito: totalCredito,
    cuadra: Math.abs(totalDebito - totalCredito) < 1,
  });
});

// -------------------------------------------------------
// POST /api/planilla/periodos/:periodo_id/confirmar-asiento
// Confirma y guarda el asiento contable
// -------------------------------------------------------
router.post('/periodos/:periodo_id/confirmar-asiento', async (req, res) => {
  const { periodo_id } = req.params;
  const { empresa_id, lineas, descripcion, categoria_id } = req.body;
  if (!empresa_id || !lineas?.length) return res.status(400).json({ ok: false, error: 'Parámetros incompletos.' });

  const ctx = await requirePermission(req, res, Number(empresa_id), 'planilla:editar');
  if (!ctx) return;

  const sb = adminSb();
  const { data: periodo } = await sb.from('pl_periodos').select('*').eq('id', periodo_id).eq('empresa_id', empresa_id).maybeSingle();
  if (!periodo) return res.json({ ok: false, error: 'Período no encontrado.' });
  if (periodo.estado === 'contabilizado') return res.json({ ok: false, error: 'Ya está contabilizado.' });

  try {
    const { data: resultRpc, error: rpcErr } = await sb.rpc('contabilizar_comprobante', {
      p_empresa_id:   Number(empresa_id),
      p_fecha:        periodo.fecha_fin,
      p_descripcion:  descripcion || `Planilla ${periodo.nombre}`,
      p_categoria_id: categoria_id || null,
      p_moneda:       'CRC',
      p_tipo_cambio:  1,
      p_lineas:       lineas.map((l, i) => ({
        linea:       i + 1,
        cuenta_id:   Number(l.cuenta_id),
        descripcion: l.descripcion,
        referencia:  `PL-${periodo_id}`,
        debito_crc:  Number(l.debito_crc  || 0),
        credito_crc: Number(l.credito_crc || 0),
        debito_usd:  0,
        credito_usd: 0,
      })),
    });

    if (rpcErr) throw new Error(rpcErr.message);
    if (!resultRpc) throw new Error('No se pudo crear el asiento.');

    await sb.from('pl_periodos').update({
      estado:     'contabilizado',
      asiento_id: resultRpc.asiento_id,
      updated_at: new Date().toISOString(),
    }).eq('id', periodo_id);

    return res.json({ ok: true, asiento_id: resultRpc.asiento_id, numero_formato: resultRpc.numero_formato });
  } catch (e) {
    console.error('Error contabilizando planilla:', e);
    return res.json({ ok: false, error: e.message });
  }
});

// -------------------------------------------------------
// GET /api/planilla/colilla/:periodo_id/:colaborador_id/pdf
// Genera el PDF de la colilla y lo devuelve como descarga
// -------------------------------------------------------
router.get('/colilla/:periodo_id/:colaborador_id/pdf', async (req, res) => {
  const { periodo_id, colaborador_id } = req.params;
  const sb = adminSb();

  const { data: linea } = await sb.from('pl_planilla_lineas').select('*').eq('periodo_id', periodo_id).eq('colaborador_id', colaborador_id).maybeSingle();
  if (!linea) return res.status(404).json({ ok: false, error: 'Línea no encontrada.' });

  const ctx = await requirePermission(req, res, linea.empresa_id, 'planilla:ver');
  if (!ctx) return;

  const [{ data: colab }, { data: periodo }, { data: empresa }] = await Promise.all([
    sb.from('pl_colaboradores').select('nombre_completo,identificacion,numero_empleado,numero_asegurado,banco,numero_cuenta').eq('id', colaborador_id).maybeSingle(),
    sb.from('pl_periodos').select('nombre,fecha_inicio,fecha_fin,frecuencia').eq('id', periodo_id).maybeSingle(),
    sb.from('empresas').select('nombre,cedula').eq('id', linea.empresa_id).maybeSingle(),
  ]);
  if (!colab || !periodo || !empresa) return res.status(404).json({ ok: false, error: 'Datos incompletos.' });

  const fmt = (n) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n ?? 0);
  const fmtF = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CR') : '—';

  const ingresosRows = [
    `<tr><td>Salario base (${linea.dias_laborados} días)</td><td>${fmt(linea.salario_base)}</td></tr>`,
    linea.horas_extra_diurnas > 0 ? `<tr><td>H. Extra diurnas (${linea.horas_extra_diurnas}h × 1.5)</td><td>${fmt(linea.monto_he_diurnas)}</td></tr>` : '',
    linea.horas_extra_nocturnas > 0 ? `<tr><td>H. Extra nocturnas (${linea.horas_extra_nocturnas}h × 2.0)</td><td>${fmt(linea.monto_he_nocturnas)}</td></tr>` : '',
    (linea.horas_extra_feriado ?? 0) > 0 ? `<tr><td>H. Feriado (×2.0)</td><td>${fmt(linea.monto_he_feriado)}</td></tr>` : '',
    linea.bonificacion > 0 ? `<tr><td>Bonificación</td><td>${fmt(linea.bonificacion)}</td></tr>` : '',
    linea.comision > 0 ? `<tr><td>Comisión</td><td>${fmt(linea.comision)}</td></tr>` : '',
    linea.otros_ingresos > 0 ? `<tr><td>Otros ingresos</td><td>${fmt(linea.otros_ingresos)}</td></tr>` : '',
    `<tr class="total"><td>Total Bruto</td><td>${fmt(linea.total_bruto)}</td></tr>`,
  ].filter(Boolean).join('');

  const dedsRows = [
    [linea.ded_ccss_obrero, 'CCSS Obrero'],
    [linea.ded_banco_popular, 'Banco Popular (1%)'],
    [linea.ded_renta, 'Impuesto sobre la Renta'],
    [linea.ded_pension_comp, 'Pensión Complementaria'],
    [linea.ded_asfa, 'Solidarista'],
    [linea.ded_embargo, 'Embargo judicial'],
    [linea.ded_adelanto, 'Adelanto de salario'],
    [linea.ded_otras, 'Otras deducciones'],
  ].filter(([v]) => (v ?? 0) > 0)
    .map(([v, l]) => `<tr><td>${l}</td><td class="neg">(${fmt(v)})</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #0f172a; background: #fff; padding: 28px 32px; }
  .hdr { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 2px solid #16a34a; margin-bottom: 16px; }
  .hdr-left { display: flex; align-items: center; gap: 12px; }
  .logo { width: 42px; height: 42px; border-radius: 10px; background: linear-gradient(135deg,#16a34a,#22c55e); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 18px; flex-shrink: 0; }
  .empresa-nombre { font-size: 15px; font-weight: 800; }
  .empresa-ced { font-size: 10px; color: #64748b; margin-top: 2px; }
  .hdr-right { text-align: right; }
  .hdr-right .titulo { font-size: 11px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: .04em; }
  .hdr-right .periodo { font-size: 10px; color: #475569; margin-top: 2px; }
  .hdr-right .fechas { font-size: 10px; color: #94a3b8; }
  .colab-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
  .colab-box .nombre { font-size: 14px; font-weight: 800; margin-bottom: 6px; }
  .colab-datos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 16px; }
  .colab-dato .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #16a34a; }
  .colab-dato .val { font-size: 11px; }
  .sec { background: #f8fafc; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; }
  .sec-t { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin-bottom: 6px; }
  .sec-t.red { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; }
  tr td { padding: 4px 0; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
  tr td:last-child { text-align: right; font-family: monospace; }
  tr.total td { font-weight: 800; font-size: 12px; border-top: 2px solid #e2e8f0; border-bottom: none; padding-top: 6px; }
  .neg { color: #dc2626; }
  .neto-box { background: #f0fdf4; border: 2px solid #16a34a; border-radius: 10px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .neto-lbl { font-size: 12px; font-weight: 700; color: #16a34a; }
  .neto-banco { font-size: 10px; color: #475569; margin-top: 3px; }
  .neto-val { font-size: 22px; font-weight: 900; color: #16a34a; font-family: monospace; }
  .notas { font-size: 10px; color: #64748b; background: #f8fafc; border-radius: 6px; padding: 6px 10px; margin-bottom: 14px; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
  .firma { text-align: center; }
  .firma-linea { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; color: #64748b; margin-top: 36px; }
  .footer { margin-top: 14px; font-size: 9px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <div class="logo">${empresa.nombre.charAt(0).toUpperCase()}</div>
      <div>
        <div class="empresa-nombre">${empresa.nombre}</div>
        ${empresa.cedula ? `<div class="empresa-ced">Cédula Jurídica: ${empresa.cedula}</div>` : ''}
      </div>
    </div>
    <div class="hdr-right">
      <div class="titulo">Comprobante de Pago</div>
      <div class="periodo">${periodo.nombre}</div>
      <div class="fechas">${fmtF(periodo.fecha_inicio)} al ${fmtF(periodo.fecha_fin)}</div>
    </div>
  </div>

  <div class="colab-box">
    <div class="nombre">${colab.nombre_completo}</div>
    <div class="colab-datos">
      <div class="colab-dato"><div class="lbl">Cédula</div><div class="val">${colab.identificacion}</div></div>
      ${colab.numero_empleado ? `<div class="colab-dato"><div class="lbl">Código</div><div class="val">${colab.numero_empleado}</div></div>` : ''}
      ${colab.numero_asegurado ? `<div class="colab-dato"><div class="lbl">N° Asegurado</div><div class="val">${colab.numero_asegurado}</div></div>` : ''}
    </div>
  </div>

  <div class="sec">
    <div class="sec-t">Ingresos</div>
    <table>${ingresosRows}</table>
  </div>

  <div class="sec">
    <div class="sec-t red">Deducciones</div>
    <table>
      ${dedsRows}
      <tr class="total"><td class="neg">Total Deducciones</td><td class="neg">(${fmt(linea.total_deducciones)})</td></tr>
    </table>
  </div>

  <div class="neto-box">
    <div>
      <div class="neto-lbl">SALARIO NETO A PAGAR</div>
      ${colab.banco ? `<div class="neto-banco">Depósito: ${colab.banco}${colab.numero_cuenta ? ` — ${colab.numero_cuenta}` : ''}</div>` : ''}
    </div>
    <div class="neto-val">${fmt(linea.salario_neto)}</div>
  </div>

  ${linea.notas ? `<div class="notas"><strong>Observaciones:</strong> ${linea.notas}</div>` : ''}

  <div class="firmas">
    <div class="firma">
      <div class="firma-linea">${empresa.nombre}<br>Patrono / Representante Legal</div>
    </div>
    <div class="firma">
      <div class="firma-linea">${colab.nombre_completo}<br>Cédula: ${colab.identificacion}</div>
    </div>
  </div>

  <div class="footer">
    Generado por MYA ERP · ${new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' })} · Documento confidencial
  </div>
</body>
</html>`;

  let browser;
  try {
    const { launch } = await import('puppeteer-core');
    browser = await launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    await browser.close();

    const nombreArchivo = `Colilla_${colab.nombre_completo.replace(/\s+/g, '_')}_${periodo.nombre.replace(/\s+/g, '_')}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.end(pdfBuffer);
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error('Error generando PDF colilla:', e);
    return res.status(500).json({ ok: false, error: 'Error generando PDF: ' + e.message });
  }
});

// -------------------------------------------------------
// POST /api/planilla/colilla/:periodo_id/:colaborador_id/enviar-email
// Genera el HTML de la colilla y lo envía al email del colaborador
// -------------------------------------------------------
router.post('/colilla/:periodo_id/:colaborador_id/enviar-email', async (req, res) => {
  const { periodo_id, colaborador_id } = req.params;
  const { email_destino } = req.body; // opcional — si no se pasa, usa el del colaborador
  const sb = adminSb();

  const { data: linea } = await sb.from('pl_planilla_lineas').select('*').eq('periodo_id', periodo_id).eq('colaborador_id', colaborador_id).maybeSingle();
  if (!linea) return res.status(404).json({ ok: false, error: 'Línea no encontrada.' });

  const ctx = await requirePermission(req, res, linea.empresa_id, 'planilla:ver');
  if (!ctx) return;

  const [{ data: colab }, { data: periodo }, { data: empresa }] = await Promise.all([
    sb.from('pl_colaboradores').select('nombre_completo,identificacion,numero_empleado,numero_asegurado,email,email_personal,banco,numero_cuenta').eq('id', colaborador_id).maybeSingle(),
    sb.from('pl_periodos').select('nombre,fecha_inicio,fecha_fin,frecuencia').eq('id', periodo_id).maybeSingle(),
    sb.from('empresas').select('nombre,cedula').eq('id', linea.empresa_id).maybeSingle(),
  ]);

  if (!colab || !periodo || !empresa) return res.json({ ok: false, error: 'Datos incompletos.' });

  const destinatario = email_destino || colab.email || colab.email_personal;
  if (!destinatario) return res.json({ ok: false, error: 'El colaborador no tiene email registrado.' });

  const fmt = (n) => new Intl.NumberFormat('es-CR', { style:'currency', currency:'CRC', maximumFractionDigits:0 }).format(n ?? 0);
  const fmtF = (s) => s ? new Date(s+'T12:00:00').toLocaleDateString('es-CR') : '—';

  // Construir filas de ingresos
  const ingresosRows = [
    `<tr><td>Salario base (${linea.dias_laborados} días)</td><td align="right">${fmt(linea.salario_base)}</td></tr>`,
    linea.horas_extra_diurnas > 0 ? `<tr><td>H. Extra diurnas (${linea.horas_extra_diurnas}h × 1.5)</td><td align="right">${fmt(linea.monto_he_diurnas)}</td></tr>` : '',
    linea.horas_extra_nocturnas > 0 ? `<tr><td>H. Extra nocturnas (${linea.horas_extra_nocturnas}h × 2.0)</td><td align="right">${fmt(linea.monto_he_nocturnas)}</td></tr>` : '',
    (linea.horas_extra_feriado ?? 0) > 0 ? `<tr><td>H. Feriado (×2.0)</td><td align="right">${fmt(linea.monto_he_feriado)}</td></tr>` : '',
    linea.bonificacion > 0 ? `<tr><td>Bonificación</td><td align="right">${fmt(linea.bonificacion)}</td></tr>` : '',
    linea.comision > 0 ? `<tr><td>Comisión</td><td align="right">${fmt(linea.comision)}</td></tr>` : '',
    linea.otros_ingresos > 0 ? `<tr><td>Otros ingresos</td><td align="right">${fmt(linea.otros_ingresos)}</td></tr>` : '',
  ].filter(Boolean).join('');

  // Construir filas de deducciones
  const dedsRows = [
    [linea.ded_ccss_obrero,   'CCSS Obrero'],
    [linea.ded_banco_popular, 'Banco Popular (1%)'],
    [linea.ded_renta,         'Impuesto sobre la Renta'],
    [linea.ded_pension_comp,  'Pensión Complementaria'],
    [linea.ded_asfa,          'Solidarista'],
    [linea.ded_embargo,       'Embargo judicial'],
    [linea.ded_adelanto,      'Adelanto de salario'],
    [linea.ded_otras,         'Otras deducciones'],
  ].filter(([v]) => (v ?? 0) > 0).map(([v, l]) =>
    `<tr><td>${l}</td><td align="right" style="color:#dc2626;">(${fmt(v)})</td></tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprobante de Pago — ${periodo.nombre}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#f1f5f9; margin:0; padding:20px; }
  .wrap { max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,.10); }
  .hdr { background:linear-gradient(135deg,#16a34a,#22c55e); padding:24px 28px; color:#fff; }
  .hdr h1 { margin:0 0 4px; font-size:20px; font-weight:800; }
  .hdr p  { margin:0; font-size:13px; opacity:.85; }
  .body { padding:24px 28px; }
  .colab-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:14px 16px; margin-bottom:18px; }
  .colab-box h2 { margin:0 0 6px; font-size:16px; color:#0f172a; font-weight:800; }
  .colab-box p  { margin:0; font-size:12px; color:#475569; }
  table { width:100%; border-collapse:collapse; margin-bottom:14px; }
  th { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#64748b; padding:4px 0; border-bottom:2px solid #e2e8f0; text-align:left; }
  td { padding:6px 0; font-size:13px; color:#334155; border-bottom:1px solid #f1f5f9; }
  td:last-child { text-align:right; font-family:monospace; }
  .total-row td { font-weight:800; font-size:14px; border-top:2px solid #e2e8f0; border-bottom:none; padding-top:8px; }
  .neto { background:#f0fdf4; border:2px solid #16a34a; border-radius:10px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
  .neto-lbl { font-size:14px; font-weight:700; color:#16a34a; }
  .neto-val { font-size:24px; font-weight:900; color:#16a34a; font-family:monospace; }
  .footer { background:#f8fafc; padding:14px 28px; font-size:11px; color:#94a3b8; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>${empresa.nombre}</h1>
    <p>${empresa.cedula ? `Cédula Jurídica: ${empresa.cedula} · ` : ''}Comprobante de Pago</p>
  </div>
  <div class="body">
    <div class="colab-box">
      <h2>${colab.nombre_completo}</h2>
      <p>Cédula: ${colab.identificacion}${colab.numero_empleado ? ` · Código: ${colab.numero_empleado}` : ''}${colab.numero_asegurado ? ` · N° Asegurado: ${colab.numero_asegurado}` : ''}</p>
    </div>

    <p style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 4px;">${periodo.nombre}</p>
    <p style="font-size:12px;color:#64748b;margin:0 0 16px;">${fmtF(periodo.fecha_inicio)} al ${fmtF(periodo.fecha_fin)}</p>

    <table>
      <tr><th colspan="2">Ingresos</th></tr>
      ${ingresosRows}
      <tr class="total-row"><td>Total Bruto</td><td>${fmt(linea.total_bruto)}</td></tr>
    </table>

    <table>
      <tr><th colspan="2" style="color:#dc2626;">Deducciones</th></tr>
      ${dedsRows}
      <tr class="total-row"><td style="color:#dc2626;">Total Deducciones</td><td style="color:#dc2626;">(${fmt(linea.total_deducciones)})</td></tr>
    </table>

    <div class="neto">
      <div>
        <div class="neto-lbl">SALARIO NETO A PAGAR</div>
        ${colab.banco ? `<div style="font-size:11px;color:#475569;margin-top:3px;">Depósito: ${colab.banco}${colab.numero_cuenta ? ` — ${colab.numero_cuenta}` : ''}</div>` : ''}
      </div>
      <div class="neto-val">${fmt(linea.salario_neto)}</div>
    </div>

    <p style="font-size:11px;color:#94a3b8;text-align:center;">Si tiene alguna consulta sobre este comprobante, contacte al departamento de Recursos Humanos.</p>
  </div>
  <div class="footer">
    Generado por MYA ERP · ${new Date().toLocaleDateString('es-CR',{timeZone:'America/Costa_Rica'})} · Documento confidencial
  </div>
</div>
</body></html>`;

  try {
    await sendMail({
      to: destinatario,
      subject: `Comprobante de Pago — ${periodo.nombre} — ${empresa.nombre}`,
      html,
    });
    return res.json({ ok: true, enviado_a: destinatario });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

// -------------------------------------------------------
// POST /api/planilla/reporte-pdf
// Recibe HTML ya construido en el frontend y devuelve PDF
// Body: { html: string, nombre: string }
// -------------------------------------------------------
router.post('/reporte-pdf', async (req, res) => {
  const { html, nombre } = req.body;
  if (!html) return res.status(400).json({ ok: false, error: 'html requerido.' });

  // Verificar que el usuario esté autenticado (cualquier empresa)
  const sb = adminSb();
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (token) {
    const { error } = await sb.auth.getUser(token);
    if (error) return res.status(401).json({ ok: false, error: 'No autorizado.' });
  }

  let browser;
  try {
    const { launch } = await import('puppeteer-core');
    browser = await launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      landscape: true,
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    await browser.close();

    const nombreArchivo = (nombre || 'reporte_planilla').replace(/[^a-zA-Z0-9_\-]/g, '_') + '.pdf';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.end(pdfBuffer);
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error('Error generando reporte PDF:', e);
    return res.status(500).json({ ok: false, error: 'Error generando PDF: ' + e.message });
  }
});

// -------------------------------------------------------
// GET/PUT /api/planilla/config-cuentas/:empresa_id
// Configuración de cuentas contables para planilla
// -------------------------------------------------------
router.get('/config-cuentas/:empresa_id', async (req, res) => {
  const { empresa_id } = req.params;
  const ctx = await requirePermission(req, res, Number(empresa_id), 'planilla:ver');
  if (!ctx) return;

  const sb = adminSb();
  const { data } = await sb.from('pl_config_deducciones').select('*').eq('empresa_id', empresa_id).maybeSingle();
  return res.json({ ok: true, config: data || null });
});

router.put('/config-cuentas/:empresa_id', async (req, res) => {
  const { empresa_id } = req.params;
  const ctx = await requirePermission(req, res, Number(empresa_id), 'planilla:editar');
  if (!ctx) return;

  const sb = adminSb();
  const campos = [
    'cuenta_sueldos_id','cuenta_ccss_obrero_id','cuenta_ccss_patronal_id',
    'cuenta_renta_id','cuenta_banco_popular_id','cuenta_solidarista_id',
    'cuenta_prov_aguinaldo_id','cuenta_prov_vacaciones_id','cuenta_prov_cesantia_id',
    'cuenta_sueldos_pagar_id','categoria_asiento_id',
  ];
  const payload = {};
  campos.forEach(c => { if (req.body[c] !== undefined) payload[c] = req.body[c] || null; });
  payload.updated_at = new Date().toISOString();

  const { error } = await sb.from('pl_config_deducciones').update(payload).eq('empresa_id', empresa_id);
  if (error) return res.json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

export default router;
