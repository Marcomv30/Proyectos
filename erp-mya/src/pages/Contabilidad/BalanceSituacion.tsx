import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, ReportColumn, roundMoney, sumMoney } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';
import ExcelJS from 'exceljs';

interface RowBalanceSituacion {
  cuenta: string;
  nombre: string;
  tipo: 'ACTIVO' | 'PASIVO' | 'CAPITAL' | string;
  nivel: number;
  saldo: number;
}

interface ReportLine {
  kind: 'section' | 'group' | 'row' | 'subtotal' | 'total';
  label: string;
  amount?: number;
  row?: RowBalanceSituacion;
}

const styles = `
  .bs-wrap { padding:0; color:#d6e2ff; }
  .bs-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:14px; }
  .bs-grid { display:grid; grid-template-columns:170px 120px 90px auto 1fr; gap:10px; margin-bottom:14px; }
  .bs-input { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; outline:none; background:#1d2738; color:#f3f7ff; }
  .bs-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .bs-btn { padding:10px 14px; border-radius:10px; border:none; font-size:13px; font-weight:700; cursor:pointer; color:#fff; background:linear-gradient(135deg,#17a34a,#22c55e); box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .bs-toolbar { margin-bottom:10px; }
  .bs-export-btn { padding:8px 13px; border-radius:11px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; color:#d6e2ff; font-size:12px; font-weight:700; cursor:pointer; }
  .bs-export-btn:hover { border-color:#4c7bf7; color:#ffffff; background:#243149; }
  .bs-cards { display:grid; grid-template-columns:repeat(5,minmax(160px,1fr)); gap:10px; margin-bottom:12px; }
  .bs-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px 14px; box-shadow:0 16px 28px rgba(3,8,20,.16); }
  .bs-card-num { font-size:18px; font-weight:700; font-family:'DM Mono',monospace; }
  .bs-card-lbl { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.04em; }
  .bs-card.act .bs-card-num { color:#16a34a; }
  .bs-card.pas .bs-card-num { color:#dc2626; }
  .bs-card.cap .bs-card-num { color:#7c3aed; }
  .bs-card.pyc .bs-card-num { color:#1d4ed8; }
  .bs-card.diff .bs-card-num { color:#b45309; }
  .bs-card.diff.ok .bs-card-num { color:#166534; }
  .bs-card-wrap { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; overflow-x:auto; overflow-y:hidden; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .bs-table { width:100%; min-width:940px; border-collapse:collapse; table-layout:fixed; }
  .bs-table th { background:#131b2a; padding:9px 10px; font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; text-align:left; }
  .bs-table td { padding:8px 10px; font-size:12px; color:#d6e2ff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bs-right { text-align:right !important; }
  .bs-money { font-family:'DM Mono',monospace; }
  .bs-row-n1 td { background:#1f3158; color:#edf4ff; }
  .bs-row-n2 td { background:#2d2854; color:#efe9ff; }
  .bs-row-n3 td { background:#183d3c; color:#e6fffb; }
  .bs-row-n4 td { background:#3a302d; color:#fff3eb; }
  .bs-row-n5 td { background:#243043; color:#d6e2ff; }
  .bs-chip { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:22px; border-radius:999px; font-size:11px; font-weight:700; font-family:'DM Mono',monospace; background:#4b5d79; color:#e2e8f0; }
  .bs-tag { display:inline-flex; align-items:center; font-size:11px; font-weight:700; font-family:'DM Mono',monospace; }
  .bs-tag.ACTIVO { color:#86efac; }
  .bs-tag.PASIVO { color:#fda4af; }
  .bs-tag.CAPITAL { color:#c4b5fd; }
  .bs-link-btn { padding:6px 10px; border-radius:9px; border:1px solid rgba(76,123,247,0.34); background:#243149; color:#9ec3ff; font-size:11px; font-weight:700; cursor:pointer; }
  .bs-total td { background:#123224; color:#9df4c7; font-weight:700; }
  .bs-empty { padding:24px; text-align:center; color:#8ea3c7; font-size:13px; }
  .bs-error { margin-bottom:10px; background:#34181c; border:1px solid #7d2f3a; color:#ffb3bb; border-radius:12px; padding:10px 12px; font-size:12px; }
  .bs-schema-table { width:100%; min-width:900px; border-collapse:collapse; table-layout:fixed; }
  .bs-schema-table th { background:#131b2a; padding:9px 10px; font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; text-align:left; border-bottom:1px solid rgba(137,160,201,0.16); }
  .bs-schema-table td { padding:7px 10px; font-size:12px; border-bottom:1px solid rgba(137,160,201,0.12); vertical-align:middle; color:#d6e2ff; }
  .bs-s-head { background:#183d3c; font-weight:700; color:#f3f7ff; }
  .bs-s-group { background:#1d2738; color:#d6e2ff; font-weight:700; }
  .bs-s-subtotal { background:#3a302d; color:#ffd9b0; font-weight:700; }
  .bs-s-total { background:#123224; color:#9df4c7; font-weight:800; }
  .bs-s-row { color:#d6e2ff; }
  .bs-s-code { font-family:'DM Mono',monospace; color:#86efac; font-size:11px; }
  .bs-s-money { font-family:'DM Mono',monospace; text-align:right; }
  .bs-s-empty { background:#172131; }
`;

const toMoney = (n: number, moneda: 'CRC' | 'USD') =>
  `${moneda === 'USD' ? '$' : '₡'} ${roundMoney(n, 2).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const approxZero = (n: number) => Math.abs(Number(n || 0)) < 0.000001;

function inferCustomLevel(code: string): number | null {
  const c = String(code || '').trim();
  if (/^\d{2}$/.test(c)) return 1;
  if (/^\d{4}$/.test(c)) return 2;
  if (/^\d{4}-\d{2}$/.test(c)) return 3;
  if (/^\d{4}-\d{2}-\d{3}$/.test(c)) return 4;
  if (/^\d{4}-\d{2}-\d{3}-\d{3}$/.test(c)) return 5;
  return null;
}

function normalizeToLevel(codigo: string, targetLevel: number): string {
  const customLevel = inferCustomLevel(codigo);
  const c = String(codigo || '').trim();
  if (customLevel !== null) {
    const l = Math.max(1, Math.min(5, targetLevel));
    if (l >= customLevel) return c;
    if (l === 1) return c.slice(0, 2);
    if (l === 2) return c.slice(0, 4);
    if (l === 3) return c.slice(0, 7);
    if (l === 4) return c.slice(0, 11);
  }
  return c;
}

function inferLevelFromCode(codigo: string): number {
  return inferCustomLevel(codigo) || 1;
}

function groupCodeNivel2(codigo: string): string {
  return normalizeToLevel(codigo, 2);
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default function BalanceSituacion({
  empresaId,
  onVerMovimientos,
  filtrosExternos,
}: {
  empresaId: number;
  onVerMovimientos?: (payload: { cuenta: string; nombre?: string; desde: string; hasta: string; moneda: 'CRC' | 'USD'; origen?: 'balancecomprobacion' | 'estadoderesultados' | 'balancesituacion' }) => void;
  filtrosExternos?: { hasta: string; moneda: 'CRC' | 'USD' };
}) {
  const today = new Date();
  const [fechaHasta, setFechaHasta] = useState(filtrosExternos?.hasta || today.toISOString().slice(0, 10));
  const [moneda, setMoneda] = useState<'CRC' | 'USD'>(filtrosExternos?.moneda || 'CRC');
  const [nivelVista, setNivelVista] = useState(5);
  const filtroHasta = filtrosExternos?.hasta;
  const filtroMoneda = filtrosExternos?.moneda;
  const [rowsBase, setRowsBase] = useState<RowBalanceSituacion[]>([]);
  const [catalogoNombre, setCatalogoNombre] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

  const cargar = async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('get_balance_situacion', {
      p_empresa_id: empresaId,
      p_fecha_hasta: fechaHasta || null,
      p_moneda: moneda,
    });
    if (reqId !== reqRef.current) return;
    if (rpcError) {
      setError(rpcError.message || 'No se pudo cargar el Balance de Situacion');
      setRowsBase([]);
    } else {
      setRowsBase((data || []) as RowBalanceSituacion[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => cargar(), 300);
    return () => clearTimeout(t);
  }, [empresaId, fechaHasta, moneda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!filtroHasta || !filtroMoneda) return;
    setFechaHasta(filtroHasta);
    setMoneda(filtroMoneda);
  }, [filtroHasta, filtroMoneda]);

  const cargarCatalogo = async () => {
    const [baseResp, empResp] = await Promise.all([
      supabase.from('plan_cuentas_base').select('codigo, nombre'),
      supabase.from('plan_cuentas_empresa').select('codigo, nombre').eq('empresa_id', empresaId),
    ]);
    const map: Record<string, string> = {};
    (baseResp.data || []).forEach((r: any) => { if (r?.codigo) map[String(r.codigo)] = String(r.nombre || ''); });
    (empResp.data || []).forEach((r: any) => {
      if (!r?.codigo) return;
      const code = String(r.codigo);
      if (!map[code]) map[code] = String(r.nombre || '');
    });
    setCatalogoNombre(map);
  };

  useEffect(() => {
    cargarCatalogo();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const lvl = Math.max(1, Math.min(5, Number(nivelVista) || 5));
    const map = new Map<string, RowBalanceSituacion>();
    for (const r of rowsBase) {
      const originalLevel = inferLevelFromCode(r.cuenta) || Number(r.nivel) || 1;
      const topLevel = Math.min(originalLevel, lvl);
      for (let current = topLevel; current >= 1; current -= 1) {
        const key = normalizeToLevel(r.cuenta, current);
        const prev = map.get(key);
        if (!prev) {
          const nombreNivel =
            catalogoNombre[key]
            || rowsBase.find((x) => String(x.cuenta) === key)?.nombre
            || r.nombre
            || key;
          map.set(key, {
            cuenta: key,
            nombre: nombreNivel,
            tipo: r.tipo,
            nivel: current,
            saldo: Number(r.saldo || 0),
          });
        } else {
          prev.saldo += Number(r.saldo || 0);
        }
      }
    }
    return Array.from(map.values())
      .filter((r) => !approxZero(r.saldo))
      .sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta)));
  }, [rowsBase, nivelVista, catalogoNombre]);

  const rowsNivel = useMemo(() => {
    const n = Math.max(1, Math.min(5, Number(nivelVista) || 5));
    return rows.filter((r) => Number(r.nivel) === n);
  }, [rows, nivelVista]);

  const activo = sumMoney(rowsNivel.filter((r) => r.tipo === 'ACTIVO').map((r) => Number(r.saldo || 0)), 2);
  const pasivo = sumMoney(rowsNivel.filter((r) => r.tipo === 'PASIVO').map((r) => Number(r.saldo || 0)), 2);
  const capital = sumMoney(rowsNivel.filter((r) => r.tipo === 'CAPITAL').map((r) => Number(r.saldo || 0)), 2);
  const pasivoCapital = roundMoney(pasivo + capital, 2);
  const diferencia = roundMoney(activo - pasivoCapital, 2);
  const cuadrado = Math.abs(diferencia) < 0.01;

  const columns: ReportColumn<RowBalanceSituacion>[] = [
    { key: 'cuenta', title: 'Cuenta', getValue: (r) => r.cuenta, align: 'left', width: '16%' },
    { key: 'nombre', title: 'Nombre', getValue: (r) => r.nombre, align: 'left', width: '30%' },
    { key: 'tipo', title: 'Tipo', getValue: (r) => r.tipo, width: '12%' },
    { key: 'saldo', title: 'Saldo', getValue: (r) => Number(r.saldo || 0).toFixed(2), align: 'right', width: '14%' },
    { key: 'nivel', title: 'Nivel', getValue: (r) => r.nivel, width: '8%' },
  ];

  const rowsActivos = useMemo(
    () => rowsNivel.filter((r) => r.tipo === 'ACTIVO').sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta))),
    [rowsNivel]
  );
  const rowsPasivos = useMemo(
    () => rowsNivel.filter((r) => r.tipo === 'PASIVO').sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta))),
    [rowsNivel]
  );
  const rowsCapital = useMemo(
    () => rowsNivel.filter((r) => r.tipo === 'CAPITAL').sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta))),
    [rowsNivel]
  );

  const buildLines = useCallback((items: RowBalanceSituacion[], sectionLabel: string, includeTotalLabel?: string): ReportLine[] => {
    const lines: ReportLine[] = [{ kind: 'section', label: sectionLabel }];
    const byGroup = new Map<string, RowBalanceSituacion[]>();
    items.forEach((r) => {
      const g = groupCodeNivel2(r.cuenta);
      const arr = byGroup.get(g) || [];
      arr.push(r);
      byGroup.set(g, arr);
    });
    Array.from(byGroup.keys())
      .sort((a, b) => a.localeCompare(b))
      .forEach((g) => {
        const grp = byGroup.get(g) || [];
        const gName = catalogoNombre[g] || grp[0]?.nombre || g;
        lines.push({ kind: 'group', label: String(gName).toUpperCase() });
        grp.forEach((r) => {
          lines.push({ kind: 'row', label: String(r.nombre || '').toUpperCase(), amount: Number(r.saldo || 0), row: r });
        });
        lines.push({
          kind: 'subtotal',
          label: `Total ${String(gName).toUpperCase()}`,
          amount: sumMoney(grp.map((x) => Number(x.saldo || 0)), 2),
        });
      });
    if (includeTotalLabel) {
      lines.push({ kind: 'total', label: includeTotalLabel, amount: sumMoney(items.map((x) => Number(x.saldo || 0)), 2) });
    }
    return lines;
  }, [catalogoNombre]);

  const leftLines = useMemo(
    () => buildLines(rowsActivos, 'ACTIVOS'),
    [rowsActivos, buildLines]
  );
  const rightLines = useMemo(() => {
    const pas = buildLines(rowsPasivos, 'PASIVO', 'Total Pasivos');
    const cap = buildLines(rowsCapital, 'PATRIMONIO', 'Total Patrimonio');
    return [
      { kind: 'section', label: 'PASIVO Y PATRIMONIO' } as ReportLine,
      ...pas.slice(1),
      ...cap,
    ];
  }, [rowsPasivos, rowsCapital, buildLines]);

  const maxLines = Math.max(leftLines.length, rightLines.length);

  const exportExcelBalanceSchema = async () => {
    const company =
      (typeof window !== 'undefined' ? localStorage.getItem('mya_report_company_name') : '') ||
      `Empresa ${empresaId}`;

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Balance Situacion', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    });

    ws.columns = [
      { key: 'l_label', width: 42 },
      { key: 'l_amt', width: 18 },
      { key: 'sep', width: 4 },
      { key: 'r_label', width: 42 },
      { key: 'r_amt', width: 18 },
    ];

    ws.pageSetup = {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    };

    ws.mergeCells('A1:E1');
    ws.getCell('A1').value = company;
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getCell('A1').font = { bold: true, size: 14 };

    ws.mergeCells('A2:E2');
    ws.getCell('A2').value = 'Balance de Situacion';
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.getCell('A2').font = { bold: true, size: 13 };

    ws.mergeCells('A3:E3');
    ws.getCell('A3').value = `Fecha corte ${fechaHasta} - ${moneda} - Nivel ${nivelVista}`;
    ws.getCell('A3').alignment = { horizontal: 'center' };
    ws.getCell('A3').font = { italic: true, size: 10 };

    const moneyFmt = moneda === 'USD' ? '"$" #,##0.00;[Red]-"$" #,##0.00' : '"₡" #,##0.00;[Red]-"₡" #,##0.00';
    const start = 5;
    const max = Math.max(leftLines.length, rightLines.length);

    for (let i = 0; i < max; i += 1) {
      const l = leftLines[i];
      const r = rightLines[i];
      const row = ws.getRow(start + i);

      row.getCell(1).value = l?.label || '';
      row.getCell(2).value = l?.amount !== undefined ? Number(l.amount || 0) : null;
      row.getCell(3).value = '';
      row.getCell(4).value = r?.label || '';
      row.getCell(5).value = r?.amount !== undefined ? Number(r.amount || 0) : null;

      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(4).alignment = { horizontal: 'left' };
      row.getCell(2).alignment = { horizontal: 'right' };
      row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(2).numFmt = moneyFmt;
      row.getCell(5).numFmt = moneyFmt;

      const lKind = l?.kind || '';
      const rKind = r?.kind || '';
      const lBoldLevel = l?.kind === 'row' && Number(l.row?.nivel || 0) <= 2;
      const rBoldLevel = r?.kind === 'row' && Number(r.row?.nivel || 0) <= 2;

      const setLabelStyle = (cell: ExcelJS.Cell, kind: string, lvlBold: boolean) => {
        const bold = kind === 'section' || kind === 'group' || kind === 'subtotal' || kind === 'total' || lvlBold;
        cell.font = { bold };
      };
      const setAmtStyle = (cell: ExcelJS.Cell, kind: string) => {
        const bold = kind === 'section' || kind === 'group' || kind === 'subtotal' || kind === 'total';
        cell.font = { bold };
      };

      setLabelStyle(row.getCell(1), lKind, lBoldLevel);
      setLabelStyle(row.getCell(4), rKind, rBoldLevel);
      setAmtStyle(row.getCell(2), lKind);
      setAmtStyle(row.getCell(5), rKind);
    }

    const totalRow = ws.getRow(start + max + 1);
    totalRow.getCell(1).value = 'TOTAL ACTIVOS';
    totalRow.getCell(2).value = Number(activo || 0);
    totalRow.getCell(3).value = '';
    totalRow.getCell(4).value = 'TOTAL PASIVO + CAPITAL';
    totalRow.getCell(5).value = Number(pasivoCapital || 0);

    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(4).font = { bold: true };
    totalRow.getCell(2).font = { bold: true };
    totalRow.getCell(5).font = { bold: true };
    totalRow.getCell(2).alignment = { horizontal: 'right' };
    totalRow.getCell(5).alignment = { horizontal: 'right' };
    totalRow.getCell(2).numFmt = moneyFmt;
    totalRow.getCell(5).numFmt = moneyFmt;
    totalRow.getCell(2).border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
    };
    totalRow.getCell(5).border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balance_situacion_${empresaId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdfBalanceSchema = () => {
    const company =
      (typeof window !== 'undefined' ? localStorage.getItem('mya_report_company_name') : '') ||
      `Empresa ${empresaId}`;

    const max = Math.max(leftLines.length, rightLines.length);
    const bodyRows = Array.from({ length: max }).map((_, i) => {
      const l = leftLines[i];
      const r = rightLines[i];
      const lKind = l?.kind || '';
      const rKind = r?.kind || '';
      const lBoldLevel = l?.kind === 'row' && Number(l.row?.nivel || 0) <= 2;
      const rBoldLevel = r?.kind === 'row' && Number(r.row?.nivel || 0) <= 2;

      return `
        <tr>
          <td class="lbl ${lKind} ${lBoldLevel ? 'lvl-bold' : ''}">${escapeHtml(l?.label || '')}</td>
          <td class="amt ${lKind}">${l?.amount !== undefined ? escapeHtml(toMoney(Number(l.amount || 0), moneda)) : ''}</td>
          <td class="sep"></td>
          <td class="lbl ${rKind} ${rBoldLevel ? 'lvl-bold' : ''}">${escapeHtml(r?.label || '')}</td>
          <td class="amt ${rKind}">${r?.amount !== undefined ? escapeHtml(toMoney(Number(r.amount || 0), moneda)) : ''}</td>
        </tr>
      `;
    }).join('');

    const footerRows = `
      <tr class="total-row">
        <td class="lbl">TOTAL ACTIVOS</td>
        <td class="amt">${escapeHtml(toMoney(activo, moneda))}</td>
        <td class="sep"></td>
        <td class="lbl">TOTAL PASIVO + CAPITAL</td>
        <td class="amt">${escapeHtml(toMoney(pasivoCapital, moneda))}</td>
      </tr>
    `;

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Balance de Situacion</title>
  <style>
    @page { size: A4 landscape; margin: 14mm 12mm 12mm 12mm; }
    body { font-family: Arial, sans-serif; margin:0; color:#0f172a; font-size:11px; }
    .sheet { padding: 8px 10px 6px; }
    .head { text-align:center; margin-bottom: 10px; }
    .brand { font-size: 14px; font-weight:700; line-height:1.15; }
    .title { font-size: 18px; font-weight:700; line-height:1.1; margin-top:2px; }
    .sub { font-size: 11px; color:#475569; margin-top:2px; }
    table { width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; font-size:10.5px; }
    col.lbl-left { width:34%; }
    col.amt-left { width:13%; }
    col.sep { width:6%; }
    col.lbl-right { width:34%; }
    col.amt-right { width:13%; }
    th, td { padding:4px 6px; border:none; }
    .lbl { text-align:left; }
    .amt { text-align:right; font-family: "Courier New", monospace; font-variant-numeric: tabular-nums; }
    .sep { padding:0; }
    .section { font-weight:700; }
    .group { font-weight:700; }
    .subtotal { font-weight:700; }
    .total { font-weight:700; }
    .lvl-bold { font-weight:700; }
    .total-row td { font-weight:800; padding-top:8px; }
    .total-row .amt { border-top:1px solid #0f172a; border-bottom:3px double #0f172a; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="brand">${escapeHtml(company)}</div>
      <div class="title">Balance de Situacion</div>
      <div class="sub">Fecha corte ${escapeHtml(fechaHasta)} - ${escapeHtml(moneda)} - Nivel ${escapeHtml(String(nivelVista))}</div>
    </div>
    <table>
      <colgroup>
        <col class="lbl-left" />
        <col class="amt-left" />
        <col class="sep" />
        <col class="lbl-right" />
        <col class="amt-right" />
      </colgroup>
      <tbody>
        ${bodyRows}
        ${footerRows}
      </tbody>
    </table>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=1200,height=780');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="bs-wrap">
        <div className="bs-title">Balance de Situacion</div>

        <div className="bs-grid">
          <input className="bs-input" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} disabled={Boolean(filtrosExternos)} />
          <select className="bs-input" value={moneda} onChange={(e) => setMoneda(e.target.value as 'CRC' | 'USD')} disabled={Boolean(filtrosExternos)}>
            <option value="CRC">CRC</option>
            <option value="USD">USD</option>
          </select>
          <input className="bs-input" type="number" min={1} max={5} step={1} value={nivelVista} onChange={(e) => setNivelVista(Math.max(1, Math.min(5, Number(e.target.value) || 5)))} />
          <button className="bs-btn" onClick={cargar} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
          <div />
        </div>

        <ListToolbar
          className="bs-toolbar"
          exports={(
            <>
              <button className="bs-export-btn" onClick={() => exportCsv(`balance_situacion_${empresaId}.csv`, rows, columns)} disabled={rows.length === 0}>CSV</button>
              <button className="bs-export-btn" onClick={exportExcelBalanceSchema} disabled={rows.length === 0}>EXCEL</button>
              <button
                className="bs-export-btn"
                onClick={exportPdfBalanceSchema}
                disabled={rows.length === 0}
              >
                PDF
              </button>
            </>
          )}
        />

        <div className="bs-cards">
          <div className="bs-card act"><div className="bs-card-num">{toMoney(activo, moneda)}</div><div className="bs-card-lbl">Activo</div></div>
          <div className="bs-card pas"><div className="bs-card-num">{toMoney(pasivo, moneda)}</div><div className="bs-card-lbl">Pasivo</div></div>
          <div className="bs-card cap"><div className="bs-card-num">{toMoney(capital, moneda)}</div><div className="bs-card-lbl">Capital</div></div>
          <div className="bs-card pyc"><div className="bs-card-num">{toMoney(pasivoCapital, moneda)}</div><div className="bs-card-lbl">Pasivo + Capital</div></div>
          <div className={`bs-card diff ${cuadrado ? 'ok' : ''}`}><div className="bs-card-num">{toMoney(diferencia, moneda)}</div><div className="bs-card-lbl">Diferencia</div></div>
        </div>

        {error && <div className="bs-error">Error: {error}</div>}

        <div className="bs-card-wrap">
          <table className="bs-schema-table">
            <thead>
              <tr>
                <th>Activos</th>
                <th className="bs-right">Monto</th>
                <th>Pasivo y Patrimonio</th>
                <th className="bs-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {rowsNivel.length === 0 ? (
                <tr><td colSpan={4} className="bs-empty">No hay datos para la fecha seleccionada</td></tr>
              ) : (
                <>
                  {Array.from({ length: maxLines }).map((_, i) => {
                    const l = leftLines[i];
                    const r = rightLines[i];
                    const lClass = l?.kind === 'section' ? 'bs-s-head' : l?.kind === 'group' ? 'bs-s-group' : l?.kind === 'subtotal' ? 'bs-s-subtotal' : l?.kind === 'total' ? 'bs-s-total' : 'bs-s-row';
                    const rClass = r?.kind === 'section' ? 'bs-s-head' : r?.kind === 'group' ? 'bs-s-group' : r?.kind === 'subtotal' ? 'bs-s-subtotal' : r?.kind === 'total' ? 'bs-s-total' : 'bs-s-row';
                    return (
                      <tr key={`line-${i}`}>
                        <td className={l ? lClass : 'bs-s-empty'}>{l?.label || ''}</td>
                        <td className={`bs-s-money ${l ? lClass : 'bs-s-empty'}`}>{l?.amount !== undefined ? toMoney(l.amount, moneda) : ''}</td>
                        <td className={r ? rClass : 'bs-s-empty'}>{r?.label || ''}</td>
                        <td className={`bs-s-money ${r ? rClass : 'bs-s-empty'}`}>{r?.amount !== undefined ? toMoney(r.amount, moneda) : ''}</td>
                      </tr>
                    );
                  })}
                  <tr className="bs-total">
                    <td>TOTAL ACTIVOS</td>
                    <td className="bs-right bs-money">{toMoney(activo, moneda)}</td>
                    <td>TOTAL PASIVO + CAPITAL</td>
                    <td className="bs-right bs-money">{toMoney(pasivoCapital, moneda)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
