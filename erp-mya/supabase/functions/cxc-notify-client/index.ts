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
    Vary: "Origin",
  };
};

const json = (status: number, data: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });

type AttachmentInput = {
  filename: string;
  content_base64: string;
  content_type?: string;
};

type BodyInput = {
  empresa_id: number;
  tercero_id: number;
  etiqueta_envio?: string;
  to_email: string;
  reply_to?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: AttachmentInput[];
};

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const trimSafe = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const reqOrigin = String(origin ?? "").trim();
  if (reqOrigin && !allowedOrigins.has(reqOrigin)) {
    return json(403, { ok: false, error: "origin_not_allowed" }, origin);
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: getCorsHeaders(origin) });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { ok: false, error: "method_not_allowed" }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("CXC_NOTIFY_FROM_EMAIL");
  const defaultReplyTo = trimSafe(Deno.env.get("CXC_NOTIFY_REPLY_TO"));
  const defaultBcc = trimSafe(Deno.env.get("CXC_NOTIFY_BCC")).toLowerCase();

  if (!supabaseUrl || !anonKey || !serviceRole) {
    return json(500, { ok: false, error: "missing_supabase_env" }, origin);
  }
  if (!resendApiKey || !fromEmail) {
    return json(500, { ok: false, error: "missing_email_env" }, origin);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { ok: false, error: "missing_authorization_header" }, origin);
  }
  const token = authHeader.slice(7).trim();
  if (!token) return json(401, { ok: false, error: "invalid_authorization_header" }, origin);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: authUser, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !authUser?.user?.id) {
    return json(401, { ok: false, error: "invalid_jwt" }, origin);
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const empresaId = Number(url.searchParams.get("empresa_id") || 0);
    if (!empresaId) {
      return json(400, { ok: false, error: "empresa_required" }, origin);
    }

    const { data: canView, error: permViewErr } = await userClient.rpc("has_permission", {
      p_empresa_id: empresaId,
      p_modulo_codigo: "cxc",
      p_accion: "ver",
    });

    if (permViewErr || !canView) {
      return json(403, { ok: false, error: "insufficient_permissions_cxc" }, origin);
    }

    return json(200, {
      ok: true,
      enabled: Boolean(resendApiKey && fromEmail),
      status: resendApiKey && fromEmail ? "configured" : "not_configured",
      message: resendApiKey && fromEmail
        ? "Envio de correos habilitado."
        : "El envio de correos no esta habilitado. Contacte al administrador.",
      default_reply_to: defaultReplyTo || null,
      bcc_enabled: Boolean(defaultBcc && isEmail(defaultBcc)),
      from_email: fromEmail || null,
    }, origin);
  }

  let body: BodyInput;
  try {
    body = (await req.json()) as BodyInput;
  } catch {
    return json(400, { ok: false, error: "invalid_json" }, origin);
  }

  const empresaId = Number(body?.empresa_id || 0);
  const terceroId = Number(body?.tercero_id || 0);
  const etiquetaEnvio = trimSafe(body?.etiqueta_envio || "estado_cuenta").toLowerCase();
  const toEmail = trimSafe(body?.to_email).toLowerCase();
  const replyTo = trimSafe(body?.reply_to || defaultReplyTo).toLowerCase();
  const subject = trimSafe(body?.subject);
  const html = String(body?.html ?? "").trim();
  const text = trimSafe(body?.text);
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];

  if (!empresaId || !terceroId || !toEmail || !subject || !html) {
    return json(400, { ok: false, error: "required_fields_missing" }, origin);
  }
  if (!isEmail(toEmail)) {
    return json(400, { ok: false, error: "invalid_to_email" }, origin);
  }
  if (replyTo && !isEmail(replyTo)) {
    return json(400, { ok: false, error: "invalid_reply_to" }, origin);
  }
  if (defaultBcc && !isEmail(defaultBcc)) {
    return json(500, { ok: false, error: "invalid_bcc_config" }, origin);
  }
  if (attachments.length > 5) {
    return json(400, { ok: false, error: "too_many_attachments" }, origin);
  }

  const { data: canEdit, error: permErr } = await userClient.rpc("has_permission", {
    p_empresa_id: empresaId,
    p_modulo_codigo: "cxc",
    p_accion: "editar",
  });

  if (permErr || !canEdit) {
    return json(403, { ok: false, error: "insufficient_permissions_cxc" }, origin);
  }

  const service = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: tercero, error: terceroErr } = await service
    .from("terceros")
    .select("id,razon_social,email")
    .eq("empresa_id", empresaId)
    .eq("id", terceroId)
    .maybeSingle();

  if (terceroErr || !tercero?.id) {
    return json(404, { ok: false, error: "tercero_not_found" }, origin);
  }

  const { data: lastGestion } = await service
    .from("cxc_gestion_cobro")
    .select("documento_id")
    .eq("empresa_id", empresaId)
    .eq("tercero_id", terceroId)
    .order("fecha_gestion", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const resendAttachments = attachments.map((a) => ({
    filename: trimSafe(a.filename),
    content: trimSafe(a.content_base64),
    content_type: trimSafe(a.content_type) || "application/octet-stream",
  })).filter((a) => a.filename && a.content);

  const logBase = {
    empresa_id: empresaId,
    tercero_id: terceroId,
    documento_id: Number(lastGestion?.documento_id || 0) || null,
    etiqueta_envio: etiquetaEnvio,
    to_email: toEmail,
    reply_to: replyTo || null,
    subject,
    body_text: text || null,
    provider: "resend",
    attachments_count: resendAttachments.length,
    attachments: resendAttachments.map((a) => ({
      filename: a.filename,
      content_type: a.content_type,
    })),
    created_by: authUser.user.id,
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      bcc: defaultBcc ? [defaultBcc] : undefined,
      reply_to: replyTo || undefined,
      subject,
      html,
      text: text || undefined,
      attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    await service.from("cxc_correos_bitacora").insert({
      ...logBase,
      estado: "error",
      error_code: "resend_error",
      error_detail: detail,
      payload: { source: "cxc-notify-client" },
    });
    return json(502, { ok: false, error: "resend_error", detail }, origin);
  }

  const payload = await response.json().catch(() => ({}));
  await service.from("cxc_correos_bitacora").insert({
    ...logBase,
    estado: "enviado",
    provider_message_id: String((payload as Record<string, unknown>)?.id ?? ""),
    payload: { source: "cxc-notify-client" },
  });
  return json(200, {
    ok: true,
    message: "notificacion_enviada",
    provider: "resend",
    email_id: (payload as Record<string, unknown>)?.id ?? null,
    etiqueta_envio: etiquetaEnvio,
    to_email: toEmail,
    reply_to: replyTo || null,
    bcc_email: defaultBcc || null,
    tercero: {
      id: tercero.id,
      razon_social: tercero.razon_social,
    },
    attachments_sent: resendAttachments.length,
  }, origin);
});
