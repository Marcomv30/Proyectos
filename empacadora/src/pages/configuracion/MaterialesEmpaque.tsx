import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, AlertTriangle, Warehouse, Link2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { MaterialEmpaque, TipoMaterial, Calibre } from '../../types/empacadora';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Badge from '../../components/Badge';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

const TIPOS: { value: TipoMaterial; label: string; cls: string }[] = [
  { value: 'carton',    label: 'Cartón',    cls: 'bg-yellow-900 text-yellow-300' },
  { value: 'colilla',   label: 'Colilla',   cls: 'bg-purple-900 text-purple-300' },
  { value: 'etiqueta',  label: 'Etiqueta',  cls: 'bg-blue-900 text-blue-300' },
  { value: 'accesorio', label: 'Accesorio', cls: 'bg-teal-900 text-teal-300' },
  { value: 'otro',       label: 'Otro',      cls: 'bg-surface-overlay text-ink-muted' },
];

function tipoBadge(tipo: TipoMaterial) {
  const t = TIPOS.find(x => x.value === tipo);
  return <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${t?.cls}`}>{t?.label}</span>;
}

interface ErpProducto { id: number; codigo: string; descripcion: string; }

const EMPTY: Omit<MaterialEmpaque, 'id' | 'created_at' | 'calibre' | 'stock_actual' | 'inv_producto'> = {
  empresa_id: 0, codigo: '', nombre: '', tipo: 'carton',
  cliente_id: undefined, cliente_nombre: '', marca: '', calibre_id: '',
  unidad_medida: 'unidad', stock_minimo: 0, activo: true, inv_producto_id: null,
};

export default function MaterialesEmpaque() {
  const empresaId = useEmpresaId();
  const [rows, setRows] = useState<MaterialEmpaque[]>([]);
  const [filtered, setFiltered] = useState<MaterialEmpaque[]>([]);
  const [calibres, setCalibres] = useState<Pick<Calibre, 'id' | 'nombre' | 'frutas_por_caja'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoMaterial | 'todos'>('todos');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MaterialEmpaque | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MaterialEmpaque | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [stockBodegas, setStockBodegas] = useState<{ bodega: string; stock: number }[]>([]);
  const [erpProductos, setErpProductos] = useState<ErpProducto[]>([]);
  const [erpBusqueda, setErpBusqueda] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [matRes, calRes, erpRes] = await Promise.all([
      supabase.from('emp_materiales')
        .select('*, calibre:emp_calibres!calibre_id(id, nombre), inv:emp_inv_materiales(stock_actual)')
        .eq('empresa_id', empresaId).order('nombre'),
      supabase.from('emp_calibres').select('id, nombre, frutas_por_caja')
        .eq('empresa_id', empresaId).eq('activo', true).order('orden'),
      supabase.from('inv_productos')
        .select('id, codigo, descripcion')
        .eq('empresa_id', empresaId).eq('activo', true).order('descripcion'),
    ]);
    if (matRes.error) setError(matRes.error.message);
    else setRows((matRes.data || []).map((m: any) => ({ ...m, stock_actual: m.inv?.[0]?.stock_actual ?? 0 })));
    if (!calRes.error) setCalibres(calRes.data || []);
    if (!erpRes.error) {
      setErpProductos((erpRes.data || []).map((p: any) => ({ id: p.id, codigo: p.codigo || '', descripcion: p.descripcion })));
    }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    let r = rows;
    if (tipoFiltro !== 'todos') r = r.filter(x => x.tipo === tipoFiltro);
    if (q) r = r.filter(x =>
      x.nombre.toLowerCase().includes(q) ||
      (x.codigo || '').toLowerCase().includes(q) ||
      (x.cliente_nombre || '').toLowerCase().includes(q) ||
      (x.marca || '').toLowerCase().includes(q)
    );
    setFiltered(r);
  }, [rows, search, tipoFiltro]);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setErpBusqueda(''); setShowModal(true); }

  async function openEdit(r: MaterialEmpaque) {
    setEditing(r);
    setStockBodegas([]);
    setErpBusqueda('');
    setForm({ empresa_id: r.empresa_id, codigo: r.codigo || '', nombre: r.nombre, tipo: r.tipo,
      cliente_id: r.cliente_id, cliente_nombre: r.cliente_nombre || '', marca: r.marca || '',
      calibre_id: r.calibre_id || '', unidad_medida: r.unidad_medida,
      stock_minimo: r.stock_minimo, activo: r.activo, inv_producto_id: r.inv_producto_id ?? null });
    setShowModal(true);
    const { data } = await supabase
      .from('emp_inv_materiales')
      .select('stock_actual, bodega:emp_bodegas(nombre)')
      .eq('material_id', r.id);
    setStockBodegas((data || []).map((x: any) => ({ bodega: x.bodega?.nombre || '—', stock: x.stock_actual })));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const payload = { ...form, empresa_id: empresaId, calibre_id: form.calibre_id || null, cliente_id: form.cliente_id || null, inv_producto_id: form.inv_producto_id || null };
    const { error } = editing
      ? await supabase.from('emp_materiales').update(payload).eq('id', editing.id)
      : await supabase.from('emp_materiales').insert(payload);
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false); setShowModal(false); load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_materiales').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  const stockBajo = rows.filter(r => (r.stock_actual ?? 0) <= r.stock_minimo && r.activo).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Materiales de Empaque</h1>
          <p className="text-ink-muted text-sm mt-1">Cartón, colillas, etiquetas y accesorios por cliente</p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nuevo Material
        </button>
      </div>

      {stockBajo > 0 && (
        <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg flex items-center gap-2 text-yellow-400 text-sm">
          <AlertTriangle size={15} />
          {stockBajo} material{stockBajo > 1 ? 'es' : ''} con stock bajo o en cero
        </div>
      )}

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={14} />
          <input type="text" placeholder="Buscar nombre, código, cliente..." value={search}
            onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
        </div>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as any)} className={selectCls}>
          <option value="todos">Todos los tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      {/* Desktop */}
      <div className={`rv-desktop-table ${tableWrapCls}`}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>Código</th>
              <th className={thCls}>Nombre</th>
              <th className={thCls + ' text-center'}>Tipo</th>
              <th className={thCls}>Cliente / Marca</th>
              <th className={thCls + ' text-center'}>Calibre</th>
              <th className={thCls}>Unidad</th>
              <th className={thCls + ' text-right'}>Stock</th>
              <th className={thCls + ' text-right'}>Mín.</th>
              <th className={thCls + ' text-center'}>Estado</th>
              <th className={thCls}>ERP</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-ink-faint">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-ink-faint">Sin registros</td></tr>
            ) : filtered.map(r => {
              const alerta = (r.stock_actual ?? 0) <= r.stock_minimo && r.activo;
              return (
                <tr key={r.id} className={trCls + (alerta ? ' bg-yellow-900/10' : '')}>
                  <td className={tdCls + ' font-mono text-blue-400'}>{r.codigo || '—'}</td>
                  <td className={tdCls + ' text-ink font-medium'}>{r.nombre}</td>
                  <td className={tdCls + ' text-center'}>{tipoBadge(r.tipo)}</td>
                  <td className={tdCls}>
                    <div className="text-ink">{r.cliente_nombre || '—'}</div>
                    {r.marca && <div className="text-ink-faint text-[11px]">{r.marca}</div>}
                  </td>
                  <td className={tdCls + ' text-center text-ink-muted'}>
                    {r.calibre?.nombre ? `Cal. ${r.calibre.nombre}` : 'Todos'}
                  </td>
                  <td className={tdCls + ' text-ink-muted'}>{r.unidad_medida}</td>
                  <td className={tdCls + ' text-right ' + (alerta ? 'text-yellow-400 font-bold' : 'text-ink')}>
                    {alerta && <AlertTriangle size={11} className="inline mr-1" />}
                    {(r.stock_actual ?? 0).toLocaleString('es-CR')}
                  </td>
                  <td className={tdCls + ' text-right text-ink-faint'}>{r.stock_minimo.toLocaleString('es-CR')}</td>
                  <td className={tdCls + ' text-center'}><Badge activo={r.activo} /></td>
                  <td className={tdCls}>
                    {(() => {
                      const erp = r.inv_producto_id ? erpProductos.find(p => p.id === r.inv_producto_id) : null;
                      return erp
                        ? <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]"><Link2 size={10} />{erp.codigo}</span>
                        : <span className="text-ink-faint text-[11px]">—</span>;
                    })()}
                  </td>
                  <td className={tdCls}>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/30 transition-colors"><Pencil size={13} /></button>
                      <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/30 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="rv-mobile-cards space-y-3">
        {filtered.map(r => {
          const alerta = (r.stock_actual ?? 0) <= r.stock_minimo && r.activo;
          return (
            <div key={r.id} className={`bg-surface-raised border rounded-xl p-4 ${alerta ? 'border-yellow-700' : 'border-line'}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink">{r.nombre}</span>
                    {tipoBadge(r.tipo)}
                  </div>
                  {r.cliente_nombre && <p className="text-xs text-gray-400 mt-0.5">{r.cliente_nombre}</p>}
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className={alerta ? 'text-yellow-400 font-medium' : 'text-gray-400'}>
                      Stock: {(r.stock_actual ?? 0).toLocaleString('es-CR')} {r.unidad_medida}
                    </span>
                    {r.calibre?.nombre && <span className="text-gray-500">Cal. {r.calibre.nombre}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge activo={r.activo} />
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 p-1.5 rounded hover:bg-blue-900/30"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 p-1.5 rounded hover:bg-red-900/30"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <Modal title={editing ? 'Editar Material' : 'Nuevo Material de Empaque'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Código</label>
                <input type="text" value={form.codigo || ''} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ej: MAT-001" className={inputCls} /></div>
              <div><label className={labelCls}>Tipo *</label>
                <select required value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoMaterial }))} className={inputCls}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select></div>
            </div>
            <div><label className={labelCls}>Nombre *</label>
              <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Cliente (nombre)</label>
                <input type="text" value={form.cliente_nombre || ''} onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))} placeholder="Dueño del material" className={inputCls} /></div>
              <div><label className={labelCls}>Marca</label>
                <input type="text" value={form.marca || ''} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Calibre específico</label>
                <select value={form.calibre_id || ''} onChange={e => setForm(f => ({ ...f, calibre_id: e.target.value }))} className={inputCls}>
                  <option value="">— Aplica a todos —</option>
                  {calibres.map(c => <option key={c.id} value={c.id}>Calibre {c.nombre} ({c.frutas_por_caja} uds)</option>)}
                </select></div>
              <div><label className={labelCls}>Unidad de Medida *</label>
                <select required value={form.unidad_medida} onChange={e => setForm(f => ({ ...f, unidad_medida: e.target.value }))} className={inputCls}>
                  <option value="unidad">Unidad</option>
                  <option value="caja">Caja</option>
                  <option value="paquete">Paquete</option>
                  <option value="rollo">Rollo</option>
                  <option value="kg">Kg</option>
                </select></div>
            </div>
            <div><label className={labelCls}>Stock Mínimo</label>
              <input type="number" min="0" value={form.stock_minimo}
                onChange={e => setForm(f => ({ ...f, stock_minimo: parseFloat(e.target.value) || 0 }))} className={inputCls} /></div>
            {editing && (
              <div className="rounded-lg p-3" style={{ background: 'var(--surface-deep)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}>
                  <Warehouse size={11} /> Stock por Bodega
                </p>
                {stockBodegas.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Sin movimientos registrados — stock en 0</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {stockBodegas.map(b => (
                      <div key={b.bodega} className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>{b.bodega}:</span>
                        <span className={`text-sm font-bold ${b.stock <= 0 ? 'text-red-400' : 'text-ink'}`}>
                          {b.stock.toLocaleString('es-CR')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* ── Vínculo con catálogo ERP ── */}
            <div className="rounded-lg p-3 border" style={{ background: 'var(--surface-deep)', borderColor: 'var(--line)' }}>
              <label className={labelCls + ' flex items-center gap-1.5 mb-2'}>
                <Link2 size={11} /> Producto ERP vinculado
                <span className="font-normal ml-1" style={{ color: 'var(--ink-faint)' }}>(sincroniza entradas de FE automáticamente)</span>
              </label>

              {/* Material vinculado actualmente */}
              {form.inv_producto_id ? (
                <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-emerald-800/50 bg-emerald-950/20 mb-2">
                  {(() => {
                    const p = erpProductos.find(x => x.id === form.inv_producto_id);
                    return p ? (
                      <div>
                        <span className="font-mono text-xs text-emerald-300">{p.codigo}</span>
                        <span className="text-xs text-emerald-400 ml-2">{p.descripcion}</span>
                      </div>
                    ) : <span className="text-xs text-ink-muted">ID: {form.inv_producto_id}</span>;
                  })()}
                  <button type="button"
                    onClick={() => { setForm(f => ({ ...f, inv_producto_id: null })); setErpBusqueda(''); }}
                    className="text-xs text-red-400 hover:text-red-300 ml-3 shrink-0">
                    Quitar
                  </button>
                </div>
              ) : (
                <p className="text-[11px] mb-2" style={{ color: 'var(--ink-faint)' }}>Sin vínculo — las entradas de FE no se sincronizarán</p>
              )}

              {/* Buscador */}
              <div className="relative mb-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={13} />
                <input
                  type="text"
                  placeholder="Buscar producto ERP por código o nombre..."
                  value={erpBusqueda}
                  onChange={e => setErpBusqueda(e.target.value)}
                  className={inputCls + ' pl-8 py-1.5 text-xs'}
                />
              </div>
              <select
                size={5}
                value={form.inv_producto_id ?? ''}
                onChange={e => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setForm(f => ({ ...f, inv_producto_id: id }));
                  if (id) setErpBusqueda('');
                }}
                className={selectCls}
              >
                <option value="">— Sin vínculo —</option>
                {erpProductos
                  .filter(p => {
                    const q = erpBusqueda.toLowerCase();
                    return !q || (p.codigo || '').toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q);
                  })
                  .slice(0, 80)
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.codigo ? `[${p.codigo}] ` : ''}{p.descripcion}
                    </option>
                  ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 accent-green-500" />
              <span className="text-sm text-gray-300">Activo</span>
            </label>
            {error && <p className={errorCls}>{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog message={`¿Eliminar el material "${deleteTarget.nombre}"?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  );
}
