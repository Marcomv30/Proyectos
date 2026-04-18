import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WorkspaceMainPanel } from '../../components/WorkspaceShell'
import OverlayPortal from '../../components/OverlayPortal'
import { supabase } from '../../supabase'
import { FacturaPreviewModal } from '../Facturacion/FacturaPreviewModal'
import { fetchEmpresaTimeZone, formatCompanyDateTime, formatCompanyDateYmd, resolveCompanyTimeZone } from '../../utils/companyTimeZone'
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
} from '../../utils/fePaymentLiquidation'

interface Props {
  empresaId: number
}

// Tipos de Fusion PG (fuente de verdad)
interface TurnoFusion {
  period_id: number
  period_status: string
  start_at: string | null
  end_at: string | null
  start_trans_id: number | null
  end_trans_id: number | null
}

interface VentaFusion {
  sale_id: number
  pump_id: number
  hose_id: number
  grade_id: number
  volume: number
  money: number
  ppu: number
  sale_type: number
  start_at: string | null
  end_at: string | null
  preset_amount: number | null
  payment_type: string
  payment_info: string | null
  attendant_id: string | null
  customer_name: string | null
  customer_tax_id: string | null
}

interface VentaPendiente extends VentaFusion {
  bomba: string
  combustible: string
  cabys?: string | null
  tarifa_iva_porcentaje?: number | null
  tarifa_iva_codigo?: string | null
}

// Tipos de Supabase (solo FE)
interface ClienteOpt {
  id: number
  codigo: string | null
  razon_social: string
  identificacion: string | null
  email: string | null
  dias_credito?: number
  limite_credito?: number
  condicion_pago?: string
  credito_habilitado?: boolean
  credito_bloqueado?: boolean
  monto_vencido?: number
}

interface ConfigFe {
  sucursal: string
  punto_venta: string
  condicion_venta_defecto: string
  medio_pago_defecto: string
  plazo_credito_dias: number
  tipo_documento_defecto?: string
}

interface DocumentoRow {
  id: number
  estado: string
  estado_mh?: string | null
  tipo_documento: string
  fecha_emision: string
  numero_consecutivo: string | null
  total_comprobante: number
  observacion: string | null
  sale_id_fusion: number | null
  clave_mh?: string | null
  receptor_identificacion?: string | null
  receptor_nombre?: string | null
  receptor_email?: string | null
  respuesta_mh_json?: any
}

interface DocumentoLineaRow {
  linea?: number
  documento_id: number
  codigo_interno: string | null
  descripcion?: string | null
  cantidad?: number | null
  precio_unitario?: number | null
  total_linea?: number | null
  cabys?: string | null
}

interface DocumentoDetalleRow extends DocumentoRow {
  tercero_id: number | null
  receptor_tipo_identificacion: string | null
  receptor_identificacion: string | null
  receptor_nombre: string | null
  receptor_email: string | null
  receptor_telefono?: string | null
  receptor_direccion?: string | null
  receptor_actividad_codigo?: string | null
  receptor_actividad_descripcion?: string | null
  medio_pago: string | null
  liquidacion_pago_json?: any
  condicion_venta: string | null
  plazo_credito_dias: number | null
}

const COMBUSTIBLE_COLORS: Record<string, string> = {
  Regular: '#22c55e',
  Super: '#a855f7',
  Diesel: '#38bdf8',
  'Gas LP': '#f59e0b',
}

interface DraftFactura {
  tipoDocumento: string
  terceroId: number | null
  codigoCliente: string
  buscarCliente: string
  receptorTipoIdentificacion: string
  receptorIdentificacion: string
  receptorNombre: string
  receptorEmail: string
  receptorTelefono: string
  receptorDireccion: string
  receptorActividadCodigo: string
  receptorActividadDescripcion: string
  medioPago: string
  liquidacionPagos: LiquidacionPagoRow[]
  condicionVenta: string
  plazoCreditoDias: number
  observacion: string
}

interface ActividadMh {
  codigo: string
  descripcion: string
}

interface ReceptorBitacoraOpt {
  identificacion: string
  razon_social: string
  email: string | null
  telefono: string | null
  direccion: string | null
  actividad_codigo: string | null
  actividad_descripcion: string | null
  tipo_identificacion: string | null
  payload_json?: any
}

interface GradoCombustibleRow {
  grade_id: number
  nombre: string | null
  codigo_cabys?: string | null
  tarifa_iva_porcentaje?: number | null
  tarifa_iva_codigo?: string | null
}

const medioPagoLabel = (v: string) => ({
  '01': 'Efectivo',
  '02': 'Tarjeta',
  '03': 'Transferencia',
  '04': 'Recaudado por terceros',
  '05': 'Colecturia',
  '06': 'Documento fiscal',
  '07': 'Otro',
  '99': 'No aplica',
}[v] || v)

const STYLES = `
  .comb-fact-wrap { color:#e5e7eb; }
  .comb-fact-title { font-size:28px; font-weight:800; color:#f8fafc; margin-bottom:6px; letter-spacing:-.02em; }
  .comb-fact-sub { font-size:13px; color:#94a3b8; margin-bottom:18px; max-width:920px; }
  .comb-fact-input, .comb-fact-select, .comb-fact-textarea { width:100%; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark) 82%, var(--card-bg)); color:var(--card-text); border-radius:0; padding:8px 10px; font-size:12px; outline:none; }
  .comb-fact-input:focus, .comb-fact-select:focus, .comb-fact-textarea:focus { border-color:var(--green-main); box-shadow:0 0 0 1px color-mix(in srgb, var(--green-main) 28%, transparent); }
  .comb-fact-input::placeholder, .comb-fact-textarea::placeholder { color:var(--gray-400); }
  .comb-fact-textarea { min-height:64px; resize:vertical; }
  .comb-fact-table th, .comb-fact-table td { border-top:1px solid var(--card-border); padding:8px 10px; text-align:left; font-size:12px; vertical-align:middle; }
  .comb-fact-table th { color:color-mix(in srgb, var(--green-main) 48%, var(--card-text)); font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
  .comb-fact-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px; }
  .comb-fact-card { position:relative; overflow:hidden; border-radius:22px; border:1px solid rgba(71,85,105,.7); background:linear-gradient(180deg, rgba(20,27,38,.98) 0%, rgba(12,18,28,.98) 100%); box-shadow:0 18px 40px rgba(0,0,0,.24); transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
  .comb-fact-card::before { content:''; position:absolute; inset:0 auto 0 0; width:7px; background:linear-gradient(180deg, #fb923c 0%, #facc15 55%, #22c55e 100%); }
  .comb-fact-card.active { border-color:rgba(251,146,60,.78); box-shadow:0 22px 44px rgba(251,146,60,.12); transform:translateY(-2px); }
  .comb-fact-card.marcada { border-color:rgba(251,191,36,.7); box-shadow:0 0 0 1px rgba(251,191,36,.25), 0 18px 40px rgba(0,0,0,.24); }
  .comb-fact-card.marcada::before { background:linear-gradient(180deg, #f59e0b 0%, #fbbf24 55%, #fb923c 100%); }
  .comb-fact-card:hover { transform:translateY(-2px); border-color:rgba(148,163,184,.92); }
  .comb-fact-card button { all:unset; display:block; width:100%; box-sizing:border-box; padding:18px 18px 18px 22px; cursor:pointer; }
  .comb-fact-mark-btn { all:unset; position:absolute; bottom:14px; right:14px; z-index:3; cursor:pointer; border-radius:999px; padding:5px 11px; font-size:11px; font-weight:700; letter-spacing:.04em; transition:background .15s, color .15s, border-color .15s; }
  .comb-fact-mark-btn.on { background:rgba(251,191,36,.18); border:1px solid rgba(251,191,36,.45); color:#fbbf24; }
  .comb-fact-mark-btn.off { background:rgba(148,163,184,.08); border:1px solid rgba(148,163,184,.2); color:#64748b; }
  .comb-fact-mark-btn.off:hover { background:rgba(251,191,36,.1); border-color:rgba(251,191,36,.3); color:#fbbf24; }
  .comb-fact-grupo-bar { background:rgba(15,23,42,.42); border:1px solid rgba(100,116,139,.3); border-radius:0; padding:8px 10px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .comb-fact-grupo-bar span { font-size:12px; color:#cbd5e1; font-weight:700; }
  .comb-fact-grupo-bar button { all:unset; font-size:11px; color:#94a3b8; cursor:pointer; text-decoration:underline; }
  .comb-fact-chip { display:inline-flex; align-items:center; border-radius:999px; padding:4px 9px; font-size:11px; font-weight:700; letter-spacing:.04em; border:1px solid transparent; }
  .comb-fact-chip.orange { background:rgba(251,146,60,.14); border-color:rgba(251,146,60,.24); color:#fdba74; }
  .comb-fact-chip.green { background:rgba(34,197,94,.14); border-color:rgba(34,197,94,.24); color:#86efac; }
  .comb-fact-chip.blue { background:rgba(56,189,248,.14); border-color:rgba(56,189,248,.24); color:#7dd3fc; }
  .comb-fact-chip.gray { background:rgba(148,163,184,.12); border-color:rgba(148,163,184,.18); color:#cbd5e1; }
  .comb-fact-card-top { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:14px; }
  .comb-fact-sale { font-family:Consolas, monospace; color:#f8fafc; font-size:22px; font-weight:800; }
  .comb-fact-time { font-size:12px; color:#94a3b8; margin-top:3px; }
  .comb-fact-customer { font-size:15px; color:#f8fafc; font-weight:700; line-height:1.3; margin-bottom:5px; }
  .comb-fact-customer-sub { font-size:12px; color:#94a3b8; min-height:17px; }
  .comb-fact-stats { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; margin:14px 0; }
  .comb-fact-stat { border:1px solid rgba(51,65,85,.8); border-radius:14px; background:rgba(15,23,42,.78); padding:10px 11px; }
  .comb-fact-stat .k { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; margin-bottom:7px; }
  .comb-fact-stat .v { font-size:17px; font-weight:800; color:#f8fafc; }
  .comb-fact-stat .s { font-size:11px; color:#64748b; margin-top:5px; }
  .comb-fact-meta { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px 12px; margin-top:12px; }
  .comb-fact-meta div { font-size:12px; color:#cbd5e1; }
  .comb-fact-meta b { color:#64748b; display:block; font-size:10px; text-transform:uppercase; letter-spacing:.08em; margin-bottom:4px; }
  .comb-fact-warning, .comb-fact-ok, .comb-fact-empty { border-radius:14px; padding:12px 14px; font-size:12px; line-height:1.5; }
  .comb-fact-warning { background:rgba(120,53,15,.24); border:1px solid rgba(245,158,11,.28); color:#fcd34d; }
  .comb-fact-ok { background:rgba(6,78,59,.3); border:1px solid rgba(16,185,129,.24); color:#a7f3d0; }
  .comb-fact-empty { background:rgba(15,23,42,.7); border:1px dashed rgba(71,85,105,.72); color:#94a3b8; text-align:center; }
  .comb-fact-field { display:flex; flex-direction:column; gap:4px; margin-bottom:8px; }
  .comb-fact-field label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:color-mix(in srgb, var(--green-main) 55%, var(--card-text)); font-weight:800; }
  .comb-fact-two { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .comb-fact-preview { border-radius:0; border:1px solid rgba(71,85,105,.68); overflow:hidden; background:linear-gradient(180deg, rgba(20,27,38,.96) 0%, rgba(12,18,28,.98) 100%); }
  .comb-fact-preview-head { padding:16px 18px; border-bottom:1px solid rgba(51,65,85,.8); background:linear-gradient(90deg, rgba(30,41,59,.92) 0%, rgba(15,23,42,.92) 100%); }
  .comb-fact-paper-top { display:grid; grid-template-columns:minmax(280px, 1fr) auto auto; gap:16px; align-items:center; }
  .comb-fact-paper-refresh { display:flex; justify-content:center; }
  .comb-fact-workspace { display:grid; grid-template-columns:minmax(360px, 420px) minmax(0, 1fr); gap:18px; padding:18px; background:
      radial-gradient(circle at top right, rgba(251,146,60,.08), transparent 28%),
      linear-gradient(180deg, rgba(15,23,42,.9) 0%, rgba(2,6,23,.96) 100%); }
  .comb-fact-editor { display:grid; gap:10px; align-content:start; }
  .comb-fact-editor-panel { border:1px solid rgba(51,65,85,.85); border-radius:18px; background:rgba(15,23,42,.82); padding:16px; box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
  .comb-fact-editor-title { font-size:11px; text-transform:uppercase; letter-spacing:.12em; color:#fda4af; font-weight:800; margin-bottom:12px; }
  .comb-fact-paper { background:linear-gradient(180deg, var(--bg-dark2) 0%, var(--bg-dark) 100%); border:1px solid var(--card-border); border-radius:0; color:var(--card-text); box-shadow:0 30px 60px rgba(2,6,23,.32); overflow:visible; }
  .comb-fact-paper-head { padding:18px 22px; border-bottom:1px solid color-mix(in srgb, var(--green-main) 24%, var(--card-border)); background:linear-gradient(90deg, color-mix(in srgb, var(--bg-dark2) 88%, var(--green-soft) 12%) 0%, var(--bg-dark) 100%); position:sticky; top:0; z-index:24; box-shadow:0 10px 24px rgba(2,6,23,.28); }
  .comb-fact-paper-kicker { display:none; }
  .comb-fact-paper-title { font-size:24px; font-weight:800; color:var(--card-text); letter-spacing:-.03em; margin-top:0; opacity:.96; }
  .comb-fact-paper-sub { font-size:12px; color:var(--gray-400); margin-top:6px; }
  .comb-fact-paper-flow { font-size:13px; font-weight:800; color:var(--green-main); margin-top:4px; }
  .comb-fact-paper-body { padding:14px; display:grid; gap:16px; background:linear-gradient(180deg, color-mix(in srgb, var(--bg-dark2) 92%, transparent) 0%, var(--bg-dark) 100%); }
  .comb-fact-section { border:1px solid var(--card-border); border-radius:0; overflow:hidden; background:color-mix(in srgb, var(--bg-dark2) 84%, transparent); }
  .comb-fact-section-head { padding:10px 14px; background:color-mix(in srgb, var(--green-main) 18%, var(--bg-dark2)); color:var(--card-text); font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.12em; text-align:center; }
  .comb-fact-section-head.success { background:color-mix(in srgb, var(--green-main) 26%, var(--bg-dark2)); color:var(--card-text); }
  .comb-fact-section-grid { display:grid; grid-template-columns:1fr; gap:16px; padding:14px; }
  .comb-fact-form-grid { display:grid; grid-template-columns:repeat(12, minmax(0, 1fr)); gap:10px; }
  .comb-fact-client-row { display:grid; grid-template-columns:repeat(12, minmax(0, 1fr)); gap:10px; grid-column:span 12; }
  .comb-fact-contact-row { display:grid; grid-template-columns:repeat(12, minmax(0, 1fr)); gap:10px; grid-column:span 12; }
  .comb-fact-contact-row > .comb-fact-field,
  .comb-fact-detail-row > .comb-fact-field { margin-bottom:0; }
  .comb-fact-detail-row { display:grid; grid-template-columns:repeat(12, minmax(0, 1fr)); gap:10px; grid-column:span 12; }
  .comb-fact-field.compact { margin-bottom:0; }
  .comb-fact-field.span-12 { grid-column:span 12; }
  .comb-fact-field.span-8 { grid-column:span 8; }
  .comb-fact-field.span-6 { grid-column:span 6; }
  .comb-fact-field.span-4 { grid-column:span 4; }
  .comb-fact-field.span-3 { grid-column:span 3; }
  .comb-fact-field.span-2 { grid-column:span 2; }
  .comb-fact-credit-hint { font-size:11px; color:var(--gray-400); margin-top:6px; line-height:1.45; }
  .comb-fact-paper-box { border:1px solid rgba(100,116,139,.34); border-radius:16px; background:rgba(15,23,42,.56); padding:14px; }
  .comb-fact-paper-box .k { font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:#8fb7c6; margin-bottom:6px; font-weight:800; }
  .comb-fact-paper-box .v { font-size:15px; color:#f8fafc; font-weight:800; }
  .comb-fact-paper-box .s { font-size:12px; color:#94a3b8; margin-top:6px; }
  .comb-fact-inline-action { display:flex; gap:8px; align-items:flex-end; }
  .comb-fact-inline-action .comb-fact-field { flex:1 1 auto; }
  .comb-fact-inline-action .comb-fact-btn { white-space:nowrap; }
  .comb-fact-doc-order { display:grid; gap:10px; }
  .comb-fact-doc-step { border:1px dashed rgba(100,116,139,.34); border-radius:12px; background:rgba(15,23,42,.42); padding:10px 12px; }
  .comb-fact-doc-step b { display:block; color:#f8fafc; font-size:12px; margin-bottom:4px; }
  .comb-fact-doc-step span { color:#94a3b8; font-size:11px; line-height:1.45; display:block; }
  .comb-fact-modal-backdrop { position:fixed; inset:0; background:rgba(2,6,23,.66); display:flex; align-items:center; justify-content:center; padding:18px; z-index:9999; }
  .comb-fact-modal { width:min(780px, 100%); max-height:min(82vh, 820px); overflow:auto; border:1px solid rgba(71,85,105,.82); border-radius:0; background:linear-gradient(180deg, rgba(15,23,42,.98) 0%, rgba(10,18,32,.99) 100%); box-shadow:0 30px 60px rgba(2,6,23,.45); }
  .comb-fact-modal-head { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:16px 18px; border-bottom:1px solid rgba(51,65,85,.78); }
  .comb-fact-modal-title { color:#f8fafc; font-size:18px; font-weight:800; }
  .comb-fact-modal-body { padding:16px 18px; display:grid; gap:12px; }
  .comb-fact-modal-list { display:grid; gap:8px; }
  .comb-fact-modal-item { border:1px solid rgba(51,65,85,.72); border-radius:0; background:rgba(15,23,42,.72); padding:12px 14px; display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
  .comb-fact-modal-item strong { color:#f8fafc; display:block; margin-bottom:4px; }
  .comb-fact-modal-item span { color:#94a3b8; font-size:12px; line-height:1.45; display:block; }
  .comb-fact-modal-table { width:100%; border-collapse:collapse; }
  .comb-fact-modal-table-wrap { width:min(980px, 100%); margin:0 auto; justify-self:center; }
  .comb-fact-modal-content { width:min(980px, 100%); margin:0 auto; }
  .comb-fact-modal-table th, .comb-fact-modal-table td { padding:10px 12px; border-top:1px solid rgba(51,65,85,.72); font-size:12px; text-align:left; }
  .comb-fact-modal-table th { background:rgba(15,23,42,.88); color:#8fb7c6; font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
  .comb-fact-modal-table tbody tr { cursor:pointer; transition:background .15s ease; }
  .comb-fact-modal-table tbody tr:hover { background:rgba(30,41,59,.55); }
  .comb-fact-modal-code { font-family:Consolas, monospace; font-weight:800; color:#f8fafc; }
  .comb-fact-modal-name { color:#f8fafc; font-weight:700; }
  .comb-fact-modal-id { color:#94a3b8; }
  .comb-fact-modal-sub { color:#94a3b8; font-size:11px; }
  @media (max-width: 640px) {
    .comb-fact-modal-backdrop { align-items:flex-start; padding:12px; padding-top:calc(12px + env(safe-area-inset-top)); overflow:auto; }
    .comb-fact-modal { width:100%; max-height:none; min-height:min-content; }
    .comb-fact-modal-head { flex-direction:column; align-items:flex-start; padding:14px; }
    .comb-fact-modal-body { padding:14px; }
    .comb-fact-modal-table th, .comb-fact-modal-table td { padding:8px 10px; font-size:11px; }
  }
  .comb-fact-paper-line { margin:0; border-top:1px solid var(--card-border); overflow:auto; background:color-mix(in srgb, var(--bg-dark2) 58%, transparent); }
  .comb-fact-paper-line table { width:100%; border-collapse:collapse; min-width:640px; }
  .comb-fact-paper-line th, .comb-fact-paper-line td { padding:12px 14px; border-top:1px solid var(--card-border); font-size:13px; text-align:left; }
  .comb-fact-paper-line th { border-top:0; background:color-mix(in srgb, var(--bg-dark) 92%, transparent); color:var(--gray-400); font-size:10px; text-transform:uppercase; letter-spacing:.12em; font-weight:800; }
  .comb-fact-paper-line td { color:var(--card-text); }
  .comb-fact-paper-line td:last-child, .comb-fact-paper-line th:last-child { text-align:right; font-family:Consolas, monospace; }
  .comb-fact-detail-layout { display:grid; grid-template-columns:minmax(0, 1.5fr) minmax(300px, 1fr); gap:0; align-items:start; }
  .comb-fact-detail-totals { border-top:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 72%, transparent); padding:14px; }
  .comb-fact-paper-footer { padding:0; display:flex; justify-content:flex-end; }
  .comb-fact-paper-total { width:100%; display:grid; gap:8px; border:1px solid var(--card-border); border-radius:0; background:color-mix(in srgb, var(--bg-dark) 88%, transparent); overflow:hidden; }
  .comb-fact-paper-total-head { display:none; }
  .comb-fact-paper-total-body { padding:12px 14px 0; display:grid; gap:8px; }
  .comb-fact-paper-total .row { display:flex; justify-content:space-between; gap:12px; font-size:13px; color:var(--card-text); }
  .comb-fact-paper-total .row.total { margin-top:8px; padding:14px; background:color-mix(in srgb, var(--green-main) 16%, var(--bg-dark2)); color:var(--card-text); }
  .comb-fact-paper-total .row.total strong { color:var(--card-text); font-size:22px; letter-spacing:-.02em; }
  .comb-fact-paper-total .row.total span { font-size:13px; text-transform:uppercase; letter-spacing:.12em; font-weight:800; }
  .comb-fact-workspace-note { border:1px dashed rgba(251,146,60,.35); border-radius:14px; background:rgba(255,247,237,.06); color:#fdba74; font-size:12px; padding:12px 13px; }
  .comb-fact-preview-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; padding:16px 18px 0; }
  .comb-fact-box { border:1px solid var(--card-border); border-radius:14px; background:color-mix(in srgb, var(--bg-dark2) 78%, transparent); padding:12px; }
  .comb-fact-box .k { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--gray-400); margin-bottom:6px; }
  .comb-fact-box .v { font-size:14px; color:var(--card-text); font-weight:700; }
  .comb-fact-line { margin:16px 18px 0; border:1px solid rgba(51,65,85,.84); border-radius:16px; overflow:auto; }
  .comb-fact-line table { width:100%; border-collapse:collapse; }
  .comb-fact-line th, .comb-fact-line td { padding:12px 14px; border-top:1px solid rgba(51,65,85,.8); font-size:13px; text-align:left; }
  .comb-fact-line th { border-top:0; background:#0f172a; color:#cbd5e1; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
  .comb-fact-line th:first-child { background:#ea580c; color:#fff; }
  .comb-fact-line td:last-child, .comb-fact-line th:last-child { text-align:right; font-family:Consolas, monospace; }
  .comb-fact-line td { color:#e5e7eb; vertical-align:top; }
  .comb-fact-line td strong { color:#f8fafc; font-size:14px; }
  .comb-fact-line td small { display:block; margin-top:4px; color:#94a3b8; font-size:11px; line-height:1.45; }
  .comb-fact-footer { padding:16px 18px 18px; }
  .comb-fact-total { display:grid; gap:8px; margin-bottom:14px; }
  .comb-fact-total-row { display:flex; justify-content:space-between; gap:12px; font-size:13px; color:#cbd5e1; }
  .comb-fact-total-row strong { color:#f8fafc; font-size:16px; }
  .comb-fact-actions { display:flex; gap:10px; flex-wrap:wrap; }
  .comb-fact-btn { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 82%, var(--card-bg)); color:var(--card-text); border-radius:0; padding:11px 14px; font-size:13px; font-weight:700; cursor:pointer; }
  .comb-fact-btn.primary { background:color-mix(in srgb, var(--green-main) 18%, var(--bg-dark2)); border-color:color-mix(in srgb, var(--green-main) 36%, var(--card-border)); color:var(--card-text); }
  .comb-fact-btn.secondary { background:color-mix(in srgb, var(--bg-dark) 76%, var(--card-bg)); color:var(--card-text); }
  .comb-fact-btn:hover:not(:disabled) { border-color:color-mix(in srgb, var(--green-main) 40%, var(--card-border)); background:color-mix(in srgb, var(--green-main) 10%, var(--bg-dark2)); }
  .comb-fact-btn:disabled { opacity:.55; cursor:not-allowed; }
  .comb-fact-list { display:grid; gap:10px; }
  .comb-fact-history-item { border:1px solid rgba(51,65,85,.8); border-radius:14px; background:rgba(15,23,42,.78); padding:12px; }
  .comb-fact-history-top { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:8px; }
  .comb-fact-history-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
  .comb-fact-history-actions .comb-fact-btn { padding:8px 12px; font-size:12px; }
  .comb-fact-mh-box { margin-top:10px; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark) 82%, var(--card-bg)); padding:12px 14px; }
  .comb-fact-mh-title { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--gray-400); margin-bottom:8px; }
  .comb-fact-mh-msg { font-size:13px; line-height:1.45; color:var(--card-text); white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; }
  .comb-fact-next-step { border:1px solid rgba(251,146,60,.28); border-radius:16px; background:linear-gradient(90deg, rgba(251,146,60,.12), rgba(15,23,42,.96) 32%); padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
  .comb-fact-next-step-title { font-size:13px; font-weight:800; color:#f8fafc; }
  .comb-fact-next-step-sub { font-size:12px; color:#cbd5e1; margin-top:4px; }
  @media (max-width: 1100px) {
    .comb-fact-two, .comb-fact-preview-grid, .comb-fact-section-grid, .comb-fact-workspace, .comb-fact-vfp-band, .comb-fact-form-grid, .comb-fact-client-row, .comb-fact-contact-row, .comb-fact-detail-row { grid-template-columns:1fr; }
    .comb-fact-field.span-12, .comb-fact-field.span-8, .comb-fact-field.span-6, .comb-fact-field.span-4, .comb-fact-field.span-3, .comb-fact-field.span-2 { grid-column:span 1; }
    .comb-fact-detail-layout { grid-template-columns:1fr; }
    .comb-fact-detail-totals { border-left:0; border-top:1px solid rgba(100,116,139,.24); }
    .comb-fact-workspace { padding:16px; }
  }
  @media (max-width: 1400px) {
    .comb-fact-contact-row,
    .comb-fact-detail-row { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .comb-fact-contact-row > .comb-fact-field,
    .comb-fact-detail-row > .comb-fact-field { grid-column:auto !important; }
  }
  @media (max-width: 760px) {
    .comb-fact-wrap { padding:12px !important; }
    .comb-fact-title { font-size:22px; }
    .comb-fact-paper-head { padding:16px; }
    .comb-fact-paper-top { grid-template-columns:1fr; align-items:stretch; }
    .comb-fact-paper-refresh { justify-content:flex-start; }
    .comb-fact-paper-refresh .comb-fact-btn { width:100%; }
    .comb-fact-paper-title { font-size:22px; }
    .comb-fact-paper-body { padding:10px; }
    .comb-fact-section-grid { padding:10px; gap:12px; }
    .comb-fact-workspace { gap:14px; padding:14px; }
    .comb-fact-actions { width:100%; }
    .comb-fact-actions .comb-fact-btn { flex:1 1 100%; text-align:center; justify-content:center; }
    .comb-fact-grupo-bar { flex-direction:column; align-items:flex-start; }
    .comb-fact-next-step { flex-direction:column; align-items:flex-start; }
    .comb-fact-line table, .comb-fact-paper-line table { min-width:640px; }
  }
  @media (max-width: 560px) {
    .comb-fact-card button { padding:16px 16px 18px 20px; }
    .comb-fact-sale { font-size:18px; }
    .comb-fact-stats { grid-template-columns:1fr; }
    .comb-fact-meta { grid-template-columns:1fr; }
    .comb-fact-box, .comb-fact-editor-panel { padding:12px; }
  }
`

const money = (n: number) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', minimumFractionDigits: 0 }).format(Number(n || 0))
const qty = (n: number, decimals = 3) => new Intl.NumberFormat('es-CR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(n || 0))
const sep = ' · '
const normalizeUiError = (error: any, fallback: string) => {
  const raw = String(error?.message || error || '').trim()
  if (!raw) return fallback
  if (raw === 'Failed to fetch' || raw === 'TypeError: Failed to fetch') {
    return 'No hubo respuesta del servidor. Verifique que el backend del ERP este activo y que el proxy del frontend siga apuntando al puerto correcto.'
  }
  return raw
}

const mergeCabysLineas = (
  lineas: DocumentoLineaRow[],
  ventas: VentaPendiente[]
) =>
  lineas
    .map((linea) => {
      const actual = String(linea.cabys || '').trim()
      if (/^\d{13}$/.test(actual)) return null
      const match = String(linea.codigo_interno || '').match(/^COMB-(\d+)$/)
      if (!match) return null
      const venta = ventas.find((item) => item.sale_id === Number(match[1]))
      const cabys = String(venta?.cabys || '').trim()
      if (!/^\d{13}$/.test(cabys)) return null
      return { linea: Number(linea.linea || 0), cabys }
    })
    .filter(Boolean) as Array<{ linea: number; cabys: string }>

const mhEstadoLabel = (estado?: string | null) => {
  const v = String(estado || '').toLowerCase().trim()
  if (v === 'aceptado') return 'Aceptado'
  if (v === 'rechazado') return 'Rechazado'
  if (v === 'procesando' || v === 'pendiente') return 'Procesando'
  if (v === 'enviado') return 'Enviado'
  if (v === 'error') return 'Error MH'
  return estado || ''
}
const mhEstadoChip = (estado?: string | null) => {
  const v = String(estado || '').toLowerCase().trim()
  if (v === 'aceptado') return 'green'
  if (v === 'rechazado' || v === 'error') return 'orange'
  if (v === 'procesando' || v === 'pendiente' || v === 'enviado') return 'blue'
  return 'gray'
}
const docEstadoLabel = (estado?: string | null) => {
  const v = String(estado || '').toLowerCase().trim()
  if (v === 'borrador') return 'Borrador'
  if (v === 'confirmado') return 'Confirmado'
  return estado || ''
}
const todayISO = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function inferTipoIdentificacion(identificacion: string) {
  const digits = (identificacion || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 9) return '02'
  if (digits.length === 10) return '03'
  if (digits.length === 11 || digits.length === 12) return '01'
  return ''
}

function parseBitacoraActividades(row?: Partial<ReceptorBitacoraOpt> | null): ActividadMh[] {
  const raw = Array.isArray((row as any)?.payload_json?.actividades) ? (row as any).payload_json.actividades : []
  const fromPayload = raw
    .map((item: any) => ({ codigo: String(item?.codigo || '').trim(), descripcion: String(item?.descripcion || '').trim() }))
    .filter((item: ActividadMh) => item.codigo || item.descripcion)
  const fallback = row?.actividad_codigo
    ? [{ codigo: String(row.actividad_codigo || '').trim(), descripcion: String(row.actividad_descripcion || '').trim() }]
    : []
  const merged = [...fromPayload, ...fallback]
  return merged.filter((item, index, arr) => arr.findIndex((x) => x.codigo === item.codigo && x.descripcion === item.descripcion) === index)
}

function mapPaymentToMedioPago(paymentType: string | null, fallback: string) {
  const key = String(paymentType || '').toUpperCase()
  if (key === 'CARD') return '02'
  if (key === 'CREDIT' || key === 'FLEET') return '99'
  if (key === 'CASH') return '01'
  return fallback || '01'
}

function mapPaymentToCondicion(paymentType: string | null, fallback: string) {
  const key = String(paymentType || '').toUpperCase()
  if (key === 'CREDIT' || key === 'FLEET') return '02'
  return fallback || '01'
}

function buildDraftFromVenta(venta: VentaPendiente, config: ConfigFe, clientes: ClienteOpt[]): DraftFactura {
  const ident = (venta.customer_tax_id || '').trim()
  const cliente = ident ? clientes.find((item) => (item.identificacion || '').replace(/\D/g, '') === ident.replace(/\D/g, '')) : null
  const receptorNombre = cliente?.razon_social || venta.customer_name || 'Consumidor final'
  const receptorIdentificacion = cliente?.identificacion || ident
  const tipoDocumento = receptorIdentificacion ? '01' : '04'
  const condicionVenta = mapPaymentToCondicion(venta.payment_type, config.condicion_venta_defecto)
  const medioPago = mapPaymentToMedioPago(venta.payment_type, config.medio_pago_defecto)
  return {
    tipoDocumento,
    terceroId: cliente?.id || null,
    codigoCliente: cliente?.codigo || '',
    buscarCliente: '',
    receptorTipoIdentificacion: inferTipoIdentificacion(receptorIdentificacion),
    receptorIdentificacion,
    receptorNombre,
    receptorEmail: cliente?.email || '',
    receptorTelefono: '',
    receptorDireccion: '',
    receptorActividadCodigo: '',
    receptorActividadDescripcion: '',
    medioPago,
    liquidacionPagos: condicionVenta === '02' ? [] : [createLiquidacionPago(medioPago, Number(venta.money || 0))],
    condicionVenta,
    plazoCreditoDias: cliente?.credito_habilitado ? Number(cliente.dias_credito || 0) : (condicionVenta === '02' ? Number(config.plazo_credito_dias || 0) : 0),
    observacion: `Venta combustible TIQ#${venta.sale_id} · ${venta.combustible} · ${qty(venta.volume)} L · ${venta.bomba}`,
  }
}

// Hook: WebSocket Fusion (mismo patrón que DashboardCombustible)
function useFusionWS(empresaId: number, onMessage: (event: string, data: unknown) => void) {
  const ws = useRef<WebSocket | null>(null)
  useEffect(() => {
    let disposed = false
    let retry = 0
    const resolveWsUrl = async () => {
      const apiBase = process.env.REACT_APP_API_URL
      if (apiBase) return apiBase.replace(/^http/, 'ws') + '/ws/combustible'
      try {
        const resp = await fetch('/api/runtime')
        const body = await resp.json() as { port?: number }
        if (body?.port) {
          return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:${body.port}/ws/combustible`
        }
      } catch {}
      return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/combustible`
    }
    const connect = async () => {
      const wsUrl = await resolveWsUrl()
      if (disposed) return
      ws.current = new WebSocket(wsUrl)
      ws.current.onmessage = (e) => {
        try {
          const { empresa_id, event, data } = JSON.parse(e.data)
          if (empresa_id !== null && empresa_id !== undefined && empresa_id !== empresaId) return
          onMessage(event, data)
        } catch {}
      }
      ws.current.onopen = () => { retry = 0 }
      ws.current.onclose = () => {
        if (disposed) return
        const wait = Math.min(3000 + retry * 1000, 10000)
        retry += 1
        setTimeout(() => { void connect() }, wait)
      }
    }
    void connect()
    return () => {
      disposed = true
      ws.current?.close()
    }
  }, [empresaId]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Helper: llamadas autenticadas al servidor Node
async function apiFusion<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(path, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Error ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

function parseMhPayload(data: any): any {
  if (!data) return null
  if (typeof data !== 'string') return data
  const raw = data.trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string' && parsed !== raw) return parseMhPayload(parsed)
    return parsed
  } catch {
    return data
  }
}

function decodeBase64Utf8(value: string): string {
  try {
    const binary = window.atob(value)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

function extractMhXmlMessage(input: any): string {
  const data = parseMhPayload(input)
  if (!data || typeof data === 'string') return ''
  const base64 = [
    data?.['respuesta-xml'],
    data?.respuesta_xml,
    data?.respuestaXml,
    data?.respuesta?.['respuesta-xml'],
    data?.respuesta?.respuesta_xml,
    data?.respuesta?.respuestaXml,
  ].find((v) => typeof v === 'string' && v.trim())
  if (!base64) return ''
  const xmlText = decodeBase64Utf8(String(base64).trim())
  if (!xmlText) return ''
  try {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml')
    const getText = (tag: string) => xml.getElementsByTagName(tag)?.[0]?.textContent?.trim() || ''
    const estado = getText('EstadoMensaje')
    const detalle = getText('DetalleMensaje')
    return [estado ? `Estado: ${estado}` : '', detalle].filter(Boolean).join('\n')
  } catch {
    return xmlText
  }
}

function extractMhMessage(input: any): string {
  const xmlMsg = extractMhXmlMessage(input)
  if (xmlMsg) return xmlMsg
  const data = parseMhPayload(input)
  if (!data) return 'Sin detalle devuelto por Hacienda.'
  if (typeof data === 'string') return data
  const direct = [
    data?.detalle_mensaje,
    data?.detalleMensaje,
    data?.detalle,
    data?.mensaje,
    data?.message,
    data?.error?.message,
    data?.respuesta?.detalle_mensaje,
    data?.respuesta?.detalleMensaje,
    data?.respuesta?.detalle,
    data?.respuesta?.mensaje,
    data?.respuesta?.message,
  ].find((v) => typeof v === 'string' && v.trim())
  return direct ? String(direct).trim() : 'Hacienda no devolvio un mensaje legible.'
}

function extractSaleIdsFromDraftDoc(doc: Pick<DocumentoRow, 'sale_id_fusion'>, lineas: DocumentoLineaRow[]) {
  const saleIds = new Set<number>()
  if (Number(doc.sale_id_fusion) > 0) saleIds.add(Number(doc.sale_id_fusion))
  lineas.forEach((linea) => {
    const match = String(linea.codigo_interno || '').match(/^COMB-(\d+)$/)
    if (match) saleIds.add(Number(match[1]))
  })
  return Array.from(saleIds)
}

export default function FacturacionCombustiblePage({ empresaId }: Props) {
  const [view, setView]                   = useState<'bandeja' | 'borrador'>('bandeja')
  const [loading, setLoading]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')
  const [ok, setOk]                       = useState('')
  const fecha                             = todayISO()
  const turnos: TurnoFusion[]             = []
  const turnoId: number | null            = null
  const turnosLoading                     = false
  const setFecha                          = (_value: string) => {}
  const setTurnoId                        = (_value: number | null) => {}
  const setTurnos                         = (_value: TurnoFusion[]) => {}
  const setTurnosLoading                  = (_value: boolean) => {}

  // Mapas de maestros (refs para acceso en WS handler sin stale closure)
  const dispensadoresMapRef  = useRef<Record<number, string>>({})
  const gradosMapRef         = useRef<Record<number, string>>({})
  const gradosCabysMapRef    = useRef<Record<number, string>>({})
  const gradosTarifaPctMapRef  = useRef<Record<number, number>>({})
  const gradosTarifaCodMapRef  = useRef<Record<number, string>>({})

  // Ventas directas desde Fusion PG
  const [ventas, setVentas]               = useState<VentaPendiente[]>([])
  const [facturadas, setFacturadas]       = useState<Set<number>>(new Set())
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null)
  const [draft, setDraft]                 = useState<DraftFactura | null>(null)
  const [editingDocId, setEditingDocId]   = useState<number | null>(null)
  const [busyDocId, setBusyDocId]         = useState<number | null>(null)
  const [previewDocId, setPreviewDocId]   = useState<number | null>(null)
  const [empresaTimeZone, setEmpresaTimeZone] = useState(() => resolveCompanyTimeZone(null))

  // Datos de Supabase (maestros y FE)
  const [clientes, setClientes]           = useState<ClienteOpt[]>([])
  const [config, setConfig]               = useState<ConfigFe>({
    sucursal: '001', punto_venta: '00001',
    condicion_venta_defecto: '01', medio_pago_defecto: '01', plazo_credito_dias: 0,
  })
  const [docs, setDocs]                   = useState<DocumentoRow[]>([])
  const [mhDetalleDocId, setMhDetalleDocId] = useState<number | null>(null)
  const [mhDetalleCache, setMhDetalleCache] = useState<Record<number, any>>({})
  const [docFeedback, setDocFeedback]     = useState<{ docId: number; kind: 'ok' | 'error'; message: string } | null>(null)
  const [receptorActividades, setReceptorActividades] = useState<ActividadMh[]>([])
  const [clienteModalOpen, setClienteModalOpen] = useState(false)
  const [bitacoraModalOpen, setBitacoraModalOpen] = useState(false)
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<DocumentoRow | null>(null)
  const [bitacoraSearch, setBitacoraSearch] = useState('')
  const [bitacoraRows, setBitacoraRows]   = useState<ReceptorBitacoraOpt[]>([])
  const [bitacoraLoading, setBitacoraLoading] = useState(false)
  const estadoMhBloqueaEmision = (estado?: string | null) => ['pendiente', 'enviado', 'aceptado', 'rechazado'].includes(String(estado || '').toLowerCase())
  const canEliminarDocumento = (doc: DocumentoRow) => {
    const estado = String(doc.estado || '').toLowerCase().trim()
    const estadoMh = String(doc.estado_mh || '').toLowerCase().trim()
    return estado === 'borrador' || estadoMh === 'error' || estadoMh === 'rechazado'
  }
  const showDocFeedback = (docId: number, kind: 'ok' | 'error', message: string) => setDocFeedback({ docId, kind, message })

  // Agrupación de ventas para una sola FE
  const [marcadas, setMarcadas]           = useState<Set<number>>(new Set())
  const toggleMarcada = (saleId: number) =>
    setMarcadas(prev => { const n = new Set(prev); n.has(saleId) ? n.delete(saleId) : n.add(saleId); return n })

  // Filtros y paginación
  const [search, setSearch]               = useState('')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [onlyIdentified, setOnlyIdentified] = useState(false)
  const [paginaVentas, setPaginaVentas]   = useState(0)
  const VENTAS_POR_PAGINA = 12
  useEffect(() => {
    void fetchEmpresaTimeZone(empresaId).then(setEmpresaTimeZone)
  }, [empresaId])

  const dateTime = (iso: string | null) => formatCompanyDateTime(iso, empresaTimeZone)

  // Carga inicial: maestros de Supabase
  const loadMaestros = useCallback(async () => {
    const [clientesRes, cliParamRes, carteraRes, configRes, docsRes] = await Promise.all([
      supabase.from('vw_terceros_catalogo').select('id, codigo, razon_social, identificacion, email').eq('empresa_id', empresaId).eq('es_cliente', true).order('razon_social'),
      supabase.from('vw_tercero_cliente_parametros').select('tercero_id, limite_credito, dias_credito, condicion_pago'),
      supabase.rpc('get_cxc_cartera_resumen', { p_empresa_id: empresaId, p_fecha_corte: new Date().toISOString().slice(0, 10), p_moneda: null }),
      supabase.from('fe_config_empresa').select('sucursal, punto_venta, condicion_venta_defecto, medio_pago_defecto, plazo_credito_dias, tipo_documento_defecto').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('fe_documentos').select('id, estado, estado_mh, tipo_documento, fecha_emision, numero_consecutivo, clave_mh, total_comprobante, observacion, sale_id_fusion, receptor_identificacion, receptor_nombre, receptor_email, respuesta_mh_json').eq('empresa_id', empresaId).eq('origen', 'pos').order('id', { ascending: false }).limit(30),
    ])
    if (clientesRes.error) throw clientesRes.error
    if (docsRes.error) throw docsRes.error

    const cliParamsMap = new Map<number, any>()
    ;((cliParamRes.data || []) as any[]).forEach((row) => cliParamsMap.set(Number(row.tercero_id || 0), row))

    const vencidoMap = new Map<number, number>()
    ;((carteraRes.data || []) as any[]).forEach((row) => {
      const terceroId = Number(row.tercero_id || 0)
      const vencido = Number(row.d01_30 || 0) + Number(row.d31_60 || 0) + Number(row.d61_90 || 0) + Number(row.d91_mas || 0)
      vencidoMap.set(terceroId, Number(vencidoMap.get(terceroId) || 0) + vencido)
    })

    const clientesCredito = ((clientesRes.data || []) as any[]).map((row) => {
      const param = cliParamsMap.get(Number(row.id)) || {}
      const diasCredito = Number(param.dias_credito || 0)
      const limiteCredito = Number(param.limite_credito || 0)
      const condicionPago = String(param.condicion_pago || '').trim()
      const creditoBase = diasCredito > 0 || limiteCredito > 0 || condicionPago !== ''
      const montoVencido = Number(vencidoMap.get(Number(row.id)) || 0)
      const creditoBloqueado = (diasCredito <= 0 || limiteCredito <= 0) && montoVencido > 0
      return {
        ...row,
        dias_credito: diasCredito,
        limite_credito: limiteCredito,
        condicion_pago: condicionPago,
        credito_habilitado: creditoBase && !creditoBloqueado,
        credito_bloqueado: creditoBloqueado,
        monto_vencido: montoVencido,
      } as ClienteOpt
    })

    setClientes(clientesCredito)
    setDocs((docsRes.data || []) as DocumentoRow[])
    if (configRes.data) {
      const c = configRes.data as any
      setConfig({ sucursal: c.sucursal || '001', punto_venta: c.punto_venta || '00001', condicion_venta_defecto: c.condicion_venta_defecto || '01', medio_pago_defecto: c.medio_pago_defecto || '01', plazo_credito_dias: Number(c.plazo_credito_dias || 0), tipo_documento_defecto: c.tipo_documento_defecto || '01' })
    }
  }, [empresaId])

  const loadFacturadas = useCallback(async (saleIds: number[]) => {
    if (!saleIds.length) {
      setFacturadas(new Set())
      return
    }

    const normalizedSaleIds = Array.from(new Set(saleIds)).filter((id) => Number.isFinite(id) && id > 0)
    const codigosInternos = normalizedSaleIds.map((id) => `COMB-${id}`)

    const { data: docsAll, error: docsAllErr } = await supabase
      .from('fe_documentos')
      .select('id, sale_id_fusion, estado_mh')
      .eq('empresa_id', empresaId)
      .eq('origen', 'pos')

    if (docsAllErr) throw docsAllErr

    const docsPos = ((docsAll || []) as Array<{ id: number; sale_id_fusion: number | null; estado_mh?: string | null }>)
      .filter((d) => estadoMhBloqueaEmision(d.estado_mh))
    const facturadasSet = new Set<number>(
      docsPos
        .map((d) => Number(d.sale_id_fusion))
        .filter((id) => normalizedSaleIds.includes(id))
    )

    const documentoIds = docsPos.map((d) => Number(d.id)).filter(Boolean)
    if (!documentoIds.length) {
      setFacturadas(facturadasSet)
      return
    }

    const { data: lineas, error: lineasErr } = await supabase
      .from('fe_documento_lineas')
      .select('documento_id, codigo_interno')
      .in('documento_id', documentoIds)
      .in('codigo_interno', codigosInternos)

    if (lineasErr) throw lineasErr

    const documentoIdsVigentes = new Set(docsPos.map((d) => Number(d.id)).filter(Boolean))

    ;((lineas || []) as DocumentoLineaRow[]).forEach((linea) => {
      if (!documentoIdsVigentes.has(Number(linea.documento_id))) return
      const match = String(linea.codigo_interno || '').match(/^COMB-(\d+)$/)
      if (match) facturadasSet.add(Number(match[1]))
    })

    setFacturadas(facturadasSet)
  }, [empresaId])

  // Carga de turnos desde Fusion PG
  const loadTurnos = useCallback(async (f: string) => {
    setError('')
    try {
      // Intentar con la fecha exacta; si no hay resultados, cargar los últimos 10 recientes
      let usedFallback = false
      let data = await apiFusion<TurnoFusion[]>(`/api/fusion/turnos?empresa_id=${empresaId}&fecha=${f}`)
      if (data.length === 0) {
        usedFallback = true
        data = await apiFusion<TurnoFusion[]>(`/api/fusion/turnos?empresa_id=${empresaId}`)
      }
      setTurnos(data)
      if (usedFallback) {
        setOk('No hubo turnos para la fecha exacta; se cargo el turno mas reciente disponible de Fusion.')
      }
      // Seleccionar el primero abierto, o el primero disponible
      const abierto = data.find(t => t.period_status === 'O')
      setTurnoId((abierto ?? data[0])?.period_id ?? null)
    } catch (e: any) {
      setError(String(e?.message || 'No se pudieron cargar los turnos de Fusion.'))
      setTurnos([])
      setTurnoId(null)
    } finally {
      setTurnosLoading(false)
    }
  }, [empresaId])

  // Carga de ventas desde Fusion PG
  const loadVentas = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const ventasFusion = await apiFusion<VentaFusion[]>(`/api/fusion/ventas?empresa_id=${empresaId}`)
      const [dispensadoresRes, gradosRes] = await Promise.allSettled([
        supabase.from('dispensadores').select('pump_id, descripcion').eq('empresa_id', empresaId),
        supabase.from('grados_combustible').select('grade_id, nombre, codigo_cabys, tarifa_iva_porcentaje, tarifa_iva_codigo').eq('empresa_id', empresaId),
      ])

      const dispensadoresData = dispensadoresRes.status === 'fulfilled' ? ((dispensadoresRes.value.data || []) as any[]) : []
      const gradosData = gradosRes.status === 'fulfilled' ? ((gradosRes.value.data || []) as GradoCombustibleRow[]) : []

      const dispensadoresMap = Object.fromEntries(dispensadoresData.map((r) => [Number(r.pump_id), r.descripcion || `Bomba ${r.pump_id}`]))
      const gradosMap = Object.fromEntries(gradosData.map((r) => [Number(r.grade_id), r.nombre || `Grade ${r.grade_id}`]))
      const gradosCabysMap    = Object.fromEntries(gradosData.map((r) => [Number(r.grade_id), String(r.codigo_cabys || '').trim()]))
      const gradosTarifaPctMap = Object.fromEntries(gradosData.map((r) => [Number(r.grade_id), Number(r.tarifa_iva_porcentaje ?? 0)]))
      const gradosTarifaCodMap = Object.fromEntries(gradosData.map((r) => [Number(r.grade_id), String(r.tarifa_iva_codigo || '01')]))
      dispensadoresMapRef.current  = dispensadoresMap
      gradosMapRef.current         = gradosMap
      gradosCabysMapRef.current    = gradosCabysMap
      gradosTarifaPctMapRef.current = gradosTarifaPctMap
      gradosTarifaCodMapRef.current = gradosTarifaCodMap

      const enriquecidas: VentaPendiente[] = ventasFusion.map((v) => ({
        ...v,
        bomba:               dispensadoresMap[v.pump_id] || `Bomba ${v.pump_id}`,
        combustible:         gradosMap[v.grade_id]       || `Grade ${v.grade_id}`,
        cabys:               gradosCabysMap[v.grade_id]  || null,
        tarifa_iva_porcentaje: gradosTarifaPctMap[v.grade_id] ?? 0,
        tarifa_iva_codigo:   gradosTarifaCodMap[v.grade_id]  || '01',
      }))

      setVentas(enriquecidas)
      await loadFacturadas(enriquecidas.map((v) => v.sale_id))
      setSelectedSaleId((prev) => (prev && enriquecidas.some((v) => v.sale_id === prev) ? prev : enriquecidas[0]?.sale_id ?? null))
    } catch (e: any) {
      setError(String(e?.message || 'No se pudieron cargar las ventas de Fusion.'))
    } finally {
      setLoading(false)
    }
  }, [empresaId, loadFacturadas])

  const mergeVentas = useCallback((ventasFusion: VentaFusion[]) => {
    if (!ventasFusion.length) return
    setVentas((prev) => {
      const merged = new Map<number, VentaPendiente>()
      prev.forEach((venta) => merged.set(venta.sale_id, venta))
      ventasFusion.forEach((venta) => {
        merged.set(venta.sale_id, {
          ...venta,
          bomba:               dispensadoresMapRef.current[venta.pump_id]  || `Bomba ${venta.pump_id}`,
          combustible:         gradosMapRef.current[venta.grade_id]        || `Grade ${venta.grade_id}`,
          cabys:               gradosCabysMapRef.current[venta.grade_id]   || null,
          tarifa_iva_porcentaje: gradosTarifaPctMapRef.current[venta.grade_id] ?? 0,
          tarifa_iva_codigo:   gradosTarifaCodMapRef.current[venta.grade_id] || '01',
        })
      })
      return Array.from(merged.values()).sort((a, b) => b.sale_id - a.sale_id)
    })
  }, [])

  // Efectos
  useEffect(() => {
    void loadMaestros()
  }, [loadMaestros])

  useEffect(() => {
    void loadTurnos(todayISO())
  }, [loadTurnos])

  useEffect(() => {
    if (view === 'borrador') return
    void loadVentas()
  }, [loadVentas, view])

  // WebSocket: nuevas ventas en tiempo real
  useFusionWS(empresaId, (event, data) => {
    if (event !== 'nueva_venta') return
    if (view === 'borrador') return
    const ws = data as { sale_id: number }
    if (!ws?.sale_id) return
    void loadVentas().catch(() => {})
  })

  useEffect(() => {
    if (editingDocId) return
    if (!selectedSaleId) { setDraft(null); return }
    const venta = ventas.find((v) => v.sale_id === selectedSaleId)
    setDraft(venta ? buildDraftFromVenta(venta, config, clientes) : null)
  }, [selectedSaleId, ventas, config, clientes, editingDocId])

  useEffect(() => {
    if (!draft) return
    const code = draft.codigoCliente.trim().toLowerCase()
    if (!code || draft.terceroId) return
    const exact = clientes.find((cliente) => Boolean(cliente.credito_habilitado) && String(cliente.codigo || '').toLowerCase() === code) || null
    if (!exact) return
    setDraft((prev) => prev ? {
      ...prev,
      terceroId: exact.id,
      receptorEmail: exact.email || '',
      plazoCreditoDias: Number(exact.dias_credito || 0),
    } : prev)
  }, [draft, clientes])

  // Filtros y paginación
  const ventaSeleccionada = ventas.find((v) => v.sale_id === selectedSaleId) ?? null
  const selectedCliente = draft?.terceroId ? clientes.find((cliente) => cliente.id === draft.terceroId) || null : null
  const selectedClienteId = selectedCliente?.id ?? null
  const selectedClienteDiasCredito = selectedCliente ? Number(selectedCliente.dias_credito || 0) : 0
  const clientesCredito = clientes.filter((cliente) => Boolean(cliente.credito_habilitado))
  const flujoReceptor = !draft
    ? 'consumidor_final'
    : selectedCliente
      ? 'credito'
      : (draft.receptorIdentificacion.trim() || draft.receptorNombre.trim() || draft.receptorEmail.trim() || draft.receptorTelefono.trim() || draft.receptorDireccion.trim())
        ? 'contado'
        : 'consumidor_final'
  const consumidorFinal = flujoReceptor === 'consumidor_final'
  const receptorIdentificado = selectedCliente ? true : Boolean(draft?.receptorIdentificacion.trim() && draft?.receptorNombre.trim())
  const tipoDocumentoAuto = selectedCliente
    ? '01'
    : consumidorFinal
      ? '04'
      : (draft?.receptorIdentificacion.trim() ? '01' : '04')
  const clienteRequerido = tipoDocumentoAuto === '01'
  const clienteListo = tipoDocumentoAuto === '04' ? true : receptorIdentificado
  const clientesModalFiltrados = draft
    ? clientesCredito.filter((cliente) => {
        const query = draft.codigoCliente.trim().toLowerCase()
        if (!query) return true
        return String(cliente.codigo || '').toLowerCase().includes(query)
          || String(cliente.razon_social || '').toLowerCase().includes(query)
          || String(cliente.identificacion || '').toLowerCase().includes(query)
      })
    : clientesCredito
  const bitacoraFiltrada = bitacoraRows.filter((row) => {
    const query = String(bitacoraSearch || draft?.receptorIdentificacion || '').trim().toLowerCase()
    if (!query) return true
    return String(row.identificacion || '').toLowerCase().includes(query)
      || String(row.razon_social || '').toLowerCase().includes(query)
  })

  useEffect(() => {
    if (!draft) return
    const nextTipoDocumento = tipoDocumentoAuto
    const nextCondicion = selectedClienteId ? '02' : '01'
    const nextPlazo = selectedClienteDiasCredito
    if (
      draft.tipoDocumento === nextTipoDocumento &&
      draft.condicionVenta === nextCondicion &&
      draft.plazoCreditoDias === nextPlazo
    ) return
    setDraft((prev) => prev ? {
      ...prev,
      tipoDocumento: nextTipoDocumento,
      condicionVenta: nextCondicion,
      plazoCreditoDias: nextPlazo,
    } : prev)
  }, [draft, tipoDocumentoAuto, selectedClienteId, selectedClienteDiasCredito])

  useEffect(() => {
    if (selectedCliente) setReceptorActividades([])
  }, [selectedCliente])

  const ventasFiltradas = ventas.filter((v) => {
    if (facturadas.has(v.sale_id)) return false
    const text = `${v.sale_id} ${v.bomba} ${v.combustible} ${v.customer_name || ''} ${v.customer_tax_id || ''} ${v.attendant_id || ''}`.toLowerCase()
    const matchesSearch  = !search.trim() || text.includes(search.trim().toLowerCase())
    const matchesPayment = paymentFilter === 'all' || String(v.payment_type || 'SIN INFO').toUpperCase() === paymentFilter
    const matchesIdent   = !onlyIdentified || !!v.customer_tax_id
    return matchesSearch && matchesPayment && matchesIdent
  })

  const ventasOrdenadas  = [...ventasFiltradas].sort((a, b) => b.sale_id - a.sale_id)
  const totalPaginas     = Math.ceil(ventasOrdenadas.length / VENTAS_POR_PAGINA)
  const ventasPagina     = ventasOrdenadas.slice(paginaVentas * VENTAS_POR_PAGINA, (paginaVentas + 1) * VENTAS_POR_PAGINA)
  const totalMonto       = ventasFiltradas.reduce((s, v) => s + v.money,  0)
  const totalLitros      = ventasFiltradas.reduce((s, v) => s + v.volume, 0)
  const paymentOptions   = ['all', ...Array.from(new Set(ventas.filter((v) => !facturadas.has(v.sale_id)).map((v) => String(v.payment_type || 'SIN INFO').toUpperCase())))]

  // Ventas a incluir en la FE: grupo si hay marcadas, o la seleccionada individualmente
  const ventasAFacturar  = marcadas.size > 0
    ? ventas.filter(v => marcadas.has(v.sale_id))
    : ventaSeleccionada ? [ventaSeleccionada] : []
  const totalAFacturar   = ventasAFacturar.reduce((s, v) => s + v.money,  0)
  const volumenAFacturar = ventasAFacturar.reduce((s, v) => s + v.volume, 0)
  const liquidacionPagoTotal = liquidacionTotal(draft?.liquidacionPagos || [])
  const medioPagoPrincipalDraft = draft ? medioPagoPrincipal(draft.liquidacionPagos, draft.condicionVenta, draft.medioPago || config.medio_pago_defecto || '01') : (config.medio_pago_defecto || '01')
  const tituloPreview = marcadas.size > 1
    ? `Grupo de ${marcadas.size} ventas listo para borrador`
    : ventaSeleccionada
      ? `Resumen del borrador para TIQ#${ventaSeleccionada.sale_id}`
      : 'Selecciona una venta para revisar su factura propuesta.'

    const setFiltro = (fn: () => void) => { fn(); setPaginaVentas(0) }

    const updateDraftPago = (id: string, patch: Partial<LiquidacionPagoRow>) => {
      setDraft((prev) => prev ? {
        ...prev,
        liquidacionPagos: prev.liquidacionPagos.map((row) => row.id === id ? { ...row, ...patch } : row),
      } : prev)
    }

    const addDraftPago = () => {
      setDraft((prev) => prev ? {
        ...prev,
        liquidacionPagos: [...prev.liquidacionPagos, createLiquidacionPago(config.medio_pago_defecto || '01', 0)],
      } : prev)
    }

    const removeDraftPago = (id: string) => {
      setDraft((prev) => prev ? {
        ...prev,
        liquidacionPagos: prev.liquidacionPagos.length > 1 ? prev.liquidacionPagos.filter((row) => row.id !== id) : prev.liquidacionPagos,
      } : prev)
    }

    useEffect(() => {
      setDraft((prev) => {
        if (!prev) return prev
        if (prev.condicionVenta === '02') {
          return prev.liquidacionPagos.length ? { ...prev, liquidacionPagos: [] } : prev
        }
        if (!prev.liquidacionPagos.length) {
          return { ...prev, liquidacionPagos: [createLiquidacionPago(prev.medioPago || config.medio_pago_defecto || '01', totalAFacturar)] }
        }
        if (prev.liquidacionPagos.length === 1) {
          return {
            ...prev,
            liquidacionPagos: [{ ...prev.liquidacionPagos[0], monto: totalAFacturar, tipoMedioPago: prev.liquidacionPagos[0].tipoMedioPago || prev.medioPago || config.medio_pago_defecto || '01' }],
          }
        }
        return prev
      })
    }, [totalAFacturar, config.medio_pago_defecto])
  const abrirVistaBorrador = () => {
    if (!ventasAFacturar.length || !draft) return
    setView('borrador')
  }
  const volverABandeja = () => setView('bandeja')
  const iniciarNuevoBorrador = () => setEditingDocId(null)

  // Guardar borrador en Supabase (solo FE)
  const cargarBitacoraReceptor = async (identificacionRaw?: string) => {
    const identificacion = String(identificacionRaw || draft?.receptorIdentificacion || '').trim()
    if (!identificacion || !draft) return false
    const { data, error: bitErr } = await supabase
      .from('fe_receptores_bitacora')
      .select('tipo_identificacion, identificacion, razon_social, email, telefono, direccion, actividad_codigo, actividad_descripcion, payload_json')
      .eq('empresa_id', empresaId)
      .eq('identificacion', identificacion)
      .maybeSingle()
    if (bitErr) throw bitErr
    if (!data) return false
    setDraft((prev) => prev ? {
      ...prev,
      receptorTipoIdentificacion: String((data as any).tipo_identificacion || prev.receptorTipoIdentificacion || inferTipoIdentificacion(identificacion)),
      receptorIdentificacion: String((data as any).identificacion || identificacion),
      receptorNombre: String((data as any).razon_social || prev.receptorNombre || ''),
      receptorEmail: String((data as any).email || prev.receptorEmail || ''),
      receptorTelefono: String((data as any).telefono || prev.receptorTelefono || ''),
      receptorDireccion: String((data as any).direccion || prev.receptorDireccion || ''),
      receptorActividadCodigo: String((data as any).actividad_codigo || prev.receptorActividadCodigo || ''),
      receptorActividadDescripcion: String((data as any).actividad_descripcion || prev.receptorActividadDescripcion || ''),
    } : prev)
    setReceptorActividades(parseBitacoraActividades(data as any))
    return true
  }

  const consultarMhReceptor = async () => {
    const identificacion = String(draft?.receptorIdentificacion || '').trim()
    if (!identificacion || !draft) {
      setError('Digite una cedula para consultar el receptor.')
      return
    }
    setSaving(true)
    setError('')
    setOk('')
    try {
      const existe = await cargarBitacoraReceptor(identificacion)
      if (existe) {
        setOk('Receptor cargado desde la bitacora fiscal.')
        return
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.')
      const { data: payload, error: fnError } = await supabase.functions.invoke('mh-contribuyente', {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        body: { cedula: identificacion },
      })
      if (fnError) throw fnError
      const result = (payload || {}) as any
      if (!result?.ok) throw new Error(String(result?.detail || result?.error || 'No se pudo consultar MH.'))
      const actividades = Array.isArray(result.actividades) ? (result.actividades as ActividadMh[]) : []
      setReceptorActividades(actividades)
      setDraft((prev) => prev ? {
        ...prev,
        receptorTipoIdentificacion: String(result.tipo_identificacion || prev.receptorTipoIdentificacion || inferTipoIdentificacion(identificacion)),
        receptorIdentificacion: String(result.cedula || identificacion),
        receptorNombre: String(result.nombre || prev.receptorNombre || ''),
        receptorActividadCodigo: String(actividades[0]?.codigo || prev.receptorActividadCodigo || ''),
        receptorActividadDescripcion: String(actividades[0]?.descripcion || prev.receptorActividadDescripcion || ''),
      } : prev)
      setOk('Datos del receptor consultados en MH. Complete correo, telefono y direccion si hace falta.')
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo consultar MH para el receptor.'))
    } finally {
      setSaving(false)
    }
  }

  const abrirBitacoraModal = async () => {
    setBitacoraLoading(true)
    setError('')
    try {
      setBitacoraSearch(String(draft?.receptorIdentificacion || '').trim())
      const { data, error: bitErr } = await supabase
        .from('fe_receptores_bitacora')
        .select('tipo_identificacion, identificacion, razon_social, email, telefono, direccion, actividad_codigo, actividad_descripcion, payload_json')
        .eq('empresa_id', empresaId)
        .order('updated_at', { ascending: false })
        .limit(50)
      if (bitErr) throw bitErr
      setBitacoraRows((data || []) as ReceptorBitacoraOpt[])
      setBitacoraModalOpen(true)
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo abrir la bitacora fiscal.'))
    } finally {
      setBitacoraLoading(false)
    }
  }

  const aplicarClienteCredito = (cliente: ClienteOpt | null) => {
    if (!cliente) return
    setClienteModalOpen(false)
    setReceptorActividades([])
    setDraft((prev) => prev ? {
      ...prev,
      terceroId: cliente.id,
      codigoCliente: cliente.codigo || prev.codigoCliente,
      buscarCliente: '',
      receptorTipoIdentificacion: '',
      receptorIdentificacion: '',
      receptorNombre: '',
      receptorEmail: cliente.email || '',
      receptorTelefono: '',
      receptorDireccion: '',
      receptorActividadCodigo: '',
      receptorActividadDescripcion: '',
    } : prev)
  }

  const aplicarBitacoraReceptor = (row: ReceptorBitacoraOpt) => {
    setBitacoraModalOpen(false)
    setReceptorActividades(parseBitacoraActividades(row))
    setDraft((prev) => prev ? {
      ...prev,
      terceroId: null,
      receptorTipoIdentificacion: String(row.tipo_identificacion || inferTipoIdentificacion(row.identificacion || '')),
      receptorIdentificacion: String(row.identificacion || ''),
      receptorNombre: String(row.razon_social || ''),
      receptorEmail: String(row.email || ''),
      receptorTelefono: String(row.telefono || ''),
      receptorDireccion: String(row.direccion || ''),
      receptorActividadCodigo: String(row.actividad_codigo || ''),
      receptorActividadDescripcion: String(row.actividad_descripcion || ''),
    } : prev)
  }

  const persistBitacoraReceptor = async () => {
    if (!draft) return null
    const ident  = draft.receptorIdentificacion.trim()
    const nombre = draft.receptorNombre.trim()
    if (!ident || !nombre || selectedCliente || tipoDocumentoAuto === '04') return null
    const { data, error: bErr } = await supabase
      .from('fe_receptores_bitacora')
      .upsert({
        empresa_id: empresaId,
        tipo_identificacion: draft.receptorTipoIdentificacion || null,
        identificacion: ident,
        razon_social: nombre,
        actividad_codigo: draft.receptorActividadCodigo.trim() || null,
        actividad_descripcion: draft.receptorActividadDescripcion.trim() || null,
        email: draft.receptorEmail.trim() || null,
        telefono: draft.receptorTelefono.trim() || null,
        direccion: draft.receptorDireccion.trim() || null,
        origen_mh: receptorActividades.length > 0,
        payload_json: receptorActividades.length ? { actividades: receptorActividades } : null,
      }, { onConflict: 'empresa_id,identificacion' })
      .select('id').single()
    if (bErr) throw bErr
    return Number((data as any)?.id || 0) || null
  }

  const abrirBorradorReciente = async (docId: number) => {
    setBusyDocId(docId)
    setDocFeedback(null)
    setError('')
    setOk('')
    try {
      const [{ data: doc, error: docErr }, { data: lineas, error: lineasErr }] = await Promise.all([
        supabase
          .from('fe_documentos')
          .select('id, estado, tipo_documento, fecha_emision, numero_consecutivo, total_comprobante, observacion, sale_id_fusion, tercero_id, receptor_tipo_identificacion, receptor_identificacion, receptor_nombre, receptor_email, receptor_telefono, receptor_direccion, receptor_actividad_codigo, receptor_actividad_descripcion, medio_pago, liquidacion_pago_json, condicion_venta, plazo_credito_dias')
          .eq('empresa_id', empresaId)
          .eq('id', docId)
          .single(),
        supabase
          .from('fe_documento_lineas')
          .select('linea, documento_id, codigo_interno, descripcion, cantidad, precio_unitario, total_linea, cabys')
          .eq('documento_id', docId)
          .order('linea'),
      ])

      if (docErr) throw docErr
      if (lineasErr) throw lineasErr

      const documento = doc as DocumentoDetalleRow
      const lineasDoc = (lineas || []) as DocumentoLineaRow[]
      const saleIds = extractSaleIdsFromDraftDoc(documento, lineasDoc)
      if (!saleIds.length) throw new Error('Este borrador no tiene lineas POS para reconstruir sus etiquetas.')

      const ventasById = new Map(ventas.map((venta) => [venta.sale_id, venta]))
      const faltantes = saleIds.filter((saleId) => !ventasById.has(saleId))
      if (faltantes.length) {
        const ventasFusion = await Promise.all(
          faltantes.map((saleId) => apiFusion<VentaFusion>(`/api/fusion/venta/${saleId}?empresa_id=${empresaId}`))
        )
        mergeVentas(ventasFusion)
        ventasFusion.forEach((venta) => {
          ventasById.set(venta.sale_id, {
            ...venta,
            bomba: dispensadoresMapRef.current[venta.pump_id] || `Bomba ${venta.pump_id}`,
            combustible: gradosMapRef.current[venta.grade_id] || `Grade ${venta.grade_id}`,
          })
        })
      }

      const lineasCabys = mergeCabysLineas(lineasDoc, Array.from(ventasById.values()))
      for (const item of lineasCabys) {
        const { error: updateErr } = await supabase
          .from('fe_documento_lineas')
          .update({ cabys: item.cabys })
          .eq('documento_id', docId)
          .eq('linea', item.linea)
        if (updateErr) throw updateErr
      }

      const primerSaleId = saleIds[0] || null
      const ventaBase = primerSaleId ? ventasById.get(primerSaleId) || null : null
      const draftBase = ventaBase
        ? buildDraftFromVenta(ventaBase, config, clientes)
        : {
            tipoDocumento: documento.tipo_documento || '04',
            terceroId: documento.tercero_id || null,
            codigoCliente: '',
            buscarCliente: '',
            receptorTipoIdentificacion: documento.receptor_tipo_identificacion || '',
            receptorIdentificacion: documento.receptor_identificacion || '',
            receptorNombre: documento.receptor_nombre || 'Consumidor final',
            receptorEmail: documento.receptor_email || '',
            receptorTelefono: documento.receptor_telefono || '',
            receptorDireccion: documento.receptor_direccion || '',
            receptorActividadCodigo: documento.receptor_actividad_codigo || '',
            receptorActividadDescripcion: documento.receptor_actividad_descripcion || '',
            medioPago: documento.medio_pago || config.medio_pago_defecto || '01',
            liquidacionPagos: hydrateLiquidacionPagos(documento.liquidacion_pago_json, documento.medio_pago || config.medio_pago_defecto || '01', Number(documento.total_comprobante || 0)),
            condicionVenta: documento.condicion_venta || config.condicion_venta_defecto || '01',
            plazoCreditoDias: Number(documento.plazo_credito_dias || 0),
            observacion: documento.observacion || '',
          }

      setEditingDocId(docId)
      setMarcadas(new Set(saleIds))
      setSelectedSaleId(primerSaleId)
      setDraft({
        ...draftBase,
        tipoDocumento: documento.tipo_documento || draftBase.tipoDocumento,
        terceroId: documento.tercero_id || draftBase.terceroId || null,
        codigoCliente: documento.tercero_id ? (clientes.find((cliente) => cliente.id === documento.tercero_id)?.codigo || draftBase.codigoCliente) : draftBase.codigoCliente,
        buscarCliente: '',
        receptorTipoIdentificacion: documento.receptor_tipo_identificacion || draftBase.receptorTipoIdentificacion,
        receptorIdentificacion: documento.receptor_identificacion || draftBase.receptorIdentificacion,
        receptorNombre: documento.receptor_nombre || draftBase.receptorNombre,
        receptorEmail: documento.receptor_email || draftBase.receptorEmail,
        receptorTelefono: documento.receptor_telefono || draftBase.receptorTelefono,
        receptorDireccion: documento.receptor_direccion || draftBase.receptorDireccion,
        receptorActividadCodigo: documento.receptor_actividad_codigo || draftBase.receptorActividadCodigo,
        receptorActividadDescripcion: documento.receptor_actividad_descripcion || draftBase.receptorActividadDescripcion,
        medioPago: documento.medio_pago || draftBase.medioPago,
        liquidacionPagos: hydrateLiquidacionPagos(documento.liquidacion_pago_json, documento.medio_pago || draftBase.medioPago, Number(documento.total_comprobante || totalAFacturar)),
        condicionVenta: documento.condicion_venta || draftBase.condicionVenta,
        plazoCreditoDias: Number(documento.plazo_credito_dias ?? draftBase.plazoCreditoDias ?? 0),
        observacion: documento.observacion || draftBase.observacion,
      })
      setView('borrador')
      setOk(`Borrador ${documento.numero_consecutivo || `#${docId}`} listo para continuar.`)
      showDocFeedback(docId, 'ok', `Borrador ${documento.numero_consecutivo || `#${docId}`} abierto correctamente.`)
    } catch (e: any) {
      const message = String(e?.message || 'No se pudo abrir el borrador reciente.')
      setError(message)
      showDocFeedback(docId, 'error', message)
    } finally {
      setBusyDocId(null)
    }
  }

  const eliminarBorradorReciente = async (doc: DocumentoRow) => {
    if (!canEliminarDocumento(doc)) {
      setError('Solo se pueden eliminar borradores o documentos con MH en error/rechazado.')
      return
    }
    setDeleteConfirmDoc(null)

    setBusyDocId(doc.id)
    setDocFeedback(null)
    setError('')
    setOk('')
    try {
      const { data: lineas, error: lineasErr } = await supabase
        .from('fe_documento_lineas')
        .select('documento_id, codigo_interno')
        .eq('documento_id', doc.id)
      if (lineasErr) throw lineasErr

      const saleIds = extractSaleIdsFromDraftDoc(doc, (lineas || []) as DocumentoLineaRow[])
      const { error: delLineasErr } = await supabase.from('fe_documento_lineas').delete().eq('documento_id', doc.id)
      if (delLineasErr) throw delLineasErr

      const { error: delDocErr } = await supabase.from('fe_documentos').delete().eq('empresa_id', empresaId).eq('id', doc.id)
      if (delDocErr) throw delDocErr

      if (editingDocId === doc.id) {
        setEditingDocId(null)
        setDraft(null)
        setMarcadas(new Set())
        setSelectedSaleId(null)
        setView('bandeja')
      }

      setDocs((prev) => prev.filter((item) => item.id !== doc.id))
      if (saleIds.length && ventas.length) {
        await loadFacturadas(ventas.map((venta) => venta.sale_id))
      }
      setOk(`Se elimino ${doc.numero_consecutivo || `el borrador #${doc.id}`}.`)
      showDocFeedback(doc.id, 'ok', `Se elimino ${doc.numero_consecutivo || `el borrador #${doc.id}`}.`)
    } catch (e: any) {
      const message = String(e?.message || 'No se pudo eliminar el borrador.')
      setError(message)
      showDocFeedback(doc.id, 'error', message)
    } finally {
      setBusyDocId(null)
    }
  }

  const solicitarEliminarBorradorReciente = (doc: DocumentoRow) => {
    if (!canEliminarDocumento(doc)) {
      setError('Solo se pueden eliminar borradores o documentos con MH en error/rechazado.')
      return
    }
    setDeleteConfirmDoc(doc)
  }

  const emitirDocumentoEnFirme = async (docId: number, estadoActual: string) => {
    if (estadoActual !== 'confirmado') {
      const { error: confirmErr } = await supabase
        .from('fe_documentos')
        .update({ estado: 'confirmado' })
        .eq('empresa_id', empresaId)
        .eq('id', docId)
      if (confirmErr) throw confirmErr
    }

    const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.')

    const resp = await fetch(`/api/facturacion/emitir/${docId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ empresa_id: empresaId }),
    })
    const raw = await resp.text()
    let json = {} as { ok?: boolean; error?: string; estado_mh?: string; clave?: string; consecutivo?: string; mh_data?: any }
    try {
      json = raw ? JSON.parse(raw) : {}
    } catch {
      json = {}
    }
    const detalleMh = json?.mh_data?.detalle || json?.mh_data?.message || json?.mh_data?.mensaje || ''
    const errorMsg =
      json.error ||
      detalleMh ||
      (raw && !raw.trim().startsWith('<') ? raw.trim() : '') ||
      `No se pudo emitir en firme (HTTP ${resp.status}).`
    if (!resp.ok || !json.ok) throw new Error(errorMsg)
    return json
  }

  const emitirBorradorReciente = async (doc: DocumentoRow) => {
    setBusyDocId(doc.id)
    setDocFeedback(null)
    setError('')
    setOk('')
    try {
      const { data: lineasActuales, error: lineasActualesErr } = await supabase
        .from('fe_documento_lineas')
        .select('linea, documento_id, codigo_interno, cabys')
        .eq('documento_id', doc.id)
        .order('linea')
      if (lineasActualesErr) throw lineasActualesErr

      const fixesCabys = mergeCabysLineas((lineasActuales || []) as DocumentoLineaRow[], ventas)
      for (const item of fixesCabys) {
        const { error: updateErr } = await supabase
          .from('fe_documento_lineas')
          .update({ cabys: item.cabys })
          .eq('documento_id', doc.id)
          .eq('linea', item.linea)
        if (updateErr) throw updateErr
      }

      if (doc.estado !== 'confirmado') {
        const { error: confirmErr } = await supabase
          .from('fe_documentos')
          .update({ estado: 'confirmado' })
          .eq('empresa_id', empresaId)
          .eq('id', doc.id)
        if (confirmErr) throw confirmErr
      }

      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.')

      const resp = await fetch(`/api/facturacion/emitir/${doc.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ empresa_id: empresaId }),
      })
      const raw = await resp.text()
      let json = {} as { ok?: boolean; error?: string; estado_mh?: string; clave?: string; consecutivo?: string; mh_data?: any }
      try {
        json = raw ? JSON.parse(raw) : {}
      } catch {
        json = {}
      }
      const detalleMh = json?.mh_data?.detalle || json?.mh_data?.message || json?.mh_data?.mensaje || ''
      const errorMsg =
        json.error ||
        detalleMh ||
        (raw && !raw.trim().startsWith('<') ? raw.trim() : '') ||
        `No se pudo emitir en firme (HTTP ${resp.status}).`
      if (!resp.ok || !json.ok) throw new Error(errorMsg)

      setOk(`Documento emitido. Estado MH: ${mhEstadoLabel(json.estado_mh || 'enviado')}${json.consecutivo ? `${sep}${json.consecutivo}` : ''}`)
      showDocFeedback(doc.id, 'ok', `Documento emitido. Estado MH: ${mhEstadoLabel(json.estado_mh || 'enviado')}${json.consecutivo ? `${sep}${json.consecutivo}` : ''}`)
      await loadMaestros()
    } catch (e: any) {
      const message = normalizeUiError(e, 'No se pudo emitir el borrador.')
      setError(message)
      showDocFeedback(doc.id, 'error', message)
      await loadMaestros()
    } finally {
      setBusyDocId(null)
    }
  }

  const consultarEstadoMhReciente = async (doc: DocumentoRow) => {
    setBusyDocId(doc.id)
    setDocFeedback(null)
    setError('')
    setOk('')
    try {
      const { data: docActual, error: docErr } = await supabase
        .from('fe_documentos')
        .select('id, clave_mh, estado_mh, numero_consecutivo')
        .eq('empresa_id', empresaId)
        .eq('id', doc.id)
        .maybeSingle()
      if (docErr) throw docErr
      if (!docActual?.clave_mh) {
        throw new Error('Este documento aun no tiene clave MH asignada. Emitalo en firme y refresque la lista antes de consultar.')
      }

      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.')

      const resp = await fetch(`/api/facturacion/estado/${doc.id}?empresa_id=${empresaId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const raw = await resp.text()
      let json = {} as { ok?: boolean; error?: string; estado_mh?: string; mh_data?: any }
      try {
        json = raw ? JSON.parse(raw) : {}
      } catch {
        json = {}
      }

      const detalleMh = json?.mh_data?.detalle || json?.mh_data?.message || json?.mh_data?.mensaje || ''
      const errorMsg =
        json.error ||
        detalleMh ||
        (raw && !raw.trim().startsWith('<') ? raw.trim() : '') ||
        `No se pudo consultar MH (HTTP ${resp.status}).`

      if (!resp.ok || !json.ok) throw new Error(errorMsg)

      setOk(`Estado MH actualizado: ${mhEstadoLabel(json.estado_mh || 'enviado')}`)
      showDocFeedback(doc.id, 'ok', `Estado MH actualizado: ${mhEstadoLabel(json.estado_mh || 'enviado')}`)
      await loadMaestros()
    } catch (e: any) {
      const message = normalizeUiError(e, 'No se pudo consultar el estado en MH.')
      setError(message)
      showDocFeedback(doc.id, 'error', message)
      await loadMaestros()
    } finally {
      setBusyDocId(null)
    }
  }

  const toggleMensajeMhReciente = async (doc: DocumentoRow) => {
    if (mhDetalleDocId === doc.id) {
      setMhDetalleDocId(null)
      return
    }
    if (doc.respuesta_mh_json || mhDetalleCache[doc.id]) {
      setMhDetalleDocId(doc.id)
      return
    }
    setBusyDocId(doc.id)
    setDocFeedback(null)
    setError('')
    try {
      const { data, error } = await supabase
        .from('fe_documentos')
        .select('id, respuesta_mh_json')
        .eq('empresa_id', empresaId)
        .eq('id', doc.id)
        .maybeSingle()
      if (error) throw error
      const detalle = (data as any)?.respuesta_mh_json || null
      if (!detalle) throw new Error('Este documento no tiene detalle MH guardado.')
      setMhDetalleCache((prev) => ({ ...prev, [doc.id]: detalle }))
      setMhDetalleDocId(doc.id)
      showDocFeedback(doc.id, 'ok', 'Detalle MH cargado.')
    } catch (e: any) {
      const message = normalizeUiError(e, 'No se pudo cargar el detalle MH.')
      setError(message)
      showDocFeedback(doc.id, 'error', message)
    } finally {
      setBusyDocId(null)
    }
  }

  const reimprimirDocumentoReciente = (doc: DocumentoRow) => {
    setPreviewDocId(doc.id)
  }

  const reenviarCorreoReciente = async (doc: DocumentoRow) => {
    setBusyDocId(doc.id)
    setDocFeedback(null)
    setError('')
    setOk('')
    try {
      if (!doc.receptor_email) throw new Error('Este documento no tiene correo del receptor.')

      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.')

      const resp = await fetch(`/api/facturacion/reenviar/${doc.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ empresa_id: empresaId }),
      })

      const raw = await resp.text()
      let json = {} as { ok?: boolean; error?: string; to?: string }
      try {
        json = raw ? JSON.parse(raw) : {}
      } catch {
        json = {}
      }

      if (!resp.ok || !json.ok) {
        throw new Error(json.error || (raw && !raw.trim().startsWith('<') ? raw.trim() : `No se pudo reenviar el correo (HTTP ${resp.status}).`))
      }

      setOk(`Correo reenviado a ${json.to || doc.receptor_email}`)
      showDocFeedback(doc.id, 'ok', `Correo reenviado a ${json.to || doc.receptor_email}`)
    } catch (e: any) {
      const message = normalizeUiError(e, 'No se pudo reenviar el correo.')
      setError(message)
      showDocFeedback(doc.id, 'error', message)
    } finally {
      setBusyDocId(null)
    }
  }

  const guardarBorrador = async (opts?: { emitir?: boolean }) => {
    if (!ventasAFacturar.length || !draft) return
    const esTiquete = tipoDocumentoAuto === '04'
    if (flujoReceptor === 'credito' && !selectedCliente) {
      setError('Seleccione un cliente autorizado a credito antes de guardar el borrador.')
      return
    }
    if (!esTiquete && flujoReceptor === 'contado' && !consumidorFinal && !draft.receptorIdentificacion.trim()) {
      setError('Digite la cedula del receptor o deje el flujo como consumidor final.')
      return
    }
    if (!esTiquete && clienteRequerido && !clienteListo) {
      setError('La factura electronica requiere un receptor identificado.')
      return
    }
    const liquidacionError = validateLiquidacionPagos(draft.liquidacionPagos || [], totalAFacturar, draft.condicionVenta)
    if (liquidacionError) {
      setError(liquidacionError)
      return
    }
    setSaving(true)
    setOk('')
    setError('')
    let documentoIdGuardado: number | null = null
    try {
      const receptorBitacoraId = await persistBitacoraReceptor()
      const consumidorFinal = esTiquete
      const esGrupo = ventasAFacturar.length > 1

      const receptorPayload = flujoReceptor === 'credito'
        ? {
            tercero_id: selectedCliente?.id || null,
            receptor_bitacora_id: null,
            receptor_origen: 'cliente_credito',
            receptor_tipo_identificacion: null,
            receptor_identificacion: selectedCliente?.identificacion || null,
            receptor_nombre: selectedCliente?.razon_social || null,
            receptor_email: selectedCliente?.email || null,
            receptor_telefono: null,
            receptor_direccion: null,
            receptor_actividad_codigo: null,
            receptor_actividad_descripcion: null,
          }
        : consumidorFinal
          ? {
              tercero_id: null,
              receptor_bitacora_id: null,
              receptor_origen: 'consumidor_final',
              receptor_tipo_identificacion: null,
              receptor_identificacion: null,
              receptor_nombre: 'Consumidor final',
              receptor_email: null,
              receptor_telefono: null,
              receptor_direccion: null,
              receptor_actividad_codigo: null,
              receptor_actividad_descripcion: null,
            }
          : {
              tercero_id: null,
              receptor_bitacora_id: receptorBitacoraId,
              receptor_origen: 'bitacora',
              receptor_tipo_identificacion: draft.receptorTipoIdentificacion || null,
              receptor_identificacion: draft.receptorIdentificacion.trim() || null,
              receptor_nombre: draft.receptorNombre.trim() || null,
              receptor_email: draft.receptorEmail.trim() || null,
              receptor_telefono: draft.receptorTelefono.trim() || null,
              receptor_direccion: draft.receptorDireccion.trim() || null,
              receptor_actividad_codigo: draft.receptorActividadCodigo.trim() || null,
              receptor_actividad_descripcion: draft.receptorActividadDescripcion.trim() || null,
            }

      const fechaEmision = formatCompanyDateYmd(ventasAFacturar[0].end_at || new Date().toISOString(), empresaTimeZone)
      const observacion  = esGrupo
        ? `Ventas agrupadas: TIQ# ${ventasAFacturar.map(v => v.sale_id).join(', ')}`
        : draft.observacion.trim() || null

      const docPayload = {
        empresa_id:          empresaId,
        tipo_documento:      tipoDocumentoAuto,
        origen:              'pos',
        estado:              'confirmado',
        auto_emitir:         true,
        sale_id_fusion:      esGrupo ? null : ventasAFacturar[0].sale_id,
        ...receptorPayload,
        fecha_emision:       fechaEmision,
        moneda:              'CRC',
        condicion_venta:     draft.condicionVenta,
        medio_pago:          medioPagoPrincipalDraft,
        liquidacion_pago_json: serializeLiquidacionPagos(draft.liquidacionPagos || [], draft.condicionVenta),
        plazo_credito_dias:  draft.condicionVenta === '02' ? Number(draft.plazoCreditoDias || 0) : 0,
        observacion,
        subtotal:            totalAFacturar,
        total_descuento:     0,
        total_impuesto:      0,
        total_comprobante:   totalAFacturar,
      }

      let documentoId = editingDocId
      let consecutivo = ''

      if (editingDocId) {
        const { data: existingDoc, error: existingErr } = await supabase
          .from('fe_documentos')
          .select('id, numero_consecutivo')
          .eq('empresa_id', empresaId)
          .eq('id', editingDocId)
          .single()
        if (existingErr) throw existingErr

        const { error: updateErr } = await supabase
          .from('fe_documentos')
          .update(docPayload)
          .eq('empresa_id', empresaId)
          .eq('id', editingDocId)
        if (updateErr) throw updateErr

        const { error: deleteLinesErr } = await supabase.from('fe_documento_lineas').delete().eq('documento_id', editingDocId)
        if (deleteLinesErr) throw deleteLinesErr

        consecutivo = String((existingDoc as any)?.numero_consecutivo || '')
      } else {
        const { data: inserted, error: docError } = await supabase.from('fe_documentos').insert(docPayload).select('id').single()
        if (docError) throw docError

        documentoId = Number((inserted as any)?.id || 0)
        if (!documentoId) throw new Error('No se pudo obtener el id del borrador FE.')
      }

      if (!documentoId) throw new Error('No se pudo resolver el documento del borrador FE.')
      documentoIdGuardado = documentoId

      const ventasSinCabys = ventasAFacturar.filter((v) => !/^\d{13}$/.test(String(v.cabys || '').trim()))
      if (ventasSinCabys.length) {
        throw new Error(`Falta CABYS en ${ventasSinCabys.length} venta(s): ${ventasSinCabys.map((v) => `${v.combustible} TIQ#${v.sale_id}`).join(' | ')}. Configure el CABYS del grado de combustible antes de emitir.`)
      }

      if (!consecutivo) {
        consecutivo = `${String(config.sucursal || '001').padStart(3, '0')}${String(config.punto_venta || '00001').padStart(5, '0')}${tipoDocumentoAuto}${String(documentoId).padStart(10, '0')}`
        await supabase.from('fe_documentos').update({ numero_consecutivo: consecutivo }).eq('id', documentoId)
      }

      const { error: lineasInsertErr } = await supabase.from('fe_documento_lineas').insert(
        ventasAFacturar.map((v, idx) => {
          const tarifa   = Number(v.tarifa_iva_porcentaje ?? 0)
          const factor   = 1 + tarifa / 100
          // v.money = precio consumidor (IVA incluido cuando tarifa > 0)
          const subtotal = tarifa > 0 ? v.money / factor : v.money
          const impuesto = subtotal * (tarifa / 100)
          const ppu_net  = v.volume > 0 ? subtotal / v.volume : subtotal
          return {
            documento_id:          documentoId,
            linea:                 idx + 1,
            tipo_linea:            'mercaderia',
            producto_id:           null,
            codigo_interno:        `COMB-${v.sale_id}`,
            cabys:                 String(v.cabys || '').trim() || null,
            descripcion:           `${v.combustible} ${qty(v.volume)} L · ${v.bomba} · TIQ#${v.sale_id}`,
            unidad_medida:         'L',
            cantidad:              v.volume,
            precio_unitario:       ppu_net,
            descuento_monto:       0,
            tarifa_iva_codigo:     v.tarifa_iva_codigo || '01',
            tarifa_iva_porcentaje: tarifa,
            subtotal,
            impuesto_monto:        impuesto,
            total_linea:           v.money,
          }
        })
      )
      if (lineasInsertErr) throw lineasInsertErr

      const saleIdsStr = ventasAFacturar.map(v => `TIQ#${v.sale_id}`).join(', ')
      setEditingDocId(documentoId)
      if (opts?.emitir) {
        const json = await emitirDocumentoEnFirme(documentoId, 'borrador')
        setOk(`Documento emitido. Estado MH: ${mhEstadoLabel(json.estado_mh || 'enviado')}${json.consecutivo ? `${sep}${json.consecutivo}` : consecutivo ? `${sep}${consecutivo}` : ''}`)
      } else {
      setOk(`${editingDocId ? 'Borrador FE actualizado' : 'Borrador FE creado'}${sep}${consecutivo}${esGrupo ? `${sep}${ventasAFacturar.length} ventas: ${saleIdsStr}` : ''}`)
      }
      setFacturadas(prev => new Set(Array.from(prev).concat(ventasAFacturar.map(v => v.sale_id))))
      setMarcadas(new Set())
      setSelectedSaleId(null)
      setEditingDocId(null)
      setDraft(null)
      setView('bandeja')
      await loadMaestros()
      void loadVentas()
    } catch (e: any) {
      setError(normalizeUiError(e, 'No se pudo guardar el borrador FE.'))
      if (documentoIdGuardado && !editingDocId) {
        setEditingDocId(documentoIdGuardado)
      }
      await loadMaestros()
    } finally {
      setSaving(false)
    }
  }

  // UI
  const docsPendientes = useMemo(
    () => docs.filter((doc: DocumentoRow) => {
      const estadoMh = String(doc.estado_mh || '').toLowerCase().trim()
      return String(doc.estado || '').toLowerCase().trim() === 'borrador'
        || !estadoMh
        || estadoMh === 'error'
    }),
    [docs]
  )
  const currentEditingDoc = editingDocId ? docsPendientes.find((doc) => doc.id === editingDocId) || null : null
  const emisionBloqueadaWorkspace = estadoMhBloqueaEmision(currentEditingDoc?.estado_mh)

  const draftWorkspace = (
    <div className="comb-fact-preview comb-fact-paper">
      <div className="comb-fact-preview-head comb-fact-paper-head">
        <div className="comb-fact-paper-top">
          <div>
            <div className="comb-fact-paper-title">{tipoDocumentoAuto === '04' ? 'Tiquete electronico' : 'Factura electronica'}</div>
            <div className="comb-fact-paper-flow">{flujoReceptor === 'credito' ? 'Credito' : flujoReceptor === 'contado' ? 'Contado' : 'Consumidor final'} · T.C. 1.00 · CRC</div>
            <div className="comb-fact-paper-sub">{editingDocId ? `Editando borrador POS #${editingDocId}` : 'Captura fiscal directa desde combustible.'}</div>
          </div>
          <div className="comb-fact-paper-refresh">
            <button
              type="button"
              className="comb-fact-btn secondary"
              disabled={loading}
              onClick={() => { void loadVentas() }}
            >
              Refrescar ventas
            </button>
          </div>
          <div className="comb-fact-actions">
            <button type="button" className="comb-fact-btn secondary" onClick={volverABandeja}>
              Volver a etiquetas
            </button>
            <button type="button" className="comb-fact-btn secondary" disabled={saving || loading || !ventasAFacturar.length || !draft} onClick={() => void guardarBorrador()}>
              {saving ? 'Procesando...' : editingDocId ? 'Actualizar borrador' : 'Guardar borrador'}
            </button>
            <button type="button" className="comb-fact-btn primary" disabled={saving || loading || !ventasAFacturar.length || !draft || emisionBloqueadaWorkspace} onClick={() => void guardarBorrador({ emitir: true })}>
              {saving ? 'Procesando...' : emisionBloqueadaWorkspace ? 'Ya enviado a MH' : 'Emitir en firme'}
            </button>
          </div>
        </div>
      </div>

      {!ventasAFacturar.length || !draft ? (
        <div className="comb-fact-empty" style={{ margin: 18 }}>Selecciona una venta o marca varias para agrupar.</div>
      ) : (
        <div className="comb-fact-paper-body">
          <section className="comb-fact-section">
            <div className="comb-fact-section-head">Datos del cliente</div>
            <div className="comb-fact-section-grid">
              <div className="comb-fact-editor">
            {marcadas.size > 1 && (
              <div className="comb-fact-grupo-bar">
                <span>Grupo: {marcadas.size} ventas · {qty(volumenAFacturar)} L · {money(totalAFacturar)}</span>
                <button onClick={() => setMarcadas(new Set())}>Limpiar grupo</button>
              </div>
            )}
            <div className="comb-fact-form-grid">
              <div className="comb-fact-client-row">
                <div className="comb-fact-field compact span-3">
                  <label htmlFor="comb-fact-credit-code">Codigo cliente</label>
                  <input
                    id="comb-fact-credit-code"
                    className="comb-fact-input"
                    value={draft.codigoCliente}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, codigoCliente: e.target.value, buscarCliente: prev.terceroId ? prev.buscarCliente : '', terceroId: null } : prev)}
                    placeholder="Fijo o credito"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !draft.codigoCliente.trim()) {
                        e.preventDefault()
                        setClienteModalOpen(true)
                      }
                    }}
                  />
                </div>
                <div className="comb-fact-field compact span-3">
                  <label htmlFor="comb-fact-id">Cedula contribuyente</label>
                  <input
                    id="comb-fact-id"
                    className="comb-fact-input"
                    value={selectedCliente?.identificacion || draft.receptorIdentificacion}
                    onChange={(e) => {
                      const v = e.target.value
                      setReceptorActividades([])
                      setDraft((prev) => prev ? {
                        ...prev,
                        receptorIdentificacion: v,
                        receptorTipoIdentificacion: inferTipoIdentificacion(v),
                        receptorActividadCodigo: '',
                        receptorActividadDescripcion: '',
                        terceroId: null,
                      } : prev)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (draft.receptorIdentificacion.trim()) {
                          void consultarMhReceptor()
                        } else {
                          void abrirBitacoraModal()
                        }
                      }
                    }}
                    disabled={Boolean(selectedCliente) || consumidorFinal}
                  />
                </div>
                <div className="comb-fact-field compact span-6">
                  <label htmlFor="comb-fact-name">Nombre</label>
                  <input
                    id="comb-fact-name"
                    className="comb-fact-input"
                    value={selectedCliente?.razon_social || draft.receptorNombre || (!draft.receptorIdentificacion.trim() ? 'Consumidor final' : '')}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, receptorNombre: e.target.value, terceroId: null } : prev)}
                    disabled={Boolean(selectedCliente) || consumidorFinal}
                  />
                </div>
              </div>
              <div className="comb-fact-contact-row">
                <div className="comb-fact-field compact span-3">
                  <label htmlFor="comb-fact-phone">Telefono</label>
                  <input
                    id="comb-fact-phone"
                    className="comb-fact-input"
                    value={draft.receptorTelefono}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, receptorTelefono: e.target.value, terceroId: null } : prev)}
                    placeholder="Telefono"
                    disabled={Boolean(selectedCliente) || consumidorFinal}
                  />
                </div>
                <div className="comb-fact-field compact span-3">
                  <label htmlFor="comb-fact-credit-days">Plazo</label>
                  <input
                    id="comb-fact-credit-days"
                    className="comb-fact-input"
                    readOnly
                    value={draft.condicionVenta === '02' ? `${draft.plazoCreditoDias} dias` : '0 dias'}
                  />
                </div>
                <div className="comb-fact-field compact span-6">
                  <label htmlFor="comb-fact-address">Direccion</label>
                  <input
                    id="comb-fact-address"
                    className="comb-fact-input"
                    value={draft.receptorDireccion}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, receptorDireccion: e.target.value, terceroId: null } : prev)}
                    placeholder="Direccion del receptor"
                    disabled={Boolean(selectedCliente) || consumidorFinal}
                  />
                </div>
              </div>
              <div className="comb-fact-detail-row">
                <div className="comb-fact-field compact span-6">
                  <label htmlFor="comb-fact-email">Correos</label>
                  <input
                    id="comb-fact-email"
                    className="comb-fact-input"
                    value={selectedCliente?.email || draft.receptorEmail}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, receptorEmail: e.target.value, terceroId: null } : prev)}
                    placeholder="correo@cliente.com"
                    disabled={Boolean(selectedCliente) || consumidorFinal}
                  />
                </div>
                <div className="comb-fact-field compact span-8">
                  <label htmlFor="comb-fact-activity">Actividad economica</label>
                  {receptorActividades.length > 0 ? (
                    <select
                      id="comb-fact-activity"
                      className="comb-fact-select"
                      value={draft.receptorActividadCodigo}
                      onChange={(e) => {
                        const actividad = receptorActividades.find((item) => item.codigo === e.target.value) || null
                        setDraft((prev) => prev ? {
                          ...prev,
                          receptorActividadCodigo: e.target.value,
                          receptorActividadDescripcion: actividad?.descripcion || '',
                          terceroId: null,
                        } : prev)
                      }}
                      disabled={Boolean(selectedCliente) || consumidorFinal}
                    >
                      <option value="">Seleccione actividad</option>
                      {receptorActividades.map((actividad) => (
                        <option key={actividad.codigo} value={actividad.codigo}>{`${actividad.codigo} - ${actividad.descripcion}`}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="comb-fact-activity"
                      className="comb-fact-input"
                      value={draft.receptorActividadCodigo}
                      onChange={(e) => setDraft((prev) => prev ? { ...prev, receptorActividadCodigo: e.target.value, terceroId: null } : prev)}
                      placeholder="Codigo actividad"
                      disabled={Boolean(selectedCliente) || consumidorFinal}
                    />
                  )}
                </div>
                <div className="comb-fact-field compact span-4">
                  <label>Medio pago principal</label>
                  <div className="comb-fact-input" style={{ display: 'flex', alignItems: 'center', minHeight: 36 }}>{medioPagoLabel(medioPagoPrincipalDraft)}</div>
                </div>
              </div>
            </div>
              </div>
            </div>
          </section>
          <section className="comb-fact-section">
            <div className="comb-fact-section-head">Liquidacion medio de pago</div>
            <div style={{ padding: 14 }}>
              <div className="comb-fact-grupo-bar" style={{ marginBottom: 12 }}>
                <span>Total liquidado {money(liquidacionPagoTotal)}</span>
                <span>Diferencia {money(liquidacionPagoTotal - totalAFacturar)}</span>
              </div>
              {draft.condicionVenta === '02' ? (
                <div className="comb-fact-warning">En venta a credito no se registra liquidacion de cobro en este comprobante.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="comb-fact-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>Medio</th>
                        <th>Subtipo</th>
                        <th>Referencia</th>
                        <th>Detalle</th>
                        <th>Monto</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.liquidacionPagos.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <select className="comb-fact-select" value={row.tipoMedioPago} onChange={(e) => updateDraftPago(row.id, { tipoMedioPago: e.target.value, subtipo: FE_SUBTIPO_OPTIONS[e.target.value]?.[0]?.value || '' })}>
                              {FE_MEDIO_PAGO_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          </td>
                          <td>
                            {FE_SUBTIPO_OPTIONS[row.tipoMedioPago]?.length ? (
                              <select className="comb-fact-select" value={row.subtipo} onChange={(e) => updateDraftPago(row.id, { subtipo: e.target.value })}>
                                <option value="">Seleccione</option>
                                {FE_SUBTIPO_OPTIONS[row.tipoMedioPago].map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                            ) : (
                              <div style={{ fontSize: 12, color: '#94a3b8' }}>N/A</div>
                            )}
                          </td>
                          <td>
                            <input className="comb-fact-input" value={row.referencia} onChange={(e) => updateDraftPago(row.id, { referencia: e.target.value })} placeholder={referenciaLabel(row.tipoMedioPago, row.subtipo)} />
                          </td>
                          <td>
                            <input className="comb-fact-input" value={row.detalle} onChange={(e) => updateDraftPago(row.id, { detalle: e.target.value })} placeholder={detalleLabel(row.tipoMedioPago)} />
                          </td>
                          <td>
                            <input className="comb-fact-input" type="number" step="0.01" value={row.monto} onChange={(e) => updateDraftPago(row.id, { monto: Number(e.target.value || 0) })} />
                          </td>
                          <td>
                            <button type="button" className="comb-fact-btn secondary" onClick={() => removeDraftPago(row.id)}>Quitar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {draft.condicionVenta !== '02' ? (
                <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <button type="button" className="comb-fact-btn secondary" onClick={addDraftPago}>Agregar medio</button>
                  <button type="button" className="comb-fact-btn secondary" onClick={() => setDraft((prev) => prev ? { ...prev, liquidacionPagos: [createLiquidacionPago(config.medio_pago_defecto || '01', totalAFacturar)] } : prev)}>Una sola linea</button>
                </div>
              ) : null}
            </div>
          </section>
          <section className="comb-fact-section">
            <div className="comb-fact-section-head">Detalle de factura</div>
            <div className="comb-fact-paper-line">
              <table>
                <thead><tr><th>Detalle agrupado</th><th>Cantidad</th><th>PPU</th><th>Total</th></tr></thead>
                <tbody>
                  {ventasAFacturar.map(v => (
                    <tr key={v.sale_id}>
                      <td>{v.combustible} | {v.bomba} · TIQ#{v.sale_id}</td>
                      <td>{qty(v.volume)} L</td>
                      <td>{money(v.ppu)}</td>
                      <td>{money(v.money)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="comb-fact-section">
            <div className="comb-fact-detail-layout">
              <div style={{ padding: 14 }}>
                <div className="comb-fact-field compact">
                  <label htmlFor="comb-fact-note">Comentario</label>
                  <textarea id="comb-fact-note" className="comb-fact-textarea" value={draft.observacion} onChange={(e) => setDraft((prev) => prev ? { ...prev, observacion: e.target.value } : prev)} />
                </div>
              </div>
              <aside className="comb-fact-detail-totals">
                <div className="comb-fact-paper-footer">
                  <div className="comb-fact-paper-total">
                    <div className="comb-fact-paper-total-body">
                      <div className="row"><span>Subtotal</span><span>{money(totalAFacturar)}</span></div>
                      <div className="row"><span>Descuento</span><span>{money(0)}</span></div>
                      <div className="row"><span>I.V.A.</span><span>{money(0)}</span></div>
                    </div>
                    <div className="row total"><span>Total a pagar</span><strong>{money(totalAFacturar)}</strong></div>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      )}
    </div>
  )

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('combustible:facturacion-view', { detail: { view } }))
  }, [view])

  useEffect(() => {
    const onRefrescar = () => { void loadVentas() }
    const onFacturar = () => {
      if (!loading && ventasAFacturar.length && draft) abrirVistaBorrador()
    }
    window.addEventListener('combustible:facturacion-refrescar', onRefrescar)
    window.addEventListener('combustible:facturacion-facturar', onFacturar)
    return () => {
      window.removeEventListener('combustible:facturacion-refrescar', onRefrescar)
      window.removeEventListener('combustible:facturacion-facturar', onFacturar)
    }
  }, [loadVentas, abrirVistaBorrador, loading, ventasAFacturar.length, draft])

  if (previewDocId !== null) {
    return <FacturaPreviewModal docId={previewDocId} empresaId={empresaId} onClose={() => setPreviewDocId(null)} />
  }

  const facturacionMain = (
    <div>
      <WorkspaceMainPanel>
        {loading ? (
          <div className="comb-fact-empty">Cargando ventas desde Fusion...</div>
        ) : ventasFiltradas.length === 0 ? (
          <div className="comb-fact-empty">No hay ventas pendientes con los filtros actuales.</div>
        ) : (
          <div className="comb-fact-grid">
            {ventasPagina.map((venta) => {
              const active = venta.sale_id === selectedSaleId
              const identified = !!venta.customer_tax_id
              return (
                <article key={venta.sale_id} className={`comb-fact-card${active ? ' active' : ''}${marcadas.has(venta.sale_id) ? ' marcada' : ''}`}>
                  <button type="button" onClick={() => { iniciarNuevoBorrador(); setSelectedSaleId(venta.sale_id) }}>
                    <div className="comb-fact-card-top">
                      <div>
                        <div className="comb-fact-sale">TIQ#{venta.sale_id}</div>
                        <div className="comb-fact-time">{dateTime(venta.end_at)}</div>
                      </div>
                      <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                        <span className={`comb-fact-chip ${identified ? 'green' : 'gray'}`}>{identified ? 'Identificado' : 'Consumidor final'}</span>
                        <span
                          className="comb-fact-chip"
                          style={{
                            background: COMBUSTIBLE_COLORS[venta.combustible] || '#9ca3af',
                            borderColor: COMBUSTIBLE_COLORS[venta.combustible] || '#9ca3af',
                            color: '#ffffff',
                          }}
                        >
                          {venta.combustible}
                        </span>
                      </div>
                    </div>

                    <div className="comb-fact-customer">{venta.customer_name || 'Consumidor final'}</div>
                    <div className="comb-fact-customer-sub">{venta.customer_tax_id || 'Sin identificacion registrada'}</div>

                    <div className="comb-fact-stats">
                      <div className="comb-fact-stat">
                        <div className="k">Monto</div>
                        <div className="v">{money(venta.money)}</div>
                        <div className="s">PPU {money(venta.ppu)}</div>
                      </div>
                      <div className="comb-fact-stat">
                        <div className="k">Litros</div>
                        <div className="v">{qty(venta.volume)}</div>
                        <div className="s">Unidad L</div>
                      </div>
                    </div>

                    <div className="comb-fact-meta">
                      <div><b>Bomba</b>{venta.bomba}</div>
                      <div><b>Origen</b>Fusion</div>
                      <div><b>Pistero</b>{venta.attendant_id || 'No reportado'}</div>
                      <div><b>Inicio</b>{dateTime(venta.start_at)}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`comb-fact-mark-btn ${marcadas.has(venta.sale_id) ? 'on' : 'off'}`}
                    onClick={(e) => { e.stopPropagation(); iniciarNuevoBorrador(); toggleMarcada(venta.sale_id) }}
                  >
                    {marcadas.has(venta.sale_id) ? 'OK En grupo' : '+ Agrupar'}
                  </button>
                </article>
              )
            })}
          </div>
        )}

        {totalPaginas > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, padding: '10px 4px', borderTop: '1px solid #334155' }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Pagina {paginaVentas + 1} de {totalPaginas} · {ventasOrdenadas.length} ventas pendientes
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="comb-fact-btn secondary" disabled={paginaVentas === 0}
                onClick={() => setPaginaVentas(0)} style={{ padding: '4px 10px', fontSize: 12 }}>{'<<'}</button>
              <button className="comb-fact-btn secondary" disabled={paginaVentas === 0}
                onClick={() => setPaginaVentas(p => p - 1)} style={{ padding: '4px 10px', fontSize: 12 }}>{'<'} Ant</button>
              <button className="comb-fact-btn secondary" disabled={paginaVentas >= totalPaginas - 1}
                onClick={() => setPaginaVentas(p => p + 1)} style={{ padding: '4px 10px', fontSize: 12 }}>Sig {'>'}</button>
              <button className="comb-fact-btn secondary" disabled={paginaVentas >= totalPaginas - 1}
                onClick={() => setPaginaVentas(totalPaginas - 1)} style={{ padding: '4px 10px', fontSize: 12 }}>{'>>'}</button>
            </div>
          </div>
        )}
      </WorkspaceMainPanel>

      {false && draft && <WorkspaceMainPanel
        title="Preview FE"
        subtitle={tituloPreview}
      >
        {!ventasAFacturar.length || !draft ? (
          <div className="comb-fact-empty">Aun no hay una venta seleccionada.</div>
        ) : (
          <div className="comb-fact-preview">
            <div className="comb-fact-preview-head">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#fdba74', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Borrador fiscal</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>{draft?.tipoDocumento === '04' ? 'Tiquete electronico' : 'Factura electronica'}</div>
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <span className="comb-fact-chip blue">Sucursal {config.sucursal}</span>
                  <span className="comb-fact-chip gray">Punto {config.punto_venta}</span>
                </div>
              </div>
            </div>

            <div className="comb-fact-preview-grid">
              <div className="comb-fact-box">
                <div className="k">Receptor</div>
                <div className="v">{draft?.receptorNombre || 'Consumidor final'}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{draft?.receptorIdentificacion || 'Sin identificacion'} {draft?.receptorEmail ? `| ${draft?.receptorEmail}` : ''}</div>
              </div>
              <div className="comb-fact-box">
                <div className="k">{ventasAFacturar.length > 1 ? `${ventasAFacturar.length} operaciones` : 'Operacion'}</div>
                <div className="v">{ventasAFacturar.length > 1 ? `${qty(volumenAFacturar)} L total` : ventasAFacturar[0].bomba}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                  {ventasAFacturar.length > 1
                    ? ventasAFacturar.map(v => `TIQ#${v.sale_id}`).join(' · ')
                    : `${ventasAFacturar[0].combustible} | ${qty(ventasAFacturar[0].volume)} L | TIQ#${ventasAFacturar[0].sale_id}`}
                </div>
              </div>
              <div className="comb-fact-box">
                <div className="k">Condicion venta</div>
                <div className="v">{draft?.condicionVenta === '02' ? 'Credito' : 'Contado'}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Medio pago {medioPagoLabel(medioPagoPrincipalDraft)}{draft?.condicionVenta === '02' ? ` | ${draft?.plazoCreditoDias} dias` : ''}</div>
              </div>
              <div className="comb-fact-box">
                <div className="k">Fecha emision base</div>
                <div className="v">{dateTime(ventasAFacturar[0].end_at)}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Fecha de cierre de la venta en Fusion.</div>
              </div>
            </div>

            <div className="comb-fact-line">
              <table>
                <thead>
                  <tr><th>Descripcion</th><th>Cantidad</th><th>PPU</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {ventasAFacturar.map(v => (
                    <tr key={v.sale_id}>
                      <td>{v.combustible} | {v.bomba} · TIQ#{v.sale_id}</td>
                      <td>{qty(v.volume)} L</td>
                      <td>{money(v.ppu)}</td>
                      <td>{money(v.money)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="comb-fact-footer">
              <div className="comb-fact-total">
                <div className="comb-fact-total-row"><span>Subtotal</span><span>{money(totalAFacturar)}</span></div>
                <div className="comb-fact-total-row"><span>Impuesto</span><span>{money(0)}</span></div>
                <div className="comb-fact-total-row"><strong>Total borrador</strong><strong>{money(totalAFacturar)}</strong></div>
              </div>
              <div className="comb-fact-actions">
                <button type="button" className="comb-fact-btn primary" disabled={loading} onClick={abrirVistaBorrador}>
                  Abrir vista completa FE
                </button>
                <button type="button" className="comb-fact-btn secondary" disabled={loading} onClick={() => { void loadVentas() }}>
                  Refrescar ventas
                </button>
              </div>
            </div>
          </div>
        )}
      </WorkspaceMainPanel>}

      <WorkspaceMainPanel title="Documentos FE combustible" subtitle="Pendientes del modulo combustible: borradores, emitidos sin resolver y seguimiento MH.">
        {docsPendientes.length === 0 ? (
          <div className="comb-fact-empty">No hay documentos FE pendientes en combustible. Los ya procesados se consultan en Historico FE.</div>
        ) : (
          <div className="comb-fact-list">
            {docsPendientes.map((doc: DocumentoRow) => (
              <div key={doc.id} className="comb-fact-history-item">
                <div className="comb-fact-history-top">
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>{doc.numero_consecutivo || `Borrador #${doc.id}`}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      {doc.tipo_documento === '04' ? 'Tiquete electronico' : 'Factura electronica'} | {dateTime(doc.fecha_emision)}
                      {doc.sale_id_fusion ? ` | TIQ#${doc.sale_id_fusion}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span className={`comb-fact-chip ${String(doc.estado || '').toLowerCase() === 'borrador' ? 'orange' : 'green'}`}>{docEstadoLabel(doc.estado)}</span>
                    {doc.estado_mh ? <span className={`comb-fact-chip ${mhEstadoChip(doc.estado_mh)}`}>{mhEstadoLabel(doc.estado_mh)}</span> : null}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#f8fafc', fontWeight: 700 }}>
                  {doc.receptor_nombre || 'Consumidor final'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  {doc.receptor_identificacion || 'Sin identificacion'}
                  {doc.receptor_email ? ` | ${doc.receptor_email}` : ''}
                </div>
                <div style={{ fontSize: 13, color: '#cbd5e1' }}>{doc.observacion || 'Sin observacion'}</div>
                <div style={{ marginTop: 8, fontSize: 13, color: '#f8fafc', fontWeight: 700 }}>{money(doc.total_comprobante)}</div>
                <div className="comb-fact-history-actions">
                  <button
                    type="button"
                    className="comb-fact-btn secondary"
                    disabled={busyDocId === doc.id || doc.estado !== 'borrador'}
                    onClick={() => void abrirBorradorReciente(doc.id)}
                  >
                    {busyDocId === doc.id ? 'Abriendo...' : 'Continuar borrador'}
                  </button>
                  <button
                    type="button"
                    className="comb-fact-btn secondary"
                    disabled={busyDocId === doc.id || doc.estado === 'borrador'}
                    onClick={() => void consultarEstadoMhReciente(doc)}
                  >
                    {busyDocId === doc.id ? 'Consultando...' : 'Consultar MH'}
                  </button>
                  <button
                    type="button"
                    className="comb-fact-btn secondary"
                    disabled={busyDocId === doc.id || (!doc.respuesta_mh_json && !mhDetalleCache[doc.id] && !['error', 'rechazado'].includes(String(doc.estado_mh || '').toLowerCase().trim()))}
                    onClick={() => void toggleMensajeMhReciente(doc)}
                  >
                    {busyDocId === doc.id ? 'Cargando...' : mhDetalleDocId === doc.id ? 'Ocultar mensaje MH' : 'Mensaje MH'}
                  </button>
                  <button
                    type="button"
                    className="comb-fact-btn secondary"
                    disabled={busyDocId === doc.id || doc.estado === 'borrador'}
                    onClick={() => void reimprimirDocumentoReciente(doc)}
                  >
                    {busyDocId === doc.id ? 'Preparando...' : 'Reimprimir'}
                  </button>
                  <button
                    type="button"
                    className="comb-fact-btn secondary"
                    title={String(doc.estado_mh || '').toLowerCase() !== 'aceptado' ? 'Requiere aceptacion MH para enviar' : undefined}
                    disabled={busyDocId === doc.id || !doc.receptor_email || String(doc.estado_mh || '').toLowerCase() !== 'aceptado'}
                    onClick={() => void reenviarCorreoReciente(doc)}
                  >
                    {busyDocId === doc.id ? 'Enviando...' : 'Reenviar correo'}
                  </button>
                  <button
                    type="button"
                    className="comb-fact-btn primary"
                    disabled={busyDocId === doc.id || estadoMhBloqueaEmision(doc.estado_mh)}
                    onClick={() => void emitirBorradorReciente(doc)}
                  >
                    {busyDocId === doc.id ? 'Emitiendo...' : estadoMhBloqueaEmision(doc.estado_mh) ? 'Ya enviado a MH' : 'Emitir en firme'}
                  </button>
                  <button
                    type="button"
                    className="comb-fact-btn secondary"
                    title={!canEliminarDocumento(doc) ? 'Solo disponible para borrador o MH error/rechazado' : undefined}
                    disabled={busyDocId === doc.id || !canEliminarDocumento(doc)}
                    onClick={() => solicitarEliminarBorradorReciente(doc)}
                  >
                    {busyDocId === doc.id ? 'Procesando...' : 'Eliminar'}
                  </button>
                </div>
                {docFeedback?.docId === doc.id ? (
                  <div className={docFeedback.kind === 'error' ? 'comb-fact-warning' : 'comb-fact-ok'} style={{ marginTop: 10 }}>
                    {docFeedback.message}
                  </div>
                ) : null}
                {mhDetalleDocId === doc.id ? (
                  <div className="comb-fact-mh-box">
                    <div className="comb-fact-mh-title">Mensaje de Hacienda</div>
                    <div className="comb-fact-mh-msg">{extractMhMessage(mhDetalleCache[doc.id] || doc.respuesta_mh_json)}</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </WorkspaceMainPanel>
    </div>
  )

  return (
    <div className="comb-fact-wrap" style={{ padding: 18 }}>
      <style>{STYLES}</style>
      {error ? <div className="comb-fact-warning" style={{ marginBottom: 14 }}>{error}</div> : null}

      {view === 'borrador' ? draftWorkspace : facturacionMain}

      {deleteConfirmDoc && (
        <OverlayPortal>
          <div className="comb-fact-modal-backdrop" onClick={() => setDeleteConfirmDoc(null)}>
            <div className="comb-fact-modal" onClick={(e) => e.stopPropagation()}>
              <div className="comb-fact-modal-head">
                <div className="comb-fact-modal-title">Confirmar eliminacion</div>
                <button type="button" className="comb-fact-btn secondary" onClick={() => setDeleteConfirmDoc(null)}>Cerrar</button>
              </div>
              <div className="comb-fact-modal-body">
                <div className="comb-fact-modal-content">
                  <div className="comb-fact-warning" style={{ marginBottom: 8 }}>
                    Se eliminara {deleteConfirmDoc.numero_consecutivo || `el borrador #${deleteConfirmDoc.id}`}. Esta accion no se puede deshacer.
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="comb-fact-btn secondary" onClick={() => setDeleteConfirmDoc(null)}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="comb-fact-btn primary"
                      disabled={busyDocId === deleteConfirmDoc.id}
                      onClick={() => void eliminarBorradorReciente(deleteConfirmDoc)}
                    >
                      {busyDocId === deleteConfirmDoc.id ? 'Eliminando...' : 'Si, eliminar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {clienteModalOpen && (
        <OverlayPortal>
        <div className="comb-fact-modal-backdrop" onClick={() => setClienteModalOpen(false)}>
            <div className="comb-fact-modal" onClick={(e) => e.stopPropagation()}>
              <div className="comb-fact-modal-head">
                <div className="comb-fact-modal-title">Buscar codigo de cliente</div>
                <button type="button" className="comb-fact-btn secondary" onClick={() => setClienteModalOpen(false)}>Cerrar</button>
              </div>
              <div className="comb-fact-modal-body">
                <div className="comb-fact-modal-content">
                <div className="comb-fact-sub" style={{ marginBottom: 0 }}>
                  Escriba codigo, nombre o cedula y el listado se filtrara en tiempo real.
                </div>
                <div className="comb-fact-field compact span-12" style={{ marginBottom: 4 }}>
                  <label htmlFor="comb-fact-modal-search">Buscar cliente</label>
                  <input
                    id="comb-fact-modal-search"
                    className="comb-fact-input"
                    autoFocus
                    value={draft?.codigoCliente || ''}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, codigoCliente: e.target.value } : prev)}
                    placeholder="Codigo, nombre o identificacion"
                  />
                </div>
                {!clientesModalFiltrados.length ? <div className="comb-fact-empty">No se encontraron clientes con ese criterio.</div> : null}
                {clientesModalFiltrados.length ? (
                  <div className="comb-fact-modal-table-wrap">
                    <table className="comb-fact-modal-table">
                      <thead>
                        <tr>
                          <th style={{ width: '18%' }}>Codigo</th>
                          <th>Nombre</th>
                          <th style={{ width: '22%' }}>Cedula</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientesModalFiltrados.slice(0, 40).map((cliente) => (
                          <tr key={cliente.id} onClick={() => aplicarClienteCredito(cliente)}>
                            <td className="comb-fact-modal-code">{cliente.codigo || 'SC'}</td>
                            <td className="comb-fact-modal-name">{cliente.razon_social}</td>
                            <td className="comb-fact-modal-id">{cliente.identificacion || 'Sin identificacion'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          </div>
          </OverlayPortal>
        )}

      {bitacoraModalOpen && (
        <OverlayPortal>
        <div className="comb-fact-modal-backdrop" onClick={() => setBitacoraModalOpen(false)}>
          <div className="comb-fact-modal" onClick={(e) => e.stopPropagation()}>
            <div className="comb-fact-modal-head">
              <div className="comb-fact-modal-title">Bitacora fiscal</div>
              <button type="button" className="comb-fact-btn secondary" onClick={() => setBitacoraModalOpen(false)}>Cerrar</button>
              </div>
                <div className="comb-fact-modal-body">
                  <div className="comb-fact-modal-content">
                  <div className="comb-fact-sub" style={{ marginBottom: 0 }}>
                    Si no escribes cedula, aqui puedes escoger un receptor ya guardado. Si no existe, vuelve y consulta MH.
                  </div>
                  <div className="comb-fact-field compact span-12" style={{ margin: '0 0 4px' }}>
                    <label htmlFor="comb-fact-bitacora-search">Buscar receptor</label>
                    <input
                      id="comb-fact-bitacora-search"
                    className="comb-fact-input"
                    autoFocus
                    value={bitacoraSearch}
                    onChange={(e) => setBitacoraSearch(e.target.value)}
                    placeholder="Cedula o nombre"
                  />
                </div>
                {bitacoraLoading ? <div className="comb-fact-empty">Cargando bitacora...</div> : null}
                {!bitacoraLoading && !bitacoraFiltrada.length ? <div className="comb-fact-empty">No hay receptores en bitacora para ese criterio.</div> : null}
                {!bitacoraLoading && bitacoraFiltrada.length ? (
                  <div className="comb-fact-modal-table-wrap">
                    <table className="comb-fact-modal-table">
                      <thead>
                        <tr>
                          <th style={{ width: '20%' }}>Cedula</th>
                          <th>Nombre</th>
                          <th style={{ width: '18%' }}>Actividad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bitacoraFiltrada.slice(0, 40).map((row) => (
                          <tr key={`${row.identificacion}-${row.razon_social}`} onClick={() => aplicarBitacoraReceptor(row)}>
                            <td className="comb-fact-modal-code">{row.identificacion || 'Sin identificacion'}</td>
                            <td>
                              <div className="comb-fact-modal-name">{row.razon_social || 'Sin nombre'}</div>
                              <div className="comb-fact-modal-sub">{row.email || row.telefono || 'Sin contacto adicional'}</div>
                            </td>
                            <td className="comb-fact-modal-id">{row.actividad_codigo || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                  </div>
              </div>
          </div>
        </div>
        </OverlayPortal>
      )}
    </div>
  )
}

