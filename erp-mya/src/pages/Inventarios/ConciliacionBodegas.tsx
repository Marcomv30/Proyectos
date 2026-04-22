// ============================================================
// MYA ERP — Conciliación de Bodegas
// Stock por bodega vs. stock global (inv_productos.stock_actual)
// Permite detectar diferencias y disparar ajustes de re-sincronización
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';

interface Props { empresaId: number; }

interface Bodega {
  id: number;
  nombre: string;
  es_principal: boolean;
}

interface Sucursal {
  id: number;
  nombre: string;
  bodega_id: number | null;
  activo?: boolean;
}

interface FilaConciliacion {
  producto_id: number;
  codigo: string | null;
  descripcion: string;
  unidad_medida: string;
  costo_promedio: number;
  stock_global: number;           // inv_productos.stock_actual
  stocks_bodega: Record<number, number | null>; // bodegaId → stock (null = sin registro)
  suma_bodegas: number;           // suma de todos los inv_stock_bodega
  diferencia: number;             // stock_global - suma_bodegas
  valor_global: number;
  valores_bodega: Record<number, number>;
}

type FiltroEstado = 'todos' | 'con_diferencia' | 'sin_registro';

export default function ConciliacionBodegas({ empresaId }: Props) {
  const [bodegas, setBodegas]       = useState<Bodega[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [filas, setFilas]           = useState<FilaConciliacion[]>([]);
  const [cargando, setCargando]     = useState(false);
  const [calculado, setCalculado]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [filtro, setFiltro]         = useState<FiltroEstado>('todos');
  const [busqueda, setBusqueda]     = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [sincronizando, setSincronizando] = useState<number | null>(null);
  const [cargaInicial, setCargaInicial]   = useState<{ bodegaId: number | null; cargando: boolean; msg: string | null }>({ bodegaId: null, cargando: false, msg: null });

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, []);

  // Cargar bodegas al montar
  useEffect(() => {
    supabase
      .from('inv_bodegas')
      .select('id, nombre, es_principal')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('es_principal', { ascending: false })
      .order('nombre')
      .then(({ data }) => setBodegas((data || []) as Bodega[]));
  }, [empresaId]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!empresaId) {
        if (!cancelado) setSucursales([]);
        return;
      }
      try {
        const resp = await fetch(`/api/pos/sucursales?empresa_id=${empresaId}`, {
          headers: await authHeaders(),
        });
        const json = await resp.json();
        if (!cancelado) setSucursales((json?.ok ? json.sucursales : []) || []);
      } catch {
        if (!cancelado) setSucursales([]);
      }
    })();
    return () => { cancelado = true; };
  }, [empresaId, authHeaders]);

  const calcular = useCallback(async () => {
    setCargando(true);
    setError(null);
    setFilas([]);
    try {
      // 1. Traer todos los productos
      let q = supabase
        .from('inv_productos')
        .select('id, codigo, descripcion, unidad_medida, stock_actual, costo_promedio')
        .eq('empresa_id', empresaId)
        .order('descripcion');
      if (soloActivos) q = q.or('activo.is.null,activo.eq.true');

      const { data: productos, error: eProd } = await q;
      if (eProd) throw new Error(eProd.message);
      if (!productos?.length) { setFilas([]); setCalculado(true); setCargando(false); return; }

      // 2. Traer todos los registros de inv_stock_bodega para la empresa
      const { data: stocks, error: eStocks } = await supabase
        .from('inv_stock_bodega')
        .select('producto_id, bodega_id, stock_actual')
        .eq('empresa_id', empresaId);
      if (eStocks) throw new Error(eStocks.message);

      // Indexar stocks: Map<producto_id, Map<bodega_id, stock>>
      const stockIdx = new Map<number, Map<number, number>>();
      for (const s of (stocks || [])) {
        if (!stockIdx.has(s.producto_id)) stockIdx.set(s.producto_id, new Map());
        stockIdx.get(s.producto_id)!.set(s.bodega_id, Number(s.stock_actual));
      }

      const bodegaIds = bodegas.map((b) => b.id);

      const resultado: FilaConciliacion[] = productos.map((p) => {
        const stocksProducto = stockIdx.get(p.id);
        const stocks_bodega: Record<number, number | null> = {};
        const valores_bodega: Record<number, number> = {};
        const costoPromedio = Number((p as any).costo_promedio ?? 0);
        let suma = 0;
        for (const bid of bodegaIds) {
          const val = stocksProducto?.get(bid) ?? null;
          stocks_bodega[bid] = val;
          const qty = val ?? 0;
          if (val !== null) suma += val;
          valores_bodega[bid] = Math.round(qty * costoPromedio * 100) / 100;
        }
        const stockGlobal = Number(p.stock_actual ?? 0);
        return {
          producto_id: p.id,
          codigo: p.codigo,
          descripcion: p.descripcion,
          unidad_medida: p.unidad_medida || 'Unid',
          costo_promedio: costoPromedio,
          stock_global: stockGlobal,
          stocks_bodega,
          suma_bodegas: suma,
          diferencia: stockGlobal - suma,
          valor_global: Math.round(stockGlobal * costoPromedio * 100) / 100,
          valores_bodega,
        };
      });

      setFilas(resultado);
      setCalculado(true);
    } catch (e: any) {
      setError(e.message || 'Error al calcular');
    }
    setCargando(false);
  }, [empresaId, bodegas, soloActivos]);

  // Re-sincronizar un producto: ajusta inv_stock_bodega de la bodega principal
  // para que la suma iguale al stock global
  const sincronizarProducto = async (fila: FilaConciliacion) => {
    if (sincronizando !== null) return;
    const bodegaPrincipal = bodegas.find((b) => b.es_principal) || bodegas[0];
    if (!bodegaPrincipal) { alert('No hay bodega principal configurada.'); return; }

    const confirmMsg =
      `¿Ajustar "${fila.descripcion}" en bodega "${bodegaPrincipal.nombre}"?\n\n` +
      `Stock global: ${fila.stock_global}\n` +
      `Suma bodegas: ${fila.suma_bodegas}\n` +
      `Se asignará ${fila.stock_global} unidades a "${bodegaPrincipal.nombre}" y 0 a las demás.`;
    if (!window.confirm(confirmMsg)) return;

    setSincronizando(fila.producto_id);
    try {
      // Upsert en la bodega principal con el stock global completo
      const { error: e1 } = await supabase
        .from('inv_stock_bodega')
        .upsert(
          { empresa_id: empresaId, producto_id: fila.producto_id, bodega_id: bodegaPrincipal.id, stock_actual: fila.stock_global, updated_at: new Date().toISOString() },
          { onConflict: 'empresa_id,producto_id,bodega_id' }
        );
      if (e1) throw new Error(e1.message);

      // Poner a 0 las demás bodegas que tengan registro
      const otrasBodegas = bodegas.filter((b) => b.id !== bodegaPrincipal.id && fila.stocks_bodega[b.id] !== null);
      for (const b of otrasBodegas) {
        await supabase
          .from('inv_stock_bodega')
          .update({ stock_actual: 0, updated_at: new Date().toISOString() })
          .eq('empresa_id', empresaId)
          .eq('producto_id', fila.producto_id)
          .eq('bodega_id', b.id);
      }

      // Refrescar solo esa fila
      await calcular();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
    setSincronizando(null);
  };


  // Exportar a Excel
  const exportar = () => {
    const filasFiltradas = filasFiltro();
    const cabecera = ['Codigo', 'Descripcion', 'Unidad', 'Costo Promedio', 'Stock Global', 'Valor Global', ...bodegas.map((b) => b.nombre), 'Suma Bodegas', 'Diferencia'];
    const rows = filasFiltradas.map((f) => [
      f.codigo || '',
      f.descripcion,
      f.unidad_medida,
      f.costo_promedio,
      f.stock_global,
      f.valor_global,
      ...bodegas.map((b) => f.stocks_bodega[b.id] ?? ''),
      f.suma_bodegas,
      f.diferencia,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([cabecera, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliacion');

    const resumenRows = [
      ['Tipo', 'Nombre', 'Bodega', 'Stock', 'Saldo CRC'],
      ['General', 'Stock Global', '', '', saldoGeneral],
      ['General', 'Stock Bodegas', '', '', saldoBodegas],
      ['General', 'Brecha', '', '', brechaSaldo],
      ...consolidadoBodegas.map((b) => ['Bodega', b.nombre, b.es_principal ? 'Principal' : '', b.stock, b.valor]),
      ...consolidadoTiendas.map((t) => ['Tienda', t.nombre, bodegas.find((b) => b.id === t.bodega_id)?.nombre || `Bodega ${t.bodega_id}`, t.stock, t.valor]),
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Consolidado');

    XLSX.writeFile(wb, `conciliacion_bodegas_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  };

  const dispararCargaInicial = async (bodega: Bodega) => {
    const confirm = window.confirm(
      `¿Cargar stock inicial en "${bodega.nombre}"?\n\n` +
      `Se copiará inv_productos.stock_actual a inv_stock_bodega para cada producto que aún no tenga registro en esta bodega.\n` +
      `Los productos que ya tienen registro NO se modifican.`
    );
    if (!confirm) return;
    setCargaInicial({ bodegaId: bodega.id, cargando: true, msg: null });
    try {
      const resp = await fetch(`/api/pos/bodegas/${bodega.id}/carga-inicial`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const json = await resp.json();
      if (json.ok) {
        setCargaInicial({ bodegaId: bodega.id, cargando: false, msg: json.mensaje });
        await calcular(); // refrescar tabla
      } else {
        setCargaInicial({ bodegaId: bodega.id, cargando: false, msg: `Error: ${json.error}` });
      }
    } catch (e: any) {
      setCargaInicial({ bodegaId: bodega.id, cargando: false, msg: `Error de red: ${e.message}` });
    }
  };

  const filasFiltro = (): FilaConciliacion[] => {
    let resultado = filas;
    if (filtro === 'con_diferencia') resultado = resultado.filter((f) => Math.abs(f.diferencia) > 0.001);
    if (filtro === 'sin_registro')   resultado = resultado.filter((f) => bodegas.some((b) => f.stocks_bodega[b.id] === null && f.stock_global > 0));
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      resultado = resultado.filter((f) => f.descripcion.toLowerCase().includes(q) || (f.codigo || '').toLowerCase().includes(q));
    }
    return resultado;
  };

  const filasVista = filasFiltro();
  const totalDiferencias = filas.filter((f) => Math.abs(f.diferencia) > 0.001).length;
  const totalSinRegistro = filas.filter((f) => bodegas.some((b) => f.stocks_bodega[b.id] === null && f.stock_global > 0)).length;
  const saldoGeneral = filas.reduce((acc, f) => acc + f.valor_global, 0);
  const saldoBodegas = filas.reduce((acc, f) => acc + Object.values(f.valores_bodega).reduce((a, v) => a + Number(v || 0), 0), 0);
  const brechaSaldo = saldoGeneral - saldoBodegas;

  const consolidadoBodegas = bodegas.map((b) => {
    const stock = filas.reduce((acc, f) => acc + Number(f.stocks_bodega[b.id] ?? 0), 0);
    const valor = filas.reduce((acc, f) => acc + Number(f.valores_bodega[b.id] || 0), 0);
    return { ...b, stock, valor };
  });

  const consolidadoTiendas = sucursales
    .filter((s) => !!s.bodega_id)
    .map((s) => {
      const bodegaId = Number(s.bodega_id);
      const stock = filas.reduce((acc, f) => acc + Number(f.stocks_bodega[bodegaId] ?? 0), 0);
      const valor = filas.reduce((acc, f) => acc + Number(f.valores_bodega[bodegaId] || 0), 0);
      return { id: s.id, nombre: s.nombre, bodega_id: bodegaId, stock, valor };
    });

  const fmtSaldo = (n: number) =>
    n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const colorDif = (d: number) => {
    if (Math.abs(d) < 0.001) return 'text-gray-500';
    return d > 0 ? 'text-yellow-400' : 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-mono">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white mb-1">Conciliación de Bodegas</h1>
        <p className="text-gray-500 text-xs">
          Compara el stock global de cada producto contra el desglose por bodega. Detecta diferencias y sincroniza.
        </p>
      </div>

      {/* Filtros y acciones */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="soloActivos"
            checked={soloActivos}
            onChange={(e) => setSoloActivos(e.target.checked)}
            className="accent-sky-500"
          />
          <label htmlFor="soloActivos" className="text-xs text-gray-400 cursor-pointer">Solo productos activos</label>
        </div>

        <button
          onClick={calcular}
          disabled={cargando || bodegas.length === 0}
          className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-bold text-white transition-colors"
        >
          {cargando ? 'Calculando...' : calculado ? 'Recalcular' : 'Calcular'}
        </button>

        {calculado && (
          <button
            onClick={exportar}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-600 px-4 py-2 rounded-lg text-xs font-medium text-gray-300 transition-colors"
          >
            Exportar Excel
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm mb-4">{error}</div>
      )}

      {bodegas.length === 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700/40 rounded-lg px-4 py-3 text-yellow-300 text-sm mb-4">
          No hay bodegas activas configuradas. Cree al menos una bodega para usar esta vista.
        </div>
      )}

      {/* Panel de bodegas con carga inicial */}
      {bodegas.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Bodegas activas</div>
          <div className="flex flex-wrap gap-3">
            {bodegas.map((b) => (
              <div key={b.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                <span className="text-sm text-white font-medium">{b.nombre}</span>
                {b.es_principal && <span className="text-xs text-sky-400">★ principal</span>}
                <button
                  onClick={() => dispararCargaInicial(b)}
                  disabled={cargaInicial.cargando}
                  title="Copiar stock global a esta bodega (solo productos sin registro previo)"
                  className="ml-1 text-xs bg-violet-900/50 hover:bg-violet-800/70 border border-violet-700/50 text-violet-300 px-2 py-0.5 rounded transition-colors disabled:opacity-40"
                >
                  {cargaInicial.cargando && cargaInicial.bodegaId === b.id ? 'Cargando...' : 'Carga inicial'}
                </button>
              </div>
            ))}
          </div>
          {cargaInicial.msg && (
            <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${cargaInicial.msg.startsWith('Error') ? 'bg-red-900/40 text-red-300 border border-red-700/50' : 'bg-green-900/40 text-green-300 border border-green-700/50'}`}>
              {cargaInicial.msg}
            </div>
          )}
        </div>
      )}

      {/* Resumen */}
      {calculado && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">{filas.length}</div>
            <div className="text-xs text-gray-500 mt-1">Productos totales</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="text-2xl font-bold text-green-400">{filas.length - totalDiferencias}</div>
            <div className="text-xs text-gray-500 mt-1">Con stock conciliado</div>
          </div>
          <div
            className="bg-gray-900 border rounded-xl p-4 cursor-pointer transition-colors hover:border-yellow-600"
            style={{ borderColor: totalDiferencias > 0 ? '#ca8a04' : '#374151' }}
            onClick={() => setFiltro(filtro === 'con_diferencia' ? 'todos' : 'con_diferencia')}
          >
            <div className="text-2xl font-bold text-yellow-400">{totalDiferencias}</div>
            <div className="text-xs text-gray-500 mt-1">Con diferencia ↗ filtrar</div>
          </div>
          <div
            className="bg-gray-900 border rounded-xl p-4 cursor-pointer transition-colors hover:border-red-600"
            style={{ borderColor: totalSinRegistro > 0 ? '#dc2626' : '#374151' }}
            onClick={() => setFiltro(filtro === 'sin_registro' ? 'todos' : 'sin_registro')}
          >
            <div className="text-2xl font-bold text-red-400">{totalSinRegistro}</div>
            <div className="text-xs text-gray-500 mt-1">Sin registro en bodega ↗ filtrar</div>
          </div>
        </div>
      )}

      {/* Barra de búsqueda y filtro activo */}
      {calculado && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Buscar por código o descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-sky-600"
          />
          {filtro !== 'todos' && (
            <button
              onClick={() => setFiltro('todos')}
              className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-600 px-3 py-2 rounded-lg text-gray-400 transition-colors"
            >
              ✕ Quitar filtro ({filtro === 'con_diferencia' ? 'Con diferencia' : 'Sin registro'})
            </button>
          )}
        </div>
      )}

      {calculado && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Consolidado General y Bodegas</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="text-[11px] text-gray-400">Saldo general</div>
                <div className="text-lg font-bold text-cyan-300">CRC {fmtSaldo(saldoGeneral)}</div>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="text-[11px] text-gray-400">Saldo bodegas</div>
                <div className="text-lg font-bold text-sky-300">CRC {fmtSaldo(saldoBodegas)}</div>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="text-[11px] text-gray-400">Brecha saldo</div>
                <div className={`text-lg font-bold ${Math.abs(brechaSaldo) < 0.01 ? 'text-green-400' : brechaSaldo > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                  CRC {fmtSaldo(brechaSaldo)}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-xs">
                <thead className="bg-gray-850 border-b border-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-400">Bodega</th>
                    <th className="px-3 py-2 text-right text-gray-400">Stock</th>
                    <th className="px-3 py-2 text-right text-gray-400">Saldo CRC</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidadoBodegas.map((b) => (
                    <tr key={b.id} className="border-b border-gray-800/50">
                      <td className="px-3 py-2 text-white">{b.nombre}{b.es_principal ? ' *' : ''}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{b.stock.toLocaleString('es-CR', { maximumFractionDigits: 4 })}</td>
                      <td className="px-3 py-2 text-right text-cyan-300">CRC {fmtSaldo(b.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Consolidado por Tiendas</div>
            {consolidadoTiendas.length === 0 ? (
              <div className="text-xs text-gray-500">
                No hay tiendas (sucursales POS) mapeadas a bodegas activas.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-xs">
                  <thead className="bg-gray-850 border-b border-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-400">Tienda</th>
                      <th className="px-3 py-2 text-left text-gray-400">Bodega</th>
                      <th className="px-3 py-2 text-right text-gray-400">Stock</th>
                      <th className="px-3 py-2 text-right text-gray-400">Saldo CRC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidadoTiendas.map((t) => (
                      <tr key={t.id} className="border-b border-gray-800/50">
                        <td className="px-3 py-2 text-white">{t.nombre}</td>
                        <td className="px-3 py-2 text-gray-300">{bodegas.find((b) => b.id === t.bodega_id)?.nombre || `Bodega ${t.bodega_id}`}</td>
                        <td className="px-3 py-2 text-right text-gray-300">{t.stock.toLocaleString('es-CR', { maximumFractionDigits: 4 })}</td>
                        <td className="px-3 py-2 text-right text-cyan-300">CRC {fmtSaldo(t.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabla */}
      {calculado && (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th className="text-left px-3 py-3 text-gray-400 font-semibold whitespace-nowrap">Código</th>
                <th className="text-left px-3 py-3 text-gray-400 font-semibold">Descripción</th>
                <th className="text-right px-3 py-3 text-gray-400 font-semibold whitespace-nowrap">Stock Global</th>
                {bodegas.map((b) => (
                  <th key={b.id} className="text-right px-3 py-3 font-semibold whitespace-nowrap" style={{ color: '#38bdf8' }}>
                    {b.nombre}{b.es_principal ? ' ★' : ''}
                  </th>
                ))}
                <th className="text-right px-3 py-3 text-gray-400 font-semibold whitespace-nowrap">Σ Bodegas</th>
                <th className="text-right px-3 py-3 text-gray-400 font-semibold whitespace-nowrap">Diferencia</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filasVista.length === 0 && (
                <tr>
                  <td colSpan={5 + bodegas.length} className="text-center py-12 text-gray-600">
                    {busqueda || filtro !== 'todos' ? 'Sin resultados para el filtro aplicado' : 'No hay productos'}
                  </td>
                </tr>
              )}
              {filasVista.map((f) => {
                const tieneDif = Math.abs(f.diferencia) > 0.001;
                const sinReg = bodegas.some((b) => f.stocks_bodega[b.id] === null && f.stock_global > 0);
                return (
                  <tr
                    key={f.producto_id}
                    className={`border-b border-gray-800/60 transition-colors hover:bg-gray-900/60 ${tieneDif ? 'bg-yellow-950/20' : ''}`}
                  >
                    <td className="px-3 py-2.5 text-gray-400 font-mono whitespace-nowrap">{f.codigo || '—'}</td>
                    <td className="px-3 py-2.5 text-white">
                      {f.descripcion}
                      {sinReg && <span className="ml-2 text-red-400 text-xs">⚠ sin registro</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-white font-semibold tabular-nums">
                      {f.stock_global.toLocaleString('es-CR', { maximumFractionDigits: 4 })}
                    </td>
                    {bodegas.map((b) => {
                      const val = f.stocks_bodega[b.id];
                      return (
                        <td key={b.id} className="px-3 py-2.5 text-right tabular-nums">
                          {val === null
                            ? <span className="text-gray-700">—</span>
                            : <span className={val > 0 ? 'text-sky-300' : 'text-gray-500'}>
                                {val.toLocaleString('es-CR', { maximumFractionDigits: 4 })}
                              </span>
                          }
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums">
                      {f.suma_bodegas.toLocaleString('es-CR', { maximumFractionDigits: 4 })}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${colorDif(f.diferencia)}`}>
                      {tieneDif
                        ? (f.diferencia > 0 ? '+' : '') + f.diferencia.toLocaleString('es-CR', { maximumFractionDigits: 4 })
                        : <span className="text-gray-700">0</span>
                      }
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {(tieneDif || sinReg) && (
                        <button
                          onClick={() => sincronizarProducto(f)}
                          disabled={sincronizando !== null}
                          title="Sincronizar: asignar stock global a bodega principal"
                          className="text-xs bg-yellow-900/40 hover:bg-yellow-800/60 border border-yellow-700/50 text-yellow-300 px-2 py-1 rounded transition-colors disabled:opacity-40"
                        >
                          {sincronizando === f.producto_id ? '...' : 'Sync'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda */}
      {calculado && bodegas.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
          <span>★ = Bodega principal</span>
          <span className="text-yellow-400">Amarillo = diferencia entre stock global y suma de bodegas</span>
          <span className="text-red-400">⚠ sin registro = producto con stock global pero sin registro en esa bodega</span>
          <span>Sync = distribuye el stock global completo a la bodega principal</span>
        </div>
      )}
    </div>
  );
}
