// ============================================================
// MYA ERP — Listado de Ajustes de Inventario
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { formatMoneyCRC } from '../../utils/reporting';

interface Props {
  empresaId: number;
  onNuevoAjuste: () => void;
  onVerKardex: (productoId: number) => void;
}

interface MovAjuste {
  id: number;
  fecha: string;
  producto_id: number;
  producto_desc: string;
  cantidad: number;
  costo_unitario: number;
  referencia: string | null;
  notas: string | null;
  asiento_id: number | null;
}

interface LineaAsiento {
  debito: number;
  credito: number;
  descripcion: string;
  codigo: string;
  nombre: string;
}

interface AsientoDetalle {
  id: number;
  numero_formato: string;
  fecha: string;
  descripcion: string;
  lineas: LineaAsiento[];
}

export default function ListadoAjustes({ empresaId, onNuevoAjuste, onVerKardex }: Props) {
  const [movimientos, setMovimientos] = useState<MovAjuste[]>([]);
  const [cargando, setCargando]       = useState(true);
  const [fechaDesde, setFechaDesde]   = useState('');
  const [fechaHasta, setFechaHasta]   = useState('');
  const [busqueda, setBusqueda]       = useState('');
  const [modalAsiento, setModalAsiento] = useState<AsientoDetalle | null>(null);
  const [cargandoAsiento, setCargandoAsiento] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    let q = supabase
      .from('inv_movimientos')
      .select(`id, fecha, producto_id, cantidad, costo_unitario, referencia, notas, asiento_id,
               inv_productos!inner(descripcion)`)
      .eq('empresa_id', empresaId)
      .eq('tipo', 'ajuste')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    if (fechaDesde) q = q.gte('fecha', fechaDesde);
    if (fechaHasta) q = q.lte('fecha', fechaHasta);

    const { data } = await q;
    setMovimientos((data || []).map((r: any) => ({
      id:            r.id,
      fecha:         r.fecha,
      producto_id:   r.producto_id,
      producto_desc: r.inv_productos?.descripcion || '—',
      cantidad:      Number(r.cantidad),
      costo_unitario: Number(r.costo_unitario),
      referencia:    r.referencia,
      notas:         r.notas,
      asiento_id:    r.asiento_id || null,
    })));
    setCargando(false);
  }, [empresaId, fechaDesde, fechaHasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const verAsiento = async (asientoId: number) => {
    setCargandoAsiento(true);
    const { data: a } = await supabase.from('asientos')
      .select('id, numero_formato, fecha, descripcion').eq('id', asientoId).single();
    const { data: lineas } = await supabase.from('asiento_lineas')
      .select(`debito_crc, credito_crc, descripcion, plan_cuentas_base(codigo, nombre)`)
      .eq('asiento_id', asientoId).order('linea');
    setCargandoAsiento(false);
    if (!a) return;
    setModalAsiento({
      id: a.id,
      numero_formato: a.numero_formato,
      fecha: a.fecha,
      descripcion: a.descripcion,
      lineas: (lineas || []).map((l: any) => ({
        debito:      Number(l.debito_crc  || 0),
        credito:     Number(l.credito_crc || 0),
        descripcion: l.descripcion,
        codigo: l.plan_cuentas_base?.codigo || '',
        nombre: l.plan_cuentas_base?.nombre || '',
      })),
    });
  };

  const fmtFecha = (f: string) => { const [y, m, d] = f.split('-'); return `${d}/${m}/${y}`; };

  const filtrados = busqueda.trim()
    ? movimientos.filter(m =>
        m.producto_desc.toLowerCase().includes(busqueda.toLowerCase()) ||
        (m.referencia || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (m.notas || '').toLowerCase().includes(busqueda.toLowerCase())
      )
    : movimientos;

  let lastGroup = '';

  return (
    <div className="p-6 min-h-screen" style={{ background: 'var(--bg-dark)' }}>
      {/* Encabezado */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Ajustes de Inventario</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--gray-400)' }}>
            Doble clic en una línea para ver el Kardex del artículo
          </p>
        </div>
        <button onClick={onNuevoAjuste}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: 'var(--green-main)' }}>
          ＋ Nuevo ajuste
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gray-500" />
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gray-500" />
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar artículo / referencia..."
          className="flex-1 min-w-[220px] bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500" />
        <button onClick={cargar}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors">
          ↺ Actualizar
        </button>
      </div>

      {/* Tabla */}
      <div className="text-xs mb-2 md:hidden" style={{ color: 'var(--gray-500)' }}>Desliza horizontalmente para revisar cantidades, costos y asiento.</div>
      <div className="rounded-xl overflow-hidden border border-gray-800 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-700" style={{ background: 'var(--bg-dark2)' }}>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--gray-400)' }}>Fecha</th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--gray-400)' }}>Referencia</th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--gray-400)' }}>Artículo</th>
              <th className="px-4 py-2.5 font-medium text-right" style={{ color: 'var(--gray-400)' }}>Cantidad</th>
              <th className="px-4 py-2.5 font-medium text-right" style={{ color: 'var(--gray-400)' }}>Costo Unit.</th>
              <th className="px-4 py-2.5 font-medium text-right" style={{ color: 'var(--gray-400)' }}>Monto</th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--gray-400)' }}>Notas</th>
              <th className="px-4 py-2.5 font-medium text-center" style={{ color: 'var(--gray-400)' }}>Asiento</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr><td colSpan={8} className="text-center py-12" style={{ color: 'var(--gray-400)' }}>Cargando...</td></tr>
            )}
            {!cargando && filtrados.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12" style={{ color: 'var(--gray-400)' }}>Sin ajustes registrados</td></tr>
            )}
            {!cargando && filtrados.map(m => {
              const grupo = `${m.fecha}|${m.referencia || ''}`;
              const esNuevoGrupo = grupo !== lastGroup;
              lastGroup = grupo;
              const monto = Math.abs(m.cantidad) * m.costo_unitario;

              return (
                <tr key={m.id}
                  onDoubleClick={() => onVerKardex(m.producto_id)}
                  className="border-b border-gray-800 cursor-pointer transition-colors"
                  style={{ background: esNuevoGrupo ? 'transparent' : 'var(--bg-dark2)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = esNuevoGrupo ? 'transparent' : 'var(--bg-dark2)')}
                  title="Doble clic para ver Kardex">
                  <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{m.referencia || <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-2.5 text-white">{m.producto_desc}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${m.cantidad >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {m.cantidad >= 0 ? '+' : ''}{m.cantidad.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-300">{formatMoneyCRC(m.costo_unitario)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-200">{formatMoneyCRC(monto)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[180px] truncate">{m.notas || '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {m.asiento_id
                      ? <button
                          onClick={e => { e.stopPropagation(); verAsiento(m.asiento_id!); }}
                          className="text-xs px-2 py-0.5 rounded border transition-colors hover:text-white"
                          style={{ borderColor: 'var(--green-dim)', color: 'var(--green-dim)' }}>
                          Ver
                        </button>
                      : <span className="text-gray-700 text-xs">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!cargando && filtrados.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--bg-dark2)' }}>
                <td colSpan={5} className="px-4 py-2 text-xs" style={{ color: 'var(--gray-400)' }}>
                  {filtrados.length} movimiento{filtrados.length !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-2 text-right font-mono font-semibold text-white">
                  {formatMoneyCRC(filtrados.reduce((s, m) => s + Math.abs(m.cantidad) * m.costo_unitario, 0))}
                </td>
                <td /><td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal asiento */}
      {(modalAsiento || cargandoAsiento) && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[300] p-4"
          onClick={() => setModalAsiento(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl shadow-2xl"
            onClick={e => e.stopPropagation()}>
            {cargandoAsiento
              ? <div className="p-10 text-center text-gray-500">Cargando...</div>
              : modalAsiento && <>
                  <div className="px-5 py-3.5 border-b border-gray-700 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{modalAsiento.numero_formato}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{modalAsiento.descripcion}</p>
                    </div>
                    <button onClick={() => setModalAsiento(null)}
                      className="text-gray-500 hover:text-white text-xl leading-none">×</button>
                  </div>
                  <div className="p-4">
                    <div className="text-xs mb-2 md:hidden text-gray-500">Desliza horizontalmente para revisar el asiento completo.</div>
                    <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs border-b border-gray-800">
                          <th className="pb-2 text-left font-medium text-gray-500">Cuenta</th>
                          <th className="pb-2 text-right font-medium text-gray-500">Débito</th>
                          <th className="pb-2 text-right font-medium text-gray-500">Crédito</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalAsiento.lineas.map((l, i) => (
                          <tr key={i} className="border-b border-gray-800">
                            <td className="py-2">
                              <span className="font-mono text-xs text-gray-500 mr-2">{l.codigo}</span>
                              <span className="text-gray-200">{l.nombre}</span>
                            </td>
                            <td className="py-2 text-right font-mono text-green-400">
                              {l.debito > 0 ? formatMoneyCRC(l.debito) : ''}
                            </td>
                            <td className="py-2 text-right font-mono text-red-400">
                              {l.credito > 0 ? formatMoneyCRC(l.credito) : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-700">
                          <td className="pt-2 text-xs text-gray-500">Total</td>
                          <td className="pt-2 text-right font-mono font-semibold text-white">
                            {formatMoneyCRC(modalAsiento.lineas.reduce((s, l) => s + l.debito, 0))}
                          </td>
                          <td className="pt-2 text-right font-mono font-semibold text-white">
                            {formatMoneyCRC(modalAsiento.lineas.reduce((s, l) => s + l.credito, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                  </div>
                </>
            }
          </div>
        </div>
      )}
    </div>
  );
}
