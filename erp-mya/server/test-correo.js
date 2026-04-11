import 'dotenv/config';
import { obtenerTokenDeviceCode } from './services/microsoftAuth.js';

console.log('Obteniendo token...');
const token = await obtenerTokenDeviceCode();

console.log('Consultando correos con adjuntos...');
const fecha = new Date();
fecha.setDate(fecha.getDate() - 30);
const fechaISO = fecha.toISOString();

const res = await fetch(
  `https://graph.microsoft.com/v1.0/me/messages?` +
  `$filter=hasAttachments eq true and receivedDateTime ge ${fechaISO}` +
  `&$select=id,subject,from,receivedDateTime` +
  `&$top=10`,
  { headers: { Authorization: `Bearer ${token}` } }
);

const data = await res.json();
console.log(`\n✅ Correos con adjuntos encontrados: ${data.value?.length || 0}`);
data.value?.forEach(m => {
  console.log(`- ${m.receivedDateTime.slice(0,10)} | ${m.from?.emailAddress?.address} | ${m.subject}`);
});