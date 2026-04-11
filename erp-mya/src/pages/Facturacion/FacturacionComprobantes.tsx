import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceMainPanel } from '../../components/WorkspaceShell';
import { supabase } from '../../supabase';
import {
  FE_MEDIO_PAGO_OPTIONS,
  FE_SUBTIPO_OPTIONS,
  LiquidacionPagoRow,
  createLiquidacionPago,
  detalleLabel,
  hydrateLiquidacionPagos,
  liquidacionTotal,
  medioPagoPrincipal,
  referenciaLabel,
  serializeLiquidacionPagos,
  validateLiquidacionPagos,
} from '../../utils/fePaymentLiquidation';

interface Props {
  empresaId: number;
  canEdit?: boolean;
}

interface ConfigFe {
  sucursal: string;
  punto_venta: string;
  condicion_venta_defecto: string;
  medio_pago_defecto: string;
  plazo_credito_dias: number;
  tipo_documento_defecto: string;
}

interface Terminal {
  id: number;
  nombre: string;
  sucursal: string;
  punto_venta: string;
  activo: boolean;
  es_defecto: boolean;
}

interface ParamFacturacion {
  lineas_por_factura: number;
}

interface ClienteOpt {
  id: number;
  codigo: string | null;
  razon_social: string;
  identificacion: string | null;
  email: string | null;
  dias_credito?: number;
  limite_credito?: number;
  condicion_pago?: string | null;
  aplica_descuentos?: boolean;
  descuento_maximo_pct?: number;
  escala_precio?: number;
  credito_habilitado?: boolean;
  credito_bloqueado?: boolean;
  monto_vencido?: number;
  saldo_actual?: number;
  docs_pendientes?: number;
}

interface ActividadMh {
  codigo: string;
  descripcion: string;
}

interface ReceptorBitacoraRow {
  id: number;
  tipo_identificacion: string | null;
  identificacion: string;
  razon_social: string;
  actividad_tributaria_id: number | null;
  actividad_codigo: string | null;
  actividad_descripcion: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  payload_json?: any;
}

interface ProductoOpt {
  id: number;
  codigo: string;
  codigo_barras?: string | null;
  categoria_id?: number | null;
  inv_categorias?: { nombre?: string | null; codigo_prefijo?: string | null } | null;
  descripcion: string;
  tipo: 'producto' | 'servicio' | 'combo';
  unidad_medida: string;
  codigo_cabys: string | null;
  codigo_tarifa_iva: string | null;
  tarifa_iva: number;
  precio_venta: number;
  descuento_autorizado_pct: number;
  impuesto_venta_incluido: boolean;
  precio_por_medida: number;
  stock_actual: number;
}

interface ProductoEscalaRow {
  producto_id: number;
  escala: number;
  utilidad_pct: number;
  precio_venta: number;
  precio_final: number;
}

interface ProductoClientePrecioRow {
  producto_id: number;
  tercero_id: number;
  escala_precio: number;
  precio_venta: number;
  descuento_maximo_pct: number;
}

interface ExoneracionOpt {
  id: number;
  autorizacion: string;
  porcentaje_exoneracion: number;
  fecha_vencimiento: string | null;
  vigente: boolean;
  cabys_count?: number;
}

interface ExoneracionCabysRow {
  exoneracion_id: number;
  cabys: string;
}

interface LineaForm {
  id: string;
  producto_id: number | null;
  codigo: string;
  descripcion: string;
  tipo_linea: 'mercaderia' | 'servicio';
  unidad_medida: string;
  cabys: string;
  tarifa_iva_codigo: string;
  tarifa_iva_porcentaje: number;
  cantidad: number;
  precio_unitario: number;
  descuento_monto: number;
  descuento_autorizado_pct: number;
  impuesto_venta_incluido: boolean;
  precio_por_medida: number;
  escala_precio: number;
  partida_arancelaria: string;
}

type LineaCellKey = 'producto' | 'cantidad' | 'descuento' | 'precio';


const DOC_LABEL: Record<string, string> = {
  '01': 'Factura Electronica',
  '02': 'Nota de Debito',
  '03': 'Nota de Credito',
  '04': 'Tiquete Electronico',
  '09': 'Factura Exportacion',
};


const IVA_BY_CODE: Record<string, number> = { '13': 13, '08': 8, '06': 4, '05': 2, '04': 1, '01': 0, '02': 0, '03': 0, '09': 0.5, '10': 0, '11': 0 };

const sep = ' · ';


const inferTipoIdentificacion = (identificacion: string) => {
  const raw = String(identificacion || '').replace(/\D/g, '');
  if (raw.length === 9) return '01';
  if (raw.length === 10) return '02';
  if (raw.length >= 11) return '03';
  return '';
};

const emptyLinea = (): LineaForm => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  producto_id: null,
  codigo: '',
  descripcion: '',
  tipo_linea: 'mercaderia',
  unidad_medida: 'Unid',
  cabys: '',
  tarifa_iva_codigo: '13',
  tarifa_iva_porcentaje: 13,
  cantidad: 1,
  precio_unitario: 0,
  descuento_monto: 0,
  descuento_autorizado_pct: 0,
  impuesto_venta_incluido: false,
  precio_por_medida: 0,
  escala_precio: 1,
  partida_arancelaria: '',
});

const styles = `
  .fdoc-wrap { color:var(--card-text); }
  .fdoc-title { font-size:24px; font-weight:800; color:var(--card-text); margin-bottom:4px; letter-spacing:-.03em; opacity:.96; }
  .fdoc-sub { font-size:12px; color:var(--gray-400); margin-bottom:0; }
  .fdoc-stage { border:1px solid var(--card-border); border-radius:0; overflow:hidden; background:linear-gradient(180deg, var(--bg-dark2) 0%, var(--bg-dark) 100%); box-shadow:0 30px 60px rgba(2,6,23,.32); margin-bottom:16px; }
  .fdoc-stage-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:18px 22px; border-bottom:1px solid color-mix(in srgb, var(--green-main) 24%, var(--card-border)); background:linear-gradient(90deg, color-mix(in srgb, var(--bg-dark2) 88%, var(--green-soft) 12%) 0%, var(--bg-dark) 100%); }
  .fdoc-stage-flow { font-size:13px; font-weight:800; color:var(--green-main); margin-top:6px; }
  .fdoc-stage-meta { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:center; }
  .fdoc-stage-body { padding:14px; display:grid; gap:14px; }
  .fdoc-grid { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:12px; }
  .fdoc-header-band { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:12px; align-items:end; margin-bottom:14px; }
  .fdoc-field { display:flex; flex-direction:column; gap:6px; }
  .fdoc-field label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:color-mix(in srgb, var(--green-main) 55%, var(--card-text)); font-weight:800; }
  .fdoc-input, .fdoc-select, .fdoc-textarea { width:100%; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark) 82%, var(--card-bg)); color:var(--card-text); border-radius:0; padding:8px 10px; font-size:12px; outline:none; }
  .fdoc-input:focus, .fdoc-select:focus, .fdoc-textarea:focus { border-color:var(--green-main); box-shadow:0 0 0 1px color-mix(in srgb, var(--green-main) 28%, transparent); }
  .fdoc-input.fdoc-input-name-filled { background:color-mix(in srgb, #f97316 18%, var(--bg-dark2)); border-color:color-mix(in srgb, #fb923c 42%, var(--card-border)); color:#fff7ed; font-weight:700; }
  .fdoc-input.fdoc-input-name-filled:focus { border-color:#fb923c; box-shadow:0 0 0 1px rgba(251,146,60,.28); }
  .fdoc-textarea { min-height:82px; resize:vertical; }
  .fdoc-msg-ok, .fdoc-msg-err, .fdoc-msg-warn { border-radius:0; padding:10px 12px; font-size:12px; margin-bottom:12px; }
  .fdoc-msg-ok { border:1px solid rgba(16,185,129,.24); background:rgba(6,78,59,.3); color:#a7f3d0; }
  .fdoc-msg-err { border:1px solid #7f1d1d; background:#2b1111; color:#fca5a5; }
  .fdoc-msg-warn { border:1px solid #854d0e; background:#2a1b06; color:#fcd34d; }
  .fdoc-btns { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
  .fdoc-btn { border-radius:0; padding:10px 14px; font-size:13px; font-weight:700; cursor:pointer; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark) 82%, var(--card-bg)); color:var(--card-text); }
  .fdoc-btn.clear { background:color-mix(in srgb, #f97316 16%, var(--bg-dark2)); border-color:color-mix(in srgb, #fb923c 36%, var(--card-border)); color:#ffedd5; }
  .fdoc-btn.primary { background:color-mix(in srgb, #38bdf8 16%, var(--bg-dark2)); border-color:color-mix(in srgb, #38bdf8 34%, var(--card-border)); color:#e0f2fe; }
  .fdoc-btn.success { background:color-mix(in srgb, var(--green-main) 24%, var(--bg-dark2)); border-color:color-mix(in srgb, var(--green-main) 34%, var(--card-border)); color:#dcfce7; }
  .fdoc-btn:disabled { opacity:.65; cursor:not-allowed; }
  .fdoc-pay-shell { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 62%, transparent); }
  .fdoc-pay-head { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid var(--card-border); font-size:11px; color:var(--gray-400); }
  .fdoc-mobile-hint { display:none; margin-bottom:10px; font-size:12px; color:var(--gray-400); }
  .fdoc-pay-table { width:100%; border-collapse:collapse; }
  .fdoc-pay-table th, .fdoc-pay-table td { padding:8px 10px; border-top:1px solid var(--card-border); text-align:left; font-size:12px; vertical-align:middle; }
  .fdoc-pay-table th { color:color-mix(in srgb, var(--green-main) 48%, var(--card-text)); font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
  .fdoc-table { width:100%; border-collapse:collapse; }
  .fdoc-table th, .fdoc-table td { padding:10px 12px; border-top:1px solid var(--card-border); font-size:13px; vertical-align:top; }
  .fdoc-table th { text-align:left; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:color-mix(in srgb, var(--green-main) 48%, var(--card-text)); background:color-mix(in srgb, var(--bg-dark) 92%, transparent); }
  .fdoc-line-input { width:100%; box-sizing:border-box; margin:0; border:1px solid #334155; background:#223046; color:#f8fafc; border-radius:0; padding:6px 8px; font-size:12px; outline:none; min-height:30px; }
  .fdoc-line-input:focus { border-color:var(--green-main); box-shadow:0 0 0 1px color-mix(in srgb, var(--green-main) 28%, transparent), inset 0 0 0 999px color-mix(in srgb, var(--green-main) 6%, #334155); }
  .fdoc-line-input.editable { background:#485569; border-color:#5b6779; color:#f8fafc; }
  .fdoc-line-input.editable::placeholder { color:#d5dde8; opacity:.82; }
  .fdoc-line-input.editable:focus { background:#556277; border-color:#38bdf8; box-shadow:0 0 0 2px rgba(56,189,248,.18), inset 0 0 0 999px rgba(255,255,255,.02); }
  .fdoc-line-input.readonly { background:#182437; border-color:#2a3a51; color:#dbe5f3; }
  .fdoc-line-input.readonly.empty { color:#7f8ea3; }
  .fdoc-line-shell { border:1px solid var(--card-border); border-radius:0; overflow:hidden; background:color-mix(in srgb, var(--bg-dark2) 58%, transparent); }
  .fdoc-line-scroll, .fdoc-pay-scroll, .fdoc-modal-scroll { overflow:auto; touch-action:pan-x; -webkit-overflow-scrolling:touch; }
  .fdoc-line-table { width:100%; border-collapse:separate; border-spacing:0; }
  .fdoc-line-table thead th { background:color-mix(in srgb, var(--bg-dark) 92%, transparent); color:var(--gray-400); font-size:10px; text-transform:uppercase; letter-spacing:.12em; padding:10px 10px; border-bottom:1px solid var(--card-border); }
  .fdoc-line-table tbody td { padding:2px 3px; border-top:1px solid var(--card-border); border-right:1px solid var(--card-border); vertical-align:middle; background:color-mix(in srgb, var(--bg-dark2) 72%, transparent); }
  .fdoc-line-table tbody td:last-child { border-right:0; }
  .fdoc-line-table tbody tr:nth-child(even) td { background:color-mix(in srgb, var(--bg-dark2) 72%, transparent); }
  .fdoc-line-table tbody tr:hover td { background:color-mix(in srgb, var(--bg-dark2) 80%, transparent); }
  .fdoc-cell-code { font-family:monospace; color:var(--card-text); font-size:12px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; }
  .fdoc-cell-code:hover { color:#7dd3fc; }
  .fdoc-modal-backdrop { position:fixed; inset:108px 0 0 0; z-index:20000; background:rgba(2,6,23,.84); display:flex; align-items:flex-start; justify-content:center; padding:24px; overflow:auto; box-sizing:border-box; }
  .fdoc-modal { width:min(1080px, 100%); max-height:calc(100vh - 156px); overflow:auto; border:1px solid var(--card-border); background:linear-gradient(180deg, var(--bg-dark2) 0%, var(--bg-dark) 100%); box-shadow:0 30px 80px rgba(0,0,0,.45); box-sizing:border-box; }
  .fdoc-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:18px 24px; border-bottom:1px solid var(--card-border); }
  .fdoc-modal-title { font-size:18px; font-weight:800; color:var(--card-text); }
  .fdoc-modal-body { padding:22px 24px; display:flex; justify-content:center; }
  .fdoc-modal-content { width:min(920px, 100%); }
  .fdoc-modal-table-wrap { width:min(760px, 100%); margin:18px auto 0; }
  .fdoc-modal-table { width:100%; border-collapse:collapse; }
  .fdoc-modal-table th, .fdoc-modal-table td { padding:12px 14px; border-top:1px solid var(--card-border); text-align:left; font-size:12px; }
  .fdoc-modal-table th { background:color-mix(in srgb, var(--bg-dark) 92%, transparent); color:var(--gray-400); font-size:10px; text-transform:uppercase; letter-spacing:.1em; }
  .fdoc-modal-table tbody tr { cursor:pointer; transition:background .15s ease; }
  .fdoc-modal-table tbody tr:hover { background:color-mix(in srgb, var(--bg-dark2) 82%, transparent); }
  .fdoc-modal-code { color:var(--card-text); font-weight:800; font-family:Consolas, monospace; }
  .fdoc-modal-name { color:var(--card-text); font-weight:700; }
  .fdoc-modal-id { color:var(--gray-400); font-family:Consolas, monospace; }
  .fdoc-empty { padding:18px; text-align:center; color:var(--gray-400); border:1px solid var(--card-border); margin-top:18px; }
  .fdoc-code-dot { display:inline-block; width:7px; height:7px; border-radius:999px; background:#22c55e; margin-right:8px; box-shadow:0 0 0 2px rgba(34,197,94,.14); vertical-align:middle; }
  .fdoc-cell-meta { font-size:11px; color:#8ea3c7; margin-top:4px; }
  .fdoc-article-service { color:#93c5fd; }
  .fdoc-article-merc { color:var(--card-text); }
  .fdoc-line-amt { font-family:monospace; color:#86efac; font-size:13px; font-weight:700; text-align:right; background:#182437; border:1px solid #2a3a51; min-height:30px; display:flex; align-items:center; justify-content:flex-end; padding:0 8px; }
  .fdoc-line-exo { font-family:monospace; color:#93c5fd; font-size:12px; text-align:right; background:#182437; border:1px solid #2a3a51; min-height:30px; display:flex; align-items:center; justify-content:flex-end; padding:0 8px; }
  .fdoc-line-action { color:#38bdf8; cursor:pointer; font-weight:700; }
  .fdoc-line-action:hover { text-decoration:underline; }
  .fdoc-line-num { width:34px; text-align:center; color:#94a3b8; font-size:12px; }
  .fdoc-line-iva { color:var(--card-text); font-size:12px; font-weight:700; text-align:center; background:#182437; border:1px solid #2a3a51; min-height:30px; display:flex; align-items:center; justify-content:center; padding:0 8px; }
  .fdoc-line-remove { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:999px; background:#7f1d1d; color:#fecaca; cursor:pointer; font-size:15px; line-height:1; }
  .fdoc-line-remove:hover { background:#991b1b; color:#fff; }
  .fdoc-line-input.num { text-align:right; font-variant-numeric: tabular-nums; padding-left:8px; padding-right:10px; }
  .fdoc-chip { display:inline-flex; align-items:center; border-radius:999px; padding:4px 9px; font-size:11px; font-weight:700; letter-spacing:.04em; border:1px solid transparent; }
  .fdoc-chip.ok { background:rgba(34,197,94,.14); color:#86efac; border:1px solid rgba(34,197,94,.24); }
  .fdoc-chip.bad { background:#2b1111; color:#fca5a5; border:1px solid #7f1d1d; }
  .fdoc-mini { font-size:12px; color:var(--gray-400); }
  .fdoc-link { color:#38bdf8; cursor:pointer; font-weight:700; }
  .fdoc-link:hover { text-decoration:underline; }
  .fdoc-seg { display:inline-flex; gap:6px; padding:5px; background:var(--bg-dark); border:1px solid var(--card-border); border-radius:12px; }
  .fdoc-seg-btn { border:0; background:transparent; color:#cbd5e1; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; }
  .fdoc-seg-btn.active { background:color-mix(in srgb, var(--green-main) 18%, var(--bg-dark2)); color:var(--card-text); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--green-main) 24%, var(--card-border)); }
  .fdoc-cardline { display:grid; grid-template-columns: 180px 1fr; gap:14px; align-items:center; margin-bottom:12px; }
  .fdoc-receptor-panel { border:1px solid var(--card-border); border-radius:0; background:color-mix(in srgb, var(--bg-dark2) 84%, transparent); overflow:hidden; }
  .fdoc-receptor-title { padding:10px 14px; background:color-mix(in srgb, var(--green-main) 18%, var(--bg-dark2)); color:var(--card-text); font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.12em; text-align:center; margin-bottom:0; }
  .fdoc-receptor-body { padding:14px; }
  .fdoc-help { font-size:12px; color:var(--gray-400); margin-top:6px; }
  .fdoc-credit-box { margin-top:12px; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark) 82%, var(--card-bg)); padding:12px 14px; }
  .fdoc-credit-title { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--gray-400); margin-bottom:10px; }
  .fdoc-credit-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:8px; }
  .fdoc-credit-kpi { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 76%, transparent); padding:10px; }
  .fdoc-credit-kpi .k { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--gray-400); }
  .fdoc-credit-kpi .v { margin-top:6px; font-size:15px; font-weight:800; color:var(--card-text); }
  .fdoc-credit-kpi .v.warn { color:#fcd34d; }
  .fdoc-credit-kpi .v.bad { color:#fca5a5; }
  .fdoc-credit-notes { margin-top:10px; display:grid; gap:6px; }
  .fdoc-credit-note { font-size:12px; padding:8px 10px; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 76%, transparent); }
  .fdoc-credit-note.warn { border-color:#854d0e; background:#2a1b06; color:#fcd34d; }
  .fdoc-credit-note.bad { border-color:#7f1d1d; background:#2b1111; color:#fca5a5; }
  .fdoc-credit-note.ok { border-color:#1d6e4f; background:#0f2c20; color:#9df4c7; }
  .fdoc-valid-inline { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .fdoc-footer-shell { display:grid; grid-template-columns:minmax(0, 1.5fr) minmax(300px, 1fr); gap:0; align-items:start; }
  .fdoc-detail-box { min-height:132px; border:1px solid var(--card-border); border-radius:0; background:color-mix(in srgb, var(--bg-dark2) 72%, transparent); padding:14px; }
  .fdoc-mh-box { margin-top:10px; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark) 82%, var(--card-bg)); padding:12px 14px; }
  .fdoc-mh-title { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--gray-400); margin-bottom:8px; }
  .fdoc-mh-summary { font-size:13px; line-height:1.45; color:var(--card-text); white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; margin-bottom:12px; }
  .fdoc-mh-content { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 72%, transparent); padding:12px; min-height:120px; max-height:360px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; font-family:monospace; font-size:12px; line-height:1.5; color:var(--card-text); }
  .fdoc-total-card { border:1px solid var(--card-border); border-radius:0; background:color-mix(in srgb, var(--bg-dark2) 72%, transparent); overflow:hidden; }
  .fdoc-total-row { display:grid; grid-template-columns: 1fr 140px; gap:12px; padding:10px 14px; border-top:1px solid var(--card-border); }
  .fdoc-total-row:first-child { border-top:0; }
  .fdoc-total-row .k { color:var(--card-text); font-size:13px; }
  .fdoc-total-row .v { text-align:right; color:var(--card-text); font-family:monospace; font-size:14px; }
  .fdoc-total-row.grand { background:#c2410c; }
  .fdoc-total-row.grand .k, .fdoc-total-row.grand .v { color:#fff7ed; font-size:18px; font-weight:900; }
  .fdoc-footer-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:14px; }
  .fdoc-section-title { padding:10px 14px; background:color-mix(in srgb, var(--green-main) 18%, var(--bg-dark2)); color:var(--card-text); font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.12em; text-align:center; border:1px solid var(--card-border); border-bottom:0; }
  @media (max-width: 1200px) { .fdoc-footer-shell { grid-template-columns: 1fr; } .fdoc-stage-head { flex-direction:column; align-items:flex-start; } .fdoc-stage-meta { justify-content:flex-start; } .fdoc-credit-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @media (max-width: 800px) { .fdoc-header-band { grid-template-columns: 1fr; } }
  @media (max-width: 760px) {
    .fdoc-credit-grid { grid-template-columns:1fr; }
    .fdoc-mobile-hint { display:block; }
    .fdoc-stage-body { padding:12px; }
    .fdoc-modal-backdrop { inset:72px 0 0 0; padding:12px; }
    .fdoc-modal-head, .fdoc-modal-body { padding-left:14px; padding-right:14px; }
    .fdoc-footer-actions { justify-content:stretch; }
    .fdoc-footer-actions .fdoc-btn { flex:1 1 100%; }
  }
`;

const money = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number, decimals: number) => Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const currencyPrefix = (moneda: 'CRC' | 'USD') => (moneda === 'CRC' ? '₡' : '$');
const fmtInputNum = (n: number, decimals: number) => Number(n || 0).toFixed(decimals);
const parseNum = (raw: string) => {
  const value = String(raw || '').trim();
  if (!value) return 0;
  const compact = value.replace(/\s/g, '');
  const lastDot = compact.lastIndexOf('.');
  const lastComma = compact.lastIndexOf(',');
  let normalized = compact;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = compact.split(thousandSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  } else {
    normalized = compact.replace(',', '.');
  }

  normalized = normalized.replace(/[^0-9.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const parseBitacoraActividades = (row?: Partial<ReceptorBitacoraRow> | null): ActividadMh[] => {
  const raw = Array.isArray((row as any)?.payload_json?.actividades) ? (row as any).payload_json.actividades : [];
  const fromPayload = raw
    .map((item: any) => ({ codigo: String(item?.codigo || '').trim(), descripcion: String(item?.descripcion || '').trim() }))
    .filter((item: ActividadMh) => item.codigo || item.descripcion);
  const fallback = row?.actividad_codigo
    ? [{ codigo: String(row.actividad_codigo || '').trim(), descripcion: String(row.actividad_descripcion || '').trim() }]
    : [];
  const merged = [...fromPayload, ...fallback];
  return merged.filter((item, index, arr) => arr.findIndex((x) => x.codigo === item.codigo && x.descripcion === item.descripcion) === index);
};

export default function FacturacionComprobantes({ empresaId, canEdit = false }: Props) {
  const [config, setConfig] = useState<ConfigFe>({ sucursal: '001', punto_venta: '00001', condicion_venta_defecto: '01', medio_pago_defecto: '01', plazo_credito_dias: 0, tipo_documento_defecto: '01' });
  const [terminales, setTerminales] = useState<Terminal[]>([]);
  const [terminalId, setTerminalId] = useState<number | null>(null);
  const [paramFact, setParamFact] = useState<ParamFacturacion>({ lineas_por_factura: 0 });
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [productos, setProductos] = useState<ProductoOpt[]>([]);
  const [productoEscalas, setProductoEscalas] = useState<Record<number, ProductoEscalaRow[]>>({});
  const [productoClientePrecios, setProductoClientePrecios] = useState<Record<number, ProductoClientePrecioRow>>({});
  const [exoneraciones, setExoneraciones] = useState<ExoneracionOpt[]>([]);
  const [exonCabys, setExonCabys] = useState<ExoneracionCabysRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  const [modoFee, setModoFee] = useState(false);
  const [terceroId, setTerceroId] = useState<number | null>(null);
  const [codigoCliente, setCodigoCliente] = useState('');
  const fechaActual = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fechaEmision] = useState(fechaActual);
  const [moneda] = useState<'CRC' | 'USD'>('CRC');
  const [condicionVenta, setCondicionVenta] = useState('01');
  const [liquidacionPagos, setLiquidacionPagos] = useState<LiquidacionPagoRow[]>([createLiquidacionPago('01', 0)]);
  const [plazoCreditoDias, setPlazoCreditoDias] = useState(0);
  const [exoneracionId, setExoneracionId] = useState<number | null>(null);
  const [exoneracionModalOpen, setExoneracionModalOpen] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([emptyLinea()]);
  const [liquidacionMontoDrafts, setLiquidacionMontoDrafts] = useState<Record<string, string>>({});
  const codigoClienteInputRef = useRef<HTMLInputElement | null>(null);
  const [receptorTipoIdentificacion, setReceptorTipoIdentificacion] = useState('');
  const [receptorIdentificacion, setReceptorIdentificacion] = useState('');
  const [receptorNombre, setReceptorNombre] = useState('');
  const [receptorEmail, setReceptorEmail] = useState('');
  const [receptorTelefono, setReceptorTelefono] = useState('');
  const [receptorDireccion, setReceptorDireccion] = useState('');
  const [receptorActividadId, setReceptorActividadId] = useState<number | null>(null);
  const [receptorActividadCodigo, setReceptorActividadCodigo] = useState('');
  const [receptorActividadDescripcion, setReceptorActividadDescripcion] = useState('');
  const [receptorActividades, setReceptorActividades] = useState<ActividadMh[]>([]);
  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [bitacoraModalOpen, setBitacoraModalOpen] = useState(false);
  const [bitacoraSearch, setBitacoraSearch] = useState('');
  const [bitacoraRows, setBitacoraRows] = useState<ReceptorBitacoraRow[]>([]);
  const [bitacoraLoading, setBitacoraLoading] = useState(false);
  const [modalProductoLineaId, setModalProductoLineaId] = useState<string | null>(null);
  const [busqProducto, setBusqProducto] = useState('');
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideUsuario, setOverrideUsuario] = useState('');
  const [overridePassword, setOverridePassword] = useState('');
  const [overrideMotivo, setOverrideMotivo] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState('');
  const [creditoOverride, setCreditoOverride] = useState<{ autorizadoPor: string; motivo: string; firma: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const cedulaInputRef = useRef<HTMLInputElement | null>(null);
  const nombreInputRef = useRef<HTMLInputElement | null>(null);
  const inputBusqProdRef = useRef<HTMLInputElement | null>(null);
  const lineaCellRefs = useRef<Record<string, HTMLElement | null>>({});

  const cargarBase = async () => {
    const [cfgRes, cliRes, cliParamRes, carteraRes, prodRes, exRes, empRes] = await Promise.all([
      supabase.from('fe_config_empresa').select('*').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('vw_terceros_catalogo').select('id, codigo, razon_social, identificacion, email').eq('empresa_id', empresaId).eq('es_cliente', true).order('razon_social'),
      supabase.from('vw_tercero_cliente_parametros').select('tercero_id, limite_credito, dias_credito, condicion_pago, aplica_descuentos, descuento_maximo_pct, escala_precio'),
      supabase.rpc('get_cxc_cartera_resumen', { p_empresa_id: empresaId, p_fecha_corte: new Date().toISOString().slice(0, 10), p_moneda: null }),
      supabase.from('inv_productos').select('id, codigo, codigo_barras, categoria_id, descripcion, tipo, unidad_medida, codigo_cabys, codigo_tarifa_iva, tarifa_iva, precio_venta, descuento_autorizado_pct, impuesto_venta_incluido, precio_por_medida, stock_actual, inv_categorias(nombre, codigo_prefijo)').eq('empresa_id', empresaId).eq('activo', true).order('descripcion'),
      supabase.from('vw_fe_exoneraciones').select('id, autorizacion, porcentaje_exoneracion, fecha_vencimiento, vigente, cabys_count').eq('empresa_id', empresaId).eq('vigente', true).order('fecha_vencimiento'),
      supabase.from('empresa_parametros').select('facturacion').eq('empresa_id', empresaId).maybeSingle(),
    ]);

    if (cfgRes.data) {
      const cfg = cfgRes.data as any;
      setConfig({
        sucursal: cfg.sucursal || '001',
        punto_venta: cfg.punto_venta || '00001',
        condicion_venta_defecto: cfg.condicion_venta_defecto || '01',
        medio_pago_defecto: cfg.medio_pago_defecto || '01',
        plazo_credito_dias: Number(cfg.plazo_credito_dias || 0),
        tipo_documento_defecto: cfg.tipo_documento_defecto || '01',
      });
      setCondicionVenta(cfg.condicion_venta_defecto || '01');
      setLiquidacionPagos((prev) => hydrateLiquidacionPagos(prev, cfg.medio_pago_defecto || '01', 0));
      setPlazoCreditoDias(Number(cfg.plazo_credito_dias || 0));
    }
    const cliParamsMap = new Map<number, any>();
    ((cliParamRes.data || []) as any[]).forEach((r) => cliParamsMap.set(Number(r.tercero_id), r));
    const vencidoMap = new Map<number, number>();
    const saldoMap = new Map<number, number>();
    const docsMap = new Map<number, number>();
    ((carteraRes.data || []) as any[]).forEach((r) => {
      const terceroId = Number(r.tercero_id || 0);
      const vencido = Number(r.d01_30 || 0) + Number(r.d31_60 || 0) + Number(r.d61_90 || 0) + Number(r.d91_mas || 0);
      vencidoMap.set(terceroId, Number(vencidoMap.get(terceroId) || 0) + vencido);
      saldoMap.set(terceroId, Number(saldoMap.get(terceroId) || 0) + Number(r.total_pendiente || 0));
      docsMap.set(terceroId, Number(docsMap.get(terceroId) || 0) + Number(r.docs || 0));
    });
    const clientesCredito = ((cliRes.data || []) as any[])
      .map((r) => {
        const param = cliParamsMap.get(Number(r.id)) || {};
        const diasCredito = Number(param.dias_credito || 0);
        const limiteCredito = Number(param.limite_credito || 0);
        const condicionPago = String(param.condicion_pago || '').trim();
        const creditoBase = diasCredito > 0 || limiteCredito > 0 || condicionPago !== '';
        const montoVencido = Number(vencidoMap.get(Number(r.id)) || 0);
        const creditoBloqueado = (diasCredito <= 0 || limiteCredito <= 0) && montoVencido > 0;
        return {
          ...r,
          limite_credito: limiteCredito,
          dias_credito: diasCredito,
          condicion_pago: condicionPago,
          aplica_descuentos: Boolean(param.aplica_descuentos),
          descuento_maximo_pct: Number(param.descuento_maximo_pct || 0),
          escala_precio: Math.min(4, Math.max(1, Number(param.escala_precio || 1))),
          credito_habilitado: creditoBase && !creditoBloqueado,
          credito_bloqueado: creditoBloqueado,
          monto_vencido: montoVencido,
          saldo_actual: Number(saldoMap.get(Number(r.id)) || 0),
          docs_pendientes: Number(docsMap.get(Number(r.id)) || 0),
        } as ClienteOpt;
      });
    setClientes(clientesCredito);
    const productosRows = ((prodRes.data || []) as ProductoOpt[]);
    setProductos(productosRows);
    if (productosRows.length > 0) {
      const productoIds = productosRows.map((p) => p.id);
      const escalasRes = await supabase
        .from('inv_producto_escalas')
        .select('producto_id, escala, utilidad_pct, precio_venta, precio_final')
        .in('producto_id', productoIds)
        .eq('activo', true)
        .order('producto_id')
        .order('escala');
      const grouped: Record<number, ProductoEscalaRow[]> = {};
      ((escalasRes.data || []) as ProductoEscalaRow[]).forEach((row) => {
        const productoId = Number(row.producto_id || 0);
        if (!productoId) return;
        if (!grouped[productoId]) grouped[productoId] = [];
        grouped[productoId].push({
          producto_id: productoId,
          escala: Number(row.escala || 0),
          utilidad_pct: Number(row.utilidad_pct || 0),
          precio_venta: Number(row.precio_venta || 0),
          precio_final: Number(row.precio_final || 0),
        });
      });
      setProductoEscalas(grouped);
    } else {
      setProductoEscalas({});
    }
    setExoneraciones((exRes.data || []) as ExoneracionOpt[]);
    const lineasPorFactura = Number((empRes.data as any)?.facturacion?.lineas_por_factura || 0);
    setParamFact({ lineas_por_factura: lineasPorFactura });

    if (exRes.data && (exRes.data as any[]).length > 0) {
      const ids = (exRes.data as any[]).map((r) => r.id);
      const cabysRes = await supabase.from('fe_exoneraciones_cabys').select('exoneracion_id, cabys').in('exoneracion_id', ids);
      setExonCabys((cabysRes.data || []) as ExoneracionCabysRow[]);
    }
  };

  useEffect(() => { void cargarBase(); }, [empresaId]);

  const TERMINAL_STORAGE_KEY = `mya_fe_terminal_${empresaId}`;

  useEffect(() => {
    const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) return;
      fetch(`${API}/api/facturacion/terminales?empresa_id=${empresaId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((payload) => {
          const list = (payload.data || []) as Terminal[];
          setTerminales(list);
          const activos = list.filter((t) => t.activo);
          // Prioridad: 1) lo que guardó esta máquina, 2) defecto, 3) primero activo
          const savedId = Number(localStorage.getItem(TERMINAL_STORAGE_KEY) || 0);
          const saved = savedId ? activos.find((t) => t.id === savedId) : null;
          const def = saved || activos.find((t) => t.es_defecto) || activos[0] || null;
          if (def) setTerminalId(def.id);
        })
        .catch(() => {});
    });
  }, [empresaId]);

  const selectedCliente = clientes.find((c) => c.id === terceroId) || null;

  useEffect(() => {
    let active = true;
    (async () => {
      const tercero = Number(terceroId || 0);
      if (!tercero) {
        setProductoClientePrecios({});
        return;
      }
      const { data } = await supabase
        .from('inv_producto_cliente_precios')
        .select('producto_id, tercero_id, escala_precio, precio_venta, descuento_maximo_pct')
        .eq('empresa_id', empresaId)
        .eq('tercero_id', tercero)
        .eq('activo', true);
      if (!active) return;
      const next: Record<number, ProductoClientePrecioRow> = {};
      ((data || []) as ProductoClientePrecioRow[]).forEach((row) => {
        next[Number(row.producto_id)] = {
          producto_id: Number(row.producto_id || 0),
          tercero_id: Number(row.tercero_id || 0),
          escala_precio: Math.min(4, Math.max(1, Number(row.escala_precio || 1))),
          precio_venta: Number(row.precio_venta || 0),
          descuento_maximo_pct: Number(row.descuento_maximo_pct || 0),
        };
      });
      setProductoClientePrecios(next);
    })();
    return () => { active = false; };
  }, [empresaId, terceroId]);
  const selectedExon = exoneraciones.find((e) => e.id === exoneracionId) || null;
  const visibleError = ok && /^no autorizad[oa]$/i.test(String(error || '').trim()) ? '' : error;
  const allowedCabys = useMemo(() => new Set(exonCabys.filter((r) => r.exoneracion_id === exoneracionId).map((r) => r.cabys)), [exonCabys, exoneracionId]);
  const filteredClientesCredito = useMemo(() => {
    const q = codigoCliente.trim().toLowerCase();
    return clientes.filter((c) => {
      if (!c.credito_habilitado) return false;
      if (!q) return true;
      return String(c.codigo || '').toLowerCase() === q;
    });
  }, [clientes, codigoCliente]);
  const clienteSugeridoCredito = filteredClientesCredito[0] || null;
  const bitacoraFiltrada = useMemo(() => {
    const q = String(bitacoraSearch || receptorIdentificacion || '').trim().toLowerCase();
    if (!q) return bitacoraRows;
    return bitacoraRows.filter((row) =>
      String(row.identificacion || '').toLowerCase().includes(q)
      || String(row.razon_social || '').toLowerCase().includes(q)
    );
  }, [bitacoraRows, bitacoraSearch, receptorIdentificacion]);
  const clienteCodigoBloqueado = useMemo(() => {
    const code = codigoCliente.trim().toLowerCase();
    if (!code) return null;
    const found = clientes.find((c) => String(c.codigo || '').toLowerCase() === code) || null;
    return found && !found.credito_habilitado ? found : null;
  }, [clientes, codigoCliente]);
  const catalogoInicialProductos = useMemo(() => productos.slice(0, 16), [productos]);
  const productosFiltrados = useMemo(() => {
    const q = busqProducto.trim().toLowerCase();
    if (q.length < 2) return catalogoInicialProductos;
    return productos.filter((p) =>
      String(p.codigo || '').toLowerCase().includes(q)
      || String(p.codigo_barras || '').toLowerCase().includes(q)
      || String(p.descripcion || '').toLowerCase().includes(q)
      || String(p.codigo_cabys || '').toLowerCase().includes(q)
    ).slice(0, 40);
  }, [productos, busqProducto, catalogoInicialProductos]);
  const flujoReceptor = selectedCliente
    ? 'credito'
    : (receptorIdentificacion.trim() || receptorNombre.trim() || receptorEmail.trim() || receptorTelefono.trim() || receptorDireccion.trim())
      ? 'contado'
      : 'consumidor_final';
  const consumidorFinal = flujoReceptor === 'consumidor_final';
  const receptorIdentificado = flujoReceptor === 'credito'
    ? Boolean(terceroId)
    : Boolean(receptorIdentificacion.trim() && receptorNombre.trim());
  const tipoDocumentoAuto = modoFee
    ? '09'
    : flujoReceptor === 'credito'
      ? '01'
      : consumidorFinal
        ? '04'
        : (receptorIdentificacion.trim() ? '01' : '04');
  const esTiquete = tipoDocumentoAuto === '04';
  const esFee = tipoDocumentoAuto === '09';
  const clienteRequerido = tipoDocumentoAuto === '01';
  const clienteListo = esTiquete ? true : receptorIdentificado;

  useEffect(() => {
    if (flujoReceptor === 'credito' && selectedCliente) {
      setCondicionVenta('02');
      setPlazoCreditoDias(Number(selectedCliente.dias_credito || 0));
    } else if (condicionVenta !== '01') {
      setCondicionVenta('01');
      setPlazoCreditoDias(0);
    }
  }, [flujoReceptor, selectedCliente, condicionVenta]);

  useEffect(() => {
    if (!selectedCliente) return;
    setReceptorNombre(String(selectedCliente.razon_social || ''));
    setReceptorEmail(String(selectedCliente.email || ''));
    setReceptorTelefono('');
    setReceptorDireccion('');
    setReceptorActividadCodigo('');
    setReceptorActividadDescripcion('');
    setReceptorActividades([]);
  }, [selectedCliente]);

  useEffect(() => {
    if (!selectedCliente?.identificacion) return;
    if (receptorActividadCodigo.trim()) return;
    let cancelled = false;

    void (async () => {
      try {
        const found = await completarActividadEconomica(String(selectedCliente.identificacion || ''));
        if (!cancelled && found) {
          setOk((prev) => prev || 'Actividad económica del cliente completada desde bitácora/MH.');
        }
      } catch (e: any) {
        if (!cancelled) {
          setError((prev) => prev || String(e?.message || 'No se pudo completar la actividad económica del cliente.'));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCliente, receptorActividadCodigo]);

  useEffect(() => {
    if (busy || terceroId || receptorIdentificacion.trim()) return;
    const id = window.setTimeout(() => {
      codigoClienteInputRef.current?.focus();
      codigoClienteInputRef.current?.select();
    }, 60);
    return () => window.clearTimeout(id);
  }, [busy, terceroId, receptorIdentificacion]);

  useEffect(() => {
    if (flujoReceptor !== 'credito') return;
    const code = codigoCliente.trim().toLowerCase();
    if (!code) return;
    const exact = clientes.find((c) => String(c.codigo || '').toLowerCase() === code) || null;
    if (!exact) return;
    setTerceroId(exact.id);
    setPlazoCreditoDias(Number(exact.dias_credito || 0));
  }, [codigoCliente, flujoReceptor, clientes]);

  useEffect(() => {
    if (flujoReceptor === 'credito') return;
    const t = setTimeout(() => {
      if (flujoReceptor === 'consumidor_final') {
        const first = lineas[0]?.id;
        if (first) focusLineaCell(first, 'producto');
      } else {
        cedulaInputRef.current?.focus();
      }
    }, 40);
    return () => clearTimeout(t);
  }, [flujoReceptor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!modalProductoLineaId) return;
    const t = setTimeout(() => inputBusqProdRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [modalProductoLineaId]);

  const lineasCalculadas = useMemo(() => {
    return lineas.map((l) => {
      const subtotal = Math.max(0, Number(l.cantidad || 0) * Number(l.precio_unitario || 0));
      const baseNeta = Math.max(0, subtotal - Number(l.descuento_monto || 0));
      const impuestoBruto = baseNeta * (Number(l.tarifa_iva_porcentaje || 0) / 100);
      const exoneracionAplica = Boolean(selectedExon && l.cabys && allowedCabys.has(l.cabys));
      const exoneracionMonto = exoneracionAplica ? (impuestoBruto * Number(selectedExon?.porcentaje_exoneracion || 0) / 100) : 0;
      const impuestoNeto = Math.max(0, impuestoBruto - exoneracionMonto);
      const total = baseNeta + impuestoNeto;
      return { ...l, subtotal, baseNeta, impuestoBruto, exoneracionAplica, exoneracionMonto, impuestoNeto, total };
    });
  }, [lineas, selectedExon, allowedCabys]);

  const lineasValidas = useMemo(() => lineasCalculadas.filter((l) => l.descripcion.trim()), [lineasCalculadas]);
  const lineasExoneradasNoAutorizadas = useMemo(() => {
    if (!selectedExon) return [] as string[];
    return lineasCalculadas
      .filter((l) => l.descripcion.trim() && l.tarifa_iva_porcentaje > 0 && (!l.cabys || !allowedCabys.has(l.cabys)))
      .map((l) => `${l.codigo || '(sin codigo)'} - ${l.descripcion || '(sin descripcion)'}`);
  }, [selectedExon, lineasCalculadas, allowedCabys]);

  const invalidExoneracion = useMemo(() => {
    if (!selectedExon) return [] as string[];
    return lineasCalculadas.filter((l) => l.cabys && !allowedCabys.has(l.cabys)).map((l) => `${l.codigo || '(sin codigo)'} - ${l.descripcion || '(sin descripcion)'}`);
  }, [selectedExon, lineasCalculadas, allowedCabys]);

  const resumen = useMemo(() => {
    const subtotal = lineasCalculadas.reduce((s, l) => s + l.subtotal, 0);
    const descuento = lineasCalculadas.reduce((s, l) => s + Number(l.descuento_monto || 0), 0);
    const impuestoBruto = lineasCalculadas.reduce((s, l) => s + l.impuestoBruto, 0);
    const exoneracion = lineasCalculadas.reduce((s, l) => s + l.exoneracionMonto, 0);
    const impuestoNeto = lineasCalculadas.reduce((s, l) => s + l.impuestoNeto, 0);
    const total = lineasCalculadas.reduce((s, l) => s + l.total, 0);
    return { subtotal, descuento, impuestoBruto, exoneracion, impuestoNeto, total };
  }, [lineasCalculadas]);

  const lineaBaseMonto = (linea: Pick<LineaForm, 'cantidad' | 'precio_unitario'> | null | undefined) =>
    Math.max(0, Number(linea?.cantidad || 0) * Number(linea?.precio_unitario || 0));

  const lineaDescuentoPct = (linea: Pick<LineaForm, 'cantidad' | 'precio_unitario' | 'descuento_monto'> | null | undefined) => {
    const base = lineaBaseMonto(linea);
    if (base <= 0) return 0;
    return (Number(linea?.descuento_monto || 0) / base) * 100;
  };

  const creditoEvaluado = useMemo(() => {
    if (flujoReceptor !== 'credito' || !selectedCliente) return null;
    const limite = Number(selectedCliente.limite_credito || 0);
    const saldoActual = Number(selectedCliente.saldo_actual || 0);
    const montoVencido = Number(selectedCliente.monto_vencido || 0);
    const docsPendientes = Number(selectedCliente.docs_pendientes || 0);
    const plazoAutorizado = Math.max(0, Number(selectedCliente.dias_credito || 0));
    const plazoSolicitado = Math.max(0, Number(plazoCreditoDias || 0));
    const saldoProyectado = saldoActual + Number(resumen.total || 0);
    const disponible = limite > 0 ? (limite - saldoActual) : null;
    const disponibleProyectado = limite > 0 ? (limite - saldoProyectado) : null;
    const exceso = limite > 0 ? Math.max(0, saldoProyectado - limite) : 0;
    const bloqueos: string[] = [];
    const advertencias: string[] = [];
    const infos: string[] = [];

    if (!selectedCliente.credito_habilitado) {
      bloqueos.push('El cliente no tiene crédito habilitado para esta venta.');
    }
    if (montoVencido > 0) {
      bloqueos.push(`El cliente mantiene saldo vencido por ${currencyPrefix(moneda)} ${money(montoVencido)}.`);
    }
    if (limite > 0 && exceso > 0.0001) {
      bloqueos.push(`La venta excede el límite de crédito por ${currencyPrefix(moneda)} ${money(exceso)}.`);
    }
    if (plazoSolicitado > plazoAutorizado) {
      bloqueos.push(`El plazo solicitado (${plazoSolicitado} días) supera el autorizado (${plazoAutorizado} días).`);
    }
    if (limite <= 0) {
      advertencias.push('El cliente no tiene límite de crédito definido; revise su política comercial.');
    }
    if (docsPendientes > 0) {
      infos.push(`Documentos pendientes en cartera: ${docsPendientes}.`);
    }

    const estado = bloqueos.length ? 'bloqueado' : advertencias.length ? 'alerta' : 'aprobado';
    return {
      limite,
      saldoActual,
      montoVencido,
      docsPendientes,
      plazoAutorizado,
      plazoSolicitado,
      saldoProyectado,
      disponible,
      disponibleProyectado,
      bloqueos,
      advertencias,
      infos,
      estado,
      bloqueado: bloqueos.length > 0,
    };
  }, [flujoReceptor, selectedCliente, plazoCreditoDias, resumen.total, moneda]);

  const creditoOverrideFirma = useMemo(() => {
    if (!creditoEvaluado || creditoEvaluado.estado !== 'alerta' || !selectedCliente) return '';
    return [
      selectedCliente.id,
      Number(resumen.total || 0).toFixed(2),
      Number(plazoCreditoDias || 0),
      Number(creditoEvaluado.saldoActual || 0).toFixed(2),
      Number(creditoEvaluado.limite || 0).toFixed(2),
      Number(creditoEvaluado.montoVencido || 0).toFixed(2),
      creditoEvaluado.advertencias.join('|'),
    ].join('::');
  }, [creditoEvaluado, selectedCliente, resumen.total, plazoCreditoDias]);

  useEffect(() => {
    if (!creditoOverrideFirma) {
      setCreditoOverride(null);
      return;
    }
    setCreditoOverride((prev) => (prev?.firma === creditoOverrideFirma ? prev : null));
  }, [creditoOverrideFirma]);

  const medioPago = useMemo(
    () => medioPagoPrincipal(liquidacionPagos, condicionVenta, config.medio_pago_defecto || '01'),
    [liquidacionPagos, condicionVenta, config.medio_pago_defecto]
  );
  const liquidacionPagoTotal = useMemo(() => liquidacionTotal(liquidacionPagos), [liquidacionPagos]);

  useEffect(() => {
    if (condicionVenta === '02') {
      setLiquidacionPagos([]);
      return;
    }
    setLiquidacionPagos((prev) => {
      if (prev.length === 0) return [createLiquidacionPago(config.medio_pago_defecto || '01', resumen.total)];
      if (prev.length === 1) return [{ ...prev[0], monto: resumen.total, tipoMedioPago: prev[0].tipoMedioPago || config.medio_pago_defecto || '01' }];
      return prev;
    });
  }, [condicionVenta, config.medio_pago_defecto, resumen.total]);

  const updateLiquidacionPago = (id: string, patch: Partial<LiquidacionPagoRow>) => {
    setLiquidacionPagos((prev) => prev.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const addLiquidacionPago = () => {
    setLiquidacionPagos((prev) => [...prev, createLiquidacionPago(config.medio_pago_defecto || '01', 0)]);
  };

  const removeLiquidacionPago = (id: string) => {
    setLiquidacionPagos((prev) => prev.length > 1 ? prev.filter((row) => row.id !== id) : prev);
    setLiquidacionMontoDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const startLiquidacionMontoEdit = (id: string, value: number) => {
    setLiquidacionMontoDrafts((prev) => ({ ...prev, [id]: fmtInputNum(value ?? 0, 2) }));
  };

  const finishLiquidacionMontoEdit = (id: string) => {
    const raw = liquidacionMontoDrafts[id];
    updateLiquidacionPago(id, { monto: parseNum(raw ?? '0') });
    setLiquidacionMontoDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const registerLineaCellRef = (lineaId: string, cell: LineaCellKey, el: HTMLElement | null) => {
    lineaCellRefs.current[`${lineaId}:${cell}`] = el;
  };

  const codeDraftKey = (lineaId: string) => `${lineaId}:codigo`;

  const focusLineaCell = (lineaId: string, cell: LineaCellKey) => {
    const el = lineaCellRefs.current[`${lineaId}:${cell}`];
    if (!el) return;
    el.focus();
    if ('select' in el && typeof (el as HTMLInputElement).select === 'function') {
      try { (el as HTMLInputElement).select(); } catch {}
    }
  };

  const addLinea = (focusCell?: LineaCellKey) => {
    const nueva = emptyLinea();
    setLineas((prev) => [...prev, nueva]);
    if (focusCell) {
      setTimeout(() => focusLineaCell(nueva.id, focusCell), 50);
    }
  };
  const removeLinea = (id: string) => setLineas((prev) => prev.length > 1 ? prev.filter((l) => l.id !== id) : prev);
  const updateLinea = (id: string, patch: Partial<LineaForm>) => setLineas((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l));

  const handleLineaEnter = (e: React.KeyboardEvent<HTMLElement>, lineaId: string, cell: LineaCellKey) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (cell === 'producto') {
      finishCodigoEdit(lineaId, 'suggest');
      return;
    }
    if (cell === 'cantidad' || cell === 'descuento' || cell === 'precio') {
      finishNumericEdit(lineaId, cell);
    }
    const idx = lineas.findIndex((l) => l.id === lineaId);
    if (idx < 0) return;
    const lineaActual = lineas[idx] || null;
    const order: LineaCellKey[] = lineaActual?.tipo_linea === 'servicio'
      ? ['producto', 'cantidad', 'descuento', 'precio']
      : ['producto', 'cantidad', 'descuento'];
    const cellIndex = order.indexOf(cell);
    const nextCell = order[cellIndex + 1] || null;
    if (nextCell) {
      focusLineaCell(lineaId, nextCell);
      return;
    }
    const nextLinea = lineas[idx + 1];
    if (nextLinea) {
      focusLineaCell(nextLinea.id, 'producto');
      return;
    }
    if (!paramFact.lineas_por_factura || lineas.length < paramFact.lineas_por_factura) {
      addLinea('producto');
    }
  };

  const numericDraftKey = (lineaId: string, field: 'cantidad' | 'descuento' | 'precio') => `${lineaId}:${field}`;
  const startNumericEdit = (lineaId: string, field: 'cantidad' | 'descuento' | 'precio', value: number) => {
    const decimals = field === 'cantidad' ? 3 : 2;
    setDrafts((prev) => ({ ...prev, [numericDraftKey(lineaId, field)]: fmtInputNum(value ?? 0, decimals) }));
  };

  const prepareNumericOverwrite = (
    e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>,
    lineaId: string,
    field: 'cantidad' | 'descuento' | 'precio',
    value: number,
  ) => {
    startNumericEdit(lineaId, field, value);
    const target = e.currentTarget;
    setTimeout(() => {
      try { target.focus(); } catch {}
      try { target.select(); } catch {}
    }, 0);
  };
  const changeNumericDraft = (lineaId: string, field: 'cantidad' | 'descuento' | 'precio', value: string) => {
    setDrafts((prev) => ({ ...prev, [numericDraftKey(lineaId, field)]: value }));
  };
  const finishNumericEdit = (lineaId: string, field: 'cantidad' | 'descuento' | 'precio') => {
    const key = numericDraftKey(lineaId, field);
    const parsed = parseNum(drafts[key] ?? '0');
    const linea = lineas.find((l) => l.id === lineaId) || null;
    if (field === 'cantidad') updateLinea(lineaId, { cantidad: parsed });
    if (field === 'descuento') {
      const baseLinea = lineaBaseMonto(linea);
      const maxPct = Number(linea?.descuento_autorizado_pct || 0);
      const pctAplicado = maxPct > 0 ? Math.min(Math.max(0, parsed), maxPct) : Math.max(0, parsed);
      const montoAplicado = baseLinea > 0 ? (baseLinea * pctAplicado / 100) : 0;
      updateLinea(lineaId, { descuento_monto: montoAplicado });
    }
    if (field === 'precio') updateLinea(lineaId, { precio_unitario: parsed });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const limpiarReceptorContado = () => {
    setReceptorTipoIdentificacion('');
    setReceptorIdentificacion('');
    setReceptorNombre('');
    setReceptorEmail('');
    setReceptorTelefono('');
    setReceptorDireccion('');
    setReceptorActividadId(null);
    setReceptorActividadCodigo('');
    setReceptorActividadDescripcion('');
    setReceptorActividades([]);
  };

  const completarActividadEconomica = async (identificacionRaw?: string) => {
    const identificacion = String(identificacionRaw || receptorIdentificacion || '').trim();
    if (!identificacion) return false;

    const { data, error: bitErr } = await supabase
      .from('fe_receptores_bitacora')
      .select('tipo_identificacion, actividad_tributaria_id, actividad_codigo, actividad_descripcion, payload_json')
      .eq('empresa_id', empresaId)
      .eq('identificacion', identificacion)
      .maybeSingle();
    if (bitErr) throw bitErr;

    const row = (data || null) as Partial<ReceptorBitacoraRow> | null;
    const actividadesBit = row ? parseBitacoraActividades(row) : [];
    if (row && (String(row.actividad_codigo || '').trim() || actividadesBit.length > 0)) {
      setReceptorTipoIdentificacion((prev) => prev || String(row.tipo_identificacion || inferTipoIdentificacion(identificacion)));
      setReceptorActividadId(row.actividad_tributaria_id ? Number(row.actividad_tributaria_id) : null);
      setReceptorActividadCodigo(String(row.actividad_codigo || actividadesBit[0]?.codigo || ''));
      setReceptorActividadDescripcion(String(row.actividad_descripcion || actividadesBit[0]?.descripcion || ''));
      setReceptorActividades(actividadesBit);
      return true;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.');
    const { data: payload, error: fnError } = await supabase.functions.invoke('mh-contribuyente', {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      body: { cedula: identificacion },
    });
    if (fnError) throw fnError;
    const result = (payload || {}) as any;
    if (!result?.ok) throw new Error(String(result?.detail || result?.error || 'No se pudo consultar MH.'));

    const actividades = Array.isArray(result.actividades) ? (result.actividades as ActividadMh[]) : [];
    setReceptorTipoIdentificacion((prev) => prev || String(result.tipo_identificacion || inferTipoIdentificacion(identificacion)));
    setReceptorActividadId(null);
    setReceptorActividadCodigo(String(actividades[0]?.codigo || ''));
    setReceptorActividadDescripcion(String(actividades[0]?.descripcion || ''));
    setReceptorActividades(actividades);
    return actividades.length > 0;
  };

  const normalizarReceptorSeleccionado = async (
    identificacionRaw?: string,
    opciones?: { exigirActividad?: boolean; origen?: string }
  ) => {
    const identificacion = String(identificacionRaw || '').trim();
    if (!identificacion) return false;
    const tipoInferido = inferTipoIdentificacion(identificacion);
    if (tipoInferido) setReceptorTipoIdentificacion(tipoInferido);

    const actividadActual = String(receptorActividadCodigo || '').trim();
    if (actividadActual) return true;

    const found = await completarActividadEconomica(identificacion);
    if (!found && opciones?.exigirActividad) {
      throw new Error(`No se encontró actividad económica para el receptor seleccionado${opciones?.origen ? ` (${opciones.origen})` : ''}.`);
    }
    return found;
  };

  const cargarBitacoraReceptor = async (identificacionRaw?: string) => {
    const identificacion = String(identificacionRaw || receptorIdentificacion || '').trim();
    if (!identificacion) return false;
    const { data, error: bitErr } = await supabase
      .from('fe_receptores_bitacora')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('identificacion', identificacion)
      .maybeSingle();
    if (bitErr) throw bitErr;
    if (!data) return false;
    const row = data as ReceptorBitacoraRow;
    setReceptorTipoIdentificacion(String(row.tipo_identificacion || inferTipoIdentificacion(String(row.identificacion || ''))));
    setReceptorIdentificacion(String(row.identificacion || ''));
    setReceptorNombre(String(row.razon_social || ''));
    setReceptorEmail(String(row.email || ''));
    setReceptorTelefono(String(row.telefono || ''));
    setReceptorDireccion(String(row.direccion || ''));
    setReceptorActividadId(row.actividad_tributaria_id ? Number(row.actividad_tributaria_id) : null);
      setReceptorActividadCodigo(String(row.actividad_codigo || ''));
      setReceptorActividadDescripcion(String(row.actividad_descripcion || ''));
      setReceptorActividades(parseBitacoraActividades(row));
      const first = lineas[0]?.id;
      if (first) setTimeout(() => focusLineaCell(first, 'producto'), 40);
      return true;
    };

  const consultarMhReceptor = async () => {
    const id = String(receptorIdentificacion || '').trim();
    if (!id) {
      setError('Digite una cedula para consultar el receptor.');
      return;
    }
    setBusy(true);
    setError('');
    setOk('');
    try {
      const existe = await cargarBitacoraReceptor(id);
      if (existe) {
        setOk('Receptor cargado desde la bitacora fiscal.');
        return;
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.');
      const { data: payload, error: fnError } = await supabase.functions.invoke('mh-contribuyente', {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        body: { cedula: id },
      });
      if (fnError) throw fnError;
      const result = (payload || {}) as any;
      if (!result?.ok) throw new Error(String(result?.detail || result?.error || 'No se pudo consultar MH.'));
      const actividades = Array.isArray(result.actividades) ? (result.actividades as ActividadMh[]) : [];
      setReceptorTipoIdentificacion(String(result.tipo_identificacion || inferTipoIdentificacion(String(result.cedula || id))));
      setReceptorIdentificacion(String(result.cedula || id));
      setReceptorNombre(String(result.nombre || ''));
        setReceptorActividades(actividades);
        setReceptorActividadCodigo(String(actividades[0]?.codigo || ''));
        setReceptorActividadDescripcion(String(actividades[0]?.descripcion || ''));
        setReceptorActividadId(null);
        setOk('Datos del receptor consultados en MH. Complete correo, telefono y direccion si hace falta.');
        const first = lineas[0]?.id;
        if (first) setTimeout(() => focusLineaCell(first, 'producto'), 40);
      } catch (e: any) {
      setError(String(e?.message || 'No se pudo consultar MH para el receptor.'));
    } finally {
      setBusy(false);
    }
  };

  const abrirBitacoraModal = async () => {
    setBitacoraLoading(true);
    setError('');
    try {
      setBitacoraSearch(String(receptorIdentificacion || '').trim());
      const { data, error: bitErr } = await supabase
        .from('fe_receptores_bitacora')
        .select('id, tipo_identificacion, identificacion, razon_social, actividad_tributaria_id, actividad_codigo, actividad_descripcion, email, telefono, direccion, payload_json')
        .eq('empresa_id', empresaId)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (bitErr) throw bitErr;
      setBitacoraRows((data || []) as ReceptorBitacoraRow[]);
      setBitacoraModalOpen(true);
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo abrir la bitacora fiscal.'));
    } finally {
      setBitacoraLoading(false);
    }
  };

  const aplicarClienteCredito = async (cliente: ClienteOpt | null) => {
    if (!cliente) return;
    setClienteModalOpen(false);
    setError('');
    setTerceroId(cliente.id);
    setCodigoCliente(String(cliente.codigo || ''));
    limpiarReceptorContado();
    setReceptorTipoIdentificacion(inferTipoIdentificacion(String(cliente.identificacion || '')));
    setReceptorIdentificacion(String(cliente.identificacion || ''));
    setReceptorNombre(String(cliente.razon_social || ''));
    setReceptorEmail(String(cliente.email || ''));
    setPlazoCreditoDias(Number(cliente.dias_credito || 0));
    try {
      await normalizarReceptorSeleccionado(String(cliente.identificacion || ''), { exigirActividad: true, origen: 'codigo de cliente' });
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo completar la información fiscal del cliente.'));
    }
    const first = lineas[0]?.id;
    if (first) setTimeout(() => focusLineaCell(first, 'producto'), 40);
  };

  const aplicarBitacoraReceptor = async (row: ReceptorBitacoraRow) => {
    setBitacoraModalOpen(false);
    setTerceroId(null);
    setCodigoCliente('');
    setReceptorTipoIdentificacion(String(row.tipo_identificacion || inferTipoIdentificacion(row.identificacion || '')));
    setReceptorIdentificacion(String(row.identificacion || ''));
    setReceptorNombre(String(row.razon_social || ''));
    setReceptorEmail(String(row.email || ''));
    setReceptorTelefono(String(row.telefono || ''));
    setReceptorDireccion(String(row.direccion || ''));
    setReceptorActividadId(row.actividad_tributaria_id ? Number(row.actividad_tributaria_id) : null);
      setReceptorActividadCodigo(String(row.actividad_codigo || ''));
      setReceptorActividadDescripcion(String(row.actividad_descripcion || ''));
      setReceptorActividades(parseBitacoraActividades(row));
      setError('');
      try {
        await normalizarReceptorSeleccionado(String(row.identificacion || ''), { exigirActividad: false, origen: 'bitacora' });
      } catch (e: any) {
        setError(String(e?.message || 'No se pudo completar la información fiscal del receptor.'));
      }
      const first = lineas[0]?.id;
      if (first) setTimeout(() => focusLineaCell(first, 'producto'), 40);
    };

    const limpiarDocumento = () => {
      setError('');
      setOk('');
      setCreditoOverride(null);
      setOverrideModalOpen(false);
      setOverrideUsuario('');
      setOverridePassword('');
      setOverrideMotivo('');
      setOverrideError('');
      setTerceroId(null);
      setCodigoCliente('');
      setExoneracionId(null);
      setObservacion('');
      setLineas([emptyLinea()]);
      setLiquidacionPagos([createLiquidacionPago(config.medio_pago_defecto || '01', 0)]);
      setCondicionVenta('01');
      setPlazoCreditoDias(0);
      limpiarReceptorContado();
      setTimeout(() => {
        codigoClienteInputRef.current?.focus();
        codigoClienteInputRef.current?.select();
      }, 40);
    };

    const persistBitacoraReceptor = async () => {
    if (flujoReceptor === 'credito' || consumidorFinal || !receptorIdentificacion.trim()) return null;
    const payload = {
      empresa_id: empresaId,
      tipo_identificacion: receptorTipoIdentificacion || null,
      identificacion: receptorIdentificacion.trim(),
      razon_social: receptorNombre.trim() || receptorIdentificacion.trim(),
      actividad_tributaria_id: receptorActividadId || null,
      actividad_codigo: receptorActividadCodigo || null,
      actividad_descripcion: receptorActividadDescripcion || null,
      email: receptorEmail.trim() || null,
      telefono: receptorTelefono.trim() || null,
      direccion: receptorDireccion.trim() || null,
      origen_mh: receptorActividades.length > 0,
      payload_json: receptorActividades.length ? { actividades: receptorActividades } : null,
      updated_at: new Date().toISOString(),
    };
    const { data, error: upErr } = await supabase
      .from('fe_receptores_bitacora')
      .upsert(payload, { onConflict: 'empresa_id,identificacion' })
      .select('id')
      .single();
    if (upErr) throw upErr;
    return Number((data as any)?.id || 0) || null;
  };

  const handleCreditoCodigoKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const query = codigoCliente.trim().toLowerCase();
    if (!query) {
      setClienteModalOpen(true);
      return;
    }
    const exact =
      filteredClientesCredito.find((c) => String(c.codigo || '').toLowerCase() === query)
      || (filteredClientesCredito.length === 1 ? filteredClientesCredito[0] : null);
    if (!exact) {
      setError('No se encontro un cliente a credito con ese criterio.');
      return;
    }
    setError('');
    await aplicarClienteCredito(exact);
  };

  const handleCedulaKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (receptorIdentificacion.trim()) {
      void consultarMhReceptor();
    } else {
      void abrirBitacoraModal();
    }
  };

  const resolveEscalaCliente = () => {
    if (!selectedCliente) return 1;
    return Math.min(4, Math.max(1, Number(selectedCliente.escala_precio || 1)));
  };

  const resolvePrecioProductoContext = (producto: ProductoOpt) => {
    const especial = selectedCliente ? productoClientePrecios[producto.id] : undefined;
    if (especial) {
      const escala = Math.min(4, Math.max(1, Number(especial.escala_precio || 1)));
      return {
        escala,
        precio: Number(especial.precio_venta || 0),
        origen: `Precio especial cliente · E${escala}`,
      };
    }
    const escalas = productoEscalas[producto.id] || [];
    const escalaObjetivo = resolveEscalaCliente();
    const escala = escalas.find((e) => Number(e.escala) === escalaObjetivo)
      || escalas.find((e) => Number(e.escala) === 1)
      || null;
    if (escala) {
      return {
        escala: Number(escala.escala || 1),
        precio: Number(escala.precio_venta || producto.precio_venta || 0),
        origen: `Escala cliente · E${Number(escala.escala || 1)}`,
      };
    }
    return {
      escala: 1,
      precio: Number(producto.precio_venta || 0),
      origen: 'Precio base',
    };
  };

  const resolvePrecioProducto = (producto: ProductoOpt) => {
    const resolved = resolvePrecioProductoContext(producto);
    return { escala: resolved.escala, precio: resolved.precio };
  };

  const resolveDescuentoMaximo = (producto: ProductoOpt) => {
    const articuloMax = Number(producto.descuento_autorizado_pct || 0);
    const especial = selectedCliente ? productoClientePrecios[producto.id] : undefined;
    if (!selectedCliente) return articuloMax;
    if (!selectedCliente.aplica_descuentos) return 0;
    const clienteMax = Number(selectedCliente.descuento_maximo_pct || 0);
    const baseMax = (articuloMax <= 0 || clienteMax <= 0) ? 0 : Math.min(articuloMax, clienteMax);
    if (!especial) return baseMax;
    const especialMax = Number(especial.descuento_maximo_pct || 0);
    if (baseMax <= 0 || especialMax <= 0) return 0;
    return Math.min(baseMax, especialMax);
  };

  useEffect(() => {
    if (lineas.length === 0 || productos.length === 0) return;
    setLineas((prev) => {
      let changed = false;
      const next = prev.map((linea) => {
        if (!linea.producto_id || linea.tipo_linea === 'servicio') return linea;
        const producto = productos.find((item) => item.id === linea.producto_id);
        if (!producto) return linea;
        const precioResuelto = resolvePrecioProducto(producto);
        const descuentoMax = resolveDescuentoMaximo(producto);
        const pctActual = lineaDescuentoPct(linea);
        const pctAplicado = descuentoMax > 0 ? Math.min(Math.max(0, pctActual), descuentoMax) : 0;
        const baseNueva = Math.max(0, Number(linea.cantidad || 0) * Number(precioResuelto.precio || 0));
        const descuentoMonto = baseNueva > 0 ? (baseNueva * pctAplicado / 100) : 0;
        if (
          Number(linea.precio_unitario || 0) === Number(precioResuelto.precio || 0) &&
          Number(linea.escala_precio || 0) === Number(precioResuelto.escala || 0) &&
          Number(linea.descuento_autorizado_pct || 0) === Number(descuentoMax || 0) &&
          Math.abs(Number(linea.descuento_monto || 0) - descuentoMonto) < 0.0001
        ) {
          return linea;
        }
        changed = true;
        return {
          ...linea,
          precio_unitario: Number(precioResuelto.precio || 0),
          escala_precio: Number(precioResuelto.escala || 1),
          descuento_autorizado_pct: Number(descuentoMax || 0),
          descuento_monto: descuentoMonto,
        };
      });
      return changed ? next : prev;
    });
  }, [productos, productoEscalas, productoClientePrecios, selectedCliente]);

  const findProductoByCodigo = (raw: string) => {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return null;
    return productos.find((p) => String(p.codigo_barras || '').trim().toLowerCase() === value)
      || productos.find((p) => String(p.codigo || '').trim().toLowerCase() === value)
      || null;
  };

  const startCodigoEdit = (lineaId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [codeDraftKey(lineaId)]: value }));
  };

  const changeCodigoDraft = (lineaId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [codeDraftKey(lineaId)]: value }));
  };

  const finishCodigoEdit = (lineaId: string, mode: 'strict' | 'suggest' = 'strict') => {
    const key = codeDraftKey(lineaId);
    const raw = String(drafts[key] ?? '').trim();
    if (!raw) {
      if (mode === 'suggest') {
        setBusqProducto('');
        setModalProductoLineaId(lineaId);
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    const producto = findProductoByCodigo(raw);
    if (producto) {
      selectProducto(lineaId, producto.id);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    if (mode === 'suggest') {
      setBusqProducto(raw);
      setModalProductoLineaId(lineaId);
    }
  };

  const selectProducto = (lineaId: string, productoId: number) => {
    const p = productos.find((x) => x.id === productoId);
    if (!p) return;
    const precioResuelto = resolvePrecioProducto(p);
    const descuentoMax = resolveDescuentoMaximo(p);
    updateLinea(lineaId, {
      producto_id: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      tipo_linea: p.tipo === 'servicio' ? 'servicio' : 'mercaderia',
      unidad_medida: p.unidad_medida || 'Unid',
      cabys: p.codigo_cabys || '',
      tarifa_iva_codigo: p.codigo_tarifa_iva || '13',
      tarifa_iva_porcentaje: Number(p.tarifa_iva || IVA_BY_CODE[p.codigo_tarifa_iva || '13'] || 0),
      precio_unitario: precioResuelto.precio,
      descuento_autorizado_pct: descuentoMax,
      impuesto_venta_incluido: Boolean(p.impuesto_venta_incluido),
      precio_por_medida: Number(p.precio_por_medida || 0),
      escala_precio: precioResuelto.escala,
      descuento_monto: 0,
    });
    setModalProductoLineaId(null);
    setBusqProducto('');
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[codeDraftKey(lineaId)];
      return next;
    });
    setTimeout(() => focusLineaCell(lineaId, 'cantidad'), 40);
  };

  const limiteLineasExcedido = paramFact.lineas_por_factura > 0 && lineasValidas.length > paramFact.lineas_por_factura;
  const canConfirm = Boolean(
    clienteListo &&
    lineasValidas.length > 0 &&
    invalidExoneracion.length === 0 &&
    lineasExoneradasNoAutorizadas.length === 0 &&
    !limiteLineasExcedido &&
    !creditoEvaluado?.bloqueado &&
    !(creditoEvaluado?.estado === 'alerta' && creditoOverride?.firma !== creditoOverrideFirma)
  );

  const emitirDocumentoEnFirme = async (docId: number) => {
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.');
    const directBase = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_PROXY || 'http://localhost:3001';
    const endpoints = [
      `/api/facturacion/emitir/${docId}`,
      ...((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? [`${directBase}/api/facturacion/emitir/${docId}`]
        : []),
    ].filter((value, index, arr) => arr.indexOf(value) === index);

    let lastError = 'No hubo respuesta del servidor.';
    for (const endpoint of endpoints) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ empresa_id: empresaId }),
        });
        const raw = await resp.text();
        const proxyError = /Error occurred while trying to proxy/i.test(raw || '');
        if (proxyError && endpoint !== endpoints[endpoints.length - 1]) {
          lastError = 'El proxy local no respondio; reintentando directo contra el backend.';
          continue;
        }

        let json = {} as { ok?: boolean; error?: string; estado_mh?: string; consecutivo?: string; mh_data?: any };
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch {
          json = {};
        }
        const detalleMh = json?.mh_data?.detalle || json?.mh_data?.message || json?.mh_data?.mensaje || '';
        const errorMsg =
          json.error ||
          detalleMh ||
          (raw && !raw.trim().startsWith('<') ? raw.trim() : '') ||
          `No se pudo emitir en firme (HTTP ${resp.status}).`;
        if (!resp.ok || !json.ok) throw new Error(errorMsg);
        return json;
      } catch (e: any) {
        lastError = String(e?.message || 'No hubo respuesta del servidor.');
      }
    }

    throw new Error(lastError);
  };

  const autorizarVentaAlerta = async () => {
    if (!creditoEvaluado || creditoEvaluado.estado !== 'alerta') return;
    if (!overrideUsuario.trim() || !overridePassword.trim()) {
      setOverrideError('Digite usuario y contraseña del autorizador.');
      return;
    }
    if (!overrideMotivo.trim()) {
      setOverrideError('Digite el motivo de la autorización.');
      return;
    }
    setOverrideBusy(true);
    setOverrideError('');
    try {
      const loginResp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: overrideUsuario.trim(), password: overridePassword }),
      });
      const loginJson = await loginResp.json().catch(() => ({}));
      if (!loginResp.ok || !loginJson?.ok || !loginJson?.session?.access_token) {
        throw new Error(loginJson?.message || 'No se pudo validar el autorizador.');
      }

      const permisosResp = await fetch(`/api/auth/permisos?empresa_id=${empresaId}`, {
        headers: { Authorization: `Bearer ${loginJson.session.access_token}` },
      });
      const permisosJson = await permisosResp.json().catch(() => ({}));
      if (!permisosResp.ok || !permisosJson?.ok) {
        throw new Error(permisosJson?.error || 'No se pudieron validar permisos del autorizador.');
      }

      const permisos = Array.isArray(permisosJson.permissions) ? permisosJson.permissions.map((p: any) => String(p || '').toLowerCase()) : [];
      const esSuper = Boolean(loginJson?.usuario?.es_superusuario);
      const autorizado = esSuper || permisos.includes('facturacion:aprobar');
      if (!autorizado) {
        throw new Error('El usuario no tiene permiso para aprobar excepciones de facturación.');
      }

      setCreditoOverride({
        autorizadoPor: String(loginJson?.usuario?.nombre || loginJson?.usuario?.username || overrideUsuario.trim()),
        motivo: overrideMotivo.trim(),
        firma: creditoOverrideFirma,
      });
      setOverrideModalOpen(false);
      setOverridePassword('');
      setOverrideMotivo('');
      setOverrideError('');
      setOk(`Excepción autorizada por ${String(loginJson?.usuario?.nombre || loginJson?.usuario?.username || overrideUsuario.trim())}.`);
    } catch (e: any) {
      setOverrideError(String(e?.message || 'No se pudo validar la autorización.'));
    } finally {
      setOverrideBusy(false);
    }
  };

  const registrarBitacoraCreditoOverride = async (documentoId: number, tipoDocumento: string, numeroConsecutivo?: string | null) => {
    if (!creditoEvaluado || creditoOverride?.firma !== creditoOverrideFirma) return;
    const snapshot = {
      comercial: {
        cliente_id: selectedCliente ? Number(selectedCliente.id || 0) : null,
        cliente_codigo: selectedCliente?.codigo || null,
        cliente_nombre: selectedCliente?.razon_social || null,
        cliente_escala_precio: selectedCliente ? Number(selectedCliente.escala_precio || 1) : null,
        cliente_aplica_descuentos: selectedCliente ? Boolean(selectedCliente.aplica_descuentos) : false,
        cliente_descuento_maximo_pct: selectedCliente ? Number(selectedCliente.descuento_maximo_pct || 0) : 0,
      },
      credito: {
        estado: creditoEvaluado.estado,
        limite: creditoEvaluado.limite,
        saldo_actual: creditoEvaluado.saldoActual,
        saldo_vencido: creditoEvaluado.montoVencido,
        docs_pendientes: creditoEvaluado.docsPendientes,
        disponible: creditoEvaluado.disponible,
        saldo_proyectado: creditoEvaluado.saldoProyectado,
        disponible_proyectado: creditoEvaluado.disponibleProyectado,
        plazo_autorizado: creditoEvaluado.plazoAutorizado,
        plazo_solicitado: creditoEvaluado.plazoSolicitado,
      },
      factura: {
        total: Number(resumen.total || 0),
        moneda,
        fecha_emision: fechaEmision,
      },
      override: {
        autorizado_por: creditoOverride.autorizadoPor,
        motivo: creditoOverride.motivo,
        firma: creditoOverride.firma,
      },
    };
    try {
      await supabase.from('fe_credito_excepciones_bitacora').insert({
        empresa_id: empresaId,
        documento_id: documentoId,
        tercero_id: terceroId || null,
        tipo_documento: tipoDocumento,
        numero_consecutivo: numeroConsecutivo || null,
        estado_credito: creditoEvaluado.estado,
        autorizado_por: creditoOverride.autorizadoPor,
        motivo: creditoOverride.motivo,
        reglas: creditoEvaluado.advertencias,
        snapshot,
      });
    } catch {
      // La bitacora no debe bloquear el documento si la migracion aun no esta aplicada.
    }
  };

  const persistDocumento = async (estado: 'borrador' | 'confirmado') => {
    if (flujoReceptor === 'credito' && !terceroId) {
      setError('Seleccione un cliente autorizado a credito antes de guardar el comprobante.');
      return;
    }
    if (flujoReceptor === 'credito' && creditoEvaluado?.bloqueado) {
      setError(creditoEvaluado.bloqueos[0] || 'La venta a crédito incumple la política del cliente.');
      return;
    }
    if (flujoReceptor === 'credito' && creditoEvaluado?.estado === 'alerta' && creditoOverride?.firma !== creditoOverrideFirma) {
      setError('La venta requiere autorización de supervisor antes de emitir.');
      setOverrideModalOpen(true);
      return;
    }
    if (flujoReceptor === 'contado' && !consumidorFinal && !receptorIdentificacion.trim()) {
      setError('Digite la cedula del receptor o cambie a consumidor final.');
      return;
    }
    if (clienteRequerido && !clienteListo) {
      setError('La factura electronica requiere un receptor identificado.');
      return;
    }
    if (lineasValidas.length === 0) {
      setError('Debe agregar al menos una linea valida.');
      return;
    }
    const liquidacionError = validateLiquidacionPagos(liquidacionPagos, resumen.total, condicionVenta);
    if (liquidacionError) {
      setError(liquidacionError);
      return;
    }
    if (limiteLineasExcedido) {
      setError(`Se excedio el limite configurado de ${paramFact.lineas_por_factura} lineas por factura.`);
      return;
    }
    if (estado === 'confirmado' && invalidExoneracion.length > 0) {
      setError('La exoneracion seleccionada no autoriza todos los CABYS de las lineas. No se puede confirmar.');
      return;
    }
    if (estado === 'confirmado' && lineasExoneradasNoAutorizadas.length > 0) {
      setError('La exoneracion no puede aplicarse porque hay lineas gravadas con CABYS no autorizados o vacios.');
      return;
    }
    if (estado === 'confirmado' && !esTiquete && receptorIdentificacion.trim() && !receptorActividadCodigo.trim()) {
      try {
        const found = await completarActividadEconomica(receptorIdentificacion);
        if (!found) {
          setError('El receptor no tiene actividad económica cargada. Consúltela antes de emitir la factura.');
          return;
        }
      } catch (e: any) {
        setError(String(e?.message || 'No se pudo completar la actividad económica del receptor.'));
        return;
      }
    }
    setBusy(true);
    setOk('');
    setError('');
    let documentoIdGuardado = 0;
    try {
      let receptorBitId: number | null = null;
      try {
        receptorBitId = await persistBitacoraReceptor();
      } catch (bitErr: any) {
        const msg = String(bitErr?.message || bitErr || '');
        if (!/no autorizado|not authorized|row-level security|permission denied/i.test(msg)) {
          throw bitErr;
        }
      }
      const receptorPayload = flujoReceptor === 'credito'
        ? {
            tercero_id: terceroId || null,
            receptor_bitacora_id: null,
            receptor_origen: 'cliente_credito',
            receptor_tipo_identificacion: receptorTipoIdentificacion || inferTipoIdentificacion(String(selectedCliente?.identificacion || '')) || null,
            receptor_identificacion: receptorIdentificacion.trim() || selectedCliente?.identificacion || null,
            receptor_nombre: receptorNombre.trim() || selectedCliente?.razon_social || null,
            receptor_actividad_codigo: receptorActividadCodigo || null,
            receptor_actividad_descripcion: receptorActividadDescripcion || null,
            receptor_email: receptorEmail.trim() || selectedCliente?.email || null,
            receptor_telefono: receptorTelefono.trim() || null,
            receptor_direccion: receptorDireccion.trim() || null,
          }
        : consumidorFinal
          ? {
              tercero_id: null,
              receptor_bitacora_id: null,
              receptor_origen: 'consumidor_final',
              receptor_tipo_identificacion: null,
              receptor_identificacion: null,
              receptor_nombre: 'Consumidor final',
              receptor_actividad_codigo: null,
              receptor_actividad_descripcion: null,
              receptor_email: null,
              receptor_telefono: null,
              receptor_direccion: null,
            }
          : {
              tercero_id: null,
              receptor_bitacora_id: receptorBitId,
              receptor_origen: 'bitacora',
              receptor_tipo_identificacion: receptorTipoIdentificacion || null,
              receptor_identificacion: receptorIdentificacion.trim() || null,
              receptor_nombre: receptorNombre.trim() || null,
              receptor_actividad_codigo: receptorActividadCodigo || null,
              receptor_actividad_descripcion: receptorActividadDescripcion || null,
              receptor_email: receptorEmail.trim() || null,
              receptor_telefono: receptorTelefono.trim() || null,
              receptor_direccion: receptorDireccion.trim() || null,
            };
        const terminalSeleccionada = terminales.find((t) => t.id === terminalId) || null;
        const { data: inserted, error: insErr } = await supabase.from('fe_documentos').insert({
          empresa_id: empresaId,
          tipo_documento: tipoDocumentoAuto,
          origen: 'facturacion',
          estado,
          auto_emitir: estado === 'confirmado',
          ...receptorPayload,
          fecha_emision: fechaEmision,
          ...(terminalSeleccionada ? { sucursal: terminalSeleccionada.sucursal, punto_venta: terminalSeleccionada.punto_venta } : {}),
          moneda,
          condicion_venta: condicionVenta,
          medio_pago: medioPago,
          liquidacion_pago_json: serializeLiquidacionPagos(liquidacionPagos, condicionVenta),
          plazo_credito_dias: plazoCreditoDias,
          exoneracion_id: exoneracionId,
          observacion: observacion.trim() || null,
          subtotal: resumen.subtotal,
          total_descuento: resumen.descuento,
          total_impuesto: resumen.impuestoNeto,
          total_comprobante: resumen.total,
        }).select('id').single();
        if (insErr) throw new Error(`No se pudo guardar fe_documentos: ${String(insErr.message || insErr)}`);
        const documentoId = Number((inserted as any)?.id || 0);
        if (!documentoId) throw new Error('No se pudo obtener el id del comprobante.');
        documentoIdGuardado = documentoId;
        await registrarBitacoraCreditoOverride(documentoId, tipoDocumentoAuto, null);

      const rows = lineasCalculadas.filter((l) => l.descripcion.trim()).map((l, idx) => ({
        documento_id: documentoId,
        linea: idx + 1,
        tipo_linea: l.tipo_linea,
        producto_id: l.producto_id,
        codigo_interno: l.codigo || null,
        cabys: l.cabys || null,
        descripcion: l.descripcion,
        unidad_medida: l.unidad_medida || null,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descuento_monto: l.descuento_monto,
        tarifa_iva_codigo: l.tarifa_iva_codigo || null,
        tarifa_iva_porcentaje: l.tarifa_iva_porcentaje,
        exoneracion_id: l.exoneracionAplica ? exoneracionId : null,
        exoneracion_autorizacion: l.exoneracionAplica ? String(selectedExon?.autorizacion || '') : null,
        exoneracion_porcentaje: l.exoneracionAplica ? Number(selectedExon?.porcentaje_exoneracion || 0) : 0,
        exoneracion_monto: l.exoneracionAplica ? l.exoneracionMonto : 0,
        subtotal: l.subtotal,
        impuesto_monto: l.impuestoBruto,
        total_linea: l.total,
        partida_arancelaria: esFee && l.partida_arancelaria?.trim() ? l.partida_arancelaria.trim() : null,
        }));
        const { error: lineErr } = await supabase.from('fe_documento_lineas').insert(rows);
        if (lineErr) throw new Error(`No se pudo guardar fe_documento_lineas: ${String(lineErr.message || lineErr)}`);

      if (estado === 'confirmado') {
        const json = await emitirDocumentoEnFirme(documentoId);
        setOk(`Documento emitido en firme (${DOC_LABEL[tipoDocumentoAuto]}). Estado MH: ${String(json.estado_mh || 'enviado')}${json.consecutivo ? `${sep}${json.consecutivo}` : ''}`);
      } else {
        setOk('Comprobante guardado en borrador.');
      }
        setTerceroId(null);
        setCodigoCliente('');
        setExoneracionId(null);
        setObservacion('');
        setLineas([emptyLinea()]);
        setLiquidacionPagos([createLiquidacionPago(config.medio_pago_defecto || '01', 0)]);
        limpiarReceptorContado();
        try {
          await cargarBase();
        } catch {
          // El guardado ya fue exitoso; si falla la recarga auxiliar no debe revertir el mensaje principal.
        }
        setError('');
      } catch (e: any) {
        const baseMsg = String(e?.message || 'No se pudo guardar el comprobante FE.');
        setError(documentoIdGuardado && estado === 'confirmado'
          ? `El documento se guardo, pero no se pudo emitir en firme. ${baseMsg}`
          : baseMsg);
      } finally {
        setBusy(false);
      }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="fdoc-wrap">
        <div className="fdoc-stage">
          <div className="fdoc-stage-head">
            <div>
              <div className="fdoc-title">{DOC_LABEL[tipoDocumentoAuto]}</div>
              <div className="fdoc-stage-flow">{flujoReceptor === 'credito' ? 'Crédito' : consumidorFinal ? 'Consumidor final' : 'Contado'} {sep} T.C. 1.00 {sep} {moneda}</div>
              <div className="fdoc-sub">Captura unificada para crédito, contado y consumidor final.</div>
            </div>
            <div className="fdoc-stage-meta">
              {terminales.length > 0 && (() => {
                const termActual = terminales.find((t) => t.id === terminalId);
                return (
                  <span
                    style={{ background: '#1e293b', border: '1px solid #334155', color: '#a78bfa', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}
                    title={termActual?.nombre || 'Terminal'}
                  >
                    {termActual ? `${termActual.sucursal}-${termActual.punto_venta}` : '---'}
                  </span>
                );
              })()}
              <span className={`fdoc-chip ${invalidExoneracion.length === 0 ? 'ok' : 'bad'}`}>{invalidExoneracion.length === 0 ? 'CABYS válidos' : 'CABYS no autorizados'}</span>
              <button type="button" className={`fdoc-chip ${esFee ? 'ok' : ''}`} style={{ cursor: 'pointer', background: 'transparent' }} onClick={() => setModoFee(v => !v)} title="Activar/desactivar modo Factura Exportación (FEE)">
                {esFee ? 'FEE — Exportación' : 'FE — Local'}
              </button>
              <span className={`fdoc-chip ${clienteListo ? 'ok' : 'bad'}`}>{clienteListo ? (esTiquete ? 'Consumidor final / TE' : esFee ? 'Exportacion lista' : 'Receptor listo') : 'Falta receptor'}</span>
              <span className={`fdoc-chip ${lineasValidas.length > 0 ? 'ok' : 'bad'}`}>{lineasValidas.length > 0 ? 'Líneas listas' : 'Faltan líneas'}</span>
              <span className={`fdoc-chip ${limiteLineasExcedido ? 'bad' : 'ok'}`}>{limiteLineasExcedido ? 'Excede límite' : 'Dentro del límite'}</span>
              <button type="button" className={`fdoc-chip ${selectedExon ? 'ok' : 'bad'}`} style={{ cursor: 'pointer', background: 'transparent' }} onClick={() => setExoneracionModalOpen(true)}>
                {selectedExon ? `Exoneración ${selectedExon.porcentaje_exoneracion}%` : 'Sin exoneración'}
              </button>
            </div>
          </div>
        </div>

        <>
          <WorkspaceMainPanel>
            {ok ? <div className="fdoc-msg-ok">{ok}</div> : null}
              {visibleError ? <div className="fdoc-msg-err">{visibleError}</div> : null}
            {selectedExon && Number(selectedExon.cabys_count || 0) === 0 ? <div className="fdoc-msg-warn">La exoneración seleccionada no tiene CABYS autorizados cargados. No se aplicará a líneas gravadas.</div> : null}
            {invalidExoneracion.length > 0 ? <div className="fdoc-msg-warn">La exoneración seleccionada no autoriza estos CABYS: {invalidExoneracion.join('; ')}</div> : null}
            {limiteLineasExcedido ? <div className="fdoc-msg-warn">El documento supera el límite configurado de líneas por factura.</div> : null}
            <div className="fdoc-grid">
              <div className="fdoc-field" style={{ gridColumn:'span 12' }}>
                <div className="fdoc-receptor-panel">
                  <div className="fdoc-receptor-title">Datos del cliente</div>
                  <div className="fdoc-receptor-body">
                  <div className="fdoc-grid">
                    <div className="fdoc-field" style={{ gridColumn:'span 3' }}>
                      <label>Código cliente</label>
                      <input ref={codigoClienteInputRef} className="fdoc-input" value={codigoCliente} onChange={(e) => {
                        setCodigoCliente(e.target.value);
                        if (e.target.value.trim()) limpiarReceptorContado();
                      }} onKeyDown={handleCreditoCodigoKeyDown} placeholder="Código, nombre o identificación" />
                      {codigoCliente.trim()
                        ? <div className="fdoc-help">{clienteSugeridoCredito ? `Coincidencias: ${filteredClientesCredito.length}. Enter carga ${clienteSugeridoCredito.razon_social}.` : 'No hay coincidencias de cliente a crédito.'}</div>
                        : null}
                    </div>
                    <div className="fdoc-field" style={{ gridColumn:'span 3' }}>
                      <label>Cédula contado</label>
                      <input ref={cedulaInputRef} className="fdoc-input" value={receptorIdentificacion} disabled={Boolean(terceroId)} onChange={(e) => {
                        setTerceroId(null);
                        setCodigoCliente('');
                        setReceptorIdentificacion(e.target.value.trim());
                      }} onKeyDown={handleCedulaKeyDown} placeholder="Identificación del receptor" />
                    </div>
                      <div className="fdoc-field" style={{ gridColumn:'span 6' }}>
                        <label>Nombre</label>
                        <input ref={nombreInputRef} className={`fdoc-input ${receptorNombre.trim() ? 'fdoc-input-name-filled' : ''}`} value={receptorNombre} disabled={Boolean(terceroId)} onChange={(e) => setReceptorNombre(e.target.value)} placeholder="Nombre del receptor" />
                      </div>

                    <div className="fdoc-field" style={{ gridColumn:'span 3' }}>
                      <label>Teléfono</label>
                      <input className="fdoc-input" value={receptorTelefono} disabled={Boolean(terceroId)} onChange={(e) => setReceptorTelefono(e.target.value)} placeholder="Teléfono" />
                    </div>
                    <div className="fdoc-field" style={{ gridColumn:'span 3' }}>
                      <label>Plazo</label>
                      <input className="fdoc-input" readOnly value={flujoReceptor === 'credito' ? String(plazoCreditoDias) : '0 dias'} />
                    </div>
                    <div className="fdoc-field" style={{ gridColumn:'span 6' }}>
                      <label>Dirección</label>
                      <input className="fdoc-input" value={receptorDireccion} onChange={(e) => setReceptorDireccion(e.target.value)} placeholder="Dirección del receptor" />
                    </div>

                    <div className="fdoc-field" style={{ gridColumn:'span 6' }}>
                      <label>Correo</label>
                      <input className="fdoc-input" value={receptorEmail} onChange={(e) => setReceptorEmail(e.target.value)} placeholder="Correo del receptor" />
                    </div>
                    <div className="fdoc-field" style={{ gridColumn:'span 4' }}>
                      <label>Actividad tributaria</label>
                      <select className="fdoc-select" value={receptorActividadCodigo} onChange={(e) => {
                        const act = receptorActividades.find((a) => a.codigo === e.target.value) || null;
                        setReceptorActividadCodigo(e.target.value);
                        setReceptorActividadDescripcion(act?.descripcion || '');
                      }}>
                        <option value="">-- actividad --</option>
                        {receptorActividades.map((a) => <option key={a.codigo} value={a.codigo}>{`${a.codigo} - ${a.descripcion}`}</option>)}
                      </select>
                    </div>
                    <div className="fdoc-field" style={{ gridColumn:'span 12' }}>
                      <div className="fdoc-help">Si el cliente tiene crédito activo, el flujo se marca como crédito. Si no, trabaje la venta por contado usando la cédula del receptor.</div>
                      {clienteCodigoBloqueado ? <div className="fdoc-msg-warn" style={{ marginTop: 8, marginBottom: 0 }}>El cliente {clienteCodigoBloqueado.razon_social} no puede facturarse a crédito en este momento. Revise plazo/límite y su cartera vencida, o facture de contado.</div> : null}
                      <div className="fdoc-help">Si no hay cliente crédito ni receptor identificado, el documento queda como Tiquete Electrónico para consumidor final. Si digita una cédula válida, el sistema trabaja como Factura Electrónica.</div>
                      {creditoEvaluado ? (
                        <div className="fdoc-credit-box">
                          <div className="fdoc-credit-title">Control de crédito en tiempo real</div>
                          <div className="fdoc-credit-grid">
                            <div className="fdoc-credit-kpi">
                              <div className="k">Estado</div>
                              <div className={`v ${creditoEvaluado.estado === 'bloqueado' ? 'bad' : creditoEvaluado.estado === 'alerta' ? 'warn' : ''}`}>
                                {creditoEvaluado.estado === 'bloqueado' ? 'Bloqueado' : creditoEvaluado.estado === 'alerta' ? 'Alerta' : 'Aprobado'}
                              </div>
                            </div>
                            <div className="fdoc-credit-kpi">
                              <div className="k">Límite</div>
                              <div className="v">{creditoEvaluado.limite > 0 ? `${currencyPrefix(moneda)} ${money(creditoEvaluado.limite)}` : 'Sin definir'}</div>
                            </div>
                            <div className="fdoc-credit-kpi">
                              <div className="k">Saldo actual</div>
                              <div className="v">{`${currencyPrefix(moneda)} ${money(creditoEvaluado.saldoActual)}`}</div>
                            </div>
                            <div className="fdoc-credit-kpi">
                              <div className="k">Vencido</div>
                              <div className={`v ${creditoEvaluado.montoVencido > 0 ? 'bad' : ''}`}>{`${currencyPrefix(moneda)} ${money(creditoEvaluado.montoVencido)}`}</div>
                            </div>
                            <div className="fdoc-credit-kpi">
                              <div className="k">Disponible</div>
                              <div className={`v ${creditoEvaluado.disponible !== null && creditoEvaluado.disponible < 0 ? 'bad' : ''}`}>
                                {creditoEvaluado.disponible === null ? 'Sin definir' : `${currencyPrefix(moneda)} ${money(creditoEvaluado.disponible)}`}
                              </div>
                            </div>
                            <div className="fdoc-credit-kpi">
                              <div className="k">Saldo proyectado</div>
                              <div className={`v ${creditoEvaluado.disponibleProyectado !== null && creditoEvaluado.disponibleProyectado < 0 ? 'bad' : ''}`}>{`${currencyPrefix(moneda)} ${money(creditoEvaluado.saldoProyectado)}`}</div>
                            </div>
                          </div>
                          <div className="fdoc-credit-notes">
                            <div className={`fdoc-credit-note ${creditoEvaluado.plazoSolicitado > creditoEvaluado.plazoAutorizado ? 'bad' : ''}`}>
                              Plazo solicitado: {creditoEvaluado.plazoSolicitado} días. Plazo autorizado: {creditoEvaluado.plazoAutorizado} días.
                            </div>
                            {creditoEvaluado.bloqueos.map((item) => (
                              <div key={item} className="fdoc-credit-note bad">{item}</div>
                            ))}
                            {creditoEvaluado.advertencias.map((item) => (
                              <div key={item} className="fdoc-credit-note warn">{item}</div>
                            ))}
                            {creditoEvaluado.infos.map((item) => (
                              <div key={item} className="fdoc-credit-note">{item}</div>
                            ))}
                            {creditoEvaluado.estado === 'alerta' && creditoOverride?.firma === creditoOverrideFirma ? (
                              <div className="fdoc-credit-note ok">
                                Excepción autorizada por {creditoOverride.autorizadoPor}. Motivo: {creditoOverride.motivo}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            </div>
          </WorkspaceMainPanel>

          <WorkspaceMainPanel style={{ border: '1px solid transparent', background: 'linear-gradient(#111827, #111827) padding-box, linear-gradient(135deg, #c9a227 0%, #3a2a00 40%, #3a2a00 60%, #c9a227 100%) border-box' }}>
            <div className="fdoc-section-title">Detalle de factura</div>
            <div className="fdoc-detail-box">
              <div className="fdoc-sub" style={{ marginBottom: 14 }}>
                {paramFact.lineas_por_factura > 0 ? `Límite configurado de líneas por factura: ${paramFact.lineas_por_factura}` : 'Puede agregar líneas libremente en esta primera fase.'}
              </div>
              <div className="fdoc-line-shell">
            <div className="fdoc-mobile-hint">Desliza horizontalmente para editar cantidades, precios y acciones.</div>
            <div className="fdoc-line-scroll">
            <table className="fdoc-line-table">
              <thead>
                <tr>
                  <th style={{ width:'3%' }}>#</th>
                  <th style={{ width:'10%' }}>Código</th>
                  <th style={{ width:'11%' }}>CABYS</th>
                  {esFee && <th style={{ width:'9%' }}>Partida Ar.</th>}
                  <th style={{ width:'7%' }}>Cant.</th>
                  <th>Artículo</th>
                  <th style={{ width:'7%' }}>Dscto</th>
                  <th style={{ width:'9%' }}>Precio</th>
                  {!esFee && <th style={{ width:'6%' }}>Iva Exo.</th>}
                  {!esFee && <th style={{ width:'5%' }}>Iva</th>}
                  <th style={{ width:'8%' }}>Total</th>
                  <th style={{ width:'4%' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {lineasCalculadas.map((l, idx) => (
                  <tr key={l.id}>
                    <td className="fdoc-line-num">{idx + 1}</td>
                    <td>
                        <input
                          ref={(el) => registerLineaCellRef(l.id, 'producto', el)}
                          className="fdoc-line-input editable"
                          type="text"
                        value={drafts[codeDraftKey(l.id)] ?? l.codigo}
                        placeholder="Código"
                        onChange={(e) => changeCodigoDraft(l.id, e.target.value)}
                        onFocus={(e) => { startCodigoEdit(l.id, l.codigo || ''); e.currentTarget.select(); }}
                        onBlur={() => finishCodigoEdit(l.id)}
                        onKeyDown={(e) => handleLineaEnter(e, l.id, 'producto')}
                        title="Digite o escanee código de barras o código interno"
                      />
                      </td>
                      <td>
                        <div className={`fdoc-line-input readonly ${l.cabys ? '' : 'empty'}`} style={{ display: 'flex', alignItems: 'center' }}>
                          {l.cabys || ''}
                        </div>
                      </td>
                      {esFee && (
                        <td>
                          <input
                            className="fdoc-line-input editable"
                            type="text"
                            value={l.partida_arancelaria}
                            placeholder="0000.00.00"
                            onChange={(e) => setLineas(prev => prev.map(x => x.id === l.id ? { ...x, partida_arancelaria: e.target.value } : x))}
                          />
                        </td>
                      )}
                      <td>
                        <input
                          ref={(el) => registerLineaCellRef(l.id, 'cantidad', el)}
                          className="fdoc-line-input editable num"
                        type="text"
                        inputMode="decimal"
                          value={drafts[numericDraftKey(l.id, 'cantidad')] ?? fmtNum(l.cantidad, 3)}
                        onChange={(e) => changeNumericDraft(l.id, 'cantidad', e.target.value)}
                        onFocus={(e) => prepareNumericOverwrite(e, l.id, 'cantidad', l.cantidad)}
                        onMouseUp={(e) => e.preventDefault()}
                        onBlur={() => finishNumericEdit(l.id, 'cantidad')}
                        onKeyDown={(e) => handleLineaEnter(e, l.id, 'cantidad')}
                      />
                      </td>
                      <td>
                        <div
                          className={`fdoc-line-input readonly ${l.descripcion ? '' : 'empty'} ${l.tipo_linea === 'servicio' ? 'fdoc-article-service' : 'fdoc-article-merc'}`}
                          style={{ display: 'flex', alignItems: 'center' }}
                        >
                          {l.descripcion || 'Seleccione un artículo'}
                        </div>
                        {l.producto_id ? (
                          <div className="fdoc-cell-meta">
                            {(() => {
                              const producto = productos.find((item) => item.id === l.producto_id);
                              if (!producto) return `Escala E${l.escala_precio || 1}`;
                              return `${resolvePrecioProductoContext(producto).origen}${l.descuento_autorizado_pct > 0 ? ` · Desc. máx. ${fmtNum(Number(l.descuento_autorizado_pct || 0), 2)}%` : ''}`;
                            })()}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <input
                          ref={(el) => registerLineaCellRef(l.id, 'descuento', el)}
                          className="fdoc-line-input editable num"
                          type="text"
                          inputMode="decimal"
                          value={drafts[numericDraftKey(l.id, 'descuento')] ?? fmtNum(lineaDescuentoPct(l), 2)}
                          onChange={(e) => changeNumericDraft(l.id, 'descuento', e.target.value)}
                          onFocus={(e) => prepareNumericOverwrite(e, l.id, 'descuento', lineaDescuentoPct(l))}
                          onMouseUp={(e) => e.preventDefault()}
                          onBlur={() => finishNumericEdit(l.id, 'descuento')}
                          onKeyDown={(e) => handleLineaEnter(e, l.id, 'descuento')}
                        />
                      </td>
                      <td>
                        {l.tipo_linea === 'servicio' ? (
                          <input
                            ref={(el) => registerLineaCellRef(l.id, 'precio', el)}
                            className="fdoc-line-input editable num"
                            type="text"
                            inputMode="decimal"
                            value={drafts[numericDraftKey(l.id, 'precio')] ?? fmtNum(l.precio_unitario, 2)}
                            onChange={(e) => changeNumericDraft(l.id, 'precio', e.target.value)}
                            onFocus={(e) => prepareNumericOverwrite(e, l.id, 'precio', l.precio_unitario)}
                            onMouseUp={(e) => e.preventDefault()}
                            onBlur={() => finishNumericEdit(l.id, 'precio')}
                            onKeyDown={(e) => handleLineaEnter(e, l.id, 'precio')}
                          />
                        ) : (
                          <>
                            <div className="fdoc-line-input readonly num" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {fmtNum(l.precio_unitario, 2)}
                            </div>
                            {l.producto_id ? <div className="fdoc-cell-meta" style={{ textAlign: 'right' }}>E{l.escala_precio || 1}</div> : null}
                          </>
                        )}
                      </td>
                      {!esFee && (
                        <td>
                          {selectedExon ? (
                            <div className="fdoc-line-exo">{l.exoneracionAplica && l.exoneracionMonto > 0 ? money(l.exoneracionMonto) : ''}</div>
                          ) : <div className="fdoc-line-exo"></div>}
                        </td>
                      )}
                      {!esFee && (
                        <td>
                          <div className="fdoc-line-iva">{`${l.tarifa_iva_porcentaje}%`}</div>
                        </td>
                      )}
                    <td><div className="fdoc-line-amt">{money(l.total)}</div></td>
                    <td style={{ textAlign: 'center' }}><span className="fdoc-line-remove" title="Quitar linea" onClick={() => removeLinea(l.id)}>×</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            </div>
            <div className="fdoc-btns">
              <button className="fdoc-btn" disabled={paramFact.lineas_por_factura > 0 && lineas.length >= paramFact.lineas_por_factura} onClick={() => addLinea()}>Agregar línea</button>
              </div>
            </div>
          </WorkspaceMainPanel>

          <WorkspaceMainPanel>
            <div className="fdoc-section-title">Comentario y totales</div>
            <div className="fdoc-footer-shell">
              <div className="fdoc-detail-box">
                <div className="fdoc-field">
                  <label>Comentario</label>
                  <textarea className="fdoc-textarea" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Detalle visible o nota interna del comprobante" />
                </div>
              </div>
              <div>
                <div className="fdoc-total-card">
                  <div className="fdoc-total-row"><div className="k">Sub-Total</div><div className="v">{money(resumen.subtotal)}</div></div>
                  <div className="fdoc-total-row"><div className="k">Descuento</div><div className="v">{money(resumen.descuento)}</div></div>
                  <div className="fdoc-total-row"><div className="k">I.V.A.</div><div className="v">{money(resumen.impuestoNeto)}</div></div>
                  <div className="fdoc-total-row"><div className="k">Exonerado</div><div className="v">{money(resumen.exoneracion)}</div></div>
                  <div className="fdoc-total-row grand"><div className="k">Total a pagar</div><div className="v">{`${currencyPrefix(moneda)} ${money(resumen.total)}`}</div></div>
                </div>
              </div>
            </div>
          </WorkspaceMainPanel>

          <WorkspaceMainPanel>
            <div className="fdoc-section-title">Liquidación medio de pago</div>
            <div className="fdoc-pay-shell">
              <div className="fdoc-pay-head">
                <span>Total liquidado {money(liquidacionPagoTotal)}</span>
                <span>Diferencia {money(liquidacionPagoTotal - resumen.total)}</span>
              </div>
              {condicionVenta === '02' ? (
                <div className="fdoc-help" style={{ padding: '10px 12px' }}>En venta a crédito no se registra liquidación de cobro en este comprobante.</div>
              ) : (
                <>
                <div className="fdoc-mobile-hint" style={{ padding: '10px 12px 0' }}>Desliza horizontalmente para revisar la liquidación completa.</div>
                <div className="fdoc-pay-scroll">
                <table className="fdoc-pay-table">
                  <thead>
                    <tr>
                      <th style={{ width:'23%' }}>Medio</th>
                      <th style={{ width:'16%' }}>Subtipo</th>
                      <th style={{ width:'18%' }}>Referencia</th>
                      <th>Detalle</th>
                      <th style={{ width:'14%' }}>Monto</th>
                      <th style={{ width:'5%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidacionPagos.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <select className="fdoc-line-input" value={row.tipoMedioPago} onChange={(e) => updateLiquidacionPago(row.id, { tipoMedioPago: e.target.value, subtipo: FE_SUBTIPO_OPTIONS[e.target.value]?.[0]?.value || '' })}>
                            {FE_MEDIO_PAGO_OPTIONS.map((opt: { value: string; label: string }) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        </td>
                        <td>
                          {FE_SUBTIPO_OPTIONS[row.tipoMedioPago]?.length ? (
                            <select className="fdoc-line-input" value={row.subtipo} onChange={(e) => updateLiquidacionPago(row.id, { subtipo: e.target.value })}>
                              <option value="">Seleccione</option>
                              {FE_SUBTIPO_OPTIONS[row.tipoMedioPago].map((opt: { value: string; label: string }) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          ) : (
                            <div className="fdoc-cell-meta">N/A</div>
                          )}
                        </td>
                        <td>
                          <input className="fdoc-line-input" value={row.referencia} onChange={(e) => updateLiquidacionPago(row.id, { referencia: e.target.value })} placeholder={referenciaLabel(row.tipoMedioPago, row.subtipo)} />
                        </td>
                        <td>
                          <input className="fdoc-line-input" value={row.detalle} onChange={(e) => updateLiquidacionPago(row.id, { detalle: e.target.value })} placeholder={detalleLabel(row.tipoMedioPago)} />
                        </td>
                          <td>
                            <input
                              className="fdoc-line-input num editable"
                              type="text"
                              inputMode="decimal"
                              value={liquidacionMontoDrafts[row.id] ?? fmtNum(row.monto || 0, 2)}
                              onFocus={(e) => {
                                startLiquidacionMontoEdit(row.id, row.monto || 0);
                                requestAnimationFrame(() => e.currentTarget.select());
                              }}
                              onChange={(e) => setLiquidacionMontoDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              onBlur={() => finishLiquidacionMontoEdit(row.id)}
                            />
                          </td>
                        <td>
                          <button type="button" className="fdoc-line-remove" onClick={() => removeLiquidacionPago(row.id)}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                </>
              )}
              {condicionVenta !== '02' ? (
                <div className="fdoc-btns" style={{ marginTop: 10, padding: '0 12px 12px' }}>
                  <button type="button" className="fdoc-btn" onClick={addLiquidacionPago}>Agregar medio</button>
                  <button type="button" className="fdoc-btn" onClick={() => setLiquidacionPagos([createLiquidacionPago(config.medio_pago_defecto || '01', resumen.total)])}>Una sola línea</button>
                </div>
              ) : null}
            </div>
          </WorkspaceMainPanel>

            <WorkspaceMainPanel>
              <div className="fdoc-section-title">Terminar el documento</div>
              <div className="fdoc-footer-actions">
                <button className="fdoc-btn clear" disabled={busy} onClick={limpiarDocumento}>Limpiar</button>
                <button className="fdoc-btn primary" disabled={busy || (clienteRequerido && !clienteListo)} onClick={() => void persistDocumento('borrador')}>Guardar borrador</button>
                {creditoEvaluado?.estado === 'alerta' ? (
                  <button className="fdoc-btn" disabled={busy || overrideBusy} onClick={() => { setOverrideError(''); setOverrideModalOpen(true); }}>
                    {creditoOverride?.firma === creditoOverrideFirma ? 'Reautorizar alerta' : 'Autorizar alerta'}
                  </button>
                ) : null}
                <button className="fdoc-btn success" disabled={busy || !canConfirm} onClick={() => void persistDocumento('confirmado')}>Emitir en firme</button>
              </div>
            </WorkspaceMainPanel>

          {clienteModalOpen && (
            <div className="fdoc-modal-backdrop" onClick={() => setClienteModalOpen(false)}>
              <div className="fdoc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="fdoc-modal-head">
                  <div className="fdoc-modal-title">Buscar código de cliente</div>
                  <button type="button" className="fdoc-btn" onClick={() => setClienteModalOpen(false)}>Cerrar</button>
                </div>
                <div className="fdoc-modal-body">
                  <div className="fdoc-modal-content">
                    <div className="fdoc-sub" style={{ marginBottom: 0 }}>
                      Escriba código, nombre o cédula y el listado se filtrará en tiempo real.
                    </div>
                    <div className="fdoc-field" style={{ marginTop: 16 }}>
                      <label>Buscar cliente</label>
                      <input
                        className="fdoc-input"
                        value={codigoCliente}
                        onChange={(e) => setCodigoCliente(e.target.value)}
                        placeholder="Código, nombre o identificación"
                        autoFocus
                      />
                    </div>
                    {!filteredClientesCredito.length ? (
                      <div className="fdoc-empty">No se encontraron clientes con ese criterio.</div>
                    ) : (
                      <div className="fdoc-modal-table-wrap">
                        <div className="fdoc-mobile-hint">Desliza horizontalmente para revisar el listado completo.</div>
                        <div className="fdoc-modal-scroll">
                        <table className="fdoc-modal-table">
                          <thead>
                            <tr>
                              <th style={{ width: '18%' }}>Código</th>
                              <th>Nombre</th>
                              <th style={{ width: '22%' }}>Cédula</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredClientesCredito.map((cliente) => (
                              <tr key={cliente.id} onClick={() => void aplicarClienteCredito(cliente)}>
                                <td className="fdoc-modal-code">{cliente.codigo || '—'}</td>
                                <td className="fdoc-modal-name">{cliente.razon_social}</td>
                                <td className="fdoc-modal-id">{cliente.identificacion || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {bitacoraModalOpen && (
            <div className="fdoc-modal-backdrop" onClick={() => setBitacoraModalOpen(false)}>
              <div className="fdoc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="fdoc-modal-head">
                  <div className="fdoc-modal-title">Bitácora fiscal</div>
                  <button type="button" className="fdoc-btn" onClick={() => setBitacoraModalOpen(false)}>Cerrar</button>
                </div>
                <div className="fdoc-modal-body">
                  <div className="fdoc-modal-content">
                    <div className="fdoc-sub" style={{ marginBottom: 0 }}>
                      Si no escribes cédula, aquí puedes escoger un receptor ya guardado. Si no existe, vuelve y consulta MH.
                    </div>
                    <div className="fdoc-field" style={{ marginTop: 16 }}>
                      <label>Buscar receptor</label>
                      <input
                        className="fdoc-input"
                        value={bitacoraSearch}
                        onChange={(e) => setBitacoraSearch(e.target.value)}
                        placeholder="Cédula o nombre"
                        autoFocus
                      />
                    </div>
                    {bitacoraLoading ? (
                      <div className="fdoc-empty">Cargando bitácora...</div>
                    ) : !bitacoraFiltrada.length ? (
                      <div className="fdoc-empty">No hay receptores en bitácora para ese criterio.</div>
                    ) : (
                      <div className="fdoc-modal-table-wrap">
                        <div className="fdoc-mobile-hint">Desliza horizontalmente para revisar la bitácora completa.</div>
                        <div className="fdoc-modal-scroll">
                        <table className="fdoc-modal-table">
                          <thead>
                            <tr>
                              <th style={{ width: '22%' }}>Cédula</th>
                              <th>Nombre</th>
                              <th style={{ width: '18%' }}>Actividad</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bitacoraFiltrada.map((row) => (
                              <tr key={`${row.identificacion}-${row.id}`} onClick={() => void aplicarBitacoraReceptor(row)}>
                                <td className="fdoc-modal-code">{row.identificacion}</td>
                                <td>
                                  <div className="fdoc-modal-name">{row.razon_social}</div>
                                  {row.email ? <div className="fdoc-sub" style={{ marginTop: 4 }}>{row.email}</div> : null}
                                </td>
                                <td className="fdoc-modal-id">{row.actividad_codigo || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {exoneracionModalOpen && (
            <div className="fdoc-modal-backdrop" onClick={() => setExoneracionModalOpen(false)}>
              <div className="fdoc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="fdoc-modal-head">
                  <div className="fdoc-modal-title">Seleccionar exoneración</div>
                  <button type="button" className="fdoc-btn" onClick={() => setExoneracionModalOpen(false)}>Cerrar</button>
                </div>
                <div className="fdoc-modal-body">
                  <div className="fdoc-modal-content">
                    <div className="fdoc-sub" style={{ marginBottom: 0 }}>
                      Seleccione una exoneración vigente para aplicarla al comprobante. Si no corresponde, deje el documento sin exoneración.
                    </div>
                    <div className="fdoc-modal-table-wrap">
                      <div className="fdoc-mobile-hint">Desliza horizontalmente para revisar autorizaciones y vencimientos.</div>
                      <div className="fdoc-modal-scroll">
                      <table className="fdoc-modal-table">
                        <thead>
                          <tr>
                            <th style={{ width: '26%' }}>Autorizacion</th>
                            <th style={{ width: '16%' }}>% Exon.</th>
                            <th style={{ width: '18%' }}>Vence</th>
                            <th>CABYS</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr onClick={() => { setExoneracionId(null); setExoneracionModalOpen(false); }}>
                            <td className="fdoc-modal-code">—</td>
                            <td className="fdoc-modal-name" colSpan={3}>Sin exoneración</td>
                          </tr>
                          {exoneraciones.map((x) => (
                            <tr key={x.id} onClick={() => { setExoneracionId(x.id); setExoneracionModalOpen(false); }}>
                              <td className="fdoc-modal-code">{x.autorizacion}</td>
                              <td className="fdoc-modal-id">{x.porcentaje_exoneracion}%</td>
                              <td className="fdoc-modal-id">{x.fecha_vencimiento || '—'}</td>
                              <td className="fdoc-modal-id">{x.cabys_count || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>
                    {selectedExon ? <div className="fdoc-mini" style={{ marginTop: 14 }}>Seleccionada: {selectedExon.autorizacion} | CABYS autorizados: {selectedExon.cabys_count || 0}</div> : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {overrideModalOpen && (
            <div className="fdoc-modal-backdrop" onClick={() => setOverrideModalOpen(false)}>
              <div className="fdoc-modal" style={{ width: 'min(620px, 100%)' }} onClick={(e) => e.stopPropagation()}>
                <div className="fdoc-modal-head">
                  <div className="fdoc-modal-title">Autorización de supervisor</div>
                  <button type="button" className="fdoc-btn" onClick={() => setOverrideModalOpen(false)}>Cerrar</button>
                </div>
                <div className="fdoc-modal-body">
                  <div className="fdoc-modal-content">
                    <div className="fdoc-sub" style={{ marginBottom: 0 }}>
                      Esta venta quedó en estado de alerta y requiere validación de un usuario con permiso de aprobación en Facturación.
                    </div>
                    {creditoEvaluado?.advertencias?.length ? (
                      <div className="fdoc-credit-notes" style={{ marginTop: 16 }}>
                        {creditoEvaluado.advertencias.map((item) => (
                          <div key={item} className="fdoc-credit-note warn">{item}</div>
                        ))}
                      </div>
                    ) : null}
                    <div className="fdoc-grid" style={{ marginTop: 16 }}>
                      <div className="fdoc-field" style={{ gridColumn: 'span 6' }}>
                        <label>Usuario autorizador</label>
                        <input className="fdoc-input" value={overrideUsuario} onChange={(e) => setOverrideUsuario(e.target.value)} placeholder="Usuario del supervisor" autoFocus />
                      </div>
                      <div className="fdoc-field" style={{ gridColumn: 'span 6' }}>
                        <label>Contraseña</label>
                        <input className="fdoc-input" type="password" value={overridePassword} onChange={(e) => setOverridePassword(e.target.value)} placeholder="Contraseña del supervisor" />
                      </div>
                      <div className="fdoc-field" style={{ gridColumn: 'span 12' }}>
                        <label>Motivo</label>
                        <textarea className="fdoc-textarea" value={overrideMotivo} onChange={(e) => setOverrideMotivo(e.target.value)} placeholder="Justifique la excepción comercial o de crédito" />
                      </div>
                    </div>
                    {overrideError ? <div className="fdoc-msg-err" style={{ marginTop: 12, marginBottom: 0 }}>{overrideError}</div> : null}
                    <div className="fdoc-footer-actions" style={{ marginTop: 18 }}>
                      <button className="fdoc-btn" type="button" onClick={() => setOverrideModalOpen(false)} disabled={overrideBusy}>Cancelar</button>
                      <button className="fdoc-btn success" type="button" onClick={() => void autorizarVentaAlerta()} disabled={overrideBusy}>
                        {overrideBusy ? 'Validando...' : 'Validar autorización'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {modalProductoLineaId && (
            <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
              <div
                className="w-full max-w-3xl flex flex-col overflow-hidden rounded-[22px] border"
                style={{
                  maxHeight: '84vh',
                  background: 'linear-gradient(180deg, rgba(31,41,55,0.98) 0%, rgba(17,24,39,0.98) 100%)',
                  borderColor: 'rgba(59,130,246,0.18)',
                  boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
                }}
              >
                <div className="px-6 py-4 border-b flex items-start justify-between" style={{ borderColor: 'rgba(148,163,184,0.14)' }}>
                  <div>
                    <p className="text-lg font-semibold tracking-wide text-sky-400">Seleccionar articulo</p>
                    <p className="text-xs mt-1 text-gray-400">Puede buscar por codigo de barras, codigo interno o descripcion, o elegir directamente desde el catalogo.</p>
                  </div>
                  <button
                    onClick={() => setModalProductoLineaId(null)}
                    className="h-9 w-9 rounded-full border text-lg leading-none transition-colors"
                    style={{ borderColor: 'rgba(148,163,184,0.2)', color: '#94a3b8', background: 'rgba(15,23,42,0.35)' }}
                  >
                    ×
                  </button>
                </div>
                <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'rgba(148,163,184,0.12)' }}>
                  <input
                    ref={inputBusqProdRef}
                    type="text"
                    value={busqProducto}
                    onChange={(e) => setBusqProducto(e.target.value)}
                    placeholder="Buscar por codigo de barras, codigo o descripcion..."
                    className="w-full rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none"
                    style={{
                      background: 'rgba(15,23,42,0.72)',
                      border: `1px solid ${busqProducto ? 'rgba(56,189,248,0.45)' : 'rgba(148,163,184,0.18)'}`,
                      boxShadow: busqProducto ? '0 0 0 3px rgba(56,189,248,0.08)' : 'none',
                    }}
                  />
                  <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
                    <span>{busqProducto.trim().length >= 2 ? `Resultados para "${busqProducto.trim()}"` : 'Catalogo inicial para apoyar la seleccion'}</span>
                    <span>{productosFiltrados.length} articulo(s)</span>
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 px-4 py-4 space-y-2">
                  {productosFiltrados.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-gray-500">No hay articulos para mostrar.</p>
                  ) : (
                    productosFiltrados.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectProducto(modalProductoLineaId, p.id)}
                        className="w-full text-left rounded-2xl border px-4 py-3 transition-all hover:-translate-y-[1px]"
                        style={{ borderColor: 'rgba(148,163,184,0.12)', background: 'rgba(15,23,42,0.42)' }}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className="shrink-0 rounded-xl px-3 py-1.5 font-mono text-[11px] font-semibold"
                            style={{ background: 'rgba(56,189,248,0.15)', color: '#7dd3fc', minWidth: '116px', textAlign: 'center' }}
                          >
                            {p.codigo || 'SIN-CODIGO'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-100 break-words">{p.descripcion}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                              {p.inv_categorias?.nombre ? (
                                <span>
                                  Categoria: {p.inv_categorias.codigo_prefijo ? `${p.inv_categorias.codigo_prefijo} · ` : ''}{p.inv_categorias.nombre}
                                </span>
                              ) : null}
                              {p.codigo_barras ? <span>Barras: {p.codigo_barras}</span> : null}
                              <span>CABYS: {p.codigo_cabys || 'N/D'}</span>
                              <span>Unidad: {p.unidad_medida || 'N/D'}</span>
                              <span>IVA: {p.tarifa_iva || 0}%</span>
                              <span>Precio: {money(Number(p.precio_venta || 0))}</span>
                              <span>Desc. max: {fmtNum(Number(p.descuento_autorizado_pct || 0), 2)}%</span>
                              <span>Escala cliente: E{selectedCliente?.escala_precio || 1}</span>
                              {selectedCliente && productoClientePrecios[p.id] ? (
                                <span className="text-emerald-300">
                                  Precio especial: {money(Number(productoClientePrecios[p.id].precio_venta || 0))}
                                </span>
                              ) : null}
                              {productoEscalas[p.id]?.length ? (
                                <span>
                                  Escalas: {productoEscalas[p.id]
                                    .slice(0, 4)
                                    .map((esc) => `E${esc.escala} ${money(Number(esc.precio_venta || 0))}`)
                                    .join(' | ')}
                                </span>
                              ) : null}
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

        </>
      </div>
    </>
  );
}
