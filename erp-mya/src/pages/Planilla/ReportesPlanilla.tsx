import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';
import { formatMoneyCRC } from '../../utils/reporting';
import { formatCompanyDate } from '../../utils/companyTimeZone';
import { PL_STYLES } from './planillaStyles';

interface Props { empresaId: number; empresaNombre?: string; empresaCedula?: string; }

interface Linea {
  colaborador_id: number;
  nombre_completo?: string;
  numero_empleado?: string | null;
  salario_base: number;
  monto_he_diurnas: number;
  monto_he_nocturnas: number;
  monto_he_feriado: number;
  bonificacion: number;
  comision: number;
  otros_ingresos: number;
  total_bruto: number;
  ded_ccss_obrero: number;
  ded_banco_popular: number;
  ded_renta: number;
  ded_pension_comp: number;
  ded_asfa: number;
  ded_embargo: number;
  ded_adelanto: number;
  ded_otras: number;
  total_deducciones: number;
  salario_neto: number;
  ccss_patronal: number;
  provision_aguinaldo: number;
  provision_vacaciones: number;
  provision_cesantia: number;
  total_costo_empresa: number;
}

const fmt = formatMoneyCRC;
function sum(lineas: Linea[], key: keyof Linea): number {
  return lineas.reduce((s, l) => s + ((l[key] as number) ?? 0), 0);
}

// -------------------------------------------------------
// Generadores de HTML para PDF
// -------------------------------------------------------
function htmlColabs(lineas: Linea[], perSel: { nombre: string; fecha_inicio: string; fecha_fin: string } | undefined, empresaNombre: string, empresaCedula: string | undefined): string {
  const fmtN = (n: number) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n ?? 0);
  const fmtF = (s: string) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CR') : '';

  const totSalBase  = sum(lineas, 'salario_base');
  const totHExtra   = lineas.reduce((s, l) => s + (l.monto_he_diurnas ?? 0) + (l.monto_he_nocturnas ?? 0) + (l.monto_he_feriado ?? 0), 0);
  const totOtrosIng = lineas.reduce((s, l) => s + (l.bonificacion ?? 0) + (l.comision ?? 0) + (l.otros_ingresos ?? 0), 0);
  const totBruto    = sum(lineas, 'total_bruto');
  const totCCSSOb   = sum(lineas, 'ded_ccss_obrero');
  const totBP       = sum(lineas, 'ded_banco_popular');
  const totCCSSBP   = totCCSSOb + totBP;
  const totRenta    = sum(lineas, 'ded_renta');
  const totOtrasDed = lineas.reduce((s, l) => s + (l.ded_pension_comp ?? 0) + (l.ded_asfa ?? 0) + (l.ded_embargo ?? 0) + (l.ded_adelanto ?? 0) + (l.ded_otras ?? 0), 0);
  const totTotalDed = sum(lineas, 'total_deducciones');
  const totNeto     = sum(lineas, 'salario_neto');

  const rows = lineas.map(l => {
    const hExtra   = (l.monto_he_diurnas ?? 0) + (l.monto_he_nocturnas ?? 0) + (l.monto_he_feriado ?? 0);
    const otrosIng = (l.bonificacion ?? 0) + (l.comision ?? 0) + (l.otros_ingresos ?? 0);
    const ccssBP   = (l.ded_ccss_obrero ?? 0) + (l.ded_banco_popular ?? 0);
    const otrasDed = (l.ded_pension_comp ?? 0) + (l.ded_asfa ?? 0) + (l.ded_embargo ?? 0) + (l.ded_adelanto ?? 0) + (l.ded_otras ?? 0);
    return `<tr>
      <td>${l.numero_empleado || '—'}</td>
      <td>${l.nombre_completo ?? ''}</td>
      <td class="r">${fmtN(l.salario_base)}</td>
      <td class="r">${hExtra > 0 ? fmtN(hExtra) : '—'}</td>
      <td class="r">${otrosIng > 0 ? fmtN(otrosIng) : '—'}</td>
      <td class="r b">${fmtN(l.total_bruto)}</td>
      <td class="r red">${fmtN(ccssBP)}</td>
      <td class="r red">${l.ded_renta > 0 ? fmtN(l.ded_renta) : '—'}</td>
      <td class="r red">${otrasDed > 0 ? fmtN(otrasDed) : '—'}</td>
      <td class="r red b">${fmtN(l.total_deducciones)}</td>
      <td class="r grn b">${fmtN(l.salario_neto)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:Arial,sans-serif; font-size:10px; color:#0f172a; padding:24px 28px; }
.hdr { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:10px; border-bottom:2px solid #16a34a; margin-bottom:14px; }
.empresa { font-size:14px; font-weight:800; }
.sub { font-size:10px; color:#475569; margin-top:2px; }
.titulo { font-size:11px; font-weight:700; color:#16a34a; text-align:right; }
table { width:100%; border-collapse:collapse; }
th { font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:#475569; padding:4px 4px 4px 0; border-bottom:2px solid #e2e8f0; text-align:left; }
th.r, td.r { text-align:right; }
td { padding:4px 4px 4px 0; border-bottom:1px solid #f1f5f9; font-size:10px; }
tr:last-child td { border-bottom:none; }
.red { color:#dc2626; }
.grn { color:#16a34a; }
.b { font-weight:800; }
tfoot td { font-weight:800; border-top:2px solid #e2e8f0; padding-top:6px; font-size:10px; }
.footer { margin-top:12px; font-size:9px; color:#94a3b8; text-align:center; }
.no-print { display:block; } @media print { .no-print { display:none!important; } }
</style></head><body>
<div class="hdr">
  <div>
    <div class="empresa">${empresaNombre}</div>
    ${empresaCedula ? `<div class="sub">Cédula Jurídica: ${empresaCedula}</div>` : ''}
  </div>
  <div>
    <div class="titulo">Detalle de Planilla — Colaboradores</div>
    <div class="sub" style="text-align:right">${perSel ? `${perSel.nombre} · ${fmtF(perSel.fecha_inicio)} al ${fmtF(perSel.fecha_fin)}` : ''}</div>
    <div class="sub" style="text-align:right">${lineas.length} colaboradores</div>
  </div>
</div>
<table>
  <thead><tr>
    <th>Cód.</th><th>Colaborador</th>
    <th class="r">Sal. Base</th><th class="r">H. Extra</th><th class="r">Otros Ing.</th>
    <th class="r">Total Bruto</th>
    <th class="r">CCSS+BP</th><th class="r">Renta</th><th class="r">Otras Ded.</th>
    <th class="r">Total Ded.</th><th class="r">Neto a Pagar</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="2">TOTALES (${lineas.length})</td>
    <td class="r">${fmtN(totSalBase)}</td>
    <td class="r">${totHExtra > 0 ? fmtN(totHExtra) : '—'}</td>
    <td class="r">${totOtrosIng > 0 ? fmtN(totOtrosIng) : '—'}</td>
    <td class="r b">${fmtN(totBruto)}</td>
    <td class="r red">${fmtN(totCCSSBP)}</td>
    <td class="r red">${totRenta > 0 ? fmtN(totRenta) : '—'}</td>
    <td class="r red">${totOtrasDed > 0 ? fmtN(totOtrasDed) : '—'}</td>
    <td class="r red b">${fmtN(totTotalDed)}</td>
    <td class="r grn b">${fmtN(totNeto)}</td>
  </tr></tfoot>
</table>
<div class="footer">Generado por MYA ERP · ${new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' })} · Confidencial</div>
</body></html>`;
}

function htmlPatronal(lineas: Linea[], perSel: { nombre: string; fecha_inicio: string; fecha_fin: string } | undefined, empresaNombre: string, empresaCedula: string | undefined): string {
  const fmtN = (n: number) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n ?? 0);
  const fmtF = (s: string) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CR') : '';

  const totNeto       = sum(lineas, 'salario_neto');
  const totCCSSPat    = sum(lineas, 'ccss_patronal');
  const totAguinaldo  = sum(lineas, 'provision_aguinaldo');
  const totVacaciones = sum(lineas, 'provision_vacaciones');
  const totCesantia   = sum(lineas, 'provision_cesantia');
  const totCosto      = sum(lineas, 'total_costo_empresa');

  const rows = lineas.map(l => `<tr>
    <td>${l.numero_empleado || '—'}</td>
    <td>${l.nombre_completo ?? ''}</td>
    <td class="r">${fmtN(l.salario_neto)}</td>
    <td class="r ora">${fmtN(l.ccss_patronal)}</td>
    <td class="r pur">${fmtN(l.provision_aguinaldo)}</td>
    <td class="r pur">${fmtN(l.provision_vacaciones)}</td>
    <td class="r pur">${fmtN(l.provision_cesantia)}</td>
    <td class="r b ind">${fmtN(l.total_costo_empresa)}</td>
  </tr>`).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:Arial,sans-serif; font-size:10px; color:#0f172a; padding:24px 28px; }
.hdr { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:10px; border-bottom:2px solid #7c3aed; margin-bottom:14px; }
.empresa { font-size:14px; font-weight:800; }
.sub { font-size:10px; color:#475569; margin-top:2px; }
.titulo { font-size:11px; font-weight:700; color:#7c3aed; text-align:right; }
table { width:100%; border-collapse:collapse; }
th { font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:#475569; padding:4px 4px 4px 0; border-bottom:2px solid #e2e8f0; text-align:left; }
th.r, td.r { text-align:right; }
td { padding:4px 4px 4px 0; border-bottom:1px solid #f1f5f9; font-size:10px; }
tr:last-child td { border-bottom:none; }
.grn { color:#16a34a; } .ora { color:#d97706; } .pur { color:#7c3aed; } .ind { color:#4f46e5; }
.b { font-weight:800; }
tfoot td { font-weight:800; border-top:2px solid #e2e8f0; padding-top:6px; font-size:10px; }
.footer { margin-top:12px; font-size:9px; color:#94a3b8; text-align:center; }
.conf { background:#fef3c7; border:1px solid #f59e0b; border-radius:4px; padding:4px 10px; font-size:9px; color:#92400e; margin-bottom:10px; display:inline-block; }
.no-print { display:block; } @media print { .no-print { display:none!important; } }
</style></head><body>
<div class="hdr">
  <div>
    <div class="empresa">${empresaNombre}</div>
    ${empresaCedula ? `<div class="sub">Cédula Jurídica: ${empresaCedula}</div>` : ''}
  </div>
  <div>
    <div class="titulo">Reporte de Costo Patronal</div>
    <div class="sub" style="text-align:right">${perSel ? `${perSel.nombre} · ${fmtF(perSel.fecha_inicio)} al ${fmtF(perSel.fecha_fin)}` : ''}</div>
    <div class="sub" style="text-align:right">${lineas.length} colaboradores</div>
  </div>
</div>
<div class="conf">⚠ Documento confidencial — solo para uso interno</div>
<table>
  <thead><tr>
    <th>Cód.</th><th>Colaborador</th>
    <th class="r">Neto a Pagar</th><th class="r">CCSS Patronal</th>
    <th class="r">Prov. Aguinaldo</th><th class="r">Prov. Vacaciones</th><th class="r">Prov. Cesantía</th>
    <th class="r">Costo Total</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="2">TOTALES (${lineas.length})</td>
    <td class="r grn">${fmtN(totNeto)}</td>
    <td class="r ora">${fmtN(totCCSSPat)}</td>
    <td class="r pur">${fmtN(totAguinaldo)}</td>
    <td class="r pur">${fmtN(totVacaciones)}</td>
    <td class="r pur">${fmtN(totCesantia)}</td>
    <td class="r ind b">${fmtN(totCosto)}</td>
  </tr></tfoot>
</table>
<div class="footer">Generado por MYA ERP · ${new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' })} · Documento confidencial — uso interno</div>
</body></html>`;
}

export default function ReportesPlanilla({ empresaId, empresaNombre = '', empresaCedula }: Props) {
  const [periodos, setPeriodos] = useState<{ id: number; nombre: string; estado: string; fecha_inicio: string; fecha_fin: string }[]>([]);
  const [periodoId, setPeriodoId] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'colabs' | 'patronal'>('colabs');
  const [descargandoPdf, setDescargandoPdf] = useState(false);

  const loadPeriodos = useCallback(async () => {
    if (loaded) return;
    const { data } = await supabase.from('pl_periodos').select('id,nombre,estado,fecha_inicio,fecha_fin').eq('empresa_id', empresaId).in('estado', ['calculado', 'cerrado', 'contabilizado']).order('fecha_inicio', { ascending: false });
    setPeriodos(data || []); setLoaded(true);
  }, [empresaId, loaded]);

  const generar = async () => {
    if (!periodoId) return;
    setLoading(true);
    const [{ data: linData }, { data: colabs }] = await Promise.all([
      supabase.from('pl_planilla_lineas').select('*').eq('periodo_id', Number(periodoId)),
      supabase.from('pl_colaboradores').select('id,nombre_completo,numero_empleado').eq('empresa_id', empresaId),
    ]);
    const colMap = new Map((colabs || []).map(c => [c.id, c]));
    setLineas((linData || []).map(l => ({
      ...l,
      nombre_completo: colMap.get(l.colaborador_id)?.nombre_completo,
      numero_empleado: colMap.get(l.colaborador_id)?.numero_empleado,
    })));
    setLoading(false);
  };

  const exportarCSV = () => {
    const nombre = perSel?.nombre ?? periodoId;
    if (tab === 'colabs') {
      const headers = ['Código', 'Colaborador', 'Sal. Base', 'H. Extra', 'Otros Ing.', 'Total Bruto', 'CCSS+BP', 'Renta', 'Otras Ded.', 'Total Ded.', 'Neto a Pagar'];
      const rows = lineas.map(l => [
        l.numero_empleado ?? '',
        l.nombre_completo ?? '',
        l.salario_base,
        (l.monto_he_diurnas ?? 0) + (l.monto_he_nocturnas ?? 0) + (l.monto_he_feriado ?? 0),
        (l.bonificacion ?? 0) + (l.comision ?? 0) + (l.otros_ingresos ?? 0),
        l.total_bruto,
        (l.ded_ccss_obrero ?? 0) + (l.ded_banco_popular ?? 0),
        l.ded_renta,
        (l.ded_pension_comp ?? 0) + (l.ded_asfa ?? 0) + (l.ded_embargo ?? 0) + (l.ded_adelanto ?? 0) + (l.ded_otras ?? 0),
        l.total_deducciones,
        l.salario_neto,
      ]);
      const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `planilla_colaboradores_${nombre}.csv`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['Código', 'Colaborador', 'Neto a Pagar', 'CCSS Patronal', 'Prov. Aguinaldo', 'Prov. Vacaciones', 'Prov. Cesantía', 'Costo Total'];
      const rows = lineas.map(l => [
        l.numero_empleado ?? '',
        l.nombre_completo ?? '',
        l.salario_neto,
        l.ccss_patronal,
        l.provision_aguinaldo,
        l.provision_vacaciones,
        l.provision_cesantia,
        l.total_costo_empresa,
      ]);
      const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `planilla_patronal_${nombre}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const descargarPdf = async () => {
    setDescargandoPdf(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const html = tab === 'colabs'
        ? htmlColabs(lineas, perSel, empresaNombre, empresaCedula)
        : htmlPatronal(lineas, perSel, empresaNombre, empresaCedula);
      const nombre = perSel?.nombre ?? periodoId;
      const tipo = tab === 'colabs' ? 'colaboradores' : 'patronal';

      const res = await fetch('/api/planilla/reporte-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ html, nombre: `planilla_${tipo}_${nombre}` }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `planilla_${tipo}_${nombre}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else { console.error('Error PDF:', await res.text()); }
    } catch (e) { console.error(e); }
    finally { setDescargandoPdf(false); }
  };

  const perSel = periodos.find(p => String(p.id) === periodoId);

  // Totales colaboradores
  const totBruto    = sum(lineas, 'total_bruto');
  const totNeto     = sum(lineas, 'salario_neto');
  const totCCSSOb   = sum(lineas, 'ded_ccss_obrero');
  const totBP       = sum(lineas, 'ded_banco_popular');
  const totCCSSBP   = totCCSSOb + totBP;
  const totRenta    = sum(lineas, 'ded_renta');
  const totOtrasDed = lineas.reduce((s, l) => s + (l.ded_pension_comp ?? 0) + (l.ded_asfa ?? 0) + (l.ded_embargo ?? 0) + (l.ded_adelanto ?? 0) + (l.ded_otras ?? 0), 0);
  const totTotalDed = sum(lineas, 'total_deducciones');
  const totHExtra   = lineas.reduce((s, l) => s + (l.monto_he_diurnas ?? 0) + (l.monto_he_nocturnas ?? 0) + (l.monto_he_feriado ?? 0), 0);
  const totOtrosIng = lineas.reduce((s, l) => s + (l.bonificacion ?? 0) + (l.comision ?? 0) + (l.otros_ingresos ?? 0), 0);
  const totSalBase  = sum(lineas, 'salario_base');
  // Totales patronales
  const totCCSSPat    = sum(lineas, 'ccss_patronal');
  const totAguinaldo  = sum(lineas, 'provision_aguinaldo');
  const totVacaciones = sum(lineas, 'provision_vacaciones');
  const totCesantia   = sum(lineas, 'provision_cesantia');
  const totCosto      = sum(lineas, 'total_costo_empresa');

  return (
    <div className="pl-wrap">
      <style>{PL_STYLES}</style>
      <style>{`
        @media print {
          @page { size: Letter landscape; margin: 8mm 10mm; }
          body * { visibility: hidden !important; }
          .pl-reporte-print, .pl-reporte-print * { visibility: visible !important; }
          .pl-reporte-print {
            position: fixed !important; top: 0 !important; left: 0 !important;
            width: 100% !important; padding: 0 !important;
            background: #fff !important; color: #1a1a1a !important;
            box-shadow: none !important; border-radius: 0 !important;
            font-family: 'Times New Roman', Times, serif !important;
          }
          .pl-reporte-print .pl-table-wrap { overflow: visible !important; }
          .pl-reporte-print table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-family: 'Times New Roman', Times, serif !important;
            font-size: 9pt !important;
            color: #1a1a1a !important;
          }
          .pl-reporte-print th {
            font-family: 'Times New Roman', Times, serif !important;
            font-size: 9pt !important;
            font-weight: bold !important;
            color: #1a1a1a !important;
            padding: 4px 6px !important;
            border-bottom: 1.5pt solid #1a1a1a !important;
            white-space: nowrap !important;
            background: none !important;
            text-transform: none !important;
            letter-spacing: 0 !important;
          }
          .pl-reporte-print td {
            font-family: 'Times New Roman', Times, serif !important;
            font-size: 9pt !important;
            font-weight: normal !important;
            color: #1a1a1a !important;
            padding: 3px 6px !important;
            border-bottom: 0.5pt solid #d0d0d0 !important;
            white-space: nowrap !important;
            background: none !important;
          }
          .pl-reporte-print tfoot td {
            font-weight: bold !important;
            border-top: 1.5pt solid #1a1a1a !important;
            border-bottom: none !important;
          }
          .print-header {
            margin-bottom: 8pt !important;
            padding-bottom: 6pt !important;
            border-bottom: 1.5pt solid #1a1a1a !important;
            font-family: 'Times New Roman', Times, serif !important;
          }
          .print-header-empresa {
            font-size: 11pt !important;
            font-weight: bold !important;
            color: #1a1a1a !important;
          }
          .print-header-titulo {
            font-size: 10pt !important;
            font-weight: bold !important;
            color: #1a1a1a !important;
            margin-top: 2pt !important;
          }
          .print-header-sub {
            font-size: 8.5pt !important;
            color: #444 !important;
            margin-top: 2pt !important;
          }
          .no-print { display: none !important; }
        }
        .print-header { display: none; }
        @media print {
          .print-header { display: block !important; }
        }
      `}</style>
      <div className="pl-hdr">
        <div className="pl-hdr-left">
          <h2 className="pl-title">Reportes de Planilla</h2>
          <p className="pl-sub">Detalle de colaboradores y costo patronal por período</p>
        </div>
      </div>

      {/* Selector */}
      <div className="pl-card pl-card-p no-print" style={{ marginBottom: 16 }}>
        <p className="pl-card-title">Seleccionar Período</p>
        <div className="pl-filters">
          <div style={{ flex: 1, minWidth: 260 }}>
            <select className="pl-select" style={{ width: '100%' }} value={periodoId} onChange={e => setPeriodoId(e.target.value)} onFocus={loadPeriodos}>
              <option value="">— Seleccione un período —</option>
              {periodos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.estado})</option>)}
            </select>
          </div>
          <button className="pl-btn blue" onClick={generar} disabled={!periodoId || loading}>
            {loading ? 'Generando...' : 'Generar Reporte'}
          </button>
        </div>
        {perSel && (
          <div className="pl-info" style={{ marginTop: 10, marginBottom: 0 }}>
            {perSel.nombre} · {formatCompanyDate(perSel.fecha_inicio)} — {formatCompanyDate(perSel.fecha_fin)} · <strong>{lineas.length} colaboradores</strong>
          </div>
        )}
      </div>

      {lineas.length > 0 && (
        <>
          {/* KPIs */}
          <div className="pl-kpi-grid no-print" style={{ marginBottom: 14 }}>
            {[
              { l: 'Total Bruto',         v: fmt(totBruto),   c: '#d6e2ff' },
              { l: 'Neto a Pagar',        v: fmt(totNeto),    c: '#22c55e' },
              { l: 'CCSS Obrero+BP',      v: fmt(totCCSSBP),  c: '#f87171' },
              { l: 'CCSS Patronal',       v: fmt(totCCSSPat), c: '#f59e0b' },
              { l: 'Imp. Renta (MH)',     v: fmt(totRenta),   c: '#a78bfa' },
              { l: 'Costo Total Empresa', v: fmt(totCosto),   c: '#818cf8' },
            ].map(s => (
              <div className="pl-kpi" key={s.l}>
                <div className="k">{s.l}</div>
                <div className="v mono" style={{ fontSize: 15, color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Tabs + acciones */}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
            <div className="pl-tabs" style={{ marginBottom: 0 }}>
              <button className={`pl-tab${tab === 'colabs' ? ' active' : ''}`} onClick={() => setTab('colabs')}>
                👥 Detalle Colaboradores
              </button>
              <button className={`pl-tab${tab === 'patronal' ? ' active' : ''}`} onClick={() => setTab('patronal')}>
                🏢 Costo Patronal
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pl-btn" onClick={exportarCSV}>⬇ CSV</button>
              <button className="pl-btn" style={{ borderColor: '#7c3aed', color: '#a78bfa' }} onClick={descargarPdf} disabled={descargandoPdf}>
                {descargandoPdf ? 'Generando...' : '⬇ PDF'}
              </button>
              <button className="pl-btn" style={{ borderColor: '#16a34a', color: '#22c55e' }} onClick={() => {
                const html = tab === 'colabs'
                  ? htmlColabs(lineas, perSel, empresaNombre, empresaCedula)
                  : htmlPatronal(lineas, perSel, empresaNombre, empresaCedula);
                const win = window.open('', '_blank');
                if (!win) return;
                win.document.write(html);
                win.document.close();
                win.onafterprint = () => win.close();
                setTimeout(() => { win.print(); }, 400);
              }}>
                🖨 Imprimir
              </button>
            </div>
          </div>

          {/* Tab: Colaboradores */}
          {tab === 'colabs' && (
            <div className="pl-card pl-reporte-print">
              <div className="print-header">
                <div className="print-header-empresa">{empresaNombre}{empresaCedula ? ` — Cédula Jurídica: ${empresaCedula}` : ''}</div>
                <div className="print-header-titulo">Detalle de Planilla — Colaboradores</div>
                {perSel && <div className="print-header-sub">{perSel.nombre} · {formatCompanyDate(perSel.fecha_inicio)} al {formatCompanyDate(perSel.fecha_fin)} · {lineas.length} colaboradores</div>}
              </div>
              <div className="pl-table-wrap">
                <table className="pl-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Cód.</th>
                      <th>Colaborador</th>
                      <th className="r">Sal. Base</th>
                      <th className="r">H. Extra</th>
                      <th className="r">Otros Ing.</th>
                      <th className="r" style={{ color: '#d6e2ff' }}>Total Bruto</th>
                      <th className="r" style={{ color: '#f87171' }}>CCSS+BP</th>
                      <th className="r" style={{ color: '#a78bfa' }}>Renta</th>
                      <th className="r" style={{ color: '#f87171' }}>Otras Ded.</th>
                      <th className="r" style={{ color: '#f87171' }}>Total Ded.</th>
                      <th className="r" style={{ color: '#22c55e' }}>Neto a Pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map(l => {
                      const hExtra   = (l.monto_he_diurnas ?? 0) + (l.monto_he_nocturnas ?? 0) + (l.monto_he_feriado ?? 0);
                      const otrosIng = (l.bonificacion ?? 0) + (l.comision ?? 0) + (l.otros_ingresos ?? 0);
                      const ccssBP   = (l.ded_ccss_obrero ?? 0) + (l.ded_banco_popular ?? 0);
                      const otrasDed = (l.ded_pension_comp ?? 0) + (l.ded_asfa ?? 0) + (l.ded_embargo ?? 0) + (l.ded_adelanto ?? 0) + (l.ded_otras ?? 0);
                      return (
                        <tr key={l.colaborador_id}>
                          <td className="mono" style={{ color: '#8ea3c7', fontSize: 11 }}>{l.numero_empleado || '—'}</td>
                          <td style={{ fontWeight: 600, color: '#f3f7ff', whiteSpace: 'nowrap' }}>{l.nombre_completo}</td>
                          <td className="r mono">{fmt(l.salario_base)}</td>
                          <td className="r mono" style={{ color: hExtra > 0 ? '#38bdf8' : '#4a5568' }}>{hExtra > 0 ? fmt(hExtra) : '—'}</td>
                          <td className="r mono" style={{ color: otrosIng > 0 ? '#38bdf8' : '#4a5568' }}>{otrosIng > 0 ? fmt(otrosIng) : '—'}</td>
                          <td className="r mono" style={{ color: '#d6e2ff', fontWeight: 700 }}>{fmt(l.total_bruto)}</td>
                          <td className="r mono" style={{ color: '#f87171' }}>{fmt(ccssBP)}</td>
                          <td className="r mono" style={{ color: '#a78bfa' }}>{l.ded_renta > 0 ? fmt(l.ded_renta) : '—'}</td>
                          <td className="r mono" style={{ color: otrasDed > 0 ? '#f87171' : '#4a5568' }}>{otrasDed > 0 ? fmt(otrasDed) : '—'}</td>
                          <td className="r mono" style={{ color: '#f87171', fontWeight: 700 }}>{fmt(l.total_deducciones)}</td>
                          <td className="r mono" style={{ color: '#22c55e', fontWeight: 800 }}>{fmt(l.salario_neto)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ color: '#f3f7ff' }}>TOTALES ({lineas.length})</td>
                      <td className="r mono" style={{ color: '#d6e2ff' }}>{fmt(totSalBase)}</td>
                      <td className="r mono" style={{ color: '#38bdf8' }}>{totHExtra > 0 ? fmt(totHExtra) : '—'}</td>
                      <td className="r mono" style={{ color: '#38bdf8' }}>{totOtrosIng > 0 ? fmt(totOtrosIng) : '—'}</td>
                      <td className="r mono" style={{ color: '#d6e2ff', fontWeight: 800 }}>{fmt(totBruto)}</td>
                      <td className="r mono" style={{ color: '#f87171', fontWeight: 800 }}>{fmt(totCCSSBP)}</td>
                      <td className="r mono" style={{ color: '#a78bfa', fontWeight: 800 }}>{totRenta > 0 ? fmt(totRenta) : '—'}</td>
                      <td className="r mono" style={{ color: '#f87171', fontWeight: 800 }}>{totOtrasDed > 0 ? fmt(totOtrasDed) : '—'}</td>
                      <td className="r mono" style={{ color: '#f87171', fontWeight: 800 }}>{fmt(totTotalDed)}</td>
                      <td className="r mono" style={{ color: '#22c55e', fontWeight: 800 }}>{fmt(totNeto)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Costo Patronal */}
          {tab === 'patronal' && (
            <div className="pl-card pl-reporte-print">
              <div className="print-header">
                <div className="print-header-empresa">{empresaNombre}{empresaCedula ? ` — Cédula Jurídica: ${empresaCedula}` : ''}</div>
                <div className="print-header-titulo">Reporte de Costo Patronal</div>
                {perSel && <div className="print-header-sub">{perSel.nombre} · {formatCompanyDate(perSel.fecha_inicio)} al {formatCompanyDate(perSel.fecha_fin)} · {lineas.length} colaboradores · Documento confidencial</div>}
              </div>
              <div className="pl-table-wrap">
                <table className="pl-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Cód.</th>
                      <th>Colaborador</th>
                      <th className="r" style={{ color: '#22c55e' }}>Neto a Pagar</th>
                      <th className="r" style={{ color: '#f59e0b' }}>CCSS Patronal</th>
                      <th className="r" style={{ color: '#a78bfa' }}>Prov. Aguinaldo</th>
                      <th className="r" style={{ color: '#a78bfa' }}>Prov. Vacaciones</th>
                      <th className="r" style={{ color: '#a78bfa' }}>Prov. Cesantía</th>
                      <th className="r" style={{ color: '#818cf8' }}>Costo Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map(l => (
                      <tr key={l.colaborador_id}>
                        <td className="mono" style={{ color: '#8ea3c7', fontSize: 11 }}>{l.numero_empleado || '—'}</td>
                        <td style={{ fontWeight: 600, color: '#f3f7ff', whiteSpace: 'nowrap' }}>{l.nombre_completo}</td>
                        <td className="r mono" style={{ color: '#22c55e' }}>{fmt(l.salario_neto)}</td>
                        <td className="r mono" style={{ color: '#f59e0b' }}>{fmt(l.ccss_patronal)}</td>
                        <td className="r mono" style={{ color: '#a78bfa' }}>{fmt(l.provision_aguinaldo)}</td>
                        <td className="r mono" style={{ color: '#a78bfa' }}>{fmt(l.provision_vacaciones)}</td>
                        <td className="r mono" style={{ color: '#a78bfa' }}>{fmt(l.provision_cesantia)}</td>
                        <td className="r mono" style={{ color: '#818cf8', fontWeight: 800 }}>{fmt(l.total_costo_empresa)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ color: '#f3f7ff' }}>TOTALES ({lineas.length})</td>
                      <td className="r mono" style={{ color: '#22c55e', fontWeight: 800 }}>{fmt(totNeto)}</td>
                      <td className="r mono" style={{ color: '#f59e0b', fontWeight: 800 }}>{fmt(totCCSSPat)}</td>
                      <td className="r mono" style={{ color: '#a78bfa', fontWeight: 800 }}>{fmt(totAguinaldo)}</td>
                      <td className="r mono" style={{ color: '#a78bfa', fontWeight: 800 }}>{fmt(totVacaciones)}</td>
                      <td className="r mono" style={{ color: '#a78bfa', fontWeight: 800 }}>{fmt(totCesantia)}</td>
                      <td className="r mono" style={{ color: '#818cf8', fontWeight: 800 }}>{fmt(totCosto)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
