import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';

interface CarteraCxcProps {
  empresaId: number;
  canView?: boolean;
  canEdit?: boolean;
  modo?: 'cartera' | 'gestion';
  onAbrirRecaudacion?: (ctx: { terceroId: number; moneda?: 'CRC' | 'USD' }) => void;
  onAbrirTramite?: (ctx: { terceroId: number; moneda?: 'CRC' | 'USD' }) => void;
  onAbrirReportes?: () => void;
}

interface ResumenRow {
  tercero_id: number;
  tercero_nombre: string;
  tercero_identificacion: string;
  moneda: 'CRC' | 'USD';
  docs: number;
  total_pendiente: number;
  al_dia: number;
  d01_30: number;
  d31_60: number;
  d61_90: number;
  d91_mas: number;
}

interface DocRow {
  documento_id: number;
  tercero_id: number;
  tercero_nombre: string;
  tercero_identificacion: string;
  tipo_documento: string;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  moneda: 'CRC' | 'USD';
  monto_original: number;
  monto_pendiente: number;
  dias_vencidos: number;
  bucket: string;
  estado: string;
}

interface AplicacionRow {
  id: number;
  documento_id: number;
  fecha_aplicacion: string;
  tipo_aplicacion: string;
  monto: number;
  referencia: string | null;
  estado: string;
}

interface AgingRow {
  moneda: 'CRC' | 'USD' | string;
  bucket: string;
  docs: number;
  monto: number;
}

interface EstadoCuentaRow {
  fecha: string;
  movimiento: string;
  detalle: string;
  referencia: string | null;
  documento_id: number | null;
  numero_documento: string | null;
  moneda: 'CRC' | 'USD' | string;
  debito: number;
  credito: number;
  saldo: number;
}

interface DashboardRow {
  moneda: 'CRC' | 'USD' | string;
  cartera_total: number;
  cartera_vencida: number;
  porcentaje_morosidad: number;
  docs_total: number;
  docs_vencidos: number;
  clientes_con_saldo: number;
}

interface TopDeudorRow {
  tercero_id: number;
  tercero_nombre: string;
  tercero_identificacion: string;
  moneda: 'CRC' | 'USD' | string;
  total_pendiente: number;
  total_vencido: number;
  docs: number;
}

interface AlertaRow {
  documento_id: number;
  tercero_id: number;
  tercero_nombre: string;
  tercero_identificacion: string;
  numero_documento: string;
  tipo_documento: string;
  fecha_vencimiento: string | null;
  dias_vencidos: number;
  moneda: 'CRC' | 'USD' | string;
  monto_pendiente: number;
  bucket: string;
}

interface GestionRow {
  id: number;
  tercero_id: number;
  tercero_nombre: string;
  documento_id: number | null;
  numero_documento: string | null;
  fecha_gestion: string;
  canal: string;
  resultado: string;
  compromiso_fecha: string | null;
  compromiso_monto: number | null;
  observacion: string | null;
}

interface ClienteOpt {
  id: number;
  razon_social: string;
  identificacion: string | null;
}

const styles = `
  .cxc-wrap { padding:0; color:#d6e2ff; }
  .cxc-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:6px; }
  .cxc-sub { font-size:12px; color:#8ea3c7; margin-bottom:12px; }
  .cxc-msg-ok { margin-bottom:10px; border:1px solid #1d6e4f; background:#0f2c20; color:#9df4c7; border-radius:12px; padding:10px 12px; font-size:12px; }
  .cxc-msg-err { margin-bottom:10px; border:1px solid #7d2f3a; background:#34181c; color:#ffb3bb; border-radius:12px; padding:10px 12px; font-size:12px; }
  .cxc-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; padding:12px; margin-bottom:12px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .cxc-grid { display:grid; grid-template-columns: 170px 120px 1fr auto; gap:8px; align-items:end; }
  .cxc-field { display:flex; flex-direction:column; gap:4px; }
  .cxc-field label { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .cxc-input, .cxc-select { width:100%; border:1px solid rgba(137,160,201,0.22); border-radius:12px; padding:10px 12px; font-size:13px; background:#1d2738; color:#f3f7ff; }
  .cxc-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .cxc-btn { border:1px solid rgba(137,160,201,0.18); background:#243149; color:#d6e2ff; border-radius:10px; padding:8px 11px; font-size:13px; cursor:pointer; }
  .cxc-btn.main { border-color:#16a34a; background:#16a34a; color:#fff; }
  .cxc-btn:disabled { opacity:.65; cursor:not-allowed; }
  .cxc-layout { display:grid; grid-template-columns: 1fr; gap:12px; }
  .cxc-stack > .cxc-card { margin-bottom:12px; }
  .cxc-stack > .cxc-card:last-child { margin-bottom:0; }
  .cxc-fold { margin:0; }
  .cxc-fold > summary { list-style:none; cursor:pointer; font-size:13px; font-weight:700; color:#f3f7ff; display:flex; align-items:center; justify-content:space-between; }
  .cxc-fold > summary::-webkit-details-marker { display:none; }
  .cxc-fold > summary::after { content:'Mostrar'; font-size:11px; font-weight:600; color:#8ea3c7; }
  .cxc-fold[open] > summary::after { content:'Ocultar'; }
  .cxc-fold-body { margin-top:8px; }
  .cxc-table { border:1px solid rgba(137,160,201,0.18); border-radius:12px; overflow:auto; background:#1d2738; }
  .cxc-table table { width:100%; border-collapse:collapse; min-width:980px; }
  .cxc-table th, .cxc-table td { padding:8px 10px; border-top:1px solid rgba(137,160,201,0.12); font-size:12px; color:#d6e2ff; }
  .cxc-table th { background:#131b2a; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-size:11px; text-align:left; }
  .cxc-table tr.sel td { background:#243149; }
  .cxc-table tr.row-click { cursor:pointer; }
  .cxc-table .btn-mini { border:1px solid rgba(137,160,201,0.18); background:#243149; color:#d6e2ff; border-radius:8px; padding:4px 7px; font-size:11px; cursor:pointer; }
  .cxc-table .btn-mini.warn { border-color:#7d2f3a; color:#ffb3bb; background:#34181c; }
  .cxc-table .btn-mini:disabled { opacity:.65; cursor:not-allowed; }
  .cxc-sticky-actions { position: sticky; top: 10px; z-index: 5; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.18); }
  .cxc-right { text-align:right; font-family:'DM Mono',monospace; }
  .cxc-empty { color:#8ea3c7; font-size:12px; padding:10px; text-align:center; }
  .cxc-bucket { display:inline-flex; border-radius:999px; padding:2px 8px; font-size:10px; border:1px solid rgba(137,160,201,0.18); background:#243149; color:#d6e2ff; }
  .cxc-mini-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px; }
  .cxc-kpi-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px; margin-bottom:10px; }
  .cxc-kpi { border:1px solid rgba(137,160,201,0.18); border-radius:12px; padding:10px; background:#1d2738; }
  .cxc-kpi .k { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .cxc-kpi .v { margin-top:6px; font-size:20px; font-weight:700; color:#f3f7ff; }
  @media (max-width: 1200px) { .cxc-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 760px) { .cxc-grid, .cxc-mini-grid, .cxc-kpi-grid { grid-template-columns: 1fr; } }
`;

const money = (n: number, m: 'CRC' | 'USD' | string = 'CRC') =>
  new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: m === 'USD' ? 'USD' : 'CRC',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const bucketLabel = (b: string) => {
  if (b === 'AL_DIA') return 'Al dia';
  if (b === '01_30') return '1-30';
  if (b === '31_60') return '31-60';
  if (b === '61_90') return '61-90';
  if (b === '91_MAS') return '91+';
  return b;
};

export default function CarteraCxc({ empresaId, canView = true, canEdit = false, modo = 'cartera', onAbrirRecaudacion, onAbrirTramite, onAbrirReportes }: CarteraCxcProps) {
  const isGestion = modo === 'gestion';
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [fechaCorte, setFechaCorte] = useState(new Date().toISOString().slice(0, 10));
  const [moneda, setMoneda] = useState<'ALL' | 'CRC' | 'USD'>('ALL');
  const [search, setSearch] = useState('');
  const [resumen, setResumen] = useState<ResumenRow[]>([]);
  const [selectedTercero, setSelectedTercero] = useState<number | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<number | null>(null);
  const [aplicaciones, setAplicaciones] = useState<AplicacionRow[]>([]);
  const [aging, setAging] = useState<AgingRow[]>([]);
  const [estadoCuenta, setEstadoCuenta] = useState<EstadoCuentaRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardRow[]>([]);
  const [topDeudores, setTopDeudores] = useState<TopDeudorRow[]>([]);
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);
  const [gestiones, setGestiones] = useState<GestionRow[]>([]);
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [ecDesde, setEcDesde] = useState('');
  const [ecHasta, setEcHasta] = useState(new Date().toISOString().slice(0, 10));
  const [diasDesde, setDiasDesde] = useState<number>(1);
  const [diasHasta, setDiasHasta] = useState<number>(30);
  const [topLimite, setTopLimite] = useState<number>(10);

  const [nuevoTerceroId, setNuevoTerceroId] = useState<number>(0);
  const [nuevoTipo, setNuevoTipo] = useState<'FACTURA' | 'NOTA_DEBITO' | 'SALDO_INICIAL' | 'AJUSTE'>('FACTURA');
  const [nuevoNumero, setNuevoNumero] = useState('');
  const [nuevoFechaEmi, setNuevoFechaEmi] = useState(new Date().toISOString().slice(0, 10));
  const [nuevoFechaVen, setNuevoFechaVen] = useState('');
  const [nuevoMoneda, setNuevoMoneda] = useState<'CRC' | 'USD'>('CRC');
  const [nuevoMonto, setNuevoMonto] = useState<number>(0);

  const [abonoMonto, setAbonoMonto] = useState<number>(0);
  const [abonoRef, setAbonoRef] = useState('');
  const [gestionCanal, setGestionCanal] = useState<'LLAMADA' | 'WHATSAPP' | 'CORREO' | 'VISITA' | 'ACUERDO_PAGO' | 'OTRO'>('LLAMADA');
  const [gestionResultado, setGestionResultado] = useState<'PENDIENTE' | 'PROMESA_PAGO' | 'NO_LOCALIZADO' | 'RECHAZO' | 'PAGO_REALIZADO' | 'OTRO'>('PENDIENTE');
  const [gestionCompromisoFecha, setGestionCompromisoFecha] = useState('');
  const [gestionCompromisoMonto, setGestionCompromisoMonto] = useState<number>(0);
  const [gestionObs, setGestionObs] = useState('');
  const [gestionVista, setGestionVista] = useState<'inicio' | 'cobro' | 'estado' | 'tramite'>('inicio');
  const [editDoc, setEditDoc] = useState<{
    numero_documento: string;
    referencia: string;
    fecha_emision: string;
    fecha_vencimiento: string;
    monto_original: number;
    descripcion: string;
  } | null>(null);

  const resumenFiltrado = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return resumen;
    return resumen.filter((r) =>
      String(r.tercero_nombre || '').toLowerCase().includes(q) ||
      String(r.tercero_identificacion || '').toLowerCase().includes(q)
    );
  }, [resumen, search]);

  const clienteSeleccionado = useMemo(
    () => resumen.find((r) => r.tercero_id === selectedTercero) || null,
    [resumen, selectedTercero]
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
    if (!nuevoTerceroId && rows.length > 0) setNuevoTerceroId(rows[0].id);
  };

  const loadResumen = async () => {
    if (!canView) return;
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('get_cxc_cartera_resumen', {
      p_empresa_id: empresaId,
      p_fecha_corte: fechaCorte,
      p_moneda: moneda === 'ALL' ? null : moneda,
    });
    setBusy(false);
    if (error) {
      setErr(error.message || 'No se pudo cargar cartera de cuentas por cobrar.');
      setResumen([]);
      return;
    }
    const rows = (data || []) as ResumenRow[];
    setResumen(rows);
    if (selectedTercero && !rows.some((r) => r.tercero_id === selectedTercero)) {
      setSelectedTercero(null);
      setDocs([]);
      setSelectedDoc(null);
    }
  };

  const ejecutarBackfillFacturasFe = async () => {
    if (busy || !canEdit) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.');

      const resp = await fetch('/api/facturacion/backfill-cxc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudo ejecutar el backfill de facturas FE.');

      setOk(`Backfill FE listo. Evaluadas: ${json.evaluados || 0}, creadas: ${json.creados || 0}, existentes: ${json.existentes || 0}.`);
      await loadResumen();
      await loadDocs(selectedTercero);
      await loadAging(selectedTercero);
      await loadEstadoCuenta(selectedTercero);
      await loadDashboard();
      await loadAlertas();
      await loadGestiones(selectedTercero);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo ejecutar el backfill de facturas FE.'));
    } finally {
      setBusy(false);
    }
  };

  const loadDocs = async (terceroId: number | null) => {
    if (!terceroId) {
      setDocs([]);
      setSelectedDoc(null);
      return;
    }
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('get_cxc_documentos_cartera', {
      p_empresa_id: empresaId,
      p_fecha_corte: fechaCorte,
      p_tercero_id: terceroId,
      p_moneda: moneda === 'ALL' ? null : moneda,
    });
    setBusy(false);
    if (error) {
      setErr(error.message || 'No se pudo cargar documentos por cobrar.');
      setDocs([]);
      return;
    }
    const rows = (data || []) as DocRow[];
    setDocs(rows);
    if (selectedDoc && !rows.some((d) => d.documento_id === selectedDoc)) setSelectedDoc(null);
  };

  const loadAplicaciones = async (documentoId: number | null) => {
    if (!documentoId) {
      setAplicaciones([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_cxc_aplicaciones')
      .select('id,documento_id,fecha_aplicacion,tipo_aplicacion,monto,referencia,estado')
      .eq('empresa_id', empresaId)
      .eq('documento_id', documentoId)
      .order('fecha_aplicacion', { ascending: false })
      .order('id', { ascending: false });
    if (error) {
      setErr(error.message || 'No se pudo cargar aplicaciones.');
      setAplicaciones([]);
      return;
    }
    setAplicaciones((data || []) as AplicacionRow[]);
  };

  const loadAging = async (terceroId: number | null) => {
    const { data, error } = await supabase.rpc('get_cxc_aging_totales', {
      p_empresa_id: empresaId,
      p_fecha_corte: fechaCorte,
      p_moneda: moneda === 'ALL' ? null : moneda,
      p_tercero_id: terceroId,
    });
    if (error) {
      setErr(error.message || 'No se pudo cargar aging.');
      setAging([]);
      return;
    }
    setAging((data || []) as AgingRow[]);
  };

  const loadEstadoCuenta = async (terceroId: number | null) => {
    if (!terceroId) {
      setEstadoCuenta([]);
      return;
    }
    const { data, error } = await supabase.rpc('get_cxc_estado_cuenta', {
      p_empresa_id: empresaId,
      p_tercero_id: terceroId,
      p_fecha_desde: ecDesde || null,
      p_fecha_hasta: ecHasta || null,
      p_moneda: moneda === 'ALL' ? null : moneda,
    });
    if (error) {
      setErr(error.message || 'No se pudo cargar estado de cuenta.');
      setEstadoCuenta([]);
      return;
    }
    setEstadoCuenta((data || []) as EstadoCuentaRow[]);
  };

  const loadDashboard = async () => {
    const [resResumen, resTop] = await Promise.all([
      supabase.rpc('get_cxc_dashboard_resumen', {
        p_empresa_id: empresaId,
        p_fecha_corte: fechaCorte,
        p_moneda: moneda === 'ALL' ? null : moneda,
      }),
      supabase.rpc('get_cxc_dashboard_top_deudores', {
        p_empresa_id: empresaId,
        p_fecha_corte: fechaCorte,
        p_moneda: moneda === 'ALL' ? null : moneda,
        p_limite: topLimite,
      }),
    ]);
    if (resResumen.error) {
      setErr(resResumen.error.message || 'No se pudo cargar el dashboard de cartera.');
      setDashboard([]);
    } else {
      setDashboard((resResumen.data || []) as DashboardRow[]);
    }
    if (resTop.error) {
      setErr(resTop.error.message || 'No se pudo cargar top deudores.');
      setTopDeudores([]);
    } else {
      setTopDeudores((resTop.data || []) as TopDeudorRow[]);
    }
  };

  const loadAlertas = async () => {
    const { data, error } = await supabase.rpc('get_cxc_alertas_vencimiento', {
      p_empresa_id: empresaId,
      p_fecha_corte: fechaCorte,
      p_dias_desde: diasDesde,
      p_dias_hasta: diasHasta,
      p_tercero_id: selectedTercero,
      p_moneda: moneda === 'ALL' ? null : moneda,
    });
    if (error) {
      setErr(error.message || 'No se pudo cargar alertas de cobro.');
      setAlertas([]);
      return;
    }
    setAlertas((data || []) as AlertaRow[]);
  };

  const loadGestiones = async (terceroId: number | null) => {
    if (!terceroId) {
      setGestiones([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_cxc_gestion_cobro')
      .select('id,tercero_id,tercero_nombre,documento_id,numero_documento,fecha_gestion,canal,resultado,compromiso_fecha,compromiso_monto,observacion')
      .eq('empresa_id', empresaId)
      .eq('tercero_id', terceroId)
      .order('fecha_gestion', { ascending: false })
      .order('id', { ascending: false })
      .limit(100);
    if (error) {
      setErr(error.message || 'No se pudo cargar gestiones de cobro.');
      setGestiones([]);
      return;
    }
    setGestiones((data || []) as GestionRow[]);
  };

  const registrarGestion = async () => {
    if (!canEdit) return;
    if (!selectedTercero) {
      setErr('Seleccione un cliente para registrar gestion.');
      return;
    }
    if (!gestionObs.trim()) {
      setErr('Ingrese observacion de gestion.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('registrar_cxc_gestion_cobro', {
        p_empresa_id: empresaId,
        p_tercero_id: selectedTercero,
        p_documento_id: selectedDoc,
        p_canal: gestionCanal,
        p_resultado: gestionResultado,
        p_compromiso_fecha: gestionCompromisoFecha || null,
        p_compromiso_monto: gestionCompromisoMonto > 0 ? gestionCompromisoMonto : null,
        p_observacion: gestionObs,
      });
      if (error) throw error;
      setOk('Gestion de cobro registrada.');
      setGestionObs('');
      setGestionCompromisoFecha('');
      setGestionCompromisoMonto(0);
      await loadGestiones(selectedTercero);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo registrar gestion de cobro.'));
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = (
    filename: string,
    headers: string[],
    rows: Array<Array<string | number | null | undefined>>
  ) => {
    const esc = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
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

  const exportarCarteraCsv = () => {
    downloadCsv(
      `cxc_cartera_${empresaId}_${fechaCorte}.csv`,
      ['cliente', 'identificacion', 'moneda', 'docs', 'total_pendiente', 'al_dia', 'd01_30', 'd31_60', 'd61_90', 'd91_mas'],
      resumenFiltrado.map((r) => [
        r.tercero_nombre,
        r.tercero_identificacion,
        r.moneda,
        r.docs,
        r.total_pendiente,
        r.al_dia,
        r.d01_30,
        r.d31_60,
        r.d61_90,
        r.d91_mas,
      ])
    );
  };

  const exportarEstadoCuentaCsv = () => {
    if (!selectedTercero || estadoCuenta.length === 0) return;
    const c = clientes.find((x) => x.id === selectedTercero);
    downloadCsv(
      `cxc_estado_cuenta_${empresaId}_${selectedTercero}_${ecHasta || fechaCorte}.csv`,
      ['fecha', 'movimiento', 'detalle', 'referencia', 'documento_id', 'numero_documento', 'moneda', 'debito', 'credito', 'saldo'],
      estadoCuenta.map((r) => [
        r.fecha,
        r.movimiento,
        r.detalle,
        r.referencia,
        r.documento_id,
        r.numero_documento,
        r.moneda,
        r.debito,
        r.credito,
        r.saldo,
      ])
    );
    setOk(`CSV generado para estado de cuenta de ${c?.razon_social || 'cliente'}.`);
  };

  useEffect(() => {
    loadClientes();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadResumen();
  }, [empresaId, fechaCorte, moneda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadDocs(selectedTercero);
  }, [selectedTercero, fechaCorte, moneda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setEditDoc(null);
    loadAplicaciones(selectedDoc);
  }, [selectedDoc, empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAging(selectedTercero);
  }, [empresaId, fechaCorte, moneda, selectedTercero]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadEstadoCuenta(selectedTercero);
  }, [empresaId, selectedTercero, ecDesde, ecHasta, moneda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadDashboard();
  }, [empresaId, fechaCorte, moneda, topLimite]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAlertas();
  }, [empresaId, fechaCorte, moneda, diasDesde, diasHasta, selectedTercero]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadGestiones(selectedTercero);
  }, [empresaId, selectedTercero]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isGestion) return;
    if (!selectedTercero && gestionVista !== 'inicio') setGestionVista('inicio');
  }, [isGestion, selectedTercero, gestionVista]);

  const crearDocumento = async () => {
    if (!canEdit) return;
    if (!nuevoTerceroId || !nuevoNumero.trim() || nuevoMonto <= 0) {
      setErr('Cliente, numero y monto son requeridos.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.from('cxc_documentos').insert({
        empresa_id: empresaId,
        tercero_id: nuevoTerceroId,
        tipo_documento: nuevoTipo,
        numero_documento: nuevoNumero.trim(),
        fecha_emision: nuevoFechaEmi,
        fecha_vencimiento: nuevoFechaVen || null,
        moneda: nuevoMoneda,
        monto_original: nuevoMonto,
        monto_pendiente: nuevoMonto,
        estado: 'pendiente',
      });
      if (error) throw error;
      setOk('Documento por cobrar registrado.');
      setNuevoNumero('');
      setNuevoMonto(0);
      await loadResumen();
      if (selectedTercero === nuevoTerceroId) await loadDocs(selectedTercero);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo registrar documento.'));
    } finally {
      setBusy(false);
    }
  };

  const registrarAbono = async () => {
    if (!canEdit) return;
    if (!selectedDoc || abonoMonto <= 0) {
      setErr('Seleccione documento y monto de abono.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const doc = docs.find((d) => d.documento_id === selectedDoc);
      if (!doc) throw new Error('Documento no encontrado.');
      const saldoPendiente = Number(doc.monto_pendiente || 0);
      if (abonoMonto > saldoPendiente) {
        setErr(`El abono no puede exceder el saldo pendiente (${money(saldoPendiente, doc.moneda)}).`);
        setBusy(false);
        return;
      }
      const { error } = await supabase.from('cxc_aplicaciones').insert({
        empresa_id: empresaId,
        documento_id: selectedDoc,
        fecha_aplicacion: fechaCorte,
        tipo_aplicacion: 'ABONO',
        monto: abonoMonto,
        referencia: abonoRef || null,
        estado: 'activo',
      });
      if (error) throw error;
      setOk(`Abono aplicado a ${doc.numero_documento}.`);
      setAbonoMonto(0);
      setAbonoRef('');
      await loadResumen();
      await loadDocs(selectedTercero);
      await loadAplicaciones(selectedDoc);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo aplicar abono.'));
    } finally {
      setBusy(false);
    }
  };

  const startEditDoc = (doc: DocRow) => {
    setSelectedDoc(doc.documento_id);
    setEditDoc({
      numero_documento: doc.numero_documento,
      referencia: '',
      fecha_emision: doc.fecha_emision,
      fecha_vencimiento: doc.fecha_vencimiento || '',
      monto_original: Number(doc.monto_original || 0),
      descripcion: '',
    });
  };

  const guardarEdicionDocumento = async () => {
    if (!canEdit || !selectedDoc || !editDoc) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('update_cxc_documento_basico', {
        p_documento_id: selectedDoc,
        p_numero_documento: editDoc.numero_documento,
        p_referencia: editDoc.referencia || null,
        p_fecha_emision: editDoc.fecha_emision || null,
        p_fecha_vencimiento: editDoc.fecha_vencimiento || null,
        p_monto_original: editDoc.monto_original,
        p_descripcion: editDoc.descripcion || null,
      });
      if (error) throw error;
      setOk('Documento actualizado.');
      setEditDoc(null);
      await loadResumen();
      await loadDocs(selectedTercero);
      await loadAplicaciones(selectedDoc);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo editar documento.'));
    } finally {
      setBusy(false);
    }
  };

  const anularDocumento = async () => {
    if (!canEdit || !selectedDoc) return;
    if (!window.confirm('Anular documento seleccionado y sus aplicaciones activas?')) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('anular_cxc_documento', {
        p_documento_id: selectedDoc,
        p_observacion: 'Anulado desde UI CXC',
        p_anular_aplicaciones: true,
      });
      if (error) throw error;
      setOk('Documento anulado.');
      setEditDoc(null);
      await loadResumen();
      await loadDocs(selectedTercero);
      await loadAplicaciones(selectedDoc);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo anular documento.'));
    } finally {
      setBusy(false);
    }
  };

  const anularAplicacion = async (aplicacionId: number) => {
    if (!canEdit) return;
    if (!window.confirm('Anular esta aplicacion?')) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('anular_cxc_aplicacion', {
        p_aplicacion_id: aplicacionId,
        p_observacion: 'Anulada desde UI CXC',
      });
      if (error) throw error;
      setOk('Aplicacion anulada.');
      await loadResumen();
      await loadDocs(selectedTercero);
      await loadAplicaciones(selectedDoc);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo anular aplicacion.'));
    } finally {
      setBusy(false);
    }
  };

  const totalResumen = resumenFiltrado.reduce((a, r) => a + Number(r.total_pendiente || 0), 0);

  return (
    <>
      <style>{styles}</style>
      <div className="cxc-wrap">
        <div className="cxc-title">{isGestion ? 'Gestion de Cobro' : 'Cartera de Cuentas por Cobrar'}</div>
        <div className="cxc-sub">
          {isGestion
            ? 'Documentos pendientes por cliente, aplicacion de pagos y seguimiento de cobro.'
            : 'Cartera por cliente, aging y control base de documentos.'}
        </div>
        {ok ? <div className="cxc-msg-ok">{ok}</div> : null}
        {err ? <div className="cxc-msg-err">{err}</div> : null}

        <div className="cxc-card">
          <div className="cxc-grid">
            <div className="cxc-field">
              <label>Fecha corte</label>
              <input className="cxc-input" type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
            </div>
            <div className="cxc-field">
              <label>Moneda</label>
              <select className="cxc-select" value={moneda} onChange={(e) => setMoneda(e.target.value as any)}>
                <option value="ALL">Todas</option>
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="cxc-field">
              <label>Buscar cliente</label>
              <input className="cxc-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre o identificacion..." />
            </div>
            <div className="cxc-actions">
              <button
                className="cxc-btn"
                type="button"
                onClick={() => {
                  loadResumen();
                  loadDocs(selectedTercero);
                  loadAging(selectedTercero);
                  loadEstadoCuenta(selectedTercero);
                  loadDashboard();
                  loadAlertas();
                  loadGestiones(selectedTercero);
                }}
                disabled={busy}
              >
                Recargar
              </button>
              {canEdit ? (
                <button className="cxc-btn" type="button" onClick={ejecutarBackfillFacturasFe} disabled={busy}>
                  Backfill FE a CxC
                </button>
              ) : null}
              <button className="cxc-btn" type="button" onClick={exportarCarteraCsv} disabled={busy || resumenFiltrado.length === 0}>Exportar cartera CSV</button>
              <button className="cxc-btn" type="button" onClick={exportarEstadoCuentaCsv} disabled={busy || !selectedTercero || estadoCuenta.length === 0}>Exportar estado CSV</button>
            </div>
          </div>
        </div>

        {isGestion && (
          <>
            <div className="cxc-card">
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Clientes con documentos pendientes</div>
              <div className="cxc-table">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>ID</th>
                      <th>Moneda</th>
                      <th className="cxc-right">Docs</th>
                      <th className="cxc-right">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenFiltrado.length === 0 ? (
                      <tr><td colSpan={5} className="cxc-empty">No hay clientes con saldo pendiente para los filtros aplicados.</td></tr>
                    ) : resumenFiltrado.map((r) => (
                      <tr
                        key={`q-${r.tercero_id}-${r.moneda}`}
                        className={`${selectedTercero === r.tercero_id ? 'sel' : ''} row-click`}
                        onClick={() => setSelectedTercero(r.tercero_id)}
                      >
                        <td>{r.tercero_nombre}</td>
                        <td>{r.tercero_identificacion || '-'}</td>
                        <td>{r.moneda}</td>
                        <td className="cxc-right">{r.docs}</td>
                        <td className="cxc-right">{money(r.total_pendiente, r.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="cxc-card cxc-sticky-actions">
              <div className="cxc-actions" style={{ justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: '#8ea3c7' }}>
                  {clienteSeleccionado
                    ? `Cliente activo: ${clienteSeleccionado.tercero_nombre} (${clienteSeleccionado.tercero_identificacion || '-'})`
                    : 'Seleccione un cliente y una accion para iniciar la gestion.'}
                </div>
                <div className="cxc-actions">
                  <button
                    className={`cxc-btn ${gestionVista === 'cobro' ? 'main' : ''}`}
                    type="button"
                    disabled={!selectedTercero}
                    onClick={() => {
                      if (selectedTercero && onAbrirRecaudacion) {
                        onAbrirRecaudacion({ terceroId: selectedTercero, moneda: moneda === 'ALL' ? undefined : moneda });
                        return;
                      }
                      setGestionVista('cobro');
                    }}
                  >
                    Cobro
                  </button>
                  <button className="cxc-btn" type="button" onClick={() => onAbrirReportes?.()}>
                    Ver reportes
                  </button>
                  <button className={`cxc-btn ${gestionVista === 'estado' ? 'main' : ''}`} type="button" disabled={!selectedTercero} onClick={() => setGestionVista('estado')}>Estado de cuenta</button>
                  <button
                    className={`cxc-btn ${gestionVista === 'tramite' ? 'main' : ''}`}
                    type="button"
                    disabled={!selectedTercero}
                    onClick={() => {
                      if (selectedTercero && onAbrirTramite) {
                        onAbrirTramite({ terceroId: selectedTercero, moneda: moneda === 'ALL' ? undefined : moneda });
                        return;
                      }
                      setGestionVista('tramite');
                    }}
                  >
                    Tramite de cobro
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {(!isGestion || gestionVista !== 'inicio') && (
        <div className="cxc-layout">
          <div className="cxc-card">
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>
              {isGestion
                ? (gestionVista === 'estado' ? 'Estado de cuenta del cliente' : gestionVista === 'tramite' ? 'Resumen para tramite de cobro' : 'Cobro a documentos')
                : 'Dashboard ejecutivo'}
            </div>
            {!isGestion && (
              <>
            <div className="cxc-mini-grid" style={{ marginBottom: 8 }}>
              <div className="cxc-field">
                <label>Top deudores (limite)</label>
                <input className="cxc-input" type="number" min={1} max={50} value={topLimite} onChange={(e) => setTopLimite(Number(e.target.value || 10))} />
              </div>
              <div className="cxc-field">
                <label>Alerta dias desde</label>
                <input className="cxc-input" type="number" min={1} value={diasDesde} onChange={(e) => setDiasDesde(Number(e.target.value || 1))} />
              </div>
              <div className="cxc-field">
                <label>Alerta dias hasta</label>
                <input className="cxc-input" type="number" min={1} value={diasHasta} onChange={(e) => setDiasHasta(Number(e.target.value || 30))} />
              </div>
              <div className="cxc-actions" style={{ alignItems: 'end' }}>
                <button className="cxc-btn" type="button" onClick={() => { loadDashboard(); loadAlertas(); }} disabled={busy}>Actualizar KPIs</button>
              </div>
            </div>

            <div className="cxc-kpi-grid">
              {dashboard.length === 0 ? (
                <div className="cxc-kpi" style={{ gridColumn: '1 / -1' }}>
                  <div className="k">Dashboard</div>
                  <div className="v" style={{ fontSize: 14, fontWeight: 500 }}>Sin datos.</div>
                </div>
              ) : dashboard.map((k) => (
                <React.Fragment key={`kpi-${k.moneda}`}>
                  <div className="cxc-kpi">
                    <div className="k">Cartera Total ({k.moneda})</div>
                    <div className="v">{money(k.cartera_total, k.moneda)}</div>
                  </div>
                  <div className="cxc-kpi">
                    <div className="k">Cartera Vencida ({k.moneda})</div>
                    <div className="v">{money(k.cartera_vencida, k.moneda)}</div>
                  </div>
                  <div className="cxc-kpi">
                    <div className="k">Morosidad</div>
                    <div className="v">{Number(k.porcentaje_morosidad || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                  </div>
                  <div className="cxc-kpi">
                    <div className="k">Docs Vencidos / Total</div>
                    <div className="v">{k.docs_vencidos} / {k.docs_total}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>Top deudores</div>
            <div className="cxc-table">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>ID</th>
                    <th>Moneda</th>
                    <th className="cxc-right">Docs</th>
                    <th className="cxc-right">Pendiente</th>
                    <th className="cxc-right">Vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {topDeudores.length === 0 ? (
                    <tr><td colSpan={6} className="cxc-empty">Sin datos.</td></tr>
                  ) : topDeudores.map((t) => (
                    <tr key={`${t.tercero_id}-${t.moneda}`} onClick={() => setSelectedTercero(t.tercero_id)}>
                      <td>{t.tercero_nombre}</td>
                      <td>{t.tercero_identificacion || '-'}</td>
                      <td>{t.moneda}</td>
                      <td className="cxc-right">{t.docs}</td>
                      <td className="cxc-right">{money(t.total_pendiente, t.moneda)}</td>
                      <td className="cxc-right">{money(t.total_vencido, t.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', margin: '14px 0 8px' }}>Alertas de vencimiento</div>
            <div className="cxc-table">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Doc</th>
                    <th>Vence</th>
                    <th className="cxc-right">Dias</th>
                    <th>Bucket</th>
                    <th>Moneda</th>
                    <th className="cxc-right">Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {alertas.length === 0 ? (
                    <tr><td colSpan={7} className="cxc-empty">Sin alertas en el rango seleccionado.</td></tr>
                  ) : alertas.map((a) => (
                    <tr key={`a-${a.documento_id}`} onClick={() => { setSelectedTercero(a.tercero_id); setSelectedDoc(a.documento_id); }}>
                      <td>{a.tercero_nombre}</td>
                      <td>{a.numero_documento}</td>
                      <td>{a.fecha_vencimiento || '-'}</td>
                      <td className="cxc-right">{a.dias_vencidos}</td>
                      <td><span className="cxc-bucket">{bucketLabel(a.bucket)}</span></td>
                      <td>{a.moneda}</td>
                      <td className="cxc-right">{money(a.monto_pendiente, a.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            )}

            {(!isGestion || gestionVista !== 'estado') && (
              <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', marginBottom: 8 }}>
              {isGestion ? 'Documentos pendientes por cliente' : `Resumen de cartera (${money(totalResumen, moneda === 'ALL' ? 'CRC' : moneda)})`}
            </div>
            <div className="cxc-table">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>ID</th>
                    <th>Moneda</th>
                    <th className="cxc-right">Docs</th>
                    <th className="cxc-right">Pendiente</th>
                    <th className="cxc-right">Al dia</th>
                    <th className="cxc-right">1-30</th>
                    <th className="cxc-right">31-60</th>
                    <th className="cxc-right">61-90</th>
                    <th className="cxc-right">91+</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenFiltrado.length === 0 ? (
                    <tr><td colSpan={10} className="cxc-empty">Sin datos.</td></tr>
                  ) : resumenFiltrado.map((r) => (
                    <tr key={`${r.tercero_id}-${r.moneda}`} className={selectedTercero === r.tercero_id ? 'sel' : ''} onClick={() => setSelectedTercero(r.tercero_id)}>
                      <td>{r.tercero_nombre}</td>
                      <td>{r.tercero_identificacion || '-'}</td>
                      <td>{r.moneda}</td>
                      <td className="cxc-right">{r.docs}</td>
                      <td className="cxc-right">{money(r.total_pendiente, r.moneda)}</td>
                      <td className="cxc-right">{money(r.al_dia, r.moneda)}</td>
                      <td className="cxc-right">{money(r.d01_30, r.moneda)}</td>
                      <td className="cxc-right">{money(r.d31_60, r.moneda)}</td>
                      <td className="cxc-right">{money(r.d61_90, r.moneda)}</td>
                      <td className="cxc-right">{money(r.d91_mas, r.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            )}
            {!isGestion && (
              <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', margin: '14px 0 8px' }}>
              Aging consolidado {selectedTercero ? '(cliente seleccionado)' : '(todos los clientes)'}
            </div>
            <div className="cxc-table">
              <table>
                <thead>
                  <tr>
                    <th>Moneda</th>
                    <th>Bucket</th>
                    <th className="cxc-right">Docs</th>
                    <th className="cxc-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.length === 0 ? (
                    <tr><td colSpan={4} className="cxc-empty">Sin datos.</td></tr>
                  ) : aging.map((a, idx) => (
                    <tr key={`${a.moneda}-${a.bucket}-${idx}`}>
                      <td>{a.moneda}</td>
                      <td><span className="cxc-bucket">{bucketLabel(a.bucket)}</span></td>
                      <td className="cxc-right">{a.docs}</td>
                      <td className="cxc-right">{money(a.monto, a.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            )}

            {(!isGestion || gestionVista === 'estado') && (
              <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', margin: '14px 0 8px' }}>Estado de cuenta por cliente</div>
            <div className="cxc-mini-grid">
              <div className="cxc-field">
                <label>Desde</label>
                <input className="cxc-input" type="date" value={ecDesde} onChange={(e) => setEcDesde(e.target.value)} />
              </div>
              <div className="cxc-field">
                <label>Hasta</label>
                <input className="cxc-input" type="date" value={ecHasta} onChange={(e) => setEcHasta(e.target.value)} />
              </div>
              <div className="cxc-actions" style={{ alignItems: 'end' }}>
                <button className="cxc-btn" type="button" onClick={() => loadEstadoCuenta(selectedTercero)} disabled={busy || !selectedTercero}>
                  Recargar estado
                </button>
              </div>
            </div>
            <div className="cxc-table" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Movimiento</th>
                    <th>Detalle</th>
                    <th>Referencia</th>
                    <th>Doc</th>
                    <th>Moneda</th>
                    <th className="cxc-right">Debito</th>
                    <th className="cxc-right">Credito</th>
                    <th className="cxc-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {estadoCuenta.length === 0 ? (
                    <tr><td colSpan={9} className="cxc-empty">Seleccione un cliente para ver su estado de cuenta.</td></tr>
                  ) : estadoCuenta.map((r, idx) => (
                    <tr key={`${r.fecha}-${idx}-${r.documento_id || 0}`}>
                      <td>{r.fecha}</td>
                      <td>{r.movimiento}</td>
                      <td>{r.detalle}</td>
                      <td>{r.referencia || '-'}</td>
                      <td>{r.numero_documento || '-'}</td>
                      <td>{r.moneda}</td>
                      <td className="cxc-right">{r.debito > 0 ? money(r.debito, r.moneda) : '-'}</td>
                      <td className="cxc-right">{r.credito > 0 ? money(r.credito, r.moneda) : '-'}</td>
                      <td className="cxc-right">{money(r.saldo, r.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            )}
          </div>

          <div className="cxc-stack">
            {!isGestion && (
            <div className="cxc-card">
              <details className="cxc-fold" open>
                <summary>Registrar documento por cobrar</summary>
                <div className="cxc-fold-body">
                  <div className="cxc-mini-grid">
                    <div className="cxc-field">
                      <label>Cliente</label>
                      <select className="cxc-select" value={nuevoTerceroId} onChange={(e) => setNuevoTerceroId(Number(e.target.value || 0))} disabled={!canEdit || busy}>
                        <option value={0}>-- seleccione --</option>
                        {clientes.map((c) => (
                          <option key={c.id} value={c.id}>{c.razon_social} ({c.identificacion || '-'})</option>
                        ))}
                      </select>
                    </div>
                    <div className="cxc-field">
                      <label>Tipo</label>
                      <select className="cxc-select" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as any)} disabled={!canEdit || busy}>
                        <option value="FACTURA">Factura</option>
                        <option value="NOTA_DEBITO">Nota debito</option>
                        <option value="SALDO_INICIAL">Saldo inicial</option>
                        <option value="AJUSTE">Ajuste</option>
                      </select>
                    </div>
                    <div className="cxc-field">
                      <label>Numero</label>
                      <input className="cxc-input" value={nuevoNumero} onChange={(e) => setNuevoNumero(e.target.value)} disabled={!canEdit || busy} />
                    </div>
                    <div className="cxc-field">
                      <label>Monto</label>
                      <input className="cxc-input" type="number" step="0.01" value={nuevoMonto} onChange={(e) => setNuevoMonto(Number(e.target.value || 0))} disabled={!canEdit || busy} />
                    </div>
                    <div className="cxc-field">
                      <label>Fecha emision</label>
                      <input className="cxc-input" type="date" value={nuevoFechaEmi} onChange={(e) => setNuevoFechaEmi(e.target.value)} disabled={!canEdit || busy} />
                    </div>
                    <div className="cxc-field">
                      <label>Fecha vencimiento</label>
                      <input className="cxc-input" type="date" value={nuevoFechaVen} onChange={(e) => setNuevoFechaVen(e.target.value)} disabled={!canEdit || busy} />
                    </div>
                    <div className="cxc-field">
                      <label>Moneda</label>
                      <select className="cxc-select" value={nuevoMoneda} onChange={(e) => setNuevoMoneda(e.target.value as any)} disabled={!canEdit || busy}>
                        <option value="CRC">CRC</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>
                  <div className="cxc-actions" style={{ marginTop: 10 }}>
                    <button className="cxc-btn main" type="button" onClick={crearDocumento} disabled={!canEdit || busy}>
                      {busy ? 'Procesando...' : 'Registrar documento'}
                    </button>
                  </div>
                </div>
              </details>
            </div>
            )}

            {(!isGestion || gestionVista === 'cobro' || gestionVista === 'tramite') && (
            <div className="cxc-card">
              <details className="cxc-fold" open={isGestion}>
                <summary>Documentos del cliente seleccionado</summary>
                <div className="cxc-fold-body">
                  <div className="cxc-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Doc</th>
                          <th>Tipo</th>
                          <th>Emision</th>
                          <th>Vence</th>
                          <th>Bucket</th>
                          <th className="cxc-right">Original</th>
                          <th className="cxc-right">Pendiente</th>
                          <th className="cxc-right">Dias</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs.length === 0 ? (
                          <tr><td colSpan={9} className="cxc-empty">Seleccione cliente con saldo.</td></tr>
                        ) : docs.map((d) => (
                          <tr key={d.documento_id} className={selectedDoc === d.documento_id ? 'sel' : ''} onClick={() => setSelectedDoc(d.documento_id)}>
                            <td>{d.numero_documento}</td>
                            <td>{d.tipo_documento}</td>
                            <td>{d.fecha_emision}</td>
                            <td>{d.fecha_vencimiento || '-'}</td>
                            <td><span className="cxc-bucket">{bucketLabel(d.bucket)}</span></td>
                            <td className="cxc-right">{money(d.monto_original, d.moneda)}</td>
                            <td className="cxc-right">{money(d.monto_pendiente, d.moneda)}</td>
                            <td className="cxc-right">{d.dias_vencidos}</td>
                            <td>
                              <button className="btn-mini" type="button" onClick={(e) => { e.stopPropagation(); startEditDoc(d); }} disabled={!canEdit || busy || d.estado === 'anulado'}>Editar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {editDoc ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', margin: '14px 0 8px' }}>Editar documento</div>
                      <div className="cxc-mini-grid">
                        <div className="cxc-field"><label>Numero</label><input className="cxc-input" value={editDoc.numero_documento} onChange={(e) => setEditDoc((p) => p ? ({ ...p, numero_documento: e.target.value }) : p)} disabled={!canEdit || busy} /></div>
                        <div className="cxc-field"><label>Referencia</label><input className="cxc-input" value={editDoc.referencia} onChange={(e) => setEditDoc((p) => p ? ({ ...p, referencia: e.target.value }) : p)} disabled={!canEdit || busy} /></div>
                        <div className="cxc-field"><label>Fecha emision</label><input className="cxc-input" type="date" value={editDoc.fecha_emision} onChange={(e) => setEditDoc((p) => p ? ({ ...p, fecha_emision: e.target.value }) : p)} disabled={!canEdit || busy} /></div>
                        <div className="cxc-field"><label>Fecha vencimiento</label><input className="cxc-input" type="date" value={editDoc.fecha_vencimiento} onChange={(e) => setEditDoc((p) => p ? ({ ...p, fecha_vencimiento: e.target.value }) : p)} disabled={!canEdit || busy} /></div>
                        <div className="cxc-field"><label>Monto original</label><input className="cxc-input" type="number" step="0.01" value={editDoc.monto_original} onChange={(e) => setEditDoc((p) => p ? ({ ...p, monto_original: Number(e.target.value || 0) }) : p)} disabled={!canEdit || busy} /></div>
                        <div className="cxc-field"><label>Descripcion</label><input className="cxc-input" value={editDoc.descripcion} onChange={(e) => setEditDoc((p) => p ? ({ ...p, descripcion: e.target.value }) : p)} disabled={!canEdit || busy} /></div>
                      </div>
                      <div className="cxc-actions" style={{ marginTop: 10 }}>
                        <button className="cxc-btn main" type="button" onClick={guardarEdicionDocumento} disabled={!canEdit || busy}>Guardar cambios</button>
                        <button className="cxc-btn" type="button" onClick={() => setEditDoc(null)} disabled={busy}>Cancelar</button>
                        <button className="cxc-btn" type="button" onClick={anularDocumento} disabled={!canEdit || busy}>Anular documento</button>
                      </div>
                    </>
                  ) : null}
                </div>
              </details>
            </div>
            )}

            {isGestion && gestionVista === 'cobro' && (
            <div className="cxc-card">
              <details className="cxc-fold">
                <summary>Aplicar abono</summary>
                <div className="cxc-fold-body">
                  <div className="cxc-mini-grid">
                    <div className="cxc-field">
                      <label>Documento</label>
                      <input className="cxc-input" value={selectedDoc ? String(selectedDoc) : ''} readOnly />
                    </div>
                    <div className="cxc-field">
                      <label>Monto abono</label>
                      <input className="cxc-input" type="number" step="0.01" value={abonoMonto} onChange={(e) => setAbonoMonto(Number(e.target.value || 0))} disabled={!canEdit || busy} />
                    </div>
                    <div className="cxc-field">
                      <label>Referencia</label>
                      <input className="cxc-input" value={abonoRef} onChange={(e) => setAbonoRef(e.target.value)} disabled={!canEdit || busy} />
                    </div>
                  </div>
                  <div className="cxc-actions" style={{ marginTop: 10 }}>
                    <button className="cxc-btn main" type="button" onClick={registrarAbono} disabled={!canEdit || busy || !selectedDoc}>
                      Aplicar abono
                    </button>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f3f7ff', margin: '14px 0 8px' }}>Aplicaciones del documento</div>
                  <div className="cxc-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Tipo</th>
                          <th>Referencia</th>
                          <th>Estado</th>
                          <th className="cxc-right">Monto</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {aplicaciones.length === 0 ? (
                          <tr><td colSpan={6} className="cxc-empty">Sin aplicaciones.</td></tr>
                        ) : aplicaciones.map((a) => (
                          <tr key={a.id}>
                            <td>{a.fecha_aplicacion}</td>
                            <td>{a.tipo_aplicacion}</td>
                            <td>{a.referencia || '-'}</td>
                            <td>{a.estado}</td>
                            <td className="cxc-right">{money(a.monto, docs.find((d) => d.documento_id === a.documento_id)?.moneda || 'CRC')}</td>
                            <td>
                              <button className="btn-mini warn" type="button" onClick={() => anularAplicacion(a.id)} disabled={!canEdit || busy || a.estado === 'anulado'}>Anular</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </div>
            )}

            {isGestion && gestionVista === 'tramite' && (
            <div className="cxc-card">
              <details className="cxc-fold">
                <summary>Seguimiento de cobro</summary>
                <div className="cxc-fold-body">
                  <div className="cxc-mini-grid">
                    <div className="cxc-field">
                      <label>Canal</label>
                      <select className="cxc-select" value={gestionCanal} onChange={(e) => setGestionCanal(e.target.value as any)} disabled={!canEdit || busy}>
                        <option value="LLAMADA">Llamada</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="CORREO">Correo</option>
                        <option value="VISITA">Visita</option>
                        <option value="ACUERDO_PAGO">Acuerdo pago</option>
                        <option value="OTRO">Otro</option>
                      </select>
                    </div>
                    <div className="cxc-field">
                      <label>Resultado</label>
                      <select className="cxc-select" value={gestionResultado} onChange={(e) => setGestionResultado(e.target.value as any)} disabled={!canEdit || busy}>
                        <option value="PENDIENTE">Pendiente</option>
                        <option value="PROMESA_PAGO">Promesa de pago</option>
                        <option value="NO_LOCALIZADO">No localizado</option>
                        <option value="RECHAZO">Rechazo</option>
                        <option value="PAGO_REALIZADO">Pago realizado</option>
                        <option value="OTRO">Otro</option>
                      </select>
                    </div>
                    <div className="cxc-field">
                      <label>Compromiso fecha</label>
                      <input className="cxc-input" type="date" value={gestionCompromisoFecha} onChange={(e) => setGestionCompromisoFecha(e.target.value)} disabled={!canEdit || busy} />
                    </div>
                    <div className="cxc-field">
                      <label>Compromiso monto</label>
                      <input className="cxc-input" type="number" step="0.01" value={gestionCompromisoMonto} onChange={(e) => setGestionCompromisoMonto(Number(e.target.value || 0))} disabled={!canEdit || busy} />
                    </div>
                    <div className="cxc-field" style={{ gridColumn: '1 / -1' }}>
                      <label>Observacion</label>
                      <textarea className="cxc-input" rows={2} value={gestionObs} onChange={(e) => setGestionObs(e.target.value)} disabled={!canEdit || busy} />
                    </div>
                  </div>
                  <div className="cxc-actions" style={{ marginTop: 10 }}>
                    <button className="cxc-btn main" type="button" onClick={registrarGestion} disabled={!canEdit || busy || !selectedTercero}>
                      Registrar gestion
                    </button>
                    <button className="cxc-btn" type="button" onClick={() => loadGestiones(selectedTercero)} disabled={busy || !selectedTercero}>
                      Recargar historial
                    </button>
                  </div>

                  <div className="cxc-table" style={{ marginTop: 8 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Canal</th>
                          <th>Resultado</th>
                          <th>Doc</th>
                          <th>Compromiso</th>
                          <th className="cxc-right">Monto</th>
                          <th>Observacion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gestiones.length === 0 ? (
                          <tr><td colSpan={7} className="cxc-empty">Sin gestiones registradas para el cliente seleccionado.</td></tr>
                        ) : gestiones.map((g) => (
                          <tr key={`g-${g.id}`}>
                            <td>{String(g.fecha_gestion || '').replace('T', ' ').slice(0, 16)}</td>
                            <td>{g.canal}</td>
                            <td>{g.resultado}</td>
                            <td>{g.numero_documento || '-'}</td>
                            <td>{g.compromiso_fecha || '-'}</td>
                            <td className="cxc-right">{g.compromiso_monto ? money(g.compromiso_monto, docs.find((d) => d.documento_id === g.documento_id)?.moneda || 'CRC') : '-'}</td>
                            <td>{g.observacion || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </div>
            )}
          </div>
        </div>
        )}
      </div>
    </>
  );
}



