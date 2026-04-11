import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, exportPdfWithPrint, ReportColumn, roundMoney, sumMoney } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';
import ExcelJS from 'exceljs';

interface RowBalance {
  cuenta: string;
  nombre: string;
  anterior: number;
  debe: number;
  haber: number;
  mes: number;
  saldo: number;
  nivel: number;
}

interface PlanIssue {
  scope: 'BASE' | 'EMPRESA' | string;
  codigo: string;
  nombre: string;
  nivel: number;
  issue: string;
  parent_codigo: string | null;
  parent_nombre: string | null;
}

interface VerMovimientosPayload {
  cuenta: string;
  nombre?: string;
  desde: string;
  hasta: string;
  moneda: 'CRC' | 'USD';
  origen?: 'balancecomprobacion' | 'estadoderesultados';
}

const styles = `
  .bc-wrap { padding:0; color:#d6e2ff; }
  .bc-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:14px; }
  .bc-grid { display:grid; grid-template-columns:170px 170px 120px 90px auto 1fr; gap:10px; margin-bottom:14px; }
  .bc-input { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; outline:none; background:#1d2738; color:#f3f7ff; }
  .bc-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .bc-btn { padding:10px 14px; border-radius:10px; border:none; font-size:13px; font-weight:700; cursor:pointer; color:#fff; background:linear-gradient(135deg,#17a34a,#22c55e); box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .bc-btn:disabled { opacity:0.7; cursor:not-allowed; }
  .bc-export-btn { padding:8px 13px; border-radius:11px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; color:#d6e2ff; font-size:12px; font-weight:700; cursor:pointer; }
  .bc-export-btn:hover { border-color:#4c7bf7; color:#ffffff; background:#243149; }
  .bc-export-btn:disabled { opacity:0.6; cursor:not-allowed; }
  .bc-toolbar { margin-bottom:10px; }
  .bc-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; overflow-x:auto; overflow-y:hidden; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .bc-table { width:100%; min-width:980px; border-collapse:collapse; table-layout:fixed; border:none; }
  .bc-table th { background:#131b2a; padding:9px 10px; font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; border-bottom:none; border-right:none; text-align:left; }
  .bc-table td { padding:8px 10px; font-size:12px; color:#d6e2ff; border-bottom:none; border-right:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bc-table tr:last-child td { border-bottom:none; }
  .bc-row-n1 td { background:#1f3158; color:#edf4ff; }
  .bc-row-n2 td { background:#2d2854; color:#efe9ff; }
  .bc-row-n3 td { background:#183d3c; color:#e6fffb; }
  .bc-row-n4 td { background:#3a302d; color:#fff3eb; }
  .bc-row-n5 td { background:#243043; color:#d6e2ff; }
  .bc-row-n1 td, .bc-row-n2 td, .bc-row-n3 td, .bc-row-n4 td, .bc-row-n5 td { border-bottom:none; }
  .bc-right { text-align:right !important; }
  .bc-money { font-family:'DM Mono',monospace; }
  .bc-nombre { font-weight:600; }
  .bc-level-chip { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:22px; border-radius:999px; font-size:11px; font-weight:700; font-family:'DM Mono',monospace; }
  .bc-level-chip.n1 { background:#24498f; color:#eff6ff; }
  .bc-level-chip.n2 { background:#5635a5; color:#f3e8ff; }
  .bc-level-chip.n3 { background:#1f7a65; color:#ecfdf5; }
  .bc-level-chip.n4 { background:#b96b18; color:#fff7ed; }
  .bc-level-chip.n5 { background:#4b5d79; color:#e2e8f0; }
  .bc-total td { background:#123224; font-weight:700; border-top:none; color:#9df4c7; }
  .bc-error { margin-bottom:10px; background:#34181c; border:1px solid #7d2f3a; color:#ffb3bb; border-radius:12px; padding:10px 12px; font-size:12px; }
  .bc-empty { padding:24px; text-align:center; color:#8ea3c7; font-size:13px; }
  .bc-alert { margin-bottom:10px; border-radius:10px; padding:10px 12px; font-size:12px; border:1px solid; }
  .bc-alert.ok { background:#0f2c20; border-color:#1d6e4f; color:#9df4c7; }
  .bc-alert.warn { background:#332914; border-color:#936b1d; color:#ffd66f; }
  .bc-alert.err { background:#34181c; border-color:#7d2f3a; color:#ffb3bb; }
  .bc-issues { margin-top:8px; display:grid; grid-template-columns:1fr; gap:6px; }
  .bc-issue { background:#1a2334; border:1px solid #7d2f3a; border-radius:10px; padding:6px 8px; font-size:11px; color:#ffb3bb; }
  .bc-link-btn { padding:6px 10px; border-radius:9px; border:1px solid rgba(76,123,247,0.34); background:#243149; color:#9ec3ff; font-size:11px; font-weight:700; cursor:pointer; }
  .bc-link-btn:hover { background:#2c3c58; border-color:#4c7bf7; color:#ffffff; }

  @media (max-width: 980px) {
    .bc-title { font-size:18px; }
    .bc-grid { grid-template-columns:1fr 1fr; gap:8px; }
    .bc-btn { width:100%; }
    .bc-toolbar { justify-content:flex-start !important; }
    .bc-export-btn { flex:1; min-width:90px; text-align:center; }
  }

  @media (max-width: 620px) {
    .bc-grid { grid-template-columns:1fr; gap:8px; }
    .bc-input { width:100%; }
    .bc-btn { width:100%; }
    .bc-export-btn { flex:1 1 auto; width:100%; }
    .bc-alert { font-size:11px; }
    .bc-issue { font-size:10px; }
  }
`;

const toMoney = (n: number, moneda: 'CRC' | 'USD') =>
  `${moneda === 'USD' ? '$' : '₡'} ${roundMoney(n, 2).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const approxZero = (n: number) => Math.abs(Number(n || 0)) < 0.000001;

function splitCuenta(codigo: string): { segments: string[]; sep: string } {
  if (codigo.includes('-')) return { segments: codigo.split('-').filter(Boolean), sep: '-' };
  if (codigo.includes('.')) return { segments: codigo.split('.').filter(Boolean), sep: '.' };
  return { segments: [codigo], sep: '-' };
}

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
    return c;
  }

  const { segments, sep } = splitCuenta(codigo);
  const maxLevel = segments.length;
  if (targetLevel >= maxLevel) return codigo;
  const padded = segments.map((seg, idx) => (idx < targetLevel ? seg : '0'.repeat(seg.length || 1)));
  return padded.join(sep);
}

function inferLevelFromCode(codigo: string): number {
  const custom = inferCustomLevel(codigo);
  if (custom !== null) return custom;
  const { segments } = splitCuenta(codigo);
  return segments.length;
}

export default function BalanceComprobacion({
  empresaId,
  onVerMovimientos,
}: {
  empresaId: number;
  onVerMovimientos?: (payload: VerMovimientosPayload) => void;
}) {
  const today = new Date();
  const [desde, setDesde] = useState(`${today.getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(today.toISOString().slice(0, 10));
  const [moneda, setMoneda] = useState<'CRC' | 'USD'>('CRC');
  const [rowsBase, setRowsBase] = useState<RowBalance[]>([]);
  const [catalogoNombre, setCatalogoNombre] = useState<Record<string, string>>({});
  const [nivelVista, setNivelVista] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<PlanIssue[]>([]);
  const reqRef = useRef(0);

  const cargar = async () => {
    if (desde && hasta && desde > hasta) {
      setError('Rango de fechas invalido: "Desde" no puede ser mayor que "Hasta".');
      setRowsBase([]);
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError('');
    const [balanceResp, issueResp] = await Promise.all([
      supabase.rpc('get_balance_comprobacion', {
        p_empresa_id: empresaId,
        p_fecha_desde: desde || null,
        p_fecha_hasta: hasta || null,
        p_moneda: moneda,
      }),
      supabase.rpc('get_plan_cuentas_inconsistencias', {
        p_empresa_id: empresaId,
      }),
    ]);
    if (reqId !== reqRef.current) return;
    if (balanceResp.error) {
      setError(balanceResp.error.message || 'No se pudo cargar el balance de comprobacion');
      setRowsBase([]);
    } else {
      setRowsBase((balanceResp.data || []) as RowBalance[]);
    }
    setIssues((issueResp.data || []) as PlanIssue[]);
    setLoading(false);
  };

  const cargarCatalogo = async () => {
    const [baseResp, empResp] = await Promise.all([
      supabase.from('plan_cuentas_base').select('codigo, nombre, nivel'),
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
    const t = setTimeout(() => cargar(), 350);
    return () => clearTimeout(t);
  }, [empresaId, desde, hasta, moneda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarCatalogo();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const lvl = Math.max(1, Math.min(5, Number(nivelVista) || 5));
    const map = new Map<string, RowBalance>();

    for (const r of rowsBase) {
      // El arbol visual debe depender del codigo real, no de un nivel inconsistente de BD.
      const originalLevel = inferLevelFromCode(r.cuenta) || Number(r.nivel) || 1;
      const topLevel = Math.min(originalLevel, lvl);

      // Construye siempre el arbol hacia arriba: topLevel..1
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
            nivel: current,
            anterior: Number(r.anterior || 0),
            debe: Number(r.debe || 0),
            haber: Number(r.haber || 0),
            mes: Number(r.mes || 0),
            saldo: Number(r.saldo || 0),
          });
        } else {
          prev.anterior += Number(r.anterior || 0);
          prev.debe += Number(r.debe || 0);
          prev.haber += Number(r.haber || 0);
          prev.mes += Number(r.mes || 0);
          prev.saldo += Number(r.saldo || 0);
        }
      }
    }

    return Array.from(map.values())
      .filter((r) => !(approxZero(r.anterior) && approxZero(r.debe) && approxZero(r.haber) && approxZero(r.mes) && approxZero(r.saldo)))
      .sort((a, b) => {
        const c = String(a.cuenta).localeCompare(String(b.cuenta));
        if (c !== 0) return c;
        return a.nivel - b.nivel;
      });
  }, [rowsBase, nivelVista, catalogoNombre]);

  const totals = useMemo(() => {
    const nivelObjetivo = Math.max(1, Math.min(5, Number(nivelVista) || 5));
    const base = rows.filter((r) => Number(r.nivel) === nivelObjetivo);
    return {
      anterior: sumMoney(base.map((r) => Number(r.anterior || 0)), 2),
      debe: sumMoney(base.map((r) => Number(r.debe || 0)), 2),
      haber: sumMoney(base.map((r) => Number(r.haber || 0)), 2),
      mes: sumMoney(base.map((r) => Number(r.mes || 0)), 2),
      saldo: sumMoney(base.map((r) => Number(r.saldo || 0)), 2),
    };
  }, [rows, nivelVista]);

  const baseTotals = useMemo(() => ({
    debe: sumMoney(rowsBase.map((r) => Number(r.debe || 0)), 2),
    haber: sumMoney(rowsBase.map((r) => Number(r.haber || 0)), 2),
    mes: sumMoney(rowsBase.map((r) => Number(r.mes || 0)), 2),
  }), [rowsBase]);
  const diffBase = Math.abs(baseTotals.debe - baseTotals.haber);
  const balanceOk = diffBase < 0.01;
  const diffMesRollup = Math.abs((totals.mes || 0) - (baseTotals.mes || 0));

  const columns: ReportColumn<RowBalance>[] = [
    { key: 'cuenta', title: 'Cuenta', getValue: (r) => r.cuenta, align: 'left', width: '16%' },
    { key: 'nombre', title: 'Nombre', getValue: (r) => r.nombre, align: 'left', width: '28%' },
    { key: 'anterior', title: 'Anterior', getValue: (r) => Number(r.anterior || 0).toFixed(2), align: 'right', width: '11%' },
    { key: 'debe', title: 'Debe', getValue: (r) => Number(r.debe || 0).toFixed(2), align: 'right', width: '11%' },
    { key: 'haber', title: 'Haber', getValue: (r) => Number(r.haber || 0).toFixed(2), align: 'right', width: '11%' },
    { key: 'mes', title: 'Mes', getValue: (r) => Number(r.mes || 0).toFixed(2), align: 'right', width: '11%' },
    { key: 'saldo', title: 'Saldo', getValue: (r) => Number(r.saldo || 0).toFixed(2), align: 'right', width: '11%' },
    { key: 'nivel', title: 'Nivel', getValue: (r) => r.nivel, width: '6%' },
  ];

  const exportExcelPlantilla = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Balance Comprobacion', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });

    const reportTitle = 'Balance de Comprobación';
    const subtitle = `Desde ${desde} Hasta ${hasta} - ${moneda} - Nivel ${nivelVista}`;
    const company =
      (typeof window !== 'undefined' ? localStorage.getItem('mya_report_company_name') : '') ||
      `Empresa ${empresaId}`;

    ws.columns = [
      { key: 'cuenta', width: 18 },
      { key: 'nombre', width: 42 },
      { key: 'anterior', width: 14 },
      { key: 'debe', width: 14 },
      { key: 'haber', width: 14 },
      { key: 'mes', width: 14 },
      { key: 'saldo', width: 14 },
      { key: 'nivel', width: 10 },
    ];
    ws.pageSetup = {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      verticalCentered: false,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    };
    const borderColor = { argb: 'FFD1D5DB' };
    const borderHeader = {
      top: { style: 'thin' as const, color: borderColor },
      bottom: { style: 'thin' as const, color: borderColor },
      left: { style: 'thin' as const, color: borderColor },
      right: { style: 'thin' as const, color: borderColor },
    };
    const borderVertical = {
      left: { style: 'thin' as const, color: borderColor },
      right: { style: 'thin' as const, color: borderColor },
    };
    const borderVerticalBottom = {
      left: { style: 'thin' as const, color: borderColor },
      right: { style: 'thin' as const, color: borderColor },
      bottom: { style: 'thin' as const, color: borderColor },
    };

    const moneyFmt = '#,##0.00;[Red]-#,##0.00';
    const levelFill: Record<number, string> = {
      1: 'FFDBEAFE',
      2: 'FFE0F2FE',
      3: 'FFECFEFF',
      4: 'FFF0F9FF',
      5: 'FFF8FAFC',
    };

    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = company;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = reportTitle;
    ws.getCell('A2').font = { bold: true, size: 13 };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.mergeCells('A3:H3');
    ws.getCell('A3').value = subtitle;
    ws.getCell('A3').font = { italic: true, size: 10 };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    const headerRow = ws.addRow([]);
    headerRow.height = 6;
    const h = ws.addRow(['Cuenta', 'Nombre', 'Anterior', 'Debe', 'Haber', 'Mes', 'Saldo', 'Nivel']);
    h.eachCell((c, idx) => {
      c.font = { bold: true, color: { argb: 'FF1F2937' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
      c.border = {
        ...borderHeader,
        left: idx === 1 ? borderHeader.left : borderVertical.left,
        right: idx === 8 ? borderHeader.right : borderVertical.right,
      };
    });

    rows.forEach((r, rowIdx) => {
      const row = ws.addRow([
        r.cuenta,
        String(r.nombre || '').toUpperCase(),
        roundMoney(Number(r.anterior || 0), 2),
        roundMoney(Number(r.debe || 0), 2),
        roundMoney(Number(r.haber || 0), 2),
        roundMoney(Number(r.mes || 0), 2),
        roundMoney(Number(r.saldo || 0), 2),
        Number(r.nivel || 0),
      ]);
      const fillArgb = levelFill[Math.max(1, Math.min(5, Number(r.nivel) || 5))] || 'FFF8FAFC';
      const isLastDataRow = rowIdx === rows.length - 1;
      row.eachCell((c, idx) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
        c.border = isLastDataRow ? borderVerticalBottom : borderVertical;
        if (idx >= 3 && idx <= 7) {
          c.numFmt = moneyFmt;
          c.alignment = { horizontal: 'right' };
        } else if (idx === 8) {
          c.alignment = { horizontal: 'center' };
        }
      });
    });

    const t = ws.addRow([
      'TOTALES',
      '',
      roundMoney(Number(totals.anterior || 0), 2),
      roundMoney(Number(totals.debe || 0), 2),
      roundMoney(Number(totals.haber || 0), 2),
      roundMoney(Number(totals.mes || 0), 2),
      roundMoney(Number(totals.saldo || 0), 2),
      '',
    ]);
    ws.mergeCells(`A${t.number}:B${t.number}`);
    t.getCell(1).font = { bold: true };
    t.getCell(1).alignment = { horizontal: 'left' };
    t.eachCell((c, idx) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      c.border = borderVerticalBottom;
      if (idx >= 3 && idx <= 7) {
        c.numFmt = moneyFmt;
        c.font = { bold: true };
        c.alignment = { horizontal: 'right' };
      }
    });
    ws.pageSetup.printArea = `A1:H${t.number}`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balance_comprobacion_${empresaId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="bc-wrap">
        <div className="bc-title">Balance de Comprobación</div>

        <div className="bc-grid">
          <input className="bc-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <input className="bc-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <select className="bc-input" value={moneda} onChange={(e) => setMoneda(e.target.value as 'CRC' | 'USD')}>
            <option value="CRC">CRC</option>
            <option value="USD">USD</option>
          </select>
          <input
            className="bc-input"
            type="number"
            min={1}
            max={5}
            step={1}
            value={nivelVista}
            onChange={(e) => setNivelVista(Math.max(1, Math.min(5, Number(e.target.value) || 5)))}
            title="Nivel de despliegue (1 a 5)"
          />
          <button className="bc-btn" onClick={cargar} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
          <div />
        </div>

        <ListToolbar
          className="bc-toolbar"
          exports={(
            <>
              <button className="bc-export-btn" onClick={() => exportCsv(`balance_comprobacion_${empresaId}.csv`, rows, columns)} disabled={rows.length === 0}>CSV</button>
              <button className="bc-export-btn" onClick={exportExcelPlantilla} disabled={rows.length === 0}>EXCEL</button>
              <button className="bc-export-btn" onClick={() => exportPdfWithPrint({
                title: 'Balance de Comprobación',
                subtitle: `Desde ${desde} Hasta ${hasta} - ${moneda}`,
                rows,
                columns,
                orientation: 'landscape',
              })} disabled={rows.length === 0}>PDF</button>
            </>
          )}
        />

        {error && <div className="bc-error">Error: {error}</div>}
        {!error && (
          <>
            <div className={`bc-alert ${balanceOk ? 'ok' : 'err'}`}>
              {balanceOk
                ? `Balance cuadrado: Debe = Haber (${toMoney(baseTotals.debe, moneda)})`
                : `Descuadre detectado: Debe ${toMoney(baseTotals.debe, moneda)} vs Haber ${toMoney(baseTotals.haber, moneda)} (dif ${toMoney(diffBase, moneda)})`}
            </div>
            <div className={`bc-alert ${issues.length === 0 ? 'ok' : 'warn'}`}>
              {issues.length === 0
                ? 'Jerarquía de plan de cuentas sin inconsistencias.'
                : `Plan de cuentas con ${issues.length} inconsistencia(s) de jerarquía/código.`}
              {issues.length > 0 && (
                <div className="bc-issues">
                  {issues.slice(0, 8).map((it, idx) => (
                    <div key={`${it.scope}-${it.codigo}-${idx}`} className="bc-issue">
                      [{it.scope}] {it.codigo} - {String(it.nombre || '').toUpperCase()} (N{it.nivel}) - {it.issue}
                      {it.parent_codigo ? ` - Padre esperado: ${it.parent_codigo}${it.parent_nombre ? ` (${String(it.parent_nombre).toUpperCase()})` : ''}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {diffMesRollup > 0.01 && (
              <div className="bc-alert warn">
                Nota: el total de "Mes" visible puede variar por el resumen jerárquico (niveles 1..N). Para control contable use el cuadrado base Debe/Haber.
              </div>
            )}
          </>
        )}

        <div className="bc-card">
          <table className="bc-table">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Nombre</th>
                <th className="bc-right">Moneda</th>
                <th className="bc-right">Anterior</th>
                <th className="bc-right">Debe</th>
                <th className="bc-right">Haber</th>
                <th className="bc-right">Mes</th>
                <th className="bc-right">Saldo</th>
                <th className="bc-right">Nivel</th>
                <th className="bc-right">Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="bc-empty">No hay datos en el rango seleccionado</td></tr>
              ) : (
                <>
                  {rows.map((r, i) => (
                    <tr key={`${r.cuenta}-${i}`} className={`bc-row-n${Math.max(1, Math.min(5, Number(r.nivel) || 5))}`}>
                      <td style={{ fontFamily: 'DM Mono, monospace', color: '#166534' }}>{r.cuenta}</td>
                      <td style={{ textAlign: 'left' }} className="bc-nombre">{String(r.nombre || '').toUpperCase()}</td>
                      <td className="bc-right bc-money">{moneda}</td>
                      <td className="bc-right bc-money">{toMoney(r.anterior, moneda)}</td>
                      <td className="bc-right bc-money">{toMoney(r.debe, moneda)}</td>
                      <td className="bc-right bc-money">{toMoney(r.haber, moneda)}</td>
                      <td className="bc-right bc-money">{toMoney(r.mes, moneda)}</td>
                      <td className="bc-right bc-money">{toMoney(r.saldo, moneda)}</td>
                      <td className="bc-right">
                        <span className={`bc-level-chip n${Math.max(1, Math.min(5, Number(r.nivel) || 5))}`}>{r.nivel}</span>
                      </td>
                      <td className="bc-right">
                        {Number(r.nivel) === 5 ? (
                          <button
                            className="bc-link-btn"
                            onClick={() =>
                              onVerMovimientos?.({
                                cuenta: String(r.cuenta || ''),
                                nombre: String(r.nombre || ''),
                              desde,
                              hasta,
                              moneda,
                              origen: 'balancecomprobacion',
                            })
                          }
                            title="Ver movimientos de esta cuenta en Mayor General"
                          >
                            Ver
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  <tr className="bc-total">
                    <td colSpan={2}>TOTALES</td>
                    <td className="bc-right bc-money">{moneda}</td>
                    <td className="bc-right bc-money">{toMoney(totals.anterior, moneda)}</td>
                    <td className="bc-right bc-money">{toMoney(totals.debe, moneda)}</td>
                    <td className="bc-right bc-money">{toMoney(totals.haber, moneda)}</td>
                    <td className="bc-right bc-money">{toMoney(totals.mes, moneda)}</td>
                    <td className="bc-right bc-money">{toMoney(totals.saldo, moneda)}</td>
                    <td />
                    <td />
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
