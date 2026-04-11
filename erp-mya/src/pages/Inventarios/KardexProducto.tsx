// ============================================================
// MYA ERP — Kardex de Producto (Método Costo Promedio Ponderado)
// Reglamento General de Gestión, Fiscalización y Recaudación
// Tributaria — Art. 9 — Libro de Inventarios MH-CR
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { formatMoneyCRC } from '../../utils/reporting';

interface Props {
  empresaId: number;
  productoIdInicial?: number;
}

interface ProductoBasico {
  id: number;
  codigo: string | null;
  descripcion: string;
  unidad_medida: string;
}

interface Movimiento {
  id: number;
  fecha: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  origen: string;
  cantidad: number;
  costo_unitario: number;
  referencia: string | null;
  notas: string | null;
  created_at: string;
}

interface KardexRow {
  id: number;
  fecha: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  origen: string;
  referencia: string | null;
  notas: string | null;
  entrada_qty: number;
  salida_qty: number;
  costo_unitario: number;
  saldo_qty: number;
  costo_promedio: number;
  valor_saldo: number;
}

interface SaldoAcum {
  qty: number;
  costo: number;
}

function calcularKardex(
  movimientos: Movimiento[],
  fechaDesde: string,
  fechaHasta: string,
): { saldoInicial: SaldoAcum; rows: KardexRow[] } {
  // Ordenar cronológicamente por created_at
  const ordenados = [...movimientos].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let saldo_qty = 0;
  let costo_prom = 0;

  const rows: KardexRow[] = [];
  let saldoInicial: SaldoAcum = { qty: 0, costo: 0 };
  let saldoInicialCalculado = false;

  for (const m of ordenados) {
    const enPeriodo = m.fecha >= fechaDesde && m.fecha <= fechaHasta;
    const antesDelPeriodo = m.fecha < fechaDesde;

    // Calcular delta
    let delta = 0;
    if (m.tipo === 'entrada') delta = m.cantidad;
    else if (m.tipo === 'salida') delta = -Math.abs(m.cantidad);
    else delta = m.cantidad; // ajuste: positivo o negativo

    const nuevo_saldo = saldo_qty + delta;

    // Nuevo costo promedio
    let nuevo_costo = costo_prom;
    if (delta > 0 && m.costo_unitario > 0 && nuevo_saldo > 0) {
      nuevo_costo = (saldo_qty * costo_prom + delta * m.costo_unitario) / nuevo_saldo;
    }

    saldo_qty = nuevo_saldo;
    costo_prom = nuevo_costo < 0 ? 0 : nuevo_costo;

    // Capturar saldo inicial justo antes del primer día del período
    if (antesDelPeriodo) {
      saldoInicial = { qty: saldo_qty, costo: costo_prom };
    } else if (enPeriodo && !saldoInicialCalculado) {
      // Ya tenemos el saldo antes del período; marcamos calculado antes de agregar la primera fila
      saldoInicialCalculado = true;
    }

    if (enPeriodo) {
      rows.push({
        id: m.id,
        fecha: m.fecha,
        tipo: m.tipo,
        origen: m.origen,
        referencia: m.referencia,
        notas: m.notas,
        entrada_qty: delta > 0 ? delta : 0,
        salida_qty: delta < 0 ? Math.abs(delta) : 0,
        costo_unitario: m.costo_unitario,
        saldo_qty: saldo_qty,
        costo_promedio: costo_prom,
        valor_saldo: saldo_qty * costo_prom,
      });
    }
  }

  return { saldoInicial, rows };
}

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const primerDelMes = hoy.substring(0, 8) + '01';

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
};

const ORIGEN_LABEL: Record<string, string> = {
  xml:     'XML compra',
  fe:      'FE emitida',
  ajuste:  'Manual',
  sistema: 'Sistema',
};

export default function KardexProducto({ empresaId, productoIdInicial }: Props) {
  const [productos, setProductos]         = useState<ProductoBasico[]>([]);
  const [productoId, setProductoId]       = useState(productoIdInicial ? String(productoIdInicial) : '');
  const [busqProd, setBusqProd]           = useState('');
  const [showDrop, setShowDrop]           = useState(false);
  const [fechaDesde, setFechaDesde]       = useState(primerDelMes);
  const [fechaHasta, setFechaHasta]       = useState(hoy);
  const [movimientos, setMovimientos]     = useState<Movimiento[]>([]);
  const [cargando, setCargando]           = useState(false);

  // Cargar lista de productos
  useEffect(() => {
    supabase
      .from('inv_productos')
      .select('id, codigo, descripcion, unidad_medida')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('descripcion')
      .then(({ data }) => setProductos((data as ProductoBasico[]) || []));
  }, [empresaId]);

  const cargarMovimientos = useCallback(async (pid: number) => {
    setCargando(true);
    const { data } = await supabase
      .from('inv_movimientos')
      .select('id, fecha, tipo, origen, cantidad, costo_unitario, referencia, notas, created_at')
      .eq('empresa_id', empresaId)
      .eq('producto_id', pid)
      .order('created_at', { ascending: true });
    setMovimientos((data as Movimiento[]) || []);
    setCargando(false);
  }, [empresaId]);

  const seleccionarProducto = (p: ProductoBasico) => {
    setProductoId(String(p.id));
    setBusqProd(`${p.descripcion}${p.codigo ? ` (${p.codigo})` : ''}`);
    setShowDrop(false);
    cargarMovimientos(p.id);
  };

  const prodsFiltrados = busqProd.trim()
    ? productos.filter(p =>
        p.descripcion.toLowerCase().includes(busqProd.toLowerCase()) ||
        (p.codigo || '').toLowerCase().includes(busqProd.toLowerCase())
      )
    : productos;

  const productoSel = productos.find(p => String(p.id) === productoId);

  const { saldoInicial, rows } = productoId && movimientos.length >= 0
    ? calcularKardex(movimientos, fechaDesde, fechaHasta)
    : { saldoInicial: { qty: 0, costo: 0 }, rows: [] };

  const totalEntradas = rows.reduce((s, r) => s + r.entrada_qty, 0);
  const totalSalidas  = rows.reduce((s, r) => s + r.salida_qty, 0);
  const saldoFinal    = rows.length > 0 ? rows[rows.length - 1] : null;

  const imprimir = () => window.print();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">📒 Kardex de Inventario</h1>
          <p className="text-gray-400 text-sm mt-1">
            Método costo promedio ponderado — Art. 9 Reglamento MH-CR
          </p>
        </div>
        {productoId && rows.length > 0 && (
          <button
            onClick={imprimir}
            className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            🖨 Imprimir
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Selector de producto */}
        <div className="md:col-span-1 relative">
          <label className="block text-gray-400 text-xs mb-1">Producto</label>
          <input
            value={busqProd}
            onChange={e => { setBusqProd(e.target.value); setProductoId(''); setShowDrop(true); }}
            onFocus={() => setShowDrop(true)}
            placeholder="Buscar por nombre o código..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          />
          {showDrop && prodsFiltrados.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg max-h-52 overflow-y-auto shadow-xl">
              {prodsFiltrados.slice(0, 40).map(p => (
                <button key={p.id} type="button"
                  onMouseDown={() => seleccionarProducto(p)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-700 transition-colors text-gray-200 flex justify-between">
                  <span>
                    {p.descripcion}
                    {p.codigo && <span className="text-gray-500 ml-1">({p.codigo})</span>}
                  </span>
                  <span className="text-gray-500 ml-2 flex-shrink-0">{p.unidad_medida}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-gray-400 text-xs mb-1">Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
        </div>
      </div>

      {/* Sin producto seleccionado */}
      {!productoId && (
        <div className="text-gray-600 text-center py-20">
          Seleccione un producto para ver el kardex
        </div>
      )}

      {/* Cargando */}
      {productoId && cargando && (
        <div className="text-gray-500 text-center py-16">Cargando movimientos...</div>
      )}

      {/* Kardex */}
      {productoId && !cargando && (
        <>
          {/* Cards resumen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">Saldo inicial</p>
              <p className="text-white font-bold font-mono">
                {saldoInicial.qty.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                <span className="text-gray-500 font-normal text-xs ml-1">{productoSel?.unidad_medida}</span>
              </p>
              <p className="text-gray-400 text-xs font-mono mt-0.5">
                {formatMoneyCRC(saldoInicial.qty * saldoInicial.costo)}
              </p>
            </div>
            <div className="bg-gray-800 border border-green-900 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">Total entradas</p>
              <p className="text-green-400 font-bold font-mono">
                +{totalEntradas.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                <span className="text-gray-500 font-normal text-xs ml-1">{productoSel?.unidad_medida}</span>
              </p>
            </div>
            <div className="bg-gray-800 border border-red-900 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">Total salidas</p>
              <p className="text-red-400 font-bold font-mono">
                -{totalSalidas.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                <span className="text-gray-500 font-normal text-xs ml-1">{productoSel?.unidad_medida}</span>
              </p>
            </div>
            <div className="bg-gray-800 border border-cyan-900 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">Saldo final</p>
              <p className={`font-bold font-mono ${(saldoFinal?.saldo_qty ?? saldoInicial.qty) <= 0 ? 'text-red-400' : 'text-cyan-400'}`}>
                {(saldoFinal?.saldo_qty ?? saldoInicial.qty).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                <span className="text-gray-500 font-normal text-xs ml-1">{productoSel?.unidad_medida}</span>
              </p>
              <p className="text-gray-400 text-xs font-mono mt-0.5">
                {formatMoneyCRC(saldoFinal?.valor_saldo ?? saldoInicial.qty * saldoInicial.costo)}
              </p>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="text-gray-600 text-center py-16 border border-gray-800 rounded-xl">
              Sin movimientos en el período seleccionado
            </div>
          ) : (
            <>
            <div className="text-xs mb-2 md:hidden text-gray-500">Desliza horizontalmente para revisar entradas, salidas y saldo acumulado.</div>
            <div className="overflow-x-auto rounded-xl border border-gray-700" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
              {/* Encabezado del kardex para impresión */}
              <div className="hidden print:block px-4 pt-4 pb-2 border-b border-gray-300">
                <h2 className="text-lg font-bold">Kardex — {productoSel?.descripcion}</h2>
                <p className="text-sm text-gray-600">
                  Período: {fechaDesde} al {fechaHasta} · Método: Costo Promedio Ponderado
                </p>
              </div>

              <table className="w-full text-xs">
                <thead className="bg-gray-900 text-gray-400 border-b border-gray-700">
                  <tr>
                    <th className="text-left px-3 py-3" rowSpan={2}>Fecha</th>
                    <th className="text-left px-3 py-3" rowSpan={2}>Tipo</th>
                    <th className="text-left px-3 py-3" rowSpan={2}>Referencia / Notas</th>
                    <th className="text-right px-3 py-2 border-l border-gray-700 bg-green-950" colSpan={2}>Entradas</th>
                    <th className="text-right px-3 py-2 border-l border-gray-700 bg-red-950" colSpan={2}>Salidas</th>
                    <th className="text-right px-3 py-2 border-l border-gray-700 bg-blue-950" colSpan={3}>Saldo</th>
                  </tr>
                  <tr>
                    <th className="text-right px-3 py-2 border-l border-gray-700 bg-green-950 text-green-400">Cantidad</th>
                    <th className="text-right px-3 py-2 bg-green-950 text-green-400">Costo unit.</th>
                    <th className="text-right px-3 py-2 border-l border-gray-700 bg-red-950 text-red-400">Cantidad</th>
                    <th className="text-right px-3 py-2 bg-red-950 text-red-400">Costo unit.</th>
                    <th className="text-right px-3 py-2 border-l border-gray-700 bg-blue-950 text-blue-400">Unidades</th>
                    <th className="text-right px-3 py-2 bg-blue-950 text-blue-400">Costo prom.</th>
                    <th className="text-right px-3 py-2 bg-blue-950 text-blue-400">Valor</th>
                  </tr>
                  {/* Fila saldo inicial */}
                  <tr className="border-t border-gray-700 bg-gray-800">
                    <td className="px-3 py-2 text-gray-500 font-mono">{fechaDesde}</td>
                    <td className="px-3 py-2 text-gray-500 italic" colSpan={2}>Saldo inicial</td>
                    <td className="px-3 py-2 border-l border-gray-700" colSpan={4}></td>
                    <td className="px-3 py-2 border-l border-gray-700 text-right font-mono text-gray-300">
                      {saldoInicial.qty.toLocaleString('es-CR', { minimumFractionDigits: 4 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      {saldoInicial.costo.toLocaleString('es-CR', { minimumFractionDigits: 4 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      {formatMoneyCRC(saldoInicial.qty * saldoInicial.costo)}
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id}
                      className={`border-b border-gray-700 hover:bg-gray-800 ${i % 2 === 0 ? '' : 'bg-gray-900'}`}>
                      <td className="px-3 py-2.5 text-gray-400 font-mono whitespace-nowrap">{r.fecha}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          r.tipo === 'entrada' ? 'bg-green-900 text-green-400'
                          : r.tipo === 'salida'  ? 'bg-red-900 text-red-400'
                          : 'bg-yellow-900 text-yellow-400'
                        }`}>
                          {TIPO_LABEL[r.tipo]}
                        </span>
                        <span className="text-gray-600 ml-1 text-xs">
                          {ORIGEN_LABEL[r.origen] ?? r.origen}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-300 max-w-xs">
                        {r.referencia && <span className="text-blue-400 font-mono">{r.referencia}</span>}
                        {r.notas && <span className="text-gray-500 ml-1">{r.notas}</span>}
                        {!r.referencia && !r.notas && <span className="text-gray-700">—</span>}
                      </td>
                      {/* Entradas */}
                      <td className="px-3 py-2.5 text-right font-mono border-l border-gray-700 text-green-400">
                        {r.entrada_qty > 0
                          ? r.entrada_qty.toLocaleString('es-CR', { minimumFractionDigits: 2 })
                          : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-400">
                        {r.entrada_qty > 0 && r.costo_unitario > 0
                          ? r.costo_unitario.toLocaleString('es-CR', { minimumFractionDigits: 2 })
                          : <span className="text-gray-700">—</span>}
                      </td>
                      {/* Salidas */}
                      <td className="px-3 py-2.5 text-right font-mono border-l border-gray-700 text-red-400">
                        {r.salida_qty > 0
                          ? r.salida_qty.toLocaleString('es-CR', { minimumFractionDigits: 2 })
                          : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-400">
                        {r.salida_qty > 0 && r.costo_unitario > 0
                          ? r.costo_unitario.toLocaleString('es-CR', { minimumFractionDigits: 2 })
                          : <span className="text-gray-700">—</span>}
                      </td>
                      {/* Saldo */}
                      <td className="px-3 py-2.5 text-right font-mono border-l border-gray-700 font-bold text-white">
                        {r.saldo_qty.toLocaleString('es-CR', { minimumFractionDigits: 4 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-cyan-400">
                        {r.costo_promedio.toLocaleString('es-CR', { minimumFractionDigits: 4 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-cyan-300 font-bold">
                        {formatMoneyCRC(r.valor_saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totales */}
                <tfoot>
                  <tr className="bg-gray-900 border-t-2 border-gray-600 font-bold">
                    <td className="px-3 py-3 text-gray-400" colSpan={3}>Totales del período</td>
                    <td className="px-3 py-3 text-right font-mono text-green-400 border-l border-gray-700">
                      {totalEntradas.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                    <td className="px-3 py-3 text-right font-mono text-red-400 border-l border-gray-700">
                      {totalSalidas.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                    <td className="px-3 py-3 text-right font-mono text-white border-l border-gray-700">
                      {(saldoFinal?.saldo_qty ?? saldoInicial.qty).toLocaleString('es-CR', { minimumFractionDigits: 4 })}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-cyan-400">
                      {(saldoFinal?.costo_promedio ?? saldoInicial.costo).toLocaleString('es-CR', { minimumFractionDigits: 4 })}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-cyan-300">
                      {formatMoneyCRC(saldoFinal?.valor_saldo ?? saldoInicial.qty * saldoInicial.costo)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
