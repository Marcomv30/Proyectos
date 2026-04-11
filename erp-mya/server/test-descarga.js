import 'dotenv/config';
import { obtenerTokenDeviceCode } from './services/microsoftAuth.js';
import fs from 'fs-extra';
import path from 'path';

const BASE_DIR = process.env.COMPROBANTES_DIR || 'C:/MYA/comprobantes';

console.log('Obteniendo token...');
const token = await obtenerTokenDeviceCode();
const headers = { Authorization: `Bearer ${token}` };

// Buscar correos últimos 30 días
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

for (const msg of messages) {
  const attachRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/attachments`,
    { headers }
  );
  const { value: attachments } = await attachRes.json();

  const xmlAdj = attachments.find(a => a.name?.toLowerCase().endsWith('.xml'));
  const pdfAdj = attachments.find(a => a.name?.toLowerCase().endsWith('.pdf'));

  if (!xmlAdj) continue;

  // Crear carpeta por mes
  const mes = msg.receivedDateTime.slice(0, 7);
  const carpeta = path.join(BASE_DIR, 'empresa_1', mes);
  await fs.ensureDir(carpeta);

  // Guardar XML
  const xmlBuffer = Buffer.from(xmlAdj.contentBytes, 'base64');
  await fs.writeFile(path.join(carpeta, xmlAdj.name), xmlBuffer);
  console.log(`✅ XML: ${xmlAdj.name}`);

  // Guardar PDF
  if (pdfAdj) {
    const pdfBuffer = Buffer.from(pdfAdj.contentBytes, 'base64');
    await fs.writeFile(path.join(carpeta, pdfAdj.name), pdfBuffer);
    console.log(`✅ PDF: ${pdfAdj.name}`);
  }

  descargados++;
}

console.log(`\n🎉 Total descargados: ${descargados} comprobantes en ${BASE_DIR}`);