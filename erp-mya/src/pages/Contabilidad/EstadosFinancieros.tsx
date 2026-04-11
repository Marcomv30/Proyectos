import React, { useEffect, useState } from 'react';
import BalanceSituacion from './BalanceSituacion';
import EstadoResultados from './EstadoResultados';
import { supabase } from '../../supabase';
import ExcelJS from 'exceljs';

type EeffTab = 'balancesituacion' | 'estadoderesultados' | 'flujoefectivo' | 'capital' | 'razones';

const styles = `
  .eeff-wrap { padding:0; color:#d6e2ff; }
  .eeff-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:12px; }
  .eeff-bar { display:grid; grid-template-columns:170px 170px 120px 220px auto 1fr; gap:10px; margin-bottom:12px; align-items:start; }
  .eeff-input { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; outline:none; background:#1d2738; color:#f3f7ff; }
  .eeff-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,.16); }
  .eeff-btn {
    border:none; background:linear-gradient(135deg,#17a34a,#22c55e); color:#fff;
    border-radius:10px; padding:10px 14px; font-size:13px; font-weight:700; cursor:pointer;
    box-shadow:0 14px 24px rgba(34,197,94,.18);
  }
  .eeff-note {
    border:1px solid rgba(137,160,201,0.18); background:#172131; border-radius:14px; padding:14px; color:#d6e2ff; font-size:13px;
  }
  .eeff-note h4 { margin:0 0 8px; font-size:15px; color:#f3f7ff; }
  .eeff-note p { margin:0; line-height:1.45; }
  .eeff-note-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .eeff-export-btn {
    padding:8px 13px; border-radius:11px; border:1px solid rgba(137,160,201,0.22); background:#1c2739;
    color:#d6e2ff; font-size:12px; font-weight:700; cursor:pointer;
  }
  .eeff-export-btn:hover { border-color:#4c7bf7; color:#ffffff; background:#243149; }
  .eeff-chip {
    display:inline-flex; align-items:center; gap:6px; border-radius:999px;
    border:1px solid rgba(137,160,201,0.18); background:#1d2738; color:#d6e2ff; padding:6px 10px; font-size:12px; font-weight:700;
  }
  .eeff-chip.preliminar { border-color:#936b1d; background:#332914; color:#ffd66f; }
  .eeff-chip.oficial { border-color:#2452a2; background:#1f2f4c; color:#9ec3ff; }
  .eeff-table-wrap { border:1px solid rgba(137,160,201,0.18); border-radius:16px; overflow:hidden; background:#172131; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .eeff-table { width:100%; border-collapse:collapse; }
  .eeff-table th { background:#131b2a; padding:9px 10px; font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; text-align:left; }
  .eeff-table td { padding:8px 10px; border-top:1px solid rgba(137,160,201,0.12); font-size:13px; color:#d6e2ff; }
  .eeff-right { text-align:right; font-family:'DM Mono',monospace; }
  .eeff-row-warn td { background:#3a302d; }
  .eeff-row-warn td:last-child { color:#ffd9b0; font-weight:700; }
  .eeff-badge {
    display:inline-flex; align-items:center; justify-content:center; min-width:84px;
    padding:4px 8px; border-radius:999px; font-size:11px; font-weight:700;
  }
  .eeff-badge.ok { background:#0f2c20; color:#9df4c7; }
  .eeff-badge.warn { background:#332914; color:#ffd66f; }
  .eeff-badge.risk { background:#34181c; color:#ffb3bb; }
  .eeff-badge.na { background:#243149; color:#d6e2ff; }
  .eeff-error { margin:8px 0 0; color:#ffb3bb; font-size:12px; }
`;

type EeffContext = {
  cierre_activo: boolean;
  cierre_fecha_inicio: string | null;
  cierre_fecha_fin: string | null;
  estado_corte: string;
  es_preliminar: boolean;
};

type FlujoRow = {
  categoria: string;
  concepto: string;
  monto: number;
  orden: number;
};

type CapitalRow = {
  concepto: string;
  monto: number;
  orden: number;
};

type CapitalDetalleRow = {
  fecha: string;
  asiento_id: number;
  numero_formato: string;
  descripcion: string;
  clasificacion: string;
  monto: number;
};

type BalanceRow = {
  cuenta: string;
  nombre: string;
  tipo: string;
  saldo: number;
};

type ErRow = {
  tipo: string;
  nombre?: string;
  neto: number;
};

type EeffUtilidadNetaRow = {
  utilidad_antes_impuesto: number;
  impuesto_usado: number;
  utilidad_neta: number;
  fuente_impuesto: string;
};

type RatioRow = {
  codigo: string;
  nombre: string;
  formula: string;
  valor: number | null;
  formato: 'ratio' | 'percent';
  estado: 'ok' | 'warn' | 'risk' | 'na';
  lectura: string;
};

const capitalConceptoLabel = (concepto: string) => {
  const key = String(concepto || '').toUpperCase();
  if (key.includes('CAPITAL INICIAL')) return 'Capital inicial';
  if (key.includes('UTILIDAD NETA DEL PERIODO') || key.includes('UTILIDAD DEL PERIODO')) return 'Resultado del periodo';
  if (key.includes('MOVIMIENTOS DIRECTOS')) return 'Aportes / retiros / dividendos';
  if (key.includes('AJUSTE CONCILIACION')) return 'Partidas no clasificadas';
  if (key.includes('CAPITAL FINAL')) return 'Capital final';
  return concepto;
};

const flujoConceptoLabel = (concepto: string) => {
  const key = String(concepto || '').toUpperCase();
  if (key.includes('AJUSTE DE CLASIFICACION')) return 'Partidas no clasificadas';
  return concepto;
};

const capitalClasificacionLabel = (clasificacion: string) => {
  const key = String(clasificacion || '').toUpperCase();
  if (key === 'APORTE') return 'Aporte de socios';
  if (key === 'RETIRO') return 'Retiro de socios';
  if (key === 'DIVIDENDO') return 'Dividendo';
  if (key === 'MOVIMIENTO_CAPITAL') return 'Movimiento de capital';
  if (key === 'OTRO_CAPITAL') return 'Otro movimiento de capital';
  if (key === 'CIERRE_RESULTADOS') return 'Cierre de resultados';
  return clasificacion;
};

export default function EstadosFinancieros({
  empresaId,
  onVerMovimientos,
  onVerAsientoCierre,
}: {
  empresaId: number;
  onVerMovimientos?: (payload: { cuenta: string; nombre?: string; desde: string; hasta: string; moneda: 'CRC' | 'USD'; origen?: 'balancecomprobacion' | 'estadoderesultados' | 'balancesituacion' }) => void;
  onVerAsientoCierre?: (asientoId: number) => void;
}) {
  const EPSILON = 0.01;
  const DEFAULT_AJUSTE_UMBRAL = 10000;
  const [tab, setTab] = useState<EeffTab>('balancesituacion');
  const today = new Date();
  const [fechaDesde, setFechaDesde] = useState(`${today.getFullYear()}-01-01`);
  const [fechaHasta, setFechaHasta] = useState(today.toISOString().slice(0, 10));
  const [moneda, setMoneda] = useState<'CRC' | 'USD'>('CRC');
  const [ctx, setCtx] = useState<EeffContext | null>(null);
  const [ctxError, setCtxError] = useState('');
  const [flujo, setFlujo] = useState<FlujoRow[]>([]);
  const [flujoLoading, setFlujoLoading] = useState(false);
  const [flujoError, setFlujoError] = useState('');
  const [capitalRows, setCapitalRows] = useState<CapitalRow[]>([]);
  const [capitalLoading, setCapitalLoading] = useState(false);
  const [capitalError, setCapitalError] = useState('');
  const [capitalDetalleRows, setCapitalDetalleRows] = useState<CapitalDetalleRow[]>([]);
  const [razonesRows, setRazonesRows] = useState<RatioRow[]>([]);
  const [razonesLoading, setRazonesLoading] = useState(false);
  const [razonesError, setRazonesError] = useState('');
  const [ajusteUmbral, setAjusteUmbral] = useState<number>(DEFAULT_AJUSTE_UMBRAL);
  const tabOptions: { value: EeffTab; label: string }[] = [
    { value: 'balancesituacion', label: 'Balance de Situacion' },
    { value: 'estadoderesultados', label: 'Estado de Resultados' },
    { value: 'flujoefectivo', label: 'Flujo de Efectivo' },
    { value: 'capital', label: 'Estado de Capital' },
    { value: 'razones', label: 'Razones Financieras' },
  ];

  const toMoney = (n: number) =>
    `${moneda === 'USD' ? '$' : '¢'} ${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatRatioValue = (r: RatioRow) => {
    if (r.valor === null) return 'N/A atipico';
    if (r.formato === 'percent') {
      return `${(Number(r.valor) * 100).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    }
    return Number(r.valor).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const cargarContexto = async () => {
    setCtxError('');
    const { data, error } = await supabase.rpc('get_eeff_contexto', {
      p_empresa_id: empresaId,
      p_fecha_hasta: fechaHasta || null,
    });
    if (error) {
      setCtx(null);
      setCtxError(error.message || 'No se pudo cargar contexto EEFF.');
      return;
    }
    setCtx((data || [])[0] || null);
  };

  const cargarUmbralAjuste = async () => {
    const { data, error } = await supabase.rpc('get_empresa_parametros', {
      p_empresa_id: empresaId,
    });
    if (error) {
      setAjusteUmbral(DEFAULT_AJUSTE_UMBRAL);
      return;
    }
    const raw = Number((data as any)?.varios?.eeff_umbral_alerta_conciliacion);
    if (Number.isFinite(raw) && raw > 0) {
      setAjusteUmbral(raw);
      return;
    }
    setAjusteUmbral(DEFAULT_AJUSTE_UMBRAL);
  };

  const cargarFlujo = async () => {
    if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
      setFlujoError('Rango de fechas invalido para flujo.');
      return;
    }
    setFlujoLoading(true);
    setFlujoError('');
    const { data, error } = await supabase.rpc('get_eeff_flujo_efectivo_indirecto', {
      p_empresa_id: empresaId,
      p_fecha_desde: fechaDesde,
      p_fecha_hasta: fechaHasta,
      p_moneda: moneda,
    });
    if (error) {
      setFlujo([]);
      setFlujoError(error.message || 'No se pudo cargar flujo de efectivo.');
      setFlujoLoading(false);
      return;
    }
    setFlujo((data || []) as FlujoRow[]);
    setFlujoLoading(false);
  };

  const cargarCapital = async () => {
    if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
      setCapitalError('Rango de fechas invalido para estado de capital.');
      return;
    }
    setCapitalLoading(true);
    setCapitalError('');
    const [resMain, resDet] = await Promise.all([
      supabase.rpc('get_eeff_estado_cambios_capital', {
        p_empresa_id: empresaId,
        p_fecha_desde: fechaDesde,
        p_fecha_hasta: fechaHasta,
        p_moneda: moneda,
      }),
      supabase.rpc('get_eeff_movimientos_capital_detalle', {
        p_empresa_id: empresaId,
        p_fecha_desde: fechaDesde,
        p_fecha_hasta: fechaHasta,
        p_moneda: moneda,
      }),
    ]);

    if (resMain.error) {
      setCapitalRows([]);
      setCapitalDetalleRows([]);
      setCapitalError(resMain.error.message || 'No se pudo cargar estado de capital.');
      setCapitalLoading(false);
      return;
    }
    if (resDet.error) {
      setCapitalRows((resMain.data || []) as CapitalRow[]);
      setCapitalDetalleRows([]);
      setCapitalError(resDet.error.message || 'No se pudo cargar detalle de movimientos de capital.');
      setCapitalLoading(false);
      return;
    }

    setCapitalRows((resMain.data || []) as CapitalRow[]);
    setCapitalDetalleRows((resDet.data || []) as CapitalDetalleRow[]);
    setCapitalLoading(false);
  };

  const safeDiv = (num: number, den: number): number | null => {
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || Math.abs(den) < 0.000001) return null;
    return num / den;
  };

  const toKeyDigits = (cuenta: string) => String(cuenta || '').replace(/\D/g, '');

  const cargarRazones = async () => {
    if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
      setRazonesError('Rango de fechas invalido para razones financieras.');
      return;
    }
    setRazonesLoading(true);
    setRazonesError('');
    const [resBs, resEr, resErNeta] = await Promise.all([
      supabase.rpc('get_balance_situacion', {
        p_empresa_id: empresaId,
        p_fecha_hasta: fechaHasta,
        p_moneda: moneda,
      }),
      supabase.rpc('get_estado_resultados', {
        p_empresa_id: empresaId,
        p_fecha_desde: fechaDesde,
        p_fecha_hasta: fechaHasta,
        p_moneda: moneda,
      }),
      supabase.rpc('get_eeff_utilidad_neta', {
        p_empresa_id: empresaId,
        p_fecha_desde: fechaDesde,
        p_fecha_hasta: fechaHasta,
        p_moneda: moneda,
      }),
    ]);

    if (resBs.error) {
      setRazonesRows([]);
      setRazonesError(resBs.error.message || 'No se pudo cargar Balance para razones.');
      setRazonesLoading(false);
      return;
    }
    if (resEr.error) {
      setRazonesRows([]);
      setRazonesError(resEr.error.message || 'No se pudo cargar Estado de Resultados para razones.');
      setRazonesLoading(false);
      return;
    }
    if (resErNeta.error) {
      setRazonesRows([]);
      setRazonesError(resErNeta.error.message || 'No se pudo calcular utilidad neta para razones.');
      setRazonesLoading(false);
      return;
    }

    const bs = (resBs.data || []) as BalanceRow[];
    const er = (resEr.data || []) as ErRow[];
    const erNetaRow = Array.isArray(resErNeta.data) && resErNeta.data.length > 0
      ? (resErNeta.data[0] as EeffUtilidadNetaRow)
      : null;

    const activosTotal = bs.filter((r) => r.tipo === 'ACTIVO').reduce((a, r) => a + Number(r.saldo || 0), 0);
    const pasivosTotal = bs.filter((r) => r.tipo === 'PASIVO').reduce((a, r) => a + Number(r.saldo || 0), 0);
    const capitalTotal = bs.filter((r) => r.tipo === 'CAPITAL').reduce((a, r) => a + Number(r.saldo || 0), 0);

    const activosCorrientes = bs
      .filter((r) => r.tipo === 'ACTIVO' && toKeyDigits(r.cuenta).startsWith('01'))
      .reduce((a, r) => a + Number(r.saldo || 0), 0);
    const pasivosCorrientes = bs
      .filter((r) => r.tipo === 'PASIVO' && toKeyDigits(r.cuenta).startsWith('02'))
      .reduce((a, r) => a + Number(r.saldo || 0), 0);
    const inventarios = bs
      .filter((r) => r.tipo === 'ACTIVO' && String(r.nombre || '').toUpperCase().includes('INVENTAR'))
      .reduce((a, r) => a + Number(r.saldo || 0), 0);

    const ingresos = er.filter((r) => r.tipo === 'INGRESO').reduce((a, r) => a + Number(r.neto || 0), 0);
    const utilidadNeta = Number(erNetaRow?.utilidad_neta ?? 0);

    const rowsBase: Omit<RatioRow, 'estado'>[] = [
      {
        codigo: 'LIQ_CORR',
        nombre: 'Liquidez corriente',
        formula: 'Activo corriente / Pasivo corriente',
        valor: safeDiv(activosCorrientes, pasivosCorrientes),
        formato: 'ratio',
        lectura: 'Capacidad de cubrir obligaciones de corto plazo.',
      },
      {
        codigo: 'PRUEBA_ACIDA',
        nombre: 'Prueba acida',
        formula: '(Activo corriente - Inventarios) / Pasivo corriente',
        valor: safeDiv(activosCorrientes - inventarios, pasivosCorrientes),
        formato: 'ratio',
        lectura: 'Liquidez inmediata sin depender de inventario.',
      },
      {
        codigo: 'END',
        nombre: 'Endeudamiento',
        formula: 'Pasivo total / Activo total',
        valor: safeDiv(pasivosTotal, activosTotal),
        formato: 'percent',
        lectura: 'Porción de activos financiada con deuda.',
      },
      {
        codigo: 'DEUDA_CAP',
        nombre: 'Deuda a patrimonio',
        formula: 'Pasivo total / Patrimonio',
        valor: safeDiv(pasivosTotal, capitalTotal),
        formato: 'ratio',
        lectura: 'Relación entre deuda y capital propio.',
      },
      {
        codigo: 'MARGEN_NETO',
        nombre: 'Margen neto',
        formula: 'Utilidad neta / Ingresos',
        valor: safeDiv(utilidadNeta, ingresos),
        formato: 'percent',
        lectura: 'Ganancia neta por cada colón vendido.',
      },
      {
        codigo: 'ROA',
        nombre: 'ROA',
        formula: 'Utilidad neta / Activo total',
        valor: safeDiv(utilidadNeta, activosTotal),
        formato: 'percent',
        lectura: 'Rentabilidad sobre activos.',
      },
      {
        codigo: 'ROE',
        nombre: 'ROE',
        formula: 'Utilidad neta / Patrimonio',
        valor: safeDiv(utilidadNeta, capitalTotal),
        formato: 'percent',
        lectura: 'Rentabilidad sobre patrimonio.',
      },
    ];

    const rows: RatioRow[] = rowsBase.map((r) => {
      if (r.valor === null) {
        return { ...r, estado: 'na', lectura: `${r.lectura} Dato atipico: denominador <= 0.` };
      }
      const v = Number(r.valor);
      if (r.codigo === 'LIQ_CORR') {
        if (v >= 1.2) return { ...r, estado: 'ok' };
        if (v >= 1.0) return { ...r, estado: 'warn' };
        return { ...r, estado: 'risk' };
      }
      if (r.codigo === 'PRUEBA_ACIDA') {
        if (v >= 1.0) return { ...r, estado: 'ok' };
        if (v >= 0.8) return { ...r, estado: 'warn' };
        return { ...r, estado: 'risk' };
      }
      if (r.codigo === 'END') {
        if (v <= 0.6) return { ...r, estado: 'ok' };
        if (v <= 0.75) return { ...r, estado: 'warn' };
        return { ...r, estado: 'risk' };
      }
      if (r.codigo === 'DEUDA_CAP') {
        if (v <= 1.0) return { ...r, estado: 'ok' };
        if (v <= 1.5) return { ...r, estado: 'warn' };
        return { ...r, estado: 'risk' };
      }
      if (r.codigo === 'MARGEN_NETO') {
        if (v >= 0.10) return { ...r, estado: 'ok' };
        if (v >= 0.05) return { ...r, estado: 'warn' };
        return { ...r, estado: 'risk' };
      }
      if (r.codigo === 'ROA') {
        if (v >= 0.08) return { ...r, estado: 'ok' };
        if (v >= 0.03) return { ...r, estado: 'warn' };
        return { ...r, estado: 'risk' };
      }
      if (r.codigo === 'ROE') {
        if (v >= 0.12) return { ...r, estado: 'ok' };
        if (v >= 0.06) return { ...r, estado: 'warn' };
        return { ...r, estado: 'risk' };
      }
      return { ...r, estado: 'warn' };
    });

    setRazonesRows(rows);
    setRazonesLoading(false);
  };

  const exportExcelRazones = async () => {
    const company =
      (typeof window !== 'undefined' ? localStorage.getItem('mya_report_company_name') : '') ||
      `Empresa ${empresaId}`;

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Razones Financieras', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });

    ws.columns = [
      { key: 'ind', width: 26 },
      { key: 'for', width: 34 },
      { key: 'val', width: 16 },
      { key: 'sem', width: 14 },
      { key: 'lec', width: 50 },
    ];

    ws.mergeCells('A1:E1');
    ws.getCell('A1').value = company;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:E2');
    ws.getCell('A2').value = 'Razones Financieras';
    ws.getCell('A2').font = { bold: true, size: 13 };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.mergeCells('A3:E3');
    ws.getCell('A3').value = `Rango ${fechaDesde} a ${fechaHasta} - ${moneda}`;
    ws.getCell('A3').font = { italic: true, size: 10 };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    ws.getRow(5).values = ['Indicador', 'Formula', 'Valor', 'Semaforo', 'Lectura'];
    ws.getRow(5).font = { bold: true };
    ws.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

    let idx = 6;
    razonesRows.forEach((r) => {
      const row = ws.getRow(idx);
      row.getCell(1).value = r.nombre;
      row.getCell(2).value = r.formula;
      row.getCell(4).value = r.estado === 'ok' ? 'VERDE' : r.estado === 'warn' ? 'AMARILLO' : r.estado === 'risk' ? 'ROJO' : 'ATIPICO';
      row.getCell(5).value = r.lectura;
      row.getCell(3).alignment = { horizontal: 'right' };

      if (r.valor === null) {
        row.getCell(3).value = 'N/A';
      } else {
        row.getCell(3).value = Number(r.valor);
        row.getCell(3).numFmt = r.formato === 'percent' ? '0.00%' : '0.00';
      }

      if (r.estado === 'ok') row.getCell(4).font = { bold: true, color: { argb: 'FF166534' } };
      if (r.estado === 'warn') row.getCell(4).font = { bold: true, color: { argb: 'FF92400E' } };
      if (r.estado === 'risk') row.getCell(4).font = { bold: true, color: { argb: 'FF991B1B' } };
      if (r.estado === 'na') row.getCell(4).font = { bold: true, color: { argb: 'FF334155' } };
      idx += 1;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `razones_financieras_${empresaId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtDate = (iso: string) => {
    const [y, m, d] = String(iso || '').split('-');
    if (!y || !m || !d) return iso || '';
    return `${d}/${m}/${y}`;
  };

  const flujoRowsView = flujo.filter((r) => {
    const key = String(r.concepto || '').toUpperCase();
    const isAjuste = key.includes('AJUSTE DE CLASIFICACION');
    return !isAjuste || Math.abs(Number(r.monto || 0)) > EPSILON;
  });

  const capitalRowsView = capitalRows.filter((r) => {
    const key = String(r.concepto || '').toUpperCase();
    const isAjuste = key.includes('AJUSTE CONCILIACION');
    return !isAjuste || Math.abs(Number(r.monto || 0)) > EPSILON;
  });

  useEffect(() => {
    cargarContexto();
  }, [empresaId, fechaHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarUmbralAjuste();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'flujoefectivo') {
      cargarFlujo();
    }
    if (tab === 'capital') {
      cargarCapital();
    }
    if (tab === 'razones') {
      cargarRazones();
    }
  }, [tab, empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="eeff-wrap">
      <style>{styles}</style>
      <div className="eeff-title">Estados Financieros (EEFF)</div>
      <div className="eeff-bar">
        <input className="eeff-input" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        <input className="eeff-input" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        <select className="eeff-input" value={moneda} onChange={(e) => setMoneda(e.target.value as 'CRC' | 'USD')}>
          <option value="CRC">CRC</option>
          <option value="USD">USD</option>
        </select>
        <select className="eeff-input" value={tab} onChange={(e) => setTab(e.target.value as EeffTab)}>
          {tabOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button className="eeff-btn" onClick={() => { cargarContexto(); if (tab === 'flujoefectivo') cargarFlujo(); if (tab === 'capital') cargarCapital(); if (tab === 'razones') cargarRazones(); }}>
          Actualizar
        </button>
        <div>
          {ctx ? (
            <span className={`eeff-chip ${ctx.es_preliminar ? 'preliminar' : 'oficial'}`}>
              {ctx.es_preliminar ? 'PRELIMINAR' : 'OFICIAL CERRADO'}
            </span>
          ) : null}
          {ctx ? (
            <div style={{ fontSize: 11, color: '#8ea3c7', marginTop: 6 }}>
              {ctx.es_preliminar
                ? 'Preliminar: el periodo aun esta abierto y puede cambiar.'
                : 'Oficial cerrado: cifras finales del periodo cerrado.'}
            </div>
          ) : null}
          {ctxError ? <div className="eeff-error">{ctxError}</div> : null}
        </div>
      </div>

      {tab === 'balancesituacion' && (
        <BalanceSituacion
          empresaId={empresaId}
          onVerMovimientos={onVerMovimientos}
          filtrosExternos={{ hasta: fechaHasta, moneda }}
        />
      )}
      {tab === 'estadoderesultados' && (
        <EstadoResultados
          empresaId={empresaId}
          onVerMovimientos={onVerMovimientos}
          onVerAsientoCierre={onVerAsientoCierre}
          filtrosExternos={{ desde: fechaDesde, hasta: fechaHasta, moneda }}
        />
      )}
      {tab === 'flujoefectivo' && (
        <>
          <div className="eeff-note" style={{ marginBottom: 10 }}>
            <h4>Flujo de Efectivo (Metodo indirecto base)</h4>
            <p>Vista base de conciliacion: utilidad neta, variacion de efectivo y ajuste de clasificacion.</p>
          </div>
          <div className="eeff-table-wrap">
            <table className="eeff-table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Categoria</th>
                  <th>Concepto</th>
                  <th style={{ width: '22%' }} className="eeff-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {flujoLoading ? (
                  <tr><td colSpan={3}>Cargando...</td></tr>
                ) : flujoRowsView.length === 0 ? (
                  <tr><td colSpan={3}>Sin datos para el rango</td></tr>
                ) : (
                  flujoRowsView.map((r) => {
                    const key = String(r.concepto || '').toUpperCase();
                    const isAjuste = key.includes('AJUSTE DE CLASIFICACION');
                    const warn = isAjuste && Math.abs(Number(r.monto || 0)) > ajusteUmbral;
                    return (
                    <tr key={`${r.orden}-${r.concepto}`} className={warn ? 'eeff-row-warn' : ''}>
                      <td>{r.categoria}</td>
                      <td>{flujoConceptoLabel(r.concepto)}</td>
                      <td className="eeff-right">{toMoney(Number(r.monto || 0))}</td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
          {flujoError ? <div className="eeff-error">{flujoError}</div> : null}
        </>
      )}
      {tab === 'capital' && (
        <>
          <div className="eeff-note" style={{ marginBottom: 10 }}>
            <h4>Estado de Cambios en el Capital (base)</h4>
            <p>Presenta saldo inicial, utilidad del periodo, movimientos directos y saldo final de capital.</p>
          </div>
          <div className="eeff-table-wrap">
            <table className="eeff-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th style={{ width: '26%' }} className="eeff-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {capitalLoading ? (
                  <tr><td colSpan={2}>Cargando...</td></tr>
                ) : capitalRowsView.length === 0 ? (
                  <tr><td colSpan={2}>Sin datos para el rango</td></tr>
                ) : (
                  capitalRowsView.map((r) => {
                    const key = String(r.concepto || '').toUpperCase();
                    const isAjuste = key.includes('AJUSTE CONCILIACION');
                    const warn = isAjuste && Math.abs(Number(r.monto || 0)) > ajusteUmbral;
                    return (
                    <tr key={`${r.orden}-${r.concepto}`} className={warn ? 'eeff-row-warn' : ''}>
                      <td>{capitalConceptoLabel(r.concepto)}</td>
                      <td className="eeff-right">{toMoney(Number(r.monto || 0))}</td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
          <div className="eeff-note" style={{ margin: '10px 0 8px' }}>
            <h4>Detalle de movimientos directos de capital</h4>
            <p>Incluye asientos de capital del rango (excluye asientos de cierre CER-*) para trazabilidad.</p>
          </div>
          <div className="eeff-table-wrap">
            <table className="eeff-table">
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>Fecha</th>
                  <th style={{ width: '12%' }}>Asiento</th>
                  <th style={{ width: '14%' }}>Numero</th>
                  <th>Descripcion</th>
                  <th style={{ width: '16%' }}>Clasificacion</th>
                  <th style={{ width: '16%' }} className="eeff-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {capitalLoading ? (
                  <tr><td colSpan={6}>Cargando...</td></tr>
                ) : capitalDetalleRows.length === 0 ? (
                  <tr><td colSpan={6}>Sin movimientos directos en el rango</td></tr>
                ) : (
                  capitalDetalleRows.map((r) => (
                    <tr key={`${r.asiento_id}-${r.fecha}-${r.clasificacion}`}>
                      <td>{fmtDate(r.fecha)}</td>
                      <td>{r.asiento_id}</td>
                      <td>{r.numero_formato || '-'}</td>
                      <td>{r.descripcion || '-'}</td>
                      <td>{capitalClasificacionLabel(r.clasificacion)}</td>
                      <td className="eeff-right">{toMoney(Number(r.monto || 0))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {capitalError ? <div className="eeff-error">{capitalError}</div> : null}
        </>
      )}
      {tab === 'razones' && (
        <>
          <div className="eeff-note" style={{ marginBottom: 10 }}>
            <div className="eeff-note-head">
              <h4>Razones Financieras</h4>
              <button className="eeff-export-btn" onClick={exportExcelRazones} disabled={razonesRows.length === 0}>
                EXCEL
              </button>
            </div>
            <p>Indicadores calculados con Balance de Situacion al corte y Estado de Resultados del rango.</p>
          </div>
          <div className="eeff-table-wrap">
            <table className="eeff-table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Indicador</th>
                  <th style={{ width: '27%' }}>Formula</th>
                  <th style={{ width: '16%' }} className="eeff-right">Valor</th>
                  <th style={{ width: '13%' }}>Semaforo</th>
                  <th>Lectura</th>
                </tr>
              </thead>
              <tbody>
                {razonesLoading ? (
                  <tr><td colSpan={5}>Cargando...</td></tr>
                ) : razonesRows.length === 0 ? (
                  <tr><td colSpan={5}>Sin datos para el rango</td></tr>
                ) : (
                  razonesRows.map((r) => (
                    <tr key={r.codigo}>
                      <td>{r.nombre}</td>
                      <td>{r.formula}</td>
                      <td className="eeff-right">{formatRatioValue(r)}</td>
                      <td><span className={`eeff-badge ${r.estado}`}>{r.estado === 'ok' ? 'Verde' : r.estado === 'warn' ? 'Amarillo' : r.estado === 'risk' ? 'Rojo' : 'Atipico'}</span></td>
                      <td>{r.lectura}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {razonesError ? <div className="eeff-error">{razonesError}</div> : null}
        </>
      )}
    </div>
  );
}





