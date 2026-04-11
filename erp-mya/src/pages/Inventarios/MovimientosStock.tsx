import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

interface Props {
  empresaId: number;
}

type TipoMov = 'entrada' | 'salida' | 'ajuste';
type Origen  = 'ajuste' | 'fe' | 'xml' | 'sistema';

interface Movimiento {
  id: number;
  fecha: string;
  tipo: TipoMov;
  origen: Origen;
  cantidad: number;
  costo_unitario: number;
  referencia: string | null;
  notas: string | null;
  created_at: string;
  inv_productos: { descripcion: string; unidad_medida: string; codigo: string | null } | null;
}

interface ProductoBasico {
  id: number;
  descripcion: string;
  codigo: string | null;
  unidad_medida: string;
  stock_actual: number;
}

interface CuentaContable {
  id: number;
  codigo: string;
  nombre: string;
}

interface FormData {
  producto_id: string;
  cantidad: string;   // positivo = aumenta, negativo = reduce
  costo_unitario: string;
  cuenta_ajuste_id: string;
  referencia: string;
  notas: string;
}

const FORM_VACIO: FormData = {
  producto_id: '',
  cantidad: '',
  costo_unitario: '',
  cuenta_ajuste_id: '',
  referencia: '',
  notas: '',
};

const TIPO_CONFIG: Record<TipoMov, { label: string; color: string; bg: string; icon: string }> = {
  entrada: { label: 'Entrada',  color: 'text-green-400',  bg: 'bg-green-900',  icon: '↑' },
  salida:  { label: 'Salida',   color: 'text-red-400',    bg: 'bg-red-900',    icon: '↓' },
  ajuste:  { label: 'Ajuste',   color: 'text-yellow-400', bg: 'bg-yellow-900', icon: '≈' },
};

const ORIGEN_CONFIG: Record<Origen, { label: string; color: string }> = {
  xml:     { label: 'XML compra',  color: 'text-blue-400' },
  fe:      { label: 'FE emitida',  color: 'text-purple-400' },
  ajuste:  { label: 'Ajuste',      color: 'text-yellow-400' },
  sistema: { label: 'Sistema',     color: 'text-gray-400' },
};

export default function MovimientosStock({ empresaId }: Props) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [productos, setProductos]     = useState<ProductoBasico[]>([]);
  const [cuentas, setCuentas]         = useState<CuentaContable[]>([]);
  const [busqCuenta, setBusqCuenta]   = useState('');
  const [cargando, setCargando]       = useState(true);
  const [modal, setModal]             = useState(false);
  const [form, setForm]               = useState<FormData>(FORM_VACIO);
  const [guardando, setGuardando]     = useState(false);
  const [error, setError]             = useState('');
  const [busqProd, setBusqProd]       = useState('');
  const [filtroTipo, setFiltroTipo]   = useState('');
  const [filtroOrigen, setFiltroOrigen] = useState('');
  const [filtroProd, setFiltroProd]   = useState('');
  const [fechaDesde, setFechaDesde]   = useState('');
  const [fechaHasta, setFechaHasta]   = useState('');
  const [orden, setOrden]             = useState<{ col: string; asc: boolean }>({ col: 'fecha', asc: false });

  const prodSeleccionado = productos.find(p => p.id === Number(form.producto_id));

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from('inv_movimientos')
      .select('*, inv_productos(descripcion, unidad_medida, codigo)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(300);
    setMovimientos((data as Movimiento[]) || []);

    const { data: prods } = await supabase
      .from('inv_productos')
      .select('id, descripcion, codigo, unidad_medida, stock_actual')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .eq('tipo', 'producto')
      .order('descripcion');
    setProductos(prods || []);

    const { data: ctas } = await supabase
      .from('plan_cuentas_empresa')
      .select('cuenta_id, plan_cuentas(id, codigo, nombre)')
      .eq('empresa_id', empresaId)
      .order('plan_cuentas(codigo)');
    setCuentas(
      (ctas || [])
        .map((c: any) => c.plan_cuentas)
        .filter(Boolean)
        .sort((a: any, b: any) => a.codigo.localeCompare(b.codigo))
    );
    setCargando(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirModal = () => {
    setForm(FORM_VACIO);
    setBusqProd('');
    setBusqCuenta('');
    setError('');
    setModal(true);
  };

  const set = (field: keyof FormData, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const guardar = async () => {
    if (!form.producto_id) { setError('Seleccione un producto.'); return; }
    const cant = parseFloat(form.cantidad);
    if (!cant || cant === 0) { setError('La cantidad debe ser distinta de cero.'); return; }

    setGuardando(true);
    setError('');

    const { data, error: err } = await supabase.rpc('registrar_ajuste_inventario', {
      p_empresa_id:       empresaId,
      p_producto_id:      Number(form.producto_id),
      p_cantidad:         cant,
      p_costo_unitario:   parseFloat(form.costo_unitario) || 0,
      p_referencia:       form.referencia.trim() || null,
      p_notas:            form.notas.trim() || null,
      p_cuenta_ajuste_id: form.cuenta_ajuste_id ? Number(form.cuenta_ajuste_id) : null,
    });

    if (err || !data?.ok) { setError(err?.message || data?.error || 'Error'); setGuardando(false); return; }
    await cargar();
    setModal(false);
    setGuardando(false);
  };

  const toggleOrden = (col: string) =>
    setOrden(prev => prev.col === col ? { col, asc: !prev.asc } : { col, asc: true });

  const filtrados = movimientos
    .filter(m => {
      if (filtroTipo   && m.tipo   !== filtroTipo)   return false;
      if (filtroOrigen && m.origen !== filtroOrigen) return false;
      if (filtroProd) {
        const q = filtroProd.toLowerCase();
        const enDesc   = m.inv_productos?.descripcion.toLowerCase().includes(q);
        const enCodigo = m.inv_productos?.codigo?.toLowerCase().includes(q);
        if (!enDesc && !enCodigo) return false;
      }
      if (fechaDesde && m.fecha < fechaDesde) return false;
      if (fechaHasta && m.fecha > fechaHasta) return false;
      return true;
    })
    .sort((a, b) => {
      let va: any, vb: any;
      if (orden.col === 'fecha')       { va = a.fecha;       vb = b.fecha; }
      else if (orden.col === 'tipo')   { va = a.tipo;        vb = b.tipo; }
      else if (orden.col === 'origen') { va = a.origen;      vb = b.origen; }
      else if (orden.col === 'prod')   { va = a.inv_productos?.codigo ?? a.inv_productos?.descripcion ?? ''; vb = b.inv_productos?.codigo ?? b.inv_productos?.descripcion ?? ''; }
      else if (orden.col === 'cant')   { va = a.cantidad;    vb = b.cantidad; }
      else if (orden.col === 'costo')  { va = a.costo_unitario; vb = b.costo_unitario; }
      else if (orden.col === 'ref')    { va = a.referencia ?? ''; vb = b.referencia ?? ''; }
      else return 0;
      if (va < vb) return orden.asc ? -1 : 1;
      if (va > vb) return orden.asc ?  1 : -1;
      return 0;
    });

  const prodsFiltrados = busqProd.trim()
    ? productos.filter(p =>
        p.descripcion.toLowerCase().includes(busqProd.toLowerCase()) ||
        (p.codigo || '').toLowerCase().includes(busqProd.toLowerCase())
      )
    : productos;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">🔄 Movimientos de Stock</h1>
          <p className="text-gray-400 text-sm mt-1">
            {filtrados.length} registros — entradas desde XML, salidas desde FE, ajustes manuales
          </p>
        </div>
        {/* Botón de ajuste movido al tab Ajuste */}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={filtroProd}
          onChange={e => setFiltroProd(e.target.value)}
          placeholder="Buscar producto..."
          className="flex-1 min-w-40 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">Todos los tipos</option>
          <option value="entrada">Entradas</option>
          <option value="salida">Salidas</option>
          <option value="ajuste">Ajustes</option>
        </select>
        <select value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">Todos los orígenes</option>
          <option value="xml">XML compra</option>
          <option value="fe">FE emitida</option>
          <option value="ajuste">Ajuste manual</option>
          <option value="sistema">Sistema</option>
        </select>
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="text-gray-500 text-center py-16">Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-gray-600 text-center py-16">
          {movimientos.length === 0
            ? 'Sin movimientos. Se generarán automáticamente al procesar XML y FE.'
            : 'Sin resultados para los filtros.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-xs">
            <thead className="bg-gray-900 text-gray-400 border-b border-gray-700">
              <tr>
                {([
                  { col: 'fecha',  label: 'Fecha',       align: 'left'  },
                  { col: 'tipo',   label: 'Tipo',        align: 'left'  },
                  { col: 'origen', label: 'Origen',      align: 'left'  },
                  { col: 'prod',   label: 'Producto',    align: 'left'  },
                  { col: 'cant',   label: 'Cantidad',    align: 'right' },
                  { col: 'costo',  label: 'Costo unit.', align: 'right' },
                  { col: 'ref',    label: 'Referencia',  align: 'left'  },
                  { col: '',       label: 'Notas',       align: 'left'  },
                ] as { col: string; label: string; align: string }[]).map(({ col, label, align }) => (
                  <th key={col || label}
                    className={`px-3 py-3 text-${align} ${col ? 'cursor-pointer select-none hover:text-white' : ''}`}
                    onClick={() => col && toggleOrden(col)}>
                    {label}
                    {col && orden.col === col && (
                      <span className="ml-1 text-green-400">{orden.asc ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m, i) => {
                const tc = TIPO_CONFIG[m.tipo];
                const oc = ORIGEN_CONFIG[m.origen] ?? ORIGEN_CONFIG.sistema;
                return (
                  <tr key={m.id} className={`border-b border-gray-700 hover:bg-gray-800 ${i % 2 === 0 ? '' : 'bg-gray-850'}`}>
                    <td className="px-3 py-2.5 text-gray-400 font-mono">{m.fecha}</td>
                    <td className="px-3 py-2.5">
                      <span className={`${tc.bg} ${tc.color} px-2 py-0.5 rounded text-xs font-bold`}>
                        {tc.icon} {tc.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-xs ${oc.color}`}>{oc.label}</td>
                    <td className="px-3 py-2.5">
                      {m.inv_productos ? (
                        <div className="flex flex-col">
                          {m.inv_productos.codigo && (
                            <span className="font-mono text-xs text-blue-400">{m.inv_productos.codigo}</span>
                          )}
                          <span className="text-gray-200">{m.inv_productos.descripcion}</span>
                        </div>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${m.cantidad >= 0 ? tc.color : 'text-red-400'}`}>
                      {m.cantidad >= 0 ? '+' : ''}{m.cantidad.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                      {' '}<span className="text-gray-600 font-normal">{m.inv_productos?.unidad_medida}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-300">
                      {m.costo_unitario > 0
                        ? m.costo_unitario.toLocaleString('es-CR', { minimumFractionDigits: 2 })
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-blue-400 font-mono">{m.referencia || <span className="text-gray-600">—</span>}</td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-xs truncate">{m.notas || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal ajuste manual — desactivado, usar tab Ajuste */}
      {false && modal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 border border-gray-600 rounded-xl w-full max-w-lg my-4">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold text-lg">≈ Ajuste de Stock</h2>
                <p className="text-gray-500 text-xs mt-0.5">Use cantidad positiva para aumentar o negativa para reducir</p>
              </div>
              <button onClick={() => setModal(false)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Buscador de producto */}
              <div>
                <label className="block text-gray-400 text-xs mb-1">Producto <span className="text-red-400">*</span></label>
                <input
                  value={busqProd}
                  onChange={e => { setBusqProd(e.target.value); set('producto_id', ''); }}
                  placeholder="Buscar por nombre o código..."
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-yellow-500 mb-1"
                />
                {(busqProd || !form.producto_id) && (
                  <div className="bg-gray-900 border border-gray-700 rounded max-h-40 overflow-y-auto">
                    {prodsFiltrados.length === 0 ? (
                      <p className="text-gray-500 text-xs text-center py-3">Sin resultados</p>
                    ) : prodsFiltrados.slice(0, 30).map(p => (
                      <button key={p.id} type="button"
                        onClick={() => { set('producto_id', String(p.id)); setBusqProd(p.descripcion); }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700 transition-colors flex justify-between items-center ${
                          form.producto_id === String(p.id) ? 'bg-yellow-900 text-yellow-200' : 'text-gray-200'
                        }`}>
                        <span>
                          {p.descripcion}
                          {p.codigo && <span className="text-gray-500 ml-1">({p.codigo})</span>}
                        </span>
                        <span className={`font-mono ml-2 flex-shrink-0 ${p.stock_actual <= 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {p.stock_actual.toLocaleString('es-CR', { minimumFractionDigits: 2 })} {p.unidad_medida}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {prodSeleccionado && (
                  <div className="mt-2 flex gap-3 text-xs bg-gray-900 rounded px-3 py-2">
                    <span className="text-gray-500">Stock actual:</span>
                    <span className={`font-mono font-bold ${prodSeleccionado!.stock_actual <= 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {prodSeleccionado!.stock_actual.toLocaleString('es-CR', { minimumFractionDigits: 2 })} {prodSeleccionado!.unidad_medida}
                    </span>
                    {form.cantidad && parseFloat(form.cantidad) !== 0 && (
                      <>
                        <span className="text-gray-600">→</span>
                        <span className="font-mono font-bold text-blue-400">
                          {(prodSeleccionado!.stock_actual + parseFloat(form.cantidad)).toLocaleString('es-CR', { minimumFractionDigits: 2 })} {prodSeleccionado!.unidad_medida}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Cantidad + Costo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">
                    Cantidad <span className="text-red-400">*</span>
                    <span className="text-gray-500 ml-1">+ aumenta · − reduce</span>
                  </label>
                  <input type="number" step="any"
                    value={form.cantidad}
                    onChange={e => set('cantidad', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-right focus:outline-none focus:border-yellow-500"
                    placeholder="Ej: 10 ó -5"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">
                    Costo unitario (CRC)
                    <span className="text-gray-600 ml-1">para asiento</span>
                  </label>
                  <input type="number" min="0" step="0.01"
                    value={form.costo_unitario}
                    onChange={e => set('costo_unitario', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-right focus:outline-none focus:border-yellow-500"
                    placeholder={prodSeleccionado ? `Prom: ${prodSeleccionado!.stock_actual}` : '0.00'}
                  />
                </div>
              </div>

              {/* Cuenta de ajuste */}
              <div>
                <label className="block text-gray-400 text-xs mb-1">
                  Cuenta contable de ajuste
                  <span className="text-gray-600 ml-1">(contrapartida del asiento)</span>
                </label>
                <input
                  value={busqCuenta}
                  onChange={e => { setBusqCuenta(e.target.value); set('cuenta_ajuste_id', ''); }}
                  placeholder="Buscar por código o nombre..."
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-yellow-500 mb-1"
                />
                {(busqCuenta || !form.cuenta_ajuste_id) && busqCuenta.length > 0 && (
                  <div className="bg-gray-900 border border-gray-700 rounded max-h-36 overflow-y-auto">
                    {cuentas
                      .filter(c =>
                        c.codigo.includes(busqCuenta) ||
                        c.nombre.toLowerCase().includes(busqCuenta.toLowerCase())
                      )
                      .slice(0, 20)
                      .map(c => (
                        <button key={c.id} type="button"
                          onClick={() => {
                            set('cuenta_ajuste_id', String(c.id));
                            setBusqCuenta(`${c.codigo} — ${c.nombre}`);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700 transition-colors flex gap-3 ${
                            form.cuenta_ajuste_id === String(c.id) ? 'bg-yellow-900 text-yellow-200' : 'text-gray-200'
                          }`}>
                          <span className="font-mono text-blue-400 flex-shrink-0">{c.codigo}</span>
                          <span>{c.nombre}</span>
                        </button>
                      ))
                    }
                  </div>
                )}
                {!form.cuenta_ajuste_id && (
                  <p className="text-gray-600 text-xs mt-0.5">Sin seleccionar — usará el parámetro de empresa si está configurado</p>
                )}
              </div>

              {/* Referencia */}
              <div>
                <label className="block text-gray-400 text-xs mb-1">Referencia / Motivo</label>
                <input
                  value={form.referencia}
                  onChange={e => set('referencia', e.target.value)}
                  placeholder="Ej: Inventario físico marzo, Merma, Corrección..."
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              {/* Notas */}
              <div>
                <label className="block text-gray-400 text-xs mb-1">Notas</label>
                <textarea
                  value={form.notas}
                  onChange={e => set('notas', e.target.value)}
                  rows={2}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-yellow-500 resize-none"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button onClick={() => setModal(false)}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                className="bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-medium transition-colors">
                {guardando ? 'Guardando...' : 'Registrar ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
