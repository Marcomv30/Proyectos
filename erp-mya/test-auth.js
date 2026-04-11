import 'dotenv/config';
import { obtenerTokenDeviceCode } from './services/microsoftAuth.js';

console.log('Iniciando autenticación con Microsoft...');
const token = await obtenerTokenDeviceCode();
console.log('\n✅ Token obtenido exitosamente!');
console.log('Token (primeros 50 chars):', token.substring(0, 50) + '...');