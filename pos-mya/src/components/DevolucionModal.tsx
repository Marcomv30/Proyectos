import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

type LineaVenta = {
  id: number
  producto_id: number | null
  codigo: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unit: number
  iva_pct: number
  iva_monto: number
  total: number
  cabys_code: string | null
}

type LineaDevolucion = LineaVenta & { cantidad_dev: number }

type Props = {
  open: boolean
  ventaId: number | null
  empresaId: number
  apiBase: string
  authHeaders: () => Record<string, string>
  formatMoney: (n: number) => string
  onClose: () => void
  onSuccess: (devId: number, total: number, tieneFE: boolean) => void
}

const MOTIVOS = [
  { codigo: '01', label: 'Anula documento' },
  { codigo: '03', label: 'Corrige monto' },
  { codigo: '04', label: 'Referencia a otro documento' },
  { codigo: '99', label: 'Otros' },
]

export default function DevolucionModal({ open, ventaId, empresaId, apiBase, authHeaders, formatMoney, onClose, onSuccess }: Props) {
  const [lineas, setLineas]       = useState<LineaDevolucion[]>([])
  const [loading, setLoading]     = useState(false)
  const [enviando, setEnviando]   = useState(false)
  const [error, setError]         = useState('')
  const [motivo, setMotivo]       = useState('01')
  const [razon, setRazon]         = useState('')
  const [tieneFE, setTieneFE]     = useState(false)

  useEffect(() => {
    if (!open || !ventaId) return
    setLineas([])
    setError('')
    setMotivo('01')
    setRazon('')
    setLoading(true)

    // Cargar líneas y verificar si tiene FE
    Promise.all([
      fetch(`${apiBase}/api/pos/ventas/${ventaId}/lineas`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${apiBase}/api/pos/ventas/${ventaId}`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([lineasJson, ventaJson]) => {
      if (lineasJson.ok) {
        setLineas((lineasJson.lineas || []).map((l: LineaVenta) => ({ ...l, cantidad_dev: l.cantidad })))
      } else {
        setError('No se pudieron cargar las líneas de la venta')
      }
      // Verificar si la venta tiene FE aceptada
      const venta = ventaJson.venta
      setTieneFE(!!(venta?.fe_doc_id && venta?.fe_estado === 'aceptado'))
    }).catch(() => {
      setError('Error al cargar los datos de la venta')
    }).finally(() => setLoading(false))
  }, [open, ventaId])

  const total = lineas.reduce((acc, l) => {
    if (l.cantidad_dev <= 0) return acc
    const base = l.precio_unit * l.cantidad_dev
    return acc + base + Math.round(base * (l.iva_pct / 100) * 100) / 100
  }, 0)

  const lineasSeleccionadas = lineas.filter(l => l.cantidad_dev > 0)

  function setCantidad(id: number, val: string) {
    setLineas(prev => prev.map(l => {
      if (l.id !== id) return l
      const n = Math.max(0, Math.min(Number(val) || 0, l.cantidad))
      return { ...l, cantidad_dev: n }
    }))
  }

  async function confirmar() {
    if (!lineasSeleccionadas.length) return setError('Seleccione al menos una línea')
    if (!razon.trim()) return setError('Ingrese la razón de la devolución')
    setError('')
    setEnviando(true)
    try {
      const resp = await fetch(`${apiBase}/api/pos/devoluciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          empresa_id: empresaId,
          venta_id: ventaId,
          motivo_codigo: motivo,
          motivo_razon: razon.trim(),
          lineas: lineasSeleccionadas.map(l => ({
            id:           l.id,
            producto_id:  l.producto_id,
            descripcion:  l.descripcion,
            unidad:       l.unidad,
            cantidad:     l.cantidad_dev,
            precio_unit:  l.precio_unit,
            iva_pct:      l.iva_pct,
            cabys_code:   l.cabys_code,
          })),
        }),
      })
      const json = await resp.json()
      if (!json.ok) return setError(json.error || 'Error al procesar la devolución')
      onSuccess(json.devolucion_id, json.total, tieneFE)
    } catch {
      setError('Error de conexión')
    } finally {
      setEnviando(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
      onClick={e => e.target === e.currentTarget && !enviando && onClose()}
    >
      <div style={{ background:'#1e293b', borderRadius:'16px', width:'100%', maxWidth:'640px', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.08)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:'16px', fontWeight:700, color:'#f1f5f9' }}>Devolución de venta</div>
            <div style={{ fontSize:'12px', color:'#64748b', marginTop:'2px' }}>Venta #{ventaId}</div>
          </div>
          <button
            onClick={onClose}
            disabled={enviando}
            style={{ background:'transparent', border:'none', color:'#64748b', cursor:'pointer', fontSize:'20px', lineHeight:1, padding:'4px' }}
          >✕</button>
        </div>

        {/* Body scrollable */}
        <div style={{ overflowY:'auto', flex:1, padding:'20px 24px' }}>
          {loading ? (
            <div style={{ textAlign:'center', color:'#64748b', padding:'32px 0' }}>Cargando líneas...</div>
          ) : (
            <>
              {/* Tabla de líneas */}
              <div style={{ marginBottom:'20px' }}>
                <div style={{ fontSize:'11px', fontWeight:600, color:'#94a3b8', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:'10px' }}>
                  Artículos a devolver
                </div>
                {lineas.map(l => (
                  <div key={l.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'10px', alignItems:'center', padding:'10px 12px', background: l.cantidad_dev > 0 ? 'rgba(56,189,248,0.06)' : 'rgba(255,255,255,0.03)', borderRadius:'10px', marginBottom:'6px', border: l.cantidad_dev > 0 ? '1px solid rgba(56,189,248,0.18)' : '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <div style={{ fontSize:'13px', color:'#e2e8f0', fontWeight:500 }}>{l.descripcion}</div>
                      <div style={{ fontSize:'11px', color:'#64748b', marginTop:'2px' }}>
                        {l.codigo && <span style={{ marginRight:'8px' }}>{l.codigo}</span>}
                        <span>₡{formatMoney(l.precio_unit)} × {l.cantidad} {l.unidad}</span>
                        {l.iva_pct > 0 && <span style={{ marginLeft:'6px', color:'#94a3b8' }}>IVA {l.iva_pct}%</span>}
                      </div>
                    </div>
                    <div style={{ fontSize:'12px', color:'#64748b', textAlign:'right' }}>
                      Cant. orig:<br /><strong style={{ color:'#94a3b8' }}>{l.cantidad}</strong>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                      <div style={{ fontSize:'10px', color:'#64748b' }}>Devolver</div>
                      <input
                        type="number"
                        min={0}
                        max={l.cantidad}
                        step={1}
                        value={l.cantidad_dev}
                        onChange={e => setCantidad(l.id, e.target.value)}
                        style={{ width:'60px', textAlign:'center', background:'#0f172a', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'8px', color:'#f1f5f9', fontSize:'14px', fontWeight:600, padding:'6px 4px' }}
                      />
                    </div>
                    <div style={{ fontSize:'13px', fontWeight:600, color: l.cantidad_dev > 0 ? '#34d399' : '#475569', textAlign:'right', minWidth:'80px' }}>
                      ₡{formatMoney(l.precio_unit * l.cantidad_dev + Math.round(l.precio_unit * l.cantidad_dev * (l.iva_pct / 100) * 100) / 100)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Motivo */}
              <div style={{ marginBottom:'14px' }}>
                <div style={{ fontSize:'11px', fontWeight:600, color:'#94a3b8', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:'8px' }}>
                  Motivo {tieneFE && <span style={{ color:'#38bdf8' }}>(requerido para NC electrónica)</span>}
                </div>
                <select
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  style={{ width:'100%', background:'#0f172a', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'10px', color:'#f1f5f9', fontSize:'14px', padding:'10px 12px', marginBottom:'10px' }}
                >
                  {MOTIVOS.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.label}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Razón de la devolución..."
                  value={razon}
                  onChange={e => setRazon(e.target.value)}
                  style={{ width:'100%', boxSizing:'border-box', background:'#0f172a', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'10px', color:'#f1f5f9', fontSize:'14px', padding:'10px 12px' }}
                />
              </div>

              {/* FE aviso */}
              {tieneFE && (
                <div style={{ background:'rgba(56,189,248,0.08)', border:'1px solid rgba(56,189,248,0.2)', borderRadius:'10px', padding:'10px 14px', marginBottom:'14px', fontSize:'12px', color:'#7dd3fc' }}>
                  Esta venta tiene factura electrónica aceptada. Se emitirá una <strong>Nota de Crédito electrónica</strong> automáticamente al confirmar.
                </div>
              )}

              {error && (
                <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'10px', padding:'10px 14px', color:'#fca5a5', fontSize:'13px', marginBottom:'12px' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 24px', borderTop:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
          <div>
            <div style={{ fontSize:'11px', color:'#64748b' }}>Total a devolver</div>
            <div style={{ fontSize:'22px', fontWeight:700, color:'#34d399' }}>₡{formatMoney(total)}</div>
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            <button
              onClick={onClose}
              disabled={enviando}
              style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', color:'#94a3b8', fontSize:'14px', fontWeight:500, padding:'10px 20px', cursor:'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={confirmar}
              disabled={enviando || loading || lineasSeleccionadas.length === 0}
              style={{ background: lineasSeleccionadas.length > 0 ? 'linear-gradient(135deg,#0ea5e9,#38bdf8)' : 'rgba(255,255,255,0.06)', border:'none', borderRadius:'10px', color: lineasSeleccionadas.length > 0 ? '#fff' : '#475569', fontSize:'14px', fontWeight:600, padding:'10px 24px', cursor: lineasSeleccionadas.length > 0 ? 'pointer' : 'not-allowed', minWidth:'140px' }}
            >
              {enviando ? 'Procesando...' : tieneFE ? '✓ Confirmar y emitir NC' : '✓ Confirmar devolución'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
