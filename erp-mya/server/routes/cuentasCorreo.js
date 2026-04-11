import { createClient } from '@supabase/supabase-js';
import { encriptarPassword, desencriptarPassword, probarConexion, descargarViaImap } from '../services/correoImap.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// GET /api/cuentas-correo?empresa_id=1
export async function listar(req, res) {
  const { empresa_id } = req.query;
  const { data, error } = await supabase
    .from('correo_cuentas')
    .select('id, nombre, tipo, email, activo, ultima_descarga, imap_host, imap_port, imap_tls')
    .eq('empresa_id', empresa_id)
    .order('nombre');
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, cuentas: data });
}

// POST /api/cuentas-correo
export async function crear(req, res) {
  const { empresa_id, nombre, tipo, email, password, imap_host, imap_port, imap_tls } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email y contraseña requeridos' });

  const password_encriptado = encriptarPassword(password);

  const { data, error } = await supabase
    .from('correo_cuentas')
    .insert({ empresa_id, nombre, tipo, email, password_encriptado, imap_host, imap_port, imap_tls })
    .select('id, nombre, tipo, email, activo')
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, cuenta: data });
}

// PUT /api/cuentas-correo/:id
export async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, tipo, email, password, imap_host, imap_port, imap_tls, activo } = req.body;

  const updates = { nombre, tipo, email, imap_host, imap_port, imap_tls, activo };
  if (password) updates.password_encriptado = encriptarPassword(password);

  const { data, error } = await supabase
    .from('correo_cuentas')
    .update(updates)
    .eq('id', id)
    .select('id, nombre, tipo, email, activo')
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, cuenta: data });
}

// DELETE /api/cuentas-correo/:id
export async function eliminar(req, res) {
  const { id } = req.params;
  const { error } = await supabase.from('correo_cuentas').delete().eq('id', id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
}

// POST /api/cuentas-correo/:id/probar
export async function probar(req, res) {
  const { id } = req.params;
  const { data: cuenta, error } = await supabase
    .from('correo_cuentas')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !cuenta) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

  console.log('Llamando probarConexion para:', cuenta.email, cuenta.tipo);
  const resultado = await probarConexion(cuenta);
  res.json(resultado);
}

// GET /api/cuentas-correo/:id/descargar-sse
export async function descargarSSE(req, res) {
  const { id } = req.params;
  const { fecha_desde, fecha_hasta } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const enviar = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { data: cuenta, error } = await supabase
      .from('correo_cuentas')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !cuenta) {
      enviar({ tipo: 'error', mensaje: 'Cuenta no encontrada' });
      return res.end();
    }

    enviar({ tipo: 'estado', mensaje: `Conectando a ${cuenta.email}...` });

    const resultado = await descargarViaImap(cuenta, fecha_desde, fecha_hasta, enviar);

    // Actualizar ultima_descarga
    await supabase.from('correo_cuentas')
      .update({ ultima_descarga: new Date().toISOString() })
      .eq('id', id);

    enviar({ tipo: 'fin', ...resultado });
    res.end();

  } catch (error) {
    enviar({ tipo: 'error', mensaje: error.message });
    res.end();
  }
}