import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import ListToolbar from '../../components/ListToolbar';
import { logModuloEvento } from '../../utils/bitacora';

interface ParametrosEmpresaProps {
  empresaId: number;
  canEdit?: boolean;
}

interface ParametrosEmpresaState {
  fiscal: {
    fecha_inicio: string | null;
    fecha_fin: string | null;
    semana_inicia_en: number;
  };
  cierre_contable: {
    activo: boolean;
    fecha_inicio: string | null;
    fecha_fin: string | null;
  };
  impuestos: {
    impuesto_ventas: number;
    otros_impuestos: number;
    impuesto_renta: number;
    impuesto_consumo: number;
    tipo_contribuyente: 'persona_juridica' | 'persona_fisica';
    juridica_tope_logica: 'ULTIMO_TRAMO' | 'TASA_PLANA';
  };
  facturacion: {
    tipo_facturacion: string;
    impuesto_venta_incluido: boolean;
    facturar_en_negativo: boolean;
    impresion_en_linea: boolean;
    ver_saldo_inventario: boolean;
    consulta_hacienda: boolean;
    lineas_por_factura: number;
  };
  redondeo: {
    modo: string;
    descripcion: string;
  };
  varios: {
    aplica_proyectos: boolean;
    catalogo_unico_proveedores: boolean;
    planilla_por_horas: boolean;
    aplica_cobros_contabilidad: boolean;
    aplica_descuentos: boolean;
    imprimir_cheques_formularios: boolean;
    control_limite_credito: boolean;
    aplica_compras_contabilidad: boolean;
    control_cheques_postfechados: boolean;
    zona_horaria: string;
    tipo_cambio: {
      fecha: string | null;
      compra: number;
      venta: number;
      fijar: number;
    };
  };
  _meta?: {
    version?: number;
    modo?: string;
    updated_at?: string | null;
  };
}

interface HaciendaSnapshot {
  cedula: string | null;
  nombre: string | null;
  tipo_identificacion: string | null;
  situacion: string | null;
  regimen: string | null;
  updated_at: string | null;
}

interface ActividadTribEmpresa {
  actividad_tributaria_id: number;
  principal: boolean;
  actividad_tributaria?: {
    codigo: string;
    descripcion: string;
  } | null;
}

interface TramoRentaRow {
  id?: number;
  empresa_id?: number;
  anio: number;
  regimen_codigo: string;
  persona_tipo: string;
  periodicidad: string;
  tramo_orden: number;
  desde: number;
  hasta: number | null;
  tasa: number;
  credito_hijo: number;
  credito_conyuge: number;
  tope_ingreso_bruto: number | null;
  activo: boolean;
}

const timezoneOptions = [
  { value: '', label: 'Automática por navegador' },
  { value: 'America/Costa_Rica', label: 'Costa Rica' },
  { value: 'America/Guatemala', label: 'Guatemala' },
  { value: 'America/Managua', label: 'Nicaragua' },
  { value: 'America/Tegucigalpa', label: 'Honduras' },
  { value: 'America/El_Salvador', label: 'El Salvador' },
  { value: 'America/Panama', label: 'Panamá' },
  { value: 'America/Mexico_City', label: 'México' },
  { value: 'America/Bogota', label: 'Colombia' },
  { value: 'America/Lima', label: 'Perú' },
  { value: 'America/Santo_Domingo', label: 'República Dominicana' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico' },
  { value: 'UTC', label: 'UTC' },
];

const styles = `
  .pe-wrap { padding:0; }
  .pe-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; }
  .pe-title { font-size:20px; font-weight:600; color:#1f2937; }
  .pe-sub { font-size:12px; color:#6b7280; margin-top:3px; }
  .pe-msg-ok { padding:10px 12px; border:1px solid #bbf7d0; background:#dcfce7; color:#166534; border-radius:8px; font-size:12px; margin-bottom:10px; }
  .pe-msg-err { padding:10px 12px; border:1px solid #fecaca; background:#fee2e2; color:#991b1b; border-radius:8px; font-size:12px; margin-bottom:10px; }
  .pe-msg-warn { padding:10px 12px; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:8px; font-size:12px; margin-bottom:10px; }
  .pe-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .pe-span-full { grid-column:1 / -1; }
  .pe-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:14px; }
  .pe-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
  .pe-card-title { font-size:13px; font-weight:700; color:#1f2937; margin-bottom:10px; text-transform:uppercase; letter-spacing:.03em; }
  .pe-row { display:grid; grid-template-columns:1fr 120px; gap:8px; align-items:center; margin-bottom:8px; }
  .pe-row label { font-size:12px; color:#4b5563; }
  .pe-row-inline { display:flex; gap:10px; align-items:center; margin-bottom:8px; }
  .pe-input, .pe-select { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; font-size:12px; color:#1f2937; outline:none; background:#fff; }
  .pe-input:focus, .pe-select:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,.12); }
  .pe-checks { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .pe-check { display:flex; gap:6px; align-items:flex-start; font-size:12px; color:#374151; }
  .pe-check input { margin-top:2px; }
  .pe-footer { font-size:11px; color:#6b7280; margin-top:10px; }
  .pe-subtable { margin-top:8px; border:1px solid #e5e7eb; border-radius:10px; overflow-x:auto; overflow-y:hidden; }
  .pe-subtable table { width:100%; border-collapse:collapse; }
  .pe-subtable th, .pe-subtable td { border-top:1px solid #f1f5f9; padding:7px 8px; font-size:12px; }
  .pe-subtable th { background:#f8fafc; color:#64748b; text-transform:uppercase; letter-spacing:.04em; font-size:10px; text-align:left; }
  .pe-chip { display:inline-flex; align-items:center; border-radius:999px; padding:2px 8px; font-size:10px; font-weight:700; border:1px solid #86efac; color:#15803d; background:#f0fdf4; }
  .pe-tramos-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
  .pe-tramos-filters { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .pe-tramos-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .pe-mini { width:auto; min-width:130px; }
  .pe-tramos-table input[type="number"] { width:100%; border:1px solid #d1d5db; border-radius:6px; padding:6px 8px; font-size:12px; }
  .pe-tramos-table td { vertical-align:middle; }
  .pe-tramos-table table { min-width:980px; }
  .pe-num-money, .pe-num-rate, .pe-num-int { text-align:right; font-variant-numeric: tabular-nums; }
  .pe-tramos-btn { border:1px solid #d1d5db; background:#fff; color:#374151; border-radius:8px; padding:6px 10px; font-size:12px; cursor:pointer; }
  .pe-tramos-btn:hover { border-color:#22c55e; color:#166534; background:#f0fdf4; }
  .pe-mh-meta { font-size:11px; color:#64748b; margin-top:4px; text-align:right; }

  /* Override oscuro / estandar moderno */
  .pe-wrap { color:#d6e2ff; }
  .pe-title { color:#f8fbff; font-weight:700; letter-spacing:-0.03em; }
  .pe-sub { color:#8ea3c7; }
  .pe-msg-ok { background:#0f2c20; border-color:#1d6e4f; color:#9df4c7; border-radius:12px; font-weight:700; }
  .pe-msg-err { background:#34181c; border-color:#7d2f3a; color:#ffb3bb; border-radius:12px; font-weight:700; }
  .pe-msg-warn { background:#2b2111; border-color:#73561b; color:#f6d28b; border-radius:12px; }
  .pe-card { background:#172131; border-color:rgba(137,160,201,0.18); box-shadow:0 18px 30px rgba(3,8,20,.18); border-radius:16px; }
  .pe-card-title { color:#f3f7ff; font-size:13px; }
  .pe-row label, .pe-footer, .pe-mh-meta { color:#9fb0cf; }
  .pe-input, .pe-select { background:#1d2738; border-color:rgba(137,160,201,0.22); color:#f3f7ff; border-radius:12px; }
  .pe-input::placeholder, .pe-select::placeholder { color:#8ea3c7; }
  .pe-input:focus, .pe-select:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .pe-check { color:#d6e2ff; }
  .pe-subtable { border-color:rgba(137,160,201,0.18); background:#131b2a; border-radius:14px; }
  .pe-subtable th, .pe-subtable td { border-top:1px solid rgba(137,160,201,0.12); }
  .pe-subtable th { background:#101827; color:#8ea3c7; }
  .pe-subtable td { color:#d6e2ff; }
  .pe-chip { background:transparent; border-color:#1d6e4f; color:#9df4c7; }
  .pe-tramos-btn { background:#243149; border-color:rgba(76,123,247,0.34); color:#9ec3ff; border-radius:10px; font-weight:700; }
  .pe-tramos-btn:hover { background:#2c3c58; border-color:#4c7bf7; color:#ffffff; }
  .pe-tramos-table input[type="number"] { background:#1d2738; border-color:rgba(137,160,201,0.22); color:#f3f7ff; border-radius:10px; }
  .pe-head .pe-select { width:auto; min-width:120px; background:#243149; border-color:rgba(76,123,247,0.34); color:#d6e2ff; font-weight:700; }
  .pe-head .pe-select:hover { background:#2c3c58; }
  .pe-head .pe-select:disabled { opacity:0.6; }

  @media (max-width: 900px) {
    .pe-grid { grid-template-columns:1fr; }
    .pe-row { grid-template-columns:1fr; }
  }
`;

const emptyState: ParametrosEmpresaState = {
  fiscal: { fecha_inicio: null, fecha_fin: null, semana_inicia_en: 1 },
  cierre_contable: { activo: false, fecha_inicio: null, fecha_fin: null },
  impuestos: {
    impuesto_ventas: 13,
    otros_impuestos: 0,
    impuesto_renta: 30,
    impuesto_consumo: 0,
    tipo_contribuyente: 'persona_juridica',
    juridica_tope_logica: 'TASA_PLANA',
  },
  facturacion: {
    tipo_facturacion: 'inventario',
    impuesto_venta_incluido: true,
    facturar_en_negativo: false,
    impresion_en_linea: false,
    ver_saldo_inventario: false,
    consulta_hacienda: false,
    lineas_por_factura: 0,
  },
  redondeo: { modo: '0.05', descripcion: 'A 5 centimos' },
  varios: {
    aplica_proyectos: false,
    catalogo_unico_proveedores: false,
    planilla_por_horas: false,
    aplica_cobros_contabilidad: false,
    aplica_descuentos: false,
    imprimir_cheques_formularios: false,
    control_limite_credito: false,
    aplica_compras_contabilidad: false,
    control_cheques_postfechados: false,
    zona_horaria: '',
    tipo_cambio: { fecha: null, compra: 0, venta: 0, fijar: 0 },
  },
  _meta: { version: 0, modo: 'default', updated_at: null },
};

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyCRC(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `₡ ${Number(value).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} %`;
}

function tipoIdentidadLabel(code: string | null | undefined): string {
  const c = String(code || '').trim();
  if (c === '01') return '01 - Persona fisica';
  if (c === '02') return '02 - Persona juridica';
  if (c === '03') return '03 - DIMEX';
  if (c === '04') return '04 - NITE';
  return c || '-';
}

function normalizeState(value: any): ParametrosEmpresaState {
  const merged: ParametrosEmpresaState = {
    ...emptyState,
    ...(value || {}),
    fiscal: { ...emptyState.fiscal, ...(value?.fiscal || {}) },
    cierre_contable: { ...emptyState.cierre_contable, ...(value?.cierre_contable || {}) },
    impuestos: { ...emptyState.impuestos, ...(value?.impuestos || {}) },
    facturacion: { ...emptyState.facturacion, ...(value?.facturacion || {}) },
    redondeo: { ...emptyState.redondeo, ...(value?.redondeo || {}) },
    varios: {
      ...emptyState.varios,
      ...(value?.varios || {}),
      tipo_cambio: { ...emptyState.varios.tipo_cambio, ...(value?.varios?.tipo_cambio || {}) },
    },
    _meta: { ...emptyState._meta, ...(value?._meta || {}) },
  };
  if (merged.impuestos.tipo_contribuyente !== 'persona_fisica') {
    merged.impuestos.tipo_contribuyente = 'persona_juridica';
  }
  if (merged.impuestos.juridica_tope_logica !== 'ULTIMO_TRAMO') {
    merged.impuestos.juridica_tope_logica = 'TASA_PLANA';
  }
  return merged;
}

export default function ParametrosEmpresa({ empresaId, canEdit = false }: ParametrosEmpresaProps) {
  const [data, setData] = useState<ParametrosEmpresaState>(emptyState);
  const [draft, setDraft] = useState<ParametrosEmpresaState>(emptyState);
  const [loading, setLoading] = useState(false);
  const [syncMhBusy, setSyncMhBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [mhSnapshot, setMhSnapshot] = useState<HaciendaSnapshot | null>(null);
  const [mhActividades, setMhActividades] = useState<ActividadTribEmpresa[]>([]);
  const [tramosYear, setTramosYear] = useState<number>(new Date().getFullYear());
  const [tramosRegimen, setTramosRegimen] = useState<string>('PERSONA_JURIDICA_PYME');
  const [tramosLoading, setTramosLoading] = useState(false);
  const [tramosOficial, setTramosOficial] = useState<TramoRentaRow[]>([]);
  const [tramosEmpresa, setTramosEmpresa] = useState<TramoRentaRow[]>([]);
  // ── Identidad visual (logo / nombre planta) ─────────────────────────────
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoUrl,      setLogoUrl]      = useState('');
  const [nombrePlanta, setNombrePlanta] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoOk,       setLogoOk]       = useState('');
  const [logoErr,      setLogoErr]      = useState('');

  useEffect(() => {
    supabase.from('fe_config_empresa')
      .select('logo_url, nombre_planta')
      .eq('empresa_id', empresaId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.logo_url)     setLogoUrl(data.logo_url);
        if (data?.nombre_planta) setNombrePlanta(data.nombre_planta);
      });
  }, [empresaId]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setLogoErr('El archivo debe ser una imagen.'); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoErr('El logo no debe superar 2 MB.'); return; }
    setLogoUploading(true); setLogoErr('');
    const ext  = file.name.split('.').pop() || 'png';
    const path = `empresa_${empresaId}/logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('logos').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setLogoErr('Error al subir: ' + upErr.message); setLogoUploading(false); return; }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path);
    setLogoUrl(urlData.publicUrl + '?t=' + Date.now());
    setLogoUploading(false);
    if (logoFileRef.current) logoFileRef.current.value = '';
  }

  async function saveLogoConfig() {
    setLogoErr(''); setLogoOk('');
    const { error: e } = await supabase.from('fe_config_empresa')
      .upsert({ empresa_id: empresaId, logo_url: logoUrl || null, nombre_planta: nombrePlanta || null },
              { onConflict: 'empresa_id' });
    if (e) { setLogoErr(e.message); return; }
    setLogoOk('Guardado.');
    setTimeout(() => setLogoOk(''), 2500);
    window.dispatchEvent(new CustomEvent('empresa-config-updated'));
  }

  const cierreActivo = Boolean(draft.cierre_contable.activo);
  const cierreConRango =
    Boolean(draft.cierre_contable.fecha_inicio)
    && Boolean(draft.cierre_contable.fecha_fin);

  const showOk = (msg: string) => {
    setOk(msg);
    setTimeout(() => setOk(''), 2400);
  };

  const showErr = (msg: string) => {
    setErr(msg);
    setTimeout(() => setErr(''), 3400);
  };

  const defaultRegimenByTipo = (tipo: ParametrosEmpresaState['impuestos']['tipo_contribuyente']) =>
    tipo === 'persona_fisica' ? 'PERSONA_FISICA_LUCRATIVA' : 'PERSONA_JURIDICA_PYME';

  const normalizeTramo = (r: any): TramoRentaRow => ({
    id: r?.id ? Number(r.id) : undefined,
    empresa_id: r?.empresa_id ? Number(r.empresa_id) : undefined,
    anio: Number(r?.anio || tramosYear),
    regimen_codigo: String(r?.regimen_codigo || tramosRegimen),
    persona_tipo: String(r?.persona_tipo || (draft.impuestos.tipo_contribuyente || 'persona_juridica')),
    periodicidad: String(r?.periodicidad || 'anual'),
    tramo_orden: Number(r?.tramo_orden || 1),
    desde: Number(r?.desde || 0),
    hasta: r?.hasta === null || r?.hasta === undefined || r?.hasta === '' ? null : Number(r.hasta),
    tasa: Number(r?.tasa || 0),
    credito_hijo: Number(r?.credito_hijo || 0),
    credito_conyuge: Number(r?.credito_conyuge || 0),
    tope_ingreso_bruto: r?.tope_ingreso_bruto === null || r?.tope_ingreso_bruto === undefined || r?.tope_ingreso_bruto === '' ? null : Number(r.tope_ingreso_bruto),
    activo: r?.activo !== false,
  });

  const loadTramos = async (anioArg?: number, regimenArg?: string) => {
    const anio = Number(anioArg || tramosYear || new Date().getFullYear());
    const regimen = String(regimenArg || tramosRegimen || '').trim();
    if (!regimen) return;
    setTramosLoading(true);
    const [oficialRes, empresaRes] = await Promise.all([
      supabase
        .from('vw_impuesto_renta_tramos_oficiales')
        .select('*')
        .eq('anio', anio)
        .eq('regimen_codigo', regimen)
        .order('tramo_orden', { ascending: true }),
      supabase
        .from('vw_empresa_impuesto_renta_tramos')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('anio', anio)
        .eq('regimen_codigo', regimen)
        .order('tramo_orden', { ascending: true }),
    ]);
    setTramosLoading(false);
    if (oficialRes.error) {
      showErr(oficialRes.error.message);
      return;
    }
    if (empresaRes.error) {
      showErr(empresaRes.error.message);
      return;
    }
    const ofi = (oficialRes.data || []).map(normalizeTramo);
    const emp = (empresaRes.data || []).map(normalizeTramo);
    setTramosOficial(ofi);
    setTramosEmpresa(
      emp.length > 0
        ? emp
        : ofi.map((r) => ({
            ...r,
            id: undefined,
            empresa_id: empresaId,
          }))
    );
  };

  const load = async () => {
    setLoading(true);
    setErr('');
    const { data: rpcData, error } = await supabase.rpc('get_empresa_parametros', { p_empresa_id: empresaId });
    setLoading(false);
    if (error) {
      showErr(error.message);
      return;
    }
    const parsed = normalizeState(rpcData || emptyState);
    setData(parsed);
    setDraft(parsed);
    setTramosRegimen(defaultRegimenByTipo(parsed.impuestos.tipo_contribuyente));

    const [{ data: snapData }, { data: actData }] = await Promise.all([
      supabase
        .from('empresa_hacienda_snapshot')
        .select('cedula,nombre,tipo_identificacion,situacion,regimen,updated_at')
        .eq('empresa_id', empresaId)
        .maybeSingle(),
      supabase
        .from('empresa_actividad_tributaria')
        .select('actividad_tributaria_id,principal,actividad_tributaria(codigo,descripcion)')
        .eq('empresa_id', empresaId)
        .order('principal', { ascending: false }),
    ]);
    setMhSnapshot((snapData as HaciendaSnapshot) || null);
    const normalizedActs = ((actData || []) as any[]).map((r) => {
      const rel = Array.isArray(r.actividad_tributaria) ? r.actividad_tributaria[0] : r.actividad_tributaria;
      return {
        ...r,
        actividad_tributaria: rel || null,
      } as ActividadTribEmpresa;
    });
    setMhActividades(normalizedActs as ActividadTribEmpresa[]);
  };

  useEffect(() => {
    setEditing(false);
    setOk('');
    setErr('');
    load();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadTramos();
  }, [empresaId, tramosYear, tramosRegimen]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!canEdit) return;
    if (draft.cierre_contable.activo) {
      if (!draft.cierre_contable.fecha_inicio || !draft.cierre_contable.fecha_fin) {
        showErr('Si activa el bloqueo, debe definir Inicio/Final de cierre contable.');
        return;
      }
      if (draft.cierre_contable.fecha_inicio > draft.cierre_contable.fecha_fin) {
        showErr('Rango de cierre invalido: Inicio cierre no puede ser mayor que Final cierre.');
        return;
      }
    }
    setLoading(true);
    setErr('');
    const payload = {
      fiscal: draft.fiscal,
      cierre_contable: draft.cierre_contable,
      impuestos: draft.impuestos,
      facturacion: draft.facturacion,
      redondeo: draft.redondeo,
      varios: draft.varios,
    };
    const { data: rpcData, error } = await supabase.rpc('set_empresa_parametros', {
      p_empresa_id: empresaId,
      p_payload: payload,
    });
    setLoading(false);
    if (error) {
      showErr(error.message);
      return;
    }
    const parsed = normalizeState(rpcData || emptyState);
    setData(parsed);
    setDraft(parsed);
    setEditing(false);
    void logModuloEvento({
      empresaId,
      modulo: 'mantenimientos',
      accion: 'guardar_parametros_empresa',
      entidad: 'empresa_parametros',
      entidadId: String(empresaId),
      descripcion: 'Actualizacion manual de parametros de empresa',
      detalle: { version: parsed._meta?.version || null },
    });
    showOk('Parametros guardados correctamente');
  };

  const syncContribuyenteMh = async () => {
    if (!canEdit || syncMhBusy || loading) return;
    setSyncMhBusy(true);
    setErr('');
    try {
      const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
      if (!anonKey) throw new Error('Falta REACT_APP_SUPABASE_ANON_KEY en el frontend.');
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Sesion expirada. Ingrese de nuevo.');
      const { data: refreshed } = await supabase.auth.refreshSession();
      const jwt = refreshed.session?.access_token || sessionData.session.access_token;
      if (!jwt) throw new Error('No se pudo obtener token de sesion valido.');

      const { data: emp, error: empErr } = await supabase
        .from('empresas')
        .select('cedula')
        .eq('id', empresaId)
        .maybeSingle();
      if (empErr) throw empErr;
      const cedula = String((emp as any)?.cedula || '').trim();
      if (!cedula) throw new Error('La empresa no tiene cedula registrada.');

      let payload: any = null;
      const { data: invokeData, error: fnError } = await supabase.functions.invoke('mh-contribuyente', {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: { cedula },
      });
      payload = invokeData;
      if (fnError) {
        let detail = fnError.message || 'No se pudo invocar mh-contribuyente.';
        const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
        let fallbackError = '';
        try {
          const ctx = (fnError as any)?.context;
          if (ctx) {
            const errPayload = await ctx.json();
            detail = String(errPayload?.detail || errPayload?.error || detail);
          }
        } catch {
          // Sin detalle adicional del SDK
        }

        // Fallback de diagnostico/ejecucion: request directo al endpoint de Function.
        try {
          if (supabaseUrl) {
            const dbgResp = await fetch(`${supabaseUrl}/functions/v1/mh-contribuyente`, {
              method: 'POST',
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${jwt}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ cedula }),
            });
            const dbgText = await dbgResp.text();
            let dbgJson: any = null;
            try {
              dbgJson = dbgText ? JSON.parse(dbgText) : null;
            } catch {
              dbgJson = null;
            }
            if (dbgResp.ok && dbgJson?.ok) {
              payload = dbgJson;
            } else {
              detail = `HTTP ${dbgResp.status}: ${dbgJson?.detail || dbgJson?.error || dbgText || detail}`;
            }
          }
        } catch (fe: any) {
          fallbackError = String(fe?.message || fe || '');
        }

        if (!payload?.ok) {
          const fnMsg = String(fnError?.message || '');
          const targetUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/mh-contribuyente` : '(sin REACT_APP_SUPABASE_URL)';
          throw new Error(`Invoke: ${fnMsg || detail}. Endpoint: ${targetUrl}. ${fallbackError ? `Fallback: ${fallbackError}. ` : ''}Detalle: ${detail}`);
        }
      }
      if (!payload?.ok) throw new Error(payload?.detail || payload?.error || 'No se pudo consultar API de Hacienda.');

      const { data: syncData, error: syncError } = await supabase.rpc('sync_empresa_hacienda', {
        p_empresa_id: empresaId,
        p_payload: payload,
      });
      if (syncError) throw syncError;

      await load();
      void logModuloEvento({
        empresaId,
        modulo: 'mantenimientos',
        accion: 'sync_mh_empresa',
        entidad: 'empresa_hacienda_snapshot',
        entidadId: String(empresaId),
        descripcion: 'Sincronizacion de datos de contribuyente con MH',
        detalle: {
          cedula: String(payload?.cedula || cedula || ''),
          actividades_count: Number((syncData as any)?.actividades_count || 0),
        },
      });
      showOk(`Datos MH sincronizados. Actividades: ${Number((syncData as any)?.actividades_count || 0)}.`);
    } catch (e: any) {
      const raw = String(e?.message || '');
      if (/failed to send a request to the edge function|failed to fetch/i.test(raw.toLowerCase())) {
        showErr('No se pudo conectar con la Edge Function mh-contribuyente. Verifique deploy, URL de Supabase y conectividad.');
      } else {
        showErr(raw || 'No se pudo sincronizar datos con MH.');
      }
    } finally {
      setSyncMhBusy(false);
    }
  };

  const resetDefaults = async () => {
    if (!canEdit) return;
    if (!window.confirm('Restaurar parametros por defecto para esta empresa?')) return;
    setLoading(true);
    const { data: rpcData, error } = await supabase.rpc('reset_empresa_parametros', { p_empresa_id: empresaId });
    setLoading(false);
    if (error) {
      showErr(error.message);
      return;
    }
    const parsed = normalizeState(rpcData || emptyState);
    setData(parsed);
    setDraft(parsed);
    setEditing(false);
    void logModuloEvento({
      empresaId,
      modulo: 'mantenimientos',
      accion: 'reset_parametros_empresa',
      entidad: 'empresa_parametros',
      entidadId: String(empresaId),
      descripcion: 'Restablecimiento de parametros de empresa a valores por defecto',
      detalle: { version: parsed._meta?.version || null },
    });
    showOk('Parametros restablecidos a valores por defecto');
  };

  const copyTramosFromOficial = () => {
    if (tramosOficial.length === 0) return;
    setTramosEmpresa(
      tramosOficial.map((r) => ({
        ...r,
        id: undefined,
        empresa_id: empresaId,
      }))
    );
    showOk('Tramos oficiales copiados a override de empresa.');
  };

  const saveTramosEmpresa = async () => {
    if (!canEdit) return;
    setTramosLoading(true);
    const anio = Number(tramosYear);
    const regimen = String(tramosRegimen || '').trim();
    try {
      const { error: delErr } = await supabase
        .from('empresa_impuesto_renta_tramo')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('anio', anio)
        .eq('regimen_codigo', regimen);
      if (delErr) throw delErr;

      const payload = tramosEmpresa
        .slice()
        .sort((a, b) => Number(a.tramo_orden) - Number(b.tramo_orden))
        .map((r) => ({
          empresa_id: empresaId,
          anio,
          regimen_codigo: regimen,
          persona_tipo: r.persona_tipo || draft.impuestos.tipo_contribuyente,
          periodicidad: r.periodicidad || 'anual',
          tramo_orden: Number(r.tramo_orden || 1),
          desde: Number(r.desde || 0),
          hasta: r.hasta === null || r.hasta === undefined ? null : Number(r.hasta),
          tasa: Number(r.tasa || 0),
          credito_hijo: Number(r.credito_hijo || 0),
          credito_conyuge: Number(r.credito_conyuge || 0),
          tope_ingreso_bruto: r.tope_ingreso_bruto === null || r.tope_ingreso_bruto === undefined ? null : Number(r.tope_ingreso_bruto),
          activo: r.activo !== false,
        }));
      if (payload.length > 0) {
        const { error: insErr } = await supabase.from('empresa_impuesto_renta_tramo').insert(payload);
        if (insErr) throw insErr;
      }
      await loadTramos(anio, regimen);
      void logModuloEvento({
        empresaId,
        modulo: 'mantenimientos',
        accion: 'guardar_tramos_renta_empresa',
        entidad: 'empresa_impuesto_renta_tramo',
        entidadId: `${empresaId}:${anio}:${regimen}`,
        descripcion: 'Guardado de override de tramos de renta por empresa',
        detalle: { anio, regimen_codigo: regimen, rows: payload.length },
      });
      showOk('Tramos de renta por empresa guardados.');
    } catch (e: any) {
      showErr(String(e?.message || 'No se pudo guardar tramos de renta por empresa.'));
    } finally {
      setTramosLoading(false);
    }
  };

  const addTramoRow = () => {
    setTramosEmpresa((prev) => {
      const nextOrden = prev.length > 0 ? Math.max(...prev.map((x) => Number(x.tramo_orden || 0))) + 1 : 1;
      return [
        ...prev,
        {
          anio: tramosYear,
          regimen_codigo: tramosRegimen,
          persona_tipo: draft.impuestos.tipo_contribuyente,
          periodicidad: 'anual',
          tramo_orden: nextOrden,
          desde: 0,
          hasta: null,
          tasa: 0,
          credito_hijo: 0,
          credito_conyuge: 0,
          tope_ingreso_bruto: null,
          activo: true,
        },
      ];
    });
  };

  const removeTramoRow = (idx: number) => {
    setTramosEmpresa((prev) => prev.filter((_, i) => i !== idx));
  };

  const setTramoField = (idx: number, key: keyof TramoRentaRow, value: any) => {
    setTramosEmpresa((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r))
    );
  };

  const readonly = !editing || !canEdit || loading;
  const tramosReadonly = !editing || !canEdit;
  const mhLastSyncLabel = mhSnapshot?.updated_at
    ? new Date(mhSnapshot.updated_at).toLocaleString('es-CR')
    : 'Sin validar';

  return (
    <>
      <style>{styles}</style>
      <div className="pe-wrap">
        <div className="pe-head">
          <div>
            <div className="pe-title">Par?metros Empresa</div>
            <div className="pe-sub">
              Configuraci?n global por empresa para impuestos, facturaci?n, redondeo y reglas operativas.
            </div>
          </div>
          <ListToolbar
            actions={(
              <>
                {!editing && canEdit && <button className="pe-select" style={{ width: 'auto' }} onClick={() => setEditing(true)}>Editar</button>}
                {editing && (
                  <>
                    <button className="pe-select" style={{ width: 'auto' }} onClick={save} disabled={loading}>Guardar</button>
                    <button
                      className="pe-select"
                      style={{ width: 'auto' }}
                      onClick={() => { setDraft(data); setEditing(false); }}
                      disabled={loading}
                    >
                      Cancelar
                    </button>
                  </>
                )}
                {canEdit && (
                  <button className="pe-select" style={{ width: 'auto' }} onClick={resetDefaults} disabled={loading}>
                    Reset
                  </button>
                )}
              </>
            )}
          />
        </div>

        {ok && <div className="pe-msg-ok">{ok}</div>}
        {err && <div className="pe-msg-err">{err}</div>}
        {!cierreActivo && (
          <div className="pe-msg-warn">
            Cierre contable desactivado: se permiten asientos en fechas abiertas.
          </div>
        )}
        {cierreActivo && !cierreConRango && (
          <div className="pe-msg-warn">
            Advertencia: active el rango de cierre (inicio/fin) para aplicar bloqueo de fechas cerradas.
          </div>
        )}

        <div className="pe-grid">
          <section className="pe-card">
            <div className="pe-card-title">Periodo Fiscal</div>
            <div className="pe-row">
              <label>Inicio</label>
              <input
                className="pe-input"
                type="date"
                value={draft.fiscal.fecha_inicio || ''}
                disabled={readonly}
                onChange={(e) => setDraft((p) => ({ ...p, fiscal: { ...p.fiscal, fecha_inicio: e.target.value || null } }))}
              />
            </div>
            <div className="pe-row">
              <label>Final</label>
              <input
                className="pe-input"
                type="date"
                value={draft.fiscal.fecha_fin || ''}
                disabled={readonly}
                onChange={(e) => setDraft((p) => ({ ...p, fiscal: { ...p.fiscal, fecha_fin: e.target.value || null } }))}
              />
            </div>
            <div className="pe-row">
              <label>Semana inicia en</label>
              <select
                className="pe-select"
                value={draft.fiscal.semana_inicia_en}
                disabled={readonly}
                onChange={(e) => setDraft((p) => ({ ...p, fiscal: { ...p.fiscal, semana_inicia_en: Number(e.target.value) } }))}
              >
                <option value={1}>Lunes</option>
                <option value={2}>Martes</option>
                <option value={3}>Miercoles</option>
                <option value={4}>Jueves</option>
                <option value={5}>Viernes</option>
                <option value={6}>Sabado</option>
                <option value={0}>Domingo</option>
              </select>
            </div>
          </section>

          <section className="pe-card">
            <div className="pe-card-title">Cierre Contable</div>
            <label className="pe-check" style={{ marginBottom: '10px' }}>
              <input
                type="checkbox"
                checked={draft.cierre_contable.activo}
                disabled={readonly}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    cierre_contable: { ...p.cierre_contable, activo: e.target.checked },
                  }))
                }
              />
              Activar control de periodo contable
            </label>
            <div className="pe-row">
              <label>Inicio cierre</label>
              <input
                className="pe-input"
                type="date"
                value={draft.cierre_contable.fecha_inicio || ''}
                disabled={readonly}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    cierre_contable: { ...p.cierre_contable, fecha_inicio: e.target.value || null },
                  }))
                }
              />
            </div>
            <div className="pe-row">
              <label>Final cierre</label>
              <input
                className="pe-input"
                type="date"
                value={draft.cierre_contable.fecha_fin || ''}
                disabled={readonly}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    cierre_contable: { ...p.cierre_contable, fecha_fin: e.target.value || null },
                  }))
                }
              />
            </div>
            <div className="pe-footer" style={{ marginTop: 6 }}>
              Con el control activo, solo se permiten asientos dentro de este rango.
            </div>
          </section>

          <section className="pe-card pe-span-full">
            <div className="pe-card-title">Tramos de Renta por Empresa</div>
            <div className="pe-tramos-head">
              <div className="pe-tramos-filters">
                <input
                  className="pe-input pe-mini"
                  type="number"
                  min={2020}
                  max={2100}
                  value={tramosYear}
                  onChange={(e) => setTramosYear(Number(e.target.value || new Date().getFullYear()))}
                />
                <select
                  className="pe-select pe-mini"
                  value={tramosRegimen}
                  onChange={(e) => setTramosRegimen(e.target.value)}
                >
                  <option value="PERSONA_JURIDICA_PYME">Persona Juridica PYME</option>
                  <option value="PERSONA_FISICA_LUCRATIVA">Persona Fisica Lucrativa</option>
                  <option value="ASALARIADO_JUBILADO">Asalariado/Jubilado</option>
                </select>
                <button className="pe-tramos-btn" type="button" onClick={() => loadTramos()} disabled={tramosLoading}>
                  {tramosLoading ? 'Cargando...' : 'Recargar'}
                </button>
              </div>
              <div className="pe-tramos-actions">
                <button className="pe-tramos-btn" type="button" onClick={copyTramosFromOficial} disabled={!canEdit || tramosLoading || tramosOficial.length === 0}>Copiar oficiales</button>
                <button className="pe-tramos-btn" type="button" onClick={addTramoRow} disabled={!canEdit || tramosLoading}>Agregar tramo</button>
                <button className="pe-tramos-btn" type="button" onClick={saveTramosEmpresa} disabled={!canEdit || tramosLoading}>Guardar tramos</button>
              </div>
            </div>
            <div className="pe-subtable pe-tramos-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 54 }}>Ord</th>
                    <th>Desde (CRC)</th>
                    <th>Hasta (CRC)</th>
                    <th style={{ width: 110 }}>Tasa (%)</th>
                    <th>Credito hijo (CRC)</th>
                    <th>Credito conyuge (CRC)</th>
                    <th>Tope ingreso (CRC)</th>
                    <th style={{ width: 70 }}>Activo</th>
                    <th style={{ width: 62 }}>Quitar</th>
                  </tr>
                </thead>
                <tbody>
                  {tramosEmpresa.length === 0 ? (
                    <tr><td colSpan={9} style={{ color: '#64748b' }}>Sin tramos para este ano/regimen.</td></tr>
                  ) : tramosEmpresa.map((r, idx) => (
                    <tr key={`${idx}-${r.tramo_orden}`}>
                      <td>
                        {tramosReadonly ? (
                          <div className="pe-num-int">{r.tramo_orden}</div>
                        ) : (
                          <input className="pe-num-int" type="number" step="1" value={r.tramo_orden} onChange={(e) => setTramoField(idx, 'tramo_orden', Number(e.target.value || 1))} />
                        )}
                      </td>
                      <td>
                        {tramosReadonly ? (
                          <div className="pe-num-money">{formatMoneyCRC(r.desde)}</div>
                        ) : (
                          <input className="pe-num-money" type="number" step="0.01" value={r.desde} onChange={(e) => setTramoField(idx, 'desde', Number(e.target.value || 0))} />
                        )}
                      </td>
                      <td>
                        {tramosReadonly ? (
                          <div className="pe-num-money">{formatMoneyCRC(r.hasta)}</div>
                        ) : (
                          <input className="pe-num-money" type="number" step="0.01" value={r.hasta ?? ''} onChange={(e) => setTramoField(idx, 'hasta', e.target.value === '' ? null : Number(e.target.value))} />
                        )}
                      </td>
                      <td>
                        {tramosReadonly ? (
                          <div className="pe-num-rate">{formatPercent(r.tasa)}</div>
                        ) : (
                          <input className="pe-num-rate" type="number" step="0.0001" value={r.tasa} onChange={(e) => setTramoField(idx, 'tasa', Number(e.target.value || 0))} />
                        )}
                      </td>
                      <td>
                        {tramosReadonly ? (
                          <div className="pe-num-money">{formatMoneyCRC(r.credito_hijo)}</div>
                        ) : (
                          <input className="pe-num-money" type="number" step="0.01" value={r.credito_hijo} onChange={(e) => setTramoField(idx, 'credito_hijo', Number(e.target.value || 0))} />
                        )}
                      </td>
                      <td>
                        {tramosReadonly ? (
                          <div className="pe-num-money">{formatMoneyCRC(r.credito_conyuge)}</div>
                        ) : (
                          <input className="pe-num-money" type="number" step="0.01" value={r.credito_conyuge} onChange={(e) => setTramoField(idx, 'credito_conyuge', Number(e.target.value || 0))} />
                        )}
                      </td>
                      <td>
                        {tramosReadonly ? (
                          <div className="pe-num-money">{formatMoneyCRC(r.tope_ingreso_bruto)}</div>
                        ) : (
                          <input className="pe-num-money" type="number" step="0.01" value={r.tope_ingreso_bruto ?? ''} onChange={(e) => setTramoField(idx, 'tope_ingreso_bruto', e.target.value === '' ? null : Number(e.target.value))} />
                        )}
                      </td>
                      <td>
                        {tramosReadonly ? (
                          <span className="pe-chip" style={{ borderColor: r.activo ? '#86efac' : '#e5e7eb', color: r.activo ? '#15803d' : '#64748b', background: r.activo ? '#f0fdf4' : '#f8fafc' }}>
                            {r.activo ? 'Si' : 'No'}
                          </span>
                        ) : (
                          <input type="checkbox" checked={r.activo} onChange={(e) => setTramoField(idx, 'activo', e.target.checked)} />
                        )}
                      </td>
                      <td>
                        <button className="pe-tramos-btn" type="button" onClick={() => removeTramoRow(idx)} disabled={tramosReadonly}>X</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pe-footer">
              Si no hay override de empresa, el sistema usa tramos oficiales MH del ano seleccionado.
            </div>
          </section>

          <section className="pe-card">
            <div className="pe-card-head">
              <div className="pe-card-title" style={{ marginBottom: 0 }}>Impuestos (%)</div>
              <div>
                <button
                  className="pe-select"
                  style={{ width: 'auto' }}
                  onClick={syncContribuyenteMh}
                  disabled={!canEdit || syncMhBusy || loading}
                  type="button"
                  title="Consulta API de Hacienda y actualiza contribuyente + actividades tributarias"
                >
                  {syncMhBusy ? 'Consultando MH...' : 'Consultar MH'}
                </button>
                <div className="pe-mh-meta">Ultima validacion MH: {mhLastSyncLabel}</div>
              </div>
            </div>
            <div className="pe-row">
              <label>Tipo de contribuyente</label>
              <select
                className="pe-select"
                value={draft.impuestos.tipo_contribuyente}
                disabled={readonly}
                onChange={(e) => setDraft((p) => ({
                  ...p,
                  impuestos: {
                    ...p.impuestos,
                    tipo_contribuyente: (e.target.value === 'persona_fisica' ? 'persona_fisica' : 'persona_juridica'),
                  },
                }))}
              >
                <option value="persona_juridica">Persona juridica</option>
                <option value="persona_fisica">Persona fisica</option>
              </select>
            </div>
            <div className="pe-row"><label>Impuesto de Ventas</label><input className="pe-input" type="number" step="0.01" value={draft.impuestos.impuesto_ventas} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, impuestos: { ...p.impuestos, impuesto_ventas: toNumber(e.target.value) } }))} /></div>
            <div className="pe-row"><label>Otros Impuestos</label><input className="pe-input" type="number" step="0.01" value={draft.impuestos.otros_impuestos} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, impuestos: { ...p.impuestos, otros_impuestos: toNumber(e.target.value) } }))} /></div>
            <div className="pe-row"><label>Impuesto de Renta</label><input className="pe-input" type="number" step="0.01" value={draft.impuestos.impuesto_renta} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, impuestos: { ...p.impuestos, impuesto_renta: toNumber(e.target.value) } }))} /></div>
            <div className="pe-row"><label>Impuesto de Consumo</label><input className="pe-input" type="number" step="0.01" value={draft.impuestos.impuesto_consumo} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, impuestos: { ...p.impuestos, impuesto_consumo: toNumber(e.target.value) } }))} /></div>
            <div className="pe-row">
              <label>Juridica: logica al superar tope</label>
              <select
                className="pe-select"
                value={draft.impuestos.juridica_tope_logica}
                disabled={readonly || draft.impuestos.tipo_contribuyente !== 'persona_juridica'}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    impuestos: {
                      ...p.impuestos,
                      juridica_tope_logica: e.target.value === 'TASA_PLANA' ? 'TASA_PLANA' : 'ULTIMO_TRAMO',
                    },
                  }))
                }
              >
                <option value="ULTIMO_TRAMO">Usar tasa del ultimo tramo</option>
                <option value="TASA_PLANA">Usar tasa plana</option>
              </select>
            </div>
            <div className="pe-footer">
              Nota: para persona juridica, si ingreso bruto anual supera el tope, puede elegir entre tasa del ultimo tramo o tasa plana.
            </div>
            <div className="pe-footer" style={{ marginTop: 8 }}>
              Fuente MH sincronizada para contribuyente y actividades tributarias.
            </div>
            {mhSnapshot ? (
              <div className="pe-subtable">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '20%' }}>Cedula</th>
                      <th>Nombre</th>
                      <th style={{ width: '20%' }}>Tipo Identidad</th>
                      <th style={{ width: '14%' }}>Situacion</th>
                      <th style={{ width: '16%' }}>Regimen</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{mhSnapshot.cedula || '-'}</td>
                      <td>{mhSnapshot.nombre || '-'}</td>
                      <td>{tipoIdentidadLabel(mhSnapshot.tipo_identificacion)}</td>
                      <td>{mhSnapshot.situacion || '-'}</td>
                      <td>{mhSnapshot.regimen || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="pe-subtable" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '26%' }}>Codigo</th>
                    <th>Actividad tributaria</th>
                    <th style={{ width: '18%' }}>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {mhActividades.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ color: '#64748b' }}>Sin actividades tributarias sincronizadas.</td>
                    </tr>
                  ) : mhActividades.map((a) => (
                    <tr key={a.actividad_tributaria_id}>
                      <td>{a.actividad_tributaria?.codigo || '-'}</td>
                      <td>{a.actividad_tributaria?.descripcion || '-'}</td>
                      <td>{a.principal ? <span className="pe-chip">Principal</span> : 'Secundaria'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pe-card">
            <div className="pe-card-title">Facturacion</div>
            <div className="pe-row">
              <label>Tipo de Facturacion</label>
              <select
                className="pe-select"
                value={draft.facturacion.tipo_facturacion}
                disabled={readonly}
                onChange={(e) => setDraft((p) => ({ ...p, facturacion: { ...p.facturacion, tipo_facturacion: e.target.value } }))}
              >
                <option value="inventario">Inventario</option>
                <option value="puntoventas">Punto Ventas</option>
                <option value="servicios">Servicios</option>
                <option value="todas">Todas</option>
                <option value="ninguna">Ninguna</option>
              </select>
            </div>
            <div className="pe-row">
              <label>Lineas por Factura</label>
              <input className="pe-input" type="number" value={draft.facturacion.lineas_por_factura} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, facturacion: { ...p.facturacion, lineas_por_factura: toNumber(e.target.value) } }))} />
            </div>
            <div className="pe-checks">
              <label className="pe-check"><input type="checkbox" checked={draft.facturacion.impuesto_venta_incluido} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, facturacion: { ...p.facturacion, impuesto_venta_incluido: e.target.checked } }))} />Impuesto de Venta Incluido</label>
              <label className="pe-check"><input type="checkbox" checked={draft.facturacion.facturar_en_negativo} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, facturacion: { ...p.facturacion, facturar_en_negativo: e.target.checked } }))} />Facturar en Negativo</label>
              <label className="pe-check"><input type="checkbox" checked={draft.facturacion.impresion_en_linea} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, facturacion: { ...p.facturacion, impresion_en_linea: e.target.checked } }))} />Impresion en Linea</label>
              <label className="pe-check"><input type="checkbox" checked={draft.facturacion.ver_saldo_inventario} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, facturacion: { ...p.facturacion, ver_saldo_inventario: e.target.checked } }))} />Ver Saldo Inventario</label>
              <label className="pe-check"><input type="checkbox" checked={draft.facturacion.consulta_hacienda} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, facturacion: { ...p.facturacion, consulta_hacienda: e.target.checked } }))} />Consulta Automatica Hacienda</label>
            </div>
          </section>

          <section className="pe-card">
            <div className="pe-card-title">Redondeo y Varios</div>
            <div className="pe-row">
              <label>Redondeo</label>
              <select className="pe-select" value={draft.redondeo.modo} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, redondeo: { ...p.redondeo, modo: e.target.value } }))}>
                <option value="0.00">Sin redondeo</option>
                <option value="0.05">A 5 centimos</option>
                <option value="0.50">A 50 centimos</option>
                <option value="1.00">A colon completo</option>
                <option value="5.00">A 5 colones</option>
                <option value="50.00">A 50 colones</option>
              </select>
            </div>
            <div className="pe-row">
              <label>Zona horaria de la empresa</label>
              <select
                className="pe-select"
                value={draft.varios.zona_horaria}
                disabled={readonly}
                onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, zona_horaria: e.target.value } }))}
              >
                {timezoneOptions.map((option) => (
                  <option key={option.value || 'auto'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="pe-footer" style={{ marginTop: -2, marginBottom: 8 }}>
              Si eliges "Automática por navegador", la app usará la zona horaria detectada en el equipo del usuario.
            </div>
            <div className="pe-checks">
              <label className="pe-check"><input type="checkbox" checked={draft.varios.aplica_proyectos} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, aplica_proyectos: e.target.checked } }))} />Aplicar proyectos</label>
              <label className="pe-check"><input type="checkbox" checked={draft.varios.catalogo_unico_proveedores} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, catalogo_unico_proveedores: e.target.checked } }))} />Catalogo unico de proveedores</label>
              <label className="pe-check"><input type="checkbox" checked={draft.varios.planilla_por_horas} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, planilla_por_horas: e.target.checked } }))} />Planilla por horas</label>
              <label className="pe-check"><input type="checkbox" checked={draft.varios.aplica_cobros_contabilidad} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, aplica_cobros_contabilidad: e.target.checked } }))} />Aplica cobros a contabilidad</label>
              <label className="pe-check"><input type="checkbox" checked={draft.varios.aplica_descuentos} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, aplica_descuentos: e.target.checked } }))} />Aplica descuentos</label>
              <label className="pe-check"><input type="checkbox" checked={draft.varios.imprimir_cheques_formularios} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, imprimir_cheques_formularios: e.target.checked } }))} />Imprimir cheques en formularios</label>
              <label className="pe-check"><input type="checkbox" checked={draft.varios.control_limite_credito} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, control_limite_credito: e.target.checked } }))} />Control limite de credito</label>
              <label className="pe-check"><input type="checkbox" checked={draft.varios.aplica_compras_contabilidad} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, aplica_compras_contabilidad: e.target.checked } }))} />Aplica compras a contabilidad</label>
              <label className="pe-check"><input type="checkbox" checked={draft.varios.control_cheques_postfechados} disabled={readonly} onChange={(e) => setDraft((p) => ({ ...p, varios: { ...p.varios, control_cheques_postfechados: e.target.checked } }))} />Control cheques post-fechados</label>
            </div>
          </section>
        </div>

        {/* ── Identidad Visual ──────────────────────────────────────── */}
        <section className="pe-card" style={{ marginTop: '12px' }}>
          <div className="pe-card-title">Identidad Visual</div>
          <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
            El logo identifica a la empresa en el navbar, documentos FE y reportes. El nombre de planta es opcional — aplica solo si la empresa opera una planta empacadora u otra sucursal específica.
          </p>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            {/* Vista previa logo */}
            <div style={{ width: 72, height: 72, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              border: '2px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <span style={{ fontSize: 28, opacity: 0.3 }}>🏢</span>}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Nombre planta */}
              <div className="pe-row">
                <label>Nombre de planta / sucursal <span style={{ fontWeight: 400, color: '#64748b' }}>(opcional — solo si aplica)</span></label>
                <input className="pe-input" value={nombrePlanta}
                  placeholder="Ej: Planta Tialez — dejar vacío si no aplica"
                  onChange={e => setNombrePlanta(e.target.value)} />
              </div>

              {/* URL manual */}
              <div className="pe-row">
                <label>Logo de la empresa <span style={{ fontWeight: 400, color: '#64748b' }}>(navbar, FE, reportes)</span></label>
                <input className="pe-input" value={logoUrl}
                  placeholder="https://... (o usar botón subir)"
                  onChange={e => setLogoUrl(e.target.value)} />
              </div>

              {/* Botón subir */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input ref={logoFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={handleLogoUpload} />
                <button type="button" disabled={logoUploading}
                  onClick={() => logoFileRef.current?.click()}
                  style={{ padding: '6px 12px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }}>
                  {logoUploading ? 'Subiendo...' : '📁 Subir desde computadora'}
                </button>
                <button type="button" onClick={saveLogoConfig}
                  style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    border: 'none', background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff' }}>
                  Guardar logo
                </button>
                {logoOk  && <span style={{ fontSize: '12px', color: '#4ade80' }}>{logoOk}</span>}
                {logoErr && <span style={{ fontSize: '12px', color: '#f87171' }}>{logoErr}</span>}
              </div>
              <p style={{ fontSize: '10px', color: '#64748b' }}>PNG o JPG cuadrado, máx 2 MB. Bucket: <code>logos</code> en Supabase Storage.</p>
            </div>
          </div>
        </section>

        <div className="pe-footer">
          Version: {data?._meta?.version ?? 0} | Modo: {data?._meta?.modo || 'default'} | Ultima actualizacion: {data?._meta?.updated_at || '-'}
        </div>
      </div>
    </>
  );
}

