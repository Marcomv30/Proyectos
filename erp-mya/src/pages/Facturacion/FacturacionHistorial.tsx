import { Fragment, type ReactNode, useCallback, useEffect, useState } from 'react'
import { WorkspaceMainPanel } from '../../components/WorkspaceShell'
import { supabase } from '../../supabase'
import { FacturaPreviewModal } from './FacturaPreviewModal'
import { fetchEmpresaTimeZone, formatCompanyDate, resolveCompanyTimeZone } from '../../utils/companyTimeZone'

interface Props {
  empresaId: number
  setNavbarExtra: (node: ReactNode) => void
}

interface DocumentoHistRow {
  id: number
  estado: string
  estado_mh?: string | null
  tipo_documento: string
  fecha_emision: string
  numero_consecutivo: string | null
  total_comprobante: number | null
  receptor_nombre?: string | null
  receptor_email?: string | null
  clave_mh?: string | null
  respuesta_mh_json?: any
  doc_origen_id?: number | null
}

const DOC_LABEL: Record<string, string> = {
  '01': 'FE',
  '02': 'ND',
  '03': 'NC',
  '04': 'TE',
  '09': 'FEE',
}

const STYLES = `
  .fehist-wrap { padding: 18px; color: var(--card-text); }
  .fehist-head { display:grid; grid-template-columns:minmax(240px,1fr) auto; gap:16px; align-items:center; margin-bottom:18px; position:sticky; top:0; z-index:10; background:color-mix(in srgb, var(--bg-dark2) 95%, var(--green-main) 5%); padding:14px 18px; margin:-0px -18px 18px; border-bottom:1px solid color-mix(in srgb, var(--card-border) 80%, var(--green-main) 20%); box-shadow:0 4px 16px rgba(0,0,0,.35); }
  .fehist-title { font-size:28px; font-weight:800; letter-spacing:-.03em; }
  .fehist-sub { font-size:13px; color:var(--gray-400); margin-top:6px; }
  .fehist-actions { display:flex; gap:10px; flex-wrap:wrap; }
  .fehist-btn { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 82%, var(--card-bg)); color:var(--card-text); border-radius:0; padding:8px 12px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; min-height:36px; }
  .fehist-btn:hover:not(:disabled) { border-color:color-mix(in srgb, var(--green-main) 40%, var(--card-border)); background:color-mix(in srgb, var(--green-main) 10%, var(--bg-dark2)); }
  .fehist-btn:disabled { opacity:.55; cursor:not-allowed; }
  .fehist-summary { display:grid; grid-template-columns:repeat(4, minmax(150px,1fr)); gap:12px; margin-bottom:18px; }
  .fehist-card { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 84%, transparent); padding:14px 16px; }
  .fehist-card .k { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--gray-400); margin-bottom:6px; }
  .fehist-card .v { font-size:22px; font-weight:800; }
  .fehist-table-hint { display:none; margin:-4px 0 10px; font-size:12px; color:var(--gray-400); }
  .fehist-table-wrap { overflow:auto; border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 92%, transparent); touch-action:pan-x; -webkit-overflow-scrolling:touch; }
  .fehist-table { width:100%; min-width:900px; border-collapse:separate; border-spacing:0; table-layout:fixed; }
  .fehist-table th, .fehist-table td { padding:11px 12px; border-top:1px solid var(--card-border); font-size:13px; text-align:left; vertical-align:middle; white-space:nowrap; }
  .fehist-table thead th { position:sticky; top:0; z-index:1; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--gray-400); background:color-mix(in srgb, var(--bg-dark) 82%, var(--bg-dark2)); }
  .fehist-table tbody tr { background:transparent; }
  .fehist-table tbody tr:hover { background:color-mix(in srgb, var(--green-main) 6%, var(--bg-dark2)); }
  .fehist-table td.mono { font-family:monospace; overflow:hidden; text-overflow:ellipsis; }
  .fehist-table td.name { overflow:hidden; text-overflow:ellipsis; }
  .fehist-table td.amount { text-align:right; font-family:monospace; }
  .fehist-chip { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border:1px solid var(--card-border); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
  .fehist-chip.ok { color:#86efac; border-color:rgba(34,197,94,.35); background:rgba(20,83,45,.45); }
  .fehist-chip.warn { color:#fcd34d; border-color:rgba(245,158,11,.35); background:rgba(120,53,15,.35); }
  .fehist-chip.info { color:#7dd3fc; border-color:rgba(14,165,233,.35); background:rgba(8,47,73,.35); }
  .fehist-chip.bad { color:#fca5a5; border-color:rgba(239,68,68,.35); background:rgba(127,29,29,.35); }
  .fehist-row-actions { display:flex; gap:6px; flex-wrap:nowrap; align-items:center; justify-content:flex-end; }
  .fehist-icon-btn { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 82%, var(--card-bg)); color:var(--card-text); border-radius:0; padding:0; width:34px; height:34px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
  .fehist-icon-btn:hover:not(:disabled) { border-color:color-mix(in srgb, var(--green-main) 40%, var(--card-border)); background:color-mix(in srgb, var(--green-main) 10%, var(--bg-dark2)); }
  .fehist-icon-btn:disabled { opacity:.45; cursor:not-allowed; }
  .fehist-detail-row td { padding:0; background:color-mix(in srgb, var(--bg-dark) 92%, transparent); }
  .fehist-detail-box { border-top:1px dashed var(--card-border); padding:14px 16px; }
  .fehist-detail-title { font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--gray-400); margin-bottom:8px; }
  .fehist-detail-msg { font-size:13px; line-height:1.5; color:var(--card-text); margin-bottom:10px; white-space:pre-wrap; }
  .fehist-detail-raw { font-family:monospace; font-size:12px; white-space:pre-wrap; word-break:break-word; color:var(--gray-400); border:1px solid var(--card-border); padding:10px 12px; background:color-mix(in srgb, var(--bg-dark2) 90%, transparent); max-height:220px; overflow:auto; }
  .fehist-table th.col-num, .fehist-table td.col-num { width:180px; }
  .fehist-table th.col-date, .fehist-table td.col-date { width:96px; }
  .fehist-table th.col-type, .fehist-table td.col-type { width:56px; }
  .fehist-table th.col-estado, .fehist-table td.col-estado { width:130px; }
  .fehist-table th.col-name, .fehist-table td.col-name { width:auto; }
  .fehist-table th.col-amount, .fehist-table td.col-amount { width:130px; }
  .fehist-table th.col-actions, .fehist-table td.col-actions { width:400px; }
  @media (max-width: 900px) {
    .fehist-head { grid-template-columns:1fr; }
    .fehist-summary { grid-template-columns:repeat(2, minmax(140px,1fr)); }
  }
  @media (max-width: 640px) {
    .fehist-wrap { padding:12px; }
    .fehist-head { padding:12px; margin:0 -12px 16px; }
    .fehist-title { font-size:24px; }
    .fehist-summary { grid-template-columns:1fr; }
    .fehist-actions { width:100%; }
    .fehist-btn { flex:1 1 auto; justify-content:center; }
    .fehist-btn { min-height:34px; padding:7px 10px; }
    .fehist-table-hint { display:block; }
  }
  .fehist-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:1000; display:flex; align-items:center; justify-content:center; }
  .fehist-modal { background:#1e293b; border:1px solid #334155; border-radius:10px; padding:28px 28px 20px; max-width:400px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,.5); }
  .fehist-modal-msg { font-size:14px; color:#e2e8f0; line-height:1.55; margin-bottom:22px; }
  .fehist-modal-actions { display:flex; gap:10px; justify-content:flex-end; }
  .fehist-modal-ok { border:1px solid rgba(34,197,94,.4); background:rgba(20,83,45,.45); color:#4ade80; border-radius:0; padding:8px 20px; font-size:13px; font-weight:700; cursor:pointer; }
  .fehist-modal-ok:hover { background:rgba(20,83,45,.75); }
  .fehist-modal-cancel { border:1px solid #334155; background:transparent; color:#94a3b8; border-radius:0; padding:8px 20px; font-size:13px; font-weight:700; cursor:pointer; }
  .fehist-modal-cancel:hover { border-color:#475569; color:#e2e8f0; }
  .fehist-cabys-row { display:grid; grid-template-columns:auto 1fr; gap:10px; align-items:center; margin-bottom:10px; }
  .fehist-cabys-desc { font-size:12px; color:#94a3b8; }
  .fehist-cabys-input { background:#0f172a; border:1px solid #334155; color:#e2e8f0; padding:6px 10px; font-size:13px; font-family:monospace; width:100%; }
  .fehist-cabys-input:focus { outline:none; border-color:color-mix(in srgb, var(--green-main) 60%, transparent); }
`

function money(n: number) {
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))
}

function mhChipClass(estado?: string | null) {
  const v = String(estado || '').toLowerCase()
  if (v === 'aceptado') return 'ok'
  if (v === 'rechazado' || v === 'error') return 'bad'
  if (v === 'procesando' || v === 'pendiente') return 'warn'
  return 'info'
}

function mhLabel(estado?: string | null) {
  const v = String(estado || '').toLowerCase()
  if (!v) return 'Sin envio'
  if (v === 'aceptado') return 'Aceptado'
  if (v === 'rechazado') return 'Rechazado'
  if (v === 'procesando') return 'Procesando'
  if (v === 'pendiente') return 'Pendiente'
  if (v === 'enviado') return 'Enviado'
  if (v === 'error') return 'Error MH'
  return estado || 'Sin envio'
}

function numeroConsecutivoLabel(doc: DocumentoHistRow) {
  if (doc.numero_consecutivo) return doc.numero_consecutivo
  if (String(doc.estado || '').toLowerCase() === 'borrador') return `BORR-${doc.id}`
  if (!doc.clave_mh) return 'Pendiente fiscal'
  return `DOC-${doc.id}`
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

function extractMhXmlInfo(input: any): { xmlText: string; summary: string } | null {
  const data = parseMhPayload(input)
  if (!data || typeof data === 'string') return null

  const base64 = [
    data?.['respuesta-xml'],
    data?.respuesta_xml,
    data?.respuestaXml,
    data?.respuesta?.['respuesta-xml'],
    data?.respuesta?.respuesta_xml,
    data?.respuesta?.respuestaXml,
  ].find((v) => typeof v === 'string' && v.trim())

  if (!base64) return null

  const xmlText = decodeBase64Utf8(String(base64).trim())
  if (!xmlText) return null

  try {
    const parser = new DOMParser()
    const xml = parser.parseFromString(xmlText, 'application/xml')
    const getText = (tag: string) => xml.getElementsByTagName(tag)?.[0]?.textContent?.trim() || ''
    const estado = getText('EstadoMensaje')
    const detalle = getText('DetalleMensaje')
    const mensaje = getText('Mensaje')
    const clave = getText('Clave')
    const summary = [
      estado ? `Estado: ${estado}` : '',
      mensaje ? `Mensaje: ${mensaje}` : '',
      detalle ? `Detalle: ${detalle}` : '',
      clave ? `Clave: ${clave}` : '',
    ].filter(Boolean).join(' | ')
    return { xmlText, summary }
  } catch {
    return { xmlText, summary: '' }
  }
}

function extractMhMessage(input: any): string {
  const data = parseMhPayload(input)
  if (!data) return 'Sin detalle devuelto por Hacienda.'
  if (typeof data === 'string') return data
  const xmlInfo = extractMhXmlInfo(data)
  if (xmlInfo?.summary) return xmlInfo.summary
  const direct = [
    data?.detalle_mensaje,
    data?.detalleMensaje,
    data?.detalle,
    data?.mensaje,
    data?.message,
    data?.respuestaXml,
    data?.respuesta_xml,
    data?.error?.message,
    data?.error_description,
  ].find((v) => typeof v === 'string' && v.trim())
  if (direct) return String(direct).trim()

  const nested = [
    data?.respuesta?.detalle_mensaje,
    data?.respuesta?.detalleMensaje,
    data?.respuesta?.detalle,
    data?.respuesta?.mensaje,
    data?.respuesta?.message,
    data?.respuesta?.error,
  ].find((v) => typeof v === 'string' && v.trim())
  if (nested) return String(nested).trim()

  return 'Hacienda devolvio una respuesta sin mensaje legible. Revise el JSON crudo.'
}

export default function FacturacionHistorial({ empresaId, setNavbarExtra }: Props) {
  const DOCS_POR_PAGINA = 15
  const [docs, setDocs] = useState<DocumentoHistRow[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroMh, setFiltroMh] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [confirm, setConfirm] = useState<{ mensaje: string; onOk: () => void } | null>(null)
  const [cabysModal, setCabysModal] = useState<{ docId: number; token: string; lineas: { id: number; linea: number; descripcion: string; cabys: string }[] } | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [previewDocId, setPreviewDocId] = useState<number | null>(null)
  const [pagina, setPagina] = useState(1)
  const [empresaTimeZone, setEmpresaTimeZone] = useState(() => resolveCompanyTimeZone(null))

  const setRowError = (docId: number, msg: string) => setRowErrors((prev) => ({ ...prev, [docId]: msg }))
  const clearRowError = (docId: number) => setRowErrors((prev) => { const next = { ...prev }; delete next[docId]; return next })

  const loadDocs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('fe_documentos')
        .select('id, estado, estado_mh, tipo_documento, fecha_emision, numero_consecutivo, total_comprobante, receptor_nombre, receptor_email, clave_mh, respuesta_mh_json, doc_origen_id')
        .eq('empresa_id', empresaId)
        .order('id', { ascending: false })
        .limit(300)
      if (error) throw error
      setDocs((data || []) as DocumentoHistRow[])
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo cargar el historial FE.'))
    } finally {
      setLoading(false)
    }
  }, [empresaId])

  useEffect(() => { void loadDocs() }, [loadDocs])

  useEffect(() => {
    void fetchEmpresaTimeZone(empresaId).then(setEmpresaTimeZone)
  }, [empresaId])

  // Inyectar filtros en la banda del navbar
  useEffect(() => {
    setNavbarExtra(
      <>
        <input className="fehist-btn" type="search" placeholder="Buscar..." value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)} style={{ minWidth: 140 }} />
        <input className="fehist-btn" type="date" value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)} title="Desde" />
        <input className="fehist-btn" type="date" value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)} title="Hasta" />
        <select className="fehist-btn" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Tipo</option>
          <option value="01">FE</option>
          <option value="02">ND</option>
          <option value="03">NC</option>
          <option value="04">TE</option>
          <option value="09">FEE</option>
        </select>
        <select className="fehist-btn" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Estado</option>
          <option value="borrador">Borrador</option>
          <option value="confirmado">Enviado/Aceptado</option>
        </select>
        <select className="fehist-btn" value={filtroMh} onChange={(e) => setFiltroMh(e.target.value)}>
          <option value="">MH</option>
          <option value="sin_envio">Sin envío</option>
          <option value="enviado">Enviado</option>
          <option value="procesando">Procesando</option>
          <option value="aceptado">Aceptado</option>
          <option value="rechazado">Rechazado</option>
          <option value="error">Error</option>
        </select>
        <button type="button" className="fehist-btn" disabled={loading} onClick={() => void loadDocs()}>
          {loading ? 'Actualizando...' : 'Refrescar'}
        </button>
      </>
    )
    return () => setNavbarExtra(null)
  }, [busqueda, fechaDesde, fechaHasta, filtroTipo, filtroEstado, filtroMh, loading, loadDocs, setNavbarExtra])

  const consultarMh = async (doc: DocumentoHistRow) => {
    setBusyId(doc.id)
    setError('')
    setOk('')
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.')
      const resp = await fetch(`/api/facturacion/estado/${doc.id}?empresa_id=${empresaId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudo consultar MH.')
      const estadoMh = String(json.estado_mh || '').toLowerCase()
      // Enviar correo si fue aceptado y no es Tiquete Electrónico
      if (estadoMh === 'aceptado' && doc.tipo_documento !== '04' && doc.receptor_email) {
        const respCorreo = await fetch(`/api/facturacion/reenviar/${doc.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ empresa_id: empresaId }),
        })
        const jsonCorreo = await respCorreo.json().catch(() => ({}))
        setOk(`Aceptado por MH. Correo enviado a ${jsonCorreo.to || doc.receptor_email}.`)
      } else {
        setOk(`Estado MH actualizado: ${json.estado_mh || 'enviado'}`)
      }
      await loadDocs()
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo consultar MH.'))
    } finally {
      setBusyId(null)
    }
  }

  const reenviarCorreo = async (doc: DocumentoHistRow) => {
    setBusyId(doc.id)
    setError('')
    setOk('')
    try {
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
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudo reenviar el correo.')
      setOk(`Correo reenviado a ${json.to || doc.receptor_email}`)
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo reenviar el correo.'))
    } finally {
      setBusyId(null)
    }
  }

  const descargarXml = async (doc: DocumentoHistRow) => {
    setBusyId(doc.id)
    setError('')
    setOk('')
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.')
      const resp = await fetch(`/api/facturacion/xml/${doc.id}?empresa_id=${empresaId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}))
        throw new Error(json.error || 'No se pudo descargar el XML.')
      }
      const blob = await resp.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `${doc.numero_consecutivo || `documento-${doc.id}`}.xml`
      window.document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setOk(`XML descargado: ${doc.numero_consecutivo || `documento-${doc.id}`}`)
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo descargar el XML.'))
    } finally {
      setBusyId(null)
    }
  }

  const reimprimir = (doc: DocumentoHistRow) => {
    setPreviewDocId(doc.id)
  }

  const reEmitir = async (doc: DocumentoHistRow) => {
    setBusyId(doc.id)
    clearRowError(doc.id)
    setOk('')
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.')
      const token = session.access_token

      const respReEmitir = await fetch(`/api/facturacion/re-emitir/${doc.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ empresa_id: empresaId }),
      })
      const jsonReEmitir = await respReEmitir.json().catch(() => ({}))
      if (!respReEmitir.ok || !jsonReEmitir.ok) throw new Error(jsonReEmitir.error || 'No se pudo crear la re-emision.')

      const nuevoId = jsonReEmitir.doc_id
      const respEmitir = await fetch(`/api/facturacion/emitir/${nuevoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ empresa_id: empresaId }),
      })
      const jsonEmitir = await respEmitir.json().catch(() => ({}))
      const cabysErr = await intentarEmitir(nuevoId, token, doc.id, jsonEmitir)
      if (cabysErr) return
      setOk(`Re-emision enviada al MH (ID ${nuevoId}). Estado: ${jsonEmitir.estado_mh || 'procesando'}.`)
      await loadDocs()
    } catch (e: any) {
      setRowError(doc.id, String(e?.message || 'No se pudo re-emitir.'))
    } finally {
      setBusyId(null)
    }
  }

  // Devuelve true si hay error de CABYS (abre modal), false si ok o error distinto
  const intentarEmitir = async (docId: number, token: string, rowDocId: number, jsonPrevio?: any): Promise<boolean> => {
    let json = jsonPrevio
    if (!json) {
      const resp = await fetch(`/api/facturacion/emitir/${docId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ empresa_id: empresaId }),
      })
      const raw = await resp.text().catch(() => '')
      try {
        json = raw ? JSON.parse(raw) : {}
      } catch {
        json = { error: raw || `HTTP ${resp.status}` }
      }
      if (!resp.ok && !json?.error) {
        json = { ...json, error: `HTTP ${resp.status}` }
      }
    }

    if (json.ok) {
      clearRowError(rowDocId)
      setOk(`Documento emitido al MH. Estado: ${json.estado_mh || 'procesando'}.`)
      await loadDocs()
      return false
    }
    if (String(json.error || '').includes('Falta Codigo CABYS')) {
      const [{ data: lineas }, { data: grados }] = await Promise.all([
        supabase.from('fe_documento_lineas').select('id, linea, descripcion, cabys').eq('documento_id', docId).order('linea'),
        supabase.from('grados_combustible').select('nombre, codigo_cabys').eq('empresa_id', empresaId).not('codigo_cabys', 'is', null),
      ])
      const sinCabys = (lineas || []).filter((l: any) => !/^\d{13}$/.test(String(l.cabys || '').trim()))

      const noResueltas: typeof sinCabys = []
      for (const linea of sinCabys) {
        const desc = String(linea.descripcion || '').toLowerCase()
        const grado = (grados || []).find((g: any) => g.codigo_cabys && desc.includes(String(g.nombre || '').toLowerCase()))
        if (grado?.codigo_cabys) {
          await supabase.from('fe_documento_lineas').update({ cabys: grado.codigo_cabys }).eq('id', linea.id)
        } else {
          noResueltas.push(linea)
        }
      }

      if (noResueltas.length === 0) {
        return await intentarEmitir(docId, token, rowDocId)
      }

      setCabysModal({
        docId,
        token,
        lineas: noResueltas.map((l: any) => ({ id: l.id, linea: l.linea, descripcion: l.descripcion || '', cabys: '' })),
      })
      setBusyId(null)
      return true
    }
    throw new Error(json.error || `Error HTTP ${json.mh_status || json.status || '?'} al enviar al MH.`)
  }

  const guardarCabysYEmitir = async () => {
    if (!cabysModal) return
    const { docId, token, lineas } = cabysModal
    const invalidas = lineas.filter((l) => !/^\d{13}$/.test(l.cabys.trim()))
    if (invalidas.length) { setError('El CABYS debe tener exactamente 13 dígitos.'); return }
    setError('')
    try {
      for (const l of lineas) {
        const { error: upErr } = await supabase.from('fe_documento_lineas').update({ cabys: l.cabys.trim() }).eq('id', l.id)
        if (upErr) throw new Error('Error guardando CABYS línea ' + l.linea + ': ' + upErr.message)
      }
      setCabysModal(null)
      await intentarEmitir(docId, token, docId)
    } catch (e: any) {
      setError(String(e?.message || 'Error al guardar CABYS.'))
    }
  }

  const emitirBorrador = (doc: DocumentoHistRow) => void emitirBorradorConfirmado(doc)

  const emitirBorradorConfirmado = async (doc: DocumentoHistRow) => {
    setBusyId(doc.id)
    clearRowError(doc.id)
    setOk('')
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !session?.access_token) throw new Error('Sesion expirada. Ingrese de nuevo.')
      const token = session.access_token
      const { error: confErr } = await supabase.from('fe_documentos').update({ estado: 'confirmado' }).eq('id', doc.id).eq('empresa_id', empresaId)
      if (confErr) throw new Error('No se pudo confirmar el documento: ' + confErr.message)
      const cabysErr = await intentarEmitir(doc.id, token, doc.id)
      if (cabysErr) return
    } catch (e: any) {
      setRowError(doc.id, String(e?.message || 'No se pudo emitir.'))
    } finally {
      setBusyId(null)
    }
  }

  const eliminarBorrador = (doc: DocumentoHistRow) => {
    setConfirm({
      mensaje: `¿Eliminar el borrador ${doc.numero_consecutivo || `ID ${doc.id}`}? Esta acción no se puede deshacer.`,
      onOk: () => void eliminarBorradorConfirmado(doc),
    })
  }

  const eliminarBorradorConfirmado = async (doc: DocumentoHistRow) => {
    setBusyId(doc.id)
    setError('')
    setOk('')
    try {
      const { error: delErr } = await supabase.from('fe_documentos').delete().eq('id', doc.id).eq('empresa_id', empresaId)
      if (delErr) throw new Error('No se pudo eliminar: ' + delErr.message)
      setOk(`Documento ID ${doc.id} eliminado.`)
      await loadDocs()
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo eliminar.'))
    } finally {
      setBusyId(null)
    }
  }

  const totalGeneral = docs.reduce((acc, doc) => acc + (doc.tipo_documento === '03' ? -1 : 1) * Number(doc.total_comprobante || 0), 0)
  const aceptados = docs.filter((doc) => String(doc.estado_mh || '').toLowerCase() === 'aceptado').length
  const pendientes = docs.filter((doc) => ['enviado', 'procesando', 'pendiente'].includes(String(doc.estado_mh || '').toLowerCase())).length
  const borradores = docs.filter((doc) => String(doc.estado || '').toLowerCase() === 'borrador').length
  const totalesPorTipo = ['01', '02', '03', '04', '09'].map((tipo) => {
    const docsTipo = docs.filter((doc) => doc.tipo_documento === tipo)
    return {
      tipo,
      label: DOC_LABEL[tipo] || tipo,
      cantidad: docsTipo.length,
      total: docsTipo.reduce((acc, doc) => acc + (doc.tipo_documento === '03' ? -1 : 1) * Number(doc.total_comprobante || 0), 0),
    }
  }).filter((row) => row.cantidad > 0)

  useEffect(() => {
    if (pendientes <= 0) return
    const timer = window.setInterval(() => { void loadDocs() }, 20000)
    return () => window.clearInterval(timer)
  }, [pendientes, loadDocs])

  useEffect(() => {
    const channel = supabase
      .channel(`fe-documentos-historial-${empresaId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fe_documentos',
          filter: `empresa_id=eq.${empresaId}`,
        },
        () => {
          void loadDocs()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [empresaId, loadDocs])
  // IDs de documentos que ya tienen una re-emisión activa (aceptada o en vuelo).
  // Si la re-emisión también fue rechazada/error, se permite volver a intentar.
  const reEmitidos = new Set(
    docs
      .filter((d) => !!d.doc_origen_id && !['rechazado', 'error'].includes(String(d.estado_mh || '').toLowerCase()))
      .map((d) => d.doc_origen_id as number)
  )

  const docsFiltrados = docs.filter((d) => {
    if (filtroTipo && d.tipo_documento !== filtroTipo) return false
    if (filtroEstado && d.estado !== filtroEstado) return false
    if (filtroMh) {
      const mh = String(d.estado_mh || '').toLowerCase()
      if (filtroMh === 'sin_envio' && mh) return false
      if (filtroMh !== 'sin_envio' && mh !== filtroMh) return false
    }
    if (busqueda) {
      const q = busqueda.toLowerCase()
      const match = [d.numero_consecutivo, d.receptor_nombre, d.clave_mh].some((v) => String(v || '').toLowerCase().includes(q))
      if (!match) return false
    }
    if (fechaDesde && d.fecha_emision < fechaDesde) return false
    if (fechaHasta && d.fecha_emision > fechaHasta) return false
    return true
  })

  useEffect(() => {
    setPagina(1)
  }, [busqueda, fechaDesde, fechaHasta, filtroTipo, filtroEstado, filtroMh])

  const totalPaginas = Math.max(1, Math.ceil(docsFiltrados.length / DOCS_POR_PAGINA))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const desde = (paginaSegura - 1) * DOCS_POR_PAGINA
  const hasta = desde + DOCS_POR_PAGINA
  const docsPaginados = docsFiltrados.slice(desde, hasta)
  const inicioConteo = docsFiltrados.length === 0 ? 0 : desde + 1
  const finConteo = docsFiltrados.length === 0 ? 0 : Math.min(hasta, docsFiltrados.length)

  if (previewDocId !== null) {
    return <FacturaPreviewModal docId={previewDocId} empresaId={empresaId} onClose={() => setPreviewDocId(null)} />
  }

  return (
    <div className="fehist-wrap">
      <style>{STYLES}</style>
      {cabysModal && (
        <div className="fehist-overlay">
          <div className="fehist-modal" style={{ maxWidth: 520 }}>
            <div className="fehist-modal-msg" style={{ fontWeight: 700, marginBottom: 14 }}>Código CABYS requerido</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
              Las siguientes líneas no tienen CABYS (13 dígitos). Complételos para emitir.
            </div>
            {cabysModal.lineas.map((l, i) => (
              <div key={l.id} className="fehist-cabys-row">
                <div className="fehist-cabys-desc">Línea {l.linea}<br />{l.descripcion}</div>
                <input
                  className="fehist-cabys-input"
                  type="text"
                  maxLength={13}
                  placeholder="0000000000000"
                  value={l.cabys}
                  onChange={(e) => setCabysModal((prev) => prev ? {
                    ...prev,
                    lineas: prev.lineas.map((x, j) => j === i ? { ...x, cabys: e.target.value } : x),
                  } : prev)}
                />
              </div>
            ))}
            {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>{error}</div>}
            <div className="fehist-modal-actions">
              <button className="fehist-modal-cancel" onClick={() => { setCabysModal(null); setError('') }}>Cancelar</button>
              <button className="fehist-modal-ok" onClick={() => void guardarCabysYEmitir()}>Guardar y emitir</button>
            </div>
          </div>
        </div>
      )}
      {confirm && (
        <div className="fehist-overlay" onClick={() => setConfirm(null)}>
          <div className="fehist-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fehist-modal-msg">{confirm.mensaje}</div>
            <div className="fehist-modal-actions">
              <button className="fehist-modal-cancel" onClick={() => setConfirm(null)}>Cancelar</button>
              <button className="fehist-modal-ok" onClick={() => { confirm.onOk(); setConfirm(null) }}>Aceptar</button>
            </div>
          </div>
        </div>
      )}

      {error ? <div className="comb-fact-warning" style={{ marginBottom: 14 }}>{error}</div> : null}
      {ok ? <div className="comb-fact-ok" style={{ marginBottom: 14 }}>{ok}</div> : null}

      <div className="fehist-summary">
        <div className="fehist-card"><div className="k">Documentos</div><div className="v">{docs.length}</div></div>
        <div className="fehist-card"><div className="k">Aceptados</div><div className="v">{aceptados}</div></div>
        <div className="fehist-card"><div className="k">Pendientes MH</div><div className="v">{pendientes}</div></div>
        <div className="fehist-card"><div className="k">Venta Total</div><div className="v">₡ {money(totalGeneral)}</div></div>
      </div>
      {totalesPorTipo.length > 0 ? (
        <div className="fehist-summary" style={{ gridTemplateColumns: `repeat(${Math.min(totalesPorTipo.length, 5)}, minmax(150px,1fr))`, marginTop: -6, display: 'none' }}>
          {totalesPorTipo.map((row) => (
            <div key={row.tipo} className="fehist-card">
              <div className="k">{row.label}</div>
              <div className="v" style={{ fontSize: 18 }}>{row.cantidad} · CRC {money(row.total)}</div>
            </div>
          ))}
        </div>
      ) : null}
      {totalesPorTipo.length > 0 ? (
        <div className="fehist-summary" style={{ gridTemplateColumns: `repeat(${Math.min(totalesPorTipo.length, 5)}, minmax(150px,1fr))`, marginTop: -6 }}>
          {totalesPorTipo.map((row) => (
            <div key={`${row.tipo}-resumen`} className="fehist-card" style={row.tipo === '03' ? { borderColor: 'rgba(239,68,68,.35)' } : undefined}>
              <div className="k" style={row.tipo === '03' ? { color: '#ef4444' } : undefined}>{row.label}</div>
              <div className="v" style={row.tipo === '03' ? { fontSize: 18, color: '#ef4444' } : { fontSize: 18 }}>
                {row.cantidad} · ₡ {money(row.total)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {pendientes > 0 ? <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--gray-400)' }}>Actualizacion automatica activa cada 20s mientras existan documentos pendientes en MH.</div> : null}

      <WorkspaceMainPanel title="Comprobantes Electrónicos" subtitle="Lista fiscal fina del sistema con numeracion, fecha, tipo, estado, nombre y acciones operativas.">
        <div className="fehist-table-hint">Desliza horizontalmente para ver consecutivo, estado y acciones.</div>
        <div className="fehist-table-wrap">
          <table className="fehist-table">
            <thead>
              <tr>
                <th className="col-num">Num. consec</th>
                <th className="col-date">Fecha</th>
                <th className="col-type">Tipo</th>
                <th className="col-estado">Estado</th>
                <th className="col-name">Nombre</th>
                <th className="col-amount" style={{ textAlign: 'right' }}>Monto</th>
                <th className="col-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {docsPaginados.length === 0 ? (
                <tr><td colSpan={7} style={{ color: 'var(--gray-400)' }}>{docs.length === 0 ? 'Aun no hay documentos electronicos registrados.' : 'Ningun documento coincide con los filtros.'}</td></tr>
              ) : docsPaginados.map((doc) => {
                const parsedMh = parseMhPayload(doc.respuesta_mh_json)
                const xmlInfo = extractMhXmlInfo(parsedMh)
                const canShowMhDetail = !!parsedMh
                const isExpanded = expandedId === doc.id
                return (
                  <Fragment key={doc.id}>
                    <tr key={doc.id}>
                      <td className="mono col-num" title={numeroConsecutivoLabel(doc)}>{numeroConsecutivoLabel(doc)}</td>
                      <td className="col-date">{formatCompanyDate(doc.fecha_emision, empresaTimeZone)}</td>
                      <td className="col-type">{DOC_LABEL[doc.tipo_documento] || doc.tipo_documento}</td>
                      <td className="col-estado">
                        {doc.estado === 'borrador'
                          ? <span className="fehist-chip warn">Borrador</span>
                          : <span className={`fehist-chip ${mhChipClass(doc.estado_mh)}`}>{mhLabel(doc.estado_mh)}</span>
                        }
                      </td>
                      <td className="name col-name" title={doc.receptor_nombre || 'Consumidor final'}>{doc.receptor_nombre || 'Consumidor final'}</td>
                      <td className="amount col-amount">{money(Number(doc.total_comprobante || 0))}</td>
                      <td className="col-actions">
                        <div className="fehist-row-actions">
                          {String(doc.estado_mh || '').toLowerCase() === 'error' && (
                            <button type="button" className="fehist-btn" style={{ borderColor: 'rgba(239,68,68,.4)', color: '#f87171' }} disabled={busyId === doc.id} onClick={() => void eliminarBorrador(doc)}>
                              {busyId === doc.id ? '...' : 'Eliminar'}
                            </button>
                          )}
                          {String(doc.estado_mh || '').toLowerCase() !== 'error' && (doc.estado === 'borrador' || (doc.estado !== 'borrador' && !doc.clave_mh)) && (
                            <>
                              <button type="button" className="fehist-btn" style={{ borderColor: 'rgba(34,197,94,.4)', color: '#4ade80' }} disabled={busyId === doc.id} onClick={() => void emitirBorrador(doc)}>
                                {busyId === doc.id ? '...' : 'Emitir'}
                              </button>
                              {doc.estado === 'borrador' && (
                                <button type="button" className="fehist-btn" style={{ borderColor: 'rgba(239,68,68,.4)', color: '#f87171' }} disabled={busyId === doc.id} onClick={() => void eliminarBorrador(doc)}>
                                  {busyId === doc.id ? '...' : 'Eliminar'}
                                </button>
                              )}
                            </>
                          )}
                          {doc.estado !== 'borrador' && !!doc.clave_mh && (
                            <>
                              {String(doc.estado_mh || '').toLowerCase() !== 'rechazado' && (
                                <>
                                  <button type="button" className="fehist-icon-btn" title="Imprimir" disabled={busyId === doc.id} onClick={() => void reimprimir(doc)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                                  </button>
                                  <button type="button" className="fehist-icon-btn" title={String(doc.estado_mh || '').toLowerCase() !== 'aceptado' ? 'Solo se puede enviar cuando MH haya aceptado el documento' : !doc.receptor_email ? 'Sin correo registrado' : 'Enviar email'} disabled={busyId === doc.id || !doc.receptor_email || String(doc.estado_mh || '').toLowerCase() !== 'aceptado'} onClick={() => void reenviarCorreo(doc)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                  </button>
                                </>
                              )}
                              {!['aceptado', 'rechazado'].includes(String(doc.estado_mh || '').toLowerCase()) && (
                                <button type="button" className="fehist-icon-btn" title="Consultar estado MH" disabled={busyId === doc.id || !doc.clave_mh} onClick={() => void consultarMh(doc)}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                                </button>
                              )}
                              <button type="button" className="fehist-icon-btn" title="Descargar XML" disabled={busyId === doc.id} onClick={() => void descargarXml(doc)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="8 13 10 15 8 17"/><polyline points="16 13 14 15 16 17"/><line x1="12" y1="13" x2="12" y2="17"/></svg>
                              </button>
                              <button type="button" className="fehist-icon-btn" title={isExpanded ? 'Ocultar detalle MH' : 'Ver detalle MH'} disabled={!canShowMhDetail} onClick={() => setExpandedId(isExpanded ? null : doc.id)}>
                                {isExpanded
                                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                }
                              </button>
                            </>
                          )}
                          {String(doc.estado_mh || '').toLowerCase() === 'rechazado' && (
                            reEmitidos.has(doc.id)
                              ? <span className="fehist-chip warn" title="Ya existe una re-emisión activa (enviada o aceptada por MH)">Re-emitido</span>
                              : <button
                                  type="button"
                                  className="fehist-btn"
                                  style={{ borderColor: 'rgba(251,146,60,.5)', color: '#fb923c' }}
                                  disabled={busyId === doc.id}
                                  onClick={() => void reEmitir(doc)}
                                  title="Envía una re-emisión subsanada directamente al MH"
                                >
                                  {busyId === doc.id ? '...' : 'Re-emitir'}
                                </button>
                          )}
                        </div>
                        {rowErrors[doc.id] && (
                          <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 6, textAlign: 'right', whiteSpace: 'normal', lineHeight: 1.4 }}>
                            {rowErrors[doc.id]}
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="fehist-detail-row">
                        <td colSpan={7}>
                          <div className="fehist-detail-box">
                            <div className="fehist-detail-title">Detalle devuelto por Hacienda</div>
                            <div className="fehist-detail-msg">{extractMhMessage(parsedMh)}</div>
                            <div className="fehist-detail-raw">
                              {xmlInfo?.xmlText || (typeof parsedMh === 'string' ? parsedMh : JSON.stringify(parsedMh, null, 2))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
              Mostrando {inicioConteo}-{finConteo} de {docsFiltrados.length}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="fehist-btn" disabled={paginaSegura === 1} onClick={() => setPagina(1)}>«</button>
              <button type="button" className="fehist-btn" disabled={paginaSegura === 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>‹ Ant</button>
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                const inicioPaginas = Math.min(Math.max(1, paginaSegura - 2), Math.max(1, totalPaginas - 4))
                const page = inicioPaginas + i
                if (page > totalPaginas) return null
                return (
                  <button
                    key={page}
                    type="button"
                    className="fehist-btn"
                    style={page === paginaSegura ? { borderColor: 'rgba(34,197,94,.45)', color: '#4ade80' } : undefined}
                    onClick={() => setPagina(page)}
                  >
                    {page}
                  </button>
                )
              })}
              <button type="button" className="fehist-btn" disabled={paginaSegura === totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}>Sig ›</button>
              <button type="button" className="fehist-btn" disabled={paginaSegura === totalPaginas} onClick={() => setPagina(totalPaginas)}>»</button>
            </div>
          </div>
        ) : null}
        {borradores > 0 ? <div style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-400)' }}>{borradores} documento(s) aun en borrador.</div> : null}
      </WorkspaceMainPanel>
    </div>
  )
}
