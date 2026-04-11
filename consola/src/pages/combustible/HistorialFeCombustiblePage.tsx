import { useCallback, useEffect, useState } from 'react'
import { WorkspaceMainPanel } from '../../components/WorkspaceShell'
import { supabase } from '../../supabase'
import { FacturaPreviewModal } from '../Facturacion/FacturaPreviewModal'
import { fetchEmpresaTimeZone, formatCompanyDate, resolveCompanyTimeZone } from '../../utils/companyTimeZone'

interface Props {
  empresaId: number
}

interface DocumentoHistRow {
  id: number
  estado: string
  estado_mh?: string | null
  tipo_documento: string
  fecha_emision: string
  numero_consecutivo: string | null
  total_comprobante: number | null
  moneda?: string | null
  receptor_nombre?: string | null
  receptor_email?: string | null
  clave_mh?: string | null
}

const DOC_LABEL: Record<string, string> = {
  '01': 'Factura Electronica',
  '02': 'Nota Debito',
  '03': 'Nota Credito',
  '04': 'Tiquete Electronico',
  '09': 'Factura Exportacion',
}

const STYLES = `
  .comb-fehist-wrap { padding: 18px; color: var(--card-text); }
  .comb-fehist-head { display:grid; grid-template-columns: minmax(220px, 1fr) auto; gap:16px; align-items:center; margin-bottom:18px; }
  .comb-fehist-title { font-size: 28px; font-weight: 800; letter-spacing: -.03em; }
  .comb-fehist-sub { font-size: 13px; color: var(--gray-400); margin-top: 6px; }
  .comb-fehist-actions { display:flex; gap:10px; flex-wrap:wrap; }
  .comb-fehist-btn { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 82%, var(--card-bg)); color:var(--card-text); border-radius:0; padding:10px 14px; font-size:13px; font-weight:700; cursor:pointer; }
  .comb-fehist-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--green-main) 40%, var(--card-border)); background: color-mix(in srgb, var(--green-main) 10%, var(--bg-dark2)); }
  .comb-fehist-btn:disabled { opacity:.55; cursor:not-allowed; }
  .comb-fehist-summary { display:grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap:12px; margin-bottom:18px; }
  .comb-fehist-card { border:1px solid var(--card-border); background:color-mix(in srgb, var(--bg-dark2) 84%, transparent); padding:14px 16px; }
  .comb-fehist-card .k { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--gray-400); margin-bottom:6px; }
  .comb-fehist-card .v { font-size:22px; font-weight:800; }
  .comb-fehist-table-hint { display:none; margin:-2px 0 10px; font-size:12px; color:var(--gray-400); }
  .comb-fehist-table-wrap { overflow:auto; border-top:1px solid var(--card-border); touch-action:pan-x; -webkit-overflow-scrolling:touch; }
  .comb-fehist-table { width:100%; min-width:980px; border-collapse:collapse; }
  .comb-fehist-table th, .comb-fehist-table td { padding:12px 14px; border-top:1px solid var(--card-border); font-size:13px; text-align:left; vertical-align:middle; }
  .comb-fehist-table th { font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--gray-400); background:color-mix(in srgb, var(--green-main) 10%, var(--bg-dark2)); }
  .comb-fehist-table td.mono { font-family: monospace; }
  .comb-fehist-table td.amount { text-align:right; font-family: monospace; }
  .comb-fehist-chip { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border:1px solid var(--card-border); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
  .comb-fehist-chip.ok { color:#86efac; border-color:rgba(34,197,94,.35); background:rgba(20,83,45,.45); }
  .comb-fehist-chip.warn { color:#fcd34d; border-color:rgba(245,158,11,.35); background:rgba(120,53,15,.35); }
  .comb-fehist-chip.info { color:#7dd3fc; border-color:rgba(14,165,233,.35); background:rgba(8,47,73,.35); }
  .comb-fehist-chip.bad { color:#fca5a5; border-color:rgba(239,68,68,.35); background:rgba(127,29,29,.35); }
  .comb-fehist-row-actions { display:flex; gap:8px; flex-wrap:wrap; }
  @media (max-width: 900px) {
    .comb-fehist-head { grid-template-columns: 1fr; }
    .comb-fehist-summary { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
  }
  @media (max-width: 640px) {
    .comb-fehist-wrap { padding: 12px; }
    .comb-fehist-summary { grid-template-columns: 1fr; }
    .comb-fehist-title { font-size: 24px; }
    .comb-fehist-actions { width:100%; }
    .comb-fehist-btn { width:100%; justify-content:center; }
    .comb-fehist-table-hint { display:block; }
  }
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

function estadoChipClass(estado?: string | null) {
  return String(estado || '').toLowerCase() === 'confirmado' ? 'ok' : 'warn'
}

function numeroConsecutivoLabel(doc: DocumentoHistRow) {
  if (doc.numero_consecutivo) return doc.numero_consecutivo
  if (String(doc.estado || '').toLowerCase() === 'borrador') return `BORR-${doc.id}`
  if (!doc.clave_mh) return 'Pendiente fiscal'
  return `DOC-${doc.id}`
}

export default function HistorialFeCombustiblePage({ empresaId }: Props) {
  const [docs, setDocs] = useState<DocumentoHistRow[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [previewDocId, setPreviewDocId] = useState<number | null>(null)
  const [empresaTimeZone, setEmpresaTimeZone] = useState(() => resolveCompanyTimeZone(null))

  const loadDocs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('fe_documentos')
        .select('id, estado, estado_mh, tipo_documento, fecha_emision, numero_consecutivo, total_comprobante, moneda, receptor_nombre, receptor_email, clave_mh')
        .eq('empresa_id', empresaId)
        .eq('origen', 'pos')
        .order('id', { ascending: false })
        .limit(250)
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
      setOk(`Estado MH actualizado: ${json.estado_mh || 'enviado'}`)
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

  const reimprimir = (doc: DocumentoHistRow) => {
    setPreviewDocId(doc.id)
  }

  const totalGeneral = docs.reduce((acc, doc) => acc + Number(doc.total_comprobante || 0), 0)
  const aceptados = docs.filter((doc) => String(doc.estado_mh || '').toLowerCase() === 'aceptado').length
  const pendientes = docs.filter((doc) => ['enviado', 'procesando', 'pendiente'].includes(String(doc.estado_mh || '').toLowerCase())).length
  const borradores = docs.filter((doc) => String(doc.estado || '').toLowerCase() === 'borrador').length

  useEffect(() => {
    if (pendientes <= 0) return
    const timer = window.setInterval(() => { void loadDocs() }, 20000)
    return () => window.clearInterval(timer)
  }, [pendientes, loadDocs])

  if (previewDocId !== null) {
    return <FacturaPreviewModal docId={previewDocId} empresaId={empresaId} onClose={() => setPreviewDocId(null)} />
  }

  return (
    <div className="comb-fehist-wrap">
      <style>{STYLES}</style>
      <div className="comb-fehist-head">
        <div>
          <div className="comb-fehist-title">Historial FE</div>
          <div className="comb-fehist-sub">Lista fiscal del modulo combustible: FE, TE y futuros NC, ND, FEE con mantenimiento desde una sola tabla.</div>
        </div>
        <div className="comb-fehist-actions">
          <button type="button" className="comb-fehist-btn" disabled={loading} onClick={() => void loadDocs()}>
            {loading ? 'Actualizando...' : 'Refrescar historial'}
          </button>
        </div>
      </div>

      {error ? <div className="comb-fact-warning" style={{ marginBottom: 14 }}>{error}</div> : null}
      {ok ? <div className="comb-fact-ok" style={{ marginBottom: 14 }}>{ok}</div> : null}

      <div className="comb-fehist-summary">
        <div className="comb-fehist-card"><div className="k">Documentos</div><div className="v">{docs.length}</div></div>
        <div className="comb-fehist-card"><div className="k">Aceptados</div><div className="v">{aceptados}</div></div>
        <div className="comb-fehist-card"><div className="k">Pendientes MH</div><div className="v">{pendientes}</div></div>
        <div className="comb-fehist-card"><div className="k">Total</div><div className="v">CRC {money(totalGeneral)}</div></div>
      </div>
      {pendientes > 0 ? <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--gray-400)' }}>Actualizacion automatica activa cada 20s mientras existan documentos pendientes en MH.</div> : null}

      <WorkspaceMainPanel title="Documentos electronicos" subtitle="Numeracion, fecha, tipo, estado, nombre y acciones operativas del modulo.">
        <div className="comb-fehist-table-hint">Desliza horizontalmente para revisar el historial completo y sus acciones.</div>
        <div className="comb-fehist-table-wrap">
          <table className="comb-fehist-table">
            <thead>
              <tr>
                <th>Num. consec</th>
                <th>Fecha</th>
                <th>Tipo doc</th>
                <th>Estado</th>
                <th>MH</th>
                <th>Nombre</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr><td colSpan={8} style={{ color: 'var(--gray-400)' }}>Aun no hay documentos del modulo combustible.</td></tr>
              ) : docs.map((doc) => (
                <tr key={doc.id}>
                  <td className="mono">{numeroConsecutivoLabel(doc)}</td>
                  <td>{formatCompanyDate(doc.fecha_emision, empresaTimeZone)}</td>
                  <td>{DOC_LABEL[doc.tipo_documento] || doc.tipo_documento}</td>
                  <td><span className={`comb-fehist-chip ${estadoChipClass(doc.estado)}`}>{doc.estado}</span></td>
                  <td><span className={`comb-fehist-chip ${mhChipClass(doc.estado_mh)}`}>{mhLabel(doc.estado_mh)}</span></td>
                  <td>{doc.receptor_nombre || 'Consumidor final'}</td>
                  <td className="amount">{money(Number(doc.total_comprobante || 0))}</td>
                  <td>
                    <div className="comb-fehist-row-actions">
                      <button type="button" className="comb-fehist-btn" disabled={busyId === doc.id || doc.estado === 'borrador'} onClick={() => void reimprimir(doc)}>
                        {busyId === doc.id ? '...' : 'Imprimir'}
                      </button>
                      <button type="button" className="comb-fehist-btn" title={String(doc.estado_mh || '').toLowerCase() !== 'aceptado' ? 'Requiere aceptación MH' : undefined} disabled={busyId === doc.id || !doc.receptor_email || String(doc.estado_mh || '').toLowerCase() !== 'aceptado'} onClick={() => void reenviarCorreo(doc)}>
                        {busyId === doc.id ? '...' : 'Enviar email'}
                      </button>
                      <button type="button" className="comb-fehist-btn" disabled={busyId === doc.id || doc.estado === 'borrador' || !doc.clave_mh} onClick={() => void consultarMh(doc)}>
                        {busyId === doc.id ? '...' : 'Consultar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {borradores > 0 ? <div style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-400)' }}>{borradores} documento(s) aun en borrador siguen terminandose desde FE Facturacion.</div> : null}
      </WorkspaceMainPanel>
    </div>
  )
}
