import React, { useEffect, useMemo, useState } from 'react';
import { ModalSeleccionCuenta } from '../../components/ModalSeleccionCuenta';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { supabase } from '../../supabase';

interface CuentasBancariasProps {
  empresaId: number;
  canView?: boolean;
  canEdit?: boolean;
  vista?: 'cuentas' | 'conciliacion' | 'depositos' | 'egresos';
  onAbrirCatalogoContable?: () => void;
}

interface CuentaBancoRow {
  id: number;
  empresa_id: number;
  codigo: string;
  alias: string;
  banco_nombre: string;
  titular: string | null;
  moneda: 'CRC' | 'USD';
  numero_cuenta: string;
  cuenta_contable_id: number;
  cuenta_contable_codigo: string;
  cuenta_contable_nombre: string;
  activo: boolean;
}

interface CuentaContableOpt {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  cuenta_base_id?: number | null;
}

interface CuentaBaseRef {
  id: number;
  codigo: string;
  nombre: string;
  padre_id: number | null;
  acepta_movimiento?: boolean;
  activo?: boolean;
}

interface AuxiliarCuentaRow {
  id: number;
  origen_tipo?: string;
  origen_id?: number;
  pago_id: number;
  cierre_caja_id?: number | null;
  fecha_movimiento: string;
  tercero_nombre: string;
  tercero_identificacion: string | null;
  monto: number;
  moneda: 'CRC' | 'USD' | string;
  referencia: string | null;
  detalle?: string | null;
  estado_conciliacion: string;
  estado_pago: string;
  estado_origen?: string;
  cuenta_banco_id: number | null;
  asiento_id?: number | null;
}

interface ConciliacionPeriodoRow {
  id: number;
  cuenta_banco_id: number;
  cuenta_banco_codigo: string;
  cuenta_banco_alias: string;
  banco_nombre: string;
  moneda: 'CRC' | 'USD' | string;
  fecha_desde: string;
  fecha_hasta: string;
  saldo_libros: number;
  saldo_banco: number;
  diferencia: number;
  observacion: string | null;
  estado: string;
  cerrado_en: string | null;
}

interface EstadoImportadoRow {
  id: number;
  periodo_id: number;
  fecha_movimiento: string;
  descripcion: string;
  referencia: string | null;
  debito: number;
  credito: number;
  saldo: number | null;
  conciliado: boolean;
}

interface ImportPreviewRow {
  fecha_movimiento: string;
  descripcion: string;
  referencia: string | null;
  debito: number;
  credito: number;
  saldo: number | null;
}

interface MatchRow {
  id: number;
  estado_linea_id: number;
  auxiliar_id: number;
  banco_fecha: string;
  banco_descripcion: string;
  banco_referencia: string | null;
  debito: number;
  credito: number;
  saldo: number | null;
  erp_fecha: string;
  pago_id: number;
  erp_monto: number;
  erp_referencia: string | null;
  tercero_nombre: string;
}

interface SuggestionRow {
  estado_linea_id: number;
  auxiliar_id: number;
  banco_fecha: string;
  banco_descripcion: string;
  banco_referencia: string | null;
  banco_monto: number;
  erp_fecha: string;
  pago_id: number;
  tercero_nombre: string;
  erp_referencia: string | null;
  erp_monto: number;
  diferencia_monto: number;
  diferencia_dias: number;
  score: number;
}

interface DiferenciaConciliacionRow {
  id: number;
  periodo_id: number;
  cuenta_banco_id: number;
  fecha: string;
  tipo: string;
  sentido: 'resta' | 'suma' | string;
  descripcion: string;
  referencia: string | null;
  cuenta_contable_id: number;
  cuenta_contable_codigo: string;
  cuenta_contable_nombre: string;
  monto: number;
  asiento_id: number | null;
  asiento_numero: string | null;
  estado: string;
  observacion_anulacion: string | null;
}

interface DepositoIngresoRow {
  id: number;
  empresa_id: number;
  cuenta_banco_id: number;
  cuenta_banco_codigo: string;
  cuenta_banco_alias: string;
  banco_nombre: string;
  cierre_caja_id: number | null;
  tercero_id: number | null;
  tercero_nombre: string | null;
  fecha_movimiento: string;
  tipo_movimiento: string;
  moneda: 'CRC' | 'USD' | string;
  monto: number;
  referencia: string | null;
  detalle: string;
  cuenta_contrapartida_id: number;
  cuenta_contrapartida_codigo: string;
  cuenta_contrapartida_nombre: string;
  asiento_id: number | null;
  asiento_numero: string | null;
  estado: string;
  estado_conciliacion: string;
  conciliado_en: string | null;
}

interface EgresoBancoRow {
  id: number;
  empresa_id: number;
  cuenta_banco_id: number;
  cuenta_banco_codigo: string;
  cuenta_banco_alias: string;
  banco_nombre: string;
  tercero_id: number | null;
  tercero_nombre: string | null;
  fecha_movimiento: string;
  tipo_movimiento: string;
  moneda: 'CRC' | 'USD' | string;
  monto: number;
  referencia: string | null;
  detalle: string;
  cuenta_principal_id: number;
  cuenta_principal_codigo: string;
  cuenta_principal_nombre: string;
  asiento_id: number | null;
  asiento_numero: string | null;
  estado: string;
  estado_conciliacion: string;
  conciliado_en: string | null;
}

interface CierreCajaBancoRow {
  id: number;
  fecha_desde: string;
  fecha_hasta: string;
  cajero_nombre: string | null;
  efectivo_liquidar: number;
  estado: string;
}

interface DepositoLineaForm {
  id: string;
  cuentaId: number;
  detalle: string;
  monto: number;
  montoTexto: string;
}

interface ImportTemplateDef {
  id: string;
  nombre: string;
  bancos: string[];
  headers: {
    fecha: string[];
    descripcion: string[];
    referencia: string[];
    debito: string[];
    credito: string[];
    saldo: string[];
  };
}

const styles = `
  .bn-wrap { padding:0; }
  .bn-title { font-size:20px; font-weight:600; color:#1f2937; margin-bottom:6px; }
  .bn-sub { font-size:12px; color:#6b7280; margin-bottom:12px; }
  .bn-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:12px; }
  .bn-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px; align-items:end; }
  .bn-field { display:flex; flex-direction:column; gap:4px; }
  .bn-field label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .bn-input, .bn-select { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; font-size:13px; }
  .bn-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .bn-btn { border:1px solid #d1d5db; background:#fff; color:#334155; border-radius:8px; padding:8px 11px; font-size:13px; cursor:pointer; }
  .bn-btn.main { border-color:#16a34a; background:#16a34a; color:#fff; }
  .bn-btn:disabled { opacity:.6; cursor:not-allowed; }
  .bn-msg-ok { margin-bottom:10px; border:1px solid #bbf7d0; background:#dcfce7; color:#166534; border-radius:8px; padding:10px 12px; font-size:12px; }
  .bn-msg-err { margin-bottom:10px; border:1px solid #fecaca; background:#fee2e2; color:#991b1b; border-radius:8px; padding:10px 12px; font-size:12px; }
  .bn-table { border:1px solid #e5e7eb; border-radius:10px; overflow:auto; }
  .bn-table table { width:100%; border-collapse:collapse; min-width:980px; }
  .bn-table th, .bn-table td { padding:8px 10px; border-top:1px solid #f1f5f9; font-size:12px; }
  .bn-table th { background:#f8fafc; color:#64748b; text-transform:uppercase; letter-spacing:.03em; font-size:11px; text-align:left; }
  .bn-empty { color:#64748b; font-size:12px; padding:10px; text-align:center; }
  .bn-badge { display:inline-flex; align-items:center; justify-content:center; border-radius:999px; padding:2px 8px; font-size:10px; font-weight:700; letter-spacing:.02em; text-transform:uppercase; }
  .bn-badge.ok { background:#dcfce7; color:#166534; }
  .bn-badge.off { background:#fee2e2; color:#991b1b; }
  .bn-kpis { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px; margin-bottom:12px; }
  .bn-kpi { border:1px solid #e5e7eb; border-radius:10px; padding:10px; background:#fafafa; }
  .bn-kpi .k { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .bn-kpi .v { margin-top:5px; font-size:18px; font-weight:700; color:#0f172a; }
  .bn-right { text-align:right; font-family:'DM Mono',monospace; }
  .bn-workspace .bn-title { color:#f8fafc; }
  .bn-workspace .bn-sub { color:#64748b; }
  .bn-workspace .bn-card { background:#111827; border-color:#1f2937; color:#e5e7eb; }
  .bn-workspace .bn-kpi { background:#1f2937; border-color:#334155; }
  .bn-workspace .bn-kpi .k { color:#94a3b8; }
  .bn-workspace .bn-kpi .v { color:#f8fafc; }
  .bn-workspace .bn-field label { color:#94a3b8; }
  .bn-workspace .bn-input, .bn-workspace .bn-select {
    background:#374151;
    border-color:#4b5563;
    color:#f8fafc;
  }
  .bn-workspace .bn-input::placeholder { color:#94a3b8; }
  .bn-workspace .bn-table { border-color:#1f2937; }
  .bn-workspace .bn-table th { background:#111827; color:#94a3b8; border-top-color:#1f2937; }
  .bn-workspace .bn-table td { border-top-color:#1f2937; color:#e5e7eb; }
  .bn-workspace .bn-empty { color:#94a3b8; }
  .bn-workspace .bn-btn { background:#374151; border-color:#4b5563; color:#f8fafc; }
  .bn-workspace .bn-btn.main { background:#7c3aed; border-color:#7c3aed; color:#fff; }
  @media (max-width: 1100px) { .bn-grid, .bn-kpis { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 760px) { .bn-grid, .bn-kpis { grid-template-columns: 1fr; } }
`;

const money = (n: number, m: 'CRC' | 'USD' | string = 'CRC') =>
  new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: m === 'USD' ? 'USD' : 'CRC',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const parseMonto = (raw: string) => {
  const v = String(raw || '').trim();
  if (!v) return 0;
  if (v.includes(',')) return Number(v.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(v.replace(/,/g, '')) || 0;
};

const formatMonto = (n: number) =>
  new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const moneyReport = (n: number, m: 'CRC' | 'USD' | string = 'CRC') =>
  `${m === 'USD' ? 'USD' : 'CRC'} ${formatMonto(Number(n || 0))}`;

const documentoConciliacionLabel = (row: AuxiliarCuentaRow) => {
  if (row.origen_tipo === 'deposito_ingreso' && row.origen_id) return `DEP-#${row.origen_id}`;
  if (row.origen_tipo === 'egreso_bancario' && row.origen_id) return `EGR-#${row.origen_id}`;
  if (row.pago_id) return `#${row.pago_id}`;
  if (row.origen_id) return `MOV-#${row.origen_id}`;
  return '-';
};

const traducirErrorBancos = (raw: unknown) => {
  const msg = String(raw || '').trim();
  if (!msg) return 'Ocurrio un error al procesar el movimiento bancario.';
  const normalized = msg.toLowerCase();

  const directMap: Array<[string, string]> = [
    ['usuario_no_autenticado', 'Su sesion no es valida. Ingrese nuevamente al sistema.'],
    ['empresa_cuenta_fecha_requeridos', 'Seleccione la cuenta bancaria y la fecha del movimiento.'],
    ['empresa_cuenta_fecha_contrapartida_requeridos', 'Seleccione cuenta bancaria, fecha y cuenta de contrapartida.'],
    ['tipo_movimiento_invalido', 'El tipo de movimiento seleccionado no es valido.'],
    ['lineas_requeridas', 'Agregue al menos una linea contable.'],
    ['lineas_sin_monto', 'Las lineas contables no tienen montos validos.'],
    ['cuenta_bancaria_contable_invalida', 'La cuenta bancaria no tiene una cuenta contable valida asociada.'],
    ['cuenta_contrapartida_invalida', 'Una de las cuentas de contrapartida no es valida para esta empresa.'],
    ['tipo_cambio_no_encontrado', 'No hay tipo de cambio registrado para la fecha seleccionada.'],
    ['periodo_fiscal_no_encontrado', 'No existe un periodo contable para la fecha del movimiento.'],
    ['periodo_no_encontrado', 'No se encontro el periodo seleccionado.'],
    ['movimiento_no_encontrado', 'No se encontro el movimiento bancario seleccionado.'],
    ['movimiento_anulado', 'El movimiento bancario ya se encuentra anulado.'],
    ['sin_permiso', 'No tiene permisos para realizar esta accion en Bancos.'],
    ['schema cache', 'La base de datos fue actualizada. Recargue e intente nuevamente en unos segundos.'],
  ];

  const found = directMap.find(([key]) => normalized.includes(key));
  if (found) return found[1];
  if (normalized.includes('does not exist')) return 'Falta una estructura requerida en la base de datos de este modulo.';
  if (normalized.includes('not found in the schema cache')) return 'El servicio aun no recarga los cambios recientes de la base de datos.';
  if (normalized.includes('foreign key')) return 'Hay un dato relacionado que no existe o no es valido para este movimiento.';
  return msg;
};

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const initialForm = {
  id: 0,
  codigo: '',
  alias: '',
  banco_nombre: '',
  titular: '',
  moneda: 'CRC' as 'CRC' | 'USD',
  numero_cuenta: '',
  cuenta_contable_id: 0,
  activo: true,
};

const GENERIC_HEADERS = {
  fecha: ['fecha', 'fecha_movimiento', 'fecha operacion', 'fecha de movimiento', 'f. movimiento'],
  descripcion: ['descripcion', 'detalle', 'concepto', 'descripcion transaccion', 'movimiento'],
  referencia: ['referencia', 'documento', 'comprobante', 'num documento', 'secuencia', 'nota'],
  debito: ['debito', 'cargo', 'retiro', 'salida', 'monto debito'],
  credito: ['credito', 'abono', 'deposito', 'entrada', 'monto credito'],
  saldo: ['saldo', 'saldo_libro', 'saldo banco', 'saldo disponible', 'balance'],
};

const IMPORT_TEMPLATES: ImportTemplateDef[] = [
  {
    id: 'GENERICA',
    nombre: 'Generica',
    bancos: [],
    headers: GENERIC_HEADERS,
  },
  {
    id: 'BCR',
    nombre: 'BCR',
    bancos: ['BCR', 'BANCO DE COSTA RICA'],
    headers: {
      fecha: [...GENERIC_HEADERS.fecha, 'fecha transaccion'],
      descripcion: [...GENERIC_HEADERS.descripcion, 'descripcion movimiento'],
      referencia: [...GENERIC_HEADERS.referencia, 'referencia bancaria'],
      debito: [...GENERIC_HEADERS.debito],
      credito: [...GENERIC_HEADERS.credito],
      saldo: [...GENERIC_HEADERS.saldo],
    },
  },
  {
    id: 'BAC',
    nombre: 'BAC',
    bancos: ['BAC', 'BAC CREDOMATIC'],
    headers: {
      fecha: [...GENERIC_HEADERS.fecha, 'fecha aplicacion'],
      descripcion: [...GENERIC_HEADERS.descripcion, 'descripcion del movimiento'],
      referencia: [...GENERIC_HEADERS.referencia, 'numero referencia'],
      debito: [...GENERIC_HEADERS.debito, 'debito local'],
      credito: [...GENERIC_HEADERS.credito, 'credito local'],
      saldo: [...GENERIC_HEADERS.saldo, 'saldo local'],
    },
  },
  {
    id: 'BNCR',
    nombre: 'BNCR',
    bancos: ['BN', 'BNCR', 'BANCO NACIONAL'],
    headers: {
      fecha: [...GENERIC_HEADERS.fecha, 'fecha valor'],
      descripcion: [...GENERIC_HEADERS.descripcion, 'detalle transaccion'],
      referencia: [...GENERIC_HEADERS.referencia, 'referencia cliente'],
      debito: [...GENERIC_HEADERS.debito],
      credito: [...GENERIC_HEADERS.credito],
      saldo: [...GENERIC_HEADERS.saldo],
    },
  },
];

const normalizeHeader = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const findHeaderIndex = (headers: string[], aliases: string[]) => {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
};

const detectTemplateByBank = (bankName: string) => {
  const normalizedBank = normalizeHeader(bankName);
  const match = IMPORT_TEMPLATES.find((template) =>
    template.bancos.some((bank) => normalizedBank.includes(normalizeHeader(bank)))
  );
  return match?.id || 'GENERICA';
};

export default function CuentasBancarias({
  empresaId,
  canView = true,
  canEdit = false,
  vista = 'conciliacion',
  onAbrirCatalogoContable,
}: CuentasBancariasProps) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<CuentaBancoRow[]>([]);
  const [cuentasContables, setCuentasContables] = useState<CuentaContableOpt[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [monedaFiltro, setMonedaFiltro] = useState<'TODAS' | 'CRC' | 'USD'>('TODAS');
  const [soloActivas, setSoloActivas] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [conciliacionCuentaId, setConciliacionCuentaId] = useState<number>(0);
  const [modalCuentaContableOpen, setModalCuentaContableOpen] = useState(false);
  const [modalDiferenciaCuentaOpen, setModalDiferenciaCuentaOpen] = useState(false);
  const [conciliacionDesde, setConciliacionDesde] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [conciliacionHasta, setConciliacionHasta] = useState(new Date().toISOString().slice(0, 10));
  const [saldoBanco, setSaldoBanco] = useState<number>(0);
  const [saldoBancoTexto, setSaldoBancoTexto] = useState('');
  const [observacionPeriodo, setObservacionPeriodo] = useState('');
  const [periodosRows, setPeriodosRows] = useState<ConciliacionPeriodoRow[]>([]);
  const [movimientosRows, setMovimientosRows] = useState<AuxiliarCuentaRow[]>([]);
  const [auxiliarRows, setAuxiliarRows] = useState<AuxiliarCuentaRow[]>([]);
  const [periodoImportId, setPeriodoImportId] = useState<number>(0);
  const [estadoRows, setEstadoRows] = useState<EstadoImportadoRow[]>([]);
  const [previewImport, setPreviewImport] = useState<ImportPreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importTemplateId, setImportTemplateId] = useState('AUTO');
  const [selectedEstadoId, setSelectedEstadoId] = useState<number>(0);
  const [selectedAuxiliarId, setSelectedAuxiliarId] = useState<number>(0);
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [cuentasMovimientoEmpresa, setCuentasMovimientoEmpresa] = useState<CuentaContableOpt[]>([]);
  const [diferenciasRows, setDiferenciasRows] = useState<DiferenciaConciliacionRow[]>([]);
  const [diferenciaFecha, setDiferenciaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [diferenciaTipo, setDiferenciaTipo] = useState<'comision' | 'cargo' | 'interes' | 'ajuste'>('comision');
  const [diferenciaSentido, setDiferenciaSentido] = useState<'resta' | 'suma'>('resta');
  const [diferenciaDescripcion, setDiferenciaDescripcion] = useState('');
  const [diferenciaReferencia, setDiferenciaReferencia] = useState('');
  const [diferenciaCuentaId, setDiferenciaCuentaId] = useState<number>(0);
  const [diferenciaMonto, setDiferenciaMonto] = useState(0);
  const [diferenciaMontoTexto, setDiferenciaMontoTexto] = useState('');
  const [cierresCajaRows, setCierresCajaRows] = useState<CierreCajaBancoRow[]>([]);
  const [depositosRows, setDepositosRows] = useState<DepositoIngresoRow[]>([]);
  const [selectedDepositoId, setSelectedDepositoId] = useState<number>(0);
  const [depositoFecha, setDepositoFecha] = useState(new Date().toISOString().slice(0, 10));
  const [depositoTipo, setDepositoTipo] = useState<'deposito_caja' | 'ingreso_directo' | 'transferencia_recibida' | 'interes_bancario' | 'ajuste_favor' | 'otro'>('ingreso_directo');
  const [depositoMoneda, setDepositoMoneda] = useState<'CRC' | 'USD'>('CRC');
  const [depositoMonto, setDepositoMonto] = useState(0);
  const [depositoMontoTexto, setDepositoMontoTexto] = useState('');
  const [depositoReferencia, setDepositoReferencia] = useState('');
  const [depositoDetalle, setDepositoDetalle] = useState('');
  const [depositoLineas, setDepositoLineas] = useState<DepositoLineaForm[]>([{ id: 'dep-linea-1', cuentaId: 0, detalle: '', monto: 0, montoTexto: '' }]);
  const [depositoLineaTarget, setDepositoLineaTarget] = useState<number | null>(null);
  const [depositoCierreId, setDepositoCierreId] = useState<number>(0);
  const [depositoTerceroId, setDepositoTerceroId] = useState<number>(0);
  const [modalDepositoCuentaOpen, setModalDepositoCuentaOpen] = useState(false);
  const [egresosRows, setEgresosRows] = useState<EgresoBancoRow[]>([]);
  const [selectedEgresoId, setSelectedEgresoId] = useState<number>(0);
  const [egresoFecha, setEgresoFecha] = useState(new Date().toISOString().slice(0, 10));
  const [egresoTipo, setEgresoTipo] = useState<'cheque' | 'nota_debito' | 'transferencia_emitida' | 'otro'>('cheque');
  const [egresoMoneda, setEgresoMoneda] = useState<'CRC' | 'USD'>('CRC');
  const [egresoMonto, setEgresoMonto] = useState(0);
  const [egresoMontoTexto, setEgresoMontoTexto] = useState('');
  const [egresoReferencia, setEgresoReferencia] = useState('');
  const [egresoDetalle, setEgresoDetalle] = useState('');
  const [egresoLineas, setEgresoLineas] = useState<DepositoLineaForm[]>([{ id: 'egr-linea-1', cuentaId: 0, detalle: '', monto: 0, montoTexto: '' }]);
  const [egresoLineaTarget, setEgresoLineaTarget] = useState<number | null>(null);
  const [modalEgresoCuentaOpen, setModalEgresoCuentaOpen] = useState(false);
  const [tipoCambioDia, setTipoCambioDia] = useState<number>(1);
  const [tipoCambioFuente, setTipoCambioFuente] = useState('');
  const [operativaPage, setOperativaPage] = useState(1);
  const esVistaDepositos = vista === 'depositos';
  const esVistaEgresos = vista === 'egresos';
  const esVistaCuentas = vista === 'cuentas';
  const esVistaOperativa = esVistaDepositos || esVistaEgresos;
  const esVistaConciliacion = !esVistaOperativa && !esVistaCuentas;

  const cargar = async () => {
    if (!canView) return;
    setBusy(true);
    setErr('');
    const [{ data: cuentasData, error: cuentasErr }, { data: contablesData, error: contablesErr }, { data: baseData, error: baseErr }] = await Promise.all([
      supabase
        .from('vw_cuentas_bancarias_empresa')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('activo', { ascending: false })
        .order('codigo', { ascending: true }),
      supabase
        .from('plan_cuentas_empresa')
        .select('id,codigo,nombre,activo,cuenta_base_id')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('codigo', { ascending: true }),
      supabase
        .from('plan_cuentas_base')
        .select('id,codigo,nombre,padre_id,acepta_movimiento,activo')
        .eq('activo', true),
    ]);

    if (cuentasErr) setErr(cuentasErr.message || 'No se pudieron cargar las cuentas bancarias.');
    if (contablesErr) setErr(contablesErr.message || 'No se pudieron cargar las cuentas contables.');
    if (baseErr) setErr(baseErr.message || 'No se pudo cargar la jerarquia contable base.');

    setRows((cuentasData || []) as CuentaBancoRow[]);
    const baseRows = (baseData || []) as CuentaBaseRef[];

    const baseMap = new Map<number, CuentaBaseRef>();
    baseRows.forEach((row) => baseMap.set(row.id, row));

    const perteneceARamaBancos = (baseId: number | null | undefined) => {
      let currentId = Number(baseId || 0);
      let guard = 0;
      while (currentId > 0 && guard < 20) {
        const node = baseMap.get(currentId);
        if (!node) return false;
        const nombre = String(node.nombre || '').trim().toUpperCase();
        const codigo = String(node.codigo || '').trim().toUpperCase();
        if (nombre === 'BANCOS' || codigo === '0101-01-002') return true;
        currentId = Number(node.padre_id || 0);
        guard += 1;
      }
      return false;
    };

    const cuentasMovimiento = ((contablesData || []) as CuentaContableOpt[]).filter((c) => {
      const base = c.cuenta_base_id ? baseMap.get(c.cuenta_base_id) : null;
      if (!base?.acepta_movimiento) return false;
      return true;
    });
    const cuentasBanco = cuentasMovimiento.filter((c) => perteneceARamaBancos(c.cuenta_base_id));
    const cuentasUsadas = new Set(
      ((cuentasData || []) as CuentaBancoRow[])
        .filter((r) => r.id !== form.id)
        .map((r) => Number(r.cuenta_contable_id || 0))
        .filter((id) => id > 0)
    );
    const primeraDisponible = cuentasBanco.find((c) => !cuentasUsadas.has(c.id))?.id || 0;
    setCuentasContables(cuentasBanco);
    setCuentasMovimientoEmpresa(cuentasMovimiento);
    if (!form.id) {
      const actualValido = cuentasMovimiento.some((c) => c.id === form.cuenta_contable_id && !cuentasUsadas.has(c.id));
      if (!actualValido) {
        setForm((prev) => ({ ...prev, cuenta_contable_id: primeraDisponible }));
      }
    }
    if (!conciliacionCuentaId && (cuentasData || []).length > 0) {
      setConciliacionCuentaId(Number((cuentasData as CuentaBancoRow[])[0]?.id || 0));
    }
    setBusy(false);
  };

  const cuentasContablesDisponibles = useMemo(() => {
    const usadas = new Set(
      rows
        .filter((r) => r.id !== form.id)
        .map((r) => Number(r.cuenta_contable_id || 0))
        .filter((id) => id > 0)
    );
    return cuentasContables.filter((c) => !usadas.has(c.id) || c.id === form.cuenta_contable_id);
  }, [cuentasContables, form.cuenta_contable_id, form.id, rows]);

  useEffect(() => {
    cargar();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const actualDisponible = cuentasContablesDisponibles.some((c) => c.id === form.cuenta_contable_id);
    if (!actualDisponible) {
      setForm((prev) => ({
        ...prev,
        cuenta_contable_id: cuentasContablesDisponibles[0]?.id || 0,
      }));
    }
  }, [cuentasContablesDisponibles, form.cuenta_contable_id]);

  useEffect(() => {
    if (!rows.some((r) => r.id === conciliacionCuentaId)) {
      setConciliacionCuentaId(rows[0]?.id || 0);
    }
  }, [rows, conciliacionCuentaId]);

  useEffect(() => {
    if (!(esVistaConciliacion || esVistaOperativa)) return;
    loadMovimientosPeriodo();
    loadAuxiliarCobros();
  }, [empresaId, conciliacionCuentaId, conciliacionDesde, conciliacionHasta, esVistaConciliacion, esVistaOperativa]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPeriodos = async () => {
    if (!empresaId) {
      setPeriodosRows([]);
      return;
    }
    let query = supabase
      .from('vw_bancos_conciliacion_periodos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_desde', { ascending: false })
      .order('id', { ascending: false })
      .limit(30);

    if (conciliacionCuentaId) query = query.eq('cuenta_banco_id', conciliacionCuentaId);

    const { data, error } = await query;
    if (error) {
      setErr(error.message || 'No se pudieron cargar los periodos de conciliacion.');
      setPeriodosRows([]);
      return;
    }
    setPeriodosRows((data || []) as ConciliacionPeriodoRow[]);
  };

  useEffect(() => {
    if (!esVistaConciliacion) return;
    loadPeriodos();
  }, [empresaId, conciliacionCuentaId, esVistaConciliacion]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTipoCambioDia = async (fecha: string) => {
    if (!empresaId || !fecha) {
      setTipoCambioDia(1);
      setTipoCambioFuente('');
      return;
    }
    const { data, error } = await supabase
      .from('tipo_cambio_historial')
      .select('venta, compra, fuente')
      .eq('empresa_id', empresaId)
      .eq('fecha', fecha)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setTipoCambioDia(1);
      setTipoCambioFuente('');
      return;
    }

    const tc = Number(data?.venta || data?.compra || 0);
    setTipoCambioDia(tc > 0 ? tc : 1);
    setTipoCambioFuente(String(data?.fuente || '').trim());
  };

  useEffect(() => {
    if (!esVistaConciliacion) return;
    if (!periodosRows.some((p) => p.id === periodoImportId)) {
      setPeriodoImportId(periodosRows[0]?.id || 0);
    }
  }, [periodosRows, periodoImportId, esVistaConciliacion]);

  const rowsFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter((r) => {
      if (soloActivas && !r.activo) return false;
      if (monedaFiltro !== 'TODAS' && r.moneda !== monedaFiltro) return false;
      if (!q) return true;
      return [
        r.codigo,
        r.alias,
        r.banco_nombre,
        r.numero_cuenta,
        r.titular,
        r.cuenta_contable_codigo,
        r.cuenta_contable_nombre,
      ].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [rows, busqueda, monedaFiltro, soloActivas]);

  const cuentaConciliacion = useMemo(
    () => rows.find((r) => r.id === conciliacionCuentaId) || null,
    [rows, conciliacionCuentaId]
  );

  const periodoActivo = useMemo(
    () => periodosRows.find((p) => p.id === periodoImportId) || null,
    [periodosRows, periodoImportId]
  );

  const cuentasDiferenciaDisponibles = useMemo(
    () => cuentasMovimientoEmpresa.filter((c) => c.id !== cuentaConciliacion?.cuenta_contable_id),
    [cuentasMovimientoEmpresa, cuentaConciliacion?.cuenta_contable_id]
  );

  const cuentaDiferenciaActual = useMemo(
    () => cuentasMovimientoEmpresa.find((c) => c.id === diferenciaCuentaId) || null,
    [cuentasMovimientoEmpresa, diferenciaCuentaId]
  );

  const cierresCajaDisponibles = useMemo(() => {
    const usados = new Set(
      depositosRows
        .filter((r) => r.estado !== 'anulado' && r.cierre_caja_id)
        .map((r) => Number(r.cierre_caja_id || 0))
        .filter((id) => id > 0)
    );
    return cierresCajaRows.filter((c) => !usados.has(c.id) || c.id === depositoCierreId);
  }, [cierresCajaRows, depositosRows, depositoCierreId]);

  const effectiveImportTemplate = useMemo(() => {
    const resolvedId = importTemplateId === 'AUTO'
      ? detectTemplateByBank(cuentaConciliacion?.banco_nombre || '')
      : importTemplateId;
    return IMPORT_TEMPLATES.find((template) => template.id === resolvedId) || IMPORT_TEMPLATES[0];
  }, [cuentaConciliacion?.banco_nombre, importTemplateId]);

  const loadMovimientosPeriodo = async () => {
    if (!empresaId || !conciliacionCuentaId) {
      setMovimientosRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_bancos_movimientos_conciliacion')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('cuenta_banco_id', conciliacionCuentaId)
      .gte('fecha_movimiento', conciliacionDesde)
      .lte('fecha_movimiento', conciliacionHasta)
      .order('fecha_movimiento', { ascending: false })
      .order('origen_id', { ascending: false })
      .limit(300);

    if (error) {
      setErr(error.message || 'No se pudieron cargar los movimientos bancarios del periodo.');
      setMovimientosRows([]);
      return;
    }
    setMovimientosRows((data || []) as AuxiliarCuentaRow[]);
  };

  const loadAuxiliarCobros = async () => {
    if (!empresaId || !conciliacionCuentaId) {
      setAuxiliarRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_recaudacion_auxiliar_banco')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('cuenta_banco_id', conciliacionCuentaId)
      .gte('fecha_movimiento', conciliacionDesde)
      .lte('fecha_movimiento', conciliacionHasta)
      .order('fecha_movimiento', { ascending: false })
      .order('id', { ascending: false })
      .limit(300);

    if (error) {
      setErr(error.message || 'No se pudo cargar el auxiliar de cobros.');
      setAuxiliarRows([]);
      return;
    }
    setAuxiliarRows((data || []) as AuxiliarCuentaRow[]);
  };

  const loadEstadoImportado = async () => {
    if (!empresaId || !periodoImportId) {
      setEstadoRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_bancos_estado_importado')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('periodo_id', periodoImportId)
      .order('fecha_movimiento', { ascending: false })
      .order('id', { ascending: false })
      .limit(500);

    if (error) {
      setErr(error.message || 'No se pudo cargar el estado bancario importado.');
      setEstadoRows([]);
      return;
    }
    setEstadoRows((data || []) as EstadoImportadoRow[]);
  };

  useEffect(() => {
    if (!esVistaConciliacion) return;
    loadEstadoImportado();
  }, [empresaId, periodoImportId, esVistaConciliacion]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMatches = async () => {
    if (!empresaId || !periodoImportId) {
      setMatchRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_bancos_conciliacion_matches')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('periodo_id', periodoImportId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      setErr(error.message || 'No se pudieron cargar los emparejamientos.');
      setMatchRows([]);
      return;
    }
    setMatchRows((data || []) as MatchRow[]);
  };

  useEffect(() => {
    if (!esVistaConciliacion) return;
    loadMatches();
  }, [empresaId, periodoImportId, esVistaConciliacion]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDepositosIngresos = async () => {
    if (!empresaId) {
      setDepositosRows([]);
      return;
    }
    let query = supabase
      .from('vw_bancos_depositos_ingresos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_movimiento', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);
    if (conciliacionCuentaId) query = query.eq('cuenta_banco_id', conciliacionCuentaId);
    const { data, error } = await query;
    if (error) {
      setErr(error.message || 'No se pudieron cargar los depositos e ingresos.');
      setDepositosRows([]);
      return;
    }
    setDepositosRows((data || []) as DepositoIngresoRow[]);
  };

  const loadEgresosBancarios = async () => {
    if (!empresaId) {
      setEgresosRows([]);
      return;
    }
    let query = supabase
      .from('vw_bancos_cheques_debito')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha_movimiento', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);
    if (conciliacionCuentaId) query = query.eq('cuenta_banco_id', conciliacionCuentaId);
    const { data, error } = await query;
    if (error) {
      setErr(error.message || 'No se pudieron cargar los cheques y notas de debito.');
      setEgresosRows([]);
      return;
    }
    setEgresosRows((data || []) as EgresoBancoRow[]);
  };

  const loadCierresCaja = async () => {
    if (!empresaId) {
      setCierresCajaRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_recaudacion_cierres_caja')
      .select('id,fecha_desde,fecha_hasta,cajero_nombre,efectivo_liquidar,estado')
      .eq('empresa_id', empresaId)
      .eq('estado', 'cerrado')
      .order('fecha_hasta', { ascending: false })
      .limit(100);
    if (error) {
      setErr(error.message || 'No se pudieron cargar los cierres de caja.');
      setCierresCajaRows([]);
      return;
    }
    setCierresCajaRows((data || []) as CierreCajaBancoRow[]);
  };

  useEffect(() => {
    if (!esVistaDepositos) return;
    loadDepositosIngresos();
    loadCierresCaja();
  }, [empresaId, conciliacionCuentaId, esVistaDepositos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!esVistaEgresos) return;
    loadEgresosBancarios();
  }, [empresaId, conciliacionCuentaId, esVistaEgresos]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDiferencias = async () => {
    if (!empresaId || !periodoImportId) {
      setDiferenciasRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_bancos_conciliacion_diferencias')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('periodo_id', periodoImportId)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);

    if (error) {
      setErr(error.message || 'No se pudieron cargar las diferencias bancarias.');
      setDiferenciasRows([]);
      return;
    }
    setDiferenciasRows((data || []) as DiferenciaConciliacionRow[]);
  };

  useEffect(() => {
    if (!esVistaConciliacion) return;
    loadDiferencias();
  }, [empresaId, periodoImportId, esVistaConciliacion]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSuggestions = async () => {
    if (!empresaId || !periodoImportId || !conciliacionCuentaId) {
      setSuggestions([]);
      return;
    }
    const { data, error } = await supabase.rpc('get_bancos_match_sugerido', {
      p_empresa_id: empresaId,
      p_periodo_id: periodoImportId,
      p_cuenta_banco_id: conciliacionCuentaId,
    });
    if (error) {
      setErr(error.message || 'No se pudieron cargar las sugerencias de conciliacion.');
      setSuggestions([]);
      return;
    }
    setSuggestions((data || []) as SuggestionRow[]);
  };

  useEffect(() => {
    if (!esVistaConciliacion) return;
    loadSuggestions();
  }, [empresaId, periodoImportId, conciliacionCuentaId, estadoRows.length, auxiliarRows.length, esVistaConciliacion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!estadoRows.some((r) => r.id === selectedEstadoId)) {
      setSelectedEstadoId(estadoRows.find((r) => !r.conciliado)?.id || 0);
    }
  }, [estadoRows, selectedEstadoId]);

  useEffect(() => {
    if (!auxiliarRows.some((r) => r.id === selectedAuxiliarId)) {
      setSelectedAuxiliarId(auxiliarRows.find((r) => r.estado_conciliacion === 'pendiente')?.id || 0);
    }
  }, [auxiliarRows, selectedAuxiliarId]);

  useEffect(() => {
    if (!depositosRows.some((r) => r.id === selectedDepositoId)) {
      setSelectedDepositoId(depositosRows[0]?.id || 0);
    }
  }, [depositosRows, selectedDepositoId]);

  useEffect(() => {
    if (!egresosRows.some((r) => r.id === selectedEgresoId)) {
      setSelectedEgresoId(egresosRows[0]?.id || 0);
    }
  }, [egresosRows, selectedEgresoId]);

  useEffect(() => {
    setOperativaPage(1);
  }, [vista, conciliacionCuentaId]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(((vista === 'depositos') ? depositosRows.length : egresosRows.length) / 8));
    if (operativaPage > totalPages) {
      setOperativaPage(totalPages);
    }
  }, [operativaPage, depositosRows.length, egresosRows.length, vista]);

  useEffect(() => {
    if (!periodoActivo) {
      setDiferenciaFecha(conciliacionHasta);
      return;
    }
    setDiferenciaFecha(periodoActivo.fecha_hasta);
    setSaldoBanco(Number(periodoActivo.saldo_banco || 0));
    setSaldoBancoTexto(periodoActivo.saldo_banco ? formatMonto(Number(periodoActivo.saldo_banco || 0)) : '');
    setObservacionPeriodo(periodoActivo.observacion || '');
  }, [periodoActivo, conciliacionHasta]);

  useEffect(() => {
    if (diferenciaTipo === 'interes') {
      setDiferenciaSentido('suma');
    } else if (diferenciaTipo === 'comision' || diferenciaTipo === 'cargo') {
      setDiferenciaSentido('resta');
    }
  }, [diferenciaTipo]);

  useEffect(() => {
    if (!cuentasDiferenciaDisponibles.some((c) => c.id === diferenciaCuentaId)) {
      setDiferenciaCuentaId(cuentasDiferenciaDisponibles[0]?.id || 0);
    }
  }, [cuentasDiferenciaDisponibles, diferenciaCuentaId]);

  useEffect(() => {
    setDepositoLineas((prev) => {
      if (prev.length === 0) {
        return [{ id: 'dep-linea-1', cuentaId: cuentasMovimientoEmpresa[0]?.id || 0, detalle: '', monto: 0, montoTexto: '' }];
      }
      return prev.map((linea, idx) => {
        if (linea.cuentaId && cuentasMovimientoEmpresa.some((c) => c.id === linea.cuentaId)) return linea;
        return idx === 0 ? { ...linea, cuentaId: cuentasMovimientoEmpresa[0]?.id || 0 } : linea;
      });
    });
  }, [cuentasMovimientoEmpresa]);

  useEffect(() => {
    if (!cuentaConciliacion) return;
    setDepositoMoneda((cuentaConciliacion.moneda || 'CRC') as 'CRC' | 'USD');
    setEgresoMoneda((cuentaConciliacion.moneda || 'CRC') as 'CRC' | 'USD');
  }, [cuentaConciliacion]);

  useEffect(() => {
    if (!(vista === 'depositos' || vista === 'egresos')) return;
    const fechaActiva = vista === 'depositos' ? depositoFecha : egresoFecha;
    loadTipoCambioDia(fechaActiva);
  }, [empresaId, vista, depositoFecha, egresoFecha]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setErr('');
    setOk('');
  }, [vista]);

  const limpiar = () => {
    const usadas = new Set(
      rows
        .filter((r) => r.id !== 0)
        .map((r) => Number(r.cuenta_contable_id || 0))
        .filter((id) => id > 0)
    );
    const primeraDisponible = cuentasContables.find((c) => !usadas.has(c.id))?.id || 0;
    setForm({
      ...initialForm,
      cuenta_contable_id: primeraDisponible,
    });
  };

  const editar = (row: CuentaBancoRow) => {
    setForm({
      id: row.id,
      codigo: row.codigo,
      alias: row.alias,
      banco_nombre: row.banco_nombre,
      titular: row.titular || '',
      moneda: row.moneda,
      numero_cuenta: row.numero_cuenta,
      cuenta_contable_id: row.cuenta_contable_id,
      activo: row.activo,
    });
    setErr('');
    setOk('');
  };

  const guardar = async () => {
    if (!canEdit) return;
    if (!form.codigo.trim() || !form.alias.trim() || !form.banco_nombre.trim() || !form.numero_cuenta.trim() || !form.cuenta_contable_id) {
      setErr('Complete codigo, alias, banco, numero de cuenta y cuenta contable.');
      return;
    }

    setBusy(true);
    setErr('');
    setOk('');
    const payload = {
      empresa_id: empresaId,
      codigo: form.codigo.trim().toUpperCase(),
      alias: form.alias.trim(),
      banco_nombre: form.banco_nombre.trim(),
      titular: form.titular.trim() || null,
      moneda: form.moneda,
      numero_cuenta: form.numero_cuenta.trim(),
      cuenta_contable_id: form.cuenta_contable_id,
      activo: form.activo,
    };

    const query = form.id
      ? supabase.from('cuentas_bancarias_empresa').update(payload).eq('id', form.id)
      : supabase.from('cuentas_bancarias_empresa').insert(payload);

    const { error } = await query;
    if (error) {
      setErr(error.message || 'No se pudo guardar la cuenta bancaria.');
      setBusy(false);
      return;
    }

    setOk(form.id ? 'Cuenta bancaria actualizada.' : 'Cuenta bancaria registrada.');
    limpiar();
    await cargar();
  };

  const guardarPeriodo = async () => {
    if (!canEdit) return;
    if (!conciliacionCuentaId || !conciliacionDesde || !conciliacionHasta) {
      setErr('Seleccione cuenta bancaria y rango del periodo.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('guardar_bancos_conciliacion_periodo', {
        p_empresa_id: empresaId,
        p_cuenta_banco_id: conciliacionCuentaId,
        p_fecha_desde: conciliacionDesde,
        p_fecha_hasta: conciliacionHasta,
        p_saldo_banco: saldoBanco,
        p_observacion: observacionPeriodo || null,
      });
      if (error) throw error;
      const periodoId = Number(data || 0);
      setPeriodoImportId(periodoId);
      setOk(`Periodo de conciliacion guardado (#${periodoId}).`);
      await Promise.all([loadPeriodos(), loadDiferencias()]);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo guardar el periodo de conciliacion.'));
    } finally {
      setBusy(false);
    }
  };

  const usarPeriodo = (periodo: ConciliacionPeriodoRow) => {
    setConciliacionCuentaId(periodo.cuenta_banco_id);
    setConciliacionDesde(periodo.fecha_desde);
    setConciliacionHasta(periodo.fecha_hasta);
    setSaldoBanco(Number(periodo.saldo_banco || 0));
    setSaldoBancoTexto(periodo.saldo_banco ? formatMonto(Number(periodo.saldo_banco || 0)) : '');
    setObservacionPeriodo(periodo.observacion || '');
    setPeriodoImportId(periodo.id);
    setOk(`Periodo #${periodo.id} cargado para trabajo.`);
    setErr('');
  };

  const cerrarPeriodo = async (periodoId: number) => {
    if (!canEdit || !periodoId) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('cerrar_bancos_conciliacion_periodo', {
        p_periodo_id: periodoId,
        p_observacion: 'Periodo cerrado desde modulo Bancos',
      });
      if (error) throw error;
      setOk(`Periodo #${periodoId} cerrado.`);
      await loadPeriodos();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo cerrar el periodo.'));
    } finally {
      setBusy(false);
    }
  };

  const limpiarDiferencia = () => {
    setDiferenciaTipo('comision');
    setDiferenciaSentido('resta');
    setDiferenciaFecha(periodoActivo?.fecha_hasta || conciliacionHasta);
    setDiferenciaDescripcion('');
    setDiferenciaReferencia('');
    setDiferenciaMonto(0);
    setDiferenciaMontoTexto('');
    setDiferenciaCuentaId(cuentasDiferenciaDisponibles[0]?.id || 0);
  };

  const guardarDiferencia = async () => {
    if (!canEdit) return;
    if (!periodoImportId || !periodoActivo) {
      setErr('Seleccione o cargue un periodo de conciliacion antes de registrar diferencias.');
      return;
    }
    if (!diferenciaCuentaId || !diferenciaDescripcion.trim() || !(diferenciaMonto > 0)) {
      setErr('Complete fecha, descripcion, cuenta contable y monto de la diferencia.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('registrar_bancos_conciliacion_diferencia', {
        p_empresa_id: empresaId,
        p_periodo_id: periodoImportId,
        p_cuenta_banco_id: periodoActivo.cuenta_banco_id,
        p_fecha: diferenciaFecha,
        p_tipo: diferenciaTipo,
        p_sentido: diferenciaSentido,
        p_descripcion: diferenciaDescripcion.trim(),
        p_referencia: diferenciaReferencia.trim() || null,
        p_cuenta_contable_id: diferenciaCuentaId,
        p_monto: diferenciaMonto,
      });
      if (error) throw error;
      setOk(`Diferencia bancaria registrada (#${Number(data || 0)}).`);
      limpiarDiferencia();
      await Promise.all([loadDiferencias(), loadPeriodos()]);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo registrar la diferencia bancaria.'));
    } finally {
      setBusy(false);
    }
  };

  const deshacerDiferencia = async (diferenciaId: number) => {
    if (!canEdit || !diferenciaId) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('deshacer_bancos_conciliacion_diferencia', {
        p_diferencia_id: diferenciaId,
        p_observacion: 'Anulada desde modulo Bancos',
      });
      if (error) throw error;
      setOk(`Diferencia #${diferenciaId} anulada.`);
      await Promise.all([loadDiferencias(), loadPeriodos()]);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo anular la diferencia bancaria.'));
    } finally {
      setBusy(false);
    }
  };

  const limpiarDepositoIngreso = () => {
    setDepositoFecha(new Date().toISOString().slice(0, 10));
    setDepositoTipo('ingreso_directo');
    setDepositoMonto(0);
    setDepositoMontoTexto('');
    setDepositoReferencia('');
    setDepositoDetalle('');
    setDepositoCierreId(0);
    setDepositoTerceroId(0);
    setDepositoLineas([{ id: `dep-linea-${Date.now()}`, cuentaId: cuentasMovimientoEmpresa[0]?.id || 0, detalle: '', monto: 0, montoTexto: '' }]);
  };

  const actualizarLineaDeposito = (lineaId: string, patch: Partial<DepositoLineaForm>) => {
    setDepositoLineas((prev) => prev.map((linea) => (linea.id === lineaId ? { ...linea, ...patch } : linea)));
  };

  const agregarLineaDeposito = () => {
    setDepositoLineas((prev) => ([...prev, { id: `dep-linea-${Date.now()}-${prev.length + 1}`, cuentaId: 0, detalle: '', monto: 0, montoTexto: '' }]));
  };

  const eliminarLineaDeposito = (lineaId: string) => {
    setDepositoLineas((prev) => {
      const next = prev.filter((linea) => linea.id !== lineaId);
      return next.length > 0 ? next : [{ id: `dep-linea-${Date.now()}`, cuentaId: cuentasMovimientoEmpresa[0]?.id || 0, detalle: '', monto: 0, montoTexto: '' }];
    });
  };

  const guardarDepositoIngreso = async () => {
    if (!canEdit) return;
    const lineasValidas = depositoLineas
      .map((linea) => ({
        cuenta_contable_id: Number(linea.cuentaId || 0),
        detalle: String(linea.detalle || '').trim() || null,
        monto: Number(linea.monto || 0),
      }))
      .filter((linea) => linea.cuenta_contable_id > 0 && linea.monto > 0);
    const totalLineas = lineasValidas.reduce((acc, linea) => acc + Number(linea.monto || 0), 0);

    if (!empresaId || !conciliacionCuentaId || !depositoFecha) {
      setErr('Seleccione cuenta bancaria y fecha del movimiento.');
      return;
    }
    if (cuentaSeleccionada && depositoMoneda !== cuentaSeleccionada.moneda) {
      setErr(`La cuenta bancaria seleccionada trabaja en ${cuentaSeleccionada.moneda}. Ajuste la moneda del movimiento antes de guardar.`);
      return;
    }
    if (!(depositoMonto > 0)) {
      setErr('Digite un monto valido para el ingreso bancario.');
      return;
    }
    if (lineasValidas.length === 0) {
      setErr('Agregue al menos una linea contable de contrapartida.');
      return;
    }
    if (Math.abs(totalLineas - Number(depositoMonto || 0)) > 0.009) {
      setErr('El asiento no cuadra. La suma de las lineas contables debe ser igual al monto del movimiento.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('registrar_bancos_deposito_ingreso_compuesto', {
        p_empresa_id: empresaId,
        p_cuenta_banco_id: conciliacionCuentaId,
        p_fecha_movimiento: depositoFecha,
        p_tipo_movimiento: depositoTipo,
        p_moneda: depositoMoneda,
        p_referencia: depositoReferencia.trim() || null,
        p_detalle: depositoDetalle.trim() || null,
        p_lineas: lineasValidas,
        p_tercero_id: depositoTerceroId || null,
      });
      if (error) throw error;
      setOk(`Movimiento bancario registrado (#${Number(data || 0)}).`);
      limpiarDepositoIngreso();
      await Promise.all([loadDepositosIngresos(), loadMovimientosPeriodo(), loadPeriodos(), loadCierresCaja()]);
    } catch (e: any) {
      setErr(traducirErrorBancos(e?.message || 'No se pudo registrar el deposito o ingreso bancario.'));
    } finally {
      setBusy(false);
    }
  };

  const marcarDepositoIngresoConciliado = async (movimientoId: number) => {
    if (!canEdit || !movimientoId) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('marcar_bancos_deposito_ingreso_conciliado', {
        p_movimiento_id: movimientoId,
        p_detalle: 'Conciliado desde modulo Bancos',
      });
      if (error) throw error;
      setOk(`Movimiento #${movimientoId} marcado como conciliado.`);
      await Promise.all([loadDepositosIngresos(), loadMovimientosPeriodo(), loadPeriodos()]);
    } catch (e: any) {
      setErr(traducirErrorBancos(e?.message || 'No se pudo marcar el movimiento como conciliado.'));
    } finally {
      setBusy(false);
    }
  };

  const deshacerDepositoIngresoConciliado = async (movimientoId: number) => {
    if (!canEdit || !movimientoId) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('deshacer_bancos_deposito_ingreso_conciliacion', {
        p_movimiento_id: movimientoId,
        p_detalle: 'Conciliacion revertida desde modulo Bancos',
      });
      if (error) throw error;
      setOk(`Conciliacion del movimiento #${movimientoId} revertida.`);
      await Promise.all([loadDepositosIngresos(), loadMovimientosPeriodo(), loadPeriodos()]);
    } catch (e: any) {
      setErr(traducirErrorBancos(e?.message || 'No se pudo revertir la conciliacion del movimiento.'));
    } finally {
      setBusy(false);
    }
  };

  const limpiarEgresoBancario = () => {
    setEgresoFecha(new Date().toISOString().slice(0, 10));
    setEgresoTipo('cheque');
    setEgresoMonto(0);
    setEgresoMontoTexto('');
    setEgresoReferencia('');
    setEgresoDetalle('');
    setEgresoLineas([{ id: `egr-linea-${Date.now()}`, cuentaId: cuentasMovimientoEmpresa[0]?.id || 0, detalle: '', monto: 0, montoTexto: '' }]);
  };

  const actualizarLineaEgreso = (lineaId: string, patch: Partial<DepositoLineaForm>) => {
    setEgresoLineas((prev) => prev.map((linea) => (linea.id === lineaId ? { ...linea, ...patch } : linea)));
  };

  const agregarLineaEgreso = () => {
    setEgresoLineas((prev) => ([...prev, { id: `egr-linea-${Date.now()}-${prev.length + 1}`, cuentaId: 0, detalle: '', monto: 0, montoTexto: '' }]));
  };

  const eliminarLineaEgreso = (lineaId: string) => {
    setEgresoLineas((prev) => {
      const next = prev.filter((linea) => linea.id !== lineaId);
      return next.length > 0 ? next : [{ id: `egr-linea-${Date.now()}`, cuentaId: cuentasMovimientoEmpresa[0]?.id || 0, detalle: '', monto: 0, montoTexto: '' }];
    });
  };

  const guardarEgresoBancario = async () => {
    if (!canEdit) return;
    const lineasValidas = egresoLineas
      .map((linea) => ({
        cuenta_contable_id: Number(linea.cuentaId || 0),
        detalle: String(linea.detalle || '').trim() || null,
        monto: Number(linea.monto || 0),
      }))
      .filter((linea) => linea.cuenta_contable_id > 0 && linea.monto > 0);
    const totalLineas = lineasValidas.reduce((acc, linea) => acc + Number(linea.monto || 0), 0);

    if (!empresaId || !conciliacionCuentaId || !egresoFecha) {
      setErr('Seleccione cuenta bancaria y fecha del movimiento.');
      return;
    }
    if (cuentaSeleccionada && egresoMoneda !== cuentaSeleccionada.moneda) {
      setErr(`La cuenta bancaria seleccionada trabaja en ${cuentaSeleccionada.moneda}. Ajuste la moneda del movimiento antes de guardar.`);
      return;
    }
    if (!(egresoMonto > 0)) {
      setErr('Digite un monto valido para el egreso bancario.');
      return;
    }
    if (lineasValidas.length === 0) {
      setErr('Agregue al menos una linea contable de contrapartida.');
      return;
    }
    if (Math.abs(totalLineas - Number(egresoMonto || 0)) > 0.009) {
      setErr('El asiento no cuadra. La suma de las lineas contables debe ser igual al monto del movimiento.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('registrar_bancos_cheque_debito_compuesto', {
        p_empresa_id: empresaId,
        p_cuenta_banco_id: conciliacionCuentaId,
        p_fecha_movimiento: egresoFecha,
        p_tipo_movimiento: egresoTipo,
        p_moneda: egresoMoneda,
        p_referencia: egresoReferencia.trim() || null,
        p_detalle: egresoDetalle.trim() || null,
        p_lineas: lineasValidas,
        p_tercero_id: null,
      });
      if (error) throw error;
      setOk(`Egreso bancario registrado (#${Number(data || 0)}).`);
      limpiarEgresoBancario();
      await Promise.all([loadEgresosBancarios(), loadMovimientosPeriodo(), loadPeriodos()]);
    } catch (e: any) {
      setErr(traducirErrorBancos(e?.message || 'No se pudo registrar el cheque o nota de debito.'));
    } finally {
      setBusy(false);
    }
  };

  const marcarEgresoConciliado = async (movimientoId: number) => {
    if (!canEdit || !movimientoId) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('marcar_bancos_cheque_debito_conciliado', {
        p_movimiento_id: movimientoId,
        p_detalle: 'Conciliado desde modulo Bancos',
      });
      if (error) throw error;
      setOk(`Movimiento #${movimientoId} marcado como conciliado.`);
      await Promise.all([loadEgresosBancarios(), loadMovimientosPeriodo(), loadPeriodos()]);
    } catch (e: any) {
      setErr(traducirErrorBancos(e?.message || 'No se pudo marcar el movimiento como conciliado.'));
    } finally {
      setBusy(false);
    }
  };

  const deshacerEgresoConciliado = async (movimientoId: number) => {
    if (!canEdit || !movimientoId) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('deshacer_bancos_cheque_debito_conciliacion', {
        p_movimiento_id: movimientoId,
        p_detalle: 'Desconciliado desde modulo Bancos',
      });
      if (error) throw error;
      setOk(`Movimiento #${movimientoId} devuelto a pendiente.`);
      await Promise.all([loadEgresosBancarios(), loadMovimientosPeriodo(), loadPeriodos()]);
    } catch (e: any) {
      setErr(traducirErrorBancos(e?.message || 'No se pudo deshacer la conciliacion del movimiento.'));
    } finally {
      setBusy(false);
    }
  };

  const parseDateCell = (value: unknown) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const digits = raw.replace(/\./g, '/').replace(/-/g, '/');
    const parts = digits.split('/');
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
      return `${c.length === 2 ? `20${c}` : c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    }
    return raw.slice(0, 10);
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setErr('');
    setOk('');
    setImportFileName(file.name);
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: false });
    if (!matrix.length || matrix.length < 2) {
      setErr('El archivo no contiene filas para importar.');
      setPreviewImport([]);
      return;
    }

    const headers = matrix[0].map((v) => String(v || '').trim());
    const idxFecha = findHeaderIndex(headers, effectiveImportTemplate.headers.fecha);
    const idxDesc = findHeaderIndex(headers, effectiveImportTemplate.headers.descripcion);
    const idxRef = findHeaderIndex(headers, effectiveImportTemplate.headers.referencia);
    const idxDeb = findHeaderIndex(headers, effectiveImportTemplate.headers.debito);
    const idxCred = findHeaderIndex(headers, effectiveImportTemplate.headers.credito);
    const idxSaldo = findHeaderIndex(headers, effectiveImportTemplate.headers.saldo);

    if (idxFecha < 0 || idxDesc < 0 || (idxDeb < 0 && idxCred < 0)) {
      setErr(`El archivo no coincide con la plantilla ${effectiveImportTemplate.nombre}. Verifique columnas de fecha, descripcion y debito/credito.`);
      setPreviewImport([]);
      return;
    }

    const rows = matrix.slice(1)
      .map((row) => ({
        fecha_movimiento: parseDateCell(row[idxFecha]),
        descripcion: String(row[idxDesc] || '').trim(),
        referencia: idxRef >= 0 ? String(row[idxRef] || '').trim() || null : null,
        debito: idxDeb >= 0 ? parseMonto(String(row[idxDeb] || '0')) : 0,
        credito: idxCred >= 0 ? parseMonto(String(row[idxCred] || '0')) : 0,
        saldo: idxSaldo >= 0 ? parseMonto(String(row[idxSaldo] || '0')) : null,
      }))
      .filter((row) => row.fecha_movimiento && row.descripcion && (row.debito !== 0 || row.credito !== 0));

    setPreviewImport(rows);
    setOk(`Archivo ${file.name} listo para importar (${rows.length} filas validas).`);
  };

  const descargarPlantillaImportacion = () => {
    const headers = ['fecha_movimiento', 'descripcion', 'referencia', 'debito', 'credito', 'saldo'];
    const sample = [
      ['2026-03-01', 'Deposito cliente', 'TRX-1001', '0', '125000', '325000'],
      ['2026-03-02', 'Comision bancaria', 'COM-2001', '2500', '0', '322500'],
    ];
    const csv = [headers, ...sample].map((row) => row.join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `plantilla_importacion_${effectiveImportTemplate.id.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const guardarImportacion = async () => {
    if (!canEdit) return;
    if (!periodoImportId || previewImport.length === 0) {
      setErr('Seleccione periodo y cargue un archivo con filas validas.');
      return;
    }
    const periodo = periodosRows.find((p) => p.id === periodoImportId);
    if (!periodo) {
      setErr('Periodo de importacion no encontrado.');
      return;
    }

    setBusy(true);
    setErr('');
    setOk('');
    try {
      const payload = previewImport.map((row) => ({
        empresa_id: empresaId,
        cuenta_banco_id: periodo.cuenta_banco_id,
        periodo_id: periodoImportId,
        fecha_movimiento: row.fecha_movimiento,
        descripcion: row.descripcion,
        referencia: row.referencia,
        debito: row.debito,
        credito: row.credito,
        saldo: row.saldo,
      }));
      const { error } = await supabase.from('bancos_estado_importado').insert(payload);
      if (error) throw error;
      setOk(`Estado bancario importado (${payload.length} filas).`);
      setPreviewImport([]);
      await loadEstadoImportado();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo guardar la importacion del estado bancario.'));
    } finally {
      setBusy(false);
    }
  };

  const marcarMatchManual = async () => {
    if (!canEdit) return;
    if (!periodoImportId || !selectedEstadoId || !selectedAuxiliarId) {
      setErr('Seleccione una linea del banco y un movimiento del ERP para emparejar.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('marcar_bancos_match_manual', {
        p_periodo_id: periodoImportId,
        p_estado_linea_id: selectedEstadoId,
        p_auxiliar_id: selectedAuxiliarId,
        p_observacion: 'Match manual desde modulo Bancos',
      });
      if (error) throw error;
      setOk(`Emparejamiento manual registrado (#${Number(data || 0)}).`);
      await Promise.all([loadEstadoImportado(), loadMovimientosPeriodo(), loadAuxiliarCobros(), loadMatches(), loadPeriodos(), loadSuggestions()]);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo registrar el emparejamiento manual.'));
    } finally {
      setBusy(false);
    }
  };

  const deshacerMatchManual = async (matchId: number) => {
    if (!canEdit || !matchId) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error } = await supabase.rpc('deshacer_bancos_match_manual', {
        p_match_id: matchId,
        p_observacion: 'Match manual revertido desde modulo Bancos',
      });
      if (error) throw error;
      setOk(`Emparejamiento #${matchId} revertido.`);
      await Promise.all([loadEstadoImportado(), loadMovimientosPeriodo(), loadAuxiliarCobros(), loadMatches(), loadPeriodos(), loadSuggestions()]);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo revertir el emparejamiento.'));
    } finally {
      setBusy(false);
    }
  };

  const aplicarSugerencia = async (row: SuggestionRow) => {
    if (!canEdit) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('marcar_bancos_match_manual', {
        p_periodo_id: periodoImportId,
        p_estado_linea_id: row.estado_linea_id,
        p_auxiliar_id: row.auxiliar_id,
        p_observacion: `Sugerencia aplicada (score ${row.score})`,
      });
      if (error) throw error;
      setOk(`Sugerencia aplicada (#${Number(data || 0)}).`);
      await Promise.all([loadEstadoImportado(), loadMovimientosPeriodo(), loadAuxiliarCobros(), loadMatches(), loadPeriodos(), loadSuggestions()]);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo aplicar la sugerencia de conciliacion.'));
    } finally {
      setBusy(false);
    }
  };

  const aplicarTodasLasSugerencias = async () => {
    if (!canEdit || suggestions.length === 0 || !periodoImportId) return;
    setBusy(true);
    setErr('');
    setOk('');

    let aplicadas = 0;
    try {
      for (const row of suggestions) {
        const { error } = await supabase.rpc('marcar_bancos_match_manual', {
          p_periodo_id: periodoImportId,
          p_estado_linea_id: row.estado_linea_id,
          p_auxiliar_id: row.auxiliar_id,
          p_observacion: `Conciliacion masiva sugerida (score ${row.score})`,
        });
        if (error) throw error;
        aplicadas += 1;
      }
      setOk(`Conciliacion masiva aplicada: ${aplicadas} sugerencia(s) procesadas.`);
      await Promise.all([loadEstadoImportado(), loadMovimientosPeriodo(), loadAuxiliarCobros(), loadMatches(), loadPeriodos(), loadSuggestions()]);
    } catch (e: any) {
      setErr(`${String(e?.message || 'No se pudo completar la conciliacion masiva.')} Se aplicaron ${aplicadas} sugerencia(s) antes del error.`);
      await Promise.all([loadEstadoImportado(), loadMovimientosPeriodo(), loadAuxiliarCobros(), loadMatches(), loadPeriodos(), loadSuggestions()]);
    } finally {
      setBusy(false);
    }
  };

  const getDiferenciasPeriodo = async (periodoId: number) => {
    const { data, error } = await supabase
      .from('vw_bancos_conciliacion_diferencias')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('periodo_id', periodoId)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    return (data || []) as DiferenciaConciliacionRow[];
  };

  const abrirActaConciliacion = async (periodo: ConciliacionPeriodoRow) => {
    try {
      const moneda = periodo.moneda || 'CRC';
      const diferencias = await getDiferenciasPeriodo(periodo.id);
      const detalle = movimientosRows
      .filter((row) => row.cuenta_banco_id === periodo.cuenta_banco_id)
      .map((row) => `
        <tr>
          <td>${escapeHtml(row.fecha_movimiento)}</td>
          <td>${escapeHtml(documentoConciliacionLabel(row))}</td>
          <td>${escapeHtml(row.tercero_nombre)}</td>
          <td>${escapeHtml(row.referencia || '-')}</td>
          <td style="text-align:right;">${escapeHtml(moneyReport(row.monto, moneda))}</td>
          <td>${escapeHtml(row.estado_conciliacion)}</td>
        </tr>
      `)
      .join('');
    const detalleDiferencias = diferencias
      .map((row) => `
        <tr>
          <td>${escapeHtml(row.fecha)}</td>
          <td>${escapeHtml(row.tipo.toUpperCase())}</td>
          <td>${escapeHtml(row.sentido === 'suma' ? 'Aumenta libros' : 'Reduce libros')}</td>
          <td>${escapeHtml(row.cuenta_contable_codigo)} - ${escapeHtml(row.cuenta_contable_nombre)}</td>
          <td>${escapeHtml(row.referencia || '-')}</td>
          <td style="text-align:right;">${escapeHtml(moneyReport(row.monto, moneda))}</td>
        </tr>
      `)
      .join('');

    const html = `<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Acta de conciliacion bancaria</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 28px; color: #0f172a; }
            .head { background: #103420; color: #fff; border-radius: 16px; padding: 18px 22px; }
            .head .t1 { font-size: 12px; letter-spacing: .05em; text-transform: uppercase; opacity: .9; }
            .head .t2 { font-size: 22px; font-weight: 700; margin-top: 4px; }
            .head .t3 { font-size: 14px; margin-top: 4px; opacity: .9; }
            .meta { margin-top: 18px; display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 12px; }
            .card { border: 1px solid #dbe4ee; border-radius: 14px; padding: 14px 16px; background: #f8fbff; }
            .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; }
            .value { margin-top: 6px; font-size: 16px; font-weight: 700; }
            .section { margin-top: 24px; font-size: 22px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { text-align: left; background: #f1f5f9; color: #64748b; font-size: 11px; text-transform: uppercase; padding: 10px 12px; }
            td { padding: 10px 12px; border-top: 1px solid #e2e8f0; font-size: 12px; }
            .right { text-align: right; }
            .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 34px; }
            .sign { padding-top: 22px; border-top: 1px solid #64748b; text-align: center; font-size: 12px; color: #334155; }
          </style>
        </head>
        <body>
          <div class="head">
            <div class="t1">Acta de conciliacion bancaria</div>
            <div class="t2">${escapeHtml(periodo.cuenta_banco_alias)}</div>
            <div class="t3">Periodo ${escapeHtml(periodo.fecha_desde)} a ${escapeHtml(periodo.fecha_hasta)}</div>
          </div>
          <div class="meta">
            <div class="card">
              <div class="label">Cuenta bancaria</div>
              <div class="value">${escapeHtml(periodo.cuenta_banco_codigo)} - ${escapeHtml(periodo.cuenta_banco_alias)}</div>
            </div>
            <div class="card">
              <div class="label">Saldo libros</div>
              <div class="value">${escapeHtml(moneyReport(periodo.saldo_libros, moneda))}</div>
            </div>
            <div class="card">
              <div class="label">Saldo banco</div>
              <div class="value">${escapeHtml(moneyReport(periodo.saldo_banco, moneda))}</div>
            </div>
          </div>
          <div class="meta" style="grid-template-columns: 1fr 1fr 1fr;">
            <div class="card">
              <div class="label">Diferencia</div>
              <div class="value">${escapeHtml(moneyReport(periodo.diferencia, moneda))}</div>
            </div>
            <div class="card">
              <div class="label">Estado</div>
              <div class="value">${escapeHtml(periodo.estado)}</div>
            </div>
            <div class="card">
              <div class="label">Observacion</div>
              <div class="value" style="font-size: 13px;">${escapeHtml(periodo.observacion || '-')}</div>
            </div>
          </div>
          <div class="section">Detalle del periodo</div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Pago</th>
                <th>Cliente</th>
                <th>Referencia</th>
                <th class="right">Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${detalle || '<tr><td colspan="6">Sin movimientos para este periodo.</td></tr>'}
            </tbody>
          </table>
          <div class="section">Diferencias registradas</div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Impacto</th>
                <th>Cuenta</th>
                <th>Referencia</th>
                <th class="right">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${detalleDiferencias || '<tr><td colspan="6">Sin diferencias registradas para este periodo.</td></tr>'}
            </tbody>
          </table>
          <div class="signs">
            <div class="sign">Preparado por tesoreria</div>
            <div class="sign">Revisado / aprobado</div>
          </div>
        </body>
      </html>`;

      const popup = window.open('', '_blank', 'width=1100,height=900');
      if (!popup) return;
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo generar el acta de conciliacion.'));
    }
  };

  const descargarActaConciliacionPdf = async (periodo: ConciliacionPeriodoRow) => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const moneda = periodo.moneda || 'CRC';
      const lines = movimientosRows.filter((row) => row.cuenta_banco_id === periodo.cuenta_banco_id);
      const diferencias = await getDiferenciasPeriodo(periodo.id);
      let y = 48;

    doc.setFillColor(16, 52, 32);
    doc.roundedRect(36, 32, 523, 76, 14, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('ACTA DE CONCILIACION BANCARIA', 56, 56);
    doc.setFontSize(18);
    doc.text(String(periodo.cuenta_banco_alias || ''), 56, 82);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Periodo ${periodo.fecha_desde} a ${periodo.fecha_hasta}`, 56, 100);

    y = 138;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Cuenta bancaria', 40, y);
    doc.text('Saldo libros', 250, y);
    doc.text('Saldo banco', 390, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    y += 18;
    doc.text(`${periodo.cuenta_banco_codigo} - ${periodo.cuenta_banco_alias}`, 40, y);
    doc.text(moneyReport(periodo.saldo_libros, moneda), 250, y);
    doc.text(moneyReport(periodo.saldo_banco, moneda), 390, y);

    y += 28;
    doc.setFont('helvetica', 'bold');
    doc.text('Diferencia', 40, y);
    doc.text('Estado', 250, y);
    doc.text('Observacion', 390, y);
    doc.setFont('helvetica', 'normal');
    y += 18;
    doc.text(moneyReport(periodo.diferencia, moneda), 40, y);
    doc.text(String(periodo.estado || '-'), 250, y);
    doc.text(doc.splitTextToSize(String(periodo.observacion || '-'), 160), 390, y);

    y += 40;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Detalle del periodo', 40, y);
    y += 20;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha', 40, y);
    doc.text('Pago', 100, y);
    doc.text('Cliente', 155, y);
    doc.text('Referencia', 330, y);
    doc.text('Monto', 470, y, { align: 'right' });
    doc.text('Estado', 550, y, { align: 'right' });
    y += 10;
    doc.line(40, y, 555, y);
    y += 16;
    doc.setFont('helvetica', 'normal');

    lines.slice(0, 18).forEach((row) => {
      doc.text(String(row.fecha_movimiento || ''), 40, y);
      doc.text(documentoConciliacionLabel(row), 100, y);
      doc.text(doc.splitTextToSize(String(row.tercero_nombre || ''), 160), 155, y);
      doc.text(doc.splitTextToSize(String(row.referencia || '-'), 125), 330, y);
      doc.text(moneyReport(row.monto, moneda), 470, y, { align: 'right' });
      doc.text(String(row.estado_conciliacion || ''), 550, y, { align: 'right' });
      y += 18;
    });

    y += 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Diferencias registradas', 40, y);
    y += 20;
    doc.setFontSize(10);
    doc.text('Fecha', 40, y);
    doc.text('Tipo', 100, y);
    doc.text('Impacto', 170, y);
    doc.text('Cuenta', 255, y);
    doc.text('Monto', 550, y, { align: 'right' });
    y += 10;
    doc.line(40, y, 555, y);
    y += 16;
    doc.setFont('helvetica', 'normal');

    if (diferencias.length === 0) {
      doc.text('Sin diferencias registradas para este periodo.', 40, y);
      y += 18;
    } else {
      diferencias.slice(0, 10).forEach((row) => {
        doc.text(String(row.fecha || ''), 40, y);
        doc.text(String(row.tipo || '').toUpperCase(), 100, y);
        doc.text(row.sentido === 'suma' ? 'Aumenta' : 'Reduce', 170, y);
        doc.text(doc.splitTextToSize(`${row.cuenta_contable_codigo} - ${row.cuenta_contable_nombre}`, 220), 255, y);
        doc.text(moneyReport(row.monto, moneda), 550, y, { align: 'right' });
        y += 18;
      });
    }

    y = Math.max(y + 40, 740);
    doc.line(70, y, 235, y);
    doc.line(345, y, 510, y);
    doc.setFontSize(10);
    doc.text('Preparado por tesoreria', 152, y + 14, { align: 'center' });
    doc.text('Revisado / aprobado', 428, y + 14, { align: 'center' });

      doc.save(`acta_conciliacion_periodo_${periodo.id}.pdf`);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo descargar el PDF del acta.'));
    }
  };

  const totalActivas = rows.filter((r) => r.activo).length;
  const totalCRC = rows.filter((r) => r.activo && r.moneda === 'CRC').length;
  const totalUSD = rows.filter((r) => r.activo && r.moneda === 'USD').length;
  const totalPendientesAux = movimientosRows.filter((r) => r.estado_conciliacion === 'pendiente').length;
  const totalConciliadosAux = movimientosRows.filter((r) => r.estado_conciliacion === 'conciliado').length;
  const montoPeriodoAux = movimientosRows.reduce((acc, row) => acc + Number(row.monto || 0), 0);
  const impactoDiferencias = diferenciasRows
    .filter((row) => row.estado === 'registrada')
    .reduce((acc, row) => acc + (row.sentido === 'suma' ? Number(row.monto || 0) : -Number(row.monto || 0)), 0);
  const saldoLibrosCalculado = montoPeriodoAux + impactoDiferencias;
  const diferenciaPeriodo = saldoLibrosCalculado - saldoBanco;
  const monedaConciliacion = rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC';
  const totalSugerenciasMonto = suggestions.reduce((acc, row) => acc + Number(row.banco_monto || 0), 0);
  const cuentaSeleccionada = rows.find((r) => r.id === conciliacionCuentaId) || null;
  const totalDepositosPendientes = depositosRows.filter((r) => r.estado_conciliacion === 'pendiente').length;
  const totalDepositosConciliados = depositosRows.filter((r) => r.estado_conciliacion === 'conciliado').length;
  const montoDepositos = depositosRows.reduce((acc, row) => acc + Number(row.monto || 0), 0);
  const depositoSeleccionado = depositosRows.find((r) => r.id === selectedDepositoId) || null;
  const cierreSeleccionado = cierresCajaDisponibles.find((c) => c.id === depositoCierreId) || null;
  const depositoMontoVista = Number(depositoMonto || 0);
  const depositoTipoLabel = ({
    deposito_caja: 'Deposito',
    ingreso_directo: 'Ingreso directo',
    transferencia_recibida: 'Transferencia recibida',
    interes_bancario: 'Interes bancario',
    ajuste_favor: 'Ajuste a favor',
    otro: 'Otro ingreso',
  } as Record<string, string>)[depositoTipo] || 'Deposito';
  const totalLineasDeposito = depositoLineas.reduce((acc, linea) => acc + Number(linea.monto || 0), 0);
  const asientoDepositoPreview = depositoMontoVista > 0 && cuentaSeleccionada ? [
    {
      cuenta: `${cuentaSeleccionada.cuenta_contable_codigo} - ${cuentaSeleccionada.cuenta_contable_nombre}`,
      documento: depositoReferencia.trim() || '-',
      debe: depositoMontoVista,
      haber: 0,
      detalle: depositoDetalle.trim() || `${depositoTipoLabel} en ${cuentaSeleccionada.alias}`,
    },
    ...depositoLineas
      .filter((linea) => linea.cuentaId && linea.monto > 0)
      .map((linea) => {
        const cuenta = cuentasMovimientoEmpresa.find((c) => c.id === linea.cuentaId);
        return {
          cuenta: cuenta ? `${cuenta.codigo} - ${cuenta.nombre}` : 'Cuenta sin seleccionar',
          documento: depositoReferencia.trim() || '-',
          debe: 0,
          haber: Number(linea.monto || 0),
          detalle: linea.detalle.trim() || depositoDetalle.trim() || `${depositoTipoLabel} en ${cuentaSeleccionada.alias}`,
        };
      }),
  ] : [];

  const totalEgresosPendientes = egresosRows.filter((r) => r.estado_conciliacion === 'pendiente').length;
  const totalEgresosConciliados = egresosRows.filter((r) => r.estado_conciliacion === 'conciliado').length;
  const montoEgresos = egresosRows.reduce((acc, row) => acc + Number(row.monto || 0), 0);
  const egresoSeleccionado = egresosRows.find((r) => r.id === selectedEgresoId) || null;
  const egresoMontoVista = Number(egresoMonto || 0);
  const egresoTipoLabel = ({
    cheque: 'Cheque',
    nota_debito: 'Nota de debito',
    transferencia_emitida: 'Transferencia emitida',
    otro: 'Otro egreso',
  } as Record<string, string>)[egresoTipo] || 'Cheque';
  const totalLineasEgreso = egresoLineas.reduce((acc, linea) => acc + Number(linea.monto || 0), 0);
  const asientoEgresoPreview = egresoMontoVista > 0 && cuentaSeleccionada ? [
    ...egresoLineas
      .filter((linea) => linea.cuentaId && linea.monto > 0)
      .map((linea) => {
        const cuenta = cuentasMovimientoEmpresa.find((c) => c.id === linea.cuentaId);
        return {
          cuenta: cuenta ? `${cuenta.codigo} - ${cuenta.nombre}` : 'Cuenta sin seleccionar',
          documento: egresoReferencia.trim() || '-',
          debe: Number(linea.monto || 0),
          haber: 0,
          detalle: linea.detalle.trim() || egresoDetalle.trim() || `${egresoTipoLabel} desde ${cuentaSeleccionada.alias}`,
        };
      }),
    {
      cuenta: `${cuentaSeleccionada.cuenta_contable_codigo} - ${cuentaSeleccionada.cuenta_contable_nombre}`,
      documento: egresoReferencia.trim() || '-',
      debe: 0,
      haber: egresoMontoVista,
      detalle: egresoDetalle.trim() || `${egresoTipoLabel} desde ${cuentaSeleccionada.alias}`,
    },
  ] : [];

  const operativaTitulo = esVistaDepositos
    ? 'Depositos e ingresos bancarios'
    : esVistaEgresos
      ? 'Cheques / Notas de debito'
      : esVistaCuentas
        ? 'Cuentas bancarias'
        : 'Conciliacion bancaria';
  const operativaSubtitulo = esVistaDepositos
    ? 'Registre ingresos bancarios directos con asiento compuesto y preparelos para conciliacion.'
    : esVistaEgresos
      ? 'Registre cheques, notas de debito y otros egresos bancarios con asiento compuesto.'
      : esVistaCuentas
        ? 'Administre las cuentas bancarias activas de la empresa y su ligue contable.'
        : 'Concilie movimientos del libro banco contra el estado bancario y cierre periodos por cuenta.';
  const operativaRows = esVistaDepositos ? depositosRows : egresosRows;
  const operativaPageSize = 8;
  const operativaTotalPages = Math.max(1, Math.ceil(operativaRows.length / operativaPageSize));
  const operativaRowsPage = operativaRows.slice((operativaPage - 1) * operativaPageSize, operativaPage * operativaPageSize);
  const operativaSeleccionada = esVistaDepositos ? depositoSeleccionado : egresoSeleccionado;
  const operativaPendientes = esVistaDepositos ? totalDepositosPendientes : totalEgresosPendientes;
  const operativaConciliados = esVistaDepositos ? totalDepositosConciliados : totalEgresosConciliados;
  const operativaMontoAcumulado = esVistaDepositos ? montoDepositos : montoEgresos;
  const operativaMoneda = cuentaSeleccionada?.moneda || (esVistaDepositos ? depositoMoneda : egresoMoneda);
  const monedaMovimiento = esVistaDepositos ? depositoMoneda : egresoMoneda;
  const cuentaMonedaDistinta = Boolean(cuentaSeleccionada && monedaMovimiento !== cuentaSeleccionada.moneda);
  const advertenciaMoneda = cuentaMonedaDistinta
    ? `La cuenta bancaria seleccionada trabaja en ${cuentaSeleccionada?.moneda}, pero el documento esta en ${monedaMovimiento}. Revise la moneda antes de guardar.`
    : '';
  const operativaMontoVista = esVistaDepositos ? depositoMontoVista : egresoMontoVista;
  const operativaTotalLineas = esVistaDepositos ? totalLineasDeposito : totalLineasEgreso;
  const operativaPreview = esVistaDepositos ? asientoDepositoPreview : asientoEgresoPreview;
  const operativaTipoLabel = esVistaDepositos ? depositoTipoLabel : egresoTipoLabel;
  const operativaCuadra = operativaMontoVista > 0 && Math.abs(operativaTotalLineas - operativaMontoVista) <= 0.009;
  const operativaLineasValidas = esVistaDepositos
    ? depositoLineas.some((linea) => Number(linea.cuentaId || 0) > 0 && Number(linea.monto || 0) > 0)
    : egresoLineas.some((linea) => Number(linea.cuentaId || 0) > 0 && Number(linea.monto || 0) > 0);
  const operativaDebe = esVistaDepositos ? operativaMontoVista : operativaTotalLineas;
  const operativaHaber = esVistaDepositos ? operativaTotalLineas : operativaMontoVista;
  const operativaPuedeGuardar = Boolean(
    canEdit &&
    !busy &&
    conciliacionCuentaId &&
    operativaMontoVista > 0 &&
    operativaLineasValidas &&
    operativaCuadra &&
    !cuentaMonedaDistinta
  );
  const operativaLineas = esVistaDepositos ? depositoLineas : egresoLineas;
  const operativaDocumento = (row: DepositoIngresoRow | EgresoBancoRow) =>
    row.referencia || `${esVistaDepositos ? 'DEP' : 'EGR'}-#${row.id}`;
  const operativaTipoOptions = esVistaDepositos
    ? [
        { value: 'ingreso_directo', label: 'Ingreso directo' },
        { value: 'transferencia_recibida', label: 'Transferencia recibida' },
        { value: 'interes_bancario', label: 'Interes bancario' },
        { value: 'ajuste_favor', label: 'Ajuste a favor' },
        { value: 'otro', label: 'Otro ingreso' },
      ]
    : [
        { value: 'cheque', label: 'Cheque' },
        { value: 'nota_debito', label: 'Nota de debito' },
        { value: 'transferencia_emitida', label: 'Transferencia emitida' },
        { value: 'otro', label: 'Otro egreso' },
      ];
  const seleccionarMovimientoOperativo = (id: number) => {
    if (esVistaDepositos) setSelectedDepositoId(id);
    else setSelectedEgresoId(id);
  };
  const actualizarLineaOperativa = (lineaId: string, patch: Partial<DepositoLineaForm>) => {
    if (esVistaDepositos) actualizarLineaDeposito(lineaId, patch);
    else actualizarLineaEgreso(lineaId, patch);
  };
  const agregarLineaOperativa = () => {
    if (esVistaDepositos) agregarLineaDeposito();
    else agregarLineaEgreso();
  };
  const eliminarLineaOperativa = (lineaId: string) => {
    if (esVistaDepositos) eliminarLineaDeposito(lineaId);
    else eliminarLineaEgreso(lineaId);
  };
  const abrirSelectorCuentaOperativa = (lineaId: string) => {
    const index = operativaLineas.findIndex((x) => x.id === lineaId);
    if (esVistaDepositos) {
      setDepositoLineaTarget(index >= 0 ? index : null);
      setModalDepositoCuentaOpen(true);
    } else {
      setEgresoLineaTarget(index >= 0 ? index : null);
      setModalEgresoCuentaOpen(true);
    }
  };
  const guardarMovimientoOperativo = () => (esVistaDepositos ? guardarDepositoIngreso() : guardarEgresoBancario());
  const limpiarMovimientoOperativo = () => (esVistaDepositos ? limpiarDepositoIngreso() : limpiarEgresoBancario());
  const recargarMovimientoOperativo = () => (esVistaDepositos ? loadDepositosIngresos() : loadEgresosBancarios());
  const conciliarMovimientoOperativo = (id: number) => (esVistaDepositos ? marcarDepositoIngresoConciliado(id) : marcarEgresoConciliado(id));
  const deshacerConciliacionMovimientoOperativo = (id: number) => (esVistaDepositos ? deshacerDepositoIngresoConciliado(id) : deshacerEgresoConciliado(id));

  return (
    <>
      <style>{styles}</style>
      <div className={`bn-wrap${!esVistaOperativa ? ' bn-workspace' : ''}`}>
        <div className="bn-title">{operativaTitulo}</div>
        <div className="bn-sub">{operativaSubtitulo}</div>

        {ok ? (
          <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-700 bg-gray-900">
                <p className="text-sm font-semibold text-green-400 uppercase tracking-wide">Movimiento guardado</p>
              </div>
              <div className="px-5 py-5">
                <p className="text-sm text-gray-100 leading-relaxed">{ok}</p>
              </div>
              <div className="px-5 py-4 border-t border-gray-700 flex justify-end">
                <button
                  type="button"
                  className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded text-sm font-medium text-white"
                  onClick={() => setOk('')}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {err ? <div className="bn-msg-err">{err}</div> : null}
        {esVistaOperativa ? (
          <div className="border border-gray-700 bg-gray-800 flex w-full overflow-hidden min-h-[760px]">
            <div className="w-72 shrink-0 border-r border-gray-700 flex flex-col overflow-y-auto">
              <div className="px-5 py-4 border-b border-gray-700">
                <p className="text-purple-400 font-bold text-sm uppercase tracking-wide mb-1">Movimiento bancario</p>
                <select
                  value={conciliacionCuentaId}
                  onChange={(e) => setConciliacionCuentaId(Number(e.target.value || 0))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-purple-500"
                >
                  <option value={0}>-- seleccione --</option>
                  {rows.filter((r) => r.activo).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo} - {r.alias} ({r.moneda})
                    </option>
                  ))}
                </select>
                <p className="text-white font-semibold text-sm leading-snug mt-3">{cuentaSeleccionada?.alias || 'Sin cuenta seleccionada'}</p>
                <p className="text-gray-400 text-xs mt-1">{cuentaSeleccionada?.banco_nombre || 'Seleccione una cuenta bancaria para empezar.'}</p>
                <p className="text-gray-500 text-xs font-mono mt-0.5">{cuentaSeleccionada?.numero_cuenta || ''}</p>
              </div>

              <div className="px-5 py-3 space-y-3 border-b border-gray-700 text-xs">
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Movimientos registrados</p>
                  <p className="text-gray-100 font-mono text-xl">{operativaRows.length}</p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Pendientes</p>
                  <p className="text-green-400 font-mono text-xl">{operativaPendientes}</p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Conciliados</p>
                  <p className="text-cyan-400 font-mono text-xl">{operativaConciliados}</p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Monto registrado</p>
                  <p className={`font-mono text-sm ${esVistaDepositos ? 'text-green-400' : 'text-red-400'}`}>{money(operativaMontoAcumulado, operativaMoneda)}</p>
                </div>
              </div>

              <div className="px-5 py-3 space-y-3 border-b border-gray-700 text-xs">
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Seleccion actual</p>
                  <p className="text-gray-200 font-medium">
                    {operativaSeleccionada ? operativaDocumento(operativaSeleccionada) : 'Sin movimiento seleccionado'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Fecha</p>
                  <p className="text-gray-200">{operativaSeleccionada?.fecha_movimiento || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Conciliacion</p>
                  <p className="text-gray-200">{operativaSeleccionada?.estado_conciliacion || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Monto</p>
                  <p className={`font-mono ${esVistaDepositos ? 'text-green-400' : 'text-red-400'}`}>{operativaSeleccionada ? money(operativaSeleccionada.monto, operativaSeleccionada.moneda) : '-'}</p>
                </div>
              </div>

              <div className="flex-1" />

              <div className="px-5 py-3 border-t border-gray-700 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Debito</span>
                  <span className="font-mono text-green-400 font-semibold">{money(operativaDebe, operativaMoneda)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Credito</span>
                  <span className="font-mono text-red-400 font-semibold">{money(operativaHaber, operativaMoneda)}</span>
                </div>
                <div className={`flex justify-between pt-1 border-t border-gray-700 font-bold ${operativaCuadra ? 'text-green-400' : 'text-red-400'}`}>
                  <span>{operativaCuadra ? '✓ Cuadra' : '× No cuadra'}</span>
                  {operativaMontoVista > 0 && !operativaCuadra ? (
                    <span className="font-mono">{money(Math.abs(operativaTotalLineas - operativaMontoVista), operativaMoneda)}</span>
                  ) : null}
                </div>
              </div>

              <div className="px-4 py-4 border-t border-gray-700 flex flex-col gap-2">
                <button type="button" onClick={guardarMovimientoOperativo} disabled={!operativaPuedeGuardar} className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-40 px-4 py-2.5 rounded text-sm font-medium transition-colors text-white">Guardar</button>
                <button type="button" onClick={limpiarMovimientoOperativo} disabled={busy} className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm transition-colors text-white">Limpiar</button>
                <button type="button" onClick={recargarMovimientoOperativo} disabled={busy} className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm transition-colors text-white">Recargar movimientos</button>
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
                <div className="border border-gray-700 overflow-hidden bg-gray-800">
                  <div className="px-4 py-3 border-b border-gray-700 bg-gray-900">
                    <p className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Documento bancario</p>
                  </div>
                  <div className="px-4 py-3 space-y-4">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-3">
                        <label className="text-[11px] text-gray-400 block mb-1 uppercase tracking-wide">Cuenta</label>
                        <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100" value={cuentaSeleccionada?.codigo || ''} readOnly placeholder="Seleccione una cuenta bancaria" />
                      </div>
                      <div className="col-span-6">
                        <label className="text-[11px] text-gray-400 block mb-1 uppercase tracking-wide">Banco / cuenta destino</label>
                        <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100" value={cuentaSeleccionada ? `${cuentaSeleccionada.banco_nombre} - ${cuentaSeleccionada.alias}` : ''} readOnly placeholder="Seleccione una cuenta bancaria" />
                      </div>
                      <div className="col-span-3">
                        <label className="text-[11px] text-gray-400 block mb-1 uppercase tracking-wide">Moneda</label>
                        <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100" value={operativaMoneda} readOnly />
                      </div>
                    </div>

                    {advertenciaMoneda ? (
                      <div className="border border-amber-500/40 bg-amber-500/10 rounded px-3 py-2">
                        <p className="text-[11px] text-amber-300">{advertenciaMoneda}</p>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-3">
                        <label className="text-[11px] text-gray-400 block mb-1 uppercase tracking-wide">Tipo de documento</label>
                        <select className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-purple-500" value={esVistaDepositos ? depositoTipo : egresoTipo} onChange={(e) => esVistaDepositos ? setDepositoTipo(e.target.value as any) : setEgresoTipo(e.target.value as any)}>
                          {operativaTipoOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="text-[11px] text-gray-400 block mb-1 uppercase tracking-wide">Fecha</label>
                        <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-purple-500" type="date" value={esVistaDepositos ? depositoFecha : egresoFecha} onChange={(e) => esVistaDepositos ? setDepositoFecha(e.target.value) : setEgresoFecha(e.target.value)} />
                      </div>
                      <div className="col-span-4">
                        <label className="text-[11px] text-gray-400 block mb-1 uppercase tracking-wide">Documento / referencia</label>
                        <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-purple-500" value={esVistaDepositos ? depositoReferencia : egresoReferencia} onChange={(e) => esVistaDepositos ? setDepositoReferencia(e.target.value) : setEgresoReferencia(e.target.value)} placeholder="Numero o referencia" />
                      </div>
                      <div className="col-span-3">
                        <label className="text-[11px] text-gray-400 block mb-1 uppercase tracking-wide">Monto</label>
                        <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-right text-yellow-400 font-mono focus:outline-none focus:border-purple-500" value={esVistaDepositos ? depositoMontoTexto : egresoMontoTexto} onChange={(e) => {
                          if (esVistaDepositos) {
                            setDepositoMontoTexto(e.target.value);
                            setDepositoMonto(parseMonto(e.target.value));
                          } else {
                            setEgresoMontoTexto(e.target.value);
                            setEgresoMonto(parseMonto(e.target.value));
                          }
                        }} onBlur={() => {
                          if (esVistaDepositos) setDepositoMontoTexto(depositoMonto > 0 ? formatMonto(depositoMonto) : '');
                          else setEgresoMontoTexto(egresoMonto > 0 ? formatMonto(egresoMonto) : '');
                        }} placeholder="0,00" />
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-3">
                        <label className="text-[11px] text-gray-400 block mb-1 uppercase tracking-wide">Tipo de cambio</label>
                        <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100" value={formatMonto(tipoCambioDia)} readOnly />
                        {tipoCambioFuente ? (
                          <p className="text-[10px] text-gray-500 mt-1">Fuente: {tipoCambioFuente}</p>
                        ) : null}
                      </div>
                      <div className="col-span-9">
                        <label className="text-[11px] text-gray-400 block mb-1 uppercase tracking-wide">Detalle</label>
                        <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-purple-500" value={esVistaDepositos ? depositoDetalle : egresoDetalle} onChange={(e) => esVistaDepositos ? setDepositoDetalle(e.target.value) : setEgresoDetalle(e.target.value)} placeholder="Detalle del movimiento bancario" />
                      </div>
                    </div>

                    <div className="border border-gray-700 rounded overflow-hidden">
                      <div className="px-3 py-2 border-b border-gray-700 bg-gray-900">
                        <p className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Lineas de contrapartida</p>
                      </div>
                      <table className="w-full text-xs">
                        <thead className="bg-gray-900">
                          <tr className="text-gray-500 border-b border-gray-700">
                            <th className="text-left py-2 px-2">Cuenta</th>
                            <th className="text-left py-2 px-2">Detalle</th>
                            <th className="text-right py-2 px-2 w-40">{esVistaDepositos ? 'Haber' : 'Debe'}</th>
                            <th className="text-left py-2 px-2 w-28"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {operativaLineas.map((linea) => {
                            const cuenta = cuentasMovimientoEmpresa.find((c) => c.id === linea.cuentaId);
                            return (
                              <tr key={linea.id} className="border-b border-gray-700">
                                <td className="py-1 px-2">
                                  <button className={`w-full text-left rounded px-2 py-1 text-xs border ${!linea.cuentaId ? 'border-red-600 bg-gray-700 text-red-300' : 'border-gray-700 bg-gray-800 text-gray-100'}`} type="button" onClick={() => abrirSelectorCuentaOperativa(linea.id)}>
                                    {cuenta ? (<><span className="text-yellow-400 font-mono font-bold">{cuenta.codigo}</span><span className="text-gray-300 ml-1 truncate">{cuenta.nombre}</span></>) : (<span>? sin cuenta ?</span>)}
                                  </button>
                                </td>
                                <td className="py-1 px-2">
                                  <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-purple-500" value={linea.detalle} onChange={(e) => actualizarLineaOperativa(linea.id, { detalle: e.target.value })} placeholder="Detalle de la linea" />
                                </td>
                                <td className="py-1 px-2">
                                  <input className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-right text-yellow-400 font-mono focus:outline-none focus:border-purple-500" value={linea.montoTexto} onChange={(e) => actualizarLineaOperativa(linea.id, { montoTexto: e.target.value, monto: parseMonto(e.target.value) })} onBlur={() => actualizarLineaOperativa(linea.id, { montoTexto: linea.monto > 0 ? formatMonto(linea.monto) : '' })} placeholder="0,00" />
                                </td>
                                <td className="py-1 px-2">
                                  <div className="flex gap-2">
                                    <button className="text-xs text-purple-400 hover:text-purple-300" type="button" onClick={agregarLineaOperativa}>+ Agregar linea</button>
                                    <button className="text-xs text-gray-500 hover:text-red-400" type="button" onClick={() => eliminarLineaOperativa(linea.id)} disabled={operativaLineas.length <= 1}>Borrar</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="border border-gray-700 rounded overflow-hidden">
                      <div className="px-3 py-2 border-b border-gray-700 bg-gray-900">
                        <p className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Asiento previo</p>
                      </div>
                      <table className="w-full text-xs">
                        <thead className="bg-gray-900">
                          <tr className="text-gray-500 border-b border-gray-700">
                            <th className="text-left py-2 px-2">Cuenta</th>
                            <th className="text-left py-2 px-2">Documento</th>
                            <th className="text-right py-2 px-2 w-32">Debito</th>
                            <th className="text-right py-2 px-2 w-32">Credito</th>
                            <th className="text-left py-2 px-2">Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operativaPreview.length === 0 ? (
                            <tr><td colSpan={5} className="py-6 px-2 text-center text-gray-500">Complete monto, cuenta bancaria y lineas de contrapartida para visualizar el asiento.</td></tr>
                          ) : operativaPreview.map((row, idx) => (
                            <tr key={`${row.cuenta}-${idx}`} className="border-b border-gray-700">
                              <td className="py-2 px-2 text-gray-200">{row.cuenta}</td>
                              <td className="py-2 px-2 text-gray-400">{row.documento}</td>
                              <td className="py-2 px-2 text-right font-mono text-green-400">{row.debe ? money(row.debe, operativaMoneda) : '-'}</td>
                              <td className="py-2 px-2 text-right font-mono text-red-400">{row.haber ? money(row.haber, operativaMoneda) : '-'}</td>
                              <td className="py-2 px-2 text-gray-300">{row.detalle}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-900 border-t border-gray-600">
                          <tr>
                            <td colSpan={2}></td>
                            <td className="py-2 px-2 text-right font-mono font-semibold text-green-400">{money(operativaDebe, operativaMoneda)}</td>
                            <td className="py-2 px-2 text-right font-mono font-semibold text-red-400">{money(operativaHaber, operativaMoneda)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="border border-gray-700 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900 flex items-center justify-between">
                        <p className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Libro banco</p>
                        <p className="text-[11px] text-gray-500">
                          Mostrando {operativaRows.length === 0 ? 0 : ((operativaPage - 1) * operativaPageSize) + 1}
                          {' - '}
                          {Math.min(operativaPage * operativaPageSize, operativaRows.length)} de {operativaRows.length}
                        </p>
                      </div>
                      <table className="w-full text-xs">
                        <thead className="bg-gray-900">
                          <tr className="text-gray-500 border-b border-gray-700">
                            <th className="text-left py-2 px-2">Fecha</th>
                            <th className="text-left py-2 px-2">Documento</th>
                            <th className="text-left py-2 px-2">Tipo</th>
                            <th className="text-left py-2 px-2">Referencia</th>
                            <th className="text-left py-2 px-2">Detalle</th>
                            <th className="text-left py-2 px-2">Asiento</th>
                            <th className="text-left py-2 px-2">Conciliacion</th>
                            <th className="text-right py-2 px-2 w-36">Monto</th>
                            <th className="text-left py-2 px-2 w-28">Accion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operativaRows.length === 0 ? (
                            <tr><td colSpan={9} className="py-6 px-2 text-center text-gray-500">Sin movimientos bancarios registrados para esta cuenta.</td></tr>
                          ) : operativaRowsPage.map((row) => (
                            <tr key={row.id} onClick={() => seleccionarMovimientoOperativo(row.id)} className={`border-b border-gray-700 cursor-pointer ${row.id === (esVistaDepositos ? selectedDepositoId : selectedEgresoId) ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'}`}>
                              <td className="py-2 px-2 text-gray-300">{row.fecha_movimiento}</td>
                              <td className="py-2 px-2 text-gray-200 font-mono">{operativaDocumento(row)}</td>
                              <td className="py-2 px-2 text-gray-300">{row.tipo_movimiento}</td>
                              <td className="py-2 px-2 text-gray-400">{row.referencia || '-'}</td>
                              <td className="py-2 px-2 text-gray-300">{row.detalle}</td>
                              <td className="py-2 px-2 text-cyan-400 font-mono">{row.asiento_numero || (row.asiento_id ? `#${row.asiento_id}` : '-')}</td>
                              <td className="py-2 px-2 text-gray-300">{row.estado_conciliacion}</td>
                              <td className={`py-2 px-2 text-right font-mono ${esVistaDepositos ? 'text-green-400' : 'text-red-400'}`}>{money(row.monto, row.moneda)}</td>
                              <td className="py-2 px-2">
                                {row.estado_conciliacion !== 'conciliado' ? (
                                  <button className="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-2 py-1 text-gray-100" type="button" onClick={(e) => { e.stopPropagation(); conciliarMovimientoOperativo(row.id); }} disabled={!canEdit || busy}>Conciliar</button>
                                ) : (
                                  <button className="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-2 py-1 text-gray-100" type="button" onClick={(e) => { e.stopPropagation(); deshacerConciliacionMovimientoOperativo(row.id); }} disabled={!canEdit || busy}>Deshacer</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {operativaRows.length > operativaPageSize ? (
                        <div className="px-4 py-3 border-t border-gray-700 bg-gray-900 flex items-center justify-between">
                          <button
                            type="button"
                            className="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-3 py-1.5 text-gray-100 disabled:opacity-40"
                            onClick={() => setOperativaPage((p) => Math.max(1, p - 1))}
                            disabled={operativaPage <= 1}
                          >
                            Anterior
                          </button>
                          <span className="text-xs text-gray-400">Pagina {operativaPage} de {operativaTotalPages}</span>
                          <button
                            type="button"
                            className="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-3 py-1.5 text-gray-100 disabled:opacity-40"
                            onClick={() => setOperativaPage((p) => Math.min(operativaTotalPages, p + 1))}
                            disabled={operativaPage >= operativaTotalPages}
                          >
                            Siguiente
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {esVistaCuentas ? (
            <>
            <div className="bn-kpis">
              <div className="bn-kpi"><div className="k">Cuentas registradas</div><div className="v">{rows.length}</div></div>
              <div className="bn-kpi"><div className="k">Activas</div><div className="v">{totalActivas}</div></div>
              <div className="bn-kpi"><div className="k">CRC</div><div className="v">{totalCRC}</div></div>
              <div className="bn-kpi"><div className="k">USD</div><div className="v">{totalUSD}</div></div>
            </div>

            <div className="bn-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
            {form.id ? `Editar cuenta bancaria #${form.id}` : 'Nueva cuenta bancaria'}
          </div>
          <div className="bn-grid">
            <div className="bn-field">
              <label>Codigo</label>
              <input className="bn-input" value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} disabled={!canEdit || busy} />
            </div>
            <div className="bn-field">
              <label>Alias</label>
              <input className="bn-input" value={form.alias} onChange={(e) => setForm((p) => ({ ...p, alias: e.target.value }))} disabled={!canEdit || busy} />
            </div>
            <div className="bn-field">
              <label>Banco</label>
              <input className="bn-input" value={form.banco_nombre} onChange={(e) => setForm((p) => ({ ...p, banco_nombre: e.target.value }))} disabled={!canEdit || busy} />
            </div>
            <div className="bn-field">
              <label>Moneda</label>
              <select className="bn-select" value={form.moneda} onChange={(e) => setForm((p) => ({ ...p, moneda: e.target.value as 'CRC' | 'USD' }))} disabled={!canEdit || busy}>
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="bn-field">
              <label>Numero de cuenta / IBAN</label>
              <input className="bn-input" value={form.numero_cuenta} onChange={(e) => setForm((p) => ({ ...p, numero_cuenta: e.target.value }))} disabled={!canEdit || busy} />
            </div>
            <div className="bn-field">
              <label>Titular</label>
              <input className="bn-input" value={form.titular} onChange={(e) => setForm((p) => ({ ...p, titular: e.target.value }))} disabled={!canEdit || busy} />
            </div>
            <div className="bn-field" style={{ gridColumn: 'span 2' }}>
              <label>Cuenta contable</label>
              {(() => {
                const sel = cuentasContablesDisponibles.find(c => c.id === form.cuenta_contable_id);
                return (
                  <button
                    type="button"
                    onClick={() => { if (canEdit && !busy) setModalCuentaContableOpen(true); }}
                    disabled={!canEdit || busy}
                    className="bn-select text-left w-full"
                    style={{ cursor: canEdit && !busy ? 'pointer' : 'default' }}>
                    {sel
                      ? <><span style={{ color: '#facc15', fontFamily: 'monospace', fontWeight: 700 }}>{sel.codigo}</span><span style={{ marginLeft: 8 }}>{sel.nombre}</span></>
                      : <span style={{ color: '#6b7280' }}>-- seleccione --</span>}
                  </button>
                );
              })()}
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                Recomendacion: ligue cada cuenta bancaria a una cuenta contable exclusiva. El resumen financiero se obtiene desde el padre <b>BANCOS</b>, no compartiendo la misma subcuenta entre bancos distintos.
              </div>
              {!form.id && cuentasContablesDisponibles.length === 0 ? (
                <div className="bn-msg-err" style={{ marginBottom: 0, marginTop: 8 }}>
                  No hay cuentas contables bancarias libres para crear otra cuenta bancaria.
                  {onAbrirCatalogoContable ? (
                    <div style={{ marginTop: 8 }}>
                      <button className="bn-btn" type="button" onClick={onAbrirCatalogoContable}>
                        Crear cuenta contable
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="bn-field">
              <label>Estado</label>
              <select className="bn-select" value={form.activo ? 'S' : 'N'} onChange={(e) => setForm((p) => ({ ...p, activo: e.target.value === 'S' }))} disabled={!canEdit || busy}>
                <option value="S">Activa</option>
                <option value="N">Inactiva</option>
              </select>
            </div>
          </div>
          <div className="bn-actions" style={{ marginTop: 10 }}>
            <button className="bn-btn main" type="button" onClick={guardar} disabled={!canEdit || busy}>
              {form.id ? 'Guardar cambios' : 'Registrar cuenta'}
            </button>
            <button className="bn-btn" type="button" onClick={limpiar} disabled={busy}>
              Limpiar
            </button>
            <button className="bn-btn" type="button" onClick={cargar} disabled={busy}>
              Recargar
            </button>
          </div>
        </div>

            <div className="bn-card">
          <div className="bn-grid" style={{ marginBottom: 10 }}>
            <div className="bn-field" style={{ gridColumn: 'span 2' }}>
              <label>Buscar</label>
              <input className="bn-input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Codigo, alias, banco, cuenta o cuenta contable" />
            </div>
            <div className="bn-field">
              <label>Moneda</label>
              <select className="bn-select" value={monedaFiltro} onChange={(e) => setMonedaFiltro(e.target.value as 'TODAS' | 'CRC' | 'USD')}>
                <option value="TODAS">Todas</option>
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="bn-field">
              <label>Estado</label>
              <select className="bn-select" value={soloActivas ? 'ACTIVAS' : 'TODAS'} onChange={(e) => setSoloActivas(e.target.value === 'ACTIVAS')}>
                <option value="ACTIVAS">Activas</option>
                <option value="TODAS">Todas</option>
              </select>
            </div>
          </div>

          <div className="bn-table">
            <table>
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Alias</th>
                  <th>Banco</th>
                  <th>Moneda</th>
                  <th>Cuenta</th>
                  <th>Titular</th>
                  <th>Cuenta contable</th>
                  <th>Estado</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {rowsFiltradas.length === 0 ? (
                  <tr><td colSpan={9} className="bn-empty">No hay cuentas bancarias registradas para esta empresa.</td></tr>
                ) : rowsFiltradas.map((row) => (
                  <tr key={row.id}>
                    <td>{row.codigo}</td>
                    <td>{row.alias}</td>
                    <td>{row.banco_nombre}</td>
                    <td>{row.moneda}</td>
                    <td>{row.numero_cuenta}</td>
                    <td>{row.titular || '-'}</td>
                    <td>{row.cuenta_contable_codigo} - {row.cuenta_contable_nombre}</td>
                    <td><span className={`bn-badge ${row.activo ? 'ok' : 'off'}`}>{row.activo ? 'Activa' : 'Inactiva'}</span></td>
                    <td>
                      <button className="bn-btn" type="button" onClick={() => editar(row)} disabled={!canEdit || busy}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
        ) : null}

            {esVistaConciliacion ? (
            <>
            <div className="bn-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
            Conciliacion por cuenta y periodo
          </div>
          <div className="bn-sub" style={{ marginBottom: 10 }}>
            Base operativa del modulo Bancos. Revise aqui los movimientos generados desde cobros por cuenta bancaria y rango de fechas.
          </div>
          <div className="bn-grid" style={{ marginBottom: 10 }}>
            <div className="bn-field" style={{ gridColumn: 'span 2' }}>
              <label>Cuenta bancaria</label>
              <select className="bn-select" value={conciliacionCuentaId} onChange={(e) => setConciliacionCuentaId(Number(e.target.value || 0))}>
                <option value={0}>-- seleccione --</option>
                {rows.filter((r) => r.activo).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} - {r.alias} ({r.moneda})
                  </option>
                ))}
              </select>
            </div>
            <div className="bn-field">
              <label>Desde</label>
              <input className="bn-input" type="date" value={conciliacionDesde} onChange={(e) => setConciliacionDesde(e.target.value)} />
            </div>
            <div className="bn-field">
              <label>Hasta</label>
              <input className="bn-input" type="date" value={conciliacionHasta} onChange={(e) => setConciliacionHasta(e.target.value)} />
            </div>
            <div className="bn-field">
              <label>Saldo segun banco</label>
              <input
                className="bn-input"
                value={saldoBancoTexto}
                onChange={(e) => {
                  setSaldoBancoTexto(e.target.value);
                  setSaldoBanco(parseMonto(e.target.value));
                }}
                onBlur={() => setSaldoBancoTexto(saldoBanco > 0 ? formatMonto(saldoBanco) : '')}
                placeholder="0,00"
              />
            </div>
            <div className="bn-field" style={{ gridColumn: 'span 3' }}>
              <label>Observacion del periodo</label>
              <input className="bn-input" value={observacionPeriodo} onChange={(e) => setObservacionPeriodo(e.target.value)} />
            </div>
          </div>

          <div className="bn-kpis">
            <div className="bn-kpi"><div className="k">Movimientos</div><div className="v">{movimientosRows.length}</div></div>
            <div className="bn-kpi"><div className="k">Pendientes</div><div className="v">{totalPendientesAux}</div></div>
            <div className="bn-kpi"><div className="k">Conciliados</div><div className="v">{totalConciliadosAux}</div></div>
            <div className="bn-kpi"><div className="k">Monto periodo</div><div className="v" style={{ fontSize: 16 }}>{money(montoPeriodoAux, rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC')}</div></div>
          </div>

          <div className="bn-kpis">
            <div className="bn-kpi"><div className="k">Saldo libros</div><div className="v" style={{ fontSize: 16 }}>{money(saldoLibrosCalculado, rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC')}</div></div>
            <div className="bn-kpi"><div className="k">Saldo banco</div><div className="v" style={{ fontSize: 16 }}>{money(saldoBanco, rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC')}</div></div>
            <div className="bn-kpi"><div className="k">Ajustes libros</div><div className="v" style={{ fontSize: 16, color: impactoDiferencias === 0 ? '#f8fafc' : '#38bdf8' }}>{money(impactoDiferencias, rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC')}</div></div>
            <div className="bn-kpi"><div className="k">Diferencia</div><div className="v" style={{ fontSize: 16, color: diferenciaPeriodo === 0 ? '#f8fafc' : '#f87171' }}>{money(diferenciaPeriodo, rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC')}</div></div>
          </div>

          <div className="bn-kpis">
            <div className="bn-kpi"><div className="k">Cuenta</div><div className="v" style={{ fontSize: 13 }}>{rows.find((r) => r.id === conciliacionCuentaId)?.alias || '-'}</div></div>
            <div className="bn-kpi"><div className="k">Periodo activo</div><div className="v" style={{ fontSize: 13 }}>{periodoActivo ? `#${periodoActivo.id}` : '-'}</div></div>
            <div className="bn-kpi"><div className="k">Diferencias registradas</div><div className="v">{diferenciasRows.filter((r) => r.estado === 'registrada').length}</div></div>
            <div className="bn-kpi"><div className="k">Diferencias anuladas</div><div className="v">{diferenciasRows.filter((r) => r.estado === 'anulada').length}</div></div>
          </div>
          <div className="bn-actions" style={{ marginBottom: 10 }}>
            <button className="bn-btn" type="button" onClick={() => { loadMovimientosPeriodo(); loadAuxiliarCobros(); }} disabled={busy}>Recargar movimientos</button>
            <button className="bn-btn main" type="button" onClick={guardarPeriodo} disabled={!canEdit || busy}>Guardar periodo</button>
          </div>

          <div className="bn-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pago</th>
                  <th>Cliente</th>
                  <th>ID</th>
                  <th>Estado pago</th>
                  <th>Estado conciliacion</th>
                  <th>Referencia</th>
                  <th className="bn-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {movimientosRows.length === 0 ? (
                  <tr><td colSpan={8} className="bn-empty">Sin movimientos para la cuenta y el periodo seleccionado.</td></tr>
                ) : movimientosRows.map((r) => (
                  <tr key={`${r.origen_tipo || 'mov'}-${r.origen_id || r.pago_id || r.id}`}>
                    <td>{r.fecha_movimiento}</td>
                    <td>{r.origen_tipo === 'deposito_ingreso' ? `DEP-#${r.origen_id}` : `#${r.pago_id}`}</td>
                    <td>{r.tercero_nombre}</td>
                    <td>{r.tercero_identificacion || (r.cierre_caja_id ? `CIERRE #${r.cierre_caja_id}` : '-')}</td>
                    <td>{r.estado_pago || r.estado_origen || '-'}</td>
                    <td>{r.estado_conciliacion}</td>
                    <td>{r.referencia || r.detalle || '-'}</td>
                    <td className="bn-right">{money(r.monto, r.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

            <div className="bn-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
            Periodos de conciliacion
          </div>
          <div className="bn-table">
            <table>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Estado</th>
                  <th className="bn-right">Saldo libros</th>
                  <th className="bn-right">Saldo banco</th>
                  <th className="bn-right">Diferencia</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {periodosRows.length === 0 ? (
                  <tr><td colSpan={8} className="bn-empty">Sin periodos registrados para la cuenta seleccionada.</td></tr>
                ) : periodosRows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.cuenta_banco_codigo} - {p.cuenta_banco_alias}</td>
                    <td>{p.fecha_desde}</td>
                    <td>{p.fecha_hasta}</td>
                    <td>{p.estado}</td>
                    <td className="bn-right">{money(p.saldo_libros, p.moneda)}</td>
                    <td className="bn-right">{money(p.saldo_banco, p.moneda)}</td>
                    <td className="bn-right">{money(p.diferencia, p.moneda)}</td>
                    <td>
                      <div className="bn-actions" style={{ gap: 6 }}>
                        <button className="bn-btn" type="button" onClick={() => usarPeriodo(p)}>
                          Usar
                        </button>
                        <button className="bn-btn" type="button" onClick={() => abrirActaConciliacion(p)}>
                          Ver acta
                        </button>
                        <button className="bn-btn" type="button" onClick={() => descargarActaConciliacionPdf(p)}>
                          PDF
                        </button>
                        <button className="bn-btn" type="button" onClick={() => cerrarPeriodo(p.id)} disabled={!canEdit || busy || p.estado === 'cerrado'}>
                          Cerrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          </>
        ) : null}


        {esVistaConciliacion ? (
        <>
        <div className="bn-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
            Diferencias bancarias del periodo
          </div>
          <div className="bn-sub" style={{ marginBottom: 10 }}>
            Registre comisiones, cargos, intereses o ajustes que afectan libros y deben quedar conciliados con asiento contable.
          </div>
          <div className="bn-grid" style={{ marginBottom: 10 }}>
            <div className="bn-field">
              <label>Periodo activo</label>
              <input className="bn-input" value={periodoActivo ? `#${periodoActivo.id} | ${periodoActivo.fecha_desde} a ${periodoActivo.fecha_hasta}` : 'Seleccione un periodo'} readOnly />
            </div>
            <div className="bn-field">
              <label>Fecha</label>
              <input className="bn-input" type="date" value={diferenciaFecha} onChange={(e) => setDiferenciaFecha(e.target.value)} />
            </div>
            <div className="bn-field">
              <label>Tipo</label>
              <select className="bn-select" value={diferenciaTipo} onChange={(e) => setDiferenciaTipo(e.target.value as any)}>
                <option value="comision">Comision</option>
                <option value="cargo">Cargo bancario</option>
                <option value="interes">Interes acreditado</option>
                <option value="ajuste">Ajuste manual</option>
              </select>
            </div>
            <div className="bn-field">
              <label>Impacto en libros</label>
              <select className="bn-select" value={diferenciaSentido} onChange={(e) => setDiferenciaSentido(e.target.value as 'resta' | 'suma')}>
                <option value="resta">Reduce saldo de libros</option>
                <option value="suma">Aumenta saldo de libros</option>
              </select>
            </div>
            <div className="bn-field" style={{ gridColumn: 'span 2' }}>
              <label>Descripcion</label>
              <input className="bn-input" value={diferenciaDescripcion} onChange={(e) => setDiferenciaDescripcion(e.target.value)} placeholder="Ej. Comision por mantenimiento mensual" />
            </div>
            <div className="bn-field">
              <label>Referencia</label>
              <input className="bn-input" value={diferenciaReferencia} onChange={(e) => setDiferenciaReferencia(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="bn-field">
              <label>Monto</label>
              <input
                className="bn-input"
                value={diferenciaMontoTexto}
                onChange={(e) => {
                  setDiferenciaMontoTexto(e.target.value);
                  setDiferenciaMonto(parseMonto(e.target.value));
                }}
                onBlur={() => setDiferenciaMontoTexto(diferenciaMonto > 0 ? formatMonto(diferenciaMonto) : '')}
                placeholder="0,00"
              />
            </div>
            <div className="bn-field" style={{ gridColumn: 'span 2' }}>
              <label>Cuenta contable de contrapartida</label>
              <button className="bn-btn" type="button" onClick={() => setModalDiferenciaCuentaOpen(true)}>
                {cuentaDiferenciaActual ? `${cuentaDiferenciaActual.codigo} - ${cuentaDiferenciaActual.nombre}` : 'Seleccionar cuenta contable'}
              </button>
            </div>
          </div>

          <div className="bn-actions" style={{ marginBottom: 10 }}>
            <button className="bn-btn main" type="button" onClick={guardarDiferencia} disabled={!canEdit || busy || !periodoActivo}>
              Registrar diferencia
            </button>
            <button className="bn-btn" type="button" onClick={limpiarDiferencia} disabled={busy}>
              Limpiar
            </button>
            <button className="bn-btn" type="button" onClick={loadDiferencias} disabled={busy || !periodoImportId}>
              Recargar diferencias
            </button>
          </div>

          <div className="bn-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Impacto</th>
                  <th>Descripcion</th>
                  <th>Cuenta</th>
                  <th>Asiento</th>
                  <th className="bn-right">Monto</th>
                  <th>Estado</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {diferenciasRows.length === 0 ? (
                  <tr><td colSpan={9} className="bn-empty">Sin diferencias registradas para el periodo activo.</td></tr>
                ) : diferenciasRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.fecha}</td>
                    <td>{row.tipo}</td>
                    <td>{row.sentido === 'suma' ? 'Aumenta libros' : 'Reduce libros'}</td>
                    <td>{row.descripcion}</td>
                    <td>{row.cuenta_contable_codigo} - {row.cuenta_contable_nombre}</td>
                    <td>{row.asiento_numero || (row.asiento_id ? `#${row.asiento_id}` : '-')}</td>
                    <td className="bn-right">{money(row.monto, monedaConciliacion)}</td>
                    <td>{row.estado}</td>
                    <td>
                      <button className="bn-btn" type="button" onClick={() => deshacerDiferencia(row.id)} disabled={!canEdit || busy || row.estado === 'anulada'}>
                        Anular
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bn-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
            Importacion de estado bancario
          </div>
          <div className="bn-sub" style={{ marginBottom: 10 }}>
            Importe CSV o XLSX con columnas como fecha, descripcion, referencia, debito, credito y saldo. La importacion queda ligada al periodo seleccionado.
          </div>
          <div className="bn-grid" style={{ marginBottom: 10 }}>
            <div className="bn-field" style={{ gridColumn: 'span 2' }}>
              <label>Periodo destino</label>
              <select className="bn-select" value={periodoImportId} onChange={(e) => setPeriodoImportId(Number(e.target.value || 0))}>
                <option value={0}>-- seleccione --</option>
                {periodosRows.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} | {p.fecha_desde} a {p.fecha_hasta} | {p.cuenta_banco_alias}
                  </option>
                ))}
              </select>
            </div>
            <div className="bn-field">
              <label>Plantilla</label>
              <select className="bn-select" value={importTemplateId} onChange={(e) => setImportTemplateId(e.target.value)}>
                <option value="AUTO">Automatica segun banco</option>
                {IMPORT_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="bn-field" style={{ gridColumn: 'span 2' }}>
              <label>Archivo CSV / XLSX</label>
              <input
                className="bn-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleImportFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <div className="bn-actions" style={{ marginBottom: 10 }}>
            <button className="bn-btn" type="button" onClick={descargarPlantillaImportacion}>
              Descargar plantilla CSV
            </button>
            <button className="bn-btn main" type="button" onClick={guardarImportacion} disabled={!canEdit || busy || !periodoImportId || previewImport.length === 0}>
              Guardar importacion
            </button>
            <button className="bn-btn" type="button" onClick={loadEstadoImportado} disabled={busy || !periodoImportId}>
              Recargar estado
            </button>
            <div style={{ fontSize: 12, color: '#64748b' }}>{importFileName ? `Archivo: ${importFileName}` : 'Sin archivo cargado'}</div>
          </div>

          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.45 }}>
            Plantilla activa: <b>{effectiveImportTemplate.nombre}</b>
            {cuentaConciliacion?.banco_nombre ? ` para ${cuentaConciliacion.banco_nombre}` : ''}.
            Columnas esperadas: fecha, descripcion, referencia, debito, credito y saldo.
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
            Vista previa de importacion
          </div>
          <div className="bn-table" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripcion</th>
                  <th>Referencia</th>
                  <th className="bn-right">Debito</th>
                  <th className="bn-right">Credito</th>
                  <th className="bn-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {previewImport.length === 0 ? (
                  <tr><td colSpan={6} className="bn-empty">Sin filas en vista previa.</td></tr>
                ) : previewImport.map((row, idx) => (
                  <tr key={`${row.fecha_movimiento}-${idx}`}>
                    <td>{row.fecha_movimiento}</td>
                    <td>{row.descripcion}</td>
                    <td>{row.referencia || '-'}</td>
                    <td className="bn-right">{row.debito ? formatMonto(row.debito) : '-'}</td>
                    <td className="bn-right">{row.credito ? formatMonto(row.credito) : '-'}</td>
                    <td className="bn-right">{row.saldo != null ? formatMonto(row.saldo) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
            Estado bancario importado
          </div>
          <div className="bn-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripcion</th>
                  <th>Referencia</th>
                  <th className="bn-right">Debito</th>
                  <th className="bn-right">Credito</th>
                  <th className="bn-right">Saldo</th>
                  <th>Conciliado</th>
                </tr>
              </thead>
              <tbody>
                {estadoRows.length === 0 ? (
                  <tr><td colSpan={7} className="bn-empty">Sin lineas importadas para el periodo seleccionado.</td></tr>
                ) : estadoRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.fecha_movimiento}</td>
                    <td>{row.descripcion}</td>
                    <td>{row.referencia || '-'}</td>
                    <td className="bn-right">{row.debito ? money(row.debito, rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC') : '-'}</td>
                    <td className="bn-right">{row.credito ? money(row.credito, rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC') : '-'}</td>
                    <td className="bn-right">{row.saldo != null ? money(row.saldo, rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC') : '-'}</td>
                    <td>{row.conciliado ? 'Si' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bn-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
            Emparejamiento manual
          </div>
          <div className="bn-sub" style={{ marginBottom: 10 }}>
            Seleccione una linea del estado bancario y un movimiento pendiente del ERP para conciliarlos manualmente.
          </div>
          <div className="bn-grid" style={{ marginBottom: 10 }}>
            <div className="bn-field" style={{ gridColumn: 'span 2' }}>
              <label>Linea banco</label>
              <select className="bn-select" value={selectedEstadoId} onChange={(e) => setSelectedEstadoId(Number(e.target.value || 0))}>
                <option value={0}>-- seleccione --</option>
                {estadoRows.filter((r) => !r.conciliado).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fecha_movimiento} | {r.descripcion} | {formatMonto(r.debito || r.credito)}
                  </option>
                ))}
              </select>
            </div>
            <div className="bn-field" style={{ gridColumn: 'span 2' }}>
              <label>Movimiento ERP pendiente</label>
              <select className="bn-select" value={selectedAuxiliarId} onChange={(e) => setSelectedAuxiliarId(Number(e.target.value || 0))}>
                <option value={0}>-- seleccione --</option>
                {auxiliarRows.filter((r) => r.estado_conciliacion === 'pendiente').map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.pago_id} | {r.fecha_movimiento} | {r.tercero_nombre} | {formatMonto(r.monto)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bn-actions" style={{ marginBottom: 10 }}>
            <button className="bn-btn main" type="button" onClick={marcarMatchManual} disabled={!canEdit || busy || !selectedEstadoId || !selectedAuxiliarId}>
              Emparejar seleccionado
            </button>
            <button className="bn-btn" type="button" onClick={() => { loadEstadoImportado(); loadAuxiliarCobros(); loadMatches(); }} disabled={busy}>
              Recargar emparejamiento
            </button>
          </div>

          <div className="bn-table">
            <table>
              <thead>
                <tr>
                  <th>Banco</th>
                  <th>ERP</th>
                  <th>Cliente</th>
                  <th className="bn-right">Monto ERP</th>
                  <th>Referencia banco</th>
                  <th>Referencia ERP</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {matchRows.length === 0 ? (
                  <tr><td colSpan={7} className="bn-empty">Sin emparejamientos manuales registrados para este periodo.</td></tr>
                ) : matchRows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.banco_fecha} | {m.banco_descripcion}</td>
                    <td>#{m.pago_id} | {m.erp_fecha}</td>
                    <td>{m.tercero_nombre}</td>
                    <td className="bn-right">{money(m.erp_monto, rows.find((r) => r.id === conciliacionCuentaId)?.moneda || 'CRC')}</td>
                    <td>{m.banco_referencia || '-'}</td>
                    <td>{m.erp_referencia || '-'}</td>
                    <td>
                      <button className="bn-btn" type="button" onClick={() => deshacerMatchManual(m.id)} disabled={!canEdit || busy}>
                        Deshacer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bn-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
            Sugerencias de conciliacion automatica
          </div>
          <div className="bn-sub" style={{ marginBottom: 10 }}>
            Propuestas basadas en monto, cercania de fecha y coincidencia basica de referencia. El usuario siempre confirma.
          </div>
          <div className="bn-kpis" style={{ marginBottom: 10 }}>
            <div className="bn-kpi">
              <div className="k">Sugerencias validas</div>
              <div className="v">{suggestions.length}</div>
            </div>
            <div className="bn-kpi">
              <div className="k">Monto sugerido</div>
              <div className="v" style={{ fontSize: 16 }}>{money(totalSugerenciasMonto, monedaConciliacion)}</div>
            </div>
          </div>
          <div className="bn-actions" style={{ marginBottom: 10 }}>
            <button className="bn-btn" type="button" onClick={loadSuggestions} disabled={busy || !periodoImportId || !conciliacionCuentaId}>
              Recalcular sugerencias
            </button>
            <button
              className="bn-btn main"
              type="button"
              onClick={aplicarTodasLasSugerencias}
              disabled={!canEdit || busy || suggestions.length === 0 || !periodoImportId || !conciliacionCuentaId}
            >
              Aplicar todas las sugerencias
            </button>
          </div>
          <div className="bn-table">
            <table>
              <thead>
                <tr>
                  <th>Banco</th>
                  <th>ERP</th>
                  <th>Cliente</th>
                  <th className="bn-right">Monto banco</th>
                  <th className="bn-right">Monto ERP</th>
                  <th className="bn-right">Dif. monto</th>
                  <th className="bn-right">Dif. dias</th>
                  <th className="bn-right">Score</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.length === 0 ? (
                  <tr><td colSpan={9} className="bn-empty">Sin sugerencias disponibles para este periodo.</td></tr>
                ) : suggestions.map((s) => (
                  <tr key={`${s.estado_linea_id}-${s.auxiliar_id}`}>
                    <td>{s.banco_fecha} | {s.banco_descripcion}</td>
                    <td>#{s.pago_id} | {s.erp_fecha}</td>
                    <td>{s.tercero_nombre}</td>
                    <td className="bn-right">{money(s.banco_monto, monedaConciliacion)}</td>
                    <td className="bn-right">{money(s.erp_monto, monedaConciliacion)}</td>
                    <td className="bn-right">{money(s.diferencia_monto, monedaConciliacion)}</td>
                    <td className="bn-right">{s.diferencia_dias}</td>
                    <td className="bn-right">{s.score}</td>
                    <td>
                      <button className="bn-btn main" type="button" onClick={() => aplicarSugerencia(s)} disabled={!canEdit || busy}>
                        Aplicar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
        ) : null}
        </>
        )}
      </div>
      {modalCuentaContableOpen && (
        <ModalSeleccionCuenta
          cuentas={cuentasContablesDisponibles}
          titulo="Cuenta contable bancaria"
          onSelect={(id) => { setForm(p => ({ ...p, cuenta_contable_id: id })); setModalCuentaContableOpen(false); }}
          onClose={() => setModalCuentaContableOpen(false)}
        />
      )}
      {modalDiferenciaCuentaOpen && (
        <ModalSeleccionCuenta
          cuentas={cuentasDiferenciaDisponibles}
          titulo="Cuenta contable de diferencia"
          onSelect={(id) => { setDiferenciaCuentaId(id); setModalDiferenciaCuentaOpen(false); }}
          onClose={() => setModalDiferenciaCuentaOpen(false)}
        />
      )}
      {modalDepositoCuentaOpen && (
        <ModalSeleccionCuenta
          cuentas={cuentasMovimientoEmpresa}
          titulo="Cuenta contable de contrapartida"
          onSelect={(id) => {
            if (depositoLineaTarget != null && depositoLineas[depositoLineaTarget]) {
              actualizarLineaDeposito(depositoLineas[depositoLineaTarget].id, { cuentaId: id });
            } else if (depositoLineas[0]) {
              actualizarLineaDeposito(depositoLineas[0].id, { cuentaId: id });
            }
            setModalDepositoCuentaOpen(false);
            setDepositoLineaTarget(null);
          }}
          onClose={() => { setModalDepositoCuentaOpen(false); setDepositoLineaTarget(null); }}
        />
      )}
      {modalEgresoCuentaOpen && (
        <ModalSeleccionCuenta
          cuentas={cuentasMovimientoEmpresa}
          titulo="Cuenta contable de contrapartida"
          onSelect={(id) => {
            if (egresoLineaTarget != null && egresoLineas[egresoLineaTarget]) {
              actualizarLineaEgreso(egresoLineas[egresoLineaTarget].id, { cuentaId: id });
            } else if (egresoLineas[0]) {
              actualizarLineaEgreso(egresoLineas[0].id, { cuentaId: id });
            }
            setModalEgresoCuentaOpen(false);
            setEgresoLineaTarget(null);
          }}
          onClose={() => { setModalEgresoCuentaOpen(false); setEgresoLineaTarget(null); }}
        />
      )}
    </>
  );
}

