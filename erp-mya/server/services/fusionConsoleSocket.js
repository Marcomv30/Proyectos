import net from 'net'
import { adminSb } from '../lib/authz.js'
import { manager } from './fusionSync.js'

const DEFAULT_FUSION_TCP_PORT = Number(process.env.FUSION_TCP_PORT || 3011)

function pickDefined(value, fallback = null) {
  return value == null || value === '' ? fallback : value
}

export function normalizePumpId(pumpId) {
  return String(Number(pumpId) || 0).padStart(3, '0')
}

export function buildFusionCommand(command, params = {}) {
  const extra = Object.entries(params)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${value}`)

  const payload = ['2', '', 'POST', command, ...extra, '', '', '', '^'].join('|')
  const length = String(payload.length).padStart(5, '0')
  return `${length}|5|${payload}`
}

export function parseFusionFields(raw) {
  const normalized = String(raw || '').replace(/\^/g, '')
  const fields = {}
  normalized.split('|').forEach((part) => {
    const idx = part.indexOf('=')
    if (idx > 0) {
      const key = part.slice(0, idx).trim()
      const value = part.slice(idx + 1).trim()
      if (key) fields[key] = value
    }
  })
  return fields
}

export async function resolveFusionConsoleTarget(empresaId) {
  const empresaIdNum = Number(empresaId)
  if (!Number.isFinite(empresaIdNum) || empresaIdNum <= 0) return null

  const inst = manager.getInstance(empresaIdNum)
  if (inst?.cfg?.ssh_host) {
    return {
      empresa_id: empresaIdNum,
      host: inst.cfg.ssh_host,
      port: Number(inst.cfg.fusion_tcp_port || DEFAULT_FUSION_TCP_PORT),
      source: 'manager',
      config: inst.cfg,
    }
  }

  const sb = adminSb()
  const { data, error } = await sb
    .from('fusion_config')
    .select('*')
    .eq('empresa_id', empresaIdNum)
    .eq('activo', true)
    .maybeSingle()

  if (error || !data?.ssh_host) return null

  return {
    empresa_id: empresaIdNum,
    host: data.ssh_host,
    port: Number(data.fusion_tcp_port || DEFAULT_FUSION_TCP_PORT),
    source: 'db',
    config: data,
  }
}

export async function sendFusionSocketCommand({ host, port, command, timeoutMs = 2500 }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let buffer = ''
    let settled = false

    function done(fn, value) {
      if (settled) return
      settled = true
      try { socket.destroy() } catch {}
      fn(value)
    }

    socket.setTimeout(timeoutMs)

    socket.connect(port, host, () => {
      socket.write(Buffer.from(command, 'utf8'))
    })

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      if (buffer.includes('^')) {
        done(resolve, buffer)
      }
    })

    socket.on('timeout', () => {
      done(reject, new Error('Timeout esperando respuesta de Fusion'))
    })

    socket.on('error', (err) => {
      done(reject, err)
    })

    socket.on('close', () => {
      if (!settled) {
        if (buffer) done(resolve, buffer)
        else done(reject, new Error('Fusion cerro la conexion sin respuesta'))
      }
    })
  })
}

export function normalizePumpStatus(raw) {
  const fields = parseFusionFields(raw)
  return {
    raw,
    fields,
    status: pickDefined(fields.ST, 'UNKNOWN'),
    hose_id: pickDefined(fields.HO),
    grade_id: pickDefined(fields.GR),
    money: pickDefined(fields.AM),
    volume: pickDefined(fields.VO),
    ppu: pickDefined(fields.PU),
  }
}

export function normalizeVirRead(raw) {
  const fields = parseFusionFields(raw)
  return {
    raw,
    fields,
    device_id: pickDefined(fields.DID),
    entity_id: pickDefined(fields.EID),
    card_number: pickDefined(fields.CNR),
    vehicle_hint: pickDefined(fields.VHN),
    holder_name: pickDefined(fields.NAM || fields.NAME),
  }
}
