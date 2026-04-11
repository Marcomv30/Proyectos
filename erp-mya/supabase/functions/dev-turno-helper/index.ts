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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dev-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const json = (status: number, data: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });

const toNum = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const firstOrNull = <T>(rows: T[] | null | undefined): T | null => (rows && rows.length > 0 ? rows[0] : null);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const reqOrigin = String(origin ?? "").trim();
  if (reqOrigin && !allowedOrigins.has(reqOrigin)) {
    return json(403, { ok: false, error: "origin_not_allowed" }, origin);
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: getCorsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" }, origin);
  }

  const enabled = String(Deno.env.get("DEV_TURNO_HELPER_ENABLED") ?? "").toLowerCase() === "true";
  if (!enabled) {
    return json(403, { ok: false, error: "dev_helper_disabled" }, origin);
  }

  const devSecret = String(Deno.env.get("DEV_TURNO_HELPER_SECRET") ?? "").trim();
  if (!devSecret) {
    return json(500, { ok: false, error: "missing_dev_secret_env" }, origin);
  }
  const providedSecret = String(req.headers.get("x-dev-secret") ?? "").trim();
  if (!providedSecret || providedSecret !== devSecret) {
    return json(401, { ok: false, error: "unauthorized" }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: "missing_supabase_env" }, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const empresaIdBody = toNum(body.empresa_id);
  const puntoVentaIdBody = toNum(body.punto_venta_id);
  const cajaIdBody = toNum(body.caja_id);
  const saldoInicial = Math.max(0, toNum(body.saldo_inicial));
  const observacion = String(body.observacion ?? "").trim();
  const cajeroBody = String(body.cajero_auth_user_id ?? "").trim();

  const empresaId = (() => {
    if (empresaIdBody > 0) return empresaIdBody;
    return 0;
  })();

  let resolvedEmpresaId = empresaId;
  if (!resolvedEmpresaId) {
    const { data, error } = await supabase
      .from("empresas")
      .select("id")
      .eq("activo", true)
      .order("id", { ascending: true })
      .limit(1);
    if (error) return json(500, { ok: false, error: "empresa_lookup_failed", detail: error.message }, origin);
    resolvedEmpresaId = toNum(firstOrNull(data as Array<{ id: number }> | null)?.id);
  }
  if (!resolvedEmpresaId) {
    return json(400, { ok: false, error: "empresa_not_found" }, origin);
  }

  let resolvedPvId = puntoVentaIdBody;
  if (!resolvedPvId) {
    const { data, error } = await supabase
      .from("puntos_venta")
      .select("id")
      .eq("empresa_id", resolvedEmpresaId)
      .eq("activo", true)
      .order("id", { ascending: true })
      .limit(1);
    if (error) return json(500, { ok: false, error: "punto_venta_lookup_failed", detail: error.message }, origin);
    resolvedPvId = toNum(firstOrNull(data as Array<{ id: number }> | null)?.id);
  }
  if (!resolvedPvId) {
    return json(400, { ok: false, error: "punto_venta_not_found" }, origin);
  }

  let resolvedCajaId = cajaIdBody;
  if (!resolvedCajaId) {
    const { data, error } = await supabase
      .from("cajas")
      .select("id")
      .eq("empresa_id", resolvedEmpresaId)
      .eq("punto_venta_id", resolvedPvId)
      .eq("activo", true)
      .order("id", { ascending: true })
      .limit(1);
    if (error) return json(500, { ok: false, error: "caja_lookup_failed", detail: error.message }, origin);
    resolvedCajaId = toNum(firstOrNull(data as Array<{ id: number }> | null)?.id);
  }
  if (!resolvedCajaId) {
    return json(400, { ok: false, error: "caja_not_found" }, origin);
  }

  let cajeroAuthUserId = cajeroBody;
  if (!cajeroAuthUserId) {
    const { data, error } = await supabase
      .from("usuarios")
      .select("auth_user_id")
      .not("auth_user_id", "is", null)
      .eq("activo", true)
      .order("id", { ascending: true })
      .limit(1);
    if (error) return json(500, { ok: false, error: "usuario_lookup_failed", detail: error.message }, origin);
    cajeroAuthUserId = String(firstOrNull(data as Array<{ auth_user_id: string }> | null)?.auth_user_id ?? "").trim();
  }
  if (!cajeroAuthUserId) {
    return json(400, { ok: false, error: "cajero_auth_user_id_required" }, origin);
  }

  const { data: abiertoData, error: abiertoError } = await supabase
    .from("caja_turnos")
    .select("id,empresa_id,punto_venta_id,caja_id,estado,fecha_hora_apertura")
    .eq("empresa_id", resolvedEmpresaId)
    .eq("punto_venta_id", resolvedPvId)
    .eq("caja_id", resolvedCajaId)
    .eq("estado", "abierto")
    .order("fecha_hora_apertura", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (abiertoError) {
    return json(500, { ok: false, error: "turno_lookup_failed", detail: abiertoError.message }, origin);
  }
  if (abiertoData?.id) {
    return json(200, { ok: true, reused: true, turno: abiertoData }, origin);
  }

  const { data: insertData, error: insertError } = await supabase
    .from("caja_turnos")
    .insert({
      empresa_id: resolvedEmpresaId,
      punto_venta_id: resolvedPvId,
      caja_id: resolvedCajaId,
      cajero_auth_user_id: cajeroAuthUserId,
      fecha_hora_apertura: new Date().toISOString(),
      estado: "abierto",
      saldo_inicial: saldoInicial,
      observacion: observacion ? `[DEV_HELPER] ${observacion}` : "[DEV_HELPER] Turno abierto por endpoint temporal",
      created_by: cajeroAuthUserId,
      updated_by: cajeroAuthUserId,
    })
    .select("id,empresa_id,punto_venta_id,caja_id,estado,fecha_hora_apertura")
    .single();

  if (insertError) {
    return json(500, { ok: false, error: "turno_create_failed", detail: insertError.message }, origin);
  }

  await supabase.from("caja_turno_bitacora").insert({
    turno_id: insertData.id,
    empresa_id: resolvedEmpresaId,
    accion: "abrir",
    detalle: "Turno abierto por dev-turno-helper",
    payload: {
      via: "dev-turno-helper",
      saldo_inicial: saldoInicial,
      punto_venta_id: resolvedPvId,
      caja_id: resolvedCajaId,
    },
    created_by: cajeroAuthUserId,
  });

  return json(200, { ok: true, reused: false, turno: insertData }, origin);
});

