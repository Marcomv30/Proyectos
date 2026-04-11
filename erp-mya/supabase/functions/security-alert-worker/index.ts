// Supabase Edge Function: security-alert-worker
// Procesa cola public.security_alert_outbox y envia correos via Resend API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type OutboxRow = {
  id: number;
  audit_id: number;
  recipient_email: string;
  subject: string;
  body: string;
};

const json = (status: number, data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

async function sendEmailWithResend(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`resend_${response.status}: ${text}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const cronSecret = Deno.env.get("SECURITY_ALERT_CRON_SECRET");
  if (!cronSecret) {
    return json(500, { error: "missing_cron_secret_env" });
  }
  const provided = req.headers.get("x-cron-secret");
  if (provided !== cronSecret) {
    return json(401, { error: "unauthorized" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("SECURITY_ALERT_FROM_EMAIL");
  const batchSize = Number(Deno.env.get("SECURITY_ALERT_BATCH_SIZE") ?? "20");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "missing_supabase_env" });
  }
  if (!resendApiKey || !fromEmail) {
    return json(500, { error: "missing_email_env" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("claim_security_alerts", {
    p_limit: Math.max(1, Math.min(batchSize, 200)),
  });

  if (error) {
    return json(500, { error: "claim_failed", detail: error.message });
  }

  const rows = (data ?? []) as OutboxRow[];
  if (rows.length === 0) {
    return json(200, { ok: true, message: "no_pending_alerts", processed: 0 });
  }

  let sent = 0;
  let failed = 0;
  const failures: Array<{ outbox_id: number; error: string }> = [];

  for (const row of rows) {
    try {
      await sendEmailWithResend({
        apiKey: resendApiKey,
        from: fromEmail,
        to: row.recipient_email,
        subject: row.subject,
        text: row.body,
      });

      await supabase.rpc("complete_security_alert", {
        p_outbox_id: row.id,
        p_success: true,
        p_error: null,
      });
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      await supabase.rpc("complete_security_alert", {
        p_outbox_id: row.id,
        p_success: false,
        p_error: message.slice(0, 1000),
      });
      failed++;
      failures.push({ outbox_id: row.id, error: message });
    }
  }

  return json(200, {
    ok: true,
    claimed: rows.length,
    sent,
    failed,
    failures,
  });
});
