import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { mantenimientoBaseStyles } from './mantenimientoTheme';
import { logModuloEvento } from '../../utils/bitacora';

interface TercerosUnificadosProps {
  empresaId: number;
  canView?: boolean;
  canEdit?: boolean;
  modo?: 'general' | 'clientes' | 'proveedores';
}

type RolCodigo = 'cliente' | 'proveedor' | 'contacto';
type MhSyncMode = 'incompletos' | 'forzar';
type MhFlagFilter = 'todos' | 'pendiente' | 'ok';

interface TerceroCatalogo {
  id: number;
  empresa_id: number;
  codigo: string | null;
  tipo_identificacion: string | null;
  identificacion: string | null;
  razon_social: string;
  nombre_comercial: string | null;
  alias: string | null;
  email: string | null;
  telefono_1: string | null;
  telefono_2: string | null;
  activo: boolean;
  roles: string[];
}

interface TerceroForm {
  id: number | null;
  codigo: string;
  tipo_identificacion: string;
  identificacion: string;
  razon_social: string;
  nombre_comercial: string;
  alias: string;
  email: string;
  telefono_1: string;
  telefono_2: string;
  activo: boolean;
  notas: string;
}

interface ClienteParams {
  tercero_id: number;
  limite_credito: number;
  dias_credito: number;
  moneda_credito: 'CRC' | 'USD' | 'AMBAS';
  condicion_pago: string;
  clase_cliente: string;
  ubicacion: string;
  aplica_descuentos: boolean;
  descuento_maximo_pct: number;
  escala_precio: number;
  exonerado: boolean;
}

interface ProveedorParams {
  tercero_id: number;
  dias_credito: number;
  condicion_pago: string;
  clase_proveedor: string;
  ubicacion: string;
  aplica_retencion: boolean;
  retencion_pct: number;
  exonerado: boolean;
  cuenta_cxp_id: number | null;
}

interface CuentaContableOpt {
  id: number;
  codigo: string;
  nombre: string;
}

interface ProductoOpt {
  id: number;
  codigo: string | null;
  descripcion: string;
  codigo_barras: string | null;
}

interface ClientePrecioEspecial {
  id?: number;
  producto_id: number | null;
  escala_precio: number;
  precio_venta: number;
  descuento_maximo_pct: number;
  activo: boolean;
}

interface Contacto {
  id?: number;
  tercero_id: number;
  nombre: string;
  cargo: string;
  email: string;
  telefono: string;
  es_principal: boolean;
  activo: boolean;
}

interface ResultadoMhContribuyente {
  ok?: boolean;
  cedula?: string;
  nombre?: string;
  tipo_identificacion?: string;
  actividades?: Array<{ codigo?: string; descripcion?: string }>;
  detail?: string;
  error?: string;
}

interface MhSyncProgress {
  current: number;
  total: number;
  cedula: string;
}

interface MhSyncSummary {
  candidatos: number;
  omitidos: number;
}

const styles = `
  ${mantenimientoBaseStyles}
  .ter-wrap { padding:0; color:var(--card-text); }
  .ter-title { font-size:20px; font-weight:700; color:var(--card-text); margin-bottom:6px; }
  .ter-sub { font-size:12px; color:var(--gray-400); margin-bottom:12px; }
  .ter-msg-ok { margin-bottom:10px; border:1px solid color-mix(in srgb, var(--green-main) 32%, var(--card-border)); background:color-mix(in srgb, var(--green-main) 12%, var(--bg-dark2)); color:var(--card-text); border-radius:12px; padding:10px 12px; font-size:12px; }
  .ter-msg-err { margin-bottom:10px; border:1px solid color-mix(in srgb, #ef4444 32%, var(--card-border)); background:color-mix(in srgb, #ef4444 10%, var(--bg-dark2)); color:var(--card-text); border-radius:12px; padding:10px 12px; font-size:12px; }
  .ter-layout { display:grid; grid-template-columns: 360px 1fr; gap:12px; }
  .ter-card { border-radius:16px; padding:12px; }
  .ter-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:8px; }
  .ter-field { display:flex; flex-direction:column; gap:4px; }
  .ter-field label { font-size:11px; }
  .ter-input, .ter-select, .ter-text {
    width:100%;
    border-radius:12px;
    padding:10px 12px;
    font-size:13px;
    border:1px solid color-mix(in srgb, var(--card-border) 82%, var(--green-main));
    background:color-mix(in srgb, var(--bg-dark2) 44%, var(--card-bg));
    color:var(--card-text);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
  }
  .ter-input::placeholder, .ter-text::placeholder { color:var(--gray-400); }
  .ter-input:disabled, .ter-select:disabled, .ter-text:disabled {
    background:color-mix(in srgb, var(--bg-dark2) 40%, var(--card-bg));
    border-color:color-mix(in srgb, var(--card-border) 78%, var(--bg-dark));
    color:color-mix(in srgb, var(--card-text) 74%, var(--gray-400));
    opacity:1;
    cursor:not-allowed;
  }
  .ter-input::placeholder, .ter-text::placeholder { color:var(--gray-400); }
  .ter-input:focus, .ter-select:focus, .ter-text:focus { outline:none; border-color:var(--green-main); box-shadow:0 0 0 2px color-mix(in srgb, var(--green-main) 18%, transparent); }
  .ter-input.num { text-align:right; font-variant-numeric: tabular-nums; }
  .ter-input.num::-webkit-outer-spin-button, .ter-input.num::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
  .ter-input.num[type=number] { -moz-appearance:textfield; appearance:textfield; }
  .ter-text { min-height:78px; }
  .ter-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; align-items:center; }
  .ter-btn { border-radius:10px; padding:8px 11px; font-size:13px; cursor:pointer; }
  .ter-btn.main { color:#fff; }
  .ter-btn:disabled { opacity:.65; cursor:not-allowed; }
  .ter-search { margin-bottom:8px; }
  .ter-list { border:1px solid var(--card-border); border-radius:12px; overflow:auto; max-height:680px; background:color-mix(in srgb, var(--bg-dark) 74%, var(--card-bg)); }
  .ter-item { padding:9px 10px; border-top:1px solid var(--card-border); cursor:pointer; }
  .ter-item:first-child { border-top:none; }
  .ter-item.active { background:color-mix(in srgb, var(--green-main) 12%, var(--bg-dark2)); }
  .ter-item:hover { background:color-mix(in srgb, var(--green-main) 6%, var(--bg-dark2)); }
  .ter-item-name { font-size:13px; color:var(--card-text); font-weight:700; }
  .ter-item-sub { font-size:12px; color:var(--gray-400); margin-top:2px; display:flex; gap:8px; flex-wrap:wrap; }
  .ter-code-chip { display:inline-flex; align-items:center; border-radius:999px; padding:1px 8px; font-size:10px; font-weight:800; letter-spacing:.04em; border:1px solid color-mix(in srgb, var(--green-main) 24%, var(--card-border)); background:color-mix(in srgb, var(--green-main) 12%, var(--bg-dark2)); color:color-mix(in srgb, var(--green-soft) 68%, var(--card-text)); text-transform:uppercase; }
  .ter-chip { display:inline-flex; align-items:center; border-radius:999px; padding:1px 7px; font-size:10px; border:1px solid var(--card-border); color:var(--card-text); background:color-mix(in srgb, var(--bg-dark2) 70%, var(--card-bg)); text-transform:uppercase; }
  .ter-flag-chip {
    display:inline-flex;
    align-items:center;
    border-radius:999px;
    padding:1px 8px;
    font-size:10px;
    font-weight:800;
    letter-spacing:.04em;
    text-transform:uppercase;
  }
  .ter-flag-chip.error {
    border:1px solid color-mix(in srgb, #ef4444 34%, var(--card-border));
    background:color-mix(in srgb, #ef4444 12%, var(--bg-dark2));
    color:#fecaca;
  }
  .ter-status-line {
    margin-bottom:8px;
    padding:7px 10px;
    border:1px solid color-mix(in srgb, var(--green-main) 22%, var(--card-border));
    border-radius:10px;
    background:color-mix(in srgb, var(--green-main) 8%, var(--bg-dark2));
    color:var(--gray-400);
    font-size:12px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .ter-status-line strong { color:var(--card-text); font-weight:700; }
  .ter-progress {
    margin-bottom:8px;
    border:1px solid color-mix(in srgb, var(--green-main) 22%, var(--card-border));
    border-radius:10px;
    background:color-mix(in srgb, var(--green-main) 8%, var(--bg-dark2));
    overflow:hidden;
  }
  .ter-progress-bar {
    height:6px;
    background:color-mix(in srgb, var(--green-main) 12%, var(--bg-dark));
  }
  .ter-progress-bar > span {
    display:block;
    height:100%;
    background:linear-gradient(90deg, color-mix(in srgb, var(--green-main) 70%, var(--green-soft)), var(--green-main));
    transition:width .2s ease;
  }
  .ter-progress-meta {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    padding:7px 10px 8px;
    font-size:12px;
    color:var(--gray-400);
  }
  .ter-progress-meta strong { color:var(--card-text); font-weight:700; }
  .ter-progress-meta span:last-child {
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .ter-modal-backdrop {
    position:fixed;
    inset:0;
    background:rgba(3,8,20,.62);
    display:flex;
    align-items:center;
    justify-content:center;
    z-index:1000;
    padding:20px;
  }
  .ter-modal {
    width:min(520px, 100%);
    border:1px solid var(--card-border);
    border-radius:16px;
    background:color-mix(in srgb, var(--bg-dark2) 84%, var(--card-bg));
    box-shadow:0 24px 60px rgba(3,8,20,.38);
    padding:18px;
  }
  .ter-modal-title { font-size:16px; font-weight:800; color:var(--card-text); margin-bottom:8px; }
  .ter-modal-sub { font-size:13px; color:var(--gray-400); line-height:1.5; }
  .ter-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:16px; }
  .ter-inline-flag {
    margin-bottom:10px;
    padding:8px 10px;
    border:1px solid color-mix(in srgb, #ef4444 34%, var(--card-border));
    border-radius:10px;
    background:color-mix(in srgb, #ef4444 10%, var(--bg-dark2));
    color:#fecaca;
    font-size:12px;
  }
  .ter-inline-flag strong { color:var(--card-text); }
  .ter-sec-title { font-size:13px; color:var(--card-text); font-weight:700; margin:12px 0 8px; }
  .ter-checks { display:flex; gap:14px; flex-wrap:wrap; margin:4px 0 2px; }
  .ter-check { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--card-text); }
  .ter-check input { accent-color: var(--green-main); }
  .ter-table { border:1px solid var(--card-border); border-radius:12px; overflow:auto; background:color-mix(in srgb, var(--bg-dark) 76%, var(--card-bg)); }
  .ter-table table { width:100%; border-collapse:collapse; min-width:720px; }
  .ter-table th, .ter-table td { padding:8px 10px; border-top:1px solid var(--card-border); font-size:12px; color:var(--card-text); }
  .ter-table th { background:color-mix(in srgb, var(--bg-dark) 82%, var(--bg-dark2)); color:var(--gray-400); text-transform:uppercase; letter-spacing:.03em; font-size:11px; text-align:left; }
  .ter-table input[type="text"], .ter-table input[type="email"], .ter-table input[type="number"] { width:100%; border:1px solid var(--card-border); border-radius:8px; padding:6px 8px; font-size:12px; background:color-mix(in srgb, var(--bg-dark2) 82%, var(--card-bg)); color:var(--card-text); }
  .ter-empty { color:var(--gray-400); font-size:12px; padding:10px; text-align:center; }
  @media (max-width: 1200px) { .ter-layout { grid-template-columns: 1fr; } }
  @media (max-width: 900px) { .ter-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .ter-grid { grid-template-columns: 1fr; } }
`;

const emptyForm: TerceroForm = {
  id: null,
  codigo: '',
  tipo_identificacion: '',
  identificacion: '',
  razon_social: '',
  nombre_comercial: '',
  alias: '',
  email: '',
  telefono_1: '',
  telefono_2: '',
  activo: true,
  notas: '',
};

const defaultCliente = (terceroId: number): ClienteParams => ({
  tercero_id: terceroId,
  limite_credito: 0,
  dias_credito: 0,
  moneda_credito: 'CRC',
  condicion_pago: '',
  clase_cliente: '',
  ubicacion: '',
  aplica_descuentos: false,
  descuento_maximo_pct: 0,
  escala_precio: 1,
  exonerado: false,
});

const defaultProveedor = (terceroId: number): ProveedorParams => ({
  tercero_id: terceroId,
  dias_credito: 0,
  condicion_pago: '',
  clase_proveedor: '',
  ubicacion: '',
  aplica_retencion: false,
  retencion_pct: 0,
  exonerado: false,
  cuenta_cxp_id: null,
});

const toN = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const sortRoles = (r: string[] = []) => [...r].sort((a, b) => a.localeCompare(b));

export default function TercerosUnificados({
  empresaId,
  canView = true,
  canEdit = false,
  modo = 'general',
}: TercerosUnificadosProps) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const rolFijo = modo === 'clientes' ? 'cliente' : (modo === 'proveedores' ? 'proveedor' : null);
  const [rolFiltro, setRolFiltro] = useState<'todos' | RolCodigo>(rolFijo || 'todos');
  const [rows, setRows] = useState<TerceroCatalogo[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<TerceroForm>(emptyForm);
  const [roles, setRoles] = useState<Record<RolCodigo, boolean>>({ cliente: false, proveedor: false, contacto: false });
  const [cliente, setCliente] = useState<ClienteParams>(defaultCliente(0));
  const [proveedor, setProveedor] = useState<ProveedorParams>(defaultProveedor(0));
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [cuentasCXP, setCuentasCXP] = useState<CuentaContableOpt[]>([]);
  const [productos, setProductos] = useState<ProductoOpt[]>([]);
  const [preciosEspeciales, setPreciosEspeciales] = useState<ClientePrecioEspecial[]>([]);
  const [mhSyncBusy, setMhSyncBusy] = useState(false);
  const [mhSyncStatus, setMhSyncStatus] = useState('');
  const [mhSyncMode, setMhSyncMode] = useState<MhSyncMode>('incompletos');
  const [mhSyncProgress, setMhSyncProgress] = useState<MhSyncProgress | null>(null);
  const [mhSyncConfirm, setMhSyncConfirm] = useState<MhSyncSummary | null>(null);
  const [mhFlags, setMhFlags] = useState<Record<number, string>>({});
  const [mhFlagFilter, setMhFlagFilter] = useState<MhFlagFilter>('todos');
  const [mhLookupBusy, setMhLookupBusy] = useState(false);

  const titulo = modo === 'clientes' ? 'Clientes' : (modo === 'proveedores' ? 'Proveedores' : 'Mantenimiento de Terceros');
  const subtitulo = modo === 'clientes'
    ? 'Vista filtrada del catalogo unificado para gestion de clientes.'
    : (modo === 'proveedores'
      ? 'Vista filtrada del catalogo unificado para gestion de proveedores.'
      : 'Catalogo unificado para clientes, proveedores y contactos por empresa.');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtroEfectivo = rolFijo || rolFiltro;
    return rows.filter((r) => {
      if (filtroEfectivo !== 'todos' && !(r.roles || []).includes(filtroEfectivo)) return false;
      if (mhFlagFilter === 'pendiente' && !mhFlags[r.id]) return false;
      if (mhFlagFilter === 'ok' && mhFlags[r.id]) return false;
      if (!q) return true;
      return (
        String(r.razon_social || '').toLowerCase().includes(q) ||
        String(r.identificacion || '').toLowerCase().includes(q) ||
        String(r.codigo || '').toLowerCase().includes(q) ||
        String(r.email || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, rolFiltro, rolFijo, mhFlagFilter, mhFlags]);

  useEffect(() => {
    if (rolFijo) setRolFiltro(rolFijo);
  }, [rolFijo]);

  const resetEditor = async () => {
    let nextCodigo = '000001';
    const { data: nextData, error: nextErr } = await supabase.rpc('siguiente_tercero_codigo', {
      p_empresa_id: empresaId,
    });
    if (!nextErr && nextData) nextCodigo = String(nextData);

    setSelectedId(null);
    setForm({ ...emptyForm, codigo: nextCodigo });
    setRoles({
      cliente: rolFijo === 'cliente',
      proveedor: rolFijo === 'proveedor',
      contacto: false,
    });
    setCliente(defaultCliente(0));
    setProveedor(defaultProveedor(0));
    setContactos([]);
    setPreciosEspeciales([]);
    if (false) {
    // Generar siguiente código consecutivo
    const { data: maxRow } = await supabase
      .from('terceros')
      .select('codigo')
      .eq('empresa_id', empresaId)
      .not('codigo', 'is', null)
      .order('codigo', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastCodigo = (maxRow as any)?.codigo || '';
    const lastNum = parseInt(lastCodigo.replace(/\D/g, ''), 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    const nextCodigoLegacy = String(nextNum).padStart(4, '0');

    setSelectedId(null);
    setForm({ ...emptyForm, codigo: nextCodigoLegacy });
    setRoles({
      cliente: rolFijo === 'cliente',
      proveedor: rolFijo === 'proveedor',
      contacto: false,
    });
    setCliente(defaultCliente(0));
    setProveedor(defaultProveedor(0));
    setContactos([]);
    setPreciosEspeciales([]);
    }
  };

  const loadCatalogo = async () => {
    if (!canView) return;
    setBusy(true);
    setErr('');
    const [{ data, error }, { data: cuentasData }, { data: productosData }] = await Promise.all([
      supabase.from('vw_terceros_catalogo').select('*').eq('empresa_id', empresaId).order('razon_social', { ascending: true }),
      supabase.from('plan_cuentas_empresa').select('id,codigo,nombre').eq('empresa_id', empresaId).eq('activo', true).order('codigo', { ascending: true }),
      supabase.from('inv_productos').select('id,codigo,descripcion,codigo_barras').eq('empresa_id', empresaId).eq('activo', true).order('descripcion', { ascending: true }),
    ]);
    setCuentasCXP((cuentasData || []) as CuentaContableOpt[]);
    setProductos((productosData || []) as ProductoOpt[]);
    setBusy(false);
    if (error) {
      setErr(error.message || 'No se pudo cargar terceros.');
      return;
    }
    const next = (data || []) as TerceroCatalogo[];
    setRows(next);
    if (selectedId && !next.some((x) => x.id === selectedId)) resetEditor();
  };

  const loadMhFlags = async () => {
    if (!canView || !empresaId) return;
    const { data, error } = await supabase
      .from('vw_bitacora_modulos')
      .select('accion,entidad_id,detalle,created_at')
      .eq('empresa_id', empresaId)
      .eq('modulo', 'mantenimientos')
      .eq('entidad', 'terceros')
      .in('accion', ['mh_sync_tercero_error', 'mh_sync_tercero_ok'])
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) return;
    const nextFlags: Record<number, string> = {};
    for (const row of (data || []) as any[]) {
      const terceroId = Number(row?.entidad_id || 0);
      if (!terceroId || terceroId in nextFlags) continue;
      if (row?.accion === 'mh_sync_tercero_error') {
        nextFlags[terceroId] = String((row?.detalle as any)?.mensaje || row?.detalle?.error || 'Pendiente de revision MH');
      }
    }
    setMhFlags(nextFlags);
  };

  const loadDetalle = async (terceroId: number) => {
    if (!terceroId) return;
    setBusy(true);
    setErr('');
    const [baseRes, rolRes, cliRes, prvRes, conRes, preciosRes] = await Promise.all([
      supabase.from('vw_terceros').select('*').eq('id', terceroId).eq('empresa_id', empresaId).single(),
      supabase.from('vw_tercero_roles').select('rol,activo').eq('tercero_id', terceroId),
      supabase.from('vw_tercero_cliente_parametros').select('*').eq('tercero_id', terceroId).maybeSingle(),
      supabase.from('vw_tercero_proveedor_parametros').select('*').eq('tercero_id', terceroId).maybeSingle(),
      supabase.from('vw_tercero_contactos').select('*').eq('tercero_id', terceroId).order('id', { ascending: true }),
      supabase.from('inv_producto_cliente_precios').select('id,producto_id,escala_precio,precio_venta,descuento_maximo_pct,activo').eq('empresa_id', empresaId).eq('tercero_id', terceroId).eq('activo', true).order('producto_id', { ascending: true }),
    ]);
    setBusy(false);
    if (baseRes.error) {
      setErr(baseRes.error.message || 'No se pudo cargar tercero.');
      return;
    }

    const b = baseRes.data as any;
    const roleRows = (rolRes.data || []) as { rol: RolCodigo; activo: boolean }[];
    setRows((prev) => prev.map((row) => (
      row.id === terceroId
        ? {
            ...row,
            codigo: b.codigo || null,
            tipo_identificacion: b.tipo_identificacion || null,
            identificacion: b.identificacion || null,
            razon_social: b.razon_social || row.razon_social,
            email: b.email || null,
            telefono_1: b.telefono_1 || null,
            telefono_2: b.telefono_2 || null,
            activo: b.activo !== false,
          }
        : row
    )));
    setSelectedId(terceroId);
    setForm({
      id: b.id,
      codigo: b.codigo || '',
      tipo_identificacion: b.tipo_identificacion || '',
      identificacion: b.identificacion || '',
      razon_social: b.razon_social || '',
      nombre_comercial: b.nombre_comercial || '',
      alias: b.alias || '',
      email: b.email || '',
      telefono_1: b.telefono_1 || '',
      telefono_2: b.telefono_2 || '',
      activo: b.activo !== false,
      notas: b.notas || '',
    });
    setRoles({
      cliente: roleRows.some((r) => r.rol === 'cliente' && r.activo),
      proveedor: roleRows.some((r) => r.rol === 'proveedor' && r.activo),
      contacto: roleRows.some((r) => r.rol === 'contacto' && r.activo),
    });
    setCliente(cliRes.data ? ({
      tercero_id: terceroId,
      limite_credito: toN((cliRes.data as any).limite_credito, 0),
      dias_credito: toN((cliRes.data as any).dias_credito, 0),
      moneda_credito: (String((cliRes.data as any).moneda_credito || 'CRC') as 'CRC' | 'USD' | 'AMBAS'),
      condicion_pago: String((cliRes.data as any).condicion_pago || ''),
      clase_cliente: String((cliRes.data as any).clase_cliente || ''),
      ubicacion: String((cliRes.data as any).ubicacion || ''),
      aplica_descuentos: Boolean((cliRes.data as any).aplica_descuentos),
      descuento_maximo_pct: toN((cliRes.data as any).descuento_maximo_pct, 0),
      escala_precio: toN((cliRes.data as any).escala_precio, 1),
      exonerado: Boolean((cliRes.data as any).exonerado),
    }) : defaultCliente(terceroId));
    setProveedor(prvRes.data ? ({
      tercero_id: terceroId,
      dias_credito: toN((prvRes.data as any).dias_credito, 0),
      condicion_pago: String((prvRes.data as any).condicion_pago || ''),
      clase_proveedor: String((prvRes.data as any).clase_proveedor || ''),
      ubicacion: String((prvRes.data as any).ubicacion || ''),
      aplica_retencion: Boolean((prvRes.data as any).aplica_retencion),
      retencion_pct: toN((prvRes.data as any).retencion_pct, 0),
      exonerado: Boolean((prvRes.data as any).exonerado),
      cuenta_cxp_id: (prvRes.data as any).cuenta_cxp_id ? Number((prvRes.data as any).cuenta_cxp_id) : null,
    }) : defaultProveedor(terceroId));

    const cRows = ((conRes.data || []) as any[]).map((c) => ({
      id: Number(c.id),
      tercero_id: terceroId,
      nombre: String(c.nombre || ''),
      cargo: String(c.cargo || ''),
      email: String(c.email || ''),
      telefono: String(c.telefono || ''),
      es_principal: Boolean(c.es_principal),
      activo: c.activo !== false,
    }));
    setContactos(cRows);
    setPreciosEspeciales((((preciosRes.data || []) as any[]) || []).map((row) => ({
      id: Number(row.id),
      producto_id: row.producto_id ? Number(row.producto_id) : null,
      escala_precio: Math.min(4, Math.max(1, toN(row.escala_precio, 1))),
      precio_venta: toN(row.precio_venta, 0),
      descuento_maximo_pct: toN(row.descuento_maximo_pct, 0),
      activo: row.activo !== false,
    })));
  };

  useEffect(() => {
    loadCatalogo();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadMhFlags();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const getMhJwt = async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) throw new Error('Sesion expirada. Ingrese de nuevo.');
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = Number(sessionData.session.expires_at || 0);
    let jwt = sessionData.session.access_token;
    if (!expiresAt || expiresAt - nowSec <= 60) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session?.access_token) {
        throw new Error('Sesion expirada. Ingrese de nuevo.');
      }
      jwt = refreshed.session.access_token;
    }
    if (!jwt) throw new Error('No se pudo obtener token de sesion valido.');
    return jwt;
  };

  const fetchMhContribuyente = async (jwt: string, cedula: string) => {
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl) throw new Error('No hay REACT_APP_SUPABASE_URL configurado para consultar MH.');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/mh-contribuyente`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cedula }),
        signal: controller.signal,
      });
      const raw = await resp.text();
      let payload: ResultadoMhContribuyente | null = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      if (!resp.ok) {
        throw new Error(String(payload?.detail || payload?.error || raw || `HTTP ${resp.status}`));
      }
      if (!payload?.ok) {
        throw new Error(String(payload?.detail || payload?.error || 'Consulta MH no exitosa.'));
      }
      return payload;
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error(`Timeout consultando MH para ${cedula}.`);
      }
      throw e;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const consultarMhDesdeIdentificacion = async () => {
    const cedula = String(form.identificacion || '').trim();
    if (!cedula || mhLookupBusy || busy) return;
    setMhLookupBusy(true);
    setErr('');
    setOk('');
    try {
      const jwt = await getMhJwt();
      const result = await fetchMhContribuyente(jwt, cedula);
      const razonSocial = String(result.nombre || form.razon_social || cedula).trim();
      const tipoIdentificacion = String(result.tipo_identificacion || form.tipo_identificacion || '').trim();
      const actividades = Array.isArray(result.actividades) ? result.actividades : [];
      const actividad = actividades[0] || {};

      setForm((prev) => ({
        ...prev,
        tipo_identificacion: tipoIdentificacion || prev.tipo_identificacion,
        razon_social: razonSocial || prev.razon_social,
      }));

      const terceroId = Number(form.id || selectedId || 0);
      if (terceroId > 0) {
        setRows((prev) => prev.map((row) => (
          row.id === terceroId
            ? {
                ...row,
                tipo_identificacion: tipoIdentificacion || row.tipo_identificacion,
                identificacion: cedula,
                razon_social: razonSocial || row.razon_social,
              }
            : row
        )));
        setMhFlags((prev) => {
          if (!prev[terceroId]) return prev;
          const next = { ...prev };
          delete next[terceroId];
          return next;
        });
      }

      await supabase
        .from('fe_receptores_bitacora')
        .upsert({
          empresa_id: empresaId,
          tipo_identificacion: tipoIdentificacion || null,
          identificacion: cedula,
          razon_social: razonSocial,
          actividad_tributaria_id: null,
          actividad_codigo: String(actividad.codigo || '') || null,
          actividad_descripcion: String(actividad.descripcion || '') || null,
          email: form.email || null,
          telefono: form.telefono_1 || null,
          direccion: null,
          origen_mh: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'empresa_id,identificacion' });

      setOk(`MH actualizado para ${cedula}.`);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo consultar MH.'));
    } finally {
      setMhLookupBusy(false);
    }
  };

  const getMhSyncCandidates = () => {
    const base = filtered.filter((row) => String(row.identificacion || '').trim());
    return base.filter((row) => {
      if (mhSyncMode === 'forzar') return true;
      return !String(row.razon_social || '').trim() || !String(row.tipo_identificacion || '').trim();
    });
  };

  const pedirConfirmacionMhSync = () => {
    if (!canEdit || mhSyncBusy || busy) return;
    const candidatos = getMhSyncCandidates();
    const omitidos = filtered.length - candidatos.length;
    if (!candidatos.length) {
      setErr(
        mhSyncMode === 'forzar'
          ? 'No hay terceros con cedula en la lista filtrada para consultar MH.'
          : 'No hay terceros incompletos con cedula en la lista filtrada.'
      );
      return;
    }
    setMhSyncConfirm({ candidatos: candidatos.length, omitidos });
  };

  const sincronizarTercerosDesdeMh = async () => {
    if (!canEdit || mhSyncBusy || busy) return;
    const candidatos = getMhSyncCandidates();
    const omitidos = filtered.length - candidatos.length;
    if (!candidatos.length) {
      setMhSyncConfirm(null);
      return;
    }
    setMhSyncConfirm(null);
    setMhSyncBusy(true);
    setMhSyncStatus('');
    setMhSyncProgress(null);
    setErr('');
    setOk('');

    let actualizados = 0;
    let errores = 0;
    const detalleErrores: string[] = [];

    try {
      const jwt = await getMhJwt();
      for (let i = 0; i < candidatos.length; i += 1) {
        const row = candidatos[i];
        const cedula = String(row.identificacion || '').trim();
        setMhSyncStatus(`Consultando MH ${i + 1}/${candidatos.length}: ${cedula}`);
        setMhSyncProgress({ current: i + 1, total: candidatos.length, cedula });
        try {
          const result = await fetchMhContribuyente(jwt, cedula);

          const razonSocial = String(result.nombre || row.razon_social || cedula).trim();
          const tipoIdentificacion = String(result.tipo_identificacion || row.tipo_identificacion || '').trim() || null;
          const actividades = Array.isArray(result.actividades) ? result.actividades : [];
          const actividad = actividades[0] || {};

          const { error: updErr } = await supabase
            .from('terceros')
            .update({
              tipo_identificacion: tipoIdentificacion,
              razon_social: razonSocial,
            })
            .eq('id', row.id)
            .eq('empresa_id', empresaId);
          if (updErr) throw updErr;

          const { error: bitErr } = await supabase
            .from('fe_receptores_bitacora')
            .upsert({
              empresa_id: empresaId,
              tipo_identificacion: tipoIdentificacion,
              identificacion: cedula,
              razon_social: razonSocial,
              actividad_tributaria_id: null,
              actividad_codigo: String(actividad.codigo || '') || null,
              actividad_descripcion: String(actividad.descripcion || '') || null,
              email: row.email || null,
              telefono: row.telefono_1 || null,
              direccion: null,
              origen_mh: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'empresa_id,identificacion' });
          if (bitErr) throw bitErr;

          void logModuloEvento({
            empresaId,
            modulo: 'mantenimientos',
            accion: 'mh_sync_tercero_ok',
            entidad: 'terceros',
            entidadId: row.id,
            descripcion: 'Sincronizacion MH exitosa para tercero',
            detalle: {
              tercero_id: row.id,
              cedula,
              razon_social: razonSocial,
              tipo_identificacion: tipoIdentificacion,
            },
          });
          setMhFlags((prev) => {
            if (!prev[row.id]) return prev;
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
          actualizados += 1;
        } catch (e: any) {
          errores += 1;
          const msg = String(e?.message || 'Error desconocido');
          detalleErrores.push(`${cedula}: ${msg}`);
          setMhFlags((prev) => ({ ...prev, [row.id]: msg }));
          void logModuloEvento({
            empresaId,
            modulo: 'mantenimientos',
            accion: 'mh_sync_tercero_error',
            entidad: 'terceros',
            entidadId: row.id,
            descripcion: 'Sincronizacion MH fallida para tercero',
            detalle: {
              tercero_id: row.id,
              cedula,
              mensaje: msg,
            },
          });
        }
      }

      await loadCatalogo();
      if (selectedId) await loadDetalle(selectedId);

      setOk(`Sincronizacion MH finalizada. ${actualizados} actualizado(s), ${omitidos} omitido(s) y ${errores} con error.`);
      if (detalleErrores.length) {
        setErr(detalleErrores.slice(0, 5).join(' | '));
      }
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo iniciar la sincronizacion masiva con MH.'));
    } finally {
      setMhSyncBusy(false);
      setMhSyncStatus('');
      setMhSyncProgress(null);
    }
  };

  const saveGeneral = async () => {
    if (!canEdit) return;
    if (!form.razon_social.trim()) {
      setErr('Razon social es requerida.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      let terceroId = form.id;
      if (!terceroId) {
        const { data, error } = await supabase
          .from('terceros')
          .insert({
            empresa_id: empresaId,
            codigo: form.codigo || null,
            tipo_identificacion: form.tipo_identificacion || null,
            identificacion: form.identificacion || null,
            razon_social: form.razon_social.trim(),
            nombre_comercial: form.nombre_comercial || null,
            alias: form.alias || null,
            email: form.email || null,
            telefono_1: form.telefono_1 || null,
            telefono_2: form.telefono_2 || null,
            activo: form.activo,
            notas: form.notas || null,
          })
          .select('id')
          .single();
        if (error) throw error;
        terceroId = Number((data as any)?.id || 0);
      } else {
        const { error } = await supabase
          .from('terceros')
          .update({
            tipo_identificacion: form.tipo_identificacion || null,
            identificacion: form.identificacion || null,
            razon_social: form.razon_social.trim(),
            nombre_comercial: form.nombre_comercial || null,
            alias: form.alias || null,
            email: form.email || null,
            telefono_1: form.telefono_1 || null,
            telefono_2: form.telefono_2 || null,
            activo: form.activo,
            notas: form.notas || null,
          })
          .eq('id', terceroId)
          .eq('empresa_id', empresaId);
        if (error) throw error;
      }

      if (!terceroId) throw new Error('No se pudo determinar tercero.');

      const rolePayload = (['cliente', 'proveedor', 'contacto'] as RolCodigo[]).map((rol) => ({
        tercero_id: terceroId,
        rol,
        activo: rolFijo === rol ? true : Boolean(roles[rol]),
      }));
      const { error: rolesErr } = await supabase.from('tercero_roles').upsert(rolePayload, { onConflict: 'tercero_id,rol' });
      if (rolesErr) throw rolesErr;

      if ((rolFijo === 'cliente') || roles.cliente) {
        const { error: cliErr } = await supabase.from('tercero_cliente_parametros').upsert({
          tercero_id: terceroId,
          limite_credito: toN(cliente.limite_credito, 0),
          dias_credito: toN(cliente.dias_credito, 0),
          moneda_credito: cliente.moneda_credito,
          condicion_pago: cliente.condicion_pago || null,
          clase_cliente: cliente.clase_cliente || null,
          ubicacion: cliente.ubicacion || null,
          aplica_descuentos: cliente.aplica_descuentos,
          descuento_maximo_pct: toN(cliente.descuento_maximo_pct, 0),
          escala_precio: Math.min(4, Math.max(1, toN(cliente.escala_precio, 1))),
          exonerado: cliente.exonerado,
        }, { onConflict: 'tercero_id' });
        if (cliErr) throw cliErr;

        const { error: delPrecioErr } = await supabase
          .from('inv_producto_cliente_precios')
          .delete()
          .eq('empresa_id', empresaId)
          .eq('tercero_id', terceroId);
        if (delPrecioErr) throw delPrecioErr;

        const precioRows = preciosEspeciales
          .filter((row) => Number(row.producto_id || 0) > 0)
          .map((row) => ({
            empresa_id: empresaId,
            tercero_id: terceroId,
            producto_id: Number(row.producto_id),
            escala_precio: Math.min(4, Math.max(1, toN(row.escala_precio, 1))),
            precio_venta: toN(row.precio_venta, 0),
            descuento_maximo_pct: toN(row.descuento_maximo_pct, 0),
            activo: row.activo !== false,
          }));
        if (precioRows.length > 0) {
          const { error: precioErr } = await supabase.from('inv_producto_cliente_precios').insert(precioRows);
          if (precioErr) throw precioErr;
        }
      }

      if ((rolFijo === 'proveedor') || roles.proveedor) {
        const prvPayload = {
          tercero_id: terceroId,
          dias_credito: toN(proveedor.dias_credito, 0),
          condicion_pago: proveedor.condicion_pago || null,
          clase_proveedor: proveedor.clase_proveedor || null,
          ubicacion: proveedor.ubicacion || null,
          aplica_retencion: proveedor.aplica_retencion,
          retencion_pct: toN(proveedor.retencion_pct, 0),
          exonerado: proveedor.exonerado,
          cuenta_cxp_id: proveedor.cuenta_cxp_id || null,
        };
        const { data: prvExiste } = await supabase
          .from('tercero_proveedor_parametros').select('id').eq('tercero_id', terceroId).maybeSingle();
        let prvErr;
        if (prvExiste) {
          ({ error: prvErr } = await supabase.from('tercero_proveedor_parametros')
            .update(prvPayload).eq('id', (prvExiste as any).id));
        } else {
          ({ error: prvErr } = await supabase.from('tercero_proveedor_parametros').insert(prvPayload));
        }
        if (prvErr) throw prvErr;
      }

      const existingIds = contactos.map((c) => c.id).filter(Boolean) as number[];
      const { data: exContRows } = await supabase.from('tercero_contactos').select('id').eq('tercero_id', terceroId);
      const toDelete = ((exContRows || []) as { id: number }[]).map((r) => r.id).filter((id) => !existingIds.includes(id));
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase.from('tercero_contactos').delete().in('id', toDelete);
        if (delErr) throw delErr;
      }
      if (contactos.length > 0) {
        const toUpsert = contactos
          .filter((c) => c.nombre.trim() !== '')
          .map((c) => ({
            id: c.id,
            tercero_id: terceroId,
            nombre: c.nombre.trim(),
            cargo: c.cargo || null,
            email: c.email || null,
            telefono: c.telefono || null,
            es_principal: c.es_principal,
            activo: c.activo,
          }));
        if (toUpsert.length > 0) {
          const { error: conErr } = await supabase.from('tercero_contactos').upsert(toUpsert, { onConflict: 'id' });
          if (conErr) throw conErr;
        }
      }

      await loadCatalogo();
      await loadDetalle(terceroId);
      setOk('Tercero guardado correctamente.');
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo guardar tercero.'));
    } finally {
      setBusy(false);
    }
  };

  const addContacto = () => {
    const terceroId = form.id || 0;
    setContactos((prev) => [...prev, {
      tercero_id: terceroId,
      nombre: '',
      cargo: '',
      email: '',
      telefono: '',
      es_principal: prev.length === 0,
      activo: true,
    }]);
  };

  const updateContacto = (idx: number, key: keyof Contacto, value: any) => {
    setContactos((prev) => prev.map((c, i) => (i === idx ? ({ ...c, [key]: value }) : c)));
  };

  const removeContacto = (idx: number) => {
    setContactos((prev) => prev.filter((_, i) => i !== idx));
  };

  const addPrecioEspecial = () => {
    setPreciosEspeciales((prev) => [...prev, {
      producto_id: null,
      escala_precio: Math.min(4, Math.max(1, toN(cliente.escala_precio, 1))),
      precio_venta: 0,
      descuento_maximo_pct: toN(cliente.descuento_maximo_pct, 0),
      activo: true,
    }]);
  };

  const updatePrecioEspecial = (idx: number, patch: Partial<ClientePrecioEspecial>) => {
    setPreciosEspeciales((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const removePrecioEspecial = (idx: number) => {
    setPreciosEspeciales((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <>
      <style>{styles}</style>
      <div className="ter-wrap mnt-wrap">
        <div className="ter-title mnt-title">{titulo}</div>
        <div className="ter-sub mnt-sub">{subtitulo}</div>
        {ok ? <div className="ter-msg-ok">{ok}</div> : null}
        {err ? <div className="ter-msg-err">{err}</div> : null}

        <div className="ter-layout">
          <div className="ter-card mnt-card">
            <div className="ter-actions" style={{ marginTop: 0, marginBottom: 8 }}>
              <button className="ter-btn mnt-btn mnt-btn-primary main" type="button" onClick={resetEditor} disabled={!canEdit || busy}>Nuevo</button>
              {!rolFijo ? (
                <select className="ter-select mnt-select" value={rolFiltro} onChange={(e) => setRolFiltro(e.target.value as any)} style={{ maxWidth: 170 }}>
                  <option value="todos">Todos</option>
                  <option value="cliente">Cliente</option>
                  <option value="proveedor">Proveedor</option>
                  <option value="contacto">Contacto</option>
                </select>
              ) : null}
              <select
                className="ter-select mnt-select"
                value={mhSyncMode}
                onChange={(e) => setMhSyncMode(e.target.value as MhSyncMode)}
                style={{ maxWidth: 190 }}
                disabled={mhSyncBusy || busy}
                title="Define si la consulta masiva completa solo terceros incompletos o refresca todos los filtrados."
              >
                <option value="incompletos">Solo incompletos</option>
                <option value="forzar">Forzar actualizacion</option>
              </select>
              <select
                className="ter-select mnt-select"
                value={mhFlagFilter}
                onChange={(e) => setMhFlagFilter(e.target.value as MhFlagFilter)}
                style={{ maxWidth: 170 }}
                disabled={mhSyncBusy || busy}
                title="Filtra terceros con bandera MH pendiente o sin ella."
              >
                <option value="todos">MH: todos</option>
                <option value="pendiente">MH pendiente</option>
                <option value="ok">MH sin pendiente</option>
              </select>
              <button
                className="ter-btn mnt-btn"
                type="button"
                onClick={pedirConfirmacionMhSync}
                disabled={!canEdit || busy || mhSyncBusy || filtered.length === 0}
                title="Consulta la cedula en MH para los terceros filtrados y completa razon social, tipo id y bitacora fiscal."
              >
                {mhSyncBusy ? 'Consultando MH...' : 'Completar MH'}
              </button>
            </div>
            <input
              className="ter-input mnt-input ter-search"
              placeholder="Buscar por nombre, id, codigo, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {mhSyncProgress ? (
              <div className="ter-progress">
                <div className="ter-progress-bar">
                  <span style={{ width: `${Math.max(0, Math.min(100, (mhSyncProgress.current / Math.max(1, mhSyncProgress.total)) * 100))}%` }} />
                </div>
                <div className="ter-progress-meta">
                  <span><strong>MH</strong> {mhSyncProgress.current}/{mhSyncProgress.total}</span>
                  <span>{mhSyncProgress.cedula}</span>
                </div>
              </div>
            ) : (mhSyncStatus ? <div className="ter-status-line"><strong>MH</strong> {mhSyncStatus}</div> : null)}
            <div className="ter-list">
              {filtered.length === 0 ? <div className="ter-empty">Sin terceros para mostrar.</div> : filtered.map((r) => (
                <div key={r.id} className={`ter-item ${selectedId === r.id ? 'active' : ''}`} onClick={() => loadDetalle(r.id)}>
                  <div className="ter-item-name">{r.razon_social}</div>
                  <div className="ter-item-sub">
                    <span>{r.identificacion || '-'}</span>
                    {(selectedId === r.id && form.id === r.id ? form.codigo : r.codigo) ? (
                      <span className="ter-code-chip">{selectedId === r.id && form.id === r.id ? form.codigo : r.codigo}</span>
                    ) : null}
                    {(sortRoles(r.roles) || []).map((rol) => <span key={rol} className="ter-chip">{rol}</span>)}
                    {mhFlags[r.id] ? <span className="ter-flag-chip error" title={mhFlags[r.id]}>MH pendiente</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ter-card mnt-card">
            {selectedId && mhFlags[selectedId] ? (
              <div className="ter-inline-flag">
                <strong>MH pendiente:</strong> {mhFlags[selectedId]}
              </div>
            ) : null}
            <div className="ter-grid">
              <div className="ter-field">
                <label>Codigo</label>
                <input className="ter-input" value={form.codigo} disabled readOnly />
              </div>
              <div className="ter-field">
                <label>Tipo Id</label>
                <select className="ter-select" value={form.tipo_identificacion} disabled={!canEdit || busy} onChange={(e) => setForm((p) => ({ ...p, tipo_identificacion: e.target.value }))}>
                  <option value="">--</option>
                  <option value="01">01 Persona fisica</option>
                  <option value="02">02 Persona juridica</option>
                  <option value="03">03 DIMEX</option>
                  <option value="04">04 NITE</option>
                </select>
              </div>
              <div className="ter-field">
                <label>Identificacion</label>
                <input
                  className="ter-input"
                  value={form.identificacion}
                  disabled={!canEdit || busy || mhLookupBusy}
                  onChange={(e) => setForm((p) => ({ ...p, identificacion: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void consultarMhDesdeIdentificacion();
                    }
                  }}
                  placeholder={mhLookupBusy ? 'Consultando MH...' : ''}
                />
              </div>
              <div className="ter-field">
                <label>Razon social</label>
                <input className="ter-input" value={form.razon_social} disabled={!canEdit || busy} onChange={(e) => setForm((p) => ({ ...p, razon_social: e.target.value }))} />
              </div>
              <div className="ter-field">
                <label>Nombre comercial</label>
                <input className="ter-input" value={form.nombre_comercial} disabled={!canEdit || busy} onChange={(e) => setForm((p) => ({ ...p, nombre_comercial: e.target.value }))} />
              </div>
              <div className="ter-field">
                <label>Alias</label>
                <input className="ter-input" value={form.alias} disabled={!canEdit || busy} onChange={(e) => setForm((p) => ({ ...p, alias: e.target.value }))} />
              </div>
              <div className="ter-field">
                <label>Email</label>
                <input className="ter-input" type="email" value={form.email} disabled={!canEdit || busy} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="ter-field">
                <label>Telefono 1</label>
                <input className="ter-input" value={form.telefono_1} disabled={!canEdit || busy} onChange={(e) => setForm((p) => ({ ...p, telefono_1: e.target.value }))} />
              </div>
              <div className="ter-field">
                <label>Telefono 2</label>
                <input className="ter-input" value={form.telefono_2} disabled={!canEdit || busy} onChange={(e) => setForm((p) => ({ ...p, telefono_2: e.target.value }))} />
              </div>
            </div>

            <div className="ter-sec-title">Roles</div>
            <div className="ter-checks">
              {!rolFijo ? (
                <>
                  <label className="ter-check"><input type="checkbox" checked={roles.cliente} disabled={!canEdit || busy} onChange={(e) => setRoles((p) => ({ ...p, cliente: e.target.checked }))} />Cliente</label>
                  <label className="ter-check"><input type="checkbox" checked={roles.proveedor} disabled={!canEdit || busy} onChange={(e) => setRoles((p) => ({ ...p, proveedor: e.target.checked }))} />Proveedor</label>
                  <label className="ter-check"><input type="checkbox" checked={roles.contacto} disabled={!canEdit || busy} onChange={(e) => setRoles((p) => ({ ...p, contacto: e.target.checked }))} />Contacto</label>
                </>
              ) : (
                <span className="ter-chip">{rolFijo}</span>
              )}
              <label className="ter-check"><input type="checkbox" checked={form.activo} disabled={!canEdit || busy} onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))} />Activo</label>
            </div>

            {(modo !== 'proveedores') ? <><div className="ter-sec-title">Parametros Cliente</div>
            <div className="ter-grid">
              <div className="ter-field"><label>Limite credito</label><input className="ter-input num" type="number" step="0.01" value={cliente.limite_credito} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, limite_credito: toN(e.target.value, 0) }))} /></div>
              <div className="ter-field"><label>Dias credito</label><input className="ter-input num" type="number" value={cliente.dias_credito} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, dias_credito: toN(e.target.value, 0) }))} /></div>
              <div className="ter-field"><label>Moneda credito</label><select className="ter-select" value={cliente.moneda_credito} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, moneda_credito: e.target.value as any }))}><option value="CRC">CRC</option><option value="USD">USD</option><option value="AMBAS">AMBAS</option></select></div>
              <div className="ter-field"><label>Condicion pago</label><input className="ter-input" value={cliente.condicion_pago} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, condicion_pago: e.target.value }))} /></div>
              <div className="ter-field"><label>Clase cliente</label><input className="ter-input" value={cliente.clase_cliente} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, clase_cliente: e.target.value }))} /></div>
              <div className="ter-field"><label>Ubicacion</label><input className="ter-input" value={cliente.ubicacion} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, ubicacion: e.target.value }))} /></div>
              <div className="ter-field"><label>Desc max %</label><input className="ter-input num" type="number" step="0.01" value={cliente.descuento_maximo_pct} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, descuento_maximo_pct: toN(e.target.value, 0) }))} /></div>
              <div className="ter-field"><label>Escala precio</label><select className="ter-select" value={cliente.escala_precio} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, escala_precio: toN(e.target.value, 1) }))}><option value="1">Escala 1</option><option value="2">Escala 2</option><option value="3">Escala 3</option><option value="4">Escala 4</option></select></div>
              <div className="ter-field"><label>Aplica descuentos</label><select className="ter-select" value={cliente.aplica_descuentos ? '1' : '0'} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, aplica_descuentos: e.target.value === '1' }))}><option value="0">No</option><option value="1">Si</option></select></div>
              <div className="ter-field"><label>Exonerado</label><select className="ter-select" value={cliente.exonerado ? '1' : '0'} disabled={!canEdit || busy || !roles.cliente} onChange={(e) => setCliente((p) => ({ ...p, exonerado: e.target.value === '1' }))}><option value="0">No</option><option value="1">Si</option></select></div>
            </div></> : null}

            {(modo !== 'proveedores') ? <>
              <div className="ter-sec-title">Precios especiales</div>
              <div className="ter-sub" style={{ marginBottom: 8 }}>
                Defina excepciones por articulo para este cliente. Facturacion prioriza estos precios antes que la escala general.
              </div>
              <div className="ter-actions" style={{ marginTop: 0, marginBottom: 8 }}>
                <button className="ter-btn" type="button" onClick={addPrecioEspecial} disabled={!canEdit || busy || !roles.cliente}>Agregar articulo</button>
              </div>
              <div className="ter-table">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '46%' }}>Articulo</th>
                      <th style={{ width: '14%' }}>Escala</th>
                      <th style={{ width: '18%' }}>Precio</th>
                      <th style={{ width: '18%' }}>Desc. max %</th>
                      <th style={{ width: '4%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preciosEspeciales.length === 0 ? (
                      <tr><td colSpan={5} className="ter-empty">Sin precios especiales definidos.</td></tr>
                    ) : preciosEspeciales.map((row, idx) => (
                      <tr key={`${row.id || 'new'}-${idx}`}>
                        <td>
                          <select
                            className="ter-select"
                            value={row.producto_id ?? ''}
                            disabled={!canEdit || busy || !roles.cliente}
                            onChange={(e) => updatePrecioEspecial(idx, { producto_id: e.target.value ? Number(e.target.value) : null })}
                          >
                            <option value="">Seleccione articulo</option>
                            {productos.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.codigo ? `${p.codigo} · ` : ''}{p.descripcion}{p.codigo_barras ? ` · Barras ${p.codigo_barras}` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="ter-select"
                            value={row.escala_precio}
                            disabled={!canEdit || busy || !roles.cliente}
                            onChange={(e) => updatePrecioEspecial(idx, { escala_precio: toN(e.target.value, 1) })}
                          >
                            <option value="1">Escala 1</option>
                            <option value="2">Escala 2</option>
                            <option value="3">Escala 3</option>
                            <option value="4">Escala 4</option>
                          </select>
                        </td>
                        <td>
                          <input
                            className="ter-input num"
                            type="number"
                            step="0.01"
                            value={row.precio_venta}
                            disabled={!canEdit || busy || !roles.cliente}
                            onChange={(e) => updatePrecioEspecial(idx, { precio_venta: toN(e.target.value, 0) })}
                          />
                        </td>
                        <td>
                          <input
                            className="ter-input num"
                            type="number"
                            step="0.01"
                            value={row.descuento_maximo_pct}
                            disabled={!canEdit || busy || !roles.cliente}
                            onChange={(e) => updatePrecioEspecial(idx, { descuento_maximo_pct: toN(e.target.value, 0) })}
                          />
                        </td>
                        <td>
                          <button className="ter-btn" type="button" onClick={() => removePrecioEspecial(idx)} disabled={!canEdit || busy}>X</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </> : null}

            {(modo !== 'clientes') ? <><div className="ter-sec-title">Parametros Proveedor</div>
            <div className="ter-grid">
              <div className="ter-field"><label>Dias credito</label><input className="ter-input num" type="number" value={proveedor.dias_credito} disabled={!canEdit || busy || !roles.proveedor} onChange={(e) => setProveedor((p) => ({ ...p, dias_credito: toN(e.target.value, 0) }))} /></div>
              <div className="ter-field"><label>Condicion pago</label><input className="ter-input" value={proveedor.condicion_pago} disabled={!canEdit || busy || !roles.proveedor} onChange={(e) => setProveedor((p) => ({ ...p, condicion_pago: e.target.value }))} /></div>
              <div className="ter-field"><label>Clase proveedor</label><input className="ter-input" value={proveedor.clase_proveedor} disabled={!canEdit || busy || !roles.proveedor} onChange={(e) => setProveedor((p) => ({ ...p, clase_proveedor: e.target.value }))} /></div>
              <div className="ter-field"><label>Ubicacion</label><input className="ter-input" value={proveedor.ubicacion} disabled={!canEdit || busy || !roles.proveedor} onChange={(e) => setProveedor((p) => ({ ...p, ubicacion: e.target.value }))} /></div>
              <div className="ter-field"><label>Retencion %</label><input className="ter-input num" type="number" step="0.01" value={proveedor.retencion_pct} disabled={!canEdit || busy || !roles.proveedor} onChange={(e) => setProveedor((p) => ({ ...p, retencion_pct: toN(e.target.value, 0) }))} /></div>
              <div className="ter-field"><label>Aplica retencion</label><select className="ter-select" value={proveedor.aplica_retencion ? '1' : '0'} disabled={!canEdit || busy || !roles.proveedor} onChange={(e) => setProveedor((p) => ({ ...p, aplica_retencion: e.target.value === '1' }))}><option value="0">No</option><option value="1">Si</option></select></div>
              <div className="ter-field"><label>Exonerado</label><select className="ter-select" value={proveedor.exonerado ? '1' : '0'} disabled={!canEdit || busy || !roles.proveedor} onChange={(e) => setProveedor((p) => ({ ...p, exonerado: e.target.value === '1' }))}><option value="0">No</option><option value="1">Si</option></select></div>
              <div className="ter-field" style={{ gridColumn: '1 / -1' }}><label>Cuenta CXP (contabilidad)</label>
                <select className="ter-select" value={proveedor.cuenta_cxp_id ?? ''} disabled={!canEdit || busy || !roles.proveedor}
                  onChange={(e) => setProveedor((p) => ({ ...p, cuenta_cxp_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">— Sin asignar —</option>
                  {cuentasCXP.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
            </div></> : null}

            <div className="ter-sec-title">Contactos</div>
            <div className="ter-actions">
              <button className="ter-btn" type="button" onClick={addContacto} disabled={!canEdit || busy}>Agregar contacto</button>
            </div>
            <div className="ter-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '24%' }}>Nombre</th>
                    <th style={{ width: '18%' }}>Cargo</th>
                    <th style={{ width: '22%' }}>Email</th>
                    <th style={{ width: '16%' }}>Telefono</th>
                    <th style={{ width: '8%' }}>Principal</th>
                    <th style={{ width: '8%' }}>Activo</th>
                    <th style={{ width: '4%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {contactos.length === 0 ? (
                    <tr><td colSpan={7} className="ter-empty">Sin contactos.</td></tr>
                  ) : contactos.map((c, idx) => (
                    <tr key={`${c.id || 'new'}-${idx}`}>
                      <td><input type="text" value={c.nombre} disabled={!canEdit || busy} onChange={(e) => updateContacto(idx, 'nombre', e.target.value)} /></td>
                      <td><input type="text" value={c.cargo} disabled={!canEdit || busy} onChange={(e) => updateContacto(idx, 'cargo', e.target.value)} /></td>
                      <td><input type="email" value={c.email} disabled={!canEdit || busy} onChange={(e) => updateContacto(idx, 'email', e.target.value)} /></td>
                      <td><input type="text" value={c.telefono} disabled={!canEdit || busy} onChange={(e) => updateContacto(idx, 'telefono', e.target.value)} /></td>
                      <td><input type="checkbox" checked={c.es_principal} disabled={!canEdit || busy} onChange={(e) => updateContacto(idx, 'es_principal', e.target.checked)} /></td>
                      <td><input type="checkbox" checked={c.activo} disabled={!canEdit || busy} onChange={(e) => updateContacto(idx, 'activo', e.target.checked)} /></td>
                      <td><button className="ter-btn" type="button" onClick={() => removeContacto(idx)} disabled={!canEdit || busy}>X</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ter-actions">
              <button className="ter-btn main" type="button" onClick={saveGeneral} disabled={!canEdit || busy}>
                {busy ? 'Guardando...' : 'Guardar tercero'}
              </button>
              <button className="ter-btn" type="button" onClick={loadCatalogo} disabled={busy}>Recargar</button>
            </div>
          </div>
        </div>
      </div>
      {mhSyncConfirm ? (
        <div className="ter-modal-backdrop" onClick={() => (mhSyncBusy ? null : setMhSyncConfirm(null))}>
          <div className="ter-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ter-modal-title">Confirmar consulta masiva MH</div>
            <div className="ter-modal-sub">
              {mhSyncMode === 'forzar'
                ? `Se consultaran ${mhSyncConfirm.candidatos} tercero(s) filtrado(s) con cedula para refrescar razon social, tipo de identificacion y bitacora fiscal.`
                : `Se consultaran ${mhSyncConfirm.candidatos} tercero(s) incompleto(s) con cedula para completar razon social, tipo de identificacion y bitacora fiscal.`}
            </div>
            <div className="ter-modal-sub" style={{ marginTop: 8 }}>
              {mhSyncConfirm.omitidos} tercero(s) quedaran fuera por no aplicar al filtro o no tener cedula.
            </div>
            <div className="ter-modal-actions">
              <button className="ter-btn mnt-btn" type="button" onClick={() => setMhSyncConfirm(null)} disabled={mhSyncBusy}>Cancelar</button>
              <button className="ter-btn mnt-btn mnt-btn-primary main" type="button" onClick={() => void sincronizarTercerosDesdeMh()} disabled={mhSyncBusy}>
                {mhSyncBusy ? 'Consultando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
