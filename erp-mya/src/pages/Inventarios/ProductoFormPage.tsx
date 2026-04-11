import { useState, useEffect, type ChangeEvent, type FocusEvent, type MouseEvent } from 'react';
import { supabase } from '../../supabase';
import { CabysSearch, CabysItem } from '../../components/CabysSearch';
import { SearchableSelect } from '../../components/SearchableSelect';
import { ModalSeleccionCuenta } from '../../components/ModalSeleccionCuenta';

interface CuentaBase {
  id: number;
  codigo: string;
  nombre: string;
  cuenta_base_id?: number | null;
}

interface Categoria {
  id: number;
  nombre: string;
  codigo_prefijo?: string | null;
}

interface CuentaBaseRef {
  id: number;
  codigo: string;
  nombre: string;
  padre_id: number | null;
  acepta_movimiento?: boolean;
  activo?: boolean;
}

export interface ProductoCatalogo {
  id: number;
  codigo: string;
  codigo_barras?: string | null;
  codigo_cabys: string | null;
  descripcion: string;
  descripcion_detallada: string | null;
  categoria_id: number | null;
  tipo: 'producto' | 'servicio' | 'combo';
  unidad_medida: string;
  tarifa_iva: number;
  codigo_tarifa_iva: string | null;
  precio_venta: number;
  precio_compra_ref?: number;
  unidad_compra?: string | null;
  factor_conversion?: number;
  descuento_compra_pct?: number;
  bonificacion_unidades?: number;
  impuesto_consumo_monto?: number;
  flete_monto?: number;
  incluir_flete_en_costo?: boolean;
  costo_bruto_ajustado?: number;
  costo_neto_unitario?: number;
  descuento_autorizado_pct?: number;
  impuesto_venta_incluido?: boolean;
  cantidad_medida?: number;
  precio_por_medida?: number;
  ubicacion?: string | null;
  referencia_parte?: string | null;
  catalogo_ref?: string | null;
  serie?: string | null;
  costo_promedio: number;
  cuenta_inventario_id: number | null;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
}

interface ConfigInventarioResumen {
  cuenta_inventario_id: number | null;
  cuenta_costo_ventas_id: number | null;
  cuenta_ajuste_inv_id: number | null;
}

interface PrecioEscalaForm {
  escala: number;
  utilidad_pct: string;
  precio_venta: string;
  precio_final: string;
}

interface ProveedorOpt {
  id: number;
  codigo: string | null;
  razon_social: string;
}

interface CompraProveedorRow {
  id?: number;
  tercero_id: string;
  codigo_proveedor: string;
  descripcion_proveedor: string;
  unidad_compra: string;
  factor_conversion: string;
  precio_bruto_proveedor: string;
  descuento_compra_pct: string;
  bonificacion_unidades: string;
  impuesto_consumo_monto: string;
  flete_monto: string;
  incluir_flete_en_costo: boolean;
  es_principal: boolean;
  activo: boolean;
}

interface FormData {
  codigo: string;
  codigo_barras: string;
  codigo_cabys: string;
  descripcion: string;
  descripcion_detallada: string;
  categoria_id: string;
  tipo: 'producto' | 'servicio' | 'combo';
  unidad_medida: string;
  tarifa_iva: string;
  codigo_tarifa_iva: string;
  codigo_impuesto: string;
  partida_arancelaria: string;
  cuenta_inventario_id: string;
  precio_venta: string;
  precio_compra_ref: string;
  unidad_compra: string;
  factor_conversion: string;
  descuento_compra_pct: string;
  bonificacion_unidades: string;
  impuesto_consumo_monto: string;
  flete_monto: string;
  incluir_flete_en_costo: boolean;
  costo_bruto_ajustado: string;
  costo_neto_unitario: string;
  descuento_autorizado_pct: string;
  impuesto_venta_incluido: boolean;
  cantidad_medida: string;
  precio_por_medida: string;
  ubicacion: string;
  bodega_id: string;
  referencia_parte: string;
  catalogo_ref: string;
  serie: string;
  stock_actual: string;
  stock_minimo: string;
}

interface Props {
  empresaId: number;
  modo: 'nuevo' | 'editar';
  producto?: ProductoCatalogo | null;
  onVolver: () => void;
  onGuardado: () => void;
  onAbrirConfig?: () => void;
}

const UNIDADES: { codigo: string; label: string }[] = [
  { codigo: 'Unid', label: 'Unid - Unidad' },
  { codigo: 'Sp', label: 'Sp - Servicios profesionales' },
  { codigo: 'Al', label: 'Al - Alquiler' },
  { codigo: 'Os', label: 'Os - Otros servicios' },
  { codigo: 'Kg', label: 'Kg - Kilogramo' },
  { codigo: 'g', label: 'g - Gramo' },
  { codigo: 'lb', label: 'lb - Libra' },
  { codigo: 'L', label: 'L - Litro' },
  { codigo: 'mL', label: 'mL - Mililitro' },
  { codigo: 'm', label: 'm - Metro lineal' },
  { codigo: 'cm', label: 'cm - Centimetro' },
  { codigo: 'mm', label: 'mm - Milimetro' },
  { codigo: 'km', label: 'km - Kilometro' },
  { codigo: 'm2', label: 'm2 - Metro cuadrado' },
  { codigo: 'm3', label: 'm3 - Metro cubico' },
  { codigo: 'pie', label: 'pie - Pie' },
  { codigo: 'Caja', label: 'Caja - Caja' },
  { codigo: 'Bolsa', label: 'Bolsa - Bolsa' },
  { codigo: 'Doc', label: 'Doc - Docena' },
  { codigo: 'Paq', label: 'Paq - Paquete' },
  { codigo: 'h', label: 'h - Hora' },
  { codigo: 'min', label: 'min - Minuto' },
  { codigo: 'dia', label: 'dia - Dia' },
  { codigo: 'sem', label: 'sem - Semana' },
  { codigo: 'mes', label: 'mes - Mes' },
  { codigo: 'ano', label: 'ano - Ano' },
];

const IVA_A_CODIGO: Record<number, string> = {
  13: '13', 8: '08', 4: '06', 2: '05', 1: '04', 0: '01',
};

const CODIGO_A_TARIFA: Record<string, number> = {
  '13': 13, '08': 8, '06': 4, '05': 2, '04': 1, '09': 0.5,
  '01': 0, '02': 0, '10': 0, '11': 0, '03': 0,
};

const CODIGOS_IMPUESTO = [
  { codigo: '01', label: '01 - IVA' },
  { codigo: '02', label: '02 - Selectivo de Consumo' },
  { codigo: '03', label: '03 - Unico a los Combustibles' },
  { codigo: '04', label: '04 - Bebidas Alcoholicas' },
  { codigo: '05', label: '05 - Bebidas envasadas / jabones' },
  { codigo: '06', label: '06 - Tabaco' },
  { codigo: '07', label: '07 - IVA calculo especial' },
  { codigo: '08', label: '08 - IVA Bienes Usados (Factor)' },
  { codigo: '12', label: '12 - Cemento' },
  { codigo: '99', label: '99 - Otros' },
];

const CODIGOS_TARIFA_IVA = [
  { codigo: '13', label: '13 - 13% tarifa general' },
  { codigo: '08', label: '08 - 8% tarifa reducida' },
  { codigo: '06', label: '06 - 4%' },
  { codigo: '05', label: '05 - 2%' },
  { codigo: '04', label: '04 - 1%' },
  { codigo: '09', label: '09 - 0.5%' },
  { codigo: '01', label: '01 - 0% exento' },
  { codigo: '02', label: '02 - 0% no sujeto' },
  { codigo: '10', label: '10 - exenta' },
  { codigo: '11', label: '11 - 0% sin credito fiscal' },
];

const FORM_VACIO: FormData = {
  codigo: '',
  codigo_barras: '',
  codigo_cabys: '',
  descripcion: '',
  descripcion_detallada: '',
  categoria_id: '',
  tipo: 'producto',
  unidad_medida: 'Unid',
  tarifa_iva: '13',
  codigo_tarifa_iva: '13',
  codigo_impuesto: '01',
  partida_arancelaria: '',
  cuenta_inventario_id: '',
  precio_venta: '0',
  precio_compra_ref: '0',
  unidad_compra: 'Unid',
  factor_conversion: '1',
  descuento_compra_pct: '0',
  bonificacion_unidades: '0',
  impuesto_consumo_monto: '0',
  flete_monto: '0',
  incluir_flete_en_costo: false,
  costo_bruto_ajustado: '0',
  costo_neto_unitario: '0',
  descuento_autorizado_pct: '0',
  impuesto_venta_incluido: false,
  cantidad_medida: '0',
  precio_por_medida: '0',
  ubicacion: '',
  bodega_id: '',
  referencia_parte: '',
  catalogo_ref: '',
  serie: '',
  stock_actual: '0',
  stock_minimo: '0',
};

const ESCALAS_VACIAS = (): PrecioEscalaForm[] => (
  [1, 2, 3, 4].map((escala) => ({
    escala,
    utilidad_pct: '0',
    precio_venta: '0',
    precio_final: '0',
  }))
);

const COMPRA_PROVEEDOR_VACIA = (): CompraProveedorRow => ({
  tercero_id: '',
  codigo_proveedor: '',
  descripcion_proveedor: '',
  unidad_compra: 'Unid',
  factor_conversion: '1',
  precio_bruto_proveedor: '0',
  descuento_compra_pct: '0',
  bonificacion_unidades: '0',
  impuesto_consumo_monto: '0',
  flete_monto: '0',
  incluir_flete_en_costo: false,
  es_principal: false,
  activo: true,
});

const numericStyles = `
  .prod-num-no-spin::-webkit-outer-spin-button,
  .prod-num-no-spin::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .prod-num-no-spin[type=number] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
`;

const numericEditProps = (value: string, onChange: (value: string) => void) => ({
  type: 'text' as const,
  inputMode: 'decimal' as const,
  value,
  onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
  onFocus: (e: FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      try { e.currentTarget.select(); } catch {}
    }, 0);
  },
  onMouseUp: (e: MouseEvent<HTMLInputElement>) => e.preventDefault(),
});

export default function ProductoFormPage({ empresaId, modo, producto, onVolver, onGuardado, onAbrirConfig }: Props) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBase[]>([]);
  const [cuentasInventario, setCuentasInventario] = useState<CuentaBase[]>([]);
  const [bodegas, setBodegas] = useState<{ id: number; nombre: string }[]>([]);
  const [cuentaInventarioGeneralId, setCuentaInventarioGeneralId] = useState<number | null>(null);
  const [cuentaInventarioGeneralLabel, setCuentaInventarioGeneralLabel] = useState('');
  const [cuentaInventarioGeneralValida, setCuentaInventarioGeneralValida] = useState(false);
  const [cfgInventario, setCfgInventario] = useState<ConfigInventarioResumen>({
    cuenta_inventario_id: null,
    cuenta_costo_ventas_id: null,
    cuenta_ajuste_inv_id: null,
  });
  const [form, setForm] = useState<FormData>(FORM_VACIO);
  const [escalas, setEscalas] = useState<PrecioEscalaForm[]>(ESCALAS_VACIAS());
  const [proveedores, setProveedores] = useState<ProveedorOpt[]>([]);
  const [comprasProveedor, setComprasProveedor] = useState<CompraProveedorRow[]>([]);
  const [lineasCombo, setLineasCombo] = useState<{ descripcion: string; cantidad: number; unidad_medida: string }[]>([]);
  const [modalCombo, setModalCombo] = useState<{ idx: number } | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [productosModal, setProductosModal] = useState<{ id: number; codigo: string; descripcion: string; unidad_medida: string }[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [openCabys, setOpenCabys] = useState(false);
  const [modalCuentaInventario, setModalCuentaInventario] = useState(false);
  const [cargando, setCargando] = useState(true);

  const fmt = (n: number, decimals = 2) => Number(n || 0).toFixed(decimals);
  const num = (v: string | number | null | undefined) => {
    if (typeof v === 'string') {
      const normalized = v.replace(/\s/g, '').replace(',', '.');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Number(v || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const slugPrefijo = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

  const calcularCosteo = (source: FormData) => {
    const precioBruto = num(source.precio_compra_ref);
    const factor = Math.max(num(source.factor_conversion), 1);
    const descuentoPct = Math.max(num(source.descuento_compra_pct), 0);
    const bonificacion = Math.max(num(source.bonificacion_unidades), 0);
    const impuestoConsumo = Math.max(num(source.impuesto_consumo_monto), 0);
    const fleteMonto = Math.max(num(source.flete_monto), 0);
    const descuentoMonto = precioBruto * (descuentoPct / 100);
    const costoBrutoAjustado = precioBruto - descuentoMonto + impuestoConsumo + (source.incluir_flete_en_costo ? fleteMonto : 0);
    const unidadesEfectivas = factor + bonificacion;
    const costoNetoUnitario = unidadesEfectivas > 0 ? (costoBrutoAjustado / unidadesEfectivas) : costoBrutoAjustado;
    return {
      precioBruto,
      factor,
      descuentoPct,
      descuentoMonto,
      bonificacion,
      impuestoConsumo,
      fleteMonto,
      costoBrutoAjustado,
      unidadesEfectivas,
      costoNetoUnitario,
    };
  };

  const sugerirCodigoCategoria = async (categoriaId: string, categoriasList = categorias) => {
    const categoria = categoriasList.find((c) => String(c.id) === categoriaId);
    const prefijo = slugPrefijo(String(categoria?.codigo_prefijo || categoria?.nombre || 'PROD'));
    const prefijoFinal = prefijo || 'PROD';
    const { data } = await supabase
      .from('inv_productos')
      .select('codigo')
      .eq('empresa_id', empresaId)
      .ilike('codigo', `${prefijoFinal}-%`)
      .order('codigo', { ascending: false })
      .limit(1);

    let consecutivo = 1;
    const last = data?.[0]?.codigo || '';
    const match = last.match(/-(\d+)$/);
    if (match) consecutivo = Number(match[1]) + 1;
    return `${prefijoFinal}-${String(consecutivo).padStart(3, '0')}`;
  };

  const recalcularEscala = (escala: PrecioEscalaForm, baseCosto: number, tarifaPct: number, impuestoIncluido: boolean) => {
    const precioVenta = num(escala.precio_venta);
    const utilidadPct = num(escala.utilidad_pct);
    const precioFinal = impuestoIncluido
      ? precioVenta
      : precioVenta * (1 + tarifaPct / 100);
    const utilidadCalc = baseCosto > 0 ? (((precioVenta / baseCosto) - 1) * 100) : utilidadPct;
    return {
      ...escala,
      utilidad_pct: fmt(utilidadCalc, 2),
      precio_venta: fmt(precioVenta, 2),
      precio_final: fmt(precioFinal, 2),
    };
  };

  const resolverCuentaEmpresa = (valor: number | null | undefined, cuentasList: CuentaBase[]) => {
    const raw = Number(valor || 0);
    if (!raw) return null;
    return cuentasList.find((c) => c.id === raw) || cuentasList.find((c) => Number(c.cuenta_base_id || 0) === raw) || null;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setCargando(true);
    const [{ data: cats }, { data: cuentasData }, { data: baseData }, { data: cfg }, { data: codigoData }, { data: escalasData }, { data: proveedoresData }, { data: comprasProveedorData }, { data: bodsData }, { data: lineasComboData }] = await Promise.all([
        supabase.from('inv_categorias').select('id, nombre, codigo_prefijo').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
        supabase.from('plan_cuentas_empresa').select('id, codigo, nombre, cuenta_base_id').eq('empresa_id', empresaId).eq('activo', true).order('codigo'),
        supabase.from('plan_cuentas_base').select('id,codigo,nombre,padre_id,acepta_movimiento,activo').eq('activo', true),
        supabase.from('empresa_config_inventario').select('cuenta_inventario_id').eq('empresa_id', empresaId).maybeSingle(),
        modo === 'nuevo'
          ? supabase.from('inv_productos').select('codigo').eq('empresa_id', empresaId).order('codigo', { ascending: false }).limit(1)
          : Promise.resolve({ data: [] as any[] }),
        modo === 'editar' && producto?.id
          ? supabase.from('inv_producto_escalas').select('escala, utilidad_pct, precio_venta, precio_final').eq('producto_id', producto.id).order('escala')
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('vw_terceros_catalogo').select('id,codigo,razon_social,roles').eq('empresa_id', empresaId).order('razon_social'),
        modo === 'editar' && producto?.id
          ? supabase.from('inv_producto_proveedores').select('id,tercero_id,codigo_proveedor,descripcion_proveedor,unidad_compra,factor_conversion,precio_bruto_proveedor,descuento_compra_pct,bonificacion_unidades,impuesto_consumo_monto,flete_monto,incluir_flete_en_costo,es_principal,activo').eq('empresa_id', empresaId).eq('producto_id', producto.id).eq('activo', true).order('es_principal', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('inv_bodegas').select('id, nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
        modo === 'editar' && producto?.id
          ? supabase.from('inv_producto_lineas').select('id,descripcion,cantidad,unidad_medida,orden').eq('producto_id', producto.id).order('orden')
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (!active) return;
      setBodegas(bodsData || []);

      const cuentasList = (cuentasData as CuentaBase[]) || [];
      const baseRows = (baseData as CuentaBaseRef[]) || [];
      const cuentaGeneralId = (cfg as any)?.cuenta_inventario_id || null;
      const baseMap = new Map<number, CuentaBaseRef>();
      baseRows.forEach((row) => baseMap.set(row.id, row));

      const perteneceARamaInventarios = (baseId: number | null | undefined) => {
        let currentId = Number(baseId || 0);
        let guard = 0;
        while (currentId > 0 && guard < 20) {
          const node = baseMap.get(currentId);
          if (!node) return false;
          const nombre = String(node.nombre || '').trim().toUpperCase();
          const codigo = String(node.codigo || '').trim().toUpperCase();
          if (nombre === 'INVENTARIOS' || codigo === '0101-06-001' || codigo === '0101-06') return true;
          currentId = Number(node.padre_id || 0);
          guard += 1;
        }
        return false;
      };

      let cuentasInv = cuentasList.filter((c) => perteneceARamaInventarios(c.cuenta_base_id));
      const cuentaGeneralRuntime = resolverCuentaEmpresa(cuentaGeneralId, cuentasList);
      if (cuentasInv.length === 0 && cuentaGeneralRuntime?.codigo) {
        const branchPrefix = cuentaGeneralRuntime.codigo.split('-').slice(0, 2).join('-');
        if (branchPrefix) {
          cuentasInv = cuentasList.filter((c) => String(c.codigo || '').startsWith(branchPrefix));
        }
        if (cuentasInv.length === 0) {
          cuentasInv = [cuentaGeneralRuntime];
        }
      }
      setCategorias(cats || []);
      setProveedores((((proveedoresData as any[]) || []).filter((r) => Array.isArray(r.roles) && r.roles.includes('proveedor')).map((r) => ({
        id: Number(r.id),
        codigo: r.codigo || null,
        razon_social: String(r.razon_social || ''),
      }))) as ProveedorOpt[]);
      setCuentas(cuentasList);
      setCuentasInventario(cuentasInv);
      setCfgInventario({
        cuenta_inventario_id: cuentaGeneralId,
        cuenta_costo_ventas_id: Number((cfg as any)?.cuenta_costo_ventas_id || 0) || null,
        cuenta_ajuste_inv_id: Number((cfg as any)?.cuenta_ajuste_inv_id || 0) || null,
      });
      setCuentaInventarioGeneralId(cuentaGeneralId);
      const cuentaGeneral = resolverCuentaEmpresa(cuentaGeneralId, cuentasList);
      setCuentaInventarioGeneralLabel(cuentaGeneral ? `${cuentaGeneral.codigo} - ${cuentaGeneral.nombre}` : '');
      setCuentaInventarioGeneralValida(Boolean(cuentaGeneral && (perteneceARamaInventarios(cuentaGeneral.cuenta_base_id) || cuentasInv.some((c) => c.id === cuentaGeneral.id))));

      if (modo === 'nuevo') {
        let nextCodigo = 'PROD-0001';
        if (codigoData && codigoData.length > 0 && codigoData[0].codigo) {
          const last = codigoData[0].codigo;
          const match = last.match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10) + 1;
            const prefix = last.slice(0, last.length - match[1].length);
            nextCodigo = prefix + String(num).padStart(match[1].length, '0');
          }
        }
        setForm({ ...FORM_VACIO, codigo: nextCodigo });
        setEscalas(ESCALAS_VACIAS());
        setComprasProveedor([]);
        setLineasCombo([]);
      } else if (producto) {
        setForm({
          codigo: producto.codigo || '',
          codigo_barras: String((producto as any).codigo_barras || ''),
          codigo_cabys: producto.codigo_cabys || '',
          descripcion: producto.descripcion,
          descripcion_detallada: producto.descripcion_detallada || '',
          categoria_id: producto.categoria_id ? String(producto.categoria_id) : '',
          tipo: producto.tipo,
          unidad_medida: producto.unidad_medida,
          tarifa_iva: String(producto.tarifa_iva),
          codigo_tarifa_iva: producto.codigo_tarifa_iva || IVA_A_CODIGO[producto.tarifa_iva] || '13',
          codigo_impuesto: (producto as any).codigo_impuesto || '01',
          partida_arancelaria: (producto as any).partida_arancelaria || '',
          cuenta_inventario_id: producto.cuenta_inventario_id
            ? String(resolverCuentaEmpresa(producto.cuenta_inventario_id, cuentasList)?.id || '')
            : '',
          precio_venta: String(producto.precio_venta),
          precio_compra_ref: String((producto as any).precio_compra_ref || 0),
          unidad_compra: String((producto as any).unidad_compra || producto.unidad_medida || 'Unid'),
          factor_conversion: String((producto as any).factor_conversion || (producto as any).cantidad_medida || 1),
          descuento_compra_pct: String((producto as any).descuento_compra_pct || 0),
          bonificacion_unidades: String((producto as any).bonificacion_unidades || 0),
          impuesto_consumo_monto: String((producto as any).impuesto_consumo_monto || 0),
          flete_monto: String((producto as any).flete_monto || 0),
          incluir_flete_en_costo: Boolean((producto as any).incluir_flete_en_costo),
          costo_bruto_ajustado: String((producto as any).costo_bruto_ajustado || 0),
          costo_neto_unitario: String((producto as any).costo_neto_unitario || (producto as any).precio_compra_ref || 0),
          descuento_autorizado_pct: String((producto as any).descuento_autorizado_pct || 0),
          impuesto_venta_incluido: Boolean((producto as any).impuesto_venta_incluido),
          cantidad_medida: String((producto as any).cantidad_medida || 0),
          precio_por_medida: String((producto as any).precio_por_medida || 0),
          ubicacion: String((producto as any).ubicacion || ''),
          bodega_id: String((producto as any).bodega_id || ''),
          referencia_parte: String((producto as any).referencia_parte || ''),
          catalogo_ref: String((producto as any).catalogo_ref || ''),
          serie: String((producto as any).serie || ''),
          stock_actual: String(producto.stock_actual),
          stock_minimo: String(producto.stock_minimo),
        });
        const tarifaPct = Number(producto.tarifa_iva || 0);
        const impIncl = Boolean((producto as any).impuesto_venta_incluido);
        const baseCosto = Number((producto as any).costo_neto_unitario || (producto as any).precio_compra_ref || 0);
        const escalasBase = ESCALAS_VACIAS();
        ((escalasData as any[]) || []).forEach((r) => {
          const idx = escalasBase.findIndex((x) => x.escala === Number(r.escala));
          if (idx >= 0) {
            escalasBase[idx] = {
              escala: Number(r.escala),
              utilidad_pct: fmt(Number(r.utilidad_pct || 0), 2),
              precio_venta: fmt(Number(r.precio_venta || 0), 2),
              precio_final: fmt(Number(r.precio_final || 0), 2),
            };
          }
        });
        if (!escalasData || (escalasData as any[]).length === 0) {
          escalasBase[0] = recalcularEscala({
            escala: 1,
            utilidad_pct: '0',
            precio_venta: String(producto.precio_venta || 0),
            precio_final: '0',
          }, baseCosto, tarifaPct, impIncl);
        }
        setEscalas(escalasBase.map((e) => recalcularEscala(e, baseCosto, tarifaPct, impIncl)));
        const comprasRows = (((comprasProveedorData as any[]) || []).map((r) => ({
          id: Number(r.id),
          tercero_id: String(r.tercero_id || ''),
          codigo_proveedor: String(r.codigo_proveedor || ''),
          descripcion_proveedor: String(r.descripcion_proveedor || ''),
          unidad_compra: String(r.unidad_compra || 'Unid'),
          factor_conversion: fmt(Number(r.factor_conversion || 1), 4),
          precio_bruto_proveedor: fmt(Number(r.precio_bruto_proveedor || 0), 4),
          descuento_compra_pct: fmt(Number(r.descuento_compra_pct || 0), 2),
          bonificacion_unidades: fmt(Number(r.bonificacion_unidades || 0), 4),
          impuesto_consumo_monto: fmt(Number(r.impuesto_consumo_monto || 0), 4),
          flete_monto: fmt(Number(r.flete_monto || 0), 4),
          incluir_flete_en_costo: Boolean(r.incluir_flete_en_costo),
          es_principal: Boolean(r.es_principal),
          activo: r.activo !== false,
        })));
        setComprasProveedor(comprasRows);
        const principal = comprasRows.find((row) => row.es_principal);
        if (principal) {
          setForm((prev) => ({
            ...prev,
            unidad_compra: principal.unidad_compra || prev.unidad_compra,
            factor_conversion: principal.factor_conversion || prev.factor_conversion,
            precio_compra_ref: principal.precio_bruto_proveedor || prev.precio_compra_ref,
            descuento_compra_pct: principal.descuento_compra_pct || prev.descuento_compra_pct,
            bonificacion_unidades: principal.bonificacion_unidades || prev.bonificacion_unidades,
            impuesto_consumo_monto: principal.impuesto_consumo_monto || prev.impuesto_consumo_monto,
            flete_monto: principal.flete_monto || prev.flete_monto,
            incluir_flete_en_costo: principal.incluir_flete_en_costo,
          }));
        }
      } else {
        setComprasProveedor([]);
      }
      setLineasCombo(((lineasComboData as any[]) || []).map(r => ({
        descripcion: String(r.descripcion || ''),
        cantidad: Number(r.cantidad || 1),
        unidad_medida: String(r.unidad_medida || 'Unid'),
      })));
      setCargando(false);
    })();
    return () => { active = false; };
  }, [empresaId, modo, producto]);

  // Carga productos para el modal de componentes (lazy, solo cuando se abre)
  useEffect(() => {
    if (!modalCombo) return;
    supabase.from('inv_productos').select('id,codigo,descripcion,unidad_medida')
      .eq('empresa_id', empresaId).eq('activo', true).order('descripcion')
      .then(({ data }) => setProductosModal((data || []) as any[]));
  }, [modalCombo, empresaId]);

  const handleChange = (field: keyof FormData, value: string) => setForm(f => ({ ...f, [field]: value }));
  const draftValue = (key: string, fallback: string) => drafts[key] ?? fallback;
  const startDraft = (key: string, value: string) => setDrafts((prev) => ({ ...prev, [key]: value }));
  const changeDraft = (key: string, value: string) => setDrafts((prev) => ({ ...prev, [key]: value }));
  const clearDraft = (key: string) => setDrafts((prev) => {
    const next = { ...prev };
    delete next[key];
    return next;
  });
  const commitFormDraft = (field: keyof FormData, key: string) => {
    const value = drafts[key];
    if (typeof value === 'string') handleChange(field, value);
    clearDraft(key);
  };
  const commitEscalaDraft = (escala: number, field: 'utilidad_pct' | 'precio_venta', key: string) => {
    const value = drafts[key];
    if (typeof value !== 'string') {
      clearDraft(key);
      return;
    }
    if (field === 'utilidad_pct') setEscalaUtilidad(escala, value);
    else setEscalaPrecio(escala, value);
    clearDraft(key);
  };
  const cuentaSeleccionada = form.cuenta_inventario_id
    ? cuentasInventario.find((c) => String(c.id) === form.cuenta_inventario_id) || null
    : null;
  const cuentaCostoVentas = resolverCuentaEmpresa(cfgInventario.cuenta_costo_ventas_id, cuentas);
  const cuentaAjusteInv = resolverCuentaEmpresa(cfgInventario.cuenta_ajuste_inv_id, cuentas);

  const handleCategoriaChange = async (categoriaId: string) => {
    setForm((prev) => ({ ...prev, categoria_id: categoriaId }));
    if (modo !== 'nuevo' || !categoriaId) return;
    const current = String(form.codigo || '').trim().toUpperCase();
    if (!current || current === 'PROD-0001' || /^PROD-\d+$/.test(current) || /^[A-Z0-9]+-\d+$/.test(current)) {
      const sugerido = await sugerirCodigoCategoria(categoriaId);
      setForm((prev) => ({ ...prev, categoria_id: categoriaId, codigo: sugerido }));
    }
  };

  const setEscalaUtilidad = (escala: number, value: string) => {
    const baseCosto = num(form.costo_neto_unitario);
    const tarifaPct = num(form.tarifa_iva);
    const impIncl = form.impuesto_venta_incluido;
    setEscalas((prev) => prev.map((row) => {
      if (row.escala !== escala) return row;
      const utilidad = num(value);
      const precioVenta = baseCosto > 0 ? baseCosto * (1 + utilidad / 100) : num(row.precio_venta);
      return recalcularEscala({ ...row, utilidad_pct: value, precio_venta: String(precioVenta) }, baseCosto, tarifaPct, impIncl);
    }));
  };

  const setEscalaPrecio = (escala: number, value: string) => {
    const baseCosto = num(form.costo_neto_unitario);
    const tarifaPct = num(form.tarifa_iva);
    const impIncl = form.impuesto_venta_incluido;
    setEscalas((prev) => prev.map((row) => {
      if (row.escala !== escala) return row;
      return recalcularEscala({ ...row, precio_venta: value }, baseCosto, tarifaPct, impIncl);
    }));
  };

  const addCompraProveedor = () => {
    setComprasProveedor((prev) => [...prev, COMPRA_PROVEEDOR_VACIA()]);
  };

  const updateCompraProveedor = (idx: number, patch: Partial<CompraProveedorRow>) => {
    setComprasProveedor((prev) => prev.map((row, i) => {
      if (i !== idx) {
        if (patch.es_principal) return { ...row, es_principal: false };
        return row;
      }
      return { ...row, ...patch };
    }));
    if (patch.es_principal) {
      const nextRow = { ...(comprasProveedor[idx] || COMPRA_PROVEEDOR_VACIA()), ...patch };
      aplicarCompraProveedor(nextRow);
    }
  };

  const removeCompraProveedor = (idx: number) => {
    setComprasProveedor((prev) => prev.filter((_, i) => i !== idx));
  };

  const aplicarCompraProveedor = (row: CompraProveedorRow) => {
    setForm((prev) => ({
      ...prev,
      unidad_compra: row.unidad_compra || prev.unidad_compra,
      factor_conversion: row.factor_conversion || prev.factor_conversion,
      precio_compra_ref: row.precio_bruto_proveedor || prev.precio_compra_ref,
      descuento_compra_pct: row.descuento_compra_pct || prev.descuento_compra_pct,
      bonificacion_unidades: row.bonificacion_unidades || prev.bonificacion_unidades,
      impuesto_consumo_monto: row.impuesto_consumo_monto || prev.impuesto_consumo_monto,
      flete_monto: row.flete_monto || prev.flete_monto,
      incluir_flete_en_costo: row.incluir_flete_en_costo,
    }));
  };

  useEffect(() => {
    const costeo = calcularCosteo(form);
    const baseCosto = costeo.costoNetoUnitario;
    const tarifaPct = num(form.tarifa_iva);
    const impIncl = form.impuesto_venta_incluido;
    setEscalas((prev) => prev.map((row) => recalcularEscala(row, baseCosto, tarifaPct, impIncl)));
    const precioEscala1 = num(escalas[0]?.precio_venta || 0);
    setForm((prev) => {
      const nextCostoBruto = fmt(costeo.costoBrutoAjustado, 4);
      const nextCostoNeto = fmt(costeo.costoNetoUnitario, 4);
      const nextPrecioVenta = fmt(precioEscala1, 2);
      const nextPrecioPorMedida = fmt(costeo.factor > 0 ? (precioEscala1 / costeo.factor) : 0, 4);
      if (
        prev.costo_bruto_ajustado === nextCostoBruto &&
        prev.costo_neto_unitario === nextCostoNeto &&
        prev.precio_venta === nextPrecioVenta &&
        prev.precio_por_medida === nextPrecioPorMedida &&
        prev.cantidad_medida === fmt(costeo.factor, 4)
      ) {
        return prev;
      }
      return {
        ...prev,
        cantidad_medida: fmt(costeo.factor, 4),
        costo_bruto_ajustado: nextCostoBruto,
        costo_neto_unitario: nextCostoNeto,
        precio_venta: nextPrecioVenta,
        precio_por_medida: nextPrecioPorMedida,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.precio_compra_ref, form.factor_conversion, form.descuento_compra_pct, form.bonificacion_unidades, form.impuesto_consumo_monto, form.flete_monto, form.incluir_flete_en_costo, form.tarifa_iva, form.impuesto_venta_incluido, escalas[0]?.precio_venta]);

  const handleCabysSelect = (item: CabysItem) => {
    const esBien = parseInt(item.codigo[0], 10) <= 4;
    setForm(f => ({
      ...f,
      codigo_cabys: item.codigo,
      codigo_tarifa_iva: IVA_A_CODIGO[item.impuesto] ?? '01',
      tarifa_iva: String(item.impuesto),
      tipo: esBien ? 'producto' : 'servicio',
      unidad_medida: esBien
        ? (f.unidad_medida === 'Sp' || f.unidad_medida === 'Al' || f.unidad_medida === 'Os' ? 'Unid' : f.unidad_medida)
        : (f.unidad_medida === 'Unid' ? 'Sp' : f.unidad_medida),
    }));
    setOpenCabys(false);
  };

  const guardar = async () => {
    if (!form.descripcion.trim()) {
      setError('La descripcion es requerida.');
      return;
    }
    if (form.codigo_cabys && form.codigo_cabys.length !== 13) {
      setError(`El codigo CABYS debe tener exactamente 13 digitos (tiene ${form.codigo_cabys.length}).`);
      return;
    }
    setGuardando(true);
    setError('');
    const payload = {
      empresa_id: empresaId,
      codigo: form.codigo.trim() || null,
      codigo_barras: form.codigo_barras.trim() || null,
      codigo_cabys: form.codigo_cabys.trim() || null,
      descripcion: form.descripcion.trim(),
      descripcion_detallada: form.descripcion_detallada.trim() || null,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      tipo: form.tipo,
      unidad_medida: form.unidad_medida,
      tarifa_iva: Number(form.tarifa_iva),
      codigo_tarifa_iva: form.codigo_tarifa_iva,
      codigo_impuesto: form.codigo_impuesto,
      cuenta_inventario_id: form.tipo === 'producto' && form.cuenta_inventario_id ? Number(form.cuenta_inventario_id) : null,
      precio_venta: Number(escalas[0]?.precio_venta || form.precio_venta || 0),
      precio_compra_ref: Number(form.precio_compra_ref),
      unidad_compra: form.unidad_compra,
      factor_conversion: Number(form.factor_conversion),
      descuento_compra_pct: Number(form.descuento_compra_pct),
      bonificacion_unidades: Number(form.bonificacion_unidades),
      impuesto_consumo_monto: Number(form.impuesto_consumo_monto),
      flete_monto: Number(form.flete_monto),
      incluir_flete_en_costo: Boolean(form.incluir_flete_en_costo),
      costo_bruto_ajustado: Number(form.costo_bruto_ajustado),
      costo_neto_unitario: Number(form.costo_neto_unitario),
      descuento_autorizado_pct: Number(form.descuento_autorizado_pct),
      impuesto_venta_incluido: Boolean(form.impuesto_venta_incluido),
      cantidad_medida: Number(form.cantidad_medida),
      precio_por_medida: Number(form.precio_por_medida),
      ubicacion: form.ubicacion.trim() || null,
      bodega_id: form.bodega_id ? Number(form.bodega_id) : null,
      referencia_parte: form.referencia_parte.trim() || null,
      catalogo_ref: form.catalogo_ref.trim() || null,
      serie: form.serie.trim() || null,
      stock_actual: form.tipo === 'producto' ? Number(form.stock_actual) : 0,
      stock_minimo: form.tipo === 'producto' ? Number(form.stock_minimo) : 0,
      partida_arancelaria: form.partida_arancelaria.trim() || null,
    };

    const saveResult = modo === 'nuevo'
      ? await supabase.from('inv_productos').insert(payload).select('id').single()
      : await supabase.from('inv_productos').update(payload).eq('id', producto?.id ?? 0).select('id').single();

    const saveError = saveResult.error;

    if (saveError) {
      setError(saveError.message);
      setGuardando(false);
      return;
    }

    const productoId = Number((saveResult.data as any)?.id || producto?.id || 0);
    if (productoId > 0) {
      const rows = escalas.map((e) => ({
        producto_id: productoId,
        escala: e.escala,
        utilidad_pct: Number(e.utilidad_pct || 0),
        precio_venta: Number(e.precio_venta || 0),
        precio_final: Number(e.precio_final || 0),
        activo: true,
      }));
      const { error: escErr } = await supabase.from('inv_producto_escalas').upsert(rows, { onConflict: 'producto_id,escala' });
      if (escErr) {
        setError(escErr.message);
        setGuardando(false);
        return;
      }

      const { error: delProvErr } = await supabase.from('inv_producto_proveedores').delete().eq('empresa_id', empresaId).eq('producto_id', productoId);
      if (delProvErr) {
        setError(delProvErr.message);
        setGuardando(false);
        return;
      }

      const comprasRows = comprasProveedor
        .filter((r) => Number(r.tercero_id || 0) > 0)
        .map((r) => ({
          empresa_id: empresaId,
          producto_id: productoId,
          tercero_id: Number(r.tercero_id),
          codigo_proveedor: r.codigo_proveedor.trim() || null,
          descripcion_proveedor: r.descripcion_proveedor.trim() || null,
          unidad_compra: r.unidad_compra || null,
          factor_conversion: Number(r.factor_conversion || 1),
          precio_bruto_proveedor: Number(r.precio_bruto_proveedor || 0),
          descuento_compra_pct: Number(r.descuento_compra_pct || 0),
          bonificacion_unidades: Number(r.bonificacion_unidades || 0),
          impuesto_consumo_monto: Number(r.impuesto_consumo_monto || 0),
          flete_monto: Number(r.flete_monto || 0),
          incluir_flete_en_costo: Boolean(r.incluir_flete_en_costo),
          es_principal: Boolean(r.es_principal),
          activo: r.activo !== false,
        }));
      if (comprasRows.length > 0) {
        const { error: compraProvErr } = await supabase.from('inv_producto_proveedores').insert(comprasRows);
        if (compraProvErr) {
          setError(compraProvErr.message);
          setGuardando(false);
          return;
        }
      }

      // Guardar líneas de combo
      if (form.tipo === 'combo') {
        await supabase.from('inv_producto_lineas').delete().eq('producto_id', productoId);
        const lineasValidas = lineasCombo.filter(l => l.descripcion.trim());
        if (lineasValidas.length > 0) {
          const { error: linErr } = await supabase.from('inv_producto_lineas').insert(
            lineasValidas.map((l, i) => ({
              empresa_id: empresaId,
              producto_id: productoId,
              descripcion: l.descripcion.trim(),
              cantidad: l.cantidad || 1,
              unidad_medida: l.unidad_medida || 'Unid',
              orden: i + 1,
            }))
          );
          if (linErr) {
            setError(linErr.message);
            setGuardando(false);
            return;
          }
        }
      }
    }

    setGuardando(false);
    onGuardado();
  };

  if (cargando) {
    return <div className="p-6 text-gray-500">Cargando formulario...</div>;
  }

  return (
    <div className="px-0 pb-6 space-y-4 font-sans">
      <style>{numericStyles}</style>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 px-4 sm:px-6 pt-2">
        <div>
          <div className="text-xs text-gray-500 mb-1">Inventarios / Catalogo de productos</div>
          <h1 className="text-xl sm:text-[28px] font-bold text-white leading-none">{modo === 'nuevo' ? 'Nuevo producto o servicio' : 'Editar producto o servicio'}</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${form.tipo === 'producto' ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50' : form.tipo === 'servicio' ? 'bg-sky-900/40 text-sky-300 border border-sky-700/50' : 'bg-amber-900/40 text-amber-300 border border-amber-700/50'}`}>
            {form.tipo === 'producto' ? 'Producto con inventario' : form.tipo === 'servicio' ? 'Servicio' : 'Combo'}
          </span>
          <button onClick={onVolver} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-none text-sm text-white transition-colors whitespace-nowrap">Volver al catalogo</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-0 items-start border-y border-gray-700">
        <aside className="space-y-0 border-r border-gray-700 bg-gray-800/80">
          <section className="border-b border-gray-700 p-6 space-y-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Resumen actual</div>
              <h2 className="text-lg font-semibold text-white">{form.descripcion.trim() || 'Producto sin descripcion'}</h2>
              <p className="text-sm text-gray-400 mt-1">{form.codigo || 'Sin codigo'}{form.codigo_barras ? ` | Barras ${form.codigo_barras}` : ''}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-gray-700 bg-gray-900/40 px-3 py-3">
                <div className="text-gray-500 uppercase tracking-wide mb-1">Tipo</div>
                <div className="text-white font-medium">{form.tipo === 'producto' ? 'Producto' : form.tipo === 'servicio' ? 'Servicio' : 'Combo'}</div>
              </div>
              <div className="border border-gray-700 bg-gray-900/40 px-3 py-3">
                <div className="text-gray-500 uppercase tracking-wide mb-1">Unidad base</div>
                <div className="text-white font-medium">{form.unidad_medida || 'Unid'}</div>
              </div>
              <div className="border border-gray-700 bg-gray-900/40 px-3 py-3">
                <div className="text-gray-500 uppercase tracking-wide mb-1">Costo neto</div>
                <div className="font-mono text-emerald-300 font-semibold">{Number(form.costo_neto_unitario || 0).toLocaleString('es-CR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</div>
              </div>
              <div className="border border-gray-700 bg-gray-900/40 px-3 py-3">
                <div className="text-gray-500 uppercase tracking-wide mb-1">Precio base</div>
                <div className="font-mono text-sky-300 font-semibold">{Number(form.precio_venta || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            </div>
          </section>

          <section className="border-b border-gray-700 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Existencias y contabilidad</h2>
            {form.tipo === 'producto' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Stock actual</label>
                    <input
                      {...numericEditProps(draftValue('stock_actual', form.stock_actual), (value) => changeDraft('stock_actual', value))}
                      onFocus={(e) => { startDraft('stock_actual', form.stock_actual); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                      onBlur={() => commitFormDraft('stock_actual', 'stock_actual')}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFormDraft('stock_actual', 'stock_actual'); } }}
                      className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Stock minimo</label>
                    <input
                      {...numericEditProps(draftValue('stock_minimo', form.stock_minimo), (value) => changeDraft('stock_minimo', value))}
                      onFocus={(e) => { startDraft('stock_minimo', form.stock_minimo); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                      onBlur={() => commitFormDraft('stock_minimo', 'stock_minimo')}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFormDraft('stock_minimo', 'stock_minimo'); } }}
                      className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <label className="block text-gray-400 text-xs">Cuenta de inventario <span className="text-gray-600">(contabilidad)</span></label>
                    {onAbrirConfig && <button type="button" onClick={onAbrirConfig} className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">Editar configuracion</button>}
                  </div>
                  {cuentasInventario.length === 0 ? (
                    <div className="border border-red-700/50 bg-red-900/20 px-3 py-3">
                      <div className="text-sm text-red-300">No hay cuentas contables de inventario disponibles.</div>
                      <div className="text-[11px] text-red-200/80 mt-1">Cree o ajuste una cuenta bajo la rama de Inventarios y luego vuelva a seleccionarla aqui.</div>
                      {onAbrirConfig && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={onAbrirConfig}
                            className="bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded-none text-xs transition-colors"
                          >
                            Revisar configuracion
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={() => setModalCuentaInventario(true)} className="w-full text-left bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm hover:border-gray-500 focus:outline-none focus:border-blue-500 transition-colors">
                        {form.cuenta_inventario_id
                          ? (cuentaSeleccionada
                              ? `${cuentaSeleccionada.codigo} - ${cuentaSeleccionada.nombre}`
                              : 'Cuenta seleccionada')
                          : 'Usar configuracion general de inventarios'}
                      </button>
                      {form.cuenta_inventario_id && (
                        <div className="mt-1 flex justify-end">
                          <button type="button" onClick={() => handleChange('cuenta_inventario_id', '')} className="text-[11px] text-gray-400 hover:text-gray-200 transition-colors">Volver a cuenta general</button>
                        </div>
                      )}
                      <p className="text-[11px] text-gray-500 mt-2">Si no se asigna aqui, el sistema usara la cuenta general definida en Configuracion de Inventarios.</p>
                      {cuentaInventarioGeneralId && cuentaInventarioGeneralValida ? (
                        <p className="text-[11px] text-emerald-400 mt-1">Recomendacion actual: {cuentaInventarioGeneralLabel}</p>
                      ) : cuentaInventarioGeneralId ? (
                        <div className="mt-1 rounded-none border border-yellow-700/60 bg-yellow-900/20 px-3 py-2 text-[11px] text-yellow-300">
                          La cuenta general configurada no pertenece a la rama de inventarios: {cuentaInventarioGeneralLabel}
                        </div>
                      ) : (
                        <p className="text-[11px] text-yellow-500 mt-1">No hay cuenta general de inventarios configurada.</p>
                      )}
                    </>
                  )}
                </div>
                <div className="border border-gray-700 bg-gray-900/40 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Configuracion contable vigente</div>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Inventario</span>
                      <span className="text-right text-gray-200">{cuentaInventarioGeneralLabel || 'Sin asignar'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Costo de ventas</span>
                      <span className="text-right text-gray-200">{cuentaCostoVentas ? `${cuentaCostoVentas.codigo} - ${cuentaCostoVentas.nombre}` : 'Sin asignar'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Ajuste inventario</span>
                      <span className="text-right text-gray-200">{cuentaAjusteInv ? `${cuentaAjusteInv.codigo} - ${cuentaAjusteInv.nombre}` : 'Sin asignar'}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">Por articulo solo se puede sobreescribir la cuenta de inventario. Costo de ventas y ajustes se toman de la configuracion general.</p>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-400">Para servicios y combos no se requieren existencias ni cuenta contable de inventario.</div>
            )}
          </section>

          {form.tipo === 'combo' && (
            <section className="border-t border-gray-700 pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Componentes del combo</h2>
                  <p className="text-xs text-gray-500 mt-1">Ítems que componen este combo / kit. Aparecen en la FE como sub-líneas.</p>
                </div>
                <button type="button"
                  onClick={() => { setModalSearch(''); setModalCombo({ idx: -1 }); }}
                  className="bg-blue-800 hover:bg-blue-700 text-blue-100 px-3 py-1.5 rounded-none text-xs font-medium transition-colors">
                  + Agregar componente
                </button>
              </div>
              {lineasCombo.length === 0 && (
                <p className="text-xs text-gray-600 italic">Sin componentes. Agregue los ítems del combo.</p>
              )}
              <table className="w-full text-xs">
                {lineasCombo.length > 0 && (
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="pb-1 text-left text-gray-500 font-medium">Componente</th>
                      <th className="pb-1 text-right text-gray-500 font-medium w-20">Cant.</th>
                      <th className="pb-1 text-left text-gray-500 font-medium w-16 pl-2">Unidad</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {lineasCombo.map((linea, i) => (
                    <tr key={i} className="border-b border-gray-800">
                      <td className="py-1.5">
                        <button type="button"
                          onClick={() => { setModalSearch(''); setModalCombo({ idx: i }); }}
                          className="w-full text-left px-2 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-none text-xs transition-colors truncate">
                          {linea.descripcion || <span className="text-gray-500">— seleccionar producto —</span>}
                        </button>
                      </td>
                      <td className="py-1.5 pl-2">
                        <input type="number" value={linea.cantidad} min={0.0001} step="0.0001"
                          onChange={e => setLineasCombo(l => l.map((x, idx) => idx === i ? { ...x, cantidad: +e.target.value } : x))}
                          className="w-full bg-gray-700 border border-gray-600 rounded-none px-2 py-1 text-xs text-right focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className="py-1.5 pl-2">
                        <input value={linea.unidad_medida}
                          onChange={e => setLineasCombo(l => l.map((x, idx) => idx === i ? { ...x, unidad_medida: e.target.value } : x))}
                          className="w-full bg-gray-700 border border-gray-600 rounded-none px-2 py-1 text-xs focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className="py-1.5 pl-2 text-center">
                        <button type="button" onClick={() => setLineasCombo(l => l.filter((_, idx) => idx !== i))}
                          className="text-red-500 hover:text-red-400 font-bold">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Modal buscador de producto */}
              {modalCombo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}
                  onClick={e => { if (e.target === e.currentTarget) setModalCombo(null); }}>
                  <div className="bg-gray-800 border border-gray-600 rounded-none w-full max-w-lg shadow-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                      <span className="text-sm font-semibold text-white">Seleccionar componente</span>
                      <button type="button" onClick={() => setModalCombo(null)} className="text-gray-400 hover:text-white text-lg font-bold">✕</button>
                    </div>
                    {/* Buscador */}
                    <div className="px-4 py-3 border-b border-gray-700">
                      <input autoFocus value={modalSearch} onChange={e => setModalSearch(e.target.value)}
                        placeholder="Buscar por código o descripción..."
                        className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-white" />
                    </div>
                    {/* Lista */}
                    <div className="overflow-y-auto flex-1">
                      {productosModal
                        .filter(p => {
                          const q = modalSearch.toLowerCase();
                          return !q || p.descripcion.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q);
                        })
                        .slice(0, 80)
                        .map(p => (
                          <button key={p.id} type="button"
                            onClick={() => {
                              if (modalCombo.idx === -1) {
                                // Agregar nueva línea
                                setLineasCombo(l => [...l, { descripcion: p.descripcion, cantidad: 1, unidad_medida: p.unidad_medida || 'Unid' }]);
                              } else {
                                // Reemplazar línea existente
                                setLineasCombo(l => l.map((x, idx) => idx === modalCombo.idx
                                  ? { ...x, descripcion: p.descripcion, unidad_medida: p.unidad_medida || x.unidad_medida }
                                  : x));
                              }
                              setModalCombo(null);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-700 border-b border-gray-700/50 transition-colors">
                            <div className="text-sm text-white">{p.descripcion}</div>
                            {p.codigo && <div className="text-xs text-gray-500 mt-0.5">Cód: {p.codigo} · {p.unidad_medida}</div>}
                          </button>
                        ))}
                      {productosModal.filter(p => {
                        const q = modalSearch.toLowerCase();
                        return !q || p.descripcion.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q);
                      }).length === 0 && (
                        <p className="px-4 py-6 text-sm text-gray-500 text-center">Sin resultados para "{modalSearch}"</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="p-6 space-y-3">
            <h2 className="text-sm font-semibold text-white">Acciones</h2>
            {error && <div className="bg-red-900/30 border border-red-700 rounded-none px-3 py-2 text-sm text-red-300">{error}</div>}
            <div className="flex flex-col gap-3">
              <button onClick={onVolver} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-none text-sm transition-colors text-white">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="bg-green-700 hover:bg-green-600 disabled:opacity-50 px-5 py-2 rounded-none text-sm font-medium transition-colors text-white">
                {guardando ? 'Guardando...' : modo === 'nuevo' ? 'Crear producto' : 'Guardar cambios'}
              </button>
            </div>
          </section>
        </aside>

        <div className="min-w-0 bg-gray-800/70">
          <section className="overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-700 bg-gray-900">
              <p className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Ficha del producto</p>
            </div>
            <div className="px-6 py-4 space-y-5">
          <div className="grid grid-cols-1 gap-5">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-white">Datos generales</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-gray-400 text-xs mb-1">Codigo interno</label>
                <input value={form.codigo} onChange={e => handleChange('codigo', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Codigo de barras</label>
                <input value={form.codigo_barras} onChange={e => handleChange('codigo_barras', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500" placeholder="EAN / UPC / codigo escaneable" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Tipo</label>
                <select value={form.tipo} onChange={e => handleChange('tipo', e.target.value as FormData['tipo'])} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                  <option value="producto">Producto (bien)</option>
                  <option value="servicio">Servicio</option>
                  <option value="combo">Combo</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Descuento autorizado (%)</label>
                <input
                  {...numericEditProps(draftValue('descuento_autorizado_pct', form.descuento_autorizado_pct), (value) => changeDraft('descuento_autorizado_pct', value))}
                  onFocus={(e) => { startDraft('descuento_autorizado_pct', form.descuento_autorizado_pct); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                  onBlur={() => commitFormDraft('descuento_autorizado_pct', 'descuento_autorizado_pct')}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFormDraft('descuento_autorizado_pct', 'descuento_autorizado_pct'); } }}
                  className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Descripcion <span className="text-red-400">*</span></label>
              <input value={form.descripcion} onChange={e => handleChange('descripcion', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="Nombre del producto o servicio" />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Descripcion detallada</label>
              <textarea value={form.descripcion_detallada} onChange={e => handleChange('descripcion_detallada', e.target.value)} rows={3} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500" placeholder="Descripcion adicional opcional" />
            </div>
            <div className={`grid grid-cols-1 gap-4 ${bodegas.length > 0 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Categoria</label>
                <select value={form.categoria_id} onChange={e => { void handleCategoriaChange(e.target.value); }} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Sin categoria</option>
                  {categorias.map(c => <option key={c.id} value={String(c.id)}>{c.codigo_prefijo ? `${c.codigo_prefijo} - ${c.nombre}` : c.nombre}</option>)}
                </select>
                {form.categoria_id && (
                  <p className="mt-1 text-[11px] text-emerald-400">
                    Prefijo sugerido: {slugPrefijo(String(categorias.find((c) => String(c.id) === form.categoria_id)?.codigo_prefijo || categorias.find((c) => String(c.id) === form.categoria_id)?.nombre || 'PROD'))}
                  </p>
                )}
              </div>
              {bodegas.length > 0 && (
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Bodega</label>
                  <select value={form.bodega_id} onChange={e => handleChange('bodega_id', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                    <option value="">— Sin bodega —</option>
                    {bodegas.map(b => <option key={b.id} value={String(b.id)}>{b.nombre}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-gray-400 text-xs mb-1">Unidad de medida <span className="text-gray-600">(FE Nota 15)</span></label>
                <SearchableSelect value={form.unidad_medida} options={UNIDADES} onChange={v => handleChange('unidad_medida', v)} placeholder="Buscar unidad..." />
              </div>
            </div>
          </section>

          <section className="border-t border-gray-700 pt-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">CABYS e impuestos</h2>
              <p className="text-xs text-gray-500 mt-1">Defina el codigo CABYS, tipo de impuesto y tarifa para facturacion electronica.</p>
            </div>
              <button onClick={() => setOpenCabys(true)} className="bg-blue-800 hover:bg-blue-700 text-blue-100 px-3 py-2 rounded-none text-xs font-medium transition-colors">Buscar CABYS</button>
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Codigo CABYS <span className="text-gray-600">(13 digitos)</span></label>
              <input value={form.codigo_cabys} onChange={e => handleChange('codigo_cabys', e.target.value.replace(/\D/g, '').slice(0, 13))} className={`w-full bg-gray-700 border rounded-none px-3 py-2 text-sm font-mono focus:outline-none ${form.codigo_cabys && form.codigo_cabys.length !== 13 ? 'border-yellow-600 focus:border-yellow-500' : 'border-gray-600 focus:border-blue-500'}`} placeholder="Ej: 1234567890100" />
              {form.codigo_cabys && form.codigo_cabys.length > 0 && form.codigo_cabys.length !== 13 && <p className="text-yellow-500 text-xs mt-1">{form.codigo_cabys.length}/13 digitos</p>}
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Tipo de impuesto</label>
              <SearchableSelect value={form.codigo_impuesto} options={CODIGOS_IMPUESTO} onChange={v => handleChange('codigo_impuesto', v)} placeholder="Buscar tipo de impuesto..." />
            </div>
            {['01', '07', '08'].includes(form.codigo_impuesto) && (
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Codigo tarifa</label>
                  <SearchableSelect
                    value={form.codigo_tarifa_iva}
                    options={CODIGOS_TARIFA_IVA}
                    onChange={cod => {
                      handleChange('codigo_tarifa_iva', cod);
                      handleChange('tarifa_iva', String(CODIGO_A_TARIFA[cod] ?? 0));
                    }}
                    placeholder="Buscar codigo tarifa..."
                  />
                </div>
                <span className={`px-2 py-1 rounded-none text-sm font-bold ${Number(form.tarifa_iva) === 13 ? 'bg-green-900 text-green-300' : Number(form.tarifa_iva) === 0 ? 'bg-gray-700 text-gray-400' : 'bg-yellow-900 text-yellow-300'}`}>{form.tarifa_iva}%</span>
              </div>
            )}
            {form.codigo_cabys && form.codigo_cabys.length === 13 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-none border border-gray-700 bg-gray-900/40 px-3 py-3 text-xs">
                <div>
                  <div className="text-gray-500 uppercase tracking-wide mb-1">CABYS</div>
                  <div className="font-mono text-blue-300">{form.codigo_cabys}</div>
                </div>
                <div>
                  <div className="text-gray-500 uppercase tracking-wide mb-1">Impuesto</div>
                  <div className="text-gray-200">{form.codigo_impuesto}</div>
                </div>
                <div>
                  <div className="text-gray-500 uppercase tracking-wide mb-1">Tarifa</div>
                  <div className="text-gray-200">{form.tarifa_iva}% - cod. {form.codigo_tarifa_iva}</div>
                </div>
              </div>
            )}
            <div>
              <label className="block text-gray-400 text-xs mb-1">Partida arancelaria <span className="text-gray-600">(exportación)</span></label>
              <input value={form.partida_arancelaria} onChange={e => handleChange('partida_arancelaria', e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                placeholder="Ej: 0804.30.00" />
            </div>
          </section>

          <section className="border-t border-gray-700 pt-5 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Compra, costeo y precios</h2>
              <p className="text-xs text-gray-500 mt-1">Primero definimos como se compra y se costea el articulo. Luego, desde ese costo neto, salen las escalas de venta. FE usa la escala 1 por defecto y puede heredar otra segun la politica del cliente.</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Costeo de compra</h3>
                  <p className="text-[11px] text-gray-500 mt-1">Defina el precio bruto del proveedor, la presentacion de compra y los elementos que afectan el costo neto unitario.</p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-gray-300 shrink-0">
                  <input id="fleteCosto" type="checkbox" checked={form.incluir_flete_en_costo} onChange={e => setForm(f => ({ ...f, incluir_flete_en_costo: e.target.checked }))} className="h-4 w-4 rounded-none border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500" />
                  Incluir flete en costo
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Unidad de compra</label>
                  <SearchableSelect value={form.unidad_compra} options={UNIDADES} onChange={v => handleChange('unidad_compra', v)} placeholder="Buscar unidad compra..." />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Unidad base</label>
                  <input readOnly value={UNIDADES.find((u) => u.codigo === form.unidad_medida)?.label || form.unidad_medida} className="w-full bg-gray-900 border border-gray-700 rounded-none px-3 py-2 text-sm text-gray-200" />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Factor conversion</label>
                  <input
                    {...numericEditProps(draftValue('factor_conversion', form.factor_conversion), (value) => changeDraft('factor_conversion', value))}
                    onFocus={(e) => { startDraft('factor_conversion', form.factor_conversion); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                    onBlur={() => commitFormDraft('factor_conversion', 'factor_conversion')}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFormDraft('factor_conversion', 'factor_conversion'); } }}
                    className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">Cuantas unidades base contiene la compra. Ej: caja de 12.</p>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Precio bruto proveedor</label>
                  <input
                    {...numericEditProps(draftValue('precio_compra_ref', form.precio_compra_ref), (value) => changeDraft('precio_compra_ref', value))}
                    onFocus={(e) => { startDraft('precio_compra_ref', form.precio_compra_ref); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                    onBlur={() => commitFormDraft('precio_compra_ref', 'precio_compra_ref')}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFormDraft('precio_compra_ref', 'precio_compra_ref'); } }}
                    className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Descuento compra %</label>
                  <input
                    {...numericEditProps(draftValue('descuento_compra_pct', form.descuento_compra_pct), (value) => changeDraft('descuento_compra_pct', value))}
                    onFocus={(e) => { startDraft('descuento_compra_pct', form.descuento_compra_pct); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                    onBlur={() => commitFormDraft('descuento_compra_pct', 'descuento_compra_pct')}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFormDraft('descuento_compra_pct', 'descuento_compra_pct'); } }}
                    className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Bonificacion unid.</label>
                  <input
                    {...numericEditProps(draftValue('bonificacion_unidades', form.bonificacion_unidades), (value) => changeDraft('bonificacion_unidades', value))}
                    onFocus={(e) => { startDraft('bonificacion_unidades', form.bonificacion_unidades); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                    onBlur={() => commitFormDraft('bonificacion_unidades', 'bonificacion_unidades')}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFormDraft('bonificacion_unidades', 'bonificacion_unidades'); } }}
                    className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Imp. consumo</label>
                  <input
                    {...numericEditProps(draftValue('impuesto_consumo_monto', form.impuesto_consumo_monto), (value) => changeDraft('impuesto_consumo_monto', value))}
                    onFocus={(e) => { startDraft('impuesto_consumo_monto', form.impuesto_consumo_monto); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                    onBlur={() => commitFormDraft('impuesto_consumo_monto', 'impuesto_consumo_monto')}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFormDraft('impuesto_consumo_monto', 'impuesto_consumo_monto'); } }}
                    className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Flete pagado</label>
                  <input
                    {...numericEditProps(draftValue('flete_monto', form.flete_monto), (value) => changeDraft('flete_monto', value))}
                    onFocus={(e) => { startDraft('flete_monto', form.flete_monto); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                    onBlur={() => commitFormDraft('flete_monto', 'flete_monto')}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFormDraft('flete_monto', 'flete_monto'); } }}
                    className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Resumen de costeo</h3>
                <p className="text-[11px] text-gray-500 mt-1">Estos valores salen automaticamente del costeo y alimentan la politica de precios.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 rounded-none border border-gray-700 bg-gray-950/30 px-3 py-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Costo bruto ajustado</div>
                  <div className="text-right font-mono text-gray-100">{Number(form.costo_bruto_ajustado || 0).toLocaleString('es-CR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Unidades efectivas</div>
                  <div className="text-right font-mono text-gray-100">{(Math.max(num(form.factor_conversion), 1) + Math.max(num(form.bonificacion_unidades), 0)).toLocaleString('es-CR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Costo neto unitario</div>
                  <div className="text-right font-mono text-emerald-300">{Number(form.costo_neto_unitario || 0).toLocaleString('es-CR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Precio venta base</div>
                  <div className="text-right font-mono text-sky-300">{Number(form.precio_venta || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Precio por medida</label>
                  <input readOnly value={Number(form.precio_por_medida || 0).toLocaleString('es-CR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} className="w-full bg-gray-950/60 border border-gray-700 rounded-none px-3 py-2 text-sm text-right text-gray-200" />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input id="impIncluido" type="checkbox" checked={form.impuesto_venta_incluido} onChange={e => setForm(f => ({ ...f, impuesto_venta_incluido: e.target.checked }))} className="h-4 w-4 rounded-none border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500" />
                  <label htmlFor="impIncluido" className="text-sm text-gray-300">Impuesto de venta incluido en el precio</label>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Precios de venta</h3>
                <p className="text-[11px] text-gray-500 mt-1">Cada escala calcula utilidad sobre el costo neto unitario. Use la escala 1 como precio comercial base.</p>
              </div>
            <div className="overflow-x-auto rounded-none border border-gray-700">
              <table className="w-full text-xs">
                <thead className="bg-gray-900 text-gray-400 border-b border-gray-700">
                  <tr>
                    <th className="px-3 py-3 text-left">Escala</th>
                    <th className="px-3 py-3 text-right">Utilidad %</th>
                    <th className="px-3 py-3 text-right">Precio venta</th>
                    <th className="px-3 py-3 text-right">Precio final</th>
                  </tr>
                </thead>
                <tbody>
                  {escalas.map((esc, idx) => (
                    <tr key={esc.escala} className={`border-b border-gray-700 ${idx % 2 === 0 ? 'bg-gray-850' : 'bg-gray-800'}`}>
                      <td className="px-3 py-2.5 text-gray-200 font-medium">Escala {esc.escala}</td>
                      <td className="px-3 py-2.5">
                        <input
                          {...numericEditProps(draftValue(`utilidad_${esc.escala}`, esc.utilidad_pct), (value) => changeDraft(`utilidad_${esc.escala}`, value))}
                          onFocus={(e) => { startDraft(`utilidad_${esc.escala}`, esc.utilidad_pct); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                          onBlur={() => commitEscalaDraft(esc.escala, 'utilidad_pct', `utilidad_${esc.escala}`)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEscalaDraft(esc.escala, 'utilidad_pct', `utilidad_${esc.escala}`); } }}
                          className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          {...numericEditProps(draftValue(`precio_${esc.escala}`, esc.precio_venta), (value) => changeDraft(`precio_${esc.escala}`, value))}
                          onFocus={(e) => { startDraft(`precio_${esc.escala}`, esc.precio_venta); setTimeout(() => { try { e.currentTarget.select(); } catch {} }, 0); }}
                          onBlur={() => commitEscalaDraft(esc.escala, 'precio_venta', `precio_${esc.escala}`)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEscalaDraft(esc.escala, 'precio_venta', `precio_${esc.escala}`); } }}
                          className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-300">{Number(esc.precio_final || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
            <div className="rounded-none border border-gray-700 bg-gray-950/30 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Compra por proveedor</h3>
                  <p className="text-[11px] text-gray-500 mt-1">Defina proveedores habituales y, si quiere, aplique una fila al costeo general del articulo.</p>
                </div>
                <button type="button" onClick={addCompraProveedor} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-none text-xs transition-colors">+ Agregar proveedor</button>
              </div>
              {comprasProveedor.length === 0 ? (
                <div className="text-xs text-gray-500 border border-gray-700 bg-gray-950/40 px-3 py-3 rounded-none">
                  No hay condiciones de compra por proveedor definidas.
                </div>
              ) : (
                <div className="space-y-3">
                  {comprasProveedor.map((row, idx) => (
                    <div key={`${row.id || 'new'}-${idx}`} className="border border-gray-700 bg-gray-900/30 p-3 space-y-3">
                      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_120px_120px_80px_70px] gap-3 items-end">
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Proveedor</label>
                          <select
                            value={row.tercero_id}
                            onChange={(e) => updateCompraProveedor(idx, { tercero_id: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Seleccione proveedor</option>
                            {proveedores.map((p) => (
                              <option key={p.id} value={String(p.id)}>{p.codigo ? `${p.codigo} � ` : ''}{p.razon_social}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Principal</label>
                          <label className="flex items-center gap-2 h-[42px] px-3 border border-gray-700 bg-gray-900/30 text-sm text-gray-200">
                            <input type="checkbox" checked={row.es_principal} onChange={(e) => updateCompraProveedor(idx, { es_principal: e.target.checked })} className="h-4 w-4 rounded-none border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500" />
                            Principal
                          </label>
                        </div>
                        <div>
                          <button type="button" onClick={() => aplicarCompraProveedor(row)} className="w-full h-[42px] bg-blue-800 hover:bg-blue-700 text-blue-100 text-xs font-medium transition-colors">Usar en costeo</button>
                        </div>
                        <div>
                          <button type="button" onClick={() => removeCompraProveedor(idx)} className="w-full h-[42px] bg-red-800 hover:bg-red-700 text-red-100 text-sm font-medium transition-colors">X</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Codigo proveedor</label>
                          <input value={row.codigo_proveedor} onChange={(e) => updateCompraProveedor(idx, { codigo_proveedor: e.target.value })} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Descripcion proveedor</label>
                          <input value={row.descripcion_proveedor} onChange={(e) => updateCompraProveedor(idx, { descripcion_proveedor: e.target.value })} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Unidad compra</label>
                          <SearchableSelect value={row.unidad_compra} options={UNIDADES} onChange={(value) => updateCompraProveedor(idx, { unidad_compra: value })} placeholder="Buscar unidad compra..." />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Factor conversion</label>
                          <input {...numericEditProps(row.factor_conversion, (value) => updateCompraProveedor(idx, { factor_conversion: value }))} className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Precio bruto</label>
                          <input {...numericEditProps(row.precio_bruto_proveedor, (value) => updateCompraProveedor(idx, { precio_bruto_proveedor: value }))} className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Desc. compra %</label>
                          <input {...numericEditProps(row.descuento_compra_pct, (value) => updateCompraProveedor(idx, { descuento_compra_pct: value }))} className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Bonificacion unid.</label>
                          <input {...numericEditProps(row.bonificacion_unidades, (value) => updateCompraProveedor(idx, { bonificacion_unidades: value }))} className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Imp. consumo</label>
                          <input {...numericEditProps(row.impuesto_consumo_monto, (value) => updateCompraProveedor(idx, { impuesto_consumo_monto: value }))} className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-[11px] mb-1">Flete</label>
                          <input {...numericEditProps(row.flete_monto, (value) => updateCompraProveedor(idx, { flete_monto: value }))} className="prod-num-no-spin w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500" />
                        </div>
                        <div className="xl:col-span-2">
                          <label className="block text-gray-400 text-[11px] mb-1">Tratamiento del flete</label>
                          <label className="flex items-center gap-2 h-[42px] px-3 border border-gray-700 bg-gray-900/30 text-sm text-gray-200">
                            <input type="checkbox" checked={row.incluir_flete_en_costo} onChange={(e) => updateCompraProveedor(idx, { incluir_flete_en_costo: e.target.checked })} className="h-4 w-4 rounded-none border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500" />
                            Incluir flete en costo
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-gray-400 text-xs mb-1">Ubicacion</label>
                <input value={form.ubicacion} onChange={e => handleChange('ubicacion', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1"># Parte</label>
                <input value={form.referencia_parte} onChange={e => handleChange('referencia_parte', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Catalogo</label>
                <input value={form.catalogo_ref} onChange={e => handleChange('catalogo_ref', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Serie</label>
                <input value={form.serie} onChange={e => handleChange('serie', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-none px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </section>
          </div>
            </div>
          </section>
        </div>
      </div>

      {modalCuentaInventario && (
        <ModalSeleccionCuenta
          cuentas={cuentasInventario as any}
          titulo="Cuenta de inventario del producto"
          onSelect={(id) => {
            handleChange('cuenta_inventario_id', String(id));
            setModalCuentaInventario(false);
          }}
          onClose={() => setModalCuentaInventario(false)}
        />
      )}

      {openCabys && <CabysSearch onSelect={handleCabysSelect} onClose={() => setOpenCabys(false)} />}
    </div>
  );
}


