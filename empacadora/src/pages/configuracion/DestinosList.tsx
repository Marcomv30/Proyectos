import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, Anchor } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Destino, ClienteExportador } from '../../types/empacadora';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Badge from '../../components/Badge';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

type FormDestino = Omit<Destino, 'id' | 'created_at'>;

const EMPTY: FormDestino = {
  empresa_id: 0, nombre: '', ubicacion: '', cliente_nombre: '',
  emp_cliente_id: '', contacto: '', activo: true,
};

export default function DestinosList() {
  const empresaId = useEmpresaId();
  const [rows, setRows]         = useState<Destino[]>([]);
  const [filtered, setFiltered] = useState<Destino[]>([]);
  const [clientes, setClientes] = useState<Pick<ClienteExportador, 'id' | 'nombre'>[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [showModal, setShowModal]       = useState(false);
  const [editing, setEditing]           = useState<Destino | null>(null);
  const [form, setForm]                 = useState<FormDestino>(EMPTY);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Destino | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: dests }, { data: clis }] = await Promise.all([
      supabase.from('emp_destinos').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('emp_clientes').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
    ]);
    setRows(dests || []);
    setClientes(clis || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search) { setFiltered(rows); return; }
    const s = search.toLowerCase();
    setFiltered(rows.filter(r =>
      r.nombre.toLowerCase().includes(s) ||
      (r.ubicacion || '').toLowerCase().includes(s) ||
      (r.cliente_nombre || '').toLowerCase().includes(s)
    ));
  }, [rows, search]);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); }

  function openEdit(r: Destino) {
    setEditing(r);
    setForm({
      empresa_id: r.empresa_id, nombre: r.nombre, ubicacion: r.ubicacion || '',
      cliente_nombre: r.cliente_nombre || '', emp_cliente_id: r.emp_cliente_id || '',
      contacto: r.contacto || '', activo: r.activo,
    });
    setShowModal(true);
  }

  function handleClienteChange(clienteId: string) {
    const cli = clientes.find(c => c.id === clienteId);
    setForm(f => ({ ...f, emp_cliente_id: clienteId, cliente_nombre: cli?.nombre || '' }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const payload = {
      ...form, empresa_id: empresaId,
      emp_cliente_id: form.emp_cliente_id || null,
      cliente_nombre: form.cliente_nombre || null,
    };
    const { error } = editing
      ? await supabase.from('emp_destinos').update(payload).eq('id', editing.id)
      : await supabase.from('emp_destinos').insert(payload);
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false); setShowModal(false); load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_destinos').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Destinos de Exportación</h1>
          <p className="text-gray-400 text-sm mt-1">Puertos y destinos internacionales — {rows.length} registros</p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nuevo Destino
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
          <input type="text" placeholder="Buscar puerto o país..." value={search}
            onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      <div className={tableWrapCls}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>Puerto / Destino</th>
              <th className={thCls}>Ubicación</th>
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Contacto</th>
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
                    <Anchor size={12} className="text-blue-400" />
                    <span className="font-bold text-ink">{r.nombre}</span>
                  </div>
                </td>
                <td className={tdCls + ' text-gray-400'}>{r.ubicacion || '—'}</td>
                <td className={tdCls + ' text-gray-400'}>{r.cliente_nombre || '—'}</td>
                <td className={tdCls + ' text-gray-400'}>{r.contacto || '—'}</td>
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

      {showModal && (
        <Modal title={editing ? 'Editar Destino' : 'Nuevo Destino'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className={labelCls}>Puerto / Destino *</label>
              <input type="text" required value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value.toUpperCase() }))}
                placeholder="Ej: VADO, TARRAGONA, SETUBAL"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Ubicación</label>
              <input type="text" value={form.ubicacion || ''}
                onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))}
                placeholder="Ciudad, País"
                className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Cliente</label>
                <select value={form.emp_cliente_id || ''} onChange={e => handleClienteChange(e.target.value)} className={selectCls + ' w-full'}>
                  <option value="">— Sin cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Contacto</label>
                <input type="text" value={form.contacto || ''}
                  onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))}
                  className={inputCls} />
              </div>
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
        <ConfirmDialog message={`¿Eliminar el destino "${deleteTarget.nombre}"?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  );
}
