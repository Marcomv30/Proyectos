import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { ProductoCatalogo } from './ProductoFormPage';

interface Props {
  empresaId: number;
  onNuevo: () => void;
  onEditar: (producto: ProductoCatalogo) => void;
}

interface Categoria {
  id: number;
  nombre: string;
}

interface Bodega {
  id: number;
  nombre: string;
}

interface ProveedorPrincipalRow {
  producto_id: number;
  tercero_id: number;
  razon_social: string | null;
  codigo: string | null;
}

export default function CatalogoProductos({ empresaId, onNuevo, onEditar }: Props) {
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroCateg, setFiltroCateg] = useState<string>('');
  const [filtroBodega, setFiltroBodega] = useState<string>('');
  const [confirmarElim, setConfirmarElim] = useState<number | null>(null);
  const [proveedoresPrincipales, setProveedoresPrincipales] = useState<Record<number, ProveedorPrincipalRow>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data }, { data: cats }, { data: provData }, { data: bods }] = await Promise.all([
      supabase
        .from('inv_productos')
        .select('*, inv_categorias(nombre)')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('descripcion'),
      supabase
        .from('inv_categorias')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('inv_producto_proveedores')
        .select('producto_id, tercero_id, terceros(codigo, razon_social)')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .eq('es_principal', true),
      supabase
        .from('inv_bodegas')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre'),
    ]);
    setProductos((data as ProductoCatalogo[]) || []);
    setCategorias(cats || []);
    setBodegas((bods as Bodega[]) || []);
    const provMap: Record<number, ProveedorPrincipalRow> = {};
    (((provData as any[]) || [])).forEach((row) => {
      provMap[Number(row.producto_id)] = {
        producto_id: Number(row.producto_id),
        tercero_id: Number(row.tercero_id),
        codigo: row.terceros?.codigo || null,
        razon_social: row.terceros?.razon_social || null,
      };
    });
    setProveedoresPrincipales(provMap);
    setCargando(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const eliminar = async (id: number) => {
    await supabase.from('inv_productos').update({ activo: false }).eq('id', id);
    setConfirmarElim(null);
    await cargar();
  };

  const productosFiltrados = productos.filter(p => {
    const q = busqueda.toLowerCase();
    const matchQ = !q || p.descripcion.toLowerCase().includes(q)
      || (p.codigo || '').toLowerCase().includes(q)
      || ((p as any).codigo_barras || '').toLowerCase().includes(q)
      || (p.codigo_cabys || '').includes(q);
    const matchTipo = !filtroTipo || p.tipo === filtroTipo;
    const matchCateg = !filtroCateg || String(p.categoria_id) === filtroCateg;
    const matchBodega = !filtroBodega || String((p as any).bodega_id) === filtroBodega;
    return matchQ && matchTipo && matchCateg && matchBodega;
  });

  const ivaColor = (iva: number) =>
    iva === 13 ? 'bg-green-900 text-green-300' :
    iva === 0 ? 'bg-gray-700 text-gray-400' :
    'bg-yellow-900 text-yellow-300';

  const tipoLabel = (t: string) =>
    t === 'producto' ? 'Producto' : t === 'servicio' ? 'Servicio' : 'Combo';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Catalogo de Productos</h1>
          <p className="text-gray-400 text-sm mt-1">{productosFiltrados.length} de {productos.length} registros</p>
        </div>
        <button onClick={onNuevo} className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Nuevo Producto/Servicio
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-5">
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por descripcion, codigo, codigo de barras o CABYS..."
          className="flex-1 min-w-48 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">Todos los tipos</option>
          <option value="producto">Productos</option>
          <option value="servicio">Servicios</option>
          <option value="combo">Combos</option>
        </select>
        <select value={filtroCateg} onChange={e => setFiltroCateg(e.target.value)} className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">Todas las categorias</option>
          {categorias.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
        </select>
        {bodegas.length > 0 && (
          <select value={filtroBodega} onChange={e => setFiltroBodega(e.target.value)} className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
            <option value="">Todas las bodegas</option>
            {bodegas.map(b => <option key={b.id} value={String(b.id)}>{b.nombre}</option>)}
          </select>
        )}
      </div>

      {cargando ? (
        <div className="text-gray-500 text-center py-16">Cargando...</div>
      ) : productosFiltrados.length === 0 ? (
        <div className="text-gray-600 text-center py-16">
          {productos.length === 0 ? 'No hay productos registrados. Cree el primero.' : 'Sin resultados para el filtro.'}
        </div>
      ) : (
        <>
        <div className="text-xs mb-2 md:hidden text-gray-500">Desliza horizontalmente para revisar códigos, stock y acciones.</div>
        <div className="overflow-x-auto rounded-xl border border-gray-700" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
          <table className="w-full text-xs">
            <thead className="bg-gray-900 text-gray-400 border-b border-gray-700">
              <tr>
                <th className="text-left px-3 py-3">Codigo</th>
                <th className="text-left px-3 py-3">Barras</th>
                <th className="text-left px-3 py-3">Descripcion</th>
                <th className="text-left px-3 py-3">Tipo</th>
                <th className="text-left px-3 py-3">Categoria</th>
                <th className="text-left px-3 py-3">CABYS</th>
                <th className="text-center px-3 py-3">IVA</th>
                <th className="text-right px-3 py-3">Precio</th>
                <th className="text-left px-3 py-3">Prov. principal</th>
                <th className="text-right px-3 py-3">Stock</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p, i) => (
                <tr key={p.id} className={`border-b border-gray-700 hover:bg-gray-800 ${i % 2 === 0 ? 'bg-gray-850' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-blue-400">{p.codigo || '-'}</td>
                  <td className="px-3 py-2.5 font-mono text-cyan-300">{(p as any).codigo_barras || <span className="text-gray-600">-</span>}</td>
                  <td className="px-3 py-2.5 text-gray-200 max-w-xs">
                    <div>{p.descripcion}</div>
                    {p.descripcion_detallada && <div className="text-gray-500 text-xs mt-0.5 truncate">{p.descripcion_detallada}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-300">{tipoLabel(p.tipo)}</td>
                  <td className="px-3 py-2.5 text-gray-400">{(p as any).inv_categorias?.nombre || <span className="text-gray-600">-</span>}</td>
                  <td className="px-3 py-2.5 font-mono">
                    {p.codigo_cabys ? <span className="text-blue-400">{p.codigo_cabys}</span> : <span className="text-yellow-600 text-xs">Sin CABYS</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center"><span className={`px-1.5 py-0.5 rounded text-xs font-bold ${ivaColor(p.tarifa_iva)}`}>{p.tarifa_iva}%</span></td>
                  <td className="px-3 py-2.5 text-right text-gray-200">{Number(p.precio_venta).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2.5 text-gray-300">
                    {proveedoresPrincipales[p.id]
                      ? (
                        <div className="max-w-[220px]">
                          <div className="truncate">{proveedoresPrincipales[p.id].razon_social || '-'}</div>
                          {proveedoresPrincipales[p.id].codigo ? <div className="text-[11px] text-gray-500">{proveedoresPrincipales[p.id].codigo}</div> : null}
                        </div>
                      )
                      : <span className="text-gray-600">-</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {p.tipo === 'producto'
                      ? <span className={Number(p.stock_actual) < Number(p.stock_minimo) ? 'text-red-400 font-bold' : 'text-gray-300'}>{Number(p.stock_actual).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
                      : <span className="text-gray-600">-</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => onEditar(p)} className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-blue-900 hover:bg-opacity-30 transition-colors">Editar</button>
                      <button onClick={() => setConfirmarElim(p.id)} className="text-red-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-red-900 hover:bg-opacity-30 transition-colors">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {confirmarElim !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-red-700 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-bold mb-2">Eliminar producto</h3>
            <p className="text-gray-400 text-sm mb-5">El producto quedara inactivo. Esta accion es reversible desde la base de datos.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmarElim(null)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">Cancelar</button>
              <button onClick={() => eliminar(confirmarElim)} className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded text-sm font-medium">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
