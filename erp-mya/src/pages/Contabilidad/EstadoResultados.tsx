import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, ReportColumn, roundMoney, sumMoney } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';
import ExcelJS from 'exceljs';

interface RowEstado {
  cuenta: string;
  nombre: string;
  tipo: 'INGRESO' | 'COSTO' | 'GASTO' | string;
  nivel: number;
  debe: number;
  haber: number;
  neto: number;
}

interface ErStatementLine {
  kind: 'section' | 'detail' | 'subtotal' | 'result';
  label: string;
  amount: number | null;
  row?: RowEstado;
}

interface ImpuestoRentaDetalle {
  empresa_id: number;
  anio: number;
  tipo_contribuyente: string;
  regimen_codigo: string | null;
  utilidad_gravable: number;
  ingreso_bruto_anual: number | null;
  tope_ingreso_bruto: number | null;
  metodo: string;
  tasa_plana: number;
  impuesto_calculado: number;
}

interface ImpuestoRentaEscalonadoRow {
  empresa_id: number;
  anio: number;
  tipo_contribuyente: string;
  regimen_codigo: string | null;
  tramo_orden: number;
  desde: number;
  hasta: number | null;
  tasa: number;
  base_tramo: number;
  impuesto_tramo: number;
  impuesto_acumulado: number;
}

const styles = `
  .er-wrap { padding:0; color:#d6e2ff; }
  .er-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:14px; }
  .er-grid { display:grid; grid-template-columns:170px 170px 120px 90px auto 1fr; gap:10px; margin-bottom:14px; }
  .er-input { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; outline:none; background:#1d2738; color:#f3f7ff; }
  .er-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .er-btn { padding:10px 14px; border-radius:10px; border:none; font-size:13px; font-weight:700; cursor:pointer; color:#fff; background:linear-gradient(135deg,#17a34a,#22c55e); box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .er-toolbar { margin-bottom:10px; }
  .er-export-btn { padding:8px 13px; border-radius:11px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; color:#d6e2ff; font-size:12px; font-weight:700; cursor:pointer; }
  .er-export-btn:hover { border-color:#4c7bf7; color:#ffffff; background:#243149; }
  .er-cards { display:grid; grid-template-columns:repeat(4,minmax(160px,1fr)); gap:10px; margin-bottom:12px; }
  .er-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px 14px; box-shadow:0 16px 28px rgba(3,8,20,.16); }
  .er-card-num { font-size:18px; font-weight:700; font-family:'DM Mono',monospace; }
  .er-card-lbl { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.04em; }
  .er-card.ing .er-card-num { color:#16a34a; }
  .er-card.cos .er-card-num { color:#b45309; }
  .er-card.gas .er-card-num { color:#dc2626; }
  .er-card.utl .er-card-num { color:#1d4ed8; }
  .er-card.utl.neg .er-card-num { color:#dc2626; }
  .er-card-wrap { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; overflow-x:auto; overflow-y:hidden; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .er-tax-box { margin-bottom:10px; background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px 14px; }
  .er-tax-head { font-size:12px; font-weight:700; color:#f3f7ff; margin-bottom:6px; }
  .er-tax-grid { display:grid; grid-template-columns:repeat(5,minmax(140px,1fr)); gap:8px; }
  .er-tax-kv { background:#1d2738; border:1px solid rgba(137,160,201,0.18); border-radius:10px; padding:8px 9px; }
  .er-tax-k { font-size:10px; text-transform:uppercase; color:#8ea3c7; margin-bottom:2px; letter-spacing:.03em; }
  .er-tax-v { font-size:12px; color:#f3f7ff; font-weight:700; word-break:break-word; }
  .er-tax-v.money { font-family:'DM Mono',monospace; }
  .er-tax-note { margin-top:6px; font-size:11px; color:#8ea3c7; }
  .er-tax-table-wrap { margin-top:8px; border:1px solid rgba(137,160,201,0.18); border-radius:10px; background:#172131; overflow:auto; }
  .er-tax-table { width:100%; min-width:680px; border-collapse:collapse; table-layout:fixed; }
  .er-tax-table th { background:#131b2a; color:#8ea3c7; font-size:11px; text-transform:uppercase; letter-spacing:.03em; padding:8px 9px; text-align:left; }
  .er-tax-table td { border-top:1px solid rgba(137,160,201,0.12); padding:8px 9px; font-size:12px; color:#d6e2ff; }
  .er-tax-table .num { text-align:right; font-family:'DM Mono',monospace; }
  .er-tax-table tfoot td { background:#123224; color:#9df4c7; font-weight:800; }
  .er-table { width:100%; min-width:980px; border-collapse:collapse; table-layout:fixed; }
  .er-table th { background:#131b2a; padding:9px 10px; font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; text-align:left; }
  .er-table td { padding:8px 10px; font-size:12px; color:#d6e2ff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .er-right { text-align:right !important; }
  .er-money { font-family:'DM Mono',monospace; }
  .er-row-n1 td { background:#1f3158; color:#edf4ff; }
  .er-row-n2 td { background:#2d2854; color:#efe9ff; }
  .er-row-n3 td { background:#183d3c; color:#e6fffb; }
  .er-row-n4 td { background:#3a302d; color:#fff3eb; }
  .er-row-n5 td { background:#243043; color:#d6e2ff; }
  .er-chip { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:22px; border-radius:999px; font-size:11px; font-weight:700; font-family:'DM Mono',monospace; background:#4b5d79; color:#e2e8f0; }
  .er-tag { display:inline-flex; align-items:center; font-size:11px; font-weight:700; font-family:'DM Mono',monospace; }
  .er-tag.INGRESO { color:#86efac; }
  .er-tag.COSTO { color:#fdba74; }
  .er-tag.GASTO { color:#fda4af; }
  .er-link-btn { padding:6px 10px; border-radius:9px; border:1px solid rgba(76,123,247,0.34); background:#243149; color:#9ec3ff; font-size:11px; font-weight:700; cursor:pointer; }
  .er-total td { background:#123224; color:#9df4c7; font-weight:700; }
  .er-fin-wrap { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; overflow:hidden; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .er-fin-table { width:100%; border-collapse:collapse; table-layout:fixed; }
  .er-fin-table th { background:#131b2a; padding:9px 6px; font-size:12px; color:#8ea3c7; text-align:left; }
  .er-fin-table td { padding:8px 6px; border-top:1px solid rgba(137,160,201,0.12); font-size:13px; color:#d6e2ff; }
  .er-fin-table td:first-child { padding-left:10px; }
  .er-fin-right { text-align:right; font-family:'DM Mono',monospace; padding-right:8px; }
  .er-fin-section td { font-weight:800; text-decoration:underline; background:#1d2738; color:#f8fbff; }
  .er-fin-subtotal td { font-weight:800; }
  .er-fin-subtotal td:nth-child(3) { border-top:1px solid #d6e2ff; border-bottom:1px solid #d6e2ff; }
  .er-fin-result td { font-weight:900; }
  .er-fin-result td:nth-child(3) { border-top:1px solid #d6e2ff; border-bottom:3px double #d6e2ff; }
  .er-fin-transfer td:nth-child(2) { border-bottom:2px solid #d6e2ff; }
  .er-fin-no-top-total td:nth-child(3) { border-top:none !important; }
  .er-empty { padding:24px; text-align:center; color:#8ea3c7; font-size:13px; }
  .er-error { margin-bottom:10px; background:#34181c; border:1px solid #7d2f3a; color:#ffb3bb; border-radius:12px; padding:10px 12px; font-size:12px; }
  .er-modal-backdrop { position:fixed; inset:0; z-index:60; background:rgba(3,8,20,.68); display:flex; align-items:center; justify-content:center; padding:16px; }
  .er-modal { width:min(560px,100%); background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; box-shadow:0 24px 45px rgba(2,6,23,.36); overflow:hidden; }
  .er-modal-head { padding:12px 14px; background:#131b2a; border-bottom:1px solid rgba(137,160,201,0.16); font-size:16px; font-weight:700; color:#f3f7ff; }
  .er-modal-body { padding:14px; font-size:13px; color:#d6e2ff; line-height:1.45; }
  .er-modal-actions { padding:12px 14px; border-top:1px solid rgba(137,160,201,0.16); display:flex; justify-content:flex-end; gap:8px; }
  .er-btn-secondary { padding:9px 14px; border-radius:10px; border:1px solid rgba(137,160,201,0.18); background:#243149; font-size:13px; font-weight:700; color:#d6e2ff; cursor:pointer; }
  .er-btn-secondary:hover { border-color:#4c7bf7; color:#ffffff; background:#2b3a53; }
`;

const toMoney = (n: number, moneda: 'CRC' | 'USD') =>
  `${moneda === 'USD' ? '$' : '₡'} ${roundMoney(n, 2).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const approxZero = (n: number) => Math.abs(Number(n || 0)) < 0.000001;
const formatCodeLabel = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  return raw
    .toLowerCase()
    .split('_')
    .map((w) => (w ? `${w[0].toUpperCase()}${w.slice(1)}` : ''))
    .join(' ');
};

const formatTipoContribuyente = (value: string | null | undefined) => {
  if (value === 'persona_fisica') return 'Persona fisica';
  if (value === 'persona_juridica') return 'Persona juridica';
  return formatCodeLabel(value);
};

const formatRegimen = (value: string | null | undefined) => {
  if (!value) return '-';
  if (value === 'PERSONA_FISICA_LUCRATIVA') return 'Persona fisica lucrativa';
  if (value === 'PERSONA_JURIDICA_PYME') return 'Persona juridica PYME';
  if (value === 'ASALARIADO_JUBILADO') return 'Asalariado / Jubilado';
  return formatCodeLabel(value);
};

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

export default function EstadoResultados({
  empresaId,
  onVerMovimientos,
  onVerAsientoCierre,
  filtrosExternos,
}: {
  empresaId: number;
  onVerMovimientos?: (payload: { cuenta: string; nombre?: string; desde: string; hasta: string; moneda: 'CRC' | 'USD'; origen?: 'balancecomprobacion' | 'estadoderesultados' }) => void;
  onVerAsientoCierre?: (asientoId: number) => void;
  filtrosExternos?: { desde: string; hasta: string; moneda: 'CRC' | 'USD' };
}) {
  const today = new Date();
  const [desde, setDesde] = useState(filtrosExternos?.desde || `${today.getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(filtrosExternos?.hasta || today.toISOString().slice(0, 10));
  const [moneda, setMoneda] = useState<'CRC' | 'USD'>(filtrosExternos?.moneda || 'CRC');
  const filtroDesde = filtrosExternos?.desde;
  const filtroHasta = filtrosExternos?.hasta;
  const filtroMoneda = filtrosExternos?.moneda;
  const [nivelVista, setNivelVista] = useState(5);
  const [rowsBase, setRowsBase] = useState<RowEstado[]>([]);
  const [catalogoNombre, setCatalogoNombre] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [closeMsg, setCloseMsg] = useState('');
  const [closeAsientoId, setCloseAsientoId] = useState<number | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [impuestoDetalle, setImpuestoDetalle] = useState<ImpuestoRentaDetalle | null>(null);
  const [impuestoEscalonado, setImpuestoEscalonado] = useState<ImpuestoRentaEscalonadoRow[]>([]);
  const [impuestoDetalleLoading, setImpuestoDetalleLoading] = useState(false);
  const [impuestoDetalleError, setImpuestoDetalleError] = useState('');
  const reqRef = useRef(0);

  const formatIsoDate = (value: string) => {
    const [y, m, d] = String(value || '').split('-');
    if (!y || !m || !d) return value;
    return `${d}/${m}/${y}`;
  };

  const cargar = async () => {
    if (desde && hasta && desde > hasta) {
      setError('Rango de fechas invalido: "Desde" no puede ser mayor que "Hasta".');
      setRowsBase([]);
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('get_estado_resultados', {
      p_empresa_id: empresaId,
      p_fecha_desde: desde || null,
      p_fecha_hasta: hasta || null,
      p_moneda: moneda,
    });
    if (reqId !== reqRef.current) return;
    if (rpcError) {
      setError(rpcError.message || 'No se pudo cargar el Estado de Resultados');
      setRowsBase([]);
    } else {
      setRowsBase((data || []) as RowEstado[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => cargar(), 350);
    return () => clearTimeout(t);
  }, [empresaId, desde, hasta, moneda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!filtroDesde || !filtroHasta || !filtroMoneda) return;
    setDesde(filtroDesde);
    setHasta(filtroHasta);
    setMoneda(filtroMoneda);
  }, [filtroDesde, filtroHasta, filtroMoneda]);

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
    const map = new Map<string, RowEstado>();
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
            debe: Number(r.debe || 0),
            haber: Number(r.haber || 0),
            neto: Number(r.neto || 0),
          });
        } else {
          prev.debe += Number(r.debe || 0);
          prev.haber += Number(r.haber || 0);
          prev.neto += Number(r.neto || 0);
        }
      }
    }
    return Array.from(map.values())
      .filter((r) => !(approxZero(r.debe) && approxZero(r.haber) && approxZero(r.neto)))
      .sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta)));
  }, [rowsBase, nivelVista, catalogoNombre]);

  const rowsNivel = useMemo(() => {
    const n = Math.max(1, Math.min(5, Number(nivelVista) || 5));
    return rows.filter((r) => Number(r.nivel) === n);
  }, [rows, nivelVista]);

  const ingresos = sumMoney(rowsNivel.filter((r) => r.tipo === 'INGRESO').map((r) => Number(r.neto || 0)), 2);
  const costos = sumMoney(rowsNivel.filter((r) => r.tipo === 'COSTO').map((r) => Number(r.neto || 0)), 2);
  const gastos = sumMoney(rowsNivel.filter((r) => r.tipo === 'GASTO').map((r) => Number(r.neto || 0)), 2);
  const utilidad = roundMoney(ingresos - costos - gastos, 2);

  const rowsIngreso = useMemo(
    () => rowsNivel.filter((r) => r.tipo === 'INGRESO').sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta))),
    [rowsNivel]
  );
  const rowsCosto = useMemo(
    () => rowsNivel.filter((r) => r.tipo === 'COSTO').sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta))),
    [rowsNivel]
  );
  const rowsGastoAll = useMemo(
    () => rowsNivel.filter((r) => r.tipo === 'GASTO').sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta))),
    [rowsNivel]
  );
  const rowsImpuesto = useMemo(
    () => rowsGastoAll.filter((r) => /IMPUESTO.*RENTA|RENTA/i.test(String(r.nombre || ''))),
    [rowsGastoAll]
  );
  const rowsGastoOper = useMemo(
    () => rowsGastoAll.filter((r) => !/IMPUESTO.*RENTA|RENTA/i.test(String(r.nombre || ''))),
    [rowsGastoAll]
  );

  const totalIngresos = sumMoney(rowsIngreso.map((r) => Number(r.neto || 0)), 2);
  const totalCostos = sumMoney(rowsCosto.map((r) => Number(r.neto || 0)), 2);
  const totalGastosOper = sumMoney(rowsGastoOper.map((r) => Number(r.neto || 0)), 2);
  const utilidadBruta = roundMoney(totalIngresos - totalCostos, 2);
  const utilidadAntesImpuesto = roundMoney(utilidadBruta - totalGastosOper, 2);
  const impuestoCalculadoDetalle = roundMoney(Number(impuestoDetalle?.impuesto_calculado || 0), 2);
  const totalImpuestoContable = sumMoney(rowsImpuesto.map((r) => Number(r.neto || 0)), 2);
  const totalImpuesto = rowsImpuesto.length > 0 ? totalImpuestoContable : impuestoCalculadoDetalle;
  const utilidadNetaFinal = roundMoney(utilidadAntesImpuesto - totalImpuesto, 2);

  useEffect(() => {
    let isCancelled = false;
    const loadImpuestoDetalle = async () => {
      setImpuestoDetalleError('');
      if (!empresaId || !hasta || utilidadAntesImpuesto <= 0) {
        setImpuestoDetalle(null);
        setImpuestoEscalonado([]);
        return;
      }
      setImpuestoDetalleLoading(true);
      const [resDetalle, resEscalonado] = await Promise.all([
        supabase.rpc('calcular_impuesto_renta_detalle', {
          p_empresa_id: empresaId,
          p_utilidad_gravable: utilidadAntesImpuesto,
          p_fecha_corte: hasta,
        }),
        supabase.rpc('calcular_impuesto_renta_escalonado', {
          p_empresa_id: empresaId,
          p_utilidad_gravable: utilidadAntesImpuesto,
          p_fecha_corte: hasta,
        }),
      ]);
      if (isCancelled) return;
      if (resDetalle.error) {
        setImpuestoDetalle(null);
        setImpuestoEscalonado([]);
        setImpuestoDetalleError(resDetalle.error.message || 'No se pudo calcular detalle de impuesto de renta.');
      } else {
        const row = Array.isArray(resDetalle.data) && resDetalle.data.length > 0 ? (resDetalle.data[0] as ImpuestoRentaDetalle) : null;
        setImpuestoDetalle(row);
        if (resEscalonado.error) {
          setImpuestoEscalonado([]);
        } else {
          setImpuestoEscalonado(Array.isArray(resEscalonado.data) ? (resEscalonado.data as ImpuestoRentaEscalonadoRow[]) : []);
        }
      }
      setImpuestoDetalleLoading(false);
    };
    loadImpuestoDetalle();
    return () => {
      isCancelled = true;
    };
  }, [empresaId, utilidadAntesImpuesto, hasta]);

  const statementLines = useMemo<ErStatementLine[]>(() => {
    const lines: ErStatementLine[] = [];
    lines.push({ kind: 'section', label: 'Ingresos', amount: null });
    rowsIngreso.forEach((r) => lines.push({ kind: 'detail', label: r.nombre, amount: Number(r.neto || 0), row: r }));
    lines.push({ kind: 'subtotal', label: 'Total de Ingresos', amount: totalIngresos });
    lines.push({ kind: 'section', label: 'Costos de Produccion y Ventas', amount: null });
    rowsCosto.forEach((r) => lines.push({ kind: 'detail', label: r.nombre, amount: Number(r.neto || 0), row: r }));
    lines.push({ kind: 'subtotal', label: 'Total Costo de Ventas', amount: totalCostos });
    lines.push({ kind: 'result', label: 'Utilidad Bruta', amount: utilidadBruta });
    lines.push({ kind: 'section', label: 'Gastos de Operacion', amount: null });
    rowsGastoOper.forEach((r) => lines.push({ kind: 'detail', label: r.nombre, amount: Number(r.neto || 0), row: r }));
    lines.push({ kind: 'subtotal', label: 'Total de Gastos de Operacion', amount: totalGastosOper });
    lines.push({ kind: 'result', label: 'Utilidad antes de Impuesto sobre la renta', amount: utilidadAntesImpuesto });
    if (rowsImpuesto.length > 0) {
      rowsImpuesto.forEach((r) => lines.push({ kind: 'detail', label: r.nombre, amount: Number(r.neto || 0), row: r }));
      lines.push({ kind: 'subtotal', label: 'Total Impuesto sobre la Renta', amount: totalImpuesto });
    } else if (impuestoCalculadoDetalle > 0) {
      lines.push({ kind: 'detail', label: 'Impuesto sobre la Renta (estimado)', amount: impuestoCalculadoDetalle });
      lines.push({ kind: 'subtotal', label: 'Total Impuesto sobre la Renta', amount: totalImpuesto });
    }
    lines.push({ kind: 'result', label: 'Utilidad Neta despues del Impuesto', amount: utilidadNetaFinal });
    return lines;
  }, [rowsIngreso, rowsCosto, rowsGastoOper, rowsImpuesto, totalIngresos, totalCostos, utilidadBruta, totalGastosOper, utilidadAntesImpuesto, totalImpuesto, utilidadNetaFinal, impuestoCalculadoDetalle]);

  const erExportRows = useMemo(() => statementLines.map((l) => ({
    rubro: l.label,
    subtotal: l.kind === 'detail' ? Number(l.amount || 0) : '',
    total: l.kind === 'subtotal' || l.kind === 'result' ? Number(l.amount || 0) : '',
    tipo: l.kind.toUpperCase(),
  })), [statementLines]);

  const erExportCols: ReportColumn<(typeof erExportRows)[number]>[] = [
    { key: 'rubro', title: 'Rubro', getValue: (r) => r.rubro, align: 'left', width: '55%' },
    { key: 'subtotal', title: `Subtotal (${moneda})`, getValue: (r) => r.subtotal, align: 'right', width: '15%' },
    { key: 'total', title: `Total (${moneda})`, getValue: (r) => r.total, align: 'right', width: '15%' },
    { key: 'tipo', title: 'Tipo', getValue: (r) => r.tipo, width: '15%' },
  ];

  const generarCierre = async () => {
    if (closing) return;
    if (!desde || !hasta) {
      setError('Defina fecha inicial y fecha final para generar el cierre.');
      return;
    }
    if (desde > hasta) {
      setError('Rango de fechas invalido: "Desde" no puede ser mayor que "Hasta".');
      return;
    }
    setShowCloseConfirm(true);
  };

  const confirmarGenerarCierre = async () => {
    if (closing) return;

    setClosing(true);
    setShowCloseConfirm(false);
    setError('');
    setCloseMsg('');
    setCloseAsientoId(null);

    const { data, error: rpcError } = await supabase.rpc('generar_cierre_estado_resultados', {
      p_empresa_id: empresaId,
      p_fecha_desde: desde,
      p_fecha_hasta: hasta,
      p_moneda: moneda,
    });

    if (rpcError) {
      setError(rpcError.message || 'No se pudo generar el cierre automatico.');
      setClosing(false);
      return;
    }

    const nuevoAsientoId = Number(data || 0);
    setCloseAsientoId(nuevoAsientoId > 0 ? nuevoAsientoId : null);
    setCloseMsg(`Cierre generado correctamente. Asiento ID: ${nuevoAsientoId}.`);
    await cargar();
    setClosing(false);
  };

  const exportExcelERFormato = async () => {
    const company =
      (typeof window !== 'undefined' ? localStorage.getItem('mya_report_company_name') : '') ||
      `Empresa ${empresaId}`;

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Estado Resultados', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    });
    ws.columns = [
      { key: 'rubro', width: 46 },
      { key: 'subtotal', width: 20 },
      { key: 'total', width: 20 },
    ];

    ws.mergeCells('A1:C1');
    ws.getCell('A1').value = company;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:C2');
    ws.getCell('A2').value = 'Estado de Resultados';
    ws.getCell('A2').font = { bold: true, size: 13 };
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.mergeCells('A3:C3');
    ws.getCell('A3').value = `Desde ${desde} hasta ${hasta} - ${moneda} - Nivel ${nivelVista}`;
    ws.getCell('A3').font = { italic: true, size: 10 };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    ws.getRow(4).getCell(1).value = 'Rubro';
    ws.getRow(4).getCell(2).value = 'Subtotal';
    ws.getRow(4).getCell(3).value = 'Total';
    ws.getRow(4).font = { bold: true };
    ws.getRow(4).alignment = { horizontal: 'center' };

    const moneyFmt = moneda === 'USD' ? '"$" #,##0.00;[Red]-"$" #,##0.00' : '"¢" #,##0.00;[Red]-"¢" #,##0.00';
    let rowNum = 5;
    statementLines.forEach((l, i) => {
      const next = statementLines[i + 1];
      const isTransferLine = l.kind === 'detail' && !!next && (next.kind === 'subtotal' || next.kind === 'result');
      const prev = statementLines[i - 1];
      const removeTopTotal = (l.kind === 'subtotal' || l.kind === 'result')
        && !!prev
        && prev.kind === 'detail';
      const row = ws.getRow(rowNum);
      row.getCell(1).value = l.label;
      row.getCell(2).value = l.kind === 'detail' ? Number(l.amount || 0) : null;
      row.getCell(3).value = l.kind === 'subtotal' || l.kind === 'result' ? Number(l.amount || 0) : null;
      row.getCell(2).alignment = { horizontal: 'right' };
      row.getCell(3).alignment = { horizontal: 'right' };
      row.getCell(2).numFmt = moneyFmt;
      row.getCell(3).numFmt = moneyFmt;
      if (l.kind === 'section') {
        row.getCell(1).font = { bold: true, underline: true };
      } else if (l.kind === 'subtotal') {
        row.getCell(1).font = { bold: true };
        row.getCell(3).font = { bold: true };
        row.getCell(3).border = removeTopTotal
          ? {}
          : { top: { style: 'thin', color: { argb: 'FF0F172A' } } };
      } else if (l.kind === 'result') {
        row.getCell(1).font = { bold: true };
        row.getCell(3).font = { bold: true };
        row.getCell(3).border = {
          ...(removeTopTotal ? {} : { top: { style: 'thin', color: { argb: 'FF0F172A' } } }),
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
        };
      }
      if (isTransferLine) {
        row.getCell(2).border = {
          bottom: { style: 'thin', color: { argb: 'FF0F172A' } },
        };
      }
      rowNum += 1;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estado_resultados_${empresaId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdfERFormato = () => {
    const company =
      (typeof window !== 'undefined' ? localStorage.getItem('mya_report_company_name') : '') ||
      `Empresa ${empresaId}`;

    const body = statementLines.map((l, i) => {
      const next = statementLines[i + 1];
      const isTransferLine = l.kind === 'detail' && !!next && (next.kind === 'subtotal' || next.kind === 'result');
      const prev = statementLines[i - 1];
      const removeTopTotal = (l.kind === 'subtotal' || l.kind === 'result')
        && !!prev
        && prev.kind === 'detail';
      return `
      <tr class="${l.kind}${isTransferLine ? ' transfer' : ''}${removeTopTotal ? ' no-top-total' : ''}">
        <td>${String(l.label || '')}</td>
        <td class="amt">${l.kind === 'detail' ? toMoney(Number(l.amount || 0), moneda) : ''}</td>
        <td class="amt total">${l.kind === 'subtotal' || l.kind === 'result' ? toMoney(Number(l.amount || 0), moneda) : ''}</td>
      </tr>
    `;
    }).join('');

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Estado de Resultados</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: Arial, sans-serif; margin:0; color:#0f172a; font-size:12px; }
    .head { text-align:center; margin-bottom:10px; }
    .brand { font-size:14px; font-weight:700; }
    .title { font-size:20px; font-weight:700; }
    .sub { font-size:11px; color:#475569; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    td { padding:6px 4px; }
    td:first-child { width:70%; }
    .amt { text-align:right; font-family:"Courier New", monospace; }
    .total { font-weight:700; }
    tr.section td { font-weight:800; text-decoration: underline; padding-top:12px; }
    tr.subtotal td { font-weight:800; }
    tr.subtotal .total { border-top:1px solid #0f172a; border-bottom:1px solid #0f172a; }
    tr.result td { font-weight:900; }
    tr.result .total { border-top:1px solid #0f172a; border-bottom:3px double #0f172a; }
    tr.transfer td:nth-child(2) { border-bottom:1px solid #0f172a; }
    tr.no-top-total .total { border-top:none !important; }
  </style>
</head>
<body>
  <div class="head">
    <div class="brand">${company}</div>
    <div class="title">Estado de Resultados</div>
    <div class="sub">Desde ${desde} hasta ${hasta} - ${moneda} - Nivel ${nivelVista}</div>
  </div>
  <table><tbody>${body}</tbody></table>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=980,height=760');
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
      <div className="er-wrap">
        <div className="er-title">Estado de Resultados</div>

        <div className="er-grid">
          <input className="er-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} disabled={Boolean(filtrosExternos)} />
          <input className="er-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} disabled={Boolean(filtrosExternos)} />
          <select className="er-input" value={moneda} onChange={(e) => setMoneda(e.target.value as 'CRC' | 'USD')} disabled={Boolean(filtrosExternos)}>
            <option value="CRC">CRC</option>
            <option value="USD">USD</option>
          </select>
          <input className="er-input" type="number" min={1} max={5} step={1} value={nivelVista} onChange={(e) => setNivelVista(Math.max(1, Math.min(5, Number(e.target.value) || 5)))} />
          <button className="er-btn" onClick={cargar} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
          <button className="er-btn" onClick={generarCierre} disabled={closing || loading}>
            {closing ? 'Generando...' : 'Generar Cierre'}
          </button>
        </div>

        <ListToolbar
          className="er-toolbar"
          exports={(
            <>
              <button className="er-export-btn" onClick={() => exportCsv(`estado_resultados_${empresaId}.csv`, erExportRows, erExportCols)} disabled={statementLines.length === 0}>CSV</button>
              <button className="er-export-btn" onClick={exportExcelERFormato} disabled={statementLines.length === 0}>EXCEL</button>
              <button className="er-export-btn" onClick={exportPdfERFormato} disabled={statementLines.length === 0}>PDF</button>
            </>
          )}
        />

        <div className="er-cards">
          <div className="er-card ing"><div className="er-card-num">{toMoney(ingresos, moneda)}</div><div className="er-card-lbl">Ingresos</div></div>
          <div className="er-card cos"><div className="er-card-num">{toMoney(costos, moneda)}</div><div className="er-card-lbl">Costos</div></div>
          <div className="er-card gas"><div className="er-card-num">{toMoney(gastos, moneda)}</div><div className="er-card-lbl">Gastos</div></div>
          <div className={`er-card utl ${utilidad < 0 ? 'neg' : ''}`}><div className="er-card-num">{toMoney(utilidad, moneda)}</div><div className="er-card-lbl">Utilidad Neta</div></div>
        </div>

        {error && <div className="er-error">Error: {error}</div>}
        {closeMsg && (
          <div style={{ marginBottom: 10, background: '#ecfdf5', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
            <div>{closeMsg}</div>
            {closeAsientoId ? (
              <button
                className="er-link-btn"
                style={{ marginTop: 8 }}
                onClick={() => onVerAsientoCierre?.(closeAsientoId)}
              >
                Ver Asiento
              </button>
            ) : null}
          </div>
        )}
        <div className="er-fin-wrap">
          <table className="er-fin-table">
            <thead>
              <tr>
                <th>Rubro</th>
                <th className="er-fin-right" style={{ width: 190 }}>Subtotal ({moneda})</th>
                <th className="er-fin-right" style={{ width: 190 }}>Total ({moneda})</th>
                <th className="er-right" style={{ width: 78 }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {statementLines.length === 0 ? (
                <tr><td colSpan={4} className="er-empty">No hay datos en el rango seleccionado</td></tr>
              ) : (
                <>
                  {statementLines.map((l, i) => {
                    const next = statementLines[i + 1];
                    const isTransferLine = l.kind === 'detail' && !!next && (next.kind === 'subtotal' || next.kind === 'result');
                    const prev = statementLines[i - 1];
                    const removeTopTotal = (l.kind === 'subtotal' || l.kind === 'result')
                      && !!prev
                      && prev.kind === 'detail';
                    return (
                    <tr key={`${l.label}-${i}`} className={`er-fin-${l.kind}${isTransferLine ? ' er-fin-transfer' : ''}${removeTopTotal ? ' er-fin-no-top-total' : ''}`}>
                      <td>{l.label}</td>
                      <td className="er-fin-right">{l.kind === 'detail' ? toMoney(Number(l.amount || 0), moneda) : ''}</td>
                      <td className="er-fin-right">{l.kind === 'subtotal' || l.kind === 'result' ? toMoney(Number(l.amount || 0), moneda) : ''}</td>
                      <td className="er-right">
                        {l.kind === 'detail' && l.row && Number(l.row.nivel) === Number(nivelVista) ? (
                          <button
                            className="er-link-btn"
                            onClick={() => onVerMovimientos?.({
                              cuenta: String(l.row?.cuenta || ''),
                              nombre: String(l.row?.nombre || ''),
                              desde,
                              hasta,
                              moneda,
                              origen: 'estadoderesultados',
                            })}
                            title="Ver movimientos de esta cuenta en Mayor General"
                          >
                            Ver
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )})}
                </>
              )}
            </tbody>
          </table>
        </div>

        {impuestoDetalle ? (
          <div className="er-tax-box">
            <div className="er-tax-head">Detalle de calculo de renta</div>
            <div className="er-tax-grid">
              <div className="er-tax-kv">
                <div className="er-tax-k">Tipo contribuyente</div>
                <div className="er-tax-v">{formatTipoContribuyente(impuestoDetalle.tipo_contribuyente)}</div>
              </div>
              <div className="er-tax-kv">
                <div className="er-tax-k">Regimen</div>
                <div className="er-tax-v">{formatRegimen(impuestoDetalle.regimen_codigo)}</div>
              </div>
              <div className="er-tax-kv">
                <div className="er-tax-k">Utilidad gravable</div>
                <div className="er-tax-v money">{toMoney(Number(impuestoDetalle.utilidad_gravable || 0), moneda)}</div>
              </div>
              <div className="er-tax-kv">
                <div className="er-tax-k">Impuesto calculado</div>
                <div className="er-tax-v money">{toMoney(Number(impuestoDetalle.impuesto_calculado || 0), moneda)}</div>
              </div>
            </div>
            <div className="er-tax-note">
              {`Ingreso bruto anual: ${toMoney(Number(impuestoDetalle.ingreso_bruto_anual || 0), moneda)} | Tope de referencia: ${toMoney(Number(impuestoDetalle.tope_ingreso_bruto || 0), moneda)}`}
            </div>
            {impuestoEscalonado.length > 0 ? (
              <div className="er-tax-table-wrap">
                <table className="er-tax-table">
                  <thead>
                    <tr>
                      <th style={{ width: 58 }}>#</th>
                      <th>Rango</th>
                      <th style={{ width: 86 }}>Factor</th>
                      <th className="num" style={{ width: 150 }}>Tramo ({moneda})</th>
                      <th className="num" style={{ width: 160 }}>Impuesto ({moneda})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impuestoEscalonado.map((r) => (
                      <tr key={`imp-tramo-${r.tramo_orden}`}>
                        <td>{r.tramo_orden}</td>
                        <td>{`${toMoney(Number(r.desde || 0), moneda)} - ${r.hasta === null ? 'En adelante' : toMoney(Number(r.hasta || 0), moneda)}`}</td>
                        <td>{`${Number(r.tasa || 0).toFixed(2)}%`}</td>
                        <td className="num">{toMoney(Number(r.base_tramo || 0), moneda)}</td>
                        <td className="num">{toMoney(Number(r.impuesto_tramo || 0), moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total</td>
                      <td className="num">{toMoney(impuestoEscalonado.reduce((a, r) => a + Number(r.base_tramo || 0), 0), moneda)}</td>
                      <td className="num">{toMoney(Number(impuestoDetalle.impuesto_calculado || 0), moneda)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
        {impuestoDetalleLoading ? <div className="er-tax-note" style={{ marginBottom: 10 }}>Calculando detalle de renta...</div> : null}
        {impuestoDetalleError ? <div className="er-error">Error impuesto renta: {impuestoDetalleError}</div> : null}
      </div>

      {showCloseConfirm && (
        <div className="er-modal-backdrop" onClick={() => (!closing ? setShowCloseConfirm(false) : null)}>
          <div className="er-modal" onClick={(e) => e.stopPropagation()}>
            <div className="er-modal-head">Confirmar cierre de resultados</div>
            <div className="er-modal-body">
              {`Se generara un asiento de cierre de resultados en ${moneda} para el rango ${formatIsoDate(desde)} a ${formatIsoDate(hasta)}.`}
            </div>
            <div className="er-modal-actions">
              <button className="er-btn-secondary" onClick={() => setShowCloseConfirm(false)} disabled={closing}>
                Cancelar
              </button>
              <button className="er-btn" onClick={confirmarGenerarCierre} disabled={closing}>
                {closing ? 'Generando...' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

