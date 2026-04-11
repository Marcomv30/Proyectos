import { ImapFlow } from 'imapflow';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

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

const ENCRYPT_KEY = process.env.ENCRYPT_KEY || 'mya-erp-2025-key-32-characters!!';

// ─── Encriptación simple ───────────────────────────────────────────────────

export function encriptarPassword(texto) {
  const key    = crypto.scryptSync(ENCRYPT_KEY, 'salt', 32);
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc    = Buffer.concat([cipher.update(texto), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

export function desencriptarPassword(texto) {
  if (!texto || !String(texto).includes(':')) {
    throw new Error('Credencial guardada en formato incorrecto. Vuelva a guardar el certificado y las credenciales ATV desde Configuración FE.');
  }
  const [ivHex, encHex] = String(texto).split(':');
  if (!ivHex || !encHex) {
    throw new Error('Credencial guardada en formato incorrecto. Vuelva a guardar el certificado y las credenciales ATV desde Configuración FE.');
  }
  const key      = crypto.scryptSync(ENCRYPT_KEY, 'salt', 32);
  const iv       = Buffer.from(ivHex, 'hex');
  const enc      = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString();
}

// ─── Configuración IMAP por tipo ─────────────────────────────────────────────

function getImapConfig(cuenta) {
  const password = desencriptarPassword(cuenta.password_encriptado);

if (cuenta.tipo === 'GMAIL') {
  return {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: cuenta.email, pass: password },
    tls: {
      rejectUnauthorized: false
    },
  };
}

  if (cuenta.tipo === 'HOTMAIL') {
    return {
      host: 'outlook.office365.com',
      port: 993,
      secure: true,
      auth: { user: cuenta.email, pass: password },
    };
  }

  // IMAP genérico
  return {
    host: cuenta.imap_host,
    port: cuenta.imap_port || 993,
    secure: cuenta.imap_tls !== false,
    auth: { user: cuenta.email, pass: password },
  };
}

// ─── Probar conexión ──────────────────────────────────────────────────────────




export async function probarConexion(cuenta) {
  const config = getImapConfig(cuenta);
  console.log('Probando IMAP:', { host: config.host, port: config.port, user: config.auth.user });
  
  const password = desencriptarPassword(cuenta.password_encriptado);
  console.log('Password desencriptada (primeros 4 chars):', password.slice(0, 4), '... longitud:', password.length);

  const client = new ImapFlow({ ...config, logger: false });
  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (error) {
    console.error('Error IMAP completo:', error);
    return { ok: false, error: error.message + ' | ' + (error.responseText || '') };
  }
}

// ─── Descargar comprobantes vía IMAP ─────────────────────────────────────────

export async function descargarViaImap(cuenta, fechaDesde, fechaHasta, onProgreso) {
  const client = new ImapFlow({ ...getImapConfig(cuenta), logger: false });

  const desde = fechaDesde ? new Date(fechaDesde) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const hasta = fechaHasta ? new Date(fechaHasta + 'T23:59:59') : new Date();

  const anio    = fechaHasta ? fechaHasta.slice(0, 4) : new Date().getFullYear().toString();
    const rutaBase = await getRutaBase(cuenta.empresa_id);
    const carpeta = path.join(rutaBase, `empresa_${cuenta.empresa_id}`, anio);

  await fs.ensureDir(carpeta);

  let descargados = 0;
  let duplicados  = 0;

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Buscar mensajes en el rango de fechas
    const uids = await client.search({
      since: desde,
      before: hasta,
    });

    if (onProgreso) onProgreso({ tipo: 'total', total: uids.length });

    let procesados = 0;

    for await (const msg of client.fetch(uids, { envelope: true, bodyStructure: true, source: true })) {
      procesados++;
      if (onProgreso) onProgreso({
        tipo: 'progreso',
        procesados,
        total: uids.length,
        mensaje: msg.envelope?.subject?.slice(0, 50) || '',
      });

      const msgId = `imap_${cuenta.email}_${msg.uid}`;

      // Verificar duplicado
      const { data: existente } = await supabase
        .from('comprobantes_recibidos')
        .select('id')
        .eq('email_mensaje_id', msgId)
        .maybeSingle();

      if (existente) { duplicados++; continue; }

      // Extraer adjuntos del source
      const source = msg.source.toString();
      const adjuntos = extraerAdjuntosDeSource(source);

      const xmlAdj  = adjuntos.find(a => a.nombre?.toLowerCase().endsWith('.xml') && !a.nombre?.toLowerCase().includes('resp'));
      const pdfAdj  = adjuntos.find(a => a.nombre?.toLowerCase().endsWith('.pdf'));
      const xml3Adj = adjuntos.find(a => a.nombre?.toLowerCase().endsWith('.xml') && a.nombre?.toLowerCase().includes('resp'));

      if (!xmlAdj) continue;

      const { data: seqData } = await supabase.rpc('nextval_comprobantes');
      const correlativo = String(seqData).padStart(5, '0');

      const xmlBuffer = Buffer.from(xmlAdj.contenido, 'base64');
      const xmlPath   = path.join(carpeta, `ID_${correlativo}_1.xml`);
      await fs.writeFile(xmlPath, xmlBuffer);

      let pdfPath  = null;
      let xml3Path = null;

      if (pdfAdj) {
        const pdfBuffer = Buffer.from(pdfAdj.contenido, 'base64');
        pdfPath = path.join(carpeta, `ID_${correlativo}_2.pdf`);
        await fs.writeFile(pdfPath, pdfBuffer);
      }

      if (xml3Adj) {
        const xml3Buffer = Buffer.from(xml3Adj.contenido, 'base64');
        xml3Path = path.join(carpeta, `ID_${correlativo}_3.xml`);
        await fs.writeFile(xml3Path, xml3Buffer);
      }

      const xmlText = xmlBuffer.toString('utf-8');
      const datos   = parsearXML(xmlText);
      const tipoXml = detectarTipoXML(xmlText);

      await supabase.from('comprobantes_recibidos').insert({
        empresa_id:            cuenta.empresa_id,
        correo_cuenta_id:      cuenta.id,
        tipo:                  datos.tipo,
        numero_comprobante:    datos.numero,
        emisor_nombre:         datos.emisorNombre,
        emisor_identificacion: datos.emisorId,
        fecha_emision:         datos.fecha,
        total_comprobante:     datos.total,
        moneda:                datos.moneda,
        archivo_xml:           xmlPath,
        archivo_pdf:           pdfPath,
        email_mensaje_id:      msgId,
        email_fecha:           msg.envelope?.date?.toISOString(),
        email_remitente:       msg.envelope?.from?.[0]?.address,
        tipo_xml:              tipoXml,
        archivo_xml_mh:        xml3Path,
      });

      descargados++;
      if (onProgreso) onProgreso({ tipo: 'descargado', descargados, emisor: datos.emisorNombre, correlativo });
    }

    await client.logout();
  } catch (error) {
    try { await client.logout(); } catch {}
    throw error;
  }

  return { descargados, duplicados };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extraerAdjuntosDeSource(source) {
  const adjuntos = [];
  const boundaryMatch = source.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) return adjuntos;

  const boundary = boundaryMatch[1];
  const partes   = source.split('--' + boundary);

  for (const parte of partes) {
    const nombreMatch   = parte.match(/filename="?([^"\r\n]+)"?/i);
    const encodingMatch = parte.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    if (!nombreMatch) continue;

    const nombre   = nombreMatch[1].trim();
    const encoding = encodingMatch?.[1]?.toLowerCase() || 'base64';
    const bodyStart = parte.indexOf('\r\n\r\n');
    if (bodyStart === -1) continue;

    let contenido = parte.slice(bodyStart + 4).replace(/\r?\n/g, '').trim();
    if (encoding !== 'base64') continue;

    adjuntos.push({ nombre, contenido });
  }

  return adjuntos;
}

function detectarTipoXML(xmlText) {
  if (xmlText.includes('FacturaElectronicaCompra'))       return 'FEC';
  if (xmlText.includes('FacturaElectronicaExportacion'))  return 'FEE';
  if (xmlText.includes('NotaDebitoElectronica'))          return 'NDE';
  if (xmlText.includes('NotaCreditoElectronica'))         return 'NCE';
  if (xmlText.includes('FacturaElectronica'))             return 'FE';
  if (xmlText.includes('mensajeHacienda') || xmlText.includes('MensajeHacienda')) return 'MH';
  return 'XML';
}

function parsearXML(xmlText) {
  const get = (tag) => {
    const match = xmlText.match(new RegExp(`<[^/]*${tag}[^>]*>([^<]+)<`));
    return match ? match[1].trim() : null;
  };
  let tipo = 'FACTURA_COMPRA';
  if (xmlText.includes('NotaCredito')) tipo = 'NOTA_CREDITO';
  else if (xmlText.includes('NotaDebito')) tipo = 'NOTA_DEBITO';
  return {
    tipo,
    numero:       get('NumeroConsecutivo') || get('Clave'),
    emisorNombre: get('NombreEmisor') || get('Nombre'),
    emisorId:     get('NumeroEmisor') || get('Numero'),
    fecha:        get('FechaEmision')?.slice(0, 10),
    total:        parseFloat(get('TotalComprobante') || '0'),
    moneda:       get('CodigoMoneda') || 'CRC',
  };
}
