import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Search, Warehouse, Layers, Pencil, Trash2, Printer } from 'lucide-react';
import InventarioMaterialesPrint from './InventarioMaterialesPrint';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Bodega, MaterialEmpaque } from '../../types/empacadora';
import Modal from '../../components/Modal';
import { getCostaRicaDateISO } from '../../utils/costaRicaTime';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

interface StockRow {
  material_id: string;
  material_codigo: string;
  material_nombre: string;
  material_tipo: string;
  bodega_id: string;
  bodega_nombre: string;
  stock_actual: number;
}

interface MovRow {
  id: string;
  fecha: string;
  tipo: 'entrada' | 'salida' | 'traslado';
  cantidad: number;
  referencia?: string;
  notas?: string;
  material_nombre: string;
  bodega_nombre: string;
  bodega_destino_nombre?: string;
  created_at: string;
}

const TIPO_LABELS = { entrada: 'Entrada', salida: 'Salida', traslado: 'Traslado' };
const TIPO_COLORS = {
  entrada:  { bg: '#052e16', border: '#14532d', text: '#4ade80' },
  salida:   { bg: '#450a0a', border: '#7f1d1d', text: '#f87171' },
  traslado: { bg: '#1e1b4b', border: '#3730a3', text: '#a5b4fc' },
};

export default function InventarioMateriales() {
  const empresaId = useEmpresaId();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movs, setMovs] = useState<MovRow[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [materiales, setMateriales] = useState<MaterialEmpaque[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stock' | 'movimientos' | 'tarimas'>('stock');
  const [printMode, setPrintMode] = useState(false);
  const [search, setSearch] = useState('');
  const [filtBodega, setFiltBodega] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    material_id: '', bodega_id: '', bodega_destino_id: '',
    tipo: 'entrada' as 'entrada' | 'salida' | 'traslado',
    cantidad: '', referencia: '', notas: '',
    fecha: getCostaRicaDateISO(),
  });

  // ── Config materiales por tarima ──────────────────────────────────────────
  interface TarimaConfig { id: string; material_id: string; material_nombre: string; material_codigo: string; descripcion: string; cantidad: number; activo: boolean; }
  const [tarimaRows, setTarimaRows] = useState<TarimaConfig[]>([]);
  const [tarimaModal, setTarimaModal] = useState(false);
  const [tarimaEditing, setTarimaEditing] = useState<TarimaConfig | null>(null);
  const [tarimaForm, setTarimaForm] = useState({ material_id: '', descripcion: '', cantidad: '1', activo: true });
  const [tarimaBusqueda, setTarimaBusqueda] = useState('');
  const [tarimaSaving, setTarimaSaving] = useState(false);

  const loadTarimas = useCallback(async () => {
    const { data } = await supabase
      .from('emp_config_materiales_tarima')
      .select('id, material_id, descripcion, cantidad, activo, material:emp_materiales(nombre, codigo)')
      .eq('empresa_id', empresaId)
      .order('created_at');
    setTarimaRows((data || []).map((r: any) => ({
      id: r.id, material_id: r.material_id,
      material_nombre: r.material?.nombre || '',
      material_codigo: r.material?.codigo || '',
      descripcion: r.descripcion || '',
      cantidad: r.cantidad, activo: r.activo,
    })));
  }, [empresaId]);

  async function saveTarima(e: React.FormEvent) {
    e.preventDefault(); setTarimaSaving(true);
    const payload = { empresa_id: empresaId, material_id: tarimaForm.material_id, descripcion: tarimaForm.descripcion || null, cantidad: +tarimaForm.cantidad, activo: tarimaForm.activo };
    const { error: err } = tarimaEditing
      ? await supabase.from('emp_config_materiales_tarima').update(payload).eq('id', tarimaEditing.id)
      : await supabase.from('emp_config_materiales_tarima').insert(payload);
    if (!err) { setTarimaModal(false); loadTarimas(); }
    setTarimaSaving(false);
  }

  async function deleteTarima(id: string) {
    await supabase.from('emp_config_materiales_tarima').delete().eq('id', id);
    loadTarimas();
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: inv }, { data: movData }, { data: bods }, { data: mats }] = await Promise.all([
      supabase.from('emp_inv_materiales')
        .select('material_id, stock_actual, bodega_id, material:emp_materiales(id,codigo,nombre,tipo), bodega:emp_bodegas(id,nombre)')
        .eq('empresa_id', empresaId),
      supabase.from('emp_mov_materiales')
        .select('id, fecha, tipo, cantidad, referencia, notas, created_at, material:emp_materiales(nombre), bodega:emp_bodegas(nombre), bodega_destino:emp_bodegas!bodega_destino_id(nombre)')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('emp_bodegas').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_materiales').select('id,codigo,nombre,tipo,unidad_medida').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
    ]);
    setStock((inv || []).map((r: any) => ({
      material_id: r.material_id,
      material_codigo: r.material?.codigo || '',
      material_nombre: r.material?.nombre || '',
      material_tipo: r.material?.tipo || '',
      bodega_id: r.bodega_id,
      bodega_nombre: r.bodega?.nombre || '',
      stock_actual: r.stock_actual,
    })));
    setMovs((movData || []).map((r: any) => ({
      id: r.id, fecha: r.fecha, tipo: r.tipo, cantidad: r.cantidad,
      referencia: r.referencia, notas: r.notas, created_at: r.created_at,
      material_nombre: r.material?.nombre || '',
      bodega_nombre: r.bodega?.nombre || '',
      bodega_destino_nombre: r.bodega_destino?.nombre,
    })));
    setBodegas(bods || []);
    setMateriales((mats as any) || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'tarimas') loadTarimas(); }, [tab, loadTarimas]);

  // Aggregate stock: total per material across all bodegas (for display grouping)
  const stockFilt = useMemo(() => {
    let r = stock;
    if (filtBodega) r = r.filter(s => s.bodega_id === filtBodega);
    if (search) r = r.filter(s =>
      s.material_nombre.toLowerCase().includes(search.toLowerCase()) ||
      (s.material_codigo || '').toLowerCase().includes(search.toLowerCase())
    );
    return r;
  }, [stock, filtBodega, search]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    if (!form.material_id || !form.bodega_id || !form.cantidad) {
      setError('Complete material, bodega y cantidad'); setSaving(false); return;
    }
    if (form.tipo === 'traslado' && !form.bodega_destino_id) {
      setError('Seleccione la bodega destino'); setSaving(false); return;
    }
    const payload: any = {
      empresa_id: empresaId,
      material_id: form.material_id,
      bodega_id: form.bodega_id,
      tipo: form.tipo,
      cantidad: +form.cantidad,
      referencia: form.referencia || null,
      notas: form.notas || null,
      fecha: form.fecha,
    };
    if (form.tipo === 'traslado') payload.bodega_destino_id = form.bodega_destino_id;
    const { error } = await supabase.from('emp_mov_materiales').insert(payload);
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false); setShowModal(false); load();
    setForm(f => ({ ...f, material_id: '', cantidad: '', referencia: '', notas: '' }));
  }

  const tipoIcon = (t: string) => t === 'entrada' ? <ArrowDownCircle size={12} /> : t === 'salida' ? <ArrowUpCircle size={12} /> : <ArrowLeftRight size={12} />;

  if (printMode) return <InventarioMaterialesPrint onBack={() => setPrintMode(false)} />;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Inventario de Materiales</h1>
          <p className="text-ink-muted text-sm mt-1">Stock por bodega — entradas, salidas y traslados</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button onClick={() => setPrintMode(true)}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-medium transition-colors w-full sm:w-auto"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
            <Printer size={14} /> Exportar PDF
          </button>
          {tab === 'tarimas' ? (
            <button onClick={() => { setTarimaEditing(null); setTarimaForm({ material_id: '', descripcion: '', cantidad: '1', activo: true }); setTarimaBusqueda(''); setTarimaModal(true); }} className={btnPrimary + ' flex items-center justify-center gap-2 w-full sm:w-auto'}>
              <Plus size={15} /> Agregar Material
            </button>
          ) : (
            <button onClick={() => setShowModal(true)} className={btnPrimary + ' flex items-center justify-center gap-2 w-full sm:w-auto'}>
              <Plus size={15} /> Registrar Movimiento
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-lg w-full sm:w-fit" style={{ background: 'var(--surface-deep)' }}>
        {([['stock', 'Stock Actual'], ['movimientos', 'Movimientos'], ['tarimas', 'Mat. por Tarima']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
            style={tab === t
              ? { background: 'var(--surface-raised)', color: 'var(--ink)', border: '1px solid var(--line)' }
              : { color: 'var(--ink-muted)' }}>
            {t === 'tarimas' && <Layers size={11} />}{label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
          <input type="text" placeholder="Buscar material..." value={search}
            onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
        </div>
        <select value={filtBodega} onChange={e => setFiltBodega(e.target.value)} className={selectCls + ' w-full sm:w-auto'}>
          <option value="">Todas las bodegas</option>
          {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      </div>

      {/* Stock tab */}
      {tab === 'stock' && (
        <div className={tableWrapCls}>
          <table className="w-full text-xs">
            <thead className={theadCls}>
              <tr>
                <th className={thCls}>Código</th>
                <th className={thCls}>Material</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>
                  <div className="flex items-center gap-1"><Warehouse size={11} /> Bodega</div>
                </th>
                <th className={thCls + ' text-right'}>Stock</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : stockFilt.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-600">Sin registros</td></tr>
              ) : stockFilt.map((r) => (
                <tr key={`${r.material_id}-${r.bodega_id}`} className={trCls}>
                  <td className={tdCls + ' font-mono text-blue-400'}>{r.material_codigo || '—'}</td>
                  <td className={tdCls + ' font-medium text-ink'}>{r.material_nombre}</td>
                  <td className={tdCls}>
                    <span className="px-1.5 py-0.5 rounded text-[10px] capitalize"
                      style={{ background: 'var(--surface-deep)', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
                      {r.material_tipo}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-1 text-ink-muted">
                      <Warehouse size={11} />{r.bodega_nombre}
                    </div>
                  </td>
                  <td className={tdCls + ' text-right'}>
                    <span className={`font-bold text-sm ${r.stock_actual <= 0 ? 'text-red-400' : 'text-ink'}`}>
                      {r.stock_actual.toLocaleString('es-CR')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Movimientos tab */}
      {tab === 'movimientos' && (
        <div className={tableWrapCls}>
          <table className="w-full text-xs">
            <thead className={theadCls}>
              <tr>
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>Material</th>
                <th className={thCls}>Bodega</th>
                <th className={thCls + ' text-right'}>Cantidad</th>
                <th className={thCls}>Referencia</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : movs.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-600">Sin movimientos</td></tr>
              ) : movs.map(m => {
                const c = TIPO_COLORS[m.tipo];
                return (
                  <tr key={m.id} className={trCls}>
                    <td className={tdCls + ' text-ink-muted'}>{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CR')}</td>
                    <td className={tdCls}>
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded w-fit text-[10px] font-medium"
                        style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
                        {tipoIcon(m.tipo)}{TIPO_LABELS[m.tipo]}
                      </span>
                    </td>
                    <td className={tdCls + ' font-medium text-ink'}>{m.material_nombre}</td>
                    <td className={tdCls + ' text-ink-muted'}>
                      {m.bodega_nombre}{m.bodega_destino_nombre ? ` → ${m.bodega_destino_nombre}` : ''}
                    </td>
                    <td className={tdCls + ' text-right font-bold text-ink'}>{m.cantidad.toLocaleString('es-CR')}</td>
                    <td className={tdCls + ' text-ink-muted'}>{m.referencia || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tarimas tab */}
      {tab === 'tarimas' && (
        <>
          <p className="text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>
            Materiales que se descargan automáticamente por tarima al aplicar una boleta (fleje, tarima, esquineros, etc.).
          </p>
          <div className={tableWrapCls}>
            <table className="w-full text-xs">
              <thead className={theadCls}>
                <tr>
                  <th className={thCls}>Material</th>
                  <th className={thCls}>Descripción</th>
                  <th className={thCls + ' text-right'}>Cant. por tarima</th>
                  <th className={thCls + ' text-center'}>Estado</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody>
                {tarimaRows.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">Sin materiales configurados</td></tr>
                ) : tarimaRows.map(r => (
                  <tr key={r.id} className={trCls}>
                    <td className={tdCls}>
                      <div className="font-medium text-ink">{r.material_nombre}</div>
                      {r.material_codigo && <div className="text-[11px] font-mono" style={{ color: 'var(--ink-faint)' }}>{r.material_codigo}</div>}
                    </td>
                    <td className={tdCls + ' text-ink-muted'}>{r.descripcion || '—'}</td>
                    <td className={tdCls + ' text-right font-bold text-ink'}>{r.cantidad}</td>
                    <td className={tdCls + ' text-center'}>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${r.activo ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {r.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setTarimaEditing(r); setTarimaForm({ material_id: r.material_id, descripcion: r.descripcion, cantidad: String(r.cantidad), activo: r.activo }); setTarimaBusqueda(''); setTarimaModal(true); }}
                          className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-900/30"><Pencil size={13} /></button>
                        <button onClick={() => deleteTarima(r.id)}
                          className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-900/30"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal config tarima */}
      {tarimaModal && (
        <Modal title={tarimaEditing ? 'Editar Material por Tarima' : 'Agregar Material por Tarima'} onClose={() => setTarimaModal(false)} size="md">
          <form onSubmit={saveTarima} className="space-y-4">
            <div>
              <label className={labelCls}>Material *</label>
              <div className="relative mb-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={13} />
                <input type="text" placeholder="Buscar material..." value={tarimaBusqueda}
                  onChange={e => setTarimaBusqueda(e.target.value)}
                  className={inputCls + ' pl-8 py-1.5 text-xs'} />
              </div>
              <select required value={tarimaForm.material_id}
                onChange={e => setTarimaForm(f => ({ ...f, material_id: e.target.value }))}
                className={selectCls} size={5}>
                <option value="">— Seleccione —</option>
                {materiales
                  .filter(m => {
                    const q = tarimaBusqueda.toLowerCase();
                    return !q || m.nombre.toLowerCase().includes(q) || (m.codigo || '').toLowerCase().includes(q);
                  })
                  .map(m => <option key={m.id} value={m.id}>{m.codigo ? `[${m.codigo}] ` : ''}{m.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Descripción <span style={{ color: 'var(--ink-faint)' }}>(opcional)</span></label>
              <input type="text" value={tarimaForm.descripcion} onChange={e => setTarimaForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Ej: Fleje plástico por tarima" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Cantidad por tarima *</label>
              <input type="number" required min="0.01" step="0.01" value={tarimaForm.cantidad}
                onChange={e => setTarimaForm(f => ({ ...f, cantidad: e.target.value }))} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={tarimaForm.activo} onChange={e => setTarimaForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 accent-green-500" />
              <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>Activo</span>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setTarimaModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={tarimaSaving} className={btnPrimary}>{tarimaSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal registrar movimiento */}
      {showModal && (
        <Modal title="Registrar Movimiento" onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} className="space-y-4">
            {/* Tipo */}
            <div className="grid grid-cols-3 gap-2">
              {(['entrada', 'salida', 'traslado'] as const).map(t => {
                const c = TIPO_COLORS[t];
                return (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tipo: t }))}
                    className="flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-all"
                    style={form.tipo === t
                      ? { background: c.bg, border: `2px solid ${c.border}`, color: c.text }
                      : { background: 'var(--surface-deep)', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
                    {tipoIcon(t)}{TIPO_LABELS[t]}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Material *</label>
                <select required value={form.material_id}
                  onChange={e => setForm(f => ({ ...f, material_id: e.target.value }))} className={selectCls}>
                  <option value="">— Seleccione —</option>
                  {materiales.map(m => (
                    <option key={m.id} value={m.id}>{m.codigo ? `[${m.codigo}] ` : ''}{m.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{form.tipo === 'traslado' ? 'Bodega Origen *' : 'Bodega *'}</label>
                <select required value={form.bodega_id}
                  onChange={e => setForm(f => ({ ...f, bodega_id: e.target.value }))} className={selectCls}>
                  <option value="">— Seleccione —</option>
                  {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </div>
              {form.tipo === 'traslado' && (
                <div>
                  <label className={labelCls}>Bodega Destino *</label>
                  <select required value={form.bodega_destino_id}
                    onChange={e => setForm(f => ({ ...f, bodega_destino_id: e.target.value }))} className={selectCls}>
                    <option value="">— Seleccione —</option>
                    {bodegas.filter(b => b.id !== form.bodega_id).map(b => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Cantidad *</label>
                <input type="number" min="0.01" step="0.01" required value={form.cantidad}
                  onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fecha *</label>
                <input type="date" required value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Referencia <span className="text-ink-muted">(# factura, lote, etc.)</span></label>
                <input type="text" value={form.referencia}
                  onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Notas</label>
                <textarea value={form.notas} rows={2}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className={inputCls + ' resize-none'} />
              </div>
            </div>
            {error && <p className={errorCls}>{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
