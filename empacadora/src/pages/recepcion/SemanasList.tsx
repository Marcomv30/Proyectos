import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Calendar, ChevronRight } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Semana } from '../../types/empacadora';
import Modal from '../../components/Modal';
import Badge from '../../components/Badge';
import { getCostaRicaDateISO, getCostaRicaYear, parseIsoDateAtNoonUTC } from '../../utils/costaRicaTime';
import { inputCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

// Genera código semana a partir de fecha: semana-año (ej: "26-25")
function codigoSemana(fecha: string): { semana: number; año: number; codigo: string } {
  const d = parseIsoDateAtNoonUTC(fecha);
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 12, 0, 0));
  const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000);
  const semana = Math.ceil((dayOfYear + startOfYear.getUTCDay() + 1) / 7);
  const año = d.getUTCFullYear();
  return { semana, año, codigo: `${semana}-${String(año).slice(2)}` };
}

const EMPTY = {
  empresa_id: 0, codigo: '', semana: 1, año: getCostaRicaYear(),
  fecha_inicio: '', fecha_fin: '', activo: true,
};

export default function SemanasList() {
  const empresaId = useEmpresaId();
  const [rows, setRows] = useState<Semana[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Semana | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('emp_semanas').select('*')
      .eq('empresa_id', empresaId)
      .order('año', { ascending: false })
      .order('semana', { ascending: false });
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  function handleFechaInicioChange(fecha: string) {
    const { semana, año, codigo } = codigoSemana(fecha);
    setForm(f => ({ ...f, fecha_inicio: fecha, semana, año, codigo }));
  }

  function openNew() {
    setEditing(null);
    const hoy = getCostaRicaDateISO();
    const { semana, año, codigo } = codigoSemana(hoy);
    setForm({ ...EMPTY, fecha_inicio: hoy, semana, año, codigo });
    setShowModal(true);
  }

  function openEdit(r: Semana) {
    setEditing(r);
    setForm({ empresa_id: r.empresa_id, codigo: r.codigo, semana: r.semana, año: r.año,
      fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin || '', activo: r.activo });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const payload = { ...form, empresa_id: empresaId, fecha_fin: form.fecha_fin || null };
    const { error } = editing
      ? await supabase.from('emp_semanas').update(payload).eq('id', editing.id)
      : await supabase.from('emp_semanas').insert(payload);
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false); setShowModal(false); load();
  }

  const semanaActual = rows.find(r => r.activo);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Semanas de Producción</h1>
          <p className="text-gray-400 text-sm mt-1">Unidades semanales de empaque — {rows.length} semanas</p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nueva Semana
        </button>
      </div>

      {semanaActual && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 mb-5 flex items-center gap-3">
          <div className="p-2 bg-green-800/50 rounded-lg"><Calendar className="text-green-400" size={18} /></div>
          <div>
            <p className="text-xs text-green-400 font-medium">Semana actual</p>
            <p className="text-ink font-bold text-lg">{semanaActual.codigo}</p>
            <p className="text-green-300 text-xs">{new Date(semanaActual.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>
      )}

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      <div className={tableWrapCls}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>Código</th>
              <th className={thCls}>Semana</th>
              <th className={thCls}>Año</th>
              <th className={thCls}>Fecha Inicio</th>
              <th className={thCls}>Fecha Fin</th>
              <th className={thCls + ' text-center'}>Estado</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-600">Sin semanas registradas</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className={trCls}>
                <td className={tdCls}>
                  <span className="font-mono font-bold text-yellow-400 text-sm">{r.codigo}</span>
                </td>
                <td className={tdCls + ' text-ink'}>{r.semana}</td>
                <td className={tdCls + ' text-gray-400'}>{r.año}</td>
                <td className={tdCls + ' text-gray-300'}>
                  {new Date(r.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CR')}
                </td>
                <td className={tdCls + ' text-gray-400'}>
                  {r.fecha_fin ? new Date(r.fecha_fin + 'T12:00:00').toLocaleDateString('es-CR') : '—'}
                </td>
                <td className={tdCls + ' text-center'}><Badge activo={r.activo} /></td>
                <td className={tdCls}>
                  <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/30 transition-colors flex items-center gap-1">
                    <Pencil size={12} /><ChevronRight size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'Editar Semana' : 'Nueva Semana'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className={labelCls}>Fecha de Inicio *</label>
              <input type="date" required value={form.fecha_inicio}
                onChange={e => handleFechaInicioChange(e.target.value)}
                className={inputCls} />
              <p className="text-gray-500 text-xs mt-1">El código de semana se genera automáticamente</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Código</label>
                <input type="text" value={form.codigo}
                  onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                  placeholder="26-25" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Semana #</label>
                <input type="number" value={form.semana}
                  onChange={e => setForm(f => ({ ...f, semana: +e.target.value }))}
                  min={1} max={53} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Año</label>
                <input type="number" value={form.año}
                  onChange={e => setForm(f => ({ ...f, año: +e.target.value }))}
                  min={2020} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Fecha de Fin</label>
              <input type="date" value={form.fecha_fin || ''}
                onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))}
                className={inputCls} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                className="w-4 h-4 accent-green-500" />
              <span className="text-sm text-gray-300">Activa</span>
            </label>
            {error && <p className={errorCls}>{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
