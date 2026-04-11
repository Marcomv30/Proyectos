import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceMainPanel } from '../../components/WorkspaceShell';
import { supabase } from '../../supabase';
import {
  FE_MEDIO_PAGO_OPTIONS,
  type LiquidacionPagoRow,
  createLiquidacionPago,
  liquidacionTotal,
  medioPagoPrincipal,
  serializeLiquidacionPagos,
  validateLiquidacionPagos,
} from '../../utils/fePaymentLiquidation';

interface Props {
  empresaId: number;
}

interface RefDocRow {
  id: number;
  tipo_documento: string;
  numero_consecutivo: string | null;
  clave_mh: string | null;
  fecha_emision: string;
  estado_mh: string | null;
  receptor_nombre: string | null;
  receptor_identificacion: string | null;
  receptor_tipo_identificacion: string | null;
  receptor_email: string | null;
  receptor_origen: string | null;
  total_comprobante: number | null;
  condicion_venta: string | null;
  medio_pago: string | null;
  plazo_credito_dias: number | null;
  moneda: string | null;
}

interface RefLineaRow {
  id: number;
  linea: number;
  tipo_linea: string;
  codigo_interno: string | null;
  cabys: string | null;
  descripcion: string;
  unidad_medida: string | null;
  cantidad: number;
  precio_unitario: number;
  descuento_monto: number;
  tarifa_iva_codigo: string | null;
  tarifa_iva_porcentaje: number;
}

interface LineaForm {
  id: string;
  tipo_linea: 'mercaderia' | 'servicio';
  cabys: string;
  codigo: string;
  descripcion: string;
  unidad_medida: string;
  tarifa_iva_codigo: string;
  tarifa_iva_porcentaje: number;
  cantidad: number;
  precio_unitario: number;
  descuento_monto: number;
}

interface ConfigFe {
  sucursal: string;
  punto_venta: string;
  condicion_venta_defecto: string;
  medio_pago_defecto: string;
  plazo_credito_dias: number;
}

const ND_MOTIVOS = [
  { codigo: '01', label: '01 - Anula documento de referencia' },
  { codigo: '02', label: '02 - Corrige texto del documento' },
  { codigo: '04', label: '04 - Referencia a otro documento' },
  { codigo: '05', label: '05 - Sustituye comprobante provisional' },
  { codigo: '06', label: '06 - Devolucion mercaderia' },
  { codigo: '07', label: '07 - Sustituye mercaderia no facturada' },
  { codigo: '08', label: '08 - Devuelve mercaderia' },
  { codigo: '09', label: '09 - Devuelve mercaderia facturada' },
  { codigo: '10', label: '10 - Ajuste por exportacion' },
  { codigo: '11', label: '11 - Ajuste por impuesto' },
  { codigo: '12', label: '12 - Ajuste por monto' },
  { codigo: '99', label: '99 - Otros' },
];

const DOC_LABEL: Record<string, string> = {
  '01': 'FE',
  '02': 'ND',
  '03': 'NC',
  '04': 'TE',
  '09': 'FEE',
};

const CONDICION_VENTA_OPT = [
  { value: '01', label: '01 - Contado' },
  { value: '02', label: '02 - Credito' },
  { value: '03', label: '03 - Consignacion' },
  { value: '04', label: '04 - Apartado' },
  { value: '05', label: '05 - Arrendamiento con opcion de compra' },
  { value: '06', label: '06 - Arrendamiento en funcion financiera' },
  { value: '07', label: '07 - Cobro a favor de un tercero' },
  { value: '08', label: '08 - Servicios prestados al Estado' },
  { value: '09', label: '09 - Pago del servicio prestado al Estado' },
  { value: '10', label: '10 - Venta a plazo' },
  { value: '99', label: '99 - Otros' },
];

const IVA_OPTIONS = [
  { codigo: '08', pct: 13, label: '13%' },
  { codigo: '07', pct: 8, label: '8%' },
  { codigo: '06', pct: 4, label: '4%' },
  { codigo: '05', pct: 2, label: '2%' },
  { codigo: '04', pct: 1, label: '1%' },
  { codigo: '09', pct: 0.5, label: '0.5%' },
  { codigo: '10', pct: 0, label: '0% Exento' },
];

const money = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseNum = (raw: string) => {
  const value = String(raw || '').trim().replace(/\s/g, '');
  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  let normalized = value;
  if (lastDot >= 0 && lastComma >= 0) {
    const decSep = lastDot > lastComma ? '.' : ',';
    const tSep = decSep === '.' ? ',' : '.';
    normalized = value.split(tSep).join('');
    if (decSep === ',') normalized = normalized.replace(',', '.');
  } else {
    normalized = value.replace(',', '.');
  }
  normalized = normalized.replace(/[^0-9.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const emptyLinea = (): LineaForm => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  tipo_linea: 'servicio',
  cabys: '',
  codigo: '',
  descripcion: '',
  unidad_medida: 'Unid',
  tarifa_iva_codigo: '08',
  tarifa_iva_porcentaje: 13,
  cantidad: 1,
  precio_unitario: 0,
  descuento_monto: 0,
});

const ivaCodigoToPct = (codigo: string): number => IVA_OPTIONS.find((o) => o.codigo === codigo)?.pct ?? 13;

const styles = `
  .nd-wrap { color:var(--card-text); }
  .nd-title { font-size:24px; font-weight:800; color:var(--card-text); margin-bottom:4px; letter-spacing:-.03em; opacity:.96; }
  .nd-sub { font-size:12px; color:var(--gray-400); margin-bottom:0; }
  .nd-stage { border:1px solid var(--card-border); overflow:hidden; background:linear-gradient(180deg, var(--bg-dark2) 0%, var(--bg-dark) 100%); box-shadow:0 30px 60px rgba(2,6,23,.32); margin-bottom:16px; }
  .nd-stage-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:18px 22px; border-bottom:1px solid color-mix(in srgb, #f97316 24%, var(--card-border)); background:linear-gradient(90deg, color-mix(in srgb, var(--bg-dark2) 88%, #f97316 12%) 0%, var(--bg-dark) 100%); }
  .nd-stage-badge { display:inline-flex; align-items:center; gap:6px; background:color-mix(in srgb, #f97316 18%, var(--bg-dark2)); border:1px solid color-mix(in srgb, #fb923c 36%, var(--card-border)); color:#ffedd5; border-radius:999px; padding:5px 12px; font-size:12px; font-weight:800; letter-spacing:.04em; }
  .nd-stage-body { padding:14px; display:grid; gap:14px; }
  .nd-grid { display:grid; grid-template-columns:repeat(12, minmax(0,1fr)); gap:12px; }
  .nd-field { display:flex; flex-direction:column; gap:6px; }
  .nd-field label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:color-mix(in srgb, #f97316 55%, var(--card-text)); font-weight:800; }
  .nd-input, .nd-select, .nd-textarea { width:100%; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark) 82%, var(--card-bg)); color:var(--card-text); border-radius:0; padding:8px 10px; font-size:12px; outline:none; }
  .nd-input:focus, .nd-select:focus, .nd-textarea:focus { border-color:#fb923c; box-shadow:0 0 0 1px color-mix(in srgb, #fb923c 28%, transparent); }
  .nd-textarea { min-height:72px; resize:vertical; }
  .nd-msg-ok { border:1px solid rgba(16,185,129,.24); background:rgba(6,78,59,.3); color:#a7f3d0; padding:10px 12px; font-size:12px; margin-bottom:12px; }
  .nd-msg-err { border:1px solid #7f1d1d; background:#2b1111; color:#fca5a5; padding:10px 12px; font-size:12px; margin-bottom:12px; }
  .nd-msg-warn { border:1px solid #854d0e; background:#2a1b06; color:#fcd34d; padding:10px 12px; font-size:12px; margin-bottom:12px; }
  .nd-ref-card { border:1px solid color-mix(in srgb, #fb923c 36%, var(--card-border)); background:color-mix(in srgb, #f97316 8%, var(--bg-dark2)); padding:14px; }
  .nd-ref-row { display:flex; gap:24px; flex-wrap:wrap; font-size:12px; }
  .nd-ref-kv { display:flex; flex-direction:column; gap:2px; }
  .nd-ref-k { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--gray-400); }
  .nd-ref-v { color:var(--card-text); font-weight:700; }
  .nd-ref-total { color:#86efac; font-family:monospace; font-size:14px; font-weight:900; }
  .nd-btn { border-radius:0; padding:9px 14px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark) 82%, var(--card-bg)); color:var(--card-text); white-space:nowrap; }
  .nd-btn.orange { background:color-mix(in srgb, #f97316 18%, var(--bg-dark2)); border-color:color-mix(in srgb, #fb923c 36%, var(--card-border)); color:#ffedd5; }
  .nd-btn.success { background:color-mix(in srgb, var(--green-main) 22%, var(--bg-dark2)); border-color:color-mix(in srgb, var(--green-main) 34%, var(--card-border)); color:#dcfce7; }
  .nd-btn.danger { background:color-mix(in srgb, #ef4444 14%, var(--bg-dark2)); border-color:color-mix(in srgb, #ef4444 28%, var(--card-border)); color:#fecaca; }
  .nd-btn:disabled { opacity:.6; cursor:not-allowed; }
  .nd-line-table { width:100%; border-collapse:separate; border-spacing:0; }
  .nd-line-table thead th { background:color-mix(in srgb, var(--bg-dark) 92%, transparent); color:var(--gray-400); font-size:10px; text-transform:uppercase; letter-spacing:.12em; padding:10px 10px; border-bottom:1px solid var(--card-border); text-align:left; }
  .nd-line-table tbody td { padding:2px 3px; border-top:1px solid var(--card-border); border-right:1px solid var(--card-border); vertical-align:middle; background:color-mix(in srgb, var(--bg-dark2) 72%, transparent); }
  .nd-line-table tbody td:last-child { border-right:0; }
  .nd-line-input { width:100%; box-sizing:border-box; border:1px solid #334155; background:#485569; color:#f8fafc; border-radius:0; padding:6px 8px; font-size:12px; outline:none; min-height:30px; }
  .nd-line-input:focus { border-color:#fb923c; box-shadow:0 0 0 1px rgba(251,146,60,.22); }
  .nd-line-input.num { text-align:right; font-variant-numeric:tabular-nums; }
  .nd-line-amt { font-family:monospace; color:#86efac; font-size:13px; font-weight:700; text-align:right; background:#182437; border:1px solid #2a3a51; min-height:30px; display:flex; align-items:center; justify-content:flex-end; padding:0 8px; }
  .nd-line-remove { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:999px; background:#7f1d1d; color:#fecaca; cursor:pointer; font-size:15px; line-height:1; border:none; }
  .nd-total-card { border:1px solid var(--card-border); overflow:hidden; }
  .nd-total-row { display:grid; grid-template-columns:1fr 140px; gap:12px; padding:9px 14px; border-top:1px solid var(--card-border); }
  .nd-total-row:first-child { border-top:0; }
  .nd-total-row .k { color:var(--card-text); font-size:13px; }
  .nd-total-row .v { text-align:right; font-family:monospace; font-size:14px; color:var(--card-text); }
  .nd-total-row.grand { background:#c2410c; }
  .nd-total-row.grand .k, .nd-total-row.grand .v { color:#fff7ed; font-size:18px; font-weight:900; }
  .nd-footer { display:flex; gap:10px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap; }
  .nd-chip { display:inline-flex; align-items:center; border-radius:999px; padding:3px 10px; font-size:11px; font-weight:700; letter-spacing:.04em; border:1px solid transparent; }
  .nd-chip.acept { background:rgba(34,197,94,.14); color:#86efac; border:1px solid rgba(34,197,94,.22); }
  .nd-chip.warn { background:#2a1b06; color:#fcd34d; border:1px solid #854d0e; }
  .nd-modal-backdrop { position:fixed; inset:108px 0 0 0; z-index:20000; background:rgba(2,6,23,.84); display:flex; align-items:flex-start; justify-content:center; padding:24px; overflow:auto; }
  .nd-modal { width:min(860px,100%); border:1px solid color-mix(in srgb, #fb923c 32%, var(--card-border)); background:linear-gradient(180deg, var(--bg-dark2) 0%, var(--bg-dark) 100%); box-shadow:0 30px 80px rgba(0,0,0,.55); overflow:hidden; }
  .nd-modal-head { display:flex; align-items:center; justify-content:space-between; padding:16px 22px; border-bottom:1px solid color-mix(in srgb, #fb923c 28%, var(--card-border)); }
  .nd-modal-title { font-size:16px; font-weight:800; color:#ffedd5; }
  .nd-modal-body { padding:18px 22px; background:var(--bg-dark2); }
  .nd-modal-table { width:100%; border-collapse:collapse; }
  .nd-modal-table th, .nd-modal-table td { padding:10px 13px; border-top:1px solid var(--card-border); text-align:left; font-size:12px; color:var(--card-text); }
  .nd-modal-table th { background:color-mix(in srgb, var(--bg-dark) 94%, #f97316 6%); color:color-mix(in srgb, #fb923c 72%, var(--card-text)); font-size:10px; text-transform:uppercase; letter-spacing:.1em; font-weight:800; border-top:none; }
  .nd-modal-table tbody tr { cursor:pointer; }
  .nd-modal-table tbody tr:hover td { background:color-mix(in srgb, #f97316 8%, var(--bg-dark2)); }
  .nd-mobile-hint { display:none; margin:0 0 10px; font-size:12px; color:var(--gray-400); }
  .nd-scroll { overflow:auto; touch-action:pan-x; -webkit-overflow-scrolling:touch; }
  @media (max-width:760px) {
    .nd-grid-shell { grid-template-columns:1fr !important; }
    .nd-stage-head { flex-direction:column; align-items:flex-start; }
    .nd-footer { justify-content:stretch; }
    .nd-footer .nd-btn { flex:1 1 100%; }
    .nd-mobile-hint { display:block; }
  }
`;

export default function NotaDebitoPage({ empresaId }: Props) {
  const [config, setConfig] = useState<ConfigFe>({
    sucursal: '001',
    punto_venta: '00001',
    condicion_venta_defecto: '01',
    medio_pago_defecto: '01',
    plazo_credito_dias: 0,
  });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const [busqRef, setBusqRef] = useState('');
  const [busqLoading, setBusqLoading] = useState(false);
  const [busqResultados, setBusqResultados] = useState<RefDocRow[]>([]);
  const [busqModal, setBusqModal] = useState(false);
  const [refDoc, setRefDoc] = useState<RefDocRow | null>(null);
  const [refLineas, setRefLineas] = useState<RefLineaRow[]>([]);
  const [refCodigo, setRefCodigo] = useState('04');
  const [refRazon, setRefRazon] = useState('');
  const fechaActual = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fechaEmision] = useState(fechaActual);
  const [condicionVenta, setCondicionVenta] = useState('01');
  const [liquidacionPagos, setLiquidacionPagos] = useState<LiquidacionPagoRow[]>([createLiquidacionPago('01', 0)]);
  const [plazoCreditoDias, setPlazoCreditoDias] = useState(0);
  const [observacion, setObservacion] = useState('');
  const [receptorNombre, setReceptorNombre] = useState('');
  const [receptorTipoIdent, setReceptorTipoIdent] = useState('');
  const [receptorIdent, setReceptorIdent] = useState('');
  const [receptorEmail, setReceptorEmail] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([emptyLinea()]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const prevRefDocId = useRef<number | null>(null);

  useEffect(() => {
    supabase
      .from('fe_config_empresa')
      .select('sucursal,punto_venta,condicion_venta_defecto,medio_pago_defecto,plazo_credito_dias')
      .eq('empresa_id', empresaId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const d = data as any;
        setConfig({
          sucursal: d.sucursal || '001',
          punto_venta: d.punto_venta || '00001',
          condicion_venta_defecto: d.condicion_venta_defecto || '01',
          medio_pago_defecto: d.medio_pago_defecto || '01',
          plazo_credito_dias: Number(d.plazo_credito_dias || 0),
        });
        setCondicionVenta(d.condicion_venta_defecto || '01');
        setLiquidacionPagos([createLiquidacionPago(d.medio_pago_defecto || '01', 0)]);
        setPlazoCreditoDias(Number(d.plazo_credito_dias || 0));
      });
  }, [empresaId]);

  const lineasCalculadas = useMemo(() => lineas.map((l) => {
    const subtotal = Math.max(0, Number(l.cantidad || 0) * Number(l.precio_unitario || 0));
    const baseNeta = Math.max(0, subtotal - Number(l.descuento_monto || 0));
    const impuesto = baseNeta * (Number(l.tarifa_iva_porcentaje || 0) / 100);
    const total = baseNeta + impuesto;
    return { ...l, subtotal, baseNeta, impuesto, total };
  }), [lineas]);

  const lineasValidas = useMemo(() => lineasCalculadas.filter((l) => l.descripcion.trim()), [lineasCalculadas]);

  const resumen = useMemo(() => {
    const subtotal = lineasCalculadas.reduce((s, l) => s + l.subtotal, 0);
    const descuento = lineasCalculadas.reduce((s, l) => s + Number(l.descuento_monto || 0), 0);
    const impuesto = lineasCalculadas.reduce((s, l) => s + l.impuesto, 0);
    const total = lineasCalculadas.reduce((s, l) => s + l.total, 0);
    return { subtotal, descuento, impuesto, total };
  }, [lineasCalculadas]);

  useEffect(() => {
    setLiquidacionPagos((prev) => prev.length === 1 ? [{ ...prev[0], monto: resumen.total }] : prev);
  }, [resumen.total]);

  const buscarRefDoc = useCallback(async () => {
    const q = busqRef.trim();
    if (!q) return;
    setBusqLoading(true);
    setBusqResultados([]);
    try {
      const { data } = await supabase
        .from('fe_documentos')
        .select('id,tipo_documento,numero_consecutivo,clave_mh,fecha_emision,estado_mh,receptor_nombre,receptor_identificacion,receptor_tipo_identificacion,receptor_email,receptor_origen,total_comprobante,condicion_venta,medio_pago,plazo_credito_dias,moneda')
        .eq('empresa_id', empresaId)
        .in('tipo_documento', ['01', '02', '03', '04', '09'])
        .eq('estado_mh', 'aceptado')
        .or(`numero_consecutivo.ilike.%${q}%,receptor_nombre.ilike.%${q}%,clave_mh.ilike.%${q}%`)
        .order('fecha_emision', { ascending: false })
        .limit(20);
      setBusqResultados((data || []) as RefDocRow[]);
    } catch {
      setError('Error buscando documentos de referencia.');
    } finally {
      setBusqLoading(false);
    }
  }, [busqRef, empresaId]);

  const copiarLineasDeReferencia = useCallback(() => {
    if (!refLineas.length) return;
    setLineas(refLineas.map((l) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tipo_linea: (l.tipo_linea as 'mercaderia' | 'servicio') || 'servicio',
      cabys: l.cabys || '',
      codigo: l.codigo_interno || '',
      descripcion: l.descripcion,
      unidad_medida: l.unidad_medida || 'Unid',
      tarifa_iva_codigo: l.tarifa_iva_codigo || '08',
      tarifa_iva_porcentaje: Number(l.tarifa_iva_porcentaje || 0),
      cantidad: Number(l.cantidad || 0),
      precio_unitario: Number(l.precio_unitario || 0),
      descuento_monto: Number(l.descuento_monto || 0),
    })));
  }, [refLineas]);

  const seleccionarRefDoc = useCallback(async (doc: RefDocRow) => {
    setBusqModal(false);
    setRefDoc(doc);
    setError('');
    setOk('');
    const { data: lineasData } = await supabase
      .from('fe_documento_lineas')
      .select('id,linea,tipo_linea,codigo_interno,cabys,descripcion,unidad_medida,cantidad,precio_unitario,descuento_monto,tarifa_iva_codigo,tarifa_iva_porcentaje')
      .eq('documento_id', doc.id)
      .order('linea', { ascending: true });
    const cargadas = (lineasData || []) as RefLineaRow[];
    setRefLineas(cargadas);
    setReceptorNombre(doc.receptor_nombre || '');
    setReceptorTipoIdent(doc.receptor_tipo_identificacion || '');
    setReceptorIdent(doc.receptor_identificacion || '');
    setReceptorEmail(doc.receptor_email || '');
    const cond = doc.condicion_venta || config.condicion_venta_defecto || '01';
    const medio = doc.medio_pago || config.medio_pago_defecto || '01';
    const plazo = Number(doc.plazo_credito_dias || 0);
    setCondicionVenta(cond);
    setPlazoCreditoDias(plazo);
    setLiquidacionPagos([createLiquidacionPago(medio, 0)]);
  }, [config.condicion_venta_defecto, config.medio_pago_defecto]);

  useEffect(() => {
    if (refDoc?.id && prevRefDocId.current !== refDoc.id && refLineas.length > 0) {
      const estaVacia = lineas.length === 1 && !lineas[0].descripcion.trim() && Number(lineas[0].precio_unitario || 0) === 0;
      if (estaVacia) copiarLineasDeReferencia();
    }
    prevRefDocId.current = refDoc?.id || null;
  }, [refDoc?.id, refLineas, lineas, copiarLineasDeReferencia]);

  const updateLinea = (id: string, field: keyof LineaForm, value: any) =>
    setLineas((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));

  const removeLinea = (id: string) =>
    setLineas((prev) => {
      const next = prev.filter((l) => l.id !== id);
      return next.length ? next : [emptyLinea()];
    });

  const setDraft = (key: string, val: string) => setDrafts((p) => ({ ...p, [key]: val }));
  const clearDraft = (key: string) => setDrafts((p) => { const n = { ...p }; delete n[key]; return n; });
  const getDraft = (key: string, fallback: string) => drafts[key] !== undefined ? drafts[key] : fallback;

  const validaciones = useMemo(() => {
    const msgs: string[] = [];
    if (!refDoc) msgs.push('Seleccione el documento de referencia.');
    if (refDoc && (!refDoc.clave_mh || String(refDoc.clave_mh).length !== 50)) msgs.push('El documento de referencia no tiene clave MH valida.');
    if (!refCodigo) msgs.push('Seleccione el motivo de la Nota de Debito.');
    if (!refRazon.trim()) msgs.push('Ingrese la razon del ajuste.');
    if (lineasValidas.length === 0) msgs.push('Debe agregar al menos una linea.');
    const sinCabys = lineasValidas.filter((l) => !/^\d{13}$/.test(String(l.cabys || '').trim()));
    if (sinCabys.length) msgs.push(`${sinCabys.length} linea(s) sin CABYS de 13 digitos.`);
    return msgs;
  }, [refDoc, refCodigo, refRazon, lineasValidas]);

  const canConfirm = validaciones.length === 0;
  const condicionSinMedioPago = ['02', '03', '04', '05', '06', '07', '08', '09', '10', '99'].includes(condicionVenta);

  const resetForm = () => {
    setRefDoc(null);
    setRefLineas([]);
    setBusqRef('');
    setBusqResultados([]);
    setRefCodigo('04');
    setRefRazon('');
    setReceptorNombre('');
    setReceptorTipoIdent('');
    setReceptorIdent('');
    setReceptorEmail('');
    setLineas([emptyLinea()]);
    setObservacion('');
    setCondicionVenta(config.condicion_venta_defecto || '01');
    setPlazoCreditoDias(config.plazo_credito_dias || 0);
    setLiquidacionPagos([createLiquidacionPago(config.medio_pago_defecto || '01', 0)]);
    setOk('');
    setError('');
  };

  const guardar = async (estado: 'borrador' | 'confirmado') => {
    if (estado === 'confirmado' && !canConfirm) {
      setError(validaciones.join(' • '));
      return;
    }
    if (lineasValidas.length === 0) {
      setError('Debe agregar al menos una linea.');
      return;
    }
    if (estado === 'confirmado') {
      const liqErr = validateLiquidacionPagos(liquidacionPagos, resumen.total, condicionVenta);
      if (liqErr) {
        setError(liqErr);
        return;
      }
    }
    setBusy(true);
    setOk('');
    setError('');
    let documentoIdGuardado = 0;
    try {
      const receptorPayload = receptorNombre.trim()
        ? {
            receptor_origen: refDoc?.receptor_origen || 'bitacora',
            receptor_tipo_identificacion: receptorTipoIdent || null,
            receptor_identificacion: receptorIdent.trim() || null,
            receptor_nombre: receptorNombre.trim(),
            receptor_email: receptorEmail.trim() || null,
          }
        : { receptor_origen: 'consumidor_final', receptor_nombre: 'Consumidor final' };

      const { data: inserted, error: insErr } = await supabase
        .from('fe_documentos')
        .insert({
          empresa_id: empresaId,
          tipo_documento: '02',
          origen: 'facturacion',
          estado,
          auto_emitir: estado === 'confirmado',
          ...receptorPayload,
          fecha_emision: fechaEmision,
          moneda: refDoc?.moneda || 'CRC',
          condicion_venta: condicionVenta,
          medio_pago: medioPagoPrincipal(liquidacionPagos, condicionVenta, config.medio_pago_defecto),
          liquidacion_pago_json: serializeLiquidacionPagos(liquidacionPagos, condicionVenta),
          plazo_credito_dias: plazoCreditoDias,
          observacion: observacion.trim() || null,
          subtotal: resumen.subtotal,
          total_descuento: resumen.descuento,
          total_impuesto: resumen.impuesto,
          total_comprobante: resumen.total,
          ref_tipo_doc: refDoc?.tipo_documento || '01',
          ref_numero: refDoc?.clave_mh || null,
          ref_fecha_emision: refDoc?.fecha_emision || null,
          ref_codigo: refCodigo,
          ref_razon: refRazon.trim() || null,
          ref_doc_id: refDoc?.id || null,
        })
        .select('id')
        .single();
      if (insErr) throw new Error(`No se pudo guardar la Nota de Debito: ${insErr.message}`);
      const docId = Number((inserted as any)?.id || 0);
      if (!docId) throw new Error('No se obtuvo el ID del documento.');
      documentoIdGuardado = docId;
      const rows = lineasValidas.map((l, idx) => ({
        documento_id: docId,
        linea: idx + 1,
        tipo_linea: l.tipo_linea,
        codigo_interno: l.codigo || null,
        cabys: l.cabys || null,
        descripcion: l.descripcion,
        unidad_medida: l.unidad_medida || null,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descuento_monto: l.descuento_monto,
        tarifa_iva_codigo: l.tarifa_iva_codigo || null,
        tarifa_iva_porcentaje: l.tarifa_iva_porcentaje,
        exoneracion_id: null,
        exoneracion_autorizacion: null,
        exoneracion_porcentaje: 0,
        exoneracion_monto: 0,
        subtotal: lineasCalculadas.find((lc) => lc.id === l.id)?.baseNeta ?? 0,
        impuesto_monto: lineasCalculadas.find((lc) => lc.id === l.id)?.impuesto ?? 0,
        total_linea: lineasCalculadas.find((lc) => lc.id === l.id)?.total ?? 0,
      }));
      const { error: lineErr } = await supabase.from('fe_documento_lineas').insert(rows);
      if (lineErr) throw new Error(`No se pudo guardar las lineas: ${lineErr.message}`);
      if (estado === 'confirmado') {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.');
        const directBase = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_PROXY || 'http://localhost:3001';
        const endpoints = [
          `/api/facturacion/emitir/${docId}`,
          ...((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? [`${directBase}/api/facturacion/emitir/${docId}`]
            : []),
        ].filter((value, index, arr) => arr.indexOf(value) === index);
        let json = {} as { ok?: boolean; error?: string; estado_mh?: string; consecutivo?: string; mh_data?: any };
        let lastError = 'No hubo respuesta del servidor.';
        for (const endpoint of endpoints) {
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ empresa_id: empresaId }),
          });
          const raw = await resp.text();
          const proxyError = /Error occurred while trying to proxy/i.test(raw || '');
          if (proxyError && endpoint !== endpoints[endpoints.length - 1]) {
            lastError = 'El proxy local no respondio; reintentando directo contra el backend.';
            continue;
          }
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch {
            json = {};
          }
          const detalleMh = json?.mh_data?.detalle || json?.mh_data?.message || json?.mh_data?.mensaje || '';
          const errorMsg =
            json.error ||
            detalleMh ||
            (raw && !raw.trim().startsWith('<') ? raw.trim() : '') ||
            `No se pudo emitir en firme (HTTP ${resp.status}).`;
          if (!resp.ok || !json.ok) {
            lastError = errorMsg;
            continue;
          }
          lastError = '';
          break;
        }
        if (lastError) throw new Error(lastError);
        setOk(`ND emitida en firme. Estado MH: ${String(json.estado_mh || 'enviado')}${json.consecutivo ? ` · ${json.consecutivo}` : ''}`);
      } else {
        setOk('ND guardada en borrador.');
      }
      resetForm();
    } catch (e: any) {
      const baseMsg = String(e?.message || 'Error guardando la Nota de Debito.');
      setError(documentoIdGuardado && estado === 'confirmado'
        ? `La ND se guardo, pero no se pudo emitir en firme. ${baseMsg}`
        : baseMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <WorkspaceMainPanel>
        <div className="nd-wrap">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <div className="nd-title">Nota de Debito Electronica</div>
                <div className="nd-sub">Tipo 02 - MH CR v4.4 · InformacionReferencia obligatoria</div>
              </div>
              <span className="nd-stage-badge">ND</span>
            </div>
            <button className="nd-btn" onClick={resetForm} disabled={busy}>Nueva ND</button>
          </div>

          {ok && <div className="nd-msg-ok">{ok}</div>}
          {error && <div className="nd-msg-err">{error}</div>}

          <div className="nd-stage">
            <div className="nd-stage-head">
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fb923c' }}>1 - Documento de referencia</span>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>InformacionReferencia obligatoria para ND</span>
            </div>
            <div className="nd-stage-body">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: refDoc ? 12 : 0 }}>
                <button className="nd-btn orange" onClick={() => setBusqModal(true)}>Seleccionar documento de referencia</button>
                {refDoc && <button className="nd-btn danger" onClick={() => { setRefDoc(null); setRefLineas([]); }}>Quitar referencia</button>}
              </div>
              {refDoc ? (
                <div className="nd-ref-card">
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', color: '#fb923c', fontWeight: 800, marginBottom: 8 }}>
                    Documento seleccionado
                    <span className={`nd-chip ${refDoc.estado_mh === 'aceptado' ? 'acept' : 'warn'}`} style={{ marginLeft: 8 }}>{refDoc.estado_mh || 'SIN ENVIO'}</span>
                  </div>
                  <div className="nd-ref-row">
                    <div className="nd-ref-kv"><span className="nd-ref-k">Tipo</span><span className="nd-ref-v">{DOC_LABEL[refDoc.tipo_documento] || refDoc.tipo_documento}</span></div>
                    <div className="nd-ref-kv"><span className="nd-ref-k">Numero</span><span className="nd-ref-v" style={{ fontFamily: 'monospace', fontSize: 13 }}>{refDoc.numero_consecutivo || '-'}</span></div>
                    <div className="nd-ref-kv"><span className="nd-ref-k">Fecha</span><span className="nd-ref-v">{refDoc.fecha_emision}</span></div>
                    <div className="nd-ref-kv"><span className="nd-ref-k">Cliente</span><span className="nd-ref-v">{refDoc.receptor_nombre || 'Consumidor final'}</span></div>
                    <div className="nd-ref-kv"><span className="nd-ref-k">Total original</span><span className="nd-ref-v nd-ref-total">CRC {money(Number(refDoc.total_comprobante || 0))}</span></div>
                    <div className="nd-ref-kv"><span className="nd-ref-k">Lineas</span><span className="nd-ref-v">{refLineas.length}</span></div>
                  </div>
                  {refLineas.length > 0 && <button className="nd-btn orange" style={{ marginTop: 12 }} onClick={copiarLineasDeReferencia}>Copiar lineas del documento original</button>}
                </div>
              ) : (
                <div className="nd-msg-warn" style={{ marginBottom: 0 }}>
                  Seleccione FE, TE, FEE, NC o ND aceptada por MH para respaldar la Nota de Debito.
                </div>
              )}

              <div className="nd-grid">
                <div className="nd-field" style={{ gridColumn: 'span 5' }}>
                  <label>Codigo de motivo MH *</label>
                  <select className="nd-select" value={refCodigo} onChange={(e) => setRefCodigo(e.target.value)}>
                    {ND_MOTIVOS.map((m) => <option key={m.codigo} value={m.codigo}>{m.label}</option>)}
                  </select>
                </div>
                <div className="nd-field" style={{ gridColumn: 'span 7' }}>
                  <label>Razon / descripcion del motivo *</label>
                  <input className="nd-input" value={refRazon} onChange={(e) => setRefRazon(e.target.value)} maxLength={160} placeholder="Ej: Recargo por ajuste de tarifa, intereses o gastos adicionales..." />
                </div>
              </div>
            </div>
          </div>

          <div className="nd-stage">
            <div className="nd-stage-head">
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fb923c' }}>2 - Receptor</span>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Prellenado del documento de referencia</span>
            </div>
            <div className="nd-stage-body">
              <div className="nd-grid">
                <div className="nd-field" style={{ gridColumn: 'span 6' }}><label>Nombre / razon social</label><input className="nd-input" value={receptorNombre} onChange={(e) => setReceptorNombre(e.target.value)} /></div>
                <div className="nd-field" style={{ gridColumn: 'span 2' }}><label>Tipo identificacion</label><select className="nd-select" value={receptorTipoIdent} onChange={(e) => setReceptorTipoIdent(e.target.value)}><option value="">-</option><option value="01">01 - Juridica</option><option value="02">02 - Fisica</option><option value="03">03 - DIMEX</option><option value="04">04 - NITE</option></select></div>
                <div className="nd-field" style={{ gridColumn: 'span 4' }}><label>Numero de identificacion</label><input className="nd-input" value={receptorIdent} onChange={(e) => setReceptorIdent(e.target.value)} /></div>
                <div className="nd-field" style={{ gridColumn: 'span 5' }}><label>Correo electronico</label><input className="nd-input" type="email" value={receptorEmail} onChange={(e) => setReceptorEmail(e.target.value)} /></div>
                <div className="nd-field" style={{ gridColumn: 'span 3' }}><label>Condicion de venta</label><select className="nd-select" value={condicionVenta} onChange={(e) => setCondicionVenta(e.target.value)}>{CONDICION_VENTA_OPT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                {condicionVenta === '02' && <div className="nd-field" style={{ gridColumn: 'span 2' }}><label>Plazo (dias)</label><input className="nd-input" type="number" min={0} value={plazoCreditoDias} onChange={(e) => setPlazoCreditoDias(Number(e.target.value))} /></div>}
              </div>
            </div>
          </div>

          <div className="nd-stage">
            <div className="nd-stage-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fb923c' }}>3 - Detalle de la Nota de Debito</span>
              <button className="nd-btn" onClick={() => setLineas((p) => [...p, emptyLinea()])}>+ Agregar linea</button>
            </div>
            <div className="nd-stage-body">
              <div className="nd-msg-warn" style={{ marginBottom: 12 }}>La ND incrementa o recompone montos. Revise cantidades, precios, descuentos e IVA antes de confirmar.</div>
              <div className="nd-mobile-hint">Desliza horizontalmente para revisar las líneas de la nota.</div>
              <div className="nd-scroll" style={{ overflowX: 'auto' }}>
                <table className="nd-line-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th><th style={{ width: 100 }}>Tipo</th><th style={{ minWidth: 140 }}>CABYS</th><th style={{ minWidth: 200 }}>Descripcion</th><th style={{ width: 70 }}>Unidad</th><th style={{ width: 80 }}>Cantidad</th><th style={{ width: 110 }}>Precio unit.</th><th style={{ width: 100 }}>Descuento</th><th style={{ width: 80 }}>IVA</th><th style={{ width: 110 }}>Total linea</th><th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasCalculadas.map((l, idx) => (
                      <tr key={l.id}>
                        <td style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 12 }}>{idx + 1}</td>
                        <td><select className="nd-line-input" value={l.tipo_linea} onChange={(e) => updateLinea(l.id, 'tipo_linea', e.target.value)}><option value="mercaderia">Mercaderia</option><option value="servicio">Servicio</option></select></td>
                        <td><input className="nd-line-input" style={{ fontFamily: 'monospace', fontSize: 11 }} value={l.cabys} onChange={(e) => updateLinea(l.id, 'cabys', e.target.value.replace(/\D/g, '').slice(0, 13))} maxLength={13} placeholder="0000000000000" /></td>
                        <td><input className="nd-line-input" value={l.descripcion} onChange={(e) => updateLinea(l.id, 'descripcion', e.target.value)} /></td>
                        <td><input className="nd-line-input" value={l.unidad_medida} onChange={(e) => updateLinea(l.id, 'unidad_medida', e.target.value)} /></td>
                        <td><input className="nd-line-input num" value={getDraft(`${l.id}-cant`, String(l.cantidad))} onChange={(e) => setDraft(`${l.id}-cant`, e.target.value)} onBlur={(e) => { updateLinea(l.id, 'cantidad', parseNum(e.target.value)); clearDraft(`${l.id}-cant`); }} onFocus={() => setDraft(`${l.id}-cant`, String(l.cantidad))} /></td>
                        <td><input className="nd-line-input num" value={getDraft(`${l.id}-pu`, String(l.precio_unitario))} onChange={(e) => setDraft(`${l.id}-pu`, e.target.value)} onBlur={(e) => { updateLinea(l.id, 'precio_unitario', parseNum(e.target.value)); clearDraft(`${l.id}-pu`); }} onFocus={() => setDraft(`${l.id}-pu`, String(l.precio_unitario))} /></td>
                        <td><input className="nd-line-input num" value={getDraft(`${l.id}-desc`, String(l.descuento_monto))} onChange={(e) => setDraft(`${l.id}-desc`, e.target.value)} onBlur={(e) => { updateLinea(l.id, 'descuento_monto', parseNum(e.target.value)); clearDraft(`${l.id}-desc`); }} onFocus={() => setDraft(`${l.id}-desc`, String(l.descuento_monto))} /></td>
                        <td><select className="nd-line-input" value={l.tarifa_iva_codigo} onChange={(e) => { updateLinea(l.id, 'tarifa_iva_codigo', e.target.value); updateLinea(l.id, 'tarifa_iva_porcentaje', ivaCodigoToPct(e.target.value)); }}>{IVA_OPTIONS.map((o) => <option key={o.codigo} value={o.codigo}>{o.label}</option>)}</select></td>
                        <td><div className="nd-line-amt">CRC {money(l.total)}</div></td>
                        <td><button className="nd-line-remove" onClick={() => removeLinea(l.id)}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="nd-grid-shell" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(280px,1fr)', gap: 14 }}>
            <div>
              <div className="nd-stage">
                <div className="nd-stage-head"><span style={{ fontSize: 13, fontWeight: 800, color: '#fb923c' }}>4 - Observacion</span></div>
                <div className="nd-stage-body"><textarea className="nd-textarea" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Observaciones internas..." /></div>
              </div>
              {!condicionSinMedioPago && (
                <div className="nd-stage" style={{ marginTop: 14 }}>
                  <div className="nd-stage-head"><span style={{ fontSize: 13, fontWeight: 800, color: '#fb923c' }}>Medio de pago</span></div>
                  <div className="nd-stage-body">
                    {liquidacionPagos.map((pago) => (
                      <div key={pago.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                        <select className="nd-select" style={{ flex: '0 0 180px' }} value={pago.tipoMedioPago} onChange={(e) => setLiquidacionPagos((prev) => prev.map((p) => p.id === pago.id ? { ...p, tipoMedioPago: e.target.value } : p))}>{FE_MEDIO_PAGO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                        <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>CRC {money(liquidacionTotal(liquidacionPagos))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="nd-total-card">
                <div className="nd-total-row"><span className="k">Subtotal bruto</span><span className="v">CRC {money(resumen.subtotal)}</span></div>
                {resumen.descuento > 0 && <div className="nd-total-row"><span className="k">Descuentos</span><span className="v" style={{ color: '#fca5a5' }}>-CRC {money(resumen.descuento)}</span></div>}
                <div className="nd-total-row"><span className="k">IVA</span><span className="v">CRC {money(resumen.impuesto)}</span></div>
                <div className="nd-total-row grand"><span className="k">TOTAL ND</span><span className="v">CRC {money(resumen.total)}</span></div>
              </div>
              {refDoc && validaciones.length > 0 && <div className="nd-msg-warn" style={{ marginTop: 12 }}><strong>Pendiente para confirmar:</strong><ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11 }}>{validaciones.map((v, i) => <li key={i}>{v}</li>)}</ul></div>}
              <div className="nd-footer">
                <button className="nd-btn" disabled={busy || lineasValidas.length === 0} onClick={() => guardar('borrador')}>Guardar borrador</button>
                <button className="nd-btn success" disabled={busy || !canConfirm} onClick={() => guardar('confirmado')}>{busy ? 'Procesando...' : 'Emitir ND en firme'}</button>
              </div>
            </div>
          </div>
        </div>
      </WorkspaceMainPanel>

      {busqModal && (
        <div className="nd-modal-backdrop" onClick={() => setBusqModal(false)}>
          <div className="nd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nd-modal-head"><span className="nd-modal-title">Seleccionar documento de referencia</span><button className="nd-btn" onClick={() => setBusqModal(false)}>Cerrar</button></div>
            <div className="nd-modal-body">
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <input className="nd-input" style={{ flex: 1 }} placeholder="Numero, nombre del cliente, clave MH..." value={busqRef} onChange={(e) => setBusqRef(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarRefDoc()} autoFocus />
                <button className="nd-btn orange" onClick={buscarRefDoc} disabled={busqLoading || !busqRef.trim()}>{busqLoading ? 'Buscando...' : 'Buscar'}</button>
              </div>
              {!busqLoading && busqRef.trim() && busqResultados.length === 0 && <div className="nd-msg-warn" style={{ marginBottom: 0 }}>No se encontraron documentos aceptados por MH con ese criterio.</div>}
              {busqResultados.length > 0 && (
                <>
                <div className="nd-mobile-hint">Desliza horizontalmente para revisar resultados y montos.</div>
                <div className="nd-scroll">
                <table className="nd-modal-table">
                  <thead><tr><th>Tipo</th><th>Numero</th><th>Fecha</th><th>Cliente</th><th>Total</th></tr></thead>
                  <tbody>
                    {busqResultados.map((doc) => (
                      <tr key={doc.id} onClick={() => void seleccionarRefDoc(doc)}>
                        <td>{DOC_LABEL[doc.tipo_documento] || doc.tipo_documento}</td>
                        <td style={{ fontFamily: 'monospace' }}>{doc.numero_consecutivo || '-'}</td>
                        <td>{doc.fecha_emision}</td>
                        <td>{doc.receptor_nombre || 'Consumidor final'}</td>
                        <td style={{ fontFamily: 'monospace' }}>CRC {money(Number(doc.total_comprobante || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
