/**
 * facturacionEmitir.js — Ruta para emitir comprobantes al MH
 *
 * POST /api/facturacion/emitir/:id      — genera XML, firma, envía al MH
 * GET  /api/facturacion/estado/:id      — consulta estado en MH
 * GET  /api/facturacion/xml/:id         — devuelve XML firmado del documento
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminSb, requirePermission } from '../lib/authz.js';
import { desencriptarPassword } from '../services/correoImap.js';
import { construirXml, generarClave, generarConsecutivo } from '../services/feXml.js';
import { firmarXml } from '../services/feFirma.js';
import { obtenerToken, enviarDocumento, consultarEstado } from '../services/feMh.js';
import { sendMail } from '../services/mailer.js';
import { htmlToPdf } from '../services/pdfGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CERT_BASE_DIR = process.env.FE_CERT_DIR || path.resolve(__dirname, '../private/fe-certificados');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function cargarConfigEmisor(sb, empresaId) {
  const { data, error } = await sb
    .from('fe_config_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .single();
  if (error || !data) throw new Error('No hay configuración FE para esta empresa');
  return data;
}

async function cargarDocumento(sb, docId, empresaId) {
  const { data, error } = await sb
    .from('fe_documentos')
    .select('*')
    .eq('id', docId)
    .eq('empresa_id', empresaId)
    .single();
  if (error || !data) throw new Error('Documento no encontrado');
  return data;
}

export async function cargarLineas(sb, docId) {
  const { data, error } = await sb
    .from('fe_documento_lineas')
    .select('*')
    .eq('documento_id', docId)
    .order('linea', { ascending: true });
  if (error) throw new Error('Error cargando líneas: ' + error.message);
  return data || [];
}

function resolverAmbiente(cfg) {
  return (cfg.ambiente || 'pruebas') === 'produccion' ? 'produccion' : 'pruebas';
}

function resolverEstadoMh(data, httpStatus, fallback = 'enviado') {
  const bruto = String(
    data?.ind_estado ??
    data?.['ind-estado'] ??
    data?.indEstado ??
    data?.estado ??
    data?.status ??
    data?.respuesta?.ind_estado ??
    data?.respuesta?.['ind-estado'] ??
    data?.respuesta?.indEstado ??
    ''
  ).toLowerCase().trim();

  if (bruto.includes('acept')) return 'aceptado';
  if (bruto.includes('rechaz')) return 'rechazado';
  if (bruto.includes('proces')) return 'procesando';
  if (bruto.includes('pend')) return 'procesando';
  if (httpStatus === 202) return 'procesando';
  if (httpStatus === 200 || httpStatus === 201) return fallback;
  return fallback;
}

function fechaMhActual() {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - (6 * 60 * 60 * 1000));
  return `${local.toISOString().slice(0, 19)}-06:00`;
}

function inferirTipoIdentificacionReceptor(identificacion) {
  const raw = String(identificacion || '').replace(/\D/g, '');
  if (raw.length === 9) return '01';
  if (raw.length === 10) return '02';
  if (raw.length >= 11) return '03';
  return '';
}

function sumarDiasIso(fechaIso, dias) {
  const base = String(fechaIso || '').slice(0, 10);
  if (!base) return null;
  const [yy, mm, dd] = base.split('-').map((v) => Number(v || 0));
  if (!yy || !mm || !dd) return null;
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + Number(dias || 0));
  return dt.toISOString().slice(0, 10);
}

function resolverCertMeta(cfg, ambiente) {
  if (ambiente === 'produccion') {
    return {
      ruta: cfg.certificado_ruta_interna_produccion,
      nombre: cfg.certificado_nombre_archivo_produccion,
      rutaField: 'certificado_ruta_interna_produccion',
      baseName: 'certificado_emisor_produccion',
    };
  }
  return {
    ruta: cfg.certificado_ruta_interna,
    nombre: cfg.certificado_nombre_archivo,
    rutaField: 'certificado_ruta_interna',
    baseName: 'certificado_emisor_pruebas',
  };
}

function resolverExtCert(nombreArchivo, rutaInterna) {
  const extNombre = path.extname(String(nombreArchivo || '')).toLowerCase();
  if (extNombre === '.p12' || extNombre === '.pfx') return extNombre;
  const extRuta = path.extname(String(rutaInterna || '')).toLowerCase();
  if (extRuta === '.p12' || extRuta === '.pfx') return extRuta;
  return '.p12';
}

async function resolverRutaCertificado(sb, cfg, empresaId, ambiente) {
  const meta = resolverCertMeta(cfg, ambiente);
  const rutaRegistrada = String(meta.ruta || '').trim();

  if (rutaRegistrada && fs.existsSync(rutaRegistrada)) {
    return rutaRegistrada;
  }

  const ext = resolverExtCert(meta.nombre, rutaRegistrada);
  const empresaDir = path.join(CERT_BASE_DIR, String(empresaId));
  const candidatas = [
    path.join(empresaDir, `${meta.baseName}${ext}`),
    path.join(empresaDir, `${meta.baseName}.p12`),
    path.join(empresaDir, `${meta.baseName}.pfx`),
  ];

  const rutaReal = candidatas.find((ruta) => fs.existsSync(ruta));
  if (!rutaReal) {
    return rutaRegistrada;
  }

  if (rutaRegistrada !== rutaReal) {
    await sb
      .from('fe_config_empresa')
      .update({ [meta.rutaField]: rutaReal, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresaId);
  }

  return rutaReal;
}

async function asegurarDocumentoCxcDesdeFe(sb, doc, empresaId, numeroConsecutivo) {
  const esFacturaCredito = ['01', '09'].includes(String(doc.tipo_documento || '')) && String(doc.condicion_venta || '') === '02';
  if (!esFacturaCredito) return { status: 'skipped', reason: 'tipo' };
  if (!doc.tercero_id) return { status: 'skipped', reason: 'tercero' };

  const numeroDocumento = String(numeroConsecutivo || doc.numero_consecutivo || '').trim();
  if (!numeroDocumento) return { status: 'skipped', reason: 'numero' };

  const fechaEmision = String(doc.fecha_emision || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const plazoDias = Math.max(0, Number(doc.plazo_credito_dias || 0));
  const fechaVencimiento = sumarDiasIso(fechaEmision, plazoDias);
  const montoOriginal = Number(doc.total_comprobante || 0);
  const referencia = String(doc.clave_mh || '').trim() || null;
  const descripcion = String(doc.observacion || '').trim() || `Factura electrónica ${numeroDocumento}`;

  const { data: existente, error: findErr } = await sb
    .from('cxc_documentos')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('tipo_documento', 'FACTURA')
    .eq('numero_documento', numeroDocumento)
    .maybeSingle();
  if (findErr) throw new Error('Error validando CxC: ' + findErr.message);
  if (existente?.id) return { status: 'existing', id: existente.id };

  const { error: insErr } = await sb.from('cxc_documentos').insert({
    empresa_id: empresaId,
    tercero_id: doc.tercero_id,
    tipo_documento: 'FACTURA',
    numero_documento: numeroDocumento,
    referencia,
    fecha_emision: fechaEmision,
    fecha_vencimiento: fechaVencimiento,
    moneda: doc.moneda === 'USD' ? 'USD' : 'CRC',
    tipo_cambio: 1,
    monto_original: montoOriginal,
    monto_pendiente: montoOriginal,
    estado: montoOriginal > 0 ? 'pendiente' : 'pagado',
    descripcion,
  });
  if (insErr) throw new Error('Error creando documento CxC: ' + insErr.message);
  return { status: 'created' };
}

// ── Core de emisión (reutilizable desde cron y ruta HTTP) ────────────────────

export async function emitirDocumentoCore(sb, docId, empresaId) {
  const doc = await cargarDocumento(sb, docId, empresaId);

  if (doc.estado !== 'confirmado') throw new Error('Solo se pueden emitir documentos en estado "confirmado".');
  if (doc.estado_mh === 'aceptado') throw new Error('Este documento ya fue aceptado por Hacienda.');

  const cfg    = await cargarConfigEmisor(sb, empresaId);
  const lineas = await cargarLineas(sb, docId);
  if (!lineas.length) throw new Error('El documento no tiene líneas.');
  if (doc.receptor_identificacion) {
    const tipoInferido = inferirTipoIdentificacionReceptor(doc.receptor_identificacion);
    if (tipoInferido && doc.receptor_tipo_identificacion !== tipoInferido) {
      await sb.from('fe_documentos').update({ receptor_tipo_identificacion: tipoInferido }).eq('id', docId);
      doc.receptor_tipo_identificacion = tipoInferido;
    }
  }

  const lineasSinCabys = lineas
    .filter((l) => !/^\d{13}$/.test(String(l.cabys || '').trim()))
    .map((l) => `Línea ${l.linea || '?'}: ${l.descripcion || l.codigo_interno || 'Sin descripción'}`);
  if (lineasSinCabys.length) {
    throw new Error(`Falta Codigo CABYS en ${lineasSinCabys.length} linea(s) del documento. Complete el CABYS antes de emitir. ${lineasSinCabys.join(' | ')}`);
  }

  // ── Validación NC/ND: InformacionReferencia es OBLIGATORIA en MH v4.4 ──────
  if (['02', '03'].includes(doc.tipo_documento)) {
    if (doc.tipo_documento === '02' && String(doc.ref_codigo || '').trim() === '03') {
      doc.ref_codigo = '12';
      await sb.from('fe_documentos').update({ ref_codigo: '12' }).eq('id', docId);
    }
    // Si ref_numero está ausente o no tiene 50 dígitos pero hay ref_doc_id,
    // intentar recuperar la clave_mh del documento referenciado y persistirla.
    if ((!doc.ref_numero || String(doc.ref_numero).trim().length !== 50) && doc.ref_doc_id) {
      const { data: refDocData } = await sb
        .from('fe_documentos')
        .select('clave_mh, fecha_emision, tipo_documento')
        .eq('id', doc.ref_doc_id)
        .single();
      if (refDocData?.clave_mh && String(refDocData.clave_mh).trim().length === 50) {
        // Persistir en el documento actual para futuros intentos
        await sb.from('fe_documentos').update({
          ref_numero:       refDocData.clave_mh,
          ref_fecha_emision: doc.ref_fecha_emision || refDocData.fecha_emision,
          ref_tipo_doc:     doc.ref_tipo_doc || refDocData.tipo_documento || '01',
        }).eq('id', docId);
        doc.ref_numero       = refDocData.clave_mh;
        doc.ref_fecha_emision = doc.ref_fecha_emision || refDocData.fecha_emision;
        doc.ref_tipo_doc     = doc.ref_tipo_doc || refDocData.tipo_documento || '01';
      }
    }
    if (!doc.ref_numero || String(doc.ref_numero).trim().length !== 50) {
      throw new Error('La Nota de Crédito/Débito requiere la clave MH (50 dígitos) del documento de referencia. El documento referenciado aún no ha sido aceptado por Hacienda.');
    }
    if (!doc.ref_fecha_emision) {
      throw new Error('La Nota de Crédito/Débito requiere la fecha del documento de referencia.');
    }
    if (!doc.ref_codigo || !['01','02','04','05','06','07','08','09','10','11','12','99'].includes(doc.ref_codigo)) {
      throw new Error('La Nota de Crédito/Débito requiere un código de motivo válido (01-05).');
    }
  }

  const ambiente = resolverAmbiente(cfg);

  // ── Consecutivo atómico ──────────────────────────────────────────────────
  // El terminal puede venir del propio documento (multi-terminal) o de la
  // config global de la empresa como fallback.
  const docSucursal    = doc.sucursal    && String(doc.sucursal).trim()    ? String(doc.sucursal).padStart(3, '0')    : (cfg.sucursal    || '001');
  const docPuntoVenta  = doc.punto_venta && String(doc.punto_venta).trim() ? String(doc.punto_venta).padStart(5, '0') : (cfg.punto_venta || '00001');

  let numeroConsec = null;
  const reutilizaConsecutivo = !!(doc.numero_consecutivo && doc.clave_mh);
  if (!reutilizaConsecutivo) {
    const { data: rpcData, error: rpcErr } = await sb.rpc('fe_siguiente_consecutivo', {
      p_empresa_id:  empresaId,
      p_tipo:        doc.tipo_documento,
      p_sucursal:    docSucursal,
      p_punto_venta: docPuntoVenta,
    });
    if (rpcErr) throw new Error('Error generando consecutivo: ' + rpcErr.message);
    numeroConsec = Number(rpcData);
  }

  const consecutivo    = reutilizaConsecutivo
    ? doc.numero_consecutivo
    : generarConsecutivo(docSucursal, docPuntoVenta, doc.tipo_documento, numeroConsec);
  const consecutivoStr = String(consecutivo).padStart(20, '0');
  const fechaEmisionIso = fechaMhActual();
  const clave = doc.clave_mh || generarClave({
    fecha:           new Date(fechaEmisionIso),
    tipoIdentEmisor: cfg.tipo_identificacion || '02',
    idEmisor:        cfg.numero_identificacion || '',
    sucursal:        consecutivoStr.slice(0, 3),
    puntoVenta:      consecutivoStr.slice(3, 8),
    tipoDoc:         consecutivoStr.slice(8, 10),
    consecutivo:     Number(consecutivoStr.slice(10, 20)),
  });

  if (!reutilizaConsecutivo) {
    const { error: upErr } = await sb.from('fe_documentos').update({ numero_consecutivo: consecutivo, clave_mh: clave }).eq('id', docId);
    if (upErr) throw new Error('Error guardando consecutivo: ' + upErr.message);
  }

  // ── Construir y firmar XML ───────────────────────────────────────────────
  // Para NC (03) y ND (02) se arma el bloque InformacionReferencia del XML
  const referencia = ['02', '03'].includes(doc.tipo_documento) ? {
    tipoDoc: doc.ref_tipo_doc || '01',
    numero:  String(doc.ref_numero || '').trim(),
    fecha:   doc.ref_fecha_emision,
    codigo:  doc.ref_codigo || '01',
    razon:   doc.ref_razon  || (doc.tipo_documento === '03' ? 'Nota de Crédito' : 'Nota de Débito'),
  } : undefined;

  const xmlSinFirma = construirXml({ doc, lineas, emisor: { ...cfg }, clave, consecutivo, referencia, fechaEmision: fechaEmisionIso });

  const certRuta    = await resolverRutaCertificado(sb, cfg, empresaId, ambiente);
  const certPassEnc = ambiente === 'produccion' ? cfg.certificado_password_produccion_encriptada : cfg.certificado_password_encriptada;
  const certPinEnc  = ambiente === 'produccion' ? cfg.certificado_pin_produccion_encriptado   : cfg.certificado_pin_encriptado;

  if (!certRuta)              throw new Error('No hay certificado .p12 configurado para este ambiente.');
  if (!fs.existsSync(certRuta)) throw new Error(`Certificado no encontrado en ruta: ${certRuta}`);
  if (!certPassEnc && !certPinEnc) throw new Error('No hay contraseña/PIN del certificado para este ambiente.');

  const p12Buffer   = fs.readFileSync(certRuta);
  const certSecrets = [certPinEnc, certPassEnc].filter(Boolean).map((v) => desencriptarPassword(v));

  let xmlFirmado = '';
  let firmaError = null;
  for (const secret of certSecrets) {
    try { xmlFirmado = await firmarXml(xmlSinFirma, p12Buffer, secret); firmaError = null; break; }
    catch (err) { firmaError = err; }
  }
  if (!xmlFirmado) {
    throw new Error(
      firmaError?.message?.includes('PKCS#12 MAC could not be verified')
        ? 'El PIN del certificado no coincide con el archivo .p12 cargado para este ambiente.'
        : String(firmaError?.message || 'No se pudo firmar el XML.')
    );
  }

  await sb.from('fe_documentos').update({ xml_firmado: xmlFirmado, estado_mh: 'pendiente' }).eq('id', docId);

  // ── Obtener token y enviar a MH ──────────────────────────────────────────
  const usuario = ambiente === 'produccion' ? cfg.stag_usuario_produccion : cfg.stag_usuario;
  const passEnc = ambiente === 'produccion' ? cfg.stag_password_produccion_encriptada : cfg.stag_password_encriptada;
  if (!usuario || !passEnc) throw new Error('Credenciales ATV no configuradas para este ambiente.');

  const token  = await obtenerToken(usuario, desencriptarPassword(passEnc), ambiente);
  const mhResp = await enviarDocumento({
    token, ambiente, clave, fecha: fechaEmisionIso,
    emisor:   { tipo_identificacion: cfg.tipo_identificacion || '02', numero_identificacion: cfg.numero_identificacion },
    receptor: doc.receptor_identificacion ? { tipo_identificacion: doc.receptor_tipo_identificacion || '02', numero_identificacion: doc.receptor_identificacion } : null,
    xmlFirmado,
  });

  const estadoMh = [200, 201, 202].includes(mhResp.status) ? 'enviado' : 'error';
  await sb.from('fe_documentos').update({ estado_mh: estadoMh, respuesta_mh_json: mhResp.data }).eq('id', docId);
  if (estadoMh !== 'error') {
    await asegurarDocumentoCxcDesdeFe(sb, { ...doc, clave_mh: clave, numero_consecutivo: consecutivo }, empresaId, consecutivo);
  }

  return { ok: estadoMh !== 'error', estado_mh: estadoMh, clave, consecutivo, mh_status: mhResp.status, mh_data: mhResp.data };
}

// ── POST /api/facturacion/emitir/:id ─────────────────────────────────────────

export async function emitirDocumento(req, res) {
  const docId     = Number(req.params.id || 0);
  const empresaId = Number(req.body?.empresa_id || 0);
  if (!docId || !empresaId) return res.status(400).json({ ok: false, error: 'Parámetros inválidos.' });

  const ctx = await requirePermission(req, res, empresaId, 'facturacion:editar');
  if (!ctx) return;

  const sb = adminSb();
  try {
    const result = await emitirDocumentoCore(sb, docId, empresaId);
    return res.json(result);
  } catch (err) {
    try { await sb.from('fe_documentos').update({ estado_mh: 'error', respuesta_mh_json: { error: String(err.message) } }).eq('id', docId); } catch { /* ignorar */ }
    return res.status(500).json({ ok: false, error: String(err?.message || 'Error al emitir el documento.') });
  }
}

// ── GET /api/facturacion/estado/:id ──────────────────────────────────────────

export async function backfillFacturasCreditoCxc(req, res) {
  const empresaId = Number(req.body?.empresa_id || 0);
  if (!empresaId) return res.status(400).json({ ok: false, error: 'Parámetros inválidos.' });

  const ctx = await requirePermission(req, res, empresaId, 'facturacion:editar');
  if (!ctx) return;

  const sb = adminSb();
  try {
    const { data: docs, error } = await sb
      .from('fe_documentos')
      .select('id, tipo_documento, condicion_venta, tercero_id, numero_consecutivo, fecha_emision, plazo_credito_dias, total_comprobante, moneda, observacion, clave_mh, estado, estado_mh')
      .eq('empresa_id', empresaId)
      .eq('estado', 'confirmado')
      .in('tipo_documento', ['01', '09'])
      .eq('condicion_venta', '02')
      .not('tercero_id', 'is', null)
      .not('numero_consecutivo', 'is', null)
      .in('estado_mh', ['aceptado', 'enviado', 'procesando']);
    if (error) throw new Error('No se pudieron consultar facturas FE para backfill: ' + error.message);

    const resumen = { evaluados: 0, creados: 0, existentes: 0, omitidos: 0 };
    for (const doc of docs || []) {
      resumen.evaluados += 1;
      const result = await asegurarDocumentoCxcDesdeFe(sb, doc, empresaId, doc.numero_consecutivo);
      if (result?.status === 'created') resumen.creados += 1;
      else if (result?.status === 'existing') resumen.existentes += 1;
      else resumen.omitidos += 1;
    }

    return res.json({ ok: true, ...resumen });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || 'Error ejecutando backfill de CxC.') });
  }
}

export async function consultarEstadoDocumento(req, res) {
  const docId     = Number(req.params.id || 0);
  const empresaId = Number(req.query?.empresa_id || 0);
  if (!docId || !empresaId) return res.status(400).json({ ok: false, error: 'Parámetros inválidos.' });

  const ctx = await requirePermission(req, res, empresaId, 'facturacion:ver');
  if (!ctx) return;

  const sb = adminSb();
  try {
    const doc = await cargarDocumento(sb, docId, empresaId);
    if (!doc.clave_mh) return res.status(400).json({ ok: false, error: 'El documento no tiene clave MH asignada.' });

    const cfg     = await cargarConfigEmisor(sb, empresaId);
    const ambiente = resolverAmbiente(cfg);
    const usuario  = ambiente === 'produccion' ? cfg.stag_usuario_produccion : cfg.stag_usuario;
    const passEnc  = ambiente === 'produccion' ? cfg.stag_password_produccion_encriptada : cfg.stag_password_encriptada;
    if (!usuario || !passEnc) return res.status(400).json({ ok: false, error: 'Credenciales ATV no configuradas.' });

    const mhPassword = desencriptarPassword(passEnc);
    const token = await obtenerToken(usuario, mhPassword, ambiente);
    const mhResp = await consultarEstado({ token, ambiente, clave: doc.clave_mh });

    // Actualizar estado si Hacienda ya resolvió
    let nuevoEstado = doc.estado_mh;
    if (mhResp.status === 200 || mhResp.status === 202) {
      nuevoEstado = resolverEstadoMh(mhResp.data, mhResp.status, doc.estado_mh || 'enviado');
      await sb.from('fe_documentos').update({
        estado_mh:         nuevoEstado,
        respuesta_mh_json: mhResp.data,
      }).eq('id', docId);
    }

    return res.json({
      ok:        true,
      estado_mh: nuevoEstado,
      mh_status: mhResp.status,
      mh_data:   mhResp.data,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || 'Error consultando estado.') });
  }
}

/**
 * Consulta el estado MH de un fe_documento y actualiza la BD.
 * Uso interno (background jobs). Devuelve el nuevo estado_mh.
 */
export async function consultarYActualizarEstadoFeDoc(sb, feDocId, empresaId) {
  const doc = await cargarDocumento(sb, feDocId, empresaId);
  if (!doc.clave_mh) throw new Error('Documento sin clave MH');

  const cfg      = await cargarConfigEmisor(sb, empresaId);
  const ambiente = resolverAmbiente(cfg);
  const usuario  = ambiente === 'produccion' ? cfg.stag_usuario_produccion : cfg.stag_usuario;
  const passEnc  = ambiente === 'produccion' ? cfg.stag_password_produccion_encriptada : cfg.stag_password_encriptada;
  if (!usuario || !passEnc) throw new Error('Credenciales ATV no configuradas');

  const mhPassword = desencriptarPassword(passEnc);
  const token      = await obtenerToken(usuario, mhPassword, ambiente);
  const mhResp     = await consultarEstado({ token, ambiente, clave: doc.clave_mh });

  let nuevoEstado = doc.estado_mh;
  if (mhResp.status === 200 || mhResp.status === 202) {
    nuevoEstado = resolverEstadoMh(mhResp.data, mhResp.status, doc.estado_mh || 'enviado');
    await sb.from('fe_documentos').update({
      estado_mh:         nuevoEstado,
      respuesta_mh_json: mhResp.data,
    }).eq('id', feDocId);
  }
  return nuevoEstado;
}

// ── GET /api/facturacion/xml/:id ─────────────────────────────────────────────

export async function descargarXml(req, res) {
  const docId     = Number(req.params.id || 0);
  const empresaId = Number(req.query?.empresa_id || 0);
  if (!docId || !empresaId) return res.status(400).json({ ok: false, error: 'Parámetros inválidos.' });

  const ctx = await requirePermission(req, res, empresaId, 'facturacion:ver');
  if (!ctx) return;

  const sb = adminSb();
  try {
    const doc = await cargarDocumento(sb, docId, empresaId);
    if (!doc.xml_firmado) return res.status(404).json({ ok: false, error: 'No hay XML firmado para este documento.' });

    const filename = `${doc.numero_consecutivo || doc.id}_${doc.clave_mh || 'sin-clave'}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(doc.xml_firmado);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || 'Error descargando XML.') });
  }
}

const CONDICION_VENTA = { '01':'CONTADO','02':'CRÉDITO','03':'CONSIGNACIÓN','04':'APARTADO','05':'ARRENDAMIENTO CON OPCIÓN','06':'ARRENDAMIENTO FINANCIERO','99':'OTROS' };
const MEDIO_PAGO_LABEL = { '01':'Efectivo','02':'Tarjeta','03':'Cheque','04':'Transferencia / Depósito','05':'Recaudado por terceros','99':'Otros' };
const DOC_TIPO_NOMBRE = { '01':'FACTURA ELECTRÓNICA','02':'NOTA DE DÉBITO ELECTRÓNICA','03':'NOTA DE CRÉDITO ELECTRÓNICA','04':'TIQUETE ELECTRÓNICO','09':'FACTURA ELECTRÓNICA DE EXPORTACIÓN' };

function enteroALetras(n) {
  if (n === 0) return 'CERO';
  if (n < 0) return 'MENOS ' + enteroALetras(-n);
  const u = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
  const d = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const c = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  if (n === 100) return 'CIEN';
  if (n < 20) return u[n];
  if (n < 100) return d[Math.floor(n/10)] + (n%10 ? ' Y '+u[n%10] : '');
  if (n < 1000) return c[Math.floor(n/100)] + (n%100 ? ' '+enteroALetras(n%100) : '');
  if (n === 1000) return 'MIL';
  if (n < 2000) return 'MIL' + (n%1000 ? ' '+enteroALetras(n%1000) : '');
  if (n < 1000000) return enteroALetras(Math.floor(n/1000))+' MIL'+(n%1000 ? ' '+enteroALetras(n%1000) : '');
  if (n === 1000000) return 'UN MILLÓN';
  if (n < 2000000) return 'UN MILLÓN'+(n%1000000 ? ' '+enteroALetras(n%1000000) : '');
  return enteroALetras(Math.floor(n/1000000))+' MILLONES'+(n%1000000 ? ' '+enteroALetras(n%1000000) : '');
}

function montoALetras(monto) {
  const entero = Math.floor(monto);
  const cents = Math.round((monto - entero) * 100);
  return enteroALetras(entero) + ' CON ' + String(cents).padStart(2,'0') + '/100';
}

export function construirHtmlFactura(doc, lineas, cfg) {
  const fmt = (n) => Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nombreComercial = cfg.nombre_comercial || cfg.nombre_emisor || 'ERP MYA';
  const nombreEmisor = cfg.nombre_emisor || cfg.nombre_comercial || 'ERP MYA';
  const esPruebas = String(cfg.ambiente || 'pruebas').toLowerCase() !== 'produccion';
  const moneda  = doc.moneda || 'CRC';
  const simbolo = moneda === 'USD' ? '$' : '₡';
  const monedaLabel = moneda === 'CRC' ? 'Colón Costarricense' : moneda === 'USD' ? 'Dólares Americanos' : moneda;

  const fechaDate = doc.fecha_emision ? new Date(doc.fecha_emision) : new Date();
  const fechaStr = fechaDate.toLocaleDateString('es-CR', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'America/Costa_Rica' });

  const direccion = String(cfg.otras_senas || '').trim();
  const impuesto  = Number(doc.total_impuesto || 0);
  const descuento = Number(doc.total_descuento || 0);
  const subtotal  = Number(doc.subtotal ?? (Number(doc.total_comprobante || 0) - impuesto));
  const iniciales = nombreComercial.split(' ').slice(0,2).map(w => w[0]||'').join('').toUpperCase() || 'MYA';

  const filaRows = lineas.map(l => {
    const dscto = Number(l.descuento_monto || 0);
    const iva   = (l.tarifa_iva_porcentaje != null && l.tarifa_iva_porcentaje > 0) ? `${l.tarifa_iva_porcentaje}%` : '0%';
    return `<tr>
      <td class="tc">${l.codigo_interno || String(l.linea).padStart(2,'0')}</td>
      <td class="tr">${Number(l.cantidad).toLocaleString('es-CR',{minimumFractionDigits:3,maximumFractionDigits:3})}</td>
      <td class="tc">${l.unidad_medida || 'Unid'}</td>
      <td>${l.descripcion || ''}</td>
      <td class="tr">${dscto > 0 ? fmt(dscto) : ''}</td>
      <td class="tr">${fmt(l.precio_unitario)}</td>
      <td class="tr fw">${fmt(l.total_linea)}</td>
      <td class="tc nb">${iva}</td>
    </tr>`;
  }).join('');

  const nVacias = lineas.length < 8 ? 8 - lineas.length : 0;
  const filasVacias = Array(nVacias).fill(
    '<tr><td class="tc ev"></td><td class="tr ev"></td><td class="tc ev"></td><td class="ev"></td><td class="tr ev"></td><td class="tr ev"></td><td class="tr ev"></td><td class="tc ev nb"></td></tr>'
  ).join('');

  const G = '#1a5c38';
  const logoTag = cfg.logo_url
    ? `<img src="${cfg.logo_url}" style="width:62px;height:62px;object-fit:contain;border-radius:50%" onerror="this.style.display='none'">`
    : `<div style="width:62px;height:62px;border-radius:50%;border:3px solid ${G};display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:${G}">${iniciales}</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>${doc.numero_consecutivo || doc.id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a1a;background:#fff}
  body{padding:14px 16px;position:relative}
  .wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9999;overflow:hidden}
  .wm span{transform:rotate(-32deg);font-size:64px;font-weight:900;letter-spacing:.18em;color:rgba(185,28,28,.12);white-space:nowrap}
  /* cabecera */
  table.hdr{width:100%;border-collapse:collapse;border:1px solid #aaa}
  table.hdr td{padding:8px 12px;border-right:1px solid #aaa;vertical-align:middle}
  table.hdr td:last-child{border-right:0}
  .emi-name{font-weight:900;font-size:13px;margin-bottom:2px}
  .emi-legal{font-weight:700;font-size:11px;margin-bottom:4px;color:#374151}
  .emi-data{font-size:10px;color:#333;line-height:1.7}
  .doc-tipo{color:${G};font-weight:900;font-size:14px;text-align:right;line-height:1.15}
  .doc-num{font-weight:700;font-size:12px;text-align:right;margin-top:4px}
  .doc-fecha{font-size:10px;color:#555;text-align:right;margin-top:3px}
  /* clave */
  .clave{border:1px solid #aaa;border-top:0;background:#f8f8f8;padding:4px 10px;font-size:9px;color:#555;word-break:break-all;line-height:1.5}
  /* cliente */
  table.cli{width:100%;border-collapse:collapse;border:1px solid #aaa;border-top:0}
  table.cli th.sec{background:${G};color:#fff;padding:5px 10px;text-align:center;font-weight:700;font-size:11px}
  table.cli td.lbl{padding:3px 8px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;color:#555;font-style:italic;white-space:nowrap;font-size:10.5px;width:80px}
  table.cli td.val{padding:3px 8px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;font-size:11px}
  table.cli td.val.bold{font-weight:700;font-size:12px}
  table.cli tr:last-child td{border-bottom:0}
  /* artículos */
  table.lineas{width:100%;border-collapse:collapse;border:1px solid #aaa;border-top:0}
  table.lineas thead td{background:${G};color:#fff;padding:5px 7px;font-weight:700;font-size:10px;border-right:1px solid ${G};white-space:nowrap}
  table.lineas thead td:last-child{border-right:0}
  table.lineas tbody td{padding:4px 7px;border-right:1px solid #d1d5db;font-size:11px;vertical-align:middle}
  table.lineas tbody td.nb{border-right:0}
  table.lineas tbody tr:nth-child(even) td{background:#f5f5f5}
  table.lineas tbody td.ev{height:20px}
  .tc{text-align:center}.tr{text-align:right}.fw{font-weight:700}
  /* totales */
  table.bot{width:100%;border-collapse:collapse;border:1px solid #aaa;border-top:0}
  table.bot td.obs{padding:8px 10px;border-right:1px solid #aaa;vertical-align:top;font-size:10px;color:#555;width:55%}
  table.tots{width:100%;border-collapse:collapse}
  table.tots td{padding:4px 10px;font-size:11px;border-bottom:1px solid #e5e7eb}
  table.tots td.tl{font-weight:700;text-align:right;border-right:1px solid #e5e7eb}
  table.tots td.tv{text-align:right;font-family:monospace}
  table.tots tr.grand td{background:${G};color:#fff;font-weight:900;font-size:12px;border-bottom:0}
  /* son */
  .son{border:1px solid #aaa;border-top:0;padding:5px 10px;font-size:10px;line-height:1.5}
  /* pie */
  .footer{margin-top:14px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
  .firma{text-align:center;min-width:200px;border-top:1px solid #555;padding-top:4px;font-size:10px;color:#555}
  .auth{text-align:center;font-size:9px;color:#777;line-height:1.6}
</style>
</head>
<body>
${esPruebas ? '<div class="wm"><span>PRUEBAS</span></div>' : ''}
<!-- CABECERA -->
<table class="hdr">
<tr>
  <td style="width:74px;text-align:center;border-right:1px solid #aaa">${logoTag}</td>
  <td>
    <div class="emi-name">${nombreComercial}</div>
    <div class="emi-legal">${nombreEmisor}</div>
    <div class="emi-data">${cfg.numero_identificacion ? 'Cédula '+cfg.numero_identificacion+'<br>' : ''}${direccion ? direccion+'<br>' : ''}${cfg.telefono_emisor ? 'Teléfono: '+cfg.telefono_emisor+'<br>' : ''}${cfg.correo_envio ? 'Email: '+cfg.correo_envio : ''}</div>
  </td>
  <td style="width:260px">
    <div class="doc-tipo">${DOC_TIPO_NOMBRE[doc.tipo_documento] || 'COMPROBANTE ELECTRÓNICO'}</div>
    <div class="doc-num">No. ${doc.numero_consecutivo || String(doc.id).padStart(20,'0')}</div>
    <div class="doc-fecha">Fecha: ${fechaStr}</div>
  </td>
</tr>
</table>
<!-- CLAVE -->
<div class="clave">Clave: <span style="font-family:monospace;color:#222">${doc.clave_mh || 'Pendiente de asignar'}</span></div>
<!-- DATOS DEL CLIENTE -->
<table class="cli">
<thead><tr><th class="sec" colspan="4">Datos del Cliente</th></tr></thead>
<tbody>
  <tr>
    <td class="lbl">Cliente:</td><td class="val bold">${doc.receptor_nombre || 'Consumidor Final'}</td>
    <td class="lbl">Condición:</td><td class="val">${CONDICION_VENTA[doc.condicion_venta||'']||doc.condicion_venta||'CONTADO'}</td>
  </tr>
  <tr>
    <td class="lbl">Cédula:</td><td class="val">${doc.receptor_identificacion||''}</td>
    <td class="lbl">Plazo:</td><td class="val">${doc.plazo_credito_dias ? doc.plazo_credito_dias+' días' : '—'}</td>
  </tr>
  <tr>
    <td class="lbl">Dirección:</td><td class="val">${doc.receptor_direccion||''}</td>
    <td class="lbl">Moneda:</td><td class="val">${monedaLabel}</td>
  </tr>
  <tr>
    <td class="lbl">Email:</td><td class="val">${doc.receptor_email||''}</td>
    <td class="lbl">Forma de pago:</td><td class="val">${MEDIO_PAGO_LABEL[doc.medio_pago||'']||doc.medio_pago||'Efectivo'}</td>
  </tr>
  <tr>
    <td class="lbl">Teléfono:</td><td class="val">${doc.receptor_telefono||''}</td>
    <td class="lbl"></td><td class="val"></td>
  </tr>
</tbody>
</table>
<!-- ARTÍCULOS -->
<table class="lineas">
<thead><tr>
  <td class="tc" style="width:50px">Código</td>
  <td class="tr" style="width:72px">Cantidad</td>
  <td class="tc" style="width:40px">Emp</td>
  <td>Nombre del Artículo</td>
  <td class="tr" style="width:80px">Descto</td>
  <td class="tr" style="width:90px">Precio</td>
  <td class="tr" style="width:95px">Total</td>
  <td class="tc nb" style="width:45px">IVA</td>
</tr></thead>
<tbody>${filaRows}${filasVacias}</tbody>
</table>
<!-- TOTALES -->
<table class="bot">
<tr>
  <td class="obs">${doc.observacion||''}</td>
  <td style="padding:0;vertical-align:bottom">
    <table class="tots">
      <tr><td class="tl">Subtotal</td><td class="tv">${fmt(subtotal)}</td></tr>
      <tr><td class="tl">Descuento</td><td class="tv">${descuento>0?fmt(descuento):''}</td></tr>
      <tr><td class="tl">I.V.A.</td><td class="tv">${impuesto>0?fmt(impuesto):''}</td></tr>
      <tr class="grand"><td class="tl">Total a Pagar</td><td class="tv">${simbolo}${fmt(doc.total_comprobante)}</td></tr>
    </table>
  </td>
</tr>
</table>
<!-- SON -->
<div class="son"><strong>Son:</strong> ${montoALetras(Number(doc.total_comprobante||0))}</div>
<!-- PIE -->
<div class="footer">
  <div class="firma">Recibido conforme: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Cédula:</div>
  <div class="auth">Autorización No. DGT-R-033-2019 del 20/06/2019 — DGTD v.4.4<br>${cfg.telefono_emisor ? emisorNombre+' · Tel. (506) '+cfg.telefono_emisor : emisorNombre}</div>
</div>
</body></html>`;
}

export async function reenviarCorreoDocumento(req, res) {
  const docId      = Number(req.params.id || 0);
  const empresaId  = Number(req.body?.empresa_id || 0);
  const toOverride   = String(req.body?.to_override || '').trim();
  const cc           = String(req.body?.cc || '').trim();
  const htmlFactura  = req.body?.html_factura || null;
  if (!docId || !empresaId) return res.status(400).json({ ok: false, error: 'Parámetros inválidos.' });

  const ctx = await requirePermission(req, res, empresaId, 'facturacion:editar');
  if (!ctx) return;

  const sb = adminSb();
  try {
    const doc = await cargarDocumento(sb, docId, empresaId);
    const cfg = await cargarConfigEmisor(sb, empresaId);

    const toFinal = toOverride || doc.receptor_email;
    if (!toFinal) {
      return res.status(400).json({ ok: false, error: 'El documento no tiene correo del receptor para reenviar.' });
    }
    if (!doc.xml_firmado) {
      return res.status(400).json({ ok: false, error: 'El documento no tiene XML firmado para reenviar.' });
    }

    const DOC_NOMBRES = { '01': 'Factura Electrónica', '02': 'Nota de Débito Electrónica', '03': 'Nota de Crédito Electrónica', '04': 'Tiquete Electrónico', '09': 'Factura Electrónica de Exportación' };
    const subject = `${DOC_NOMBRES[doc.tipo_documento] || 'Comprobante Electrónico'} ${doc.numero_consecutivo || doc.id}`;

    const baseName = doc.numero_consecutivo || String(doc.id);
    const lineas   = await cargarLineas(sb, docId);

    // Cuerpo del correo: si viene HTML del frontend úsarlo, si no generar desde datos
    const html = htmlFactura
      ? `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
          <style>
            body { margin:0; padding:16px; background:#f1f5f9; font-family:Arial,sans-serif; }
            .fee-wrap { background:#fff; padding:16px; max-width:800px; margin:0 auto; }
          </style>
         </head><body>
           <div class="fee-wrap">${htmlFactura}</div>
           <p style="font-family:Arial;font-size:10px;color:#94a3b8;text-align:center;margin-top:12px;">
             XML firmado adjunto · Generado por Sistema MYA
           </p>
         </body></html>`
      : construirHtmlFactura(doc, lineas, cfg);

    // ── Adjunto 1: XML Firmado ──────────────────────────────────────────────
    const attachments = [
      {
        filename: `${baseName}_firmado.xml`,
        content: Buffer.from(String(doc.xml_firmado), 'utf8').toString('base64'),
        contentType: 'application/xml',
      },
    ];

    // ── Adjunto 2: XML-MH (respuesta de Hacienda) ──────────────────────────
    const xmlMhB64 = doc.respuesta_mh_json?.['respuesta-xml']
                  || doc.respuesta_mh_json?.xml
                  || doc.respuesta_mh_json?.comprobanteXml
                  || null;
    if (xmlMhB64) {
      try {
        const xmlMhBuffer = Buffer.from(xmlMhB64, 'base64');
        attachments.push({
          filename: `${baseName}_respuesta_mh.xml`,
          content: xmlMhBuffer.toString('base64'),
          contentType: 'application/xml',
        });
      } catch { /* si no se puede decodificar, omitir */ }
    }

    // ── Adjunto 3: PDF generado en el servidor ─────────────────────────────
    try {
      const pdfBuffer = await htmlToPdf(html);
      attachments.push({
        filename: `${baseName}.pdf`,
        content: pdfBuffer.toString('base64'),
        contentType: 'application/pdf',
      });
    } catch (pdfErr) {
      console.error('[PDF] Error generando PDF:', pdfErr.message);
      // No bloquear el envío si falla el PDF
    }

    const mailOpts = { to: toFinal, subject, html, attachments };
    if (cc) mailOpts.cc = cc;

    const result = await sendMail(mailOpts);
    return res.json({
      ok: true,
      accepted: result.accepted,
      messageId: result.messageId,
      to: toFinal,
      cc: cc || null,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || 'No se pudo reenviar el correo.') });
  }
}

// ── POST /api/facturacion/re-emitir/:id ──────────────────────────────────────
// Crea un documento nuevo en borrador copiando el contenido del rechazado.
// El documento original queda intacto (normativa CR: documento rechazado no
// requiere anulación — simplemente se emite uno nuevo corregido).

// ── Core de re-emisión subsanada (reutilizable desde cron y ruta HTTP) ─────────

export async function reEmitirSubsanadoCore(sb, docOrigenId, empresaId) {
  const origen = await cargarDocumento(sb, docOrigenId, empresaId);
  if (String(origen.estado_mh || '').toLowerCase() !== 'rechazado') {
    throw new Error('Solo se puede re-emitir un documento rechazado por Hacienda.');
  }

  // Bloquear solo si existe una re-emisión que ya fue aceptada o está en vuelo (enviado/procesando).
  // Si la re-emisión anterior fue rechazada o tuvo error, se permite volver a intentar.
  const { data: existente } = await sb
    .from('fe_documentos')
    .select('id, numero_consecutivo, estado_mh')
    .eq('empresa_id', empresaId)
    .eq('doc_origen_id', docOrigenId)
    .in('estado_mh', ['aceptado', 'enviado', 'procesando'])
    .maybeSingle();
  if (existente) {
    const estadoLabel = existente.estado_mh === 'aceptado' ? 'aceptada por MH'
      : existente.estado_mh === 'enviado' ? 'enviada a MH (pendiente respuesta)'
      : 'procesando en MH';
    throw new Error(`Ya existe una re-emisión de este documento (ID ${existente.id}) ${estadoLabel}. No se puede crear otra.`);
  }

  const lineasOrigen = await cargarLineas(sb, docOrigenId);
  if (!lineasOrigen.length) throw new Error('El documento rechazado no tiene líneas registradas.');

  const hoy = new Date().toISOString().slice(0, 10);
  const nuevoDoc = {
    empresa_id:                   empresaId,
    tipo_documento:               origen.tipo_documento,
    origen:                       origen.origen || 'manual',
    estado:                       'confirmado',
    estado_mh:                    null,
    auto_emitir:                  origen.auto_emitir ?? false,
    sale_id_fusion:               origen.sale_id_fusion || null,
    fecha_emision:                hoy,
    moneda:                       origen.moneda || 'CRC',
    condicion_venta:              origen.condicion_venta || '01',
    plazo_credito_dias:           origen.plazo_credito_dias ?? 0,
    medio_pago:                   origen.medio_pago || '01',
    liquidacion_pago_json:        origen.liquidacion_pago_json || null,
    tercero_id:                   origen.tercero_id || null,
    receptor_bitacora_id:         origen.receptor_bitacora_id || null,
    receptor_nombre:              origen.receptor_nombre || null,
    receptor_tipo_identificacion: origen.receptor_tipo_identificacion || null,
    receptor_identificacion:      origen.receptor_identificacion || null,
    receptor_email:               origen.receptor_email || null,
    receptor_telefono:            origen.receptor_telefono || null,
    receptor_direccion:           origen.receptor_direccion || null,
    receptor_actividad_codigo:    origen.receptor_actividad_codigo || null,
    receptor_actividad_descripcion: origen.receptor_actividad_descripcion || null,
    total_comprobante:            origen.total_comprobante ?? 0,
    doc_origen_id:                docOrigenId,
    observacion:                  origen.observacion || null,
    // Campos de referencia (requeridos para NC/ND)
    ref_numero:                   origen.ref_numero || null,
    ref_fecha_emision:            origen.ref_fecha_emision || null,
    ref_codigo:                   origen.ref_codigo || null,
    ref_razon:                    origen.ref_razon || null,
    ref_tipo_doc:                 origen.ref_tipo_doc || null,
  };

  const { data: nuevoDocRow, error: insertDocErr } = await sb.from('fe_documentos').insert(nuevoDoc).select('id').single();
  if (insertDocErr) throw new Error('Error creando documento: ' + insertDocErr.message);
  const nuevoDocId = nuevoDocRow.id;

  const nuevasLineas = lineasOrigen.map((l) => ({
    documento_id:             nuevoDocId,
    linea:                    l.linea,
    tipo_linea:               l.tipo_linea,
    producto_id:              l.producto_id || null,
    codigo_interno:           l.codigo_interno || null,
    cabys:                    l.cabys || null,
    descripcion:              l.descripcion || '',
    unidad_medida:            l.unidad_medida || 'Unid',
    cantidad:                 l.cantidad,
    precio_unitario:          l.precio_unitario,
    descuento_monto:          l.descuento_monto || 0,
    descuento_naturaleza:     l.descuento_naturaleza || null,
    tarifa_iva_codigo:        l.tarifa_iva_codigo || null,
    tarifa_iva_porcentaje:    l.tarifa_iva_porcentaje ?? 0,
    subtotal:                 l.subtotal ?? 0,
    impuesto_monto:           l.impuesto_monto ?? 0,
    total_linea:              l.total_linea ?? 0,
    exoneracion_id:           l.exoneracion_id || null,
    exoneracion_porcentaje:   l.exoneracion_porcentaje ?? 0,
    exoneracion_monto:        l.exoneracion_monto ?? 0,
    exoneracion_autorizacion: l.exoneracion_autorizacion || null,
    partida_arancelaria:      l.partida_arancelaria || null,
  }));

  const { error: insertLineasErr } = await sb.from('fe_documento_lineas').insert(nuevasLineas);
  if (insertLineasErr) throw new Error('Error copiando líneas: ' + insertLineasErr.message);

  return nuevoDocId;
}

// ── POST /api/facturacion/importar-fee ───────────────────────────────────────
// Crea un documento FEE (tipo 09) desde datos de despacho de Empacadora
// o desde un formulario manual en ERP-MYA.

export async function importarFee(req, res) {
  const empresaId = Number(req.body?.empresa_id || 0);
  if (!empresaId) return res.status(400).json({ ok: false, error: 'empresa_id requerido.' });

  const ctx = await requirePermission(req, res, empresaId, 'facturacion:editar');
  if (!ctx) return;

  const {
    // Receptor
    receptor_nombre, receptor_identificacion, receptor_email, receptor_telefono,
    receptor_direccion, tercero_id,
    // Exportación
    incoterms, shipper, codigo_exportador, ggn_global_gap, ep_mag,
    // Datos de despacho (si viene de Empacadora)
    despacho_id, semana_codigo, cliente_id,
    // Factura
    condicion_venta = '01', plazo_credito_dias = 0, medio_pago = '01',
    moneda = 'USD', observacion,
    // Líneas: [{ cantidad, precio_unitario, descripcion, cabys, codigo_interno, unidad_medida }]
    lineas = [],
    // Terminal (override de sucursal/punto_venta)
    sucursal, punto_venta,
  } = req.body;

  if (!receptor_nombre) return res.status(400).json({ ok: false, error: 'receptor_nombre requerido.' });
  if (!lineas.length) return res.status(400).json({ ok: false, error: 'Debe incluir al menos una línea.' });

  const sb = adminSb();

  try {
    // Validar CABYS en líneas
    const lineasSinCabys = lineas.filter(l => !/^\d{13}$/.test(String(l.cabys || '').trim()));
    if (lineasSinCabys.length) {
      return res.status(400).json({ ok: false, error: `Falta Codigo CABYS en ${lineasSinCabys.length} linea(s).` });
    }

    // Calcular totales
    const totalComprobante = lineas.reduce((sum, l) => sum + Number(l.total_linea || (Number(l.cantidad) * Number(l.precio_unitario))), 0);

    // Crear documento
    const docPayload = {
      empresa_id:            empresaId,
      tipo_documento:        '09',
      origen:                'manual',
      estado:                'confirmado',
      estado_mh:             null,
      fecha_emision:         new Date().toISOString().slice(0, 10),
      moneda,
      condicion_venta:       condicion_venta,
      plazo_credito_dias:    Number(plazo_credito_dias) || 0,
      medio_pago:            medio_pago,
      tercero_id:            tercero_id ? Number(tercero_id) : null,
      receptor_nombre:       receptor_nombre,
      receptor_identificacion: receptor_identificacion || null,
      receptor_email:        receptor_email || null,
      receptor_telefono:     receptor_telefono || null,
      receptor_direccion:    receptor_direccion || null,
      total_comprobante:     totalComprobante,
      observacion:           observacion || null,
      // Campos de despacho para el viewer
      incoterms:             incoterms || null,
      shipper:               shipper || null,
      codigo_exportador:     codigo_exportador || null,
      ggn_global_gap:        ggn_global_gap || null,
      ep_mag:                ep_mag || null,
    };

    // Si viene de Empacadora, guardar referencia
    if (despacho_id) {
      docPayload.sale_id_fusion = despacho_id;
    }

    // Terminal override
    if (sucursal) docPayload.sucursal = String(sucursal).padStart(3, '0');
    if (punto_venta) docPayload.punto_venta = String(punto_venta).padStart(5, '0');

    const { data: nuevoDoc, error: insDocErr } = await sb
      .from('fe_documentos')
      .insert(docPayload)
      .select('id')
      .single();
    if (insDocErr) throw new Error('Error creando documento FEE: ' + insDocErr.message);

    const nuevoDocId = nuevoDoc.id;

    // Crear líneas
    const lineasPayload = lineas.map((l, i) => ({
      documento_id:           nuevoDocId,
      linea:                  i + 1,
      tipo_linea:             'producto',
      cabys:                  l.cabys || null,
      codigo_interno:         l.codigo_interno || null,
      descripcion:            l.descripcion || '',
      unidad_medida:          l.unidad_medida || 'Unid',
      cantidad:               Number(l.cantidad) || 1,
      precio_unitario:        Number(l.precio_unitario) || 0,
      descuento_monto:        Number(l.descuento_monto) || 0,
      tarifa_iva_codigo:      l.tarifa_iva_codigo || '10',
      tarifa_iva_porcentaje:  l.tarifa_iva_porcentaje ?? 0,
      subtotal:               l.subtotal ?? 0,
      impuesto_monto:         l.impuesto_monto ?? 0,
      total_linea:            l.total_linea ?? (Number(l.cantidad || 1) * Number(l.precio_unitario || 0)),
      partida_arancelaria:    l.partida_arancelaria || null,
    }));

    const { error: insLineasErr } = await sb.from('fe_documento_lineas').insert(lineasPayload);
    if (insLineasErr) throw new Error('Error creando líneas FEE: ' + insLineasErr.message);

    return res.json({ ok: true, doc_id: nuevoDocId, total: totalComprobante, message: 'FEE creada correctamente.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || 'Error al crear FEE.') });
  }
}

export async function reEmitirSubsanado(req, res) {
  const docOrigenId = Number(req.params.id || 0);
  const empresaId   = Number(req.body?.empresa_id || 0);
  if (!docOrigenId || !empresaId) return res.status(400).json({ ok: false, error: 'Parámetros inválidos.' });

  const ctx = await requirePermission(req, res, empresaId, 'facturacion:editar');
  if (!ctx) return;

  const sb = adminSb();
  try {
    const nuevoDocId = await reEmitirSubsanadoCore(sb, docOrigenId, empresaId);
    return res.json({ ok: true, doc_id: nuevoDocId, mensaje: `Re-emisión creada (ID ${nuevoDocId}).` });
  } catch (err) {
    const status = err.message.includes('Ya existe') ? 409 : 500;
    return res.status(status).json({ ok: false, error: String(err?.message || 'Error al crear la re-emisión.') });
  }
}
