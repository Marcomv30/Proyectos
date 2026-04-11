import 'dotenv/config';
import { obtenerTokenDeviceCode } from './services/microsoftAuth.js';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs-extra';
import path from 'path';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const BASE_DIR = process.env.COMPROBANTES_DIR || 'C:/MYA/comprobantes';
const EMPRESA_ID = 1; // cambia según la empresa

console.log('Obteniendo token...');
const token = await obtenerTokenDeviceCode();
const headers = { Authorization: `Bearer ${token}` };

const fecha = new Date();
fecha.setDate(fecha.getDate() - 30);

const res = await fetch(
  `https://graph.microsoft.com/v1.0/me/messages?` +
  `$filter=hasAttachments eq true and receivedDateTime ge ${fecha.toISOString()}` +
  `&$select=id,subject,from,receivedDateTime&$top=50`,
  { headers }
);

const { value: messages } = await res.json();
let descargados = 0;
let duplicados = 0;

for (const msg of messages) {

  // Verificar duplicado
  const { data: existente } = await supabase
    .from('comprobantes_recibidos')
    .select('id')
    .eq('email_mensaje_id', msg.id)
    .maybeSingle();

  if (existente) {
    duplicados++;
    continue;
  }

  // Obtener adjuntos
  const attachRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/attachments`,
    { headers }
  );
  const { value: attachments } = await attachRes.json();

  const xmlAdj = attachments.find(a => a.name?.toLowerCase().endsWith('.xml'));
  const pdfAdj = attachments.find(a => a.name?.toLowerCase().endsWith('.pdf'));

  if (!xmlAdj) continue;

  // Crear carpeta
  const mes = msg.receivedDateTime.slice(0, 7);
  const carpeta = path.join(BASE_DIR, `empresa_${EMPRESA_ID}`, mes);
  await fs.ensureDir(carpeta);

  // Guardar archivos
  const xmlBuffer = Buffer.from(xmlAdj.contentBytes, 'base64');
  const xmlPath = path.join(carpeta, xmlAdj.name);
  await fs.writeFile(xmlPath, xmlBuffer);

  let pdfPath = null;
  if (pdfAdj) {
    const pdfBuffer = Buffer.from(pdfAdj.contentBytes, 'base64');
    pdfPath = path.join(carpeta, pdfAdj.name);
    await fs.writeFile(pdfPath, pdfBuffer);
  }

  // Parsear XML
  const xmlText = xmlBuffer.toString('utf-8');
  const datos = parsearXML(xmlText);

  // Registrar en Supabase
  const { data: registro, error } = await supabase
    .from('comprobantes_recibidos')
    .insert({
      empresa_id: EMPRESA_ID,
      tipo: datos.tipo,
      numero_comprobante: datos.numero,
      emisor_nombre: datos.emisorNombre,
      emisor_identificacion: datos.emisorId,
      fecha_emision: datos.fecha,
      total_comprobante: datos.total,
      moneda: datos.moneda,
      archivo_xml: xmlPath,
      archivo_pdf: pdfPath,
      email_mensaje_id: msg.id,
      email_fecha: msg.receivedDateTime,
      email_remitente: msg.from?.emailAddress?.address,
    })
    .select()
    .single();

  if (error) {
    console.error(`❌ Error registrando: ${msg.subject}`, error.message);
  } else {
    console.log(`✅ Registrado: ${datos.emisorNombre || msg.subject} | Total: ${datos.total} ${datos.moneda}`);
    descargados++;
  }
}

console.log(`\n🎉 Descargados: ${descargados} | Duplicados omitidos: ${duplicados}`);

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
    numero: get('NumeroConsecutivo') || get('Clave'),
    emisorNombre: get('NombreEmisor') || get('Nombre'),
    emisorId: get('NumeroEmisor') || get('Numero'),
    fecha: get('FechaEmision')?.slice(0, 10),
    total: parseFloat(get('TotalComprobante') || '0'),
    moneda: get('CodigoMoneda') || 'CRC',
  };
}