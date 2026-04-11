import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Calibre } from '../../types/empacadora';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Badge from '../../components/Badge';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

const EMPTY: Omit<Calibre, 'id' | 'created_at'> = {
  empresa_id: 0,
  nombre: '',
  frutas_por_caja: 0,
  tipo: 'COR',
  descripcion: '',
  activo: true,
  orden: 0,
};

// marca_id null = aplica a todas las marcas
type MatLinea = {
  marca_id: string | null;
  marca_nombre: string;
  material_id: string;
  material_nombre: string;
  cantidad: number;
};

export default function CalibresList() {
  const empresaId = useEmpresaId();
  const [rows, setRows] = useState<Calibre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Calibre | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Calibre | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [materiales, setMateriales] = useState<{ id: string; nombre: string }[]>([]);
  const [marcas, setMarcas] = useState<{ id: string; nombre: string }[]>([]);
  const [matLineas, setMatLineas] = useState<MatLinea[]>([]);
  const [relacionesPorCalibre, setRelacionesPorCalibre] = useState<Record<string, MatLinea[]>>({});
  const [expandedCalibreId, setExpandedCalibreId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: mats }, { data: mrcs }, { data: rels }] = await Promise.all([
      supabase.from('emp_calibres').select('*').eq('empresa_id', empresaId).order('orden', { ascending: true }),
      supabase.from('emp_materiales').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_marcas').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase
        .from('emp_calibre_materiales')
        .select('calibre_id, marca_id, material_id, cantidad, orden, emp_materiales(nombre), emp_marcas(nombre)')
        .eq('empresa_id', empresaId)
        .order('calibre_id')
        .order('marca_id', { ascending: true, nullsFirst: true })
        .order('orden'),
    ]);
    if (error) setError(error.message);
    else setRows(data || []);
    setMateriales((mats || []) as any[]);
    setMarcas((mrcs || []) as any[]);
    const grouped = ((rels || []) as any[]).reduce<Record<string, MatLinea[]>>((acc, rel) => {
      if (!acc[rel.calibre_id]) acc[rel.calibre_id] = [];
      acc[rel.calibre_id].push({
        marca_id: rel.marca_id ?? null,
        marca_nombre: rel.emp_marcas?.nombre || '',
        material_id: rel.material_id,
        material_nombre: rel.emp_materiales?.nombre || '',
        cantidad: rel.cantidad,
      });
      return acc;
    }, {});
    setRelacionesPorCalibre(grouped);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    const nextOrden = rows.length > 0 ? Math.max(...rows.map(r => r.orden)) + 10 : 10;
    setEditing(null);
    setForm({ ...EMPTY, orden: nextOrden });
    setMatLineas([]);
    setShowModal(true);
  }

  async function openEdit(r: Calibre) {
    setEditing(r);
    setForm({ empresa_id: r.empresa_id, nombre: r.nombre, frutas_por_caja: r.frutas_por_caja,
      tipo: r.tipo, descripcion: r.descripcion || '',
      activo: r.activo, orden: r.orden });
    // Cargar TODAS las combinaciones (marca_id null + específicas), ordenadas por marca y orden
    const { data: lineas } = await supabase
      .from('emp_calibre_materiales')
      .select('marca_id, material_id, cantidad, orden, emp_materiales(nombre), emp_marcas(nombre)')
      .eq('calibre_id', r.id)
      .order('marca_id', { ascending: true, nullsFirst: true })
      .order('orden');
    setMatLineas(((lineas || []) as any[]).map(l => ({
      marca_id: l.marca_id ?? null,
      marca_nombre: (l.emp_marcas as any)?.nombre || '',
      material_id: l.material_id,
      material_nombre: (l.emp_materiales as any)?.nombre || '',
      cantidad: l.cantidad,
    })));
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = { ...form, empresa_id: empresaId };
    let calibreId = editing?.id;
    if (editing) {
      const { error } = await supabase.from('emp_calibres').update(payload).eq('id', editing.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('emp_calibres').insert(payload).select('id').single();
      if (error) { setError(error.message); setSaving(false); return; }
      calibreId = (data as any).id;
    }
    // Reemplazar todas las líneas de materiales del calibre
    if (calibreId) {
      const { error: errDel } = await supabase.from('emp_calibre_materiales').delete().eq('calibre_id', calibreId);
      if (errDel) { setError(errDel.message); setSaving(false); return; }
      const lineasValidas = matLineas.filter(l => l.material_id);
      if (lineasValidas.length > 0) {
        // Agrupar por marca para asignar orden dentro de cada grupo
        const grupos = new Map<string | null, MatLinea[]>();
        for (const l of lineasValidas) {
          const key = l.marca_id ?? null;
          if (!grupos.has(key)) grupos.set(key, []);
          grupos.get(key)!.push(l);
        }
        const insertRows: any[] = [];
        grupos.forEach((lineas, marcaId) => {
          lineas.forEach((l, i) => {
            insertRows.push({
              empresa_id: empresaId,
              calibre_id: calibreId,
              marca_id: marcaId,
              material_id: l.material_id,
              cantidad: l.cantidad,
              orden: i + 1,
            });
          });
        });
        const { error: errIns } = await supabase.from('emp_calibre_materiales').insert(insertRows);
        if (errIns) { setError(errIns.message); setSaving(false); return; }
      }
    }
    setSaving(false); setShowModal(false); load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_calibres').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  async function moveOrden(id: string, dir: 'up' | 'down') {
    const idx = rows.findIndex(r => r.id === id);
    if ((dir === 'up' && idx === 0) || (dir === 'down' && idx === rows.length - 1)) return;
    const other = dir === 'up' ? rows[idx - 1] : rows[idx + 1];
    const current = rows[idx];
    await supabase.from('emp_calibres').update({ orden: other.orden }).eq('id', current.id);
    await supabase.from('emp_calibres').update({ orden: current.orden }).eq('id', other.id);
    load();
  }

  function addLinea() {
    setMatLineas(ls => [...ls, { marca_id: null, marca_nombre: '', material_id: '', material_nombre: '', cantidad: 1 }]);
  }

  function toggleRelations(calibreId: string) {
    if ((relacionesPorCalibre[calibreId] || []).length === 0) return;
    setExpandedCalibreId(prev => prev === calibreId ? null : calibreId);
  }

  function renderRelationsInline(r: Calibre) {
    const lineas = relacionesPorCalibre[r.id] || [];
    if (lineas.length === 0) {
      return (
        <div className="rounded-xl border border-orange-600/45 bg-orange-950/20 p-4 text-sm text-orange-200 shadow-[0_0_0_1px_rgba(249,115,22,0.12),0_0_24px_rgba(249,115,22,0.14)] animate-[pulse_2.8s_ease-in-out_infinite]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-orange-500/20 p-2 text-orange-300">
              <AlertTriangle size={16} />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-orange-100">Falta relacionar materiales de empaque</p>
              <p className="text-orange-200/90">
                Este calibre aun no tiene Materiales de Empaque configurados. Puede abrir la edicion para agregarlos ahora.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-orange-500/45 overflow-hidden shadow-[0_0_0_1px_rgba(249,115,22,0.12),0_0_26px_rgba(249,115,22,0.14)] animate-[pulse_3.2s_ease-in-out_infinite]">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-3 py-2 text-left text-ink-faint font-medium">Marca</th>
              <th className="px-3 py-2 text-left text-ink-faint font-medium">Material</th>
              <th className="px-3 py-2 text-center text-ink-faint font-medium">Cantidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-dim">
            {lineas.map((linea, index) => (
              <tr key={`${linea.marca_id || 'all'}-${linea.material_id}-${index}`}>
                <td className="px-3 py-2 text-ink">{linea.marca_nombre || 'Todas'}</td>
                <td className="px-3 py-2 text-ink">{linea.material_nombre}</td>
                <td className="px-3 py-2 text-center text-ink-muted">{linea.cantidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Calibres</h1>
          <p className="text-ink-muted text-sm mt-1">Tamaños de fruta — {rows.length} registros</p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nuevo Calibre
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      {/* Desktop */}
      <div className={`rv-desktop-table ${tableWrapCls}`}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>Orden</th>
              <th className={thCls}>Calibre</th>
              <th className={thCls + ' text-center'}>Frutas/Caja</th>
              <th className={thCls}>Descripción</th>
              <th className={thCls + ' text-center'}>Relaciones</th>
              <th className={thCls + ' text-center'}>Estado</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-faint">Cargando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-faint">Sin registros</td></tr>
            ) : rows.map((r, idx) => {
              const relationCount = (relacionesPorCalibre[r.id] || []).length;
              const isExpanded = expandedCalibreId === r.id;
              return (
                <React.Fragment key={r.id}>
                  <tr className={`${trCls} ${isExpanded ? 'bg-orange-950/10' : ''}`}>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveOrden(r.id, 'up')} disabled={idx === 0}
                          className="text-ink-faint hover:text-ink disabled:opacity-20"><ArrowUp size={13} /></button>
                        <button onClick={() => moveOrden(r.id, 'down')} disabled={idx === rows.length - 1}
                          className="text-ink-faint hover:text-ink disabled:opacity-20"><ArrowDown size={13} /></button>
                      </div>
                    </td>
                    <td className={tdCls + ' font-semibold text-ink'}>{r.nombre}</td>
                    <td className={tdCls + ' text-center'}>{r.frutas_por_caja}</td>
                    <td className={tdCls + ' text-ink-muted'}>{r.descripcion || '—'}</td>
                    <td className={tdCls + ' text-center'}>
                      {relationCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleRelations(r.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-950/30 px-3 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-900/30"
                        >
                          <CheckCircle2 size={12} />
                          {relationCount} materiales
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-2 rounded-full border border-amber-700/40 bg-amber-950/30 px-3 py-1 text-[11px] font-medium text-amber-300"
                        >
                          <AlertTriangle size={12} />
                          Falta relacionar
                        </span>
                      )}
                    </td>
                    <td className={tdCls + ' text-center'}><Badge activo={r.activo} /></td>
                    <td className={tdCls}>
                      <div className="flex justify-end gap-2">
                        {relationCount > 0 ? (
                          <button onClick={() => toggleRelations(r.id)} className="text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-900/30 transition-colors">{isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
                        ) : (
                          <span className="px-2 py-1 text-amber-500/70"><AlertTriangle size={13} /></span>
                        )}
                        <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/30 transition-colors"><Pencil size={13} /></button>
                        <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/30 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className={trCls}>
                      <td colSpan={7} className="px-4 py-4 bg-orange-950/10">
                        <div className="space-y-4">
                          {renderRelationsInline(r)}
                          <div className="flex justify-end">
                            <button type="button" onClick={() => openEdit(r)} className={btnSecondary}>Editar relaciones</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="rv-mobile-cards space-y-3">
        {rows.map(r => {
          const relationCount = (relacionesPorCalibre[r.id] || []).length;
          const isExpanded = expandedCalibreId === r.id;
          return (
          <div key={r.id} className={`bg-surface-raised border rounded-xl p-4 ${isExpanded ? 'border-orange-500/40 shadow-[0_0_0_1px_rgba(249,115,22,0.10)]' : 'border-line'}`}>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-lg font-bold text-ink">Calibre {r.nombre}</span>
                <p className="text-sm text-ink-muted mt-0.5">{r.frutas_por_caja} frutas/caja</p>
                <div className="mt-2">
                  {relationCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggleRelations(r.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-950/30 px-3 py-1 text-[11px] font-medium text-emerald-300"
                    >
                      <CheckCircle2 size={12} />
                      {relationCount} relaciones
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-2 rounded-full border border-amber-700/40 bg-amber-950/30 px-3 py-1 text-[11px] font-medium text-amber-300"
                    >
                      <AlertTriangle size={12} />
                      Sin materiales
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge activo={r.activo} />
                <div className="flex gap-2">
                  {relationCount > 0 ? (
                    <button onClick={() => toggleRelations(r.id)} className="text-emerald-400 hover:text-emerald-300 p-1.5 rounded hover:bg-emerald-900/30">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                  ) : (
                    <span className="p-1.5 text-amber-500/70"><AlertTriangle size={14} /></span>
                  )}
                  <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 p-1.5 rounded hover:bg-blue-900/30"><Pencil size={14} /></button>
                  <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 p-1.5 rounded hover:bg-red-900/30"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
            {isExpanded && (
              <div className="mt-4 space-y-4 border-t border-line pt-4">
                {renderRelationsInline(r)}
                <div className="flex justify-end">
                  <button type="button" onClick={() => openEdit(r)} className={btnSecondary}>Editar relaciones</button>
                </div>
              </div>
            )}
          </div>
        )})}
      </div>

      {showModal && (
        <Modal title={editing ? 'Editar Calibre' : 'Nuevo Calibre'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Calibre *</label>
                <input type="text" required value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: 8" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Frutas por Caja *</label>
                <input type="number" required min={1} value={form.frutas_por_caja}
                  onChange={e => setForm(f => ({ ...f, frutas_por_caja: parseInt(e.target.value) || 0 }))}
                  className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Descripción</label>
              <input type="text" value={form.descripcion || ''}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Opcional" className={inputCls} />
            </div>

            {/* Materiales por Marca + Calibre */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <label className={labelCls + ' mb-0'}>Materiales de Empaque</label>
                  <p className="text-[10px] text-ink-faint mt-0.5">Por marca específica o "Todas" como predeterminado</p>
                </div>
                <button type="button" onClick={addLinea}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <Plus size={12} /> Agregar
                </button>
              </div>
              {matLineas.length === 0 ? (
                <p className="text-xs text-ink-faint italic py-2 border border-dashed border-line rounded-lg text-center">
                  Sin materiales — use Agregar para configurar
                </p>
              ) : (
                <div className="border border-line rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-raised">
                      <tr>
                        <th className="px-3 py-2 text-left text-ink-faint font-medium w-36">Marca</th>
                        <th className="px-3 py-2 text-left text-ink-faint font-medium">Material</th>
                        <th className="px-3 py-2 text-center text-ink-faint font-medium w-20">Cant.</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-dim">
                      {matLineas.map((l, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5">
                            <select
                              value={l.marca_id || ''}
                              onChange={e => {
                                const marca = marcas.find(m => m.id === e.target.value);
                                setMatLineas(ls => ls.map((x, j) => j === i
                                  ? { ...x, marca_id: e.target.value || null, marca_nombre: marca?.nombre || '' }
                                  : x));
                              }}
                              className={selectCls + ' text-xs py-1'}>
                              <option value="">Todas</option>
                              {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={l.material_id}
                              onChange={e => {
                                const mat = materiales.find(m => m.id === e.target.value);
                                setMatLineas(ls => ls.map((x, j) => j === i
                                  ? { ...x, material_id: e.target.value, material_nombre: mat?.nombre || '' }
                                  : x));
                              }}
                              className={selectCls + ' text-xs py-1 w-full'}>
                              <option value="">— Seleccionar —</option>
                              {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0.0001} step="any"
                              value={l.cantidad}
                              onChange={e => setMatLineas(ls => ls.map((x, j) => j === i
                                ? { ...x, cantidad: parseFloat(e.target.value) || 1 }
                                : x))}
                              className={inputCls + ' text-xs py-1 text-center'} />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button type="button"
                              onClick={() => setMatLineas(ls => ls.filter((_, j) => j !== i))}
                              className="text-red-500 hover:text-red-400 p-0.5">
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Orden</label>
                <input type="number" value={form.orden}
                  onChange={e => setForm(f => ({ ...f, orden: parseInt(e.target.value) || 0 }))}
                  className={inputCls} />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.activo}
                    onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                    className="w-4 h-4 accent-green-500" />
                  <span className="text-sm text-ink">Activo</span>
                </label>
              </div>
            </div>
            {error && <p className={errorCls}>{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`¿Eliminar el calibre "${deleteTarget.nombre}"?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting}
        />
      )}
    </div>
  );
}
