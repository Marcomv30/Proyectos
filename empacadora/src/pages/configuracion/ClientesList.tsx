import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, X, Check } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { ClienteExportador, Destino, Marca } from '../../types/empacadora';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

interface Tercero { id: number; razon_social: string; nombre_comercial: string | null; }
interface ReceptorFe { id: number; razon_social: string; identificacion: string; }

type FormCliente = {
  empresa_id: number;
  nombre: string;
  color: string;
  tercero_id: number | null;
  fe_receptor_id: number | null;
  destino_id: string;
  naviera: string;
  activo: boolean;
};

const PALETTE = [
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#84cc16', // lime
  '#eab308', // yellow
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#a855f7', // purple
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f59e0b', // amber
];

const EMPTY: FormCliente = {
  empresa_id: 0, nombre: '', color: PALETTE[0], tercero_id: null,
  fe_receptor_id: null, destino_id: '', naviera: '', activo: true,
};

export default function ClientesList() {
  const empresaId = useEmpresaId();
  const [rows, setRows]             = useState<ClienteExportador[]>([]);
  const [filtered, setFiltered]     = useState<ClienteExportador[]>([]);
  const [terceros, setTerceros]     = useState<Tercero[]>([]);
  const [receptores, setReceptores] = useState<ReceptorFe[]>([]);
  const [destinos, setDestinos]     = useState<Pick<Destino, 'id' | 'nombre'>[]>([]);
  const [marcas, setMarcas]         = useState<Pick<Marca, 'id' | 'nombre'>[]>([]);
  const [clienteMarcas, setClienteMarcas] = useState<string[]>([]);
  const [navieras, setNavieras]     = useState<string[]>([]); // historial
  const [nuevaMarca, setNuevaMarca] = useState('');
  const [addingMarca, setAddingMarca] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState<ClienteExportador | null>(null);
  const [form, setForm]             = useState<FormCliente>(EMPTY);
  const [saving, setSaving]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClienteExportador | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: clis }, { data: ters }, { data: dests }, { data: mrcs }, { data: navData }, { data: recs }] = await Promise.all([
      supabase.from('emp_clientes').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('terceros').select('id,razon_social,nombre_comercial').eq('empresa_id', empresaId).eq('activo', true).order('razon_social'),
      supabase.from('emp_destinos').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_marcas').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_programas').select('naviera').eq('empresa_id', empresaId).not('naviera', 'is', null),
      supabase.from('fe_receptores_bitacora').select('id,razon_social,identificacion').eq('empresa_id', empresaId).order('razon_social'),
    ]);
    setRows(clis || []);
    setTerceros(ters || []);
    setDestinos(dests || []);
    setMarcas(mrcs || []);
    setReceptores((recs as any) || []);
    const navSet = new Set<string>();
    (navData || []).forEach((p: any) => { if (p.naviera) navSet.add(p.naviera); });
    setNavieras(Array.from(navSet).sort());
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search) { setFiltered(rows); return; }
    const s = search.toLowerCase();
    setFiltered(rows.filter(r => r.nombre.toLowerCase().includes(s)));
  }, [rows, search]);

  async function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setClienteMarcas([]);
    setShowModal(true);
  }

  async function openEdit(r: ClienteExportador) {
    setEditing(r);
    setForm({
      empresa_id: r.empresa_id, nombre: r.nombre,
      color: r.color || PALETTE[0],
      tercero_id: r.tercero_id ?? null,
      fe_receptor_id: r.fe_receptor_id ?? null,
      destino_id: r.destino_id || '',
      naviera: r.naviera || '',
      activo: r.activo,
    });
    const { data } = await supabase.from('emp_cliente_marcas')
      .select('marca_id').eq('cliente_id', r.id);
    setClienteMarcas((data || []).map(x => x.marca_id));
    setShowModal(true);
  }

  function toggleMarca(marcaId: string) {
    setClienteMarcas(prev =>
      prev.includes(marcaId) ? prev.filter(m => m !== marcaId) : [...prev, marcaId]
    );
  }

  async function handleAgregarMarca() {
    const nombre = nuevaMarca.trim();
    if (!nombre) return;
    const { data, error } = await supabase.from('emp_marcas')
      .insert({ empresa_id: empresaId, nombre, activo: true })
      .select('id,nombre').single();
    if (error) { setError(error.message); return; }
    setMarcas(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setClienteMarcas(prev => [...prev, data.id]);
    setNuevaMarca(''); setAddingMarca(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');

    const payload = {
      ...form,
      empresa_id: empresaId,
      color: form.color || null,
      tercero_id: form.tercero_id || null,
      fe_receptor_id: form.fe_receptor_id || null,
      destino_id: form.destino_id || null,
      naviera: form.naviera || null,
    };

    let clienteId = editing?.id;
    if (editing) {
      const { error } = await supabase.from('emp_clientes').update(payload).eq('id', editing.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('emp_clientes').insert(payload).select('id').single();
      if (error) { setError(error.message); setSaving(false); return; }
      clienteId = data.id;
    }

    // Sincronizar marcas: eliminar todas y reinsertar
    if (clienteId) {
      await supabase.from('emp_cliente_marcas').delete().eq('cliente_id', clienteId);
      if (clienteMarcas.length > 0) {
        const marcasPayload = clienteMarcas.map(marca_id => ({
          empresa_id: empresaId, cliente_id: clienteId!, marca_id,
        }));
        const { error } = await supabase.from('emp_cliente_marcas').insert(marcasPayload);
        if (error) { setError(error.message); setSaving(false); return; }
      }
    }

    setSaving(false); setShowModal(false); load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_clientes').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  const destinoNombre = (id?: string) => destinos.find(d => d.id === id)?.nombre;
  const terceroNombre = (id?: number) => {
    const t = terceros.find(t => t.id === id);
    return t ? (t.nombre_comercial || t.razon_social) : undefined;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Clientes Exportadores</h1>
          <p className="text-ink-muted text-sm mt-1">{filtered.length} clientes</p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nuevo Cliente
        </button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={14} />
        <input type="text" placeholder="Buscar cliente..." value={search}
          onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded text-sm">{error}</div>}

      <div className={tableWrapCls}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Tercero ERP</th>
              <th className={thCls}>Destino default</th>
              <th className={thCls}>Naviera</th>
              <th className={thCls + ' text-center'}>Estado</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-ink-faint">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-ink-faint">Sin clientes registrados</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className={trCls + (!r.activo ? ' opacity-50' : '')}>
                <td className={tdCls}>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: r.color || '#6b7280' }} />
                    <span className="font-medium text-ink">{r.nombre}</span>
                  </div>
                </td>
                <td className={tdCls + ' text-ink-muted'}>{terceroNombre(r.tercero_id) || '—'}</td>
                <td className={tdCls + ' text-ink-muted'}>{destinoNombre(r.destino_id) || '—'}</td>
                <td className={tdCls + ' text-ink-muted'}>{r.naviera || '—'}</td>
                <td className={tdCls + ' text-center'}>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${r.activo ? 'bg-green-900/50 text-green-400' : 'bg-surface-raised text-ink-faint'}`}>
                    {r.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className={tdCls}>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/30"><Pencil size={13} /></button>
                    <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/30"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'Editar Cliente' : 'Nuevo Cliente'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} className="space-y-4">

            {/* Nombre + Color */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className={labelCls}>Nombre interno *</label>
                <input type="text" required value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: ORSERO GROUP" className={inputCls} autoFocus />
              </div>
              <div className="flex-shrink-0">
                <label className={labelCls}>Color</label>
                <div className="flex gap-1.5 flex-wrap w-[136px]">
                  {PALETTE.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: form.color === c ? '#ffffff' : 'transparent',
                        boxShadow: form.color === c ? `0 0 0 1px ${c}` : 'none',
                      }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Tercero ERP */}
            <div>
              <label className={labelCls}>Tercero en ERP</label>
              <select value={form.tercero_id ?? ''} onChange={e => setForm(f => ({ ...f, tercero_id: e.target.value ? +e.target.value : null }))} className={selectCls}>
                <option value="">— Sin ligar —</option>
                {terceros.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre_comercial || t.razon_social}</option>
                ))}
              </select>
              <p className="text-xs text-ink-faint mt-0.5">Vincula este cliente con el tercero del sistema contable</p>
            </div>

            {/* Receptor FE exportación */}
            <div>
              <label className={labelCls}>Receptor FE Exportación</label>
              <select value={form.fe_receptor_id ?? ''} onChange={e => setForm(f => ({ ...f, fe_receptor_id: e.target.value ? +e.target.value : null }))} className={selectCls}>
                <option value="">— Sin receptor FE —</option>
                {receptores.map(r => (
                  <option key={r.id} value={r.id}>{r.razon_social} ({r.identificacion})</option>
                ))}
              </select>
              <p className="text-xs text-ink-faint mt-0.5">Receptor usado al generar la FEE desde despacho</p>
            </div>

            {/* Destino + Naviera */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Destino por defecto</label>
                <select value={form.destino_id} onChange={e => setForm(f => ({ ...f, destino_id: e.target.value }))} className={selectCls}>
                  <option value="">— Sin asignar —</option>
                  {destinos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Naviera habitual</label>
                <input
                  type="text" list="naviera-hist" value={form.naviera}
                  onChange={e => setForm(f => ({ ...f, naviera: e.target.value }))}
                  placeholder="Ej: MSC, HAMBURG SUD" className={inputCls} />
                <datalist id="naviera-hist">
                  {navieras.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>
            </div>

            {/* Marcas asociadas */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls + ' mb-0'}>Marcas de caja asociadas</label>
                <button type="button" onClick={() => setAddingMarca(v => !v)}
                  className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1">
                  <Plus size={11} /> Nueva marca
                </button>
              </div>

              {addingMarca && (
                <div className="flex gap-2 mb-2">
                  <input type="text" value={nuevaMarca} autoFocus
                    onChange={e => setNuevaMarca(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAgregarMarca(); } }}
                    placeholder="Nombre de la nueva marca" className={inputCls + ' text-xs py-1'} />
                  <button type="button" onClick={handleAgregarMarca}
                    className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1">
                    <Check size={12} /> Agregar
                  </button>
                  <button type="button" onClick={() => { setAddingMarca(false); setNuevaMarca(''); }}
                    className="px-2 py-1 border border-line text-ink-muted rounded text-xs">
                    <X size={12} />
                  </button>
                </div>
              )}

              <div className="border border-line rounded p-3 max-h-44 overflow-y-auto grid grid-cols-2 gap-1">
                {marcas.length === 0 ? (
                  <p className="text-ink-faint text-xs col-span-2">Sin marcas registradas</p>
                ) : marcas.map(m => (
                  <label key={m.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input type="checkbox" checked={clienteMarcas.includes(m.id)}
                      onChange={() => toggleMarca(m.id)}
                      className="w-3.5 h-3.5 accent-green-500" />
                    <span className="text-xs text-ink">{m.nombre}</span>
                  </label>
                ))}
              </div>
              {clienteMarcas.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {clienteMarcas.map(id => {
                    const m = marcas.find(x => x.id === id);
                    return m ? (
                      <span key={id} className="flex items-center gap-1 bg-green-900/40 text-green-400 text-xs px-2 py-0.5 rounded">
                        {m.nombre}
                        <button type="button" onClick={() => toggleMarca(id)}><X size={10} /></button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                className="w-4 h-4 accent-green-500" />
              <span className="text-sm text-ink">Activo</span>
            </label>

            {error && <p className={errorCls}>{error}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`¿Eliminar el cliente "${deleteTarget.nombre}"?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  );
}
