import React, { useRef, useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import FormCuenta from './FormCuenta';
import { exportCsv, exportPdfWithPrint, formatBooleanFlag, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
  nivel: number;
  tipo: string;
  naturaleza: string;
  acepta_movimiento: boolean;
  activo: boolean;
  padre_id: number | null;
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

const styles = `
  .pc-wrap { padding:0; color:#d6e2ff; }
  .pc-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:16px; }
  .pc-title { font-size:19px; font-weight:700; color:#f8fbff; letter-spacing:-0.03em; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  .pc-title span { font-size:13px; font-weight:500; color:#8ea3c7; margin-left:0; }
  .pc-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:18px; }
  .pc-export { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }
  .pc-export-btn { padding:8px 13px; border-radius:11px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; color:#d6e2ff; font-size:12px; font-weight:700; cursor:pointer; }
  .pc-export-btn:hover { border-color:#4c7bf7; color:#ffffff; background:#243149; }
  .pc-import-msg { margin-bottom:12px; padding:11px 13px; border-radius:12px; font-size:12px; border:1px solid transparent; }
  .pc-import-msg.ok { background:#0f2c20; border-color:#1d6e4f; color:#9df4c7; }
  .pc-import-msg.err { background:#34181c; border-color:#7d2f3a; color:#ffb3bb; white-space:pre-line; }
  .pc-import-preview { margin-bottom:12px; background:#182232; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .pc-import-preview-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; }
  .pc-import-preview-title { font-size:12px; font-weight:700; color:#f2f6ff; text-transform:uppercase; letter-spacing:.04em; }
  .pc-import-preview-sub { font-size:12px; color:#8ea3c7; }
  .pc-import-preview-actions { display:flex; gap:8px; }
  .pc-import-preview-btn { padding:7px 10px; border-radius:10px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; font-size:12px; font-weight:700; color:#d6e2ff; cursor:pointer; }
  .pc-import-preview-btn.ok { border-color:#1d6e4f; background:#123224; color:#9df4c7; }
  .pc-import-preview-btn.no { border-color:#7d2f3a; background:#34181c; color:#ffb3bb; }
  .pc-import-preview-table-wrap { overflow:auto; border:1px solid rgba(137,160,201,0.16); border-radius:10px; }
  .pc-import-preview-table { width:100%; min-width:760px; border-collapse:collapse; }
  .pc-import-preview-table th, .pc-import-preview-table td { padding:6px 8px; border-bottom:1px solid rgba(137,160,201,0.12); font-size:12px; text-align:left; }
  .pc-import-preview-table th { background:#131b2a; color:#8ea3c7; text-transform:uppercase; letter-spacing:.04em; font-size:10px; }
  .pc-import-preview-table td { color:#d6e2ff; }
  .pc-import-preview-pager { margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .pc-import-preview-pager-info { font-size:12px; color:#8ea3c7; }
  .pc-import-preview-pager-actions { display:flex; gap:8px; }
  .pc-search { padding:10px 14px; border:1px solid rgba(137,160,201,0.22); border-radius:12px;
    font-size:13px; color:#f3f7ff; outline:none; width:300px; background:#1d2738;
    font-family:'DM Sans',sans-serif; transition:border-color 0.2s, box-shadow 0.2s; }
  .pc-search::placeholder { color:#8ea3c7; }
  .pc-search:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .pc-filters { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .pc-filter-btn { padding:7px 14px; border-radius:10px; font-size:12px; font-weight:700;
    cursor:pointer; border:1px solid rgba(137,160,201,0.22); background:#1c2739; color:#c3d2f0;
    transition:all 0.15s; }
  .pc-filter-btn:hover { border-color:#4c7bf7; color:#ffffff; }
  .pc-filter-btn.active { background:#243149; border-color:#4c7bf7; color:#ffffff; }
  .pc-tipo-filters { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .pc-filter-group { display:flex; flex-direction:column; gap:6px; min-width:180px; }
  .pc-filter-label { font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.08em; font-weight:700; }
  .pc-filter-select {
    height:42px; border-radius:12px; border:1px solid rgba(137,160,201,0.22); background:#1d2738;
    color:#f3f7ff; padding:0 14px; font-size:13px; font-weight:700; outline:none;
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);
  }
  .pc-filter-select:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .tipo-btn { padding:6px 12px; border-radius:7px; font-size:11px; font-weight:600;
    cursor:pointer; border:1px solid transparent; transition:all 0.15s; }
  .tipo-btn.ACTIVO { background:#dbeafe; color:#1d4ed8; border-color:#bfdbfe; }
  .tipo-btn.PASIVO { background:#fce7f3; color:#be185d; border-color:#fbcfe8; }
  .tipo-btn.CAPITAL { background:#ede9fe; color:#7c3aed; border-color:#ddd6fe; }
  .tipo-btn.INGRESO { background:#dcfce7; color:#16a34a; border-color:#bbf7d0; }
  .tipo-btn.GASTO { background:#fee2e2; color:#dc2626; border-color:#fecaca; }
  .tipo-btn.COSTO { background:#ffedd5; color:#c2410c; border-color:#fed7aa; }
  .tipo-btn.inactive { background:#1b2433; color:#7184a8; border-color:rgba(137,160,201,0.14); }
  .pc-table-wrap { background:#172131; border-radius:16px; border:1px solid rgba(137,160,201,0.18);
    overflow-x:auto; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .pc-table { width:100%; min-width:900px; border-collapse:collapse; }
  .pc-table thead { background:#131b2a; position:sticky; top:0; z-index:1; }
  .pc-table th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600;
    color:#8ea3c7; letter-spacing:0.06em; text-transform:uppercase;
    border-bottom:1px solid rgba(137,160,201,0.16); }
  .pc-table td { padding:10px 16px; font-size:12px; color:#d6e2ff;
    border-bottom:1px solid rgba(137,160,201,0.12); }
  .pc-table tr:last-child td { border-bottom:none; }
  .pc-table tr:hover td { filter:brightness(1.03); }
  .pc-mobile-list { display:none; }
  .pc-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px; margin-bottom:8px; }
  .pc-card-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .pc-card-code { font-family:'DM Mono',monospace; font-size:12px; font-weight:700; color:#f3f7ff; }
  .pc-card-name { font-size:14px; font-weight:700; color:#f3f7ff; margin-bottom:8px; }
  .pc-card-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .pc-card-row { display:flex; flex-direction:column; gap:2px; }
  .pc-card-label { font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; }
  .pc-codigo { font-family:'DM Mono',monospace; font-size:12px; font-weight:500; }
  .pc-nombre { }
  .nivel-1 .pc-codigo { color:#1d4ed8; font-weight:700; }
  .nivel-1 .pc-nombre { font-weight:700; color:#f7fbff; font-size:14px; }
  .nivel-2 .pc-codigo { color:#7c3aed; }
  .nivel-2 .pc-nombre { font-weight:700; color:#eef4ff; }
  .nivel-3 .pc-codigo { color:#16a34a; }
  .nivel-3 .pc-nombre { font-weight:600; color:#eefaf4; }
  .nivel-4 .pc-codigo { color:#d97706; }
  .nivel-4 .pc-nombre { color:#fff6ea; }
  .nivel-5 .pc-codigo { color:#6b7280; }
  .nivel-5 .pc-nombre { color:#d6e2ff; }
  .pc-table tr.nivel-1 td { background:rgba(29,78,216,0.17); }
  .pc-table tr.nivel-2 td { background:rgba(124,58,237,0.16); }
  .pc-table tr.nivel-3 td { background:rgba(22,163,74,0.13); }
  .pc-table tr.nivel-4 td { background:rgba(217,119,6,0.13); }
  .pc-table tr.nivel-5 td { background:rgba(148,163,184,0.08); }
  .pc-indent { display:inline-block; }
  .tipo-badge { display:inline-flex; align-items:center; padding:0;
    border-radius:0; font-size:12px; font-weight:700; background:transparent; }
  .tipo-ACTIVO { color:#8ab4ff; }
  .tipo-PASIVO { color:#ff9ac7; }
  .tipo-CAPITAL { color:#bf9bff; }
  .tipo-INGRESO { color:#74e79a; }
  .tipo-GASTO { color:#ff8d94; }
  .tipo-COSTO { color:#ffbc7c; }
  .nat-badge { display:inline-flex; align-items:center; padding:0;
    border-radius:0; font-size:12px; font-weight:700; background:transparent; }
  .nat-DEBITO { color:#ffb36a; }
  .nat-CREDITO { color:#77e39e; }
  .informe-badge { display:inline-flex; align-items:center; padding:0;
    border-radius:0; font-size:12px; font-weight:700; background:transparent; }
  .informe-BALANCE { color:#8ab4ff; }
  .informe-RESULTADOS { color:#ffd66f; }
  .mov-si { color:#16a34a; font-size:16px; }
  .mov-no { color:#e5e7eb; font-size:16px; }
  .estado-badge { display:inline-flex; align-items:center; padding:0;
    border-radius:0; font-size:12px; font-weight:700; background:transparent; }
  .estado-activo { color:#8be2a4; }
  .estado-inactivo { color:#ff8d94; }
  .pc-table tr.row-inactiva td { opacity:0.58; }
  .pc-empty { padding:48px; text-align:center; color:#8ea3c7; font-size:13px; }
  .pc-stats { display:flex; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
  .pc-stat { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px;
    padding:14px 18px; display:flex; flex-direction:column; gap:4px; min-width:130px; box-shadow:0 16px 28px rgba(3,8,20,.16); }
  .pc-stat-num { font-size:20px; font-weight:800; color:#f3f7ff; }
  .pc-stat-label { font-size:11px; color:#8ea3c7; font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
  .btn-nuevo { padding:12px 18px; background:linear-gradient(135deg,#17a34a,#22c55e);
    border:none; border-radius:10px; color:white; font-size:13px; font-weight:600;
    cursor:pointer; transition:opacity 0.2s, transform 0.2s; box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .btn-nuevo:hover { opacity:0.95; transform:translateY(-1px); }
  .pc-edit-btn { padding:6px 12px; background:#243149; border:1px solid rgba(76,123,247,0.34);
    border-radius:9px; color:#9ec3ff; font-size:11px; font-weight:700; cursor:pointer; }
  .pc-edit-btn:hover { background:#2c3c58; color:#ffffff; }

  @media (max-width: 900px) {
    .pc-header { flex-wrap:wrap; gap:10px; }
    .pc-title { font-size:18px; }
    .btn-nuevo { width:100%; }
    .pc-search { width:100%; }
    .pc-toolbar { gap:8px; }
    .pc-export { margin-left:0; width:100%; }
    .pc-export-btn { flex:1; text-align:center; }
  }

  @media (max-width: 620px) {
    .pc-title span { display:block; margin-left:0; margin-top:2px; }
    .pc-stats { gap:8px; }
    .pc-stat { width:100%; }
    .pc-table-wrap { display:none; }
    .pc-mobile-list { display:block; }
  }

`;


const getInforme = (tipo: string) => {
  if (['ACTIVO', 'PASIVO', 'CAPITAL'].includes(tipo)) return 'BALANCE';
  return 'RESULTADOS';
};

const TIPOS = ['ACTIVO', 'PASIVO', 'CAPITAL', 'INGRESO', 'COSTO', 'GASTO'];
const NIVELES = [1, 2, 3, 4, 5];
const NATURALEZAS = ['DEBITO', 'CREDITO'];

const normalizeImportText = (v: string) =>
  String(v || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizeTipoImport = (v: string): string => {
  const raw = normalizeImportText(v).replace(/\s+/g, '');
  const alias: Record<string, string> = {
    ACTIVO: 'ACTIVO',
    ACTIVOS: 'ACTIVO',
    PASIVO: 'PASIVO',
    PASIVOS: 'PASIVO',
    CAPITAL: 'CAPITAL',
    CAPITALYPATRIMONIO: 'CAPITAL',
    PATRIMONIO: 'CAPITAL',
    INGRESO: 'INGRESO',
    INGRESOS: 'INGRESO',
    GASTO: 'GASTO',
    GASTOS: 'GASTO',
    COSTO: 'COSTO',
    COSTOS: 'COSTO',
    COSTODEVENTAS: 'COSTO',
  };
  return alias[raw] || '';
};

const normalizeHeader = (v: string) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

const parseBool = (v: any, defaultValue = false) => {
  if (v === null || v === undefined || String(v).trim() === '') return defaultValue;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'si', 'sí', 's', 'x', 'yes', 'y'].includes(s);
};

const inferNivel = (codigo: string): number | null => {
  const c = String(codigo || '').trim();
  if (/^\d{2}$/.test(c)) return 1;
  if (/^\d{4}$/.test(c)) return 2;
  if (/^\d{4}-\d{2}$/.test(c)) return 3;
  if (/^\d{4}-\d{2}-\d{3}$/.test(c)) return 4;
  if (/^\d{4}-\d{2}-\d{3}-\d{3}$/.test(c)) return 5;
  return null;
};

const splitCuentaCodigo = (codigo: string): number[] => {
  const clean = String(codigo || '').trim();
  if (!clean) return [];
  const tokens = clean.split(/[-.]/g).filter(Boolean);
  if (tokens.length === 1 && /^\d+$/.test(tokens[0])) {
    const t = tokens[0];
    if (t.length === 2) return [Number(t)];
    if (t.length === 4) return [Number(t.slice(0, 2)), Number(t.slice(2, 4))];
  }
  return tokens.map((t) => Number(t.replace(/\D/g, '')) || 0);
};

const compareCuentaCodigoTree = (aCode: string, bCode: string): number => {
  const a = splitCuentaCodigo(aCode);
  const b = splitCuentaCodigo(bCode);
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const av = i < a.length ? a[i] : -1;
    const bv = i < b.length ? b[i] : -1;
    if (av !== bv) return av - bv;
  }
  return String(aCode).localeCompare(String(bCode), 'es', { numeric: true, sensitivity: 'base' });
};

const getParentCodigo = (codigo: string): string | null => {
  const c = String(codigo || '').trim();
  if (!c) return null;
  if (/^\d{2}$/.test(c)) return null;
  if (/^\d{4}$/.test(c)) return c.slice(0, 2);
  if (/^\d{4}-\d{2}$/.test(c)) return c.slice(0, 4);
  if (/^\d{4}-\d{2}-\d{3}$/.test(c)) return c.replace(/-\d{3}$/, '');
  if (/^\d{4}-\d{2}-\d{3}-\d{3}$/.test(c)) return c.replace(/-\d{3}$/, '');
  if (c.includes('-')) return c.replace(/-[^-]+$/, '') || null;
  if (c.includes('.')) return c.replace(/\.[^.]+$/, '') || null;
  return null;
};

const orderByHierarchy = (rows: ImportCuenta[]): ImportCuenta[] => {
  const byCode = new Map<string, ImportCuenta>();
  rows.forEach((r) => byCode.set(r.codigo, r));

  const children = new Map<string, ImportCuenta[]>();
  const roots: ImportCuenta[] = [];

  for (const r of rows) {
    const parent = getParentCodigo(r.codigo);
    if (parent && byCode.has(parent)) {
      const list = children.get(parent) || [];
      list.push(r);
      children.set(parent, list);
    } else {
      roots.push(r);
    }
  }

  const sortList = (list: ImportCuenta[]) => list.sort((a, b) => compareCuentaCodigoTree(a.codigo, b.codigo));
  sortList(roots);
  Array.from(children.keys()).forEach((k) => {
    const list = children.get(k) || [];
    sortList(list);
    children.set(k, list);
  });

  const result: ImportCuenta[] = [];
  const visited = new Set<string>();

  const dfs = (node: ImportCuenta) => {
    if (visited.has(node.codigo)) return;
    visited.add(node.codigo);
    result.push(node);
    const kids = children.get(node.codigo) || [];
    kids.forEach(dfs);
  };

  roots.forEach(dfs);
  // Fallback por si algun nodo quedo aislado por formato raro.
  rows.forEach((r) => {
    if (!visited.has(r.codigo)) result.push(r);
  });
  return result;
};

export default function PlanCuentas() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [filtroNivel, setFiltroNivel] = useState<number | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'ACTIVAS' | 'INACTIVAS'>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<'lista' | 'nuevo' | 'editar'>('lista');
  const [cuentaEditar, setCuentaEditar] = useState<any>(null); 
  const [importando, setImportando] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [importErr, setImportErr] = useState('');
  const [pendingImportRows, setPendingImportRows] = useState<ImportCuenta[]>([]);
  const [pendingImportFileName, setPendingImportFileName] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewOnlyErrors, setPreviewOnlyErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from('plan_cuentas_base')
      .select('*')
      .order('activo', { ascending: false })
      .order('codigo');
    if (data) setCuentas(data);
    setCargando(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, []);

  const cuentasFiltradas = cuentas.filter(c => {
    if (filtroNivel && c.nivel !== filtroNivel) return false;
    if (filtroTipo && c.tipo !== filtroTipo) return false;
    if (filtroEstado === 'ACTIVAS' && !c.activo) return false;
    if (filtroEstado === 'INACTIVAS' && c.activo) return false;
    if (busqueda) {
      const b = busqueda.toLowerCase();
      return c.codigo.toLowerCase().includes(b) || c.nombre.toLowerCase().includes(b);
    }

    return true;
  });

  const exportRows = cuentasFiltradas.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    nivel: c.nivel,
    tipo: c.tipo,
    naturaleza: c.naturaleza,
    informe: getInforme(c.tipo),
    movimiento: formatBooleanFlag(!!c.acepta_movimiento, 'export'),
    estado: formatBooleanFlag(!!c.activo, 'export'),
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'codigo', title: 'Codigo', getValue: (r) => r.codigo, align: 'left', width: '10%' },
    { key: 'nombre', title: 'Nombre', getValue: (r) => r.nombre, align: 'left', width: '34%' },
    { key: 'nivel', title: 'Nivel', getValue: (r) => r.nivel, width: '6%' },
    { key: 'tipo', title: 'Tipo', getValue: (r) => r.tipo, width: '10%' },
    { key: 'naturaleza', title: 'Naturaleza', getValue: (r) => r.naturaleza, width: '12%' },
    { key: 'informe', title: 'Informe', getValue: (r) => r.informe, width: '10%' },
    { key: 'movimiento', title: 'Movimiento', getValue: (r) => r.movimiento, width: '9%' },
    { key: 'estado', title: 'Estado', getValue: (r) => r.estado, width: '9%' },
  ];

  const exportExcelCatalogoBase = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Plan Cuentas BASE', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });
    const company = (typeof window !== 'undefined' ? localStorage.getItem('mya_report_company_name') : '') || 'Empresa';
    const title = 'Plan de Cuentas (BASE)';
    const subtitle = `Total: ${cuentasFiltradas.length} cuentas`;

    ws.columns = [
      { key: 'codigo', width: 18 },
      { key: 'nombre', width: 42 },
      { key: 'nivel', width: 10 },
      { key: 'tipo', width: 14 },
      { key: 'naturaleza', width: 14 },
      { key: 'informe', width: 14 },
      { key: 'movimiento', width: 12 },
      { key: 'estado', width: 10 },
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

    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = company;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = title;
    ws.getCell('A2').font = { bold: true, size: 13 };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.mergeCells('A3:H3');
    ws.getCell('A3').value = subtitle;
    ws.getCell('A3').font = { italic: true, size: 10 };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    ws.addRow([]);
    const h = ws.addRow(['Codigo', 'Nombre', 'Nivel', 'Tipo', 'Naturaleza', 'Informe', 'Movimiento', 'Estado']);
    h.eachCell((c, idx) => {
      c.font = { bold: true, color: { argb: 'FF1F2937' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
      c.border = {
        ...borderHeader,
        left: idx === 1 ? borderHeader.left : borderVertical.left,
        right: idx === 8 ? borderHeader.right : borderVertical.right,
      };
    });

    cuentasFiltradas.forEach((c, i) => {
      const row = ws.addRow([
        c.codigo,
        c.nombre,
        `Nivel ${c.nivel}`,
        c.tipo,
        c.naturaleza,
        getInforme(c.tipo),
        formatBooleanFlag(!!c.acepta_movimiento, 'ui'),
        formatBooleanFlag(!!c.activo, 'ui'),
      ]);
      const fillArgb = levelFill[Math.max(1, Math.min(5, Number(c.nivel) || 5))] || 'FFF8FAFC';
      const isLast = i === cuentasFiltradas.length - 1;
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
        cell.border = isLast ? borderVerticalBottom : borderVertical;
      });
    });

    ws.pageSetup.printArea = `A1:H${ws.rowCount}`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan_cuentas_base.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Estadísticas
  const stats = {
    total: cuentas.length,
    movimiento: cuentas.filter(c => c.acepta_movimiento).length,
    balance: cuentas.filter(c => ['ACTIVO','PASIVO','CAPITAL'].includes(c.tipo)).length,
    resultados: cuentas.filter(c => ['INGRESO', 'COSTO', 'GASTO'].includes(c.tipo)).length,
    inactivas: cuentas.filter(c => !c.activo).length,
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
      codigo: headersRaw.indexOf('codigo'),
      nombre: headersRaw.indexOf('nombre'),
      tipo: headersRaw.indexOf('tipo'),
      naturaleza: headersRaw.indexOf('naturaleza'),
      acepta_movimiento: headersRaw.indexOf('acepta_movimiento'),
      activo: headersRaw.indexOf('activo'),
    };
    if (idx.codigo < 0 || idx.nombre < 0) {
      throw new Error('La plantilla debe incluir columnas: codigo y nombre');
    }

    const parsed: ImportCuenta[] = [];

    for (let i = 1; i < matrix.length; i += 1) {
      const row = matrix[i] || [];
      const excelRow = i + 1;
      const codigo = String(row[idx.codigo] || '').trim();
      const nombre = String(row[idx.nombre] || '').trim();
      if (!codigo && !nombre) continue;
      if (!codigo || !nombre) {
        parsed.push({
          codigo,
          nombre,
          nivel: 0,
          tipo: '',
          naturaleza: '',
          acepta_movimiento: false,
          activo: false,
          row: excelRow,
          error: 'Codigo/nombre requeridos',
        });
        continue;
      }

      const nivel = inferNivel(codigo);
      if (!nivel) {
        parsed.push({
          codigo,
          nombre,
          nivel: 0,
          tipo: '',
          naturaleza: '',
          acepta_movimiento: false,
          activo: false,
          row: excelRow,
          error: `Codigo invalido (${codigo})`,
        });
        continue;
      }

      const tipoRaw = String(idx.tipo >= 0 ? row[idx.tipo] : '').trim();
      const naturalezaRaw = normalizeImportText(String(idx.naturaleza >= 0 ? row[idx.naturaleza] : ''));
      const tipoNormalizado = normalizeTipoImport(tipoRaw);
      const tipo = tipoNormalizado || (nivel <= 2 ? 'ACTIVO' : 'GASTO');
      const naturaleza = NATURALEZAS.includes(naturalezaRaw)
        ? naturalezaRaw
        : (tipo === 'PASIVO' || tipo === 'CAPITAL' || tipo === 'INGRESO' ? 'CREDITO' : 'DEBITO');
      const tipoInvalido = tipoRaw !== '' && !tipoNormalizado;

      parsed.push({
        codigo,
        nombre,
        nivel,
        tipo,
        naturaleza,
        acepta_movimiento: nivel === 5 ? parseBool(idx.acepta_movimiento >= 0 ? row[idx.acepta_movimiento] : '', true) : false,
        activo: parseBool(idx.activo >= 0 ? row[idx.activo] : '', true),
        row: excelRow,
        error: tipoInvalido
          ? `Tipo invalido (${tipoRaw}). Valores permitidos: ACTIVO, PASIVO, CAPITAL, INGRESO, COSTO, GASTO`
          : '',
      });
    }

    return orderByHierarchy(parsed);
  };

  const importarCatalogo = async (rows: ImportCuenta[]) => {
    setImportErr('');
    setImportMsg('');
    setImportando(true);
    try {
      if (!rows.length) throw new Error('No se encontraron filas en la vista previa');
      const validRows = rows.filter((r) => !r.error);
      const invalidRows = rows.filter((r) => !!r.error);
      if (!validRows.length) throw new Error('No hay filas validas para importar');

      let ok = 0;
      const errors: string[] = [];
      for (const r of validRows) {
        const payload = {
          codigo: r.codigo,
          nombre: r.nombre,
          nivel: r.nivel,
          tipo: r.tipo,
          naturaleza: r.naturaleza,
          acepta_movimiento: r.acepta_movimiento,
          activo: r.activo,
        };

        const { error } = await supabase
          .from('plan_cuentas_base')
          .upsert(payload, { onConflict: 'codigo' });

        if (error) errors.push(`Fila ${r.row} (${r.codigo}): ${error.message}`);
        else ok += 1;
      }

      if (errors.length || invalidRows.length) {
        const invalidMsg = invalidRows.length ? `\nFilas invalidas omitidas: ${invalidRows.length}` : '';
        setImportErr(`Importadas ${ok}/${validRows.length} filas.${invalidMsg}\n${errors.slice(0, 15).join('\n')}`.trim());
      } else {
        setImportMsg(`Importacion exitosa: ${ok} filas procesadas.`);
      }

      await cargar();
      setPendingImportRows([]);
      setPendingImportFileName('');
      setPreviewPage(1);
      setPreviewOnlyErrors(false);
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

  const confirmarImportacion = async () => {
    if (!pendingImportRows.length) return;
    await importarCatalogo(pendingImportRows);
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
  const previewSafePage = Math.min(previewPage, previewTotalPages);
  const previewFrom = (previewSafePage - 1) * previewPageSize;
  const previewRows = previewSourceRows.slice(previewFrom, previewFrom + previewPageSize);

    if (vista === 'nuevo') {
    return <FormCuenta
        cuenta={null}
        onGuardar={() => { setVista('lista'); cargar(); }}
        onCancelar={() => setVista('lista')}
    />;
    }

    if (vista === 'editar' && cuentaEditar) {
    return <FormCuenta
        cuenta={cuentaEditar}
        onGuardar={() => { setVista('lista'); cargar(); }}
        onCancelar={() => setVista('lista')}
    />;
    }

  return (
    <>
      <style>{styles}</style>
      <div className="pc-wrap">
        <div className="pc-header">
          <div className="pc-title">
            Plan de Cuentas (BASE)
            <span>{cuentasFiltradas.length} de {cuentas.length} cuentas</span>
          </div>
          <button className="btn-nuevo" onClick={() => setVista('nuevo')}>
            + Nueva Cuenta
            </button>
        </div>

        {/* Estadísticas */}
        <div className="pc-stats">
          <div className="pc-stat">
            <span className="pc-stat-num">{stats.total}</span>
            <span className="pc-stat-label">Total Cuentas</span>
          </div>
          <div className="pc-stat">
            <span className="pc-stat-num" style={{ color: '#16a34a' }}>{stats.movimiento}</span>
            <span className="pc-stat-label">Aceptan Movimiento</span>
          </div>
          <div className="pc-stat">
            <span className="pc-stat-num" style={{ color: '#1e40af' }}>{stats.balance}</span>
            <span className="pc-stat-label">Balance General</span>
          </div>
          <div className="pc-stat">
            <span className="pc-stat-num" style={{ color: '#854d0e' }}>{stats.resultados}</span>
            <span className="pc-stat-label">Estado Resultados</span>
          </div>
          <div className="pc-stat">
            <span className="pc-stat-num" style={{ color: '#991b1b' }}>{stats.inactivas}</span>
            <span className="pc-stat-label">Inactivas</span>
          </div>
        </div>
        {importMsg && <div className="pc-import-msg ok">{importMsg}</div>}
        {importErr && <div className="pc-import-msg err">{importErr}</div>}
        {pendingImportRows.length > 0 && (
          <div className="pc-import-preview">
            <div className="pc-import-preview-head">
              <div>
                <div className="pc-import-preview-title">Vista previa de importacion</div>
                <div className="pc-import-preview-sub">
                  Archivo: {pendingImportFileName} | Filas: {pendingImportRows.length}
                  {' | '}
                  Validas: {pendingImportRows.filter((r) => !r.error).length}
                  {' | '}
                  Errores: {pendingImportRows.filter((r) => !!r.error).length}
                </div>
              </div>
              <div className="pc-import-preview-actions">
                <button
                  className="pc-import-preview-btn"
                  onClick={() => {
                    setPreviewOnlyErrors((v) => !v);
                    setPreviewPage(1);
                  }}
                  style={previewOnlyErrors ? { borderColor: '#7d2f3a', background: '#34181c', color: '#ffb3bb' } : undefined}
                >
                  {previewOnlyErrors ? 'Ver todos' : 'Solo errores'}
                </button>
                <button className="pc-import-preview-btn no" onClick={cancelarImportacion} disabled={importando}>
                  Cancelar
                </button>
                <button
                  className="pc-import-preview-btn ok"
                  onClick={confirmarImportacion}
                  disabled={importando || pendingImportRows.filter((r) => !r.error).length === 0}
                >
                  {importando ? 'Importando...' : 'Confirmar importacion'}
                </button>
              </div>
            </div>
            <div className="pc-import-preview-table-wrap">
              <table className="pc-import-preview-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Codigo</th>
                    <th>Nombre</th>
                    <th>Nivel</th>
                    <th>Tipo</th>
                    <th>Naturaleza</th>
                    <th>Mov.</th>
                    <th>Activo</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, idx) => (
                    <tr key={`${r.codigo}-${idx}`} style={r.error ? { background: 'rgba(125,47,58,0.22)' } : undefined}>
                      <td>{r.row}</td>
                      <td>{r.codigo}</td>
                      <td>{r.nombre}</td>
                      <td>{r.nivel}</td>
                      <td>{r.tipo}</td>
                      <td>{r.naturaleza}</td>
                      <td>{r.acepta_movimiento ? 'SI' : 'NO'}</td>
                      <td>{r.activo ? 'SI' : 'NO'}</td>
                      <td style={{ color: r.error ? '#ffb3bb' : '#8ea3c7' }}>{r.error || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pendingImportRows.length > 0 && (
              <div className="pc-import-preview-pager">
                <div className="pc-import-preview-pager-info">
                  Mostrando {previewSourceRows.length === 0 ? 0 : previewFrom + 1}
                  {' - '}
                  {Math.min(previewFrom + previewRows.length, previewSourceRows.length)}
                  {' de '}
                  {previewSourceRows.length}
                  {previewOnlyErrors ? ' (solo errores)' : ''}
                </div>
                <div className="pc-import-preview-pager-actions">
                  <button
                    className="pc-import-preview-btn"
                    onClick={() => setPreviewPage(1)}
                    disabled={previewSafePage <= 1}
                  >
                    Ir al inicio
                  </button>
                  <button
                    className="pc-import-preview-btn"
                    onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                    disabled={previewSafePage <= 1}
                  >
                    Anterior
                  </button>
                  <div className="pc-import-preview-pager-info">
                    Pagina {previewSafePage} / {previewTotalPages}
                  </div>
                  <button
                    className="pc-import-preview-btn"
                    onClick={() => setPreviewPage((p) => Math.min(previewTotalPages, p + 1))}
                    disabled={previewSafePage >= previewTotalPages}
                  >
                    Siguiente
                  </button>
                  <button
                    className="pc-import-preview-btn"
                    onClick={() => setPreviewPage(previewTotalPages)}
                    disabled={previewSafePage >= previewTotalPages}
                  >
                    Ir al final
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Toolbar */}
        <ListToolbar
          className="pc-toolbar"
          search={(
            <input className="pc-search" placeholder="Buscar por codigo o nombre..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          )}
          filters={(
            <>
              <div className="pc-filter-group">
                <span className="pc-filter-label">Nivel</span>
                <select
                  className="pc-filter-select"
                  value={filtroNivel ?? ''}
                  onChange={(e) => setFiltroNivel(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Todos los niveles</option>
                  {NIVELES.map((n) => (
                    <option key={n} value={n}>Nivel {n}</option>
                  ))}
                </select>
              </div>

              <div className="pc-filter-group">
                <span className="pc-filter-label">Tipo</span>
                <select
                  className="pc-filter-select"
                  value={filtroTipo ?? ''}
                  onChange={(e) => setFiltroTipo(e.target.value || null)}
                >
                  <option value="">Todos los tipos</option>
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="pc-filter-group">
                <span className="pc-filter-label">Estado</span>
                <select
                  className="pc-filter-select"
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value as 'TODAS' | 'ACTIVAS' | 'INACTIVAS')}
                >
                  <option value="TODAS">Todas</option>
                  <option value="ACTIVAS">Activas</option>
                  <option value="INACTIVAS">Inactivas</option>
                </select>
              </div>
            </>
          )}
          exports={(
            <>
              <button
                className="pc-export-btn"
                onClick={() => exportCsv('plan_cuentas.csv', exportRows, exportColumns)}
                disabled={exportRows.length === 0}
              >
                CSV
              </button>
              <button
                className="pc-export-btn"
                onClick={exportExcelCatalogoBase}
                disabled={exportRows.length === 0}
              >
                EXCEL
              </button>
              <button
                className="pc-export-btn"
                onClick={() => exportPdfWithPrint({
                  title: 'Plan de Cuentas (BASE)',
                  subtitle: `Total: ${exportRows.length} cuentas`,
                  rows: exportRows,
                  columns: exportColumns,
                  footerText: '',
                  orientation: 'landscape',
                })}
                disabled={exportRows.length === 0}
              >
                PDF
              </button>
              <button className="pc-export-btn" onClick={descargarPlantillaImportacion}>
                PLANTILLA
              </button>
              <button
                className="pc-export-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={importando}
              >
                {importando ? 'IMPORTANDO...' : 'IMPORTAR EXCEL'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={onFilePicked}
              />
            </>
          )}
        />

        {/* Tabla Desktop */}
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Nivel</th>
                <th>Tipo</th>
                <th>Naturaleza</th>
                <th>Informe</th>
                <th>Movimiento</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={9} className="pc-empty">Cargando plan de cuentas...</td></tr>
              ) : cuentasFiltradas.length === 0 ? (
                <tr><td colSpan={9} className="pc-empty">No se encontraron cuentas</td></tr>
              ) : cuentasFiltradas.map(cuenta => (
                <tr key={cuenta.id} className={`nivel-${cuenta.nivel} ${!cuenta.activo ? 'row-inactiva' : ''}`}>
                  <td>
                    <span className="pc-indent">
                      <span className="pc-codigo">{cuenta.codigo}</span>
                    </span>
                  </td>
                  <td>
                    <span className="pc-nombre">
                      {cuenta.nombre}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', color: '#9bb0d3' }}>
                      Nivel {cuenta.nivel}
                    </span>
                  </td>
                  <td>
                    <span className={`tipo-badge tipo-${cuenta.tipo}`}>{cuenta.tipo}</span>
                  </td>
                  <td>
                    <span className={`nat-badge nat-${cuenta.naturaleza}`}>
                      {cuenta.naturaleza}
                    </span>
                  </td>
                  <td>
                    <span className={`informe-badge informe-${getInforme(cuenta.tipo)}`}>
                      {getInforme(cuenta.tipo)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={cuenta.acepta_movimiento ? 'mov-si' : 'mov-no'}>
                      {formatBooleanFlag(!!cuenta.acepta_movimiento, 'ui')}
                    </span>
                  </td>
                  <td>
                    <span className={`estado-badge ${cuenta.activo ? 'estado-activo' : 'estado-inactivo'}`}>
                      {cuenta.activo ? 'ACTIVA' : 'INACTIVA'}
                    </span>
                  </td>

                <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="pc-edit-btn"
                        onClick={() => { setCuentaEditar(cuenta); setVista('editar'); }}>
                        Editar
                        </button>
                    </div>
                </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards Mobile */}
        <div className="pc-mobile-list">
          {cargando ? (
            <div className="pc-empty">Cargando plan de cuentas...</div>
          ) : cuentasFiltradas.length === 0 ? (
            <div className="pc-empty">No se encontraron cuentas</div>
          ) : cuentasFiltradas.map((cuenta) => (
            <div key={`m-${cuenta.id}`} className={`pc-card nivel-${cuenta.nivel}`}>
              <div className="pc-card-head">
                <span className="pc-card-code">{cuenta.codigo}</span>
                <span style={{ fontSize: '12px', color: '#9bb0d3' }}>Nivel {cuenta.nivel}</span>
              </div>
              <div className="pc-card-name">{cuenta.nombre}</div>
              <div className="pc-card-grid">
                <div className="pc-card-row">
                  <span className="pc-card-label">Tipo</span>
                  <span className={`tipo-badge tipo-${cuenta.tipo}`}>{cuenta.tipo}</span>
                </div>
                <div className="pc-card-row">
                  <span className="pc-card-label">Naturaleza</span>
                  <span className={`nat-badge nat-${cuenta.naturaleza}`}>{cuenta.naturaleza}</span>
                </div>
                <div className="pc-card-row">
                  <span className="pc-card-label">Informe</span>
                  <span className={`informe-badge informe-${getInforme(cuenta.tipo)}`}>{getInforme(cuenta.tipo)}</span>
                </div>
                <div className="pc-card-row">
                  <span className="pc-card-label">Movimiento</span>
                  <span style={{ color: cuenta.acepta_movimiento ? '#16a34a' : '#9ca3af', fontWeight: 600 }}>
                    {formatBooleanFlag(!!cuenta.acepta_movimiento, 'ui')}
                  </span>
                </div>
                <div className="pc-card-row">
                  <span className="pc-card-label">Estado</span>
                  <span className={`estado-badge ${cuenta.activo ? 'estado-activo' : 'estado-inactivo'}`}>
                    {cuenta.activo ? 'ACTIVA' : 'INACTIVA'}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: '10px' }}>
                <button
                  className="pc-edit-btn"
                  onClick={() => { setCuentaEditar(cuenta); setVista('editar'); }}
                >
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
