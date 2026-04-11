import { useState, useEffect } from 'react'
import { API } from '../lib/supabase'

export type TerminalConfig = {
  empresaId: number
  sucursalId: number
  sucursalNombre: string
  cajaId: number
  cajaNombre: string
  terminalId: number | null
  terminalNombre: string | null
  sucursalMh: string | null   // fe_terminales.sucursal
  puntoVentaMh: string | null // fe_terminales.punto_venta
  bodegaId: number | null
  bodegaNombre: string | null
}

type Sucursal = { id: number; nombre: string; bodega_id: number | null; inv_bodegas?: { nombre: string } | null }
type Caja = { id: number; nombre: string; sucursal_id: number; terminal_id: number | null; fe_terminales?: { id: number; nombre: string; sucursal: string; punto_venta: string } | null }
type Bodega = { id: number; nombre: string; es_principal: boolean }
type TerminalFE = { id: number; nombre: string; sucursal: string; punto_venta: string; es_defecto: boolean }

type Step = 'sucursal' | 'caja'

const S = `
  .setup-wrap { min-height:100vh; background:#0b1120; display:flex; align-items:center; justify-content:center; padding:24px; }
  .setup-card { background:#111a2e; border:1px solid rgba(137,160,201,0.18); border-radius:22px; width:min(520px,96vw); padding:32px; box-shadow:0 32px 80px rgba(0,0,0,0.5); position:relative; }
  .setup-logo { width:44px; height:44px; border-radius:12px; background:linear-gradient(135deg,#16a34a,#22c55e); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; color:white; margin-bottom:20px; }
  .setup-title { font-size:20px; font-weight:900; color:#f3f7ff; letter-spacing:-.02em; }
  .setup-sub { font-size:13px; color:#5c7099; margin-top:4px; margin-bottom:24px; }
  .setup-step-bar { display:flex; gap:8px; margin-bottom:24px; }
  .setup-step-dot { flex:1; height:4px; border-radius:999px; background:rgba(137,160,201,0.18); transition:background .3s; }
  .setup-step-dot.done { background:#22c55e; }
  .setup-step-dot.active { background:#3b82f6; }
  .setup-label { font-size:11px; font-weight:700; color:#5c7099; text-transform:uppercase; letter-spacing:.07em; margin-bottom:8px; }
  .setup-list { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
  .setup-item { display:flex; align-items:center; gap:12px; padding:13px 16px; background:#172131; border:1.5px solid rgba(137,160,201,0.14); border-radius:13px; cursor:pointer; transition:all .15s; }
  .setup-item:hover { border-color:#3b82f6; background:#1a2740; }
  .setup-item.sel { border-color:#22c55e; background:#0f2c20; }
  .setup-item-icon { width:36px; height:36px; border-radius:10px; background:rgba(59,130,246,0.15); display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
  .setup-item-info { flex:1; min-width:0; }
  .setup-item-name { font-size:13px; font-weight:700; color:#e2e8f4; }
  .setup-item-meta { font-size:11px; color:#5c7099; margin-top:2px; }
  .setup-item-check { font-size:18px; color:#22c55e; }
  .setup-divider { display:flex; align-items:center; gap:10px; margin:16px 0; }
  .setup-divider-line { flex:1; height:1px; background:rgba(137,160,201,0.12); }
  .setup-divider-text { font-size:11px; color:#3a4e6e; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  .setup-new-form { background:#0d1525; border:1px solid rgba(137,160,201,0.14); border-radius:13px; padding:16px; display:flex; flex-direction:column; gap:10px; }
  .setup-input { width:100%; padding:10px 13px; background:#172131; border:1.5px solid rgba(137,160,201,0.2); border-radius:10px; color:#f3f7ff; font-size:13px; outline:none; box-sizing:border-box; }
  .setup-input:focus { border-color:#3b82f6; }
  .setup-select { width:100%; padding:10px 13px; background:#172131; border:1.5px solid rgba(137,160,201,0.2); border-radius:10px; color:#f3f7ff; font-size:13px; outline:none; box-sizing:border-box; }
  .setup-select:focus { border-color:#3b82f6; }
  .setup-btn-create { padding:10px 16px; border:none; border-radius:10px; background:linear-gradient(135deg,#1d4ed8,#3b82f6); color:white; font-size:13px; font-weight:700; cursor:pointer; transition:opacity .15s; white-space:nowrap; }
  .setup-btn-create:hover { opacity:.88; }
  .setup-btn-create:disabled { opacity:.5; cursor:not-allowed; }
  .setup-actions { display:flex; gap:10px; margin-top:8px; }
  .setup-btn-back { flex:1; padding:12px; border:1px solid rgba(137,160,201,0.2); border-radius:12px; background:transparent; color:#7f92b5; font-size:13px; font-weight:700; cursor:pointer; }
  .setup-btn-back:hover { background:rgba(137,160,201,0.08); }
  .setup-btn-next { flex:2; padding:12px; border:none; border-radius:12px; background:linear-gradient(135deg,#059669,#10b981); color:white; font-size:14px; font-weight:800; cursor:pointer; transition:opacity .15s; }
  .setup-btn-next:hover { opacity:.9; }
  .setup-btn-next:disabled { opacity:.45; cursor:not-allowed; }
  .setup-err { font-size:12px; color:#fca5a5; background:#2c0f0f; border:1px solid rgba(248,113,113,0.25); border-radius:8px; padding:8px 12px; }
  .setup-loading { text-align:center; color:#3a4e6e; font-size:13px; padding:20px; }
`

function localKey(empresaId: number) {
  return `pos_terminal_${empresaId}`
}

export function getStoredTerminal(empresaId: number): TerminalConfig | null {
  try {
    const raw = localStorage.getItem(localKey(empresaId))
    if (!raw) return null
    return JSON.parse(raw) as TerminalConfig
  } catch {
    return null
  }
}

function storeTerminal(cfg: TerminalConfig) {
  localStorage.setItem(localKey(cfg.empresaId), JSON.stringify(cfg))
}

export default function SetupPage({
  empresaId,
  empresaNombre,
  token,
  onComplete,
  onCancel,
}: {
  empresaId: number
  empresaNombre: string
  token: string
  onComplete: (cfg: TerminalConfig) => void
  onCancel?: () => void
}) {
  const [step, setStep] = useState<Step>('sucursal')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [cajas, setCajas] = useState<Caja[]>([])
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [terminalesFE, setTerminalesFE] = useState<TerminalFE[]>([])

  const [selSucursal, setSelSucursal] = useState<Sucursal | null>(null)
  const [selCaja, setSelCaja] = useState<Caja | null>(null)

  // Formulario nueva sucursal
  const [newSucNombre, setNewSucNombre] = useState('')
  const [newSucBodega, setNewSucBodega] = useState('')
  const [creandoSuc, setCreandoSuc] = useState(false)

  // Formulario nueva caja
  const [newCajaNombre, setNewCajaNombre] = useState('')
  const [newCajaTerminal, setNewCajaTerminal] = useState('')
  const [creandoCaja, setCreandoCaja] = useState(false)

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      try {
        const [rSuc, rBod, rFE] = await Promise.all([
          fetch(`${API}/api/pos/sucursales?empresa_id=${empresaId}`, { headers }).then((r) => r.json()),
          fetch(`${API}/api/pos/bodegas?empresa_id=${empresaId}`, { headers }).then((r) => r.json()),
          fetch(`${API}/api/pos/terminales-fe?empresa_id=${empresaId}`, { headers }).then((r) => r.json()),
        ])
        if (rSuc.ok) setSucursales(rSuc.sucursales)
        if (rBod.ok) setBodegas(rBod.bodegas)
        if (rFE.ok) setTerminalesFE(rFE.terminales)
      } catch {
        setErr('Error cargando configuración')
      }
      setLoading(false)
    }
    void cargar()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cargarCajas = async (sucursalId: number) => {
    const r = await fetch(`${API}/api/pos/cajas?empresa_id=${empresaId}&sucursal_id=${sucursalId}`, { headers }).then((r) => r.json())
    if (r.ok) setCajas(r.cajas)
  }

  const seleccionarSucursal = async (s: Sucursal) => {
    setSelSucursal(s)
    setSelCaja(null)
    setLoading(true)
    await cargarCajas(s.id)
    setLoading(false)
    setStep('caja')
  }

  const crearSucursal = async () => {
    if (!newSucNombre.trim()) return
    setCreandoSuc(true); setErr('')
    try {
      const r = await fetch(`${API}/api/pos/sucursales`, {
        method: 'POST', headers,
        body: JSON.stringify({ empresa_id: empresaId, nombre: newSucNombre.trim(), bodega_id: newSucBodega || null }),
      }).then((r) => r.json())
      if (!r.ok) { setErr(r.error || 'Error al crear'); setCreandoSuc(false); return }
      await seleccionarSucursal(r.sucursal)
      setNewSucNombre('')
    } catch {
      setErr('Error de red')
    }
    setCreandoSuc(false)
  }

  const crearCaja = async () => {
    if (!newCajaNombre.trim() || !selSucursal) return
    setCreandoCaja(true); setErr('')
    try {
      const r = await fetch(`${API}/api/pos/cajas`, {
        method: 'POST', headers,
        body: JSON.stringify({
          empresa_id: empresaId,
          nombre: newCajaNombre.trim(),
          sucursal_id: selSucursal.id,
          terminal_id: newCajaTerminal || null,
        }),
      }).then((r) => r.json())
      if (!r.ok) { setErr(r.error || 'Error al crear'); setCreandoCaja(false); return }
      await cargarCajas(selSucursal.id)
      setNewCajaNombre('')
      setNewCajaTerminal('')
    } catch {
      setErr('Error de red')
    }
    setCreandoCaja(false)
  }

  const confirmar = () => {
    if (!selSucursal || !selCaja) return
    const fe = selCaja.fe_terminales
    const bodega = selSucursal.bodega_id
      ? { id: selSucursal.bodega_id, nombre: selSucursal.inv_bodegas?.nombre || null }
      : { id: null, nombre: null }

    const cfg: TerminalConfig = {
      empresaId,
      sucursalId: selSucursal.id,
      sucursalNombre: selSucursal.nombre,
      cajaId: selCaja.id,
      cajaNombre: selCaja.nombre,
      terminalId: fe?.id ?? null,
      terminalNombre: fe?.nombre ?? null,
      sucursalMh: fe?.sucursal ?? null,
      puntoVentaMh: fe?.punto_venta ?? null,
      bodegaId: bodega.id,
      bodegaNombre: bodega.nombre,
    }
    storeTerminal(cfg)
    onComplete(cfg)
  }

  const stepIdx = step === 'sucursal' ? 0 : 1

  return (
    <>
      <style>{S}</style>
      <div className="setup-wrap">
        <div className="setup-card">
          {onCancel && (
            <button onClick={onCancel} style={{ position:'absolute', top:16, right:16, background:'none', border:'none', color:'#5c7099', fontSize:22, cursor:'pointer', lineHeight:1 }} title="Cancelar">✕</button>
          )}
          <div className="setup-logo">POS</div>
          <div className="setup-title">Configurar terminal</div>
          <div className="setup-sub">{empresaNombre} · {onCancel ? 'Cambiar terminal' : 'Primera configuración de este dispositivo'}</div>

          {/* Barra de pasos */}
          <div className="setup-step-bar">
            <div className={`setup-step-dot ${stepIdx >= 0 ? (stepIdx > 0 ? 'done' : 'active') : ''}`} />
            <div className={`setup-step-dot ${stepIdx >= 1 ? 'active' : ''}`} />
          </div>

          {err && <div className="setup-err" style={{ marginBottom: 16 }}>{err}</div>}

          {/* ── PASO 1: Sucursal ── */}
          {step === 'sucursal' && (
            <>
              <div className="setup-label">Paso 1 de 2 — Seleccioná la sucursal</div>

              {loading ? (
                <div className="setup-loading">Cargando...</div>
              ) : (
                <div className="setup-list">
                  {sucursales.map((s) => (
                    <div key={s.id} className="setup-item" onClick={() => seleccionarSucursal(s)}>
                      <div className="setup-item-icon">🏪</div>
                      <div className="setup-item-info">
                        <div className="setup-item-name">{s.nombre}</div>
                        {s.inv_bodegas && <div className="setup-item-meta">Bodega: {s.inv_bodegas.nombre}</div>}
                      </div>
                      <span style={{ fontSize: 16, color: '#5c7099' }}>›</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="setup-divider">
                <div className="setup-divider-line" />
                <div className="setup-divider-text">{sucursales.length ? 'o crear nueva' : 'crear sucursal'}</div>
                <div className="setup-divider-line" />
              </div>

              <div className="setup-new-form">
                <input
                  className="setup-input"
                  placeholder="Nombre de la sucursal (ej: San Carlos)"
                  value={newSucNombre}
                  onChange={(e) => setNewSucNombre(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && crearSucursal()}
                />
                {bodegas.length > 0 && (
                  <select className="setup-select" value={newSucBodega} onChange={(e) => setNewSucBodega(e.target.value)}>
                    <option value="">Sin bodega asignada</option>
                    {bodegas.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}{b.es_principal ? ' (principal)' : ''}</option>
                    ))}
                  </select>
                )}
                <button className="setup-btn-create" onClick={crearSucursal} disabled={creandoSuc || !newSucNombre.trim()}>
                  {creandoSuc ? 'Creando...' : '+ Crear sucursal'}
                </button>
              </div>
            </>
          )}

          {/* ── PASO 2: Caja ── */}
          {step === 'caja' && selSucursal && (
            <>
              <div className="setup-label">Paso 2 de 2 — Seleccioná la caja en {selSucursal.nombre}</div>

              {loading ? (
                <div className="setup-loading">Cargando...</div>
              ) : (
                <div className="setup-list">
                  {cajas.map((c) => (
                    <div
                      key={c.id}
                      className={`setup-item ${selCaja?.id === c.id ? 'sel' : ''}`}
                      onClick={() => setSelCaja(c)}
                    >
                      <div className="setup-item-icon">🖥</div>
                      <div className="setup-item-info">
                        <div className="setup-item-name">{c.nombre}</div>
                        {c.fe_terminales && (
                          <div className="setup-item-meta">
                            Terminal FE: Suc {c.fe_terminales.sucursal} · PV {c.fe_terminales.punto_venta}
                          </div>
                        )}
                      </div>
                      {selCaja?.id === c.id && <span className="setup-item-check">✓</span>}
                    </div>
                  ))}
                </div>
              )}

              <div className="setup-divider">
                <div className="setup-divider-line" />
                <div className="setup-divider-text">{cajas.length ? 'o crear nueva' : 'crear caja'}</div>
                <div className="setup-divider-line" />
              </div>

              <div className="setup-new-form">
                <input
                  className="setup-input"
                  placeholder="Nombre de la caja (ej: Caja 1)"
                  value={newCajaNombre}
                  onChange={(e) => setNewCajaNombre(e.target.value)}
                />
                {terminalesFE.length > 0 && (
                  <select className="setup-select" value={newCajaTerminal} onChange={(e) => setNewCajaTerminal(e.target.value)}>
                    <option value="">Sin terminal FE asignada</option>
                    {terminalesFE.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} — Suc {t.sucursal} · PV {t.punto_venta}{t.es_defecto ? ' (defecto)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <button className="setup-btn-create" onClick={crearCaja} disabled={creandoCaja || !newCajaNombre.trim()}>
                  {creandoCaja ? 'Creando...' : '+ Crear caja'}
                </button>
              </div>

              <div className="setup-actions">
                <button className="setup-btn-back" onClick={() => { setStep('sucursal'); setSelCaja(null) }}>
                  ← Volver
                </button>
                <button className="setup-btn-next" onClick={confirmar} disabled={!selCaja}>
                  {selCaja ? `Entrar con ${selCaja.nombre} →` : 'Seleccioná una caja'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
