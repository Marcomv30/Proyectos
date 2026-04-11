/**
 * FeeViewerAndPrint.tsx
 * Helpers — formatters, numeroALetras, buildPrintHtml, etc.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';

// ========== Types ==========

export interface DocFee {
  id: number;
  numero_consecutivo?: string;
  clave_mh?: string;
  fecha_emision: string;
  moneda: string;
  condicion_venta?: string;
  plazo_credito_dias?: number;
  total_comprobante: number;
  receptor_nombre?: string;
  receptor_identificacion?: string;
  receptor_email?: string;
  receptor_telefono?: string;
  receptor_direccion?: string;
  observacion?: string;
  medio_pago?: string;
  incoterms?: string;
  shipper?: string;
  codigo_exportador?: string;
  ggn_global_gap?: string;
  ep_mag?: string;
}

export interface Linea {
  linea: number;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_monto: number;
  total_linea: number;
  unidad_medida?: string;
  codigo_interno?: string;
  tarifa_iva_porcentaje?: number | null;
}

export interface Config {
  nombre_emisor?: string;
  nombre_comercial?: string;
  numero_identificacion?: string;
  otras_senas?: string;
  telefono_emisor?: string;
  correo_envio?: string;
  logo_url?: string;
  tipo_cambio_usd?: number;
  ambiente?: string;
}

// ========== Number-to-words (Spanish, for USD) ==========

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS  = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function cientos(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const centena = CENTENAS[c];
  if (resto === 0) return centena;
  const prefijo = c > 0 ? centena + ' ' : '';
  if (resto < 20) return prefijo + UNIDADES[resto];
  const dec = Math.floor(resto / 10);
  const uni = resto % 10;
  return prefijo + DECENAS[dec] + (uni > 0 ? ' Y ' + UNIDADES[uni] : '');
}

function miles(n: number): string {
  if (n === 0) return '';
  const m = Math.floor(n / 1000);
  const resto = n % 1000;
  const prefM = m === 1 ? 'MIL' : cientos(m) + ' MIL';
  return (m > 0 ? prefM + (resto > 0 ? ' ' : '') : '') + cientos(resto);
}

function millones(n: number): string {
  const mill = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  if (mill === 0) return miles(resto);
  const prefM = mill === 1 ? 'UN MILLÓN' : cientos(mill) + ' MILLONES';
  return prefM + (resto > 0 ? ' ' + miles(resto) : '');
}

export function numeroALetras(monto: number): string {
  if (isNaN(monto) || monto < 0) return '';
  const entero = Math.floor(monto);
  const cents  = Math.round((monto - entero) * 100);
  const letras = entero === 0 ? 'CERO' : millones(entero);
  return `${letras} CON ${String(cents).padStart(2, '0')}/100 DÓLARES`;
}

// ========== Formatters ==========

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function fmtFecha(s: string): string {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const CONDICION_MAP: Record<string, string> = {
  '01': 'CONTADO', '02': 'CREDITO', '03': 'CONSIGNACION',
  '04': 'APARTADO', '05': 'ARRENDAMIENTO', '06': 'OTRO',
};

export const condicionLabel = (code?: string) =>
  CONDICION_MAP[code || '01'] || code || '';

// ========== Load data ==========

export async function loadDocData(docId: number, empresaId: number) {
  const [{ data: docData }, { data: linData }, { data: cfgData }] = await Promise.all([
    supabase.from('fe_documentos').select('*').eq('id', docId).single(),
    supabase.from('fe_documento_lineas').select('*').eq('documento_id', docId).order('linea'),
    supabase.from('fe_config_empresa').select('*').eq('empresa_id', empresaId).maybeSingle(),
  ]);

  let logoDataUrl = '';
  if (cfgData?.logo_url) {
    try {
      logoDataUrl = await new Promise<string>((resolve) => {
        fetch(cfgData.logo_url!)
          .then(r => r.blob())
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
      });
    } catch { /* ignore */ }
  }

  return {
    doc: docData as DocFee | null,
    lineas: (linData as Linea[]) || [],
    config: cfgData as Config | null,
    logoDataUrl,
  };
}

// ========== buildPrintHtml ==========

export function buildPrintHtml(
  doc: DocFee,
  lineas: Linea[],
  config: Config,
  logoDataUrl: string
): string {
  const totalDesc = lineas.reduce((s, l) => s + l.descuento_monto, 0);
  const subtotal  = lineas.reduce((s, l) => s + (l.cantidad * l.precio_unitario), 0);
  const condicion = condicionLabel(doc.condicion_venta);
  const emptyRows = Math.max(0, 20 - lineas.length);
  const medioPago = doc.medio_pago || '—';

  const css = `
    @page { margin:8mm 10mm; size:A4 portrait; }
    body { margin:0; font-family:Arial,Helvetica,sans-serif; font-size:10px; color:#000; background:#fff;
           -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .fw { max-width:780px; margin:0 auto; padding:14px; }

    /* Header */
    .hdr { display:grid; grid-template-columns:1fr 1fr; gap:8px; border-bottom:2px solid #1e3a2f;
           padding-bottom:6px; margin-bottom:6px; }
    .logo-area { display:flex; align-items:flex-start; gap:10px; }
    .logo { width:52px; height:52px; object-fit:contain; border-radius:4px; }
    .e-name { font-size:13px; font-weight:700; color:#1e3a2f; }
    .e-line { font-size:9px; color:#444; line-height:1.4; }
    .doc-box { text-align:right; }
    .doc-title { font-size:12px; font-weight:700; color:#1e6b40; text-transform:uppercase; }
    .doc-no { font-size:11px; font-weight:700; color:#1e6b40; }
    .doc-line { font-size:9px; color:#444; }
    .clave { font-size:7.5px; font-family:monospace; color:#1e3a2f; border:1px solid #1e3a2f;
             padding:2px 6px; margin-top:3px; display:inline-block; border-radius:2px; word-break:break-all; }

    /* Receptor */
    .rbar { background:#1e3a2f; color:#fff; font-size:9px; font-weight:700; text-align:center;
            padding:2px; margin:4px 0 3px; letter-spacing:0.08em; }
    .rgrid { display:grid; grid-template-columns:90px 1fr 110px 1fr; gap:1px 8px; margin-bottom:5px; }
    .rlbl { font-size:8.5px; font-weight:700; color:#555; }
    .rval { font-size:9px; color:#111; }

    /* Tabla líneas */
    .ft { width:100%; border-collapse:collapse; margin:6px 0 0; }
    .ft th { background:#1e3a2f; color:#fff; font-size:8.5px; font-weight:700; padding:2px 4px;
             text-align:center; border:1px solid #1e3a2f; }
    .ft td { padding:2px 4px; font-size:9px; border:none; border-left:1px solid #ccc; }
    .ft td:last-child { border-right:1px solid #ccc; }
    .ft tbody tr:last-child td { border-bottom:1px solid #ccc; }
    .num { text-align:right; font-family:monospace; }
    .ctr { text-align:center; }
    .er td { height:11px; }

    /* Totales */
    .totals { margin-left:auto; width:220px; border-collapse:collapse; }
    .totals td { padding:2px 6px; font-size:9px; border:1px solid #ccc; }
    .t-lbl { font-weight:700; text-align:right; background:#f5f5f5; }
    .t-amt { text-align:right; font-family:monospace; }
    .t-total td { background:#1e3a2f; color:#fff; font-weight:700; font-size:10px; }
    .letras { border:1px solid #ccc; padding:3px 8px; margin-top:3px; font-size:9px; }

    /* Despacho info */
    .dbar { background:#1e3a2f; color:#fff; font-size:10px; font-weight:700; text-align:center;
            padding:3px; margin:8px 0 0; letter-spacing:0.05em; }
    .dsub { text-align:center; font-size:8px; color:#777; font-style:italic; margin-bottom:3px; }
    .dtable { width:100%; border-collapse:collapse; }
    .dtable td { border:1px solid #bbb; padding:3px 8px; font-size:9.5px; }
    .dlbl { font-weight:700; width:28%; background:#f0f0f0; color:#333; white-space:nowrap; }
    .dval { color:#000; width:22%; }

    /* Observaciones */
    .obs-row td { padding:4px 6px; vertical-align:top; }
    .obs-label { font-weight:700; font-size:8.5px; color:#555; width:60px; }
    .obs-val { font-size:9px; color:#333; }

    /* Pie */
    .footer { font-size:7.5px; color:#666; border-top:1px solid #ccc; padding-top:3px;
              margin-top:6px; display:flex; justify-content:space-between; }

    /* Marca de agua pruebas */
    .wm { position:fixed; top:0; left:0; width:100%; height:100%; display:flex; align-items:center;
          justify-content:center; pointer-events:none; z-index:9999; }
    .wm span { font-size:42px; font-weight:700; color:rgba(220,38,38,0.18); transform:rotate(-35deg);
               white-space:nowrap; letter-spacing:0.08em; text-transform:uppercase; user-select:none; }
  `;

  // Line rows
  const lineasHtml = lineas.map(l => {
    const ivaPct = l.tarifa_iva_porcentaje != null ? `${l.tarifa_iva_porcentaje}%` : '0%';
    return `
      <tr>
        <td class="num">${l.codigo_interno || l.linea}</td>
        <td class="num">${new Intl.NumberFormat('es-CR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(l.cantidad)}</td>
        <td class="ctr">${l.unidad_medida || 'Unid'}</td>
        <td>${l.descripcion}</td>
        <td class="num">${l.descuento_monto > 0 ? fmtMoney(l.descuento_monto) : ''}</td>
        <td class="num">${fmtMoney(l.precio_unitario)}</td>
        <td class="num">${fmtMoney(l.total_linea)}</td>
        <td class="ctr">${ivaPct}</td>
      </tr>`;
  }).join('');

  const emptyRowsHtml = Array.from({ length: emptyRows }).map(() =>
    `<tr class="er"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
  ).join('');

  // Dispatch rows: incoterms, shipper, codigo_exportador, ggn_global_gap, ep_mag
  const despachoRowsHtml = [
    ['INCOTERMS:',          doc.incoterms || '—',              'MEDIO DE PAGO:',       medioPago],
    ['SHIPPER:',            doc.shipper || '—',                 'CONDICIÓN DE VENTA:',  condicion],
    ['CÓDIGO EXPORTADOR:',  doc.codigo_exportador || '—',       'MONEDA:',              doc.moneda || 'USD'],
    ['GGN GLOBAL GAP:',     doc.ggn_global_gap || '—',          'PLAZO:',               doc.plazo_credito_dias ? `${doc.plazo_credito_dias} días` : '—'],
    ['EP-MAG:',             doc.ep_mag || '—',                  '',                     ''],
  ];

  const despachoTableRows = despachoRowsHtml.map(([l1, v1, l2, v2]) => {
    if (!l2 && !v2) {
      return `<tr><td class="dlbl">${l1}</td><td class="dval">${v1 || '—'}" colspan="3"></td></tr>`;
    }
    return `<tr>
      <td class="dlbl">${l1}</td><td class="dval">${v1 || '—'}</td>
      <td class="dlbl">${l2}</td><td class="dval">${v2 || '—'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><style>${css}</style></head>
<body>
<div class="fw">

  <!-- Header -->
  <div class="hdr">
    <div class="logo-area">
      ${(logoDataUrl || config.logo_url) ? `<img src="${logoDataUrl || config.logo_url}" class="logo" alt="logo" />` : ''}
      <div>
        <div class="e-name">${config.nombre_emisor || config.nombre_comercial || ''}</div>
        <div class="e-line">Cédula ${config.numero_identificacion || ''}</div>
        <div class="e-line">${config.otras_senas || ''}</div>
        ${config.telefono_emisor ? `<div class="e-line">Teléfono: ${config.telefono_emisor}</div>` : ''}
        ${config.correo_envio   ? `<div class="e-line">Email: ${config.correo_envio}</div>` : ''}
      </div>
    </div>
    <div class="doc-box">
      <div class="doc-title">Factura Electrónica de Exportación</div>
      <div class="doc-no">No. ${doc.numero_consecutivo || ''}</div>
      <div class="doc-line">Fecha: ${fmtFecha(doc.fecha_emision)}</div>
      ${doc.clave_mh ? `<div class="clave">Clave: ${doc.clave_mh}</div>` : ''}
    </div>
  </div>

  <!-- Cliente -->
  <div class="rbar">Datos del Cliente</div>
  <div class="rgrid">
    <div class="rlbl">Cliente:</div><div class="rval" style="font-weight:700">${doc.receptor_nombre || ''}</div>
    <div class="rlbl">Condición:</div><div class="rval">${condicion}</div>
    <div class="rlbl">Cédula:</div><div class="rval">${doc.receptor_identificacion || ''}</div>
    <div class="rlbl">Plazo:</div><div class="rval">${doc.plazo_credito_dias ? `${doc.plazo_credito_dias} días` : '—'}</div>
    <div class="rlbl">Dirección:</div><div class="rval">${doc.receptor_direccion || ''}</div>
    <div class="rlbl">Moneda:</div><div class="rval">Dólar Estados Unidos</div>
    <div class="rlbl">Email:</div><div class="rval">${doc.receptor_email || ''}</div>
    <div class="rlbl">Tipo de Cambio:</div><div class="rval">${config.tipo_cambio_usd ? `$${config.tipo_cambio_usd.toFixed(2)}` : '—'}</div>
    <div class="rlbl">Teléfono:</div><div class="rval">${doc.receptor_telefono || ''}</div>
    <div class="rlbl">Forma de pago:</div><div class="rval">Efectivo</div>
  </div>

  <!-- Líneas -->
  <table class="ft">
    <thead><tr>
      <th style="width:7%">Código</th>
      <th style="width:10%">Cantidad</th>
      <th style="width:6%">Emp</th>
      <th style="text-align:left">Nombre del Artículo</th>
      <th style="width:7%">Descto</th>
      <th style="width:9%">Precio</th>
      <th style="width:10%">Total</th>
      <th style="width:5%">IVA</th>
    </tr></thead>
    <tbody>${lineasHtml}${emptyRowsHtml}</tbody>
  </table>

  <!-- Totales -->
  <div style="display:flex;justify-content:flex-end;margin-top:0">
    <table class="totals">
      <tr><td class="t-lbl">Subtotal</td><td class="t-amt">${fmtMoney(subtotal)}</td></tr>
      <tr><td class="t-lbl">Descuento</td><td class="t-amt">${totalDesc > 0 ? fmtMoney(totalDesc) : ''}</td></tr>
      <tr><td class="t-lbl">I.V.A.</td><td class="t-amt"></td></tr>
      <tr class="t-total"><td class="t-lbl" style="color:#fff">Total a Pagar</td><td class="t-amt">$${fmtMoney(doc.total_comprobante)}</td></tr>
    </table>
  </div>

  <div class="letras"><span style="font-weight:700;color:#555">Son: </span>${numeroALetras(doc.total_comprobante)}</div>

  <!-- Observaciones -->
  ${doc.observacion && doc.observacion.trim() ? `<table class="ft"><tbody>
    <tr class="obs-row"><td class="obs-label">Observaciones</td><td class="obs-val">${(doc as any).observacion}</td></tr>
  </tbody></table>` : ''}

  <!-- Información de Despacho -->
  <div class="dbar">INFORMACIÓN DE DESPACHO</div>
  <div class="dsub">INFORMAZIONI SULLA SPEDIZIONE</div>
  <table class="dtable"><tbody>${despachoTableRows}</tbody></table>

  <!-- Pie -->
  <div class="footer">
    <span>Autorización mediante Resolución No.MH-DGT-RES-0027-2024 del 13/11/2024 de la DGTD V.4.4</span>
    <span>Sistema MYA</span>
  </div>

</div>
${config.ambiente !== 'produccion' ? `<div class="wm"><span>AMBIENTE DE PRUEBAS</span></div>` : ''}
</body></html>`;
}

// ========== Enviar email ==========

export async function enviarEmailFn(
  doc: DocFee,
  empresaId: number,
  emailTo: string,
  emailCc: string,
  htmlContent: string
): Promise<{ ok: boolean; to?: string; cc?: string; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const resp = await fetch(`/api/facturacion/reenviar/${doc.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        empresa_id: empresaId,
        to_override: emailTo.trim() || undefined,
        cc: emailCc.trim() || undefined,
        html_factura: htmlContent,
      }),
    });
    const text = await resp.text();
    let result: any = {};
    try { result = JSON.parse(text); } catch { result = { ok: false, error: text.slice(0, 200) }; }
    if (result.ok) {
      return { ok: true, to: result.to, cc: result.cc };
    }
    return { ok: false, error: result.error || 'Desconocido' };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ========== React Component ==========


interface Props {
  docId: number;
  empresaId: number;
  onBack: () => void;
}

export default function FeeViewerAndPrint({ docId, empresaId, onBack }: Props) {
  const [doc, setDoc]             = useState<DocFee | null>(null);
  const [lineas, setLineas]       = useState<Linea[]>([]);
  const [config, setConfig]       = useState<Config | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailMsg, setEmailMsg]   = useState('');
  const [emailModal, setEmailModal] = useState(false);
  const [emailTo, setEmailTo]     = useState('');
  const [emailCc, setEmailCc]     = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const { doc: docData, lineas: linData, config: cfgData, logoDataUrl } =
        await loadDocData(docId, empresaId);
      if (!docData) { setError('No se encontró el documento'); setLoading(false); return; }
      setDoc(docData);
      setLineas(linData);
      if (cfgData) setConfig(cfgData);
      setLogoDataUrl(logoDataUrl);
      setLoading(false);
    }
    load();
  }, [docId, empresaId]);

  function abrirModalEmail() {
    setEmailTo(doc?.receptor_email || '');
    setEmailCc('');
    setEmailMsg('');
    setEmailModal(true);
  }

  async function handleEnviarEmail() {
    if (!doc || !config) return;
    setEnviandoEmail(true);
    setEmailMsg('');
    const html = buildPrintHtml(doc, lineas, config, logoDataUrl);
    const result = await enviarEmailFn(doc, empresaId, emailTo, emailCc, html);
    if (result.ok) {
      setEmailMsg(`✓ Enviado a ${result.to}${result.cc ? ` (CC: ${result.cc})` : ''}`);
      setTimeout(() => setEmailModal(false), 1200);
    } else {
      setEmailMsg(`Error: ${result.error || 'Desconocido'}`);
    }
    setEnviandoEmail(false);
  }

  function handlePrint() {
    if (!doc || !config) return;
    const html = buildPrintHtml(doc, lineas, config, logoDataUrl);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none';
    document.body.appendChild(iframe);
    iframe.contentDocument!.write(html);
    iframe.contentDocument!.close();
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    iframe.addEventListener('afterprint', () => document.body.removeChild(iframe));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64" style={{ color: 'var(--ink-muted)' }}>
      Cargando...
    </div>
  );

  if (error || !doc || !config) return (
    <div className="p-6">
      <button onClick={onBack} className="mb-4 text-xs underline" style={{ color: 'var(--ink-muted)' }}>
        ← Volver
      </button>
      <p style={{ color: '#f87171' }}>{error || 'Error cargando datos'}</p>
    </div>
  );

  // Screen render values
  const totalDesc = lineas.reduce((s, l) => s + l.descuento_monto, 0);
  const subtotal  = lineas.reduce((s, l) => s + (l.cantidad * l.precio_unitario), 0);
  const condicion = condicionLabel(doc.condicion_venta);
  const medioPago = doc.medio_pago || '—';

  const styles = `
    @media print {
      @page { margin: 8mm 10mm; size: A4 portrait; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    .fee-wrap { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #000;
                background: #fff; max-width: 780px; margin: 0 auto; padding: 14px; }
    .fee-header { display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
                  border-bottom: 2px solid #1e3a2f; padding-bottom: 6px; margin-bottom: 6px; }
    .fee-logo-area { display: flex; align-items: flex-start; gap: 10px; }
    .fee-logo { width: 52px; height: 52px; object-fit: contain; border-radius: 4px; }
    .fee-emisor-name { font-size: 13px; font-weight: 700; color: #1e3a2f; }
    .fee-emisor-line { font-size: 9px; color: #444; line-height: 1.4; }
    .fee-doc-box { text-align: right; }
    .fee-doc-title { font-size: 12px; font-weight: 700; color: #1e6b40; text-transform: uppercase; }
    .fee-doc-no { font-size: 11px; font-weight: 700; color: #1e6b40; }
    .fee-doc-line { font-size: 9px; color: #444; }
    .fee-clave { font-size: 7.5px; font-family: monospace; color: #1e3a2f; border: 1px solid #1e3a2f;
                 padding: 2px 6px; margin-top: 3px; display: inline-block; border-radius: 2px; }
    .fee-receptor-bar { background: #1e3a2f; color: #fff; font-size: 9px; font-weight: 700;
                        text-align: center; padding: 2px; margin: 4px 0 3px; letter-spacing: 0.08em; }
    .fee-receptor-grid { display: grid; grid-template-columns: 90px 1fr 110px 1fr;
                         gap: 1px 8px; margin-bottom: 5px; }
    .fee-label { font-size: 8.5px; font-weight: 700; color: #555; }
    .fee-val { font-size: 9px; color: #111; }
    .fee-table { width: 100%; border-collapse: collapse; margin: 6px 0 0 0; }
    .fee-table th { background: #1e3a2f; color: #fff; font-size: 8.5px; font-weight: 700;
                    padding: 2px 4px; text-align: center; border: 1px solid #1e3a2f; }
    .fee-table td { padding: 2px 4px; font-size: 9px; border: none; border-left: 1px solid #ccc; }
    .fee-table td:last-child { border-right: 1px solid #ccc; }
    .fee-table tbody tr:last-child td { border-bottom: 1px solid #ccc; }
    .fee-table .num { text-align: right; font-family: monospace; }
    .fee-table .ctr { text-align: center; }
    .fee-empty-row td { height: 11px; }
    .fee-totals { margin-left: auto; width: 220px; border-collapse: collapse; }
    .fee-totals td { padding: 2px 6px; font-size: 9px; border: 1px solid #ccc; }
    .fee-totals .lbl { font-weight: 700; text-align: right; background: #f5f5f5; }
    .fee-totals .amt { text-align: right; font-family: monospace; }
    .fee-totals .total-row td { background: #1e3a2f; color: #fff; font-weight: 700; font-size: 10px; }
    .fee-footer { font-size: 7.5px; color: #666; border-top: 1px solid #ccc; padding-top: 3px;
                  margin-top: 6px; display: flex; justify-content: space-between; }
    .fee-despacho-bar { background: #1e3a2f; color: #fff; font-size: 10px; font-weight: 700;
                        text-align: center; padding: 3px; margin: 8px 0 0; letter-spacing: 0.05em; }
    .fee-despacho-sub { text-align: center; font-size: 8px; color: #777; font-style: italic; margin-bottom: 3px; }
    .fee-despacho-table { width: 100%; border-collapse: collapse; }
    .fee-despacho-table td { border: 1px solid #bbb; padding: 3px 8px; font-size: 9.5px; }
    .fee-despacho-table .p2-label { font-weight: 700; width: 28%; background: #f0f0f0;
                                     color: #333; white-space: nowrap; }
    .fee-despacho-table .p2-val { color: #000; width: 22%; }
  `;

  // Dispatch rows
  const despachoRows = [
    ['INCOTERMS:',         doc.incoterms || '—',             'MEDIO DE PAGO:',       medioPago],
    ['SHIPPER:',           doc.shipper || '—',               'CONDICIÓN DE VENTA:',  condicion],
    ['CÓDIGO EXPORTADOR:', doc.codigo_exportador || '—',     'MONEDA:',              doc.moneda || 'USD'],
    ['GGN GLOBAL GAP:',    doc.ggn_global_gap || '—',         'PLAZO:',               doc.plazo_credito_dias ? `${doc.plazo_credito_dias} días` : '—'],
    ['EP-MAG:',            doc.ep_mag || '—',                '',                     ''],
  ];

  return (
    <div>
      <style>{styles}</style>

      {/* Controls bar — no se imprime */}
      <div className="no-print flex items-center gap-3 p-3 border-b flex-wrap"
        style={{ borderColor: 'var(--line)', background: 'var(--surface-raised)' }}>
        <button onClick={onBack}
          className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--surface-overlay)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
          ← Volver
        </button>
        <button onClick={handlePrint}
          className="text-xs px-3 py-1.5 rounded font-medium"
          style={{ background: '#166534', color: '#fff' }}>
          Imprimir
        </button>
        <button onClick={abrirModalEmail}
          className="text-xs px-3 py-1.5 rounded font-medium"
          style={{ background: '#1e3a5f', color: '#fff' }}>
          {'\u2709'} Enviar por Email
        </button>
        {emailMsg && (
          <span className="text-xs" style={{ color: emailMsg.startsWith('\u2713') ? '#4ade80' : '#f87171' }}>
            {emailMsg}
          </span>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--ink-faint)' }}>
          FEE #{doc.numero_consecutivo}
        </span>
      </div>

      <div className="fee-wrap">

        {/* Encabezado */}
        <div className="fee-header">
          <div className="fee-logo-area">
            {config.logo_url && (
              <img src={logoDataUrl || config.logo_url} alt="logo" className="fee-logo" />
            )}
            <div>
              <div className="fee-emisor-name">{config.nombre_emisor || config.nombre_comercial}</div>
              <div className="fee-emisor-line">Cédula {config.numero_identificacion}</div>
              <div className="fee-emisor-line">{config.otras_senas}</div>
              {config.telefono_emisor && <div className="fee-emisor-line">Teléfono: {config.telefono_emisor}</div>}
              {config.correo_envio && <div className="fee-emisor-line">Email: {config.correo_envio}</div>}
            </div>
          </div>
          <div className="fee-doc-box">
            <div className="fee-doc-title">Factura Electrónica de Exportación</div>
            <div className="fee-doc-no">No. {doc.numero_consecutivo}</div>
            <div className="fee-doc-line">Fecha: {fmtFecha(doc.fecha_emision)}</div>
            {doc.clave_mh && <div className="fee-clave">Clave: {doc.clave_mh}</div>}
          </div>
        </div>

        {/* Receptor */}
        <div className="fee-receptor-bar">Datos del Cliente</div>
        <div className="fee-receptor-grid">
          <div className="fee-label">Cliente:</div>
          <div className="fee-val" style={{ fontWeight: 700 }}>{doc.receptor_nombre}</div>
          <div className="fee-label">Condición:</div>
          <div className="fee-val">{condicion}</div>

          <div className="fee-label">Cédula:</div>
          <div className="fee-val">{doc.receptor_identificacion}</div>
          <div className="fee-label">Plazo:</div>
          <div className="fee-val">{doc.plazo_credito_dias ? `${doc.plazo_credito_dias} días` : '—'}</div>

          <div className="fee-label">Dirección:</div>
          <div className="fee-val">{doc.receptor_direccion}</div>
          <div className="fee-label">Moneda:</div>
          <div className="fee-val">Dólar Estados Unidos</div>

          <div className="fee-label">Email:</div>
          <div className="fee-val">{doc.receptor_email}</div>
          <div className="fee-label">Tipo de Cambio:</div>
          <div className="fee-val">${config.tipo_cambio_usd?.toFixed(2) || '—'}</div>

          <div className="fee-label">Teléfono:</div>
          <div className="fee-val">{doc.receptor_telefono}</div>
          <div className="fee-label">Forma de pago:</div>
          <div className="fee-val">Efectivo</div>
        </div>

        {/* Líneas */}
        <table className="fee-table">
          <thead>
            <tr>
              <th style={{ width: '7%' }}>Código</th>
              <th style={{ width: '10%' }}>Cantidad</th>
              <th style={{ width: '6%' }}>Emp</th>
              <th>Nombre del Artículo</th>
              <th style={{ width: '7%' }}>Descto</th>
              <th style={{ width: '9%' }}>Precio</th>
              <th style={{ width: '10%' }}>Total</th>
              <th style={{ width: '5%' }}>IVA</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map(l => {
              const ivaPct = l.tarifa_iva_porcentaje != null ? `${l.tarifa_iva_porcentaje}%` : '0%';
              return (
                <tr key={l.linea}>
                  <td className="num">{l.codigo_interno || l.linea}</td>
                  <td className="num">{new Intl.NumberFormat('es-CR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(l.cantidad)}</td>
                  <td className="ctr">{l.unidad_medida || 'Unid'}</td>
                  <td>{l.descripcion}</td>
                  <td className="num">{l.descuento_monto > 0 ? fmtMoney(l.descuento_monto) : ''}</td>
                  <td className="num">{fmtMoney(l.precio_unitario)}</td>
                  <td className="num">{fmtMoney(l.total_linea)}</td>
                  <td className="ctr">{ivaPct}</td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, 20 - lineas.length) }).map((_, i) => (
              <tr key={`empty-${i}`} className="fee-empty-row">
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 0 }}>
          <table className="fee-totals">
            <tbody>
              <tr>
                <td className="lbl">Subtotal</td>
                <td className="amt">{fmtMoney(subtotal)}</td>
              </tr>
              <tr>
                <td className="lbl">Descuento</td>
                <td className="amt">{totalDesc > 0 ? fmtMoney(totalDesc) : ''}</td>
              </tr>
              <tr>
                <td className="lbl">I.V.A.</td>
                <td className="amt"></td>
              </tr>
              <tr className="total-row">
                <td className="lbl" style={{ color: '#fff' }}>Total a Pagar</td>
                <td className="amt">${fmtMoney(doc.total_comprobante)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Valor en letras */}
        <div style={{ border: '1px solid #ccc', padding: '3px 8px', marginTop: 3, fontSize: 9 }}>
          <span style={{ fontWeight: 700, color: '#555' }}>Son: </span>
          <span style={{ color: '#000', textTransform: 'uppercase' }}>{numeroALetras(doc.total_comprobante)}</span>
        </div>

        {/* Observaciones */}
        {doc.observacion && doc.observacion.trim() && (
          <table className="fee-table" style={{ marginTop: 6 }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700, fontSize: 8.5, color: '#555', width: 80, padding: '4px 6px', verticalAlign: 'top' }}>
                  Observaciones
                </td>
                <td style={{ fontSize: 9, color: '#333', padding: '4px 6px' }}>
                  {doc.observacion}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Información de Despacho */}
        <div className="fee-despacho-bar">INFORMACIÓN DE DESPACHO</div>
        <div className="fee-despacho-sub">INFORMAZIONI SULLA SPEDIZIONE</div>
        <table className="fee-despacho-table">
          <tbody>
            {despachoRows.map(([lbl1, val1, lbl2, val2], i) => {
              if (!lbl2 && !val2) {
                return (
                  <tr key={i}>
                    <td className="p2-label">{lbl1}</td>
                    <td className="p2-val" colSpan={3}>{val1 || '—'}</td>
                  </tr>
                );
              }
              return (
                <tr key={i}>
                  <td className="p2-label">{lbl1}</td>
                  <td className="p2-val">{val1 || '—'}</td>
                  <td className="p2-label">{lbl2}</td>
                  <td className="p2-val">{val2 || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pie */}
        <div className="fee-footer" style={{ marginTop: 8 }}>
          <span>Autorización mediante Resolución No.MH-DGT-RES-0027-2024 del 13/11/2024 de la DGTD V.4.4</span>
          <span>Sistema MYA</span>
        </div>

      </div>

      {/* Modal confirmación email */}
      {emailModal && (
        <div className="no-print fixed inset-0 flex items-center justify-center p-4 bg-black/75" style={{ zIndex: 9999 }}>
          <div className="w-full max-w-md rounded-lg shadow-2xl" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg,#0d1829 0%,#101b2e 100%)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Enviar FEE por Email</h2>
              <button onClick={() => setEmailModal(false)} className="rounded p-0.5 text-xs" style={{ color: 'var(--ink-faint)' }}>✕</button>
            </div>
            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>
                  Destinatario (Para:)
                </label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  placeholder="correo@cliente.com"
                  className="w-full px-3 py-2 rounded text-xs"
                  style={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                />
                <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-faint)' }}>Puede separar múltiples correos con coma</p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>
                  Con copia (CC:) — opcional
                </label>
                <input
                  type="text"
                  value={emailCc}
                  onChange={e => setEmailCc(e.target.value)}
                  placeholder="copia@empresa.com, otra@empresa.com"
                  className="w-full px-3 py-2 rounded text-xs"
                  style={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                />
              </div>
              {emailMsg && !emailMsg.startsWith('\u2713') && (
                <p className="text-xs" style={{ color: '#f87171' }}>{emailMsg}</p>
              )}
            </div>
            {/* Footer */}
            <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-overlay)' }}>
              <button onClick={() => setEmailModal(false)}
                className="text-xs px-3 py-1.5 rounded"
                style={{ background: 'var(--surface-overlay)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
                Cancelar
              </button>
              <button onClick={handleEnviarEmail} disabled={enviandoEmail || !emailTo.trim()}
                className="text-xs px-4 py-1.5 rounded font-medium"
                style={{ background: '#1e3a5f', color: '#fff', opacity: !emailTo.trim() || enviandoEmail ? 0.5 : 1 }}>
                {enviandoEmail ? 'Enviando...' : '\u2709 Confirmar envío'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

