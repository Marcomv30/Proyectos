import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── Construye el HTML del correo ─────────────────────────────────────────────
function buildHtml(alertas: any[], fecha: string): string {
  const agotados = alertas.filter(a => a.estado_stock === 'agotado');
  const minimos  = alertas.filter(a => a.estado_stock === 'minimo');

  const filas = alertas.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-family:monospace;color:#60a5fa;">
        ${a.codigo || '—'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-weight:600;color:#f1f5f9;">
        ${a.nombre}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;">
        ${Number(a.stock_bg).toLocaleString('es-CR')}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#60a5fa;">
        ${Number(a.stock_ip).toLocaleString('es-CR')}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;text-align:right;font-weight:700;
          color:${a.estado_stock === 'agotado' ? '#f87171' : '#fbbf24'};">
        ${Number(a.stock_total).toLocaleString('es-CR')}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#64748b;">
        ${Number(a.stock_minimo).toLocaleString('es-CR')}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;">
        <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;
          background:${a.estado_stock === 'agotado' ? '#450a0a' : '#422006'};
          color:${a.estado_stock === 'agotado' ? '#fca5a5' : '#fde68a'};">
          ${a.estado_stock === 'agotado' ? '⛔ AGOTADO' : '⚠ MÍNIMO'}
        </span>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:20px;background:#0a0f1a;font-family:Arial,sans-serif;color:#e2e8f0;">
<div style="max-width:720px;margin:0 auto;background:#111827;border-radius:12px;
  overflow:hidden;border:1px solid #1e293b;">

  <!-- Header -->
  <div style="background:#0f172a;padding:24px;border-bottom:1px solid #1e293b;">
    <h1 style="margin:0;font-size:20px;color:#f1f5f9;">
      ⚠&nbsp; Alerta de Stock — Empacadora
    </h1>
    <p style="margin:8px 0 0;color:#64748b;font-size:13px;">${fecha}</p>
  </div>

  <!-- Resumen -->
  <div style="padding:20px 24px;display:flex;gap:12px;flex-wrap:wrap;">
    ${agotados.length ? `
    <div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;
      padding:14px 22px;text-align:center;min-width:90px;">
      <div style="font-size:30px;font-weight:700;color:#f87171;">${agotados.length}</div>
      <div style="font-size:12px;color:#fca5a5;margin-top:2px;">Agotados</div>
    </div>` : ''}
    ${minimos.length ? `
    <div style="background:#422006;border:1px solid #92400e;border-radius:8px;
      padding:14px 22px;text-align:center;min-width:90px;">
      <div style="font-size:30px;font-weight:700;color:#fbbf24;">${minimos.length}</div>
      <div style="font-size:12px;color:#fde68a;margin-top:2px;">En mínimo</div>
    </div>` : ''}
  </div>

  <!-- Tabla -->
  <div style="padding:0 24px 24px;overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#0a0f1a;">
          <th style="padding:10px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Código</th>
          <th style="padding:10px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Material</th>
          <th style="padding:10px 12px;text-align:right;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">BG</th>
          <th style="padding:10px 12px;text-align:right;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">IP</th>
          <th style="padding:10px 12px;text-align:right;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Total</th>
          <th style="padding:10px 12px;text-align:right;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Mínimo</th>
          <th style="padding:10px 12px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Estado</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:14px 24px;background:#0a0f1a;border-top:1px solid #1e293b;">
    <p style="margin:0;font-size:11px;color:#334155;">
      Generado automáticamente · Sistema Empacadora MYA ·
      Inventario → Saldos BG / IP para gestionar stock.
    </p>
  </div>
</div>
</body></html>`;
}

// ── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Permitir pruebas desde el navegador
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);
    const body     = await req.json().catch(() => ({}));
    const source   = body.source ?? 'manual';  // 'cron' | 'manual' | 'test'
    const esTest   = source === 'test';

    // ── Obtener todas las configs activas (o la empresa específica si se pasa) ─
    const configQuery = supabase
      .from('emp_alertas_config')
      .select('*')
      .eq('activo', true);

    if (body.empresa_id) configQuery.eq('empresa_id', body.empresa_id);

    const { data: configs } = await configQuery;
    if (!configs || configs.length === 0) {
      return json({ ok: true, mensaje: 'Sin configuraciones activas' });
    }

    const resultados = [];

    for (const config of configs) {
      const empresaId = config.empresa_id;

      // ── Verificar hora de envío (solo para cron, no para test/manual) ──────
      if (source === 'cron' && !esTest) {
        const ahoraCR = new Date(
          new Date().toLocaleString('en-US', { timeZone: 'America/Costa_Rica' })
        );
        if (ahoraCR.getHours() !== config.hora_envio) {
          resultados.push({ empresa_id: empresaId, omitido: 'hora no coincide' });
          continue;
        }
      }

      // ── Consultar materiales en alerta ────────────────────────────────────
      const { data: alertas } = await supabase
        .from('emp_v_saldos')
        .select('material_id,codigo,nombre,material_tipo,stock_bg,stock_ip,stock_total,stock_minimo,estado_stock')
        .eq('empresa_id', empresaId)
        .neq('estado_stock', 'ok')
        .order('estado_stock')   // agotado primero
        .order('nombre');

      if (!alertas || alertas.length === 0) {
        await supabase.from('emp_alertas_log').insert({
          empresa_id: empresaId, materiales_count: 0,
          estado: 'sin_alertas', emails_enviados: config.emails,
        });
        resultados.push({ empresa_id: empresaId, ok: true, alertas: 0 });
        continue;
      }

      // ── Si solo_cambios=true, comparar con último log ─────────────────────
      if (config.solo_cambios && !esTest) {
        const { data: ultimoLog } = await supabase
          .from('emp_alertas_log')
          .select('materiales_count, created_at')
          .eq('empresa_id', empresaId)
          .eq('estado', 'enviado')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ultimoLog && ultimoLog.materiales_count === alertas.length) {
          // Mismo número — no reenviar si fue hace menos de 20h
          const hace = Date.now() - new Date(ultimoLog.created_at).getTime();
          if (hace < 20 * 60 * 60 * 1000) {
            resultados.push({ empresa_id: empresaId, omitido: 'sin cambios' });
            continue;
          }
        }
      }

      // ── Construir email ───────────────────────────────────────────────────
      const fecha = new Date().toLocaleDateString('es-CR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'America/Costa_Rica',
      });
      const html = buildHtml(alertas, fecha);

      const emails = config.emails
        .split(/[,\n]/)
        .map((e: string) => e.trim())
        .filter(Boolean);

      if (emails.length === 0) {
        resultados.push({ empresa_id: empresaId, error: 'Sin emails configurados' });
        continue;
      }

      // ── Enviar via Resend ─────────────────────────────────────────────────
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    'Empacadora Alertas <alertas@resend.dev>',
          to:      emails,
          subject: `${alertas.some(a => a.estado_stock === 'agotado') ? '⛔' : '⚠'} ${alertas.length} material${alertas.length !== 1 ? 'es' : ''} con stock bajo — ${fecha}`,
          html,
        }),
      });

      const resendBody = await resendRes.text();
      const estado     = resendRes.ok ? 'enviado' : 'error';

      await supabase.from('emp_alertas_log').insert({
        empresa_id:      empresaId,
        materiales_count: alertas.length,
        emails_enviados: emails.join(', '),
        estado,
        respuesta:       resendBody,
      });

      resultados.push({ empresa_id: empresaId, ok: resendRes.ok, alertas: alertas.length, estado });
    }

    return json({ ok: true, resultados });

  } catch (err: any) {
    return json({ ok: false, error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type':                 'application/json',
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}
