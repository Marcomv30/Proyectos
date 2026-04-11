import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../../supabase';

interface TramitesCobroProps {
  empresaId: number;
  empresaNombre?: string;
  canView?: boolean;
  canEdit?: boolean;
  isAdmin?: boolean;
  prefillTerceroId?: number | null;
  prefillMoneda?: 'CRC' | 'USD' | null;
  onVolverGestion?: () => void;
  onAbrirRecaudacion?: (ctx: { terceroId: number; moneda?: 'CRC' | 'USD' }) => void;
}

interface ClienteRow {
  id: number;
  razon_social: string;
  identificacion: string | null;
  email?: string | null;
}

interface DocRow {
  documento_id: number;
  numero_documento: string;
  tipo_documento: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  moneda: 'CRC' | 'USD' | string;
  monto_pendiente: number;
  dias_vencidos: number;
}

interface GestionRow {
  id: number;
  tercero_id: number;
  documento_id: number | null;
  numero_documento: string | null;
  fecha_gestion: string;
  canal: string;
  resultado: string;
  compromiso_fecha: string | null;
  compromiso_monto: number | null;
  observacion: string | null;
}

interface MailLogRow {
  id: number;
  created_at: string;
  etiqueta_envio: string;
  to_email: string;
  reply_to: string | null;
  subject: string;
  body_text: string | null;
  estado: string;
  provider: string;
  provider_message_id: string | null;
  attachments_count: number;
  created_by_nombre: string | null;
  error_code: string | null;
  error_detail: string | null;
}

interface MailStatus {
  enabled: boolean;
  message: string;
  status?: string;
  fromEmail?: string | null;
  defaultReplyTo?: string | null;
}

const styles = `
  .tc-wrap { padding:0; color:#d6e2ff; }
  .tc-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:6px; }
  .tc-sub { font-size:12px; color:#8ea3c7; margin-bottom:12px; }
  .tc-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; padding:12px; margin-bottom:12px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .tc-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px; align-items:end; }
  .tc-field { display:flex; flex-direction:column; gap:4px; }
  .tc-field label { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .tc-input, .tc-select { width:100%; border:1px solid rgba(137,160,201,0.22); border-radius:12px; padding:10px 12px; font-size:13px; background:#1d2738; color:#f3f7ff; }
  .tc-input.num { text-align:right; font-family:'DM Mono', monospace; }
  .tc-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .tc-btn { border:1px solid rgba(137,160,201,0.18); background:#243149; color:#d6e2ff; border-radius:10px; padding:8px 11px; font-size:13px; cursor:pointer; }
  .tc-btn.main { border-color:#16a34a; background:#16a34a; color:#fff; }
  .tc-btn:disabled { opacity:.65; cursor:not-allowed; }
  .tc-table { border:1px solid rgba(137,160,201,0.18); border-radius:12px; overflow:auto; background:#1d2738; }
  .tc-table table { width:100%; border-collapse:collapse; min-width:940px; }
  .tc-table th, .tc-table td { padding:8px 10px; border-top:1px solid rgba(137,160,201,0.12); font-size:12px; color:#d6e2ff; }
  .tc-table th { background:#131b2a; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-size:11px; text-align:left; }
  .tc-right { text-align:right; font-family:'DM Mono', monospace; }
  .tc-msg-ok { margin-bottom:10px; border:1px solid #1d6e4f; background:#0f2c20; color:#9df4c7; border-radius:12px; padding:10px 12px; font-size:12px; }
  .tc-msg-err { margin-bottom:10px; border:1px solid #7d2f3a; background:#34181c; color:#ffb3bb; border-radius:12px; padding:10px 12px; font-size:12px; }
  .tc-empty { color:#8ea3c7; font-size:12px; padding:10px; text-align:center; }
  .tc-badge { display:inline-flex; align-items:center; justify-content:center; border-radius:999px; padding:2px 8px; font-size:10px; font-weight:700; letter-spacing:.02em; text-transform:uppercase; border:1px solid transparent; }
  .tc-badge.res-ok { background:#0f2c20; color:#9df4c7; border-color:#1d6e4f; }
  .tc-badge.res-warn { background:#332914; color:#ffd66f; border-color:#936b1d; }
  .tc-badge.res-err { background:#34181c; color:#ffb3bb; border-color:#7d2f3a; }
  .tc-badge.res-info { background:#1f2f4c; color:#9ec3ff; border-color:rgba(137,160,201,0.18); }
  .tc-badge.ch-neutral { background:#243149; color:#d6e2ff; border-color:rgba(137,160,201,0.18); }
  .tc-row-prio-alta td { background:#3a302d; }
  .tc-row-prio-media td { background:#332914; }
  @media (max-width: 1100px) { .tc-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 760px) { .tc-grid { grid-template-columns: 1fr; } }
`;

const toNum = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number, m: 'CRC' | 'USD' | string = 'CRC') =>
  new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: m === 'USD' ? 'USD' : 'CRC',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const moneyPdf = (n: number, m: 'CRC' | 'USD' | string = 'CRC') => {
  const amount = new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
  return (m === 'USD' ? '$' : '\u00a2') + ' ' + amount;
};

const docTypePrefix = (tipo: string | null | undefined) => {
  const key = String(tipo || '').toUpperCase().trim();
  if (key === 'FACTURA') return 'FAC';
  if (key === 'NOTA_CREDITO' || key === 'NOTA DE CREDITO') return 'NCR';
  if (key === 'NOTA_DEBITO' || key === 'NOTA DE DEBITO') return 'NDB';
  if (key === 'RECIBO') return 'REC';
  if (key === 'PAGO') return 'PAG';
  if (key === 'AJUSTE') return 'AJU';
  return key.slice(0, 3) || 'DOC';
};

const esc = (v: string | number | null | undefined) => {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const utf8ToBase64 = (value: string) => {
  const enc = new TextEncoder().encode(value);
  let binary = '';
  enc.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
};

const pdfSafeText = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/\u20a1/g, 'CRC ')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resultadoClass = (resultado: string) => {
  const r = String(resultado || '').toUpperCase();
  if (r === 'PAGO_REALIZADO') return 'res-ok';
  if (r === 'PROMESA_PAGO') return 'res-info';
  if (r === 'NO_LOCALIZADO' || r === 'RECHAZO') return 'res-err';
  if (r === 'PENDIENTE') return 'res-warn';
  return 'res-info';
};

const prioridadFromGestion = (g: GestionRow, docs: DocRow[]) => {
  const r = String(g.resultado || '').toUpperCase();
  if (r === 'PAGO_REALIZADO') return 'baja';

  const today = new Date().toISOString().slice(0, 10);
  if (g.compromiso_fecha && g.compromiso_fecha < today) return 'alta';

  const doc = docs.find((d) => d.documento_id === g.documento_id);
  const dias = Number(doc?.dias_vencidos || 0);
  if (dias >= 45) return 'alta';
  if (dias >= 15) return 'media';
  return 'baja';
};

const getMailTemplate = (
  etiqueta: string,
  clienteNombre: string,
  totalPendiente: number,
  moneda: 'CRC' | 'USD' | string
) => {
  const cli = clienteNombre || 'Cliente';
  const pendiente = money(totalPendiente, moneda);
  switch (etiqueta) {
    case 'recordatorio':
      return {
        subject: `Recordatorio de pago - ${cli}`,
        body:
          `Estimado cliente,\n\n` +
          `Le recordamos que mantiene un saldo pendiente por ${pendiente}.\n\n` +
          `Agradecemos realizar su pago a la mayor brevedad posible. Si ya realizo la cancelacion, puede omitir este aviso.\n\n` +
          `Quedamos atentos.`,
      };
    case 'promesa_vencida':
      return {
        subject: `Seguimiento de promesa de pago - ${cli}`,
        body:
          `Estimado cliente,\n\n` +
          `Damos seguimiento a la promesa de pago registrada en su cuenta. Actualmente mantiene un saldo pendiente por ${pendiente}.\n\n` +
          `Agradecemos nos confirme la fecha estimada de cancelacion o nos comparta el comprobante correspondiente si el pago ya fue realizado.\n\n` +
          `Quedamos atentos.`,
      };
    case 'aviso_formal':
      return {
        subject: `Aviso formal de cobro - ${cli}`,
        body:
          `Estimado cliente,\n\n` +
          `Por medio del presente compartimos un aviso formal relacionado con el saldo pendiente de su cuenta, el cual asciende a ${pendiente}.\n\n` +
          `Le solicitamos regularizar su situacion a la mayor brevedad posible o comunicarse con nuestro departamento de cobros para coordinar una solucion.\n\n` +
          `Quedamos atentos.`,
      };
    case 'estado_cuenta':
    default:
      return {
        subject: `Estado de gestion de cobro - ${cli}`,
        body:
          `Estimado cliente,\n\n` +
          `Compartimos el estado actualizado de su gestion de cobro.\n\n` +
          `Su saldo pendiente actual es de ${pendiente}. Si ya realizo la cancelacion, puede omitir este aviso.\n\n` +
          `Quedamos atentos.`,
      };
  }
};

const extractEmailFromDisplay = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] || raw).trim();
};

const buildMailContent = ({
  clienteNombre,
  clienteIdentificacion,
  totalPendiente,
  moneda,
  tramitesVisibles,
  mailBody,
  empresaNombre,
  remitenteVisible,
  replyToVisible,
}: {
  clienteNombre: string;
  clienteIdentificacion: string;
  totalPendiente: number;
  moneda: 'CRC' | 'USD' | string;
  tramitesVisibles: number;
  mailBody: string;
  empresaNombre: string;
  remitenteVisible: string;
  replyToVisible: string;
}) => {
  const signatureText = [
    '',
    'Atentamente,',
    empresaNombre,
    remitenteVisible ? `Correo: ${extractEmailFromDisplay(remitenteVisible)}` : '',
    replyToVisible ? `Responder a: ${replyToVisible}` : '',
  ].filter(Boolean).join('\n');

  const fullTextBody = `${mailBody.trim()}\n${signatureText}`;

  const html = `
    <div style="margin:0;background:#f8fafc;padding:24px;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">
        <div style="background:#0f2a1d;padding:18px 24px;color:#ffffff">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Gestion de cobro</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px">${escapeHtml(clienteNombre || 'Cliente')}</div>
        </div>
        <div style="padding:24px">
          <div style="font-size:14px;line-height:1.7;color:#1e293b">${escapeHtml(mailBody).replace(/\n/g, '<br/>')}</div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:22px">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Cliente</div>
              <div style="font-size:15px;font-weight:700;margin-top:6px">${escapeHtml(clienteNombre || '-')}</div>
              <div style="font-size:12px;color:#475569;margin-top:4px">${escapeHtml(clienteIdentificacion || '-')}</div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Tramites visibles</div>
              <div style="font-size:24px;font-weight:700;margin-top:8px">${tramitesVisibles}</div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Pendiente actual</div>
              <div style="font-size:24px;font-weight:700;margin-top:8px">${escapeHtml(money(totalPendiente, moneda))}</div>
            </div>
          </div>
          <div style="margin-top:22px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#64748b;line-height:1.7">
            <div style="font-size:14px;color:#0f172a;line-height:1.7;margin-bottom:12px">
              Atentamente,<br/>
              <strong>${escapeHtml(empresaNombre)}</strong><br/>
              ${escapeHtml(extractEmailFromDisplay(remitenteVisible))}
              ${replyToVisible ? `<br/>Responder a: ${escapeHtml(replyToVisible)}` : ''}
            </div>
            Este correo fue generado desde el modulo de gestion de cobro del ERP.<br/>
            Los adjuntos incluyen el historial visible y un resumen ejecutivo del cliente.
          </div>
        </div>
      </div>
    </div>
  `;

  return { html, text: fullTextBody };
};

const buildResumenAdjuntoPdf = ({
  empresaNombre,
  clienteNombre,
  clienteIdentificacion,
  totalPendiente,
  moneda,
  tramitesVisibles,
  documentosPendientes,
}: {
  empresaNombre: string;
  clienteNombre: string;
  clienteIdentificacion: string;
  totalPendiente: number;
  moneda: 'CRC' | 'USD' | string;
  tramitesVisibles: number;
  documentosPendientes: DocRow[];
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const fechaGeneracion = new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
  let y = margin;
  const drawLine = (
    text: string,
    x: number,
    yPos: number,
    options?: { size?: number; color?: [number, number, number]; align?: 'left' | 'right' | 'center'; weight?: 'normal' | 'bold' }
  ) => {
    doc.setFont('helvetica', options?.weight || 'normal');
    doc.setFontSize(options?.size || 11);
    if (options?.color) doc.setTextColor(options.color[0], options.color[1], options.color[2]);
    else doc.setTextColor(15, 23, 42);
    doc.text(pdfSafeText(text), x, yPos, { align: options?.align || 'left' });
  };
  const ensureSpace = (needed = 18) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };
  doc.setFillColor(15, 42, 29);
  doc.roundedRect(margin, y, contentWidth, 70, 14, 14, 'F');
  drawLine('ESTADO DE CUENTA AL DIA', margin + 20, y + 22, { size: 9, color: [220, 252, 231], weight: 'bold' });
  drawLine(empresaNombre, margin + 20, y + 42, { size: 14, color: [255, 255, 255], weight: 'bold' });
  drawLine('Detalle actualizado de saldo pendiente', margin + 20, y + 58, { size: 10, color: [226, 232, 240] });
  drawLine(`Emitido: ${fechaGeneracion}`, margin + contentWidth - 20, y + 22, { size: 9, color: [220, 252, 231], align: 'right' });
  y += 88;
  const clienteCardWidth = contentWidth * 0.7 - 6;
  const saldoCardWidth = contentWidth * 0.3 - 6;
  const cards = [
    { label: 'CLIENTE', value: clienteNombre, extra: clienteIdentificacion || '-', width: clienteCardWidth, x: margin },
    { label: 'SALDO PENDIENTE', value: moneyPdf(totalPendiente, moneda), extra: 'Monto pendiente', width: saldoCardWidth, x: margin + clienteCardWidth + 12 },
  ];
  cards.forEach((card) => {
    const x = card.x;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, card.width, 74, 12, 12, 'FD');
    drawLine(card.label, x + 14, y + 18, { size: 7, color: [100, 116, 139], weight: 'normal' });
    drawLine(card.value, x + 14, y + 40, { size: card.label === 'CLIENTE' ? 13 : 15, color: [15, 23, 42], weight: 'bold' });
    drawLine(card.extra, x + 14, y + 61, { size: card.label === 'CLIENTE' ? 10 : 9, color: [71, 85, 105], weight: 'normal' });
  });
  y += 98;
  ensureSpace(90);
  drawLine('Estado de cuenta al dia', margin, y, { size: 13, color: [15, 23, 42], weight: 'bold' });
  y += 18;

  const colDoc = margin + 12;
  const colVence = margin + 308;
  const colDias = margin + 386;
  const colPend = margin + contentWidth - 12;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 28, 8, 8, 'F');
  drawLine('Documento', colDoc, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold' });
  drawLine('Vence', colVence, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold' });
  drawLine('D\u00edas', colDias, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold', align: 'right' });
  drawLine('Pendiente', colPend, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold', align: 'right' });
  y += 34;

  if (!documentosPendientes.length) {
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 32, 8, 8, 'S');
    drawLine('Sin documentos pendientes visibles.', margin + 12, y + 20, { size: 10, color: [100, 116, 139] });
    y += 42;
  } else {
    documentosPendientes.forEach((item, index) => {
      ensureSpace(42);
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 2, contentWidth, 36, 'F');
      }
      drawLine(`${docTypePrefix(item.tipo_documento)}-${item.numero_documento}`, colDoc, y + 20, { size: 9 });
      drawLine(item.fecha_vencimiento || '-', colVence, y + 14, { size: 9 });
      drawLine(String(item.dias_vencidos ?? 0), colDias, y + 14, { size: 9, align: 'right' });
      drawLine(moneyPdf(item.monto_pendiente, item.moneda), colPend, y + 14, { size: 9, align: 'right', weight: 'bold' });
      y += 36;
    });
  }

  ensureSpace(110);
  y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, margin + contentWidth, y);
  y += 20;
  drawLine('Documento generado desde el m\u00f3dulo de gesti\u00f3n de cobro del ERP.', margin, y, { size: 9, color: [100, 116, 139] });
  y += 14;
  drawLine('Los datos corresponden al historial visible al momento del envio.', margin, y, { size: 9, color: [100, 116, 139] });
  y += 34;
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y, margin + 170, y);
  y += 16;
  drawLine('Firma corporativa', margin, y, { size: 9, color: [71, 85, 105], weight: 'bold' });
  y += 14;
  drawLine(empresaNombre, margin, y, { size: 10, color: [15, 23, 42], weight: 'bold' });
  return arrayBufferToBase64(doc.output('arraybuffer'));
};

const buildEstadoCuentaClientePdf = ({
  empresaNombre,
  clienteNombre,
  clienteIdentificacion,
  totalPendiente,
  moneda,
  documentosPendientes,
}: {
  empresaNombre: string;
  clienteNombre: string;
  clienteIdentificacion: string;
  totalPendiente: number;
  moneda: 'CRC' | 'USD' | string;
  documentosPendientes: DocRow[];
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const fechaGeneracion = new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());
  let y = margin;

  const drawLine = (
    text: string,
    x: number,
    yPos: number,
    options?: { size?: number; color?: [number, number, number]; align?: 'left' | 'right' | 'center'; weight?: 'normal' | 'bold' }
  ) => {
    doc.setFont('helvetica', options?.weight || 'normal');
    doc.setFontSize(options?.size || 11);
    if (options?.color) doc.setTextColor(options.color[0], options.color[1], options.color[2]);
    else doc.setTextColor(15, 23, 42);
    doc.text(pdfSafeText(text), x, yPos, { align: options?.align || 'left' });
  };

  const ensureSpace = (needed = 18) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  doc.setFillColor(15, 42, 29);
  doc.roundedRect(margin, y, contentWidth, 82, 14, 14, 'F');
  drawLine('ESTADO DE CUENTA', margin + 20, y + 24, { size: 10, color: [220, 252, 231], weight: 'bold' });
  drawLine(empresaNombre, margin + 20, y + 46, { size: 14, color: [255, 255, 255], weight: 'bold' });
  drawLine('Detalle de documentos pendientes del cliente', margin + 20, y + 64, { size: 10, color: [226, 232, 240] });
  drawLine(`Emitido: ${fechaGeneracion}`, margin + contentWidth - 20, y + 24, { size: 9, color: [220, 252, 231], align: 'right' });
  y += 98;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 74, 12, 12, 'FD');
  drawLine('Cliente', margin + 16, y + 20, { size: 8, color: [100, 116, 139] });
  drawLine(clienteNombre, margin + 16, y + 42, { size: 13, weight: 'bold' });
  drawLine(clienteIdentificacion || '-', margin + 16, y + 60, { size: 10, color: [71, 85, 105] });
  drawLine('Saldo pendiente', margin + contentWidth - 16, y + 20, { size: 8, color: [100, 116, 139], align: 'right' });
  drawLine(moneyPdf(totalPendiente, moneda), margin + contentWidth - 16, y + 44, { size: 16, weight: 'bold', align: 'right' });
  y += 92;

  drawLine('Detalle de saldo pendiente', margin, y, { size: 13, weight: 'bold' });
  y += 18;

  const colDoc = margin + 12;
  const colEmision = margin + 250;
  const colVence = margin + 338;
  const colDias = margin + 426;
  const colPend = margin + contentWidth - 12;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 28, 8, 8, 'F');
  drawLine('Documento', colDoc, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold' });
  drawLine('Emision', colEmision, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold' });
  drawLine('Vence', colVence, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold' });
  drawLine('Dias', colDias, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold', align: 'right' });
  drawLine('Pendiente', colPend, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold', align: 'right' });
  y += 34;

  if (!documentosPendientes.length) {
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 34, 8, 8, 'S');
    drawLine('No hay documentos pendientes visibles para este cliente.', margin + 12, y + 21, { size: 10, color: [100, 116, 139] });
    y += 44;
  } else {
    documentosPendientes.forEach((item, index) => {
      ensureSpace(34);
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 2, contentWidth, 26, 'F');
      }
      drawLine(`${docTypePrefix(item.tipo_documento)}-${item.numero_documento}`, colDoc, y + 14, { size: 9 });
      drawLine(item.fecha_emision || '-', colEmision, y + 14, { size: 9 });
      drawLine(item.fecha_vencimiento || '-', colVence, y + 14, { size: 9 });
      drawLine(String(item.dias_vencidos ?? 0), colDias, y + 14, { size: 9, align: 'right' });
      drawLine(moneyPdf(item.monto_pendiente, item.moneda), colPend, y + 14, { size: 9, align: 'right', weight: 'bold' });
      y += 26;
    });
  }

  ensureSpace(120);
  y += 12;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 46, 10, 10, 'F');
  drawLine('Total pendiente', margin + 16, y + 28, { size: 11, color: [15, 23, 42], weight: 'bold' });
  drawLine(moneyPdf(totalPendiente, moneda), margin + contentWidth - 16, y + 28, { size: 13, color: [15, 23, 42], weight: 'bold', align: 'right' });
  y += 66;

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, margin + contentWidth, y);
  y += 20;
  drawLine('Agradecemos revisar este estado de cuenta y coordinar cualquier consulta o pago pendiente.', margin, y, { size: 9, color: [71, 85, 105] });
  y += 32;
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y, margin + 170, y);
  y += 16;
  drawLine('Firma corporativa', margin, y, { size: 9, color: [71, 85, 105], weight: 'bold' });
  y += 14;
  drawLine(empresaNombre, margin, y, { size: 10, weight: 'bold' });

  return arrayBufferToBase64(doc.output('arraybuffer'));
};

export default function TramitesCobro({
  empresaId,
  empresaNombre = 'ERP MYA',
  canView = true,
  canEdit = false,
  isAdmin = false,
  prefillTerceroId = null,
  prefillMoneda = null,
  onVolverGestion,
  onAbrirRecaudacion,
}: TramitesCobroProps) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [cliente, setCliente] = useState<ClienteRow | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [gestiones, setGestiones] = useState<GestionRow[]>([]);
  const [mailLog, setMailLog] = useState<MailLogRow[]>([]);
  const [docId, setDocId] = useState<number>(0);
  const [canal, setCanal] = useState('LLAMADA');
  const [resultado, setResultado] = useState('PENDIENTE');
  const [compromisoFecha, setCompromisoFecha] = useState('');
  const [compromisoMonto, setCompromisoMonto] = useState<number>(0);
  const [obs, setObs] = useState('');
  const [fSoloAlta, setFSoloAlta] = useState(false);
  const [fSoloPromesas, setFSoloPromesas] = useState(false);
  const [fCompromisosVencidos, setFCompromisosVencidos] = useState(false);
  const [mailTo, setMailTo] = useState('');
  const [mailReplyTo, setMailReplyTo] = useState('');
  const [mailEtiqueta, setMailEtiqueta] = useState('estado_cuenta');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [mailAdjCsv, setMailAdjCsv] = useState(true);
  const [mailAdjEstadoCuenta, setMailAdjEstadoCuenta] = useState(true);
  const [mailAdjResumen, setMailAdjResumen] = useState(true);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailLogEstado, setMailLogEstado] = useState<'todos' | 'enviado' | 'error'>('todos');
  const [mailStatus, setMailStatus] = useState<MailStatus>({ enabled: true, message: '' });

  const monedaPred = prefillMoneda || 'CRC';
  const terceroId = Number(prefillTerceroId || 0);
  const filtroKey = useMemo(
    () => `tramites_cobro_filtros:${empresaId}:${terceroId || 'na'}`,
    [empresaId, terceroId]
  );

  const docSeleccionado = useMemo(
    () => docs.find((d) => d.documento_id === docId) || null,
    [docs, docId]
  );

  const totalPendiente = useMemo(
    () => docs.reduce((acc, d) => acc + toNum(d.monto_pendiente), 0),
    [docs]
  );

  const gestionesFiltradas = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return gestiones.filter((g) => {
      if (fSoloAlta && prioridadFromGestion(g, docs) !== 'alta') return false;
      if (fSoloPromesas && String(g.resultado || '').toUpperCase() !== 'PROMESA_PAGO') return false;
      if (fCompromisosVencidos) {
        if (!g.compromiso_fecha) return false;
        if (g.compromiso_fecha >= today) return false;
      }
      return true;
    });
  }, [gestiones, docs, fSoloAlta, fSoloPromesas, fCompromisosVencidos]);

  const mailLogFiltrado = useMemo(() => {
    if (mailLogEstado === 'todos') return mailLog;
    return mailLog.filter((m) => String(m.estado || '').toLowerCase() === mailLogEstado);
  }, [mailLog, mailLogEstado]);

  const mailPreview = useMemo(() => {
    const remitenteVisible = mailStatus.fromEmail || empresaNombre;
    const replyToVisible = mailReplyTo.trim() || mailStatus.defaultReplyTo || extractEmailFromDisplay(mailStatus.fromEmail);
    return buildMailContent({
      clienteNombre: cliente?.razon_social || 'Cliente',
      clienteIdentificacion: cliente?.identificacion || '-',
      totalPendiente,
      moneda: monedaPred,
      tramitesVisibles: gestionesFiltradas.length,
      mailBody,
      empresaNombre,
      remitenteVisible,
      replyToVisible,
    });
  }, [
    cliente?.razon_social,
    cliente?.identificacion,
    totalPendiente,
    monedaPred,
    gestionesFiltradas.length,
    mailBody,
    empresaNombre,
    mailStatus.fromEmail,
    mailStatus.defaultReplyTo,
    mailReplyTo,
  ]);

  const loadCliente = async () => {
    if (!terceroId) {
      setCliente(null);
      return;
    }
    const { data, error } = await supabase
      .from('terceros')
      .select('id,razon_social,identificacion,email')
      .eq('empresa_id', empresaId)
      .eq('id', terceroId)
      .maybeSingle();
    if (error || !data) {
      setCliente(null);
      return;
    }
    setCliente(data as ClienteRow);
  };

  const loadDocs = async () => {
    if (!terceroId || !canView) {
      setDocs([]);
      return;
    }
    const { data, error } = await supabase.rpc('get_cxc_documentos_cartera', {
      p_empresa_id: empresaId,
      p_fecha_corte: new Date().toISOString().slice(0, 10),
      p_tercero_id: terceroId,
      p_moneda: prefillMoneda || null,
    });
    if (error) {
      setErr(error.message || 'No se pudo cargar documentos del cliente.');
      setDocs([]);
      return;
    }
    const rows = (data || []) as DocRow[];
    setDocs(rows);
    if (!rows.some((d) => d.documento_id === docId)) setDocId(rows[0]?.documento_id || 0);
  };

  const loadGestiones = async () => {
    if (!terceroId || !canView) {
      setGestiones([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_cxc_gestion_cobro')
      .select('id,tercero_id,documento_id,numero_documento,fecha_gestion,canal,resultado,compromiso_fecha,compromiso_monto,observacion')
      .eq('empresa_id', empresaId)
      .eq('tercero_id', terceroId)
      .order('fecha_gestion', { ascending: false })
      .order('id', { ascending: false })
      .limit(300);
    if (error) {
      setErr(error.message || 'No se pudo cargar historial de tramites.');
      setGestiones([]);
      return;
    }
    setGestiones((data || []) as GestionRow[]);
  };

  const loadMailLog = async () => {
    if (!terceroId || !canView) {
      setMailLog([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_cxc_correos_bitacora')
      .select('id,created_at,etiqueta_envio,to_email,reply_to,subject,body_text,estado,provider,provider_message_id,attachments_count,created_by_nombre,error_code,error_detail')
      .eq('empresa_id', empresaId)
      .eq('tercero_id', terceroId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(30);
    if (error) {
      setMailLog([]);
      return;
    }
    setMailLog((data || []) as MailLogRow[]);
  };

  const loadMailStatus = async () => {
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey || !empresaId) {
      setMailStatus({ enabled: false, message: 'El envio de correos no esta habilitado. Contacte al administrador.', status: 'not_configured' });
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        setMailStatus({ enabled: false, message: 'Debe iniciar sesion nuevamente para usar el envio de correos.', status: 'session_required' });
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/cxc-notify-client?empresa_id=${empresaId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
        },
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        setMailStatus({ enabled: false, message: 'El envio de correos no esta disponible en este momento.', status: 'unavailable' });
        return;
      }
      setMailStatus({
        enabled: Boolean((payload as Record<string, unknown>)?.enabled),
        message: String((payload as Record<string, unknown>)?.message || ''),
        status: String((payload as Record<string, unknown>)?.status || ''),
        fromEmail: String((payload as Record<string, unknown>)?.from_email || '') || null,
        defaultReplyTo: String((payload as Record<string, unknown>)?.default_reply_to || '') || null,
      });
    } catch {
      setMailStatus({ enabled: false, message: 'El envio de correos no esta disponible en este momento.', status: 'unavailable' });
    }
  };

  const registrar = async (tipo?: 'compromiso' | 'cierre') => {
    if (!canEdit || !terceroId) return;
    if (!obs.trim() && !tipo) {
      setErr('Ingrese observacion del tramite.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const payload = {
        p_empresa_id: empresaId,
        p_tercero_id: terceroId,
        p_documento_id: docId || null,
        p_canal: tipo === 'cierre' ? 'ACUERDO_PAGO' : canal,
        p_resultado: tipo === 'compromiso' ? 'PROMESA_PAGO' : tipo === 'cierre' ? 'PAGO_REALIZADO' : resultado,
        p_compromiso_fecha: tipo === 'cierre' ? null : compromisoFecha || null,
        p_compromiso_monto: tipo === 'cierre' ? null : compromisoMonto > 0 ? compromisoMonto : null,
        p_observacion:
          tipo === 'compromiso'
            ? `[COMPROMISO] ${obs || 'Compromiso de pago registrado.'}`
            : tipo === 'cierre'
              ? `[CIERRE] ${obs || 'Gestion de cobro cerrada por usuario.'}`
              : obs,
      };
      const { error } = await supabase.rpc('registrar_cxc_gestion_cobro', payload);
      if (error) throw error;
      setOk(tipo === 'compromiso' ? 'Compromiso registrado.' : tipo === 'cierre' ? 'Cierre de gestion registrado.' : 'Tramite registrado.');
      setObs('');
      if (tipo !== 'compromiso') {
        setCompromisoFecha('');
        setCompromisoMonto(0);
      }
      await loadGestiones();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo registrar tramite.'));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = (rowsSource: GestionRow[], suffix: 'all' | 'filtrado' = 'all') => {
    if (rowsSource.length === 0) return;
    const headers = ['fecha', 'canal', 'resultado', 'documento', 'compromiso_fecha', 'compromiso_monto', 'observacion'];
    const rows = rowsSource.map((g) => [
      String(g.fecha_gestion || '').replace('T', ' ').slice(0, 16),
      g.canal,
      g.resultado,
      g.numero_documento || '-',
      g.compromiso_fecha || '-',
      g.compromiso_monto ?? '',
      g.observacion || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tramites_cobro_${empresaId}_${terceroId}_${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdf = (rowsSource: GestionRow[], suffix: 'all' | 'filtrado' = 'all') => {
    if (rowsSource.length === 0) return;
    const win = window.open('', '_blank', 'width=1200,height=820');
    if (!win) return;
    const head = '<tr><th>Fecha</th><th>Canal</th><th>Resultado</th><th>Documento</th><th>Compromiso</th><th>Monto</th><th>Observacion</th></tr>';
    const body = rowsSource
      .map((g) => `<tr>
        <td>${String(g.fecha_gestion || '').replace('T', ' ').slice(0, 16)}</td>
        <td>${g.canal}</td><td>${g.resultado}</td><td>${g.numero_documento || '-'}</td>
        <td>${g.compromiso_fecha || '-'}</td><td style="text-align:right">${g.compromiso_monto != null ? g.compromiso_monto : ''}</td>
        <td>${(g.observacion || '').replace(/</g, '&lt;')}</td></tr>`)
      .join('');
    win.document.write(`<html><head><title>Tramites de Cobro</title><style>
      body{font-family:Arial,sans-serif;padding:18px} h1{font-size:18px;margin:0 0 8px}
      table{width:100%;border-collapse:collapse;font-size:12px} th,td{border:1px solid #d1d5db;padding:6px 8px}
      th{background:#f3f4f6;text-align:left}
    </style></head><body><h1>Tramites de Cobro - ${cliente?.razon_social || ''}</h1>
    <table><thead>${head}</thead><tbody>${body}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    try {
      win.document.title = `tramites_cobro_${empresaId}_${terceroId}_${suffix}`;
    } catch {
      // no-op
    }
    win.print();
  };

  const exportMailLogCsv = () => {
    if (mailLogFiltrado.length === 0) return;
    const headers = ['fecha', 'etiqueta', 'destino', 'reply_to', 'asunto', 'estado', 'adjuntos', 'enviado_por', 'detalle'];
    const rows = mailLogFiltrado.map((m) => [
      String(m.created_at || '').replace('T', ' ').slice(0, 16),
      m.etiqueta_envio,
      m.to_email,
      m.reply_to || '',
      m.subject,
      m.estado,
      m.attachments_count ?? 0,
      m.created_by_nombre || '',
      m.error_detail || m.provider_message_id || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cxc_correos_bitacora_${empresaId}_${terceroId}_${mailLogEstado}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportMailLogPdf = () => {
    if (mailLogFiltrado.length === 0) return;
    const win = window.open('', '_blank', 'width=1280,height=820');
    if (!win) return;
    const head = '<tr><th>Fecha</th><th>Etiqueta</th><th>Destino</th><th>Responder a</th><th>Asunto</th><th>Estado</th><th>Adj.</th><th>Enviado por</th><th>Detalle</th></tr>';
    const body = mailLogFiltrado
      .map((m) => `<tr>
        <td>${String(m.created_at || '').replace('T', ' ').slice(0, 16)}</td>
        <td>${escapeHtml(m.etiqueta_envio)}</td>
        <td>${escapeHtml(m.to_email)}</td>
        <td>${escapeHtml(m.reply_to || '-')}</td>
        <td>${escapeHtml(m.subject)}</td>
        <td>${escapeHtml(m.estado)}</td>
        <td style="text-align:right">${m.attachments_count || 0}</td>
        <td>${escapeHtml(m.created_by_nombre || '-')}</td>
        <td>${escapeHtml(m.error_detail || m.provider_message_id || '-')}</td>
      </tr>`)
      .join('');
    win.document.write(`<html><head><title>Bitacora Correos CXC</title><style>
      body{font-family:Arial,sans-serif;padding:18px}
      h1{font-size:18px;margin:0 0 8px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #d1d5db;padding:6px 8px;vertical-align:top}
      th{background:#f3f4f6;text-align:left}
    </style></head><body><h1>Bitacora de Correos - ${escapeHtml(cliente?.razon_social || '')}</h1>
    <table><thead>${head}</thead><tbody>${body}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    try {
      win.document.title = `cxc_correos_bitacora_${empresaId}_${terceroId}_${mailLogEstado}`;
    } catch {
      // no-op
    }
    win.print();
  };

  const cargarReintentoCorreo = (row: MailLogRow) => {
    setMailTo(row.to_email || '');
    setMailReplyTo(row.reply_to || '');
    setMailEtiqueta(row.etiqueta_envio || 'estado_cuenta');
    setMailSubject(row.subject || '');
    setMailBody(
      row.body_text ||
      getMailTemplate(row.etiqueta_envio || 'estado_cuenta', cliente?.razon_social || 'Cliente', totalPendiente, monedaPred).body
    );
    setOk('Correo cargado para reintento. Revise el contenido y envie nuevamente.');
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const abrirPreviewCorreo = () => {
    const win = window.open('', '_blank', 'width=1100,height=820');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Vista previa correo</title><meta charset="utf-8" /></head><body style="margin:0;background:#f8fafc;">${mailPreview.html}</body></html>`);
    win.document.close();
    win.focus();
  };

  const sendMail = async () => {
    if (!terceroId || !mailTo.trim() || !mailSubject.trim() || !mailBody.trim()) {
      setErr('Complete destinatario, asunto y mensaje.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailTo.trim())) {
      setErr('Correo destino invalido.');
      return;
    }

    setMailBusy(true);
    setErr('');
    setOk('');
    try {
      const attachments: Array<{ filename: string; content_base64: string; content_type: string }> = [];

      if (mailAdjCsv) {
        const csvHeaders = ['fecha', 'canal', 'resultado', 'documento', 'compromiso_fecha', 'compromiso_monto', 'observacion'];
        const csvRows = gestionesFiltradas.map((g) => [
          String(g.fecha_gestion || '').replace('T', ' ').slice(0, 16),
          g.canal,
          g.resultado,
          g.numero_documento || '-',
          g.compromiso_fecha || '-',
          g.compromiso_monto ?? '',
          g.observacion || '',
        ]);
        const csv = [csvHeaders.join(','), ...csvRows.map((r) => r.map(esc).join(','))].join('\n');
        attachments.push({
          filename: `tramites_cobro_filtrado_${empresaId}_${terceroId}.csv`,
          content_base64: utf8ToBase64(csv),
          content_type: 'text/csv',
        });
      }

      if (mailAdjEstadoCuenta) {
        const estadoCuentaPdf = buildEstadoCuentaClientePdf({
          empresaNombre,
          clienteNombre: cliente?.razon_social || '-',
          clienteIdentificacion: cliente?.identificacion || '-',
          totalPendiente,
          moneda: monedaPred,
          documentosPendientes: docs,
        });
        attachments.push({
          filename: `estado_cuenta_${empresaId}_${terceroId}.pdf`,
          content_base64: estadoCuentaPdf,
          content_type: 'application/pdf',
        });
      }

      if (mailAdjResumen) {
        const resumenPdf = buildResumenAdjuntoPdf({
          empresaNombre,
          clienteNombre: cliente?.razon_social || '-',
          clienteIdentificacion: cliente?.identificacion || '-',
          totalPendiente,
          moneda: monedaPred,
          tramitesVisibles: gestionesFiltradas.length,
          documentosPendientes: docs,
        });
        attachments.push({
          filename: `resumen_tramites_${empresaId}_${terceroId}.pdf`,
          content_base64: resumenPdf,
          content_type: 'application/pdf',
        });
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
      const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !anonKey) {
        throw new Error('Configuracion de Supabase incompleta en frontend.');
      }
      if (!accessToken) {
        throw new Error('Sesion expirada. Ingrese nuevamente al ERP.');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/cxc-notify-client`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          empresa_id: empresaId,
          tercero_id: terceroId,
          etiqueta_envio: mailEtiqueta.trim() || 'estado_cuenta',
          to_email: mailTo.trim(),
          reply_to: mailReplyTo.trim() || undefined,
          subject: mailSubject.trim(),
          html: mailPreview.html,
          text: mailPreview.text,
          attachments,
        }),
      });

      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        const rawDetail = String(
          (payload as Record<string, unknown>)?.detail ||
          (payload as Record<string, unknown>)?.error ||
          `HTTP ${response.status}`
        );
        const detail = rawDetail === 'missing_email_env'
          ? 'El envio de correos no esta habilitado. Contacte al administrador.'
          : rawDetail === 'insufficient_permissions_cxc'
            ? 'No tiene permisos para enviar correos de cobro.'
            : rawDetail;
        throw new Error(detail);
      }
      if (!(payload as Record<string, unknown>)?.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || 'No se pudo enviar correo.'));
      }
      await loadMailLog();
      setOk(`Notificación enviada a ${mailTo.trim()} (${attachments.length} adjuntos).`);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo enviar notificación por correo.'));
    } finally {
      setMailBusy(false);
    }
  };

  useEffect(() => {
    setErr('');
    setOk('');
    loadCliente();
    loadDocs();
    loadGestiones();
    loadMailLog();
    loadMailStatus();
  }, [empresaId, prefillTerceroId, prefillMoneda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const raw = localStorage.getItem(filtroKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        soloAlta?: boolean;
        soloPromesas?: boolean;
        compromisosVencidos?: boolean;
      };
      setFSoloAlta(Boolean(parsed?.soloAlta));
      setFSoloPromesas(Boolean(parsed?.soloPromesas));
      setFCompromisosVencidos(Boolean(parsed?.compromisosVencidos));
    } catch {
      // no-op
    }
  }, [filtroKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        filtroKey,
        JSON.stringify({
          soloAlta: fSoloAlta,
          soloPromesas: fSoloPromesas,
          compromisosVencidos: fCompromisosVencidos,
        })
      );
    } catch {
      // no-op
    }
  }, [filtroKey, fSoloAlta, fSoloPromesas, fCompromisosVencidos]);

  useEffect(() => {
    setMailTo(String(cliente?.email || '').trim());
    setMailReplyTo('');
    setMailEtiqueta('estado_cuenta');
  }, [cliente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const plantilla = getMailTemplate(mailEtiqueta, cliente?.razon_social || 'Cliente', totalPendiente, monedaPred);
    setMailSubject(plantilla.subject);
    setMailBody(plantilla.body);
  }, [mailEtiqueta, cliente?.razon_social, totalPendiente, monedaPred]);

  return (
    <>
      <style>{styles}</style>
      <div className="tc-wrap">
        <div className="tc-title">Tramites de Cobro</div>
        <div className="tc-sub">Seguimiento de cobro por cliente recibido desde Gestion de Cobro.</div>
        <div className="tc-actions" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="tc-btn" type="button" onClick={() => onVolverGestion?.()}>Volver a Gestion</button>
          <button className="tc-btn" type="button" onClick={() => onAbrirRecaudacion?.({ terceroId, moneda: prefillMoneda || undefined })} disabled={!terceroId}>Ir a Recaudacion</button>
          <button className="tc-btn" type="button" onClick={() => exportCsv(gestiones, 'all')} disabled={gestiones.length === 0}>Exportar CSV</button>
          <button className="tc-btn" type="button" onClick={() => exportPdf(gestiones, 'all')} disabled={gestiones.length === 0}>Exportar PDF</button>
          <button className="tc-btn" type="button" onClick={() => exportCsv(gestionesFiltradas, 'filtrado')} disabled={gestionesFiltradas.length === 0}>Exportar CSV (filtrado)</button>
          <button className="tc-btn" type="button" onClick={() => exportPdf(gestionesFiltradas, 'filtrado')} disabled={gestionesFiltradas.length === 0}>Exportar PDF (filtrado)</button>
        </div>

        {ok ? <div className="tc-msg-ok">{ok}</div> : null}
        {err ? <div className="tc-msg-err">{err}</div> : null}

        {!terceroId ? (
          <div className="tc-card">
            <div className="tc-empty">Abra esta vista desde Gestion de Cobro seleccionando un cliente.</div>
          </div>
        ) : (
          <>
            <div className="tc-card">
              <div className="tc-grid">
                <div className="tc-field">
                  <label>Cliente</label>
                  <input className="tc-input" value={cliente ? `${cliente.razon_social} (${cliente.identificacion || '-'})` : ''} disabled />
                </div>
                <div className="tc-field">
                  <label>Moneda</label>
                  <input className="tc-input" value={monedaPred} disabled />
                </div>
                <div className="tc-field">
                  <label>Documentos</label>
                  <input className="tc-input num" value={String(docs.length)} disabled />
                </div>
                <div className="tc-field">
                  <label>Pendiente</label>
                  <input className="tc-input num" value={money(totalPendiente, monedaPred)} disabled />
                </div>
              </div>
            </div>

            <div className="tc-card">
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Nuevo tramite</div>
              <div className="tc-grid">
                <div className="tc-field">
                  <label>Documento</label>
                  <select className="tc-select" value={docId} onChange={(e) => setDocId(Number(e.target.value || 0))} disabled={!canEdit || busy}>
                    <option value={0}>Sin documento especifico</option>
                    {docs.map((d) => (
                      <option key={d.documento_id} value={d.documento_id}>
                        {d.numero_documento} | {money(d.monto_pendiente, d.moneda)} | {d.dias_vencidos} dias
                      </option>
                    ))}
                  </select>
                </div>
                <div className="tc-field">
                  <label>Canal</label>
                  <select className="tc-select" value={canal} onChange={(e) => setCanal(e.target.value)} disabled={!canEdit || busy}>
                    <option value="LLAMADA">Llamada</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="CORREO">Correo</option>
                    <option value="VISITA">Visita</option>
                    <option value="ACUERDO_PAGO">Acuerdo pago</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>
                <div className="tc-field">
                  <label>Resultado</label>
                  <select className="tc-select" value={resultado} onChange={(e) => setResultado(e.target.value)} disabled={!canEdit || busy}>
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="PROMESA_PAGO">Promesa de pago</option>
                    <option value="NO_LOCALIZADO">No localizado</option>
                    <option value="RECHAZO">Rechazo</option>
                    <option value="PAGO_REALIZADO">Pago realizado</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>
                <div className="tc-field">
                  <label>Compromiso fecha</label>
                  <input className="tc-input" type="date" value={compromisoFecha} onChange={(e) => setCompromisoFecha(e.target.value)} disabled={!canEdit || busy} />
                </div>
                <div className="tc-field">
                  <label>Compromiso monto</label>
                  <input className="tc-input num" type="number" step="0.01" value={compromisoMonto} onChange={(e) => setCompromisoMonto(toNum(e.target.value))} disabled={!canEdit || busy} />
                </div>
                <div className="tc-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Observacion</label>
                  <textarea className="tc-input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} disabled={!canEdit || busy} />
                </div>
              </div>
              <div className="tc-actions" style={{ marginTop: 10 }}>
                <button className="tc-btn main" type="button" onClick={() => registrar()} disabled={!canEdit || busy}>Nuevo tramite</button>
                <button className="tc-btn" type="button" onClick={() => registrar('compromiso')} disabled={!canEdit || busy || !compromisoFecha}>Marcar compromiso</button>
                <button className="tc-btn" type="button" onClick={() => registrar('cierre')} disabled={!canEdit || busy}>Cerrar gestion</button>
                <button className="tc-btn" type="button" onClick={() => {
                  const g = gestiones[0];
                  if (!g) return;
                  setDocId(g.documento_id || 0);
                  setCanal(g.canal || 'LLAMADA');
                  setResultado(g.resultado || 'PENDIENTE');
                  setCompromisoFecha(g.compromiso_fecha || '');
                  setCompromisoMonto(toNum(g.compromiso_monto));
                  setObs(g.observacion || '');
                }} disabled={gestiones.length === 0 || busy}>
                  Editar (cargar ultimo)
                </button>
                <button className="tc-btn" type="button" onClick={() => loadGestiones()} disabled={busy}>Recargar historial</button>
              </div>
              {docSeleccionado ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#8ea3c7' }}>
                  Documento activo: {docSeleccionado.numero_documento} | Pendiente {money(docSeleccionado.monto_pendiente, docSeleccionado.moneda)}
                </div>
              ) : null}
            </div>

            <div className="tc-card">
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Notificacion por correo al cliente</div>
              <div className={mailStatus.enabled ? 'tc-msg-ok' : 'tc-msg-err'} style={{ marginBottom: 8 }}>
                {mailStatus.message || (mailStatus.enabled ? 'Envio de correos habilitado.' : 'El envio de correos no esta habilitado.')}
              </div>
              {isAdmin ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div className="tc-field">
                    <label>Diagnostico</label>
                    <input className="tc-input" value={mailStatus.status || '-'} disabled />
                  </div>
                  <div className="tc-field">
                    <label>Estado funcional</label>
                    <input className="tc-input" value={mailStatus.enabled ? 'Habilitado' : 'No habilitado'} disabled />
                  </div>
                  <div className="tc-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Remitente configurado</label>
                    <input className="tc-input" value={mailStatus.fromEmail || '-'} disabled />
                  </div>
                  <div className="tc-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Reply-to por defecto</label>
                    <input className="tc-input" value={mailStatus.defaultReplyTo || '-'} disabled />
                  </div>
                </div>
              ) : null}
              <div className="tc-grid">
                <div className="tc-field">
                  <label>Correo destino</label>
                  <input className="tc-input" value={mailTo} onChange={(e) => setMailTo(e.target.value)} disabled={mailBusy || !mailStatus.enabled} />
                </div>
                <div className="tc-field">
                  <label>Etiqueta de envio</label>
                  <select className="tc-select" value={mailEtiqueta} onChange={(e) => setMailEtiqueta(e.target.value)} disabled={mailBusy || !mailStatus.enabled}>
                    <option value="estado_cuenta">Estado de cuenta</option>
                    <option value="recordatorio">Recordatorio</option>
                    <option value="promesa_vencida">Promesa vencida</option>
                    <option value="aviso_formal">Aviso formal</option>
                  </select>
                </div>
                <div className="tc-field">
                  <label>Responder a</label>
                  <input
                    className="tc-input"
                    value={mailReplyTo}
                    onChange={(e) => setMailReplyTo(e.target.value)}
                    placeholder="cobros@visionzn.net"
                    disabled={mailBusy || !mailStatus.enabled}
                  />
                </div>
                <div className="tc-field">
                  <label>Asunto</label>
                  <input className="tc-input" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} disabled={mailBusy || !mailStatus.enabled} />
                </div>
                <div className="tc-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Mensaje</label>
                  <textarea className="tc-input" rows={3} value={mailBody} onChange={(e) => setMailBody(e.target.value)} disabled={mailBusy || !mailStatus.enabled} />
                </div>
              </div>
              <div className="tc-actions" style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, color: '#8ea3c7', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={mailAdjCsv} onChange={(e) => setMailAdjCsv(e.target.checked)} disabled={mailBusy || !mailStatus.enabled} />
                  Adjuntar CSV filtrado
                </label>
                <label style={{ fontSize: 12, color: '#8ea3c7', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={mailAdjEstadoCuenta} onChange={(e) => setMailAdjEstadoCuenta(e.target.checked)} disabled={mailBusy || !mailStatus.enabled} />
                  Adjuntar estado de cuenta
                </label>
                <label style={{ fontSize: 12, color: '#8ea3c7', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={mailAdjResumen} onChange={(e) => setMailAdjResumen(e.target.checked)} disabled={mailBusy || !mailStatus.enabled} />
                  Adjuntar resumen ejecutivo
                </label>
                <button className="tc-btn main" type="button" onClick={sendMail} disabled={mailBusy || !mailStatus.enabled || !mailTo.trim() || !mailSubject.trim() || !mailBody.trim()}>
                  {mailBusy ? 'Enviando...' : 'Enviar notificacion'}
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="tc-actions" style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c7', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                    Vista previa del correo
                  </div>
                  <button className="tc-btn" type="button" onClick={abrirPreviewCorreo}>
                    Abrir preview
                  </button>
                </div>
                <div style={{ border: '1px solid rgba(137,160,201,0.18)', borderRadius: 12, overflow: 'hidden', background: '#0f1726' }}>
                  <iframe
                    title="Vista previa correo"
                    srcDoc={mailPreview.html}
                    style={{ width: '100%', height: 520, border: 'none', background: '#0f1726' }}
                  />
                </div>
              </div>
            </div>

            <div className="tc-card">
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Bitacora de correos enviados</div>
              <div className="tc-actions" style={{ marginBottom: 8 }}>
                <button className={`tc-btn ${mailLogEstado === 'todos' ? 'main' : ''}`} type="button" onClick={() => setMailLogEstado('todos')}>Todos</button>
                <button className={`tc-btn ${mailLogEstado === 'enviado' ? 'main' : ''}`} type="button" onClick={() => setMailLogEstado('enviado')}>Enviados</button>
                <button className={`tc-btn ${mailLogEstado === 'error' ? 'main' : ''}`} type="button" onClick={() => setMailLogEstado('error')}>Errores</button>
                <button className="tc-btn" type="button" onClick={exportMailLogCsv} disabled={mailLogFiltrado.length === 0}>Exportar CSV</button>
                <button className="tc-btn" type="button" onClick={exportMailLogPdf} disabled={mailLogFiltrado.length === 0}>Exportar PDF</button>
                <button className="tc-btn" type="button" onClick={() => loadMailLog()} disabled={mailBusy}>Recargar bitacora</button>
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#8ea3c7' }}>
                  Registros: {mailLogFiltrado.length} de {mailLog.length}
                </div>
              </div>
              <div className="tc-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Etiqueta</th>
                      <th>Destino</th>
                      <th>Responder a</th>
                      <th>Asunto</th>
                      <th>Estado</th>
                      <th>Adj.</th>
                      <th>Enviado por</th>
                      <th>Detalle</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mailLogFiltrado.length === 0 ? (
                      <tr><td colSpan={10} className="tc-empty">Sin correos registrados para este cliente.</td></tr>
                    ) : mailLogFiltrado.map((m) => (
                      <tr key={m.id}>
                        <td>{String(m.created_at || '').replace('T', ' ').slice(0, 16)}</td>
                        <td>{m.etiqueta_envio || '-'}</td>
                        <td>{m.to_email}</td>
                        <td>{m.reply_to || '-'}</td>
                        <td>{m.subject}</td>
                        <td>
                          <span className={`tc-badge ${m.estado === 'enviado' ? 'res-ok' : 'res-err'}`}>
                            {m.estado}
                          </span>
                        </td>
                        <td className="tc-right">{m.attachments_count || 0}</td>
                        <td>{m.created_by_nombre || '-'}</td>
                        <td>{m.error_detail || m.provider_message_id || '-'}</td>
                        <td>
                          <button className="tc-btn" type="button" onClick={() => cargarReintentoCorreo(m)} disabled={mailBusy}>
                            Reintentar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="tc-card">
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Historial de tramites</div>
              <div className="tc-actions" style={{ marginBottom: 8 }}>
                <button className={`tc-btn ${fSoloAlta ? 'main' : ''}`} type="button" onClick={() => setFSoloAlta((v) => !v)}>Solo alta</button>
                <button className={`tc-btn ${fSoloPromesas ? 'main' : ''}`} type="button" onClick={() => setFSoloPromesas((v) => !v)}>Solo promesas</button>
                <button className={`tc-btn ${fCompromisosVencidos ? 'main' : ''}`} type="button" onClick={() => setFCompromisosVencidos((v) => !v)}>Compromisos vencidos</button>
                <button
                  className="tc-btn"
                  type="button"
                  onClick={() => {
                    setFSoloAlta(false);
                    setFSoloPromesas(false);
                    setFCompromisosVencidos(false);
                  }}
                >
                  Limpiar filtros
                </button>
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#8ea3c7' }}>
                  Mostrando {gestionesFiltradas.length} de {gestiones.length}
                </div>
              </div>
              <div className="tc-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Canal</th>
                      <th>Resultado</th>
                      <th>Documento</th>
                      <th>Prioridad</th>
                      <th>Compromiso</th>
                      <th className="tc-right">Monto</th>
                      <th>Observacion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gestionesFiltradas.length === 0 ? (
                      <tr><td colSpan={8} className="tc-empty">Sin tramites para este cliente.</td></tr>
                    ) : gestionesFiltradas.map((g) => (
                      <tr
                        key={g.id}
                        className={
                          prioridadFromGestion(g, docs) === 'alta'
                            ? 'tc-row-prio-alta'
                            : prioridadFromGestion(g, docs) === 'media'
                              ? 'tc-row-prio-media'
                              : ''
                        }
                      >
                        <td>{String(g.fecha_gestion || '').replace('T', ' ').slice(0, 16)}</td>
                        <td><span className="tc-badge ch-neutral">{g.canal}</span></td>
                        <td><span className={`tc-badge ${resultadoClass(g.resultado)}`}>{g.resultado}</span></td>
                        <td>{g.numero_documento || '-'}</td>
                        <td>
                          <span className={`tc-badge ${
                            prioridadFromGestion(g, docs) === 'alta'
                              ? 'res-err'
                              : prioridadFromGestion(g, docs) === 'media'
                                ? 'res-warn'
                                : 'res-ok'
                          }`}>
                            {prioridadFromGestion(g, docs)}
                          </span>
                        </td>
                        <td>{g.compromiso_fecha || '-'}</td>
                        <td className="tc-right">{g.compromiso_monto != null ? money(g.compromiso_monto, docSeleccionado?.moneda || monedaPred) : '-'}</td>
                        <td>{g.observacion || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}







