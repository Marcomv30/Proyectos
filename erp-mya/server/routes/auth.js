// ─── Autenticación local — reemplaza Supabase Edge Functions ─────────────────
// POST /api/auth/login
// GET  /api/auth/permisos?empresa_id=X
import { adminSb, getRequestUser, getPermissionsForUser, getModulosEfectivosEmpresa as getEmpresaModules } from '../lib/authz.js';
import { manager } from '../services/fusionSync.js';
import { startPumpMonitor, stopPumpMonitor } from '../services/pumpStatus.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_AUTH_TIMEOUT_MS = 8000;

// Devuelve los modulo_ids efectivos para una empresa (override > actividad > vacío)
async function getModulosEfectivosEmpresa(sb, empresa_id) {
  return getEmpresaModules(sb, empresa_id);
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export async function authLogin(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ ok: false, message: 'Usuario y contraseña requeridos' });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({
      ok: false,
      message: 'El servidor de autenticación no está configurado correctamente.',
    });
  }

  const sb         = adminSb();
  const usernameKey = username.trim().toLowerCase();

  // 1. Verificar bloqueo por intentos fallidos
  console.log('[DEBUG login] paso 1: check_login_allowed');
  const { data: permitido } = await sb
    .rpc('check_login_allowed', { p_username: usernameKey });
  console.log('[DEBUG login] paso 1 OK, permitido=', permitido);
  if (permitido === false) {
    return res.status(429).json({
      ok: false,
      message: 'Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intente en 15 minutos.',
    });
  }

  const registrar = (exito) => sb.rpc('register_login_attempt', {
    p_username:   usernameKey,
    p_success:    exito,
    p_user_agent: req.headers['user-agent'] || '',
  });

  // 2. Buscar usuario activo por username
  console.log('[DEBUG login] paso 2: buscar usuario');
  const { data: usuario, error: uErr } = await sb
    .from('usuarios')
    .select('id, username, nombre, email, activo, auth_user_id, es_superusuario')
    .ilike('username', username.trim())
    .eq('activo', true)
    .maybeSingle();
  console.log('[DEBUG login] paso 2 OK, usuario=', usuario?.username, 'err=', uErr?.message);

  if (uErr || !usuario?.email) {
    await registrar(false);
    return res.status(401).json({ ok: false, message: 'Usuario o contraseña incorrectos' });
  }

  // 3. Validar contraseña via Supabase JS client (compatible con keys sb_secret_ y ES256)
  console.log('[DEBUG login] paso 3: signInWithPassword');
  const signInPromise = sb.auth.signInWithPassword({ email: usuario.email, password });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AbortError')), SUPABASE_AUTH_TIMEOUT_MS)
  );

  let signInResult;
  try {
    signInResult = await Promise.race([signInPromise, timeoutPromise]);
  } catch (err) {
    console.error('[DEBUG login] paso 3 ERROR:', err.message);
    return res.status(err.message === 'AbortError' ? 504 : 503).json({
      ok: false,
      message: err.message === 'AbortError'
        ? 'Tiempo de espera agotado al conectar con Supabase. Verifique internet, DNS o firewall.'
        : 'No se pudo conectar con Supabase. Verifique internet, DNS o firewall.',
    });
  }

  const { data: signInData, error: signInError } = signInResult;
  console.log('[DEBUG login] paso 3 OK, error=', signInError?.message);
  if (signInError || !signInData?.session) {
    await registrar(false);
    return res.status(401).json({ ok: false, message: 'Usuario o contraseña incorrectos' });
  }

  const authData = signInData.session;
  console.log('[DEBUG login] paso 3 json OK');
  await registrar(true);
  console.log('[DEBUG login] paso 4: registrar OK');

  // 4. Empresas autorizadas y roles
  console.log('[DEBUG login] paso 5: empresas');
  const { data: relEmpresas } = await sb
    .from('usuarios_empresas')
    .select('empresa_id, rol_id')
    .eq('usuario_id', usuario.id)
    .eq('activo', true);

  const rolesResp = await sb.from('roles').select('id, nombre');
  const rolesData = rolesResp.data;
  const rolesMap  = Object.fromEntries((rolesData || []).map(r => [r.id, r.nombre]));

  let empresasAutorizadas = [];
  const rolesPorEmpresa = {};

  if (usuario.es_superusuario) {
    // Superusuario: acceso a todas las empresas activas del sistema
    const { data: todasEmpresas } = await sb
      .from('empresas')
      .select('id, codigo, cedula, nombre, activo')
      .eq('activo', true)
      .order('codigo');
    empresasAutorizadas = todasEmpresas || [];
    // Rol "Super Usuario" en todas las empresas
    (todasEmpresas || []).forEach(e => { rolesPorEmpresa[e.id] = 'Super Usuario'; });
  } else {
    // Usuario normal: solo sus empresas asignadas
    const empresaIds = (relEmpresas || []).map(r => r.empresa_id).filter(Boolean);
    const { data: empresasData } = await sb
      .from('empresas')
      .select('id, codigo, cedula, nombre, activo')
      .in('id', empresaIds.length ? empresaIds : [0]);
    const empresasMap = Object.fromEntries((empresasData || []).map(e => [e.id, e]));
    empresasAutorizadas = empresaIds.map(id => empresasMap[id]).filter(Boolean);
    (relEmpresas || []).forEach(r => {
      if (r.empresa_id) rolesPorEmpresa[r.empresa_id] = rolesMap[r.rol_id] || '';
    });
  }

  // 5. Filtrar empresas por módulo si el cliente lo solicita (ej: empacadora)
  const moduloCodigo = req.body?.modulo_codigo;
  if (moduloCodigo && empresasAutorizadas.length > 0) {
    const { data: modulo } = await sb
      .from('modulos')
      .select('id')
      .ilike('codigo', moduloCodigo)
      .maybeSingle();

    if (modulo) {
      // Filtrar por modulos efectivos de la empresa (override > actividad).
      // Esto mantiene coherencia con authPermisos y evita dejar fuera empresas
      // que heredan el modulo desde su actividad economica.
      const checks = await Promise.all(
        empresasAutorizadas.map(async (empresa) => {
          const modulosEmpresa = await getModulosEfectivosEmpresa(sb, empresa.id);
          return {
            empresa,
            tieneModulo: modulosEmpresa.includes(Number(modulo.id)),
          };
        })
      );
      empresasAutorizadas = checks.filter((item) => item.tieneModulo).map((item) => item.empresa);
    }
  }

  return res.json({
    ok: true,
    usuario: {
      id:              usuario.id,
      username:        usuario.username,
      nombre:          usuario.nombre,
      email:           usuario.email,
      es_superusuario: usuario.es_superusuario || false,
    },
    session: {
      access_token:  authData.access_token,
      refresh_token: authData.refresh_token,
    },
    empresas_autorizadas: empresasAutorizadas,
    roles_por_empresa:    rolesPorEmpresa,
  });
}

// ─── GET /api/auth/permisos?empresa_id=X ─────────────────────────────────────
// No usa auth.uid() — decodifica el JWT en el servidor y consulta directamente
export async function authPermisos(req, res) {
  const empresa_id = Number(req.query.empresa_id);
  if (!empresa_id) return res.status(400).json({ ok: false, error: 'empresa_id requerido' });

  const ctx = await getRequestUser(req);
  if (ctx.error) return res.status(ctx.status || 401).json({ ok: false, error: ctx.error });
  const { sb, usuario } = ctx;

  let rows = [];

  if (usuario.es_superusuario) {
    // Superusuario: todos los permisos, pero respetando la jerarquia
    // de modulos efectiva de la empresa (override > actividad).
    const modulosEmpresa = await getModulosEfectivosEmpresa(sb, empresa_id);
    const { data } = await sb
      .from('permisos')
      .select('accion, modulos(id, codigo)');
    rows = (data || [])
      .filter(p => p.modulos?.codigo)
      .filter((p) => {
        const codigo = String(p.modulos.codigo || '').toLowerCase();
        if (codigo === 'mantenimientos') return true;
        if (!modulosEmpresa.length) return false;
        return modulosEmpresa.includes(Number(p.modulos.id));
      })
      .map(p => `${p.modulos.codigo.toLowerCase()}:${p.accion.toLowerCase()}`);
  } else {
    // 1. Obtener rol_id del usuario en esta empresa
    const { data: ue } = await sb
      .from('usuarios_empresas')
      .select('rol_id')
      .eq('usuario_id', usuario.id)
      .eq('empresa_id', empresa_id)
      .eq('activo', true)
      .maybeSingle();

    if (!ue?.rol_id) {
      return res.json({ ok: true, permissions: [] });
    }

    // 2. Obtener módulos efectivos de la empresa (override > actividad)
    const modulosEmpresa = await getModulosEfectivosEmpresa(sb, empresa_id);

    // 3. Permisos del rol filtrados por módulos habilitados en la empresa
    const { data: rpRows } = await sb
      .from('roles_permisos')
      .select('permisos(accion, modulos(id, codigo))')
      .eq('rol_id', ue.rol_id);

    rows = (rpRows || [])
      .filter(rp => rp.permisos?.modulos?.codigo)
      .filter(rp => modulosEmpresa.length > 0 && modulosEmpresa.includes(Number(rp.permisos.modulos.id)))
      .map(rp => `${rp.permisos.modulos.codigo.toLowerCase()}:${rp.permisos.accion.toLowerCase()}`);
  }

  const normalized = [...new Set(rows)].filter(Boolean);
  return res.json({ ok: true, permissions: normalized });
}

// ─── POST /api/auth/select-empresa ───────────────────────────────────────────
// Valida que el usuario tenga acceso a la empresa solicitada.
// NO modifica tokens ni app_metadata — evita revocar sesiones activas del ERP.
export async function authSelectEmpresa(req, res) {
  const { access_token, empresa_id } = req.body || {};
  if (!access_token || !empresa_id)
    return res.status(400).json({ ok: false, message: 'access_token y empresa_id requeridos' });

  const sb = adminSb();

  // Verificar que el access_token sea válido
  const { data: authData, error: authErr } = await sb.auth.getUser(access_token);
  if (authErr || !authData?.user?.id)
    return res.status(401).json({ ok: false, message: 'Token inválido o expirado' });

  // Buscar usuario en nuestro sistema
  const { data: usuario } = await sb
    .from('usuarios')
    .select('id, es_superusuario')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (!usuario)
    return res.status(401).json({ ok: false, message: 'Usuario no encontrado' });

  // Verificar acceso a la empresa (superusuario tiene acceso a todas)
  if (!usuario.es_superusuario) {
    const { data: autorizado } = await sb
      .from('usuarios_empresas')
      .select('empresa_id')
      .eq('usuario_id', usuario.id)
      .eq('empresa_id', Number(empresa_id))
      .eq('activo', true)
      .maybeSingle();
    if (!autorizado)
      return res.status(403).json({ ok: false, message: 'Sin acceso a esta empresa' });
  }

  try {
    const empresaIdNum = Number(empresa_id);
    const { data: moduloComb } = await sb
      .from('modulos')
      .select('id')
      .eq('codigo', 'combustible')
      .maybeSingle();

    const modulosEmpresa = await getModulosEfectivosEmpresa(sb, empresaIdNum);
    const tieneCombustible = !!moduloComb?.id && modulosEmpresa.includes(Number(moduloComb.id));

    manager.stopAll();
    stopPumpMonitor();

    if (tieneCombustible) {
      const { data: cfg } = await sb
        .from('fusion_config')
        .select('*')
        .eq('empresa_id', empresaIdNum)
        .eq('activo', true)
        .maybeSingle();

      if (cfg) {
        await manager.startInstance(cfg);
        startPumpMonitor();
      }
    }
  } catch (err) {
    console.warn('[authSelectEmpresa] No se pudo sincronizar Fusion con la empresa activa:', err?.message || err);
  }

  return res.json({ ok: true, empresa_id: Number(empresa_id) });
}

// ─── PUT /api/auth/update-user/:id ───────────────────────────────────────────
export async function authUpdateUser(req, res) {
  const usuario_id = Number(req.params.id);
  if (!usuario_id) return res.status(400).json({ ok: false, error: 'id requerido' });

  const { username, nombre, email, activo, es_superusuario } = req.body || {};
  if (!username || !nombre || !email)
    return res.status(400).json({ ok: false, error: 'username, nombre y email requeridos' });

  const ctx = await getRequestUser(req);
  if (ctx.error) return res.status(ctx.status || 401).json({ ok: false, error: ctx.error });
  const empresa_id = Number(req.query.empresa_id || req.body?.empresa_id || 0);
  const permissions = empresa_id ? await getPermissionsForUser(ctx.sb, ctx.usuario, empresa_id) : [];
  if (!ctx.usuario.es_superusuario && !permissions.includes('mantenimientos:aprobar')) {
    return res.status(403).json({ ok: false, error: 'Permiso insuficiente' });
  }
  const sb = ctx.sb;

  const { error } = await sb.from('usuarios').update({
    username, nombre, email, activo: activo ?? true,
  }).eq('id', usuario_id);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  if (typeof es_superusuario === 'boolean') {
    await sb.from('usuarios').update({ es_superusuario }).eq('id', usuario_id);
  }

  return res.json({ ok: true });
}

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
export async function authResetPassword(req, res) {
  const { usuario_id, password } = req.body || {};
  if (!usuario_id || !password)
    return res.status(400).json({ ok: false, error: 'usuario_id y password requeridos' });
  if (password.length < 6)
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener mínimo 6 caracteres' });

  const ctx = await getRequestUser(req);
  if (ctx.error) return res.status(ctx.status || 401).json({ ok: false, error: ctx.error });
  const empresa_id = Number(req.query.empresa_id || req.body?.empresa_id || 0);
  const permissions = empresa_id ? await getPermissionsForUser(ctx.sb, ctx.usuario, empresa_id) : [];
  if (!ctx.usuario.es_superusuario && !permissions.includes('mantenimientos:aprobar')) {
    return res.status(403).json({ ok: false, error: 'Permiso insuficiente' });
  }
  const sb = ctx.sb;

  // Obtener auth_user_id del usuario a resetear
  const { data: usuario, error: uErr } = await sb
    .from('usuarios')
    .select('auth_user_id, username')
    .eq('id', usuario_id)
    .maybeSingle();

  if (uErr || !usuario?.auth_user_id)
    return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

  // Actualizar contraseña via Supabase Auth Admin REST API
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${usuario.auth_user_id}`, {
    method: 'PUT',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ password }),
  }).catch(() => null);

  if (!resp?.ok) {
    const msg = await resp?.json().catch(() => ({}));
    return res.status(500).json({ ok: false, error: msg?.message || 'Error al actualizar contraseña' });
  }

  return res.json({ ok: true, username: usuario.username });
}
