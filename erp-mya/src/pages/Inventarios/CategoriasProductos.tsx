import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

interface Props {
  empresaId: number;
}

interface Categoria {
  id: number;
  nombre: string;
  codigo_prefijo: string | null;
  descripcion: string | null;
  activo: boolean;
  _total?: number;
}

interface FormData {
  codigo_prefijo: string;
  nombre: string;
  descripcion: string;
}

const FORM_VACIO: FormData = { codigo_prefijo: '', nombre: '', descripcion: '' };

export default function CategoriasProductos({ empresaId }: Props) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [confirmarElim, setConfirmarElim] = useState<Categoria | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: cats } = await supabase
      .from('inv_categorias')
      .select('id, nombre, codigo_prefijo, descripcion, activo')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('nombre');

    if (!cats) {
      setCargando(false);
      return;
    }

    const { data: counts } = await supabase
      .from('inv_productos')
      .select('categoria_id')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .not('categoria_id', 'is', null);

    const conteoMap: Record<number, number> = {};
    (counts || []).forEach((p) => {
      if (p.categoria_id) conteoMap[p.categoria_id] = (conteoMap[p.categoria_id] || 0) + 1;
    });

    setCategorias(cats.map((c) => ({ ...c, _total: conteoMap[c.id] || 0 })));
    setCargando(false);
  }, [empresaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setEditandoId(null);
    setError('');
    setModal('nuevo');
  };

  const abrirEditar = (c: Categoria) => {
    setForm({
      codigo_prefijo: c.codigo_prefijo || '',
      nombre: c.nombre,
      descripcion: c.descripcion || '',
    });
    setEditandoId(c.id);
    setError('');
    setModal('editar');
  };

  const cerrarModal = () => {
    setModal(null);
    setEditandoId(null);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      setError('El nombre es requerido.');
      return;
    }
    setGuardando(true);
    setError('');

    const payload = {
      empresa_id: empresaId,
      codigo_prefijo: form.codigo_prefijo.trim().toUpperCase() || null,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
    };

    let err;
    if (modal === 'nuevo') {
      ({ error: err } = await supabase.from('inv_categorias').insert(payload));
    } else {
      ({ error: err } = await supabase.from('inv_categorias').update(payload).eq('id', editandoId!));
    }

    if (err) {
      setError(err.message);
      setGuardando(false);
      return;
    }
    await cargar();
    cerrarModal();
    setGuardando(false);
  };

  const eliminar = async (cat: Categoria) => {
    if ((cat._total ?? 0) > 0) return;
    await supabase.from('inv_categorias').update({ activo: false }).eq('id', cat.id);
    setConfirmarElim(null);
    await cargar();
  };

  const q = busqueda.toLowerCase();
  const filtradas = categorias.filter(
    (c) =>
      !q ||
      c.nombre.toLowerCase().includes(q) ||
      (c.codigo_prefijo || '').toLowerCase().includes(q) ||
      (c.descripcion || '').toLowerCase().includes(q),
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Categorias</h1>
          <p className="text-gray-400 text-sm mt-1">{filtradas.length} de {categorias.length} categorias</p>
        </div>
        <button
          onClick={abrirNuevo}
          className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Nueva categoria
        </button>
      </div>

      <div className="mb-5">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, prefijo o descripcion..."
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
        />
      </div>

      {cargando ? (
        <div className="text-gray-500 text-center py-16">Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div className="text-gray-600 text-center py-16">
          {categorias.length === 0
            ? 'No hay categorias. Cree la primera para organizar su catalogo.'
            : 'Sin resultados para la busqueda.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtradas.map((cat) => (
            <div
              key={cat.id}
              className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-3 hover:border-purple-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {cat.codigo_prefijo && (
                      <span className="rounded-md border border-emerald-700/40 bg-emerald-900/20 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                        {cat.codigo_prefijo}
                      </span>
                    )}
                    <h3 className="text-white font-semibold text-sm truncate">{cat.nombre}</h3>
                  </div>
                  {cat.descripcion && <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{cat.descripcion}</p>}
                </div>
                <span
                  className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    (cat._total ?? 0) > 0 ? 'bg-purple-900 text-purple-300' : 'bg-gray-800 text-gray-500'
                  }`}
                >
                  {cat._total ?? 0} prod.
                </span>
              </div>

              <div className="flex gap-2 justify-end border-t border-gray-800 pt-2">
                <button
                  onClick={() => abrirEditar(cat)}
                  className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-blue-900 hover:bg-opacity-30 transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => ((cat._total ?? 0) > 0 ? null : setConfirmarElim(cat))}
                  disabled={(cat._total ?? 0) > 0}
                  title={(cat._total ?? 0) > 0 ? 'No se puede eliminar: tiene productos asignados' : 'Eliminar'}
                  className="text-red-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-red-900 hover:bg-opacity-30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">{modal === 'nuevo' ? '+ Nueva categoria' : 'Editar categoria'}</h2>
              <button onClick={cerrarModal} className="text-gray-500 hover:text-white text-xl">
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-gray-400 text-xs mb-1">Prefijo codigo</label>
                <input
                  autoFocus
                  value={form.codigo_prefijo}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      codigo_prefijo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
                    }))
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm font-mono uppercase tracking-wide focus:outline-none focus:border-purple-500"
                  placeholder="Ej: PAP, SRV, ALI"
                />
                <p className="mt-1 text-[11px] text-gray-500">Se usa para sugerir el codigo interno de los articulos de esta categoria.</p>
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">
                  Nombre <span className="text-red-400">*</span>
                </label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && guardar()}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                  placeholder="Ej: Papeleria, Servicios, Alimentos..."
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Descripcion</label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
                  placeholder="Descripcion opcional de la categoria"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button onClick={cerrarModal} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm transition-colors">
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-medium transition-colors"
              >
                {guardando ? 'Guardando...' : modal === 'nuevo' ? 'Crear' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmarElim && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-red-700 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-bold mb-2">Eliminar categoria</h3>
            <p className="text-gray-400 text-sm mb-1">
              <span className="text-white">{confirmarElim.nombre}</span>
            </p>
            <p className="text-gray-500 text-xs mb-5">La categoria quedara inactiva. Los productos asignados no se ven afectados.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmarElim(null)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">
                Cancelar
              </button>
              <button onClick={() => eliminar(confirmarElim)} className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded text-sm font-medium">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
