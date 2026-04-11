/**
 * feMh.js — Comunicación con el API del Ministerio de Hacienda (ATV)
 * Endpoints:
 *   Pruebas:    https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1
 *   Producción: https://api.comprobanteselectronicos.go.cr/recepcion/v1
 */
import axios from 'axios';

const ENDPOINTS = {
  pruebas:    'https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1',
  produccion: 'https://api.comprobanteselectronicos.go.cr/recepcion/v1',
};

const TOKEN_ENDPOINTS = {
  pruebas:    'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token',
  produccion: 'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token',
};

// Cache de tokens en memoria por ambiente+usuario
const tokenCache = new Map();

/**
 * Obtiene token de acceso del IDP de Hacienda.
 * Cachea hasta 5 min antes del vencimiento.
 */
export async function obtenerToken(usuario, password, ambiente = 'pruebas') {
  const cacheKey = `${ambiente}:${usuario}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.token;

  const url = TOKEN_ENDPOINTS[ambiente] || TOKEN_ENDPOINTS.pruebas;
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id:  'api-stag',
    username:   usuario,
    password:   password,
  });

  const resp = await axios.post(url, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  const { access_token, expires_in } = resp.data;
  if (!access_token) throw new Error('No se recibió access_token del IDP Hacienda');

  // Guardar con 5 min de margen
  tokenCache.set(cacheKey, {
    token:   access_token,
    expires: Date.now() + (Number(expires_in || 300) - 300) * 1000,
  });

  return access_token;
}

/**
 * Envía el documento XML firmado al receptor de Hacienda.
 * @param {string} token      — access_token
 * @param {string} ambiente   — 'pruebas' | 'produccion'
 * @param {string} clave      — 50 dígitos
 * @param {string} fecha      — ISO 8601 (fecha emisión)
 * @param {object} emisor     — { tipo_identificacion, numero_identificacion }
 * @param {object} receptor   — { tipo_identificacion, numero_identificacion } | null
 * @param {string} xmlFirmado — XML firmado en texto
 * @returns {object} respuesta Hacienda
 */
export async function enviarDocumento({ token, ambiente, clave, fecha, emisor, receptor, xmlFirmado }) {
  const base = ENDPOINTS[ambiente] || ENDPOINTS.pruebas;
  const url  = `${base}/recepcion`;

  const xmlBase64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');

  const payload = {
    clave,
    fecha,
    emisor: {
      tipoIdentificacion: emisor.tipo_identificacion || '02',
      numeroIdentificacion: (emisor.numero_identificacion || '').replace(/\D/g, ''),
    },
    receptor: receptor?.numero_identificacion ? {
      tipoIdentificacion: receptor.tipo_identificacion || '02',
      numeroIdentificacion: (receptor.numero_identificacion || '').replace(/\D/g, ''),
    } : undefined,
    comprobanteXml: xmlBase64,
  };

  const resp = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
    validateStatus: (s) => s < 600,
  });

  return { status: resp.status, data: resp.data };
}

/**
 * Consulta el estado de un documento enviado.
 */
export async function consultarEstado({ token, ambiente, clave }) {
  const base = ENDPOINTS[ambiente] || ENDPOINTS.pruebas;
  const url  = `${base}/recepcion/${clave}`;

  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
    validateStatus: (s) => s < 600,
  });

  return { status: resp.status, data: resp.data };
}
