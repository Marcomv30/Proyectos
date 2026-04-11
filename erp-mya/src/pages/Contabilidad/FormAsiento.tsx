import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';
import { getNivelCuenta } from '../../utils/cuentas';

interface Linea {
  id?: number;
  cuenta_id: number | null;
  cuenta_codigo: string;
  cuenta_nombre: string;
  descripcion: string;
  referencia: string;
  debito_crc: number;
  credito_crc: number;
  debito_usd: number;
  credito_usd: number;
}

interface Props {
  empresaId: number;
  asiento?: any;
  onGuardar: () => void;
  onCancelar: () => void;
}

interface CategoriaEfectiva {
  categoria_id: number;
  categoria_base_id: number;
  codigo: string;
  descripcion: string;
  tipo_id: number | null;
  activo: boolean;
  modo: 'override_empresa' | 'herencia_base';
}

const styles = `
  .fa-wrap { max-width:1300px; margin:0 auto; color:#d6e2ff; }
  .fa-topbar { display:flex; align-items:center; gap:12px; margin-bottom:24px; }
  .btn-back { display:flex; align-items:center; gap:6px; padding:8px 14px;
    background:#243149; border:1px solid rgba(137,160,201,0.18); border-radius:10px;
    color:#d6e2ff; font-size:13px; font-weight:700; cursor:pointer; }
  .btn-back:hover { background:#2b3a53; }
  .fa-page-title { font-size:18px; font-weight:700; color:#f3f7ff; }
  .fa-num-badge { font-family:'DM Mono',monospace; font-size:14px; font-weight:700;
    color:#9df4c7; background:#123224; padding:4px 12px; border-radius:10px;
    border:1px solid #1d6e4f; }
  .fa-norma-badge { font-size:11px; font-weight:700; color:#15803d;
    background:#16263f; padding:4px 10px; border-radius:10px; border:1px solid #355da8; color:#9ec3ff;
    letter-spacing:.03em; text-transform:uppercase; }
  .fa-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px;
    padding:24px; margin-bottom:16px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .fa-section-title { font-size:11px; font-weight:600; color:#16a34a;
    letter-spacing:0.08em; text-transform:uppercase; margin-bottom:18px;
    padding-bottom:8px; border-bottom:1px solid rgba(29,110,79,0.36); color:#9df4c7; }
  .fa-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .fa-grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
  .fa-group { display:flex; flex-direction:column; gap:5px; }
  .fa-group.span2 { grid-column:span 2; }
  .fa-group.span3 { grid-column:span 3; }
  .fa-label { font-size:11px; font-weight:700; color:#8ea3c7;
    letter-spacing:0.04em; text-transform:uppercase; }
  .fa-input { padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px;
    font-size:13px; color:#f3f7ff; font-family:'DM Sans',sans-serif; background:#1d2738;
    outline:none; transition:border-color 0.2s; width:100%; }
  .fa-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .fa-input:disabled { background:#111827; color:#7184a8; }
  .fa-input-error { border-color:#ef4444 !important; box-shadow:0 0 0 3px rgba(239,68,68,0.12) !important; }
  .fa-field-error { margin-top:4px; font-size:11px; color:#dc2626; }

  /* Tabla de lineas */
  .lineas-table-wrap { overflow-x:auto; }
  .lineas-table { width:100%; border-collapse:collapse; min-width:760px; table-layout:auto; }
  .lineas-table th { padding:10px 12px; text-align:left; font-size:11px; font-weight:600;
    color:#8ea3c7; letter-spacing:0.05em; text-transform:uppercase;
    background:#131b2a; border-bottom:1px solid rgba(137,160,201,0.16); }
  .lineas-table td { padding:8px 6px; border-bottom:1px solid rgba(137,160,201,0.12); vertical-align:middle; color:#d6e2ff; }
  .lineas-table tr:last-child td { border-bottom:none; }
  .lineas-table th:nth-child(1), .lineas-table td:nth-child(1) { width:34px; }
  .lineas-table th:nth-child(2), .lineas-table td:nth-child(2) { width:240px; }
  .lineas-table th:nth-last-child(1), .lineas-table td:nth-last-child(1) { width:40px; }
  .linea-input { padding:8px 10px; border:1px solid rgba(137,160,201,0.22); border-radius:10px;
    font-size:12px; color:#f3f7ff; font-family:'DM Sans',sans-serif; background:#1d2738;
    outline:none; width:100%; transition:border-color 0.2s; }
  .linea-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .linea-input.mono { font-family:'DM Mono',monospace; text-align:right; }
  .linea-input.cuenta { font-family:'DM Mono',monospace; width:100%; }
  .linea-cuenta-wrap { display:flex; align-items:center; gap:4px; }
  .linea-cuenta-nombre { margin-top:4px; font-size:11px; color:#9df4c7; line-height:1.2; }
  .btn-cuenta-modal { width:34px; min-width:34px; height:34px; padding:0; display:inline-flex;
    align-items:center; justify-content:center; background:#243149; border:1px solid rgba(76,123,247,0.34);
    border-radius:9px; color:#9ec3ff; font-size:14px; cursor:pointer; white-space:nowrap; }
  .btn-cuenta-modal:hover { background:#2c3c58; }
  .btn-cuenta-nueva { width:34px; min-width:34px; height:34px; padding:0; display:inline-flex;
    align-items:center; justify-content:center; background:#123224; border:1px solid #1d6e4f;
    border-radius:9px; color:#9df4c7; font-size:16px; cursor:pointer; white-space:nowrap; }
  .btn-cuenta-nueva:hover { filter:brightness(1.06); }
  .btn-add-linea { display:flex; align-items:center; gap:6px; padding:8px 16px;
    background:#243149; border:1px solid rgba(76,123,247,0.34); border-radius:10px;
    color:#9ec3ff; font-size:13px; font-weight:700; cursor:pointer;
    margin-top:12px; transition:all 0.15s; }
  .btn-add-linea:hover { background:#2c3c58; color:white; }
  .btn-del-linea { padding:5px 8px; background:#fef2f2; border:1px solid #fecaca;
    border-radius:8px; color:#ffb3bb; font-size:12px; cursor:pointer; background:#34181c; border-color:#7d2f3a; }
  .btn-del-linea:hover { filter:brightness(1.06); color:white; }

  /* Totales */
  .totales-bar { display:flex; gap:16px; align-items:center; justify-content:flex-end;
    padding:16px 0; border-top:2px solid rgba(137,160,201,0.16); margin-top:8px; flex-wrap:wrap; }
  .total-item { display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
  .total-label { font-size:11px; color:#8ea3c7; font-weight:700; text-transform:uppercase; }
  .total-value { font-size:16px; font-weight:700; font-family:'DM Mono',monospace; }
  .total-ok { color:#16a34a; }
  .total-error { color:#dc2626; }
  .balance-ok { padding:8px 16px; background:#0f2c20; border:1px solid #1d6e4f;
    border-radius:10px; color:#9df4c7; font-size:13px; font-weight:700; }
  .balance-error { padding:8px 16px; background:#34181c; border:1px solid #7d2f3a;
    border-radius:10px; color:#ffb3bb; font-size:13px; font-weight:700; }

  /* Footer */
  .fa-footer { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }
  .btn-borrador { padding:11px 20px; background:#332914; border:1px solid #936b1d;
    border-radius:10px; color:#ffd66f; font-size:13px; font-weight:700; cursor:pointer; }
  .btn-borrador:hover { background:#3a311b; }
  .btn-confirmar { padding:11px 24px; background:linear-gradient(135deg,#17a34a,#22c55e);
    border:none; border-radius:10px; color:white; font-size:14px;
    font-weight:700; cursor:pointer; transition:opacity 0.2s; box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .btn-confirmar:hover { opacity:0.95; }
  .btn-confirmar:disabled { opacity:0.6; cursor:not-allowed; }
  .btn-cancelar { padding:11px 20px; background:#243149; border:1px solid rgba(137,160,201,0.18);
    border-radius:10px; color:#d6e2ff; font-size:13px; font-weight:700; cursor:pointer; }
  .btn-cancelar:hover { background:#2b3a53; }
  .fa-success { padding:12px 16px; background:#0f2c20; border:1px solid #1d6e4f;
    border-radius:12px; color:#9df4c7; font-size:13px; font-weight:700; margin-bottom:16px; }

  /* Busqueda cuenta */
  .cuenta-search-wrap { position:relative; }
  .cuenta-dropdown { position:absolute; top:100%; left:0; right:0; background:#172131;
    border:1px solid rgba(137,160,201,0.18); border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.28);
    z-index:100; max-height:200px; overflow-y:auto; }
  .cuenta-option { padding:8px 12px; cursor:pointer; font-size:12px;
    border-bottom:1px solid rgba(137,160,201,0.12); transition:background 0.1s; color:#d6e2ff; }
  .cuenta-option:hover { background:#1d2738; }
  .cuenta-option-codigo { font-family:'DM Mono',monospace; color:#9df4c7; font-weight:700; }
  .cuenta-option-nombre { color:#d6e2ff; margin-left:8px; }
  .cuenta-modal-backdrop { position:fixed; inset:0; background:rgba(6,10,18,0.72);
    z-index:1200; display:flex; align-items:center; justify-content:center; padding:20px; }
  .cuenta-modal { width:min(980px, 96vw); max-height:85vh; overflow:hidden; background:#172131;
    border:1px solid rgba(137,160,201,0.18); border-radius:16px; box-shadow:0 24px 60px rgba(0,0,0,0.34);
    display:flex; flex-direction:column; }
  .cuenta-modal-head { display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px; border-bottom:1px solid rgba(137,160,201,0.16); }
  .cuenta-modal-title { font-size:14px; font-weight:700; color:#f3f7ff; }
  .cuenta-modal-close { background:#243149; border:1px solid rgba(137,160,201,0.18); border-radius:10px;
    padding:6px 10px; cursor:pointer; font-size:12px; color:#d6e2ff; }
  .cuenta-modal-body { padding:12px 16px; overflow:auto; }
  .cuenta-modal-search { margin-bottom:10px; }
  .cuenta-modal-table { width:100%; border-collapse:collapse; min-width:640px; }
  .cuenta-modal-table th { text-align:left; font-size:11px; color:#8ea3c7; text-transform:uppercase;
    letter-spacing:.05em; padding:8px; border-bottom:1px solid rgba(137,160,201,0.16); background:#131b2a; }
  .cuenta-modal-table td { padding:8px; border-bottom:1px solid rgba(137,160,201,0.12); font-size:12px; color:#d6e2ff; }
  .cuenta-modal-table tr:hover td { background:#1d2738; }
  .cuenta-modal-row-n4 td { opacity:0.82; background:rgba(125,47,58,0.22); }
  .cuenta-modal-codigo { font-family:'DM Mono',monospace; color:#9df4c7; font-weight:700; }
  .btn-cuenta-select { padding:5px 10px; border:1px solid #1d6e4f; background:#123224; border-radius:9px;
    color:#9df4c7; font-size:12px; cursor:pointer; }
  .btn-cuenta-select:hover { filter:brightness(1.06); }
  .btn-cuenta-select:disabled { border-color:rgba(137,160,201,0.14); background:#1b2433; color:#7184a8; cursor:not-allowed; }
  .cuenta-modal-toolbar { display:flex; gap:8px; align-items:center; margin-bottom:10px; }
  .cuenta-modal-toolbar .fa-input { margin:0; }
  .btn-cuenta-nueva-modal { padding:8px 12px; border:1px solid #1d6e4f; background:#123224; border-radius:10px;
    color:#9df4c7; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; }
  .btn-cuenta-nueva-modal:hover { filter:brightness(1.06); }
  .cuenta-nueva-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
  .cuenta-nueva-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
  .cuenta-help { font-size:11px; color:#8ea3c7; margin-top:6px; }
  .cuenta-error { margin-top:8px; font-size:12px; color:#ffb3bb; }
  .cuenta-success { margin-top:8px; font-size:12px; color:#9df4c7; }
  .estado-view { display:inline-flex; align-items:center; padding:4px 12px;
    border-radius:8px; font-size:13px; font-weight:600; }
  .estado-view.CONFIRMADO { background:#0f2c20; color:#9df4c7; }
  .estado-view.ANULADO { background:#34181c; color:#ffb3bb; }
  .estado-view.BORRADOR { background:#332914; color:#ffd66f; }

  @media (max-width: 980px) {
    .fa-wrap { max-width:100%; }
    .fa-card { padding:16px; }
    .fa-grid { grid-template-columns:1fr 1fr; gap:12px; }
    .fa-grid-4 { grid-template-columns:1fr 1fr; gap:12px; }
    .fa-group.span2, .fa-group.span3 { grid-column:span 2; }
  }

  @media (max-width: 680px) {
    .fa-topbar { flex-wrap:wrap; gap:8px; margin-bottom:16px; }
    .fa-page-title { font-size:16px; }
    .fa-num-badge { font-size:12px; }
    .fa-grid, .fa-grid-4 { grid-template-columns:1fr; gap:10px; }
    .fa-group.span2, .fa-group.span3 { grid-column:span 1; }
    .lineas-table { min-width:920px; }
    .lineas-table th { font-size:10px; padding:8px 10px; }
    .lineas-table td { padding:7px 5px; }
    .fa-footer { flex-direction:column; }
    .btn-cancelar, .btn-borrador, .btn-confirmar { width:100%; }
    .totales-bar { justify-content:flex-start; gap:10px; }
    .total-item { align-items:flex-start; }
  }
`;

const lineaVacia = (): Linea => ({
  cuenta_id: null, cuenta_codigo: '', cuenta_nombre: '',
  descripcion: '', referencia: '', debito_crc: 0, credito_crc: 0,
  debito_usd: 0, credito_usd: 0,
});

function BuscarCuenta({ value, onChange, empresaId }: {
  value: string;
  onChange: (cuenta: any) => void;
  empresaId: number;
}) {
  const [query, setQuery] = useState(value);
  const [resultados, setResultados] = useState<any[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState('');
  const [modalRows, setModalRows] = useState<any[]>([]);
  const [crearOpen, setCrearOpen] = useState(false);
  const [crearGuardando, setCrearGuardando] = useState(false);
  const [crearError, setCrearError] = useState('');
  const [crearOk, setCrearOk] = useState('');
  const [crearForm, setCrearForm] = useState({ codigo: '', nombre: '' });
  const [crearCuentaExistente, setCrearCuentaExistente] = useState<{ id: number; nombre: string } | null>(null);
  const [crearRuta, setCrearRuta] = useState<Array<{ nivel: number; codigo: string; nombre: string; existe: boolean }>>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const modalInputRef = useRef<HTMLInputElement | null>(null);
  const crearCodigoRef = useRef<HTMLInputElement | null>(null);
  const crearNombreRef = useRef<HTMLInputElement | null>(null);
  const crearBtnRef = useRef<HTMLButtonElement | null>(null);

  const formatearCodigoCuenta = (raw: string) => {
    const digits = String(raw || '').replace(/[oO]/g, '0').replace(/\D/g, '').slice(0, 12);
    const p1 = digits.slice(0, 4);
    const p2 = digits.slice(4, 6);
    const p3 = digits.slice(6, 9);
    const p4 = digits.slice(9, 12);
    return [p1, p2, p3, p4].filter(Boolean).join('-');
  };

  const formatearCodigoProgresivo = (raw: string) => {
    const digits = String(raw || '').replace(/[oO]/g, '0').replace(/\D/g, '').slice(0, 12);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
    if (digits.length <= 9) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 9)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 9)}-${digits.slice(9, 12)}`;
  };

  const nivelPorDigitos = (digitsLen: number) => {
    if (digitsLen === 2) return 1;
    if (digitsLen === 4) return 2;
    if (digitsLen === 6) return 3;
    if (digitsLen === 9) return 4;
    if (digitsLen === 12) return 5;
    return null;
  };

  const codigoNivelDesdeDigitos = (digits: string, nivel: number) => {
    if (nivel === 1) return digits.slice(0, 2);
    if (nivel === 2) return digits.slice(0, 4);
    if (nivel === 3) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
    if (nivel === 4) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 9)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 9)}-${digits.slice(9, 12)}`;
  };

  const inferNivel = (codigo: string) => {
    const c = String(codigo || '').trim();
    if (/^\d{2}$/.test(c)) return 1;
    if (/^\d{4}$/.test(c)) return 2;
    if (/^\d{4}-\d{2}$/.test(c)) return 3;
    if (/^\d{4}-\d{2}-\d{3}$/.test(c)) return 4;
    if (/^\d{4}-\d{2}-\d{3}-\d{3}$/.test(c)) return 5;
    return null;
  };

  const normalizarCuenta = (row: any, source: 'base' | 'empresa') => {
    const nivel = source === 'base'
      ? Number(row?.nivel || 0)
      : Number(row?.plan_cuentas_base?.nivel || inferNivel(row?.codigo) || 0);
    return {
      id: row?.id,
      codigo: row?.codigo,
      nombre: row?.nombre,
      nivel,
      acepta_movimiento: Number(nivel) === 5,
      source,
    };
  };

  const consultarCuentas = async (q: string, limit = 500) => {
    const filtro = String(q || '').trim();
    const filtroOr = filtro ? `codigo.ilike.%${filtro}%,nombre.ilike.%${filtro}%` : 'codigo.ilike.%%';
    const [baseResp, empResp] = await Promise.all([
      supabase
        .from('plan_cuentas_base')
        .select('id, codigo, nombre, nivel')
        .eq('activo', true)
        .in('nivel', [4, 5])
        .or(filtroOr)
        .order('codigo')
        .limit(limit),
      supabase
        .from('plan_cuentas_empresa')
        .select('id, codigo, nombre, cuenta_base_id, plan_cuentas_base(nivel)')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .or(filtroOr)
        .order('codigo')
        .limit(limit),
    ]);
    const map = new Map<string, any>();
    const baseByCodigo = new Map<string, any>();
    (baseResp.data || []).forEach((r: any) => {
      const n = normalizarCuenta(r, 'base');
      baseByCodigo.set(String(n.codigo), n);
      map.set(String(n.codigo), n);
    });
    (empResp.data || []).forEach((r: any) => {
      const n = normalizarCuenta(r, 'empresa');
      const baseMatch = baseByCodigo.get(String(n.codigo));
      const baseId = Number(r?.cuenta_base_id || baseMatch?.id || 0) || null;
      const nivel = Number(n?.nivel || 0);
      const usa = {
        ...n,
        id: baseId,
        empresa_id: Number(r?.id || 0) || null,
        cuenta_base_id: baseId,
        acepta_movimiento: nivel === 5 && !!baseId,
      };
      map.set(String(usa.codigo), usa);
    });
    return Array.from(map.values())
      .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || '')));
  };

  const buscar = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResultados([]); return; }
    const all = await consultarCuentas(q, 20);
    const filtradas = all.filter((x) => getNivelCuenta(x.codigo) >= 4).slice(0, 10);
    setResultados(filtradas);
    setAbierto(filtradas.length > 0);
  };

  const seleccionar = (cuenta: any) => {
    setQuery(cuenta.codigo);
    setAbierto(false);
    setModalOpen(false);
    setCrearOpen(false);
    onChange(cuenta);
  };

  const cargarModalRows = async (q = modalQuery) => {
    const rows = await consultarCuentas(q, 500);
    setModalRows(rows);
  };

  const abrirModal = async (q = '') => {
    setModalQuery(q);
    setModalOpen(true);
    await cargarModalRows(q);
  };

  const validarCuentaDigitada = async () => {
    const q = query.trim();
    if (!q) {
      await abrirModal('');
      return;
    }

    const qMascara = formatearCodigoCuenta(q);

    const exactas = await consultarCuentas(q, 100);
    const exacta = exactas.find((x) => String(x.codigo || '').toUpperCase() === q.toUpperCase() && Number(x.nivel) === 5);

    if (exacta) {
      seleccionar(exacta);
      return;
    }

    if (qMascara && qMascara !== q) {
      const exactasMascara = await consultarCuentas(qMascara, 100);
      const exactaMascara = exactasMascara.find((x) => String(x.codigo || '').toUpperCase() === qMascara.toUpperCase() && Number(x.nivel) === 5);

      if (exactaMascara) {
        seleccionar(exactaMascara);
        return;
      }
    }

    await abrirModal('');
  };

  const abrirCrearCuenta = () => {
    setCrearError('');
    setCrearOk('');
    setCrearCuentaExistente(null);
    const sugerido = formatearCodigoCuenta(modalQuery || query);
    const sugeridoDigitos = sugerido.replace(/\D/g, '');
    const codigoInicial = sugeridoDigitos.length >= 12 ? '' : sugerido;
    setCrearForm({
      codigo: codigoInicial,
      nombre: '',
    });
    setCrearOpen(true);
    setTimeout(() => crearCodigoRef.current?.focus(), 0);
  };

  const guardarCuentaNueva = async () => {
    setCrearError('');
    setCrearOk('');
    const codigo = formatearCodigoProgresivo(String(crearForm.codigo || '').trim());
    const nombre = String(crearForm.nombre || '').trim().toUpperCase();
    const digits = String(codigo || '').replace(/[oO]/g, '0').replace(/\D/g, '');
    const nivel = nivelPorDigitos(digits.length);

    if (!codigo || !nombre) {
      setCrearError('Codigo y nombre son requeridos.');
      return;
    }
    if (!nivel) {
      setCrearError('Complete un nivel valido: 00, 0000, 0000-00, 0000-00-000 o 0000-00-000-000.');
      return;
    }
    if (nivel < 5) {
      setCrearError('Complete el codigo hasta nivel 5 para habilitar la creacion.');
      return;
    }

    setCrearGuardando(true);
    const niveles = [1, 2, 3, 4, 5].filter((n) => n <= nivel);
    const codigosNivel = niveles.map((n) => codigoNivelDesdeDigitos(digits, n));
    const creadas: string[] = [];

    let cuentaFinal: { id: number; codigo: string; nombre: string } | null = null;
    for (let i = 0; i < codigosNivel.length; i += 1) {
      const cod = codigosNivel[i];
      const nivelActual = niveles[i];

      const { data: existente, error: errExiste } = await supabase
        .from('plan_cuentas_empresa')
        .select('id, codigo, nombre')
        .eq('empresa_id', empresaId)
        .eq('codigo', cod)
        .maybeSingle();
      if (errExiste) {
        setCrearGuardando(false);
        setCrearError(errExiste.message || 'No se pudo validar la cuenta.');
        return;
      }

      if (existente?.id) {
        if (nivelActual === nivel) {
          cuentaFinal = {
            id: Number(existente.id),
            codigo: String(existente.codigo || cod),
            nombre: String(existente.nombre || ''),
          };
        }
        continue;
      }

      const nombreInsert = nivelActual === nivel
        ? nombre
        : `NIVEL ${nivelActual} ${cod}`;

      const { data: creada, error: errCrear } = await supabase
        .from('plan_cuentas_empresa')
        .insert({
          empresa_id: empresaId,
          cuenta_base_id: null,
          codigo: cod,
          nombre: nombreInsert,
          activo: true,
        })
        .select('id, codigo, nombre')
        .single();

      if (errCrear) {
        setCrearGuardando(false);
        setCrearError(errCrear.message || `No se pudo crear la cuenta ${cod}.`);
        return;
      }

      creadas.push(cod);
      if (nivelActual === nivel) {
        cuentaFinal = {
          id: Number(creada.id),
          codigo: String(creada.codigo || cod),
          nombre: String(creada.nombre || nombreInsert),
        };
      }
    }
    setCrearGuardando(false);

    if (!cuentaFinal) {
      setCrearError('No se pudo resolver la cuenta final.');
      return;
    }

    if (nivel === 5) {
      setCrearOk(
        creadas.length > 0
          ? `Cuenta creada. Niveles registrados: ${creadas.join(', ')}.`
          : `La cuenta ${cuentaFinal.codigo} ya existia.`
      );
      seleccionar({
        id: cuentaFinal.id,
        codigo: cuentaFinal.codigo,
        nombre: cuentaFinal.nombre,
        nivel: 5,
        acepta_movimiento: true,
      });
      return;
    }

    setCrearOk(
      creadas.length > 0
        ? `Niveles registrados: ${creadas.join(', ')}.`
        : `La cuenta ${cuentaFinal.codigo} ya existia.`
    );
  };

  useEffect(() => {
    if (!crearOpen) {
      setCrearCuentaExistente(null);
      setCrearRuta([]);
      return;
    }
    const codigo = formatearCodigoProgresivo(String(crearForm.codigo || '').trim());
    const digits = String(codigo || '').replace(/[oO]/g, '0').replace(/\D/g, '');
    const nivel = nivelPorDigitos(digits.length);
    if (!codigo || !nivel) {
      setCrearCuentaExistente(null);
      setCrearRuta([]);
      return;
    }

    let cancelado = false;
    const t = setTimeout(async () => {
      const niveles = [1, 2, 3, 4, 5].filter((n) => n <= nivel);
      const codigosNivel = niveles.map((n) => codigoNivelDesdeDigitos(digits, n));
      const consultas = await Promise.all(
        codigosNivel.map((cod) =>
          supabase
            .from('plan_cuentas_empresa')
            .select('id, nombre')
            .eq('empresa_id', empresaId)
            .eq('codigo', cod)
            .maybeSingle()
        )
      );
      if (cancelado) return;

      const ruta = niveles.map((n, i) => ({
        nivel: n,
        codigo: codigosNivel[i],
        nombre: String(consultas[i].data?.nombre || ''),
        existe: !!consultas[i].data?.id,
      }));
      setCrearRuta(ruta);

      const { data } = await supabase
        .from('plan_cuentas_empresa')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .eq('codigo', codigoNivelDesdeDigitos(digits, nivel))
        .maybeSingle();
      if (cancelado) return;
      if (data?.id) {
        setCrearCuentaExistente({ id: Number(data.id), nombre: String(data.nombre || '') });
      } else {
        setCrearCuentaExistente(null);
      }
    }, 180);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [crearOpen, crearForm.codigo, empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!crearOpen || crearRuta.length === 0) return;
    const ultimo = crearRuta[crearRuta.length - 1];
    if (!ultimo || ultimo.existe) return;
    if (document.activeElement === crearCodigoRef.current) {
      setTimeout(() => crearNombreRef.current?.focus(), 0);
    }
  }, [crearOpen, crearRuta]);

  const modalRowsFiltradas = modalRows.filter((r) => {
    const filtro = modalQuery.trim().toLowerCase();
    if (!filtro) return true;
    return String(r.codigo || '').toLowerCase().includes(filtro)
      || String(r.nombre || '').toLowerCase().includes(filtro);
  });

  useEffect(() => {
    if (!modalOpen) return;
    inputRef.current?.blur();
    const t = setTimeout(() => {
      modalInputRef.current?.focus();
      modalInputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [modalOpen]);

  const crearCodigoNormalizado = formatearCodigoProgresivo(String(crearForm.codigo || '').trim());
  const crearDigits = String(crearCodigoNormalizado || '').replace(/[oO]/g, '0').replace(/\D/g, '');
  const crearNivelActual = nivelPorDigitos(crearDigits.length);
  const puedeCrearCuentaNivel5 = crearNivelActual === 5 && String(crearForm.nombre || '').trim().length > 0;

  return (
    <>
      <div className="linea-cuenta-wrap">
        <div className="cuenta-search-wrap">
          <input ref={inputRef} className="linea-input cuenta"
            value={query}
            onChange={e => {
              const raw = e.target.value;
              const tieneLetras = /[A-Za-z]/.test(raw);
              const next = tieneLetras ? raw : formatearCodigoCuenta(raw);
              buscar(next);
            }}
            onFocus={() => query.length >= 2 && setAbierto(true)}
            onKeyDown={async (e) => {
              if (e.key === 'F3') {
                e.preventDefault();
                await abrirModal('');
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                await validarCuentaDigitada();
              }
            }}
            placeholder="Codigo o nombre"
          />
          {abierto && resultados.length > 0 && (
            <div className="cuenta-dropdown">
              {resultados.map(c => (
                <div key={`${c.source || 'x'}-${c.id}`} className="cuenta-option" onClick={() => seleccionar(c)}>
                  <span className="cuenta-option-codigo" style={getNivelCuenta(c.codigo) === 4 ? { fontWeight: 700, color: '#facc15' } : {}}>{c.codigo}</span>
                  <span className="cuenta-option-nombre" style={getNivelCuenta(c.codigo) === 4 ? { fontWeight: 700 } : {}}>{c.nombre}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn-cuenta-modal"
          onClick={() => abrirModal('')}
          title="Buscar cuentas (F3)"
          aria-label="Buscar cuentas (F3)"
        >
          🔍
        </button>
        <button
          type="button"
          className="btn-cuenta-nueva"
          onClick={abrirCrearCuenta}
          title="Crear cuenta nueva"
          aria-label="Crear cuenta nueva"
        >
          +
        </button>
      </div>

      {modalOpen && (
        <div className="cuenta-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="cuenta-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cuenta-modal-head">
              <div className="cuenta-modal-title">Seleccionar cuenta contable</div>
              <button type="button" className="cuenta-modal-close" onClick={() => setModalOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="cuenta-modal-body">
              <div className="cuenta-modal-toolbar">
                <input
                  ref={modalInputRef}
                  className="fa-input"
                  value={modalQuery}
                  placeholder="Filtrar por codigo o nombre"
                  onChange={(e) => setModalQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setModalOpen(false);
                    }
                  }}
                />
                <button type="button" className="btn-cuenta-nueva-modal" onClick={abrirCrearCuenta}>
                  + Nueva cuenta
                </button>
              </div>
              <table className="cuenta-modal-table">
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Nombre</th>
                    <th style={{ width: '90px' }}>Nivel</th>
                    <th style={{ width: '110px' }}>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {modalRowsFiltradas.map((c) => {
                    const esSeleccionable = Number(c.nivel) === 5 && !!c.id;
                    return (
                      <tr
                        key={`${c.source || 'x'}-${c.id}`}
                        className={!esSeleccionable ? 'cuenta-modal-row-n4' : ''}
                        onDoubleClick={() => { if (esSeleccionable) seleccionar(c); }}
                        style={{ cursor: esSeleccionable ? 'pointer' : 'default' }}
                      >
                        <td className="cuenta-modal-codigo">{c.codigo}</td>
                        <td>{c.nombre}</td>
                        <td>{c.nivel ?? '-'}</td>
                        <td>
                          {esSeleccionable ? (
                            <button
                              type="button"
                              className="btn-cuenta-select"
                              onClick={() => seleccionar(c)}
                            >
                              Usar
                            </button>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {modalRowsFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#6b7280' }}>
                        No se encontraron cuentas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {crearOpen && (
        <div className="cuenta-modal-backdrop" onClick={() => setCrearOpen(false)}>
          <div className="cuenta-modal" style={{ width: 'min(700px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="cuenta-modal-head">
              <div className="cuenta-modal-title">Nueva cuenta contable</div>
              <button type="button" className="cuenta-modal-close" onClick={() => setCrearOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="cuenta-modal-body">
              <div className="cuenta-nueva-grid">
                <div>
                  <label className="fa-label">Codigo</label>
                  <input
                    ref={crearCodigoRef}
                    className="fa-input"
                    value={crearForm.codigo}
                    placeholder="00 / 0000 / 0000-00 / 0000-00-000 / 0000-00-000-000"
                    onChange={(e) => setCrearForm((p) => ({
                      ...p,
                      codigo: formatearCodigoProgresivo(e.target.value),
                    }))}
                  />
                  <div className="cuenta-help">
                    Digite secuencialmente. El sistema detecta el nivel por lo escrito y muestra la ruta encontrada.
                  </div>
                  {crearCuentaExistente && (
                    <div className="cuenta-success">Cuenta existente: {crearCuentaExistente.nombre}</div>
                  )}
                </div>
                <div>
                  <label className="fa-label">Nombre</label>
                  <input
                    ref={crearNombreRef}
                    className="fa-input"
                    value={crearForm.nombre}
                    placeholder="Nombre de la cuenta"
                    onChange={(e) => setCrearForm((p) => ({ ...p, nombre: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      if (puedeCrearCuentaNivel5) {
                        crearBtnRef.current?.focus();
                      }
                    }}
                  />
                </div>
              </div>
              {crearRuta.length > 0 && (
                <div style={{ marginTop: '4px', marginBottom: '8px', fontSize: '12px' }}>
                  {crearRuta.map((r) => (
                    <div key={`${r.nivel}-${r.codigo}`} style={{ color: r.existe ? '#166534' : '#b45309' }}>
                      {r.existe ? '✓' : '•'} Nivel {r.nivel}: {r.codigo} {r.existe ? `- ${r.nombre}` : '- temporal (se crea al guardar)'}
                    </div>
                  ))}
                </div>
              )}
              {crearError && <div className="cuenta-error">{crearError}</div>}
              {crearOk && <div className="cuenta-success">{crearOk}</div>}
              <div className="cuenta-nueva-actions">
                <button type="button" className="cuenta-modal-close" onClick={() => setCrearOpen(false)}>
                  Cancelar
                </button>
                <button
                  ref={crearBtnRef}
                  type="button"
                  className="btn-cuenta-nueva-modal"
                  onClick={guardarCuentaNueva}
                  disabled={crearGuardando || !puedeCrearCuentaNivel5}
                >
                  {crearGuardando ? 'Guardando...' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
export default function FormAsiento({ empresaId, asiento, onGuardar, onCancelar }: Props) {
  const [categorias, setCategorias] = useState<CategoriaEfectiva[]>([]);
  const [form, setForm] = useState({
    categoria_id: asiento?.categoria_id || '',
    fecha: asiento?.fecha || new Date().toISOString().split('T')[0],
    descripcion: asiento?.descripcion || '',
    moneda: asiento?.moneda || 'CRC',
    tipo_cambio: asiento?.tipo_cambio || 1,
  });
  const [lineas, setLineas] = useState<Linea[]>(
    asiento ? [] : [lineaVacia(), lineaVacia()]
  );
  const [numeroFormato, setNumeroFormato] = useState(asiento?.numero_formato || '');
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState('');
  const [tcCargando, setTcCargando] = useState(false);
  const [tcFocused, setTcFocused] = useState(false);
  const [tcDraft, setTcDraft] = useState('');
  const [activeMoneyField, setActiveMoneyField] = useState<string | null>(null);
  const [moneyDrafts, setMoneyDrafts] = useState<Record<string, string>>({});
  const [focusNewLineCode, setFocusNewLineCode] = useState(false);
  const [periodoContable, setPeriodoContable] = useState<{
    loaded: boolean;
    activo: boolean;
    inicio: string | null;
    fin: string | null;
    fiscalInicio: string | null;
    fiscalFin: string | null;
  }>({ loaded: false, activo: false, inicio: null, fin: null, fiscalInicio: null, fiscalFin: null });
  const formWrapRef = useRef<HTMLDivElement | null>(null);
  const esVista = asiento?.estado === 'CONFIRMADO' || asiento?.estado === 'ANULADO';
  const fmtDateDDMMYYYY = (iso: string | null | undefined) => {
    if (!iso) return '';
    const [yyyy, mm, dd] = String(iso).split('-');
    if (!yyyy || !mm || !dd) return String(iso);
    return `${dd}/${mm}/${yyyy}`;
  };
  const categoriaError = !esVista && !form.categoria_id
    ? 'Debe seleccionar una categoria.'
    : '';

  const fechaError = (() => {
    if (esVista) return '';
    if (!periodoContable.loaded) return '';
    if (!form.fecha) return 'Debe indicar la fecha del asiento.';

    if (periodoContable.fiscalInicio && periodoContable.fiscalFin) {
      if (form.fecha < periodoContable.fiscalInicio || form.fecha > periodoContable.fiscalFin) {
        return `Fecha fuera del periodo fiscal (${fmtDateDDMMYYYY(periodoContable.fiscalInicio)} a ${fmtDateDDMMYYYY(periodoContable.fiscalFin)}).`;
      }
    }

    if (!periodoContable.activo || !periodoContable.inicio || !periodoContable.fin) {
      return '';
    }

    if (form.fecha < periodoContable.inicio || form.fecha > periodoContable.fin) {
      return `Fecha fuera del periodo contable habilitado (${fmtDateDDMMYYYY(periodoContable.inicio)} a ${fmtDateDDMMYYYY(periodoContable.fin)}).`;
    }
    return '';
  })();

  useEffect(() => {
    const cargarCategorias = async () => {
      const { data, error } = await supabase.rpc('get_asiento_categorias_effective', {
        p_empresa_id: empresaId,
      });
      if (!error && data) {
        setCategorias(data as CategoriaEfectiva[]);
        return;
      }

      const { data: fallback } = await supabase
        .from('asiento_categorias')
        .select('id, codigo, descripcion, tipo_id, activo')
        .eq('activo', true)
        .order('codigo');

      if (fallback) {
        const mapped = fallback.map((c: any) => ({
          categoria_id: c.id,
          categoria_base_id: c.id,
          codigo: c.codigo,
          descripcion: c.descripcion,
          tipo_id: c.tipo_id ?? null,
          activo: !!c.activo,
          modo: 'herencia_base' as const,
        }));
        setCategorias(mapped);
      }
    };

    cargarCategorias();

    if (asiento?.id) {
      supabase.from('asiento_lineas')
        .select('*, plan_cuentas_base(codigo, nombre)')
        .eq('asiento_id', asiento.id)
        .order('linea')
        .then(async ({ data }) => {
          if (data) {
            const sinBaseIds = data
              .filter((l: any) => !l.plan_cuentas_base?.codigo && l.cuenta_id)
              .map((l: any) => Number(l.cuenta_id))
              .filter((x: number) => Number.isFinite(x));
            let empresaMap = new Map<number, { codigo: string; nombre: string }>();
            if (sinBaseIds.length > 0) {
              const { data: empRows } = await supabase
                .from('plan_cuentas_empresa')
                .select('id, codigo, nombre')
                .eq('empresa_id', empresaId)
                .in('id', sinBaseIds);
              empresaMap = new Map((empRows || []).map((r: any) => [Number(r.id), { codigo: r.codigo, nombre: r.nombre }]));
            }

            setLineas(data.map((l: any) => {
              const emp = empresaMap.get(Number(l.cuenta_id));
              return {
                id: l.id,
                cuenta_id: l.cuenta_id,
                cuenta_codigo: l.plan_cuentas_base?.codigo || emp?.codigo || '',
                cuenta_nombre: l.plan_cuentas_base?.nombre || emp?.nombre || '',
                descripcion: l.descripcion || '',
                referencia: l.referencia || '',
                debito_crc: l.debito_crc || 0,
                credito_crc: l.credito_crc || 0,
                debito_usd: l.debito_usd || 0,
                credito_usd: l.credito_usd || 0,
              };
            }));
          }
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Calcular numero cuando cambia categoria
  useEffect(() => {
    const cargarPeriodoContable = async () => {
      const { data, error } = await supabase.rpc('get_empresa_parametros', { p_empresa_id: empresaId });
      if (error || !data) {
        setPeriodoContable({ loaded: true, activo: false, inicio: null, fin: null, fiscalInicio: null, fiscalFin: null });
        return;
      }
      const fiscal = (data as any)?.fiscal || {};
      const cierre = (data as any)?.cierre_contable || {};
      setPeriodoContable({
        loaded: true,
        activo: Boolean(cierre?.activo),
        inicio: cierre?.fecha_inicio || null,
        fin: cierre?.fecha_fin || null,
        fiscalInicio: fiscal?.fecha_inicio || null,
        fiscalFin: fiscal?.fecha_fin || null,
      });
    };
    cargarPeriodoContable();
  }, [empresaId]);

  useEffect(() => {
    if (!form.categoria_id || asiento?.id) return;
    const calcularNumero = async () => {
      const anio = new Date(form.fecha).getFullYear();
      const cat = categorias.find(c => c.categoria_base_id === parseInt(String(form.categoria_id), 10));
      if (!cat) return;

      // Obtener o crear numeracion
      const { data } = await supabase
        .from('asiento_numeracion')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('categoria_id', form.categoria_id)
        .eq('anio', anio)
        .single();

      const siguiente = (data?.ultimo_numero || 0) + 1;
      setNumeroFormato(`${cat.codigo}-${String(siguiente).padStart(3, '0')}-${anio}`);
    };
    calcularNumero();
  }, [form.categoria_id, form.fecha]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al trabajar en USD, usa TC del historial para la fecha del asiento (preferencia: venta).
  useEffect(() => {
    const cargarTipoCambioFecha = async () => {
      if (esVista) return;
      if (form.moneda !== 'USD') return;
      if (!form.fecha) return;

      setTcCargando(true);
      const { data, error } = await supabase.rpc('get_tipo_cambio_historial', {
        p_empresa_id: empresaId,
        p_fecha_desde: form.fecha,
        p_fecha_hasta: form.fecha,
      });
      setTcCargando(false);

      if (error || !Array.isArray(data) || data.length === 0) return;
      const row: any = data[0];
      const tc = Number(row?.venta ?? row?.compra ?? 0);
      if (Number.isFinite(tc) && tc > 0) {
        setForm((p) => ({ ...p, tipo_cambio: tc }));
      }
    };

    cargarTipoCambioFecha();
  }, [empresaId, form.moneda, form.fecha, esVista]); // eslint-disable-line react-hooks/exhaustive-deps

  const actualizarLinea = (idx: number, campo: keyof Linea, valor: any) => {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l));
  };

  const setCuenta = (idx: number, cuenta: any) => {
    setLineas(prev => prev.map((l, i) => i === idx ? {
      ...l, cuenta_id: cuenta.id,
      cuenta_codigo: cuenta.codigo, cuenta_nombre: cuenta.nombre
    } : l));
  };

  const agregarLinea = () => {
    setFocusNewLineCode(true);
    setLineas(prev => [...prev, lineaVacia()]);
  };

  const eliminarLinea = (idx: number) => {
    if (lineas.length <= 2) return;
    setLineas(prev => prev.filter((_, i) => i !== idx));
  };

  // Totales
  const totalDebitoCRC = lineas.reduce((s, l) => s + (Number(l.debito_crc) || 0), 0);
  const totalCreditoCRC = lineas.reduce((s, l) => s + (Number(l.credito_crc) || 0), 0);
  const totalDebitoUSD = lineas.reduce((s, l) => s + (Number(l.debito_usd) || 0), 0);
  const totalCreditoUSD = lineas.reduce((s, l) => s + (Number(l.credito_usd) || 0), 0);
  const tcActual = Number(form.tipo_cambio) || 0;

  // Evita falsos negativos por precision decimal al comparar totales.
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.000001;
  const crcBalanceado = eq(totalDebitoCRC, totalCreditoCRC);
  const usdBalanceado = eq(totalDebitoUSD, totalCreditoUSD);
  const hasMontoCRC = totalDebitoCRC > 0 || totalCreditoCRC > 0;
  const hasMontoUSD = totalDebitoUSD > 0 || totalCreditoUSD > 0;

  const balanceado =
    (form.moneda === 'CRC' && crcBalanceado && hasMontoCRC) ||
    (form.moneda === 'USD' && crcBalanceado && usdBalanceado && hasMontoUSD) ||
    (form.moneda === 'AMBAS' && crcBalanceado && usdBalanceado && (hasMontoCRC || hasMontoUSD));

  const fmt = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2 });
  const fmtMoneyInput = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parseMoney = (raw: string) => {
    const str = (raw || '').trim();
    if (!str) return 0;
    const normalized = str.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
    const lastDot = normalized.lastIndexOf('.');
    const lastComma = normalized.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : (lastComma > -1 ? ',' : '');
    let cleaned = normalized;
    if (decimalSep) {
      const thousandSep = decimalSep === '.' ? ',' : '.';
      cleaned = cleaned.replace(new RegExp(`\\${thousandSep}`, 'g'), '');
      cleaned = cleaned.replace(decimalSep, '.');
    } else {
      cleaned = cleaned.replace(/[.,]/g, '');
    }
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };
  const getMoneyDisplayValue = (key: string, value: number) => {
    if (activeMoneyField === key) return moneyDrafts[key] ?? String(value || '');
    if (esVista) return fmtMoneyInput(Number(value) || 0);
    return value ? fmtMoneyInput(Number(value) || 0) : '';
  };
  const getDiffByCurrency = (currency: 'crc' | 'usd') => {
    const diff = currency === 'crc'
      ? Math.abs(totalDebitoCRC - totalCreditoCRC)
      : Math.abs(totalDebitoUSD - totalCreditoUSD);
    return Number(diff.toFixed(2));
  };
  const onMoneyFocus = (key: string, value: number) => {
    setActiveMoneyField(key);
    setMoneyDrafts(prev => ({ ...prev, [key]: value ? String(value) : '' }));
  };
  const onMoneyFocusWithDiff = (
    key: string,
    idx: number,
    campo: keyof Linea,
    value: number,
    currency: 'crc' | 'usd'
  ) => {
    let nextValue = value;
    if (!value) {
      const diff = getDiffByCurrency(currency);
      const needSide = currency === 'crc'
        ? (totalDebitoCRC < totalCreditoCRC ? 'debito' : (totalCreditoCRC < totalDebitoCRC ? 'credito' : null))
        : (totalDebitoUSD < totalCreditoUSD ? 'debito' : (totalCreditoUSD < totalDebitoUSD ? 'credito' : null));
      const campoSide = String(campo).startsWith('debito') ? 'debito' : 'credito';

      if (diff > 0 && needSide === campoSide) {
        setLineas(prev => prev.map((l, i) => {
          if (i !== idx) return l;
          const next: Linea = { ...l, [campo]: diff } as Linea;
          if (campo === 'debito_crc') next.credito_crc = 0;
          if (campo === 'credito_crc') next.debito_crc = 0;
          if (campo === 'debito_usd') next.credito_usd = 0;
          if (campo === 'credito_usd') next.debito_usd = 0;
          return next;
        }));
        nextValue = diff;
      }
    }
    onMoneyFocus(key, nextValue);
  };
  const handleEnterAsTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target) return;
    if (target.closest('.cuenta-modal')) return;
    if (target.classList.contains('cuenta')) return;
    if (target instanceof HTMLButtonElement) return;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target instanceof HTMLTextAreaElement) return;

    e.preventDefault();
    const root = formWrapRef.current;
    if (!root) return;

    if (!esVista && balanceado && target.classList.contains('mono')) {
      const addBtn = root.querySelector<HTMLButtonElement>('.btn-add-linea');
      if (addBtn) {
        addBtn.focus();
        return;
      }
    }

    const focusables = Array.from(root.querySelectorAll<HTMLElement>('input, select, textarea'))
      .filter(el =>
        !el.hasAttribute('disabled') &&
        el.tabIndex !== -1 &&
        (el as HTMLInputElement).type !== 'hidden' &&
        el.offsetParent !== null &&
        !el.closest('.cuenta-modal')
      );
    const idx = focusables.indexOf(target);
    if (idx >= 0 && idx < focusables.length - 1) {
      focusables[idx + 1].focus();
    }
  };

  useEffect(() => {
    if (!focusNewLineCode) return;
    const t = setTimeout(() => {
      const root = formWrapRef.current;
      if (!root) return;
      const codes = root.querySelectorAll<HTMLInputElement>('input.linea-input.cuenta');
      const last = codes[codes.length - 1];
      last?.focus();
      last?.select();
      setFocusNewLineCode(false);
    }, 0);
    return () => clearTimeout(t);
  }, [focusNewLineCode, lineas.length]);
  const onMoneyChange = (key: string, campo: keyof Linea, raw: string, idx: number) => {
    setMoneyDrafts(prev => ({ ...prev, [key]: raw }));
    const n = Number(parseMoney(raw).toFixed(2));
    const tc = tcActual > 0 ? tcActual : 0;
    const toCRC = (usd: number) => Number((usd * tc).toFixed(2));
    const toUSD = (crc: number) => (tc > 0 ? Number((crc / tc).toFixed(2)) : 0);
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const next: Linea = { ...l, [campo]: n } as Linea;

      // Regla base:
      // - USD/AMBAS: se captura en USD y CRC se calcula
      // - CRC: se captura en CRC y USD se calcula
      if (campo === 'debito_crc' && n > 0) next.credito_crc = 0;
      if (campo === 'credito_crc' && n > 0) next.debito_crc = 0;
      if (campo === 'debito_usd' && n > 0) next.credito_usd = 0;
      if (campo === 'credito_usd' && n > 0) next.debito_usd = 0;

      if (form.moneda === 'USD' || form.moneda === 'AMBAS') {
        if (campo === 'debito_usd') next.debito_crc = toCRC(n);
        if (campo === 'credito_usd') next.credito_crc = toCRC(n);
        if (campo === 'debito_crc') next.debito_usd = toUSD(n);
        if (campo === 'credito_crc') next.credito_usd = toUSD(n);
      } else if (form.moneda === 'CRC') {
        if (campo === 'debito_crc') next.debito_usd = toUSD(n);
        if (campo === 'credito_crc') next.credito_usd = toUSD(n);
        if (campo === 'debito_usd') next.debito_crc = toCRC(n);
        if (campo === 'credito_usd') next.credito_crc = toCRC(n);
      }

      return next;
    }));
  };
  const onMoneyBlur = (key: string, campo: keyof Linea, idx: number, value: number) => {
    setActiveMoneyField(null);
    const n = Number(Number(value || 0).toFixed(2));
    actualizarLinea(idx, campo, n);
    setMoneyDrafts(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    if (tcFocused) return;
    setTcDraft(String(Number(form.tipo_cambio) || ''));
  }, [form.tipo_cambio, tcFocused]);

const guardar = async (estado: 'BORRADOR' | 'CONFIRMADO') => {
  if (!form.categoria_id || !form.fecha || !form.descripcion) {
    alert('Complete los datos del encabezado'); return;
  }
  if (categoriaError) {
    alert(categoriaError);
    return;
  }
  if (fechaError) {
    alert(fechaError);
    return;
  }
  if (estado === 'CONFIRMADO' && !balanceado) {
    alert('Advertencia: El asiento no esta balanceado. Debitos deben ser iguales a Creditos.'); return;
  }
  if (estado === 'CONFIRMADO' && (form.moneda === 'USD' || form.moneda === 'AMBAS') && !(Number(form.tipo_cambio) > 0)) {
    alert('Advertencia: Para confirmar en USD/AMBAS debe existir un tipo de cambio mayor a cero.'); return;
  }
  if (estado === 'CONFIRMADO' && (form.moneda === 'USD' || form.moneda === 'AMBAS')) {
    const { data: tcRows, error: tcErr } = await supabase.rpc('get_tipo_cambio_historial', {
      p_empresa_id: empresaId,
      p_fecha_desde: form.fecha,
      p_fecha_hasta: form.fecha,
    });
    if (tcErr || !Array.isArray(tcRows) || tcRows.length === 0) {
      alert('Advertencia: No existe tipo de cambio para la fecha del asiento. Debe consultar BCCR y guardar primero.');
      return;
    }
    const tcVentaDia = Number((tcRows[0] as any)?.venta || 0);
    const tcUsado = Number(form.tipo_cambio) || 0;
    if (!(tcVentaDia > 0)) {
      alert('Advertencia: El tipo de cambio de venta del dia es invalido.');
      return;
    }
    if (Math.abs(tcUsado - tcVentaDia) > 0.0001) {
      alert(`Advertencia: Segun norma tributaria, debe usar TC de venta del dia (${tcVentaDia.toFixed(2)}).`);
      setForm((p) => ({ ...p, tipo_cambio: tcVentaDia }));
      return;
    }
  }
  // Permite guardar lineas con monto 0.00 siempre que tengan cuenta.
  const lineasValidas = lineas.filter(l => l.cuenta_id !== null && l.cuenta_id !== undefined);
  if (lineasValidas.length < 2) {
    alert('Ingrese al menos 2 lineas con cuenta'); return;
  }

  setGuardando(true);
  const anio = new Date(form.fecha).getFullYear();
  const categoriaBaseId = parseInt(String(form.categoria_id), 10);
  const eraConfirmado = asiento?.estado === 'CONFIRMADO';
  const requiereNumeracionFinal = estado === 'CONFIRMADO' && !eraConfirmado;
  let numeroFormatoFinal = numeroFormato || '';

  if (requiereNumeracionFinal) {
    const cat = categorias.find(c => c.categoria_base_id === categoriaBaseId);
    if (!cat) {
      alert('No se pudo resolver la categoria para numeracion.');
      setGuardando(false);
      return;
    }

    const { data: numData, error: numErr } = await supabase
      .from('asiento_numeracion')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('categoria_id', categoriaBaseId)
      .eq('anio', anio)
      .single();

    if (numErr && numErr.code !== 'PGRST116') {
      alert('Error obteniendo numeracion: ' + numErr.message);
      setGuardando(false);
      return;
    }

    const siguiente = (numData?.ultimo_numero || 0) + 1;
    numeroFormatoFinal = `${cat.codigo}-${String(siguiente).padStart(3, '0')}-${anio}`;
  }

  // Guardar asiento
  const datosAsiento = {
    empresa_id: empresaId,
    categoria_id: categoriaBaseId,
    fecha: form.fecha,
    descripcion: form.descripcion.toUpperCase(),
    moneda: form.moneda,
    tipo_cambio: Number(form.tipo_cambio),
    estado,
    numero_formato: numeroFormatoFinal,
  };

  const asientoIdEdicion = Number(asiento?.id) || null;
  let asientoGuardado: any = null;
  let error: any = null;

  if (asientoIdEdicion) {
    const resp = await supabase
      .from('asientos')
      .update(datosAsiento)
      .eq('id', asientoIdEdicion)
      .select()
      .single();
    asientoGuardado = resp.data;
    error = resp.error;
  } else {
    const resp = await supabase
      .from('asientos')
      .insert(datosAsiento)
      .select()
      .single();
    asientoGuardado = resp.data;
    error = resp.error;
  }

  if (error || !asientoGuardado) {
    alert('Error: ' + error?.message); setGuardando(false); return;
  }

  // Reemplazar lineas del asiento (evita duplicados al editar borrador).
  const { error: delLineasError } = await supabase
    .from('asiento_lineas')
    .delete()
    .eq('asiento_id', asientoGuardado.id);

  if (delLineasError) {
    alert('Error eliminando lineas anteriores: ' + delLineasError.message);
    setGuardando(false);
    return;
  }

  const { error: insLineasError } = await supabase.from('asiento_lineas').insert(
    lineasValidas.map((l, i) => ({
      asiento_id: asientoGuardado.id,
      linea: i + 1,
      cuenta_id: l.cuenta_id,
      descripcion: l.descripcion,
      referencia: (l.referencia || '').trim() || numeroFormatoFinal,
      debito_crc: Number.isFinite(Number(l.debito_crc)) ? Number(l.debito_crc) : 0,
      credito_crc: Number.isFinite(Number(l.credito_crc)) ? Number(l.credito_crc) : 0,
      debito_usd: Number.isFinite(Number(l.debito_usd)) ? Number(l.debito_usd) : 0,
      credito_usd: Number.isFinite(Number(l.credito_usd)) ? Number(l.credito_usd) : 0,
    }))
  );

  if (insLineasError) {
    alert('Error guardando lineas: ' + insLineasError.message);
    setGuardando(false);
    return;
  }

  // DESPUES actualizar saldos
  if (estado === 'CONFIRMADO') {
    const { error: rpcError } = await supabase.rpc('actualizar_saldos_asiento', {
      p_asiento_id: asientoGuardado.id
    });
    if (rpcError) {
      console.error('Error saldos:', rpcError);
      alert('Asiento guardado pero error en saldos: ' + rpcError.message);
    }
  }

  // Actualizar numeracion solo cuando se confirma por primera vez.
  if (requiereNumeracionFinal) {
    const { data: numData } = await supabase
      .from('asiento_numeracion').select('*')
      .eq('empresa_id', empresaId)
      .eq('categoria_id', categoriaBaseId)
      .eq('anio', anio).single();

    if (numData) {
      await supabase.from('asiento_numeracion')
        .update({ ultimo_numero: numData.ultimo_numero + 1 })
        .eq('id', numData.id);
    } else {
      await supabase.from('asiento_numeracion').insert({
        empresa_id: empresaId,
        categoria_id: categoriaBaseId,
        anio, ultimo_numero: 1,
      });
    }
  }

  setNumeroFormato(numeroFormatoFinal);
  setGuardando(false);
  setExito(`Asiento ${estado === 'BORRADOR' ? 'guardado como borrador' : 'confirmado'} correctamente`);
  setTimeout(() => onGuardar(), 1500);
};

  return (
    <>
      <style>{styles}</style>
      <div className="fa-wrap" ref={formWrapRef} onKeyDownCapture={handleEnterAsTab}>
        <div className="fa-topbar">
          <button className="btn-back" onClick={onCancelar}>{'<-'} Volver</button>
          <div className="fa-page-title">
            {asiento ? 'Ver Asiento' : 'Nuevo Asiento'}
          </div>
          {numeroFormato && <span className="fa-num-badge">{numeroFormato}</span>}
          {asiento?.estado === 'CONFIRMADO' && (form.moneda === 'USD' || form.moneda === 'AMBAS') && (
            <span className="fa-norma-badge" title="Norma fiscal: usar tipo de cambio de venta del dia">
              Norma: TC Venta
            </span>
          )}
          {asiento?.estado && (
            <span className={`estado-view ${asiento.estado}`}>{asiento.estado}</span>
          )}
        </div>

        {exito && <div className="fa-success">OK {exito}</div>}

        {/* Encabezado */}
        <div className="fa-card">
          <div className="fa-section-title">Encabezado del Asiento</div>
          <div className="fa-grid">
            <div className="fa-group">
              <label className="fa-label">Categoria *</label>
              <select className={`fa-input ${categoriaError ? 'fa-input-error' : ''}`} value={form.categoria_id}
                disabled={esVista}
                onChange={e => setForm(p => ({ ...p, categoria_id: e.target.value }))}>
                <option value="">-- Seleccione --</option>
                {categorias.map(cat => (
                  <option key={cat.categoria_id} value={cat.categoria_base_id}>
                    {cat.codigo} - {cat.descripcion}
                  </option>
                ))}
              </select>
              {categoriaError && <div className="fa-field-error">{categoriaError}</div>}
            </div>
            <div className="fa-group">
              <label className="fa-label">Fecha *</label>
              <input className={`fa-input ${fechaError ? 'fa-input-error' : ''}`} type="date" value={form.fecha}
                disabled={esVista}
                onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
              {fechaError && <div className="fa-field-error">{fechaError}</div>}
            </div>
            <div className="fa-group">
              <label className="fa-label">Moneda</label>
              <select className="fa-input" value={form.moneda}
                disabled={esVista}
                onChange={e => setForm(p => ({ ...p, moneda: e.target.value }))}>
                <option value="CRC">CRC Colones (CRC)</option>
                <option value="USD">$ Dolares (USD)</option>
                <option value="AMBAS">Ambas monedas</option>
              </select>
            </div>
            <div className="fa-group span2">
              <label className="fa-label">Descripcion *</label>
              <input className="fa-input" value={form.descripcion}
                disabled={esVista}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value.toUpperCase() }))}
                placeholder="DESCRIPCION DEL ASIENTO" />
            </div>
            {(form.moneda === 'USD' || form.moneda === 'AMBAS') && (
              <div className="fa-group">
                <label className="fa-label">Tipo de Cambio (Venta BCCR)</label>
                <input
                  className="fa-input"
                  type="text"
                  inputMode="decimal"
                  value={tcFocused
                    ? tcDraft
                    : `CRC ${fmtMoneyInput(Number(form.tipo_cambio) || 0)}`
                  }
                  disabled={esVista}
                  onFocus={() => {
                    setTcFocused(true);
                    setTcDraft(String(Number(form.tipo_cambio) || ''));
                  }}
                  onChange={e => {
                    const raw = e.target.value;
                    setTcDraft(raw);
                    const n = parseMoney(raw);
                    setForm(p => ({ ...p, tipo_cambio: n }));
                  }}
                  onBlur={() => {
                    const n = Number(parseMoney(tcDraft || String(form.tipo_cambio)).toFixed(2));
                    setForm(p => ({ ...p, tipo_cambio: n }));
                    setTcFocused(false);
                  }}
                />
                {tcCargando && <small style={{ color: '#6b7280' }}>Consultando TC de venta para la fecha...</small>}
              </div>
            )}
          </div>
        </div>

        {/* Lineas */}
        <div className="fa-card">
          <div className="fa-section-title">Lineas del Asiento</div>
          <div className="lineas-table-wrap">
            <table className="lineas-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cuenta</th>
                  {esVista && <th>Nombre Cuenta</th>}
                  <th>Descripcion</th>
                  <th>Referencia</th>
                  {(form.moneda === 'CRC' || form.moneda === 'AMBAS') && <>
                    <th>Debito CRC</th>
                    <th>Credito CRC</th>
                  </>}
                  {(form.moneda === 'USD' || form.moneda === 'AMBAS') && <>
                    <th>Debito $</th>
                    <th>Credito $</th>
                  </>}
                  {!esVista && <th></th>}
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea, idx) => (
                  <tr key={idx}>
                    <td style={{ color: '#9ca3af', fontSize: '12px', width: '30px' }}>
                      {idx + 1}
                    </td>
                    <td>
                      {esVista ? (
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px', color: '#16a34a' }}>{linea.cuenta_codigo}</span>
                      ) : (
                        <div>
                          <BuscarCuenta
                            value={linea.cuenta_codigo}
                            empresaId={empresaId}
                            onChange={c => setCuenta(idx, c)}
                          />
                          <div className="linea-cuenta-nombre">{linea.cuenta_nombre || ''}</div>
                        </div>
                      )}
                    </td>
                    {esVista && (
                      <td style={{ fontSize: '12px', color: '#6b7280', minWidth: '180px' }}>
                        {linea.cuenta_nombre}
                      </td>
                    )}
                    <td>
                      <input className="linea-input" value={linea.descripcion}
                        disabled={esVista}
                        onChange={e => actualizarLinea(idx, 'descripcion', e.target.value)}
                        placeholder="Detalle..." style={{ minWidth: '220px' }} />
                    </td>
                    <td>
                      <input
                        className="linea-input"
                        value={linea.referencia || ''}
                        disabled={esVista}
                        onChange={e => actualizarLinea(idx, 'referencia', e.target.value)}
                        onBlur={() => {
                          if (!linea.referencia?.trim() && numeroFormato) {
                            actualizarLinea(idx, 'referencia', numeroFormato);
                          }
                        }}
                        placeholder="Ref."
                        style={{ minWidth: '120px' }}
                      />
                    </td>
                    {(form.moneda === 'CRC' || form.moneda === 'AMBAS') && <>
                      <td>
                        <input className="linea-input mono" type="text" inputMode="decimal"
                          value={getMoneyDisplayValue(`${idx}-debito_crc`, Number(linea.debito_crc) || 0)}
                          disabled={esVista || form.moneda !== 'CRC' || Number(linea.credito_crc || 0) > 0}
                          onFocus={() => onMoneyFocusWithDiff(`${idx}-debito_crc`, idx, 'debito_crc', Number(linea.debito_crc) || 0, 'crc')}
                          onBlur={() => onMoneyBlur(`${idx}-debito_crc`, 'debito_crc', idx, Number(linea.debito_crc) || 0)}
                          onChange={e => onMoneyChange(`${idx}-debito_crc`, 'debito_crc', e.target.value, idx)}
                          style={{ width: '110px' }} />
                      </td>
                      <td>
                        <input className="linea-input mono" type="text" inputMode="decimal"
                          value={getMoneyDisplayValue(`${idx}-credito_crc`, Number(linea.credito_crc) || 0)}
                          disabled={esVista || form.moneda !== 'CRC' || Number(linea.debito_crc || 0) > 0}
                          onFocus={() => onMoneyFocusWithDiff(`${idx}-credito_crc`, idx, 'credito_crc', Number(linea.credito_crc) || 0, 'crc')}
                          onBlur={() => onMoneyBlur(`${idx}-credito_crc`, 'credito_crc', idx, Number(linea.credito_crc) || 0)}
                          onChange={e => onMoneyChange(`${idx}-credito_crc`, 'credito_crc', e.target.value, idx)}
                          style={{ width: '110px' }} />
                      </td>
                    </>}
                    {(form.moneda === 'USD' || form.moneda === 'AMBAS') && <>
                      <td>
                        <input className="linea-input mono" type="text" inputMode="decimal"
                          value={getMoneyDisplayValue(`${idx}-debito_usd`, Number(linea.debito_usd) || 0)}
                          disabled={esVista || Number(linea.credito_usd || 0) > 0}
                          onFocus={() => onMoneyFocusWithDiff(`${idx}-debito_usd`, idx, 'debito_usd', Number(linea.debito_usd) || 0, 'usd')}
                          onBlur={() => onMoneyBlur(`${idx}-debito_usd`, 'debito_usd', idx, Number(linea.debito_usd) || 0)}
                          onChange={e => onMoneyChange(`${idx}-debito_usd`, 'debito_usd', e.target.value, idx)}
                          style={{ width: '100px' }} />
                      </td>
                      <td>
                        <input className="linea-input mono" type="text" inputMode="decimal"
                          value={getMoneyDisplayValue(`${idx}-credito_usd`, Number(linea.credito_usd) || 0)}
                          disabled={esVista || Number(linea.debito_usd || 0) > 0}
                          onFocus={() => onMoneyFocusWithDiff(`${idx}-credito_usd`, idx, 'credito_usd', Number(linea.credito_usd) || 0, 'usd')}
                          onBlur={() => onMoneyBlur(`${idx}-credito_usd`, 'credito_usd', idx, Number(linea.credito_usd) || 0)}
                          onChange={e => onMoneyChange(`${idx}-credito_usd`, 'credito_usd', e.target.value, idx)}
                          style={{ width: '100px' }} />
                      </td>
                    </>}
                    {!esVista && (
                      <td>
                        <button className="btn-del-linea" onClick={() => eliminarLinea(idx)}>X</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!esVista && (
            <button className="btn-add-linea" onClick={agregarLinea}>
              + Agregar Linea
            </button>
          )}

          {/* Totales */}
          <div className="totales-bar">
            {(form.moneda === 'CRC' || form.moneda === 'AMBAS') && (
              <>
                <div className="total-item">
                  <span className="total-label">Total Debito CRC</span>
                  <span className={`total-value ${totalDebitoCRC > 0 ? 'total-ok' : ''}`}>
                    CRC {fmt(totalDebitoCRC)}
                  </span>
                </div>
                <div className="total-item">
                  <span className="total-label">Total Credito CRC</span>
                  <span className={`total-value ${totalCreditoCRC > 0 ? 'total-ok' : ''}`}>
                    CRC {fmt(totalCreditoCRC)}
                  </span>
                </div>
              </>
            )}
            {(form.moneda === 'USD' || form.moneda === 'AMBAS') && (
              <>
                <div className="total-item">
                  <span className="total-label">Total Debito $</span>
                  <span className={`total-value ${totalDebitoUSD > 0 ? 'total-ok' : ''}`}>
                    $ {fmt(totalDebitoUSD)}
                  </span>
                </div>
                <div className="total-item">
                  <span className="total-label">Total Credito $</span>
                  <span className={`total-value ${totalCreditoUSD > 0 ? 'total-ok' : ''}`}>
                    $ {fmt(totalCreditoUSD)}
                  </span>
                </div>
              </>
            )}
            <div>
              {balanceado && (totalDebitoCRC > 0 || totalDebitoUSD > 0)
                ? <span className="balance-ok">OK Balanceado</span>
                : <span className="balance-error">No balanceado</span>
              }
            </div>
          </div>
        </div>

        {!esVista && (
          <div className="fa-footer">
            <button className="btn-cancelar" onClick={onCancelar}>Cancelar</button>
            <button className="btn-borrador" onClick={() => guardar('BORRADOR')} disabled={guardando || !!categoriaError || !!fechaError}>
              Guardar Borrador
            </button>
            <button className="btn-confirmar" onClick={() => guardar('CONFIRMADO')} disabled={guardando || !balanceado || !!categoriaError || !!fechaError}>
              Confirmar Asiento
            </button>
          </div>
        )}
      </div>
    </>
  );
}


