import fs from 'fs-extra';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { obtenerToken } from '../services/microsoftAuth.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function getRutaBase(empresa_id) {
  const { data } = await supabase
    .from('parametros_empresa')
    .select('ruta_comprobantes')
    .eq('empresa_id', empresa_id)
    .maybeSingle();
  return data?.ruta_comprobantes || process.env.COMPROBANTES_DIR || 'C:/MYA/comprobantes';
}

async function getCedulaEmpresa(empresa_id) {
  const { data } = await supabase
    .from('empresas')
    .select('cedula')
    .eq('id', empresa_id)
    .maybeSingle();
  return data?.cedula || null;
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function detectarTipoXML(xmlText) {
  if (xmlText.includes('FacturaElectronicaCompra'))                                return 'FEC';
  if (xmlText.includes('FacturaElectronicaExportacion'))                           return 'FEE';
  if (xmlText.includes('NotaDebitoElectronica'))                                   return 'NDE';
  if (xmlText.includes('NotaCreditoElectronica'))                                   return 'NCE';
  if (xmlText.includes('TiqueteElectronico'))                                       return 'TE';
  if (xmlText.includes('FacturaElectronica'))                                       return 'FE';
  if (xmlText.includes('mensajeHacienda') || xmlText.includes('MensajeHacienda')) return 'MH';
  return 'XML';
}

// Extrae <Numero> de identificacion dentro de un bloque XML (Emisor o Receptor)
function extraerNumeroId(bloque) {
  const m = bloque.match(/<Numero>([^<]+)<\/Numero>/i);
  return m ? m[1].trim() : null;
}

function parsearXML(xmlText) {
  const get = (tag) => {
    const match = xmlText.match(new RegExp(`<[^/]*${tag}[^>]*>([^<]+)<`));
    return match ? match[1].trim() : null;
  };
  // Extraer datos del emisor desde el bloque <Emisor>
  let emisorNombre = null;
  let emisorId = null;
  let emisorTipoId = null;
  const emisorBlock = xmlText.match(/<Emisor>([\s\S]*?)<\/Emisor>/i);
  if (emisorBlock) {
    const nombreMatch = emisorBlock[1].match(/<Nombre>([^<]+)<\/Nombre>/i);
    const tipoMatch   = emisorBlock[1].match(/<Tipo>(\d+)<\/Tipo>/i);
    emisorNombre = nombreMatch ? nombreMatch[1].trim() : null;
    emisorTipoId = tipoMatch   ? tipoMatch[1]          : null;
    emisorId     = extraerNumeroId(emisorBlock[1]);
  }
  // Extraer identificacion del receptor desde el bloque <Receptor>
  let receptorId = null;
  const receptorBlock = xmlText.match(/<Receptor>([\s\S]*?)<\/Receptor>/i);
  if (receptorBlock) {
    receptorId = extraerNumeroId(receptorBlock[1]);
  }
  let tipo = 'FACTURA_COMPRA';
  if (xmlText.includes('NotaCredito')) tipo = 'NOTA_CREDITO';
  else if (xmlText.includes('NotaDebito')) tipo = 'NOTA_DEBITO';
  // Extraer referencia a documento original (para NC/ND)
  // Estructura v4.4: <InformacionReferencia><Numero>CLAVE_50_DIGITOS</Numero>...
  // Fallback versiones anteriores: <NumeroReferencia>
  const ncReferenciaNumero = (() => {
    const bloque = xmlText.match(/<InformacionReferencia[\s\S]*?<Numero[^>]*>([^<]+)<\/Numero>/);
    if (bloque) return bloque[1].trim();
    const m = xmlText.match(/<NumeroReferencia[^>]*>([^<]+)<\/NumeroReferencia>/);
    return m ? m[1].trim() : null;
  })();

  return {
    tipo,
    clave:              get('Clave'),
    numero:             get('NumeroConsecutivo') || get('Clave'),
    emisorNombre,
    emisorId,
    emisorTipoId,
    receptorId,
    fecha:              get('FechaEmision')?.slice(0, 10),
    total:              parseFloat(get('TotalComprobante') || '0'),
    moneda:             get('CodigoMoneda') || 'CRC',
    ncReferenciaNumero, // número de la FE original en NC/ND
  };
}

// ─── Auto-vincula NC/ND con la FE original ────────────────────────────────────
// El <Numero> en <InformacionReferencia> es la Clave de 50 dígitos de Hacienda.
// Estructura Clave: [506][DDMMAA][Cédula 12d][NumeroConsecutivo 20d][Situación 8d][Seguridad 1d]
//                    1-3   4-9     10-21            22-41              42-49         50
// El NumeroConsecutivo embebido (pos 22-41) coincide con numero_comprobante en la DB.
async function autoVincularNC(empresa_id, comprobanteId, ncReferenciaNumero) {
  if (!ncReferenciaNumero) return;

  let feId = null;

  if (ncReferenciaNumero.length === 50) {
    // 1. Buscar por clave exacta
    const { data: fe1 } = await supabase
      .from('comprobantes_recibidos').select('id')
      .eq('empresa_id', empresa_id)
      .eq('clave', ncReferenciaNumero).maybeSingle();
    feId = fe1?.id || null;

    // 2. Fallback: extraer NumeroConsecutivo (pos 22-41, índice 0-based: 21-41)
    if (!feId) {
      const numeroConsecutivo = ncReferenciaNumero.slice(21, 41);
      const { data: fe2 } = await supabase
        .from('comprobantes_recibidos').select('id')
        .eq('empresa_id', empresa_id)
        .eq('numero_comprobante', numeroConsecutivo).maybeSingle();
      feId = fe2?.id || null;
    }
  } else {
    // NumeroConsecutivo directo (versiones anteriores del XML)
    const { data: fe3 } = await supabase
      .from('comprobantes_recibidos').select('id')
      .eq('empresa_id', empresa_id)
      .eq('numero_comprobante', ncReferenciaNumero).maybeSingle();
    feId = fe3?.id || null;
  }

  if (feId) {
    await supabase.from('comprobantes_recibidos')
      .update({ nc_referencia_id: feId })
      .eq('id', comprobanteId);
  }
}

// ─── GET /api/correo/estado ──────────────────────────────────────────────────

export async function estadoAuth(req, res) {
  try {
    const { requiereLogin } = await obtenerToken();
    res.json({ autenticado: !requiereLogin });
  } catch {
    res.json({ autenticado: false });
  }
}

// ─── GET /api/correo/iniciar-auth ────────────────────────────────────────────

export async function iniciarAuth(req, res) {
  try {
    const msal = await import('@azure/msal-node');
    const pca = new msal.PublicClientApplication({
      auth: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        authority: 'https://login.microsoftonline.com/consumers',
      }
    });

    const deviceCodeRequest = {
      deviceCodeCallback: (response) => {
        res.json({
          ok: true,
          url: response.verificationUri,
          codigo: response.userCode,
          mensaje: response.message,
        });
      },
      scopes: ['Mail.Read', 'User.Read'],
    };

    pca.acquireTokenByDeviceCode(deviceCodeRequest).catch(console.error);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

// ─── POST /api/correo/descargar ──────────────────────────────────────────────

export async function descargar(req, res) {
  const { empresa_id, fecha_desde, fecha_hasta } = req.body;

  try {
    const { token, requiereLogin } = await obtenerToken();
    if (requiereLogin) return res.status(401).json({ ok: false, requiereLogin: true });

    const headers = { Authorization: `Bearer ${token}` };
    const desde = fecha_desde
      ? new Date(fecha_desde)
      : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
    const hasta = fecha_hasta ? new Date(fecha_hasta + 'T23:59:59') : new Date();

    let messages = [];
    let nextLink =
      `https://graph.microsoft.com/v1.0/me/messages?` +
      `$filter=hasAttachments eq true and receivedDateTime ge ${desde.toISOString()} and receivedDateTime le ${hasta.toISOString()}` +
      `&$select=id,subject,from,receivedDateTime&$top=100`;

    while (nextLink) {
      const pageRes  = await fetch(nextLink, { headers });
      const pageData = await pageRes.json();
      messages  = messages.concat(pageData.value || []);
      nextLink  = pageData['@odata.nextLink'] || null;
    }

    const anio     = fecha_hasta ? fecha_hasta.slice(0, 4) : new Date().getFullYear().toString();
    const rutaBase = await getRutaBase(empresa_id);
    const carpeta  = path.join(rutaBase, `empresa_${empresa_id}`, anio);
    const cedulaEmpresa = await getCedulaEmpresa(empresa_id);

    await fs.ensureDir(carpeta);

    const descargados = [];
    let duplicados  = 0;
    let omitidos    = 0;

    for (const msg of messages) {
      const { data: existente } = await supabase
        .from('comprobantes_recibidos')
        .select('id')
        .eq('email_mensaje_id', msg.id)
        .maybeSingle();

      if (existente) { duplicados++; continue; }

      const attachRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/attachments`,
        { headers }
      );
      const { value: attachments } = await attachRes.json();

      const xmlAdj  = attachments.find(a => a.name?.toLowerCase().endsWith('.xml') && !a.name?.toLowerCase().includes('resp'));
      const pdfAdj  = attachments.find(a => a.name?.toLowerCase().endsWith('.pdf'));
      const xml3Adj = attachments.find(a => a.name?.toLowerCase().endsWith('.xml') && a.name?.toLowerCase().includes('resp'));

      if (!xmlAdj) continue;

      // Parsear XML antes de escribir al disco para validar que la empresa sea el receptor
      const xmlBuffer = Buffer.from(xmlAdj.contentBytes, 'base64');
      const xmlText   = xmlBuffer.toString('utf-8');
      const datos     = parsearXML(xmlText);
      const tipoXml   = detectarTipoXML(xmlText);

      // Descartar: MH (confirmaciones Hacienda) y TE (tiquetes, no deducibles según normativa)
      if (tipoXml === 'MH' || tipoXml === 'TE') { omitidos++; continue; }

      // Solo guardar si la empresa es el receptor (o si no se pudo determinar el receptor)
      if (cedulaEmpresa && datos.receptorId && datos.receptorId !== cedulaEmpresa) {
        omitidos++;
        continue;
      }

      // Deduplicar por clave de Hacienda (el mismo doc puede llegar en varios correos)
      if (datos.clave) {
        const { data: porClave } = await supabase
          .from('comprobantes_recibidos')
          .select('id')
          .eq('empresa_id', empresa_id)
          .eq('clave', datos.clave)
          .maybeSingle();
        if (porClave) { duplicados++; continue; }
      }

      const { data: seqData } = await supabase.rpc('nextval_comprobantes');
      const correlativo = String(seqData).padStart(5, '0');

      const xmlPath = path.join(carpeta, `ID_${correlativo}_1.xml`);
      await fs.writeFile(xmlPath, xmlBuffer);

      let pdfPath  = null;
      let xml3Path = null;

      if (pdfAdj) {
        const pdfBuffer = Buffer.from(pdfAdj.contentBytes, 'base64');
        pdfPath = path.join(carpeta, `ID_${correlativo}_2.pdf`);
        await fs.writeFile(pdfPath, pdfBuffer);
      }

      if (xml3Adj) {
        const xml3Buffer = Buffer.from(xml3Adj.contentBytes, 'base64');
        xml3Path = path.join(carpeta, `ID_${correlativo}_3.xml`);
        await fs.writeFile(xml3Path, xml3Buffer);
      }

      const { data: registro } = await supabase
        .from('comprobantes_recibidos')
        .insert({
          empresa_id,
          clave:                  datos.clave,
          tipo:                   datos.tipo,
          numero_comprobante:     datos.numero,
          emisor_nombre:          datos.emisorNombre,
          emisor_identificacion:  datos.emisorId,
          emisor_tipo_id:         datos.emisorTipoId,
          fecha_emision:          datos.fecha,
          total_comprobante:      datos.total,
          moneda:                 datos.moneda,
          archivo_xml:            xmlPath,
          archivo_pdf:            pdfPath,
          email_mensaje_id:       msg.id,
          email_fecha:            msg.receivedDateTime,
          email_remitente:        msg.from?.emailAddress?.address,
          tipo_xml:               tipoXml,
          archivo_xml_mh:         xml3Path,
          nc_referencia_numero:   datos.ncReferenciaNumero || null,
        })
        .select()
        .single();

      if (registro?.id) await autoVincularNC(empresa_id, registro.id, datos.ncReferenciaNumero);
      descargados.push(registro);
    }

    res.json({ ok: true, descargados, total: descargados.length, duplicados, omitidos });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// ─── GET /api/correo/descargar-sse ───────────────────────────────────────────

export async function descargarSSE(req, res) {
  const { empresa_id, fecha_desde, fecha_hasta } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const enviar = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { token, requiereLogin } = await obtenerToken();
    if (requiereLogin) {
      enviar({ tipo: 'error', mensaje: 'Requiere autenticación' });
      return res.end();
    }

    const headers = { Authorization: `Bearer ${token}` };
    const desde = fecha_desde ? new Date(fecha_desde) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
    const hasta = fecha_hasta ? new Date(fecha_hasta + 'T23:59:59') : new Date();

    enviar({ tipo: 'estado', mensaje: 'Buscando correos...' });

    let messages = [];
    let nextLink =
      `https://graph.microsoft.com/v1.0/me/messages?` +
      `$filter=hasAttachments eq true and receivedDateTime ge ${desde.toISOString()} and receivedDateTime le ${hasta.toISOString()}` +
      `&$select=id,subject,from,receivedDateTime&$top=100`;

    while (nextLink) {
      const pageRes  = await fetch(nextLink, { headers });
      const pageData = await pageRes.json();
      messages  = messages.concat(pageData.value || []);
      nextLink  = pageData['@odata.nextLink'] || null;
      enviar({ tipo: 'estado', mensaje: `${messages.length} correos encontrados...` });
    }

    enviar({ tipo: 'total', total: messages.length });

    const anio          = fecha_hasta ? fecha_hasta.slice(0, 4) : new Date().getFullYear().toString();
    const rutaBase      = await getRutaBase(empresa_id);
    const carpeta       = path.join(rutaBase, `empresa_${empresa_id}`, anio);
    const cedulaEmpresa = await getCedulaEmpresa(empresa_id);

    await fs.ensureDir(carpeta);

    let procesados  = 0;
    let descargados = 0;
    let duplicados  = 0;
    let omitidos    = 0;

    for (const msg of messages) {
      procesados++;
      enviar({ tipo: 'progreso', procesados, total: messages.length, mensaje: msg.subject?.slice(0, 50) });

      const { data: existente } = await supabase
        .from('comprobantes_recibidos')
        .select('id')
        .eq('email_mensaje_id', msg.id)
        .maybeSingle();

      if (existente) { duplicados++; continue; }

      const attachRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/attachments`,
        { headers }
      );
      const { value: attachments } = await attachRes.json();

      const xmlAdj  = attachments.find(a => a.name?.toLowerCase().endsWith('.xml') && !a.name?.toLowerCase().includes('resp'));
      const pdfAdj  = attachments.find(a => a.name?.toLowerCase().endsWith('.pdf'));
      const xml3Adj = attachments.find(a => a.name?.toLowerCase().endsWith('.xml') && a.name?.toLowerCase().includes('resp'));

      if (!xmlAdj) continue;

      // Parsear XML antes de escribir al disco para validar que la empresa sea el receptor
      const xmlBuffer = Buffer.from(xmlAdj.contentBytes, 'base64');
      const xmlText   = xmlBuffer.toString('utf-8');
      const datos     = parsearXML(xmlText);
      const tipoXml   = detectarTipoXML(xmlText);

      // Descartar: MH (confirmaciones Hacienda) y TE (tiquetes, no deducibles según normativa)
      if (tipoXml === 'MH' || tipoXml === 'TE') { omitidos++; enviar({ tipo: 'omitido', procesados, emisor: tipoXml }); continue; }

      // Solo guardar si la empresa es el receptor
      if (cedulaEmpresa && datos.receptorId && datos.receptorId !== cedulaEmpresa) {
        omitidos++;
        enviar({ tipo: 'omitido', procesados, emisor: datos.emisorNombre });
        continue;
      }

      // Deduplicar por clave de Hacienda
      if (datos.clave) {
        const { data: porClave } = await supabase
          .from('comprobantes_recibidos')
          .select('id')
          .eq('empresa_id', empresa_id)
          .eq('clave', datos.clave)
          .maybeSingle();
        if (porClave) { duplicados++; continue; }
      }

      const { data: seqData } = await supabase.rpc('nextval_comprobantes');
      const correlativo = String(seqData).padStart(5, '0');

      const xmlPath = path.join(carpeta, `ID_${correlativo}_1.xml`);
      await fs.writeFile(xmlPath, xmlBuffer);

      let pdfPath  = null;
      let xml3Path = null;

      if (pdfAdj) {
        const pdfBuffer = Buffer.from(pdfAdj.contentBytes, 'base64');
        pdfPath = path.join(carpeta, `ID_${correlativo}_2.pdf`);
        await fs.writeFile(pdfPath, pdfBuffer);
      }

      if (xml3Adj) {
        const xml3Buffer = Buffer.from(xml3Adj.contentBytes, 'base64');
        xml3Path = path.join(carpeta, `ID_${correlativo}_3.xml`);
        await fs.writeFile(xml3Path, xml3Buffer);
      }

      const { data: regSSE } = await supabase.from('comprobantes_recibidos').insert({
        empresa_id,
        clave:                  datos.clave,
        tipo:                   datos.tipo,
        numero_comprobante:     datos.numero,
        emisor_nombre:          datos.emisorNombre,
        emisor_identificacion:  datos.emisorId,
        emisor_tipo_id:         datos.emisorTipoId,
        fecha_emision:          datos.fecha,
        total_comprobante:      datos.total,
        moneda:                 datos.moneda,
        archivo_xml:            xmlPath,
        archivo_pdf:            pdfPath,
        email_mensaje_id:       msg.id,
        email_fecha:            msg.receivedDateTime,
        email_remitente:        msg.from?.emailAddress?.address,
        tipo_xml:               tipoXml,
        archivo_xml_mh:         xml3Path,
        nc_referencia_numero:   datos.ncReferenciaNumero || null,
      }).select('id').single();

      if (regSSE?.id) await autoVincularNC(empresa_id, regSSE.id, datos.ncReferenciaNumero);
      descargados++;
      enviar({ tipo: 'descargado', descargados, emisor: datos.emisorNombre, correlativo });
    }

    enviar({ tipo: 'fin', descargados, duplicados, omitidos, total: messages.length });
    res.end();

  } catch (error) {
    enviar({ tipo: 'error', mensaje: error.message });
    res.end();
  }
}

// ─── GET /api/correo/archivo ─────────────────────────────────────────────────

export async function verArchivo(req, res) {
  try {
    const { ruta } = req.query;
    if (!ruta) return res.status(400).json({ error: 'Ruta requerida' });

    const rutaNormal   = ruta.replace(/\\/g, '/');
    const rutaBase = process.env.COMPROBANTES_DIR || 'C:/MYA/comprobantes';
    const baseDirNormal = rutaBase.replace(/\\/g, '/');

    if (!rutaNormal.startsWith(baseDirNormal)) return res.status(403).json({ error: 'Acceso denegado' });

    const existe = await fs.pathExists(ruta);
    if (!existe) return res.status(404).json({ error: 'Archivo no encontrado' });

    const ext         = path.extname(ruta).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : 'application/xml';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(ruta)}"`);
    fs.createReadStream(ruta).pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// GET /api/correo/abrir-carpeta?ruta=C:/MYA/comprobantes
export async function abrirCarpeta(req, res) {
  try {
    const { ruta } = req.query;
    if (!ruta) return res.status(400).json({ error: 'Ruta requerida' });

    const { exec } = await import('child_process');
    const rutaWindows = ruta.replace(/\//g, '\\');
    exec(`explorer "${rutaWindows}"`, (error) => {
      if (error) console.error('Error abriendo carpeta:', error);
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/correo/procesar-xml/:id
export async function procesarXML(req, res) {
  const { id } = req.params;

  try {
    // Obtener comprobante
    const { data: comp, error } = await supabase
      .from('comprobantes_recibidos')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !comp) return res.status(404).json({ ok: false, error: 'Comprobante no encontrado' });
    if (!comp.archivo_xml) return res.status(400).json({ ok: false, error: 'No tiene archivo XML' });

    // Leer XML del disco
    const xmlText = await fs.readFile(comp.archivo_xml, 'utf-8');

    // Eliminar líneas y resumen IVA anteriores si ya fue procesado
    await supabase.from('comprobantes_lineas').delete().eq('comprobante_id', id);
    await supabase.from('comprobante_iva_resumen').delete().eq('comprobante_id', id);

    // Parsear líneas, otros cargos y resumen
    const { lineas, otrosCargos, resumen } = parsearContenidoXML(xmlText, comp.empresa_id, Number(id));

    if (lineas.length === 0) {
      return res.status(400).json({ ok: false, error: 'No se encontraron líneas de detalle en el XML' });
    }

    // Insertar líneas (select para recuperar IDs generados por la DB)
    const { data: lineasInsertadas, error: insertError } = await supabase
      .from('comprobantes_lineas')
      .insert(lineas)
      .select();

    if (insertError) return res.status(500).json({ ok: false, error: insertError.message });
    // Reemplazar con los registros que incluyen el id de la DB
    const lineasConId = lineasInsertadas || lineas;

    // Sincronizar códigos comerciales de proveedor → inv_codigos_proveedor
    const fechaDoc = comp.fecha_emision?.slice(0, 10) || null;
    const lineasConCodigo = lineas.filter(l => l.codigo_comercial && l.tipo_linea === 'M');
    const emisorId = (parsearXML(xmlText)).emisorId || comp.emisor_identificacion;
    for (const linea of lineasConCodigo) {
      await supabase.rpc('fn_upsert_codigo_proveedor', {
        p_empresa_id:            comp.empresa_id,
        p_emisor_identificacion: emisorId,
        p_emisor_nombre:         comp.emisor_nombre,
        p_tipo_codigo:           '01',
        p_codigo_comercial:      linea.codigo_comercial,
        p_codigo_cabys:          linea.cabys || null,
        p_descripcion:           linea.descripcion,
        p_precio:                linea.precio_unitario,
        p_fecha:                 fechaDoc,
      });
    }

    // Construir resumen IVA agrupado por tarifa (para D-104)
    const ivaMap = {};
    for (const l of lineas) {
      const key = l.tarifa_iva_codigo || '01';
      if (!ivaMap[key]) {
        ivaMap[key] = {
          comprobante_id:  Number(id),
          empresa_id:      comp.empresa_id,
          tarifa_codigo:   key,
          tarifa_porc:     l.tarifa_iva,
          base_imponible:  0,
          monto_iva:       0,
          monto_exonerado: 0,
        };
      }
      ivaMap[key].base_imponible  += l.subtotal;
      ivaMap[key].monto_iva       += l.monto_impuesto;
      ivaMap[key].monto_exonerado += l.exoneracion_monto || 0;
    }
    const ivaResumen = Object.values(ivaMap);
    if (ivaResumen.length > 0) {
      await supabase.from('comprobante_iva_resumen').insert(ivaResumen);
    }

    // Verificar cuadre: Σlineas + OtrosCargos - IVADevuelto = TotalComprobante
    const sumaLineas     = lineas.reduce((s, l) => s + l.total_linea, 0);
    const totalOtros     = otrosCargos.reduce((s, o) => s + o.monto_cargo, 0);
    const ivaDevuelto    = resumen.totalIVADevuelto || 0;
    const totalCalculado = sumaLineas + totalOtros - ivaDevuelto;
    const diferencia     = Math.abs(totalCalculado - (resumen.totalComprobante || comp.total_comprobante));
    const cuadra         = diferencia < 1; // tolerancia 1 unidad por redondeos

    // Re-parsear datos del emisor desde el XML (corrige errores de descarga)
    const datosEmisor = parsearXML(xmlText);

    // Auto-vincular con proveedor usando la identificacion correcta del XML
    let proveedorId = null;
    if (datosEmisor.emisorId) {
      const { data: tercero } = await supabase
        .from('terceros')
        .select('id')
        .eq('empresa_id', comp.empresa_id)
        .eq('identificacion', datosEmisor.emisorId)
        .maybeSingle();
      proveedorId = tercero?.id || null;

      // Si se encontró el proveedor, asignar cuenta CXP desde config si no tiene una
      if (proveedorId) {
        const { data: cfg } = await supabase
          .from('empresa_config_cxp').select('cuenta_cxp_id').eq('empresa_id', comp.empresa_id).maybeSingle();
        const cuentaBaseId = cfg?.cuenta_cxp_id;
        if (cuentaBaseId) {
          const { data: cuentaEmp } = await supabase
            .from('plan_cuentas_empresa').select('id')
            .eq('empresa_id', comp.empresa_id).eq('cuenta_base_id', cuentaBaseId).maybeSingle();
          const cuentaId = cuentaEmp?.id;
          if (cuentaId) {
            const { data: existing } = await supabase
              .from('tercero_proveedor_parametros').select('id, cuenta_cxp_id')
              .eq('tercero_id', proveedorId).eq('empresa_id', comp.empresa_id).maybeSingle();
            if (existing) {
              if (!existing.cuenta_cxp_id)
                await supabase.from('tercero_proveedor_parametros')
                  .update({ cuenta_cxp_id: cuentaId }).eq('id', existing.id);
            } else {
              await supabase.from('tercero_proveedor_parametros')
                .insert({ tercero_id: proveedorId, empresa_id: comp.empresa_id, cuenta_cxp_id: cuentaId });
            }
          }
        }
      }
    }

    // Guardar cuadre, proveedor y emisor corregido en comprobantes_recibidos
    const ncRef = datosEmisor.ncReferenciaNumero || null;
    await supabase.from('comprobantes_recibidos')
      .update({
        procesado:             true,
        emisor_nombre:         datosEmisor.emisorNombre   || comp.emisor_nombre,
        emisor_identificacion: datosEmisor.emisorId       || comp.emisor_identificacion,
        emisor_tipo_id:        datosEmisor.emisorTipoId   || comp.emisor_tipo_id,
        total_otros_cargos:    totalOtros,
        iva_devuelto:          ivaDevuelto,
        cuadra,
        diferencia_cuadre:     diferencia,
        tipo_cambio:           resumen.tipoCambio         || 1,
        total_serv_gravados:   resumen.totalServGravados  || 0,
        total_serv_exentos:    resumen.totalServExentos   || 0,
        total_serv_exonerado:  resumen.totalServExonerado || 0,
        total_merc_gravados:   resumen.totalMercGravados  || 0,
        total_merc_exentos:    resumen.totalMercExentos   || 0,
        total_merc_exonerado:  resumen.totalMercExonerado || 0,
        ...(proveedorId ? { proveedor_id: proveedorId } : {}),
        ...(ncRef ? { nc_referencia_numero: ncRef } : {}),
      })
      .eq('id', id);

    if (ncRef) await autoVincularNC(comp.empresa_id, Number(id), ncRef);

    res.json({
      ok: true,
      lineas:          lineasConId.length,
      detalle:         lineasConId,
      otrosCargos,
      resumen,
      cuadre:          { sumaLineas, totalOtros, ivaDevuelto, totalCalculado, totalDocumento: resumen.totalComprobante, diferencia, cuadra },
      ivaResumen:          ivaResumen,
      proveedor_id:        proveedorId,
      proveedor_vinculado: proveedorId !== null,
      emisor: {
        nombre:   datosEmisor.emisorNombre,
        id:       datosEmisor.emisorId,
        tipo_id:  datosEmisor.emisorTipoId,
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

function parsearContenidoXML(xmlText, empresa_id, comprobante_id) {
  const getText = (bloque, tag) => {
    const m = bloque.match(new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`, 'i'));
    return m ? m[1].trim() : null;
  };

  // ── Líneas de detalle ──────────────────────────────────────────────────────
  const lineas = [];
  const lineaRegex = /<LineaDetalle>([\s\S]*?)<\/LineaDetalle>/g;
  let match;
  let numLinea = 1;

  // Unidades de medida que corresponden a servicios según Hacienda CR
  const SERVICE_UNITS = new Set(['Al','Alc','Cm','I','Os','Sp','Spe','OT','ST','h','min','dia','mes','ano']);

  while ((match = lineaRegex.exec(xmlText)) !== null) {
    const bloque = match[1];
    const get    = (tag) => getText(bloque, tag);

    const impuestoMatch = bloque.match(/<Impuesto>([\s\S]*?)<\/Impuesto>/i);
    const getImp = (tag) => {
      if (!impuestoMatch) return null;
      return getText(impuestoMatch[1], tag);
    };

    const cantidad      = parseFloat(get('Cantidad') || '0');
    const precioUnit    = parseFloat(get('PrecioUnitario') || '0');
    const descuento     = parseFloat(get('MontoDescuento') || '0');
    const subtotal      = parseFloat(get('SubTotal') || '0');
    const totalLinea    = parseFloat(get('MontoTotalLinea') || '0');
    const tarifaIva     = parseFloat(getImp('Tarifa') || get('Tarifa') || '0');
    const montoImpuesto = parseFloat(getImp('Monto') || getImp('MontoImpuesto') || get('MontoImpuesto') || '0');

    // CodigoCABYS — tag directo FE v4.4
    let cabys = get('CodigoCABYS');

    // Código de la línea: en FE v4.3 <Codigo> contiene el CABYS (13 dígitos numéricos)
    const codigoTag = get('Codigo');
    const codigoEsCabys = codigoTag && /^\d{13}$/.test(codigoTag);

    // FE v4.3: si <Codigo> tiene exactamente 13 dígitos es el CABYS
    if (!cabys && codigoEsCabys) cabys = codigoTag;

    // CodigoComercial — puede haber varios bloques (Tipo 01 = proveedor, Tipo 04 = CABYS legacy)
    const codComerciales = [];
    const ccRegex = /<CodigoComercial>([\s\S]*?)<\/CodigoComercial>/g;
    let ccM;
    while ((ccM = ccRegex.exec(bloque)) !== null) {
      const tipo   = getText(ccM[1], 'Tipo');
      const codigo = getText(ccM[1], 'Codigo');
      if (tipo && codigo) codComerciales.push({ tipo, codigo });
    }
    // Fallback: CodigoComercial Tipo=04 solo si tiene 13 dígitos (algunos emisores lo usan así)
    if (!cabys) {
      const c04 = codComerciales.find(c => c.tipo === '04');
      if (c04 && /^\d{13}$/.test(c04.codigo)) cabys = c04.codigo;
    }
    // Código comercial del proveedor (Tipo 01)
    const codigoComercialProv = codComerciales.find(c => c.tipo === '01')?.codigo || null;

    // Tipo de línea basado en unidad de medida
    const unidad    = get('UnidadMedida') || get('Unidad') || 'Und';
    const tipoLinea = SERVICE_UNITS.has(unidad) ? 'S' : 'M';

    // Tarifa IVA código (01=Exento, 02=1%, 03=2%, 04=4%, 05=8%, 06=13%)
    const tarifaCodigo = getImp('CodigoTarifa') || (tarifaIva === 0 ? '01' : null);

    // Exoneración
    let exoneracionTipo = null, exoneracionPorc = 0, exoneracionMonto = 0;
    let exoneracionNumero = null, exoneracionInstitucion = null;
    const exonMatch = bloque.match(/<Exoneracion>([\s\S]*?)<\/Exoneracion>/i);
    if (exonMatch) {
      const getEx = (tag) => getText(exonMatch[1], tag);
      exoneracionTipo        = getEx('TipoDocumento');
      exoneracionNumero      = getEx('NumeroDocumento') || null;
      exoneracionInstitucion = getEx('NombreInstitucion') || null;
      exoneracionPorc        = parseFloat(getEx('PorcentajeExoneracion') || '0');
      exoneracionMonto       = parseFloat(getEx('MontoExoneracion') || '0');
    }

    lineas.push({
      comprobante_id,
      empresa_id,
      num_linea:         numLinea++,
      // Si <Codigo> era el CABYS (13 dígitos), usamos el código del proveedor como referencia de línea
      codigo:            codigoEsCabys ? codigoComercialProv : (codigoTag || codigoComercialProv || null),
      descripcion:       get('Detalle') || get('Descripcion') || '—',
      unidad,
      cantidad,
      precio_unitario:   precioUnit,
      descuento_monto:   descuento,
      subtotal:          subtotal || (cantidad * precioUnit - descuento),
      tarifa_iva:        tarifaIva,
      monto_impuesto:    montoImpuesto,
      total_linea:       totalLinea,
      cabys,
      tarifa_iva_codigo:      tarifaCodigo,
      tipo_linea:             tipoLinea,
      codigo_comercial:       codigoComercialProv,
      tipo_codigo_comercial:  codigoComercialProv ? '01' : null,
      exoneracion_tipo:        exoneracionTipo,
      exoneracion_numero:      exoneracionNumero,
      exoneracion_institucion: exoneracionInstitucion,
      exoneracion_porc:        exoneracionPorc,
      exoneracion_monto:       exoneracionMonto,
    });
  }

  // ── Otros cargos ───────────────────────────────────────────────────────────
  const otrosCargos = [];
  const otrosRegex  = /<OtrosCargos>([\s\S]*?)<\/OtrosCargos>/g;
  while ((match = otrosRegex.exec(xmlText)) !== null) {
    const bloque = match[1];
    const get    = (tag) => getText(bloque, tag);
    otrosCargos.push({
      tipo_documento: get('TipoDocumento'),
      detalle:        get('Detalle') || 'Otro cargo',
      porcentaje:     parseFloat(get('Porcentaje') || '0'),
      monto_cargo:    parseFloat(get('MontoCargo') || '0'),
    });
  }

  // ── Resumen del documento ──────────────────────────────────────────────────
  const resumen = {};
  const resumenMatch = xmlText.match(/<ResumenFactura>([\s\S]*?)<\/ResumenFactura>/i);
  if (resumenMatch) {
    const get            = (tag) => getText(resumenMatch[1], tag);
    resumen.tipoCambio         = parseFloat(get('TipoCambio') || '1');
    resumen.totalServGravados  = parseFloat(get('TotalServGravados')  || '0');
    resumen.totalServExentos   = parseFloat(get('TotalServExentos')   || '0');
    resumen.totalServExonerado = parseFloat(get('TotalServExonerado') || '0');
    resumen.totalMercGravados  = parseFloat(get('TotalMercGravados')  || '0');
    resumen.totalMercExentos   = parseFloat(get('TotalMercExentos')   || '0');
    resumen.totalMercExonerado = parseFloat(get('TotalMercExonerado') || '0');
    resumen.totalVenta         = parseFloat(get('TotalVenta') || '0');
    resumen.totalDescuentos    = parseFloat(get('TotalDescuentos') || '0');
    resumen.totalVentaNeta     = parseFloat(get('TotalVentaNeta') || '0');
    resumen.totalImpuesto      = parseFloat(get('TotalImpuesto') || '0');
    resumen.totalIVADevuelto   = parseFloat(get('TotalIVADevuelto') || '0');
    resumen.totalOtrosCargos   = parseFloat(get('TotalOtrosCargos') || '0');
    resumen.totalComprobante   = parseFloat(get('TotalComprobante') || '0');
  }

  return { lineas, otrosCargos, resumen };
}