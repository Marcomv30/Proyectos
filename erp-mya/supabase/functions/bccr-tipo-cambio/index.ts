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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const json = (status: number, data: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });

const toCRDate = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
};

const parseIndicatorValue = (xml: string): number | null => {
  const m =
    xml.match(/<NUM_VALOR>\s*([^<]+)\s*<\/NUM_VALOR>/i) ||
    xml.match(/<num_valor>\s*([^<]+)\s*<\/num_valor>/i);
  if (!m?.[1]) return null;
  const raw = m[1].trim().replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const buildUrl = (args: {
  indicador: 317 | 318;
  fechaCR: string;
  nombre: string;
  subNiveles: string;
  correo: string;
  token: string;
}) => {
  const base = "https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicos";
  const q = new URLSearchParams({
    Indicador: String(args.indicador),
    FechaInicio: args.fechaCR,
    FechaFinal: args.fechaCR,
    Nombre: args.nombre,
    SubNiveles: args.subNiveles,
    CorreoElectronico: args.correo,
    Token: args.token,
  });
  return `${base}?${q.toString()}`;
};

Deno.serve(async (req) => {
  try {
    const origin = req.headers.get("origin");
    const reqOrigin = String(origin ?? "").trim();
    if (reqOrigin && !allowedOrigins.has(reqOrigin)) {
      return json(403, { ok: false, error: "origin_not_allowed" }, origin);
    }

    console.log("bccr-tipo-cambio:start", req.method);
    if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: getCorsHeaders(origin) });
    if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" }, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) return json(500, { ok: false, error: "missing_supabase_env" }, origin);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { ok: false, error: "missing_authorization" }, origin);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return json(401, { ok: false, error: "invalid_token" }, origin);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const fecha = String(body.fecha ?? "").trim();
    console.log("bccr-tipo-cambio:fecha", fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return json(400, { ok: false, error: "fecha_required_yyyy_mm_dd" }, origin);
    }
    const fechaCR = toCRDate(fecha);
    if (!fechaCR) return json(400, { ok: false, error: "invalid_fecha" }, origin);

    // Credenciales solo desde secrets del servidor (no desde frontend).
    const nombre = String(Deno.env.get("BCCR_NOMBRE") ?? "").trim();
    const correo = String(Deno.env.get("BCCR_CORREO") ?? "").trim();
    const token = String(Deno.env.get("BCCR_TOKEN") ?? "").trim();
    const subNivelesRaw = String(Deno.env.get("BCCR_SUBNIVELES") ?? "S").trim().toUpperCase();
    const subNiveles = subNivelesRaw || "S";
    console.log("bccr-tipo-cambio:secrets", {
      hasNombre: Boolean(nombre),
      hasCorreo: Boolean(correo),
      hasToken: Boolean(token),
      subNiveles,
    });

    if (!nombre || !correo || !token) {
      return json(400, { ok: false, error: "bccr_credentials_required", detail: "nombre, correo y token son requeridos." }, origin);
    }

    const compraUrl = buildUrl({ indicador: 317, fechaCR, nombre, subNiveles, correo, token });
    const ventaUrl = buildUrl({ indicador: 318, fechaCR, nombre, subNiveles, correo, token });
    console.log("bccr-tipo-cambio:fetching");

    const [compraResp, ventaResp] = await Promise.all([fetch(compraUrl), fetch(ventaUrl)]);
    console.log("bccr-tipo-cambio:statuses", compraResp.status, ventaResp.status);
    if (!compraResp.ok || !ventaResp.ok) {
      return json(502, {
        ok: false,
        error: "bccr_http_error",
        compra_status: compraResp.status,
        venta_status: ventaResp.status,
      }, origin);
    }

    const [compraXml, ventaXml] = await Promise.all([compraResp.text(), ventaResp.text()]);
    const compra = parseIndicatorValue(compraXml);
    const venta = parseIndicatorValue(ventaXml);
    console.log("bccr-tipo-cambio:values", compra, venta);

    if (!compra || !venta) {
      return json(422, {
        ok: false,
        error: "bccr_value_not_found",
        detail: "No se pudo leer NUM_VALOR para compra/venta en la fecha solicitada.",
      }, origin);
    }

    return json(200, {
      ok: true,
      fuente: "BCCR",
      fecha,
      compra,
      venta,
      indicador_compra: 317,
      indicador_venta: 318,
    }, origin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("bccr-tipo-cambio:unhandled", msg);
    return json(500, { ok: false, error: "unhandled_exception", detail: msg }, req.headers.get("origin"));
  }
});
