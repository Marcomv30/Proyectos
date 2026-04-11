import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, Truck } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Transportista, ProveedorFruta } from '../../types/empacadora';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Badge from '../../components/Badge';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

const EMPTY: Omit<Transportista, 'id' | 'created_at' | 'proveedor'> = {
  empresa_id: 0, nombre: '', telefono: '', placa: '', activo: true,
};

export default function TransportistasList() {
  const empresaId = useEmpresaId();
  const [rows, setRows] = useState<Transportista[]>([]);
  const [filtered, setFiltered] = useState<Transportista[]>([]);
  const [proveedores, setProveedores] = useState<Pick<ProveedorFruta, 'id' | 'nombre'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Transportista | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transportista | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: trans }, { data: prov }] = await Promise.all([
      supabase.from('emp_transportistas')
        .select('*, proveedor:emp_proveedores_fruta(id, nombre)')
        .eq('empresa_id', empresaId).order('nombre'),
      supabase.from('emp_proveedores_fruta')
        .select('id, nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
    ]);
    setRows(trans || []);
    setProveedores(prov || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search) { setFiltered(rows); return; }
    const s = search.toLowerCase();
    setFiltered(rows.filter(r =>
      r.nombre.toLowerCase().includes(s) ||
      (r.placa || '').toLowerCase().includes(s) ||
      (r.proveedor?.nombre || '').toLowerCase().includes(s)
    ));
  }, [rows, search]);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); }

  function openEdit(r: Transportista) {
    setEditing(r);
    setForm({ empresa_id: r.empresa_id, nombre: r.nombre, telefono: r.telefono || '',
      placa: r.placa || '', proveedor_id: r.proveedor_id, activo: r.activo });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const payload = { ...form, empresa_id: empresaId, proveedor_id: form.proveedor_id || null };
    const { error } = editing
      ? await supabase.from('emp_transportistas').update(payload).eq('id', editing.id)
      : await supabase.from('emp_transportistas').insert(payload);
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false); setShowModal(false); load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_transportistas').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Transportistas</h1>
          <p className="text-gray-400 text-sm mt-1">Conductores y vehículos — {rows.length} registros</p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nuevo Transportista
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
          <input type="text" placeholder="Buscar nombre, placa o productor..." value={search}
            onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      <div className={tableWrapCls}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>Nombre</th>
              <th className={thCls}>Placa</th>
              <th className={thCls}>Teléfono</th>
              <th className={thCls}>Productor</th>
              <th className={thCls + ' text-center'}>Estado</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-600">Sin registros</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className={trCls}>
                <td className={tdCls}>
                  <div className="flex items-center gap-2">
                    <Truck size={12} className="text-gray-500" />
                    <span className="font-medium text-ink">{r.nombre}</span>
                  </div>
                </td>
                <td className={tdCls + ' font-mono text-blue-400'}>{r.placa || '—'}</td>
                <td className={tdCls + ' text-gray-400'}>{r.telefono || '—'}</td>
                <td className={tdCls + ' text-gray-400'}>{r.proveedor?.nombre || '—'}</td>
                <td className={tdCls + ' text-center'}><Badge activo={r.activo} /></td>
                <td className={tdCls}>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/30 transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/30 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="rv-mobile-cards space-y-3">
        {filtered.map(r => (
          <div key={r.id} className="bg-surface-raised border border-line rounded-xl p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <span className="font-semibold text-ink">{r.nombre}</span>
                {r.placa && <p className="text-xs text-blue-400 font-mono mt-0.5">Placa: {r.placa}</p>}
                {r.proveedor?.nombre && <p className="text-xs text-gray-400 mt-0.5">{r.proveedor.nombre}</p>}
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
        ))}
      </div>

      {showModal && (
        <Modal title={editing ? 'Editar Transportista' : 'Nuevo Transportista'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className={labelCls}>Nombre *</label>
              <input type="text" required value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre del conductor" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Placa</label>
                <input type="text" value={form.placa || ''}
                  onChange={e => setForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                  placeholder="Ej: 156879" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input type="text" value={form.telefono || ''}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Productor / Finca</label>
              <select value={form.proveedor_id || ''}
                onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value || undefined }))}
                className={selectCls}>
                <option value="">— Sin asignar —</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                className="w-4 h-4 accent-green-500" />
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
        <ConfirmDialog message={`¿Eliminar el transportista "${deleteTarget.nombre}"?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  );
}
