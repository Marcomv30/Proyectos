/**
 * feConsultaCron.js — Consulta periódica de estado MH para documentos pendientes
 *
 * Cada FE_CRON_INTERVAL_MS (default 5 min):
 *   1. Busca todos los docs con estado_mh IN ('enviado','procesando') con clave_mh
 *   2. Por cada empresa, consulta el estado actual en Hacienda
 *   3. Si cambia a 'aceptado' y tiene receptor_email y no es TE → envía correo
 *
 * Iniciar con startFeConsultaCron() desde index.js
 */

import { adminSb } from '../lib/authz.js';
import { desencriptarPassword } from './correoImap.js';
import { obtenerToken, consultarEstado } from './feMh.js';
import { sendMail } from './mailer.js';
import { htmlToPdf } from './pdfGenerator.js';
import { emitirDocumentoCore, reEmitirSubsanadoCore, construirHtmlFactura, cargarLineas } from '../routes/facturacionEmitir.js';

const INTERVAL_MS        = Number(process.env.FE_CRON_INTERVAL_MS  || 5 * 60 * 1000); // 5 min
const DELAY_ENTRE_DOCS   = Number(process.env.FE_CRON_DELAY_DOC_MS || 400);            // pausa entre llamadas MH
const INITIAL_DELAY_MS   = 30_000; // esperar 30s al arrancar antes del primer ciclo

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolverEstadoMh(data, httpStatus, fallback = 'enviado') {
  const bruto = String(
    data?.ind_estado        ??
    data?.['ind-estado']    ??
    data?.indEstado         ??
    data?.estado            ??
    data?.status            ??
    data?.respuesta?.ind_estado     ??
    data?.respuesta?.['ind-estado'] ??
    data?.respuesta?.indEstado      ??
    ''
  ).toLowerCase().trim();
  if (bruto.includes('acept'))  return 'aceptado';
  if (bruto.includes('rechaz')) return 'rechazado';
  if (bruto.includes('proces') || bruto.includes('pend')) return 'procesando';
  if (httpStatus === 202) return 'procesando';
  if (httpStatus === 200 || httpStatus === 201) return fallback;
  return fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Envío de correo al aceptar ────────────────────────────────────────────────

async function enviarCorreoAceptacion(sb, doc, cfg) {
  const tipoLabel =
    doc.tipo_documento === '09' ? 'Factura Electrónica de Exportación' :
    doc.tipo_documento === '03' ? 'Nota de Crédito' :
    doc.tipo_documento === '02' ? 'Nota de Débito' :
    'Factura Electrónica';

  const subject = `${tipoLabel} ${doc.numero_consecutivo || doc.id}`;

  // Cargar líneas y generar HTML/PDF de la factura
  const lineas = await cargarLineas(sb, doc.id);
  const html   = construirHtmlFactura(doc, lineas, cfg);

  const baseName    = doc.numero_consecutivo || String(doc.id);
  const attachments = [
    {
      filename:    `${baseName}_firmado.xml`,
      content:     Buffer.from(String(doc.xml_firmado), 'utf8').toString('base64'),
      contentType: 'application/xml',
    },
  ];

  // XML de respuesta MH (confirmación de Hacienda) si existe
  const xmlMhB64 = doc.respuesta_mh_json?.['respuesta-xml'] || doc.respuesta_mh_json?.xml || null;
  if (xmlMhB64) {
    try {
      attachments.push({
        filename:    `${baseName}_respuesta_mh.xml`,
        content:     Buffer.from(xmlMhB64, 'base64').toString('base64'),
        contentType: 'application/xml',
      });
    } catch { /* omitir si el base64 es inválido */ }
  }

  // PDF generado en servidor
  try {
    const pdfBuffer = await htmlToPdf(html);
    attachments.push({
      filename:    `${baseName}.pdf`,
      content:     pdfBuffer.toString('base64'),
      contentType: 'application/pdf',
    });
  } catch (e) {
    console.warn(`[FE Cron] No se pudo generar PDF para doc ${doc.id}:`, e.message);
  }

  await sendMail({ to: doc.receptor_email, subject, html, attachments });
  console.log(`[FE Cron] Correo de aceptación enviado a ${doc.receptor_email} (doc ${doc.id})`);
}

// ── Procesar una empresa ──────────────────────────────────────────────────────

async function consultarEmpresa(sb, empresaId) {
  // Config FE de la empresa
  const { data: cfg, error: cfgErr } = await sb
    .from('fe_config_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .single();
  if (cfgErr || !cfg) {
    console.warn(`[FE Cron] Empresa ${empresaId}: sin config FE, omitiendo.`);
    return;
  }

  const ambiente = (cfg.ambiente || 'pruebas') === 'produccion' ? 'produccion' : 'pruebas';
  const usuario  = ambiente === 'produccion' ? cfg.stag_usuario_produccion   : cfg.stag_usuario;
  const passEnc  = ambiente === 'produccion' ? cfg.stag_password_produccion_encriptada : cfg.stag_password_encriptada;
  if (!usuario || !passEnc) {
    console.warn(`[FE Cron] Empresa ${empresaId}: credenciales ATV no configuradas.`);
    return;
  }

  // Documentos pendientes de la empresa
  const { data: docs } = await sb
    .from('fe_documentos')
    .select([
      'id, tipo_documento, numero_consecutivo, clave_mh, estado_mh',
      'receptor_email, receptor_nombre, receptor_identificacion, receptor_direccion, receptor_telefono',
      'condicion_venta, plazo_credito_dias, medio_pago, moneda, fecha_emision',
      'subtotal, total_impuesto, total_descuento, total_comprobante',
      'observacion, xml_firmado, respuesta_mh_json',
    ].join(', '))
    .eq('empresa_id', empresaId)
    .in('estado_mh', ['enviado', 'procesando'])
    .not('clave_mh', 'is', null)
    .order('id', { ascending: true });

  if (!docs?.length) return;

  // Token MH — una sola vez por empresa por ciclo
  let token;
  try {
    const mhPassword = desencriptarPassword(passEnc);
    token = await obtenerToken(usuario, mhPassword, ambiente);
  } catch (err) {
    console.error(`[FE Cron] Empresa ${empresaId}: error obteniendo token MH:`, err.message);
    return;
  }

  let actualizados = 0, aceptados = 0, rechazados = 0, errores = 0;

  for (const doc of docs) {
    try {
      await sleep(DELAY_ENTRE_DOCS);

      const mhResp = await consultarEstado({ token, ambiente, clave: doc.clave_mh });
      if (mhResp.status !== 200 && mhResp.status !== 202) continue;

      const nuevoEstado = resolverEstadoMh(mhResp.data, mhResp.status, doc.estado_mh || 'enviado');
      if (nuevoEstado === doc.estado_mh) continue; // sin cambio, no actualizar

      await sb.from('fe_documentos').update({
        estado_mh:         nuevoEstado,
        respuesta_mh_json: mhResp.data,
      }).eq('id', doc.id);

      actualizados++;

      if (nuevoEstado === 'aceptado') {
        aceptados++;
        // No enviar correo a TE (tipo '04'), solo si tiene email y XML
        if (doc.tipo_documento !== '04' && doc.receptor_email && doc.xml_firmado) {
          await enviarCorreoAceptacion(sb, doc, cfg).catch((e) =>
            console.error(`[FE Cron] Error enviando correo doc ${doc.id}:`, e.message)
          );
        }
      } else if (nuevoEstado === 'rechazado') {
        rechazados++;
      }
    } catch (err) {
      errores++;
      console.error(`[FE Cron] Error procesando doc ${doc.id}:`, err.message);
    }
  }

  if (actualizados > 0 || errores > 0) {
    console.log(
      `[FE Cron] Empresa ${empresaId}: ${docs.length} pendientes → ` +
      `${actualizados} actualizados (${aceptados} aceptados, ${rechazados} rechazados, ${errores} errores)`
    );
  }
}

// ── Clasificar razón de rechazo MH ───────────────────────────────────────────
// Retorna: 'auto' (se puede reintentar automáticamente) | 'manual' (requiere intervención humana)

function clasificarRechazo(respuestaMhJson) {
  const raw = JSON.stringify(respuestaMhJson || '').toLowerCase();

  // Errores que NO son auto-resolvibles — requieren corrección manual
  const manual = [
    'identificaci',      // identificación de receptor inválida
    'cedula',            // cédula inválida
    'exonerac',          // problemas de exoneración (número de autorización, etc.)
    'actividad',         // actividad económica inválida
    'no autorizado',
    'credencial',
  ];
  if (manual.some((kw) => raw.includes(kw))) return 'manual';

  // Todo lo demás (schema errors, CABYS, totales) se reintenta automáticamente
  return 'auto';
}

// ── Auto-resolución de CABYS desde grados_combustible ────────────────────────

async function resolverCabysLineas(sb, docId, empresaId) {
  const [{ data: lineas }, { data: grados }] = await Promise.all([
    sb.from('fe_documento_lineas').select('id, linea, descripcion, cabys').eq('documento_id', docId).order('linea'),
    sb.from('grados_combustible').select('nombre, codigo_cabys').eq('empresa_id', empresaId).not('codigo_cabys', 'is', null),
  ]);

  const sinCabys = (lineas || []).filter((l) => !/^\d{13}$/.test(String(l.cabys || '').trim()));
  if (!sinCabys.length) return;

  for (const linea of sinCabys) {
    const desc  = String(linea.descripcion || '').toLowerCase();
    const grado = (grados || []).find((g) => g.codigo_cabys && desc.includes(String(g.nombre || '').toLowerCase()));
    if (grado?.codigo_cabys) {
      await sb.from('fe_documento_lineas').update({ cabys: grado.codigo_cabys }).eq('id', linea.id);
      console.log(`[FE Cron] CABYS resuelto doc ${docId} línea ${linea.linea}: ${grado.codigo_cabys}`);
    } else {
      console.warn(`[FE Cron] No se pudo resolver CABYS doc ${docId} línea ${linea.linea}: "${linea.descripcion}"`);
    }
  }
}

// ── Fase 0: Re-emitir automáticamente docs rechazados auto_emitir ─────────────
// Solo reintenta docs originales (sin doc_origen_id) para evitar loops infinitos.

async function reEmitirRechazados(sb) {
  const { data: rows } = await sb
    .from('fe_documentos')
    .select('id, empresa_id, respuesta_mh_json')
    .eq('estado_mh', 'rechazado')
    .eq('auto_emitir', true)
    .is('doc_origen_id', null)   // solo docs originales, no re-emisiones
    .order('id', { ascending: true });

  if (!rows?.length) return;

  let reEmitidos = 0, omitidos = 0, errores = 0;

  for (const row of rows) {
    try {
      // Verificar si ya tiene re-emisión pendiente o activa
      const { data: existente } = await sb
        .from('fe_documentos')
        .select('id')
        .eq('doc_origen_id', row.id)
        .neq('estado_mh', 'rechazado')
        .maybeSingle();
      if (existente) continue; // ya tiene re-emisión en curso

      const tipo = clasificarRechazo(row.respuesta_mh_json);
      if (tipo === 'manual') {
        omitidos++;
        console.warn(`[FE Cron] Doc ${row.id}: rechazo requiere intervención manual.`);
        // Desactivar auto_emitir para no repetir el aviso cada ciclo
        await sb.from('fe_documentos').update({ auto_emitir: false }).eq('id', row.id);
        continue;
      }

      await sleep(DELAY_ENTRE_DOCS);

      // Crear doc subsanado (copia del rechazado con nuevo consecutivo/clave)
      const nuevoId = await reEmitirSubsanadoCore(sb, row.id, row.empresa_id);

      // Resolver CABYS en las líneas copiadas
      await resolverCabysLineas(sb, nuevoId, row.empresa_id);

      // Emitir al MH
      const result = await emitirDocumentoCore(sb, nuevoId, row.empresa_id);
      reEmitidos++;
      console.log(`[FE Cron] Re-emitido doc ${row.id} → nuevo doc ${nuevoId} → ${result.estado_mh}`);
    } catch (err) {
      errores++;
      console.error(`[FE Cron] Error re-emitiendo doc rechazado ${row.id}:`, err.message);
    }
  }

  if (reEmitidos > 0 || omitidos > 0 || errores > 0) {
    console.log(`[FE Cron] Re-emisión rechazados: ${reEmitidos} re-emitidos, ${omitidos} manuales, ${errores} errores`);
  }
}

// ── Fase 1: Emitir docs con auto_emitir = true pendientes de envío ────────────

async function emitirPendientes(sb) {
  const { data: rows } = await sb
    .from('fe_documentos')
    .select('id, empresa_id')
    .eq('estado', 'confirmado')
    .eq('auto_emitir', true)
    .is('clave_mh', null)
    .order('id', { ascending: true });

  if (!rows?.length) return;

  let emitidos = 0, errores = 0;
  for (const row of rows) {
    try {
      await sleep(DELAY_ENTRE_DOCS);

      // Auto-resolver CABYS desde grados_combustible antes de emitir
      await resolverCabysLineas(sb, row.id, row.empresa_id);

      const result = await emitirDocumentoCore(sb, row.id, row.empresa_id);
      if (result.ok) {
        emitidos++;
        console.log(`[FE Cron] Auto-emitido doc ${row.id} empresa ${row.empresa_id} → ${result.estado_mh}`);
      } else {
        errores++;
        console.warn(`[FE Cron] Auto-emit doc ${row.id}: estado_mh=${result.estado_mh}`);
      }
    } catch (err) {
      errores++;
      console.error(`[FE Cron] Error auto-emitiendo doc ${row.id}:`, err.message);
    }
  }

  if (emitidos > 0 || errores > 0) {
    console.log(`[FE Cron] Auto-emisión: ${emitidos} emitidos, ${errores} errores de ${rows.length} pendientes`);
  }
}

// ── Ciclo principal ───────────────────────────────────────────────────────────

async function runCron() {
  const sb = adminSb();
  try {
    // Fase 0: re-emitir docs rechazados con auto_emitir
    await reEmitirRechazados(sb);

    // Fase 1: emitir docs confirmados sin clave_mh
    await emitirPendientes(sb);

    // Fase 2: consultar estado MH de docs ya enviados
    const { data: rows } = await sb
      .from('fe_documentos')
      .select('empresa_id')
      .in('estado_mh', ['enviado', 'procesando'])
      .not('clave_mh', 'is', null);

    if (!rows?.length) return;

    const empresaIds = [...new Set(rows.map((r) => r.empresa_id))];
    for (const empresaId of empresaIds) {
      await consultarEmpresa(sb, empresaId);
    }
  } catch (err) {
    console.error('[FE Cron] Error general en ciclo:', err.message);
  }
}

// ── Inicializar ───────────────────────────────────────────────────────────────

export function startFeConsultaCron() {
  console.log(`[FE Cron] Consulta periódica MH iniciada — intervalo ${INTERVAL_MS / 1000}s`);
  // Primer ciclo después de INITIAL_DELAY_MS para que el servidor termine de arrancar
  setTimeout(() => {
    void runCron();
    setInterval(() => void runCron(), INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}
