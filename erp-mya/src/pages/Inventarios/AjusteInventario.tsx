// ============================================================
// MYA ERP - Ajuste de Inventario
// Grilla de dos columnas (Entrada | Salida), asiento neto
// Costo promedio a la fecha del documento
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';
import { ModalSeleccionCuenta } from '../../components/ModalSeleccionCuenta';
import { formatMoneyCRC, roundMoney } from '../../utils/reporting';

interface Props { empresaId: number; onVolver?: () => void; }

interface Producto {
  id: number;
  codigo: string | null;
  descripcion: string;
  unidad_medida: string;
  costo_promedio: number;
  cuenta_inventario_id: number | null;
}

interface AjusteLinea {
  _key: string;
  producto_id: number | null;
  cuenta_inventario_id?: number | null;
  codigo: string;
  descripcion: string;
  unidad: string;
  costo_fecha: number;
  costo_origen?: 'historial' | 'actual';
  entrada: number;
  salida: number;
  estado: 'pendiente' | 'ok' | 'error';
  error_msg?: string;
  mov_id?: number | null;
  asiento_rpc_id?: number | null;
  asiento_rpc_num?: string;
}

interface CuentaDisp { id: number; codigo: string; nombre: string; cuenta_base_id: number | null; }

const lineaVacia = (): AjusteLinea => ({
  _key: Math.random().toString(36).slice(2),
  producto_id: null, cuenta_inventario_id: null, codigo: '', descripcion: '', unidad: '',
  costo_fecha: 0, costo_origen: 'actual', entrada: 0, salida: 0, estado: 'pendiente',
});

export default function AjusteInventario({ empresaId, onVolver }: Props) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

  // Encabezado del ajuste
  const [fecha, setFecha]           = useState(hoy);
  const [referencia, setReferencia] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [cuentaAjusteId, setCuentaAjusteId]   = useState<number | null>(null);
  const [bodegaId, setBodegaId] = useState<number | null>(null);
  const [bodegas, setBodegas] = useState<{ id: number; nombre: string }[]>([]);
  const [cuentaInventarioDefaultId, setCuentaInventarioDefaultId] = useState<number | null>(null);
  const [cuentaAjusteLabel, setCuentaAjusteLabel] = useState('');
  const [categoriaId, setCategoriaId]   = useState<number | null>(null);
  // Filas
  const [filas, setFilas]           = useState<AjusteLinea[]>([lineaVacia(), lineaVacia(), lineaVacia()]);

  // Estado de proceso
  const [confirmando, setConfirmando] = useState(false);
  const [procesando, setProcesando]   = useState(false);
  const [aplicado, setAplicado]       = useState(false);
  const [asientoInfo, setAsientoInfo] = useState<{ id: number | null; numero: string; con_asiento: boolean } | null>(null);
  const [asientoError, setAsientoError] = useState<string | null>(null);

  // Catalogos
  const [cuentasDisp, setCuentasDisp]     = useState<CuentaDisp[]>([]);

  // Modales
  const [modalCuenta, setModalCuenta]     = useState(false);
  const [modalProductoIdx, setModalProductoIdx] = useState<number | null>(null);
  const [busqProd, setBusqProd]           = useState('');
  const [prodResultados, setProdResultados] = useState<Producto[]>([]);
  const [catalogoInicial, setCatalogoInicial] = useState<Producto[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [editandoCampo, setEditandoCampo] = useState<string | null>(null);
  const [valorTemporal, setValorTemporal] = useState('');
  const inputBusqRef = useRef<HTMLInputElement>(null);
  const cantidadRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const resolverCuentaEmpresa = (valor: number | null | undefined, cuentasList: CuentaDisp[]) => {
    const raw = Number(valor || 0);
    if (!raw) return null;
    return cuentasList.find((c) => c.id === raw)
      || cuentasList.find((c) => Number(c.cuenta_base_id || 0) === raw)
      || null;
  };

  useEffect(() => {
    Promise.all([
      supabase.from('plan_cuentas_empresa')
        .select('id, codigo, nombre, cuenta_base_id')
        .eq('empresa_id', empresaId).eq('activo', true).order('codigo'),
      supabase.from('empresa_config_inventario')
        .select('cuenta_ajuste_inv_id, cuenta_inventario_id').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('asiento_categorias').select('id').eq('codigo', 'AI').single(),
    ]).then(([cuentasRes, cfgRes, categoriaRes]) => {
      const cuentasList = (cuentasRes.data || []) as CuentaDisp[];
      setCuentasDisp(cuentasList);
      if (categoriaRes.data) setCategoriaId((categoriaRes.data as any).id);

      const data = cfgRes.data as any;
      const cuentaInventarioDefault = resolverCuentaEmpresa(data?.cuenta_inventario_id, cuentasList);
      const cuentaAjuste = resolverCuentaEmpresa(data?.cuenta_ajuste_inv_id, cuentasList);
      setCuentaInventarioDefaultId(cuentaInventarioDefault?.id || null);
      setCuentaAjusteId(cuentaAjuste?.id || null);
      setCuentaAjusteLabel(cuentaAjuste ? `${cuentaAjuste.codigo} ${cuentaAjuste.nombre}` : '');
    });
    supabase.from('inv_bodegas').select('id, nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre')
      .then(({ data }) => setBodegas(data || []));
  }, [empresaId]);

  useEffect(() => {
    if (modalProductoIdx === null) { setBusqProd(''); setProdResultados([]); return; }
    setTimeout(() => inputBusqRef.current?.focus(), 50);
  }, [modalProductoIdx]);

  useEffect(() => {
    if (modalProductoIdx === null) return;
    let cancelado = false;

    const cargarCatalogoInicial = async () => {
      setCargandoCatalogo(true);
      const { data } = await supabase
        .from('inv_productos')
        .select('id, codigo, descripcion, unidad_medida, costo_promedio, cuenta_inventario_id')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .eq('tipo', 'producto')
        .order('codigo', { ascending: true, nullsFirst: false })
        .order('descripcion', { ascending: true })
        .limit(60);

      if (!cancelado) {
        setCatalogoInicial(data || []);
        setCargandoCatalogo(false);
      }
    };

    cargarCatalogoInicial();
    return () => { cancelado = true; };
  }, [empresaId, modalProductoIdx]);

  // Helpers
  const patchLinea = (idx: number, patch: Partial<AjusteLinea>) =>
    setFilas(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));

  const campoCantidadId = (idx: number, campo: 'entrada' | 'salida') => `${idx}:${campo}`;

  const setCantidadRef = (idx: number, campo: 'entrada' | 'salida', el: HTMLInputElement | null) => {
    cantidadRefs.current[campoCantidadId(idx, campo)] = el;
  };

  const normalizarCantidad = (raw: string) => {
    const limpio = raw.trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/[^0-9.-]/g, '');
    if (!limpio || limpio === '.' || limpio === '-' || limpio === '-.') return 0;
    const partes = limpio.split('.');
    const consolidado = partes.length > 1
      ? `${partes.shift()}.${partes.join('')}`
      : limpio;
    const numero = Number(consolidado);
    if (!Number.isFinite(numero)) return 0;
    return Math.round(numero * 1000) / 1000;
  };

  const iniciarEdicionCantidad = (
    idx: number,
    campo: 'entrada' | 'salida',
    valor: number,
    input: HTMLInputElement,
  ) => {
    setEditandoCampo(campoCantidadId(idx, campo));
    setValorTemporal(valor ? valor.toFixed(3) : '');
    requestAnimationFrame(() => input.select());
  };

  const confirmarEdicionCantidad = (idx: number, campo: 'entrada' | 'salida') => {
    const id = campoCantidadId(idx, campo);
    const valorConfirmado = editandoCampo === id ? normalizarCantidad(valorTemporal) : filas[idx]?.[campo] || 0;
    const patch: Partial<AjusteLinea> = { [campo]: valorConfirmado } as Partial<AjusteLinea>;
    if (campo === 'entrada' && valorConfirmado > 0) patch.salida = 0;
    if (campo === 'salida' && valorConfirmado > 0) patch.entrada = 0;
    patchLinea(idx, patch);
    setEditandoCampo(null);
    setValorTemporal('');
    return valorConfirmado;
  };

  const valorVisibleCantidad = (idx: number, campo: 'entrada' | 'salida', valor: number) => {
    const id = campoCantidadId(idx, campo);
    if (editandoCampo === id) return valorTemporal;
    return valor ? valor.toFixed(3) : '';
  };

  const enfocarCantidad = (idx: number, campo: 'entrada' | 'salida') => {
    requestAnimationFrame(() => {
      const input = cantidadRefs.current[campoCantidadId(idx, campo)];
      input?.focus();
      input?.select();
    });
  };

  const avanzarDespuesDeCantidad = (idx: number, campo: 'entrada' | 'salida', valorConfirmado: number) => {
    if (campo === 'entrada' && valorConfirmado <= 0 && !(filas[idx]?.salida > 0)) {
      enfocarCantidad(idx, 'salida');
      return;
    }

    const siguienteIdx = idx + 1;
    if (siguienteIdx >= filas.length) {
      setFilas(prev => [...prev, lineaVacia()]);
      setTimeout(() => enfocarCantidad(siguienteIdx, 'entrada'), 0);
      return;
    }
    enfocarCantidad(siguienteIdx, 'entrada');
  };

  const buscarProductos = async (q: string) => {
    setBusqProd(q);
    if (q.trim().length < 2) { setProdResultados([]); return; }
    const { data } = await supabase.from('inv_productos')
      .select('id, codigo, descripcion, unidad_medida, costo_promedio, cuenta_inventario_id')
      .eq('empresa_id', empresaId).eq('activo', true).eq('tipo', 'producto')
      .or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%`)
      .order('descripcion').limit(30);
    setProdResultados(data || []);
  };

  const obtenerCostoAFecha = async (productoId: number): Promise<{ valor: number; origen: 'historial' | 'actual' }> => {
    const { data } = await supabase
      .from('inv_movimientos')
      .select('costo_promedio_resultante')
      .eq('empresa_id', empresaId)
      .eq('producto_id', productoId)
      .lte('fecha', fecha)
      .not('costo_promedio_resultante', 'is', null)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
    const valor = Number((data as any)?.[0]?.costo_promedio_resultante || 0);
    if (valor > 0) return { valor, origen: 'historial' };
    const { data: producto } = await supabase
      .from('inv_productos')
      .select('costo_promedio')
      .eq('empresa_id', empresaId)
      .eq('id', productoId)
      .maybeSingle();
    return { valor: Number((producto as any)?.costo_promedio || 0), origen: 'actual' };
  };

  const seleccionarProducto = async (idx: number, p: Producto) => {
    setModalProductoIdx(null);
    const costoInfo = await obtenerCostoAFecha(p.id);
    patchLinea(idx, {
      producto_id: p.id,
      cuenta_inventario_id: p.cuenta_inventario_id || null,
      codigo: p.codigo || '',
      descripcion: p.descripcion,
      unidad: p.unidad_medida,
      costo_fecha: costoInfo.valor,
      costo_origen: costoInfo.origen,
      estado: 'pendiente',
    });
    setTimeout(() => enfocarCantidad(idx, 'entrada'), 80);
  };

  const agregarLinea = () => setFilas(prev => [...prev, lineaVacia()]);

  const eliminarLinea = (idx: number) =>
    setFilas(prev => prev.length <= 1 ? [lineaVacia()] : prev.filter((_, i) => i !== idx));

  // Totales
  const lineasActivas = filas.filter(l => l.producto_id && (l.entrada > 0 || l.salida > 0));

  const totalEntradas = lineasActivas.reduce((s, l) => s + roundMoney(l.entrada * l.costo_fecha), 0);
  const totalSalidas  = lineasActivas.reduce((s, l) => s + roundMoney(l.salida  * l.costo_fecha), 0);
  const neto          = roundMoney(totalEntradas - totalSalidas);
  const netoEsEntrada = neto >= 0;
  const cuentasPorId = new Map(cuentasDisp.map(c => [c.id, c]));

  // Procesar
  const procesar = async () => {
    const cuentaAjuste = cuentaAjusteId ? cuentasPorId.get(cuentaAjusteId) : null;
    if (!cuentaAjusteId || !cuentaAjuste?.cuenta_base_id) {
      setConfirmando(false);
      setAsientoError('Falta configurar una cuenta de ajuste contable valida para generar el asiento.');
      return;
    }

    const lineasSinCuenta = lineasActivas.filter((l) => {
      const cuentaInvId = l.cuenta_inventario_id || cuentaInventarioDefaultId;
      if (!cuentaInvId) return true;
      const cuentaInv = cuentasPorId.get(cuentaInvId);
      return !cuentaInv?.cuenta_base_id;
    });

    if (lineasSinCuenta.length > 0) {
      setConfirmando(false);
      setAsientoError(`Hay productos sin cuenta de inventario contable valida: ${lineasSinCuenta.map(l => l.descripcion || l.codigo || 'Producto').join(', ')}`);
      return;
    }

    setConfirmando(false);
    setProcesando(true);
    setAsientoError(null);

    const nuevas = [...filas];
    const movIds: number[] = [];

    // 1. Registrar cada movimiento de stock
    for (let i = 0; i < nuevas.length; i++) {
      const l = nuevas[i];
      if (!l.producto_id) continue;
      if (l.entrada <= 0 && l.salida <= 0) continue;

      // Si tiene ambos, registrar neto por producto
      const cantidadNeta = l.entrada - l.salida;
      if (cantidadNeta === 0) {
        nuevas[i] = { ...l, estado: 'ok' };
        continue;
      }

      const { data, error: movError } = await supabase.rpc('registrar_ajuste_inventario_v2', {
        p_empresa_id:        empresaId,
        p_producto_id:       l.producto_id,
        p_cantidad:          cantidadNeta,
        p_fecha:             fecha,
        p_costo_unitario:    l.costo_fecha,
        p_referencia:        referencia || null,
        p_notas:             comentarios || null,
        p_cuenta_ajuste_id:  cuentaAjusteId || null,
        p_categoria_id:      categoriaId || null,
        p_generar_asiento:   false,
        p_bodega_id:         bodegaId,
      });
      const res = data as any;
      const ok = !movError && res?.ok;
      if (ok && res?.movimiento_id) movIds.push(Number(res.movimiento_id));
      nuevas[i] = {
        ...l,
        estado:    ok ? 'ok' : 'error',
        error_msg: ok ? undefined : (
          movError?.message?.includes('registrar_ajuste_inventario_v2')
            ? 'Falta aplicar la migracion del ajuste neto en la base de datos.'
            : (movError?.message || res?.error || 'Error desconocido')
        ),
        mov_id:    res?.movimiento_id || null,
        asiento_rpc_id:   null,
        asiento_rpc_num:  '',
      };
    }

    setFilas(nuevas);

    // 2. Crear un unico asiento neto para todos los movimientos exitosos
    let asientoCreado: { id: number | null; numero: string; con_asiento: boolean } = { id: null, numero: '', con_asiento: false };

    if (movIds.length > 0 && cuentaAjusteId) {
      const { data: asientoData, error: asientoErr } = await supabase.rpc('crear_asiento_ajuste_neto', {
        p_empresa_id: empresaId,
        p_fecha: fecha,
        p_mov_ids: movIds,
        p_referencia: referencia || null,
        p_cuenta_ajuste_id: cuentaAjusteId,
        p_categoria_id: categoriaId || null,
      });
      const asientoRes = asientoData as any;
      if (asientoErr) {
        setAsientoError(asientoErr.message || 'No se pudo crear el asiento neto del ajuste.');
      } else if (!asientoRes?.ok) {
        setAsientoError(asientoRes?.error || 'No se pudo crear el asiento neto del ajuste.');
      } else {
        asientoCreado = {
          id: asientoRes?.asiento_id || null,
          numero: asientoRes?.numero || '',
          con_asiento: Boolean(asientoRes?.asiento_id),
        };
      }
    } else if (movIds.length > 0 && !cuentaAjusteId) {
      setAsientoError('Sin cuenta de ajuste configurada. Se registraron movimientos, pero no se genero asiento.');
    }

    if (asientoCreado.id) {
      setFilas((prev) => prev.map((l) => (
        l.mov_id && movIds.includes(Number(l.mov_id))
          ? { ...l, asiento_rpc_id: asientoCreado.id, asiento_rpc_num: asientoCreado.numero }
          : l
      )));
    }

    const todosError = nuevas.filter(l => l.producto_id && (l.entrada > 0 || l.salida > 0)).every(l => l.estado === 'error');
    if (todosError) {
      const primerError = nuevas.find(l => l.estado === 'error');
      setAsientoError(primerError?.error_msg || 'Error al registrar movimientos');
    }

    setAsientoInfo(asientoCreado);
    setAplicado(true);
    setProcesando(false);
  };

  if (aplicado) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-green-700 bg-green-900 bg-opacity-20 p-8 text-center">
          <div className="text-5xl mb-4">✓</div>
          <h3 className="text-xl font-bold text-green-300 mb-2">Ajuste aplicado</h3>
          <p className="text-gray-400 text-sm mb-1">
            {filas.filter(l => l.estado === 'ok').length} movimiento(s) registrado(s)
            {filas.filter(l => l.estado === 'error').length > 0 && ` · ${filas.filter(l => l.estado === 'error').length} con error`}
          </p>
          {asientoInfo?.con_asiento && (
            <p className="text-gray-400 text-sm mb-1">
              Asiento <span className="font-mono text-green-400">{asientoInfo.numero || `#${asientoInfo.id}`}</span> generado
            </p>
          )}
          {asientoError && (
            <p className="text-orange-400 text-xs mt-1 mb-1">
              ⚠ Asiento no generado: {asientoError}
            </p>
          )}
          <p className="text-yellow-600 text-xs mt-4 mb-6">
            ⚠ Este ajuste no es reversible. Para corregirlo, genere un nuevo ajuste compensatorio.
          </p>
          {filas.some(l => l.estado === 'error') && (
            <div className="text-left bg-red-900 bg-opacity-20 border border-red-800 rounded-lg p-3 mb-4 text-xs text-red-300">
              {filas.filter(l => l.estado === 'error').map(l => (
                <p key={l._key}>• {l.descripcion || 'Linea'}: {l.error_msg}</p>
              ))}
            </div>
          )}
          <button
            onClick={() => { if (onVolver) { onVolver(); } else { setFilas([lineaVacia(), lineaVacia(), lineaVacia()]); setReferencia(''); setComentarios(''); setAplicado(false); setAsientoInfo(null); setAsientoError(null); } }}
            className="px-6 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--green-main)', color: '#000' }}
          >
            Nuevo ajuste
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-0.5">
          {onVolver && (
            <button onClick={onVolver} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              ← Volver
            </button>
          )}
          <h2 className="text-xl font-bold" style={{ color: 'var(--green-main)' }}>
            Ajuste de Inventario
          </h2>
        </div>
        <p className="text-gray-500 text-xs">
          Entradas y salidas manuales · El costo promedio se toma a la fecha del documento · Asiento contable neto
        </p>
      </div>

      {/* Encabezado del documento */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-5 grid grid-cols-2 gap-4">

        {/* Columna izquierda */}
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Fecha del ajuste</label>
            <input type="date" value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none w-full"
              style={{ borderColor: fecha ? 'var(--green-dim)' : '' }}
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Referencia</label>
            <input type="text" value={referencia}
              onChange={e => setReferencia(e.target.value)}
              placeholder="Conteo fisico, merma, devolucion..."
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Comentarios</label>
            <textarea value={comentarios}
              onChange={e => setComentarios(e.target.value)}
              rows={2}
              placeholder="Observaciones adicionales del ajuste..."
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Columna derecha */}
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Categoria del asiento</label>
            <div className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm" style={{ color: 'var(--green-main)' }}>
              AI - Ajuste de Inventario
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">
              Cuenta de ajuste <span className="text-gray-600">(contrapartida del inventario)</span>
            </label>
            <button onClick={() => setModalCuenta(true)}
              className="w-full text-left bg-gray-800 border border-gray-600 hover:border-gray-500 rounded px-3 py-1.5 text-sm transition-colors">
              {cuentaAjusteId
                ? <><span className="text-yellow-400 font-mono font-bold text-xs">{cuentaAjusteLabel.split(' ')[0]}</span>
                    <span className="text-gray-200 ml-2 text-xs">{cuentaAjusteLabel.split(' ').slice(1).join(' ')}</span></>
                : <span className="text-gray-500">- Seleccionar cuenta -</span>
              }
            </button>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Bodega</label>
            <select value={bodegaId ?? ''} onChange={e => setBodegaId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-gray-700 border border-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
              <option value="">— Todas las bodegas —</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>

          {/* Resumen neto */}
          {lineasActivas.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-3 text-xs space-y-1 mt-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Total entradas</span>
                <span className="font-mono text-green-400">{formatMoneyCRC(totalEntradas)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total salidas</span>
                <span className="font-mono text-red-400">{formatMoneyCRC(totalSalidas)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-700 pt-1 font-semibold">
                <span className="text-gray-300">
                  Neto ({netoEsEntrada ? 'DB Inventario' : 'CR Inventario'})
                </span>
                <span className="font-mono" style={{ color: netoEsEntrada ? 'var(--green-main)' : '#f87171' }}>
                  {formatMoneyCRC(Math.abs(neto))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grilla */}
      <div className="rounded-xl border border-gray-700 overflow-hidden mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 uppercase tracking-wide text-[10px]"
              style={{ background: 'var(--bg-dark2)' }}>
              <th className="px-3 py-2.5 text-left w-8">#</th>
              <th className="px-3 py-2.5 text-left">Producto</th>
              <th className="px-3 py-2.5 text-center w-14">Unid.</th>
              <th className="px-3 py-2.5 text-right w-32">Costo Prom. ({fecha.slice(0,7)})</th>
              <th className="px-3 py-2.5 text-right w-24 text-green-500">Entrada</th>
              <th className="px-3 py-2.5 text-right w-24 text-red-400">Salida</th>
              <th className="px-3 py-2.5 text-right w-28">Monto CRC</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((l, idx) => {
              const monto = roundMoney((l.entrada - l.salida) * l.costo_fecha);
              return (
                <tr key={l._key} className="border-t border-gray-800"
                  style={{ background: idx % 2 === 0 ? 'var(--bg-dark)' : 'var(--bg-dark2)' }}>
                  <td className="px-3 py-1.5 text-gray-600">{idx + 1}</td>

                  {/* Producto */}
                  <td className="px-3 py-1.5">
                    {l.producto_id ? (
                      <button onClick={() => setModalProductoIdx(idx)} className="text-left w-full">
                        {l.codigo && <span className="font-mono text-[10px] mr-1" style={{ color: 'var(--green-dim)' }}>{l.codigo}</span>}
                        <span className="text-gray-200">{l.descripcion}</span>
                        <span className="text-gray-600 ml-1 text-[10px]">✎</span>
                      </button>
                    ) : (
                      <button onClick={() => setModalProductoIdx(idx)}
                        className="text-xs px-2 py-1 rounded border border-dashed border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors w-full text-left">
                        + Seleccionar producto
                      </button>
                    )}
                  </td>

                  {/* Unidad */}
                  <td className="px-3 py-1.5 text-center text-gray-500">{l.unidad || '-'}</td>

                  {/* Costo */}
                  <td className="px-3 py-1.5 text-right font-mono text-gray-400">
                    <div>{l.costo_fecha > 0 ? formatMoneyCRC(l.costo_fecha) : '-'}</div>
                    {l.producto_id && l.costo_fecha > 0 && (
                      <div className="mt-0.5 text-[10px] font-sans uppercase tracking-wide text-gray-500">
                        {l.costo_origen === 'historial' ? 'Historial' : 'Actual'}
                      </div>
                    )}
                  </td>

                  {/* Entrada */}
                  <td className="px-2 py-1.5">
                    {(() => {
                      const salidaBloquea = l.salida > 0;
                      return (
                    <input type="text" inputMode="decimal"
                      ref={el => setCantidadRef(idx, 'entrada', el)}
                      value={valorVisibleCantidad(idx, 'entrada', l.entrada)}
                      onFocus={e => iniciarEdicionCantidad(idx, 'entrada', l.entrada, e.currentTarget)}
                      onChange={e => setValorTemporal(e.target.value)}
                      onBlur={() => confirmarEdicionCantidad(idx, 'entrada')}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const valorConfirmado = confirmarEdicionCantidad(idx, 'entrada') || 0;
                          e.currentTarget.blur();
                          avanzarDespuesDeCantidad(idx, 'entrada', valorConfirmado);
                        }
                      }}
                      disabled={salidaBloquea}
                      className="w-full bg-transparent border rounded px-2 py-1 text-right font-mono text-green-300 focus:outline-none text-xs transition-colors"
                      style={{
                        borderColor: l.entrada > 0 ? '#22c55e55' : 'var(--bg-dark2)',
                        background: l.entrada > 0 ? '#16a34a11' : (salidaBloquea ? 'rgba(71,85,105,0.12)' : ''),
                        opacity: salidaBloquea ? 0.45 : 1,
                        cursor: salidaBloquea ? 'not-allowed' : 'text',
                        boxShadow: editandoCampo === campoCantidadId(idx, 'entrada') ? '0 0 0 2px rgba(34,197,94,0.22)' : 'none',
                      }}
                      placeholder="0.000"
                    />
                      );
                    })()}
                  </td>

                  {/* Salida */}
                  <td className="px-2 py-1.5">
                    {(() => {
                      const entradaBloquea = l.entrada > 0;
                      return (
                    <input type="text" inputMode="decimal"
                      ref={el => setCantidadRef(idx, 'salida', el)}
                      value={valorVisibleCantidad(idx, 'salida', l.salida)}
                      onFocus={e => iniciarEdicionCantidad(idx, 'salida', l.salida, e.currentTarget)}
                      onChange={e => setValorTemporal(e.target.value)}
                      onBlur={() => confirmarEdicionCantidad(idx, 'salida')}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const valorConfirmado = confirmarEdicionCantidad(idx, 'salida') || 0;
                          e.currentTarget.blur();
                          avanzarDespuesDeCantidad(idx, 'salida', valorConfirmado);
                        }
                      }}
                      disabled={entradaBloquea}
                      className="w-full bg-transparent border rounded px-2 py-1 text-right font-mono text-red-300 focus:outline-none text-xs transition-colors"
                      style={{
                        borderColor: l.salida > 0 ? '#ef444455' : 'var(--bg-dark2)',
                        background: l.salida > 0 ? '#ef444411' : (entradaBloquea ? 'rgba(71,85,105,0.12)' : ''),
                        opacity: entradaBloquea ? 0.45 : 1,
                        cursor: entradaBloquea ? 'not-allowed' : 'text',
                        boxShadow: editandoCampo === campoCantidadId(idx, 'salida') ? '0 0 0 2px rgba(248,113,113,0.22)' : 'none',
                      }}
                      placeholder="0.000"
                    />
                      );
                    })()}
                  </td>

                  {/* Monto neto */}
                  <td className="px-3 py-1.5 text-right font-mono font-semibold"
                    style={{ color: monto > 0 ? 'var(--green-main)' : monto < 0 ? '#f87171' : 'var(--gray-400)' }}>
                    {monto !== 0 ? (monto > 0 ? '+' : '') + formatMoneyCRC(monto) : '-'}
                  </td>

                  {/* Eliminar */}
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => eliminarLinea(idx)}
                        className="text-gray-700 hover:text-red-400 transition-colors text-base leading-none">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-700" style={{ background: 'var(--bg-dark2)' }}>
              <td colSpan={4} className="px-3 py-2">
                <button onClick={agregarLinea}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--green-dim)' }}>
                  + Agregar linea
                </button>
              </td>
              <td className="px-2 py-2 text-right font-mono text-green-400 font-bold">
                {totalEntradas > 0 ? formatMoneyCRC(totalEntradas) : ''}
              </td>
              <td className="px-2 py-2 text-right font-mono text-red-400 font-bold">
                {totalSalidas > 0 ? formatMoneyCRC(totalSalidas) : ''}
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold"
                style={{ color: netoEsEntrada ? 'var(--green-main)' : '#f87171' }}>
                {neto !== 0 ? (neto > 0 ? '+' : '') + formatMoneyCRC(neto) : ''}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {asientoError && (
        <div className="mb-4 rounded-xl border border-red-800 bg-red-950/30 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-red-400">Validacion contable</div>
          <div className="mt-1 text-sm text-red-200">{asientoError}</div>
        </div>
      )}

      {/* Boton aplicar */}
      <div className="flex justify-end gap-3 items-center">
        <p className="text-xs text-gray-600">
          ⚠ Una vez aplicado no se puede reversar
        </p>
        <button
          onClick={() => setConfirmando(true)}
          disabled={lineasActivas.length === 0 || procesando}
          className="px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors"
          style={{ background: 'var(--green-main)', color: '#000' }}
        >
          Aplicar ajuste ({lineasActivas.length} linea{lineasActivas.length !== 1 ? 's' : ''})
        </button>
      </div>

      {/* Modal confirmacion */}
      {confirmando && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[150] p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-white mb-2">Confirmar ajuste</h3>
            <p className="text-gray-400 text-sm mb-1">
              Se registraran <strong className="text-white">{lineasActivas.length}</strong> movimiento(s) de inventario.
            </p>
            <p className="text-gray-400 text-sm mb-1">
              Monto neto: <strong className="font-mono" style={{ color: netoEsEntrada ? 'var(--green-main)' : '#f87171' }}>
                {formatMoneyCRC(Math.abs(neto))}
              </strong> ({netoEsEntrada ? 'entrada neta' : 'salida neta'})
            </p>
            {!cuentaAjusteId && (
              <p className="text-yellow-400 text-xs mt-2">⚠ Sin cuenta de ajuste - no se generara asiento contable.</p>
            )}
            <p className="text-orange-400 text-xs mt-3 mb-4">
              Esta operacion no se puede reversar directamente.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmando(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">
                Cancelar
              </button>
              <button onClick={procesar} disabled={procesando}
                className="flex-1 px-4 py-2 rounded text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--green-main)', color: '#000' }}>
                {procesando ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal buscar producto */}
      {modalProductoIdx !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div
            className="w-full max-w-3xl flex flex-col overflow-hidden rounded-[22px] border"
            style={{
              maxHeight: '84vh',
              background: 'linear-gradient(180deg, rgba(31,41,55,0.98) 0%, rgba(17,24,39,0.98) 100%)',
              borderColor: 'rgba(74,222,128,0.18)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
            }}
          >
            <div
              className="px-6 py-4 border-b flex items-start justify-between"
              style={{ borderColor: 'rgba(148,163,184,0.14)' }}
            >
              <div>
                <p className="text-lg font-semibold tracking-wide" style={{ color: 'var(--green-main)' }}>
                  Seleccionar producto
                </p>
                <p className="text-xs mt-1 text-gray-400">
                  Puede buscar por codigo o descripcion, o elegir directamente desde el catalogo.
                </p>
              </div>
              <button
                onClick={() => setModalProductoIdx(null)}
                className="h-9 w-9 rounded-full border text-lg leading-none transition-colors"
                style={{
                  borderColor: 'rgba(148,163,184,0.2)',
                  color: '#94a3b8',
                  background: 'rgba(15,23,42,0.35)',
                }}
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'rgba(148,163,184,0.12)' }}>
              <input
                ref={inputBusqRef}
                type="text"
                value={busqProd}
                onChange={e => buscarProductos(e.target.value)}
                placeholder="Buscar por codigo o descripcion..."
                className="w-full rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none"
                style={{
                  background: 'rgba(20,32,18,0.95)',
                  border: `1px solid ${busqProd ? 'rgba(74,222,128,0.45)' : 'rgba(74,222,128,0.18)'}`,
                  boxShadow: busqProd ? '0 0 0 3px rgba(34,197,94,0.08)' : 'none',
                }}
              />
              <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
                <span>
                  {busqProd.trim().length >= 2
                    ? `Resultados para "${busqProd.trim()}"`
                    : 'Catalogo inicial para apoyar la seleccion'}
                </span>
                <span>
                  {busqProd.trim().length >= 2 ? prodResultados.length : catalogoInicial.length} articulo(s)
                </span>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-2">
              {cargandoCatalogo ? (
                <p className="px-4 py-10 text-center text-sm text-gray-500">Cargando catalogo de articulos...</p>
              ) : (busqProd.trim().length >= 2 ? prodResultados : catalogoInicial).length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-gray-500">
                  {busqProd.trim().length >= 2 ? 'Sin resultados para la busqueda.' : 'No hay articulos disponibles.'}
                </p>
              ) : (
                (busqProd.trim().length >= 2 ? prodResultados : catalogoInicial).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => seleccionarProducto(modalProductoIdx, p)}
                    className="w-full text-left rounded-2xl border px-4 py-3 transition-all hover:-translate-y-[1px]"
                    style={{
                      borderColor: 'rgba(148,163,184,0.12)',
                      background: 'rgba(15,23,42,0.42)',
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="shrink-0 rounded-xl px-3 py-1.5 font-mono text-[11px] font-semibold"
                        style={{
                          background: 'rgba(22,163,74,0.15)',
                          color: 'var(--green-main)',
                          minWidth: '116px',
                          textAlign: 'center',
                        }}
                      >
                        {p.codigo || 'SIN-CODIGO'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-100 break-words">
                          {p.descripcion}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                          <span>Unidad: {p.unidad_medida || 'N/D'}</span>
                          <span>Costo actual: {p.costo_promedio > 0 ? formatMoneyCRC(p.costo_promedio) : 'Sin costo'}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal cuenta ajuste */}
      {modalCuenta && (
        <ModalSeleccionCuenta
          cuentas={cuentasDisp as any}
          titulo="Cuenta de ajuste (contrapartida)"
          usarBaseId
          onSelect={(id, cuenta: any) => {
            setCuentaAjusteId(id);
            setCuentaAjusteLabel(`${cuenta.codigo} ${cuenta.nombre}`);
            setModalCuenta(false);
          }}
          onClose={() => setModalCuenta(false)}
        />
      )}
    </div>
  );
}
