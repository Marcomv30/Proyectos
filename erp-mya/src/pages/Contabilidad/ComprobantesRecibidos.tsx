import { useState, useEffect, useRef, useMemo } from 'react';
import { ModalSeleccionCuenta } from '../../components/ModalSeleccionCuenta';
import { fmtFecha } from '../../utils/reporting';
import { MontoInput } from '../../components/MontoInput';
import { DescargaCorreo } from '../../components/DescargaCorreo';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';

const API = 'http://localhost:3001';
const POR_PAGINA = 20;

interface Comprobante {
  id: number;
  emisor_nombre: string;
  emisor_identificacion: string;
  emisor_tipo_id: string | null;
  numero_comprobante: string;
  total_comprobante: number;
  moneda: string;
  fecha_emision: string;
  tipo: string;
  tipo_xml: string;
  procesado: boolean;
  email_remitente: string;
  archivo_xml: string;
  archivo_pdf: string;
  archivo_xml_mh: string;
  total_otros_cargos?: number;
  iva_devuelto?: number;
  cuadra?: boolean;
  diferencia_cuadre?: number;
  proveedor_id?: number | null;
  tipo_cambio?: number;
  proporcionalidad?: number;
  contabilizado?: boolean;
  asiento_id?: number | null;
  nc_referencia_numero?: string | null;
  nc_referencia_id?: number | null;
}

interface OtroCargo {
  tipo_documento: string | null;
  detalle: string;
  porcentaje: number;
  monto_cargo: number;
}

interface CuadreInfo {
  sumaLineas: number;
  totalOtros: number;
  ivaDevuelto: number;
  totalCalculado: number;
  totalDocumento: number;
  diferencia: number;
  cuadra: boolean;
}

interface Linea {
  id: number;
  num_linea: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  descuento_monto: number;
  subtotal: number;
  tarifa_iva: number;
  monto_impuesto: number;
  total_linea: number;
  cabys?: string | null;
  tarifa_iva_codigo?: string | null;
  tipo_linea?: string | null;
  codigo_comercial?: string | null;
  exoneracion_tipo?: string | null;
  exoneracion_porc?: number;
  exoneracion_monto?: number;
  a_inventario?: boolean | null;
}

interface IvaResumen {
  tarifa_codigo: string;
  tarifa_porc: number;
  base_imponible: number;
  monto_iva: number;
  monto_exonerado: number;
}

const TARIFA_LABELS: Record<string, string> = {
  '01': 'Exento (0%)',
  '02': 'Tarifa 1%',
  '03': 'Tarifa 2%',
  '04': 'Tarifa reducida 4%',
  '05': 'Tarifa reducida 8%',
  '06': 'Tarifa general 13%',
  '07': 'Tarifa transitoria 2%',
  '08': 'Tarifa transitoria 1%',
};

const TIPO_LABELS: Record<string, string> = {
  FACTURA_COMPRA: 'Factura Compra',
  FACTURA_VENTA:  'Factura Venta',
  NOTA_CREDITO:   'Nota Crédito',
  NOTA_DEBITO:    'Nota Débito',
};

const TIPO_COLORS: Record<string, string> = {
  FACTURA_COMPRA: 'bg-blue-900 text-blue-300',
  FACTURA_VENTA:  'bg-green-900 text-green-300',
  NOTA_CREDITO:   'bg-yellow-900 text-yellow-300',
  NOTA_DEBITO:    'bg-red-900 text-red-300',
};


function urlArchivo(ruta: string) {
  return API + '/api/correo/archivo?ruta=' + encodeURIComponent(ruta.replace(/\\/g, '/'));
}

export default function ComprobantesRecibidos({ empresaId }: { empresaId: number }) {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [cargando, setCargando]         = useState(true);
  const [filtro, setFiltro]             = useState('');
  const [pagina, setPagina]             = useState(1);
  const [modalError, setModalError]     = useState<string | null>(null);
  const esErrorCuentaCxp = (modalError || '').includes('Cuenta CXP Proveedores no configurada');
  const tituloError = esErrorCuentaCxp ? 'Configuracion pendiente' : 'Error';
  const detalleError = esErrorCuentaCxp
    ? `Falta configurar la cuenta contable de CXP Proveedores para la empresa actual (#${empresaId}) antes de contabilizar comprobantes recibidos.`
    : (modalError || '');
  const [modalFechaPeriodo, setModalFechaPeriodo] = useState<{ mensaje: string; fechaSugerida: string } | null>(null);
  const [fechaOverride, setFechaOverride] = useState('');
  const [contabilizando, setContabilizando] = useState<number | null>(null);
  const [resultadoContab, setResultadoContab] = useState<{
    asiento_id: number; numero_formato: string; advertencias: string[]; moneda?: string;
    inventario_movimientos?: number;
    fecha?: string; descripcion?: string; emisor?: string; numero_comprobante?: string;
    lineas?: { linea: number; descripcion: string; codigo: string; nombre: string; debito_crc: number; credito_crc: number; debito_usd: number; credito_usd: number }[];
  } | null>(null);
  const [mapeosInv, setMapeosInv] = useState<Record<string, { producto_id: number; descripcion: string } | null>>({});
  // Editor de asiento (preparar → editar → confirmar)
  interface LineaEditor {
    linea: number; cuenta_id: number | null; cuenta_codigo: string | null; cuenta_nombre: string | null;
    descripcion: string; debito_crc: number; credito_crc: number; debito_usd: number; credito_usd: number;
  }
  const [editorAsiento, setEditorAsiento] = useState<{
    comprobante: Comprobante; moneda: string; tipo_cambio: number;
    descripcion: string; lineas: LineaEditor[]; advertencias: string[];
    cuentasDisp: { id: number; cuenta_base_id: number | null; codigo: string; nombre: string }[];
    categoria_id: number | null; categoria_nombre: string | null;
  } | null>(null);
  const [confirmandoAsiento, setConfirmandoAsiento] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState(false);

  // F5: Batch contabilización
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [procesandoBatch, setProcesandoBatch] = useState(false);
  const [resultadoBatch, setResultadoBatch] = useState<{ exitosos: number; fallidos: number; results: { id: number; ok: boolean; error?: string; numero_formato?: string }[] } | null>(null);

  // F6: Reporte IVA D-104
  const [modalIvaReporte, setModalIvaReporte] = useState(false);
  const [ivaReporteDatos, setIvaReporteDatos] = useState<{ filas: { tarifa_codigo: string; tarifa_nombre: string; tarifa_porc: number; base_imponible: number; monto_iva: number; monto_exonerado: number }[]; comprobantes: Comprobante[] } | null>(null);
  const [ivaReporteDesde, setIvaReporteDesde] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  });
  const [ivaReporteHasta, setIvaReporteHasta] = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' })
  );
  const [cargandoIvaReporte, setCargandoIvaReporte] = useState(false);

  const [modalCuentaCxp, setModalCuentaCxp] = useState<Comprobante | null>(null);
  const [cuentaCxpSel, setCuentaCxpSel]     = useState<number | null>(null);
  const [guardandoCxp, setGuardandoCxp]     = useState(false);
  const [modalCrearProv, setModalCrearProv] = useState<Comprobante | null>(null);
  const [creandoProv, setCreandoProv]       = useState(false);

  // Modal líneas
  const [modalComp, setModalComp]           = useState<Comprobante | null>(null);
  const [lineas, setLineas]                 = useState<Linea[]>([]);
  const [otrosCargos, setOtrosCargos]       = useState<OtroCargo[]>([]);
  const [cuadre, setCuadre]                 = useState<CuadreInfo | null>(null);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [ivaResumen, setIvaResumen]         = useState<IvaResumen[]>([]);
  const [proporcionalidad, setProporcionalidad] = useState<number>(100);
  const [guardandoProp, setGuardandoProp]       = useState(false);
  const [procesando, setProcesando]         = useState<number | null>(null);
  const [toggling, setToggling]             = useState<number | null>(null); // lineaId en proceso
  const [togglingTodas, setTogglingTodas]   = useState(false);
  const [creandoProducto, setCreandoProducto] = useState<Linea | null>(null); // línea para crear producto
  const [creandoProd, setCreandoProd]       = useState(false);
  const [buscarProductoLinea, setBuscarProductoLinea] = useState<Linea | null>(null);
  const [buscarProdQuery, setBuscarProdQuery] = useState('');
  const [buscarProdResultados, setBuscarProdResultados] = useState<{ id: number; descripcion: string; codigo: string | null }[]>([]);
  const [categoriasInv, setCategoriasInv]   = useState<{ id: number; nombre: string }[]>([]);
  const [categoriaNueva, setCategoriaNueva] = useState<number | ''>('');
  const [categoriaDoc, setCategoriaDoc]     = useState<number | ''>(''); // categoría predefinida para el documento
  const [creandoTodas, setCreandoTodas]     = useState(false);
  const [progresoCreadoTodas, setProgresoCreadoTodas] = useState<{ ok: number; skip: number; total: number } | null>(null);
  const [resaltarId, setResaltarId]         = useState<number | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const [modalConfig, setModalConfig]       = useState(false);
  const [configCuentas, setConfigCuentas]   = useState<Record<string, number | null>>({
    cuenta_cxp_proveedores_id: null,
    cuenta_gasto_compras_id: null,
    cuenta_iva_credito_id: null,
    cuenta_iva_gasto_id: null,
    cuenta_otros_cargos_id: null,
    cuenta_inventario_id: null,
    categoria_compras_id: null,
  });
  const [cuentasDisp, setCuentasDisp]       = useState<{id: number; codigo: string; nombre: string}[]>([]);
  const [categoriasDisp, setCategoriasDisp] = useState<{categoria_id: number; codigo: string; descripcion: string}[]>([]);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [modalCuentaConfig, setModalCuentaConfig] = useState<string | null>(null); // clave del campo abierto
  const [modalCuentaCxpOpen, setModalCuentaCxpOpen] = useState(false);
  const [modalCuentaLineaIdx, setModalCuentaLineaIdx] = useState<number | null>(null);

  useEffect(() => {
    cargarComprobantes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar mapeos inventario cuando se abren líneas.
  // Key del mapa: codigo_comercial si existe, si no "cabys:<valor>" para líneas con solo CABYS.
  // Carga tipo_codigo='01' (codigo_comercial) y tipo_codigo='04' (CABYS fallback).
  useEffect(() => {
    if (!modalComp || lineas.length === 0) { setMapeosInv({}); return; }
    const esInvLinea = (l: Linea) =>
      l.a_inventario === true || (l.a_inventario == null && l.tipo_linea === 'M');
    const invLineas = lineas.filter(esInvLinea);
    if (invLineas.length === 0) { setMapeosInv({}); return; }

    const conCodigo = Array.from(new Set(
      invLineas.filter(l => l.codigo_comercial).map(l => l.codigo_comercial as string)
    ));
    const conCabys = Array.from(new Set(
      invLineas.filter(l => !l.codigo_comercial && l.cabys?.trim()).map(l => l.cabys!.trim())
    ));

    const map: Record<string, { producto_id: number; descripcion: string } | null> = {};
    conCodigo.forEach(c => { map[c] = null; });
    conCabys.forEach(c  => { map[`cabys:${c}`] = null; });

    const q1 = conCodigo.length
      ? supabase.from('inv_codigos_proveedor')
          .select('codigo_comercial, tipo_codigo, producto_id, inv_productos(descripcion)')
          .eq('empresa_id', empresaId).eq('emisor_identificacion', modalComp.emisor_identificacion)
          .eq('tipo_codigo', '01').in('codigo_comercial', conCodigo)
      : Promise.resolve({ data: [] });

    const q2 = conCabys.length
      ? supabase.from('inv_codigos_proveedor')
          .select('codigo_comercial, tipo_codigo, producto_id, inv_productos(descripcion)')
          .eq('empresa_id', empresaId).eq('emisor_identificacion', modalComp.emisor_identificacion)
          .eq('tipo_codigo', '04').in('codigo_comercial', conCabys)
      : Promise.resolve({ data: [] });

    Promise.all([q1, q2]).then(([r1, r2]) => {
      (r1.data || []).forEach((m: any) => {
        if (m.producto_id) map[m.codigo_comercial] = {
          producto_id: m.producto_id,
          descripcion: m.inv_productos?.descripcion || `Producto #${m.producto_id}`,
        };
      });
      (r2.data || []).forEach((m: any) => {
        if (m.producto_id) map[`cabys:${m.codigo_comercial}`] = {
          producto_id: m.producto_id,
          descripcion: m.inv_productos?.descripcion || `Producto #${m.producto_id}`,
        };
      });
      // Merge conservador: nunca pisar un valor no-null existente con null de DB
      setMapeosInv(prev => {
        const result: typeof prev = { ...map };
        Object.entries(prev).forEach(([k, v]) => {
          if (v !== null && (result[k] === null || result[k] === undefined)) {
            result[k] = v; // conservar mapeo local si DB no lo devolvió
          }
          if (!(k in result)) {
            result[k] = v; // conservar claves linea:* u otras no consultadas
          }
        });
        return result;
      });
    });
  }, [lineas, modalComp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar categorías cuando se abre el modal de líneas
  useEffect(() => {
    if (!modalComp) { setCategoriaDoc(''); setProgresoCreadoTodas(null); return; }
    supabase.from('inv_categorias').select('id, nombre')
      .eq('empresa_id', empresaId).eq('activo', true).order('nombre')
      .then(({ data }) => setCategoriasInv(data || []));
  }, [modalComp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-llenar categoría individual con la del documento
  useEffect(() => {
    if (!creandoProducto) return;
    setCategoriaNueva(categoriaDoc || '');
  }, [creandoProducto]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll y resaltado al volver del detalle
  useEffect(() => {
    if (modalComp || !resaltarId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`comp-row-${resaltarId}`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => setResaltarId(null), 2000);
    }, 60);
    return () => clearTimeout(timer);
  }, [modalComp]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarComprobantes = async (mantenerPagina = false) => {
    setCargando(true);
    const { data } = await supabase
      .from('comprobantes_recibidos')
      .select('*')
      .eq('empresa_id', empresaId)
      .not('fecha_emision', 'is', null)
      .order('fecha_emision', { ascending: false });
    const lista = data || [];

    // Auto-vincular en background: procesados sin proveedor_id → buscar tercero por identificacion
    const sinProveedor = lista.filter(c => c.procesado && !c.proveedor_id && c.emisor_identificacion);
    if (sinProveedor.length > 0) {
      const ids = sinProveedor.map(c => c.emisor_identificacion);
      const { data: terceros } = await supabase
        .from('terceros').select('id, identificacion').eq('empresa_id', empresaId).in('identificacion', ids);
      if (terceros?.length) {
        const map: Record<string, number> = {};
        terceros.forEach((t: any) => { map[t.identificacion] = t.id; });
        for (const c of sinProveedor) {
          const terceroId = map[c.emisor_identificacion];
          if (terceroId) {
            await supabase.from('comprobantes_recibidos').update({ proveedor_id: terceroId }).eq('id', c.id);
            c.proveedor_id = terceroId; // actualizar en memoria para no recargar
          }
        }
      }
    }

    setComprobantes(lista);
    setCargando(false);
    if (!mantenerPagina) setPagina(1);
  };

  const filtrados = comprobantes.filter(c =>
    c.emisor_nombre?.toLowerCase().includes(filtro.toLowerCase()) ||
    c.numero_comprobante?.includes(filtro)
  );

  // F1: Detectar duplicados (mismo numero_comprobante + emisor en la empresa)
  const duplicadosSet = useMemo(() => {
    const claves: Record<string, number[]> = {};
    comprobantes.forEach(c => {
      if (!c.numero_comprobante || !c.emisor_identificacion) return;
      const k = `${c.emisor_identificacion}|${c.numero_comprobante}`;
      if (!claves[k]) claves[k] = [];
      claves[k].push(c.id);
    });
    const dup = new Set<number>();
    Object.values(claves).forEach(ids => { if (ids.length > 1) ids.forEach(id => dup.add(id)); });
    return dup;
  }, [comprobantes]);

  const resumen = Object.keys(TIPO_LABELS).map(tipo => ({
    tipo,
    cantidad: filtrados.filter(c => c.tipo === tipo).length,
  })).filter(r => r.cantidad > 0);

  const totalPaginas = Math.ceil(filtrados.length / POR_PAGINA);
  const paginados    = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const toggleTodas = async (valor: boolean) => {
    if (!modalComp || lineas.length === 0) return;
    setTogglingTodas(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(`${API}/api/contabilizar/comprobante/${modalComp.id}/lineas/a-inventario`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ a_inventario: valor }),
      });
      if (!res.ok && res.status !== 200) {
        setModalError(`Error HTTP ${res.status} — ¿Reiniciaste el servidor?`);
        return;
      }
      const data = await res.json();
      if (!data.ok) { setModalError(data.error); return; }
      setLineas(prev => prev.map(l => ({ ...l, a_inventario: valor })));
      localStorage.setItem('mya_comprobantes_default_inv', String(valor));
    } finally {
      setTogglingTodas(false);
    }
  };

  const toggleInventario = async (linea: Linea, valor: boolean | null) => {
    setToggling(linea.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      await fetch(`${API}/api/contabilizar/linea/${linea.id}/a-inventario`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ a_inventario: valor }),
      });
      setLineas(prev => prev.map(l => l.id === linea.id ? { ...l, a_inventario: valor } : l));
    } finally {
      setToggling(null);
    }
  };

  const ejecutarCrearProducto = async (linea: Linea) => {
    setCreandoProd(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res  = await fetch(`${API}/api/contabilizar/linea/${linea.id}/crear-producto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ empresa_id: empresaId, categoria_id: categoriaNueva || null }),
      });
      const data = await res.json();
      if (!data.ok) { setModalError(data.error); return; }
      // Actualizar mapeos y a_inventario en estado local
      setLineas(prev => prev.map(l => l.id === linea.id ? { ...l, a_inventario: true } : l));
      const mapaKey = linea.codigo_comercial
        ? linea.codigo_comercial
        : linea.cabys?.trim() ? `cabys:${linea.cabys.trim()}` : `linea:${linea.id}`;
      setMapeosInv(prev => ({ ...prev, [mapaKey]: { producto_id: data.producto_id, descripcion: data.descripcion } }));
      setCreandoProducto(null);
    } finally {
      setCreandoProd(false);
    }
  };

  const crearTodasLasLineas = async () => {
    if (!modalComp || modalComp.contabilizado) return;
    const mapaKeyDe = (l: Linea) => l.codigo_comercial
      ? l.codigo_comercial
      : l.cabys?.trim() ? `cabys:${l.cabys.trim()}` : `linea:${l.id}`;
    const pendientes = lineas.filter(l => {
      const esInv = l.a_inventario === true || (l.a_inventario == null && l.tipo_linea === 'M');
      return esInv && !mapeosInv[mapaKeyDe(l)];
    });
    if (pendientes.length === 0) return;
    setCreandoTodas(true);
    setProgresoCreadoTodas({ ok: 0, skip: 0, total: pendientes.length });
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    let ok = 0, skip = 0;
    for (const linea of pendientes) {
      try {
        const res = await fetch(`${API}/api/contabilizar/linea/${linea.id}/crear-producto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ empresa_id: empresaId, categoria_id: categoriaDoc || null }),
        });
        const data = await res.json();
        if (data.ok) {
          ok++;
          const key = mapaKeyDe(linea);
          setLineas(prev => prev.map(l => l.id === linea.id ? { ...l, a_inventario: true } : l));
          setMapeosInv(prev => ({ ...prev, [key]: { producto_id: data.producto_id, descripcion: data.descripcion } }));
        } else { skip++; }
      } catch { skip++; }
      setProgresoCreadoTodas({ ok, skip, total: pendientes.length });
    }
    setCreandoTodas(false);
  };

  const buscarProductos = async (q: string) => {
    setBuscarProdQuery(q);
    if (q.trim().length < 2) { setBuscarProdResultados([]); return; }
    const { data } = await supabase.from('inv_productos')
      .select('id, descripcion, codigo')
      .eq('empresa_id', empresaId).eq('activo', true)
      .or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%`)
      .order('descripcion').limit(20);
    setBuscarProdResultados(data || []);
  };

  const vincularProductoExistente = async (linea: Linea, productoId: number, descripcion: string) => {
    // Crear mapeo en inv_codigos_proveedor si hay clave
    if (linea.codigo_comercial || linea.cabys?.trim()) {
      const tipoCodigo = linea.codigo_comercial ? '01' : '04';
      const codigoClave = linea.codigo_comercial || linea.cabys!.trim();
      await supabase.from('inv_codigos_proveedor').upsert({
        empresa_id: empresaId,
        emisor_identificacion: modalComp!.emisor_identificacion,
        tipo_codigo: tipoCodigo,
        codigo_comercial: codigoClave,
        producto_id: productoId,
      }, { onConflict: 'empresa_id,emisor_identificacion,tipo_codigo,codigo_comercial' });
    }
    // Marcar línea como inventario
    await supabase.from('comprobantes_lineas').update({ a_inventario: true }).eq('id', linea.id);
    setLineas(prev => prev.map(l => l.id === linea.id ? { ...l, a_inventario: true } : l));
    const mapaKey = linea.codigo_comercial
      ? linea.codigo_comercial
      : linea.cabys?.trim() ? `cabys:${linea.cabys.trim()}` : `linea:${linea.id}`;
    setMapeosInv(prev => ({ ...prev, [mapaKey]: { producto_id: productoId, descripcion } }));
    setBuscarProductoLinea(null);
    setBuscarProdQuery('');
    setBuscarProdResultados([]);
  };

  const procesarXML = async (c: Comprobante) => {
    setProcesando(c.id);
    try {
      const res  = await fetch(API + '/api/correo/procesar-xml/' + c.id, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        await cargarComprobantes(true);
        // Refrescar modalComp con datos actualizados (incluye nc_referencia_numero)
        const { data: fresh } = await supabase
          .from('comprobantes_recibidos').select('*').eq('id', c.id).single();
        if (fresh && modalComp?.id === c.id) setModalComp(fresh as Comprobante);
        abrirDetalle(c.id, data.detalle, data.otrosCargos || [], data.cuadre || null, data.ivaResumen || []);
      } else {
        setModalError(data.error || 'Error al procesar');
      }
    } catch (e: any) {
      setModalError(e.message);
    }
    setProcesando(null);
  };

  const abrirConfig = async () => {
    const [{ data: cuentas }, catsResult, { data: cfg }] = await Promise.all([
      supabase.from('plan_cuentas_empresa').select('id, codigo, nombre, cuenta_base_id')
        .eq('empresa_id', empresaId).eq('activo', true).order('codigo'),
      supabase.rpc('get_asiento_categorias_effective', { p_empresa_id: empresaId })
        .then(r => r.error || !r.data?.length
          ? supabase.from('asiento_categorias').select('id, codigo, descripcion').eq('activo', true).order('codigo')
              .then(r2 => ({ data: (r2.data || []).map((c: any) => ({ categoria_id: c.id, codigo: c.codigo, descripcion: c.descripcion })) }))
          : r),
      supabase.from('empresa_config_cxp').select('*').eq('empresa_id', empresaId).maybeSingle(),
    ]);
    const cats = catsResult.data;
    setCuentasDisp(cuentas || []);
    setCategoriasDisp(cats || []);
    setConfigCuentas({
      cuenta_cxp_proveedores_id: (cfg as any)?.cuenta_cxp_id || null,
      cuenta_gasto_compras_id:   (cfg as any)?.cuenta_gasto_id || null,
      cuenta_iva_credito_id:     (cfg as any)?.cuenta_iva_credito_id || null,
      cuenta_iva_gasto_id:       (cfg as any)?.cuenta_iva_gasto_id || null,
      cuenta_otros_cargos_id:    (cfg as any)?.cuenta_otros_cargos_id || null,
      cuenta_inventario_id:      (cfg as any)?.cuenta_inventario_id || null,
      categoria_compras_id:      (cfg as any)?.categoria_compras_id || null,
    });
    setModalConfig(true);
  };

  const guardarConfig = async () => {
    setGuardandoConfig(true);
    try {
      const payload = {
        empresa_id:             empresaId,
        cuenta_cxp_id:          configCuentas.cuenta_cxp_proveedores_id || null,
        cuenta_gasto_id:        configCuentas.cuenta_gasto_compras_id || null,
        cuenta_iva_credito_id:  configCuentas.cuenta_iva_credito_id || null,
        cuenta_iva_gasto_id:    configCuentas.cuenta_iva_gasto_id || null,
        cuenta_otros_cargos_id: configCuentas.cuenta_otros_cargos_id || null,
        cuenta_inventario_id:   configCuentas.cuenta_inventario_id || null,
        categoria_compras_id:   configCuentas.categoria_compras_id || null,
        updated_at:             new Date().toISOString(),
      };
      const { data: existe } = await supabase
        .from('empresa_config_cxp').select('empresa_id').eq('empresa_id', empresaId).maybeSingle();
      let err;
      if (existe) {
        ({ error: err } = await supabase.from('empresa_config_cxp').update(payload).eq('empresa_id', empresaId));
      } else {
        ({ error: err } = await supabase.from('empresa_config_cxp').insert(payload));
      }
      if (err) throw err;
      setModalConfig(false);
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setGuardandoConfig(false);
    }
  };

  const guardarCuentaCxp = async () => {
    if (!modalCuentaCxp || !cuentaCxpSel) return;
    setGuardandoCxp(true);
    // Buscar si ya existe registro para este tercero+empresa
    const { data: existe } = await supabase
      .from('tercero_proveedor_parametros')
      .select('id')
      .eq('tercero_id', modalCuentaCxp.proveedor_id)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (existe) {
      await supabase.from('tercero_proveedor_parametros')
        .update({ cuenta_cxp_id: cuentaCxpSel })
        .eq('id', (existe as any).id);
    } else {
      await supabase.from('tercero_proveedor_parametros')
        .insert({ tercero_id: modalCuentaCxp.proveedor_id, empresa_id: empresaId, cuenta_cxp_id: cuentaCxpSel });
    }
    setGuardandoCxp(false);
    const compToContab = modalCuentaCxp;
    setModalCuentaCxp(null);
    setCuentaCxpSel(null);
    // Reintentar sin abrir el modal de CXP de nuevo
    await prepararAsiento(compToContab);
  };

  const prepararAsiento = async (c: Comprobante) => {
    setContabilizando(c.id);
    try {
      const [resp, { data: cuentasDB }] = await Promise.all([
        fetch(`${API}/api/contabilizar/${c.id}/preparar?empresa_id=${empresaId}`),
        supabase.from('plan_cuentas_empresa')
          .select('id, codigo, nombre, cuenta_base_id')
          .eq('empresa_id', empresaId).eq('activo', true).order('codigo'),
      ]);
      const data = await resp.json();
      if (!data.ok) { setModalError(data.error); return; }
      setEditorAsiento({
        comprobante:      c,
        moneda:           data.moneda,
        tipo_cambio:      data.tipo_cambio,
        descripcion:      data.descripcion,
        advertencias:     data.advertencias || [],
        lineas:           data.lineas,
        cuentasDisp:      (cuentasDB || []) as any,
        categoria_id:     data.categoria_id || null,
        categoria_nombre: data.categoria_nombre || null,
      });
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setContabilizando(null);
    }
  };

  const revertirAsiento = async () => {
    if (!resultadoContab?.asiento_id) return;
    if (!window.confirm(`¿Revertir el asiento ${resultadoContab.numero_formato}?\n\nSe creará un contra-asiento y el comprobante quedará disponible para recontabilizarse.`)) return;
    setRevirtiendo(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      // Necesitamos el comprobante_id — lo tenemos en resultadoContab si lo pasamos al verAsiento
      // Buscamos por asiento_id en comprobantes_recibidos
      const { data: comp } = await supabase
        .from('comprobantes_recibidos')
        .select('id')
        .eq('asiento_id', resultadoContab.asiento_id)
        .eq('empresa_id', empresaId)
        .maybeSingle();
      if (!comp?.id) { setModalError('No se encontró el comprobante asociado al asiento'); return; }
      const res = await fetch(`${API}/api/contabilizar/${comp.id}/revertir?empresa_id=${empresaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (!data.ok) { setModalError(data.error); return; }
      setResultadoContab(null);
      await cargarComprobantes(true);
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setRevirtiendo(false);
    }
  };

  const confirmarBatchSeleccion = async () => {
    if (seleccionados.size === 0) return;
    if (!window.confirm(`¿Contabilizar automáticamente ${seleccionados.size} comprobante(s) seleccionado(s)?\n\nSe usarán las cuentas configuradas sin revisión individual.`)) return;
    setProcesandoBatch(true);
    setResultadoBatch(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(`${API}/api/contabilizar/batch/confirmar?empresa_id=${empresaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ids: Array.from(seleccionados), empresa_id: empresaId }),
      });
      const data = await res.json();
      if (!data.ok) { setModalError(data.error); return; }
      setResultadoBatch(data);
      setSeleccionados(new Set());
      await cargarComprobantes(true);
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setProcesandoBatch(false);
    }
  };

  const cargarIvaReporte = async () => {
    setCargandoIvaReporte(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const params = new URLSearchParams({ empresa_id: String(empresaId) });
      if (ivaReporteDesde) params.set('desde', ivaReporteDesde);
      if (ivaReporteHasta) params.set('hasta', ivaReporteHasta);
      const res = await fetch(`${API}/api/contabilizar/iva-reporte?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.ok) { setModalError(data.error); return; }
      setIvaReporteDatos(data);
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setCargandoIvaReporte(false);
    }
  };

  const confirmarAsiento = async (fecha_override?: string) => {
    if (!editorAsiento) return;
    setConfirmandoAsiento(true);
    try {
      const resp = await fetch(
        `${API}/api/contabilizar/${editorAsiento.comprobante.id}/confirmar?empresa_id=${empresaId}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineas: editorAsiento.lineas, ...(fecha_override ? { fecha_override } : {}) }) }
      );
      const data = await resp.json();
      if (!data.ok) {
        // Detectar error de período fiscal → ofrecer fecha alternativa
        if (data.error?.includes('fuera del periodo') || data.error?.includes('periodo fiscal') || data.error?.includes('periodo contable')) {
          // Intentar extraer fecha fin del período del mensaje: "(YYYY-MM-DD a YYYY-MM-DD)"
          const m = data.error.match(/a (\d{4}-\d{2}-\d{2})\)/);
          const sugerida = m ? m[1] : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
          setModalFechaPeriodo({ mensaje: data.error, fechaSugerida: sugerida });
          setFechaOverride(sugerida);
        } else {
          setModalError(data.error);
        }
        return;
      }

      const { data: lineasDB } = await supabase
        .from('asiento_lineas')
        .select('linea, cuenta_id, descripcion, debito_crc, credito_crc, debito_usd, credito_usd')
        .eq('asiento_id', data.asiento_id).order('linea');
      const cuentaIds = Array.from(new Set((lineasDB || []).map((l: any) => Number(l.cuenta_id || 0)).filter(Boolean)));
      const { data: cuentasAsiento } = cuentaIds.length
        ? await supabase.from('plan_cuentas_empresa')
            .select('id, codigo, nombre')
            .eq('empresa_id', empresaId)
            .in('id', cuentaIds)
        : { data: [] as any[] };
      const cuentasMap = new Map((cuentasAsiento || []).map((c: any) => [Number(c.id), c]));
      const lineas = (lineasDB || []).map((l: any) => {
        const cuenta = cuentasMap.get(Number(l.cuenta_id || 0));
        return {
          linea: l.linea,
          descripcion: l.descripcion,
          codigo: cuenta?.codigo || '',
          nombre: cuenta?.nombre || '',
          debito_crc: Number(l.debito_crc || 0),
          credito_crc: Number(l.credito_crc || 0),
          debito_usd: Number(l.debito_usd || 0),
          credito_usd: Number(l.credito_usd || 0),
        };
      });
      const comprobante = editorAsiento.comprobante;
      setEditorAsiento(null);
      setResultadoContab({ asiento_id: data.asiento_id, numero_formato: data.numero_formato,
        advertencias: data.advertencias || [], moneda: data.moneda,
        inventario_movimientos: data.inventario_movimientos, lineas,
        fecha: comprobante.fecha_emision, descripcion: editorAsiento?.descripcion,
        emisor: comprobante.emisor_nombre, numero_comprobante: comprobante.numero_comprobante });
      await cargarComprobantes(true);
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setConfirmandoAsiento(false);
    }
  };

  const verAsiento = async (c: Comprobante) => {
    if (!c.asiento_id) return;
    const [{ data: asiento }, { data: lineasDB }] = await Promise.all([
      supabase.from('asientos').select('numero_formato, moneda').eq('id', c.asiento_id).maybeSingle(),
      supabase.from('asiento_lineas')
        .select('linea, cuenta_id, descripcion, debito_crc, credito_crc, debito_usd, credito_usd')
        .eq('asiento_id', c.asiento_id).order('linea'),
    ]);
    const cuentaIds = Array.from(new Set((lineasDB || []).map((l: any) => Number(l.cuenta_id || 0)).filter(Boolean)));
    const { data: cuentasAsiento } = cuentaIds.length
      ? await supabase.from('plan_cuentas_empresa')
          .select('id, codigo, nombre')
          .eq('empresa_id', empresaId)
          .in('id', cuentaIds)
      : { data: [] as any[] };
    const cuentasMap = new Map((cuentasAsiento || []).map((cuenta: any) => [Number(cuenta.id), cuenta]));
    const lineas = (lineasDB || []).map((l: any) => {
      const cuenta = cuentasMap.get(Number(l.cuenta_id || 0));
      return {
        linea: l.linea,
        descripcion: l.descripcion,
        codigo: cuenta?.codigo || '',
        nombre: cuenta?.nombre || '',
        debito_crc: Number(l.debito_crc || 0),
        credito_crc: Number(l.credito_crc || 0),
        debito_usd: Number(l.debito_usd || 0),
        credito_usd: Number(l.credito_usd || 0),
      };
    });
    setResultadoContab({
      asiento_id: c.asiento_id!,
      numero_formato: asiento?.numero_formato || `#${c.asiento_id}`,
      moneda: asiento?.moneda || 'CRC',
      advertencias: [],
      fecha: c.fecha_emision,
      emisor: c.emisor_nombre,
      numero_comprobante: c.numero_comprobante,
      lineas,
    });
  };

  const handleCuentaLineaSelect = (id: number) => {
    if (modalCuentaLineaIdx === null) return;
    setEditorAsiento(prev => {
      if (!prev) return prev;
      const c = prev.cuentasDisp.find((c: any) => c.id === id);
      return { ...prev, lineas: prev.lineas.map((l, i) => i === modalCuentaLineaIdx
        ? { ...l, cuenta_id: id, cuenta_codigo: c?.codigo || null, cuenta_nombre: c?.nombre || null }
        : l) };
    });
    setModalCuentaLineaIdx(null);
  };

  const guardarProporcionalidad = async () => {
    if (!modalComp) return;
    if (modalComp.contabilizado) return;
    setGuardandoProp(true);
    await supabase.from('comprobantes_recibidos')
      .update({ proporcionalidad })
      .eq('id', modalComp.id);
    setGuardandoProp(false);
    await cargarComprobantes(true);
    setModalComp(null);
  };

  const verDetalle = async (c: Comprobante) => {
    setResaltarId(c.id);
    setModalComp(c);
    setProporcionalidad(c.proporcionalidad ?? 100);
    setCargandoLineas(true);
    setLineas([]);
    setOtrosCargos([]);
    setIvaResumen([]);
    setCuadre(c.cuadra != null ? {
      sumaLineas:     0,
      totalOtros:     Number(c.total_otros_cargos || 0),
      ivaDevuelto:    Number(c.iva_devuelto || 0),
      totalCalculado: 0,
      totalDocumento: Number(c.total_comprobante),
      diferencia:     Number(c.diferencia_cuadre || 0),
      cuadra:         c.cuadra,
    } : null);
    const [{ data: lineasData }, { data: ivaData }] = await Promise.all([
      supabase.from('comprobantes_lineas').select('*').eq('comprobante_id', c.id).order('num_linea'),
      supabase.from('comprobante_iva_resumen').select('*').eq('comprobante_id', c.id).order('tarifa_codigo'),
    ]);
    const lineasCargadas: Linea[] = lineasData || [];
    const ultimaSeleccion = localStorage.getItem('mya_comprobantes_default_inv');
    if (ultimaSeleccion !== null && lineasCargadas.length > 0 && !c.contabilizado) {
      const todasNull = lineasCargadas.every(l => l.a_inventario == null);
      if (todasNull) {
        const valor = ultimaSeleccion === 'true';
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        await fetch(`${API}/api/contabilizar/comprobante/${c.id}/lineas/a-inventario`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ a_inventario: valor }),
        });
        setLineas(lineasCargadas.map(l => ({ ...l, a_inventario: valor })));
      } else {
        setLineas(lineasCargadas);
      }
    } else {
      setLineas(lineasCargadas);
    }
    setIvaResumen(ivaData || []);
    if (c.cuadra != null) {
      const sumaLineas = lineasCargadas.reduce((s: number, l: any) => s + Number(l.subtotal) + Math.max(0, Number(l.monto_impuesto) - Number(l.exoneracion_monto || 0)), 0);
      const totalOtros = Number(c.total_otros_cargos || 0);
      const ivaDevuelto = Number(c.iva_devuelto || 0);
      const totalCalculado = sumaLineas + totalOtros - ivaDevuelto;
      const totalDocumento = Number(c.total_comprobante);
      setCuadre(prev => prev ? { ...prev, sumaLineas, totalCalculado, cuadra: Math.abs(totalCalculado - totalDocumento) < 1, diferencia: totalCalculado - totalDocumento } : null);
    }
    setCargandoLineas(false);
  };

  const abrirDetalle = (id: number, detalle: Linea[], otros: OtroCargo[], cuadreData: CuadreInfo | null, iva: IvaResumen[] = []) => {
    const comp = comprobantes.find(c => c.id === id);
    if (comp) {
      setResaltarId(id);
      setModalComp({ ...comp, procesado: true });
      setLineas(detalle);
      setOtrosCargos(otros);
      setCuadre(cuadreData);
      setIvaResumen(iva);
    }
  };

  const exportarExcel = () => {
    const datos = filtrados.map(c => ({
      'Fecha':     c.fecha_emision,
      'Emisor':    c.emisor_nombre,
      'Número':    c.numero_comprobante,
      'Tipo':      TIPO_LABELS[c.tipo] || c.tipo,
      'Doc XML':   c.tipo_xml,
      'Total':     Number(c.total_comprobante),
      'Moneda':    c.moneda,
      'Remitente': c.email_remitente,
      'Estado':    c.procesado ? 'Procesado' : 'Pendiente',
      'XML':       c.archivo_xml,
      'MH':        c.archivo_xml_mh,
      'PDF':       c.archivo_pdf,
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comprobantes');
    XLSX.writeFile(wb, 'comprobantes_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };

  // Asigna cuenta CXP al proveedor desde la config de empresa (si no tiene ya una)
  const asignarCuentaCxpDesdeConfig = async (terceroId: number) => {
    // empresa_config_cxp puede tener ids de empresa (nuevo) o base (legacy).
    // tercero_proveedor_parametros siempre usa plan_cuentas_empresa.id.
    const { data: cfg } = await supabase
      .from('empresa_config_cxp').select('cuenta_cxp_id').eq('empresa_id', empresaId).maybeSingle();
    const rawCuentaId = Number((cfg as any)?.cuenta_cxp_id || 0);
    if (!rawCuentaId) return;
    const { data: cuentaEmp } = await supabase
      .from('plan_cuentas_empresa')
      .select('id')
      .eq('empresa_id', empresaId)
      .or(`id.eq.${rawCuentaId},cuenta_base_id.eq.${rawCuentaId}`)
      .maybeSingle();
    const cuentaId = (cuentaEmp as any)?.id;
    if (!cuentaId) return;
    const { data: existing } = await supabase
      .from('tercero_proveedor_parametros')
      .select('id, cuenta_cxp_id').eq('tercero_id', terceroId).eq('empresa_id', empresaId).maybeSingle();
    if (existing) {
      if (!(existing as any).cuenta_cxp_id)
        await supabase.from('tercero_proveedor_parametros')
          .update({ cuenta_cxp_id: cuentaId }).eq('id', (existing as any).id);
    } else {
      await supabase.from('tercero_proveedor_parametros')
        .insert({ tercero_id: terceroId, empresa_id: empresaId, cuenta_cxp_id: cuentaId });
    }
  };

  const abrirOVincularProveedor = async (c: Comprobante) => {
    const { data: existente } = await supabase
      .from('terceros').select('id').eq('empresa_id', empresaId)
      .eq('identificacion', c.emisor_identificacion).maybeSingle();
    if (existente) {
      const terceroId = (existente as any).id;
      await supabase.from('tercero_roles').upsert(
        { tercero_id: terceroId, rol: 'proveedor', activo: true },
        { onConflict: 'tercero_id,rol' }
      );
      await asignarCuentaCxpDesdeConfig(terceroId);
      await supabase.from('comprobantes_recibidos').update({ proveedor_id: terceroId }).eq('id', c.id);
      await cargarComprobantes(true);
    } else {
      setModalCrearProv(c);
    }
  };

  const crearProveedor = async (c: Comprobante) => {
    setCreandoProv(true);
    try {
      let terceroId: number | null = null;
      const { data: existente } = await supabase
        .from('terceros').select('id').eq('empresa_id', empresaId)
        .eq('identificacion', c.emisor_identificacion).maybeSingle();

      if (existente) {
        terceroId = (existente as any).id;
      } else {
        const { data: tercero, error: tErr } = await supabase
          .from('terceros')
          .insert({
            empresa_id:          empresaId,
            codigo:              c.emisor_identificacion,
            tipo_identificacion: c.emisor_tipo_id || '02',
            identificacion:      c.emisor_identificacion,
            razon_social:        c.emisor_nombre,
            email:               c.email_remitente || null,
            activo:              true,
          })
          .select('id').single();
        if (tErr) throw tErr;
        terceroId = (tercero as any).id;
      }

      if (!terceroId) throw new Error('No se pudo obtener el ID del tercero');

      await supabase.from('tercero_roles').upsert(
        { tercero_id: terceroId, rol: 'proveedor', activo: true },
        { onConflict: 'tercero_id,rol' }
      );
      await asignarCuentaCxpDesdeConfig(terceroId);
      await supabase.from('comprobantes_recibidos').update({ proveedor_id: terceroId }).eq('id', c.id);

      setModalCrearProv(null);
      await cargarComprobantes(true);
    } catch (e: any) {
      setModalError(e.message);
    }
    setCreandoProv(false);
  };

  const exportarLineasExcel = () => {
    if (!modalComp || lineas.length === 0) return;
    const datos = lineas.map(l => ({
      '#':            l.num_linea,
      'Código':       l.codigo,
      'Descripción':  l.descripcion,
      'Unidad':       l.unidad,
      'Cantidad':     l.cantidad,
      'Precio Unit.': l.precio_unitario,
      'Descuento':    l.descuento_monto,
      'Subtotal':     l.subtotal,
      'Tarifa IVA %': l.tarifa_iva,
      'Monto IVA':    l.monto_impuesto,
      'Total Línea':  l.total_linea,
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Líneas');
    XLSX.writeFile(wb, 'lineas_' + modalComp.numero_comprobante + '.xlsx');
  };

  // ── Vista detalle (full page) ────────────────────────────────────────────────
  if (modalComp) return (
    <div className="p-6 text-gray-200">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-5">
        <button onClick={() => setModalComp(null)} className="hover:text-green-400 transition-colors">
          ← Comprobantes Recibidos
        </button>
        <span>/</span>
        <span className="text-gray-300">{modalComp.emisor_nombre}</span>
        <span>/</span>
        <span className="text-gray-400">{modalComp.numero_comprobante || fmtFecha(modalComp.fecha_emision)}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-green-400">{modalComp.emisor_nombre}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{fmtFecha(modalComp.fecha_emision)} · {modalComp.numero_comprobante}</p>
          <div className="flex gap-4 mt-1">
            <span className="text-xs text-gray-500">Moneda: <span className="text-gray-300 font-mono">{modalComp.moneda}</span></span>
            {modalComp.moneda !== 'CRC' && modalComp.tipo_cambio && (
              <span className="text-xs text-gray-500">T.C.: <span className="text-yellow-400 font-mono">{Number(modalComp.tipo_cambio).toLocaleString('es-CR', { minimumFractionDigits: 5 })}</span></span>
            )}
          </div>
          {/* F4: Referencia NC → FE original */}
          {(modalComp.tipo === 'NOTA_CREDITO' || modalComp.tipo === 'NOTA_DEBITO') && modalComp.nc_referencia_numero && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-900/30 border border-blue-700/50 text-sm w-fit">
              <span className="text-blue-400 font-medium">Documento referenciado:</span>
              {modalComp.nc_referencia_id ? (
                <button
                  onClick={() => {
                    const fe = comprobantes.find(c => c.id === modalComp.nc_referencia_id);
                    if (fe) verDetalle(fe);
                  }}
                  className="font-mono text-blue-300 hover:text-white underline underline-offset-2 transition-colors"
                  title={`Ver FE original — Clave: ${modalComp.nc_referencia_numero}`}>
                  {modalComp.nc_referencia_numero && modalComp.nc_referencia_numero.length === 50
                    ? `...${modalComp.nc_referencia_numero.slice(-20)}`
                    : modalComp.nc_referencia_numero} ↗
                </button>
              ) : (
                <span className="font-mono text-blue-300"
                  title={`FE no registrada en el sistema — Clave: ${modalComp.nc_referencia_numero}`}>
                  {modalComp.nc_referencia_numero && modalComp.nc_referencia_numero.length === 50
                    ? `...${modalComp.nc_referencia_numero.slice(-20)}`
                    : modalComp.nc_referencia_numero}
                  <span className="text-gray-500 text-xs ml-1">(no registrada)</span>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {modalComp.archivo_xml && (
            <button
              onClick={async () => {
                if (modalComp.contabilizado && !window.confirm('Este comprobante ya está contabilizado.\n\nReprocesar actualizará los datos del XML (incluyendo la referencia NC) pero reiniciará los flags de inventario.\n\n¿Continuar?')) return;
                await procesarXML(modalComp);
              }}
              disabled={procesando === modalComp.id}
              title="Volver a leer el XML: actualiza líneas, cuadre y referencia NC"
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 px-3 py-2 rounded text-sm text-gray-300 transition-colors">
              {procesando === modalComp.id ? '⏳' : '↺ Reprocesar'}
            </button>
          )}
          {modalComp.archivo_pdf && (
            <a href={urlArchivo(modalComp.archivo_pdf)} target="_blank" rel="noreferrer"
              className="bg-red-900 hover:bg-red-800 px-4 py-2 rounded text-sm flex items-center gap-1">
              📄 PDF
            </a>
          )}
          <button onClick={exportarLineasExcel} disabled={lineas.length === 0}
            className="bg-green-800 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded text-sm">
            📊 Excel
          </button>
        </div>
      </div>

      {/* Tabla de líneas */}
      {cargandoLineas ? (
        <p className="text-gray-400 text-center py-16">Cargando líneas...</p>
      ) : lineas.length === 0 ? (
        <p className="text-gray-500 text-center py-16">No hay líneas procesadas</p>
      ) : (
        <>
        <div className="overflow-x-auto rounded-xl border border-gray-700 mb-6">
        <table className="w-full text-xs">
          <thead className="bg-gray-900 text-gray-400 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Descripción</th>
              <th className="px-3 py-2 text-center">Unidad</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Precio Unit.</th>
              <th className="px-3 py-2 text-right">Descuento</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
              <th className="px-3 py-2 text-right">IVA %</th>
              <th className="px-3 py-2 text-right">Monto IVA</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left min-w-[220px]">
                <div className="flex flex-col gap-1.5">
                  <span>Inventario</span>
                  {!modalComp?.contabilizado && (
                    <>
                      <div className="flex gap-1">
                        <button disabled={togglingTodas} onClick={() => toggleTodas(true)}
                          title="Marcar todas las líneas como Inventario"
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium normal-case bg-green-900 text-green-300 hover:bg-green-800 disabled:opacity-40">
                          📦 Todo Inv
                        </button>
                        <button disabled={togglingTodas} onClick={() => toggleTodas(false)}
                          title="Marcar todas las líneas como Gasto"
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium normal-case bg-red-900 text-red-300 hover:bg-red-800 disabled:opacity-40">
                          💸 Todo Gasto
                        </button>
                      </div>
                      {/* Categoría predefinida para el documento */}
                      <select value={categoriaDoc} onChange={e => setCategoriaDoc(e.target.value ? Number(e.target.value) : '')}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-[10px] text-gray-300 normal-case font-normal focus:outline-none focus:border-blue-500">
                        <option value="">— Categoría p/nuevos —</option>
                        {categoriasInv.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
                      </select>
                      {/* Botón crear todas las líneas de inventario sin mapeo */}
                      {(() => {
                        const mapaKeyDe = (l: Linea) => l.codigo_comercial ? l.codigo_comercial : l.cabys?.trim() ? `cabys:${l.cabys.trim()}` : `linea:${l.id}`;
                        const pendientes = lineas.filter(l => {
                          const esInv = l.a_inventario === true || (l.a_inventario == null && l.tipo_linea === 'M');
                          return esInv && !mapeosInv[mapaKeyDe(l)];
                        }).length;
                        if (pendientes === 0) return null;
                        return (
                          <button disabled={creandoTodas} onClick={crearTodasLasLineas}
                            title={`Crear ${pendientes} producto(s) sin mapeo usando categoría predefinida`}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium normal-case bg-blue-900 text-blue-300 hover:bg-blue-800 disabled:opacity-40 flex items-center gap-1">
                            {creandoTodas
                              ? <>⏳ {progresoCreadoTodas ? `${progresoCreadoTodas.ok + progresoCreadoTodas.skip}/${progresoCreadoTodas.total}` : '...'}</>
                              : <>🚀 Crear {pendientes} sin mapeo</>}
                          </button>
                        );
                      })()}
                      {progresoCreadoTodas && !creandoTodas && (
                        <span className="text-[10px] text-green-400 normal-case font-normal">
                          ✓ {progresoCreadoTodas.ok} creados{progresoCreadoTodas.skip > 0 ? `, ${progresoCreadoTodas.skip} omitidos` : ''}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={l.id} className={'border-t border-gray-700 ' + (i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-850')}>
                <td className="px-3 py-2 text-gray-400">{l.num_linea}</td>
                <td className="px-3 py-2 text-gray-400 font-mono">{l.codigo || '—'}</td>
                <td className="px-3 py-2 text-gray-200">{l.descripcion}</td>
                <td className="px-3 py-2 text-gray-400 text-center">{l.unidad}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-200">{Number(l.cantidad).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-200">{Number(l.precio_unitario).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-mono text-yellow-400">{Number(l.descuento_monto).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-200">{Number(l.subtotal).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-mono text-blue-400">{l.tarifa_iva}%</td>
                <td className="px-3 py-2 text-right font-mono text-blue-400">{Math.max(0, Number(l.monto_impuesto) - Number(l.exoneracion_monto || 0)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-mono text-green-400 font-bold">{(Number(l.subtotal) + Math.max(0, Number(l.monto_impuesto) - Number(l.exoneracion_monto || 0))).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2">
                  {(() => {
                    const esInv = l.a_inventario === true || (l.a_inventario == null && l.tipo_linea === 'M');
                    const esGasto = l.a_inventario === false || (l.a_inventario == null && l.tipo_linea === 'S');
                    const bloqueado = toggling === l.id || !!modalComp?.contabilizado;
                    return (
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          <button disabled={bloqueado}
                            onClick={() => toggleInventario(l, esInv && l.a_inventario !== null ? null : true)}
                            title="Marcar como Inventario"
                            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-40 ${esInv ? 'bg-green-800 text-green-300' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'}`}>
                            📦 Inv
                          </button>
                          <button disabled={bloqueado}
                            onClick={() => toggleInventario(l, esGasto && l.a_inventario !== null ? null : false)}
                            title="Marcar como Gasto"
                            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-40 ${l.a_inventario === false ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'}`}>
                            💸 Gasto
                          </button>
                        </div>
                        {esInv && (() => {
                          const mapaKey = l.codigo_comercial
                            ? l.codigo_comercial
                            : l.cabys?.trim() ? `cabys:${l.cabys.trim()}` : `linea:${l.id}`;
                          const mapeo = mapeosInv[mapaKey];
                          const sinClave = !l.codigo_comercial && !l.cabys?.trim();
                          if (mapeo) return (
                            <span className="text-green-400 text-xs" title={mapeo.descripcion}>
                              ✓ {mapeo.descripcion}
                            </span>
                          );
                          if (modalComp?.contabilizado) return (
                            <span className="text-gray-500 text-xs">Sin mapear</span>
                          );
                          return (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex gap-1">
                                <button onClick={() => { setBuscarProductoLinea(l); setBuscarProdQuery(''); setBuscarProdResultados([]); }}
                                  className="text-xs text-purple-400 hover:text-purple-300">
                                  🔍 Buscar
                                </button>
                                <span className="text-gray-600 text-xs">·</span>
                                <button onClick={() => setCreandoProducto(l)} className="text-xs text-blue-400 hover:text-blue-300">
                                  ➕ Crear
                                </button>
                              </div>
                              {sinClave && (
                                <span className="text-orange-400 text-xs leading-tight"
                                  title="El XML no incluye CodigoComercial ni CABYS — no se mapeará automáticamente en futuros documentos.">
                                  ⚠ Sin clave de match
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {l.a_inventario == null && <span className="text-gray-600 text-xs">auto</span>}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-900 border-t border-gray-600">
            <tr>
              <td colSpan={7} className="px-3 py-2 text-gray-400 font-medium">Total ({lineas.length} líneas)</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-gray-200">{lineas.reduce((s, l) => s + Number(l.subtotal), 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
              <td></td>
              <td className="px-3 py-2 text-right font-mono font-bold text-blue-400">{lineas.reduce((s, l) => s + Math.max(0, Number(l.monto_impuesto) - Number(l.exoneracion_monto || 0)), 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-green-400">{lineas.reduce((s, l) => s + Number(l.subtotal) + Math.max(0, Number(l.monto_impuesto) - Number(l.exoneracion_monto || 0)), 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        </div>

        {/* Sección de cuadre */}
        {(cuadre || otrosCargos.length > 0) && (
          <div className="mb-6 border border-gray-700 rounded-lg overflow-hidden text-xs">
            <div className="bg-gray-900 px-4 py-2 text-gray-400 uppercase font-semibold tracking-wide">Verificación de cuadre</div>
            {otrosCargos.length > 0 && (
              <div className="px-4 py-2 border-b border-gray-700">
                <p className="text-gray-400 mb-1 font-medium">Otros cargos</p>
                {otrosCargos.map((o, i) => (
                  <div key={i} className="flex justify-between text-gray-300 py-0.5">
                    <span>{o.detalle}</span>
                    <span className="font-mono text-orange-400">+ {Number(o.monto_cargo).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            )}
            {cuadre && (
              <div className="px-4 py-3 space-y-1">
                <div className="flex justify-between text-gray-400"><span>Suma líneas</span><span className="font-mono">{cuadre.sumaLineas.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span></div>
                {cuadre.totalOtros > 0 && <div className="flex justify-between text-orange-400"><span>(+) Otros cargos</span><span className="font-mono">{cuadre.totalOtros.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span></div>}
                {cuadre.ivaDevuelto > 0 && <div className="flex justify-between text-yellow-400"><span>(-) IVA devuelto tarjeta</span><span className="font-mono">{cuadre.ivaDevuelto.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span></div>}
                <div className="flex justify-between text-white font-bold border-t border-gray-700 pt-1 mt-1"><span>Total calculado</span><span className="font-mono">{cuadre.totalCalculado.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-gray-400"><span>Total documento (XML)</span><span className="font-mono">{cuadre.totalDocumento.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span></div>
                <div className={`flex justify-between items-center pt-2 font-bold ${cuadre.cuadra ? 'text-green-400' : 'text-red-400'}`}>
                  <span>{cuadre.cuadra ? '✅ Documento cuadrado — listo para contabilidad' : '⚠️ No cuadra — revisar antes de contabilizar'}</span>
                  {!cuadre.cuadra && <span className="font-mono">Dif: {cuadre.diferencia.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Desglose IVA por tarifa */}
        {ivaResumen.length > 0 && (() => {
          const ivaNetoTotal = ivaResumen.reduce((s, r) => s + Math.max(0, Number(r.monto_iva) - Number(r.monto_exonerado)), 0);
          return (
          <div className="mb-6 border border-gray-700 rounded-lg overflow-hidden text-xs">
            <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
              <span className="text-gray-400 uppercase font-semibold tracking-wide">Crédito Fiscal IVA — por tarifa</span>
              {ivaNetoTotal > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Proporcionalidad:</span>
                  <input type="number" min={0} max={100} step={0.01} value={proporcionalidad}
                    onChange={e => setProporcionalidad(Math.min(100, Math.max(0, Number(e.target.value))))}
                    disabled={!!modalComp?.contabilizado}
                    className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-right text-yellow-400 font-mono focus:outline-none focus:border-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed" />
                  <span className="text-gray-500">%</span>
                  {!modalComp?.contabilizado && (
                    <button onClick={guardarProporcionalidad} disabled={guardandoProp}
                      className="bg-yellow-800 hover:bg-yellow-700 disabled:opacity-50 px-2 py-0.5 rounded text-yellow-200 font-medium">
                      {guardandoProp ? '...' : 'Guardar'}
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={() => setModalComp(null)}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-0.5 rounded text-gray-300 font-medium transition-colors">
                  ← Salir
                </button>
              )}
            </div>
            <table className="w-full">
              <thead className="bg-gray-900 text-gray-500 border-t border-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left">Tarifa</th>
                  <th className="px-4 py-2 text-right">Base imponible</th>
                  <th className="px-4 py-2 text-right">Monto IVA</th>
                  <th className="px-4 py-2 text-right">Exonerado</th>
                  <th className="px-4 py-2 text-right text-cyan-400">IVA Neto</th>
                  {ivaNetoTotal > 0 && <th className="px-4 py-2 text-right text-green-400">IVA acreditable</th>}
                </tr>
              </thead>
              <tbody>
                {ivaResumen.map((r, i) => {
                  const ivaNeto = Math.max(0, Number(r.monto_iva) - Number(r.monto_exonerado));
                  return (
                  <tr key={r.tarifa_codigo} className={'border-t border-gray-700 ' + (i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-850')}>
                    <td className="px-4 py-2 text-gray-300">{TARIFA_LABELS[r.tarifa_codigo] || `Tarifa ${r.tarifa_codigo}`}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-200">{Number(r.base_imponible).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right font-mono text-blue-400">{Number(r.monto_iva).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right font-mono text-yellow-400">{Number(r.monto_exonerado) > 0 ? Number(r.monto_exonerado).toLocaleString('es-CR', { minimumFractionDigits: 2 }) : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono text-cyan-400 font-bold">{ivaNeto.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                    {ivaNetoTotal > 0 && <td className="px-4 py-2 text-right font-mono text-green-400 font-bold">{(ivaNeto * proporcionalidad / 100).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>}
                  </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-900 border-t border-gray-600 font-bold">
                <tr>
                  <td className="px-4 py-2 text-gray-400">Total</td>
                  <td className="px-4 py-2 text-right font-mono text-white">{ivaResumen.reduce((s, r) => s + Number(r.base_imponible), 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-mono text-blue-400">{ivaResumen.reduce((s, r) => s + Number(r.monto_iva), 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-mono text-yellow-400">{ivaResumen.reduce((s, r) => s + Number(r.monto_exonerado), 0) > 0 ? ivaResumen.reduce((s, r) => s + Number(r.monto_exonerado), 0).toLocaleString('es-CR', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td className="px-4 py-2 text-right font-mono text-cyan-400">{ivaNetoTotal.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                  {ivaNetoTotal > 0 && <td className="px-4 py-2 text-right font-mono text-green-400">{(ivaNetoTotal * proporcionalidad / 100).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
          );
        })()}
        </>
      )}

      {/* Sub-modales que también se usan en esta vista */}
      {creandoProducto && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[110] p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-base mb-1">➕ Crear producto en inventario</h3>
            <p className="text-gray-500 text-xs mb-4">Se creará con los datos del XML y se mapeará automáticamente al proveedor.</p>
            <div className="space-y-2 mb-5">
              <div><span className="text-gray-500 text-xs">Descripción</span><p className="text-gray-200 text-sm font-medium">{creandoProducto.descripcion}</p></div>
              <div className="flex gap-6">
                <div><span className="text-gray-500 text-xs">Unidad</span><p className="text-gray-300 text-sm">{creandoProducto.unidad || '—'}</p></div>
                <div><span className="text-gray-500 text-xs">IVA</span><p className="text-gray-300 text-sm">{creandoProducto.tarifa_iva}%</p></div>
                <div>
                  <span className="text-gray-500 text-xs">CABYS</span>
                  <p className="text-sm font-mono">{creandoProducto.cabys?.trim() && creandoProducto.cabys.trim().length === 13 ? <span className="text-blue-400">{creandoProducto.cabys.trim()}</span> : <span className="text-yellow-600">Sin CABYS (completar en catálogo)</span>}</p>
                </div>
              </div>
              {creandoProducto.codigo_comercial && <div><span className="text-gray-500 text-xs">Código proveedor (se mapeará)</span><p className="text-gray-300 text-sm font-mono">{creandoProducto.codigo_comercial}</p></div>}
              <div>
                <span className="text-gray-500 text-xs">Categoría</span>
                <select value={categoriaNueva} onChange={e => setCategoriaNueva(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1 w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-green-500">
                  <option value="">— Sin categoría —</option>
                  {categoriasInv.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => ejecutarCrearProducto(creandoProducto)} disabled={creandoProd}
                className="flex-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium text-white">
                {creandoProd ? 'Creando...' : 'Crear producto'}
              </button>
              <button onClick={() => setCreandoProducto(null)} disabled={creandoProd}
                className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal buscar producto existente */}
      {buscarProductoLinea && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[110] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-lg flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <p className="text-purple-400 font-bold text-sm">Buscar producto en catálogo</p>
                <p className="text-gray-400 text-xs mt-0.5 truncate">{buscarProductoLinea.descripcion}</p>
              </div>
              <button onClick={() => setBuscarProductoLinea(null)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="px-4 py-3 border-b border-gray-700">
              <input
                autoFocus
                type="text"
                value={buscarProdQuery}
                onChange={e => buscarProductos(e.target.value)}
                placeholder="Buscar por descripción o código..."
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {buscarProdQuery.trim().length < 2
                ? <p className="px-4 py-6 text-center text-gray-500 text-sm">Escriba al menos 2 caracteres para buscar</p>
                : buscarProdResultados.length === 0
                  ? <p className="px-4 py-6 text-center text-gray-500 text-sm">Sin resultados</p>
                  : buscarProdResultados.map(p => (
                      <button key={p.id} onClick={() => vincularProductoExistente(buscarProductoLinea, p.id, p.descripcion)}
                        className="w-full text-left px-4 py-2.5 border-b border-gray-700 hover:bg-gray-700 transition-colors flex items-baseline gap-3">
                        {p.codigo && <span className="font-mono text-xs text-blue-400 shrink-0">{p.codigo}</span>}
                        <span className="text-sm text-gray-200 truncate">{p.descripcion}</span>
                      </button>
                    ))
              }
            </div>
          </div>
        </div>
      )}

      {modalError && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-red-700 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-red-400 font-bold text-lg mb-3">{tituloError}</h3>
            <p className="text-gray-300 text-sm mb-3">{detalleError}</p>
            {esErrorCuentaCxp && (
              <div className="mb-4 rounded border border-yellow-700 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-200">
                Configure la cuenta en `Cuentas CXP` para continuar.
              </div>
            )}
            <div className="flex gap-3">
              {esErrorCuentaCxp && (
                <button
                  onClick={() => { setModalError(null); abrirConfig(); }}
                  className="flex-1 bg-yellow-700 hover:bg-yellow-600 px-4 py-2 rounded text-sm font-medium text-white"
                >
                  Abrir Cuentas CXP
                </button>
              )}
              <button onClick={() => setModalError(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-white">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 text-gray-200">
      <h1 className="text-2xl font-bold text-green-400 mb-6">
        Comprobantes Electrónicos Recibidos
      </h1>

      <div className="mb-6">
        <DescargaCorreo empresaId={empresaId} onDescargaCompletada={() => cargarComprobantes()} />
      </div>

      {/* Resumen por tipo */}
      {!cargando && resumen.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {resumen.map(r => (
            <div key={r.tipo} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col gap-1">
              <span className={'text-xs px-2 py-1 rounded self-start ' + (TIPO_COLORS[r.tipo] || 'bg-gray-700 text-gray-300')}>
                {TIPO_LABELS[r.tipo]}
              </span>
              <span className="text-2xl font-bold text-white mt-1">{r.cantidad}</span>
              <span className="text-xs text-gray-500">documentos</span>
            </div>
          ))}
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 flex flex-col gap-1">
            <span className="text-xs px-2 py-1 rounded self-start bg-gray-700 text-gray-300">Total general</span>
            <span className="text-2xl font-bold text-green-400 mt-1">{filtrados.length}</span>
            <span className="text-xs text-gray-500">comprobantes</span>
          </div>
        </div>
      )}

      {/* Búsqueda y acciones */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por emisor o número..."
          value={filtro}
          onChange={e => { setFiltro(e.target.value); setPagina(1); }}
          className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm flex-1 focus:outline-none focus:border-green-500"
        />
        <button onClick={() => cargarComprobantes()}
          className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">
          🔄 Refrescar
        </button>
        <button onClick={exportarExcel} disabled={filtrados.length === 0}
          className="bg-green-800 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium">
          📊 Excel
        </button>
        <button onClick={() => { setModalIvaReporte(true); cargarIvaReporte(); }}
          className="bg-blue-800 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium">
          🧾 IVA D-104
        </button>
        {seleccionados.size > 0 && (
          <button onClick={confirmarBatchSeleccion} disabled={procesandoBatch}
            className="bg-purple-800 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium flex items-center gap-1.5">
            {procesandoBatch ? '⏳' : '📒'} Contab. {seleccionados.size}
          </button>
        )}
        <button onClick={abrirConfig} title="Configurar cuentas contables para contabilización"
          className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm">
          ⚙️ Cuentas CXP
        </button>
      </div>

      {/* Tabla */}
      {cargando ? (
        <p className="text-gray-400">Cargando...</p>
      ) : (
        <>
          <div ref={listaRef} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-2 py-3 text-center w-8">
                    <input type="checkbox" title="Seleccionar todos los contabilizables de esta página"
                      className="accent-purple-500"
                      onChange={e => {
                        const contabilizables = paginados.filter(c => c.procesado && c.cuadra && c.proveedor_id && !c.contabilizado);
                        if (e.target.checked) setSeleccionados(prev => new Set(Array.from(prev).concat(contabilizables.map(c => c.id))));
                        else setSeleccionados(prev => { const s = new Set(prev); contabilizables.forEach(c => s.delete(c.id)); return s; });
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Emisor</th>
                  <th className="px-4 py-3 text-left">Número</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Doc XML</th>
                  <th className="px-4 py-3 text-center">Archivos</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map((c, i) => (
                  <tr key={c.id}
                    id={`comp-row-${c.id}`}
                    className={'border-t border-gray-700 ' + (c.id === resaltarId ? 'bg-green-900/30 ring-1 ring-inset ring-green-500 ' : 'hover:bg-gray-700 ' + (i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-850')) + (c.tipo === 'NOTA_CREDITO' ? ' border-l-2 border-l-red-500' : '')}>
                    <td className="px-2 py-3 text-center">
                      {c.procesado && c.cuadra && c.proveedor_id && !c.contabilizado && (
                        <input type="checkbox" className="accent-purple-500"
                          checked={seleccionados.has(c.id)}
                          onChange={e => setSeleccionados(prev => { const s = new Set(prev); if (e.target.checked) s.add(c.id); else s.delete(c.id); return s; })}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtFecha(c.fecha_emision)}</td>
                    <td className="px-4 py-3 text-gray-200 max-w-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{c.emisor_nombre || '—'}</span>
                        {/* F1: Duplicado */}
                        {duplicadosSet.has(c.id) && (
                          <span title="⚠ Número de comprobante duplicado para este emisor"
                            className="shrink-0 text-[10px] bg-red-900 text-red-300 border border-red-700 rounded px-1 py-0.5 font-bold cursor-help">
                            DUP
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-gray-400">{c.numero_comprobante || '—'}</span>
                        {/* F4: Enlace NC → FE original */}
                        {(c.tipo === 'NOTA_CREDITO' || c.tipo === 'NOTA_DEBITO') && c.nc_referencia_numero && (
                          <span className="text-[9px] text-blue-300 bg-blue-900/40 border border-blue-700/60 rounded px-1 py-0.5 w-fit"
                            title={`Referencia a FE — Clave: ${c.nc_referencia_numero}`}>
                            → FE: ...{c.nc_referencia_numero.slice(-12)}{c.nc_referencia_id ? ' ✓' : ''}
                          </span>
                        )}
                        {/* F2: Alerta proporcionalidad — procesado, no contabilizado, tiene IVA implícito, prop=100 por defecto */}
                        {c.procesado && !c.contabilizado && (c.proporcionalidad == null || c.proporcionalidad === 100) &&
                          (Number(c.total_comprobante) - Number(c.total_otros_cargos || 0)) > 0 && (
                          <span title="Proporcionalidad IVA al 100% (valor por defecto). Confirme si aplica antes de contabilizar."
                            className="text-[9px] text-yellow-400 bg-yellow-900/40 border border-yellow-700/60 rounded px-1 py-0.5 cursor-help w-fit">
                            ⚠ Prop 100%
                          </span>
                        )}
                      </div>
                    </td>
                     <td className="px-4 py-3 text-right font-mono text-green-400">
                        {Number(c.total_comprobante).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                      </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        {c.archivo_xml ? (
                          <a href={urlArchivo(c.archivo_xml)} target="_blank" rel="noreferrer"
                            className="bg-gray-700 hover:bg-green-700 text-xs px-2 py-1 rounded text-gray-300 transition-colors">
                            {c.tipo_xml || 'XML'}
                          </a>
                        ) : null}
                        {c.archivo_xml_mh ? (
                          <a href={urlArchivo(c.archivo_xml_mh)} target="_blank" rel="noreferrer"
                            className="bg-gray-700 hover:bg-purple-700 text-xs px-2 py-1 rounded text-gray-300 transition-colors">
                            MH
                          </a>
                        ) : null}
                        {c.archivo_pdf ? (
                          <a href={urlArchivo(c.archivo_pdf)} target="_blank" rel="noreferrer"
                            className="bg-gray-700 hover:bg-red-700 text-xs px-2 py-1 rounded text-gray-300 transition-colors">
                            PDF
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1 flex-wrap">
                        {c.procesado ? (
                          <>
                            <button onClick={() => verDetalle(c)}
                              className="bg-green-900 hover:bg-green-700 text-green-300 text-xs px-2 py-1 rounded transition-colors">
                              ✅ Ver líneas
                            </button>
                            {!c.proveedor_id && (
                              <button onClick={() => abrirOVincularProveedor(c)} title="Vincular o crear proveedor"
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-yellow-800 text-gray-400 hover:text-yellow-300 transition-colors">
                                + Prov.
                              </button>
                            )}
                            {c.contabilizado ? (
                              <button onClick={() => verAsiento(c)} title={`Ver asiento #${c.asiento_id}`}
                                className="text-xs px-2 py-1 rounded bg-purple-900 hover:bg-purple-700 text-purple-300 transition-colors">
                                📋 Asiento
                              </button>
                            ) : c.cuadra && c.proveedor_id ? (
                              <button
                                onClick={() => prepararAsiento(c)}
                                disabled={contabilizando === c.id}
                                title="Generar asiento contable y registro CXP"
                                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-purple-800 text-gray-400 hover:text-purple-200 disabled:opacity-40 transition-colors">
                                {contabilizando === c.id ? '⏳' : '📒 Contab.'}
                              </button>
                            ) : null}
                          </>
                        ) : c.tipo_xml && c.tipo_xml !== 'MH' ? (
                          <button
                            onClick={() => procesarXML(c)}
                            disabled={procesando === c.id || !c.archivo_xml}
                            className="bg-gray-700 hover:bg-blue-700 disabled:opacity-40 text-xs px-2 py-1 rounded text-gray-300 transition-colors"
                          >
                            {procesando === c.id ? '⏳' : '⚙️ Procesar'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {paginados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No hay comprobantes registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-500">
                Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, filtrados.length)} de {filtrados.length}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setPagina(1)} disabled={pagina === 1}
                  className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs">«</button>
                <button onClick={() => setPagina(p => p - 1)} disabled={pagina === 1}
                  className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs">‹</button>
                {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                  const inicio = Math.max(1, pagina - 2);
                  const page = inicio + i;
                  if (page > totalPaginas) return null;
                  return (
                    <button
                      key={page}
                      onClick={() => setPagina(page)}
                      className={`px-3 py-1 rounded text-xs ${page === pagina ? '"bg-green-700 text-white"' : '"bg-gray-700 hover:bg-gray-600 text-gray-200"'}`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button onClick={() => setPagina(p => p + 1)} disabled={pagina === totalPaginas}
                  className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs">›</button>
                <button onClick={() => setPagina(totalPaginas)} disabled={pagina === totalPaginas}
                  className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs">»</button>
              </div>
            </div>
          )}
        </>
      )}


      {/* Modal error */}
      {modalError && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-red-700 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-red-400 font-bold text-lg mb-3">{tituloError}</h3>
            <p className="text-gray-300 text-sm mb-3">{detalleError}</p>
            {esErrorCuentaCxp && (
              <div className="mb-4 rounded border border-yellow-700 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-200">
                Configure la cuenta en `Cuentas CXP` para continuar.
              </div>
            )}
            <div className="flex gap-3">
              {esErrorCuentaCxp && (
                <button
                  onClick={() => { setModalError(null); abrirConfig(); }}
                  className="flex-1 bg-yellow-700 hover:bg-yellow-600 px-4 py-2 rounded text-sm font-medium text-white"
                >
                  Abrir Cuentas CXP
                </button>
              )}
              <button onClick={() => setModalError(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-white">Cerrar</button>
            </div>
          </div>
        </div>
      )}


      {/* Modal crear proveedor desde XML */}
      {modalCrearProv && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-green-400 font-bold text-lg mb-1">Crear proveedor</h3>
            <p className="text-gray-400 text-xs mb-4">Se creará el tercero con los datos del emisor del XML y se asignará como proveedor.</p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs text-gray-400">Tipo identificación</label>
                <select
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm mt-1"
                  value={modalCrearProv.emisor_tipo_id || '02'}
                  onChange={e => setModalCrearProv({ ...modalCrearProv, emisor_tipo_id: e.target.value })}
                >
                  <option value="01">01 — Física</option>
                  <option value="02">02 — Jurídica</option>
                  <option value="03">03 — DIMEX</option>
                  <option value="04">04 — NITE</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">Identificación</label>
                <input className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm mt-1"
                  value={modalCrearProv.emisor_identificacion || ''}
                  onChange={e => setModalCrearProv({ ...modalCrearProv, emisor_identificacion: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400">Razón social</label>
                <input className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm mt-1"
                  value={modalCrearProv.emisor_nombre || ''}
                  onChange={e => setModalCrearProv({ ...modalCrearProv, emisor_nombre: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400">Email</label>
                <input className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm mt-1"
                  value={modalCrearProv.email_remitente || ''}
                  onChange={e => setModalCrearProv({ ...modalCrearProv, email_remitente: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => crearProveedor(modalCrearProv)} disabled={creandoProv}
                className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium">
                {creandoProv ? 'Creando...' : 'Crear y vincular'}
              </button>
              <button onClick={() => setModalCrearProv(null)} disabled={creandoProv}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal configuración cuentas CXP */}
      {modalConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[90] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-yellow-400 font-bold text-base">Cuentas contables CXP</h3>
                <p className="text-gray-400 text-xs mt-0.5">Configuración para generar asientos desde comprobantes XML</p>
              </div>
              <button onClick={() => setModalConfig(false)} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>

            {/* Body — dos columnas */}
            <div className="px-6 py-5 grid grid-cols-2 gap-x-6 gap-y-4">
              {[
                { clave: 'cuenta_cxp_proveedores_id', label: 'CXP Proveedores (cuenta control)',    tipo: 'cuenta' },
                { clave: 'cuenta_iva_credito_id',     label: 'IVA Crédito Fiscal acreditable',      tipo: 'cuenta' },
                { clave: 'cuenta_gasto_compras_id',   label: 'Gasto por defecto (líneas de detalle)', tipo: 'cuenta' },
                { clave: 'cuenta_iva_gasto_id',       label: 'IVA no acreditable (gasto)',           tipo: 'cuenta' },
                { clave: 'cuenta_otros_cargos_id',    label: 'Otros cargos (Cruz Roja, 911, etc.)',  tipo: 'cuenta' },
                { clave: 'cuenta_inventario_id',      label: 'Inventario (líneas de mercadería)',     tipo: 'cuenta' },
                { clave: 'categoria_compras_id',      label: 'Categoría de asiento para compras',    tipo: 'categoria' },
              ].map(({ clave, label, tipo }) => {
                const selId = configCuentas[clave];
                const selCuenta = tipo === 'cuenta' ? cuentasDisp.find((c: any) => c.id === selId) : null;
                const selCat = tipo === 'categoria' ? categoriasDisp.find((c: any) => c.categoria_id === selId) : null;
                return (
                  <div key={clave}>
                    <label className="text-[11px] text-gray-400 block mb-1">{label}</label>
                    {tipo === 'cuenta' ? (
                      <button
                        onClick={() => setModalCuentaConfig(clave)}
                        className="w-full text-left bg-gray-700 border border-gray-600 hover:border-yellow-500 rounded px-3 py-2 text-xs transition-colors">
                        {selCuenta
                          ? <><span className="text-yellow-400 font-mono font-bold">{selCuenta.codigo}</span><span className="text-gray-200 ml-2 truncate">{selCuenta.nombre}</span></>
                          : <span className="text-gray-500">— Sin configurar —</span>}
                      </button>
                    ) : (
                      <select
                        value={selId ?? ''}
                        onChange={e => setConfigCuentas(prev => ({ ...prev, [clave]: e.target.value ? Number(e.target.value) : null }))}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs focus:outline-none focus:border-yellow-500">
                        <option value="">— Sin configurar —</option>
                        {categoriasDisp.map((c: any) => <option key={c.categoria_id} value={c.categoria_id}>{c.codigo ? `${c.codigo} — ` : ''}{c.descripcion}</option>)}
                      </select>
                    )}
                    {selCat && <p className="text-[11px] text-gray-500 mt-0.5">{selCat.descripcion}</p>}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-2">
              <button onClick={() => setModalConfig(false)} disabled={guardandoConfig}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">
                Cancelar
              </button>
              <button onClick={guardarConfig} disabled={guardandoConfig}
                className="bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-medium">
                {guardandoConfig ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal asignar cuenta CXP al proveedor */}
      {modalCuentaCxp && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[90] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-yellow-400 font-bold text-lg mb-1">Cuenta CXP del proveedor</h3>
            <p className="text-gray-300 text-sm mb-1">{modalCuentaCxp.emisor_nombre}</p>
            <p className="text-gray-500 text-xs mb-5">Asigne la cuenta por pagar (CXP) para contabilizar documentos de este proveedor.</p>
            <label className="text-xs text-gray-400 block mb-1">Cuenta CXP (Cuentas por Pagar)</label>
            {(() => {
              const sel = cuentasDisp.find(c => c.id === cuentaCxpSel);
              return (
                <button onClick={() => setModalCuentaCxpOpen(true)}
                  className="w-full text-left bg-gray-700 border border-gray-600 hover:border-yellow-500 rounded px-3 py-2 text-sm mb-5 transition-colors">
                  {sel
                    ? <><span className="text-yellow-400 font-mono font-bold">{sel.codigo}</span><span className="text-gray-200 ml-2">{sel.nombre}</span></>
                    : <span className="text-gray-500">— Seleccione una cuenta — (clic para elegir)</span>}
                </button>
              );
            })()}
            <div className="flex gap-2">
              <button onClick={guardarCuentaCxp} disabled={!cuentaCxpSel || guardandoCxp}
                className="flex-1 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium">
                {guardandoCxp ? 'Guardando...' : 'Guardar y contabilizar'}
              </button>
              <button onClick={() => { setModalCuentaCxp(null); }} disabled={guardandoCxp}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editor de asiento (preparar → editar → confirmar) ── */}
      {editorAsiento && (() => {
        const { moneda, lineas: lineasEd, cuentasDisp, advertencias, descripcion } = editorAsiento;
        const esUSD = moneda === 'USD';
        const tc    = editorAsiento.tipo_cambio;
        const totalDeb = lineasEd.reduce((s, l) => s + (esUSD ? l.debito_usd  : l.debito_crc),  0);
        const totalCre = lineasEd.reduce((s, l) => s + (esUSD ? l.credito_usd : l.credito_crc), 0);
        const cuadra   = Math.abs(totalDeb - totalCre) < 0.02;
        const sym = esUSD ? '$' : '₡';
        const fmt = (n: number) => n.toLocaleString(esUSD ? 'en-US' : 'es-CR', { minimumFractionDigits: 2 });

        const setLinea = (idx: number, patch: Partial<typeof lineasEd[0]>) =>
          setEditorAsiento(prev => prev ? { ...prev, lineas: prev.lineas.map((l, i) => i === idx ? { ...l, ...patch } : l) } : prev);

        const setMonto = (idx: number, field: 'debito' | 'credito', val: string) => {
          const n = parseFloat(val.replace(',', '.')) || 0;
          if (esUSD) setLinea(idx, field === 'debito'
            ? { debito_usd: n, debito_crc: Math.round(n * tc * 100) / 100 }
            : { credito_usd: n, credito_crc: Math.round(n * tc * 100) / 100 });
          else setLinea(idx, field === 'debito' ? { debito_crc: n } : { credito_crc: n });
        };

        const agregarLinea = () => setEditorAsiento(prev => prev ? { ...prev, lineas: [...prev.lineas, {
          linea: prev.lineas.length + 1, cuenta_id: null, cuenta_codigo: null, cuenta_nombre: null,
          descripcion: '', debito_crc: 0, credito_crc: 0, debito_usd: 0, credito_usd: 0,
        }]} : prev);

        const eliminarLinea = (idx: number) => setEditorAsiento(prev => prev ? {
          ...prev, lineas: prev.lineas.filter((_, i) => i !== idx).map((l, i) => ({ ...l, linea: i + 1 }))
        } : prev);

        return (
          /* Panel que cubre solo el área de contenido (respeta navbar 86px y sidebar 84px) */
          <div className="fixed z-[65] bg-black bg-opacity-60 flex"
               style={{ top: 86, left: 84, right: 0, bottom: 0 }}>
            <div className="bg-gray-800 border-l border-gray-600 flex w-full overflow-hidden">

              {/* ── Columna izquierda — info + acciones ── */}
              <div className="w-72 shrink-0 border-r border-gray-700 flex flex-col overflow-y-auto">
                <div className="px-5 py-4 border-b border-gray-700">
                  <p className="text-purple-400 font-bold text-sm uppercase tracking-wide mb-1">Asiento contable</p>
                  <p className="text-white font-semibold text-sm leading-snug">{editorAsiento.comprobante.emisor_nombre}</p>
                  <p className="text-gray-400 text-xs mt-1">{fmtFecha(editorAsiento.comprobante.fecha_emision)}</p>
                  {editorAsiento.comprobante.numero_comprobante && (
                    <p className="text-gray-500 text-xs font-mono mt-0.5">{editorAsiento.comprobante.numero_comprobante}</p>
                  )}
                </div>

                <div className="px-5 py-3 space-y-3 border-b border-gray-700 text-xs">
                  <div>
                    <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Tipo de asiento</p>
                    <p className="text-gray-200 font-medium">{editorAsiento.categoria_nombre || <span className="text-red-400">Sin categoría configurada</span>}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Moneda</p>
                    <p className="text-gray-200">{moneda}{esUSD ? <span className="text-yellow-400 ml-2 font-mono">T.C. {tc}</span> : ''}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Descripción</p>
                    <p className="text-gray-400 leading-snug">{descripcion}</p>
                  </div>
                </div>

                {advertencias.length > 0 && (
                  <div className="mx-4 my-3 bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded px-3 py-2 text-xs">
                    {advertencias.map((a, i) => <p key={i} className="text-yellow-300">⚠ {a}</p>)}
                  </div>
                )}

                <div className="flex-1" />

                {/* Totales resumen */}
                <div className="px-5 py-3 border-t border-gray-700 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Débito</span>
                    <span className="font-mono text-green-400 font-semibold">{fmt(totalDeb)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Crédito</span>
                    <span className="font-mono text-red-400 font-semibold">{fmt(totalCre)}</span>
                  </div>
                  <div className={`flex justify-between pt-1 border-t border-gray-700 font-bold ${cuadra ? 'text-green-400' : 'text-red-400'}`}>
                    <span>{cuadra ? '✓ Cuadra' : '✗ No cuadra'}</span>
                    {!cuadra && <span className="font-mono">{fmt(Math.abs(totalDeb - totalCre))}</span>}
                  </div>
                </div>

                {/* Botones */}
                <div className="px-4 py-4 border-t border-gray-700 flex flex-col gap-2">
                  <button onClick={() => confirmarAsiento()} disabled={confirmandoAsiento || !cuadra}
                    className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-40 px-4 py-2.5 rounded text-sm font-medium transition-colors">
                    {confirmandoAsiento ? 'Guardando...' : '✓ Confirmar y guardar'}
                  </button>
                  <button onClick={() => setEditorAsiento(null)} disabled={confirmandoAsiento}
                    className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>

              {/* ── Columna derecha — tabla editable ── */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700 bg-gray-900">
                  <p className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Líneas del asiento</p>
                </div>
                <div className="overflow-y-auto flex-1 px-4 py-2">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr className="text-gray-500 border-b border-gray-700">
                        <th className="text-left py-2 px-1 w-6">#</th>
                        <th className="text-left py-2 px-1">Cuenta</th>
                        <th className="text-left py-2 px-1">Descripción</th>
                        <th className="text-right py-2 px-1 w-28">Débito {sym}</th>
                        <th className="text-right py-2 px-1 w-28">Crédito {sym}</th>
                        <th className="w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineasEd.map((l, idx) => (
                        <tr key={idx} className="border-b border-gray-700">
                          <td className="py-1 px-1 text-gray-500">{l.linea}</td>
                          <td className="py-1 px-1">
                            {(() => {
                              const sel = cuentasDisp.find(c => c.id === l.cuenta_id);
                              return (
                                <div onClick={() => setModalCuentaLineaIdx(idx)}
                                  className={`w-full text-left rounded px-2 py-1 text-xs border cursor-pointer hover:border-purple-500 transition-colors ${!l.cuenta_id ? 'border-red-600 bg-gray-700' : 'border-gray-700 bg-gray-800'}`}>
                                  {sel
                                    ? <><span className="text-yellow-400 font-mono font-bold">{sel.codigo}</span><span className="text-gray-300 ml-1 truncate">{sel.nombre}</span></>
                                    : <span className="text-red-400">— sin cuenta —</span>}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-1 px-1">
                            <input value={l.descripcion} onChange={e => setLinea(idx, { descripcion: e.target.value })}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500" />
                          </td>
                          <td className="py-1 px-1">
                            <MontoInput value={esUSD ? l.debito_usd : l.debito_crc}
                              blocked={(esUSD ? l.credito_usd : l.credito_crc) > 0}
                              onChange={n => setMonto(idx, 'debito', String(n))} />
                          </td>
                          <td className="py-1 px-1">
                            <MontoInput value={esUSD ? l.credito_usd : l.credito_crc}
                              blocked={(esUSD ? l.debito_usd : l.debito_crc) > 0}
                              onChange={n => setMonto(idx, 'credito', String(n))} />
                          </td>
                          <td className="py-1 px-1 text-center">
                            <button onClick={() => eliminarLinea(idx)} className="text-gray-600 hover:text-red-400 text-sm leading-none">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-900 border-t border-gray-600">
                      <tr>
                        <td colSpan={3} className="py-2 px-1">
                          <button onClick={agregarLinea} className="text-xs text-purple-400 hover:text-purple-300">+ Agregar línea</button>
                        </td>
                        <td className={`py-2 px-1 text-right font-mono font-semibold ${cuadra ? 'text-green-400' : 'text-white'}`}>{fmt(totalDeb)}</td>
                        <td className={`py-2 px-1 text-right font-mono font-semibold ${cuadra ? 'text-red-400' : 'text-white'}`}>{fmt(totalCre)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Modal resultado contabilización */}
      {resultadoContab && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[90] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-5xl w-full max-h-[90vh] flex flex-col">
            <h3 className="text-purple-400 font-bold text-lg mb-1">Asiento generado</h3>
            <p className="text-gray-400 text-sm mb-3">El comprobante fue contabilizado exitosamente.</p>

            {/* Header asiento */}
            <div className="bg-gray-900 rounded-lg px-4 py-3 mb-3 flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs">Número de asiento</p>
                <p className="text-white font-mono text-xl font-bold">
                  {resultadoContab.numero_formato || `#${resultadoContab.asiento_id}`}
                </p>
              </div>
              <span className="text-xs text-yellow-400 bg-yellow-900 bg-opacity-40 border border-yellow-700 rounded px-2 py-1">BORRADOR</span>
            </div>

            {/* Líneas del asiento */}
            {resultadoContab.lineas && resultadoContab.lineas.length > 0 && (() => {
              const esUSD = resultadoContab.moneda === 'USD';
              const fmtCRC = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2 });
              const fmtUSD = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
              const deb = (l: typeof resultadoContab.lineas[0]) => esUSD ? l.debito_usd  : l.debito_crc;
              const cre = (l: typeof resultadoContab.lineas[0]) => esUSD ? l.credito_usd : l.credito_crc;
              const fmt = esUSD ? fmtUSD : fmtCRC;
              const sym = esUSD ? '$' : '₡';
              return (
                <div className="overflow-y-auto flex-1 min-h-0 mb-3">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr className="text-gray-500 border-b border-gray-700">
                        <th className="text-left py-2 px-2">#</th>
                        <th className="text-left py-2 px-2">Cuenta</th>
                        <th className="text-left py-2 px-2">Descripción</th>
                        <th className="text-right py-2 px-2">Débito {sym}</th>
                        <th className="text-right py-2 px-2">Crédito {sym}</th>
                        {esUSD && <th className="text-right py-2 px-2">Débito ₡</th>}
                        {esUSD && <th className="text-right py-2 px-2">Crédito ₡</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoContab.lineas.map(l => (
                        <tr key={l.linea} className="border-b border-gray-700 hover:bg-gray-750">
                          <td className="py-1.5 px-2 text-gray-500">{l.linea}</td>
                          <td className="py-1.5 px-2">
                            <span className="text-blue-400 font-mono">{l.codigo}</span>
                            <span className="text-gray-400 ml-1">{l.nombre}</span>
                          </td>
                          <td className="py-1.5 px-2 text-gray-300">{l.descripcion}</td>
                          <td className="py-1.5 px-2 text-right font-mono">
                            {deb(l) > 0 ? <span className="text-green-400">{fmt(deb(l))}</span> : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">
                            {cre(l) > 0 ? <span className="text-red-400">{fmt(cre(l))}</span> : <span className="text-gray-600">—</span>}
                          </td>
                          {esUSD && <td className="py-1.5 px-2 text-right font-mono text-gray-500">
                            {l.debito_crc > 0 ? fmtCRC(l.debito_crc) : '—'}
                          </td>}
                          {esUSD && <td className="py-1.5 px-2 text-right font-mono text-gray-500">
                            {l.credito_crc > 0 ? fmtCRC(l.credito_crc) : '—'}
                          </td>}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-900 border-t border-gray-600">
                      <tr className="font-semibold text-xs">
                        <td colSpan={3} className="py-2 px-2 text-gray-400">Totales</td>
                        <td className="py-2 px-2 text-right font-mono text-green-400">
                          {fmt(resultadoContab.lineas.reduce((s, l) => s + deb(l), 0))}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-red-400">
                          {fmt(resultadoContab.lineas.reduce((s, l) => s + cre(l), 0))}
                        </td>
                        {esUSD && <td className="py-2 px-2 text-right font-mono text-gray-400">
                          {fmtCRC(resultadoContab.lineas.reduce((s, l) => s + l.debito_crc, 0))}
                        </td>}
                        {esUSD && <td className="py-2 px-2 text-right font-mono text-gray-400">
                          {fmtCRC(resultadoContab.lineas.reduce((s, l) => s + l.credito_crc, 0))}
                        </td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}

            {(resultadoContab.inventario_movimientos ?? 0) > 0 && (
              <div className="bg-green-900 bg-opacity-30 border border-green-700 rounded-lg p-3 mb-3 flex items-center gap-2">
                <span className="text-xl">📦</span>
                <p className="text-green-300 text-sm">
                  <strong>{resultadoContab.inventario_movimientos}</strong> entrada{resultadoContab.inventario_movimientos !== 1 ? 's' : ''} de inventario registrada{resultadoContab.inventario_movimientos !== 1 ? 's' : ''} automáticamente
                </p>
              </div>
            )}

            {resultadoContab.advertencias.length > 0 && (
              <div className="bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded-lg p-3 mb-3">
                <p className="text-yellow-400 text-xs font-semibold mb-1">Advertencias</p>
                {resultadoContab.advertencias.map((a, i) => (
                  <p key={i} className="text-yellow-300 text-xs">• {a}</p>
                ))}
              </div>
            )}
            {/* Botones exportar */}
            {resultadoContab.lineas && resultadoContab.lineas.length > 0 && (() => {
              const esUSD = resultadoContab.moneda === 'USD';
              type Linea = NonNullable<typeof resultadoContab.lineas>[0];
              const fmtN = (n: number) => esUSD
                ? n.toLocaleString('en-US', { minimumFractionDigits: 2 })
                : n.toLocaleString('es-CR', { minimumFractionDigits: 2 });
              const sym = esUSD ? 'USD' : 'CRC';
              const deb = (l: Linea) => esUSD ? l.debito_usd  : l.debito_crc;
              const cre = (l: Linea) => esUSD ? l.credito_usd : l.credito_crc;
              const totalDeb = resultadoContab.lineas!.reduce((s, l) => s + deb(l), 0);
              const totalCre = resultadoContab.lineas!.reduce((s, l) => s + cre(l), 0);
              const esc = (s: string | number | null | undefined) =>
                String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
              const company = (() => { try { return localStorage.getItem('mya_report_company_name') || 'Sistemas MYA'; } catch { return 'Sistemas MYA'; } })();
              const subtitleParts = [resultadoContab.emisor, resultadoContab.numero_comprobante, resultadoContab.fecha ? fmtFecha(resultadoContab.fecha) : ''].filter(Boolean);
              const dateNow = new Date().toLocaleString('es-CR');

              /* ── PDF personalizado ── */
              const handlePdf = () => {
                const rows = resultadoContab.lineas!.map(l => `
                  <tr>
                    <td class="c">${esc(l.linea)}</td>
                    <td class="code">${esc(l.codigo)}</td>
                    <td>${esc(l.nombre)}</td>
                    <td>${esc(l.descripcion)}</td>
                    <td class="num">${deb(l) > 0 ? esc(fmtN(deb(l))) : '<span class="dash">—</span>'}</td>
                    <td class="num">${cre(l) > 0 ? esc(fmtN(cre(l))) : '<span class="dash">—</span>'}</td>
                  </tr>`).join('');
                const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(resultadoContab.numero_formato)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 16mm 14mm 16mm; }
  html,body { background:#fff; color:#0f172a; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #7c3aed; padding-bottom:10px; margin-bottom:12px; }
  .brand { font-size:20px; font-weight:700; color:#0f172a; line-height:1.1; margin-bottom:2px; }
  .num-fmt { font-size:17px; font-weight:700; color:#7c3aed; font-family:monospace; }
  .meta { font-size:10px; color:#64748b; margin-top:4px; }
  .totals { text-align:right; font-size:11px; line-height:1.6; }
  .totals strong { display:inline-block; min-width:140px; text-align:right; font-family:monospace; }
  table { width:100%; border-collapse:collapse; font-size:10.5px; }
  th { background:#f1f5f9; border-bottom:2px solid #cbd5e1; padding:5px 7px; font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; text-align:left; }
  th.r, td.num { text-align:right; }
  th.c, td.c { text-align:center; }
  td { border-bottom:1px solid #e2e8f0; padding:5px 7px; vertical-align:top; }
  td.code { color:#2563eb; font-family:monospace; font-size:10px; white-space:nowrap; }
  td.num { font-family:monospace; white-space:nowrap; }
  .dash { color:#94a3b8; }
  tfoot td { border-top:2px solid #7c3aed; font-weight:700; background:#f8fafc; white-space:nowrap; }
  .foot { margin-top:10px; display:flex; justify-content:space-between; font-size:9.5px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:5px; }
</style></head><body>
<div class="head">
  <div>
    <div class="brand">${esc(company)}</div>
    <div class="num-fmt">Asiento de Diario No. ${esc(resultadoContab.numero_formato)}</div>
    <div class="meta">${subtitleParts.map(esc).join(' &nbsp;|&nbsp; ')}</div>
  </div>
  <div class="totals">
    <div>Total Débito: &nbsp;<strong>${esc(fmtN(totalDeb))} ${sym}</strong></div>
    <div>Total Crédito: &nbsp;<strong>${esc(fmtN(totalCre))} ${sym}</strong></div>
  </div>
</div>
<table>
  <thead><tr>
    <th class="c" style="width:24px">#</th>
    <th style="width:108px">Código</th>
    <th style="width:34%">Cuenta</th>
    <th>Descripción</th>
    <th class="r" style="width:90px">Débito ${sym}</th>
    <th class="r" style="width:90px">Crédito ${sym}</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="4" style="text-align:right;padding-right:12px">TOTALES</td>
    <td class="num">${esc(fmtN(totalDeb))}</td>
    <td class="num">${esc(fmtN(totalCre))}</td>
  </tr></tfoot>
</table>
<div class="foot">
  <span>Generado: ${esc(dateNow)} | Documento generado por ERP MYA</span>
  <span>Página 1</span>
</div>
</body></html>`;
                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;';
                document.body.appendChild(iframe);
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!doc) { document.body.removeChild(iframe); return; }
                doc.open(); doc.write(html); doc.close();
                iframe.contentWindow!.onafterprint = () => document.body.removeChild(iframe);
                setTimeout(() => { iframe.contentWindow?.print(); }, 300);
              };

              /* ── Excel con SheetJS (.xlsx real, sin gridlines) ── */
              const handleExcel = () => {
                const lineas = resultadoContab.lineas!;
                const numFmt = '#,##0.00';
                // Construir filas: [#, Código, Cuenta, Descripción, Débito, Crédito]
                const aoa: any[][] = [
                  [company],
                  [`Asiento de Diario No. ${resultadoContab.numero_formato}`],
                  [subtitleParts.join('   |   ')],
                  [],
                  ['#', 'Código', 'Cuenta', 'Descripción', `Débito ${sym}`, `Crédito ${sym}`],
                  ...lineas.map(l => [l.linea, l.codigo, l.nombre, l.descripcion, deb(l), cre(l)]),
                  [],
                  ['', '', '', 'TOTALES', totalDeb, totalCre],
                ];
                const ws = XLSX.utils.aoa_to_sheet(aoa);

                // Sin líneas de cuadrícula
                ws['!views'] = [{ showGridLines: false }];

                // Anchos de columna
                ws['!cols'] = [
                  { wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 34 }, { wch: 13 }, { wch: 13 },
                ];

                // Formato moneda en columnas E y F (desde fila 6 = índice 5)
                const dataRowStart = 5; // 0-indexed: fila de encabezado de cols
                const totalRowIdx  = aoa.length - 1;
                for (let r = dataRowStart + 1; r <= totalRowIdx; r++) {
                  ['E', 'F'].forEach(col => {
                    const ref = `${col}${r + 1}`;
                    if (ws[ref] && ws[ref].t === 'n') ws[ref].z = numFmt;
                  });
                }

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Asiento');
                XLSX.writeFile(wb, `asiento-${resultadoContab.numero_formato}.xlsx`);
              };

              return (
                <div className="flex gap-2 mb-2 flex-shrink-0">
                  <button onClick={handlePdf}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm transition-colors flex items-center justify-center gap-2">
                    <span>🖨️</span> Imprimir / PDF
                  </button>
                  <button onClick={handleExcel}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm transition-colors flex items-center justify-center gap-2">
                    <span>📊</span> Exportar Excel
                  </button>
                </div>
              );
            })()}

            <button onClick={revertirAsiento} disabled={revirtiendo}
              className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-40 px-4 py-2 rounded text-sm font-medium flex-shrink-0 border border-red-700 text-red-300">
              {revirtiendo ? '⏳ Revirtiendo...' : '↩ Revertir asiento'}
            </button>
            <button onClick={() => setResultadoContab(null)}
              className="w-full bg-purple-800 hover:bg-purple-700 px-4 py-2 rounded text-sm font-medium flex-shrink-0">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Modal fecha fuera de período */}
      {modalFechaPeriodo && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[210] p-4">
          <div className="bg-gray-800 border border-orange-600 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-orange-400 font-bold text-base mb-2">⚠ Fecha fuera del período</h3>
            <p className="text-gray-300 text-sm mb-4">{modalFechaPeriodo.mensaje.replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1')}</p>
            <label className="text-xs text-gray-400 block mb-1">Contabilizar con esta fecha:</label>
            <input
              type="date"
              value={fechaOverride}
              onChange={e => setFechaOverride(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500 mb-5"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setModalFechaPeriodo(null); confirmarAsiento(fechaOverride); }}
                disabled={!fechaOverride || confirmandoAsiento}
                className="flex-1 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium text-white">
                {confirmandoAsiento ? 'Guardando...' : 'Reintentar con esta fecha'}
              </button>
              <button onClick={() => setModalFechaPeriodo(null)}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* F5: Modal resultado batch */}
      {resultadoBatch && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[210] p-4">
          <div className="bg-gray-800 border border-purple-700 rounded-xl p-6 w-full max-w-lg" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 className="text-purple-300 font-bold text-base mb-1">Contabilización en lote</h3>
            <div className="flex gap-4 mb-4 text-sm">
              <span className="text-green-400 font-medium">✅ {resultadoBatch.exitosos} exitosos</span>
              {resultadoBatch.fallidos > 0 && <span className="text-red-400 font-medium">❌ {resultadoBatch.fallidos} fallidos</span>}
            </div>
            <div className="space-y-1 text-xs">
              {resultadoBatch.results.map(r => (
                <div key={r.id} className={`flex items-start gap-2 px-2 py-1 rounded ${r.ok ? 'bg-green-900/20 text-green-300' : 'bg-red-900/20 text-red-300'}`}>
                  <span>{r.ok ? '✓' : '✗'}</span>
                  <span>{r.ok ? r.numero_formato : `ID ${r.id}: ${r.error}`}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setResultadoBatch(null)} className="mt-4 w-full bg-purple-800 hover:bg-purple-700 px-4 py-2 rounded text-sm font-medium">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* F6: Modal IVA D-104 */}
      {modalIvaReporte && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[210] p-4">
          <div className="bg-gray-800 border border-blue-700 rounded-xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-blue-300 font-bold text-base">Reporte IVA Compras — D-104</h3>
                <p className="text-gray-400 text-xs mt-0.5">IVA pagado por tarifa en el período seleccionado</p>
              </div>
              <button onClick={() => setModalIvaReporte(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="px-5 py-3 border-b border-gray-700 flex gap-3 items-end flex-wrap">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Desde</label>
                <input type="date" value={ivaReporteDesde} onChange={e => setIvaReporteDesde(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Hasta</label>
                <input type="date" value={ivaReporteHasta} onChange={e => setIvaReporteHasta(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
              </div>
              <button onClick={cargarIvaReporte} disabled={cargandoIvaReporte}
                className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 px-4 py-1.5 rounded text-sm font-medium">
                {cargandoIvaReporte ? '⏳ Cargando...' : '🔍 Consultar'}
              </button>
              {ivaReporteDatos && ivaReporteDatos.filas.length > 0 && (() => {
                const exportarIvaExcel = () => {
                  const filas = ivaReporteDatos!.filas.map(f => ({
                    'Tarifa': f.tarifa_nombre,
                    'Base Imponible': Number(f.base_imponible.toFixed(2)),
                    'IVA': Number(f.monto_iva.toFixed(2)),
                    'Exonerado': Number(f.monto_exonerado.toFixed(2)),
                    'IVA Neto': Number((f.monto_iva - f.monto_exonerado).toFixed(2)),
                  }));
                  const ws = XLSX.utils.json_to_sheet(filas);
                  ws['!views'] = [{ showGridLines: false }];
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'IVA D-104');
                  XLSX.writeFile(wb, `iva-d104-${ivaReporteDesde}-${ivaReporteHasta}.xlsx`);
                };
                return (
                  <button onClick={exportarIvaExcel} className="bg-green-800 hover:bg-green-700 px-3 py-1.5 rounded text-sm">
                    📊 Excel
                  </button>
                );
              })()}
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3">
              {!ivaReporteDatos ? (
                <p className="text-gray-500 text-sm text-center py-8">Seleccione el período y presione Consultar</p>
              ) : ivaReporteDatos.filas.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Sin datos para el período seleccionado</p>
              ) : (
                <>
                  <table className="w-full text-sm mb-4">
                    <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Tarifa</th>
                        <th className="px-3 py-2 text-right">Base Imponible</th>
                        <th className="px-3 py-2 text-right">IVA</th>
                        <th className="px-3 py-2 text-right">Exonerado</th>
                        <th className="px-3 py-2 text-right">IVA Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ivaReporteDatos.filas.map(f => (
                        <tr key={f.tarifa_codigo} className="border-t border-gray-700">
                          <td className="px-3 py-2 text-gray-300">{f.tarifa_nombre}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-200">{f.base_imponible.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right font-mono text-blue-400">{f.monto_iva.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right font-mono text-yellow-400">{f.monto_exonerado.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right font-mono text-green-400 font-bold">{(f.monto_iva - f.monto_exonerado).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-900 border-t-2 border-gray-600">
                      <tr>
                        <td className="px-3 py-2 text-gray-400 font-medium">TOTAL</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-gray-200">{ivaReporteDatos.filas.reduce((s, f) => s + f.base_imponible, 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-blue-400">{ivaReporteDatos.filas.reduce((s, f) => s + f.monto_iva, 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-yellow-400">{ivaReporteDatos.filas.reduce((s, f) => s + f.monto_exonerado, 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-green-400">{ivaReporteDatos.filas.reduce((s, f) => s + (f.monto_iva - f.monto_exonerado), 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="text-xs text-gray-500">{ivaReporteDatos.comprobantes.length} comprobantes en el período — {ivaReporteDatos.comprobantes.filter(c => c.contabilizado).length} contabilizados</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal selección cuenta — Config CXP */}
      {modalCuentaConfig && (
        <ModalSeleccionCuenta
          cuentas={cuentasDisp}
          titulo="Seleccionar cuenta contable"
          onSelect={(id) => { setConfigCuentas(prev => ({ ...prev, [modalCuentaConfig!]: id })); setModalCuentaConfig(null); }}
          onClose={() => setModalCuentaConfig(null)}
        />
      )}

      {/* Modal selección cuenta — CXP proveedor */}
      {modalCuentaCxpOpen && (
        <ModalSeleccionCuenta
          cuentas={cuentasDisp}
          titulo="Cuenta CXP del proveedor"
          onSelect={(id) => { setCuentaCxpSel(id); setModalCuentaCxpOpen(false); }}
          onClose={() => setModalCuentaCxpOpen(false)}
        />
      )}

      {/* Modal selección cuenta — Asiento editor */}
      {modalCuentaLineaIdx !== null && editorAsiento && (
        <ModalSeleccionCuenta
          cuentas={editorAsiento.cuentasDisp}
          titulo="Seleccionar cuenta del asiento"
          onSelect={handleCuentaLineaSelect}
          onClose={() => setModalCuentaLineaIdx(null)}
        />
      )}
    </div>
  );
}



