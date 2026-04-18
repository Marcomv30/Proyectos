import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Warehouse, Star } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Bodega } from '../../types/empacadora';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Badge from '../../components/Badge';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

const TIPO_OPTS: { value: Bodega['tipo']; label: string; desc: string }[] = [
  { value: 'BG',   label: 'BG — Bodega General',     desc: 'Compras / stock a granel' },
  { value: 'IP',   label: 'IP — En Proceso',          desc: 'Materiales trasladados para uso semanal' },
  { value: 'OTRA', label: 'Otra',                     desc: 'Otro tipo de bodega' },
];

const EMPTY: Omit<Bodega, 'id' | 'created_at'> = {
  empresa_id: 0, nombre: '', descripcion: '', tipo: undefined,
  erp_bodega_id: undefined, es_principal: false, activo: true,
};

export default function BodegasList() {
  const empresaId = useEmpresaId();
  const [rows, setRows] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Bodega | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Bodega | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('emp_bodegas').select('*')
      .eq('empresa_id', empresaId).order('es_principal', { ascending: false }).order('nombre');
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); }
  function openEdit(r: Bodega) {
    setEditing(r);
    setForm({
      empresa_id: r.empresa_id, nombre: r.nombre,
      descripcion: r.descripcion || '', tipo: r.tipo,
      erp_bodega_id: r.erp_bodega_id, es_principal: r.es_principal, activo: r.activo,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const { error } = editing
      ? await supabase.from('emp_bodegas').update({ ...form, empresa_id: empresaId }).eq('id', editing.id)
      : await supabase.from('emp_bodegas').insert({ ...form, empresa_id: empresaId });
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false); setShowModal(false); load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_bodegas').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-ink">Bodegas</h1>
          <p className="text-ink-muted text-sm mt-1">{rows.length} bodegas registradas</p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nueva Bodega
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      <div className={tableWrapCls}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>Bodega</th>
              <th className={thCls + ' text-center'}>Tipo</th>
              <th className={thCls}>Descripción</th>
              <th className={thCls + ' text-center'}>Principal</th>
              <th className={thCls + ' text-center'}>Estado</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-600">Sin bodegas</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className={trCls}>
                <td className={tdCls}>
                  <div className="flex items-center gap-2">
                    <Warehouse size={13} className="text-ink-muted" />
                    <span className="font-medium text-ink">{r.nombre}</span>
                  </div>
                </td>
                <td className={tdCls + ' text-center'}>
                  {r.tipo ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        background: r.tipo === 'BG' ? '#2563eb20' : r.tipo === 'IP' ? '#16a34a20' : '#71717a20',
                        color:      r.tipo === 'BG' ? '#60a5fa'   : r.tipo === 'IP' ? '#4ade80'   : '#a1a1aa',
                        border:    `1px solid ${r.tipo === 'BG' ? '#2563eb40' : r.tipo === 'IP' ? '#16a34a40' : '#52525240'}`,
                      }}>
                      {r.tipo}
                    </span>
                  ) : <span className="text-ink-faint">—</span>}
                </td>
                <td className={tdCls + ' text-ink-muted'}>{r.descripcion || '—'}</td>
                <td className={tdCls + ' text-center'}>
                  {r.es_principal && <Star size={13} className="inline text-yellow-400" />}
                </td>
                <td className={tdCls + ' text-center'}><Badge activo={r.activo} /></td>
                <td className={tdCls}>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/30"><Pencil size={13} /></button>
                    {!r.es_principal && (
                      <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/30"><Trash2 size={13} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'Editar Bodega' : 'Nueva Bodega'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className={labelCls}>Nombre *</label>
              <input type="text" required value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Bodega Principal" className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Tipo</label>
              <select value={form.tipo || ''}
                onChange={e => setForm(f => ({ ...f, tipo: (e.target.value || undefined) as Bodega['tipo'] }))}
                className={selectCls}>
                <option value="">— Sin tipo —</option>
                {TIPO_OPTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {form.tipo === 'IP' && (
                <p className="text-[11px] mt-1" style={{ color: '#4ade80' }}>
                  ✓ Esta bodega será usada en la Liquidación IP al cierre de semana
                </p>
              )}
            </div>

            <div>
              <label className={labelCls}>Descripción</label>
              <textarea value={form.descripcion || ''} rows={2}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                className={inputCls + ' resize-none'} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.es_principal}
                  onChange={e => setForm(f => ({ ...f, es_principal: e.target.checked }))}
                  className="w-4 h-4 accent-yellow-500" />
                <span className="text-sm text-gray-300">Bodega principal</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.activo}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                  className="w-4 h-4 accent-green-500" />
                <span className="text-sm text-gray-300">Activa</span>
              </label>
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
        <ConfirmDialog message={`¿Eliminar la bodega "${deleteTarget.nombre}"?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  );
}
