import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { CabysSearch, CabysItem } from '../../components/CabysSearch';

interface Props {
  empresaId: number;
  onIrCatalogo: () => void;
  onIrAjuste?: () => void;
}

interface Stats {
  total: number;
  sinCabys: number;
  servicios: number;
  productos: number;
  stockBajo: number;
  categorias: number;
}

export default function DashboardInventario({ empresaId, onIrCatalogo, onIrAjuste }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [cargando, setCargando] = useState(true);
  const [openCabys, setOpenCabys] = useState(false);
  const [cabysSelec, setCabysSelec] = useState<CabysItem | null>(null);

  useEffect(() => {
    void cargar();
  }, [empresaId]);

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from('inv_productos')
      .select('id, tipo, codigo_cabys, stock_actual, stock_minimo')
      .eq('empresa_id', empresaId)
      .eq('activo', true);

    const { count: cats } = await supabase
      .from('inv_categorias')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('activo', true);

    const lista = data || [];
    setStats({
      total: lista.length,
      sinCabys: lista.filter((p) => !p.codigo_cabys).length,
      servicios: lista.filter((p) => p.tipo === 'servicio').length,
      productos: lista.filter((p) => p.tipo === 'producto').length,
      stockBajo: lista.filter((p) => p.tipo === 'producto' && Number(p.stock_actual) < Number(p.stock_minimo)).length,
      categorias: cats || 0,
    });
    setCargando(false);
  };

  const handleCabysSelect = (item: CabysItem) => {
    setCabysSelec(item);
    setOpenCabys(false);
  };

  const cards = stats
    ? [
        { label: 'Total productos/servicios', valor: stats.total, color: 'blue', icono: '📦' },
        { label: 'Productos (bienes)', valor: stats.productos, color: 'green', icono: '🏷️' },
        { label: 'Servicios', valor: stats.servicios, color: 'purple', icono: '⚙️' },
        { label: 'Sin codigo CABYS', valor: stats.sinCabys, color: stats.sinCabys > 0 ? 'yellow' : 'green', icono: '⚠️' },
        { label: 'Stock bajo minimo', valor: stats.stockBajo, color: stats.stockBajo > 0 ? 'red' : 'green', icono: '📉' },
        { label: 'Categorias', valor: stats.categorias, color: 'gray', icono: '🗂️' },
      ]
    : [];

  const colorMap: Record<string, string> = {
    blue: 'border-blue-700 bg-blue-900 bg-opacity-20 text-blue-300',
    green: 'border-green-700 bg-green-900 bg-opacity-20 text-green-300',
    purple: 'border-purple-700 bg-purple-900 bg-opacity-20 text-purple-300',
    yellow: 'border-yellow-700 bg-yellow-900 bg-opacity-20 text-yellow-300',
    red: 'border-red-700 bg-red-900 bg-opacity-20 text-red-300',
    gray: 'border-gray-700 bg-gray-800 text-gray-300',
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">Inventarios</h1>
          <p className="text-gray-400 text-sm mt-1">Catalogo de productos y servicios</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <button
            onClick={() => setOpenCabys(true)}
            className="bg-blue-800 hover:bg-blue-700 text-blue-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
          >
            Consultar CABYS
          </button>
          <button
            onClick={onIrCatalogo}
            className="bg-green-800 hover:bg-green-700 text-green-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
          >
            Ir al catalogo
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="text-gray-500 text-center py-12">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {cards.map((card) => (
            <div key={card.label} className={`border rounded-xl p-5 ${colorMap[card.color]}`}>
              <div className="text-2xl mb-1">{card.icono}</div>
              <div className="text-3xl font-bold">{card.valor}</div>
              <div className="text-xs mt-1 opacity-80">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {cabysSelec && (
        <div className="bg-gray-800 border border-blue-700 rounded-xl p-5 mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="text-blue-400 font-semibold text-sm">Ultimo resultado CABYS</h3>
            <button onClick={() => setCabysSelec(null)} className="text-gray-600 hover:text-gray-400 text-lg shrink-0">
              ×
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-1">Codigo</p>
              <p className="text-blue-300 font-mono font-semibold break-all">{cabysSelec.codigo}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-gray-500 text-xs mb-1">Descripcion</p>
              <p className="text-gray-200">{cabysSelec.descripcion}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Tarifa IVA</p>
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold ${
                  cabysSelec.impuesto === 13
                    ? 'bg-green-900 text-green-300'
                    : cabysSelec.impuesto === 0
                      ? 'bg-gray-700 text-gray-400'
                      : 'bg-yellow-900 text-yellow-300'
                }`}
              >
                {cabysSelec.impuesto}%
              </span>
            </div>
            {cabysSelec.categorias.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-gray-500 text-xs mb-1">Categoria</p>
                <p className="text-gray-400 text-xs">{cabysSelec.categorias.join(' > ')}</p>
              </div>
            )}
          </div>
          <button onClick={onIrCatalogo} className="mt-3 text-xs text-blue-400 hover:text-blue-300">
            Ir al catalogo para crear producto con este codigo
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Catalogo de Productos', icono: '📋', action: onIrCatalogo },
          { label: 'Ajuste de Inventario', icono: '⚖', action: onIrAjuste || (() => {}) },
          { label: 'Buscar en CABYS', icono: '🔍', action: () => setOpenCabys(true) },
        ].map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-4 text-left transition-colors"
          >
            <div className="text-2xl mb-2">{item.icono}</div>
            <div className="text-sm text-gray-300 font-medium">{item.label}</div>
            <div className="text-xs text-gray-600 mt-1">Abrir</div>
          </button>
        ))}
      </div>

      {openCabys && <CabysSearch onSelect={handleCabysSelect} onClose={() => setOpenCabys(false)} />}
    </div>
  );
}
