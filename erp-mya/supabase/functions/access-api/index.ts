import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set(
  String(Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
);

const getCorsHeaders = (origin: string | null) => {
  const reqOrigin = String(origin ?? "").trim();
  const isAllowed = reqOrigin !== "" && allowedOrigins.has(reqOrigin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? reqOrigin : Array.from(allowedOrigins)[0] ?? "http://localhost:3000",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
};

const json = (status: number, data: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });

type AccessRow = {
  modulo_codigo: string;
  accion: string;
};

type EmpresaAuthRow = {
  id: number;
  codigo: string;
  cedula?: string;
  nombre: string;
};

function normalizePath(pathname: string): string {
  const marker = "/access-api";
  const idx = pathname.indexOf(marker);
  if (idx === -1) return "/";
  const after = pathname.slice(idx + marker.length);
  return after === "" ? "/" : after;
}

async function registrarIntento(
  supabase: ReturnType<typeof createClient>,
  username: string,
  success: boolean,
  userAgent?: string | null,
) {
  await supabase.rpc("register_login_attempt", {
    p_username: username,
    p_success: success,
    p_user_agent: userAgent ?? null,
  });
}

async function resolverEmpresasAutorizadas(args: {
  supabase: ReturnType<typeof createClient>;
  usuarioId: number;
  isSuper: boolean;
}): Promise<{ empresas: EmpresaAuthRow[]; rolesPorEmpresa: Record<number, string> }> {
  const { supabase, usuarioId, isSuper } = args;
  const rolesPorEmpresa: Record<number, string> = {};

  const { data: empresasData } = await supabase
    .from("empresas")
    .select("id,codigo,cedula,nombre")
    .eq("activo", true)
    .order("codigo");

  const empresasActivas = (empresasData || []) as EmpresaAuthRow[];
  if (isSuper) {
    empresasActivas.forEach((emp) => {
      rolesPorEmpresa[emp.id] = "Super Usuario";
    });
    return { empresas: empresasActivas, rolesPorEmpresa };
  }

  const { data: ueRows } = await supabase
    .from("usuarios_empresas")
    .select("empresa_id, roles:rol_id(nombre)")
    .eq("usuario_id", usuarioId)
    .eq("activo", true);

  const empresaIds = new Set<number>((ueRows || []).map((r: any) => Number(r?.empresa_id)).filter(Boolean));
  (ueRows || []).forEach((r: any) => {
    if (r?.empresa_id) {
      rolesPorEmpresa[Number(r.empresa_id)] = String(r?.roles?.nombre || "Sin rol");
    }
  });

  return {
    empresas: empresasActivas.filter((emp) => empresaIds.has(emp.id)),
    rolesPorEmpresa,
  };
}

async function buildAccessSnapshot(args: {
  supabase: ReturnType<typeof createClient>;
  empresaId: number;
  authUid: string;
}) {
  const { supabase, empresaId, authUid } = args;

  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios")
    .select("id, username, nombre, es_superusuario, activo")
    .eq("auth_user_id", authUid)
    .eq("activo", true)
    .maybeSingle();

  if (usuarioError || !usuario) {
    return { ok: false, status: 403, error: { ok: false, error: "usuario_not_active" } } as const;
  }

  const isSuper = Boolean((usuario as Record<string, unknown>).es_superusuario);
  let rolNombre = "Sin rol";
  if (isSuper) {
    rolNombre = "Super Usuario";
  } else {
    const { data: ue, error: ueError } = await supabase
      .from("usuarios_empresas")
      .select("roles:rol_id(nombre)")
      .eq("usuario_id", usuario.id)
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .maybeSingle();

    if (ueError || !ue) {
      return { ok: false, status: 403, error: { ok: false, error: "empresa_not_allowed" } } as const;
    }
    rolNombre = String((ue as Record<string, unknown>)?.roles?.nombre ?? "Sin rol");
  }

  const { data: permisosRaw, error: permisosError } = await supabase.rpc("get_effective_permissions", {
    p_empresa_id: empresaId,
  });

  if (permisosError) {
    return {
      ok: false,
      status: 500,
      error: { ok: false, error: "permissions_load_failed", detail: permisosError.message },
    } as const;
  }

  const permissions = Array.from(
    new Set(
      ((permisosRaw ?? []) as AccessRow[])
        .map((row) => `${String(row.modulo_codigo || "").toLowerCase()}:${String(row.accion || "").toLowerCase()}`)
        .filter((x) => x.includes(":") && x !== ":"),
    ),
  );

  const permissionMap: Record<string, Record<string, boolean>> = {};
  for (const item of permissions) {
    const [modulo, accion] = item.split(":");
    if (!permissionMap[modulo]) permissionMap[modulo] = {};
    permissionMap[modulo][accion] = true;
  }

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, codigo, nombre")
    .eq("id", empresaId)
    .maybeSingle();

  return {
    ok: true,
    data: {
      empresaId,
      empresa: (empresa as { id: number; codigo: string; nombre: string } | null) ?? null,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        nombre: usuario.nombre,
        es_superusuario: isSuper,
      },
      rolNombre,
      permissions,
      permissionMap,
    },
  } as const;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const reqOrigin = String(origin ?? "").trim();
  if (reqOrigin && !allowedOrigins.has(reqOrigin)) {
    return json(403, { ok: false, error: "origin_not_allowed" }, origin);
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: getCorsHeaders(origin) });
  }

  const url = new URL(req.url);
  const path = normalizePath(url.pathname);
  const isGetAccess = req.method === "GET" && (path === "/" || path === "/me/access");
  const isGetMenu = req.method === "GET" && path === "/me/menu";
  const isSwitchCompany = req.method === "POST" && path === "/auth/switch-company";
  const isLogin = req.method === "POST" && path === "/auth/login";

  if (!isGetAccess && !isGetMenu && !isSwitchCompany && !isLogin) {
    return json(404, { ok: false, error: "not_found" }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { ok: false, error: "missing_supabase_env" }, origin);
  }

  if (isLogin) {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");
    if (!username || !password) {
      return json(400, { ok: false, error: "username_password_required" }, origin);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data: lockMsg } = await supabase.rpc("check_login_allowed", { p_username: username });
    if (lockMsg) {
      return json(423, { ok: false, error: "login_locked", message: String(lockMsg) }, origin);
    }

    const { data: usuario, error: errUsuario, count } = await supabase
      .from("usuarios")
      .select("id, username, nombre, email, auth_user_id, es_superusuario, activo", { count: "exact" })
      .ilike("username", username)
      .eq("activo", true)
      .maybeSingle();

    if (errUsuario) {
      await registrarIntento(supabase, username, false, req.headers.get("user-agent"));
      return json(500, { ok: false, error: "usuario_validation_failed" }, origin);
    }

    if ((count ?? 0) > 1) {
      await registrarIntento(supabase, username, false, req.headers.get("user-agent"));
      return json(409, { ok: false, error: "duplicated_username" }, origin);
    }

    if (!usuario) {
      await registrarIntento(supabase, username, false, req.headers.get("user-agent"));
      return json(401, { ok: false, error: "invalid_credentials" }, origin);
    }

    if (!usuario.email) {
      return json(400, { ok: false, error: "usuario_without_email" }, origin);
    }

    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: usuario.email,
      password,
    });

    if (authErr || !authData.user || !authData.session) {
      await registrarIntento(supabase, username, false, req.headers.get("user-agent"));
      return json(401, { ok: false, error: "invalid_credentials" }, origin);
    }

    if (usuario.auth_user_id && usuario.auth_user_id !== authData.user.id) {
      await registrarIntento(supabase, username, false, req.headers.get("user-agent"));
      await supabase.auth.signOut();
      return json(409, { ok: false, error: "auth_user_mismatch" }, origin);
    }

    if (!usuario.auth_user_id) {
      await supabase
        .from("usuarios")
        .update({ auth_user_id: authData.user.id })
        .eq("id", usuario.id);
    }

    const isSuper = Boolean(usuario.es_superusuario);
    const { empresas, rolesPorEmpresa } = await resolverEmpresasAutorizadas({
      supabase,
      usuarioId: usuario.id,
      isSuper,
    });

    if (empresas.length === 0) {
      await registrarIntento(supabase, username, false, req.headers.get("user-agent"));
      await supabase.auth.signOut();
      return json(403, { ok: false, error: "no_active_companies" }, origin);
    }

    await registrarIntento(supabase, username, true, req.headers.get("user-agent"));

    return json(200, {
      ok: true,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        nombre: usuario.nombre,
        es_superusuario: isSuper,
      },
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_in: authData.session.expires_in,
        token_type: authData.session.token_type,
      },
      empresas_autorizadas: empresas,
      roles_por_empresa: rolesPorEmpresa,
      requires_company_select: empresas.length > 1,
      generated_at: new Date().toISOString(),
    }, origin);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { ok: false, error: "missing_authorization" }, origin);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json(401, { ok: false, error: "invalid_token" }, origin);
  }

  let empresaId: number | null = null;
  if (isGetAccess || isGetMenu) {
    empresaId = Number(url.searchParams.get("empresa_id") ?? "");
  } else if (isSwitchCompany) {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    empresaId = Number(body?.empresa_id ?? "");
  }

  if (!Number.isInteger(empresaId) || Number(empresaId) <= 0) {
    return json(400, { ok: false, error: "empresa_id_required" }, origin);
  }

  const snapshot = await buildAccessSnapshot({
    supabase,
    empresaId: Number(empresaId),
    authUid: user.id,
  });

  if (!snapshot.ok) {
    return json(snapshot.status, snapshot.error, origin);
  }

  const data = snapshot.data;
  if (isGetMenu) {
    const modulos = Array.from(new Set(data.permissions.map((p) => p.split(":")[0]))).sort();
    return json(200, {
      ok: true,
      empresa_id: data.empresaId,
      modulos,
      permissions: data.permissions,
      permission_map: data.permissionMap,
      generated_at: new Date().toISOString(),
    }, origin);
  }

  return json(200, {
    ok: true,
    empresa_id: data.empresaId,
    empresa: data.empresa,
    usuario: data.usuario,
    rol: { nombre: data.rolNombre },
    permissions: data.permissions,
    permission_map: data.permissionMap,
    generated_at: new Date().toISOString(),
    source: isSwitchCompany ? "auth_switch_company" : "me_access",
  }, origin);
});
