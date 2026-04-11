import { createClient } from '@supabase/supabase-js';

export function adminSb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getModulosEfectivosEmpresa(sb, empresa_id) {
  const { data: overrideRows } = await sb
    .from('empresa_modulos')
    .select('modulo_id')
    .eq('empresa_id', empresa_id);

  if (overrideRows?.length) {
    return overrideRows.map((r) => Number(r.modulo_id));
  }

  const { data: empresaData } = await sb
    .from('empresas')
    .select('actividad_id')
    .eq('id', empresa_id)
    .maybeSingle();

  if (!empresaData?.actividad_id) return [];

  const { data: actRows } = await sb
    .from('actividad_modulos')
    .select('modulo_id')
    .eq('actividad_id', empresaData.actividad_id);

  return (actRows || []).map((r) => Number(r.modulo_id));
}

export async function getRequestUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'No autorizado', status: 401 };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { error: 'Token requerido', status: 401 };
  }

  const sb = adminSb();
  const { data: authData, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    return { error: 'Token invalido o vencido', status: 401 };
  }

  const { data: usuario, error: userErr } = await sb
    .from('usuarios')
    .select('id, username, nombre, email, auth_user_id, es_superusuario, activo')
    .eq('auth_user_id', authData.user.id)
    .eq('activo', true)
    .maybeSingle();

  if (userErr || !usuario?.id) {
    return { error: 'Usuario no encontrado o inactivo', status: 401 };
  }

  return { sb, token, authUser: authData.user, usuario };
}

export async function getPermissionsForUser(sb, usuario, empresa_id) {
  if (usuario.es_superusuario) {
    const modulosEmpresa = await getModulosEfectivosEmpresa(sb, empresa_id);
    const { data } = await sb
      .from('permisos')
      .select('accion, modulos(id, codigo)');

    return [...new Set(
      (data || [])
        .filter((p) => p.modulos?.codigo)
        .filter((p) => {
          const codigo = String(p.modulos.codigo || '').toLowerCase();
          // mantenimientos siempre disponible para superusuario (gestión del sistema)
          if (codigo === 'mantenimientos') return true;
          // Si la empresa no tiene módulos configurados, solo mantenimientos
          if (!modulosEmpresa.length) return false;
          return modulosEmpresa.includes(Number(p.modulos.id));
        })
        .map((p) => `${p.modulos.codigo.toLowerCase()}:${p.accion.toLowerCase()}`)
    )];
  }

  const { data: ue } = await sb
    .from('usuarios_empresas')
    .select('rol_id')
    .eq('usuario_id', usuario.id)
    .eq('empresa_id', empresa_id)
    .eq('activo', true)
    .maybeSingle();

  if (!ue?.rol_id) return [];

  const modulosEmpresa = await getModulosEfectivosEmpresa(sb, empresa_id);
  const { data: rpRows } = await sb
    .from('roles_permisos')
    .select('permisos(accion, modulos(id, codigo))')
    .eq('rol_id', ue.rol_id);

  return [...new Set(
    (rpRows || [])
      .filter((rp) => rp.permisos?.modulos?.codigo)
      .filter((rp) => modulosEmpresa.length > 0 && modulosEmpresa.includes(Number(rp.permisos.modulos.id)))
      .map((rp) => `${rp.permisos.modulos.codigo.toLowerCase()}:${rp.permisos.accion.toLowerCase()}`)
  )];
}

export async function requirePermission(req, res, empresa_id, requiredPermission) {
  const ctx = await getRequestUser(req);
  if (ctx.error) {
    res.status(ctx.status || 401).json({ ok: false, error: ctx.error });
    return null;
  }

  if (ctx.usuario.es_superusuario) return ctx;

  const permissions = await getPermissionsForUser(ctx.sb, ctx.usuario, empresa_id);
  if (!permissions.includes(requiredPermission)) {
    res.status(403).json({ ok: false, error: 'Permiso insuficiente' });
    return null;
  }

  return { ...ctx, permissions };
}

export async function requireSuperuser(req, res) {
  const ctx = await getRequestUser(req);
  if (ctx.error) {
    res.status(ctx.status || 401).json({ ok: false, error: ctx.error });
    return null;
  }

  if (!ctx.usuario.es_superusuario) {
    res.status(403).json({ ok: false, error: 'Permiso insuficiente' });
    return null;
  }

  return ctx;
}
