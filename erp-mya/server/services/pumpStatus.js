// ============================================================
// MYA ERP — Pump Status Service
// Protocolo TCP propietario de Fusion en puerto 3011
// Un socket persistente por bomba, polling continuo
// Broadcast de estado y progreso via WebSocket
// ============================================================

import net    from 'net'
import dotenv from 'dotenv'
dotenv.config()

const FUSION_HOST   = process.env.FUSION_SSH_HOST  || '168.228.51.221'
const FUSION_PORT   = parseInt(process.env.FUSION_TCP_PORT || '3011')
const PUMP_IDS      = Array.from({ length: 10 }, (_, i) => i + 1)  // 1-10
const POLL_MS       = parseInt(process.env.PUMP_POLL_MS || '800')   // cada 800ms
const RECONNECT_MS  = 5000
let pumpMonitorRunning = false
let pumpWorkerStops = []

// ─── Comandos Fusion TCP ──────────────────────────────────────
const CMD_STATUS   = (id) => `00035|5|2||POST|REQ_PUMP_STATUS_ID_${id}||||^`
const CMD_PROGRESS = (id) => `00046|5|2||POST|REQ_PUMP_DELIVERY_PROGRESS_ID_${id}||||^`
const CMD_LAST     = (id) => `00042|5|2||POST|REQ_PUMP_GET_LAST_SALE_ID_${id}||||^`

// ─── Estado en memoria ───────────────────────────────────────
export const pumpStates = {}   // { pump_id: { status, hose_id, grade, volume, money, ppu, ts } }

PUMP_IDS.forEach(id => {
  pumpStates[id] = { pump_id: id, status: 'UNKNOWN', hose_id: null, grade: null, volume: null, money: null, ppu: null, ts: null }
})

// ─── WebSocket broadcast (se inyecta desde index.js) ─────────
let _broadcast = null
export function setPumpBroadcast(fn) { _broadcast = fn }

function broadcast(event, data) {
  if (_broadcast) _broadcast(null, event, data)
}

// ─── Hook sale_end (se inyecta desde index.js) ───────────────
let _onSaleEnd = null
export function setPumpSaleEndHook(fn) { _onSaleEnd = fn }

// ─── Parser de respuesta Fusion ──────────────────────────────
function field(response, key) {
  const sep = key + '='
  const idx = response.indexOf(sep)
  if (idx < 0) return null
  const start = idx + sep.length
  const end   = response.indexOf('|', start)
  return end < 0 ? response.slice(start) : response.slice(start, end)
}

function parseStatus(raw) {
  const r = raw.replace(/\^/g, '\r')
  return field(r, 'ST')
}

function parseProgress(raw) {
  const r = raw.replace(/\^/g, '\r')
  if (!r.includes('GUEST')) return null
  return {
    hose_id : field(r, 'HO'),
    grade   : field(r, 'GR'),
    volume  : parseFloat(field(r, 'VO') || '0'),
    money   : parseFloat(field(r, 'AM') || '0'),
    ppu     : parseFloat(field(r, 'PU') || '0'),
  }
}

function parseLastSale(raw) {
  if (raw.includes('|AM=0')) return null
  return {
    volume : parseFloat(field(raw, 'ATCVO') || field(raw, 'VO') || '0'),
    money  : parseFloat(field(raw, 'AM') || '0'),
  }
}

// ─── Enviar comando y esperar respuesta ──────────────────────
function sendCmd(socket, cmd) {
  return new Promise((resolve) => {
    let buf = ''
    const onData = (chunk) => {
      buf += chunk.toString('utf-8')
      if (buf.includes('^')) {
        socket.removeListener('data', onData)
        resolve(buf)
      }
    }
    socket.on('data', onData)
    socket.write(Buffer.from(cmd, 'UTF-8'))
    // Timeout de seguridad
    setTimeout(() => {
      socket.removeListener('data', onData)
      resolve(buf || '')
    }, 2000)
  })
}

// ─── Worker por bomba ─────────────────────────────────────────
function startPumpWorker(pumpId) {
  const cara = String(pumpId).padStart(3, '0')
  let socket  = null
  let running = true

  function connect() {
    socket = new net.Socket()
    socket.setKeepAlive(true, 5000)

    socket.connect(FUSION_PORT, FUSION_HOST, () => {
      console.log(`[PumpStatus] Bomba ${cara} conectada`)
      poll()
    })

    socket.on('error', (err) => {
      console.error(`[PumpStatus] Bomba ${cara} error: ${err.message}`)
    })

    socket.on('close', () => {
      if (!running) return
      console.warn(`[PumpStatus] Bomba ${cara} desconectada — reconectando en ${RECONNECT_MS}ms`)
      pumpStates[pumpId].status = 'UNKNOWN'
      broadcast('pump_status', { ...pumpStates[pumpId] })
      setTimeout(connect, RECONNECT_MS)
    })
  }

  async function poll() {
    while (running && socket && !socket.destroyed) {
      try {
        // 1. Obtener estado
        const rawStatus = await sendCmd(socket, CMD_STATUS(cara))
        const status    = parseStatus(rawStatus)

        if (!status) { await sleep(POLL_MS); continue }

        const prev = pumpStates[pumpId].status

        if (status === 'IDLE' || status === 'CLOSED' || status === 'ERROR') {
          pumpStates[pumpId] = {
            pump_id : pumpId,
            status,
            hose_id : null,
            grade   : null,
            volume  : null,
            money   : null,
            ppu     : null,
            ts      : new Date().toISOString(),
          }
          if (status !== prev) broadcast('pump_status', { ...pumpStates[pumpId] })

        } else {
          // Bomba activa (CALLING, AUTHORIZED, STARTING, FUELLING)
          pumpStates[pumpId].status = status
          pumpStates[pumpId].ts     = new Date().toISOString()

          if (status !== prev) broadcast('pump_status', { ...pumpStates[pumpId] })

          // 2. Obtener progreso en tiempo real (solo si hay despacho activo)
          if (status === 'FUELLING' || status === 'STARTING' || status === 'AUTHORIZED') {
            const rawProg = await sendCmd(socket, CMD_PROGRESS(cara))
            const prog    = parseProgress(rawProg)

            if (prog) {
              pumpStates[pumpId] = { ...pumpStates[pumpId], ...prog }
              broadcast('pump_delivery', { pump_id: pumpId, ...prog })
            } else {
              // Venta terminando — obtener última venta
              const rawLast = await sendCmd(socket, CMD_LAST(cara))
              const last    = parseLastSale(rawLast)
              if (last) {
                broadcast('pump_sale_end', { pump_id: pumpId, ...last })
                if (_onSaleEnd) _onSaleEnd(pumpId, last)
              }
            }
          }
        }
      } catch (err) {
        console.error(`[PumpStatus] Bomba ${cara} poll error:`, err.message)
      }

      await sleep(POLL_MS)
    }
  }

  connect()

  return () => { running = false; socket?.destroy() }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Iniciar todos los workers ────────────────────────────────
export function startPumpMonitor() {
  if (pumpMonitorRunning) return
  pumpMonitorRunning = true
  console.log(`[PumpStatus] Iniciando monitor de ${PUMP_IDS.length} bombas en ${FUSION_HOST}:${FUSION_PORT}`)
  pumpWorkerStops = PUMP_IDS.map(startPumpWorker)
}

export function stopPumpMonitor() {
  if (!pumpMonitorRunning) return
  pumpMonitorRunning = false
  for (const stop of pumpWorkerStops) {
    try { stop?.() } catch {}
  }
  pumpWorkerStops = []
  PUMP_IDS.forEach((id) => {
    pumpStates[id] = { pump_id: id, status: 'UNKNOWN', hose_id: null, grade: null, volume: null, money: null, ppu: null, ts: null }
  })
  console.log('[PumpStatus] Monitor detenido')
}

// ─── Router Express ───────────────────────────────────────────
import express from 'express'
export const pumpRouter = express.Router()

pumpRouter.get('/estados', (_req, res) => {
  res.json(Object.values(pumpStates))
})
