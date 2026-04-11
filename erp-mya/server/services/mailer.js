/**
 * mailer.js — Envío de emails via Resend API
 *
 * Mismo proveedor que usa el módulo CXC (cxc-notify-client Edge Function).
 *
 * Configurar en server/.env:
 *   RESEND_API_KEY=re_xxxxxxxxxxxxxxxx   ← mismo key que en los Supabase Secrets
 *   SMTP_FROM=Empacadora MYA <correo@visionzn.com>  ← dominio verificado en Resend
 */

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Envía un correo HTML via Resend.
 * @param {object} opts - { to, subject, html }
 */
export async function sendMail({ to, subject, html, attachments = [] }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.SMTP_FROM || process.env.RESEND_FROM || 'ERP MYA <no-reply@visionzn.com>';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY no configurado en server/.env');
  }

  const resp = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, attachments }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data?.message || `Resend error ${resp.status}`);
  }

  return { messageId: data.id, accepted: Array.isArray(to) ? to : [to] };
}
