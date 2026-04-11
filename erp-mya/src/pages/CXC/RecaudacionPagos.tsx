import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../../supabase';

interface RecaudacionPagosProps {
  empresaId: number;
  empresaNombre?: string;
  canView?: boolean;
  canEdit?: boolean;
  prefillTerceroId?: number | null;
  prefillMoneda?: 'CRC' | 'USD' | null;
  onAbrirReportes?: () => void;
}

interface ClienteOpt {
  id: number;
  razon_social: string;
  identificacion: string | null;
}

interface DocumentoPendienteRow {
  documento_id: number;
  tercero_id: number;
  tercero_nombre: string;
  tercero_identificacion: string;
  tipo_documento: string;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  moneda: 'CRC' | 'USD' | string;
  monto_original: number;
  monto_pendiente: number;
  dias_vencidos: number;
  bucket: string;
}

interface PagoRow {
  id: number;
  tercero_id: number;
  tercero_nombre: string;
  tercero_identificacion: string | null;
  fecha_pago: string;
  moneda: 'CRC' | 'USD' | string;
  tipo_cambio: number;
  monto_total: number;
  monto_aplicado: number;
  monto_no_aplicado: number;
  monto_ajuste: number;
  medio_pago: string;
  referencia: string | null;
  observacion: string | null;
  motivo_diferencia: string | null;
  estado: string;
  asiento_id: number | null;
  turno_id: number | null;
}

interface ReciboDetalleRow {
  id: number;
  pago_id: number;
  documento_id: number;
  numero_documento: string;
  tipo_documento: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  moneda: 'CRC' | 'USD' | string;
  monto_original: number;
  monto_pendiente: number;
  monto_aplicado: number;
  observacion: string | null;
}

interface AuxiliarBancoRow {
  id: number;
  pago_id: number;
  tercero_nombre: string;
  tercero_identificacion: string | null;
  fecha_movimiento: string;
  moneda: 'CRC' | 'USD' | string;
  monto: number;
  referencia: string | null;
  estado_conciliacion: string;
  conciliado_en?: string | null;
  estado_pago?: string;
  asiento_id?: number | null;
}

interface PuntoVentaRow {
  id: number;
  codigo: string;
  nombre: string;
}

interface CajaRow {
  id: number;
  punto_venta_id: number;
  codigo: string;
  nombre: string;
}

interface CuentaBancoOpt {
  id: number;
  codigo: string;
  alias: string;
  banco_nombre: string;
  moneda: 'CRC' | 'USD';
  numero_cuenta: string;
  activo: boolean;
}

interface TurnoCajaRow {
  id: number;
  empresa_id: number;
  punto_venta_id: number;
  punto_venta_codigo: string;
  punto_venta_nombre: string;
  caja_id: number;
  caja_codigo: string;
  caja_nombre: string;
  estado: string;
  fecha_hora_apertura: string;
}

const styles = `
  .rec-wrap { padding:0; color:#d6e2ff; }
  .rec-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:6px; }
  .rec-sub { font-size:12px; color:#8ea3c7; margin-bottom:12px; }
  .rec-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; padding:12px; margin-bottom:12px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .rec-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px; align-items:end; }
  .rec-field { display:flex; flex-direction:column; gap:4px; }
  .rec-field label { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .rec-input, .rec-select { width:100%; border:1px solid rgba(137,160,201,0.22); border-radius:12px; padding:10px 12px; font-size:13px; background:#1d2738; color:#f3f7ff; }
  .rec-input.num { text-align:right; font-family:'DM Mono',monospace; }
  .rec-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .rec-btn { border:1px solid rgba(137,160,201,0.18); background:#243149; color:#d6e2ff; border-radius:10px; padding:8px 11px; font-size:13px; cursor:pointer; }
  .rec-btn.main { border-color:#16a34a; background:#16a34a; color:#fff; }
  .rec-btn.warn { border-color:#7d2f3a; color:#ffb3bb; background:#34181c; }
  .rec-btn:disabled { opacity:.6; cursor:not-allowed; }
  .rec-msg-ok { margin-bottom:10px; border:1px solid #1d6e4f; background:#0f2c20; color:#9df4c7; border-radius:12px; padding:10px 12px; font-size:12px; }
  .rec-msg-err { margin-bottom:10px; border:1px solid #7d2f3a; background:#34181c; color:#ffb3bb; border-radius:12px; padding:10px 12px; font-size:12px; }
  .rec-table { border:1px solid rgba(137,160,201,0.18); border-radius:12px; overflow:auto; background:#1d2738; }
  .rec-table table { width:100%; border-collapse:collapse; min-width:1080px; }
  .rec-table th, .rec-table td { padding:8px 10px; border-top:1px solid rgba(137,160,201,0.12); font-size:12px; color:#d6e2ff; }
  .rec-table th { background:#131b2a; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-size:11px; text-align:left; }
  .rec-right { text-align:right; font-family:'DM Mono',monospace; }
  .rec-empty { color:#8ea3c7; font-size:12px; padding:10px; text-align:center; }
  .rec-totals { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px; margin-top:10px; }
  .rec-kpi { border:1px solid rgba(137,160,201,0.18); border-radius:12px; padding:10px; background:#1d2738; }
  .rec-kpi .k { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .rec-kpi .v { margin-top:5px; font-size:18px; font-weight:700; color:#f3f7ff; }
  .rec-kpi .v.warn { color:#ffd66f; }
  .rec-kpi .v.err { color:#ffb3bb; }
  @media (max-width: 1100px) { .rec-grid, .rec-totals { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 760px) { .rec-grid, .rec-totals { grid-template-columns: 1fr; } }
`;

const money = (n: number, m: 'CRC' | 'USD' | string = 'CRC') =>
  new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: m === 'USD' ? 'USD' : 'CRC',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const toNum = (v: string | number | null | undefined) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
};

const parseMontoInput = (raw: string): number => {
  const v = String(raw || '').trim();
  if (!v) return 0;
  if (v.includes(',')) {
    // Formato comun en CR: 1.234,56
    const normalized = v.replace(/\./g, '').replace(',', '.');
    return toNum(normalized);
  }
  // Formato alterno: 1234.56
  return toNum(v.replace(/,/g, ''));
};

const formatMontoInput = (n: number): string =>
  new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNum(n));

const formatTipoCambioInput = (n: number): string =>
  new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(toNum(n));

const moneyPdf = (n: number, m: 'CRC' | 'USD' | string = 'CRC') => {
  const amount = new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
  return (m === 'USD' ? '$' : '\u00a2') + ' ' + amount;
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const pdfSafeText = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/\u20a1/g, 'CRC ')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
};

const docTypePrefix = (tipo: string | null | undefined) => {
  const key = String(tipo || '').toUpperCase().trim();
  if (key === 'FACTURA') return 'FAC';
  if (key === 'NOTA_CREDITO' || key === 'NOTA DE CREDITO') return 'NCR';
  if (key === 'NOTA_DEBITO' || key === 'NOTA DE DEBITO') return 'NDB';
  if (key === 'RECIBO') return 'REC';
  return key.slice(0, 3) || 'DOC';
};

const buildReciboCobroHtml = ({
  empresaNombre,
  pago,
  detalles,
}: {
  empresaNombre: string;
  pago: PagoRow;
  detalles: ReciboDetalleRow[];
}) => {
  const totalDocs = detalles.reduce((acc, item) => acc + toNum(item.monto_aplicado), 0);
  const rows = detalles.map((item, index) => `
    <tr style="background:${index % 2 === 0 ? '#f8fafc' : '#ffffff'}">
      <td style="padding:10px 12px;border-top:1px solid #e2e8f0">${escapeHtml(`${docTypePrefix(item.tipo_documento)}-${item.numero_documento}`)}</td>
      <td style="padding:10px 12px;border-top:1px solid #e2e8f0">${escapeHtml(item.fecha_emision)}</td>
      <td style="padding:10px 12px;border-top:1px solid #e2e8f0">${escapeHtml(item.fecha_vencimiento || '-')}</td>
      <td style="padding:10px 12px;border-top:1px solid #e2e8f0;text-align:right;font-family:monospace">${escapeHtml(money(item.monto_aplicado, item.moneda))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html>
    <head><meta charset="utf-8" /><title>Recibo de cobro #${pago.id}</title></head>
    <body style="margin:0;background:#eef4f1;font-family:Arial,sans-serif;color:#10221a">
      <div style="max-width:900px;margin:0 auto;padding:24px">
        <div style="background:#fff;border:1px solid #dbe5df;border-radius:18px;overflow:hidden">
          <div style="background:#0f2a1d;color:#fff;padding:20px 24px">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Recibo de cobro</div>
            <div style="font-size:24px;font-weight:700;margin-top:6px">${escapeHtml(empresaNombre)}</div>
            <div style="font-size:13px;opacity:.9;margin-top:4px">Comprobante de pago aplicado</div>
          </div>
          <div style="padding:22px 24px">
            <div style="display:grid;grid-template-columns:1.4fr .6fr;gap:12px">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px">
                <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:.05em">Cliente</div>
                <div style="font-size:18px;font-weight:700;margin-top:6px">${escapeHtml(pago.tercero_nombre)}</div>
                <div style="font-size:13px;color:#475569;margin-top:5px">${escapeHtml(pago.tercero_identificacion || '-')}</div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px">
                <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:.05em">Recibo</div>
                <div style="font-size:18px;font-weight:700;margin-top:6px">#${pago.id}</div>
                <div style="font-size:13px;color:#475569;margin-top:5px">${escapeHtml(pago.fecha_pago)}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px">
                <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:.05em">Forma de pago</div>
                <div style="font-size:16px;font-weight:700;margin-top:8px">${escapeHtml(pago.medio_pago)}</div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px">
                <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:.05em">Monto recibido</div>
                <div style="font-size:16px;font-weight:700;margin-top:8px">${escapeHtml(money(pago.monto_total, pago.moneda))}</div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px">
                <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:.05em">Aplicado</div>
                <div style="font-size:16px;font-weight:700;margin-top:8px">${escapeHtml(money(totalDocs, pago.moneda))}</div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px">
                <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:.05em">No aplicado</div>
                <div style="font-size:16px;font-weight:700;margin-top:8px">${escapeHtml(money(pago.monto_no_aplicado, pago.moneda))}</div>
              </div>
            </div>
            <div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
              <div style="padding:14px 16px;background:#f8fafc;font-size:13px;font-weight:700;color:#334155">Documentos aplicados</div>
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                  <tr>
                    <th style="padding:10px 12px;text-align:left;color:#64748b;text-transform:uppercase;font-size:11px;letter-spacing:.05em">Documento</th>
                    <th style="padding:10px 12px;text-align:left;color:#64748b;text-transform:uppercase;font-size:11px;letter-spacing:.05em">Emision</th>
                    <th style="padding:10px 12px;text-align:left;color:#64748b;text-transform:uppercase;font-size:11px;letter-spacing:.05em">Vence</th>
                    <th style="padding:10px 12px;text-align:right;color:#64748b;text-transform:uppercase;font-size:11px;letter-spacing:.05em">Aplicado</th>
                  </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="4" style="padding:14px 12px;color:#64748b">Sin documentos aplicados.</td></tr>'}</tbody>
              </table>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
              <div style="font-size:13px;color:#475569;line-height:1.7">
                Referencia: <strong>${escapeHtml(pago.referencia || '-')}</strong><br/>
                Detalle: <strong>${escapeHtml(pago.observacion || '-')}</strong><br/>
                Ajuste: <strong>${escapeHtml(money(pago.monto_ajuste || 0, pago.moneda))}</strong><br/>
                Motivo diferencia: <strong>${escapeHtml(pago.motivo_diferencia || '-')}</strong>
              </div>
              <div style="text-align:right;font-size:13px;color:#475569;line-height:1.7">
                Estado: <strong>${escapeHtml(pago.estado)}</strong><br/>
                Tipo de cambio: <strong>${escapeHtml(String(pago.tipo_cambio || 1))}</strong><br/>
                Turno: <strong>${escapeHtml(pago.turno_id || '-')}</strong>
              </div>
            </div>
            <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">
              Este recibo fue generado por el ERP como soporte del cobro aplicado.
            </div>
          </div>
        </div>
      </div>
    </body>
  </html>`;
};

const buildReciboCobroPdf = ({
  empresaNombre,
  pago,
  detalles,
}: {
  empresaNombre: string;
  pago: PagoRow;
  detalles: ReciboDetalleRow[];
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
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
  doc.roundedRect(margin, y, contentWidth, 74, 14, 14, 'F');
  drawLine('RECIBO DE COBRO', margin + 20, y + 24, { size: 10, color: [220, 252, 231], weight: 'bold' });
  drawLine(empresaNombre, margin + 20, y + 46, { size: 14, color: [255, 255, 255], weight: 'bold' });
  drawLine(`Recibo #${pago.id}`, margin + contentWidth - 20, y + 24, { size: 10, color: [220, 252, 231], align: 'right', weight: 'bold' });
  drawLine(`Fecha ${pago.fecha_pago}`, margin + contentWidth - 20, y + 46, { size: 9, color: [226, 232, 240], align: 'right' });
  y += 92;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 72, 12, 12, 'FD');
  drawLine('Cliente', margin + 16, y + 20, { size: 8, color: [100, 116, 139] });
  drawLine(pago.tercero_nombre, margin + 16, y + 42, { size: 13, weight: 'bold' });
  drawLine(pago.tercero_identificacion || '-', margin + 16, y + 60, { size: 10, color: [71, 85, 105] });
  drawLine('Forma de pago', margin + contentWidth - 170, y + 20, { size: 8, color: [100, 116, 139] });
  drawLine(pago.medio_pago, margin + contentWidth - 170, y + 42, { size: 12, weight: 'bold' });
  y += 90;

  const kpiWidth = (contentWidth - 24) / 3;
  [
    { label: 'Monto recibido', value: moneyPdf(pago.monto_total, pago.moneda) },
    { label: 'Aplicado', value: moneyPdf(pago.monto_aplicado, pago.moneda) },
    { label: 'No aplicado', value: moneyPdf(pago.monto_no_aplicado, pago.moneda) },
  ].forEach((item, index) => {
    const x = margin + index * (kpiWidth + 12);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, kpiWidth, 62, 12, 12, 'FD');
    drawLine(item.label, x + 14, y + 18, { size: 8, color: [100, 116, 139] });
    drawLine(item.value, x + 14, y + 42, { size: 14, weight: 'bold' });
  });
  y += 82;

  drawLine('Documentos aplicados', margin, y, { size: 13, weight: 'bold' });
  y += 18;
  const colDoc = margin + 12;
  const colEmision = margin + 250;
  const colVence = margin + 338;
  const colMonto = margin + contentWidth - 12;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 28, 8, 8, 'F');
  drawLine('Documento', colDoc, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold' });
  drawLine('Emision', colEmision, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold' });
  drawLine('Vence', colVence, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold' });
  drawLine('Aplicado', colMonto, y + 18, { size: 9, color: [100, 116, 139], weight: 'bold', align: 'right' });
  y += 34;

  if (!detalles.length) {
    doc.roundedRect(margin, y, contentWidth, 32, 8, 8, 'S');
    drawLine('Sin detalle aplicado para este recibo.', margin + 12, y + 20, { size: 10, color: [100, 116, 139] });
    y += 42;
  } else {
    detalles.forEach((item, index) => {
      ensureSpace(34);
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 2, contentWidth, 26, 'F');
      }
      drawLine(`${docTypePrefix(item.tipo_documento)}-${item.numero_documento}`, colDoc, y + 14, { size: 9 });
      drawLine(item.fecha_emision, colEmision, y + 14, { size: 9 });
      drawLine(item.fecha_vencimiento || '-', colVence, y + 14, { size: 9 });
      drawLine(moneyPdf(item.monto_aplicado, item.moneda), colMonto, y + 14, { size: 9, align: 'right', weight: 'bold' });
      y += 26;
    });
  }

  ensureSpace(110);
  y += 14;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, margin + contentWidth, y);
  y += 18;
  drawLine(`Referencia: ${pago.referencia || '-'}`, margin, y, { size: 9, color: [71, 85, 105] });
  y += 14;
  drawLine(`Detalle: ${pago.observacion || '-'}`, margin, y, { size: 9, color: [71, 85, 105] });
  y += 14;
  drawLine(`Ajuste: ${moneyPdf(pago.monto_ajuste || 0, pago.moneda)}`, margin, y, { size: 9, color: [71, 85, 105] });
  y += 14;
  drawLine(`Motivo diferencia: ${pago.motivo_diferencia || '-'}`, margin, y, { size: 9, color: [71, 85, 105] });
  y += 34;
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y, margin + 170, y);
  y += 16;
  drawLine('Firma y sello', margin, y, { size: 9, color: [71, 85, 105], weight: 'bold' });
  y += 14;
  drawLine(empresaNombre, margin, y, { size: 10, weight: 'bold' });

  return doc;
};

export default function RecaudacionPagos({
  empresaId,
  empresaNombre = 'ERP MYA',
  canView = true,
  canEdit = false,
  prefillTerceroId = null,
  prefillMoneda = null,
  onAbrirReportes,
}: RecaudacionPagosProps) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [clienteId, setClienteId] = useState<number>(0);
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [moneda, setMoneda] = useState<'CRC' | 'USD'>('CRC');
  const [tipoCambio, setTipoCambio] = useState<number>(1);
  const [tipoCambioTexto, setTipoCambioTexto] = useState<string>('1,00');
  const [montoRecibido, setMontoRecibido] = useState<number>(0);
  const [montoRecibidoTexto, setMontoRecibidoTexto] = useState<string>('');
  const [montoAjuste, setMontoAjuste] = useState<number>(0);
  const [montoAjusteTexto, setMontoAjusteTexto] = useState<string>('');
  const [motivoDiferencia, setMotivoDiferencia] = useState('');
  const [montoRecibidoAuto, setMontoRecibidoAuto] = useState<boolean>(true);
  const [medioPago, setMedioPago] = useState('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [detalleRecibo, setDetalleRecibo] = useState('');
  const [puntosVenta, setPuntosVenta] = useState<PuntoVentaRow[]>([]);
  const [cajas, setCajas] = useState<CajaRow[]>([]);
  const [cuentasBanco, setCuentasBanco] = useState<CuentaBancoOpt[]>([]);
  const [turnosAbiertos, setTurnosAbiertos] = useState<TurnoCajaRow[]>([]);
  const [turnosLoading, setTurnosLoading] = useState<boolean>(true);
  const [puntoVentaId, setPuntoVentaId] = useState<number>(0);
  const [cajaId, setCajaId] = useState<number>(0);
  const [turnoId, setTurnoId] = useState<number>(0);
  const [cuentaBancoId, setCuentaBancoId] = useState<number>(0);

  const [documentosPendientes, setDocumentosPendientes] = useState<DocumentoPendienteRow[]>([]);
  const [pagosPorDocumento, setPagosPorDocumento] = useState<Record<number, number>>({});
  const [pagosTextoPorDocumento, setPagosTextoPorDocumento] = useState<Record<number, string>>({});
  const pagoInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [auxiliarBanco, setAuxiliarBanco] = useState<AuxiliarBancoRow[]>([]);
  const [historialPagoId, setHistorialPagoId] = useState<number | null>(null);
  const [historialAsientoId, setHistorialAsientoId] = useState<number>(0);
  const [reciboPago, setReciboPago] = useState<PagoRow | null>(null);
  const [reciboDetalles, setReciboDetalles] = useState<ReciboDetalleRow[]>([]);
  const [auxFiltroTexto, setAuxFiltroTexto] = useState('');
  const [auxFiltroMoneda, setAuxFiltroMoneda] = useState<'TODAS' | 'CRC' | 'USD'>('TODAS');
  const [auxFiltroEstado, setAuxFiltroEstado] = useState<'TODOS' | 'pendiente' | 'conciliado' | 'anulado'>('TODOS');
  const [auxSeleccionadoId, setAuxSeleccionadoId] = useState<number | null>(null);

  const clienteSeleccionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) || null,
    [clientes, clienteId]
  );
  const clientePrefijado = Number(prefillTerceroId || 0) > 0 && Number(clienteId || 0) === Number(prefillTerceroId || 0);

  const totalAplicado = useMemo(
    () => Object.values(pagosPorDocumento).reduce((acc, v) => acc + toNum(v), 0),
    [pagosPorDocumento]
  );

  const montoDisponibleAplicacion = useMemo(
    () => toNum(montoRecibido) + toNum(montoAjuste),
    [montoRecibido, montoAjuste]
  );

  const montoNoAplicado = useMemo(
    () => montoDisponibleAplicacion - totalAplicado,
    [montoDisponibleAplicacion, totalAplicado]
  );

  const diferenciaSinAjuste = useMemo(
    () => totalAplicado - toNum(montoRecibido),
    [totalAplicado, montoRecibido]
  );
  const requiereAjuste = diferenciaSinAjuste > 0.0001;

  const orderedDocumentoIds = useMemo(
    () => documentosPendientes.map((d) => d.documento_id),
    [documentosPendientes]
  );

  const turnoActivo = useMemo(
    () => turnosAbiertos.find((t) => t.id === turnoId) || null,
    [turnosAbiertos, turnoId]
  );

  const requiereCuentaBanco = useMemo(
    () => ['DEPOSITO', 'TRANSFERENCIA', 'TARJETA'].includes(String(medioPago || '').toUpperCase()),
    [medioPago]
  );

  const reciboPreviewHtml = useMemo(
    () => (reciboPago ? buildReciboCobroHtml({ empresaNombre, pago: reciboPago, detalles: reciboDetalles }) : ''),
    [empresaNombre, reciboPago, reciboDetalles]
  );

  const auxiliarFiltrado = useMemo(() => {
    const q = auxFiltroTexto.trim().toLowerCase();
    return auxiliarBanco.filter((item) => {
      if (auxFiltroMoneda !== 'TODAS' && item.moneda !== auxFiltroMoneda) return false;
      if (auxFiltroEstado !== 'TODOS' && item.estado_conciliacion !== auxFiltroEstado) return false;
      if (!q) return true;
      return [
        item.tercero_nombre,
        item.tercero_identificacion,
        item.referencia,
        String(item.pago_id),
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [auxiliarBanco, auxFiltroEstado, auxFiltroMoneda, auxFiltroTexto]);

  const auxiliarSeleccionado = useMemo(
    () => auxiliarFiltrado.find((item) => item.id === auxSeleccionadoId) || null,
    [auxiliarFiltrado, auxSeleccionadoId]
  );

  const loadClientes = async () => {
    const { data, error } = await supabase
      .from('vw_terceros_catalogo')
      .select('id,razon_social,identificacion')
      .eq('empresa_id', empresaId)
      .eq('es_cliente', true)
      .eq('activo', true)
      .order('razon_social', { ascending: true });
    if (error) return;
    const rows = (data || []) as ClienteOpt[];
    setClientes(rows);
    if (!clienteId && rows.length > 0) setClienteId(rows[0].id);
  };

  const loadPuntosVenta = async () => {
    const { data, error } = await supabase
      .from('puntos_venta')
      .select('id,codigo,nombre')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('codigo', { ascending: true });
    if (error) {
      setPuntosVenta([]);
      return;
    }
    const rows = (data || []) as PuntoVentaRow[];
    setPuntosVenta(rows);
    if (!puntoVentaId && rows.length > 0) setPuntoVentaId(rows[0].id);
  };

  const loadCajas = async (pvId: number) => {
    if (!pvId) {
      setCajas([]);
      setCajaId(0);
      return;
    }
    const { data, error } = await supabase
      .from('cajas')
      .select('id,punto_venta_id,codigo,nombre')
      .eq('empresa_id', empresaId)
      .eq('punto_venta_id', pvId)
      .eq('activo', true)
      .order('codigo', { ascending: true });
    if (error) {
      setCajas([]);
      setCajaId(0);
      return;
    }
    const rows = (data || []) as CajaRow[];
    setCajas(rows);
    if (!rows.some((c) => c.id === cajaId)) setCajaId(rows[0]?.id || 0);
  };

  const loadCuentasBanco = async () => {
    const { data, error } = await supabase
      .from('vw_cuentas_bancarias_empresa')
      .select('id,codigo,alias,banco_nombre,moneda,numero_cuenta,activo')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('codigo', { ascending: true });
    if (error) {
      setCuentasBanco([]);
      setCuentaBancoId(0);
      return;
    }
    const rows = (data || []) as CuentaBancoOpt[];
    setCuentasBanco(rows);
    if (!rows.some((c) => c.id === cuentaBancoId)) setCuentaBancoId(rows[0]?.id || 0);
  };

  const loadTurnosAbiertos = async () => {
    setTurnosLoading(true);
    const { data, error } = await supabase
      .from('vw_caja_turnos')
      .select('id,empresa_id,punto_venta_id,punto_venta_codigo,punto_venta_nombre,caja_id,caja_codigo,caja_nombre,estado,fecha_hora_apertura')
      .eq('empresa_id', empresaId)
      .eq('estado', 'abierto')
      .order('fecha_hora_apertura', { ascending: false });
    if (error) {
      setTurnosAbiertos([]);
      setTurnoId(0);
      setTurnosLoading(false);
      return;
    }
    const rows = (data || []) as TurnoCajaRow[];
    setTurnosAbiertos(rows);
    if (!rows.some((t) => t.id === turnoId)) {
      const first = rows[0];
      setTurnoId(first?.id || 0);
      setPuntoVentaId(first?.punto_venta_id || 0);
      setCajaId(first?.caja_id || 0);
    }
    setTurnosLoading(false);
  };

  const loadDocumentosCliente = async (terceroId: number, mon: 'CRC' | 'USD') => {
    if (!terceroId) {
      setDocumentosPendientes([]);
      setPagosPorDocumento({});
      return;
    }

    const { data, error } = await supabase.rpc('get_cxc_documentos_cartera', {
      p_empresa_id: empresaId,
      p_fecha_corte: fechaPago,
      p_tercero_id: terceroId,
      p_moneda: mon,
    });

    if (error) {
      setErr(error.message || 'No se pudo cargar documentos pendientes del cliente.');
      setDocumentosPendientes([]);
      setPagosPorDocumento({});
      setPagosTextoPorDocumento({});
      return;
    }

    const rows = ((data || []) as DocumentoPendienteRow[]).filter((d) => toNum(d.monto_pendiente) > 0);
    setDocumentosPendientes(rows);
    setPagosPorDocumento({});
    setPagosTextoPorDocumento({});
  };

  const loadPagos = async () => {
    if (!canView) return;
    const { data, error } = await supabase
      .from('vw_recaudacion_pagos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_pago', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);

    if (error) {
      setPagos([]);
      return;
    }
    setPagos((data || []) as PagoRow[]);
  };

  const loadAuxiliarBanco = async () => {
    const { data, error } = await supabase
      .from('vw_recaudacion_auxiliar_banco')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_movimiento', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);

    if (error) {
      setAuxiliarBanco([]);
      return;
    }
    setAuxiliarBanco((data || []) as AuxiliarBancoRow[]);
  };

  const loadRecibo = async (pagoId: number) => {
    if (!pagoId) {
      setReciboPago(null);
      setReciboDetalles([]);
      return;
    }

    const [{ data: pagoData, error: pagoErr }, { data: detalleData, error: detalleErr }] = await Promise.all([
      supabase
        .from('vw_recaudacion_pagos')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('id', pagoId)
        .maybeSingle(),
      supabase
        .from('vw_recaudacion_pago_detalle')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('pago_id', pagoId)
        .eq('estado', 'activo')
        .order('id', { ascending: true }),
    ]);

    if (pagoErr || !pagoData) {
      setReciboPago(null);
      setReciboDetalles([]);
      return;
    }
    if (detalleErr) {
      setReciboPago((pagoData || null) as PagoRow | null);
      setReciboDetalles([]);
      return;
    }

    setReciboPago(pagoData as PagoRow);
    setReciboDetalles((detalleData || []) as ReciboDetalleRow[]);
  };

  const setPagoDocumentoTexto = (docId: number, raw: string) => {
    setPagosTextoPorDocumento((prev) => ({ ...prev, [docId]: raw }));
    setPagosPorDocumento((prev) => ({ ...prev, [docId]: Math.max(0, parseMontoInput(raw)) }));
  };

  const formatPagoDocumentoTexto = (docId: number) => {
    const n = toNum(pagosPorDocumento[docId]);
    setPagosTextoPorDocumento((prev) => ({ ...prev, [docId]: n > 0 ? formatMontoInput(n) : '' }));
  };

  const focusSiguientePago = (docId: number) => {
    const idx = orderedDocumentoIds.findIndex((id) => id === docId);
    if (idx < 0) return;
    const nextId = orderedDocumentoIds[idx + 1];
    if (!nextId) return;
    const next = pagoInputRefs.current[nextId];
    if (next) {
      next.focus();
      next.select();
    }
  };

  const focusAnteriorPago = (docId: number) => {
    const idx = orderedDocumentoIds.findIndex((id) => id === docId);
    if (idx <= 0) return;
    const prevId = orderedDocumentoIds[idx - 1];
    const prev = pagoInputRefs.current[prevId];
    if (prev) {
      prev.focus();
      prev.select();
    }
  };

  const togglePagoDocumento = (doc: DocumentoPendienteRow, checked: boolean) => {
    const value = checked ? toNum(doc.monto_pendiente) : 0;
    setPagosPorDocumento((prev) => ({
      ...prev,
      [doc.documento_id]: value,
    }));
    setPagosTextoPorDocumento((prev) => ({
      ...prev,
      [doc.documento_id]: checked ? formatMontoInput(value) : '',
    }));
  };

  const validarAplicacion = (): string | null => {
    if (!turnoId) return 'Debe tener un turno de caja abierto para registrar cobros.';
    if (!clienteId) return 'Debe seleccionar un cliente.';
    if (toNum(montoRecibido) <= 0) return 'Debe indicar el monto recibido.';
    if (requiereCuentaBanco && !cuentaBancoId) return 'Debe seleccionar la cuenta bancaria destino para este medio de pago.';
    if (toNum(montoAjuste) < 0) return 'El ajuste por diferencia no puede ser negativo.';
    if (toNum(montoAjuste) > 0 && !motivoDiferencia.trim()) return 'Debe indicar el motivo de la diferencia.';
    if (totalAplicado <= 0) return 'Debe ingresar al menos un monto de pago por factura.';
    if (montoNoAplicado < 0) return 'La suma aplicada no puede ser mayor que el monto recibido mas el ajuste de diferencia.';

    for (const doc of documentosPendientes) {
      const pago = toNum(pagosPorDocumento[doc.documento_id]);
      if (pago > toNum(doc.monto_pendiente)) {
        return `El pago para ${doc.numero_documento} excede su saldo pendiente.`;
      }
    }
    return null;
  };

  const onMontoRecibidoChange = (raw: string) => {
    setMontoRecibidoAuto(false);
    setMontoRecibidoTexto(raw);
    setMontoRecibido(Math.max(0, parseMontoInput(raw)));
  };

  const onMontoRecibidoBlur = () => {
    setMontoRecibidoTexto(montoRecibido > 0 ? formatMontoInput(montoRecibido) : '');
  };

  const sugerirMontoRecibido = () => {
    const sugerido = Math.max(0, totalAplicado);
    setMontoRecibidoAuto(true);
    setMontoRecibido(sugerido);
    setMontoRecibidoTexto(sugerido > 0 ? formatMontoInput(sugerido) : '');
  };

  const onMontoAjusteChange = (raw: string) => {
    setMontoAjusteTexto(raw);
    setMontoAjuste(Math.max(0, parseMontoInput(raw)));
  };

  const onMontoAjusteBlur = () => {
    setMontoAjusteTexto(montoAjuste > 0 ? formatMontoInput(montoAjuste) : '');
  };

  const onTipoCambioChange = (raw: string) => {
    setTipoCambioTexto(raw);
    const parsed = parseMontoInput(raw);
    setTipoCambio(parsed > 0 ? parsed : 1);
  };

  const onTipoCambioBlur = () => {
    setTipoCambioTexto(formatTipoCambioInput(tipoCambio));
  };

  const aplicarCobro = async () => {
    if (!canEdit) return;

    const validacion = validarAplicacion();
    if (validacion) {
      setErr(validacion);
      return;
    }

    setBusy(true);
    setErr('');
    setOk('');

    try {
      const detallesAplicados = documentosPendientes
        .filter((doc) => toNum(pagosPorDocumento[doc.documento_id]) > 0)
        .map((doc) => ({
          documento_id: doc.documento_id,
          monto_aplicado: toNum(pagosPorDocumento[doc.documento_id]),
        }));

      const { data: pagoIdData, error: pagoErr } = await supabase.rpc('registrar_recaudacion_pago', {
        p_empresa_id: empresaId,
        p_tercero_id: clienteId,
        p_fecha_pago: fechaPago,
        p_moneda: moneda,
        p_tipo_cambio: tipoCambio,
        p_monto_total: montoRecibido,
        p_monto_ajuste: montoAjuste,
        p_medio_pago: medioPago,
        p_referencia: referencia || null,
        p_cuenta_banco_id: requiereCuentaBanco ? (cuentaBancoId || null) : null,
        p_observacion: detalleRecibo || null,
        p_motivo_diferencia: motivoDiferencia || null,
        p_punto_venta_id: puntoVentaId || null,
        p_caja_id: cajaId || null,
        p_turno_id: turnoId || null,
      });
      if (pagoErr) throw pagoErr;

      const pagoId = Number(pagoIdData || 0);
      if (!pagoId) throw new Error('No se pudo generar el pago.');

      for (const det of detallesAplicados) {
        if (det.monto_aplicado <= 0) continue;

        const { error: detErr } = await supabase.rpc('recaudacion_guardar_detalle', {
          p_pago_id: pagoId,
          p_documento_id: det.documento_id,
          p_monto_aplicado: det.monto_aplicado,
          p_observacion: detalleRecibo || null,
        });
        if (detErr) throw detErr;
      }

      const { error: confErr } = await supabase.rpc('confirmar_recaudacion_pago', { p_pago_id: pagoId });
      if (confErr) throw confErr;

      setHistorialPagoId(pagoId);
      await loadRecibo(pagoId);
      setOk('Cobro aplicado correctamente. El movimiento quedo registrado en auxiliar bancario para conciliacion.');
      setMontoRecibido(0);
      setMontoRecibidoTexto('');
      setMontoRecibidoAuto(true);
      setMontoAjuste(0);
      setMontoAjusteTexto('');
      setReferencia('');
      setDetalleRecibo('');
      setMotivoDiferencia('');
      setPagosPorDocumento({});
      await loadDocumentosCliente(clienteId, moneda);
      await loadPagos();
      await loadAuxiliarBanco();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo aplicar el cobro.'));
    } finally {
      setBusy(false);
    }
  };

  const limpiarCaptura = () => {
    setPagosPorDocumento({});
    setPagosTextoPorDocumento({});
    setMontoRecibido(0);
    setMontoRecibidoTexto('');
    setMontoRecibidoAuto(true);
    setMontoAjuste(0);
    setMontoAjusteTexto('');
    setMotivoDiferencia('');
    setReferencia('');
    setDetalleRecibo('');
  };

  const aplicarTodos = () => {
    const next: Record<number, number> = {};
    const nextText: Record<number, string> = {};
    documentosPendientes.forEach((d) => {
      const value = toNum(d.monto_pendiente);
      next[d.documento_id] = value;
      nextText[d.documento_id] = formatMontoInput(value);
    });
    setPagosPorDocumento(next);
    setPagosTextoPorDocumento(nextText);
  };

  const marcarContabilizado = async () => {
    if (!canEdit || !historialPagoId || historialAsientoId <= 0) {
      setErr('Seleccione un pago confirmado y un numero de asiento valido.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('marcar_recaudacion_contabilizada', {
        p_pago_id: historialPagoId,
        p_asiento_id: historialAsientoId,
        p_detalle: 'Contabilizado desde recaudacion',
      });
      if (error) throw error;
      setOk('Pago marcado como contabilizado.');
      await loadPagos();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo marcar como contabilizado.'));
    } finally {
      setBusy(false);
    }
  };

  const anularPago = async () => {
    if (!canEdit || !historialPagoId) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('anular_recaudacion_pago', {
        p_pago_id: historialPagoId,
        p_motivo: 'Anulacion desde recaudacion',
      });
      if (error) throw error;
      setOk('Pago anulado y aplicaciones revertidas.');
      await loadPagos();
      await loadAuxiliarBanco();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo anular el pago.'));
    } finally {
      setBusy(false);
    }
  };

  const marcarConciliado = async () => {
    if (!canEdit || !auxiliarSeleccionado) return;
    if (auxiliarSeleccionado.estado_conciliacion !== 'pendiente') {
      setErr('Solo puede conciliar movimientos pendientes.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('marcar_recaudacion_conciliada', {
        p_pago_id: auxiliarSeleccionado.pago_id,
        p_detalle: 'Movimiento conciliado desde Recaudacion y Aplicacion de Pagos',
      });
      if (error) throw error;
      setOk(`Movimiento del pago #${auxiliarSeleccionado.pago_id} marcado como conciliado.`);
      await loadPagos();
      await loadAuxiliarBanco();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo marcar el movimiento como conciliado.'));
    } finally {
      setBusy(false);
    }
  };

  const deshacerConciliacion = async () => {
    if (!canEdit || !auxiliarSeleccionado) return;
    if (auxiliarSeleccionado.estado_conciliacion !== 'conciliado') {
      setErr('Solo puede deshacer la conciliacion de movimientos ya conciliados.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('deshacer_recaudacion_conciliacion', {
        p_pago_id: auxiliarSeleccionado.pago_id,
        p_detalle: 'Conciliacion revertida desde Recaudacion y Aplicacion de Pagos',
      });
      if (error) throw error;
      setOk(`Conciliacion del pago #${auxiliarSeleccionado.pago_id} revertida.`);
      await loadPagos();
      await loadAuxiliarBanco();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo deshacer la conciliacion.'));
    } finally {
      setBusy(false);
    }
  };

  const abrirPreviewRecibo = () => {
    if (!reciboPago || !reciboPreviewHtml) return;
    const win = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
    if (!win) return;
    win.document.write(reciboPreviewHtml);
    win.document.close();
  };

  const descargarReciboPdf = () => {
    if (!reciboPago) return;
    const doc = buildReciboCobroPdf({
      empresaNombre,
      pago: reciboPago,
      detalles: reciboDetalles,
    });
    doc.save(`recibo_cobro_${reciboPago.id}.pdf`);
  };

  useEffect(() => {
    loadClientes();
    loadPuntosVenta();
    loadCuentasBanco();
    loadTurnosAbiertos();
    loadPagos();
    loadAuxiliarBanco();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (puntoVentaId) loadCajas(puntoVentaId);
  }, [puntoVentaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!turnoId) return;
    const t = turnosAbiertos.find((x) => x.id === turnoId);
    if (!t) return;
    if (puntoVentaId !== t.punto_venta_id) setPuntoVentaId(t.punto_venta_id);
    if (cajaId !== t.caja_id) setCajaId(t.caja_id);
  }, [turnoId, turnosAbiertos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prefillTerceroId && Number(prefillTerceroId) > 0) {
      setClienteId(Number(prefillTerceroId));
    }
    if (prefillMoneda) {
      setMoneda(prefillMoneda);
    }
  }, [prefillTerceroId, prefillMoneda]);

  useEffect(() => {
    if (clienteId) loadDocumentosCliente(clienteId, moneda);
  }, [clienteId, moneda, fechaPago]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTipoCambioTexto(formatTipoCambioInput(tipoCambio));
  }, [tipoCambio]);

  useEffect(() => {
    if (!montoRecibidoAuto) return;
    const sugerido = Math.max(0, totalAplicado);
    setMontoRecibido(sugerido);
    setMontoRecibidoTexto(sugerido > 0 ? formatMontoInput(sugerido) : '');
  }, [totalAplicado, montoRecibidoAuto]);

  useEffect(() => {
    if (!requiereAjuste) {
      setMontoAjuste(0);
      setMontoAjusteTexto('');
      setMotivoDiferencia('');
    }
  }, [requiereAjuste]);

  useEffect(() => {
    if (!requiereCuentaBanco) {
      setCuentaBancoId(0);
      return;
    }
    const compatibles = cuentasBanco.filter((c) => c.moneda === moneda);
    if (compatibles.length === 0) return;
    if (!compatibles.some((c) => c.id === cuentaBancoId)) {
      setCuentaBancoId(compatibles[0].id);
    }
  }, [requiereCuentaBanco, cuentasBanco, moneda, cuentaBancoId]);

  useEffect(() => {
    if (!historialPagoId) {
      setReciboPago(null);
      setReciboDetalles([]);
      return;
    }
    loadRecibo(historialPagoId);
  }, [historialPagoId, empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (auxiliarFiltrado.length === 0) {
      setAuxSeleccionadoId(null);
      return;
    }
    if (!auxiliarFiltrado.some((item) => item.id === auxSeleccionadoId)) {
      setAuxSeleccionadoId(auxiliarFiltrado[0].id);
    }
  }, [auxiliarFiltrado, auxSeleccionadoId]);

  return (
    <>
      <style>{styles}</style>
      <div className="rec-wrap">
        <div className="rec-title">Recaudacion y Aplicacion de Pagos</div>
        <div className="rec-sub">Digite montos por factura, revise totales y finalize el cobro con su forma de pago.</div>
        <div className="rec-actions" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="rec-btn" type="button" onClick={() => onAbrirReportes?.()}>
            Ver reportes de cobro
          </button>
        </div>
        {ok ? <div className="rec-msg-ok">{ok}</div> : null}
        {err ? <div className="rec-msg-err">{err}</div> : null}

        <div className="rec-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Aplicando cobro a clientes</div>
          <div className="rec-grid">
            <div className="rec-field">
              <label>Cliente</label>
              <select
                className="rec-select"
                value={clienteId}
                onChange={(e) => setClienteId(Number(e.target.value || 0))}
                disabled={!canEdit || busy || clientePrefijado}
              >
                <option value={0}>-- seleccione --</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.razon_social} ({c.identificacion || '-'})</option>
                ))}
              </select>
            </div>
            <div className="rec-field">
              <label>Fecha</label>
              <input className="rec-input" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
            </div>
            <div className="rec-field">
              <label>Moneda</label>
              <select className="rec-select" value={moneda} onChange={(e) => setMoneda(e.target.value as any)}>
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="rec-field">
              <label>Tipo de cambio</label>
              <input
                className="rec-input num"
                type="text"
                inputMode="decimal"
                value={tipoCambioTexto}
                onChange={(e) => onTipoCambioChange(e.target.value)}
                onBlur={onTipoCambioBlur}
              />
            </div>
          </div>
          <div className="rec-grid" style={{ marginTop: 8 }}>
            <div className="rec-field">
              <label>Punto de venta</label>
              <select
                className="rec-select"
                value={puntoVentaId}
                onChange={(e) => setPuntoVentaId(Number(e.target.value || 0))}
                disabled={!canEdit || busy || !!turnoActivo}
              >
                <option value={0}>-- seleccione --</option>
                {puntosVenta.map((pv) => (
                  <option key={pv.id} value={pv.id}>
                    {pv.codigo} - {pv.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="rec-field">
              <label>Caja</label>
              <select
                className="rec-select"
                value={cajaId}
                onChange={(e) => setCajaId(Number(e.target.value || 0))}
                disabled={!canEdit || busy || !!turnoActivo}
              >
                <option value={0}>-- seleccione --</option>
                {cajas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} - {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="rec-field">
              <label>Turno abierto</label>
              <select
                className="rec-select"
                value={turnoId}
                onChange={(e) => setTurnoId(Number(e.target.value || 0))}
                disabled={!canEdit || busy}
              >
                <option value={0}>-- seleccione un turno --</option>
                {turnosAbiertos.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.id} | {t.punto_venta_codigo}-{t.caja_codigo} | Apertura {String(t.fecha_hora_apertura || '').slice(0, 16).replace('T', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="rec-field">
              <label>Estado turno</label>
              <input
                className="rec-input"
                value={
                  turnoActivo
                    ? `Abierto | ${turnoActivo.punto_venta_codigo}-${turnoActivo.caja_codigo}`
                    : 'Sin turno abierto'
                }
                disabled
              />
            </div>
          </div>
          {!turnosLoading && !turnoActivo && (
            <div className="rec-msg-err" style={{ marginTop: 8, marginBottom: 0 }}>
              No hay turno de caja abierto para este usuario. Debe abrir turno antes de aplicar cobros.
            </div>
          )}
          {clientePrefijado && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8ea3c7' }}>
              Cliente recibido desde Gestion de Cobro. Para cambiar cliente, regrese a esa vista.
            </div>
          )}

          <div className="rec-table" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Factura</th>
                  <th>Tipo</th>
                  <th>Moneda</th>
                  <th className="rec-right">Total</th>
                  <th className="rec-right">Saldo</th>
                  <th className="rec-right">Pago</th>
                  <th>Sel.</th>
                  <th className="rec-right">Descuento</th>
                  <th className="rec-right">Dias</th>
                </tr>
              </thead>
              <tbody>
                {documentosPendientes.length === 0 ? (
                  <tr><td colSpan={10} className="rec-empty">Seleccione un cliente para ver facturas pendientes.</td></tr>
                ) : documentosPendientes.map((d) => {
                  const pago = toNum(pagosPorDocumento[d.documento_id]);
                  const excedido = pago > toNum(d.monto_pendiente);
                  return (
                    <tr key={d.documento_id}>
                      <td>{d.fecha_emision}</td>
                      <td>{d.numero_documento}</td>
                      <td>{d.tipo_documento}</td>
                      <td>{d.moneda}</td>
                      <td className="rec-right">{money(d.monto_original, d.moneda)}</td>
                      <td className="rec-right">{money(d.monto_pendiente, d.moneda)}</td>
                      <td className="rec-right">
                        <input
                          className="rec-input num"
                          style={{ maxWidth: 130, marginLeft: 'auto', borderColor: excedido ? '#ef4444' : '#d1d5db' }}
                          type="text"
                          inputMode="decimal"
                          value={pagosTextoPorDocumento[d.documento_id] ?? (pago > 0 ? formatMontoInput(pago) : '')}
                          onChange={(e) => setPagoDocumentoTexto(d.documento_id, e.target.value)}
                          onBlur={() => formatPagoDocumentoTexto(d.documento_id)}
                          onKeyDown={(e) => {
                            const key = e.key;
                            const isNext = key === 'Enter' || key === 'PageDown' || key === 'Next';
                            const isPrev = key === 'PageUp' || key === 'Prior' || key === 'ArrowUp';

                            if (isNext) {
                              e.preventDefault();
                              formatPagoDocumentoTexto(d.documento_id);
                              focusSiguientePago(d.documento_id);
                              return;
                            }
                            if (isPrev) {
                              e.preventDefault();
                              formatPagoDocumentoTexto(d.documento_id);
                              focusAnteriorPago(d.documento_id);
                            }
                          }}
                          ref={(el) => {
                            pagoInputRefs.current[d.documento_id] = el;
                          }}
                          disabled={!canEdit || busy}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={pago > 0}
                          onChange={(e) => togglePagoDocumento(d, e.target.checked)}
                          disabled={!canEdit || busy}
                        />
                      </td>
                      <td className="rec-right">{money(0, d.moneda)}</td>
                      <td className="rec-right">{d.dias_vencidos}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rec-totals">
            <div className="rec-kpi">
              <div className="k">Monto recibido</div>
              <div className="v">{money(montoRecibido, moneda)}</div>
            </div>
            <div className="rec-kpi">
              <div className="k">Ajuste por diferencia</div>
              <div className="v">{money(montoAjuste, moneda)}</div>
            </div>
            <div className="rec-kpi">
              <div className="k">Total aplicado</div>
              <div className="v">{money(totalAplicado, moneda)}</div>
            </div>
            <div className="rec-kpi">
              <div className="k">No aplicado</div>
              <div className={`v ${montoNoAplicado < 0 ? 'err' : montoNoAplicado > 0 ? 'warn' : ''}`}>
                {money(montoNoAplicado, moneda)}
              </div>
            </div>
            <div className="rec-kpi">
              <div className="k">Cliente</div>
              <div className="v" style={{ fontSize: 13 }}>{clienteSeleccionado ? clienteSeleccionado.razon_social : '-'}</div>
            </div>
          </div>

          <div className="rec-grid" style={{ marginTop: 10 }}>
            <div className="rec-field">
              <label>Monto recibido</label>
              <input
                className="rec-input num"
                type="text"
                inputMode="decimal"
                value={montoRecibidoTexto}
                onChange={(e) => onMontoRecibidoChange(e.target.value)}
                onBlur={onMontoRecibidoBlur}
                disabled={!canEdit || busy}
              />
              <div className="rec-actions" style={{ marginTop: 4 }}>
                <button className="rec-btn" type="button" onClick={sugerirMontoRecibido} disabled={!canEdit || busy}>
                  Sugerir segun aplicado
                </button>
              </div>
            </div>
            <div className="rec-field">
              <label>Ajuste por diferencia</label>
              <input
                className="rec-input num"
                type="text"
                inputMode="decimal"
                value={montoAjusteTexto}
                onChange={(e) => onMontoAjusteChange(e.target.value)}
                onBlur={onMontoAjusteBlur}
                disabled={!canEdit || busy || !requiereAjuste}
              />
            </div>
            <div className="rec-field">
              <label>Forma de pago</label>
              <select className="rec-select" value={medioPago} onChange={(e) => setMedioPago(e.target.value)} disabled={!canEdit || busy}>
                <option value="EFECTIVO">Efectivo</option>
                <option value="DEPOSITO">Deposito</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="OTROS">Otros</option>
              </select>
            </div>
            <div className="rec-field">
              <label>Cuenta bancaria</label>
              <select
                className="rec-select"
                value={cuentaBancoId}
                onChange={(e) => setCuentaBancoId(Number(e.target.value || 0))}
                disabled={!canEdit || busy || !requiereCuentaBanco}
              >
                <option value={0}>
                  {requiereCuentaBanco ? '-- seleccione una cuenta --' : 'No aplica para efectivo'}
                </option>
                {cuentasBanco
                  .filter((c) => c.moneda === moneda)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} - {c.alias} | {c.banco_nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div className="rec-field">
              <label>Referencia</label>
              <input className="rec-input" value={referencia} onChange={(e) => setReferencia(e.target.value)} disabled={!canEdit || busy} />
            </div>
            <div className="rec-field">
              <label>Detalle del recibo</label>
              <input className="rec-input" value={detalleRecibo} onChange={(e) => setDetalleRecibo(e.target.value)} disabled={!canEdit || busy} />
            </div>
            <div className="rec-field">
              <label>Motivo de diferencia</label>
              <input
                className="rec-input"
                value={motivoDiferencia}
                onChange={(e) => setMotivoDiferencia(e.target.value)}
                disabled={!canEdit || busy || !requiereAjuste}
                placeholder="Descuento por pronto pago / redondeo / otro"
              />
            </div>
          </div>

          <div className="rec-actions" style={{ marginTop: 10 }}>
            <button className="rec-btn" type="button" onClick={aplicarTodos} disabled={!canEdit || busy || documentosPendientes.length === 0}>Aplicar todos</button>
            <button className="rec-btn main" type="button" onClick={aplicarCobro} disabled={!canEdit || busy || !turnoActivo}>Aplicar cobro</button>
            <button className="rec-btn" type="button" onClick={limpiarCaptura} disabled={busy}>Limpiar</button>
          </div>
        </div>

        <div className="rec-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Recibo de cobro</div>
          {!reciboPago ? (
            <div className="rec-empty">Seleccione un pago en el historial o aplique un cobro para generar el recibo.</div>
          ) : (
            <>
              <div className="rec-actions" style={{ marginBottom: 8 }}>
                <button className="rec-btn" type="button" onClick={abrirPreviewRecibo}>
                  Abrir preview
                </button>
                <button className="rec-btn" type="button" onClick={descargarReciboPdf}>
                  Descargar PDF
                </button>
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#8ea3c7' }}>
                  Recibo #{reciboPago.id} | {reciboPago.tercero_nombre}
                </div>
              </div>
              <div style={{ border: '1px solid rgba(137,160,201,0.18)', borderRadius: 12, overflow: 'hidden', background: '#0f1726' }}>
                <iframe
                  title="Vista previa recibo"
                  srcDoc={reciboPreviewHtml}
                  style={{ width: '100%', height: 680, border: 'none', background: '#fff' }}
                />
              </div>
            </>
          )}
        </div>

        <div className="rec-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Historial de pagos</div>
          <div className="rec-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>ID</th>
                  <th>Moneda</th>
                  <th className="rec-right">Total</th>
                  <th className="rec-right">Aplicado</th>
                  <th className="rec-right">No aplicado</th>
                  <th>Estado</th>
                  <th>Referencia</th>
                  <th>Asiento</th>
                </tr>
              </thead>
              <tbody>
                {pagos.length === 0 ? (
                  <tr><td colSpan={10} className="rec-empty">Sin pagos registrados.</td></tr>
                ) : pagos.map((p) => (
                  <tr
                    key={p.id}
                    style={{ background: historialPagoId === p.id ? '#243149' : undefined, cursor: 'pointer' }}
                    onClick={() => setHistorialPagoId(p.id)}
                  >
                    <td>{p.fecha_pago}</td>
                    <td>{p.tercero_nombre}</td>
                    <td>{p.tercero_identificacion || '-'}</td>
                    <td>{p.moneda}</td>
                    <td className="rec-right">{money(p.monto_total, p.moneda)}</td>
                    <td className="rec-right">{money(p.monto_aplicado, p.moneda)}</td>
                    <td className="rec-right">{money(p.monto_no_aplicado, p.moneda)}</td>
                    <td>{p.estado}</td>
                    <td>{p.referencia || '-'}</td>
                    <td>{p.asiento_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rec-actions" style={{ marginTop: 10 }}>
            <input
              className="rec-input"
              style={{ maxWidth: 180 }}
              type="number"
              value={historialAsientoId || ''}
              onChange={(e) => setHistorialAsientoId(toNum(e.target.value))}
              placeholder="Numero de asiento"
            />
            <button className="rec-btn" type="button" onClick={marcarContabilizado} disabled={!canEdit || busy}>Marcar contabilizado</button>
            <button className="rec-btn warn" type="button" onClick={anularPago} disabled={!canEdit || busy}>Anular pago</button>
            <button className="rec-btn" type="button" onClick={() => { loadPagos(); loadAuxiliarBanco(); }} disabled={busy}>Recargar</button>
          </div>
        </div>

        <div className="rec-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Auxiliar bancario para conciliacion</div>
          <div className="rec-grid" style={{ marginBottom: 10 }}>
            <div className="rec-field">
              <label>Buscar</label>
              <input
                className="rec-input"
                value={auxFiltroTexto}
                onChange={(e) => setAuxFiltroTexto(e.target.value)}
                placeholder="Cliente, identificacion, referencia o pago"
              />
            </div>
            <div className="rec-field">
              <label>Moneda</label>
              <select className="rec-select" value={auxFiltroMoneda} onChange={(e) => setAuxFiltroMoneda(e.target.value as 'TODAS' | 'CRC' | 'USD')}>
                <option value="TODAS">Todas</option>
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="rec-field">
              <label>Estado conciliacion</label>
              <select className="rec-select" value={auxFiltroEstado} onChange={(e) => setAuxFiltroEstado(e.target.value as 'TODOS' | 'pendiente' | 'conciliado' | 'anulado')}>
                <option value="TODOS">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="conciliado">Conciliado</option>
                <option value="anulado">Anulado</option>
              </select>
            </div>
            <div className="rec-field">
              <label>Registros</label>
              <input className="rec-input" value={`${auxiliarFiltrado.length} de ${auxiliarBanco.length}`} disabled />
            </div>
          </div>
          <div className="rec-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>ID</th>
                  <th>Pago</th>
                  <th>Moneda</th>
                  <th className="rec-right">Monto</th>
                  <th>Referencia</th>
                  <th>Estado pago</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {auxiliarFiltrado.length === 0 ? (
                  <tr><td colSpan={9} className="rec-empty">Sin movimientos para el criterio seleccionado.</td></tr>
                ) : auxiliarFiltrado.map((a) => (
                  <tr
                    key={a.id}
                    style={{ background: auxSeleccionadoId === a.id ? '#243149' : undefined, cursor: 'pointer' }}
                    onClick={() => setAuxSeleccionadoId(a.id)}
                  >
                    <td>{a.fecha_movimiento}</td>
                    <td>{a.tercero_nombre}</td>
                    <td>{a.tercero_identificacion || '-'}</td>
                    <td>#{a.pago_id}</td>
                    <td>{a.moneda}</td>
                    <td className="rec-right">{money(a.monto, a.moneda)}</td>
                    <td>{a.referencia || '-'}</td>
                    <td>{a.estado_pago || '-'}</td>
                    <td>{a.estado_conciliacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {auxiliarSeleccionado ? (
            <div className="rec-totals" style={{ marginTop: 10 }}>
              <div className="rec-kpi">
                <div className="k">Cliente</div>
                <div className="v" style={{ fontSize: 13 }}>{auxiliarSeleccionado.tercero_nombre}</div>
              </div>
              <div className="rec-kpi">
                <div className="k">Pago</div>
                <div className="v">#{auxiliarSeleccionado.pago_id}</div>
              </div>
              <div className="rec-kpi">
                <div className="k">Monto</div>
                <div className="v">{money(auxiliarSeleccionado.monto, auxiliarSeleccionado.moneda)}</div>
              </div>
              <div className="rec-kpi">
                <div className="k">Referencia</div>
                <div className="v" style={{ fontSize: 13 }}>{auxiliarSeleccionado.referencia || '-'}</div>
              </div>
            </div>
          ) : null}
          <div className="rec-actions" style={{ marginTop: 10 }}>
            <button
              className="rec-btn main"
              type="button"
              onClick={marcarConciliado}
              disabled={!canEdit || busy || !auxiliarSeleccionado || auxiliarSeleccionado.estado_conciliacion !== 'pendiente'}
            >
              Marcar conciliado
            </button>
            <button
              className="rec-btn warn"
              type="button"
              onClick={deshacerConciliacion}
              disabled={!canEdit || busy || !auxiliarSeleccionado || auxiliarSeleccionado.estado_conciliacion !== 'conciliado'}
            >
              Deshacer conciliacion
            </button>
            <button className="rec-btn" type="button" onClick={loadAuxiliarBanco} disabled={busy}>Recargar auxiliar</button>
          </div>
        </div>
      </div>
    </>
  );
}


