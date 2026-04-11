import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';

interface ReportesCobroProps {
  empresaId: number;
  canView?: boolean;
  canEdit?: boolean;
  onVolverGestion?: () => void;
  onVolverRecaudacion?: () => void;
}

interface PagoReporteRow {
  id: number;
  empresa_id: number;
  tercero_nombre: string;
  tercero_identificacion: string | null;
  fecha_pago: string;
  moneda: 'CRC' | 'USD' | string;
  monto_total: number;
  monto_ajuste: number;
  monto_aplicado: number;
  monto_no_aplicado: number;
  medio_pago: string;
  referencia: string | null;
  motivo_diferencia: string | null;
  estado: string;
  asiento_id: number | null;
}

interface AuxiliarReporteRow {
  id: number;
  empresa_id: number;
  pago_id: number;
  tercero_nombre: string;
  tercero_identificacion: string | null;
  fecha_movimiento: string;
  moneda: 'CRC' | 'USD' | string;
  monto: number;
  referencia: string | null;
  estado_conciliacion: string;
  estado_pago: string;
  asiento_id: number | null;
}

interface CierreCajaRow {
  empresa_id: number;
  fecha_pago: string;
  moneda: 'CRC' | 'USD' | string;
  cajero_auth_user_id: string | null;
  cajero_nombre: string;
  cajero_username: string;
  medio_pago: string;
  pagos: number;
  total_recaudado: number;
  total_ajuste: number;
  total_aplicado: number;
  total_no_aplicado: number;
}

interface FeCierreCajaRow {
  id: number;
  turno_id: number;
  empresa_id: number;
  fecha_pago: string;
  fecha_emision: string;
  numero_consecutivo: string | null;
  tipo_documento: string;
  asiento_id: number | null;
  moneda: 'CRC' | 'USD' | string;
  cajero_auth_user_id: string | null;
  cajero_nombre: string;
  cajero_username: string;
  medio_pago: string;
  pagos: number;
  total_recaudado: number;
  total_ajuste: number;
  total_aplicado: number;
  total_no_aplicado: number;
}

interface CierreCajaSnapshotRow {
  id: number;
  empresa_id: number;
  fecha_desde: string;
  fecha_hasta: string;
  moneda: string | null;
  cajero_auth_user_id: string | null;
  cajero_nombre: string | null;
  pagos: number;
  total_recaudado: number;
  total_ajuste: number;
  total_aplicado: number;
  total_no_aplicado: number;
  efectivo_liquidar: number;
  no_efectivo: number;
  observacion: string | null;
  estado: string;
  created_at: string;
  updated_at?: string;
  updated_by?: string | null;
}

interface CierreCajaBitacoraRow {
  id: number;
  cierre_id: number;
  empresa_id: number;
  accion: 'cerrar' | 'anular' | 'reabrir' | string;
  detalle: string | null;
  payload: Record<string, any> | null;
  created_at: string;
  created_by: string | null;
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

interface CajaTurnoRow {
  id: number;
  empresa_id: number;
  punto_venta_id: number;
  punto_venta_codigo: string;
  punto_venta_nombre: string;
  caja_id: number;
  caja_codigo: string;
  caja_nombre: string;
  cajero_auth_user_id: string;
  cajero_nombre: string;
  fecha_hora_apertura: string;
  fecha_hora_cierre: string | null;
  estado: string;
  saldo_inicial: number;
  total_recaudado: number;
  total_aplicado: number;
  total_no_aplicado: number;
  total_efectivo: number;
  total_no_efectivo: number;
  saldo_final_sistema: number;
  saldo_final_fisico: number | null;
  diferencia_cierre: number | null;
  observacion: string | null;
}

const styles = `
  .rc-wrap { padding:0; color:#d6e2ff; }
  .rc-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:6px; }
  .rc-sub { font-size:12px; color:#8ea3c7; margin-bottom:12px; }
  .rc-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; padding:12px; margin-bottom:12px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .rc-grid { display:grid; grid-template-columns: 170px 170px 130px 160px auto; gap:8px; align-items:end; }
  .rc-field { display:flex; flex-direction:column; gap:4px; }
  .rc-field label { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .rc-input, .rc-select { width:100%; border:1px solid rgba(137,160,201,0.22); border-radius:12px; padding:10px 12px; font-size:13px; background:#1d2738; color:#f3f7ff; }
  .rc-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
  .rc-btn { border:1px solid rgba(137,160,201,0.18); background:#243149; color:#d6e2ff; border-radius:10px; padding:8px 11px; font-size:13px; cursor:pointer; }
  .rc-btn.main { border-color:#16a34a; background:#16a34a; color:#fff; }
  .rc-btn:disabled { opacity:.65; cursor:not-allowed; }
  .rc-table { border:1px solid rgba(137,160,201,0.18); border-radius:12px; overflow:auto; margin-top:8px; background:#1d2738; }
  .rc-table table { width:100%; border-collapse:collapse; min-width:980px; }
  .rc-table th, .rc-table td { padding:8px 10px; border-top:1px solid rgba(137,160,201,0.12); font-size:12px; color:#d6e2ff; }
  .rc-table th { background:#131b2a; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-size:11px; text-align:left; }
  .rc-right { text-align:right; font-family:'DM Mono',monospace; }
  .rc-empty { color:#8ea3c7; font-size:12px; padding:10px; text-align:center; }
  .rc-kpi-grid { display:grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap:8px; margin-bottom:10px; }
  .rc-kpi { border:1px solid rgba(137,160,201,0.18); border-radius:12px; padding:10px; background:#1d2738; }
  .rc-kpi .k { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .rc-kpi .v { margin-top:6px; font-size:20px; font-weight:700; color:#f3f7ff; }
  .rc-kpi .v.small { font-size:16px; line-height:1.35; }
  .rc-msg-ok { margin-bottom:10px; border:1px solid #1d6e4f; background:#0f2c20; color:#9df4c7; border-radius:12px; padding:10px 12px; font-size:12px; }
  .rc-msg-err { margin-bottom:10px; border:1px solid #7d2f3a; background:#34181c; color:#ffb3bb; border-radius:12px; padding:10px 12px; font-size:12px; }
  @media (max-width: 1200px) { .rc-grid { grid-template-columns: 1fr 1fr; } .rc-actions { justify-content:flex-start; } }
  @media (max-width: 760px) { .rc-grid, .rc-kpi-grid { grid-template-columns: 1fr; } }
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

const todayIso = () => new Date().toISOString().slice(0, 10);

const firstDayIso = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const parseLocalAmount = (raw: string): number => {
  const v = String(raw || '').trim();
  if (!v) return 0;
  if (v.includes(',')) return toNum(v.replace(/\./g, '').replace(',', '.'));
  return toNum(v.replace(/,/g, ''));
};

const formatLocalAmount = (n: number): string =>
  new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(toNum(n));

const csvEscape = (value: string | number | null | undefined) => {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const downloadCsv = (
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
) => {
  const csv = [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const downloadExcel = (
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
) => {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
};

const htmlEscape = (v: string | number | null | undefined) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const exportPdfPrint = (
  title: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
) => {
  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) return;
  const head = headers.map((h) => `<th>${htmlEscape(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${htmlEscape(c)}</td>`).join('')}</tr>`).join('');
  win.document.write(`
    <html>
      <head>
        <title>${htmlEscape(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 18px; }
          h1 { font-size: 18px; margin: 0 0 12px; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
          th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>${htmlEscape(title)}</h1>
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
};

const exportPdfVertical = (
  title: string,
  rows: Array<[string, string | number | null | undefined]>
) => {
  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) return;
  const isAmount = (label: string) => /saldo|total|diferencia|efectivo|no efectivo|aplicado/i.test(label);
  const empresaRow = rows.find((r) => String(r[0]).toLowerCase() === 'empresa');
  const empresaTitle = empresaRow ? String(empresaRow[1] || '') : '';
  const firmaRows = rows.filter((r) => /^firma\s+/i.test(String(r[0])));
  const observacionRow = rows.find((r) => String(r[0]).toLowerCase() === 'observacion');
  const detailRows = rows.filter(
    (r) =>
      !/^firma\s+/i.test(String(r[0])) &&
      String(r[0]).toLowerCase() !== 'empresa' &&
      String(r[0]).toLowerCase() !== 'observacion'
  );
  let saldoInicialRow: [string, string | number | null | undefined] | null = null;
  const saldoIdx = detailRows.findIndex((r) => String(r[0]).toLowerCase() === 'saldo inicial');
  if (saldoIdx >= 0) {
    saldoInicialRow = detailRows[saldoIdx];
    detailRows.splice(saldoIdx, 1);
  }
  const half = Math.ceil(detailRows.length / 2);
  const leftRows = detailRows.slice(0, half);
  const rightRows = detailRows.slice(half);
  if (saldoInicialRow) rightRows.unshift(saldoInicialRow);
  const maxRows = Math.max(leftRows.length, rightRows.length);

  const detailsBody = Array.from({ length: maxRows })
    .map((_, idx) => {
      const l = leftRows[idx];
      const r = rightRows[idx];
      const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      const lAlign = l && isAmount(String(l[0])) ? 'right' : 'left';
      const rAlign = r && isAmount(String(r[0])) ? 'right' : 'left';
      const lFf = l && isAmount(String(l[0])) ? "'DM Mono', monospace" : "Arial, sans-serif";
      const rFf = r && isAmount(String(r[0])) ? "'DM Mono', monospace" : "Arial, sans-serif";
      return `
        <div style="display:grid;grid-template-columns:180px 1fr 180px 1fr;align-items:center;padding:8px 10px;background:${bg};column-gap:8px;">
          <div style="font-size:12px;color:#475569;font-weight:600;">${l ? htmlEscape(l[0]) : ''}</div>
          <div style="font-size:13px;color:#0f172a;text-align:${lAlign};font-family:${lFf};">${l ? htmlEscape(l[1]) : ''}</div>
          <div style="font-size:12px;color:#475569;font-weight:600;">${r ? htmlEscape(r[0]) : ''}</div>
          <div style="font-size:13px;color:#0f172a;text-align:${rAlign};font-family:${rFf};">${r ? htmlEscape(r[1]) : ''}</div>
        </div>
      `;
    })
    .join('');

  const firmas = (firmaRows.length ? firmaRows : [['Firma cajero', ''], ['Firma supervisor', ''], ['Firma contabilidad', '']]).slice(0, 3);
  const firmasBody = firmas
    .map(
      (f) => `
        <div style="padding:26px 8px 0;">
          <div style="border-top:1px solid #334155;height:26px;"></div>
          <div style="font-size:12px;color:#475569;text-align:center;">${htmlEscape(String(f[0]).replace(/^Firma\s+/i, ''))}</div>
        </div>
      `
    )
    .join('');

  win.document.write(`
    <html>
      <head>
        <title>${htmlEscape(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 18px; color:#0f172a; }
          h1 { font-size: 24px; margin: 0 0 6px; text-transform: uppercase; }
          h2 { font-size: 16px; margin: 0 0 12px; color:#1f2937; }
          .box { border: none; border-radius: 0; overflow: hidden; }
        </style>
      </head>
      <body>
        <h1>${htmlEscape(empresaTitle || 'Empresa')}</h1>
        <h2>${htmlEscape(title)}</h2>
        <div class="box">${detailsBody}</div>
        ${
          observacionRow
            ? `<div style="display:grid;grid-template-columns:180px 1fr;align-items:start;padding:10px 10px;background:#ffffff;margin-top:8px;">
                 <div style="font-size:12px;color:#475569;font-weight:600;">${htmlEscape(observacionRow[0])}</div>
                 <div style="font-size:13px;color:#0f172a;">${htmlEscape(observacionRow[1])}</div>
               </div>`
            : ''
        }
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin-top:20px;">${firmasBody}</div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
};

export default function ReportesCobro({ empresaId, canView = true, canEdit = false, onVolverGestion, onVolverRecaudacion }: ReportesCobroProps) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [cerrandoCaja, setCerrandoCaja] = useState(false);
  const [cierreObs, setCierreObs] = useState('');
  const [desde, setDesde] = useState(firstDayIso());
  const [hasta, setHasta] = useState(todayIso());
  const [moneda, setMoneda] = useState<'ALL' | 'CRC' | 'USD'>('ALL');
  const [estadoAuxiliar, setEstadoAuxiliar] = useState<'ALL' | 'pendiente' | 'conciliado' | 'anulado'>('ALL');
  const [pagos, setPagos] = useState<PagoReporteRow[]>([]);
  const [auxiliar, setAuxiliar] = useState<AuxiliarReporteRow[]>([]);
  const [cierreCaja, setCierreCaja] = useState<CierreCajaRow[]>([]);
  const [cierreFe, setCierreFe] = useState<FeCierreCajaRow[]>([]);
  const [cierresHistorial, setCierresHistorial] = useState<CierreCajaSnapshotRow[]>([]);
  const [cierreSeleccionadoId, setCierreSeleccionadoId] = useState<number | null>(null);
  const [cierresBitacora, setCierresBitacora] = useState<CierreCajaBitacoraRow[]>([]);
  const [puntosVenta, setPuntosVenta] = useState<PuntoVentaRow[]>([]);
  const [cajas, setCajas] = useState<CajaRow[]>([]);
  const [puntoVentaId, setPuntoVentaId] = useState<number>(0);
  const [cajaId, setCajaId] = useState<number>(0);
  const [saldoInicialTxt, setSaldoInicialTxt] = useState<string>('0,00');
  const [saldoFinalFisicoTxt, setSaldoFinalFisicoTxt] = useState<string>('');
  const [turnoObs, setTurnoObs] = useState<string>('');
  const [turnoActivo, setTurnoActivo] = useState<CajaTurnoRow | null>(null);
  const [turnosRecientes, setTurnosRecientes] = useState<CajaTurnoRow[]>([]);
  const [turnoSeleccionadoId, setTurnoSeleccionadoId] = useState<number | null>(null);
  const [operandoTurno, setOperandoTurno] = useState(false);
  const [seedDemoBusy, setSeedDemoBusy] = useState(false);
  const [empresaNombre, setEmpresaNombre] = useState('');
  const isDevHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const diferencias = useMemo(
    () => pagos.filter((p) => toNum(p.monto_ajuste) > 0),
    [pagos]
  );
  const pagosConfirmados = useMemo(
    () => pagos.filter((p) => ['confirmado', 'contabilizado', 'conciliado'].includes(String(p.estado || '').toLowerCase())),
    [pagos]
  );
  const pagosBorrador = useMemo(
    () => pagos.filter((p) => String(p.estado || '').toLowerCase() === 'borrador'),
    [pagos]
  );

  const totalCobrado = useMemo(
    () => pagos.reduce((acc, p) => acc + toNum(p.monto_total), 0),
    [pagos]
  );
  const totalCobradoConfirmado = useMemo(
    () => pagosConfirmados.reduce((acc, p) => acc + toNum(p.monto_total), 0),
    [pagosConfirmados]
  );
  const totalCobradoBorrador = useMemo(
    () => pagosBorrador.reduce((acc, p) => acc + toNum(p.monto_total), 0),
    [pagosBorrador]
  );

  const totalAplicado = useMemo(
    () => pagos.reduce((acc, p) => acc + toNum(p.monto_aplicado), 0),
    [pagos]
  );
  const totalAplicadoConfirmado = useMemo(
    () => pagosConfirmados.reduce((acc, p) => acc + toNum(p.monto_aplicado), 0),
    [pagosConfirmados]
  );

  const totalAjuste = useMemo(
    () => pagos.reduce((acc, p) => acc + toNum(p.monto_ajuste), 0),
    [pagos]
  );
  const totalAjusteConfirmado = useMemo(
    () => pagosConfirmados.reduce((acc, p) => acc + toNum(p.monto_ajuste), 0),
    [pagosConfirmados]
  );
  const totalNoAplicadoConfirmado = useMemo(
    () => pagosConfirmados.reduce((acc, p) => acc + toNum(p.monto_no_aplicado), 0),
    [pagosConfirmados]
  );
  const efectivoLiquidar = useMemo(
    () =>
      pagosConfirmados
        .filter((p) => String(p.medio_pago || '').toUpperCase() === 'EFECTIVO')
        .reduce((acc, p) => acc + toNum(p.monto_total), 0),
    [pagosConfirmados]
  );
  const recaudoNoEfectivoConfirmado = useMemo(
    () =>
      pagosConfirmados
        .filter((p) => String(p.medio_pago || '').toUpperCase() !== 'EFECTIVO')
        .reduce((acc, p) => acc + toNum(p.monto_total), 0),
    [pagosConfirmados]
  );

  const totalAuxiliar = useMemo(
    () => auxiliar.reduce((acc, a) => acc + toNum(a.monto), 0),
    [auxiliar]
  );

  const totalCierre = useMemo(
    () => cierreCaja.reduce((acc, c) => acc + toNum(c.total_recaudado), 0),
    [cierreCaja]
  );
  const totalCierreFe = useMemo(
    () => cierreFe.reduce((acc, c) => acc + toNum(c.total_recaudado), 0),
    [cierreFe]
  );

  const cierrePorMedioPago = useMemo(() => {
    const map = new Map<string, { total: number; moneda: string; medio: string }>();
    cierreCaja.forEach((row) => {
      const key = String(row.medio_pago || 'N/D').toUpperCase();
      const mon = String(row.moneda || 'CRC').toUpperCase();
      const mapKey = `${key}|${mon}`;
      const curr = map.get(mapKey) || { total: 0, moneda: mon, medio: key };
      curr.total += toNum(row.total_recaudado);
      map.set(mapKey, curr);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [cierreCaja]);
  const cierreFePorMedioPago = useMemo(() => {
    const map = new Map<string, { total: number; moneda: string; medio: string }>();
    cierreFe.forEach((row) => {
      const key = String(row.medio_pago || 'N/D').toUpperCase();
      const mon = String(row.moneda || 'CRC').toUpperCase();
      const mapKey = `${key}|${mon}`;
      const curr = map.get(mapKey) || { total: 0, moneda: mon, medio: key };
      curr.total += toNum(row.total_recaudado);
      map.set(mapKey, curr);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [cierreFe]);

  const kpiMoneda = useMemo(() => {
    const pagoMonedas = ['CRC', 'USD'].map((m) => {
      const rows = pagos.filter((p) => p.moneda === m);
      return {
        moneda: m,
        cobrado: rows.reduce((acc, p) => acc + toNum(p.monto_total), 0),
        aplicado: rows.reduce((acc, p) => acc + toNum(p.monto_aplicado), 0),
        ajuste: rows.reduce((acc, p) => acc + toNum(p.monto_ajuste), 0),
      };
    });
    const auxMonedas = ['CRC', 'USD'].map((m) => ({
      moneda: m,
      total: auxiliar.filter((a) => a.moneda === m).reduce((acc, a) => acc + toNum(a.monto), 0),
    }));
    return { pagoMonedas, auxMonedas };
  }, [pagos, auxiliar]);

  const cargarReportes = async () => {
    if (!canView) return;
    setBusy(true);
    setErr('');
    try {
      let pagosQuery = supabase
        .from('vw_recaudacion_pagos')
        .select('*')
        .eq('empresa_id', empresaId)
        .gte('fecha_pago', desde)
        .lte('fecha_pago', hasta)
        .order('fecha_pago', { ascending: false })
        .order('id', { ascending: false })
        .limit(1000);

      if (moneda !== 'ALL') pagosQuery = pagosQuery.eq('moneda', moneda);

      let auxQuery = supabase
        .from('vw_recaudacion_auxiliar_banco')
        .select('*')
        .eq('empresa_id', empresaId)
        .gte('fecha_movimiento', desde)
        .lte('fecha_movimiento', hasta)
        .order('fecha_movimiento', { ascending: false })
        .order('id', { ascending: false })
        .limit(1000);

      if (moneda !== 'ALL') auxQuery = auxQuery.eq('moneda', moneda);
      if (estadoAuxiliar !== 'ALL') auxQuery = auxQuery.eq('estado_conciliacion', estadoAuxiliar);

      let cierreQuery = supabase
        .from('vw_recaudacion_cierre_caja')
        .select('*')
        .eq('empresa_id', empresaId)
        .gte('fecha_pago', desde)
        .lte('fecha_pago', hasta)
        .order('fecha_pago', { ascending: false })
        .limit(2000);

      if (moneda !== 'ALL') cierreQuery = cierreQuery.eq('moneda', moneda);

      let cierreFeQuery = supabase
        .from('vw_caja_turno_medios_fe')
        .select('*')
        .eq('empresa_id', empresaId)
        .gte('fecha_pago', desde)
        .lte('fecha_pago', hasta)
        .order('fecha_pago', { ascending: false })
        .limit(2000);

      if (moneda !== 'ALL') cierreFeQuery = cierreFeQuery.eq('moneda', moneda);

      const [pagosRes, auxRes, cierreRes, cierreFeRes] = await Promise.all([pagosQuery, auxQuery, cierreQuery, cierreFeQuery]);

      if (pagosRes.error) throw pagosRes.error;
      if (auxRes.error) throw auxRes.error;

      setPagos((pagosRes.data || []) as PagoReporteRow[]);
      setAuxiliar((auxRes.data || []) as AuxiliarReporteRow[]);
      if (cierreRes.error) {
        setCierreCaja([]);
        setErr(`No se pudo cargar cierre de caja: ${cierreRes.error.message}`);
      } else {
        setCierreCaja((cierreRes.data || []) as CierreCajaRow[]);
      }
      if (cierreFeRes.error) {
        setCierreFe([]);
      } else {
        setCierreFe((cierreFeRes.data || []) as FeCierreCajaRow[]);
      }
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudieron cargar los reportes.'));
      setPagos([]);
      setAuxiliar([]);
      setCierreCaja([]);
      setCierreFe([]);
    } finally {
      setBusy(false);
    }
  };

  const cargarCierresSnapshot = async () => {
    if (!canView) return;
    let q = supabase
      .from('vw_recaudacion_cierres_caja')
      .select('*')
      .eq('empresa_id', empresaId)
      .gte('fecha_hasta', desde)
      .lte('fecha_hasta', hasta)
      .order('created_at', { ascending: false })
      .limit(200);
    if (moneda !== 'ALL') q = q.eq('moneda', moneda);
    const { data, error } = await q;
    if (error) {
      setCierresHistorial([]);
      return;
    }
    setCierresHistorial((data || []) as CierreCajaSnapshotRow[]);
  };

  const cargarBitacoraCierre = async (cierreId: number | null) => {
    if (!cierreId) {
      setCierresBitacora([]);
      return;
    }
    const { data, error } = await supabase
      .from('recaudacion_cierres_caja_bitacora')
      .select('*')
      .eq('cierre_id', cierreId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      setCierresBitacora([]);
      return;
    }
    setCierresBitacora((data || []) as CierreCajaBitacoraRow[]);
  };

  const cargarPuntosVenta = async () => {
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

  const cargarCajas = async (pvId: number) => {
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

  const cargarTurnos = async () => {
    const { data, error } = await supabase
      .from('vw_caja_turnos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_hora_apertura', { ascending: false })
      .limit(100);
    if (error) {
      setTurnoActivo(null);
      setTurnosRecientes([]);
      return;
    }
    const rows = (data || []) as CajaTurnoRow[];
    setTurnosRecientes(rows);
    setTurnoActivo(rows.find((r) => r.estado === 'abierto') || null);
    if (!turnoSeleccionadoId || !rows.some((r) => r.id === turnoSeleccionadoId)) {
      const pref = rows.find((r) => r.estado === 'cerrado') || rows[0] || null;
      setTurnoSeleccionadoId(pref ? pref.id : null);
    }
  };

  const abrirTurnoCaja = async () => {
    if (!canEdit || operandoTurno || !puntoVentaId || !cajaId) return;
    setOperandoTurno(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('abrir_caja_turno', {
        p_empresa_id: empresaId,
        p_punto_venta_id: puntoVentaId,
        p_caja_id: cajaId,
        p_saldo_inicial: parseLocalAmount(saldoInicialTxt),
        p_observacion: turnoObs || null,
      });
      if (error) throw error;
      setOk(`Turno de caja abierto. #${data}`);
      await cargarTurnos();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo abrir turno de caja.'));
    } finally {
      setOperandoTurno(false);
    }
  };

  const cerrarTurnoCaja = async () => {
    if (!canEdit || operandoTurno || !turnoActivo?.id) return;
    setOperandoTurno(true);
    setErr('');
    setOk('');
    try {
      const saldoFisico = parseLocalAmount(saldoFinalFisicoTxt);
      const { error } = await supabase.rpc('cerrar_caja_turno', {
        p_turno_id: turnoActivo.id,
        p_saldo_final_fisico: saldoFinalFisicoTxt.trim() ? saldoFisico : null,
        p_observacion: turnoObs || null,
      });
      if (error) throw error;
      setOk(`Turno #${turnoActivo.id} cerrado correctamente.`);
      setSaldoFinalFisicoTxt('');
      setTurnoObs('');
      await cargarTurnos();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo cerrar turno de caja.'));
    } finally {
      setOperandoTurno(false);
    }
  };

  const cargarDemoTurnos = async () => {
    if (!isDevHost || seedDemoBusy) return;
    setSeedDemoBusy(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('seed_caja_turnos_movimientos_demo');
      if (error) throw error;
      setOk(String(data || 'Seed demo aplicado.'));
      await Promise.all([cargarTurnos(), cargarReportes(), cargarPuntosVenta()]);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo cargar seed demo.'));
    } finally {
      setSeedDemoBusy(false);
    }
  };

  const cerrarCaja = async () => {
    if (!canEdit || cerrandoCaja) return;
    setCerrandoCaja(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('cerrar_recaudacion_caja', {
        p_empresa_id: empresaId,
        p_fecha_desde: desde,
        p_fecha_hasta: hasta,
        p_moneda: moneda === 'ALL' ? null : moneda,
        p_observacion: cierreObs || null,
      });
      if (error) throw error;
      setOk(`Caja cerrada correctamente. Cierre #${data}`);
      await Promise.all([cargarReportes(), cargarCierresSnapshot()]);
      setCierreSeleccionadoId(Number(data || 0) || null);
      await cargarBitacoraCierre(Number(data || 0) || null);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo cerrar caja.'));
    } finally {
      setCerrandoCaja(false);
    }
  };

  const anularCierre = async (row: CierreCajaSnapshotRow) => {
    if (!canEdit) return;
    const motivo = window.prompt('Motivo de anulacion del cierre:', '');
    if (motivo === null) return;
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('anular_recaudacion_cierre_caja', {
        p_cierre_id: row.id,
        p_motivo: motivo || null,
      });
      if (error) throw error;
      setOk(`Cierre #${row.id} anulado.`);
      await Promise.all([cargarCierresSnapshot(), cargarBitacoraCierre(row.id)]);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo anular el cierre.'));
    }
  };

  const reabrirCierre = async (row: CierreCajaSnapshotRow) => {
    if (!canEdit) return;
    const motivo = window.prompt('Motivo de reapertura del cierre:', '');
    if (motivo === null) return;
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('reabrir_recaudacion_cierre_caja', {
        p_cierre_id: row.id,
        p_motivo: motivo || null,
      });
      if (error) throw error;
      setOk(`Cierre #${row.id} reabierto.`);
      await Promise.all([cargarCierresSnapshot(), cargarBitacoraCierre(row.id)]);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo reabrir el cierre.'));
    }
  };

  useEffect(() => {
    cargarReportes();
    cargarCierresSnapshot();
    cargarPuntosVenta();
    cargarTurnos();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cierresHistorial.length === 0) {
      setCierreSeleccionadoId(null);
      setCierresBitacora([]);
      return;
    }
    if (!cierreSeleccionadoId || !cierresHistorial.some((c) => c.id === cierreSeleccionadoId)) {
      const id = cierresHistorial[0].id;
      setCierreSeleccionadoId(id);
      cargarBitacoraCierre(id);
      return;
    }
    cargarBitacoraCierre(cierreSeleccionadoId);
  }, [cierresHistorial]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (puntoVentaId) cargarCajas(puntoVentaId);
  }, [puntoVentaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      setEmpresaNombre(localStorage.getItem('mya_report_company_name') || '');
    } catch {
      setEmpresaNombre('');
    }
  }, [empresaId]);

  const turnoSeleccionado = useMemo(
    () => turnosRecientes.find((t) => t.id === turnoSeleccionadoId) || null,
    [turnosRecientes, turnoSeleccionadoId]
  );

  const actaTurnoRows = useMemo(() => {
    if (!turnoSeleccionado) return [] as Array<[string, string]>;
    const cierreDate =
      (turnoSeleccionado.fecha_hora_cierre || turnoSeleccionado.fecha_hora_apertura || '').slice(0, 10).replace(/-/g, '') || '00000000';
    const actaNumero = `ACTA-CAJA-${cierreDate}-${String(turnoSeleccionado.id).padStart(6, '0')}`;
    return [
      ['Empresa', empresaNombre || `Empresa #${empresaId}`],
      ['Acta numero', actaNumero],
      ['Saldo inicial', money(turnoSeleccionado.saldo_inicial || 0, 'CRC')],
      ['Turno', `#${turnoSeleccionado.id}`],
      ['Estado', turnoSeleccionado.estado],
      ['Punto de venta', `${turnoSeleccionado.punto_venta_codigo} - ${turnoSeleccionado.punto_venta_nombre}`],
      ['Caja', `${turnoSeleccionado.caja_codigo} - ${turnoSeleccionado.caja_nombre}`],
      ['Cajero', turnoSeleccionado.cajero_nombre],
      ['Apertura', String(turnoSeleccionado.fecha_hora_apertura || '').replace('T', ' ').slice(0, 16)],
      ['Cierre', turnoSeleccionado.fecha_hora_cierre ? String(turnoSeleccionado.fecha_hora_cierre).replace('T', ' ').slice(0, 16) : '-'],
      ['Total recaudado', money(turnoSeleccionado.total_recaudado || 0, 'CRC')],
      ['Total efectivo', money(turnoSeleccionado.total_efectivo || 0, 'CRC')],
      ['Total no efectivo', money(turnoSeleccionado.total_no_efectivo || 0, 'CRC')],
      ['Total aplicado', money(turnoSeleccionado.total_aplicado || 0, 'CRC')],
      ['Total no aplicado', money(turnoSeleccionado.total_no_aplicado || 0, 'CRC')],
      ['Saldo final sistema', money(turnoSeleccionado.saldo_final_sistema || 0, 'CRC')],
      ['Saldo final fisico', turnoSeleccionado.saldo_final_fisico == null ? '-' : money(turnoSeleccionado.saldo_final_fisico, 'CRC')],
      ['Diferencia cierre', turnoSeleccionado.diferencia_cierre == null ? '-' : money(turnoSeleccionado.diferencia_cierre, 'CRC')],
      ['Observacion', turnoSeleccionado.observacion || '-'],
      ['Firma cajero', '____________________________'],
      ['Firma supervisor', '____________________________'],
      ['Firma contabilidad', '____________________________'],
    ];
  }, [turnoSeleccionado, empresaNombre, empresaId]);

  const actaEsMonto = (campo: string) =>
    /saldo|total|diferencia|efectivo|no efectivo|aplicado/i.test(campo);

  const liquidacionResumenRows = useMemo(
    () => [
      ['Empresa', empresaNombre || `Empresa #${empresaId}`],
      ['Total cobrado confirmado', money(totalCobradoConfirmado, moneda === 'ALL' ? 'CRC' : moneda)],
      ['Total ajustes confirmados', money(totalAjusteConfirmado, moneda === 'ALL' ? 'CRC' : moneda)],
      ['Total aplicado confirmado', money(totalAplicadoConfirmado, moneda === 'ALL' ? 'CRC' : moneda)],
      ['Total no aplicado confirmado', money(totalNoAplicadoConfirmado, moneda === 'ALL' ? 'CRC' : moneda)],
      ['Efectivo a liquidar', money(efectivoLiquidar, moneda === 'ALL' ? 'CRC' : moneda)],
      ['Recaudado no efectivo (banco/tarjeta/otros)', money(recaudoNoEfectivoConfirmado, moneda === 'ALL' ? 'CRC' : moneda)],
      ['Pendiente en borrador (no liquidable)', money(totalCobradoBorrador, moneda === 'ALL' ? 'CRC' : moneda)],
    ] as Array<[string, string]>,
    [
      empresaNombre,
      empresaId,
      totalCobradoConfirmado,
      totalAjusteConfirmado,
      totalAplicadoConfirmado,
      totalNoAplicadoConfirmado,
      efectivoLiquidar,
      recaudoNoEfectivoConfirmado,
      totalCobradoBorrador,
      moneda,
    ]
  );

  return (
    <>
      <style>{styles}</style>
      <div className="rc-wrap">
        <div className="rc-title">Reportes de Cobro y Recaudacion</div>
        <div className="rc-sub">Pagos aplicados, diferencias y auxiliar bancario con filtros por periodo.</div>
        <div className="rc-actions" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="rc-btn" type="button" onClick={() => onVolverRecaudacion?.()}>
            Volver a Recaudacion
          </button>
          <button className="rc-btn" type="button" onClick={() => onVolverGestion?.()}>
            Volver a Gestion de Cobro
          </button>
        </div>
        {ok ? <div className="rc-msg-ok">{ok}</div> : null}
        {err ? <div className="rc-msg-err">{err}</div> : null}

        <div className="rc-card">
          <div className="rc-grid">
            <div className="rc-field">
              <label>Desde</label>
              <input className="rc-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="rc-field">
              <label>Hasta</label>
              <input className="rc-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="rc-field">
              <label>Moneda</label>
              <select className="rc-select" value={moneda} onChange={(e) => setMoneda(e.target.value as any)}>
                <option value="ALL">Todas</option>
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="rc-field">
              <label>Estado auxiliar</label>
              <select className="rc-select" value={estadoAuxiliar} onChange={(e) => setEstadoAuxiliar(e.target.value as any)}>
                <option value="ALL">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="conciliado">Conciliado</option>
                <option value="anulado">Anulado</option>
              </select>
            </div>
            <div className="rc-actions">
              <button
                className="rc-btn main"
                type="button"
                onClick={async () => {
                  await Promise.all([cargarReportes(), cargarCierresSnapshot(), cargarTurnos(), cargarPuntosVenta()]);
                  if (cierreSeleccionadoId) await cargarBitacoraCierre(cierreSeleccionadoId);
                }}
                disabled={busy}
              >
                {busy ? 'Cargando...' : 'Recargar'}
              </button>
            </div>
          </div>
        </div>

        <div className="rc-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>Turno de caja (MVP)</div>
          <div
            className="rc-grid"
            style={{
              marginTop: 8,
              gridTemplateColumns: 'minmax(220px,1.2fr) minmax(220px,1.2fr) minmax(180px,.9fr) minmax(260px,1.6fr) auto',
            }}
          >
            <div className="rc-field">
              <label>Punto de venta</label>
              <select className="rc-select" value={puntoVentaId} onChange={(e) => setPuntoVentaId(Number(e.target.value || 0))} disabled={!canEdit || operandoTurno}>
                <option value={0}>-- seleccione --</option>
                {puntosVenta.map((p) => (
                  <option key={p.id} value={p.id}>{p.codigo} - {p.nombre}</option>
                ))}
              </select>
            </div>
            <div className="rc-field">
              <label>Caja</label>
              <select className="rc-select" value={cajaId} onChange={(e) => setCajaId(Number(e.target.value || 0))} disabled={!canEdit || operandoTurno || !!turnoActivo}>
                <option value={0}>-- seleccione --</option>
                {cajas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="rc-field">
              <label>{turnoActivo ? 'Saldo final fisico' : 'Saldo inicial'}</label>
              <input
                className="rc-input"
                value={turnoActivo ? saldoFinalFisicoTxt : saldoInicialTxt}
                onChange={(e) => turnoActivo ? setSaldoFinalFisicoTxt(e.target.value) : setSaldoInicialTxt(e.target.value)}
                onBlur={() => {
                  if (turnoActivo) setSaldoFinalFisicoTxt(saldoFinalFisicoTxt ? formatLocalAmount(parseLocalAmount(saldoFinalFisicoTxt)) : '');
                  else setSaldoInicialTxt(formatLocalAmount(parseLocalAmount(saldoInicialTxt)));
                }}
                disabled={!canEdit || operandoTurno}
              />
            </div>
            <div className="rc-field">
              <label>Observacion turno</label>
              <input className="rc-input" value={turnoObs} onChange={(e) => setTurnoObs(e.target.value)} disabled={!canEdit || operandoTurno} />
            </div>
            <div className="rc-actions">
              {!turnoActivo ? (
                <button className="rc-btn main" type="button" onClick={abrirTurnoCaja} disabled={!canEdit || operandoTurno || !puntoVentaId || !cajaId}>
                  {operandoTurno ? 'Abriendo...' : 'Abrir turno'}
                </button>
              ) : (
                <button className="rc-btn main" type="button" onClick={cerrarTurnoCaja} disabled={!canEdit || operandoTurno}>
                  {operandoTurno ? 'Cerrando...' : `Cerrar turno #${turnoActivo.id}`}
                </button>
              )}
              {isDevHost && (
                <button className="rc-btn" type="button" onClick={cargarDemoTurnos} disabled={seedDemoBusy || operandoTurno}>
                  {seedDemoBusy ? 'Cargando demo...' : 'Cargar demo (dev)'}
                </button>
              )}
            </div>
          </div>
          {turnoActivo ? (
            <div className="rc-sub" style={{ marginTop: 8 }}>
              Turno abierto: #{turnoActivo.id} | {turnoActivo.punto_venta_codigo} / {turnoActivo.caja_codigo} | Apertura {String(turnoActivo.fecha_hora_apertura).replace('T', ' ').slice(0, 16)}
            </div>
          ) : (
            <div className="rc-sub" style={{ marginTop: 8 }}>
              No hay turno abierto para el usuario actual.
            </div>
          )}
          <div className="rc-table" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Turno</th>
                  <th>Punto venta</th>
                  <th>Caja</th>
                  <th>Cajero</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Estado</th>
                  <th className="rc-right">Efectivo</th>
                  <th className="rc-right">No efectivo</th>
                  <th className="rc-right">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {turnosRecientes.length === 0 ? (
                  <tr><td colSpan={10} className="rc-empty">Sin turnos registrados.</td></tr>
                ) : turnosRecientes.map((t) => (
                  <tr
                    key={t.id}
                    style={{ background: turnoSeleccionadoId === t.id ? '#243149' : undefined, cursor: 'pointer' }}
                    onClick={() => setTurnoSeleccionadoId(t.id)}
                  >
                    <td>#{t.id}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{t.punto_venta_codigo} - {t.punto_venta_nombre}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{t.caja_codigo} - {t.caja_nombre}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{t.cajero_nombre}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{String(t.fecha_hora_apertura || '').replace('T', ' ').slice(0, 16)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{t.fecha_hora_cierre ? String(t.fecha_hora_cierre).replace('T', ' ').slice(0, 16) : '-'}</td>
                    <td>{t.estado}</td>
                    <td className="rc-right">{money(t.total_efectivo || 0, 'CRC')}</td>
                    <td className="rc-right">{money(t.total_no_efectivo || 0, 'CRC')}</td>
                    <td className="rc-right">{t.diferencia_cierre == null ? '-' : money(t.diferencia_cierre, 'CRC')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
              gap: 10,
            }}
          >
            {['Cajero(a)', 'Supervisor(a)', 'Contabilidad'].map((firma) => (
              <div key={firma} style={{ border: '1px solid rgba(137,160,201,0.18)', borderRadius: 8, padding: 10, minHeight: 72 }}>
                <div style={{ borderBottom: '1px solid rgba(137,160,201,0.18)', height: 36 }} />
                <div style={{ marginTop: 6, fontSize: 12, color: '#8ea3c7', textAlign: 'center' }}>Firma {firma}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rc-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>Acta de liquidacion para adjuntar</div>
          <div className="rc-sub" style={{ marginTop: 6, marginBottom: 8 }}>
            Seleccione un turno en la tabla anterior. Este formato es para imprimir y adjuntar a documentos de caja.
          </div>
          <div className="rc-actions" style={{ marginTop: 8 }}>
            <button
              className="rc-btn"
              type="button"
              disabled={!turnoSeleccionado}
              onClick={() =>
                downloadExcel(
                  `acta_liquidacion_turno_${turnoSeleccionado?.id || 'na'}.xlsx`,
                  'ActaLiquidacion',
                  ['campo', 'valor'],
                  actaTurnoRows.map((r) => [r[0], r[1]])
                )
              }
            >
              Exportar Excel
            </button>
            <button
              className="rc-btn"
              type="button"
              disabled={!turnoSeleccionado}
              onClick={() =>
                exportPdfVertical(
                  `Acta de liquidacion de caja - Turno #${turnoSeleccionado?.id || ''}`,
                  actaTurnoRows.map((r) => [r[0], r[1]])
                )
              }
            >
              Imprimir / PDF
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            {!turnoSeleccionado ? (
              <div className="rc-empty">Seleccione un turno para generar el acta de liquidacion.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
                {actaTurnoRows.map((r, idx) => (
                  <div
                    key={`${r[0]}-${idx}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '260px 1fr',
                      alignItems: 'center',
                      padding: '9px 10px',
                      background: idx % 2 === 0 ? '#1d2738' : '#172131',
                    }}
                  >
                    <div style={{ color: '#8ea3c7', fontSize: 12, fontWeight: 600 }}>{r[0]}</div>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#f3f7ff',
                        textAlign: actaEsMonto(r[0]) ? 'right' : 'left',
                        fontFamily: actaEsMonto(r[0]) ? 'DM Mono, monospace' : 'DM Sans, sans-serif',
                      }}
                    >
                      {r[1]}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rc-kpi-grid">
          <div className="rc-kpi">
            <div className="k">Total cobrado</div>
            {moneda === 'ALL' ? (
              <div className="v small">
                CRC: {money(kpiMoneda.pagoMonedas[0].cobrado, 'CRC')}<br />
                USD: {money(kpiMoneda.pagoMonedas[1].cobrado, 'USD')}
              </div>
            ) : (
              <div className="v">{money(totalCobrado, moneda)}</div>
            )}
          </div>
          <div className="rc-kpi">
            <div className="k">Total aplicado</div>
            {moneda === 'ALL' ? (
              <div className="v small">
                CRC: {money(kpiMoneda.pagoMonedas[0].aplicado, 'CRC')}<br />
                USD: {money(kpiMoneda.pagoMonedas[1].aplicado, 'USD')}
              </div>
            ) : (
              <div className="v">{money(totalAplicado, moneda)}</div>
            )}
          </div>
          <div className="rc-kpi">
            <div className="k">Total ajustes</div>
            {moneda === 'ALL' ? (
              <div className="v small">
                CRC: {money(kpiMoneda.pagoMonedas[0].ajuste, 'CRC')}<br />
                USD: {money(kpiMoneda.pagoMonedas[1].ajuste, 'USD')}
              </div>
            ) : (
              <div className="v">{money(totalAjuste, moneda)}</div>
            )}
          </div>
          <div className="rc-kpi">
            <div className="k">Auxiliar bancario</div>
            {moneda === 'ALL' ? (
              <div className="v small">
                CRC: {money(kpiMoneda.auxMonedas[0].total, 'CRC')}<br />
                USD: {money(kpiMoneda.auxMonedas[1].total, 'USD')}
              </div>
            ) : (
              <div className="v">{money(totalAuxiliar, moneda)}</div>
            )}
          </div>
          <div className="rc-kpi">
            <div className="k">Cierre de caja</div>
            <div className="v">{money(totalCierre, moneda === 'ALL' ? 'CRC' : moneda)}</div>
          </div>
        </div>

        <div className="rc-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>Liquidacion sugerida de caja</div>
          <div className="rc-sub" style={{ marginTop: 6, marginBottom: 8 }}>
            La liquidacion usa pagos en estado confirmado/contabilizado/conciliado. Los borradores se muestran aparte y no se liquidan.
          </div>
          <div className="rc-grid" style={{ gridTemplateColumns: '1fr auto', marginBottom: 8 }}>
            <div className="rc-field">
              <label>Observacion de cierre</label>
              <input
                className="rc-input"
                value={cierreObs}
                onChange={(e) => setCierreObs(e.target.value)}
                placeholder="Detalle de entrega de caja, diferencias, notas"
                disabled={!canEdit || cerrandoCaja}
              />
            </div>
            <div className="rc-actions">
              <button className="rc-btn main" type="button" onClick={cerrarCaja} disabled={!canEdit || cerrandoCaja}>
                {cerrandoCaja ? 'Cerrando...' : 'Cerrar caja'}
              </button>
            </div>
          </div>
          <div className="rc-kpi-grid">
            <div className="rc-kpi">
              <div className="k">Efectivo a liquidar</div>
              <div className="v">{money(efectivoLiquidar, moneda === 'ALL' ? 'CRC' : moneda)}</div>
            </div>
            <div className="rc-kpi">
              <div className="k">Recaudado no efectivo</div>
              <div className="v">{money(recaudoNoEfectivoConfirmado, moneda === 'ALL' ? 'CRC' : moneda)}</div>
            </div>
            <div className="rc-kpi">
              <div className="k">Aplicado confirmado</div>
              <div className="v">{money(totalAplicadoConfirmado, moneda === 'ALL' ? 'CRC' : moneda)}</div>
            </div>
            <div className="rc-kpi">
              <div className="k">No aplicado confirmado</div>
              <div className="v">{money(totalNoAplicadoConfirmado, moneda === 'ALL' ? 'CRC' : moneda)}</div>
            </div>
            <div className="rc-kpi">
              <div className="k">Pendiente en borrador</div>
              <div className="v">{money(totalCobradoBorrador, moneda === 'ALL' ? 'CRC' : moneda)}</div>
            </div>
          </div>
          <div className="rc-table">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
              {liquidacionResumenRows.map((r, idx) => (
                <div
                  key={`${r[0]}-${idx}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '340px 1fr',
                    alignItems: 'center',
                    padding: '9px 10px',
                    background: idx % 2 === 0 ? '#1d2738' : '#172131',
                  }}
                >
                  <div style={{ color: '#8ea3c7', fontSize: 12, fontWeight: 600 }}>{r[0]}</div>
                  <div style={{ fontSize: 13, color: '#f3f7ff', textAlign: actaEsMonto(r[0]) ? 'right' : 'left', fontFamily: actaEsMonto(r[0]) ? 'DM Mono, monospace' : 'DM Sans, sans-serif' }}>
                    {r[1]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rc-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>Historial de cierres de caja</div>
          <div className="rc-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha desde</th>
                  <th>Fecha hasta</th>
                  <th>Cajero</th>
                  <th>Moneda</th>
                  <th className="rc-right">Pagos</th>
                  <th className="rc-right">Total recaudado</th>
                  <th className="rc-right">Efectivo</th>
                  <th className="rc-right">No efectivo</th>
                  <th>Estado</th>
                  <th>Observacion</th>
                  <th>Creado</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {cierresHistorial.length === 0 ? (
                  <tr><td colSpan={13} className="rc-empty">Sin cierres registrados para el rango filtrado.</td></tr>
                ) : cierresHistorial.map((c) => (
                  <tr
                    key={c.id}
                    style={{ background: cierreSeleccionadoId === c.id ? '#eff6ff' : undefined, cursor: 'pointer' }}
                    onClick={() => {
                      setCierreSeleccionadoId(c.id);
                      cargarBitacoraCierre(c.id);
                    }}
                  >
                    <td>#{c.id}</td>
                    <td>{c.fecha_desde}</td>
                    <td>{c.fecha_hasta}</td>
                    <td>{c.cajero_nombre || 'N/D'}</td>
                    <td>{c.moneda || 'ALL'}</td>
                    <td className="rc-right">{c.pagos}</td>
                    <td className="rc-right">{money(c.total_recaudado, c.moneda || 'CRC')}</td>
                    <td className="rc-right">{money(c.efectivo_liquidar, c.moneda || 'CRC')}</td>
                    <td className="rc-right">{money(c.no_efectivo, c.moneda || 'CRC')}</td>
                    <td>{c.estado}</td>
                    <td>{c.observacion || '-'}</td>
                    <td>{String(c.created_at || '').replace('T', ' ').slice(0, 16)}</td>
                    <td>
                      {canEdit && c.estado === 'cerrado' && (
                        <button className="rc-btn" type="button" onClick={(e) => { e.stopPropagation(); anularCierre(c); }}>
                          Anular
                        </button>
                      )}
                      {canEdit && c.estado === 'anulado' && (
                        <button className="rc-btn" type="button" onClick={(e) => { e.stopPropagation(); reabrirCierre(c); }}>
                          Reabrir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rc-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>
            Bitacora de cierre {cierreSeleccionadoId ? `#${cierreSeleccionadoId}` : ''}
          </div>
          <div className="rc-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Accion</th>
                  <th>Detalle</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {cierresBitacora.length === 0 ? (
                  <tr><td colSpan={4} className="rc-empty">Sin eventos de bitacora para el cierre seleccionado.</td></tr>
                ) : cierresBitacora.map((b) => (
                  <tr key={b.id}>
                    <td>{String(b.created_at || '').replace('T', ' ').slice(0, 16)}</td>
                    <td>{String(b.accion || '').toUpperCase()}</td>
                    <td>{b.detalle || '-'}</td>
                    <td>{b.created_by || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rc-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>Cierre de caja consolidado</div>
          <div className="rc-actions" style={{ marginTop: 8 }}>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                downloadExcel(
                  `reporte_cierre_caja_${empresaId}_${desde}_${hasta}.xlsx`,
                  'CierreCaja',
                  ['fecha', 'cajero', 'usuario', 'moneda', 'medio_pago', 'pagos', 'total_recaudado', 'total_ajuste', 'total_aplicado', 'total_no_aplicado'],
                  cierreCaja.map((c) => [
                    c.fecha_pago, c.cajero_nombre, c.cajero_username, c.moneda, c.medio_pago, c.pagos,
                    c.total_recaudado, c.total_ajuste, c.total_aplicado, c.total_no_aplicado,
                  ])
                )
              }
              disabled={cierreCaja.length === 0}
            >
              Exportar Excel
            </button>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                exportPdfPrint(
                  'Reporte cierre de caja consolidado',
                  ['fecha', 'cajero', 'usuario', 'moneda', 'medio_pago', 'pagos', 'total_recaudado', 'total_ajuste', 'total_aplicado', 'total_no_aplicado'],
                  cierreCaja.map((c) => [
                    c.fecha_pago, c.cajero_nombre, c.cajero_username, c.moneda, c.medio_pago, c.pagos,
                    money(c.total_recaudado, c.moneda), money(c.total_ajuste, c.moneda), money(c.total_aplicado, c.moneda), money(c.total_no_aplicado, c.moneda),
                  ])
                )
              }
              disabled={cierreCaja.length === 0}
            >
              Exportar PDF
            </button>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                downloadCsv(
                  `reporte_cierre_caja_${empresaId}_${desde}_${hasta}.csv`,
                  ['fecha', 'cajero', 'usuario', 'moneda', 'medio_pago', 'pagos', 'total_recaudado', 'total_ajuste', 'total_aplicado', 'total_no_aplicado'],
                  cierreCaja.map((c) => [
                    c.fecha_pago, c.cajero_nombre, c.cajero_username, c.moneda, c.medio_pago, c.pagos,
                    c.total_recaudado, c.total_ajuste, c.total_aplicado, c.total_no_aplicado,
                  ])
                )
              }
              disabled={cierreCaja.length === 0}
            >
              Exportar CSV
            </button>
          </div>
          {cierrePorMedioPago.length > 0 && (
            <div className="rc-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
              {cierrePorMedioPago.map((item) => (
                <span key={`${item.medio}|${item.moneda}`} className="rc-btn" style={{ cursor: 'default' }}>
                  {item.medio} ({item.moneda}): {money(item.total, item.moneda)}
                </span>
              ))}
            </div>
          )}
          <div className="rc-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cajero</th>
                  <th>Usuario</th>
                  <th>Moneda</th>
                  <th>Medio de pago</th>
                  <th className="rc-right">Pagos</th>
                  <th className="rc-right">Total recaudado</th>
                  <th className="rc-right">Ajustes</th>
                  <th className="rc-right">Aplicado</th>
                  <th className="rc-right">No aplicado</th>
                </tr>
              </thead>
              <tbody>
                {cierreCaja.length === 0 ? (
                  <tr><td colSpan={10} className="rc-empty">Sin datos de cierre de caja en el rango seleccionado.</td></tr>
                ) : cierreCaja.map((c, idx) => (
                  <tr key={`${c.fecha_pago}-${c.cajero_auth_user_id || 'nd'}-${c.medio_pago}-${idx}`}>
                    <td>{c.fecha_pago}</td>
                    <td>{c.cajero_nombre || 'N/D'}</td>
                    <td>{c.cajero_username || 'N/D'}</td>
                    <td>{c.moneda}</td>
                    <td>{c.medio_pago}</td>
                    <td className="rc-right">{c.pagos}</td>
                    <td className="rc-right">{money(c.total_recaudado, c.moneda)}</td>
                    <td className="rc-right">{money(c.total_ajuste, c.moneda)}</td>
                    <td className="rc-right">{money(c.total_aplicado, c.moneda)}</td>
                    <td className="rc-right">{money(c.total_no_aplicado, c.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rc-card">
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>Facturacion FE liquidada</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Documentos FE y combustible ligados a turno de caja, consolidados por medio de pago.</div>
            </div>
            <div className="rc-chip">{money(totalCierreFe, moneda === 'ALL' ? 'CRC' : moneda)}</div>
          </div>
          {cierreFePorMedioPago.length > 0 && (
            <div className="rc-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
              {cierreFePorMedioPago.map((item) => (
                <span key={`${item.medio}|${item.moneda}`} className="rc-btn" style={{ cursor: 'default' }}>
                  {item.medio} ({item.moneda}): {money(item.total, item.moneda)}
                </span>
              ))}
            </div>
          )}
          <div className="rc-table" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cajero</th>
                  <th>Documento</th>
                  <th>Moneda</th>
                  <th>Medio de pago</th>
                  <th className="rc-right">Partidas</th>
                  <th className="rc-right">Total liquidado</th>
                  <th className="rc-right">Asiento</th>
                </tr>
              </thead>
              <tbody>
                {cierreFe.length === 0 ? (
                  <tr><td colSpan={8} className="rc-empty">Sin liquidacion FE ligada a turnos en el rango seleccionado.</td></tr>
                ) : cierreFe.map((c) => (
                  <tr key={`fe-${c.id}-${c.medio_pago}`}>
                    <td>{c.fecha_pago}</td>
                    <td>{c.cajero_nombre || 'N/D'}</td>
                    <td>{c.numero_consecutivo || `#${c.id}`}</td>
                    <td>{c.moneda}</td>
                    <td>{c.medio_pago}</td>
                    <td className="rc-right">{c.pagos}</td>
                    <td className="rc-right">{money(c.total_recaudado, c.moneda)}</td>
                    <td className="rc-right">{c.asiento_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rc-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>Pagos aplicados</div>
          <div className="rc-actions" style={{ marginTop: 8 }}>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                downloadExcel(
                  `reporte_pagos_aplicados_${empresaId}_${desde}_${hasta}.xlsx`,
                  'PagosAplicados',
                  ['fecha', 'cliente', 'identificacion', 'moneda', 'total', 'ajuste', 'aplicado', 'no_aplicado', 'forma_pago', 'referencia', 'estado', 'asiento'],
                  pagos.map((p) => [
                    p.fecha_pago, p.tercero_nombre, p.tercero_identificacion, p.moneda, p.monto_total, p.monto_ajuste, p.monto_aplicado,
                    p.monto_no_aplicado, p.medio_pago, p.referencia, p.estado, p.asiento_id,
                  ])
                )
              }
              disabled={pagos.length === 0}
            >
              Exportar Excel
            </button>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                exportPdfPrint(
                  'Reporte de pagos aplicados',
                  ['fecha', 'cliente', 'identificacion', 'moneda', 'total', 'ajuste', 'aplicado', 'no_aplicado', 'forma_pago', 'referencia', 'estado', 'asiento'],
                  pagos.map((p) => [
                    p.fecha_pago, p.tercero_nombre, p.tercero_identificacion, p.moneda,
                    money(p.monto_total, p.moneda), money(p.monto_ajuste, p.moneda), money(p.monto_aplicado, p.moneda),
                    money(p.monto_no_aplicado, p.moneda), p.medio_pago, p.referencia, p.estado, p.asiento_id,
                  ])
                )
              }
              disabled={pagos.length === 0}
            >
              Exportar PDF
            </button>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                downloadCsv(
                  `reporte_pagos_aplicados_${empresaId}_${desde}_${hasta}.csv`,
                  ['fecha', 'cliente', 'identificacion', 'moneda', 'total', 'ajuste', 'aplicado', 'no_aplicado', 'forma_pago', 'referencia', 'estado', 'asiento'],
                  pagos.map((p) => [
                    p.fecha_pago, p.tercero_nombre, p.tercero_identificacion, p.moneda, p.monto_total, p.monto_ajuste, p.monto_aplicado,
                    p.monto_no_aplicado, p.medio_pago, p.referencia, p.estado, p.asiento_id,
                  ])
                )
              }
              disabled={pagos.length === 0}
            >
              Exportar CSV
            </button>
          </div>
          <div className="rc-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>ID</th>
                  <th>Moneda</th>
                  <th className="rc-right">Total</th>
                  <th className="rc-right">Ajuste</th>
                  <th className="rc-right">Aplicado</th>
                  <th className="rc-right">No aplicado</th>
                  <th>Forma de pago</th>
                  <th>Referencia</th>
                  <th>Estado</th>
                  <th>Asiento</th>
                </tr>
              </thead>
              <tbody>
                {pagos.length === 0 ? (
                  <tr><td colSpan={12} className="rc-empty">Sin pagos en el rango seleccionado.</td></tr>
                ) : pagos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.fecha_pago}</td>
                    <td>{p.tercero_nombre}</td>
                    <td>{p.tercero_identificacion || '-'}</td>
                    <td>{p.moneda}</td>
                    <td className="rc-right">{money(p.monto_total, p.moneda)}</td>
                    <td className="rc-right">{money(p.monto_ajuste, p.moneda)}</td>
                    <td className="rc-right">{money(p.monto_aplicado, p.moneda)}</td>
                    <td className="rc-right">{money(p.monto_no_aplicado, p.moneda)}</td>
                    <td>{p.medio_pago}</td>
                    <td>{p.referencia || '-'}</td>
                    <td>{p.estado}</td>
                    <td>{p.asiento_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rc-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>Diferencias y descuentos aplicados</div>
          <div className="rc-actions" style={{ marginTop: 8 }}>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                downloadExcel(
                  `reporte_diferencias_${empresaId}_${desde}_${hasta}.xlsx`,
                  'Diferencias',
                  ['fecha', 'cliente', 'identificacion', 'moneda', 'ajuste', 'motivo', 'referencia', 'estado'],
                  diferencias.map((p) => [
                    p.fecha_pago, p.tercero_nombre, p.tercero_identificacion, p.moneda, p.monto_ajuste, p.motivo_diferencia, p.referencia, p.estado,
                  ])
                )
              }
              disabled={diferencias.length === 0}
            >
              Exportar Excel
            </button>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                exportPdfPrint(
                  'Reporte de diferencias y descuentos',
                  ['fecha', 'cliente', 'identificacion', 'moneda', 'ajuste', 'motivo', 'referencia', 'estado'],
                  diferencias.map((p) => [
                    p.fecha_pago, p.tercero_nombre, p.tercero_identificacion, p.moneda,
                    money(p.monto_ajuste, p.moneda), p.motivo_diferencia, p.referencia, p.estado,
                  ])
                )
              }
              disabled={diferencias.length === 0}
            >
              Exportar PDF
            </button>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                downloadCsv(
                  `reporte_diferencias_${empresaId}_${desde}_${hasta}.csv`,
                  ['fecha', 'cliente', 'identificacion', 'moneda', 'ajuste', 'motivo', 'referencia', 'estado'],
                  diferencias.map((p) => [
                    p.fecha_pago, p.tercero_nombre, p.tercero_identificacion, p.moneda, p.monto_ajuste, p.motivo_diferencia, p.referencia, p.estado,
                  ])
                )
              }
              disabled={diferencias.length === 0}
            >
              Exportar CSV
            </button>
          </div>
          <div className="rc-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>ID</th>
                  <th>Moneda</th>
                  <th className="rc-right">Ajuste</th>
                  <th>Motivo</th>
                  <th>Referencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {diferencias.length === 0 ? (
                  <tr><td colSpan={8} className="rc-empty">Sin ajustes por diferencia en el rango seleccionado.</td></tr>
                ) : diferencias.map((p) => (
                  <tr key={`dif-${p.id}`}>
                    <td>{p.fecha_pago}</td>
                    <td>{p.tercero_nombre}</td>
                    <td>{p.tercero_identificacion || '-'}</td>
                    <td>{p.moneda}</td>
                    <td className="rc-right">{money(p.monto_ajuste, p.moneda)}</td>
                    <td>{p.motivo_diferencia || '-'}</td>
                    <td>{p.referencia || '-'}</td>
                    <td>{p.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rc-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff' }}>Auxiliar bancario</div>
          <div className="rc-actions" style={{ marginTop: 8 }}>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                downloadExcel(
                  `reporte_auxiliar_bancario_${empresaId}_${desde}_${hasta}.xlsx`,
                  'AuxiliarBancario',
                  ['fecha', 'cliente', 'identificacion', 'pago_id', 'moneda', 'monto', 'referencia', 'estado_conciliacion', 'estado_pago', 'asiento'],
                  auxiliar.map((a) => [
                    a.fecha_movimiento, a.tercero_nombre, a.tercero_identificacion, a.pago_id, a.moneda, a.monto,
                    a.referencia, a.estado_conciliacion, a.estado_pago, a.asiento_id,
                  ])
                )
              }
              disabled={auxiliar.length === 0}
            >
              Exportar Excel
            </button>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                exportPdfPrint(
                  'Reporte auxiliar bancario',
                  ['fecha', 'cliente', 'identificacion', 'pago_id', 'moneda', 'monto', 'referencia', 'estado_conciliacion', 'estado_pago', 'asiento'],
                  auxiliar.map((a) => [
                    a.fecha_movimiento, a.tercero_nombre, a.tercero_identificacion, a.pago_id, a.moneda,
                    money(a.monto, a.moneda), a.referencia, a.estado_conciliacion, a.estado_pago, a.asiento_id,
                  ])
                )
              }
              disabled={auxiliar.length === 0}
            >
              Exportar PDF
            </button>
            <button
              className="rc-btn"
              type="button"
              onClick={() =>
                downloadCsv(
                  `reporte_auxiliar_bancario_${empresaId}_${desde}_${hasta}.csv`,
                  ['fecha', 'cliente', 'identificacion', 'pago_id', 'moneda', 'monto', 'referencia', 'estado_conciliacion', 'estado_pago', 'asiento'],
                  auxiliar.map((a) => [
                    a.fecha_movimiento, a.tercero_nombre, a.tercero_identificacion, a.pago_id, a.moneda, a.monto,
                    a.referencia, a.estado_conciliacion, a.estado_pago, a.asiento_id,
                  ])
                )
              }
              disabled={auxiliar.length === 0}
            >
              Exportar CSV
            </button>
          </div>
          <div className="rc-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>ID</th>
                  <th>Pago</th>
                  <th>Moneda</th>
                  <th className="rc-right">Monto</th>
                  <th>Referencia</th>
                  <th>Estado auxiliar</th>
                  <th>Estado pago</th>
                  <th>Asiento</th>
                </tr>
              </thead>
              <tbody>
                {auxiliar.length === 0 ? (
                  <tr><td colSpan={10} className="rc-empty">Sin movimientos en auxiliar bancario para el rango seleccionado.</td></tr>
                ) : auxiliar.map((a) => (
                  <tr key={a.id}>
                    <td>{a.fecha_movimiento}</td>
                    <td>{a.tercero_nombre}</td>
                    <td>{a.tercero_identificacion || '-'}</td>
                    <td>#{a.pago_id}</td>
                    <td>{a.moneda}</td>
                    <td className="rc-right">{money(a.monto, a.moneda)}</td>
                    <td>{a.referencia || '-'}</td>
                    <td>{a.estado_conciliacion}</td>
                    <td>{a.estado_pago}</td>
                    <td>{a.asiento_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}


