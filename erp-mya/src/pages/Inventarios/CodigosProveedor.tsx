// ============================================================
// MYA ERP — Códigos de Proveedor
// Mapeo CodigoComercial XML (MH) → producto interno
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

interface Props {
  empresaId: number;
}

interface CodigoProveedor {
  id: number;
  emisor_identificacion: string;
  emisor_nombre: string | null;
  tipo_codigo: string;
  codigo_comercial: string;
  codigo_cabys: string | null;
  descripcion_proveedor: string | null;
  producto_id: number | null;
  precio_ultimo: number | null;
  fecha_ultima_compra: string | null;
  total_compras: number;
  activo: boolean;
  inv_productos?: { descripcion: string; codigo: string | null; unidad_medida: string } | null;
}

interface ProductoBasico {
  id: number;
  codigo: string | null;
  descripcion: string;
  unidad_medida: string;
}

export default function CodigosProveedor({ empresaId }: Props) {
  const [codigos, setCodigos]           = useState<CodigoProveedor[]>([]);
  const [productos, setProductos]       = useState<ProductoBasico[]>([]);
  const [cargando, setCargando]         = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'mapeados' | 'sin_mapear'>('todos');
  const [filtroProv, setFiltroProv]     = useState('');
  const [mapModal, setMapModal]         = useState<CodigoProveedor | null>(null);
  const [busqProd, setBusqProd]         = useState('');
  const [prodSelId, setProdSelId]       = useState<number | null>(null);
  const [guardando, setGuardando]       = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from('inv_codigos_proveedor')
      .select('*, inv_productos(descripcion, codigo, unidad_medida)')
      .eq('empresa_id', empresaId)
      .order('emisor_nombre')
      .order('fecha_ultima_compra', { ascending: false });
    setCodigos((data as CodigoProveedor[]) || []);

    const { data: prods } = await supabase
      .from('inv_productos')
      .select('id, codigo, descripcion, unidad_medida')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('descripcion');
    setProductos((prods as ProductoBasico[]) || []);
    setCargando(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirMapeo = (c: CodigoProveedor) => {
    setMapModal(c);
    setBusqProd(c.inv_productos?.descripcion || '');
    setProdSelId(c.producto_id);
  };

  const guardarMapeo = async () => {
    if (!mapModal) return;
    setGuardando(true);
    await supabase
      .from('inv_codigos_proveedor')
      .update({ producto_id: prodSelId, updated_at: new Date().toISOString() })
      .eq('id', mapModal.id);
    await cargar();
    setMapModal(null);
    setGuardando(false);
  };

  const filtrados = codigos.filter(c => {
    if (filtroEstado === 'mapeados'   && !c.producto_id)  return false;
    if (filtroEstado === 'sin_mapear' &&  c.producto_id)  return false;
    if (filtroProv && !c.emisor_nombre?.toLowerCase().includes(filtroProv.toLowerCase())
      && !c.emisor_identificacion.includes(filtroProv)) return false;
    return true;
  });

  // Agrupar por proveedor
  const provMap: Record<string, { id: string; nombre: string | null }> = {};
  filtrados.forEach(c => {
    if (!provMap[c.emisor_identificacion])
      provMap[c.emisor_identificacion] = { id: c.emisor_identificacion, nombre: c.emisor_nombre };
  });
  const proveedores = Object.values(provMap);

  const prodsFiltrados = busqProd.trim()
    ? productos.filter(p =>
        p.descripcion.toLowerCase().includes(busqProd.toLowerCase()) ||
        (p.codigo || '').toLowerCase().includes(busqProd.toLowerCase())
      )
    : productos;

  const sinMapear = codigos.filter(c => !c.producto_id).length;
  const mapeados  = codigos.filter(c =>  c.producto_id).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">🔗 Códigos de Proveedor</h1>
        <p className="text-gray-400 text-sm mt-1">
          Mapeo CodigoComercial XML (MH) → producto interno. Se detectan automáticamente al procesar XMLs de compra.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{codigos.length}</p>
          <p className="text-gray-500 text-xs mt-1">Códigos detectados</p>
        </div>
        <div className="bg-gray-800 border border-green-900 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{mapeados}</p>
          <p className="text-gray-500 text-xs mt-1">Mapeados</p>
        </div>
        <div className="bg-gray-800 border border-yellow-900 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{sinMapear}</p>
          <p className="text-gray-500 text-xs mt-1">Sin mapear</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-5">
        <input
          value={filtroProv}
          onChange={e => setFiltroProv(e.target.value)}
          placeholder="Buscar proveedor..."
          className="flex-1 min-w-48 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-1">
          {(['todos', 'mapeados', 'sin_mapear'] as const).map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filtroEstado === e
                  ? 'bg-blue-700 text-white'
                  : 'bg-gray-800 border border-gray-600 text-gray-400 hover:text-white'
              }`}>
              {e === 'todos' ? 'Todos' : e === 'mapeados' ? '✓ Mapeados' : '⚠ Sin mapear'}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="text-gray-500 text-center py-16">Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-gray-600 text-center py-16">
          {codigos.length === 0
            ? 'Sin códigos detectados. Se registran automáticamente al procesar XMLs de compra (mercadería).'
            : 'Sin resultados para los filtros.'}
        </div>
      ) : (
        <div className="space-y-6">
          {proveedores.map(prov => {
            const lineas = filtrados.filter(c => c.emisor_identificacion === prov.id);
            return (
              <div key={prov.id} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                {/* Cabecera proveedor */}
                <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
                  <div>
                    <span className="text-white font-semibold text-sm">{prov.nombre || prov.id}</span>
                    <span className="text-gray-500 text-xs ml-2 font-mono">{prov.id}</span>
                  </div>
                  <span className="text-xs text-gray-500">{lineas.length} código{lineas.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Líneas */}
                <div className="text-xs px-4 pt-3 md:hidden text-gray-500">Desliza horizontalmente para revisar códigos, compras y mapeo.</div>
                <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
                <table className="w-full text-xs">
                  <thead className="text-gray-500 border-b border-gray-800">
                    <tr>
                      <th className="text-left px-4 py-2">Código proveedor</th>
                      <th className="text-left px-4 py-2">CABYS</th>
                      <th className="text-left px-4 py-2">Descripción proveedor</th>
                      <th className="text-right px-4 py-2">Último precio</th>
                      <th className="text-right px-4 py-2">Última compra</th>
                      <th className="text-right px-4 py-2"># Compras</th>
                      <th className="text-left px-4 py-2">Producto interno</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map(c => (
                      <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800">
                        <td className="px-4 py-2.5 font-mono text-blue-400 font-bold">
                          {c.codigo_comercial}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-500">
                          {c.codigo_cabys || <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 max-w-xs">
                          {c.descripcion_proveedor || <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-300">
                          {c.precio_ultimo != null
                            ? c.precio_ultimo.toLocaleString('es-CR', { minimumFractionDigits: 2 })
                            : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-500">
                          {c.fecha_ultima_compra || <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400">
                          {c.total_compras}
                        </td>
                        <td className="px-4 py-2.5">
                          {c.inv_productos ? (
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span>
                              <span className="text-green-400 font-medium">{c.inv_productos.descripcion}</span>
                              {c.inv_productos.codigo && (
                                <span className="text-gray-600">({c.inv_productos.codigo})</span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0"></span>
                              <span className="text-yellow-500 italic">Sin mapear</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => abrirMapeo(c)}
                            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-gray-300">
                            {c.producto_id ? 'Cambiar' : 'Mapear'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal mapeo */}
      {mapModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 border border-gray-600 rounded-xl w-full max-w-lg my-8">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold">Mapear código de proveedor</h2>
                <p className="text-gray-500 text-xs mt-0.5">
                  <span className="font-mono text-blue-400">{mapModal.codigo_comercial}</span>
                  {' '}·{' '}
                  {mapModal.emisor_nombre || mapModal.emisor_identificacion}
                </p>
              </div>
              <button onClick={() => setMapModal(null)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Info del código */}
              <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Descripción proveedor:</span>
                  <span className="text-gray-300 text-right max-w-xs">{mapModal.descripcion_proveedor || '—'}</span>
                </div>
                {mapModal.codigo_cabys && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">CABYS:</span>
                    <span className="font-mono text-gray-300">{mapModal.codigo_cabys}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Último precio:</span>
                  <span className="font-mono text-gray-300">
                    {mapModal.precio_ultimo?.toLocaleString('es-CR', { minimumFractionDigits: 2 }) || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Compras registradas:</span>
                  <span className="text-gray-300">{mapModal.total_compras}</span>
                </div>
              </div>

              {/* Selector de producto */}
              <div>
                <label className="block text-gray-400 text-xs mb-1">
                  Producto interno a vincular
                </label>
                <input
                  value={busqProd}
                  onChange={e => { setBusqProd(e.target.value); setProdSelId(null); }}
                  placeholder="Buscar por nombre o código..."
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 mb-1"
                />
                <div className="bg-gray-900 border border-gray-700 rounded max-h-48 overflow-y-auto">
                  {/* Opción para quitar mapeo */}
                  <button type="button"
                    onClick={() => { setProdSelId(null); setBusqProd(''); }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                      prodSelId === null ? 'bg-gray-700 text-yellow-400' : 'text-gray-500 hover:bg-gray-700'
                    }`}>
                    <span>— Sin vincular (quitar mapeo)</span>
                  </button>
                  {prodsFiltrados.slice(0, 40).map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setProdSelId(p.id); setBusqProd(`${p.descripcion}${p.codigo ? ` (${p.codigo})` : ''}`); }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700 transition-colors flex justify-between items-center ${
                        prodSelId === p.id ? 'bg-blue-900 text-blue-200' : 'text-gray-200'
                      }`}>
                      <span>
                        {p.descripcion}
                        {p.codigo && <span className="text-gray-500 ml-1">({p.codigo})</span>}
                      </span>
                      <span className="text-gray-600 ml-2 flex-shrink-0">{p.unidad_medida}</span>
                    </button>
                  ))}
                  {prodsFiltrados.length === 0 && (
                    <p className="text-gray-600 text-xs text-center py-3">Sin resultados</p>
                  )}
                </div>
              </div>

              {prodSelId && (
                <div className="bg-blue-950 border border-blue-800 rounded px-3 py-2 text-xs text-blue-300">
                  A partir de ahora, al contabilizar un XML de <strong>{mapModal.emisor_nombre}</strong> con
                  código <span className="font-mono">{mapModal.codigo_comercial}</span>, se creará
                  automáticamente una entrada en el inventario del producto seleccionado.
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button onClick={() => setMapModal(null)}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={guardarMapeo} disabled={guardando}
                className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-medium transition-colors">
                {guardando ? 'Guardando...' : 'Guardar mapeo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
