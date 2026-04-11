// ============================================================
// MYA — Pista QR: generación de códigos QR por bomba
// ============================================================
import { useState } from 'react'
import { Printer, QrCode, Info } from 'lucide-react'

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001'
const DEFAULT_HOST = API.replace(/\/+$/, '')

interface Props {
  empresaId: number
}

export default function PistaQRPage({ empresaId }: Props) {
  const [host, setHost]       = useState(DEFAULT_HOST)
  const [cantBombas, setCant] = useState(10)
  const [printing, setPrinting] = useState(false)

  // La key que el ERP usa para auth de agente — debe coincidir con AGENT_SECRET del servidor.
  // El frontend NO conoce AGENT_SECRET directamente; el admin lo ingresa aquí (campo oculto).
  const [secret, setSecret] = useState('')

  const qrUrl = (p: number) =>
    `${API}/api/pista/qr?e=${empresaId}&p=${p}&k=${encodeURIComponent(secret)}&host=${encodeURIComponent(host)}`

  const pistaUrl = (p: number) =>
    `${host}/pista?e=${empresaId}&p=${p}&k=${encodeURIComponent(secret)}`

  function handlePrint() {
    if (!secret) { alert('Ingrese el AGENT_SECRET antes de imprimir.'); return }
    setPrinting(true)
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { setPrinting(false); return }

    const cards = Array.from({ length: cantBombas }, (_, i) => i + 1).map(p => {
      const url = pistaUrl(p)
      const src = qrUrl(p)
      return `
        <div class="card">
          <div class="bomb">${p}</div>
          <img src="${src}" alt="QR Bomba ${p}" onerror="this.style.display='none'">
          <div class="label">Bomba ${p}</div>
          <div class="url">${url}</div>
        </div>`
    }).join('')

    win.document.write(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>MYA Pista — Códigos QR</title>
<style>
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #fff; }
  h1 { font-size: 18px; margin-bottom: 16px; color: #1e293b; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; page-break-inside: avoid; }
  .bomb { font-size: 28px; font-weight: 900; color: #f59e0b; margin-bottom: 8px; }
  img { width: 160px; height: 160px; display: block; margin: 0 auto 8px; }
  .label { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .url { font-size: 9px; color: #94a3b8; word-break: break-all; }
  @media print {
    @page { margin: 1cm; }
    .grid { grid-template-columns: repeat(4, 1fr); }
  }
</style></head><body>
<h1>MYA Pista — Códigos QR por bomba</h1>
<div class="grid">${cards}</div>
</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print(); setPrinting(false) }, 1200)
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
          <QrCode size={20} className="text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Pista PWA — Códigos QR</h2>
          <p className="text-xs text-gray-400">Genere e imprima los QR para cada bomba</p>
        </div>
      </div>

      {/* Info */}
      <div className="mb-5 flex gap-3 bg-blue-950/40 border border-blue-800/40 rounded-xl p-4">
        <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-300 leading-relaxed">
          El pistero escanea el QR de su bomba con el celular, selecciona su nombre y queda
          registrado en el sistema. No requiere instalar ninguna app.
        </div>
      </div>

      {/* Configuración */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5 flex flex-col gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">
            URL del servidor (IP en la red local — la que ven los celulares)
          </label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            value={host}
            onChange={e => setHost(e.target.value.trim())}
            placeholder="http://192.168.1.100:3001"
          />
          <p className="text-xs text-gray-600 mt-1">Ejemplo: http://192.168.1.100:3001</p>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">
            AGENT_SECRET <span className="text-gray-600">(del archivo .env del servidor)</span>
          </label>
          <input
            type="password"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            placeholder="••••••••••••"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5 font-medium">
            Cantidad de bombas
          </label>
          <input
            type="number"
            min={1} max={20}
            className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            value={cantBombas}
            onChange={e => setCant(Math.max(1, Math.min(20, Number(e.target.value))))}
          />
        </div>
      </div>

      {/* Preview grid */}
      {secret ? (
        <div className="mb-5">
          <p className="text-xs text-gray-500 mb-3">Vista previa — {cantBombas} bomba{cantBombas !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {Array.from({ length: cantBombas }, (_, i) => i + 1).map(p => (
              <div key={p} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                <div className="text-lg font-black text-amber-400 mb-1">{p}</div>
                <img
                  src={qrUrl(p)}
                  alt={`QR Bomba ${p}`}
                  className="w-20 h-20 mx-auto rounded"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <div className="text-xs text-gray-500 mt-1">Bomba {p}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-5 text-center py-8 text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
          Ingrese el AGENT_SECRET para ver la vista previa
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-3">
        <button
          onClick={handlePrint}
          disabled={!secret || printing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 text-black font-semibold text-sm
            hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Printer size={16} />
          {printing ? 'Preparando…' : 'Imprimir todos los QR'}
        </button>
      </div>
    </div>
  )
}
