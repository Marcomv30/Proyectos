import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, CheckCircle, Clock, ChevronDown, ChevronUp, TrendingDown, Package, Droplets, XCircle, Printer, ClipboardList } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Recepcion, RecepcionDetalle, Semana } from '../../types/empacadora';
import ConfirmDialog from '../../components/ConfirmDialog';
import { inputCls, selectCls, btnPrimary, tableWrapCls, theadCls, thCls, trCls, tdCls } from '../../components/ui';
import RecepcionWizard from './RecepcionWizard';
import BoletaRecepcionImprimir from './BoletaRecepcionImprimir';
import LiquidacionRecepcion from './LiquidacionRecepcion';

export default function RecepcionesList() {
  const empresaId = useEmpresaId();
  const [rows, setRows] = useState<Recepcion[]>([]);
  const [filtered, setFiltered] = useState<Recepcion[]>([]);
  const [semanas, setSemanas] = useState<Array<Pick<Semana, 'id' | 'codigo'> & { semana: number; fecha_inicio: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [semanaFiltro, setSemanaFiltro] = useState('');
  const [view, setView] = useState<'list' | 'form' | 'print' | 'liquidar'>('list');
  const [printId, setPrintId] = useState<string | null>(null);
  const [liquidarId, setLiquidarId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Recepcion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recepcion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detMap, setDetMap] = useState<Record<string, RecepcionDetalle[]>>({});
  const [boletasMap, setBoletasMap] = useState<Record<string, any[]>>({});
  const [existingDets, setExistingDets] = useState<RecepcionDetalle[]>([]);
  const [frutasEmpacadas, setFrutasEmpacadas] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: recs }, { data: sems }] = await Promise.all([
      supabase.from('emp_recepciones')
        .select('*, semana:emp_semanas(id,codigo), proveedor:emp_proveedores_fruta(id,nombre), transportista:emp_transportistas(id,nombre,placa)')
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('emp_semanas').select('*').eq('empresa_id', empresaId).eq('activo', true).order('semana', { ascending: false }),
    ]);
    setRows(recs || []);
    setSemanas(sems || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let r = rows;
    if (semanaFiltro) r = r.filter(x => x.semana_id === semanaFiltro);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(x =>
        (x.lote || '').toLowerCase().includes(s) ||
        (x.codigo || '').toLowerCase().includes(s) ||
        (x.placa || '').toLowerCase().includes(s) ||
        (x.proveedor as any)?.nombre?.toLowerCase().includes(s)
      );
    }
    setFiltered(r);
  }, [rows, search, semanaFiltro]);

  async function loadDetalle(recepcionId: string) {
    if (detMap[recepcionId]) return;
    const [{ data: dets }, { data: bols }] = await Promise.all([
      supabase.from('emp_recepciones_detalle')
        .select('*').eq('recepcion_id', recepcionId).order('created_at'),
      supabase.from('emp_boletas')
        .select('numero_paleta,calibre_nombre,marca_nombre,cajas_empacadas,puchos,puchos_2,puchos_3,total_frutas,trazabilidad,aplica,despacho_id')
        .eq('recepcion_id', recepcionId)
        .order('numero_paleta'),
    ]);
    setDetMap(m => ({ ...m, [recepcionId]: dets || [] }));
    setBoletasMap(m => ({ ...m, [recepcionId]: bols || [] }));
  }

  function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    loadDetalle(id);
  }

  function openNew() {
    setEditing(null);
    setExistingDets([]);
    setView('form');
  }

  async function openEdit(r: Recepcion) {
    setEditing(r);
    const { data } = await supabase.from('emp_recepciones_detalle')
      .select('*').eq('recepcion_id', r.id).order('created_at');
    setExistingDets(data || []);
    setView('form');
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_recepciones').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  // Balance: frutas empacadas desde boletas (tiempo real, por semana)
  useEffect(() => {
    let q = supabase.from('emp_boletas').select('total_frutas').eq('empresa_id', empresaId);
    if (semanaFiltro) q = q.eq('semana_id', semanaFiltro);
    q.then(({ data }) => {
      const tot = (data || []).reduce((s: number, b: any) => s + (b.total_frutas || 0), 0);
      setFrutasEmpacadas(tot);
    });
  }, [empresaId, semanaFiltro, rows]); // rows como dep para refrescar al guardar

  const totalFrutasFiltrado = filtered.reduce((s, r) => s + (r.total_frutas || 0), 0);
  const totalJugo     = filtered.reduce((s, r) => s + (r.fruta_jugo || 0), 0);
  const totalRechazo  = filtered.reduce((s, r) => s + (r.fruta_rechazo || 0), 0);
  const totalPendiente = Math.max(0, totalFrutasFiltrado - frutasEmpacadas - totalJugo - totalRechazo);

  // Vista de impresion
  if (view === 'print' && printId) {
    return (
      <BoletaRecepcionImprimir
        recepcionId={printId}
        onBack={() => { setView('list'); setPrintId(null); }}
      />
    );
  }

  // Vista de liquidacion
  if (view === 'liquidar' && liquidarId) {
    return (
      <LiquidacionRecepcion
        recepcionId={liquidarId}
        onBack={() => { setView('list'); setLiquidarId(null); }}
      />
    );
  }

  // Vista de formulario (wizard mobile-first)
  if (view === 'form') {
    return (
      <RecepcionWizard
        editing={editing}
        editingDets={existingDets}
        onSaved={() => { setView('list'); setEditing(null); setExistingDets([]); load(); }}
        onCancel={() => { setView('list'); setEditing(null); setExistingDets([]); }}
      />
    );
  }


  // Vista de lista
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Recepcion de Fruta</h1>
          <p className="text-ink-muted text-sm mt-1">
            {filtered.length} viajes - {totalFrutasFiltrado.toLocaleString('es-CR')} frutas
          </p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nuevo Ingreso
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={14} />
          <input type="text" placeholder="Buscar lote, placa, productor..." value={search}
            onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
        </div>
        <select value={semanaFiltro} onChange={e => setSemanaFiltro(e.target.value)} className={selectCls + ' w-full sm:w-auto'}>
          <option value="">Todas las semanas</option>
          {semanas.map(s => <option key={s.id} value={s.id}>Semana {s.codigo}</option>)}
        </select>
      </div>

      {/* Balance frutas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-surface-raised border border-line rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-900/40"><TrendingDown size={16} className="text-blue-400" /></div>
          <div>
            <p className="text-[11px] text-ink-faint uppercase tracking-wide">Ingresadas</p>
            <p className="text-lg font-bold text-ink">{totalFrutasFiltrado.toLocaleString('es-CR')}</p>
          </div>
        </div>
        <div className="bg-surface-raised border border-line rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-900/40"><Package size={16} className="text-green-400" /></div>
          <div>
            <p className="text-[11px] text-ink-faint uppercase tracking-wide">Empacadas</p>
            <p className="text-lg font-bold text-green-400">{frutasEmpacadas.toLocaleString('es-CR')}</p>
          </div>
        </div>
        <div className="bg-surface-raised border border-line rounded-xl p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-900/40"><Droplets size={16} className="text-yellow-400" /></div>
          <div>
            <p className="text-[11px] text-ink-faint uppercase tracking-wide">Jugo / Rechazo</p>
            <p className="text-lg font-bold text-yellow-400">{(totalJugo + totalRechazo).toLocaleString('es-CR')}</p>
          </div>
        </div>
        <div className={`bg-surface-raised border rounded-xl p-3 flex items-center gap-3 ${
          totalPendiente > 0 ? 'border-orange-700/60' : 'border-line'
        }`}>
          <div className={`p-2 rounded-lg ${totalPendiente > 0 ? 'bg-orange-900/40' : 'bg-surface-overlay'}`}>
            <XCircle size={16} className={totalPendiente > 0 ? 'text-orange-400' : 'text-ink-faint'} />
          </div>
          <div>
            <p className="text-[11px] text-ink-faint uppercase tracking-wide">Pendiente</p>
            <p className={`text-lg font-bold ${totalPendiente > 0 ? 'text-orange-400' : 'text-ink-muted'}`}>
              {totalPendiente.toLocaleString('es-CR')}
            </p>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      {/* Tabla */}
      <div className={tableWrapCls}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}></th>
              <th className={thCls}>No. Boleta</th>
              <th className={thCls}>Fecha</th>
              <th className={thCls}>Semana</th>
              <th className={thCls}>Lote</th>
              <th className={thCls}>Productor</th>
              <th className={thCls}>Transportista</th>
              <th className={thCls}>Placa</th>
              <th className={thCls + ' text-right'}>Total Frutas</th>
              <th className={thCls + ' text-center'}>Estado</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-ink-faint">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-ink-faint">Sin registros</td></tr>
            ) : filtered.map(r => (
              <React.Fragment key={r.id}>
                <tr className={trCls}>
                  <td className={tdCls}>
                    <button onClick={() => toggleExpand(r.id)}
                      className="text-ink-faint hover:text-ink p-1 rounded transition-colors">
                      {expandedId === r.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </td>
                  <td className={tdCls + ' font-mono font-bold text-ink'}>{r.codigo || '-'}</td>
                  <td className={tdCls + ' text-ink'}>
                    {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CR')}
                  </td>
                  <td className={tdCls}>
                    <span className="font-mono text-yellow-400 font-bold">
                      {(r.semana as any)?.codigo || '-'}
                    </span>
                  </td>
                  <td className={tdCls + ' font-mono text-blue-400'}>{r.lote || '-'}</td>
                  <td className={tdCls + ' font-medium text-ink'}>{(r.proveedor as any)?.nombre || '-'}</td>
                  <td className={tdCls + ' text-ink-muted'}>{(r.transportista as any)?.nombre || '-'}</td>
                  <td className={tdCls + ' font-mono text-ink-muted'}>{r.placa || '-'}</td>
                  <td className={tdCls + ' text-right font-medium text-ink'}>
                    {r.total_frutas?.toLocaleString('es-CR') || '-'}
                  </td>
                  <td className={tdCls + ' text-center'}>
                    {r.recibida
                      ? <CheckCircle size={14} className="text-green-400 mx-auto" />
                      : <Clock size={14} className="text-yellow-500 mx-auto" />}
                  </td>
                  <td className={tdCls}>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setPrintId(r.id); setView('print'); }} title="Ver boleta / Imprimir"
                        className="text-green-400 hover:text-green-300 px-2 py-1 rounded hover:bg-green-900/30 transition-colors"><Printer size={13} /></button>
                      <button onClick={() => { setLiquidarId(r.id); setView('liquidar'); }} title="Liquidacion"
                        className="text-blue-300 hover:text-blue-200 px-2 py-1 rounded hover:bg-blue-900/30 transition-colors"><ClipboardList size={13} /></button>
                      <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/30 transition-colors"><Pencil size={13} /></button>
                      <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/30 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
                {/* Detalle expandido */}
                {expandedId === r.id && (
                  <tr>
                    <td colSpan={11} className="p-0">
                      <div className="mx-4 my-2 rounded-xl overflow-hidden border border-line">
                        {/* Balance en tiempo real de esta recepcion */}
                        {(() => {
                          const ing  = r.total_frutas || 0;
                          const emp  = (boletasMap[r.id] || []).reduce((s: number, b: any) => s + (b.total_frutas || 0), 0);
                          const juro = (r.fruta_jugo || 0) + (r.fruta_rechazo || 0);
                          const pend = Math.max(0, ing - emp - juro);
                          const pct  = ing > 0 ? Math.round((emp / ing) * 100) : 0;
                          return (
                            <div className="grid grid-cols-2 lg:grid-cols-4 text-center text-[11px]"
                              style={{ background: 'var(--surface-deep)', borderBottom: '1px solid var(--line)' }}>
                              <div className="px-3 py-2 border-r border-line">
                                <p className="text-ink-faint uppercase tracking-wide text-[10px]">Ingresadas</p>
                                <p className="font-bold text-ink text-sm">{ing.toLocaleString('es-CR')}</p>
                              </div>
                              <div className="px-3 py-2 border-r border-line">
                                <p className="text-ink-faint uppercase tracking-wide text-[10px]">Empacadas</p>
                                <p className="font-bold text-green-400 text-sm">{emp.toLocaleString('es-CR')} <span className="text-[10px] font-normal text-ink-faint">{pct}%</span></p>
                              </div>
                              <div className="px-3 py-2 border-r border-line">
                                <p className="text-ink-faint uppercase tracking-wide text-[10px]">Jugo / Rechazo</p>
                                <p className={`font-bold text-sm ${juro > 0 ? 'text-yellow-400' : 'text-ink-faint'}`}>{juro.toLocaleString('es-CR')}</p>
                              </div>
                              <div className="px-3 py-2">
                                <p className="text-ink-faint uppercase tracking-wide text-[10px]">Pendiente</p>
                                <p className={`font-bold text-sm ${pend > 0 ? 'text-orange-400' : 'text-green-400'}`}>{pend.toLocaleString('es-CR')}</p>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Mini-encabezado de la boleta */}
                        <div className="px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[11px]"
                          style={{ background: 'var(--surface-overlay)', borderBottom: '1px solid var(--line)' }}>
                          <span className="font-bold text-ink font-mono">{r.codigo || '-'}</span>
                          {r.hora_salida && <span><span className="text-ink-faint">Salida:</span> <span className="text-ink">{r.hora_salida}</span></span>}
                          {r.hora_llegada && <span><span className="text-ink-faint">Llegada:</span> <span className="text-ink">{r.hora_llegada}</span></span>}
                          {r.grupo_forza && <span><span className="text-ink-faint">GF:</span> <span className="text-ink font-mono">{r.grupo_forza}</span></span>}
                          {r.ggn_gln && <span><span className="text-ink-faint">GGN:</span> <span className="text-ink font-mono">{r.ggn_gln}</span></span>}
                          {r.enviado_por && <span><span className="text-ink-faint">Enviado:</span> <span className="text-ink">{r.enviado_por}</span></span>}
                          {r.recibido_por && <span><span className="text-ink-faint">Recibido:</span> <span className="text-ink">{r.recibido_por}</span></span>}
                          {r.fruta_empacada > 0 && <span><span className="text-ink-faint">Empacada:</span> <span className="text-green-400 font-semibold">{r.fruta_empacada.toLocaleString('es-CR')}</span></span>}
                          {r.fruta_jugo > 0 && <span><span className="text-ink-faint">Jugo:</span> <span className="text-orange-400 font-semibold">{r.fruta_jugo.toLocaleString('es-CR')}</span></span>}
                          {(r.fruta_rechazo ?? 0) > 0 && <span><span className="text-ink-faint">Rechazo:</span> <span className="text-red-400 font-semibold">{(r.fruta_rechazo ?? 0).toLocaleString('es-CR')}</span></span>}
                          {r.notas && <span className="italic text-ink-faint">{r.notas}</span>}
                        </div>
                        {/* Tabla de VINs */}
                        {detMap[r.id] && detMap[r.id].length > 0 ? (
                          <div className="overflow-x-auto">
                          <table className="w-full min-w-[760px] text-[11px]">
                            <thead>
                              <tr style={{ background: 'var(--surface-base)', borderBottom: '1px solid var(--line-dim)' }}>
                                <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Hora</th>
                                <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">VIN</th>
                                <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Carreta</th>
                                <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Lote</th>
                                <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Bloque</th>
                                <th className="text-right px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Frutas</th>
                                <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Obs.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detMap[r.id].map((d, i) => (
                                <tr key={d.id} style={{ borderBottom: '1px solid var(--line-dim)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-base)' }}>
                                  <td className="px-3 py-1.5 text-ink-faint font-mono">{d.hora_carga || '-'}</td>
                                  <td className="px-3 py-1.5 font-mono text-blue-400 font-semibold">{d.vin || '-'}</td>
                                  <td className="px-3 py-1.5 text-ink-muted">{d.carreta || '-'}</td>
                                  <td className="px-3 py-1.5 text-ink-muted font-mono">{d.lote || '-'}</td>
                                  <td className="px-3 py-1.5 text-ink-muted font-mono">{d.bloque || '-'}</td>
                                  <td className="px-3 py-1.5 text-right text-ink font-semibold">{d.cantidad.toLocaleString('es-CR')}</td>
                                  <td className="px-3 py-1.5 text-ink-faint italic">{d.observacion || ''}</td>
                                </tr>
                              ))}
                              <tr style={{ borderTop: '2px solid var(--line)', background: 'var(--surface-overlay)' }}>
                                <td colSpan={5} className="px-3 py-1.5 text-ink-faint text-right font-semibold uppercase tracking-wide text-[10px]">Total</td>
                                <td className="px-3 py-1.5 text-right text-ink font-bold">
                                  {detMap[r.id].reduce((s, d) => s + d.cantidad, 0).toLocaleString('es-CR')}
                                </td>
                                <td />
                              </tr>
                            </tbody>
                          </table>
                          </div>
                        ) : (
                          <p className="px-4 py-3 text-xs text-ink-faint italic">Sin detalle de VINs registrado</p>
                        )}

                        {/* Boletas de empaque de esta recepcion */}
                        {boletasMap[r.id] !== undefined && (
                          <>
                            <div className="px-4 py-2 flex items-center justify-between"
                              style={{ borderTop: '2px solid var(--line)', background: 'var(--surface-overlay)' }}>
                              <span className="text-[11px] font-bold text-ink uppercase tracking-wider">
                                Boletas de Empaque
                              </span>
                              <span className="text-[11px] text-ink-faint">
                                {boletasMap[r.id].length} paleta{boletasMap[r.id].length !== 1 ? 's' : ''} -{' '}
                                <span className="text-green-400 font-semibold">
                                  {boletasMap[r.id].reduce((s: number, b: any) => s + (b.total_frutas || 0), 0).toLocaleString('es-CR')} frutas empacadas
                                </span>
                              </span>
                            </div>
                            {boletasMap[r.id].length === 0 ? (
                              <p className="px-4 py-3 text-xs text-ink-faint italic">Sin boletas de empaque registradas</p>
                            ) : (
                              <div className="overflow-x-auto">
                              <table className="w-full min-w-[760px] text-[11px]">
                                <thead>
                                  <tr style={{ background: 'var(--surface-base)', borderBottom: '1px solid var(--line-dim)' }}>
                                    <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Paleta</th>
                                    <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Calibre</th>
                                    <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Marca</th>
                                    <th className="text-right px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Cajas</th>
                                    <th className="text-right px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Frutas</th>
                                    <th className="text-left px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Trazabilidad</th>
                                    <th className="text-center px-3 py-1.5 text-ink-faint font-semibold uppercase tracking-wider">Despacho</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {boletasMap[r.id].map((b: any, i: number) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--line-dim)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-base)' }}>
                                      <td className="px-3 py-1.5 font-mono font-bold text-ink">#{b.numero_paleta}</td>
                                      <td className="px-3 py-1.5 text-ink-muted">{b.calibre_nombre || '-'}</td>
                                      <td className="px-3 py-1.5 text-ink-muted">{b.marca_nombre || '-'}</td>
                                      <td className="px-3 py-1.5 text-right text-ink">{(b.cajas_empacadas + b.puchos + b.puchos_2 + b.puchos_3).toLocaleString('es-CR')}</td>
                                      <td className="px-3 py-1.5 text-right font-semibold text-green-400">{(b.total_frutas || 0).toLocaleString('es-CR')}</td>
                                      <td className="px-3 py-1.5 font-mono text-xs text-ink-faint">{b.trazabilidad || '-'}</td>
                                      <td className="px-3 py-1.5 text-center">
                                        {b.despacho_id
                                          ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-900/40 text-green-400 font-semibold">Despachada</span>
                                          : <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-deep text-ink-faint">En planta</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>


      {deleteTarget && (
        <ConfirmDialog
          message={`¿Eliminar la recepcion del ${new Date(deleteTarget.fecha + 'T12:00:00').toLocaleDateString('es-CR')}? Se eliminaran tambien los detalles.`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  );
}
