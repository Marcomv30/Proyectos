import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import FormAsiento from './FormAsiento';
import { exportCsv, exportExcelXml, exportPdfWithPrint, formatMoneyCRC, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';

const ASIENTO_OPEN_PREFILL_KEY = 'mya_asiento_open_prefill';

interface Asiento {
  id: number;
  numero_formato: string;
  fecha: string;
  descripcion: string;
  moneda: string;
  tipo_cambio: number;
  estado: string;
  categoria_id: number;
  empresa_id: number;
  asiento_categorias: { codigo: string; descripcion: string };
}

interface CategoriaAsiento {
  categoria_id: number;
  categoria_base_id: number;
  codigo: string;
  descripcion: string;
  tipo_id: number | null;
  modo: 'override_empresa' | 'herencia_base';
}

interface TipoAsiento {
  id: number;
  codigo: string;
  nombre: string;
  color: string;
  activo: boolean;
}

interface ConsolidadoTipo {
  tipo_id: number;
  tipo_codigo: string;
  tipo_nombre: string;
  cantidad_asientos: number;
  total_debito_crc: number;
  total_credito_crc: number;
}

interface EmpresaParametrosResp {
  fiscal?: {
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
  };
  cierre_contable?: {
    activo?: boolean;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
    modulos_aplica?: string[] | null;
  };
}

const styles = `
  .asi-wrap { padding:0; color:#d6e2ff; }
  .asi-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:16px; }
  .asi-head-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
  .asi-title { font-size:20px; font-weight:700; color:#f8fbff; letter-spacing:-0.03em; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  .asi-title span { font-size:13px; font-weight:500; color:#8ea3c7; margin-left:0; }
  .asi-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:18px; }
  .asi-export { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }
  .asi-export-btn { padding:8px 13px; border-radius:11px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; color:#d6e2ff; font-size:12px; font-weight:700; cursor:pointer; }
  .asi-export-btn:hover { border-color:#4c7bf7; color:#ffffff; background:#243149; }
  .asi-search { padding:10px 14px; border:1px solid rgba(137,160,201,0.22); border-radius:12px;
    font-size:13px; color:#f3f7ff; outline:none; width:260px; background:#1d2738;
    font-family:'DM Sans',sans-serif; transition:border-color 0.2s, box-shadow 0.2s; }
  .asi-search::placeholder { color:#8ea3c7; }
  .asi-search:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .asi-filtros { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
  .asi-filter-group { display:flex; flex-direction:column; gap:5px; min-width:170px; }
  .asi-filter-label { font-size:11px; font-weight:700; color:#8ea3c7; letter-spacing:.04em; text-transform:uppercase; }
  .asi-filter-select { height:42px; padding:0 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; color:#f3f7ff; outline:none; font-family:'DM Sans',sans-serif; background:#1d2738; font-weight:700; }
  .asi-filter-select:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .asi-table-wrap { background:#172131; border-radius:16px; border:1px solid rgba(137,160,201,0.18);
    overflow-x:auto; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .asi-table { width:100%; min-width:760px; border-collapse:collapse; }
  .asi-table thead { background:#131b2a; }
  .asi-table th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600;
    color:#8ea3c7; letter-spacing:0.06em; text-transform:uppercase; border-bottom:1px solid rgba(137,160,201,0.16); }
  .asi-table td { padding:12px 16px; font-size:13px; color:#d6e2ff; border-bottom:1px solid rgba(137,160,201,0.12); }
  .asi-table tr:last-child td { border-bottom:none; }
  .asi-table tr:hover td { filter:brightness(1.04); cursor:pointer; }
  .asi-mobile-list { display:none; }
  .asi-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px; margin-bottom:8px; }
  .asi-card-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .asi-card-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
  .asi-card-row { display:flex; flex-direction:column; gap:2px; }
  .asi-card-label { font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; }
  .asi-num { font-family:'DM Mono',monospace; font-weight:700; color:#9df4c7; font-size:12px; }
  .asi-fecha { font-family:'DM Mono',monospace; font-size:12px; color:#9bb0d3; }
  .estado-badge { display:inline-flex; align-items:center; padding:3px 8px;
    border-radius:6px; font-size:11px; font-weight:600; }
  .estado-BORRADOR { background:rgba(245,158,11,0.14); color:#ffcb74; }
  .estado-CONFIRMADO { background:rgba(29,110,79,0.18); color:#9df4c7; }
  .estado-ANULADO { background:rgba(125,47,58,0.22); color:#ffb3bb; }
  .cat-badge { display:inline-flex; align-items:center; padding:3px 8px;
    border-radius:6px; font-size:11px; font-weight:600;
    background:#1f2f4c; color:#9ec3ff; font-family:'DM Mono',monospace; }
  .asi-actions { display:flex; gap:6px; }
  .btn-ver { padding:6px 12px; background:#243149; border:1px solid rgba(76,123,247,0.34);
    border-radius:9px; color:#9ec3ff; font-size:11px; font-weight:700; cursor:pointer; }
  .btn-ver:hover { background:#2c3c58; color:white; }
  .btn-ver:disabled { background:#1b2433; border-color:rgba(137,160,201,0.14); color:#7184a8; cursor:not-allowed; }
  .btn-anular { padding:6px 12px; background:#34181c; border:1px solid #7d2f3a;
    border-radius:9px; color:#ffb3bb; font-size:11px; font-weight:700; cursor:pointer; }
  .btn-anular:hover { filter:brightness(1.06); color:white; }
  .btn-anular:disabled { background:#1b2433; border-color:rgba(137,160,201,0.14); color:#7184a8; cursor:not-allowed; }
  .asi-empty { padding:48px; text-align:center; color:#8ea3c7; font-size:13px; }
  .asi-stats { display:flex; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
  .asi-stat { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px;
    padding:14px 18px; display:flex; flex-direction:column; gap:4px; min-width:120px; box-shadow:0 16px 28px rgba(3,8,20,.16); }
  .asi-stat-num { font-size:20px; font-weight:800; color:#f3f7ff; }
  .asi-stat-label { font-size:11px; color:#8ea3c7; font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
  .money-head { text-align:right !important; }
  .money-right { text-align:right !important; }
  .money-cell { font-family:'DM Mono',monospace; }
  .btn-nuevo { padding:12px 18px; background:linear-gradient(135deg,#17a34a,#22c55e);
    border:none; border-radius:10px; color:white; font-size:13px; font-weight:600;
    cursor:pointer; transition:opacity 0.2s, transform 0.2s; box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .btn-nuevo:hover { opacity:0.95; transform:translateY(-1px); }
  .btn-nuevo:disabled { opacity:0.55; cursor:not-allowed; }
  .anio-select { height:42px; padding:0 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px;
    font-size:13px; color:#f3f7ff; outline:none; font-family:'DM Sans',sans-serif; background:#1d2738; font-weight:700; }
  .asi-periodo { margin-bottom:10px; font-size:12px; color:#9df4c7; text-align:right; }
  .asi-periodo .lbl { font-weight:700; margin-right:6px; color:#9df4c7; }
  .asi-periodo-fiscal { margin-bottom:6px; font-size:12px; color:#8ab4ff; text-align:right; }
  .asi-periodo-fiscal .lbl { font-weight:700; margin-right:6px; color:#8ab4ff; }
  .asi-periodo-estado { margin-bottom:6px; font-size:12px; color:#d6e2ff; text-align:right; }
  .asi-periodo-estado .lbl { font-weight:700; margin-right:6px; color:#d6e2ff; }
  .asi-warn { margin:0 0 12px; padding:10px 12px; border:1px solid #936b1d; background:#332914; color:#ffd66f; border-radius:12px; font-size:12px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .asi-warn-btn { padding:8px 10px; border-radius:10px; border:1px solid #936b1d; background:#201a12; color:#ffd66f; font-size:12px; font-weight:700; cursor:pointer; }
  .asi-warn-btn:hover { background:#3a311b; }
  .asi-modal-backdrop { position:fixed; inset:0; background:rgba(6,10,18,0.72); display:flex; align-items:center; justify-content:center; z-index:1200; padding:16px; }
  .asi-modal { width:min(460px, 100%); background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; padding:16px; }
  .asi-modal-title { font-size:16px; font-weight:700; color:#f3f7ff; margin-bottom:6px; }
  .asi-modal-sub { font-size:12px; color:#8ea3c7; margin-bottom:12px; }
  .asi-modal-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
  .asi-modal-field { display:flex; flex-direction:column; gap:4px; }
  .asi-modal-field label { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.04em; }
  .asi-modal-field input { width:100%; border:1px solid rgba(137,160,201,0.22); border-radius:10px; padding:8px 10px; font-size:12px; background:#1d2738; color:#f3f7ff; }
  .asi-modal-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:8px; }
  .asi-modal-btn { padding:8px 10px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid rgba(137,160,201,0.22); background:#243149; color:#d6e2ff; }
  .asi-modal-btn.primary { border-color:#1d6e4f; background:#123224; color:#9df4c7; }
  .asi-modal-btn:disabled { opacity:.6; cursor:not-allowed; }
  .asi-modal-err { margin-bottom:8px; border:1px solid #7d2f3a; background:#34181c; color:#ffb3bb; border-radius:10px; padding:8px 10px; font-size:12px; }

  @media (max-width: 900px) {
    .asi-header { flex-wrap:wrap; gap:10px; }
    .asi-title { font-size:20px; }
    .asi-toolbar { gap:8px; }
    .asi-search { width:100%; }
    .anio-select { width:100%; }
    .btn-nuevo { width:100%; }
    .asi-stats { gap:8px; }
    .asi-stat { min-width:calc(50% - 4px); padding:10px 12px; }
    .asi-export { margin-left:0; width:100%; }
    .asi-export-btn { flex:1; text-align:center; }
  }

  @media (max-width: 620px) {
    .asi-title span { display:block; margin-left:0; margin-top:2px; }
    .asi-stat { min-width:100%; }
    .asi-table-wrap { display:none; }
    .asi-mobile-list { display:block; }
    .asi-actions { flex-direction:column; align-items:stretch; }
    .btn-ver, .btn-anular { width:100%; text-align:center; }
  }
`;

export default function ListaAsientos({ empresaId, canConfigurarCierreRapido = false }: { empresaId: number; canConfigurarCierreRapido?: boolean }) {
  const [asientos, setAsientos] = useState<Asiento[]>([]);
  const [categorias, setCategorias] = useState<CategoriaAsiento[]>([]);
  const [tipos, setTipos] = useState<TipoAsiento[]>([]);
  const [consolidado, setConsolidado] = useState<ConsolidadoTipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<'lista' | 'nuevo' | 'ver'>('lista');
  const [asientoVer, setAsientoVer] = useState<Asiento | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState<number | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [categoriasById, setCategoriasById] = useState<Record<number, CategoriaAsiento>>({});
  const [errorLista, setErrorLista] = useState('');
  const [errorConsolidado, setErrorConsolidado] = useState('');
  const [cierreContable, setCierreContable] = useState<{
    activo: boolean;
    fechaInicio: string | null;
    fechaFin: string | null;
    fiscalInicio: string | null;
    fiscalFin: string | null;
    modulosAplica: string[];
  }>({ activo: false, fechaInicio: null, fechaFin: null, fiscalInicio: null, fiscalFin: null, modulosAplica: ['contabilidad'] });
  const [cierreLoaded, setCierreLoaded] = useState(false);
  const cierreActivo = Boolean(cierreContable.activo);
  const cierreConRango = Boolean(cierreContable.fechaInicio && cierreContable.fechaFin);
  const periodoConfigurado = cierreActivo && cierreConRango;
  const estadoCierreTexto = !cierreLoaded
    ? 'Cargando...'
    : (periodoConfigurado
        ? 'Periodo Cerrado'
        : (cierreActivo ? 'Cierre activo sin rango' : 'Sin cierre activo'));
  const puedeOperarAsientos = true;
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [cfgInicio, setCfgInicio] = useState('');
  const [cfgFin, setCfgFin] = useState('');
  const [cfgErr, setCfgErr] = useState('');
  const [cfgSaving, setCfgSaving] = useState(false);

  const formatMoney = (n: number, moneda: 'CRC' | 'USD' = 'CRC') => {
    const valor = Number(n || 0);
    if (moneda === 'USD') {
      return `$ ${valor.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `₡ ${formatMoneyCRC(valor)}`;
  };


  const formatFechaDDMMAAAA = (value: string | null) => {
    if (!value) return '';
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(value);
    return `${m[3]}/${m[2]}/${m[1]}`;
  };
  const fechaHoy = formatFechaDDMMAAAA(new Date().toISOString().slice(0, 10));
  const periodoTexto = (() => {
    if (!cierreLoaded) return 'Cargando...';
    const ini = formatFechaDDMMAAAA(cierreContable.fechaInicio);
    const fin = formatFechaDDMMAAAA(cierreContable.fechaFin);
    if (ini && fin) return `${ini} al ${fin}`;
    if (ini) return `Desde ${ini}`;
    if (fin) return `Hasta ${fin}`;
    return `No configurado (${fechaHoy})`;
  })();
  const periodoFiscalTexto = (() => {
    if (!cierreLoaded) return 'Cargando...';
    const ini = formatFechaDDMMAAAA(cierreContable.fiscalInicio);
    const fin = formatFechaDDMMAAAA(cierreContable.fiscalFin);
    if (ini && fin) return `${ini} al ${fin}`;
    if (ini) return `Desde ${ini}`;
    if (fin) return `Hasta ${fin}`;
    return 'No configurado';
  })();

  const cargar = async () => {
    setCargando(true);
    setErrorLista('');
    let query = supabase
      .from('asientos')
      .select('*, asiento_categorias(codigo, descripcion)')
      .eq('empresa_id', empresaId)
      .order('id', { ascending: false });

    const { data, error } = await query;
    if (error) {
      setAsientos([]);
      setErrorLista(error.message || 'No se pudo cargar la lista de asientos');
    } else if (data) {
      setAsientos(data as any);
    }
    setCargando(false);
  };

  const cargarCategorias = async () => {
    const { data, error } = await supabase.rpc('get_asiento_categorias_effective', {
      p_empresa_id: empresaId,
    });

    if (!error && data) {
      const catRows = data as CategoriaAsiento[];
      setCategorias(catRows);
      const map: Record<number, CategoriaAsiento> = {};
      catRows.forEach((c) => { map[c.categoria_base_id] = c; });
      setCategoriasById(map);
      return;
    }

    const { data: fallback } = await supabase
      .from('asiento_categorias')
      .select('id, codigo, descripcion, tipo_id, activo')
      .eq('activo', true)
      .order('codigo');

    if (fallback) {
      const mapped = fallback.map((c: any) => ({
        categoria_id: c.id,
        categoria_base_id: c.id,
        codigo: c.codigo,
        descripcion: c.descripcion,
        tipo_id: c.tipo_id ?? null,
        modo: 'herencia_base' as const,
      }));
      setCategorias(mapped);
      const map: Record<number, CategoriaAsiento> = {};
      mapped.forEach((c) => { map[c.categoria_base_id] = c; });
      setCategoriasById(map);
    }
  };

  const cargarTipos = async () => {
    const { data } = await supabase
      .from('asiento_tipos')
      .select('id, codigo, nombre, color, activo')
      .eq('activo', true)
      .order('orden')
      .order('codigo');
    if (data) setTipos(data as TipoAsiento[]);
  };

  const cargarConsolidado = async (anioTarget: number) => {
    setErrorConsolidado('');
    const fechaDesde = `${anioTarget}-01-01`;
    const fechaHasta = `${anioTarget}-12-31`;
    const { data, error } = await supabase.rpc('reporte_asientos_por_tipo', {
      p_empresa_id: empresaId,
      p_fecha_desde: fechaDesde,
      p_fecha_hasta: fechaHasta,
    });
    if (error) {
      setConsolidado([]);
      setErrorConsolidado(error.message || 'No se pudo cargar el consolidado por tipo');
    } else {
      setConsolidado((data || []) as ConsolidadoTipo[]);
    }
  };

  const cargarPeriodoContable = async () => {
    setCierreLoaded(false);
    const { data, error } = await supabase.rpc('get_empresa_parametros', { p_empresa_id: empresaId });
    if (error || !data) {
      setCierreContable({ activo: false, fechaInicio: null, fechaFin: null, fiscalInicio: null, fiscalFin: null, modulosAplica: ['contabilidad'] });
      setCierreLoaded(true);
      return;
    }
    const parsed = data as EmpresaParametrosResp;
    setCierreContable({
      activo: Boolean(parsed?.cierre_contable?.activo),
      fechaInicio: parsed?.cierre_contable?.fecha_inicio || null,
      fechaFin: parsed?.cierre_contable?.fecha_fin || null,
      fiscalInicio: parsed?.fiscal?.fecha_inicio || null,
      fiscalFin: parsed?.fiscal?.fecha_fin || null,
      modulosAplica: (parsed?.cierre_contable?.modulos_aplica || ['contabilidad']) as string[],
    });
    setCierreLoaded(true);
  };

  const guardarConfiguracionRapida = async () => {
    setCfgErr('');
    if (!cfgInicio || !cfgFin) {
      setCfgErr('Debe indicar Inicio y Final del cierre contable.');
      return;
    }
    if (cfgInicio > cfgFin) {
      setCfgErr('Rango invalido: Inicio no puede ser mayor que Final.');
      return;
    }
    setCfgSaving(true);
    const modulos = cierreContable.modulosAplica?.length ? cierreContable.modulosAplica : ['contabilidad'];
    const { error } = await supabase.rpc('set_empresa_parametros', {
      p_empresa_id: empresaId,
      p_payload: {
        cierre_contable: {
          activo: true,
          fecha_inicio: cfgInicio,
          fecha_fin: cfgFin,
          modulos_aplica: modulos,
        },
      },
    });
    setCfgSaving(false);
    if (error) {
      setCfgErr(error.message || 'No se pudo guardar la configuracion de cierre.');
      return;
    }
    setShowConfigModal(false);
    await cargarPeriodoContable();
  };

  useEffect(() => { cargar(); cargarCategorias(); cargarTipos(); cargarPeriodoContable(); }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargarConsolidado(anio); }, [empresaId, anio]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (vista !== 'lista' || asientos.length === 0) return;
    try {
      const raw = sessionStorage.getItem(ASIENTO_OPEN_PREFILL_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { empresaId?: number; asientoId?: number };
      if (Number(data.empresaId || 0) !== Number(empresaId)) return;
      const targetId = Number(data.asientoId || 0);
      if (!targetId) return;
      const target = asientos.find((a) => Number(a.id) === targetId);
      if (!target) return;
      setAsientoVer(target);
      setVista('ver');
      sessionStorage.removeItem(ASIENTO_OPEN_PREFILL_KEY);
    } catch {
      // ignore storage errors
    }
  }, [asientos, vista, empresaId]);

    const anular = async (asiento: Asiento) => {
      if (!window.confirm(`¿Anular el asiento ${asiento.numero_formato}?`)) return;
      
      // Revertir saldos primero
      await supabase.rpc('revertir_saldos_asiento', {
        p_asiento_id: asiento.id
      });
      
      // Luego anular
      await supabase.from('asientos').update({ estado: 'ANULADO' }).eq('id', asiento.id);
      cargar();
    };

  const asientosFiltrados = asientos.filter(a => {
    if (filtroEstado && a.estado !== filtroEstado) return false;
    if (filtroCategoria && a.categoria_id !== filtroCategoria) return false;
    if (filtroTipo) {
      const cat = categoriasById[a.categoria_id];
      if (!cat || cat.tipo_id !== filtroTipo) return false;
    }
    if (busqueda) {
      const b = busqueda.toLowerCase();
      return a.numero_formato?.toLowerCase().includes(b) ||
        a.descripcion.toLowerCase().includes(b);
    }
    return true;
  });

  const stats = {
    total: asientos.length,
    borradores: asientos.filter(a => a.estado === 'BORRADOR').length,
    confirmados: asientos.filter(a => a.estado === 'CONFIRMADO').length,
    anulados: asientos.filter(a => a.estado === 'ANULADO').length,
  };

  const exportRows = asientosFiltrados.map((a) => ({
    numero: a.numero_formato,
    categoria: categoriasById[a.categoria_id]?.codigo || (a.asiento_categorias as any)?.codigo || '',
    fecha: a.fecha,
    descripcion: a.descripcion,
    moneda: a.moneda,
    tipo_cambio: a.tipo_cambio ?? '',
    estado: a.estado,
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'numero', title: 'Numero', getValue: (r) => r.numero, align: 'left', width: '15%' },
    { key: 'categoria', title: 'Categoria', getValue: (r) => r.categoria, width: '10%' },
    { key: 'fecha', title: 'Fecha', getValue: (r) => r.fecha, width: '12%' },
    { key: 'descripcion', title: 'Descripcion', getValue: (r) => r.descripcion, align: 'left', width: '33%' },
    { key: 'moneda', title: 'Moneda', getValue: (r) => r.moneda, width: '8%' },
    { key: 'tipo_cambio', title: 'Tipo Cambio', getValue: (r) => r.tipo_cambio, width: '10%' },
    { key: 'estado', title: 'Estado', getValue: (r) => r.estado, width: '12%' },
  ];

  if (vista === 'nuevo') {
    return <FormAsiento
      empresaId={empresaId}
      onGuardar={() => { setVista('lista'); cargar(); }}
      onCancelar={() => setVista('lista')}
    />;
  }

  if (vista === 'ver' && asientoVer) {
    return <FormAsiento
      empresaId={empresaId}
      asiento={asientoVer}
      onGuardar={() => { setVista('lista'); cargar(); }}
      onCancelar={() => setVista('lista')}
    />;
  }

  return (
    <>
      <style>{styles}</style>
      <div className="asi-wrap">
        <div className="asi-header">
          <div className="asi-title">
            Asientos Contables
            <span>{asientosFiltrados.length} registros</span>
          </div>
          <div className="asi-head-right">
            <div className="asi-periodo-estado">
              <span className="lbl">Estado:</span>
              {estadoCierreTexto}
            </div>
            <div className="asi-periodo-fiscal">
              <span className="lbl">Periodo Fiscal:</span>
              {periodoFiscalTexto}
            </div>
            <div className="asi-periodo">
              <span className="lbl">Periodo Contable:</span>
              {periodoTexto}
            </div>
            <button
              className="btn-nuevo"
              onClick={() => setVista('nuevo')}
              disabled={!puedeOperarAsientos}
              title={!puedeOperarAsientos ? 'Operacion no disponible' : undefined}
            >
              + Añadir Asiento
            </button>
          </div>
        </div>

        {cierreLoaded && cierreActivo && !cierreConRango && (
          <div className="asi-warn">
            <span>
              Cierre activo sin rango completo: defina inicio/fin para aplicar bloqueo por fechas.
            </span>
            {canConfigurarCierreRapido && (
              <button
                className="asi-warn-btn"
                onClick={() => {
                  setCfgInicio(cierreContable.fechaInicio || '');
                  setCfgFin(cierreContable.fechaFin || '');
                  setCfgErr('');
                  setShowConfigModal(true);
                }}
              >
                Configurar cierre
              </button>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="asi-stats">
          <div className="asi-stat">
            <span className="asi-stat-num">{stats.total}</span>
            <span className="asi-stat-label">Total</span>
          </div>
          <div className="asi-stat">
            <span className="asi-stat-num" style={{ color: '#854d0e' }}>{stats.borradores}</span>
            <span className="asi-stat-label">Borradores</span>
          </div>
          <div className="asi-stat">
            <span className="asi-stat-num" style={{ color: '#16a34a' }}>{stats.confirmados}</span>
            <span className="asi-stat-label">Confirmados</span>
          </div>
          <div className="asi-stat">
            <span className="asi-stat-num" style={{ color: '#dc2626' }}>{stats.anulados}</span>
            <span className="asi-stat-label">Anulados</span>
          </div>
        </div>

        <div className="asi-table-wrap" style={{ marginBottom: '14px' }}>
          {errorConsolidado && (
            <div style={{ margin: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
              Error consolidado: {errorConsolidado}
            </div>
          )}
          <table className="asi-table">
            <thead>
              <tr>
                <th>Consolidado por Tipo ({anio})</th>
                <th>Asientos</th>
                <th>Moneda</th>
                <th className="money-head">Debito</th>
                <th className="money-head">Credito</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.length === 0 ? (
                <tr><td colSpan={5} className="asi-empty">Sin movimientos confirmados para el año seleccionado</td></tr>
              ) : consolidado.map((row) => (
                <tr key={row.tipo_id}>
                  <td>
                    <span className="cat-badge">{row.tipo_codigo}</span>
                    <span style={{ marginLeft: '8px' }}>{row.tipo_nombre}</span>
                  </td>
                  <td style={{ fontFamily: 'DM Mono, monospace' }}>{row.cantidad_asientos}</td>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>CRC</td>
                  <td className="money-cell money-right">{formatMoney(Number(row.total_debito_crc || 0), 'CRC')}</td>
                  <td className="money-cell money-right">{formatMoney(Number(row.total_credito_crc || 0), 'CRC')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {errorLista && (
          <div style={{ marginBottom: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
            Error lista: {errorLista}
          </div>
        )}

        {/* Toolbar */}
        <ListToolbar
          className="asi-toolbar"
          search={(
            <>
              <input className="asi-search" placeholder="Buscar número o descripción..."
                value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              <select className="anio-select" value={anio}
                onChange={e => setAnio(parseInt(e.target.value, 10))}>
                {[2023, 2024, 2025, 2026].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </>
          )}
          filters={(
            <>
              <div className="asi-filtros">
                <div className="asi-filter-group">
                  <span className="asi-filter-label">Estado</span>
                  <select
                    className="asi-filter-select"
                    value={filtroEstado || ''}
                    onChange={e => setFiltroEstado(e.target.value || null)}
                  >
                    <option value="">Todos</option>
                    <option value="BORRADOR">Borrador</option>
                    <option value="CONFIRMADO">Confirmado</option>
                    <option value="ANULADO">Anulado</option>
                  </select>
                </div>

                <div className="asi-filter-group">
                  <span className="asi-filter-label">Tipo</span>
                  <select
                    className="asi-filter-select"
                    value={filtroTipo || ''}
                    onChange={e => setFiltroTipo(e.target.value ? parseInt(e.target.value, 10) : null)}
                  >
                    <option value="">Todos</option>
                    {tipos.map(tipo => (
                      <option key={tipo.id} value={tipo.id}>{tipo.codigo} - {tipo.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="asi-filter-group" style={{ minWidth: '220px' }}>
                  <span className="asi-filter-label">Categoria</span>
                  <select
                    className="asi-filter-select"
                    value={filtroCategoria || ''}
                    onChange={e => setFiltroCategoria(e.target.value ? parseInt(e.target.value, 10) : null)}
                  >
                    <option value="">Todas</option>
                    {categorias.map(cat => (
                      <option key={cat.categoria_id} value={cat.categoria_base_id}>{cat.codigo} - {cat.descripcion}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
          exports={(
            <>
              <button
                className="asi-export-btn"
                onClick={() => exportCsv('asientos_contables.csv', exportRows, exportColumns)}
                disabled={exportRows.length === 0}
              >
                CSV
              </button>
              <button
                className="asi-export-btn"
                onClick={() => exportExcelXml('asientos_contables.xls', exportRows, exportColumns)}
                disabled={exportRows.length === 0}
              >
                EXCEL
              </button>
              <button
                className="asi-export-btn"
                onClick={() =>
                  exportPdfWithPrint({
                    title: 'Asientos Contables',
                    subtitle: `Total: ${exportRows.length} registros`,
                    rows: exportRows,
                    columns: exportColumns,
                    orientation: 'landscape',
                  })
                }
                disabled={exportRows.length === 0}
              >
                PDF
              </button>
            </>
          )}
        />

        {/* Tabla Desktop */}
        <div className="asi-table-wrap">
          <table className="asi-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Categoría</th>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Moneda</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={7} className="asi-empty">Cargando asientos...</td></tr>
              ) : asientosFiltrados.length === 0 ? (
                <tr><td colSpan={7} className="asi-empty">No hay asientos registrados</td></tr>
              ) : asientosFiltrados.map(asi => (
                <tr key={asi.id} onClick={() => { if (puedeOperarAsientos) { setAsientoVer(asi); setVista('ver'); } }}>
                  <td><span className="asi-num">{asi.numero_formato}</span></td>
                  <td>
                    <span className="cat-badge">
                      {categoriasById[asi.categoria_id]?.codigo || (asi.asiento_categorias as any)?.codigo}
                    </span>
                  </td>
                  <td><span className="asi-fecha">{asi.fecha}</span></td>
                  <td>{asi.descripcion}</td>
                  <td>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>
                      {asi.moneda} {(asi.moneda === 'USD' || asi.moneda === 'AMBAS') ? `TC Venta: ${asi.tipo_cambio}` : ''}
                    </span>
                  </td>
                  <td>
                    <span className={`estado-badge estado-${asi.estado}`}>{asi.estado}</span>
                  </td>
                  <td>
                    <div className="asi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn-ver"
                        onClick={() => { setAsientoVer(asi); setVista('ver'); }}
                        disabled={!puedeOperarAsientos}>
                        Ver
                      </button>
                      {asi.estado !== 'ANULADO' && asi.estado !== 'BORRADOR' && (
                        <button className="btn-anular" onClick={() => anular(asi)} disabled={!puedeOperarAsientos}>
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards Mobile */}
        <div className="asi-mobile-list">
          {cargando ? (
            <div className="asi-empty">Cargando asientos...</div>
          ) : asientosFiltrados.length === 0 ? (
            <div className="asi-empty">No hay asientos registrados</div>
          ) : asientosFiltrados.map((asi) => (
            <div key={`m-${asi.id}`} className="asi-card" onClick={() => { if (puedeOperarAsientos) { setAsientoVer(asi); setVista('ver'); } }}>
              <div className="asi-card-head">
                <span className="asi-num">{asi.numero_formato}</span>
                <span className={`estado-badge estado-${asi.estado}`}>{asi.estado}</span>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <span className="cat-badge">
                  {categoriasById[asi.categoria_id]?.codigo || (asi.asiento_categorias as any)?.codigo}
                </span>
              </div>
              <div className="asi-card-grid">
                <div className="asi-card-row">
                  <span className="asi-card-label">Fecha</span>
                  <span className="asi-fecha">{asi.fecha}</span>
                </div>
                <div className="asi-card-row">
                  <span className="asi-card-label">Moneda</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>
                    {asi.moneda} {(asi.moneda === 'USD' || asi.moneda === 'AMBAS') ? `TC Venta: ${asi.tipo_cambio}` : ''}
                  </span>
                </div>
              </div>
              <div style={{ marginBottom: '10px', fontSize: '13px', color: '#374151' }}>{asi.descripcion}</div>
              <div className="asi-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn-ver" onClick={() => { setAsientoVer(asi); setVista('ver'); }} disabled={!puedeOperarAsientos}>Ver</button>
                {asi.estado !== 'ANULADO' && asi.estado !== 'BORRADOR' && (
                  <button className="btn-anular" onClick={() => anular(asi)} disabled={!puedeOperarAsientos}>Anular</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {showConfigModal && (
        <div className="asi-modal-backdrop" onClick={() => { if (!cfgSaving) setShowConfigModal(false); }}>
          <div className="asi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="asi-modal-title">Configurar Cierre Contable</div>
            <div className="asi-modal-sub">Defina solo Inicio y Final para habilitar control de asientos.</div>
            {cfgErr && <div className="asi-modal-err">{cfgErr}</div>}
            <div className="asi-modal-row">
              <div className="asi-modal-field">
                <label>Inicio cierre</label>
                <input type="date" value={cfgInicio} onChange={(e) => setCfgInicio(e.target.value)} disabled={cfgSaving} />
              </div>
              <div className="asi-modal-field">
                <label>Final cierre</label>
                <input type="date" value={cfgFin} onChange={(e) => setCfgFin(e.target.value)} disabled={cfgSaving} />
              </div>
            </div>
            <div className="asi-modal-actions">
              <button className="asi-modal-btn" onClick={() => setShowConfigModal(false)} disabled={cfgSaving}>Cancelar</button>
              <button className="asi-modal-btn primary" onClick={guardarConfiguracionRapida} disabled={cfgSaving}>
                {cfgSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


