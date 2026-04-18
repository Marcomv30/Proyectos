import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase, API } from '../lib/supabase'
import type { TerminalConfig } from './SetupPage'
import ClienteModal from '../components/ClienteModal'
import DevolucionModal from '../components/DevolucionModal'

// --- Tipos --------------------------------------------------------------------

type Producto = {
  id: number
  codigo: string
  descripcion: string
  precio_venta: number
  unidad_medida?: string
  tarifa_iva?: number
  stock_actual?: number | null  // null = sin registro en bodega
  codigo_cabys?: string
  exento?: boolean
  descuento_autorizado_pct?: number   // 0 = no permite descuento
  impuesto_venta_incluido?: boolean   // true = precio ya incluye IVA, false = precio es sin IVA
}

type LineaCarrito = {
  key: string
  producto_id: number | null
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
  precio_unit: number
  descuento_pct: number
  descuento_max_pct: number   // 0 = no permite descuento
  iva_incluido: boolean       // true = precio ya incluye IVA
  iva_pct: number
  iva_monto: number
  gravado: number
  exento: number
  total: number
  exonerado: boolean
  cabys_code: string
}

type Cliente = {
  id: number
  nombre: string
  identificacion: string
  email?: string
  telefono?: string
  exonerado?: boolean
  exoneracion_numero?: string
  exoneracion_porcentaje?: number
  es_credito?: boolean        // seleccionado desde tab crÃƒÆ’Ã‚Â©dito
  es_contado_manual?: boolean // ingresado manualmente sin registro
}

type ClienteCredito = {
  id: number
  codigo: string | null
  razon_social: string
  identificacion: string | null
  email: string | null
  telefono: string | null
  credito_habilitado?: boolean
}


type TipoPago = 'efectivo' | 'sinpe' | 'tarjeta' | 'transferencia' | 'credito'

// --- Helpers ------------------------------------------------------------------

function calcLinea(l: Omit<LineaCarrito, 'iva_monto' | 'gravado' | 'exento' | 'total'>): LineaCarrito {
  const bruto = l.cantidad * l.precio_unit
  const desc = bruto * (l.descuento_pct / 100)
  const netoBase = bruto - desc  // monto antes de IVA o con IVA segÃƒÆ’Ã‚Âºn el producto
  const esExento = l.exonerado || l.iva_pct === 0

  let gravado: number
  let exento: number
  let iva_monto: number
  let total: number

  if (esExento) {
    // Sin IVA ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â el precio es el total independientemente de iva_incluido
    gravado   = 0
    exento    = netoBase
    iva_monto = 0
    total     = netoBase
  } else if (l.iva_incluido) {
    // Precio YA incluye IVA ? extraer componentes
    gravado   = netoBase / (1 + l.iva_pct / 100)
    iva_monto = netoBase - gravado
    exento    = 0
    total     = netoBase
  } else {
    // Precio SIN IVA ? sumar IVA al total
    gravado   = netoBase
    iva_monto = netoBase * (l.iva_pct / 100)
    exento    = 0
    total     = netoBase + iva_monto
  }

  return { ...l, iva_monto, gravado, exento, total }
}

function productoALinea(p: Producto, exonerado = false): LineaCarrito {
  const iva_pct = exonerado ? 0 : (p.tarifa_iva ?? 13)
  return calcLinea({
    key: `${p.id}-${Date.now()}`,
    producto_id: p.id,
    codigo: p.codigo || '',
    descripcion: p.descripcion,
    unidad: p.unidad_medida || 'Unid',
    cantidad: 1,
    precio_unit: p.precio_venta,
    descuento_pct: 0,
    descuento_max_pct: p.descuento_autorizado_pct ?? 0,
    iva_incluido: !!p.impuesto_venta_incluido,
    iva_pct,
    exonerado,
    cabys_code: p.codigo_cabys || '',
  })
}

const fmt = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const CRC = '\u20A1'
const UI = {
  dot: '\u00B7',
  mdash: '\u2014',
  close: '\u2715',
  times: '\u00D7',
  check: '\u2713',
  warning: '\u26A0',
  refresh: '\u21BB',
  keyboard: '\u2328',
  receipt: '\u{1F9FE}',
  money: '\u{1F4B5}',
  card: '\u{1F4B3}',
  bank: '\u{1F3E6}',
  person: '\u{1F464}',
  cart: '\u{1F6D2}',
  trash: '\u{1F5D1}',
  desktop: '\u{1F5A5}',
  door: '\u{1F6AA}',
  phone: '\u{1F4F1}',
  green: '\u{1F7E2}',
  red: '\u{1F534}',
  pencil: '\u270F\uFE0F',
  clipboard: '\u{1F4CB}',
  calendar: '\u{1F4C5}',
  pdf: '\u{1F4C4}',
  printer: '\u{1F5A8}',
  email: '\u2709',
  sync: '\u{1F504}',
  search: '\u{1F50E}',
  moneyBag: '\u{1F4B0}',
} as const
const tieneStockDisponible = (p: Producto) => p.stock_actual == null || p.stock_actual > 0
const stockEstadoCajero = (p: Producto) => p.stock_actual == null ? 'Sin control de stock' : ''
const esDocumentoRechazado = (estado: unknown) => String(estado || '').trim().toLowerCase() === 'rechazado'
const filtrarCreditoClientesLocal = (rows: ClienteCredito[], q: string) => {
  const term = q.trim().toLowerCase()
  if (!term) return rows
  return rows.filter((row) =>
    [row.codigo || '', row.razon_social || '', row.identificacion || '']
      .some((value) => value.toLowerCase().includes(term)),
  )
}

// --- Estilos ------------------------------------------------------------------

const S = `
  .pos-root {
    display:flex;
    flex-direction:column;
    min-height:100vh;
    min-height:100dvh;
    height:100dvh;
    background:#0b1120;
    color:#d6e2ff;
    font-family:inherit;
    overflow:hidden;
    padding-top:env(safe-area-inset-top);
    padding-right:env(safe-area-inset-right);
    padding-bottom:env(safe-area-inset-bottom);
    padding-left:env(safe-area-inset-left);
  }
  .pos-topbar { display:flex; align-items:center; gap:12px; padding:10px 18px; background:#111a2e; border-bottom:1px solid rgba(137,160,201,0.14); flex-shrink:0; }
  .pos-topbar-title { font-size:17px; font-weight:900; color:#f8fbff; letter-spacing:-.02em; }
  .pos-sep { display:inline-block; width:3px; height:3px; border-radius:50%; background:currentColor; opacity:0.5; vertical-align:middle; margin:0 5px; }
  .pos-topbar-empresa { font-size:12px; color:#7f92b5; }
  .pos-topbar-sep { flex:1; }
  .pos-topbar-btn { padding:7px 14px; border:1px solid rgba(137,160,201,0.22); border-radius:10px; background:transparent; color:#c8d6f2; font-size:12px; font-weight:700; cursor:pointer; transition:background .15s; }
  .pos-topbar-btn:hover { background:rgba(137,160,201,0.1); }
  .pos-topbar-btn.active { background:#1e3a8a; border-color:#3b82f6; color:#bfdbfe; }
  .pos-body { display:flex; flex:1; overflow:hidden; min-height:0; }

  /* Panel izquierdo */
  .pos-left { display:flex; flex-direction:column; flex:1; min-width:0; overflow:hidden; }
  .pos-left > :not(.pos-left-footer) { padding:14px; gap:12px; display:flex; flex-direction:column; }
  .pos-left-scrollable { flex:1; overflow-y:auto; overflow-x:hidden; display:flex; flex-direction:column; gap:12px; padding:14px; min-height:0; }
  .pos-left-footer { display:flex; gap:6px; padding:12px 14px; border-top:1px solid rgba(137,160,201,0.14); flex-wrap:wrap; background:#1a2740; flex-shrink:0; }
  .pos-left-footer button { flex:1; min-width:70px; padding:8px 10px; border:1px solid rgba(137,160,201,0.22); border-radius:8px; background:transparent; color:#c8d6f2; font-size:11px; font-weight:600; cursor:pointer; transition:all .15s; }
  .pos-left-footer button:hover { background:rgba(137,160,201,0.1); border-color:rgba(137,160,201,0.35); }
  @media (max-width:1024px) { .pos-left-footer button { font-size:10px; padding:6px 8px; } }
  @media (max-width:768px) { .pos-left-footer { justify-content:space-around; gap:4px; } .pos-left-footer button { flex:0 1 auto; min-width:60px; font-size:10px; padding:6px; } }
  .pos-search-wrap { position:relative; }
  .pos-search-input { width:100%; padding:13px 16px 13px 44px; background:#172131; border:2px solid rgba(137,160,201,0.22); border-radius:14px; color:#f3f7ff; font-size:16px; font-weight:600; outline:none; box-sizing:border-box; transition:border-color .15s; }
  .pos-search-input:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,0.15); }
  .pos-search-input.flash { border-color:#34d399; box-shadow:0 0 0 4px rgba(52,211,153,0.30); }
  .pos-search-input::placeholder { color:#4a5e7e; font-weight:400; }
  .pos-search-icon { position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:18px; color:#4a5e7e; pointer-events:none; }
  .pos-search-clear { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; color:#4a5e7e; cursor:pointer; font-size:18px; padding:4px; line-height:1; }
  .pos-search-clear:hover { color:#c8d6f2; }

  /* Dropdown resultados */
  .pos-results { position:absolute; top:calc(100% + 6px); left:0; right:0; background:#172131; border:1px solid rgba(137,160,201,0.22); border-radius:14px; z-index:100; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,.5); }
  .pos-result-item { display:flex; align-items:center; justify-content:space-between; padding:11px 16px; cursor:pointer; transition:background .12s; gap:12px; }
  .pos-result-item:hover { background:rgba(59,130,246,0.12); }
  .pos-result-item + .pos-result-item { border-top:1px solid rgba(137,160,201,0.08); }
  .pos-result-name { font-size:13px; font-weight:700; color:#f3f7ff; }
  .pos-result-code { font-size:11px; color:#6b80a5; margin-top:2px; }
  .pos-result-price { font-size:14px; font-weight:800; color:#34d399; white-space:nowrap; }
  .pos-result-stock { font-size:10px; color:#6b80a5; text-align:right; margin-top:2px; }

  /* Grid recientes */
  .pos-section-label { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#5c7099; font-weight:800; }
  .pos-recientes-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:10px; overflow-y:auto; }
  .pos-prod-card { background:#172131; border:1px solid rgba(137,160,201,0.14); border-radius:14px; padding:13px 14px; cursor:pointer; transition:border-color .15s, transform .12s; user-select:none; }
  .pos-prod-card:hover { border-color:#3b82f6; transform:translateY(-2px); }
  .pos-prod-card:active { transform:scale(.97); }
  .pos-prod-card-name { font-size:12px; font-weight:800; color:#e2e8f4; line-height:1.35; margin-bottom:6px; }
  .pos-prod-card-code { font-size:10px; color:#5c7099; margin-bottom:8px; }
  .pos-prod-card-price { font-size:15px; font-weight:900; color:#34d399; }
  .pos-prod-card-stock { font-size:10px; color:#5c7099; margin-top:3px; }
  .pos-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; color:#3a4e6e; gap:8px; }
  .pos-empty-icon { font-size:48px; }
  .pos-empty-text { font-size:13px; font-weight:600; }

  /* Panel derecho: carrito */
  .pos-right { width:440px; flex-shrink:0; display:flex; flex-direction:column; background:#111a2e; border-left:1px solid rgba(137,160,201,0.14); overflow:hidden; min-height:0; }
  @media (max-width:1024px) { .pos-right { width:360px; } }
  @media (max-width:768px) {
    .pos-body { flex-direction:column; overflow:auto; }
    .pos-left { min-height:42vh; min-height:42dvh; }
    .pos-right { width:100%; height:50vh; height:50dvh; border-left:none; border-top:1px solid rgba(137,160,201,0.14); }
  }

  /* Cliente */
  .pos-cliente-bar { padding:10px 14px; border-bottom:1px solid rgba(137,160,201,0.10); position:relative; }
  .pos-cliente-btn { width:100%; display:flex; align-items:center; gap:10px; padding:9px 12px; background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:11px; cursor:pointer; color:#c8d6f2; font-size:12px; font-weight:700; transition:border-color .15s; }
  .pos-cliente-btn:hover { border-color:#3b82f6; }
  .pos-cliente-icon { font-size:16px; }
  .pos-cliente-name { flex:1; text-align:left; }
  .pos-cliente-clear { background:none; border:none; color:#4a5e7e; cursor:pointer; font-size:14px; padding:0; }
  .pos-cliente-clear:hover { color:#ef4444; }
  .pos-cliente-dropdown { position:absolute; left:14px; right:14px; top:calc(100% - 4px); background:#1a2740; border:1px solid rgba(137,160,201,0.22); border-radius:12px; z-index:200; box-shadow:0 16px 40px rgba(0,0,0,.5); overflow:hidden; }
  .pos-cliente-search { width:100%; padding:10px 14px; background:transparent; border:none; border-bottom:1px solid rgba(137,160,201,0.14); color:#f3f7ff; font-size:13px; outline:none; box-sizing:border-box; }
  .pos-cliente-item { padding:10px 14px; cursor:pointer; transition:background .12s; }
  .pos-cliente-item:hover { background:rgba(59,130,246,0.12); }
  .pos-cliente-item-name { font-size:12px; font-weight:700; color:#f3f7ff; }
  .pos-cliente-item-id { font-size:10px; color:#6b80a5; }

  /* Modal selector cliente */
  .pos-cli-overlay { position:fixed; inset:0; background:rgba(4,8,18,0.84); z-index:2000; display:flex; align-items:center; justify-content:center; padding:16px; }
  .pos-cli-modal { background:#111a2e; border:1px solid rgba(137,160,201,0.18); border-radius:22px; width:min(560px,96vw); max-height:88vh; display:flex; flex-direction:column; box-shadow:0 40px 100px rgba(0,0,0,0.6); overflow:hidden; }
  .pos-cli-header { padding:16px 20px 12px; border-bottom:1px solid rgba(137,160,201,0.12); display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
  .pos-cli-title { font-size:15px; font-weight:900; color:#f3f7ff; }
  .pos-cli-close { background:none; border:none; color:#5c7099; font-size:20px; cursor:pointer; line-height:1; padding:0; }
  .pos-cli-close:hover { color:#c8d6f2; }
  .pos-cli-tabs { display:flex; gap:0; border-bottom:1px solid rgba(137,160,201,0.12); flex-shrink:0; }
  .pos-cli-tab { flex:1; padding:10px 8px; background:transparent; border:none; border-bottom:2px solid transparent; color:#5c7099; font-size:12px; font-weight:700; cursor:pointer; transition:all .15s; text-align:center; }
  .pos-cli-tab.active { color:#93c5fd; border-bottom-color:#3b82f6; }
  .pos-cli-tab:hover:not(.active) { color:#c8d6f2; background:rgba(137,160,201,0.05); }
  .pos-cli-body { flex:1; overflow:hidden; display:flex; flex-direction:column; min-height:0; }
  .pos-cli-footer { flex-shrink:0; border-top:1px solid rgba(137,160,201,0.14); background:#0d1525; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
  .pos-cli-footer-info { display:flex; flex-direction:column; gap:4px; }
  .pos-cli-footer-nombre { font-size:14px; font-weight:800; color:#f3f7ff; }
  .pos-cli-footer-cedula { font-size:11px; font-weight:700; color:#7f92b5; font-family:monospace; }
  .pos-cli-footer-fields { display:flex; gap:8px; }
  .pos-cli-footer-field { flex:1; display:flex; flex-direction:column; gap:4px; }
  .pos-cli-footer-label { font-size:9px; font-weight:700; color:#5c7099; text-transform:uppercase; letter-spacing:.07em; }
  .pos-cli-footer-input { padding:7px 10px; background:rgba(137,160,201,0.07); border:1px solid rgba(137,160,201,0.2); border-radius:8px; color:#c8d6f2; font-size:12px; outline:none; width:100%; box-sizing:border-box; }
  .pos-cli-footer-input:focus { border-color:#3b82f6; }
  .pos-cli-footer-actions { display:flex; gap:8px; }
  .pos-cli-footer-cancel { flex:1; padding:9px; border:1px solid rgba(137,160,201,0.2); border-radius:10px; background:transparent; color:#7f92b5; font-size:12px; font-weight:700; cursor:pointer; }
  .pos-cli-footer-cancel:hover { color:#c8d6f2; border-color:rgba(137,160,201,0.4); }
  .pos-cli-footer-apply { flex:2; padding:9px; border:none; border-radius:10px; background:linear-gradient(135deg,#059669,#10b981); color:#fff; font-size:13px; font-weight:800; cursor:pointer; }
  .pos-cli-footer-apply:hover { opacity:.9; }
  .pos-cli-search-wrap { padding:12px 16px 8px; flex-shrink:0; position:relative; }
  .pos-cli-search { width:100%; padding:10px 36px 10px 14px; background:#172131; border:1.5px solid rgba(137,160,201,0.22); border-radius:11px; color:#f3f7ff; font-size:14px; outline:none; box-sizing:border-box; }
  .pos-cli-search:focus { border-color:#3b82f6; }
  .pos-cli-search::placeholder { color:#4a5e7e; }
  .pos-cli-search.warn { border-color:#f59e0b; animation:pos-cli-shake .3s ease; }
  .pos-cli-clear { position:absolute; right:24px; top:50%; transform:translateY(-50%); background:none; border:none; color:#4a5e7e; cursor:pointer; font-size:16px; padding:4px; line-height:1; }
  .pos-cli-clear:hover { color:#ef4444; }
  .pos-cli-warn { margin:0 16px 8px; padding:8px 12px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:9px; color:#fbbf24; font-size:12px; font-weight:600; text-align:center; }
  @keyframes pos-cli-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
  .pos-cli-list { flex:1; overflow-y:auto; padding:4px 10px 10px; }
  .pos-cli-list::-webkit-scrollbar { width:10px; }
  .pos-cli-list::-webkit-scrollbar-track { background:rgba(137,160,201,0.08); border-radius:999px; }
  .pos-cli-list::-webkit-scrollbar-thumb { background:linear-gradient(180deg, rgba(148,163,184,0.9), rgba(100,116,139,0.9)); border-radius:999px; border:2px solid rgba(17,26,46,0.95); }
  .pos-cli-list { scrollbar-width:thin; scrollbar-color:rgba(148,163,184,0.9) rgba(137,160,201,0.08); }
  .pos-cli-row { display:flex; align-items:center; gap:12px; padding:10px 10px; border-radius:11px; cursor:pointer; transition:background .12s; }
  .pos-cli-row:hover { background:rgba(59,130,246,0.1); }
  .pos-cli-code { font-size:10px; font-weight:800; color:#7dd3fc; background:rgba(56,189,248,0.10); padding:3px 8px; border-radius:7px; white-space:nowrap; font-family:monospace; min-width:50px; text-align:center; }
  .pos-cli-info { flex:1; min-width:0; }
  .pos-cli-name { font-size:13px; font-weight:700; color:#e2e8f4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pos-cli-sub { font-size:10px; color:#5c7099; margin-top:2px; }
  .pos-cli-empty { padding:32px; text-align:center; color:#3a4e6e; font-size:13px; }
  .pos-cli-loading { padding:32px; text-align:center; color:#5c7099; font-size:13px; }
  .pos-cli-manual { padding:14px 16px; display:flex; flex-direction:column; gap:12px; }
  .pos-cli-field-label { font-size:10px; font-weight:700; color:#5c7099; text-transform:uppercase; letter-spacing:.07em; margin-bottom:5px; }
  .pos-cli-field-input { width:100%; padding:10px 13px; background:#172131; border:1.5px solid rgba(137,160,201,0.22); border-radius:10px; color:#f3f7ff; font-size:14px; outline:none; box-sizing:border-box; }
  .pos-cli-field-input:focus { border-color:#3b82f6; }
  .pos-cli-field-input.warn { border-color:#f59e0b; animation:pos-cli-shake .3s ease; }
  .pos-cli-confirm-btn { padding:11px; border:none; border-radius:11px; background:linear-gradient(135deg,#059669,#10b981); color:#fff; font-size:14px; font-weight:800; cursor:pointer; transition:opacity .15s; }
  .pos-cli-confirm-btn:hover { opacity:.9; }
  .pos-cli-confirm-btn:disabled { opacity:.5; cursor:not-allowed; }
  .pos-buscador-meta { display:none; }

  /* Toast FE */
  @keyframes pos-toast-in { from { transform:translateY(16px); opacity:0 } to { transform:translateY(0); opacity:1 } }
  .pos-fe-toast { position:fixed; bottom:28px; right:28px; z-index:9999; background:linear-gradient(135deg,#0d1f3c,#0a2318); border:1px solid rgba(56,189,248,0.25); border-radius:14px; padding:13px 18px; display:flex; align-items:center; gap:11px; box-shadow:0 8px 32px rgba(0,0,0,0.55),0 0 0 1px rgba(34,197,94,0.1); animation:pos-toast-in .25s ease; pointer-events:none; }
  .pos-fe-toast-icon { font-size:20px; line-height:1; }
  .pos-fe-toast-body { display:flex; flex-direction:column; gap:2px; }
  .pos-fe-toast-title { font-size:12px; font-weight:800; color:#38bdf8; }
  .pos-fe-toast-sub { font-size:11px; color:#7dd3fc; }

  /* Carrito */
  .pos-cart-lines { flex:1; overflow-y:auto; padding:8px 14px; }
  .pos-cart-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#2d3e5e; gap:8px; }
  .pos-cart-empty-icon { font-size:40px; }
  .pos-cart-line { display:flex; align-items:center; gap:6px; padding:8px 0; border-bottom:1px solid rgba(137,160,201,0.08); }
  .pos-cart-line:last-child { border-bottom:none; }
  .pos-cart-line-info { flex:1; min-width:0; }
  .pos-cart-line-name { font-size:12px; font-weight:700; color:#e2e8f4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pos-cart-line-meta { font-size:10px; color:#5c7099; margin-top:2px; }
  .pos-cart-line-price { font-size:13px; font-weight:800; color:#34d399; white-space:nowrap; min-width:72px; text-align:right; }
  .pos-qty-ctrl { display:flex; align-items:center; gap:4px; }
  .pos-qty-btn { width:26px; height:26px; border-radius:8px; border:1px solid rgba(137,160,201,0.20); background:#1a2740; color:#c8d6f2; font-size:14px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .12s; }
  .pos-qty-btn:hover { background:#243456; }
  .pos-qty-input { width:44px; height:26px; border-radius:8px; border:1px solid rgba(137,160,201,0.22); background:#172131; color:#f3f7ff; font-size:13px; font-weight:700; text-align:center; outline:none; }
  .pos-qty-input:focus { border-color:#3b82f6; }
  .pos-del-btn { background:none; border:none; color:#3a4e6e; cursor:pointer; font-size:15px; padding:4px; line-height:1; border-radius:6px; transition:color .12s, background .12s; }
  .pos-del-btn:hover { color:#ef4444; background:rgba(239,68,68,0.1); }
  .pos-desc-ctrl { display:flex; align-items:center; gap:2px; }
  .pos-desc-label { font-size:10px; color:#f59e0b; font-weight:700; }
  .pos-desc-input { width:44px; height:26px; border-radius:8px; border:1px solid rgba(245,158,11,0.4); background:#1a1f2e; color:#f59e0b; font-size:12px; font-weight:700; text-align:center; outline:none; padding:0 2px; }
  .pos-desc-input::-webkit-outer-spin-button, .pos-desc-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
  .pos-desc-input[type=number] { -moz-appearance:textfield; }
  .pos-desc-input:focus { border-color:#f59e0b; box-shadow:0 0 0 2px rgba(245,158,11,0.15); }

  /* Totales */
  .pos-totals { padding:12px 16px; border-top:1px solid rgba(137,160,201,0.12); background:#0e1829; }
  .pos-total-row { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#7f92b5; margin-bottom:4px; }
  .pos-total-row.main { font-size:18px; font-weight:900; color:#f3f7ff; margin-top:8px; margin-bottom:0; }
  .pos-total-row.main span:last-child { color:#34d399; }

  /* Pago */
  .pos-pay-area { padding:12px 14px 14px; border-top:1px solid rgba(137,160,201,0.10); }
  .pos-pay-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#5c7099; font-weight:800; margin-bottom:8px; }
  .pos-pay-tabs { display:flex; gap:6px; margin-bottom:10px; }
  .pos-pay-tab { flex:1; padding:8px 4px; border-radius:10px; border:1px solid rgba(137,160,201,0.18); background:transparent; color:#7f92b5; font-size:11px; font-weight:800; cursor:pointer; transition:all .15s; text-align:center; }
  .pos-pay-tab.sel { background:#1e3a8a; border-color:#3b82f6; color:#bfdbfe; }
  .pos-cobrar-btn { width:100%; padding:14px; border:none; border-radius:14px; background:linear-gradient(135deg,#059669,#10b981); color:#fff; font-size:16px; font-weight:900; cursor:pointer; transition:filter .15s, transform .12s; letter-spacing:-.01em; }
  .pos-cobrar-btn:hover { filter:brightness(1.08); transform:translateY(-1px); }
  .pos-cobrar-btn:active { transform:scale(.98); }
  .pos-cobrar-btn:disabled { opacity:.5; cursor:default; transform:none; filter:none; }

  /* Modal cobro */
  .pos-overlay { position:fixed; inset:0; background:rgba(6,10,20,0.78); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px; }
  .pos-modal { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:20px; padding:26px; width:min(420px,92vw); box-shadow:0 30px 80px rgba(0,0,0,.5); }
  .pos-modal-title { font-size:18px; font-weight:900; color:#f3f7ff; margin-bottom:6px; }
  .pos-modal-total { font-size:28px; font-weight:900; color:#34d399; margin-bottom:20px; }
  .pos-modal-label { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#5c7099; font-weight:800; margin-bottom:6px; display:block; }
  .pos-modal-input { width:100%; padding:12px 14px; background:#1d2738; border:1px solid rgba(137,160,201,0.22); border-radius:12px; color:#f3f7ff; font-size:16px; font-weight:700; outline:none; box-sizing:border-box; }
  .pos-modal-input:focus { border-color:#3b82f6; }
  .pos-modal-cambio { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:#0f1e32; border-radius:12px; margin-top:12px; }
  .pos-modal-cambio-label { font-size:12px; color:#7f92b5; font-weight:700; }
  .pos-modal-cambio-val { font-size:20px; font-weight:900; color:#f3f7ff; }
  .pos-modal-actions { display:flex; gap:10px; margin-top:20px; }
  .pos-modal-cancel { flex:1; padding:12px; border:1px solid rgba(137,160,201,0.18); border-radius:12px; background:transparent; color:#7f92b5; font-size:14px; font-weight:700; cursor:pointer; }
  .pos-modal-confirm { flex:2; padding:12px; border:none; border-radius:12px; background:linear-gradient(135deg,#059669,#10b981); color:#fff; font-size:15px; font-weight:900; cursor:pointer; transition:filter .15s; }
  .pos-modal-confirm:hover { filter:brightness(1.08); }
  .pos-modal-confirm:disabled { opacity:.5; cursor:default; filter:none; }
  .pos-msg-ok { padding:10px 14px; background:#0f2c20; border:1px solid #1d6e4f; border-radius:10px; color:#9df4c7; font-size:12px; font-weight:700; margin-top:12px; }
  .pos-msg-err { padding:10px 14px; background:#34181c; border:1px solid #7d2f3a; border-radius:10px; color:#ffb3bb; font-size:12px; font-weight:700; margin-top:12px; }

  /* FE chips */
  .pos-fe-chips { display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; }
  .pos-fe-chip { padding:5px 10px; border-radius:8px; border:1px solid rgba(137,160,201,0.18); background:#1a2740; color:#7f92b5; font-size:11px; font-weight:700; cursor:pointer; transition:all .15s; }
  .pos-fe-chip.sel { background:#1e3a8a; border-color:#3b82f6; color:#bfdbfe; }

  /* Modal buscador */
  .pos-buscador-overlay { position:fixed; inset:0; background:rgba(6,10,20,0.82); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px; }
  .pos-buscador-modal { background:#111a2e; border:1px solid rgba(137,160,201,0.18); border-radius:22px; width:min(740px,96vw); max-height:90vh; display:flex; flex-direction:column; box-shadow:0 40px 100px rgba(0,0,0,.6); overflow:hidden; }
  .pos-buscador-header { padding:18px 22px 14px; border-bottom:1px solid rgba(137,160,201,0.12); flex-shrink:0; }
  .pos-buscador-title { font-size:15px; font-weight:900; color:#f3f7ff; margin-bottom:4px; }
  .pos-buscador-hint { font-size:11px; color:#5c7099; }
  .pos-buscador-input-wrap { position:relative; margin-top:12px; }
  .pos-buscador-input { width:100%; padding:13px 16px 13px 44px; background:#172131; border:2px solid rgba(59,130,246,0.45); border-radius:14px; color:#f3f7ff; font-size:15px; font-weight:600; outline:none; box-sizing:border-box; box-shadow:0 0 0 3px rgba(59,130,246,0.10); }
  .pos-buscador-icon { position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:18px; color:#4a5e7e; pointer-events:none; }
  .pos-buscador-count { position:absolute; right:14px; top:50%; transform:translateY(-50%); font-size:11px; color:#4a5e7e; }
  .pos-buscador-list { flex:1; overflow-y:auto; padding:10px 12px; }
  .pos-buscador-item { display:flex; align-items:center; gap:14px; padding:11px 14px; border-radius:14px; cursor:pointer; transition:background .12s; }
  .pos-buscador-item:hover { background:rgba(59,130,246,0.12); }
  .pos-buscador-code { font-size:11px; font-weight:800; color:#7dd3fc; background:rgba(56,189,248,0.10); padding:4px 10px; border-radius:8px; white-space:nowrap; min-width:90px; text-align:center; font-family:monospace; }
  .pos-buscador-info { flex:1; min-width:0; }
  .pos-buscador-name { font-size:13px; font-weight:700; color:#e2e8f4; }
  .pos-buscador-meta { font-size:10px; color:#5c7099; margin-top:3px; }
  .pos-buscador-price { font-size:14px; font-weight:900; color:#34d399; white-space:nowrap; }
  .pos-buscador-empty { padding:40px; text-align:center; color:#3a4e6e; font-size:13px; }

  /* Atajos */
  .pos-shortcuts { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .pos-shortcut { display:inline-flex; align-items:center; gap:5px; font-size:10px; color:#4a5e7e; }
  .pos-shortcut kbd { display:inline-block; padding:2px 6px; background:#1a2740; border:1px solid rgba(137,160,201,0.25); border-bottom-width:2px; border-radius:5px; font-size:10px; font-family:monospace; font-weight:700; color:#7f92b5; line-height:1.5; }
  .pos-shortcut-sep { width:1px; height:14px; background:rgba(137,160,201,0.12); }
  @media (max-width:768px) {
    .pos-topbar { flex-wrap:wrap; padding:8px 10px; gap:6px; }
    .pos-topbar-info { flex:1 1 100%; min-width:0; }
    .pos-topbar-title { font-size:15px; }
    .pos-topbar-empresa { font-size:11px; }
    .pos-topbar-sep, .pos-shortcuts, .pos-topbar > span { display:none; }
    .pos-topbar-btn { flex:1 1 calc(33.333% - 4px); min-width:100px; padding:8px 6px; font-size:11px; }
    .pos-recientes-block.recent-only { display:none; }
  }

  /* Historial */
  .pos-hist-panel { position:fixed; inset:0; background:rgba(6,10,20,0.78); z-index:1000; display:flex; justify-content:flex-end; }
  .pos-hist-drawer { width:min(480px,90vw); background:#111a2e; border-left:1px solid rgba(137,160,201,0.14); height:100%; overflow-y:auto; padding:20px; }
  .pos-hist-title { font-size:17px; font-weight:900; color:#f3f7ff; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; }
  .pos-hist-close { background:none; border:none; color:#5c7099; font-size:20px; cursor:pointer; }
  .pos-hist-close:hover { color:#c8d6f2; }
  .pos-hist-row { padding:10px 12px; background:#172131; border-radius:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .pos-hist-row-info { flex:1; min-width:0; }
  .pos-hist-cliente { font-size:12px; font-weight:700; color:#e2e8f4; }
  .pos-hist-ts { font-size:10px; color:#5c7099; }
  .pos-hist-total { font-size:14px; font-weight:800; color:#34d399; white-space:nowrap; }
  .pos-hist-tag { font-size:10px; padding:3px 8px; border-radius:6px; font-weight:700; }
  .pos-hist-tag.efectivo { background:#0f2c20; color:#9df4c7; }
  .pos-hist-tag.tarjeta { background:#1a2740; color:#bfdbfe; }
  .pos-hist-tag.transferencia { background:#2a1f0e; color:#fcd34d; }
  .pos-hist-tag.sinpe { background:#1a1040; color:#c4b5fd; }
  .pos-hist-print { background:none; border:1px solid rgba(167,139,250,0.3); border-radius:8px; color:#c4b5fd; font-size:11px; font-weight:700; padding:5px 10px; cursor:pointer; white-space:nowrap; transition:all .15s; }
  .pos-hist-print:hover { background:rgba(167,139,250,0.15); border-color:#a78bfa; }
  .pos-hist-dev { background:none; border:1px solid rgba(251,146,60,0.3); border-radius:8px; color:#fb923c; font-size:11px; font-weight:700; padding:5px 10px; cursor:pointer; white-space:nowrap; transition:all .15s; }
  .pos-hist-dev:hover { background:rgba(251,146,60,0.12); border-color:#fb923c; }

  /* -- Comprobantes FE -- */
  .pos-fe-panel { position:fixed; inset:0; background:rgba(6,10,20,0.78); z-index:1000; display:flex; justify-content:flex-end; }
  .pos-fe-drawer { width:min(600px,96vw); background:#111a2e; border-left:1px solid rgba(137,160,201,0.14); height:100%; overflow-y:auto; display:flex; flex-direction:column; }
  .pos-fe-header { padding:18px 20px 14px; border-bottom:1px solid rgba(137,160,201,0.1); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-shrink:0; }
  .pos-fe-title { font-size:16px; font-weight:900; color:#f3f7ff; }
  .pos-fe-close { background:none; border:none; color:#5c7099; font-size:20px; cursor:pointer; line-height:1; }
  .pos-fe-close:hover { color:#c8d6f2; }
  .pos-fe-msg { margin:8px 20px 0; font-size:12px; color:#93c5fd; background:rgba(59,130,246,0.1); border-radius:8px; padding:6px 12px; }
  .pos-fe-body { flex:1; padding:12px 16px; }
  .pos-fe-row { background:#172131; border-radius:10px; margin-bottom:8px; padding:10px 14px; display:grid; grid-template-columns:1fr auto; gap:6px; }
  .pos-fe-row-top { display:flex; align-items:center; gap:8px; min-width:0; }
  .pos-fe-tipo { font-size:10px; font-weight:800; padding:2px 7px; border-radius:5px; background:#1a2740; color:#93c5fd; flex-shrink:0; }
  .pos-fe-consec { font-size:11px; font-weight:700; color:#c8d6f2; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pos-fe-cliente { font-size:11px; color:#7f92b5; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pos-fe-total { font-size:14px; font-weight:800; color:#34d399; text-align:right; white-space:nowrap; }
  .pos-fe-fecha { font-size:10px; color:#3a4e6e; text-align:right; }
  .pos-fe-actions { grid-column:1/-1; display:flex; gap:6px; margin-top:6px; }
  .pos-fe-btn { background:none; border:1px solid rgba(137,160,201,0.2); border-radius:7px; color:#7f92b5; font-size:11px; font-weight:700; padding:4px 10px; cursor:pointer; transition:all .15s; white-space:nowrap; }
  .pos-fe-btn:hover { background:rgba(137,160,201,0.1); color:#c8d6f2; }
  .pos-fe-btn:disabled { opacity:.4; cursor:default; }
  .pos-fe-badge { font-size:10px; font-weight:800; padding:2px 8px; border-radius:5px; }

  /* -- Modal de cobro rediseÃƒÆ’Ã‚Â±ado -- */
  .pos-cobro-overlay { position:fixed; inset:0; background:rgba(4,8,18,0.82); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; }
  .pos-cobro-modal { background:#111a2e; border:1px solid rgba(137,160,201,0.18); border-radius:22px; width:min(500px,96vw); max-height:92vh; overflow-y:auto; padding:28px; display:flex; flex-direction:column; gap:18px; box-shadow:0 32px 80px rgba(0,0,0,0.6); scrollbar-width:thin; scrollbar-color:rgba(59,130,246,0.35) transparent; }
  .pos-cobro-modal::-webkit-scrollbar { width:5px; }
  .pos-cobro-modal::-webkit-scrollbar-track { background:transparent; }
  .pos-cobro-modal::-webkit-scrollbar-thumb { background:rgba(59,130,246,0.35); border-radius:999px; }
  .pos-cobro-modal::-webkit-scrollbar-thumb:hover { background:rgba(59,130,246,0.6); }
  .pos-cobro-header { text-align:center; }
  .pos-cobro-total-label { font-size:12px; font-weight:600; color:#4a5e7e; letter-spacing:.06em; text-transform:uppercase; margin-bottom:6px; }
  .pos-cobro-total-amount { font-size:42px; font-weight:900; color:#34d399; letter-spacing:-.03em; line-height:1; }
  .pos-cobro-breakdown { background:#0d1525; border-radius:12px; padding:12px 16px; display:flex; flex-direction:column; gap:4px; }
  .pos-cobro-brow { display:flex; justify-content:space-between; font-size:12px; color:#5c7099; }
  .pos-cobro-cliente { font-size:12px; color:#7f92b5; text-align:center; }
  .pos-cobro-section { display:flex; flex-direction:column; gap:8px; }
  .pos-cobro-label { font-size:11px; font-weight:700; color:#5c7099; text-transform:uppercase; letter-spacing:.06em; }
  .pos-cobro-chips { display:flex; gap:6px; }
  .pos-cobro-chip { flex:1; padding:8px 10px; border-radius:10px; border:1px solid rgba(137,160,201,0.18); background:transparent; color:#7f92b5; font-size:12px; font-weight:600; cursor:pointer; transition:all .15s; text-align:center; }
  .pos-cobro-chip.sel { background:#1e3a8a; border-color:#3b82f6; color:#bfdbfe; }
  .pos-cobro-chip:hover:not(.sel) { background:rgba(137,160,201,0.08); }
  .pos-cobro-pay-tabs { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
  .pos-cobro-pay-tab { padding:10px 6px; border-radius:12px; border:1.5px solid rgba(137,160,201,0.18); background:transparent; color:#7f92b5; font-size:12px; font-weight:700; cursor:pointer; transition:all .15s; text-align:center; }
  .pos-cobro-pay-tab.sel.efectivo  { background:#0f2c20; border-color:#22c55e; color:#86efac; }
  .pos-cobro-pay-tab.sel.sinpe     { background:#1a1040; border-color:#a78bfa; color:#c4b5fd; }
  .pos-cobro-pay-tab.sel.tarjeta   { background:#1a2740; border-color:#60a5fa; color:#bfdbfe; }
  .pos-cobro-pay-tab.sel.trans     { background:#2a1f0e; border-color:#f59e0b; color:#fcd34d; }
  .pos-cobro-pay-tab:hover:not(.sel) { background:rgba(137,160,201,0.08); }
  .pos-cobro-input { width:100%; padding:13px 16px; background:#0d1525; border:2px solid rgba(137,160,201,0.2); border-radius:12px; color:#f3f7ff; font-size:22px; font-weight:800; outline:none; text-align:right; transition:border-color .15s; }
  .pos-cobro-input:focus { border-color:#34d399; box-shadow:0 0 0 3px rgba(52,211,153,0.15); }
  .pos-cobro-input::-webkit-outer-spin-button, .pos-cobro-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
  .pos-cobro-input[type=number] { -moz-appearance:textfield; }
  .pos-cobro-ref-input { width:100%; padding:11px 14px; background:#0d1525; border:1.5px solid rgba(137,160,201,0.2); border-radius:12px; color:#e2e8f4; font-size:14px; outline:none; transition:border-color .15s; font-family:'DM Mono',monospace; letter-spacing:.04em; }
  .pos-cobro-ref-input:focus { border-color:#a78bfa; box-shadow:0 0 0 3px rgba(167,139,250,0.15); }
  .pos-cobro-quick { display:flex; gap:6px; flex-wrap:wrap; }
  .pos-cobro-quick-btn { padding:7px 12px; border-radius:9px; border:1px solid rgba(52,211,153,0.25); background:rgba(52,211,153,0.06); color:#6ee7b7; font-size:12px; font-weight:700; cursor:pointer; transition:all .15s; font-family:'DM Mono',monospace; }
  .pos-cobro-quick-btn:hover { background:rgba(52,211,153,0.14); border-color:#34d399; }
  .pos-cobro-cambio { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#0d1525; border-radius:10px; }
  .pos-cobro-cambio-label { font-size:12px; color:#5c7099; font-weight:600; }
  .pos-cobro-cambio-val { font-size:18px; font-weight:900; color:#fbbf24; }
  .pos-cobro-ok { background:#0f2c20; border:1px solid rgba(52,211,153,0.3); border-radius:12px; padding:12px 16px; color:#86efac; font-size:13px; font-weight:700; text-align:center; }
  .pos-cobro-err { background:#2c0f0f; border:1px solid rgba(248,113,113,0.3); border-radius:12px; padding:12px 16px; color:#fca5a5; font-size:13px; font-weight:700; text-align:center; }
  .pos-cobro-actions { display:flex; gap:10px; }
  .pos-cobro-cancel { flex:1; padding:13px; border-radius:12px; border:1px solid rgba(137,160,201,0.2); background:transparent; color:#7f92b5; font-size:14px; font-weight:700; cursor:pointer; transition:all .15s; }
  .pos-cobro-cancel:hover { background:rgba(137,160,201,0.08); }
  .pos-cobro-confirm { flex:2; padding:13px; border-radius:12px; border:none; background:linear-gradient(135deg,#16a34a,#22c55e); color:white; font-size:14px; font-weight:800; cursor:pointer; transition:all .15s; }
  .pos-cobro-confirm:hover { opacity:.92; }
  .pos-cobro-confirm:disabled { opacity:.5; cursor:not-allowed; }
  .pos-cobro-print { flex:2; padding:13px; border-radius:12px; border:1.5px solid rgba(167,139,250,0.35); background:rgba(167,139,250,0.1); color:#c4b5fd; font-size:14px; font-weight:800; cursor:pointer; transition:all .15s; }
  .pos-cobro-print:hover { background:rgba(167,139,250,0.18); }
  .pos-cobro-close { flex:1; padding:13px; border-radius:12px; border:1px solid rgba(52,211,153,0.25); background:rgba(52,211,153,0.06); color:#6ee7b7; font-size:14px; font-weight:700; cursor:pointer; transition:all .15s; }
  .pos-cobro-close:hover { background:rgba(52,211,153,0.12); }

  /* -- Apertura de turno -- */
  .pos-apertura-overlay { position:fixed; inset:0; background:rgba(4,8,18,0.88); z-index:2000; display:flex; align-items:center; justify-content:center; padding:16px; }
  .pos-apertura-card { background:#111a2e; border:1px solid rgba(137,160,201,0.2); border-radius:22px; width:min(520px,96vw); padding:30px; box-shadow:0 32px 80px rgba(0,0,0,0.6); display:flex; flex-direction:column; gap:16px; }
  .pos-apertura-title { font-size:18px; font-weight:900; color:#f3f7ff; }
  .pos-apertura-meta { font-size:12px; color:#5c7099; }
  .pos-apertura-label { font-size:11px; font-weight:700; color:#5c7099; text-transform:uppercase; letter-spacing:.07em; margin-bottom:6px; }
  .pos-apertura-input { width:100%; padding:14px 16px; background:#0d1525; border:2px solid rgba(137,160,201,0.2); border-radius:12px; color:#f3f7ff; font-size:18px; font-weight:800; outline:none; text-align:right; transition:border-color .15s; overflow:hidden; text-overflow:ellipsis; }
  .pos-apertura-input:focus { border-color:#34d399; box-shadow:0 0 0 3px rgba(52,211,153,0.12); }
  .pos-apertura-btn { padding:13px; border:none; border-radius:12px; background:linear-gradient(135deg,#059669,#10b981); color:white; font-size:15px; font-weight:800; cursor:pointer; transition:opacity .15s; }
  .pos-apertura-btn:hover { opacity:.9; }
  .pos-apertura-btn:disabled { opacity:.5; cursor:not-allowed; }

  /* -- Cierre de turno -- */
  .pos-cierre-panel { position:fixed; inset:0; background:rgba(4,8,18,0.78); z-index:1500; display:flex; justify-content:flex-end; }
  .pos-cierre-drawer { width:min(460px,96vw); background:#111a2e; border-left:1px solid rgba(137,160,201,0.14); height:100%; overflow-y:auto; display:flex; flex-direction:column; scrollbar-width:thin; scrollbar-color:rgba(59,130,246,0.25) transparent; }
  .pos-cierre-drawer::-webkit-scrollbar { width:4px; }
  .pos-cierre-drawer::-webkit-scrollbar-track { background:transparent; }
  .pos-cierre-drawer::-webkit-scrollbar-thumb { background:rgba(59,130,246,0.3); border-radius:999px; }
  .pos-hist-drawer::-webkit-scrollbar { width:4px; }
  .pos-hist-drawer::-webkit-scrollbar-track { background:transparent; }
  .pos-hist-drawer::-webkit-scrollbar-thumb { background:rgba(59,130,246,0.3); border-radius:999px; }
  .pos-cierre-head { padding:22px 22px 16px; border-bottom:1px solid rgba(137,160,201,0.12); flex-shrink:0; display:flex; justify-content:space-between; align-items:flex-start; }
  .pos-cierre-head-info { flex:1; }
  .pos-cierre-title { font-size:17px; font-weight:900; color:#f3f7ff; }
  .pos-cierre-subtitle { font-size:11px; color:#5c7099; margin-top:3px; }
  .pos-cierre-close-btn { background:none; border:none; color:#5c7099; font-size:20px; cursor:pointer; padding:0; }
  .pos-cierre-close-btn:hover { color:#c8d6f2; }
  .pos-cierre-body { flex:1; padding:20px 22px; display:flex; flex-direction:column; gap:16px; }
  .pos-cierre-section-title { font-size:10px; font-weight:800; color:#3a4e6e; text-transform:uppercase; letter-spacing:.1em; margin-bottom:6px; }
  .pos-cierre-row { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(137,160,201,0.07); }
  .pos-cierre-row:last-child { border-bottom:none; }
  .pos-cierre-row-label { font-size:13px; color:#7f92b5; display:flex; align-items:center; gap:8px; }
  .pos-cierre-row-val { font-size:13px; font-weight:700; color:#e2e8f4; }
  .pos-cierre-total-row { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#0d1525; border-radius:10px; }
  .pos-cierre-total-label { font-size:13px; font-weight:700; color:#7f92b5; }
  .pos-cierre-total-val { font-size:20px; font-weight:900; color:#34d399; }
  .pos-cierre-box { background:#0d1525; border-radius:12px; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
  .pos-cierre-contado-input { width:100%; padding:12px 14px; background:#172131; border:2px solid rgba(137,160,201,0.2); border-radius:10px; color:#f3f7ff; font-size:20px; font-weight:800; outline:none; text-align:right; transition:border-color .15s; -moz-appearance:textfield; }
  .pos-cierre-contado-input:focus { border-color:#34d399; box-shadow:0 0 0 3px rgba(52,211,153,0.1); }
  .pos-cierre-contado-input::-webkit-outer-spin-button, .pos-cierre-contado-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
  .pos-cierre-diferencia { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-radius:8px; }
  .pos-cierre-diferencia.ok { background:rgba(52,211,153,0.08); }
  .pos-cierre-diferencia.mal { background:rgba(239,68,68,0.08); }
  .pos-cierre-diferencia-label { font-size:12px; font-weight:700; color:#7f92b5; }
  .pos-cierre-diferencia-val { font-size:16px; font-weight:900; }
  .pos-cierre-diferencia.ok .pos-cierre-diferencia-val { color:#34d399; }
  .pos-cierre-diferencia.mal .pos-cierre-diferencia-val { color:#f87171; }
  .pos-cierre-notas { width:100%; padding:10px 12px; background:#172131; border:1.5px solid rgba(137,160,201,0.18); border-radius:10px; color:#e2e8f4; font-size:13px; resize:none; outline:none; font-family:inherit; box-sizing:border-box; }
  .pos-cierre-notas:focus { border-color:#3b82f6; }
  .pos-cierre-footer { padding:16px 22px; border-top:1px solid rgba(137,160,201,0.10); display:flex; gap:10px; flex-shrink:0; }
  .pos-cierre-btn-print { flex:1; padding:12px; border:1.5px solid rgba(167,139,250,0.3); border-radius:11px; background:rgba(167,139,250,0.08); color:#c4b5fd; font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; }
  .pos-cierre-btn-print:hover { background:rgba(167,139,250,0.16); }
  .pos-cierre-btn-cerrar { flex:2; padding:12px; border:none; border-radius:11px; background:linear-gradient(135deg,#dc2626,#ef4444); color:white; font-size:14px; font-weight:800; cursor:pointer; transition:opacity .15s; }
  .pos-cierre-btn-cerrar:hover { opacity:.88; }
  .pos-cierre-btn-cerrar:disabled { opacity:.5; cursor:not-allowed; }
  .pos-overlay,
  .pos-buscador-overlay,
  .pos-cli-overlay,
  .pos-cobro-overlay,
  .pos-apertura-overlay {
    padding-top:calc(16px + env(safe-area-inset-top));
    padding-right:calc(16px + env(safe-area-inset-right));
    padding-bottom:calc(16px + env(safe-area-inset-bottom));
    padding-left:calc(16px + env(safe-area-inset-left));
  }
  .pos-hist-drawer,
  .pos-fe-drawer,
  .pos-cierre-drawer {
    padding-bottom:calc(20px + env(safe-area-inset-bottom));
  }
`

// --- Componente principal -----------------------------------------------------

export default function POSPage({ empresaId, empresaNombre, userName, token, terminal, onLogout, onResetTerminal }: {
  empresaId: number
  empresaNombre: string
  userName: string
  token: string
  terminal: TerminalConfig
  onLogout?: () => void
  onResetTerminal?: () => void
}) {
  const abrirVistaPreviaTiquete = (html: string, _titulo = 'Tiquete', emailCliente = '', ventaId: number | null = null) => {
    const barra = `
<div id="tq-bar" style="position:fixed;bottom:0;left:0;right:0;display:flex;gap:8px;padding:10px 12px;background:#1e293b;border-top:2px solid #334155;z-index:999;">
  <button onclick="window.print()" style="flex:2;background:#22c55e;color:#fff;border:none;border-radius:8px;padding:10px 0;font-size:14px;font-weight:800;cursor:pointer;font-family:sans-serif;">Ã°Å¸â€“Â¨ Imprimir</button>
  <button onclick="document.getElementById('tq-email-row').style.display=document.getElementById('tq-email-row').style.display==='none'?'flex':'none'" style="flex:1;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:10px 0;font-size:14px;font-weight:800;cursor:pointer;font-family:sans-serif;">Ã¢Å“â€° Email</button>
  <button onclick="window.close()" style="flex:1;background:#475569;color:#fff;border:none;border-radius:8px;padding:10px 0;font-size:13px;font-weight:700;cursor:pointer;font-family:sans-serif;">Ã¢Å“â€¢</button>
</div>
<div id="tq-email-row" style="display:none;position:fixed;bottom:58px;left:0;right:0;padding:8px 12px;background:#0f172a;border-top:1px solid #334155;gap:6px;z-index:999;align-items:center;">
  <input id="tq-email-inp" type="email" placeholder="correo@ejemplo.com" value="${emailCliente}" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#f1f5f9;font-size:13px;font-family:sans-serif;outline:none;" />
  <button onclick="enviarEmail()" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:sans-serif;white-space:nowrap;">Enviar</button>
</div>
<div id="tq-email-msg" style="display:none;position:fixed;bottom:58px;left:0;right:0;padding:10px 16px;text-align:center;font-family:sans-serif;font-size:13px;font-weight:700;z-index:999;"></div>
<style>@media print { #tq-bar, #tq-email-row, #tq-email-msg { display:none !important; } body { padding-bottom:0 !important; } }</style>
<script>
var _ventaId = ${ventaId || 'null'};
function enviarEmail() {
  var email = document.getElementById('tq-email-inp').value.trim();
  if (!email) { alert('Ingrese un correo'); return; }
  var btn = document.getElementById('tq-email-row').querySelector('button');
  btn.disabled = true; btn.textContent = 'Enviando...';
  fetch(window._apiUrl + '/api/pos/ventas/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window._token },
    body: JSON.stringify({ email: email, venta_id: _ventaId })
  }).then(function(r){ return r.json(); }).then(function(j){
    var msg = document.getElementById('tq-email-msg');
    msg.style.display = 'block';
    msg.style.background = j.ok ? '#14532d' : '#7f1d1d';
    msg.style.color = j.ok ? '#86efac' : '#fca5a5';
    msg.textContent = j.ok ? ('Enviado a ' + email) : ('Error: ' + (j.error || 'No se pudo enviar'));
    document.getElementById('tq-email-row').style.display = 'none';
    btn.disabled = false; btn.textContent = 'Enviar';
    setTimeout(function(){ msg.style.display='none'; }, 4000);
  }).catch(function(){ btn.disabled=false; btn.textContent='Enviar'; alert('Error de conexiÃƒÆ’Ã‚Â³n'); });
}
document.addEventListener('keydown', function(e){ if(e.key==='Escape') window.close(); });
</script>`
    const htmlConBarra = html.replace('</body>', barra + '</body>')
    const win = window.open('', '_blank', 'width=420,height=740,toolbar=no,menubar=no,scrollbars=yes')
    if (win) {
      win.document.write(htmlConBarra)
      win.document.close()
      win.focus()
      ;(win as any)._apiUrl = API
      ;(win as any)._token = token
    }
  }

  const barcodeRef = useRef<HTMLInputElement>(null)
  const buscadorInputRef = useRef<HTMLInputElement>(null)
  const [searchFlash, setSearchFlash] = useState(false)
  const [buscadorOpen, setBuscadorOpen] = useState(false)
  const [buscadorQ, setBuscadorQ] = useState('')
  const [buscadorResultados, setBuscadorResultados] = useState<Producto[]>([])
  const [buscadorCargando, setBuscadorCargando] = useState(false)

  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Producto[]>([])
  const [buscando, setBuscando] = useState(false)
  const [recientes, setRecientes] = useState<Producto[]>([])
  const [recientesErr, setRecientesErr] = useState('')
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [tipoPago, setTipoPago] = useState<TipoPago>('efectivo')
  const [tipoDoc, setTipoDoc] = useState<'tiquete' | 'factura'>('tiquete')
  const [cliente, setCliente] = useState<Cliente | null>(null)
  // Modal selector de cliente (nuevo)
  const [cliModalOpen, setCliModalOpen] = useState(false)
  const [cliTab, setCliTab] = useState<'credito' | 'bitacora' | 'contado'>('credito')
  const [cliCreditoQ, setCliCreditoQ] = useState('')
  const [cliCreditoBaseRows, setCliCreditoBaseRows] = useState<ClienteCredito[]>([])
  const [cliCreditoRows, setCliCreditoRows] = useState<ClienteCredito[]>([])
  const [cliCreditoLoading, setCliCreditoLoading] = useState(false)
  const [cliContadoCedula, setCliContadoCedula] = useState('')
  const [cliContadoNombre, setCliContadoNombre] = useState('')
  const [cliContadoEmail, setCliContadoEmail] = useState('')
  const [cliContadoTelefono, setCliContadoTelefono] = useState('')
  const [cliContadoConsultando, setCliContadoConsultando] = useState(false)
  const [cliContadoMhOk, setCliContadoMhOk] = useState(false) // datos cargados desde MH/bitÃƒÆ’Ã‚Â¡cora
  const [cliContadoMhMsg, setCliContadoMhMsg] = useState('')
  const [cliSeleccionado, setCliSeleccionado] = useState<Cliente | null>(null) // paso de confirmaciÃƒÆ’Ã‚Â³n
  const [cliEditEmail, setCliEditEmail] = useState('')       // editable en panel de confirmaciÃƒÆ’Ã‚Â³n
  const [cliEditTelefono, setCliEditTelefono] = useState('') // editable en panel de confirmaciÃƒÆ’Ã‚Â³n
  const [cliWarn, setCliWarn] = useState('')           // mensaje warning temporal
  const [cliSearchShake, setCliSearchShake] = useState(false)
  const [creditoEvaluado, setCreditoEvaluado] = useState<{
    bloqueado: boolean
    motivo_cajero: string
    dias_credito: number
    tiene_vencido: boolean
    puede_credito: boolean
  } | null>(null)
  const cliSearchRef = useRef<HTMLInputElement>(null)
  const cliContadoRef = useRef<HTMLInputElement>(null)
  const [pagoModal, setPagoModal] = useState(false)
  const [montoRecibido, setMontoRecibido] = useState('')
  const [referencia, setReferencia] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msgOk, setMsgOk] = useState('')
  const [msgErr, setMsgErr] = useState('')
  const [alertaMsg, setAlertaMsg] = useState('')
  const [histOpen, setHistOpen] = useState(false)
  const [histVentas, setHistVentas] = useState<any[]>([])
  const [devModalOpen, setDevModalOpen] = useState(false)
  const [devVentaId, setDevVentaId] = useState<number | null>(null)
  const [devMsg, setDevMsg] = useState('')
  const [feOpen, setFeOpen] = useState(false)
  const [feDocs, setFeDocs] = useState<any[]>([])
  const [feLoading, setFeLoading] = useState(false)
  const [feBusyId, setFeBusyId] = useState<number | null>(null)
  const [feMsg, setFeMsg] = useState('')
  const [feEmailModal, setFeEmailModal] = useState<{ doc: any } | null>(null)
  const [feEmailInput, setFeEmailInput] = useState('')
  const [feToast, setFeToast] = useState<string | null>(null) // email destino, null = oculto

  // SesiÃƒÆ’Ã‚Â³n (turno de caja)
  const [sesion, setSesion] = useState<{ id: number; apertura_at: string; monto_inicial: number } | null>(null)
  const [sesionCargando, setSesionCargando] = useState(true)
  const [aperturaOpen, setAperturaOpen] = useState(false)
  const [montoInicial, setMontoInicial] = useState('0')
  const [abriendo, setAbriendo] = useState(false)
  const [aperturaError, setAperturaError] = useState('')
  const [cierreOpen, setCierreOpen] = useState(false)
  const [resumen, setResumen] = useState<{
    monto_inicial: number; apertura_at: string; cajero_nombre: string
    num_ventas: number; total_ventas: number
    total_efectivo: number; total_sinpe: number; total_tarjeta: number; total_transferencia: number
    total_cambio: number; efectivo_esperado: number
  } | null>(null)
  const [efectivoContado, setEfectivoContado] = useState('')
  const [cierreNotas, setCierreNotas] = useState('')
  const [cerrando, setCerrando] = useState(false)
  const [editarMontoOpen, setEditarMontoOpen] = useState(false)
  const [montoEditado, setMontoEditado] = useState('')
  const [historiaCierres, setHistoriaCierres] = useState<any[]>([])
  const [historialOpen, setHistorialOpen] = useState(false)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const [tiqueteData, setTiqueteData] = useState<{
    ventaId: number; carrito: typeof carrito; cliente: typeof cliente
    tipoPago: TipoPago; tipoDoc?: 'tiquete' | 'factura'; referencia: string; montoRecibido: string
    subtotal: number; descuento: number; gravado: number; exento: number; iva: number; total: number
    feClave?: string; feConsecutivo?: string | number; feEstado?: string; feError?: string
  } | null>(null)

  // Totales
  const subtotal = carrito.reduce((s, l) => s + l.cantidad * l.precio_unit, 0)
  const descuento = carrito.reduce((s, l) => s + (l.cantidad * l.precio_unit * l.descuento_pct / 100), 0)
  const gravado = carrito.reduce((s, l) => s + l.gravado, 0)
  const exento = carrito.reduce((s, l) => s + l.exento, 0)
  const iva = carrito.reduce((s, l) => s + l.iva_monto, 0)
  const total = carrito.reduce((s, l) => s + l.total, 0)
  const cambio = tipoPago === 'efectivo' ? Math.max(0, Number(montoRecibido || 0) - total) : 0

  const authHeaders = useCallback((): Record<string, string> => {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  }, [token])

  // Cargar sesiÃƒÆ’Ã‚Â³n activa al montar
  useEffect(() => {
    const cargar = async () => {
      setSesionCargando(true)
      try {
        const resp = await fetch(`${API}/api/pos/sesion/activa?caja_id=${terminal.cajaId}`, {
          headers: authHeaders(),
        })
        const json = await resp.json()
        if (json.ok && json.sesion) {
          setSesion(json.sesion)
        } else {
          setAperturaOpen(true)
        }
      } catch {
        setAperturaOpen(true)
      }
      setSesionCargando(false)
    }
    void cargar()
  }, [terminal.cajaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirTurno = async () => {
    setAbriendo(true)
    setAperturaError('')
    try {
      const resp = await fetch(`${API}/api/pos/sesion/abrir`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          empresa_id: empresaId,
          caja_id: terminal.cajaId,
          cajero_nombre: userName,
          monto_inicial: Number(montoInicial) || 0,
        }),
      })
      const json = await resp.json()
      if (json.ok) {
        setSesion(json.sesion)
        setAperturaOpen(false)
        setMontoInicial('0')
      } else {
        setAperturaError(json.error || 'Error al abrir el turno')
      }
    } catch {
      setAperturaError('No se pudo conectar con el servidor. Verifique que el servidor estÃƒÆ’Ã‚Â© corriendo.')
    }
    setAbriendo(false)
  }

  const abrirCierre = async () => {
    if (!sesion) return
    try {
      const resp = await fetch(`${API}/api/pos/sesion/${sesion.id}/resumen`, {
        headers: authHeaders(),
      })
      const json = await resp.json()
      if (json.ok) {
        setResumen(json.resumen)
        setEfectivoContado(String(json.resumen.efectivo_esperado.toFixed(2)))
        setCierreNotas('')
        setCierreOpen(true)
      }
    } catch {}
  }

  const cerrarTurno = async () => {
    if (!sesion || !resumen) return
    setCerrando(true)
    try {
      const resp = await fetch(`${API}/api/pos/sesion/cerrar`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          sesion_id: sesion.id,
          efectivo_contado: Number(efectivoContado) || 0,
          notas: cierreNotas.trim() || null,
        }),
      })
      const json = await resp.json()
      if (json.ok) {
        setCierreOpen(false)
        setSesion(null)
        setCarrito([])
        setCliente(null)
        setResumen(null)
        setAperturaOpen(true)
        setMontoInicial('0')
      }
    } catch {}
    setCerrando(false)
  }

  const imprimirCierre = () => {
    if (!resumen || !sesion) return
    const fecha = new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const apertura = new Date(resumen.apertura_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const contado = Number(efectivoContado) || 0
    const diferencia = contado - resumen.efectivo_esperado
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cierre de turno</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Courier New',monospace; font-size:12px; width:80mm; padding:6mm 4mm; }
.c { text-align:center; } .b { font-weight:bold; } .hr { border-top:1px dashed #000; margin:5px 0; }
.row { display:flex; justify-content:space-between; margin:2px 0; }
@media print { body { margin:0; } @page { size:80mm auto; margin:0; } }</style></head><body>
<div class="c b" style="font-size:14px">${empresaNombre}</div>
<div class="c" style="font-size:10px;margin-top:2px">CIERRE DE TURNO</div>
<div class="hr"></div>
<div class="row"><span>Sucursal:</span><span>${terminal.sucursalNombre}</span></div>
<div class="row"><span>Caja:</span><span>${terminal.cajaNombre}</span></div>
<div class="row"><span>Cajero:</span><span>${userName}</span></div>
<div class="row"><span>Apertura:</span><span>${apertura}</span></div>
<div class="row"><span>Cierre:</span><span>${fecha}</span></div>
<div class="hr"></div>
<div class="row b"><span>Ventas del turno:</span><span>${resumen.num_ventas}</span></div>
<div class="hr"></div>
<div class="row"><span>Efectivo:</span><span>Ãƒâ€šÃ‚Â¢${fmt(resumen.total_efectivo)}</span></div>
<div class="row"><span>SINPE:</span><span>Ãƒâ€šÃ‚Â¢${fmt(resumen.total_sinpe)}</span></div>
<div class="row"><span>Tarjeta:</span><span>Ãƒâ€šÃ‚Â¢${fmt(resumen.total_tarjeta)}</span></div>
<div class="row"><span>Transferencia:</span><span>Ãƒâ€šÃ‚Â¢${fmt(resumen.total_transferencia)}</span></div>
<div class="hr"></div>
<div class="row b" style="font-size:14px"><span>TOTAL VENTAS</span><span>Ãƒâ€šÃ‚Â¢${fmt(resumen.total_ventas)}</span></div>
<div class="hr"></div>
<div class="row"><span>Monto inicial:</span><span>Ãƒâ€šÃ‚Â¢${fmt(resumen.monto_inicial)}</span></div>
<div class="row"><span>+ Ventas efectivo:</span><span>Ãƒâ€šÃ‚Â¢${fmt(resumen.total_efectivo)}</span></div>
<div class="row"><span>- Cambios:</span><span>Ãƒâ€šÃ‚Â¢${fmt(resumen.total_cambio)}</span></div>
<div class="row b"><span>Esperado en gaveta:</span><span>Ãƒâ€šÃ‚Â¢${fmt(resumen.efectivo_esperado)}</span></div>
<div class="row"><span>Efectivo contado:</span><span>Ãƒâ€šÃ‚Â¢${fmt(contado)}</span></div>
<div class="row b"><span>Diferencia:</span><span>${diferencia >= 0 ? '+' : ''}Ãƒâ€šÃ‚Â¢${fmt(diferencia)}</span></div>
${cierreNotas ? `<div class="hr"></div><div class="b">Notas:</div><div>${cierreNotas}</div>` : ''}
<div class="hr"></div>
<div class="c" style="font-size:10px;margin-top:6px">Sistema MYA Ãƒâ€šÃ‚Â· POS</div>
</body></html>`
    abrirVistaPreviaTiquete(html, 'Cierre de turno')
  }

  // Cargar recientes al montar
  useEffect(() => {
    const cargar = async () => {
      setRecientesErr('')
      try {
        const bodega = terminal.bodegaId ? `&bodega_id=${terminal.bodegaId}` : ''
        const resp = await fetch(`${API}/api/pos/productos/recientes?empresa_id=${empresaId}${bodega}`, {
          headers: authHeaders(),
        })
        const json = await resp.json()
        if (json.ok) {
          setRecientes((json.productos || []).filter(tieneStockDisponible))
        } else {
          setRecientesErr(`Error ${resp.status}: ${json.error || 'sin detalle'}`)
        }
      } catch (e: any) {
        setRecientesErr(`Sin conexiÃƒÆ’Ã‚Â³n con el servidor (${e?.message || 'network error'})`)
      }
    }
    void cargar()
  }, [empresaId, authHeaders])

  // BÃƒÆ’Ã‚Âºsqueda con debounce
  useEffect(() => {
    if (!busqueda.trim()) { setResultados([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const bodega = terminal.bodegaId ? `&bodega_id=${terminal.bodegaId}` : ''
        const resp = await fetch(`${API}/api/pos/productos/buscar?empresa_id=${empresaId}&q=${encodeURIComponent(busqueda)}${bodega}`, {
          headers: authHeaders(),
        })
        const json = await resp.json()
        if (json.ok) {
          const productos = (json.productos || []).filter(tieneStockDisponible)
          setResultados(productos)
          // Si es exacto y hay 1 resultado, agregar directo
          if (json.exacto && productos.length === 1) {
            agregarProducto(productos[0])
            setBusqueda('')
            setResultados([])
          }
        }
      } catch {}
      setBuscando(false)
    }, 200)
    return () => clearTimeout(t)
  }, [busqueda, empresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // BÃƒÆ’Ã‚Âºsqueda modal con debounce
  useEffect(() => {
    if (!buscadorOpen) return
    if (!buscadorQ.trim()) {
      setBuscadorResultados(recientes)
      return
    }
    const t = setTimeout(async () => {
      setBuscadorCargando(true)
      try {
        const bodega = terminal.bodegaId ? `&bodega_id=${terminal.bodegaId}` : ''
        const resp = await fetch(`${API}/api/pos/productos/buscar?empresa_id=${empresaId}&q=${encodeURIComponent(buscadorQ)}${bodega}`, {
          headers: authHeaders(),
        })
        const json = await resp.json()
        if (json.ok) setBuscadorResultados((json.productos || []).filter(tieneStockDisponible))
      } catch {}
      setBuscadorCargando(false)
    }, 200)
    return () => clearTimeout(t)
  }, [buscadorQ, buscadorOpen, empresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-foco al abrir el modal buscador
  useEffect(() => {
    if (buscadorOpen) {
      setBuscadorQ('')
      setBuscadorResultados(recientes)
      setTimeout(() => buscadorInputRef.current?.focus(), 50)
    }
  }, [buscadorOpen, recientes])

  // Foco automÃƒÆ’Ã‚Â¡tico en el input al cerrar modales
  useEffect(() => {
    if (!pagoModal && !cliModalOpen && !histOpen && !buscadorOpen) {
      setTimeout(() => barcodeRef.current?.focus(), 50)
    }
  }, [pagoModal, cliModalOpen, histOpen, buscadorOpen])

  // Devuelve el foco al input de cÃƒÆ’Ã‚Â³digo cuando un control del carrito pierde el foco
  // y el nuevo elemento con foco no es otro control del carrito
  const cartBlur = () => {
    setTimeout(() => {
      const active = document.activeElement
      if (active && (active.closest('.pos-cart-lines') || active.closest('.pos-pay-area') || active.closest('.pos-totals'))) return
      if (!pagoModal && !cliModalOpen && !histOpen && !buscadorOpen) {
        barcodeRef.current?.focus()
      }
    }, 80)
  }

  const abrirBuscador = () => {
    setSearchFlash(true)
    setTimeout(() => setSearchFlash(false), 400)
    setBuscadorOpen(true)
  }

  // Atajos de teclado globales
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F2 ? abrir buscador de artÃƒÆ’Ã‚Â­culos
      if (e.key === 'F2') {
        e.preventDefault()
        abrirBuscador()
      }
      // Escape ? cerrar buscador
      if (e.key === 'Escape' && buscadorOpen) {
        e.preventDefault()
        setBuscadorOpen(false)
      }
      // F8 ? abrir cobro
      if (e.key === 'F8' && !pagoModal && !buscadorOpen && carrito.length > 0) {
        e.preventDefault()
        abrirCobro()
      }
      // F9 ? limpiar carrito
      if (e.key === 'F9' && !pagoModal && !buscadorOpen) {
        e.preventDefault()
        if (carrito.length > 0 && window.confirm('Ãƒâ€šÃ‚Â¿Limpiar el carrito?')) {
          setCarrito([])
          setCliente(null)
        }
      }
      // F10 ? historial del dÃƒÆ’Ã‚Â­a
      if (e.key === 'F10' && !buscadorOpen) {
        e.preventDefault()
        void cargarHistorial()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pagoModal, carrito, buscadorOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Editar monto inicial
  const abrirEditarMonto = () => {
    setMontoEditado(sesion?.monto_inicial ? String(sesion.monto_inicial) : '')
    setEditarMontoOpen(true)
  }

  const guardarMontoEditado = async () => {
    if (!sesion || !montoEditado || isNaN(Number(montoEditado))) return
    try {
      const resp = await fetch(`${API}/api/pos/sesion/${sesion.id}/monto-inicial`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ monto_inicial: Number(montoEditado) }),
      })
      const json = await resp.json()
      if (json.ok) {
        setSesion({ ...sesion, monto_inicial: Number(montoEditado) })
        setEditarMontoOpen(false)
      }
    } catch {}
  }

  // Historial de cierres
  const cargarHistorialCierres = async () => {
    setCargandoHistorial(true)
    try {
      const resp = await fetch(`${API}/api/pos/cierres/ultimos?empresa_id=${empresaId}&caja_id=${terminal.cajaId}&limit=10`, {
        headers: authHeaders(),
      })
      const json = await resp.json()
      if (json.ok) {
        setHistoriaCierres(json.cierres || [])
        setHistorialOpen(true)
      }
    } catch {}
    setCargandoHistorial(false)
  }

  const imprimirCierreHistorico = (cierre: any) => {
    const fecha = new Date(cierre.cierre_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const apertura = new Date(cierre.apertura_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const diferencia = (Number(cierre.total_efectivo) || 0) - (Number(cierre.monto_inicial) || 0)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cierre de turno</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Courier New',monospace; font-size:12px; width:80mm; padding:6mm 4mm; }
.c { text-align:center; } .b { font-weight:bold; } .hr { border-top:1px dashed #000; margin:5px 0; }
.row { display:flex; justify-content:space-between; margin:2px 0; }
@media print { body { margin:0; } @page { size:80mm auto; margin:0; } }</style></head><body>
<div class="c b" style="font-size:14px">${empresaNombre}</div>
<div class="c" style="font-size:10px;margin-top:2px">CIERRE DE TURNO (ReimpresiÃƒÆ’Ã‚Â³n)</div>
<div class="hr"></div>
<div class="row"><span>Apertura:</span><span>${apertura}</span></div>
<div class="row"><span>Cierre:</span><span>${fecha}</span></div>
<div class="hr"></div>
<div class="row"><span>Monto inicial:</span><span>Ãƒâ€šÃ‚Â¢${fmt(cierre.monto_inicial)}</span></div>
<div class="row"><span>Efectivo esperado:</span><span>Ãƒâ€šÃ‚Â¢${fmt((Number(cierre.monto_inicial) || 0) + (Number(cierre.total_efectivo) || 0))}</span></div>
<div class="row"><span>Diferencia:</span><span>Ãƒâ€šÃ‚Â¢${fmt(diferencia)}</span></div>
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300) }
  }

  const agregarProducto = useCallback((p: Producto) => {
    // 1. Verificar precio de venta
    if (!p.precio_venta || p.precio_venta <= 0) {
      setAlertaMsg('Producto no tiene precio de Venta')
      return
    }

    // 2. Verificar stock en bodega (solo si hay registro ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â null significa sin carga inicial)
    if (p.stock_actual !== null && p.stock_actual !== undefined) {
      const yaEnCarrito = carrito.filter((l) => l.producto_id === p.id).reduce((s, l) => s + l.cantidad, 0)
      if (p.stock_actual - yaEnCarrito <= 0) {
        setMsgErr(`Sin stock disponible: "${p.descripcion}"`)
        return
      }
    }

    const exonerado = !!cliente?.exonerado
    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.producto_id === p.id)
      if (idx >= 0) {
        const updated = [...prev]
        const l = updated[idx]
        updated[idx] = calcLinea({ ...l, cantidad: l.cantidad + 1 })
        return updated
      }
      return [...prev, productoALinea(p, exonerado)]
    })
    setMsgErr('')
  }, [cliente, carrito])

  const eliminarLinea = (key: string) => {
    setCarrito((prev) => prev.filter((l) => l.key !== key))
  }

  const cambiarCantidad = (key: string, val: string) => {
    const n = parseFloat(val.replace(',', '.')) || 0
    setCarrito((prev) => prev.map((l) => l.key === key ? calcLinea({ ...l, cantidad: Math.max(0.001, n) }) : l))
  }

  const incrementar = (key: string) => {
    setCarrito((prev) => prev.map((l) => l.key === key ? calcLinea({ ...l, cantidad: l.cantidad + 1 }) : l))
  }

  const decrementar = (key: string) => {
    setCarrito((prev) => prev.map((l) => {
      if (l.key !== key) return l
      const nuevaCant = l.cantidad - 1
      if (nuevaCant <= 0) return l
      return calcLinea({ ...l, cantidad: nuevaCant })
    }))
  }

  // -- Funciones modal selector cliente ------------------------------------------

  const mostrarCliWarn = (msg: string, limpiarInput: () => void, ref?: React.RefObject<HTMLInputElement | null>) => {
    setCliWarn(msg)
    setCliSearchShake(true)
    setTimeout(() => setCliSearchShake(false), 350)
    setTimeout(() => {
      setCliWarn('')
      limpiarInput()
      setTimeout(() => ref?.current?.focus(), 30)
    }, 3800)
  }

  const abrirCliModal = (tab?: 'credito' | 'bitacora' | 'contado') => {
    setCliModalOpen(true)
    if (tab) setCliTab(tab)
  }

  const cerrarCliModal = () => {
    setCliModalOpen(false)
    setCliCreditoQ('')
    setCliCreditoBaseRows([])
    setCliCreditoRows([])
    setCliContadoCedula('')
    setCliContadoNombre('')
    setCliContadoEmail('')
    setCliContadoTelefono('')
    setCliContadoMhOk(false)
    setCliContadoMhMsg('')
    setCliSeleccionado(null)
    setCliEditEmail('')
    setCliEditTelefono('')
    setCliWarn('')
    setCliSearchShake(false)
  }

  const cargarCreditoClientes = useCallback(async (q: string): Promise<number> => {
    setCliCreditoLoading(true)
    try {
      if (cliCreditoBaseRows.length > 0 && q.trim()) {
        const filtrados = filtrarCreditoClientesLocal(cliCreditoBaseRows, q)
        setCliCreditoRows(filtrados)
        return filtrados.length
      }
      let query = supabase
        .from('vw_terceros_catalogo')
        .select('id, codigo, razon_social, identificacion, email, telefono_1, tercero_cliente_parametros!inner(limite_credito, dias_credito)')
        .eq('empresa_id', empresaId)
        .eq('es_cliente', true)
        .order('razon_social')
        .limit(80)
      if (q.trim()) {
        query = query.or(`razon_social.ilike.%${q}%,codigo.ilike.%${q}%,identificacion.ilike.%${q}%`)
      }
      const { data } = await query
      const rows = (data || []).map((r: any) => ({
        id: r.id, codigo: r.codigo, razon_social: r.razon_social,
        identificacion: r.identificacion, email: r.email, telefono: r.telefono_1,
      })) as ClienteCredito[]
      setCliCreditoBaseRows(rows)
      const filtrados = filtrarCreditoClientesLocal(rows, q)
      setCliCreditoRows(filtrados)
      return filtrados.length
    } catch { return 0 }
    finally { setCliCreditoLoading(false) }
  }, [cliCreditoBaseRows, empresaId])

  useEffect(() => {
    if (!cliModalOpen || cliTab !== 'credito') return
    void cargarCreditoClientes('')
  }, [cliModalOpen, cliTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cliModalOpen || cliTab !== 'credito') return
    // Si empieza con dÃƒÆ’Ã‚Â­gito (cÃƒÆ’Ã‚Â©dula/nÃƒÆ’Ã‚Âºmero), solo buscar al Enter ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no incremental
    if (cliCreditoQ.trim() && /^\d/.test(cliCreditoQ.trim())) return
    const t = setTimeout(() => cargarCreditoClientes(cliCreditoQ), 280)
    return () => clearTimeout(t)
  }, [cliCreditoQ]) // eslint-disable-line react-hooks/exhaustive-deps

  const consultarCedulaContado = async () => {
    const cedula = cliContadoCedula.trim()
    if (!cedula) return
    setCliContadoConsultando(true)
    setCliContadoMhOk(false)
    setCliContadoMhMsg('')
    setCliContadoNombre('')
    setCliContadoEmail('')
    try {
      // 1. Buscar primero en bitÃƒÆ’Ã‚Â¡cora
      const { data: bitRows } = await supabase
        .from('fe_receptores_bitacora')
        .select('razon_social, email, telefono')
        .eq('empresa_id', empresaId)
        .eq('identificacion', cedula)
        .maybeSingle()
      if (bitRows) {
        setCliContadoNombre(bitRows.razon_social || '')
        setCliContadoEmail(bitRows.email || '')
        setCliContadoTelefono(bitRows.telefono || '')
        setCliContadoMhOk(true)
        setCliContadoMhMsg('Cargado desde bitÃƒÆ’Ã‚Â¡cora fiscal.')
        return
      }
      // 2. Consultar MH via Edge Function
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) throw new Error('SesiÃƒÆ’Ã‚Â³n expirada.')
      const { data: payload, error: fnErr } = await supabase.functions.invoke('mh-contribuyente', {
        headers: { Authorization: `Bearer ${token}` },
        body: { cedula },
      })
      if (fnErr) throw fnErr
      const result = (payload || {}) as any
      if (!result?.ok) throw new Error(String(result?.detail || result?.error || 'No encontrado en MH.'))
      setCliContadoNombre(String(result.nombre || ''))
      setCliContadoMhOk(true)
      setCliContadoMhMsg('Datos cargados desde Hacienda.')
    } catch (e: any) {
      const msg = String(e?.message || 'No se encontrÃƒÆ’Ã‚Â³ en Hacienda.')
      mostrarCliWarn(msg, () => { setCliContadoCedula(''); setCliContadoNombre(''); setCliContadoEmail(''); setCliContadoTelefono('') }, cliContadoRef)
    } finally {
      setCliContadoConsultando(false)
    }
  }

  const seleccionarClienteCredito = (c: ClienteCredito) => {
    setCliEditEmail(c.email || '')
    setCliEditTelefono(c.telefono || '')
    setCliSeleccionado({
      id: c.id,
      nombre: c.razon_social,
      identificacion: c.identificacion || '',
      email: c.email || undefined,
      telefono: c.telefono || undefined,
      es_credito: true,
    })
  }


  const confirmarClienteContado = () => {
    if (!cliContadoNombre.trim() && !cliContadoCedula.trim()) return
    aplicarCliente({
      id: 0,
      nombre: cliContadoNombre.trim() || cliContadoCedula.trim(),
      identificacion: cliContadoCedula.trim(),
      email: cliContadoEmail.trim() || undefined,
      telefono: cliContadoTelefono.trim() || undefined,
      es_contado_manual: true,
    })
  }

  const aplicarClienteCreditoSeleccionado = () => {
    if (!cliSeleccionado) return
    void aplicarCliente({
      ...cliSeleccionado,
      email: cliEditEmail.trim() || undefined,
      telefono: cliEditTelefono.trim() || undefined,
    })
  }

  const aplicarCliente = async (c: Cliente) => {
    setCliente(c)
    cerrarCliModal()

    // Si es cliente crÃƒÆ’Ã‚Â©dito, validar polÃƒÆ’Ã‚Â­ticas CXC
    if (c.es_credito && c.id) {
      try {
        const resp = await fetch(`${API}/api/pos/credito-cliente?empresa_id=${empresaId}&tercero_id=${c.id}`, {
          headers: authHeaders(),
        })
        const json = await resp.json()
        if (json.ok) {
          setCreditoEvaluado({
            bloqueado: json.bloqueado,
            motivo_cajero: json.motivo_cajero || '',
            dias_credito: json.dias_credito || 0,
            tiene_vencido: json.tiene_vencido || false,
            puede_credito: json.puede_credito || false,
          })
          // Si estÃƒÆ’Ã‚Â¡ habilitado para crÃƒÆ’Ã‚Â©dito, cambiar a crÃƒÆ’Ã‚Â©dito automÃƒÆ’Ã‚Â¡ticamente
          if (json.puede_credito && !json.bloqueado) {
            setTipoPago('credito')
          } else if (json.bloqueado) {
            // Si estÃƒÆ’Ã‚Â¡ bloqueado, cambiar a contado automÃƒÆ’Ã‚Â¡ticamente
            setTipoPago('efectivo')
            setCliWarn(json.motivo_cajero || 'Cliente no disponible para crÃƒÆ’Ã‚Â©dito')
            setTimeout(() => setCliWarn(''), 5000)
          }
        } else {
          console.error('Error validando crÃƒÆ’Ã‚Â©dito:', json.error)
          setCreditoEvaluado(null)
        }
      } catch (err) {
        console.error('Error en validaciÃƒÆ’Ã‚Â³n de crÃƒÆ’Ã‚Â©dito:', err)
        setCreditoEvaluado(null)
      }
    } else {
      // Cliente manual (contado) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â limpiar creditoEvaluado
      setCreditoEvaluado(null)
    }

    if (c.exonerado) {
      setCarrito((prev) => prev.map((l) => calcLinea({ ...l, exonerado: true, iva_pct: 0 })))
    }
  }

  const limpiarCliente = () => {
    setCliente(null)
    setCreditoEvaluado(null)
    setCarrito((prev) => prev.map((l) => calcLinea({ ...l, exonerado: false, iva_pct: 13 })))
  }

  const abrirCobro = () => {
    if (!carrito.length) return
    // Forzar tipoPago='credito' si cliente habilitado, de lo contrario dejar el elegido
    if (creditoEvaluado?.puede_credito) {
      setTipoPago('credito')
    }
    setMontoRecibido(tipoPago === 'efectivo' ? String(Math.ceil(total)) : '')
    setReferencia('')
    setMsgOk(''); setMsgErr('')
    setTiqueteData(null)
    setPagoModal(true)
  }

  const cerrarCobroModal = () => {
    if (guardando) return
    if (tiqueteData) {
      // Si ya se cobrÃƒÆ’Ã‚Â³, limpiar carrito al cerrar
      setCarrito([])
      setCliente(null)
      setTipoDoc('tiquete')
      setMontoRecibido('')
      setTiqueteData(null)
    }
    setPagoModal(false)
    setMsgOk('')
    setMsgErr('')
  }

  const imprimirTiquete = (d: NonNullable<typeof tiqueteData>) => {
    const fecha = new Date().toLocaleString('es-CR', {
      timeZone: 'America/Costa_Rica',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
    const labelPago: Record<TipoPago, string> = {
      efectivo: 'Efectivo', sinpe: 'SINPE MÃƒÆ’Ã‚Â³vil', tarjeta: 'Tarjeta', transferencia: 'Transferencia', credito: 'CrÃƒÆ’Ã‚Â©dito'
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tiquete #${d.ventaId}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Courier New',monospace; font-size:12px; width:80mm; padding:6mm 4mm; }
.c { text-align:center; } .b { font-weight:bold; } .hr { border-top:1px dashed #000; margin:5px 0; }
.row { display:flex; justify-content:space-between; margin:2px 0; } .big { font-size:15px; font-weight:bold; }
.clave { font-size:8px; word-break:break-all; text-align:center; margin:3px 0; }
@media print { body { margin:0; } @page { size:80mm auto; margin:0; } }</style></head><body>
<div class="c b" style="font-size:15px">${empresaNombre}</div>
<div class="c" style="font-size:10px;margin-top:2px">Punto de Venta</div>
<div class="hr"></div>
<div class="row"><span>Fecha:</span><span>${fecha}</span></div>
<div class="row"><span>Tiquete #:</span><span class="b">${d.ventaId}</span></div>
${d.feConsecutivo ? `<div class="row"><span>Consecutivo:</span><span class="b">${d.feConsecutivo}</span></div>` : ''}
<div class="row"><span>Cajero:</span><span>${userName}</span></div>
<div class="row"><span>Cliente:</span><span>${d.cliente?.nombre || 'Consumidor Final'}</span></div>
${d.cliente?.identificacion ? `<div class="row"><span>Cedula:</span><span>${d.cliente.identificacion}</span></div>` : ''}
<div class="hr"></div>
${d.carrito.map(l => `<div class="b">${l.descripcion}</div>
<div class="row" style="padding-left:4mm"><span>${l.cantidad} x &#8353;${fmt(l.precio_unit)}${l.descuento_pct > 0 ? ` (-${l.descuento_pct}%)` : ''}</span><span>&#8353;${fmt(l.total)}</span></div>`).join('')}
<div class="hr"></div>
${d.descuento > 0 ? `<div class="row"><span>Descuento:</span><span>-&#8353;${fmt(d.descuento)}</span></div>` : ''}
<div class="row"><span>Gravado:</span><span>&#8353;${fmt(d.gravado)}</span></div>
${d.exento > 0 ? `<div class="row"><span>Exento:</span><span>&#8353;${fmt(d.exento)}</span></div>` : ''}
<div class="row"><span>IVA 13%:</span><span>&#8353;${fmt(d.iva)}</span></div>
<div class="hr"></div>
<div class="row big"><span>TOTAL:</span><span>&#8353;${fmt(d.total)}</span></div>
<div class="hr"></div>
<div class="row"><span>Forma pago:</span><span class="b">${labelPago[d.tipoPago]}</span></div>
${d.tipoPago === 'efectivo' ? `<div class="row"><span>Recibido:</span><span>&#8353;${fmt(Number(d.montoRecibido))}</span></div>
<div class="row"><span>Cambio:</span><span>&#8353;${fmt(Math.max(0, Number(d.montoRecibido) - d.total))}</span></div>` : ''}
${d.referencia ? `<div class="row"><span>Referencia:</span><span>${d.referencia}</span></div>` : ''}
${d.feClave ? `<div class="hr"></div><div class="c b" style="font-size:9px">Comprobante Electronico</div>
<div class="c" style="font-size:9px">Estado MH: ${d.feEstado || 'enviado'}</div>
<div class="clave">${d.feClave}</div>` : ''}
<div class="hr"></div>
<div class="c" style="margin-top:6px;font-size:10px">Gracias por su compra!</div>
<div class="c" style="margin-top:4px;font-size:8px">Autorizado mediante resolucion DGT-R-033-2019</div>
<div class="c" style="font-size:8px">Ministerio de Hacienda Ãƒâ€šÃ‚Â· Sistema MYA</div>
</body></html>`
    abrirVistaPreviaTiquete(html, `Tiquete #${d.ventaId}`, d.cliente?.email || '', d.ventaId)
  }

  const reimprimirTiquete = async (ventaId: number) => {
    try {
      const resp = await fetch(`${API}/api/pos/ventas/${ventaId}`, { headers: authHeaders() })
      const json = await resp.json()
      if (!json.ok) { alert('No se pudo cargar la venta'); return }
      const v = json.venta
      const lineas = json.lineas
      const labelPago: Record<string, string> = {
        efectivo: 'Efectivo', sinpe: 'SINPE MÃƒÆ’Ã‚Â³vil', tarjeta: 'Tarjeta', transferencia: 'Transferencia'
      }
      const fecha = new Date(v.created_at).toLocaleString('es-CR', {
        timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tiquete #${v.id}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Courier New',monospace; font-size:12px; width:80mm; padding:6mm 4mm; }
.c { text-align:center; } .b { font-weight:bold; } .hr { border-top:1px dashed #000; margin:5px 0; }
.row { display:flex; justify-content:space-between; margin:2px 0; } .big { font-size:15px; font-weight:bold; }
.clave { font-size:8px; word-break:break-all; text-align:center; margin:3px 0; }
@media print { body { margin:0; } @page { size:80mm auto; margin:0; } }</style></head><body>
<div class="c b" style="font-size:15px">${empresaNombre}</div>
<div class="c" style="font-size:10px;margin-top:2px">Punto de Venta ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â REIMPRESION</div>
<div class="hr"></div>
<div class="row"><span>Fecha:</span><span>${fecha}</span></div>
<div class="row"><span>Tiquete #:</span><span class="b">${v.id}</span></div>
${v.fe_consecutivo ? `<div class="row"><span>Consecutivo:</span><span class="b">${v.fe_consecutivo}</span></div>` : ''}
<div class="row"><span>Cajero:</span><span>${v.cajero_nombre || ''}</span></div>
<div class="row"><span>Cliente:</span><span>${v.cliente_nombre || 'Consumidor Final'}</span></div>
${v.cliente_cedula ? `<div class="row"><span>Cedula:</span><span>${v.cliente_cedula}</span></div>` : ''}
<div class="hr"></div>
${lineas.map((l: any) => `<div class="b">${l.descripcion}</div>
<div class="row" style="padding-left:4mm"><span>${l.cantidad} x &#8353;${fmt(l.precio_unit)}${l.descuento_pct > 0 ? ` (-${l.descuento_pct}%)` : ''}</span><span>&#8353;${fmt(l.total)}</span></div>`).join('')}
<div class="hr"></div>
${Number(v.descuento) > 0 ? `<div class="row"><span>Descuento:</span><span>-&#8353;${fmt(Number(v.descuento))}</span></div>` : ''}
<div class="row"><span>Gravado:</span><span>&#8353;${fmt(Number(v.gravado))}</span></div>
${Number(v.exento) > 0 ? `<div class="row"><span>Exento:</span><span>&#8353;${fmt(Number(v.exento))}</span></div>` : ''}
<div class="row"><span>IVA 13%:</span><span>&#8353;${fmt(Number(v.iva))}</span></div>
<div class="hr"></div>
<div class="row big"><span>TOTAL:</span><span>&#8353;${fmt(Number(v.total))}</span></div>
<div class="hr"></div>
<div class="row"><span>Forma pago:</span><span class="b">${labelPago[v.tipo_pago] || v.tipo_pago}</span></div>
${v.tipo_pago === 'efectivo' ? `<div class="row"><span>Recibido:</span><span>&#8353;${fmt(Number(v.monto_recibido))}</span></div>
<div class="row"><span>Cambio:</span><span>&#8353;${fmt(Number(v.cambio))}</span></div>` : ''}
${v.fe_clave ? `<div class="hr"></div><div class="c b" style="font-size:9px">Comprobante Electronico</div>
<div class="c" style="font-size:9px">Estado MH: ${v.fe_estado || 'enviado'}</div>
<div class="clave">${v.fe_clave}</div>` : ''}
<div class="hr"></div>
<div class="c" style="margin-top:6px;font-size:10px">Gracias por su compra!</div>
<div class="c" style="margin-top:4px;font-size:8px">Autorizado mediante resolucion DGT-R-033-2019</div>
<div class="c" style="font-size:8px">Ministerio de Hacienda Ãƒâ€šÃ‚Â· Sistema MYA</div>
</body></html>`
      abrirVistaPreviaTiquete(html, `Tiquete #${v.id} (Reimpresion)`, v.cliente_email || '', v.id)
    } catch { alert('Error al reimprimir') }
  }

  const confirmarCobro = async () => {
    setGuardando(true)
    setMsgErr('')
    try {
      const venta: Record<string, unknown> = {
        empresa_id: empresaId,
        sucursal_id: terminal.sucursalId,
        caja_id: terminal.cajaId,
        cajero_nombre: userName,
        cliente_id: cliente?.id || null,
        cliente_nombre: cliente?.nombre || 'Consumidor Final',
        cliente_cedula: cliente?.identificacion || null,
        cliente_email: cliente?.email || null,
        tipo_documento: tipoPago === 'credito' ? 'factura' : tipoDoc,
        tipo_pago: tipoPago,
        monto_recibido: tipoPago === 'efectivo' ? Number(montoRecibido) : 0,
        cambio: tipoPago === 'efectivo' ? cambio : 0,
        subtotal, descuento, gravado, exento, iva, total,
        estado: 'pagada',
      }

      // Si es venta a crÃƒÆ’Ã‚Â©dito, agregar tercero_id y dias_credito
      if (tipoPago === 'credito' && cliente?.id) {
        venta.tercero_id = cliente.id
        venta.dias_credito = creditoEvaluado?.dias_credito || 0
      }

      if (referencia.trim()) venta.referencia_pago = referencia.trim()

      const lineas = carrito.map((l) => ({
        producto_id: l.producto_id,
        codigo: l.codigo,
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: l.cantidad,
        precio_unit: l.precio_unit,
        descuento_pct: l.descuento_pct,
        descuento_monto: l.cantidad * l.precio_unit * l.descuento_pct / 100,
        iva_pct: l.iva_pct,
        iva_monto: l.iva_monto,
        gravado: l.gravado,
        exento: l.exento,
        total: l.total,
        exonerado: l.exonerado,
        cabys_code: l.cabys_code,
      }))

      const resp = await fetch(`${API}/api/pos/ventas`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ venta, lineas }),
      })
      const json = await resp.json()
      if (!json.ok) throw new Error(json.error || 'Error al guardar')

      // Capturar snapshot para el tiquete antes de limpiar
      setTiqueteData({
        ventaId: json.venta.id,
        carrito: [...carrito],
        cliente,
        tipoPago,
        tipoDoc,
        referencia,
        montoRecibido,
        subtotal, descuento, gravado, exento, iva, total,
        feClave:       json.venta.fe_clave       || undefined,
        feConsecutivo: json.venta.fe_consecutivo || undefined,
        feEstado:      json.venta.fe_estado      || undefined,
        feError:       json.venta.fe_error       || undefined,
      })
      const feMsg = ['tiquete', 'factura'].includes(tipoDoc) ? ' Ãƒâ€šÃ‚Â· FE procesando...' : ''
      setMsgOk(`Tiquete #${json.venta.id} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ãƒâ€šÃ‚Â¢${fmt(total)}${feMsg}`)

      // Refrescar recientes en background
      const bodega = terminal.bodegaId ? `&bodega_id=${terminal.bodegaId}` : ''
      fetch(`${API}/api/pos/productos/recientes?empresa_id=${empresaId}${bodega}`, {})
        .then((r) => r.json()).then((j) => { if (j.ok) setRecientes((j.productos || []).filter(tieneStockDisponible)) }).catch(() => {})

    } catch (e: any) {
      setMsgErr(e.message || 'Error al procesar la venta')
    }
    setGuardando(false)
  }

  const cargarHistorial = async () => {
    try {
      const resp = await fetch(`${API}/api/pos/ventas/hoy?empresa_id=${empresaId}`, {
        headers: authHeaders(),
      })
      const json = await resp.json()
      if (json.ok) setHistVentas(json.ventas || [])
    } catch {}
    setHistOpen(true)
  }

  const totalHoy = histVentas.reduce((s, v) => s + Number(v.total), 0)

  // -- Comprobantes FE ----------------------------------------------------------
  const cargarComprobantes = async () => {
    setFeLoading(true)
    setFeMsg('')
    try {
      const resp = await fetch(`${API}/api/pos/ventas/fe-comprobantes?empresa_id=${empresaId}&caja_id=${terminal.cajaId}`, {
        headers: authHeaders(),
      })
      const json = await resp.json()
      if (!json.ok) throw new Error(json.error || 'Error del servidor')
      setFeDocs(json.docs || [])
      setFeOpen(true)
    } catch (e: any) {
      setFeMsg('Error cargando comprobantes: ' + (e?.message || ''))
      setFeOpen(true)
    } finally {
      setFeLoading(false)
    }
  }

  const mostrarFeToast = (email: string) => {
    setFeToast(email)
    setTimeout(() => setFeToast(null), 6000)
  }

  const feConsultarEstado = async (docId: number) => {
    const docActual = feDocs.find((d) => d.id === docId)
    if (docActual && esDocumentoRechazado(docActual.estado_mh)) return
    setFeBusyId(docId)
    setFeMsg('')
    try {
      const resp = await fetch(`${API}/api/facturacion/estado/${docId}?empresa_id=${empresaId}`, {
        headers: authHeaders(),
      })
      const json = await resp.json()
      if (!json.ok) { setFeMsg(`Error: ${json.error || 'No se pudo consultar'}`); return }

      const nuevoEstado = json.estado_mh ?? null
      setFeDocs(prev => prev.map(d => d.id === docId ? { ...d, estado_mh: nuevoEstado } : d))
      setFeMsg(`#${docId}: ${nuevoEstado || 'consultado'}`)

      // Si Hacienda acaba de aceptar y hay email del receptor, enviar silenciosamente
      if (nuevoEstado === 'aceptado') {
        const doc = feDocs.find(d => d.id === docId)
        const emailReceptor = doc?.receptor_email || doc?.cliente_email || ''
        const ventaId = doc?.pos_venta_id || null
        if (emailReceptor && ventaId) {
          fetch(`${API}/api/pos/ventas/email`, {
            method: 'POST',
            headers: { ...(authHeaders()), 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailReceptor, venta_id: ventaId }),
          })
            .then(r => r.json())
            .then(j => { if (j.ok) mostrarFeToast(emailReceptor) })
            .catch(() => {})
        }
      }
    } catch (e: any) {
      setFeMsg('Error: ' + e.message)
    } finally {
      setFeBusyId(null)
    }
  }

  const feReenviarEmail = (doc: any) => {
    if (esDocumentoRechazado(doc?.estado_mh)) return
    setFeEmailInput(doc.receptor_email || '')
    setFeEmailModal({ doc })
  }

  const feEnviarEmailConfirmar = async () => {
    if (!feEmailModal) return
    const email = feEmailInput.trim()
    if (!email) return
    const doc = feEmailModal.doc
    if (esDocumentoRechazado(doc?.estado_mh)) {
      setFeEmailModal(null)
      setFeMsg('No se envÃƒÂ­an correos para comprobantes rechazados.')
      return
    }
    setFeEmailModal(null)
    setFeBusyId(doc.id)
    setFeMsg('')
    try {
      const resp = await fetch(`${API}/api/pos/ventas/email`, {
        method: 'POST',
        headers: { ...(authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, venta_id: doc.pos_venta_id }),
      })
      const json = await resp.json()
      setFeMsg(json.ok ? `Enviado a ${email}` : `Error: ${json.error}`)
    } catch (e: any) {
      setFeMsg('Error: ' + e.message)
    } finally {
      setFeBusyId(null)
    }
  }

  const FE_TIPO: Record<string, string> = { '01': 'FE', '04': 'TE' }
  const FE_ESTADO_COLOR: Record<string, string> = {
    aceptado: '#10b981', rechazado: '#ef4444', enviado: '#3b82f6',
    pendiente: '#f59e0b', error: '#ef4444',
  }

  return (
    <>
      <style>{S}</style>
      <div className="pos-root">
        {/* Topbar */}
        <div className="pos-topbar">
          <div className="pos-topbar-info">
            <div className="pos-topbar-title">POS <span className="pos-sep" /> {terminal.sucursalNombre}</div>
            <div className="pos-topbar-empresa">
              {empresaNombre} <span className="pos-sep" /> {terminal.cajaNombre}
              {(terminal.terminalNombre || terminal.sucursalMh) && (
                <span style={{ color: '#93c5fd', marginLeft: 6 }}>
                  <span className="pos-sep" /> {terminal.terminalNombre ? `Terminal: ${terminal.terminalNombre} ` : ''}({terminal.sucursalMh}-{terminal.puntoVentaMh})
                </span>
              )}
            </div>
          </div>
          <div className="pos-topbar-sep" />
          <div className="pos-shortcuts">
            <span className="pos-shortcut"><kbd>F2</kbd> Buscar artículo</span>
            <span className="pos-shortcut-sep" />
            <span className="pos-shortcut"><kbd>F8</kbd> Cobrar</span>
            <span className="pos-shortcut-sep" />
            <span className="pos-shortcut"><kbd>F9</kbd> Limpiar</span>
            <span className="pos-shortcut-sep" />
            <span className="pos-shortcut"><kbd>F10</kbd> Historial</span>
          </div>
          {sesion && (
            <span style={{ fontSize: 11, color: '#4a5e7e' }}>
              Turno desde {new Date(sesion.apertura_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="pos-topbar-btn" onClick={cargarHistorial}>Historial</button>
          <button className="pos-topbar-btn" onClick={cargarComprobantes} style={{ color: '#93c5fd', borderColor: 'rgba(147,197,253,0.3)' }}>Comprobantes FE</button>
          <button
            className="pos-topbar-btn"
            onClick={abrirCierre}
            disabled={!sesion}
            style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)' }}
          >
            Cierre de caja
          </button>
        </div>

        <div className="pos-body">
          {/* -- Panel izquierdo -- */}
          <div className="pos-left">
            {/* Contenedor scrollable */}
            <div className="pos-left-scrollable">
            {/* Input de búsqueda / código de barras */}
            <div className="pos-search-wrap">
              <span className="pos-search-icon">{UI.search}</span>
              <input
                ref={barcodeRef}
                className={`pos-search-input${searchFlash ? ' flash' : ''}`}
                placeholder="Código de barras o nombre del producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (!busqueda.trim()) {
                      abrirBuscador()
                    } else if (resultados.length === 1) {
                      agregarProducto(resultados[0])
                      setBusqueda('')
                      setResultados([])
                    }
                  }
                  if (e.key === 'Escape') { setBusqueda(''); setResultados([]) }
                }}
                autoFocus
                autoComplete="off"
              />
              {busqueda && (
                <button className="pos-search-clear" onClick={() => { setBusqueda(''); setResultados([]) }}>{UI.times}</button>
              )}

              {/* Dropdown resultados */}
              {resultados.length > 0 && (
                <div className="pos-results">
                  {resultados.map((p) => (
                    <div key={p.id} className="pos-result-item" onClick={() => {
                      agregarProducto(p)
                      setBusqueda('')
                      setResultados([])
                      barcodeRef.current?.focus()
                    }}>
                      <div>
                        <div className="pos-result-name">{p.descripcion}</div>
                        <div className="pos-result-code">{p.codigo}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="pos-result-price">{CRC}{fmt(p.precio_venta)}</div>
                        {stockEstadoCajero(p) && (
                          <div className="pos-result-stock">{stockEstadoCajero(p)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Productos recientes / resultados */}
            <div className={`pos-recientes-block ${busqueda ? 'searching' : 'recent-only'}`}>
              <div className="pos-section-label">
                {busqueda ? 'Resultados' : 'Usados recientemente'}
                {buscando && ` ${UI.mdash} buscando...`}
              </div>

              {recientesErr ? (
                <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                  ? {recientesErr}
                </div>
              ) : recientes.length > 0 ? (
                <div className="pos-recientes-grid">
                  {recientes.map((p) => (
                    <div key={p.id} className="pos-prod-card" onClick={() => {
                      agregarProducto(p)
                      barcodeRef.current?.focus()
                    }}>
                      <div className="pos-prod-card-name">{p.descripcion}</div>
                      <div className="pos-prod-card-code">{p.codigo}</div>
                      <div className="pos-prod-card-price">{CRC}{fmt(p.precio_venta)}</div>
                      {stockEstadoCajero(p) && <div className="pos-prod-card-stock">{stockEstadoCajero(p)}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pos-empty">
                  <div className="pos-empty-icon">{UI.receipt}</div>
                  <div className="pos-empty-text">Empiece a vender para ver los productos recientes</div>
                </div>
              )}
            </div>
            </div>

            {/* Footer con funciones secundarias */}
            <div className="pos-left-footer">
              {sesion && (
                <button onClick={abrirEditarMonto} title="Editar monto inicial">
                  Monto
                </button>
              )}
              {sesion && (
                <button onClick={cargarHistorialCierres} title="Últimos 10 cierres">
                  Cierres
                </button>
              )}
              {onResetTerminal && (
                <button onClick={onResetTerminal} title="Cambiar sucursal o caja">
                  Terminal
                </button>
              )}
              {onLogout && (
                <button onClick={onLogout} title="Cerrar sesión">
                  Salir
                </button>
              )}
            </div>
          </div>

          {/* -- Panel derecho: carrito -- */}
          <div className="pos-right">
            {/* Selector de cliente */}
            <div className="pos-cliente-bar">
              <button className="pos-cliente-btn" onClick={() => abrirCliModal()}>
                <span className="pos-cliente-icon">{UI.person}</span>
                <span className="pos-cliente-name">
                  {cliente
                    ? <>
                        {cliente.nombre}
                        {cliente.es_credito && <span style={{ fontSize: 10, color: '#60a5fa', marginLeft: 6, fontWeight: 700 }}>CRÉDITO</span>}
                        {cliente.identificacion && !cliente.es_credito && <span style={{ fontSize: 10, color: '#7f92b5', marginLeft: 6 }}>{cliente.identificacion}</span>}
                      </>
                    : 'Consumidor Final'
                  }
                </span>
                {cliente && (
                  <button className="pos-cliente-clear" onClick={(e) => { e.stopPropagation(); limpiarCliente() }}>{UI.times}</button>
                )}
              </button>
            </div>

            {/* Líneas del carrito */}
            <div className="pos-cart-lines">
              {carrito.length === 0 ? (
                <div className="pos-cart-empty">
                  <div className="pos-cart-empty-icon">{UI.cart}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>Carrito vacío</div>
                </div>
              ) : (
                carrito.map((l) => (
                  <div key={l.key} className="pos-cart-line">
                    <div className="pos-cart-line-info">
                      <div className="pos-cart-line-name" title={l.descripcion}>{l.descripcion}</div>
                      <div className="pos-cart-line-meta">
                        {CRC}{fmt(l.precio_unit)} c/u <span className="pos-sep" /> IVA {l.exonerado ? 'Exonerado' : `${l.iva_pct}%`}
                        {l.descuento_pct > 0 && <span style={{ color: '#f59e0b' }}> <span className="pos-sep" /> -{l.descuento_pct}%</span>}
                      </div>
                    </div>
                    <div className="pos-qty-ctrl">
                      <button className="pos-qty-btn" onBlur={cartBlur} onClick={() => decrementar(l.key)}>-</button>
                      <input
                        className="pos-qty-input"
                        type="number"
                        min="0.001"
                        step="1"
                        value={l.cantidad}
                        onChange={(e) => cambiarCantidad(l.key, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onBlur={cartBlur}
                      />
                      <button className="pos-qty-btn" onBlur={cartBlur} onClick={() => incrementar(l.key)}>+</button>
                    </div>
                    {l.descuento_max_pct > 0 && (
                      <div className="pos-desc-ctrl" title={`Desc. máx. ${l.descuento_max_pct}%`}>
                        <input
                          className="pos-desc-input"
                          type="number"
                          min="0"
                          max={l.descuento_max_pct}
                          step="1"
                          value={l.descuento_pct || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const v = Math.min(Math.max(0, Number(e.target.value) || 0), l.descuento_max_pct)
                            setCarrito((prev) => prev.map((x) => x.key === l.key ? calcLinea({ ...x, descuento_pct: v }) : x))
                          }}
                          onFocus={(e) => e.target.select()}
                          onBlur={cartBlur}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); barcodeRef.current?.focus() } }}
                        />
                        <span className="pos-desc-label">%</span>
                      </div>
                    )}
                    <div className="pos-cart-line-price">{CRC}{fmt(l.total)}</div>
                    <button className="pos-del-btn" onClick={() => eliminarLinea(l.key)} title="Eliminar">{UI.trash}</button>
                  </div>
                ))
              )}
            </div>

            {/* Totales */}
            <div className="pos-totals">
              <div className="pos-total-row"><span>Subtotal</span><span>{CRC}{fmt(subtotal)}</span></div>
              {descuento > 0 && <div className="pos-total-row"><span>Descuento</span><span>-{CRC}{fmt(descuento)}</span></div>}
              <div className="pos-total-row"><span>Gravado</span><span>{CRC}{fmt(gravado)}</span></div>
              {exento > 0 && <div className="pos-total-row"><span>Exento</span><span>{CRC}{fmt(exento)}</span></div>}
              <div className="pos-total-row"><span>IVA</span><span>{CRC}{fmt(iva)}</span></div>
              <div className="pos-total-row main"><span>Total</span><span>{CRC}{fmt(total)}</span></div>
            </div>

            {/* Tipo de pago y cobrar */}
            <div className="pos-pay-area">
              {tipoPago === 'credito' ? (
                // Cliente crÃƒÆ’Ã‚Â©dito ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no mostrar forma de pago, es automÃƒÆ’Ã‚Â¡tica (Factura FE)
                <div style={{ padding: '12px 14px', background: 'rgba(52,211,153,0.08)', borderRadius: 10, fontSize: 12, color: '#c8d6f2', lineHeight: 1.6 }}>
                  <strong>{UI.card} Crédito habilitado</strong>
                  <div style={{ marginTop: 6, fontSize: 11, color: '#7f92b5' }}>Se emitirá Factura Electrónica. Sin selección de forma de pago.</div>
                </div>
              ) : (
                // Cliente contado ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â mostrar opciones de pago
                <>
                  <div className="pos-pay-label">Forma de pago</div>
                  <div className="pos-pay-tabs">
                    {[({ key: 'efectivo', label: `${UI.money} Efectivo`, tip: 'efectivo' as TipoPago }),
                      ({ key: 'tarjeta', label: `${UI.card} Tarjeta`, tip: 'tarjeta' as TipoPago }),
                      ({ key: 'transfer', label: `${UI.bank} Transf.`, tip: 'transferencia' as TipoPago })].map((o) => (
                        <button key={o.key} className={`pos-pay-tab ${tipoPago === o.tip ? 'sel' : ''}`} onClick={() => setTipoPago(o.tip)}>
                          {o.label}
                        </button>
                      ))}
                  </div>
                </>
              )}
              <button className="pos-cobrar-btn" onClick={abrirCobro} disabled={!carrito.length || !sesion}>
                {!sesion ? 'Sin turno abierto' : carrito.length ? `Cobrar ${CRC}${fmt(total)}` : 'Carrito vacío'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ClienteModal
        open={cliModalOpen}
        cliTab={cliTab}
        cliSearchShake={cliSearchShake}
        cliCreditoQ={cliCreditoQ}
        cliWarn={cliWarn}
        cliCreditoLoading={cliCreditoLoading}
        cliCreditoRows={cliCreditoRows}
        cliSeleccionado={cliSeleccionado}
        cliEditEmail={cliEditEmail}
        cliEditTelefono={cliEditTelefono}
        cliContadoCedula={cliContadoCedula}
        cliContadoConsultando={cliContadoConsultando}
        cliContadoMhOk={cliContadoMhOk}
        cliContadoMhMsg={cliContadoMhMsg}
        cliContadoNombre={cliContadoNombre}
        cliContadoEmail={cliContadoEmail}
        cliContadoTelefono={cliContadoTelefono}
        cliSearchRef={cliSearchRef}
        cliContadoRef={cliContadoRef}
        onClose={cerrarCliModal}
        onSelectTab={(tab) => { setCliTab(tab); setCliSeleccionado(null) }}
        onCreditoChange={(value) => {
          setCliWarn('')
          setCliCreditoQ(value)
          setCliCreditoRows(filtrarCreditoClientesLocal(cliCreditoBaseRows, value))
        }}
        onCreditoEnter={async () => {
          const n = await cargarCreditoClientes(cliCreditoQ)
          if (n === 0 && cliCreditoQ.trim()) {
            mostrarCliWarn('No se encontrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³ ningÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âºn cliente a crÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©dito con ese criterio.', () => setCliCreditoQ(''), cliSearchRef)
          }
        }}
        onClearCredito={() => {
          setCliCreditoQ('')
          setCliWarn('')
          setCliCreditoRows(cliCreditoBaseRows)
          cliSearchRef.current?.focus()
        }}
        onSeleccionarClienteCredito={seleccionarClienteCredito}
        onContadoCedulaChange={(value) => {
          setCliContadoCedula(value)
          setCliContadoMhOk(false)
          setCliContadoMhMsg('')
          setCliContadoNombre('')
          setCliContadoEmail('')
          setCliWarn('')
        }}
        onConsultarCedulaContado={consultarCedulaContado}
        onClearContadoCedula={() => {
          setCliContadoCedula('')
          setCliContadoNombre('')
          setCliContadoEmail('')
          setCliContadoTelefono('')
          setCliContadoMhOk(false)
          setCliContadoMhMsg('')
          setCliWarn('')
          cliContadoRef.current?.focus()
        }}
        onContadoNombreChange={setCliContadoNombre}
        onContadoEmailChange={setCliContadoEmail}
        onContadoTelefonoChange={setCliContadoTelefono}
        onConfirmarClienteContado={confirmarClienteContado}
        onCliEditEmailChange={setCliEditEmail}
        onCliEditTelefonoChange={setCliEditTelefono}
        onCambiarSeleccion={() => setCliSeleccionado(null)}
        onAplicarClienteSeleccionado={aplicarClienteCreditoSeleccionado}
      />


      {/* -- Apertura de turno -- */}
      {aperturaOpen && !sesionCargando && createPortal(
        <div className="pos-apertura-overlay">
          <div className="pos-apertura-card">
            <div>
              <div className="pos-apertura-title">Apertura de turno</div>
              <div className="pos-apertura-meta">{terminal.sucursalNombre} <span className="pos-sep" /> {terminal.cajaNombre} <span className="pos-sep" /> {userName}</div>
            </div>
            <div>
              <div className="pos-apertura-label">Efectivo inicial en gaveta</div>
              <input
                className="pos-apertura-input"
                type="text"
                inputMode="decimal"
                value={montoInicial}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '')
                  setMontoInicial(raw)
                }}
                onBlur={(e) => {
                  if (montoInicial && !isNaN(Number(montoInicial))) {
                    e.target.value = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(montoInicial))
                  }
                }}
                onFocus={(e) => {
                  e.target.value = montoInicial
                  e.target.select()
                }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && !abriendo && abrirTurno()}
              />
            </div>
            {aperturaError && (
              <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px' }}>
                {aperturaError}
              </div>
            )}
            <button className="pos-apertura-btn" onClick={abrirTurno} disabled={abriendo}>
              {abriendo ? 'Abriendo turno...' : `${UI.check} Abrir turno`}
            </button>
          </div>
        </div>
      , document.body)}

      {/* -- Cierre de turno -- */}
      {cierreOpen && resumen && createPortal(
        <div className="pos-cierre-panel" onClick={(e) => e.target === e.currentTarget && setCierreOpen(false)}>
          <div className="pos-cierre-drawer">
            <div className="pos-cierre-head">
              <div className="pos-cierre-head-info">
                <div className="pos-cierre-title">Cierre de turno</div>
                <div className="pos-cierre-subtitle">
                  {terminal.sucursalNombre} <span className="pos-sep" /> {terminal.cajaNombre} <span className="pos-sep" /> desde {new Date(resumen.apertura_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button className="pos-cierre-close-btn" onClick={() => setCierreOpen(false)}>{UI.close}</button>
            </div>

            <div className="pos-cierre-body">
              {/* Resumen de ventas */}
              <div>
                <div className="pos-cierre-section-title">Ventas del turno {UI.mdash} {resumen.num_ventas} transacciones</div>
                <div className="pos-cierre-row">
                  <span className="pos-cierre-row-label">{UI.money} Efectivo</span>
                  <span className="pos-cierre-row-val">{CRC}{fmt(resumen.total_efectivo)}</span>
                </div>
                <div className="pos-cierre-row">
                  <span className="pos-cierre-row-label">{UI.phone} SINPE Móvil</span>
                  <span className="pos-cierre-row-val">{CRC}{fmt(resumen.total_sinpe)}</span>
                </div>
                <div className="pos-cierre-row">
                  <span className="pos-cierre-row-label">{UI.card} Tarjeta</span>
                  <span className="pos-cierre-row-val">{CRC}{fmt(resumen.total_tarjeta)}</span>
                </div>
                <div className="pos-cierre-row">
                  <span className="pos-cierre-row-label">{UI.bank} Transferencia</span>
                  <span className="pos-cierre-row-val">{CRC}{fmt(resumen.total_transferencia)}</span>
                </div>
              </div>

              <div className="pos-cierre-total-row">
                <span className="pos-cierre-total-label">Total ventas</span>
                <span className="pos-cierre-total-val">{CRC}{fmt(resumen.total_ventas)}</span>
              </div>

              {/* Cuadre de efectivo */}
              <div>
                <div className="pos-cierre-section-title">Cuadre de efectivo</div>
                <div className="pos-cierre-box">
                  <div className="pos-cierre-row" style={{ borderBottom: 'none' }}>
                    <span className="pos-cierre-row-label">Monto inicial</span>
                    <span className="pos-cierre-row-val">{CRC}{fmt(resumen.monto_inicial)}</span>
                  </div>
                  <div className="pos-cierre-row" style={{ borderBottom: 'none' }}>
                    <span className="pos-cierre-row-label">+ Ventas efectivo</span>
                    <span className="pos-cierre-row-val">{CRC}{fmt(resumen.total_efectivo)}</span>
                  </div>
                  <div className="pos-cierre-row" style={{ borderBottom: 'none' }}>
                    <span className="pos-cierre-row-label">- Cambios entregados</span>
                    <span className="pos-cierre-row-val" style={{ color: '#f87171' }}>{CRC}{fmt(resumen.total_cambio)}</span>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(137,160,201,0.12)', paddingTop: 8 }}>
                    <div className="pos-cierre-row" style={{ borderBottom: 'none' }}>
                      <span className="pos-cierre-row-label" style={{ fontWeight: 700, color: '#c8d6f2' }}>Esperado en gaveta</span>
                      <span style={{ fontSize: 16, fontWeight: 900, color: '#fbbf24' }}>{CRC}{fmt(resumen.efectivo_esperado)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conteo físico */}
              <div>
                <div className="pos-cierre-section-title">Conteo físico de efectivo</div>
                <input
                  className="pos-cierre-contado-input"
                  type="text"
                  inputMode="decimal"
                  value={efectivoContado === '' ? '' : (() => {
                    const n = Number(efectivoContado)
                    return isNaN(n) ? efectivoContado : fmt(n)
                  })()}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.]/g, '')
                    setEfectivoContado(raw)
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="0,00"
                />
                {efectivoContado !== '' && (() => {
                  const diff = Number(efectivoContado) - resumen.efectivo_esperado
                  return (
                    <div className={`pos-cierre-diferencia ${Math.abs(diff) < 1 ? 'ok' : 'mal'}`} style={{ marginTop: 8 }}>
                      <span className="pos-cierre-diferencia-label">Diferencia</span>
                      <span className="pos-cierre-diferencia-val">
                        {diff >= 0 ? '+' : ''}{CRC}{fmt(diff)}
                        {Math.abs(diff) < 1 ? ` ${UI.check}` : diff > 0 ? ' (sobrante)' : ' (faltante)'}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {/* Notas */}
              <div>
                <div className="pos-cierre-section-title">Notas (opcional)</div>
                <textarea
                  className="pos-cierre-notas"
                  rows={2}
                  placeholder="Observaciones del turno..."
                  value={cierreNotas}
                  onChange={(e) => setCierreNotas(e.target.value)}
                />
              </div>
            </div>

            <div className="pos-cierre-footer">
              <button className="pos-cierre-btn-print" onClick={imprimirCierre} title="Tiquete 80mm">{UI.printer}</button>
              <button
                className="pos-cierre-btn-print"
                style={{ background: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.3)', color: '#38bdf8' }}
                onClick={async () => {
                  const params = new URLSearchParams()
                  if (terminal.sucursalMh) params.set('sucursal_mh', terminal.sucursalMh)
                  if (terminal.puntoVentaMh) params.set('punto_venta_mh', terminal.puntoVentaMh)
                  const resp = await fetch(`${API}/api/pos/sesion/${sesion!.id}/pdf?${params}`, { headers: authHeaders() })
                  const blob = await resp.blob()
                  const url = URL.createObjectURL(blob)
                  window.open(url, '_blank')
                  setTimeout(() => URL.revokeObjectURL(url), 30000)
                }}
                title="Reporte PDF"
              >
                {UI.pdf} PDF
              </button>
              <button className="pos-cierre-btn-cerrar" onClick={cerrarTurno} disabled={cerrando}>
                {cerrando ? 'Cerrando...' : `${UI.close} Cerrar turno`}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* -- Modal editar monto inicial -- */}
      {editarMontoOpen && createPortal(
        <div className="pos-apertura-overlay" onClick={(e) => e.target === e.currentTarget && setEditarMontoOpen(false)}>
          <div className="pos-apertura-card" style={{ maxWidth: 400 }}>
            <div style={{ marginBottom: 16 }}>
              <div className="pos-apertura-title">{UI.pencil} Editar monto inicial</div>
              <div className="pos-apertura-meta">Corrígelo antes de cerrar el turno</div>
            </div>
            <div>
              <div className="pos-apertura-label">Efectivo inicial en gaveta</div>
              <input
                className="pos-apertura-input"
                type="text"
                inputMode="decimal"
                value={montoEditado}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '')
                  setMontoEditado(raw)
                }}
                onBlur={(e) => {
                  if (montoEditado && !isNaN(Number(montoEditado))) {
                    e.target.value = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(montoEditado))
                  }
                }}
                onFocus={(e) => {
                  e.target.value = montoEditado
                  e.target.select()
                }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && guardarMontoEditado()}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                className="pos-apertura-btn"
                onClick={() => setEditarMontoOpen(false)}
                style={{ background: 'rgba(100,116,139,0.5)', flex: 1 }}
              >
                Cancelar
              </button>
              <button className="pos-apertura-btn" onClick={guardarMontoEditado} style={{ flex: 1 }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* -- Modal historial de cierres -- */}
      {historialOpen && createPortal(
        <div className="pos-apertura-overlay" onClick={(e) => e.target === e.currentTarget && setHistorialOpen(false)}>
          <div className="pos-apertura-card" style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ marginBottom: 16 }}>
              <div className="pos-apertura-title">{UI.clipboard} Últimos cierres</div>
              <div className="pos-apertura-meta">Últimos 10 cierres de {terminal.cajaNombre}</div>
            </div>
            {cargandoHistorial ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Cargando...</div>
            ) : historiaCierres.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Sin cierres registrados</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {historiaCierres.map((c, i) => (
                  <div key={i} style={{ background: 'rgba(226,232,240,0.05)', border: '1px solid rgba(137,160,201,0.2)', borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
                        {new Date(c.cierre_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <button
                        onClick={() => imprimirCierreHistorico(c)}
                        style={{
                          background: 'rgba(56,189,248,0.15)',
                          border: '1px solid rgba(56,189,248,0.3)',
                          color: '#38bdf8',
                          padding: '6px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {UI.printer} Reimprimir
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>Monto inicial: {CRC}{fmt(c.monto_inicial)}</div>
                      <div>Efectivo: {CRC}{fmt(c.total_efectivo)}</div>
                      <div>SINPE: {CRC}{fmt(c.total_sinpe)}</div>
                      <div>Tarjeta: {CRC}{fmt(c.total_tarjeta)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                className="pos-apertura-btn"
                onClick={() => setHistorialOpen(false)}
                style={{ background: 'rgba(100,116,139,0.5)' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* -- Modal de cobro -- */}
      {pagoModal && createPortal(
        <div className="pos-cobro-overlay" onClick={(e) => e.target === e.currentTarget && cerrarCobroModal()}>
          <div className="pos-cobro-modal">

            {/* Total */}
            <div className="pos-cobro-header">
              <div className="pos-cobro-total-label">Total a cobrar</div>
              <div className="pos-cobro-total-amount">{CRC}{fmt(total)}</div>
            </div>

            {/* Desglose */}
            <div className="pos-cobro-breakdown">
              {descuento > 0 && <div className="pos-cobro-brow"><span>Descuento</span><span>-{CRC}{fmt(descuento)}</span></div>}
              <div className="pos-cobro-brow"><span>Gravado</span><span>{CRC}{fmt(gravado)}</span></div>
              {exento > 0 && <div className="pos-cobro-brow"><span>Exento</span><span>{CRC}{fmt(exento)}</span></div>}
              <div className="pos-cobro-brow"><span>IVA</span><span>{CRC}{fmt(iva)}</span></div>
            </div>

            {/* Cliente */}
            <div className="pos-cobro-cliente">
              Cliente: <strong style={{ color: '#c8d6f2' }}>{cliente?.nombre || 'Consumidor Final'}</strong>
              {cliente?.identificacion && <> <span className="pos-sep" /> {cliente.identificacion}</>}
            </div>

            {/* Advertencia de crédito bloqueado */}
            {creditoEvaluado?.bloqueado && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10,
                padding: 12,
                fontSize: 12,
                color: '#fca5a5',
                lineHeight: 1.5,
              }}>
                <strong>{UI.warning} Advertencia:</strong> {creditoEvaluado.motivo_cajero}
              </div>
            )}

            {!tiqueteData && <>
              {tipoPago === 'credito' ? (
                // CRÉDITO - Solo mostrar info, sin opciones de pago
                <div className="pos-cobro-section">
                  <div className="pos-cobro-label">Tipo de documento</div>
                  <div className="pos-cobro-chips">
                    <button className="pos-cobro-chip sel" disabled>{UI.receipt} Factura FE</button>
                  </div>
                </div>
              ) : (
                // CONTADO - Mostrar opciones de documento
                <div className="pos-cobro-section">
                  <div className="pos-cobro-label">Documento</div>
                  <div className="pos-cobro-chips">
                    <button className={`pos-cobro-chip ${tipoDoc === 'tiquete' ? 'sel' : ''}`} onClick={() => setTipoDoc('tiquete')}>{UI.receipt} Tiquete</button>
                    <button className={`pos-cobro-chip ${tipoDoc === 'factura' ? 'sel' : ''}`} onClick={() => setTipoDoc('factura')}>{UI.receipt} Factura FE</button>
                  </div>
                </div>
              )}

              {/* Crédito: información */}
              {tipoPago === 'credito' && (
                <div className="pos-cobro-section">
                  <div className="pos-cobro-label">Condiciones de crédito</div>
                  <div className="pos-cobro-info" style={{ background: 'rgba(52,211,153,0.08)', borderRadius: 10, padding: 12, fontSize: 13, color: '#c8d6f2', lineHeight: 1.6 }}>
                    <div>{UI.calendar} Plazo: {creditoEvaluado?.dias_credito} días</div>
                    <div>{UI.pdf} Comprobante: Factura Electrónica</div>
                    <div>{UI.moneyBag} Monto: {CRC}{fmt(total)}</div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#7f92b5' }}>Se registrará en cartera como documento pendiente de pago.</div>
                  </div>
                </div>
              )}

              {/* Forma de pago - Solo para contado */}
              {tipoPago !== 'credito' && (
                <div className="pos-cobro-section">
                  <div className="pos-cobro-label">Forma de pago</div>
                  <div className="pos-cobro-pay-tabs">
                    {([['efectivo', `${UI.money} Efectivo`, 'efectivo'], ['sinpe', `${UI.phone} SINPE`, 'sinpe'], ['tarjeta', `${UI.card} Tarjeta`, 'tarjeta'], ['transferencia', `${UI.bank} Transf.`, 'trans']] as Array<[TipoPago,string,string]>).map(([v,label,cls]) => {
                      const isActive = tipoPago === v
                      return <button key={v} className={'pos-cobro-pay-tab' + (isActive ? ' sel ' + cls : '')} onClick={() => setTipoPago(v)}>{label}</button>
                    })}
                  </div>
                </div>
              )}

              {/* Efectivo: monto + montos rápidos + cambio */}
              {tipoPago === 'efectivo' && (
                <div className="pos-cobro-section">
                  <div className="pos-cobro-label">Monto recibido</div>
                  <input
                    className="pos-cobro-input"
                    type="text"
                    inputMode="decimal"
                    value={montoRecibido
                      ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(montoRecibido) || 0)
                      : ''}
                    onChange={(e) => {
                      // Solo dÃƒÆ’Ã‚Â­gitos, punto y coma ? extraer nÃƒÆ’Ã‚Âºmero limpio
                      const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '')
                      setMontoRecibido(raw)
                    }}
                    onFocus={(e) => e.target.select()}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && !guardando && confirmarCobro()}
                  />
                  <div className="pos-cobro-quick">
                    <button className="pos-cobro-quick-btn" onClick={() => setMontoRecibido(String(total))}>Exacto</button>
                    {[500,1000,2000,5000,10000,20000,50000].filter(a => a >= total).slice(0,5).map(a => (
                      <button key={a} className="pos-cobro-quick-btn" onClick={() => setMontoRecibido(String(a))}>
                        {CRC}{a >= 1000 ? `${a/1000}k` : a}
                      </button>
                    ))}
                  </div>
                  <div className="pos-cobro-cambio">
                    <span className="pos-cobro-cambio-label">Cambio</span>
                    <span className="pos-cobro-cambio-val">{CRC}{fmt(cambio)}</span>
                  </div>
                </div>
              )}

              {/* SINPE / Tarjeta: referencia */}
              {(tipoPago === 'sinpe' || tipoPago === 'tarjeta') && (
                <div className="pos-cobro-section">
                  <div className="pos-cobro-label">
                    {tipoPago === 'sinpe' ? 'Número de comprobante SINPE' : 'Autorización / Últimos 4 dígitos'}
                  </div>
                  <input
                    className="pos-cobro-ref-input"
                    type="text"
                    placeholder={tipoPago === 'sinpe' ? 'Ej: 12345678' : 'Ej: 4321 / AUT-0012'}
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && !guardando && confirmarCobro()}
                  />
                </div>
              )}
            </>}

            {msgOk && <div className="pos-cobro-ok">{UI.check} {msgOk}</div>}
            {msgErr && <div className="pos-cobro-err">{UI.warning} {msgErr}</div>}

            <div className="pos-cobro-actions">
              {tiqueteData ? (
                <>
                  <button className="pos-cobro-print" onClick={() => { imprimirTiquete(tiqueteData!); cerrarCobroModal() }}>{UI.printer} Imprimir tiquete</button>
                  <button className="pos-cobro-close" onClick={cerrarCobroModal}>{UI.close} Cerrar</button>
                </>
              ) : (
                <>
                  <button className="pos-cobro-cancel" onClick={cerrarCobroModal} disabled={guardando}>Cancelar</button>
                  <button className="pos-cobro-confirm" onClick={confirmarCobro} disabled={guardando}>
                    {guardando ? 'Procesando...' : 'Confirmar cobro'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* -- Comprobantes FE -- */}
      {feOpen && createPortal(
        <div className="pos-fe-panel" onClick={(e) => e.target === e.currentTarget && setFeOpen(false)}>
          <div className="pos-fe-drawer">
            <div className="pos-fe-header">
              <div>
                <div className="pos-fe-title">Comprobantes Electrónicos</div>
                <div style={{ fontSize: 11, color: '#3a4e6e', marginTop: 2 }}>{feDocs.length} comprobante{feDocs.length !== 1 ? 's' : ''} <span className="pos-sep" /> {terminal.sucursalMh && terminal.puntoVentaMh ? `Terminal ${terminal.sucursalMh}-${terminal.puntoVentaMh}` : terminal.cajaNombre}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="pos-fe-btn" onClick={cargarComprobantes} disabled={feLoading} style={{ fontSize: 12 }}>
                  {feLoading ? 'Cargando...' : `${UI.sync} Actualizar`}
                </button>
                <button className="pos-fe-close" onClick={() => setFeOpen(false)}>{UI.close}</button>
              </div>
            </div>
            {feMsg && <div className="pos-fe-msg">{feMsg}</div>}
            <div className="pos-fe-body">
              {feLoading && !feDocs.length && (
                <div style={{ textAlign: 'center', color: '#3a4e6e', fontSize: 13, marginTop: 40 }}>Cargando...</div>
              )}
              {!feLoading && !feDocs.length && (
                <div style={{ textAlign: 'center', color: '#3a4e6e', fontSize: 13, marginTop: 40 }}>Sin comprobantes registrados</div>
              )}
              {feDocs.map((doc) => {
                const estadoColor = FE_ESTADO_COLOR[doc.estado_mh || ''] || '#5c7099'
                const busy = feBusyId === doc.id
                const rechazado = esDocumentoRechazado(doc.estado_mh)
                return (
                  <div key={doc.id} className="pos-fe-row">
                    <div className="pos-fe-row-top">
                      <span className="pos-fe-tipo">{FE_TIPO[doc.tipo_documento] || doc.tipo_documento}</span>
                      <span className="pos-fe-consec">{doc.numero_consecutivo || `#${doc.id}`}</span>
                      <span className="pos-fe-badge" style={{ background: estadoColor + '22', color: estadoColor }}>
                        {doc.estado_mh || 'pendiente'}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="pos-fe-total">{CRC}{fmt(Number(doc.total_comprobante))}</div>
                      <div className="pos-fe-fecha">{doc.fecha_emision}</div>
                    </div>
                    <div className="pos-fe-cliente">{doc.receptor_nombre || 'Consumidor Final'}</div>
                    {doc.clave_mh && (
                      <div style={{ fontSize: 9, color: '#3a4e6e', fontFamily: 'monospace', gridColumn: '1/-1', marginTop: 2, wordBreak: 'break-all' }}>
                        {doc.clave_mh}
                      </div>
                    )}
                    <div className="pos-fe-actions">
                      <button className="pos-fe-btn" disabled={busy || rechazado} onClick={() => feConsultarEstado(doc.id)} title={rechazado ? 'Documento rechazado: consulta deshabilitada' : 'Consultar estado en Hacienda'}>
                        {UI.sync} Estado MH
                      </button>
                      {doc.pos_venta_id && (
                        <button className="pos-fe-btn" disabled={busy || rechazado} onClick={() => feReenviarEmail(doc)} title={rechazado ? 'Documento rechazado: envío deshabilitado' : 'Enviar comprobante por email'}>
                          {UI.email} Email
                        </button>
                      )}
                      {doc.pos_venta_id && (
                        <button className="pos-fe-btn" disabled={busy} onClick={() => reimprimirTiquete(doc.pos_venta_id)} title="Reimprimir tiquete">
                          {UI.printer} Imprimir
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* -- Historial del día -- */}
      {histOpen && createPortal(
        <div className="pos-hist-panel" onClick={(e) => e.target === e.currentTarget && setHistOpen(false)}>
          <div className="pos-hist-drawer">
            <div className="pos-hist-title">
              Ventas de hoy
              <button className="pos-hist-close" onClick={() => setHistOpen(false)}>{UI.close}</button>
            </div>
            <div style={{ fontSize: '12px', color: '#5c7099', marginBottom: '14px' }}>
              {histVentas.length} venta{histVentas.length !== 1 ? 's' : ''} <span className="pos-sep" /> Total: <strong style={{ color: '#34d399' }}>{CRC}{fmt(totalHoy)}</strong>
            </div>
            {histVentas.map((v) => (
              <div key={v.id} className="pos-hist-row">
                <div className="pos-hist-row-info">
                  <div className="pos-hist-cliente">{v.cliente_nombre || 'Consumidor Final'}</div>
                  <div className="pos-hist-ts">{new Date(v.created_at).toLocaleTimeString('es-CR')} <span className="pos-sep" /> #{v.id}</div>
                </div>
                <span className={`pos-hist-tag ${v.tipo_pago}`}>{v.tipo_pago}</span>
                <div className="pos-hist-total">{CRC}{fmt(Number(v.total))}</div>
                <button className="pos-hist-print" onClick={() => reimprimirTiquete(v.id)} title="Reimprimir tiquete">{UI.printer}</button>
                <button className="pos-hist-dev" onClick={() => { setDevVentaId(v.id); setDevMsg(''); setDevModalOpen(true) }} title="Devolver venta">↩ Dev.</button>
              </div>
            ))}
            {devMsg && (
              <div style={{ background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.25)', borderRadius:'10px', padding:'10px 14px', color:'#34d399', fontSize:'13px', marginBottom:'10px' }}>
                {devMsg}
              </div>
            )}
            {!histVentas.length && (
              <div style={{ fontSize: '13px', color: '#3a4e6e', textAlign: 'center', marginTop: '40px' }}>
                Sin ventas registradas hoy
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* -- Modal email comprobante FE -- */}
      {feEmailModal && createPortal(
        <div className="pos-overlay" style={{ zIndex: 2500 }}>
          <div className="pos-modal" style={{ width: 'min(400px,92vw)' }}>
            <div className="pos-modal-title">Enviar comprobante por email</div>
            <div style={{ fontSize: 12, color: '#5c7099', marginBottom: 16 }}>
              {feEmailModal.doc.numero_consecutivo || `#${feEmailModal.doc.id}`} <span className="pos-sep" /> {feEmailModal.doc.receptor_nombre || 'Consumidor Final'}
            </div>
            <label className="pos-modal-label">Correo del cliente</label>
            <input
              className="pos-modal-input"
              type="email"
              placeholder="correo@ejemplo.com"
              value={feEmailInput}
              onChange={(e) => setFeEmailInput(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => e.key === 'Enter' && void feEnviarEmailConfirmar()}
              autoFocus
            />
            <div className="pos-modal-actions">
              <button className="pos-modal-cancel" onClick={() => setFeEmailModal(null)}>Cancelar</button>
              <button className="pos-modal-confirm" onClick={() => void feEnviarEmailConfirmar()} disabled={!feEmailInput.trim()}>
                {UI.email} Enviar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* -- Modal buscador de artículos -- */}
      {buscadorOpen && createPortal(
        <div className="pos-buscador-overlay" onClick={(e) => e.target === e.currentTarget && setBuscadorOpen(false)}>
          <div className="pos-buscador-modal">
            <div className="pos-buscador-header">
              <div className="pos-buscador-title">Buscar artículo</div>
              <div className="pos-buscador-hint">Búsqueda por código de barras, código interno o descripción <span className="pos-sep" /> Enter para agregar <span className="pos-sep" /> Esc para cerrar</div>
              <div className="pos-buscador-input-wrap">
                <span className="pos-buscador-icon">{UI.search}</span>
                <input
                  ref={buscadorInputRef}
                  className="pos-buscador-input"
                  placeholder="Código o descripción del artículo..."
                  value={buscadorQ}
                  onChange={(e) => setBuscadorQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setBuscadorOpen(false)
                    if (e.key === 'Enter' && buscadorResultados.length === 1) {
                      agregarProducto(buscadorResultados[0])
                      setBuscadorOpen(false)
                    }
                  }}
                  autoComplete="off"
                />
                {buscadorCargando && <span className="pos-buscador-count">buscando...</span>}
                {!buscadorCargando && <span className="pos-buscador-count">{buscadorResultados.length} artículo(s)</span>}
              </div>
            </div>
            <div className="pos-buscador-list">
              {buscadorResultados.length === 0 ? (
                <div className="pos-buscador-empty">
                  {buscadorQ ? 'Sin resultados para esa búsqueda' : 'Escriba para buscar artículos'}
                </div>
              ) : (
                buscadorResultados.map((p) => (
                  <div key={p.id} className="pos-buscador-item" onClick={() => {
                    agregarProducto(p)
                    setBuscadorOpen(false)
                  }}>
                    <div className="pos-buscador-code">{p.codigo || 'S/C'}</div>
                    <div className="pos-buscador-info">
                      <div className="pos-buscador-name">{p.descripcion}</div>
                      <div className="pos-buscador-meta">
                        {p.unidad_medida || 'Unid'} <span className="pos-sep" /> IVA {p.tarifa_iva ?? 13}%
                        {p.stock_actual == null ? ` $<span className="pos-sep" /> Sin control de stock` : ` $<span className="pos-sep" /> Stock: ${p.stock_actual}`}
                      </div>
                    </div>
                    <div className="pos-buscador-price">{CRC}{fmt(p.precio_venta)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* -- Modal alerta precio / stock -- */}
      {alertaMsg && createPortal(
        <div
          style={{ position:'fixed', inset:0, background:'rgba(6,10,20,0.82)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000, padding:16 }}
          onClick={() => { setAlertaMsg(''); barcodeRef.current?.focus() }}
        >
          <div
            style={{ background:'#111a2e', border:'1px solid rgba(239,68,68,0.35)', borderRadius:18, padding:'28px 32px', maxWidth:420, width:'100%', boxShadow:'0 40px 100px rgba(0,0,0,.6)', textAlign:'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize:36, marginBottom:12 }}>{UI.warning}</div>
            <div style={{ color:'#fca5a5', fontWeight:800, fontSize:15, marginBottom:12, lineHeight:1.4, whiteSpace:'pre-line' }}>
              {alertaMsg}
            </div>
            <button
              autoFocus
              onClick={() => { setAlertaMsg(''); barcodeRef.current?.focus() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { setAlertaMsg(''); barcodeRef.current?.focus() } }}
              style={{ marginTop:8, background:'#ef4444', border:'none', borderRadius:10, color:'#fff', fontWeight:800, fontSize:13, padding:'9px 28px', cursor:'pointer' }}
            >
              Aceptar
            </button>
          </div>
        </div>
      , document.body)}

      {/* -- Toast FE aceptada -- */}
      {feToast && createPortal(
        <div className="pos-fe-toast">
          <div className="pos-fe-toast-icon">{UI.email}</div>
          <div className="pos-fe-toast-body">
            <div className="pos-fe-toast-title">Comprobante enviado</div>
            <div className="pos-fe-toast-sub">{feToast}</div>
          </div>
        </div>
      , document.body)}

      <DevolucionModal
        open={devModalOpen}
        ventaId={devVentaId}
        empresaId={empresaId}
        apiBase={API}
        authHeaders={authHeaders}
        formatMoney={fmt}
        onClose={() => setDevModalOpen(false)}
        onSuccess={(devId, total, tieneFE) => {
          setDevModalOpen(false)
          setDevMsg(
            tieneFE
              ? `Devolución #${devId} registrada — ₡${fmt(total)} — NC electrónica en proceso`
              : `Devolución #${devId} registrada — ₡${fmt(total)} — Stock revertido`
          )
          cargarHistorial()
        }}
      />

    </>
  )
}
