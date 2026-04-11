// ============================================================
// MYA ERP — Valorización de Inventario
// Stock × Costo Promedio Ponderado a una fecha dada
// Requerido para D-101 (Renta) y cierre fiscal MH-CR
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../supabase';
import { formatMoneyCRC } from '../../utils/reporting';
import * as XLSX from 'xlsx';

interface Props { empresaId: number; }

interface FilaValorizacion {
  producto_id: number;
  codigo: string | null;
  descripcion: string;
  unidad_medida: string;
  categoria: string;
  tarifa_iva: number;
  stock_a_fecha: number;
  costo_promedio: number;
  valor_inventario: number;
}

interface ResumenCategoria {
  categoria: string;
  filas: FilaValorizacion[];
  total: number;
}

export default function ValorizacionInventario({ empresaId }: Props) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const [fecha, setFecha]             = useState(hoy);
  const [filas, setFilas]             = useState<FilaValorizacion[]>([]);
  const [cargando, setCargando]       = useState(false);
  const [calculado, setCalculado]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [soloConStock, setSoloConStock] = useState(true);
  const [tipoCambio, setTipoCambio]   = useState<number>(500);
  const [tcFuente, setTcFuente]       = useState<'auto' | 'manual' | 'noencontrado'>('manual');

  useEffect(() => {
    if (!fecha || !empresaId) return;
    supabase.rpc('get_tipo_cambio_historial', {
      p_empresa_id: empresaId, p_fecha_desde: fecha, p_fecha_hasta: fecha,
    }).then(({ data }) => {
      const tc = Number((data as any)?.[0]?.venta || 0);
      if (tc > 0) { setTipoCambio(tc); setTcFuente('auto'); }
      else setTcFuente('noencontrado');
    });
  }, [fecha, empresaId]);

  const calcular = useCallback(async () => {
    if (!fecha) return;
    setCargando(true);
    setError(null);
    try {
      // Stock a la fecha: suma de movimientos hasta fecha inclusive
      const { data: movs, error: eMovs } = await supabase
        .from('inv_movimientos')
        .select(`
          producto_id,
          tipo,
          cantidad,
          costo_promedio_resultante,
          fecha
        `)
        .eq('empresa_id', empresaId)
        .lte('fecha', fecha)
        .order('fecha', { ascending: true })
        .order('created_at', { ascending: true });

      if (eMovs) throw eMovs;

      // Calcular stock y último costo promedio por producto
      const stockMap: Record<number, { qty: number; costo: number }> = {};
      for (const m of movs || []) {
        const pid = m.producto_id;
        if (!stockMap[pid]) stockMap[pid] = { qty: 0, costo: 0 };
        const delta =
          m.tipo === 'entrada' ? Number(m.cantidad) :
          m.tipo === 'salida'  ? -Number(m.cantidad) :
          Number(m.cantidad);
        stockMap[pid].qty += delta;
        if (m.costo_promedio_resultante != null) {
          stockMap[pid].costo = Number(m.costo_promedio_resultante);
        }
      }

      // Cargar catálogo de productos con categoría
      const { data: productos, error: eProd } = await supabase
        .from('inv_productos')
        .select('id, codigo, descripcion, unidad_medida, tarifa_iva, costo_promedio, inv_categorias(nombre)')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .eq('tipo', 'producto');

      if (eProd) throw eProd;

      const resultado: FilaValorizacion[] = [];
      for (const p of productos || []) {
        const sm = stockMap[p.id];
        const stockFecha = sm?.qty ?? 0;
        // Si no hay movimientos históricos con costo_promedio_resultante, usar el actual
        const costoFecha = sm?.costo || Number(p.costo_promedio || 0);
        if (soloConStock && stockFecha <= 0) continue;

        resultado.push({
          producto_id:    p.id,
          codigo:         p.codigo,
          descripcion:    p.descripcion,
          unidad_medida:  p.unidad_medida,
          categoria:      (p as any).inv_categorias?.nombre || 'Sin categoría',
          tarifa_iva:     Number(p.tarifa_iva || 0),
          stock_a_fecha:  stockFecha,
          costo_promedio: costoFecha,
          valor_inventario: Math.round(stockFecha * costoFecha * 100) / 100,
        });
      }

      resultado.sort((a, b) =>
        a.categoria.localeCompare(b.categoria) || (a.codigo || '').localeCompare(b.codigo || ''));

      setFilas(resultado);
      setCalculado(true);
    } catch (e: any) {
      setError(e.message || 'Error al calcular valorización');
    } finally {
      setCargando(false);
    }
  }, [fecha, empresaId, soloConStock]);

  // Agrupar por categoría
  const resumen: ResumenCategoria[] = [];
  for (const f of filas) {
    let cat = resumen.find(r => r.categoria === f.categoria);
    if (!cat) { cat = { categoria: f.categoria, filas: [], total: 0 }; resumen.push(cat); }
    cat.filas.push(f);
    cat.total += f.valor_inventario;
  }
  const totalGeneral = filas.reduce((s, f) => s + f.valor_inventario, 0);

  const fmtUSD = (n: number) => (n / tipoCambio).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const exportarExcel = () => {
    const datos = filas.map(f => ({
      'Categoría':         f.categoria,
      'Código':            f.codigo || '',
      'Descripción':       f.descripcion,
      'Unidad':            f.unidad_medida,
      'IVA %':             f.tarifa_iva,
      [`Stock al ${fecha}`]: f.stock_a_fecha,
      'Costo Prom. ₡':    f.costo_promedio,
      'Valor Total ₡':    f.valor_inventario,
      'Valor Total $':     Math.round(f.valor_inventario / tipoCambio * 100) / 100,
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Valorización');
    XLSX.writeFile(wb, `valorizacion_inventario_${fecha}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-mono">

      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white mb-1">Valorización de Inventario</h1>
        <p className="text-gray-500 text-xs">
          Stock × Costo Promedio Ponderado a una fecha — Requerido para D-101 MH-CR
        </p>
      </div>

      {/* Controles */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Valorizar al</label>
          <input
            type="date"
            value={fecha}
            onChange={e => { setFecha(e.target.value); setCalculado(false); }}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="soloStock"
            checked={soloConStock}
            onChange={e => { setSoloConStock(e.target.checked); setCalculado(false); }}
            className="rounded"
          />
          <label htmlFor="soloStock" className="text-xs text-gray-400 cursor-pointer">
            Solo productos con stock &gt; 0
          </label>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">
            T.C. (₡ por $)
            {tcFuente === 'auto'         && <span className="ml-2 text-green-400">● BCCR {fecha}</span>}
            {tcFuente === 'noencontrado' && <span className="ml-2 text-orange-400">⚠ sin T.C. para esta fecha</span>}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={tipoCambio}
            onChange={e => { setTipoCambio(Number(e.target.value.replace(/[^0-9.]/g, '')) || 1); setTcFuente('manual'); }}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-yellow-400 font-mono w-32 focus:outline-none focus:border-yellow-500"
          />
        </div>

        <button
          onClick={calcular}
          disabled={cargando || !fecha}
          className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-medium text-white"
        >
          {cargando ? 'Calculando...' : '⚖️ Calcular'}
        </button>

        {calculado && filas.length > 0 && (
          <button
            onClick={exportarExcel}
            className="bg-green-800 hover:bg-green-700 px-4 py-2 rounded text-sm text-white"
          >
            📥 Exportar Excel
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-lg p-3 mb-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Resultado */}
      {calculado && (
        <>
          {/* Totalizador */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            <div className="bg-gray-900 border border-cyan-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">Productos</p>
              <p className="text-white text-2xl font-bold">{filas.length}</p>
            </div>
            <div className="bg-gray-900 border border-cyan-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">Categorías</p>
              <p className="text-white text-2xl font-bold">{resumen.length}</p>
            </div>
            <div className="bg-gray-900 border border-cyan-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">Valor total ₡ al {fecha}</p>
              <p className="text-cyan-400 text-2xl font-bold">{formatMoneyCRC(totalGeneral)}</p>
            </div>
            <div className="bg-gray-900 border border-yellow-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">Valor total $ (T.C. {tipoCambio})</p>
              <p className="text-yellow-400 text-2xl font-bold">{fmtUSD(totalGeneral)}</p>
            </div>
          </div>

          {filas.length === 0 ? (
            <p className="text-gray-500 text-center py-12">Sin movimientos hasta {fecha}</p>
          ) : (
            resumen.map(cat => (
              <div key={cat.categoria} className="mb-6">
                {/* Cabecera categoría */}
                <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-t-lg px-4 py-2">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                    {cat.categoria}
                  </span>
                  <span className="text-xs font-mono text-cyan-400 font-bold">
                    {formatMoneyCRC(cat.total)}
                  </span>
                </div>

                <div className="text-xs mb-2 md:hidden text-gray-500">Desliza horizontalmente para revisar stock, costo y valores.</div>
                <div className="overflow-x-auto rounded-b-lg" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
                <table className="w-full text-xs border border-gray-700 border-t-0 rounded-b-lg overflow-hidden">
                  <thead className="bg-gray-900 text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-left">Descripción</th>
                      <th className="px-3 py-2 text-center">Unidad</th>
                      <th className="px-3 py-2 text-center">IVA</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                      <th className="px-3 py-2 text-right">Costo Prom.</th>
                      <th className="px-3 py-2 text-right">Valor ₡</th>
                      <th className="px-3 py-2 text-right">Valor $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.filas.map((f, i) => (
                      <tr key={f.producto_id}
                        className={'border-t border-gray-800 ' + (i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850')}>
                        <td className="px-3 py-2 font-mono text-gray-400">{f.codigo || '—'}</td>
                        <td className="px-3 py-2 text-gray-200">{f.descripcion}</td>
                        <td className="px-3 py-2 text-center text-gray-400">{f.unidad_medida}</td>
                        <td className="px-3 py-2 text-center text-blue-400">{f.tarifa_iva}%</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-200">
                          {f.stock_a_fecha.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-yellow-400">
                          {formatMoneyCRC(f.costo_promedio)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-green-400 font-bold">
                          {formatMoneyCRC(f.valor_inventario)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-yellow-400">
                          {fmtUSD(f.valor_inventario)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-900 border-t border-gray-700">
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-right text-gray-400 text-xs">
                        Subtotal {cat.categoria}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-cyan-400 font-bold">
                        {formatMoneyCRC(cat.total)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-yellow-400 font-bold">
                        {fmtUSD(cat.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            ))
          )}

          {/* Total general */}
          {filas.length > 0 && (
            <div className="flex justify-end mt-2">
              <div className="bg-gray-800 border border-cyan-700 rounded-xl px-6 py-3 flex items-center gap-6">
                <span className="text-gray-400 text-sm">Total General al {fecha}</span>
                <span className="text-cyan-400 text-xl font-bold font-mono">{formatMoneyCRC(totalGeneral)}</span>
                <span className="text-gray-500 text-xs">≈</span>
                <span className="text-yellow-400 text-xl font-bold font-mono">$ {fmtUSD(totalGeneral)}</span>
              </div>
            </div>
          )}

          <p className="text-gray-600 text-xs mt-4 text-center">
            * El costo promedio y valor en ₡ son exactos — método Costo Promedio Ponderado (Art. 9 Reglamento MH-CR). El valor en $ es referencial: usa el T.C. ingresado ({tipoCambio} ₡/$) y no refleja el T.C. histórico de cada compra.
          </p>
        </>
      )}
    </div>
  );
}
