import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, Users, Tractor } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { ProveedorFruta } from '../../types/empacadora';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Badge from '../../components/Badge';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

const EMPTY: Omit<ProveedorFruta, 'id' | 'created_at'> = {
  empresa_id: 0, codigo: '', nombre: '', cedula: '', tipo: 'tercero',
  telefono: '', email: '', direccion: '', contacto: '', ggn_gln: '', activo: true,
};

export default function ProveedoresFruta() {
  const empresaId = useEmpresaId();
  const [rows, setRows] = useState<ProveedorFruta[]>([]);
  const [filtered, setFiltered] = useState<ProveedorFruta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'propio' | 'tercero'>('todos');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ProveedorFruta | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProveedorFruta | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('emp_proveedores_fruta').select('*')
      .eq('empresa_id', empresaId).order('nombre');
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let r = rows;
    if (tipoFiltro !== 'todos') r = r.filter(x => x.tipo === tipoFiltro);
    if (search) r = r.filter(x =>
      x.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (x.cedula || '').includes(search) ||
      (x.codigo || '').toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(r);
  }, [rows, search, tipoFiltro]);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); }

  function openEdit(r: ProveedorFruta) {
    setEditing(r);
    setForm({ empresa_id: r.empresa_id, codigo: r.codigo || '', nombre: r.nombre,
      cedula: r.cedula || '', tipo: r.tipo, telefono: r.telefono || '',
      email: r.email || '', direccion: r.direccion || '', contacto: r.contacto || '',
      ggn_gln: r.ggn_gln || '', activo: r.activo });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const { error } = editing
      ? await supabase.from('emp_proveedores_fruta').update({ ...form, empresa_id: empresaId }).eq('id', editing.id)
      : await supabase.from('emp_proveedores_fruta').insert({ ...form, empresa_id: empresaId });
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false); setShowModal(false); load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_proveedores_fruta').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  const totalPropio = rows.filter(r => r.tipo === 'propio').length;
  const totalTercero = rows.filter(r => r.tipo === 'tercero').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Proveedores de Fruta</h1>
          <p className="text-ink-muted text-sm mt-1">Finca propia y terceros — {rows.length} registros</p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nuevo Proveedor
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-surface-raised border border-line rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-green-900/50 rounded-lg"><Tractor className="text-green-400" size={18} /></div>
          <div>
            <p className="text-2xl font-bold text-ink">{totalPropio}</p>
            <p className="text-xs text-ink-muted">Finca Propia</p>
          </div>
        </div>
        <div className="bg-surface-raised border border-line rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-900/50 rounded-lg"><Users className="text-blue-400" size={18} /></div>
          <div>
            <p className="text-2xl font-bold text-ink">{totalTercero}</p>
            <p className="text-xs text-ink-muted">Terceros</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
          <input type="text" placeholder="Buscar nombre, cédula..." value={search}
            onChange={e => setSearch(e.target.value)}
            className={inputCls + ' pl-9'} />
        </div>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as any)} className={selectCls}>
          <option value="todos">Todos los tipos</option>
          <option value="propio">Finca Propia</option>
          <option value="tercero">Terceros</option>
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
              <th className={thCls}>Cédula</th>
              <th className={thCls + ' text-center'}>Tipo</th>
              <th className={thCls}>Contacto</th>
              <th className={thCls}>Teléfono</th>
              <th className={thCls + ' text-center'}>Estado</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-600">Sin registros</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className={trCls}>
                <td className={tdCls + ' font-mono text-blue-400'}>{r.codigo || '—'}</td>
                <td className={tdCls + ' font-medium text-ink'}>{r.nombre}</td>
                <td className={tdCls}>{r.cedula || '—'}</td>
                <td className={tdCls + ' text-center'}>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.tipo === 'propio' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'
                  }`}>{r.tipo === 'propio' ? 'Finca Propia' : 'Tercero'}</span>
                </td>
                <td className={tdCls + ' text-ink-muted'}>{r.contacto || '—'}</td>
                <td className={tdCls + ' text-ink-muted'}>{r.telefono || '—'}</td>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink">{r.nombre}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.tipo === 'propio' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'
                  }`}>{r.tipo === 'propio' ? 'Finca Propia' : 'Tercero'}</span>
                </div>
                {r.cedula && <p className="text-xs text-ink-muted mt-1">Cédula: {r.cedula}</p>}
                {r.telefono && <p className="text-xs text-ink-muted">Tel: {r.telefono}</p>}
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
        <Modal title={editing ? 'Editar Proveedor' : 'Nuevo Proveedor de Fruta'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Código</label>
                <input type="text" value={form.codigo || ''} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ej: PROV-001" className={inputCls} /></div>
              <div><label className={labelCls}>Tipo *</label>
                <select required value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))} className={inputCls}>
                  <option value="tercero">Tercero</option>
                  <option value="propio">Finca Propia</option>
                </select></div>
            </div>
            <div><label className={labelCls}>Nombre *</label>
              <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del proveedor o finca" className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Cédula / ID</label>
                <input type="text" value={form.cedula || ''} onChange={e => setForm(f => ({ ...f, cedula: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Teléfono</label>
                <input type="text" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Email</label>
                <input type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Persona de Contacto</label>
                <input type="text" value={form.contacto || ''} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} className={inputCls} /></div>
            </div>
            <div>
              <label className={labelCls}>GGN / GLN (GlobalG.A.P.)</label>
              <input type="text" value={(form as any).ggn_gln || ''}
                onChange={e => setForm(f => ({ ...f, ggn_gln: e.target.value } as any))}
                placeholder="Ej: 4052852198479" className={inputCls + ' font-mono'} />
            </div>
            <div><label className={labelCls}>Dirección</label>
              <textarea value={form.direccion || ''} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} rows={2}
                className={inputCls + ' resize-none'} /></div>
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
        <ConfirmDialog message={`¿Eliminar el proveedor "${deleteTarget.nombre}"?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  );
}
