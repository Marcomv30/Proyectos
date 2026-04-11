import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import FeeViewerAndPrint from './FeeViewerAndPrint';
import { WorkspaceShell, WorkspaceMainPanel, WorkspaceSidebarSection, WorkspaceMetric } from '../../components/WorkspaceShell';

interface FeeDocRow {
  id: number;
  estado: string;
  estado_mh?: string | null;
  tipo_documento: string;
  fecha_emision: string;
  numero_consecutivo: string | null;
  total_comprobante: number | null;
  receptor_nombre?: string | null;
  receptor_identificacion?: string | null;
  receptor_email?: string | null;
  clave_mh?: string | null;
  moneda?: string;
  condicion_venta?: string;
  medio_pago?: string;
  incoterms?: string;
  shipper?: string;
  codigo_exportador?: string;
  ggn_global_gap?: string;
  ep_mag?: string;
  observacion?: string;
}

interface EmpDespachoRow {
  id: number;
  fecha: string;
  cliente: string;
  destino?: string;
  total_usd?: number;
  estado?: string;
  referencia?: string;
  factura_fee_id?: number | null;
}

type Tab = 'list' | 'importar' | 'crear' | 'view';

const FMT = new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = (n: number | null) => (n != null ? FMT.format(n) : '---');

function fmtFecha(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusChipClass(estado: string, estadoMh: string | null | undefined): string {
  const e = estado.toLowerCase();
  const mh = (estadoMh || '').toLowerCase();
  if (mh === 'aceptado') return 'ok';
  if (mh === 'rechazado' || mh === 'error') return 'bad';
  if (e === 'emitido') return 'ok';
  if (e === 'borrador' || e === 'pendiente') return 'warn';
  if (mh === 'procesando' || mh === 'pendiente' || mh === 'enviado') return 'warn';
  if (e === 'anulado') return 'bad';
  return 'info';
}

function statusLabel(estado: string, estadoMh: string | null | undefined): string {
  if (estadoMh && estadoMh !== 'pendiente') return estadoMh;
  const label: Record<string, string> = {
    borrador: 'Borrador', emitido: 'Emitido', anulado: 'Anulado',
    pendiente: 'Pendiente', confirmado: 'Confirmado',
  };
  return label[estado.toLowerCase()] || estado;
}

function canEmit(doc: FeeDocRow): boolean {
  const e = doc.estado.toLowerCase();
  return e === 'borrador' || e === 'pendiente' || e === 'confirmado';
}

// ─── CSS ────────────────────────────────────────────────────────────────────
const STYLES = `
  .feexp-wrap { padding: 18px; color: var(--card-text); }
  .feexp-head { display:grid; grid-template-columns:minmax(240px,1fr) auto; gap:16px; align-items:center; margin-bottom:18px; }
  .feexp-title { font-size:28px; font-weight:800; letter-spacing:-.03em; }
  .feexp-sub { font-size:13px; color:var(--gray-400); margin-top:6px; }
  .feexp-tabs { display:flex; gap:8px; margin-bottom:18px; }
  .feexp-tab { border:1px solid var(--card-border); background:var(--bg-dark2); color:var(--gray-400); border-radius:8px; padding:8px 16px; font-size:12px; font-weight:700; cursor:pointer; }
  .feexp-tab.active { border-color:var(--green-main); color:var(--green-main); background:rgba(34,197,94,.08); }
  .feexp-btn { border:1px solid var(--card-border); background:var(--bg-dark2); color:var(--card-text); border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; }
  .feexp-btn:hover:not(:disabled) { border-color:var(--green-main); background:rgba(34,197,94,.08); }
  .feexp-btn:disabled { opacity:.55; cursor:not-allowed; }
  .feexp-btn.primary { background:var(--green-main); color:#fff; border-color:var(--green-main); }
  .feexp-btn.danger { border-color:rgba(239,68,68,.35); color:#fca5a5; }
  .feexp-summary { display:grid; grid-template-columns:repeat(4, minmax(150px,1fr)); gap:12px; margin-bottom:18px; }
  .feexp-card { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 84%, transparent); padding:14px 16px; }
  .feexp-card .k { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--gray-400); margin-bottom:6px; }
  .feexp-card .v { font-size:22px; font-weight:800; }
  .feexp-table-wrap { overflow:auto; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 92%, transparent); }
  .feexp-table { width:100%; min-width:900px; border-collapse:separate; border-spacing:0; }
  .feexp-table th, .feexp-table td { padding:11px 12px; border-top:1px solid var(--card-border); font-size:13px; text-align:left; vertical-align:middle; white-space:nowrap; }
  .feexp-table thead th { position:sticky; top:0; z-index:1; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--gray-400); background:var(--bg-dark2); }
  .feexp-table tbody tr:hover { background:color-mix(in srgb, var(--green-main) 6%, var(--bg-dark2)); }
  .feexp-table td.mono { font-family:monospace; overflow:hidden; text-overflow:ellipsis; }
  .feexp-chip { display:inline-flex; align-items:center; padding:4px 10px; border:1px solid var(--card-border); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
  .feexp-chip.ok { color:#86efac; border-color:rgba(34,197,94,.35); background:rgba(20,83,45,.45); }
  .feexp-chip.warn { color:#fcd34d; border-color:rgba(245,158,11,.35); background:rgba(120,53,15,.35); }
  .feexp-chip.info { color:#7dd3fc; border-color:rgba(14,165,233,.35); background:rgba(8,47,73,.35); }
  .feexp-chip.bad { color:#fca5a5; border-color:rgba(239,68,68,.35); background:rgba(127,29,29,.35); }
  .feexp-row-actions { display:flex; gap:6px; align-items:center; }
  .feexp-icon-btn { border:1px solid var(--card-border); background:var(--bg-dark2); color:var(--card-text); padding:0; width:32px; height:32px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; border-radius:6px; font-size:14px; }
  .feexp-icon-btn:hover:not(:disabled) { border-color:var(--green-main); background:rgba(34,197,94,.08); }
  .feexp-icon-btn:disabled { opacity:.45; cursor:not-allowed; }
  /* Modal */
  .feexp-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:1000; display:flex; align-items:center; justify-content:center; }
  .feexp-modal { background:#1e293b; border:1px solid #334155; border-radius:10px; padding:24px; max-width:900px; width:95%; max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.5); }
  .feexp-modal-title { font-size:18px; font-weight:800; color:#f8fafc; margin-bottom:16px; }
  .feexp-field { margin-bottom:12px; }
  .feexp-field label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; font-weight:700; margin-bottom:4px; }
  .feexp-field input, .feexp-field select, .feexp-field textarea {
    width:100%; padding:8px 10px; background:#0f172a; border:1px solid #334155; color:#e2e8f0; border-radius:6px; font-size:13px; outline:none;
  }
  .feexp-field input:focus, .feexp-field select:focus, .feexp-field textarea:focus { border-color:var(--green-main); box-shadow:0 0 0 2px rgba(34,197,94,.2); }
  .feexp-lines-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; }
  .feexp-lines-table th { background:#0f172a; color:var(--green-main); padding:6px 8px; text-align:left; font-size:10px; text-transform:uppercase; border-bottom:1px solid #334155; }
  .feexp-lines-table td { padding:4px 6px; }
  .feexp-lines-table input { width:100%; padding:5px 6px; background:#0f172a; border:1px solid #334155; color:#e2e8f0; border-radius:4px; font-size:12px; }
  .feexp-msg { padding:10px 14px; border-radius:8px; font-size:12px; margin-bottom:12px; }
  .feexp-msg.ok { background:rgba(34,197,94,.12); border:1px solid rgba(34,197,94,.24); color:#86efac; }
  .feexp-msg.err { background:rgba(239,68,68,.12); border:1px solid rgba(239,68,68,.24); color:#fca5a5; }
  @media (max-width: 900px) {
    .feexp-head { grid-template-columns:1fr; }
    .feexp-summary { grid-template-columns:repeat(2, minmax(140px,1fr)); }
  }
`;

// ─── Component ──────────────────────────────────────────────────────────────
interface Props {
  empresaId: number;
  canEdit?: boolean;
}


export default function FacturaExportacionPage({ empresaId, canEdit = false }: Props) {
  const [tab, setTab] = useState<Tab>('list');
  const [docs, setDocs] = useState<FeeDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDocId, setViewDocId] = useState<number | null>(null);
  const [emitLoading, setEmitLoading] = useState<Record<number, boolean>>({});
  const [statusLoading, setStatusLoading] = useState<Record<number, boolean>>({});
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err' | ''>('');

  // Crear modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [createMsgType, setCreateMsgType] = useState<'ok' | 'err' | ''>('');
  const [formReceptorNombre, setFormReceptorNombre] = useState('');
  const [formReceptorId, setFormReceptorId] = useState('');
  const [formReceptorEmail, setFormReceptorEmail] = useState('');
  const [formReceptorTel, setFormReceptorTel] = useState('');
  const [formReceptorDir, setFormReceptorDir] = useState('');
  const [formCondicion, setFormCondicion] = useState('01');
  const [formMoneda, setFormMoneda] = useState('USD');
  const [formIncoterms, setFormIncoterms] = useState('');
  const [formShipper, setFormShipper] = useState('');
  const [formCodExportador, setFormCodExportador] = useState('');
  const [formGgn, setFormGgn] = useState('');
  const [formEpMag, setFormEpMag] = useState('');
  interface FormLine { cabys: string; codigo_interno: string; descripcion: string; unidad_medida: string; cantidad: string; precio_unitario: string; partida_arancelaria: string; }
  const [formLines, setFormLines] = useState<FormLine[]>([]);

  // Importar state
  const [despachos, setDespachos] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  const API = typeof window !== 'undefined'
    ? ((window as any).REACT_APP_API_URL || (process.env.REACT_APP_API_URL) || 'http://localhost:3001')
    : 'http://localhost:3001';

  const reloadDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('fe_documentos')
      .select('id, estado, estado_mh, tipo_documento, fecha_emision, numero_consecutivo, total_comprobante, receptor_nombre, receptor_identificacion, receptor_email, clave_mh, moneda, condicion_venta, medio_pago, incoterms, shipper, codigo_exportador, ggn_global_gap, ep_mag, observacion')
      .eq('empresa_id', empresaId)
      .eq('tipo_documento', '09')
      .order('fecha_emision', { ascending: false });
    if (!error) setDocs(data as FeeDocRow[]);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { void reloadDocs(); }, [reloadDocs]);

  const reloadDespachos = useCallback(async () => {
    setImportLoading(true);
    const { data, error } = await supabase
      .from('emp_despachos')
      .select('id, codigo, cliente_nombre, destino_nombre, total_cajas, fecha_apertura, cerrada, fee_documento_id')
      .eq('empresa_id', empresaId)
      .is('fee_documento_id', null)
      .order('fecha_apertura', { ascending: false })
      .limit(50);
    if (!error) setDespachos(data || []);
    setImportLoading(false);
  }, [empresaId]);

  const showMessage = (m: string, t: 'ok' | 'err') => { setMsg(m); setMsgType(t); setTimeout(() => { setMsg(''); setMsgType(''); }, 5000); };

  const handleEmit = async (doc: FeeDocRow) => {
    setEmitLoading(prev => ({ ...prev, [doc.id]: true }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const resp = await fetch(`${API}/api/facturacion/emitir/${doc.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const result = await resp.json();
      if (result.ok) {
        showMessage(`FEE emitida correctamente. Estado MH: ${result.estado_mh}`, 'ok');
        void reloadDocs();
      } else {
        showMessage(`Error al emitir: ${result.error}`, 'err');
      }
    } catch (e: any) {
      showMessage(`Error: ${e.message}`, 'err');
    } finally {
      setEmitLoading(prev => ({ ...prev, [doc.id]: false }));
    }
  };

  const handleConsultarMH = async (doc: FeeDocRow) => {
    setStatusLoading(prev => ({ ...prev, [doc.id]: true }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const resp = await fetch(`${API}/api/facturacion/estado/${doc.id}?empresa_id=${empresaId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await resp.json();
      if (result.ok) {
        showMessage(`Estado MH: ${result.estado_mh}`, 'ok');
        void reloadDocs();
      } else {
        showMessage(`Error: ${result.error}`, 'err');
      }
    } catch (e: any) {
      showMessage(`Error: ${e.message}`, 'err');
    } finally {
      setStatusLoading(prev => ({ ...prev, [doc.id]: false }));
    }
  };

  const handleImportDespacho = async (despacho: any) => {
    setImportLoading(true);
    try {
      // Load boletas for this despacho to build lines
      const { data: boletas } = await supabase
        .from('emp_boletas')
        .select('calibre_nombre, marca_nombre, cajas_empacadas, total_frutas')
        .eq('despacho_id', despacho.id);

      if (!boletas?.length) {
        showMessage('El despacho no tiene boletas registradas.', 'err');
        setImportLoading(false);
        return;
      }

      // Aggregate lines by calibre+brand
      const lineMap = new Map<string, { cantidad: number; descripcion: string }>();
      boletas.forEach(b => {
        const key = `${b.marca_nombre || ''}|${b.calibre_nombre || ''}`;
        const existing = lineMap.get(key);
        if (existing) {
          existing.cantidad += b.cajas_empacadas;
        } else {
          lineMap.set(key, { cantidad: b.cajas_empacadas, descripcion: `${b.marca_nombre || ''} - ${b.calibre_nombre || ''}` });
        }
      });

      const lineas = Array.from(lineMap.entries()).map(([key, val], i) => ({
        cabys: '',
        codigo_interno: `DESP-${despacho.codigo || despacho.id}`,
        descripcion: val.descripcion,
        unidad_medida: 'Cajas',
        cantidad: String(val.cantidad),
        precio_unitario: '0',
        partida_arancelaria: '',
      }));

      const receptorNombre = despacho?.programa?.cliente_nombre || despacho.cliente_nombre || 'Cliente Exportacion';
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const resp = await fetch(`${API}/api/facturacion/importar-fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          empresa_id: empresaId,
          despacho_id: despacho.id,
          receptor_nombre: receptorNombre,
          condicion_venta: '01',
          moneda: 'USD',
          lineas: lineas,
        }),
      });
      const result = await resp.json();
      if (result.ok) {
        showMessage(`FEE importada desde despacho ${despacho.codigo || despacho.id}. ID: ${result.doc_id}`, 'ok');
        void reloadDocs();
        void reloadDespachos();
        setTab('view');
        setViewDocId(result.doc_id);
      } else {
        showMessage(`Error al importar: ${result.error}`, 'err');
      }
    } catch (e: any) {
      showMessage(`Error: ${e.message}`, 'err');
    } finally {
      setImportLoading(false);
    }
  };

  const addFormLine = () => setFormLines(prev => [...prev, { cabys: '', codigo_interno: '', descripcion: '', unidad_medida: 'Unid', cantidad: '1', precio_unitario: '0', partida_arancelaria: '' }]);
  const removeFormLine = (i: number) => setFormLines(prev => prev.filter((_, idx) => idx !== i));
  const updateFormLine = (i: number, field: keyof FormLine, value: string) => setFormLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const handleCreateFEE = async () => {
    if (!formReceptorNombre) { showMessage('Ingrese el nombre del receptor.', 'err'); return; }
    if (formLines.length === 0) { showMessage('Agregue al menos una linea.', 'err'); return; }
    const cabysMissing = formLines.filter(l => !/^\d{13}$/.test(l.cabys.trim()));
    if (cabysMissing.length) { showMessage(`Falta CABYS en ${cabysMissing.length} linea(s).`, 'err'); return; }

    setCreateLoading(true);
    setCreateMsg('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const lineas = formLines.map(l => ({
        cabys: l.cabys.trim(),
        codigo_interno: l.codigo_interno.trim(),
        descripcion: l.descripcion.trim(),
        unidad_medida: l.unidad_medida || 'Unid',
        cantidad: parseFloat(l.cantidad) || 1,
        precio_unitario: parseFloat(l.precio_unitario) || 0,
        partida_arancelaria: l.partida_arancelaria.trim(),
      }));

      const resp = await fetch(`${API}/api/facturacion/importar-fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          empresa_id: empresaId,
          receptor_nombre: formReceptorNombre,
          receptor_identificacion: formReceptorId || null,
          receptor_email: formReceptorEmail || null,
          receptor_telefono: formReceptorTel || null,
          receptor_direccion: formReceptorDir || null,
          condicion_venta: formCondicion,
          moneda: formMoneda,
          incoterms: formIncoterms || null,
          shipper: formShipper || null,
          codigo_exportador: formCodExportador || null,
          ggn_global_gap: formGgn || null,
          ep_mag: formEpMag || null,
          lineas,
        }),
      });
      const result = await resp.json();
      if (result.ok) {
        setCreateMsg(`FEE creada. ID: ${result.doc_id}`);
        setCreateMsgType('ok');
        void reloadDocs();
        setShowCreate(false);
      } else {
        setCreateMsg('Error: ' + result.error);
        setCreateMsgType('err');
      }
    } catch (e: any) {
      setCreateMsg('Error: ' + e.message);
      setCreateMsgType('err');
    } finally {
      setCreateLoading(false);
    }
  };

  const totalEmitidas = docs.filter(d => d.estado_mh === 'aceptado').length;
  const totalPendientes = docs.filter(d => d.estado_mh === 'pendiente' || d.estado_mh === 'enviado' || d.estado_mh === 'procesando').length;
  const totalMonto = docs.reduce((s, d) => s + (d.total_comprobante || 0), 0);

  // ─── View mode ────────────────────────────────────────────────────────────
  if (tab === 'view' && viewDocId) {
    return <FeeViewerAndPrint docId={viewDocId} empresaId={empresaId} onBack={() => { setTab('list'); setViewDocId(null); }} />;
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="feexp-wrap">
        <div className="feexp-head">
          <div>
            <div className="feexp-title">Factura Electrónica de Exportación</div>
            <div className="feexp-sub">Gestión de FEE — creación, emisión y consulta de estado ante MH.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="feexp-btn primary" onClick={reloadDocs}>Refrescar</button>
            {canEdit && (<button className="feexp-btn" onClick={() => { setShowCreate(true); setFormLines([]); setFormReceptorNombre(''); setFormReceptorId(''); setFormReceptorEmail(''); setFormReceptorTel(''); setFormReceptorDir(''); setFormCondicion('01'); setFormMoneda('USD'); setFormIncoterms(''); setFormShipper(''); setFormCodExportador(''); setFormGgn(''); setFormEpMag(''); setCreateMsg(''); }}>
              Nueva FEE
            </button>)}
          </div>
        </div>

        {msg && <div className={`feexp-msg ${msgType}`}>{msg}</div>}

        {/* Summary */}
        <div className="feexp-summary">
          <div className="feexp-card"><div className="k">Total FEE</div><div className="v">{docs.length}</div></div>
          <div className="feexp-card"><div className="k">Aceptadas</div><div className="v" style={{ color: '#86efac' }}>{totalEmitidas}</div></div>
          <div className="feexp-card"><div className="k">Pendientes</div><div className="v" style={{ color: '#fcd34d' }}>{totalPendientes}</div></div>
          <div className="feexp-card"><div className="k">Monto Total</div><div className="v">{fmtMoney(totalMonto)}</div></div>
        </div>

        {/* Tabs */}
        <div className="feexp-tabs">
          <button className={`feexp-tab ${tab === 'list' ? 'active' : ''}`} onClick={() => { setTab('list'); setViewDocId(null); }}>Documentos FEE</button>
          <button className={`feexp-tab ${tab === 'importar' ? 'active' : ''}`} onClick={() => { setTab('importar'); void reloadDespachos(); }}>Importar desde Empacadora</button>
        </div>

        {/* ─── Tab: Importar desde Empacadora ─────────────────────────────── */}
        {tab === 'importar' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 12 }}>
              Seleccione un despacho para generar la FEE. Solo se muestran despachos sin FEE vinculada.
            </p>
            {importLoading ? (
              <p style={{ color: 'var(--gray-400)' }}>Cargando despachos...</p>
            ) : despachos.length === 0 ? (
              <p style={{ color: 'var(--gray-400)' }}>No hay despachos disponibles para importar.</p>
            ) : (
              <div className="feexp-table-wrap">
                <table className="feexp-table">
                  <thead><tr>
                    <th>Codigo</th><th>Cliente</th><th>Destino</th>
                    <th>Cajas</th><th>Fecha</th><th>Estado</th><th>Accion</th>
                  </tr></thead>
                  <tbody>
                    {despachos.map((d: any) => (
                      <tr key={d.id}>
                        <td className="mono">{d.codigo || d.id}</td>
                        <td>{d.cliente_nombre || '-'}</td>
                        <td>{d.destino_nombre || '-'}</td>
                        <td>{d.total_cajas || 0}</td>
                        <td>{d.fecha_apertura ? fmtFecha(d.fecha_apertura) : '-'}</td>
                        <td>{d.cerrada ? 'Cerrada' : 'Abierta'}</td>
                        <td>
                          <button className="feexp-btn primary" disabled={importLoading}
                            onClick={() => void handleImportDespacho(d)}>
                            Importar
                          </button>
                        </td>
                      </tr>
                    ))}
                    </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Tab: List ──────────────────────────────────────────────────── */}
        {tab === 'list' && (
          <div>
            {loading ? <p style={{ color: 'var(--gray-400)' }}>Cargando...</p> : docs.length === 0 ? (
              <p style={{ color: 'var(--gray-400)' }}>No hay FEE registradas.</p>
            ) : (
              <div className="feexp-table-wrap">
                <table className="feexp-table">
                  <thead><tr>
                    <th>ID</th><th>Consecutivo</th><th>Fecha</th><th>Receptor</th><th>Moneda</th><th>Total</th><th>Estado MH</th><th>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {docs.map(doc => (
                      <tr key={doc.id}>
                        <td className="mono">{doc.id}</td>
                        <td className="mono">{doc.numero_consecutivo || '-'}</td>
                        <td>{fmtFecha(doc.fecha_emision)}</td>
                        <td>{doc.receptor_nombre || '-'}</td>
                        <td>{doc.moneda || 'USD'}</td>
                        <td>{fmtMoney(doc.total_comprobante)}</td>
                        <td><span className={`feexp-chip ${statusChipClass(doc.estado, doc.estado_mh)}`}>{statusLabel(doc.estado, doc.estado_mh)}</span></td>
                        <td>
                          <div className="feexp-row-actions">
                            <button className="feexp-icon-btn" title="Ver" onClick={() => { setViewDocId(doc.id); setTab('view'); }}>👁</button>
                            {canEdit && canEmit(doc) && (
                              <button className="feexp-icon-btn" title="Emitir" disabled={emitLoading[doc.id]}
                                onClick={() => void handleEmit(doc)}>
                                {emitLoading[doc.id] ? '⏳' : '📤'}
                              </button>
                            )}
                            <button className="feexp-icon-btn" title="Consultar MH" disabled={statusLoading[doc.id] || !doc.clave_mh}
                              onClick={() => void handleConsultarMH(doc)}>
                              {statusLoading[doc.id] ? '⏳' : '🔍'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Modal: Crear FEE ───────────────────────────────────────────── */}
        {showCreate && (
          <div className="feexp-overlay" onClick={() => setShowCreate(false)}>
            <div className="feexp-modal" onClick={e => e.stopPropagation()}>
              <div className="feexp-modal-title">Nueva Factura de Exportación</div>

              {createMsg && <div className={`feexp-msg ${createMsgType}`}>{createMsg}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="feexp-field">
                  <label>Nombre del Receptor *</label>
                  <input value={formReceptorNombre} onChange={e => setFormReceptorNombre(e.target.value)} placeholder="Nombre del cliente" />
                </div>
                <div className="feexp-field">
                  <label>Identificación</label>
                  <input value={formReceptorId} onChange={e => setFormReceptorId(e.target.value)} placeholder="Cédula / ID extranjero" />
                </div>
                <div className="feexp-field">
                  <label>Email</label>
                  <input type="email" value={formReceptorEmail} onChange={e => setFormReceptorEmail(e.target.value)} placeholder="correo@cliente.com" />
                </div>
                <div className="feexp-field">
                  <label>Teléfono</label>
                  <input value={formReceptorTel} onChange={e => setFormReceptorTel(e.target.value)} placeholder="+506..." />
                </div>
                <div className="feexp-field" style={{ gridColumn: 'span 2' }}>
                  <label>Dirección</label>
                  <input value={formReceptorDir} onChange={e => setFormReceptorDir(e.target.value)} placeholder="Dirección del receptor" />
                </div>
                <div className="feexp-field">
                  <label>Condición de venta</label>
                  <select value={formCondicion} onChange={e => setFormCondicion(e.target.value)}>
                    <option value="01">Contado</option>
                    <option value="02">Crédito</option>
                  </select>
                </div>
                <div className="feexp-field">
                  <label>Moneda</label>
                  <select value={formMoneda} onChange={e => setFormMoneda(e.target.value)}>
                    <option value="USD">USD</option>
                    <option value="CRC">CRC</option>
                  </select>
                </div>
              </div>

              {/* Export fields */}
              <div style={{ marginTop: 16, borderTop: '1px solid #334155', paddingTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>Datos de Exportación</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div className="feexp-field"><label>Incoterms</label><input value={formIncoterms} onChange={e => setFormIncoterms(e.target.value)} placeholder="EXW" /></div>
                  <div className="feexp-field"><label>Shipper</label><input value={formShipper} onChange={e => setFormShipper(e.target.value)} /></div>
                  <div className="feexp-field"><label>Código Exportador</label><input value={formCodExportador} onChange={e => setFormCodExportador(e.target.value)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="feexp-field"><label>GGN Global GAP</label><input value={formGgn} onChange={e => setFormGgn(e.target.value)} /></div>
                  <div className="feexp-field"><label>EP-MAG</label><input value={formEpMag} onChange={e => setFormEpMag(e.target.value)} /></div>
                </div>
              </div>

              {/* Lines */}
              <div style={{ marginTop: 16, borderTop: '1px solid #334155', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Líneas</span>
                  <button className="feexp-btn" onClick={addFormLine}>+ Línea</button>
                </div>
                <div className="feexp-lines-table">
                  <thead><tr>
                    <th>CABYS</th><th>Código</th><th>Descripción</th>
                    <th>Ud</th><th>Cant</th><th>Precio</th><th>Partida </th><th></th>
                  </tr></thead>
                  <tbody>
                    {formLines.map((l, i) => (
                      <tr key={i}>
                        <td><input value={l.cabys} onChange={e => updateFormLine(i, 'cabys', e.target.value)} placeholder="13 dígitos" /></td>
                        <td><input value={l.codigo_interno} onChange={e => updateFormLine(i, 'codigo_interno', e.target.value)} /></td>
                        <td><input value={l.descripcion} onChange={e => updateFormLine(i, 'descripcion', e.target.value)} /></td>
                        <td><input value={l.unidad_medida} onChange={e => updateFormLine(i, 'unidad_medida', e.target.value)} style={{ width: 50 }} /></td>
                        <td><input type="number" value={l.cantidad} onChange={e => updateFormLine(i, 'cantidad', e.target.value)} style={{ width: 60 }} /></td>
                        <td><input type="number" step="0.001" value={l.precio_unitario} onChange={e => updateFormLine(i, 'precio_unitario', e.target.value)} style={{ width: 70 }} /></td>
                        <td><input value={l.partida_arancelaria} onChange={e => updateFormLine(i, 'partida_arancelaria', e.target.value)} style={{ width: 80 }} /></td>
                        <td><button className="feexp-btn danger" style={{ padding: '4px 8px' }} onClick={() => removeFormLine(i)}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="feexp-btn" onClick={() => setShowCreate(false)}>Cancelar</button>
                <button className="feexp-btn primary" disabled={createLoading} onClick={handleCreateFEE}>
                  {createLoading ? 'Guardando...' : 'Crear FEE'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}