/**
 * FacturaPreviewModal — Vista previa de comprobante electrónico
 * Patrón página completa (igual a BoletaDespachoImprimir): window.print() + @media print
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { fetchEmpresaTimeZone, formatCompanyDate, resolveCompanyTimeZone } from '../../utils/companyTimeZone'

interface Props {
  docId: number
  empresaId: number
  onClose: () => void
}

interface DocFull {
  id: number
  tipo_documento: string
  fecha_emision: string
  numero_consecutivo: string | null
  clave_mh: string | null
  total_comprobante: number
  subtotal: number | null
  total_descuento: number | null
  total_impuesto: number | null
  receptor_nombre: string | null
  receptor_identificacion: string | null
  receptor_email: string | null
  receptor_telefono: string | null
  receptor_direccion: string | null
  condicion_venta: string | null
  medio_pago: string | null
  plazo_credito_dias: number | null
  moneda: string | null
  observacion: string | null
  estado_mh: string | null
}

interface Linea {
  linea: number
  codigo_interno: string | null
  descripcion: string
  cantidad: number
  unidad_medida: string | null
  precio_unitario: number
  descuento_monto: number | null
  tarifa_iva_porcentaje: number | null
  total_linea: number
}

interface Cfg {
  ambiente: string | null
  nombre_emisor: string | null
  nombre_comercial: string | null
  numero_identificacion: string | null
  telefono_emisor: string | null
  correo_envio: string | null
  provincia: string | null
  canton: string | null
  otras_senas: string | null
  logo_url: string | null
}

// ─── Catálogos ───────────────────────────────────────────────────────────────

const CONDICION: Record<string, string> = {
  '01': 'CONTADO', '02': 'CRÉDITO', '03': 'CONSIGNACIÓN',
  '04': 'APARTADO', '05': 'ARRENDAMIENTO CON OPCIÓN',
  '06': 'ARRENDAMIENTO FINANCIERO', '99': 'OTROS',
}
const MEDIO_PAGO: Record<string, string> = {
  '01': 'Efectivo', '02': 'Tarjeta', '03': 'Cheque',
  '04': 'Transferencia / Depósito', '05': 'Recaudado por terceros', '99': 'Otros',
}
const DOC_TIPO: Record<string, string> = {
  '01': 'FACTURA ELECTRÓNICA',
  '02': 'NOTA DE DÉBITO ELECTRÓNICA',
  '03': 'NOTA DE CRÉDITO ELECTRÓNICA',
  '04': 'TIQUETE ELECTRÓNICO',
  '09': 'FACTURA ELECTRÓNICA DE EXPORTACIÓN',
}

// ─── Número a letras ──────────────────────────────────────────────────────────

function enteroALetras(n: number): string {
  if (n === 0) return 'CERO'
  if (n < 0) return 'MENOS ' + enteroALetras(-n)
  const u = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const d = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const c = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']
  if (n === 100) return 'CIEN'
  if (n < 20) return u[n]
  if (n < 100) return d[Math.floor(n / 10)] + (n % 10 ? ' Y ' + u[n % 10] : '')
  if (n < 1000) return c[Math.floor(n / 100)] + (n % 100 ? ' ' + enteroALetras(n % 100) : '')
  if (n === 1000) return 'MIL'
  if (n < 2000) return 'MIL' + (n % 1000 ? ' ' + enteroALetras(n % 1000) : '')
  if (n < 1_000_000) return enteroALetras(Math.floor(n / 1000)) + ' MIL' + (n % 1000 ? ' ' + enteroALetras(n % 1000) : '')
  if (n === 1_000_000) return 'UN MILLÓN'
  if (n < 2_000_000) return 'UN MILLÓN' + (n % 1_000_000 ? ' ' + enteroALetras(n % 1_000_000) : '')
  return enteroALetras(Math.floor(n / 1_000_000)) + ' MILLONES' + (n % 1_000_000 ? ' ' + enteroALetras(n % 1_000_000) : '')
}

function montoALetras(monto: number, moneda: string): string {
  const entero = Math.floor(monto)
  const cents = Math.round((monto - entero) * 100)
  const monedaNombre = moneda === 'USD' ? 'DÓLARES' : moneda === 'CRC' ? 'COLONES' : moneda
  return enteroALetras(entero) + ' CON ' + String(cents).padStart(2, '0') + '/100 ' + monedaNombre
}

// ─── Constante de color ───────────────────────────────────────────────────────

const GREEN = '#1a5c38'

// ─── Estilos de celda de tabla (inline para impresión) ───────────────────────

const TH: React.CSSProperties = {
  background: GREEN, color: '#fff', padding: '5px 8px',
  fontWeight: 700, fontSize: 10, border: `1px solid ${GREEN}`, textAlign: 'center',
}
const TH_L: React.CSSProperties = { ...TH, textAlign: 'left' }
const TH_R: React.CSSProperties = { ...TH, textAlign: 'right' }
// Sin bordes horizontales: solo separadores verticales (borderRight)
const TD: React.CSSProperties = { padding: '4px 7px', borderRight: '1px solid #d1d5db', fontSize: 11, verticalAlign: 'middle' }
const TD_C: React.CSSProperties = { ...TD, textAlign: 'center' }
const TD_R: React.CSSProperties = { ...TD, textAlign: 'right' }
const TD_RB: React.CSSProperties = { ...TD_R, fontWeight: 700 }
const LBL: React.CSSProperties = { padding: '3px 8px', borderRight: '1px solid #d1d5db', borderBottom: '1px solid #e5e7eb', color: '#555', fontStyle: 'italic', whiteSpace: 'nowrap', fontSize: 10.5 }
const VAL: React.CSSProperties = { padding: '3px 8px', borderRight: '1px solid #d1d5db', borderBottom: '1px solid #e5e7eb', fontSize: 11 }
const VAL_B: React.CSSProperties = { ...VAL, fontWeight: 700 }

// ─── Componente ───────────────────────────────────────────────────────────────

export function FacturaPreviewModal({ docId, empresaId, onClose }: Props) {
  const [doc, setDoc]       = useState<DocFull | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [cfg, setCfg]       = useState<Cfg>({} as Cfg)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')
  const [sending, setSending] = useState(false)
  const [sendOk, setSendOk]   = useState('')
  const [sendErr, setSendErr] = useState('')
  const [empresaTimeZone, setEmpresaTimeZone] = useState(() => resolveCompanyTimeZone(null))

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      setLoading(true); setErr('')
      try {
        const [docRes, lineasRes, cfgRes] = await Promise.all([
          supabase
            .from('fe_documentos')
            .select('id, tipo_documento, fecha_emision, numero_consecutivo, clave_mh, total_comprobante, subtotal, total_descuento, total_impuesto, receptor_nombre, receptor_identificacion, receptor_email, receptor_telefono, receptor_direccion, condicion_venta, medio_pago, plazo_credito_dias, moneda, observacion, estado_mh')
            .eq('empresa_id', empresaId).eq('id', docId).single(),
          supabase
            .from('fe_documento_lineas')
            .select('linea, codigo_interno, descripcion, cantidad, unidad_medida, precio_unitario, descuento_monto, tarifa_iva_porcentaje, total_linea')
            .eq('documento_id', docId).order('linea', { ascending: true }),
          supabase
            .from('fe_config_empresa')
            .select('ambiente, nombre_emisor, nombre_comercial, numero_identificacion, telefono_emisor, correo_envio, provincia, canton, otras_senas, logo_url')
            .eq('empresa_id', empresaId).maybeSingle(),
        ])
        if (cancelled) return
        if (docRes.error) throw docRes.error
        if (lineasRes.error) throw lineasRes.error
        setDoc(docRes.data as DocFull)
        setLineas((lineasRes.data || []) as Linea[])
        setCfg((cfgRes.data || {}) as Cfg)
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || 'No se pudo cargar el documento.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadData()
    return () => { cancelled = true }
  }, [docId, empresaId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    void fetchEmpresaTimeZone(empresaId).then(setEmpresaTimeZone)
  }, [empresaId])

  const handleSend = async () => {
    setSending(true); setSendOk(''); setSendErr('')
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !session?.access_token) throw new Error('Sesión expirada.')
      const resp = await fetch(`/api/facturacion/reenviar/${docId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ empresa_id: empresaId }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudo enviar el correo.')
      setSendOk(`Enviado a ${json.to}`)
    } catch (e: any) {
      setSendErr(String(e?.message || 'Error al enviar.'))
    } finally { setSending(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--gray-400)', fontSize: 14 }}>
      Cargando documento...
    </div>
  )
  if (err || !doc) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
      <div style={{ color: '#f87171', fontSize: 13 }}>{err || 'No se encontró el documento.'}</div>
      <button onClick={onClose} style={{ border: '1px solid #475569', background: 'transparent', color: '#94a3b8', padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Volver</button>
    </div>
  )

  // ── Derivados ─────────────────────────────────────────────────────────────
  const fmt = (n: number | null | undefined) =>
    new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))

  const nombreComercial = cfg.nombre_comercial || cfg.nombre_emisor || 'ERP MYA'
  const nombreEmisor = cfg.nombre_emisor || cfg.nombre_comercial || 'ERP MYA'
  const esPruebas = String(cfg.ambiente || 'pruebas').toLowerCase() !== 'produccion'
  const moneda    = doc.moneda || 'CRC'
  const simbolo   = moneda === 'USD' ? '$' : '₡'
  const monedaLabel = moneda === 'CRC' ? 'Colón Costarricense' : moneda === 'USD' ? 'Dólar Estados Unidos' : moneda

  const fechaStr  = formatCompanyDate(doc.fecha_emision || new Date().toISOString(), empresaTimeZone)

  const impuesto  = Number(doc.total_impuesto || 0)
  const descuento = Number(doc.total_descuento || 0)
  const subtotal  = Number(doc.subtotal ?? (Number(doc.total_comprobante || 0) - impuesto))
  const filasVacias = lineas.length < 8 ? 8 - lineas.length : 0

  const logoUrl   = cfg.logo_url || null
  const direccion = String(cfg.otras_senas || '').trim()

  return (
    <>
      {/* ── Barra pantalla (no se imprime) ─────────────────────────────── */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        background: '#0f172a', borderBottom: '1px solid #1e3a5f', padding: '10px 16px',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(59,130,246,.5)', background: 'rgba(30,58,138,.3)', color: '#93c5fd', padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimir
          </button>
          <button onClick={handleSend} disabled={!doc.receptor_email || sending} title={!doc.receptor_email ? 'Sin correo registrado' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(34,197,94,.4)', background: 'rgba(20,83,45,.3)', color: '#4ade80', padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: (!doc.receptor_email || sending) ? 'not-allowed' : 'pointer', opacity: (!doc.receptor_email || sending) ? .55 : 1 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            {sending ? 'Enviando...' : 'Enviar email'}
          </button>
          {sendOk  && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ {sendOk}</span>}
          {sendErr && <span style={{ fontSize: 12, color: '#fca5a5' }}>{sendErr}</span>}
        </div>
        <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Cerrar (Esc)
        </button>
      </div>

      {/* ── Fondo gris en pantalla ────────────────────────────────────────── */}
      <div className="no-print-bg" style={{ background: '#e5e7eb', minHeight: '100vh', padding: '24px 16px' }}>

        {/* ── Documento imprimible ───────────────────────────────────────── */}
        <div id="factura-print" style={{
          position: 'relative',
          maxWidth: 900, margin: '0 auto', padding: '16px 18px',
          fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a1a1a',
          background: '#ffffff', fontSize: 11,
          boxShadow: '0 2px 16px rgba(0,0,0,.25)',
        }}>
          {esPruebas ? (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden',
            }}>
              <div style={{
                transform: 'rotate(-32deg)',
                fontSize: 64,
                fontWeight: 900,
                letterSpacing: '.18em',
                color: 'rgba(185, 28, 28, 0.12)',
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}>
                PRUEBAS
              </div>
            </div>
          ) : null}

          {/* ══ CABECERA ══════════════════════════════════════════════════ */}
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #aaa', marginBottom: 0 }}>
            <tbody>
              <tr>
                {/* Logo */}
                <td style={{ width: 74, padding: 8, borderRight: '1px solid #aaa', verticalAlign: 'middle', textAlign: 'center' }}>
                  {logoUrl
                    ? <img src={logoUrl} alt="Logo" style={{ width: 62, height: 62, objectFit: 'contain', borderRadius: '50%' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : <div style={{ width: 62, height: 62, borderRadius: '50%', border: `3px solid ${GREEN}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: GREEN, margin: '0 auto' }}>
                        {nombreComercial.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'MYA'}
                      </div>
                  }
                </td>
                {/* Datos emisor */}
                <td style={{ padding: '8px 12px', borderRight: '1px solid #aaa', verticalAlign: 'middle' }}>
                  <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 2 }}>{nombreComercial}</div>
                  <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, color: '#374151' }}>{nombreEmisor}</div>
                  <div style={{ fontSize: 10, color: '#333', lineHeight: 1.7 }}>
                    {cfg.numero_identificacion ? <>Cédula {cfg.numero_identificacion}<br /></> : null}
                    {direccion ? <>{direccion}<br /></> : null}
                    {cfg.telefono_emisor ? <>Teléfono: {cfg.telefono_emisor}<br /></> : null}
                    {cfg.correo_envio ? <>Email: {cfg.correo_envio}</> : null}
                  </div>
                </td>
                {/* Tipo y número de documento */}
                <td style={{ textAlign: 'right', padding: '8px 14px', verticalAlign: 'middle', width: 260 }}>
                  <div style={{ color: GREEN, fontWeight: 900, fontSize: 14, lineHeight: 1.15 }}>
                    {DOC_TIPO[doc.tipo_documento] || 'COMPROBANTE ELECTRÓNICO'}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 12, marginTop: 4 }}>
                    No. {doc.numero_consecutivo || String(doc.id).padStart(20, '0')}
                  </div>
                  <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>
                    Fecha: {fechaStr}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ══ CLAVE ═════════════════════════════════════════════════════ */}
          <div style={{ border: '1px solid #aaa', borderTop: 0, background: '#f8f8f8', padding: '4px 10px', fontSize: 9, color: '#555', wordBreak: 'break-all', lineHeight: 1.5 }}>
            Clave: <span style={{ fontFamily: 'monospace', color: '#222' }}>{doc.clave_mh || 'Pendiente de asignar'}</span>
          </div>

          {/* ══ DATOS DEL CLIENTE ═════════════════════════════════════════ */}
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #aaa', borderTop: 0, marginBottom: 0 }}>
            <thead>
              <tr>
                <th colSpan={4} style={{ background: GREEN, color: '#fff', padding: '5px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11, border: `1px solid ${GREEN}` }}>
                  Datos del Cliente
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={LBL}>Cliente:</td>
                <td style={{ ...VAL_B, fontSize: 12 }}>{doc.receptor_nombre || 'Consumidor Final'}</td>
                <td style={LBL}>Condición:</td>
                <td style={VAL}>{CONDICION[doc.condicion_venta || ''] || doc.condicion_venta || 'CONTADO'}</td>
              </tr>
              <tr>
                <td style={LBL}>Cédula:</td>
                <td style={VAL}>{doc.receptor_identificacion || ''}</td>
                <td style={LBL}>Plazo:</td>
                <td style={VAL}>{doc.plazo_credito_dias ? `${doc.plazo_credito_dias} días` : '—'}</td>
              </tr>
              <tr>
                <td style={LBL}>Dirección:</td>
                <td style={VAL}>{doc.receptor_direccion || ''}</td>
                <td style={LBL}>Moneda:</td>
                <td style={VAL}>{monedaLabel}</td>
              </tr>
              <tr>
                <td style={LBL}>Email:</td>
                <td style={VAL}>{doc.receptor_email || ''}</td>
                <td style={LBL}>Forma de pago:</td>
                <td style={VAL}>{MEDIO_PAGO[doc.medio_pago || ''] || doc.medio_pago || 'Efectivo'}</td>
              </tr>
              <tr>
                <td style={LBL}>Teléfono:</td>
                <td style={VAL}>{doc.receptor_telefono || ''}</td>
                <td style={LBL}></td>
                <td style={VAL}></td>
              </tr>
            </tbody>
          </table>

          {/* ══ TABLA DE ARTÍCULOS ════════════════════════════════════════ */}
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #aaa', borderTop: 0, marginBottom: 0 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 50 }}>Código</th>
                <th style={{ ...TH_R, width: 72 }}>Cantidad</th>
                <th style={{ ...TH, width: 40 }}>Emp</th>
                <th style={TH_L}>Nombre del Artículo</th>
                <th style={{ ...TH_R, width: 80 }}>Descto</th>
                <th style={{ ...TH_R, width: 90 }}>Precio</th>
                <th style={{ ...TH_R, width: 95 }}>Total</th>
                <th style={{ ...TH, width: 45 }}>IVA</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const dscto = Number(l.descuento_monto || 0)
                const iva   = (l.tarifa_iva_porcentaje != null && l.tarifa_iva_porcentaje > 0)
                  ? `${l.tarifa_iva_porcentaje}%` : '0%'
                const bg = i % 2 === 1 ? '#f5f5f5' : '#fff'
                return (
                  <tr key={l.linea} style={{ background: bg }}>
                    <td style={TD_C}>{l.codigo_interno || String(l.linea).padStart(2, '0')}</td>
                    <td style={TD_R}>{Number(l.cantidad).toLocaleString('es-CR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                    <td style={TD_C}>{l.unidad_medida || 'Unid'}</td>
                    <td style={TD}>{l.descripcion || ''}</td>
                    <td style={TD_R}>{dscto > 0 ? fmt(dscto) : ''}</td>
                    <td style={TD_R}>{fmt(l.precio_unitario)}</td>
                    <td style={TD_RB}>{fmt(l.total_linea)}</td>
                    <td style={{ ...TD_C, borderRight: 0 }}>{iva}</td>
                  </tr>
                )
              })}
              {Array.from({ length: filasVacias }).map((_, i) => (
                <tr key={`e${i}`}>
                  <td style={{ ...TD_C, height: 20 }}></td>
                  <td style={{ ...TD_R, height: 20 }}></td>
                  <td style={{ ...TD_C, height: 20 }}></td>
                  <td style={{ ...TD,   height: 20 }}></td>
                  <td style={{ ...TD_R, height: 20 }}></td>
                  <td style={{ ...TD_R, height: 20 }}></td>
                  <td style={{ ...TD_R, height: 20 }}></td>
                  <td style={{ ...TD_C, height: 20, borderRight: 0 }}></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ══ TOTALES (tabla derecha) ═══════════════════════════════════ */}
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #aaa', borderTop: 0, marginBottom: 0 }}>
            <tbody>
              <tr>
                {/* Observaciones / espacio izquierdo */}
                <td style={{ padding: '8px 10px', borderRight: '1px solid #aaa', verticalAlign: 'top', fontSize: 10, color: '#555', width: '55%' }}>
                  {doc.observacion || ''}
                </td>
                {/* Tabla de totales */}
                <td style={{ padding: 0, verticalAlign: 'bottom' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['Subtotal',  fmt(subtotal)],
                        ['Descuento', descuento > 0 ? fmt(descuento) : ''],
                        ['I.V.A.',    impuesto  > 0 ? fmt(impuesto)  : ''],
                      ].map(([lbl, val]) => (
                        <tr key={lbl}>
                          <td style={{ padding: '4px 10px', fontWeight: 700, fontSize: 11, textAlign: 'right', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>{lbl}</td>
                          <td style={{ padding: '4px 10px', fontSize: 11, textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontFamily: 'monospace' }}>{val}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ padding: '5px 10px', fontWeight: 700, fontSize: 12, textAlign: 'right', background: GREEN, color: '#fff' }}>Total a Pagar</td>
                        <td style={{ padding: '5px 10px', fontSize: 13, fontWeight: 900, textAlign: 'right', background: GREEN, color: '#fff', fontFamily: 'monospace' }}>{simbolo}{fmt(doc.total_comprobante)}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ══ SON (valor en letras) ═════════════════════════════════════ */}
          <div style={{ border: '1px solid #aaa', borderTop: 0, padding: '5px 10px', fontSize: 10, lineHeight: 1.5 }}>
            <strong>Son:</strong> {montoALetras(Number(doc.total_comprobante || 0), moneda)}
          </div>

          {/* ══ PIE ══════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, gap: 20 }}>
            <div style={{ textAlign: 'center', minWidth: 220 }}>
              <div style={{ borderTop: '1px solid #555', paddingTop: 4, fontSize: 10, color: '#555' }}>
                Recibido conforme: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Cédula:
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 9, color: '#777', lineHeight: 1.6 }}>
              Autorización No. DGT-R-033-2019 del 20/06/2019 — DGTD v.4.4<br />
              {cfg.telefono_emisor ? `${nombreComercial} · Tel. (506) ${cfg.telefono_emisor}` : nombreComercial}
            </div>
          </div>

        </div>{/* fin factura-print */}
      </div>{/* fin fondo gris */}

      <style>{`
        @page { size: Letter portrait; margin: 8mm 10mm; }
        @media print {
          .no-print    { display: none !important; }
          .no-print-bg { background: none !important; padding: 0 !important; min-height: auto !important; }
          nav, aside, header,
          [class*="sidebar"], [class*="Sidebar"],
          [class*="topbar"], [class*="Topbar"],
          [class*="layout"], [class*="shell"] { display: none !important; }
          html, body { background: #fff !important; color: #000 !important; margin: 0 !important; padding: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          #factura-print {
            max-width: 100% !important; width: 100% !important;
            margin: 0 !important; padding: 4px 6px !important;
            box-shadow: none !important; background: #fff !important;
            font-size: 8.5px !important;
          }
          #factura-print table { margin-bottom: 0 !important; }
          #factura-print td, #factura-print th { padding: 2px 4px !important; }
        }
      `}</style>
    </>
  )
}
