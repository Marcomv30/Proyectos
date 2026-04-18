import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Trash2, Layers, X, Search, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import {
  inputCls, labelCls, btnPrimary, btnSecondary,
  tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls,
} from '../../components/ui';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PaletaMat {
  id: string;
  material_id: string;
  cantidad: number;
  notas?: string;
  activo: boolean;
  created_at: string;
  material?: {
    id: string;
    codigo?: string;
    nombre: string;
    tipo: string;
    unidad_medida: string;
  };
}

interface MatOption {
  id: string;
  codigo?: string;
  nombre: string;
  tipo: string;
  unidad_medida: string;
}

// ─── Tipos de material: colores ───────────────────────────────────────────────

const TIPO_BADGE: Record<string, string> = {
  carton:    'bg-blue-900 text-blue-300',
  colilla:   'bg-purple-900 text-purple-300',
  etiqueta:  'bg-amber-900 text-amber-300',
  accesorio: 'bg-green-900 text-green-300',
  otro:      'bg-surface-overlay text-ink-muted',
};

const TIPO_LABEL: Record<string, string> = {
  carton:    'Cartón',
  colilla:   'Colilla',
  etiqueta:  'Etiqueta',
  accesorio: 'Accesorio',
  otro:      'Otro',
};

function TipoBadge({ tipo }: { tipo: string }) {
  const cls = TIPO_BADGE[tipo] ?? TIPO_BADGE.otro;
  const label = TIPO_LABEL[tipo] ?? tipo;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Form vacío ───────────────────────────────────────────────────────────────

interface FormState {
  material_id: string;
  cantidad: number | '';
  notas: string;
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  material_id: '',
  cantidad: 1,
  notas: '',
  activo: true,
};

// ─── Modal via createPortal ───────────────────────────────────────────────────

interface PaletaModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function PaletaModal({ title, onClose, children }: PaletaModalProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl w-full max-w-md shadow-xl"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-surface-overlay transition-colors"
            style={{ color: 'var(--ink-faint)' }}
          >
            <X size={15} />
          </button>
        </div>
        {/* Body */}
        <div className="px-5 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MaterialesPaleta() {
  const empresaId = useEmpresaId();

  const [rows, setRows]         = useState<PaletaMat[]>([]);
  const [allMats, setAllMats]   = useState<MatOption[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const [busquedaMat, setBusquedaMat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<PaletaMat | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [modalError, setModalError] = useState('');

  // ── Carga de datos ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const [palRes, matRes] = await Promise.all([
      supabase
        .from('emp_materiales_paleta')
        .select(
          'id, material_id, cantidad, notas, activo, created_at, ' +
          'material:emp_materiales!material_id(id, codigo, nombre, tipo, unidad_medida)'
        )
        .eq('empresa_id', empresaId)
        .order('created_at'),
      supabase
        .from('emp_materiales')
        .select('id, codigo, nombre, tipo, unidad_medida')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre'),
    ]);

    if (palRes.error) {
      setError(palRes.error.message);
    } else {
      setRows((palRes.data || []) as unknown as PaletaMat[]);
    }

    if (!matRes.error) {
      setAllMats((matRes.data || []) as MatOption[]);
    }

    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  // ── IDs ya configurados (para excluirlos en el modal de nuevo) ──────────────

  const configuredIds = rows.map(r => r.material_id);

  // Tipos definidos por calibre — no aplica configurarlos por paleta
  const TIPOS_POR_CALIBRE = ['carton', 'colilla'];

  // Opciones del selector: excluir carton/colilla y los ya configurados
  const matOptions = allMats.filter(m =>
    !TIPOS_POR_CALIBRE.includes(m.tipo) &&
    (editing ? (m.id === editing.material_id || !configuredIds.includes(m.id))
             : !configuredIds.includes(m.id))
  );

  // Filtro en tiempo real dentro del modal
  const qMat = busquedaMat.trim().toLowerCase();
  const matOptsFiltered = qMat
    ? matOptions.filter(m =>
        m.nombre.toLowerCase().includes(qMat) ||
        (m.codigo ?? '').toLowerCase().includes(qMat)
      )
    : matOptions;

  // ── Abrir modal ─────────────────────────────────────────────────────────────

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setModalError('');
    setBusquedaMat('');
    setShowModal(true);
  }

  function openEdit(row: PaletaMat) {
    setEditing(row);
    setForm({
      material_id: row.material_id,
      cantidad:    row.cantidad,
      notas:       row.notas || '',
      activo:      row.activo,
    });
    setModalError('');
    setBusquedaMat('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setBusquedaMat('');
  }

  // ── Guardar ─────────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setModalError('');

    if (!form.material_id) {
      setModalError('Seleccione un material.');
      return;
    }
    if (!form.cantidad || Number(form.cantidad) <= 0) {
      setModalError('La cantidad debe ser mayor a 0.');
      return;
    }

    setSaving(true);

    const payload = {
      empresa_id:  empresaId,
      material_id: form.material_id,
      cantidad:    Number(form.cantidad),
      notas:       form.notas.trim() || null,
      activo:      form.activo,
    };

    const { error: saveErr } = editing
      ? await supabase.from('emp_materiales_paleta').update(payload).eq('id', editing.id)
      : await supabase.from('emp_materiales_paleta').insert(payload);

    if (saveErr) {
      setModalError(saveErr.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    closeModal();
    load();
  }

  // ── Eliminar ────────────────────────────────────────────────────────────────

  async function handleDelete(row: PaletaMat) {
    const nombre = row.material?.nombre ?? 'este material';
    if (!window.confirm(`¿Eliminar "${nombre}" de la configuración de paleta?`)) return;

    const { error: delErr } = await supabase
      .from('emp_materiales_paleta')
      .delete()
      .eq('id', row.id);

    if (delErr) {
      setError(delErr.message);
    } else {
      load();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Encabezado */}
      <div className="flex items-start justify-between mb-2 gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
          >
            <Layers size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
              Materiales por Paleta
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Consumo automático al cerrar Boleta de Despacho
            </p>
          </div>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={14} /> Nueva
        </button>
      </div>

      {/* Chip informativo */}
      <div
        className="mb-5 mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
        style={{
          background: 'var(--accent-bg)',
          color: 'var(--accent)',
          border: '1px solid var(--accent-bg)',
        }}
      >
        <Layers size={12} />
        Se descuentan del IP al cerrar cada BD, independiente del calibre o marca
      </div>

      {/* Error global */}
      {error && (
        <div className="mb-4 p-3 rounded-lg text-xs bg-red-900/30 border border-red-800 text-red-400">
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className={tableWrapCls}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>Material</th>
              <th className={thCls + ' text-center'}>Tipo</th>
              <th className={thCls + ' text-right'}>Cant. / paleta</th>
              <th className={thCls}>Unidad</th>
              <th className={thCls}>Notas</th>
              <th className={thCls + ' text-center'}>Activo</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-xs" style={{ color: 'var(--ink-faint)' }}>
                  Cargando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center" style={{ color: 'var(--ink-faint)' }}>
                  <div className="flex flex-col items-center gap-2">
                    <Layers size={28} strokeWidth={1.2} />
                    <span className="text-xs">Sin materiales configurados</span>
                  </div>
                </td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.id} className={trCls}>

                {/* Material */}
                <td className={tdCls}>
                  <div className="font-medium" style={{ color: 'var(--ink)' }}>
                    {row.material?.nombre ?? '—'}
                  </div>
                  {row.material?.codigo && (
                    <span className="font-mono text-[10px]" style={{ color: 'var(--accent)' }}>
                      {row.material.codigo}
                    </span>
                  )}
                </td>

                {/* Tipo */}
                <td className={tdCls + ' text-center'}>
                  {row.material?.tipo
                    ? <TipoBadge tipo={row.material.tipo} />
                    : <span style={{ color: 'var(--ink-faint)' }}>—</span>
                  }
                </td>

                {/* Cantidad */}
                <td className={tdCls + ' text-right font-semibold tabular-nums'} style={{ color: 'var(--ink)' }}>
                  {Number(row.cantidad).toLocaleString('es-CR', { maximumFractionDigits: 2 })}
                </td>

                {/* Unidad */}
                <td className={tdCls} style={{ color: 'var(--ink-muted)' }}>
                  {row.material?.unidad_medida ?? '—'}
                </td>

                {/* Notas */}
                <td className={tdCls} style={{ color: 'var(--ink-faint)', maxWidth: 200 }}>
                  {row.notas
                    ? <span className="truncate block max-w-[180px]" title={row.notas}>{row.notas}</span>
                    : '—'
                  }
                </td>

                {/* Activo */}
                <td className={tdCls + ' text-center'}>
                  {row.activo
                    ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-900/50 text-green-400 border border-green-800/40">
                        Activo
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-overlay text-ink-faint border border-line">
                        Inactivo
                      </span>
                    )
                  }
                </td>

                {/* Acciones */}
                <td className={tdCls}>
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => openEdit(row)}
                      className="p-1.5 rounded transition-colors hover:bg-blue-900/30 text-blue-400 hover:text-blue-300"
                      title="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(row)}
                      className="p-1.5 rounded transition-colors hover:bg-red-900/30 text-red-500 hover:text-red-400"
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <PaletaModal
          title={editing ? 'Editar material por paleta' : 'Nuevo material por paleta'}
          onClose={closeModal}
        >
          <form onSubmit={handleSave} className="space-y-4">

            {/* Selector de material con búsqueda */}
            <div>
              <label className={labelCls}>Material *</label>

              {editing ? (
                /* Al editar: solo mostrar el nombre, sin cambios */
                <>
                  <div className={inputCls + ' opacity-60 cursor-not-allowed text-xs'}>
                    {allMats.find(m => m.id === form.material_id)?.nombre ?? '—'}
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                    El material no se puede cambiar. Elimine y cree uno nuevo si lo necesita.
                  </p>
                </>
              ) : (
                <>
                  {/* Input búsqueda */}
                  <div className="relative mb-1">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--ink-faint)' }} />
                    <input
                      type="text"
                      placeholder="Buscar por nombre o código..."
                      value={busquedaMat}
                      onChange={e => setBusquedaMat(e.target.value)}
                      className={inputCls + ' pl-7 pr-7 text-xs'}
                      autoComplete="off"
                    />
                    {busquedaMat && (
                      <button type="button" onClick={() => setBusquedaMat('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--ink-faint)' }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Lista filtrada */}
                  <div className="rounded-lg overflow-y-auto"
                    style={{ maxHeight: 192, border: '1px solid var(--line)', background: 'var(--surface-deep)' }}>
                    {matOptsFiltered.length === 0 ? (
                      <div className="px-3 py-5 text-xs text-center" style={{ color: 'var(--ink-faint)' }}>
                        {qMat ? `Sin resultados para "${busquedaMat}"` : 'Todos los materiales ya están configurados'}
                      </div>
                    ) : matOptsFiltered.map(m => {
                      const sel = form.material_id === m.id;
                      return (
                        <button key={m.id} type="button"
                          onClick={() => setForm(f => ({ ...f, material_id: m.id }))}
                          className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors"
                          style={{
                            background:   sel ? 'var(--accent-bg)' : 'transparent',
                            borderBottom: '1px solid var(--line-dim)',
                          }}>
                          <span className="flex-1 font-medium" style={{ color: sel ? 'var(--accent-txt)' : 'var(--ink)' }}>
                            {m.nombre}
                          </span>
                          {m.codigo && (
                            <span className="font-mono text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                              {m.codigo}
                            </span>
                          )}
                          {sel && <CheckCircle2 size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Input hidden para validación required */}
                  <input type="text" required readOnly tabIndex={-1}
                    value={form.material_id}
                    style={{ opacity: 0, height: 0, position: 'absolute', pointerEvents: 'none' }} />

                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                    Cartón y colillas no aplican — se definen por calibre.
                  </p>
                </>
              )}
            </div>

            {/* Cantidad */}
            <div>
              <label className={labelCls}>Cantidad por paleta *</label>
              <input
                type="number"
                required
                min={0.01}
                step="any"
                placeholder="1"
                value={form.cantidad}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    cantidad: e.target.value === '' ? '' : parseFloat(e.target.value),
                  }))
                }
                className={inputCls}
              />
              {form.material_id && (() => {
                const mat = allMats.find(m => m.id === form.material_id);
                return mat ? (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                    Unidad: {mat.unidad_medida}
                  </p>
                ) : null;
              })()}
            </div>

            {/* Notas */}
            <div>
              <label className={labelCls}>Notas</label>
              <textarea
                rows={2}
                placeholder="Observaciones opcionales..."
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                className={inputCls + ' resize-none'}
              />
            </div>

            {/* Activo */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                className="w-4 h-4 accent-green-500"
              />
              <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>Activo</span>
            </label>

            {/* Error modal */}
            {modalError && <p className={errorCls}>{modalError}</p>}

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={closeModal} className={btnSecondary}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </PaletaModal>
      )}
    </div>
  );
}
