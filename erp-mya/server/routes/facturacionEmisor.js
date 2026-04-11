import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminSb, requirePermission } from '../lib/authz.js';
import { encriptarPassword } from '../services/correoImap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CERT_BASE_DIR = process.env.FE_CERT_DIR || path.resolve(__dirname, '../private/fe-certificados');

function sanitizeFileName(name = '') {
  const base = String(name || '').trim().replace(/[^\w.\-]+/g, '_');
  return base || 'certificado_firma.p12';
}

function parseExt(name = '') {
  const ext = path.extname(String(name || '')).toLowerCase();
  return ext;
}

export async function guardarCertificadoEmisor(req, res) {
  const empresaId = Number(req.body?.empresa_id || 0);
  if (!empresaId) {
    return res.status(400).json({ ok: false, error: 'Empresa invalida.' });
  }

  const ctx = await requirePermission(req, res, empresaId, 'facturacion:editar');
  if (!ctx) return;

  const fileName = sanitizeFileName(String(req.body?.file_name || ''));
  const fileBase64 = String(req.body?.file_base64 || '');
  const pin = String(req.body?.pin || '').trim();
  const password = String(req.body?.password || '').trim();
  const venceEn = String(req.body?.vence_en || '').trim() || null;
  const scope = String(req.body?.scope || 'pruebas').trim().toLowerCase() === 'produccion' ? 'produccion' : 'pruebas';

  if (!fileBase64) {
    return res.status(400).json({ ok: false, error: 'Debe adjuntar el certificado del emisor.' });
  }
  if (!pin) {
    return res.status(400).json({ ok: false, error: 'Debe indicar el PIN del certificado.' });
  }
  if (!password) {
    return res.status(400).json({ ok: false, error: 'Debe indicar la contrasena del certificado.' });
  }

  const ext = parseExt(fileName);
  if (!['.p12', '.pfx'].includes(ext)) {
    return res.status(400).json({ ok: false, error: 'El certificado debe ser .p12 o .pfx.' });
  }

  let buffer;
  try {
    const normalized = fileBase64.includes(',') ? fileBase64.split(',').pop() : fileBase64;
    buffer = Buffer.from(normalized, 'base64');
  } catch {
    return res.status(400).json({ ok: false, error: 'No se pudo leer el archivo del certificado.' });
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ ok: false, error: 'El archivo del certificado esta vacio.' });
  }

  try {
    const empresaDir = path.join(CERT_BASE_DIR, String(empresaId));
    await fs.ensureDir(empresaDir);

    const targetName = scope === 'produccion' ? `certificado_emisor_produccion${ext}` : `certificado_emisor_pruebas${ext}`;
    const absolutePath = path.join(empresaDir, targetName);
    await fs.writeFile(absolutePath, buffer);

    const sb = adminSb();
    const now = new Date().toISOString();
    const payload = scope === 'produccion'
      ? {
          empresa_id: empresaId,
          certificado_nombre_archivo_produccion: fileName,
          certificado_ruta_interna_produccion: absolutePath,
          certificado_password_produccion_encriptada: encriptarPassword(password),
          certificado_pin_produccion_encriptado: encriptarPassword(pin),
          certificado_vence_produccion_en: venceEn,
          certificado_actualizado_produccion_at: now,
          updated_at: now,
        }
      : {
          empresa_id: empresaId,
          certificado_nombre_archivo: fileName,
          certificado_ruta_interna: absolutePath,
          certificado_password_encriptada: encriptarPassword(password),
          certificado_pin_encriptado: encriptarPassword(pin),
          certificado_vence_en: venceEn,
          certificado_actualizado_at: now,
          updated_at: now,
        };

    const { error } = await sb
      .from('fe_config_empresa')
      .upsert(payload, { onConflict: 'empresa_id' });

    if (error) {
      return res.status(500).json({ ok: false, error: error.message || 'No se pudo guardar el certificado del emisor.' });
    }

    return res.json({
      ok: true,
      certificado: {
        nombre_archivo: fileName,
        ruta_interna: absolutePath,
        vence_en: venceEn,
        actualizado_at: scope === 'produccion' ? payload.certificado_actualizado_produccion_at : payload.certificado_actualizado_at,
        scope,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || 'No se pudo guardar el certificado del emisor.'),
    });
  }
}

export async function guardarCredencialesEmisor(req, res) {
  const empresaId = Number(req.body?.empresa_id || 0);
  if (!empresaId) {
    return res.status(400).json({ ok: false, error: 'Empresa invalida.' });
  }

  const ctx = await requirePermission(req, res, empresaId, 'facturacion:editar');
  if (!ctx) return;

  const correoEnvio = String(req.body?.correo_envio || '').trim().toLowerCase();
  const claveAplicacion = String(req.body?.clave_aplicacion || '').trim();
  const keepClaveAplicacion = claveAplicacion === '__KEEP__';
  const stagUsuario = String(req.body?.stag_usuario || '').trim();
  const stagPassword = String(req.body?.stag_password || '').trim();
  const stagUsuarioProduccion = String(req.body?.stag_usuario_produccion || '').trim();
  const stagPasswordProduccion = String(req.body?.stag_password_produccion || '').trim();

  if (!correoEnvio) {
    return res.status(400).json({ ok: false, error: 'Debe indicar el correo de envio.' });
  }
  if (!claveAplicacion && !keepClaveAplicacion) {
    return res.status(400).json({ ok: false, error: 'Debe indicar la clave de aplicacion.' });
  }
  if (!stagUsuario) {
    return res.status(400).json({ ok: false, error: 'Debe indicar el usuario STAG.' });
  }
  if (!stagPassword) {
    return res.status(400).json({ ok: false, error: 'Debe indicar la contrasena STAG.' });
  }
  if ((stagUsuarioProduccion && !stagPasswordProduccion) || (!stagUsuarioProduccion && stagPasswordProduccion)) {
    return res.status(400).json({ ok: false, error: 'Las credenciales STAG de produccion deben completarse juntas.' });
  }

  try {
    const sb = adminSb();
    const payload = {
      empresa_id: empresaId,
      correo_envio: correoEnvio,
      stag_usuario: stagUsuario,
      stag_password_encriptada: encriptarPassword(stagPassword),
      stag_usuario_produccion: stagUsuarioProduccion || null,
      stag_password_produccion_encriptada: stagPasswordProduccion ? encriptarPassword(stagPasswordProduccion) : null,
      updated_at: new Date().toISOString(),
    };
    if (!keepClaveAplicacion) {
      payload.clave_aplicacion_encriptada = encriptarPassword(claveAplicacion);
    }

    const { error } = await sb
      .from('fe_config_empresa')
      .upsert(payload, { onConflict: 'empresa_id' });

    if (error) {
      return res.status(500).json({ ok: false, error: error.message || 'No se pudieron guardar las credenciales del emisor.' });
    }

    return res.json({
      ok: true,
      credenciales: {
        correo_envio: correoEnvio,
        tiene_clave_aplicacion: true,
        stag_usuario: stagUsuario,
        tiene_stag_password: true,
        stag_usuario_produccion: stagUsuarioProduccion || null,
        tiene_stag_password_produccion: Boolean(stagPasswordProduccion),
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || 'No se pudieron guardar las credenciales del emisor.'),
    });
  }
}
