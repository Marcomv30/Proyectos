import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, exportPdfWithPrint, formatBooleanFlag, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

interface CuentaEmpresa {
  id: number;
  empresa_id: number;
  cuenta_base_id: number | null;
  codigo: string;
  nombre: string;
  activo: boolean;
  plan_cuentas_base: {
    codigo: string;
    nombre: string;
    nivel: number;
    tipo: string;
    naturaleza: string;
    acepta_movimiento: boolean;
  };
}

interface ImportCuenta {
  codigo: string;
  nombre: string;
  nivel: number;
  tipo: string;
  naturaleza: string;
  acepta_movimiento: boolean;
  activo: boolean;
  row: number;
  error?: string;
}

const normalizeImportText = (v: string) =>
  String(v || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeTipoImport = (v: string): string => {
  const raw = normalizeImportText(v).replace(/\s+/g, '');
  const alias: Record<string, string> = {
    ACTIVO:'ACTIVO',ACTIVOS:'ACTIVO',PASIVO:'PASIVO',PASIVOS:'PASIVO',
    CAPITAL:'CAPITAL',CAPITALYPATRIMONIO:'CAPITAL',PATRIMONIO:'CAPITAL',
    INGRESO:'INGRESO',INGRESOS:'INGRESO',
    GASTO:'GASTO',GASTOS:'GASTO',COSTO:'COSTO',COSTOS:'COSTO',COSTODEVENTAS:'COSTO',
  };
  return alias[raw] || '';
};

const normalizeHeader = (v: string) =>
  String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_');

const parseBool = (v: any, defaultValue = false) => {
  if (v === null || v === undefined || String(v).trim() === '') return defaultValue;
  return ['1','true','si','sí','s','x','yes','y'].includes(String(v).trim().toLowerCase());
};

const inferNivel = (codigo: string): number | null => {
  const c = String(codigo||'').trim();
  if (/^\d{2}$/.test(c)) return 1;
  if (/^\d{4}$/.test(c)) return 2;
  if (/^\d{4}-\d{2}$/.test(c)) return 3;
  if (/^\d{4}-\d{2}-\d{3}$/.test(c)) return 4;
  if (/^\d{4}-\d{2}-\d{3}-\d{3}$/.test(c)) return 5;
  return null;
};

const NATURALEZAS_IMPORT = ['DEBITO', 'CREDITO'];

// Sort key para orden jerárquico padre→hijos.
// Construye la ruta completa desde el nivel 1 hasta el nodo actual.
// Ej: "0101-01-001" → "01|0101|0101-01|0101-01-001"
const getHierarchicalKey = (codigo: string): string => {
  const c = String(codigo || '').trim();
  const parts = c.split('-');
  const base = parts[0]; // "01" (nivel1) o "XXXX" (nivel2+)
  const path: string[] = [];
  if (base.length === 2) {
    path.push(base);
  } else {
    path.push(base.substring(0, 2)); // ancestro nivel 1
    path.push(base);                  // nivel 2
    for (let i = 1; i < parts.length; i++) {
      path.push(parts.slice(0, i + 1).join('-'));
    }
  }
  return path.join('|');
};

const styles = `
  .cat-wrap { padding:0; color:#d6e2ff; }
  .cat-import-msg { margin-bottom:10px; padding:10px 12px; border-radius:12px; font-size:12px; border:1px solid transparent; }
  .cat-import-msg.ok { background:#0f2c20; border-color:#1d6e4f; color:#9df4c7; }
  .cat-import-msg.err { background:#34181c; border-color:#7d2f3a; color:#ffb3bb; white-space:pre-line; }
  .cat-import-preview { margin-bottom:12px; background:#182232; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .cat-import-preview-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; }
  .cat-import-preview-title { font-size:12px; font-weight:700; color:#f2f6ff; text-transform:uppercase; letter-spacing:.04em; }
  .cat-import-preview-actions { display:flex; gap:8px; }
  .cat-import-preview-btn { padding:7px 10px; border-radius:10px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; font-size:12px; font-weight:700; color:#d6e2ff; cursor:pointer; }
  .cat-import-preview-btn.ok { border-color:#1d6e4f; background:#123224; color:#9df4c7; }
  .cat-import-preview-btn.no { border-color:#7d2f3a; background:#34181c; color:#ffb3bb; }
  .cat-import-preview-table-wrap { overflow:auto; border:1px solid rgba(137,160,201,0.16); border-radius:10px; }
  .cat-import-preview-table { width:100%; min-width:700px; border-collapse:collapse; }
  .cat-import-preview-table th, .cat-import-preview-table td { padding:6px 8px; border-bottom:1px solid rgba(137,160,201,0.12); font-size:12px; text-align:left; }
  .cat-import-preview-table th { background:#131b2a; color:#8ea3c7; text-transform:uppercase; letter-spacing:.04em; font-size:10px; }
  .cat-import-preview-table td { color:#d6e2ff; }
  .cat-import-preview-pager { margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .cat-import-preview-pager-info { font-size:12px; color:#8ea3c7; }
  .cat-import-preview-pager-actions { display:flex; gap:8px; }
  .cat-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:16px; }
  .cat-title { font-size:19px; font-weight:700; color:#f8fbff; letter-spacing:-0.03em; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  .cat-title span { font-size:13px; font-weight:500; color:#8ea3c7; margin-left:0; }
  .cat-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:18px; }
  .cat-export { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }
  .cat-export-btn { padding:8px 13px; border-radius:11px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; color:#d6e2ff; font-size:12px; font-weight:700; cursor:pointer; }
  .cat-export-btn:hover { border-color:#4c7bf7; color:#ffffff; background:#243149; }
  .cat-search { padding:10px 14px; border:1px solid rgba(137,160,201,0.22); border-radius:12px;
    font-size:13px; color:#f3f7ff; outline:none; width:300px; background:#1d2738;
    font-family:'DM Sans',sans-serif; transition:border-color 0.2s, box-shadow 0.2s; }
  .cat-search::placeholder { color:#8ea3c7; }
  .cat-search:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .cat-filters { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .cat-filter-group { display:flex; flex-direction:column; gap:6px; min-width:180px; }
  .cat-filter-label { font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.08em; font-weight:700; }
  .cat-filter-group { display:flex; flex-direction:column; gap:6px; min-width:180px; }
  .cat-filter-label { font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.08em; font-weight:700; }
  .cat-select { height:42px; border:1px solid rgba(137,160,201,0.22); border-radius:12px;
    font-size:13px; color:#f3f7ff; outline:none; min-width:140px; background:#1d2738; padding:0 14px;
    font-family:'DM Sans',sans-serif; transition:border-color 0.2s, box-shadow 0.2s; font-weight:700; }
  .cat-select:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .cat-filter-btn { padding:7px 14px; border-radius:8px; font-size:12px; font-weight:500;
    cursor:pointer; border:1px solid #e5e7eb; background:white; color:#6b7280; transition:all 0.15s; }
  .cat-filter-btn:hover { border-color:#22c55e; color:#16a34a; }
  .cat-filter-btn.active { background:#dcfce7; border-color:#22c55e; color:#16a34a; }
  .tipo-btn { padding:6px 12px; border-radius:7px; font-size:11px; font-weight:600;
    cursor:pointer; border:1px solid transparent; transition:all 0.15s; }
  .tipo-btn.ACTIVO { background:#dbeafe; color:#1d4ed8; border-color:#bfdbfe; }
  .tipo-btn.PASIVO { background:#fce7f3; color:#be185d; border-color:#fbcfe8; }
  .tipo-btn.CAPITAL { background:#ede9fe; color:#7c3aed; border-color:#ddd6fe; }
  .tipo-btn.INGRESO { background:#dcfce7; color:#16a34a; border-color:#bbf7d0; }
  .tipo-btn.GASTO { background:#fee2e2; color:#dc2626; border-color:#fecaca; }
  .tipo-btn.COSTO { background:#ffedd5; color:#c2410c; border-color:#fed7aa; }
  .tipo-btn.inactive { background:#1b2433; color:#7184a8; border-color:rgba(137,160,201,0.14); }
  .cat-table-wrap { background:#172131; border-radius:16px; border:1px solid rgba(137,160,201,0.18);
    overflow:hidden; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .cat-table { width:100%; border-collapse:collapse; }
  .cat-table thead { background:#131b2a; }
  .cat-table th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600;
    color:#8ea3c7; letter-spacing:0.06em; text-transform:uppercase; border-bottom:1px solid rgba(137,160,201,0.16); }
  .cat-table td { padding:10px 16px; font-size:12px; color:#d6e2ff; border-bottom:1px solid rgba(137,160,201,0.12); }
  .cat-table tr:last-child td { border-bottom:none; }
  .cat-table tr:hover td { filter:brightness(1.03); }
  .cat-mobile-list { display:none; }
  .cat-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px; margin-bottom:8px; }
  .cat-card-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .cat-card-name { font-size:14px; font-weight:700; color:#f3f7ff; margin-bottom:8px; }
  .cat-card-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .cat-card-row { display:flex; flex-direction:column; gap:2px; }
  .cat-card-label { font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; }
  .nivel-1 td:first-child { font-weight:700; color:#1d4ed8; }
  .nivel-1 .cat-nombre { font-weight:700; font-size:14px; color:#f7fbff; }
  .nivel-2 td:first-child { color:#7c3aed; font-weight:600; }
  .nivel-2 .cat-nombre { font-weight:700; color:#eef4ff; }
  .nivel-3 td:first-child { color:#16a34a; }
  .nivel-3 .cat-nombre { color:#eefaf4; }
  .nivel-4 td:first-child { color:#d97706; }
  .nivel-4 .cat-nombre { color:#fff6ea; }
  .cat-table tr.nivel-1 td { background:rgba(29,78,216,0.17); }
  .cat-table tr.nivel-2 td { background:rgba(124,58,237,0.16); }
  .cat-table tr.nivel-3 td { background:rgba(22,163,74,0.13); }
  .cat-table tr.nivel-4 td { background:rgba(217,119,6,0.13); }
  .cat-table tr.nivel-5 td { background:rgba(148,163,184,0.08); }
  .cat-codigo { font-family:'DM Mono',monospace; font-size:12px; color:#d6e2ff; }
  .tipo-badge { display:inline-flex; padding:0; border-radius:0; font-size:12px; font-weight:700; background:transparent; }
  .tipo-ACTIVO { color:#8ab4ff; }
  .tipo-PASIVO { color:#ff9ac7; }
  .tipo-CAPITAL { color:#bf9bff; }
  .tipo-INGRESO { color:#74e79a; }
  .tipo-GASTO { color:#ff8d94; }
  .tipo-COSTO { color:#ffbc7c; }
  .mov-si { color:#16a34a; font-size:16px; }
  .mov-no { color:#e5e7eb; font-size:16px; }
  .estado-badge { display:inline-flex; align-items:center; padding:0;
    border-radius:0; font-size:12px; font-weight:700; background:transparent; }
  .estado-activo { color:#8be2a4; }
  .estado-inactivo { color:#ff8d94; }
  .cat-table tr.row-inactiva td { opacity:0.58; }
  .cat-empty { padding:48px; text-align:center; color:#8ea3c7; font-size:13px; }
  .cat-stats { display:flex; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
  .cat-stat { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px;
    padding:14px 18px; display:flex; flex-direction:column; gap:4px; min-width:130px; box-shadow:0 16px 28px rgba(3,8,20,.16); }
  .cat-stat-num { font-size:20px; font-weight:800; color:#f3f7ff; }
  .cat-stat-label { font-size:11px; color:#8ea3c7; font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
  .cat-mode { margin-bottom:12px; font-size:12px; color:#8ea3c7; display:flex; align-items:center; gap:8px; }
  .cat-mode-badge { display:inline-flex; align-items:center; padding:4px 10px; border-radius:999px; border:1px solid; font-size:11px; font-weight:800; }
  .cat-mode-badge.inherited { background:#16263f; border-color:#355da8; color:#8ab4ff; }
  .cat-mode-badge.override { background:#123224; border-color:#1d6e4f; color:#9df4c7; }

  .modal-overlay { position:fixed; inset:0; background:rgba(6,10,18,0.72);
    display:flex; align-items:center; justify-content:center; z-index:1000; }
  .modal-box { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:18px; padding:32px; width:480px;
    box-shadow:0 24px 60px rgba(0,0,0,0.34); }
  .modal-title { font-size:17px; font-weight:700; color:#f3f7ff; margin-bottom:6px; }
  .modal-sub { font-size:12px; color:#8ea3c7; margin-bottom:20px; }
  .modal-field { margin-bottom:16px; }
  .modal-label { display:block; font-size:11px; font-weight:700; color:#8ea3c7;
    letter-spacing:0.04em; text-transform:uppercase; margin-bottom:6px; }
  .modal-input { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22);
    border-radius:12px; font-size:13px; color:#f3f7ff; outline:none; background:#1d2738;
    font-family:'DM Sans',sans-serif; transition:border-color 0.2s; }
  .modal-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .modal-info { padding:10px 14px; background:#131b2a; border:1px solid rgba(137,160,201,0.16);
    border-radius:12px; font-size:12px; color:#8ea3c7; margin-bottom:16px; }
  .modal-info span { font-family:'DM Mono',monospace; color:#9df4c7; font-weight:700; }
  .modal-check { display:flex; align-items:center; gap:8px; cursor:pointer; }
  .modal-check input { width:15px; height:15px; accent-color:#16a34a; }
  .modal-check span { font-size:13px; color:#d6e2ff; }
  .modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:24px; }
  .btn-cancelar { padding:10px 16px; background:#243149; border:1px solid rgba(137,160,201,0.18); border-radius:10px;
    color:#d6e2ff; font-size:13px; font-weight:700; cursor:pointer; }
  .btn-cancelar:hover { background:#2b3a53; }
  .btn-guardar { padding:10px 20px; background:linear-gradient(135deg,#17a34a,#22c55e);
    border:none; border-radius:10px; color:white; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .btn-guardar:hover { opacity:0.95; }
  .btn-editar { padding:6px 12px; background:#243149; border:1px solid rgba(76,123,247,0.34);
    border-radius:9px; color:#9ec3ff; font-size:11px; font-weight:700; cursor:pointer; }
  .btn-editar:hover { background:#2c3c58; color:white; }
  .btn-peligro { padding:10px 16px; background:linear-gradient(135deg,#5c1f29,#7d2f3a);
    border:1px solid rgba(255,179,187,0.18); border-radius:10px; color:#ffe2e6; font-size:13px; font-weight:700; cursor:pointer;
    box-shadow:0 14px 24px rgba(125,47,58,.18); }
  .btn-peligro:hover { filter:brightness(1.06); }
  .success-msg { padding:10px 14px; background:#0f2c20; border:1px solid #1d6e4f;
    border-radius:12px; color:#9df4c7; font-size:12px; font-weight:700; margin-bottom:16px; }
  .error-msg { padding:10px 14px; background:#34181c; border:1px solid #7d2f3a;
    border-radius:12px; color:#ffb3bb; font-size:12px; font-weight:700; margin-bottom:16px; }
  @media (max-width: 900px) {
    .cat-header { flex-wrap:wrap; gap:10px; }
    .cat-title { font-size:18px; }
    .cat-search { width:100%; }
    .cat-toolbar { gap:8px; }
    .cat-export { margin-left:0; width:100%; }
    .cat-export-btn { flex:1; text-align:center; }
  }

  @media (max-width: 620px) {
    .cat-title span { display:block; margin-left:0; margin-top:2px; }
    .cat-stat { width:100%; }
    .cat-table-wrap { display:none; }
    .cat-mobile-list { display:block; }
    .modal-box { width:92vw; padding:20px; border-radius:12px; }
    .modal-actions { flex-direction:column; }
    .btn-cancelar, .btn-guardar { width:100%; }
  }

`;

const TIPOS = ['ACTIVO', 'PASIVO', 'CAPITAL', 'INGRESO', 'COSTO', 'GASTO'];
const NIVELES = [1, 2, 3, 4, 5];

const inferTipoFromCodigo = (codigo: string): string => {
  const c = String(codigo || '').trim();
  if (c.startsWith('01')) return 'ACTIVO';
  if (c.startsWith('02')) return 'PASIVO';
  if (c.startsWith('03')) return 'CAPITAL';
  if (c.startsWith('04')) return 'INGRESO';
  if (c.startsWith('05')) return 'COSTO';
  if (c.startsWith('06')) return 'GASTO';
  return '';
};

const inferNaturalezaFromTipo = (tipo: string): string =>
  ['PASIVO', 'CAPITAL', 'INGRESO'].includes(tipo) ? 'CREDITO' : tipo ? 'DEBITO' : '';

const getCuentaMeta = (cuenta: CuentaEmpresa) => {
  const base = (cuenta.plan_cuentas_base as any) || null;
  const nivel = Number(base?.nivel) || inferNivel(cuenta.codigo) || 5;
  const tipo = base?.tipo || inferTipoFromCodigo(cuenta.codigo);
  const naturaleza = base?.naturaleza || inferNaturalezaFromTipo(tipo);
  return {
    base,
    nivel,
    tipo,
    naturaleza,
    aceptaMovimiento: typeof base?.acepta_movimiento === 'boolean' ? base.acepta_movimiento : nivel === 5,
    codigoBase: base?.codigo || '-',
    hasBase: !!base?.codigo,
  };
};

export default function CatalogoEmpresa({
  empresaId,
  canEdit,
}: {
  empresaId: number;
  canEdit: boolean;
}) {
  const [cuentas, setCuentas] = useState<CuentaEmpresa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroNivel, setFiltroNivel] = useState<number | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'ACTIVAS' | 'INACTIVAS'>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<CuentaEmpresa | null>(null);
  const [form, setForm] = useState({ codigo: '', nombre: '', activo: true });
  const [exito, setExito] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [reiniciando, setReiniciando] = useState(false);
  const [sembrando, setSembrando] = useState(false);

  // ── Modal reinicio SU ──────────────────────────────────────────────────────

  // ── Import ────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [importErr, setImportErr] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [pendingImportRows, setPendingImportRows] = useState<ImportCuenta[]>([]);
  const [pendingImportFileName, setPendingImportFileName] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewOnlyErrors, setPreviewOnlyErrors] = useState(false);

  const cargar = async () => {
    setCargando(true);
    setErrorMsg('');

    const { data, error } = await supabase
      .from('plan_cuentas_empresa')
      .select('*, plan_cuentas_base(codigo, nombre, nivel, tipo, naturaleza, acepta_movimiento)')
      .eq('empresa_id', empresaId)
      .order('codigo');

    if (error) {
      setErrorMsg(error.message || 'No se pudo cargar el catalogo contable.');
      setCuentas([]);
    } else {
      const sorted = ((data || []) as any[]).sort((a: any, b: any) => {
        const ka = getHierarchicalKey(a.codigo);
        const kb = getHierarchicalKey(b.codigo);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      setCuentas(sorted);
    }

    setCargando(false);
  };

  useEffect(() => {
    cargar();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirEditar = (cuenta: CuentaEmpresa) => {
    setEditando(cuenta);
    setForm({ codigo: cuenta.codigo, nombre: cuenta.nombre, activo: cuenta.activo });
  };

  const guardar = async () => {
    if (!editando) return;
    setErrorMsg('');
    const { error } = await supabase
      .from('plan_cuentas_empresa')
      .update(form)
      .eq('id', editando.id);
    if (error) {
      setErrorMsg(error.message || 'No se pudo actualizar la cuenta.');
      return;
    }
    setEditando(null);
    setExito('Cuenta actualizada correctamente');
    setTimeout(() => setExito(''), 3000);
    await cargar();
  };

  const sembrarDesdeBase = async () => {
    const ok = window.confirm(
      'Se cargara el catalogo base para esta empresa. ¿Desea continuar?'
    );
    if (!ok) return;
    setSembrando(true);
    setErrorMsg('');
    const { error } = await supabase.rpc('seed_plan_cuentas_empresa', {
      p_empresa_id: empresaId,
    });
    if (error) {
      setErrorMsg(error.message || 'No se pudo inicializar el catalogo.');
      setSembrando(false);
      return;
    }
    setExito('Catalogo inicializado desde el plan base.');
    setTimeout(() => setExito(''), 3500);
    await cargar();
    setSembrando(false);
  };

  const reinicializarDesdeBase = async () => {
    const ok = window.confirm(
      'Esto restaurara el catalogo de esta empresa desde el plan base. Se perderan personalizaciones de codigo/nombre. Desea continuar?'
    );
    if (!ok) return;

    setReiniciando(true);
    setErrorMsg('');
    const { data, error } = await supabase.rpc('reset_plan_cuentas_empresa', {
      p_empresa_id: empresaId,
    });

    if (error) {
      setErrorMsg(error.message || 'No se pudo reinicializar el catalogo.');
      setReiniciando(false);
      return;
    }

    setExito(`Catalogo reinicializado (${Number(data || 0)} cambios aplicados).`);
    setTimeout(() => setExito(''), 3500);
    await cargar();
    setReiniciando(false);
  };

  const descargarPlantillaImportacion = () => {
    const rows = [
      ['codigo', 'nombre', 'tipo', 'naturaleza', 'acepta_movimiento', 'activo'],
      ['01', 'ACTIVO', 'ACTIVO', 'DEBITO', '0', '1'],
      ['0101', 'ACTIVO CORRIENTE', 'ACTIVO', 'DEBITO', '0', '1'],
      ['0101-01', 'CAJA Y BANCOS', 'ACTIVO', 'DEBITO', '0', '1'],
      ['0101-01-001', 'CAJA', 'ACTIVO', 'DEBITO', '0', '1'],
      ['0101-01-001-001', 'CAJA GENERAL COLONES', 'ACTIVO', 'DEBITO', '1', '1'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'plantilla');
    XLSX.writeFile(wb, 'plantilla_catalogo_cuentas.xlsx');
  };

  const parseImportFile = async (file: File): Promise<ImportCuenta[]> => {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error('El archivo no tiene hojas');
    const ws = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (!matrix.length || matrix.length < 2) throw new Error('La plantilla no contiene filas para importar');

    const headersRaw = (matrix[0] || []).map((h) => normalizeHeader(String(h || '')));
    const idx = {
      codigo:           headersRaw.indexOf('codigo'),
      nombre:           headersRaw.indexOf('nombre'),
      tipo:             headersRaw.indexOf('tipo'),
      naturaleza:       headersRaw.indexOf('naturaleza'),
      acepta_movimiento:headersRaw.indexOf('acepta_movimiento'),
      activo:           headersRaw.indexOf('activo'),
    };
    if (idx.codigo < 0 || idx.nombre < 0) throw new Error('La plantilla debe incluir columnas: codigo y nombre');

    const parsed: ImportCuenta[] = [];
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i] || [];
      const excelRow = i + 1;
      const codigo = String(row[idx.codigo] || '').trim();
      const nombre = String(row[idx.nombre] || '').trim();
      if (!codigo && !nombre) continue;
      if (!codigo || !nombre) {
        parsed.push({ codigo, nombre, nivel: 0, tipo: '', naturaleza: '', acepta_movimiento: false, activo: false, row: excelRow, error: 'Codigo/nombre requeridos' });
        continue;
      }
      const nivel = inferNivel(codigo);
      if (!nivel) {
        parsed.push({ codigo, nombre, nivel: 0, tipo: '', naturaleza: '', acepta_movimiento: false, activo: false, row: excelRow, error: `Codigo invalido (${codigo})` });
        continue;
      }
      const tipoRaw = String(idx.tipo >= 0 ? row[idx.tipo] : '').trim();
      const naturalezaRaw = normalizeImportText(String(idx.naturaleza >= 0 ? row[idx.naturaleza] : ''));
      const tipoNormalizado = normalizeTipoImport(tipoRaw);
      const tipo = tipoNormalizado || (nivel <= 2 ? 'ACTIVO' : 'GASTO');
      const naturaleza = NATURALEZAS_IMPORT.includes(naturalezaRaw)
        ? naturalezaRaw
        : (tipo === 'PASIVO' || tipo === 'CAPITAL' || tipo === 'INGRESO' ? 'CREDITO' : 'DEBITO');
      parsed.push({
        codigo, nombre, nivel, tipo, naturaleza,
        acepta_movimiento: nivel === 5 ? parseBool(idx.acepta_movimiento >= 0 ? row[idx.acepta_movimiento] : '', true) : false,
        activo: parseBool(idx.activo >= 0 ? row[idx.activo] : '', true),
        row: excelRow,
        error: tipoRaw !== '' && !tipoNormalizado
          ? `Tipo invalido (${tipoRaw}). Valores: ACTIVO, PASIVO, CAPITAL, INGRESO, COSTO, GASTO`
          : '',
      });
    }
    return parsed.sort((a, b) => {
      const ka = getHierarchicalKey(a.codigo);
      const kb = getHierarchicalKey(b.codigo);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  };

  const importarCatalogo = async (rows: ImportCuenta[]) => {
    setImportErr('');
    setImportMsg('');
    setImportando(true);
    try {
      const validRows = rows.filter((r) => !r.error);
      const invalidRows = rows.filter((r) => !!r.error);
      if (!validRows.length) throw new Error('No hay filas validas para importar');

      let ok = 0;
      const errors: string[] = [];
      for (const r of validRows) {
        const { data: existente } = await supabase
          .from('plan_cuentas_empresa')
          .select('id')
          .eq('empresa_id', empresaId)
          .eq('codigo', r.codigo)
          .maybeSingle();

        const payload = {
          empresa_id: empresaId,
          cuenta_base_id: null,
          codigo: r.codigo,
          nombre: r.nombre,
          activo: r.activo,
        };

        const { error } = existente?.id
          ? await supabase.from('plan_cuentas_empresa').update(payload).eq('id', existente.id)
          : await supabase.from('plan_cuentas_empresa').insert(payload);
        if (error) errors.push(`Fila ${r.row} (${r.codigo}): ${error.message}`);
        else ok++;
      }

      if (errors.length || invalidRows.length) {
        const inv = invalidRows.length ? `\nFilas invalidas omitidas: ${invalidRows.length}` : '';
        setImportErr(`Importadas ${ok}/${validRows.length} filas.${inv}\n${errors.slice(0, 15).join('\n')}`.trim());
      } else {
        setImportMsg(`Importacion exitosa: ${ok} cuentas procesadas.`);
      }
      setPendingImportRows([]);
      setPendingImportFileName('');
      setPreviewPage(1);
      setPreviewOnlyErrors(false);
      await cargar();
    } catch (e: any) {
      setImportErr(e?.message || 'No se pudo importar el archivo');
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onFilePicked: React.ChangeEventHandler<HTMLInputElement> = async (evt) => {
    const f = evt.target.files?.[0];
    if (!f) return;
    setImportErr('');
    setImportMsg('');
    try {
      const rows = await parseImportFile(f);
      setPendingImportRows(rows);
      setPendingImportFileName(f.name);
      setPreviewPage(1);
      setPreviewOnlyErrors(false);
      const validCount = rows.filter((r) => !r.error).length;
      const invalidCount = rows.filter((r) => !!r.error).length;
      setImportMsg(`Archivo validado: ${validCount} fila(s) validas, ${invalidCount} con error.`);
    } catch (e: any) {
      setPendingImportRows([]);
      setPendingImportFileName('');
      setImportErr(e?.message || 'No se pudo leer el archivo');
    }
  };

  const cancelarImportacion = () => {
    setPendingImportRows([]);
    setPendingImportFileName('');
    setPreviewPage(1);
    setPreviewOnlyErrors(false);
    setImportMsg('');
    setImportErr('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const previewPageSize = 30;
  const previewSourceRows = previewOnlyErrors ? pendingImportRows.filter((r) => !!r.error) : pendingImportRows;
  const previewTotalPages = Math.max(1, Math.ceil(previewSourceRows.length / previewPageSize));
  const previewSlice = previewSourceRows.slice((previewPage - 1) * previewPageSize, previewPage * previewPageSize);

  const cuentasFiltradas = cuentas.filter((c) => {
    const meta = getCuentaMeta(c);
    if (filtroNivel && meta.nivel !== filtroNivel) return false;
    if (filtroTipo && meta.tipo !== filtroTipo) return false;
    if (filtroEstado === 'ACTIVAS' && !c.activo) return false;
    if (filtroEstado === 'INACTIVAS' && c.activo) return false;
    if (busqueda) {
      const b = busqueda.toLowerCase();
      return c.codigo.toLowerCase().includes(b) || c.nombre.toLowerCase().includes(b);
    }
    return true;
  });

  const stats = {
    total: cuentas.length,
    movimiento: cuentas.filter((c) => c.activo && getCuentaMeta(c).aceptaMovimiento).length,
    personalizadas: cuentas.filter((c) => {
      const base = c.plan_cuentas_base as any;
      return c.codigo !== base?.codigo || c.nombre !== base?.nombre;
    }).length,
    inactivas: cuentas.filter((c) => !c.activo).length,
  };

  const hasOverride = stats.personalizadas > 0;

  const exportRows = cuentasFiltradas.map((c) => {
    const meta = getCuentaMeta(c);
    return {
      codigo_empresa: c.codigo,
      nombre_empresa: c.nombre,
      codigo_base: meta.codigoBase,
      nivel: meta.nivel || '',
      tipo: meta.tipo || '',
      naturaleza: meta.naturaleza || '',
      movimiento: formatBooleanFlag(!!meta.aceptaMovimiento, 'export'),
    };
  });

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'codigo_empresa', title: 'Codigo Empresa', getValue: (r) => r.codigo_empresa, align: 'left', width: '12%' },
    { key: 'nombre_empresa', title: 'Nombre Empresa', getValue: (r) => r.nombre_empresa, align: 'left', width: '32%' },
    { key: 'codigo_base', title: 'Codigo Base', getValue: (r) => r.codigo_base, width: '12%' },
    { key: 'nivel', title: 'Nivel', getValue: (r) => r.nivel, width: '8%' },
    { key: 'tipo', title: 'Tipo', getValue: (r) => r.tipo, width: '10%' },
    { key: 'naturaleza', title: 'Naturaleza', getValue: (r) => r.naturaleza, width: '14%' },
    { key: 'movimiento', title: 'Mov.', getValue: (r) => r.movimiento, width: '12%' },
  ];

  const exportExcelCatalogoEmpresa = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Catalogo Empresa', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });
    const company = (typeof window !== 'undefined' ? localStorage.getItem('mya_report_company_name') : '') || 'Empresa';
    const title = 'Catalogo Contable (EMPRESA)';
    const subtitle = `Total: ${cuentasFiltradas.length} cuentas`;

    ws.columns = [
      { key: 'codigo_empresa', width: 18 },
      { key: 'nombre_empresa', width: 44 },
      { key: 'codigo_base', width: 18 },
      { key: 'nivel', width: 10 },
      { key: 'tipo', width: 14 },
      { key: 'naturaleza', width: 14 },
      { key: 'movimiento', width: 12 },
    ];
    ws.pageSetup = {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    };

    const borderColor = { argb: 'FFD1D5DB' };
    const borderHeader = {
      top: { style: 'thin' as const, color: borderColor },
      bottom: { style: 'thin' as const, color: borderColor },
      left: { style: 'thin' as const, color: borderColor },
      right: { style: 'thin' as const, color: borderColor },
    };
    const borderVertical = {
      left: { style: 'thin' as const, color: borderColor },
      right: { style: 'thin' as const, color: borderColor },
    };
    const borderVerticalBottom = {
      left: { style: 'thin' as const, color: borderColor },
      right: { style: 'thin' as const, color: borderColor },
      bottom: { style: 'thin' as const, color: borderColor },
    };
    const levelFill: Record<number, string> = {
      1: 'FFDBEAFE',
      2: 'FFE0F2FE',
      3: 'FFECFEFF',
      4: 'FFF0F9FF',
      5: 'FFF8FAFC',
    };

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = company;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = title;
    ws.getCell('A2').font = { bold: true, size: 13 };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.mergeCells('A3:G3');
    ws.getCell('A3').value = subtitle;
    ws.getCell('A3').font = { italic: true, size: 10 };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    ws.addRow([]);
    const h = ws.addRow(['Codigo Empresa', 'Nombre Empresa', 'Codigo Base', 'Nivel', 'Tipo', 'Naturaleza', 'Movimiento']);
    h.eachCell((c, idx) => {
      c.font = { bold: true, color: { argb: 'FF1F2937' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
      c.border = {
        ...borderHeader,
        left: idx === 1 ? borderHeader.left : borderVertical.left,
        right: idx === 7 ? borderHeader.right : borderVertical.right,
      };
    });

    cuentasFiltradas.forEach((cuenta, i) => {
      const meta = getCuentaMeta(cuenta);
      const nivel = Math.max(1, Math.min(5, Number(meta.nivel) || 5));
      const fillArgb = levelFill[nivel] || 'FFF8FAFC';
      const isLast = i === cuentasFiltradas.length - 1;
      const row = ws.addRow([
        cuenta.codigo,
        cuenta.nombre,
        meta.codigoBase,
        `Nivel ${meta.nivel || ''}`,
        meta.tipo || '',
        meta.naturaleza || '',
        formatBooleanFlag(!!meta.aceptaMovimiento, 'export'),
      ]);

      row.getCell(1).font = { name: 'Consolas', size: 10, color: { argb: 'FF0F766E' } };
      row.getCell(3).font = { name: 'Consolas', size: 10, color: { argb: 'FF6B7280' } };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
        cell.border = isLast ? borderVerticalBottom : borderVertical;
      });
    });

    ws.pageSetup.printArea = `A1:G${ws.rowCount}`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'catalogo_empresa.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="cat-wrap">
        <div className="cat-header">
          <div className="cat-title">
            Catalogo Contable (EMPRESA)
            <span>{cuentasFiltradas.length} cuentas</span>
          </div>
          {canEdit && !cargando && cuentas.length === 0 && pendingImportRows.length === 0 && (
            <button
              className="btn-guardar"
              onClick={sembrarDesdeBase}
              disabled={sembrando}
              style={{ minWidth: '210px' }}
              title="Cargar el catalogo base para esta empresa (solo disponible cuando esta vacio)"
            >
              {sembrando ? 'Inicializando...' : 'Inicializar desde base'}
            </button>
          )}
          {canEdit && !cargando && cuentas.length > 0 && (
            <button
              className="btn-cancelar"
              onClick={reinicializarDesdeBase}
              disabled={reiniciando}
              style={{ minWidth: '210px' }}
              title="Restaura esta empresa desde el plan base solo si deseas usar la plantilla general"
            >
              {reiniciando ? 'Restaurando...' : 'Volver a herencia base'}
            </button>
          )}
        </div>

        {errorMsg && <div className="error-msg">{errorMsg}</div>}
        {exito && <div className="success-msg">OK {exito}</div>}
        <div className="cat-mode">
          <span>Modo actual:</span>
          <span className={`cat-mode-badge ${hasOverride ? 'override' : 'inherited'}`}>
            {hasOverride ? 'Override por empresa' : 'Herencia base'}
          </span>
          <span>
            {hasOverride
              ? 'Esta empresa tiene cuentas personalizadas.'
              : 'Esta empresa usa el catalogo base sin cambios.'}
          </span>
        </div>
        <div className="cat-stats">
          <div className="cat-stat">
            <span className="cat-stat-num">{stats.total}</span>
            <span className="cat-stat-label">Total Cuentas</span>
          </div>
          <div className="cat-stat">
            <span className="cat-stat-num" style={{ color: '#16a34a' }}>{stats.movimiento}</span>
            <span className="cat-stat-label">Aceptan Movimiento</span>
          </div>
          <div className="cat-stat">
            <span className="cat-stat-num" style={{ color: '#f59e0b' }}>{stats.personalizadas}</span>
            <span className="cat-stat-label">Personalizadas</span>
          </div>
          <div className="cat-stat">
            <span className="cat-stat-num" style={{ color: '#991b1b' }}>{stats.inactivas}</span>
            <span className="cat-stat-label">Inactivas</span>
          </div>
        </div>

        <div className="cat-toolbar">
          <input
            className="cat-search"
            placeholder="Buscar por codigo o nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <div className="cat-filter-group">
            <span className="cat-filter-label">Nivel</span>
            <select
              className="cat-select"
              value={filtroNivel ?? ''}
              onChange={(e) => setFiltroNivel(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todos los niveles</option>
              {NIVELES.map((n) => (
                <option key={n} value={n}>Nivel {n}</option>
              ))}
            </select>
          </div>
          <div className="cat-filter-group">
            <span className="cat-filter-label">Tipo</span>
            <select
              className="cat-select"
              value={filtroTipo ?? ''}
              onChange={(e) => setFiltroTipo(e.target.value || null)}
            >
              <option value="">Todos los tipos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="cat-filter-group">
            <span className="cat-filter-label">Estado</span>
            <select
              className="cat-select"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as 'TODAS' | 'ACTIVAS' | 'INACTIVAS')}
            >
              <option value="TODAS">Todas</option>
              <option value="ACTIVAS">Activas</option>
              <option value="INACTIVAS">Inactivas</option>
            </select>
          </div>
          <ListToolbar
            className="cat-export"
            exports={(
              <>
                <button
                  className="cat-export-btn"
                  onClick={() => exportCsv('catalogo_empresa.csv', exportRows, exportColumns)}
                  disabled={exportRows.length === 0}
                >
                  CSV
                </button>
                <button
                  className="cat-export-btn"
                  onClick={exportExcelCatalogoEmpresa}
                  disabled={exportRows.length === 0}
                >
                  EXCEL
                </button>
                <button
                  className="cat-export-btn"
                  onClick={() =>
                    exportPdfWithPrint({
                      title: 'Catalogo Contable (EMPRESA)',
                      subtitle: `Total: ${exportRows.length} cuentas`,
                      rows: exportRows,
                      columns: exportColumns,
                      orientation: 'landscape',
                    })
                  }
                  disabled={exportRows.length === 0}
                >
                  PDF
                </button>
                {canEdit && (
                  <button
                    className="cat-export-btn"
                    onClick={descargarPlantillaImportacion}
                    title="Descargar plantilla Excel para importar cuentas"
                  >
                    PLANTILLA
                  </button>
                )}
                {canEdit && cuentas.length === 0 && !cargando && pendingImportRows.length === 0 && (
                  <button
                    className="cat-export-btn"
                    style={{ color: importando ? '#9ca3af' : '#7c3aed', borderColor: importando ? '#e5e7eb' : '#ddd6fe', background: importando ? '#f9fafb' : '#faf5ff' }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importando}
                    title="Importar a esta empresa un modelo propio desde Excel (solo disponible cuando esta vacio)"
                  >
                    {importando ? 'IMPORTANDO...' : 'IMPORTAR A EMPRESA'}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={onFilePicked}
                />
              </>
            )}
          />
        </div>

        {importMsg && <div className="cat-import-msg ok">{importMsg}</div>}
        {importErr && <div className="cat-import-msg err">{importErr}</div>}

        {pendingImportRows.length > 0 && (
          <div className="cat-import-preview">
            <div className="cat-import-preview-head">
              <div>
                <div className="cat-import-preview-title">
                  Vista previa: {pendingImportFileName}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {pendingImportRows.filter((r) => !r.error).length} válidas · {pendingImportRows.filter((r) => !!r.error).length} con error
                </div>
              </div>
              <div className="cat-import-preview-actions">
                {pendingImportRows.some((r) => !!r.error) && (
                  <button
                    className="cat-import-preview-btn"
                    onClick={() => { setPreviewOnlyErrors(!previewOnlyErrors); setPreviewPage(1); }}
                  >
                    {previewOnlyErrors ? 'Ver todas' : 'Solo errores'}
                  </button>
                )}
                <button
                  className="cat-import-preview-btn ok"
                  onClick={() => importarCatalogo(pendingImportRows)}
                  disabled={importando || !pendingImportRows.some((r) => !r.error)}
                >
                  {importando ? 'Importando...' : 'Confirmar importación'}
                </button>
                <button className="cat-import-preview-btn no" onClick={cancelarImportacion}>
                  Cancelar
                </button>
              </div>
            </div>
            <div className="cat-import-preview-table-wrap">
              <table className="cat-import-preview-table">
                <thead>
                  <tr>
                    <th>Fila</th><th>Codigo</th><th>Nombre</th><th>Tipo</th><th>Nat.</th><th>Niv.</th><th>Mov.</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {previewSlice.map((r) => (
                    <tr key={r.row} style={{ background: r.error ? '#fef2f2' : undefined }}>
                      <td style={{ color: '#9ca3af' }}>{r.row}</td>
                      <td style={{ fontFamily: 'monospace' }}>{r.codigo}</td>
                      <td>{r.nombre}</td>
                      <td>{r.tipo}</td>
                      <td>{r.naturaleza}</td>
                      <td>{r.nivel || ''}</td>
                      <td style={{ textAlign: 'center' }}>{r.acepta_movimiento ? '✓' : ''}</td>
                      <td style={{ color: r.error ? '#b91c1c' : '#16a34a', fontWeight: 600 }}>
                        {r.error || 'OK'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewTotalPages > 1 && (
              <div className="cat-import-preview-pager">
                <span className="cat-import-preview-pager-info">
                  Página {previewPage} de {previewTotalPages}
                </span>
                <div className="cat-import-preview-pager-actions">
                  <button className="cat-import-preview-btn" onClick={() => setPreviewPage((p) => Math.max(1, p - 1))} disabled={previewPage === 1}>‹ Ant</button>
                  <button className="cat-import-preview-btn" onClick={() => setPreviewPage((p) => Math.min(previewTotalPages, p + 1))} disabled={previewPage === previewTotalPages}>Sig ›</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="cat-table-wrap rv-desktop-table">
          <table className="cat-table">
            <thead>
              <tr>
                <th>Codigo Empresa</th>
                <th>Nombre Empresa</th>
                <th>Nivel</th>
                <th>Tipo</th>
                <th>Naturaleza</th>
                <th>Movimiento</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={8} className="cat-empty">Cargando catalogo...</td></tr>
              ) : cuentasFiltradas.length === 0 ? (
                <tr><td colSpan={8} className="cat-empty">No se encontraron cuentas</td></tr>
              ) : cuentasFiltradas.map((cuenta) => {
                const meta = getCuentaMeta(cuenta);
                const base = meta.base;
                return (
                  <tr key={cuenta.id} className={`nivel-${meta.nivel} ${!cuenta.activo ? 'row-inactiva' : ''}`}>
                    <td>
                      <span className="cat-codigo">
                        {cuenta.codigo}
                      </span>
                    </td>
                    <td>
                      <span className="cat-nombre">
                        {cuenta.nombre}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: '#9bb0d3' }}>Nivel {meta.nivel}</td>
                    <td><span className={`tipo-badge tipo-${meta.tipo}`}>{meta.tipo || '-'}</span></td>
                    <td>
                      <span className={`tipo-badge ${meta.naturaleza === 'DEBITO' ? 'tipo-COSTO' : 'tipo-INGRESO'}`}>
                        {meta.naturaleza || '-'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={meta.aceptaMovimiento ? 'mov-si' : 'mov-no'}>
                        {formatBooleanFlag(!!meta.aceptaMovimiento, 'ui')}
                      </span>
                    </td>
                    <td>
                      <span className={`estado-badge ${cuenta.activo ? 'estado-activo' : 'estado-inactivo'}`}>
                        {cuenta.activo ? 'ACTIVA' : 'INACTIVA'}
                      </span>
                    </td>
                    <td>
                      <button className="btn-editar" onClick={() => abrirEditar(cuenta)} disabled={!canEdit}>
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="cat-mobile-list rv-mobile-cards">
          {cargando ? (
            <div className="cat-empty">Cargando catalogo...</div>
          ) : cuentasFiltradas.length === 0 ? (
            <div className="cat-empty">No se encontraron cuentas</div>
          ) : cuentasFiltradas.map((cuenta) => {
            const meta = getCuentaMeta(cuenta);
            return (
              <div key={`m-${cuenta.id}`} className={`cat-card nivel-${meta.nivel}`}>
                <div className="cat-card-head">
                  <span className="cat-codigo">
                    {cuenta.codigo}
                  </span>
                  <span style={{ fontSize: '12px', color: '#9bb0d3' }}>Nivel {meta.nivel}</span>
                </div>
                <div className="cat-card-name">{cuenta.nombre}</div>
                <div className="cat-card-grid">
                  <div className="cat-card-row">
                    <span className="cat-card-label">Tipo</span>
                    <span className={`tipo-badge tipo-${meta.tipo}`}>{meta.tipo || '-'}</span>
                  </div>
                  <div className="cat-card-row">
                    <span className="cat-card-label">Naturaleza</span>
                    <span className={`tipo-badge ${meta.naturaleza === 'DEBITO' ? 'tipo-COSTO' : 'tipo-INGRESO'}`}>{meta.naturaleza || '-'}</span>
                  </div>
                  <div className="cat-card-row">
                    <span className="cat-card-label">Movimiento</span>
                    <span style={{ color: meta.aceptaMovimiento ? '#16a34a' : '#9ca3af', fontWeight: 600 }}>
                      {formatBooleanFlag(!!meta.aceptaMovimiento, 'ui')}
                    </span>
                  </div>
                  <div className="cat-card-row">
                    <span className="cat-card-label">Estado</span>
                    <span className={`estado-badge ${cuenta.activo ? 'estado-activo' : 'estado-inactivo'}`}>
                      {cuenta.activo ? 'ACTIVA' : 'INACTIVA'}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <button className="btn-editar" onClick={() => abrirEditar(cuenta)} disabled={!canEdit}>
                    Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editando && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Personalizar Cuenta</div>
            <div className="modal-sub">Modificando cuenta para esta empresa unicamente</div>
            <div className="modal-info">
              Codigo base: <span>{(editando.plan_cuentas_base as any)?.codigo}</span> - Nombre base:{' '}
              <span>{(editando.plan_cuentas_base as any)?.nombre}</span>
            </div>
            <div className="modal-field">
              <label className="modal-label">Codigo Personalizado</label>
              <input
                className="modal-input"
                value={form.codigo}
                onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))}
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Nombre Personalizado</label>
              <input
                className="modal-input"
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value.toUpperCase() }))}
              />
            </div>
            <label className="modal-check">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))}
              />
              <span>Cuenta Activa para esta empresa</span>
            </label>
            <div className="modal-actions">
              <button className="btn-cancelar" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn-guardar" onClick={guardar}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
