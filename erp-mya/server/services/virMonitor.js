// ============================================================
// MYA Consola — VIR Monitor
// Polling continuo de lecturas VIR por bomba.
// Cuando detecta un nuevo dispositivo → identifica pistero
// → auto-autoriza la bomba → registra sesión en Supabase.
// ============================================================

import { adminSb } from '../lib/authz.js'
import {
  buildFusionCommand,
  parseFusionFields,
  resolveFusionConsoleTarget,
  sendFusionSocketCommand,
} from './fusionConsoleSocket.js'
import { manager } from './fusionSync.js'

const PUMP_IDS      = Array.from({ length: 10 }, (_, i) => i + 1)
const POLL_MS       = parseInt(process.env.VIR_POLL_MS  || '3000')
const EMPRESA_ID    = parseInt(process.env.EMPRESA_ID   || '1')
const AUTO_AUTH     = process.env.FUSION_ENABLE_VIR_AUTOAUTH === 'true'

// Estado en memoria: último DID conocido por bomba
const lastDid = {}   // { pump_id: string | null }
PUMP_IDS.forEach(id => { lastDid[id] = null })

// Sesiones activas en memoria (pump_id → sesion)
export const sesionesActivas = {}  // { pump_id: { id, attendant_id, operador_nombre, inicio_at, dispositivo } }

let _broadcast = null
export function setVirBroadcast(fn) { _broadcast = fn }

function broadcast(event, data) {
  if (_broadcast) _broadcast(null, event, data)
}

let monitorRunning = false
let stopHandlers = []

// ─── Helpers ─────────────────────────────────────────────────

function normPump(id) { return String(id).padStart(3, '0') }

async function getVirRead(target, pumpId) {
  const cara    = normPump(pumpId)
  const command = buildFusionCommand(`REQ_VIR_GET_LAST_VI_READ_ID_${cara}`)
  try {
    const raw    = await sendFusionSocketCommand({ host: target.host, port: target.port, command, timeoutMs: 2000 })
    const fields = parseFusionFields(raw)
    return { did: fields.DID || null, eid: fields.EID || null, cnr: fields.CNR || null, name: fields.NAM || fields.NAME || null }
  } catch {
    return null
  }
}

async function lookupDevice(empresaId, did, eid, cnr) {
  const sb = adminSb()
  // Busca por identificador_uid (DID, EID o CNR) o attendant_id
  const candidates = [did, eid, cnr].filter(Boolean)
  if (!candidates.length) return null

  for (const uid of candidates) {
    const { data } = await sb
      .from('comb_dispositivos_identidad')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('estado', 'activo')
      .or(`identificador_uid.eq.${uid},attendant_id.eq.${uid}`)
      .maybeSingle()
    if (data) return data
  }
  return null
}

async function autoAutorizar(target, pumpId, device) {
  const cara    = normPump(pumpId)
  const params  = {
    PAY_TY : device.payment_type  || 'DEVICE',
    PAY_IN : device.payment_info  || device.attendant_id || device.identificador_uid,
    GR     : device.grade_id_preferido  || null,
    HO     : device.pump_id_preferido ? null : null,  // sin preferencia de manguera
    FTS    : 'YES',
  }
  const command = buildFusionCommand(`REQ_PUMP_AUTH_ID_${cara}`, params)

  if (!AUTO_AUTH) {
    console.log(`[VIR] Auto-auth deshabilitado. Preview: ${command}`)
    return { ok: false, preview: true, command }
  }

  try {
    const raw = await sendFusionSocketCommand({ host: target.host, port: target.port, command, timeoutMs: 3000 })
    console.log(`[VIR] Bomba ${cara} autorizada para ${device.operador_nombre || device.attendant_id}`)
    return { ok: true, command, raw }
  } catch (err) {
    console.error(`[VIR] Error autorizando bomba ${cara}: ${err.message}`)
    return { ok: false, error: err.message, command }
  }
}

async function displayOnVir(target, pumpId, { pre, msg, usrn } = {}) {
  const cara   = normPump(pumpId)
  const params = {}
  if (pre)  params.PRE  = String(pre)
  if (msg)  params.MSG  = msg
  if (usrn) params.USRN = usrn
  const command = buildFusionCommand(`REQ_VIR_DISPLAY_MSG_ID_${cara}`, params)
  if (!AUTO_AUTH) return  // no enviar si write está deshabilitado
  try {
    await sendFusionSocketCommand({ host: target.host, port: target.port, command, timeoutMs: 2000 })
  } catch {
    // silencioso — fallo en display no bloquea el flujo principal
  }
}

// Sesión solo en memoria — Fusion PG registra attendant_id en cada venta vía REQ_PUMP_AUTH_ID
function registrarSesion(pumpId, device) {
  return { id: null, inicio_at: new Date().toISOString() }
}

export function finalizarSesionPump(empresaId, pumpId) {
  delete sesionesActivas[pumpId]
  broadcast('pistero_liberado', { empresa_id: empresaId, pump_id: pumpId })
}

// ─── Worker por bomba ─────────────────────────────────────────

function startVirWorker(empresaId, pumpId, target) {
  let running = true

  async function poll() {
    while (running) {
      try {
        const read = await getVirRead(target, pumpId)
        const did  = read?.did ?? null

        if (did && did !== lastDid[pumpId]) {
          // Nuevo dispositivo detectado
          lastDid[pumpId] = did
          console.log(`[VIR] Bomba ${normPump(pumpId)}: nuevo DID=${did}`)

          const device = await lookupDevice(empresaId, read.did, read.eid, read.cnr)
          if (!device) {
            console.warn(`[VIR] Dispositivo ${did} no registrado en empresa ${empresaId}`)
            void displayOnVir(target, pumpId, { pre: 3 })  // "VI was not recognized"
            broadcast('vir_desconocido', { empresa_id: empresaId, pump_id: pumpId, did, eid: read.eid, cnr: read.cnr })
          } else {
            const authResult = await autoAutorizar(target, pumpId, device)
            void displayOnVir(target, pumpId, { pre: 4, usrn: device.operador_nombre || device.alias || device.attendant_id })
            const sesion     = registrarSesion(pumpId, device)

            sesionesActivas[pumpId] = {
              id              : sesion?.id,
              pump_id         : pumpId,
              attendant_id    : device.attendant_id,
              operador_nombre : device.operador_nombre || device.alias,
              vehiculo_codigo : device.vehiculo_codigo,
              placa           : device.placa,
              inicio_at       : sesion?.inicio_at || new Date().toISOString(),
              auto_auth       : AUTO_AUTH,
            }

            broadcast('pistero_asignado', {
              empresa_id      : empresaId,
              pump_id         : pumpId,
              ...sesionesActivas[pumpId],
            })
          }
        }
      } catch (err) {
        // silencioso — falla de red no debe detener el monitor
      }

      await sleep(POLL_MS)
    }
  }

  void poll()
  return () => { running = false }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── API pública ──────────────────────────────────────────────

export async function startVirMonitor() {
  if (monitorRunning) return
  monitorRunning = true

  // Primero intenta con el EMPRESA_ID del .env
  let target = await resolveFusionConsoleTarget(EMPRESA_ID)
  let empresaId = EMPRESA_ID

  // Fallback: si no hay config para ese empresa_id, usa la primera instancia activa del manager
  if (!target) {
    const all = manager.getAll()
    const primera = all.find(inst => inst?.cfg?.ssh_host)
    if (primera) {
      const DEFAULT_FUSION_TCP_PORT = 3011
      target = {
        empresa_id: primera.cfg.empresa_id,
        host: primera.cfg.ssh_host,
        port: Number(primera.cfg.tcp_port || primera.cfg.fusion_tcp_port || DEFAULT_FUSION_TCP_PORT),
        source: 'manager-fallback',
      }
      empresaId = primera.cfg.empresa_id
      console.log(`[VIR] EMPRESA_ID=${EMPRESA_ID} sin config Fusion; usando empresa_id=${empresaId} del manager.`)
    }
  }

  if (!target) {
    console.warn('[VIR] No hay configuración Fusion — monitor VIR no iniciado')
    monitorRunning = false
    return
  }

  console.log(`[VIR] Iniciando monitor en ${PUMP_IDS.length} bombas (empresa_id=${empresaId}). Auto-auth: ${AUTO_AUTH}`)
  stopHandlers = PUMP_IDS.map(id => startVirWorker(empresaId, id, target))
}

export function stopVirMonitor() {
  if (!monitorRunning) return
  monitorRunning = false
  stopHandlers.forEach(stop => { try { stop?.() } catch {} })
  stopHandlers = []
  console.log('[VIR] Monitor detenido')
}

// ─── Router Express ───────────────────────────────────────────

import express from 'express'
import { requirePermission } from '../lib/authz.js'

export const virRouter = express.Router()

// Sesiones activas en tiempo real
virRouter.get('/activas', async (req, res) => {
  const empresaId = Number(req.query.empresa_id)
  if (!empresaId) return res.status(400).json({ ok: false, error: 'empresa_id requerido' })
  const ctx = await requirePermission(req, res, empresaId, 'combustible:ver')
  if (!ctx) return

  res.json({ ok: true, sesiones: Object.values(sesionesActivas), empresa_id: empresaId })
})

// Asignación manual desde consola (alternativa digital)
virRouter.post('/asignar', async (req, res) => {
  const empresaId    = Number(req.body?.empresa_id)
  const pumpId       = Number(req.body?.pump_id)
  const dispositivoId = Number(req.body?.dispositivo_id)
  if (!empresaId || !pumpId || !dispositivoId) {
    return res.status(400).json({ ok: false, error: 'empresa_id, pump_id y dispositivo_id requeridos' })
  }

  const ctx = await requirePermission(req, res, empresaId, 'combustible:ver')
  if (!ctx) return

  const sb = adminSb()
  const { data: device, error } = await sb
    .from('comb_dispositivos_identidad')
    .select('*')
    .eq('id', dispositivoId)
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (error || !device) return res.status(404).json({ ok: false, error: 'Dispositivo no encontrado' })

  const target = await resolveFusionConsoleTarget(empresaId)
  if (!target) return res.status(404).json({ ok: false, error: 'Sin configuración Fusion' })

  const authResult = await autoAutorizar(target, pumpId, device)
  const sesion     = registrarSesion(pumpId, device)

  sesionesActivas[pumpId] = {
    id              : sesion?.id,
    pump_id         : pumpId,
    attendant_id    : device.attendant_id,
    operador_nombre : device.operador_nombre || device.alias,
    vehiculo_codigo : device.vehiculo_codigo,
    placa           : device.placa,
    inicio_at       : sesion?.inicio_at || new Date().toISOString(),
    auto_auth       : AUTO_AUTH,
    origen          : 'consola_manual',
  }

  broadcast('pistero_asignado', { empresa_id: empresaId, pump_id: pumpId, ...sesionesActivas[pumpId] })

  res.json({ ok: true, sesion: sesionesActivas[pumpId], auth: authResult })
})

// Liberar bomba manualmente
virRouter.post('/liberar/:pumpId', async (req, res) => {
  const empresaId = Number(req.query.empresa_id || req.body?.empresa_id)
  const pumpId    = Number(req.params.pumpId)
  const ctx = await requirePermission(req, res, empresaId, 'combustible:ver')
  if (!ctx) return

  await finalizarSesionPump(empresaId, pumpId)
  res.json({ ok: true, pump_id: pumpId })
})
