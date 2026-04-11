/**
 * emailEmpacadora.js — Envío de documentos de la Empacadora por correo
 *
 * POST /api/empacadora/email/guia
 *   body: { to, subject, html_content, guia_numero, empresa_nombre }
 */

import { sendMail } from '../services/mailer.js';

// ─── POST /api/empacadora/email/guia ──────────────────────────────────────────
export async function enviarGuiaEmail(req, res) {
  const { to, subject, html_content, guia_numero, empresa_nombre } = req.body || {};

  if (!to || !html_content) {
    return res.status(400).json({ ok: false, error: 'Destinatario y contenido son requeridos' });
  }

  // Validar formato de email básico
  const emails = to.split(/[,;]/).map(e => e.trim()).filter(Boolean);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidos = emails.filter(e => !emailRegex.test(e));
  if (invalidos.length > 0) {
    return res.status(400).json({ ok: false, error: `Email inválido: ${invalidos.join(', ')}` });
  }

  const asunto = subject || `Guía de Despacho ${guia_numero || ''} — ${empresa_nombre || 'Empacadora'}`;

  // Wrap del HTML en una plantilla de email limpia
  const emailHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${asunto}</title>
  <style>
    body { margin:0; padding:0; background:#f1f5f9; font-family:Arial,sans-serif; }
    .wrapper { max-width:900px; margin:0 auto; background:#fff; }
    .header  { background:#1e3a5f; color:#fff; padding:16px 24px; display:flex; justify-content:space-between; align-items:center; }
    .header h2 { margin:0; font-size:15px; }
    .header span { font-size:12px; opacity:0.7; }
    .body    { padding:0; }
    .footer  { background:#f8fafc; border-top:1px solid #e2e8f0; padding:12px 24px; font-size:10px; color:#94a3b8; text-align:center; }
    @media print { body { background:#fff; } }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h2>📦 ${asunto}</h2>
      <span>Generado: ${new Date().toLocaleString('es-CR')}</span>
    </div>
    <div class="body">
      ${html_content}
    </div>
    <div class="footer">
      Este correo fue generado automáticamente por el Sistema de Trazabilidad — Empacadora de Piña.<br>
      Por favor no responder a este correo.
    </div>
  </div>
</body>
</html>`;

  try {
    const result = await sendMail({
      to: emails.join(', '),
      subject: asunto,
      html: emailHtml,
    });
    console.log(`[Email] Guía ${guia_numero} enviada a ${emails.join(', ')} — messageId: ${result.messageId}`);
    return res.json({ ok: true, messageId: result.messageId, accepted: result.accepted });
  } catch (err) {
    console.error('[Email] Error al enviar:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
