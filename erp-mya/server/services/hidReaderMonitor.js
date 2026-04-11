// ============================================================
// MYA ERP — Monitor de lectores HID (brazaletes)
// Lee hasta 2 lectores USB HID simultáneamente.
// Cada lector está mapeado a un pump_id en comb_hid_lectores.
// Al leer un brazalete → crea sesión de pistero en esa bomba.
// ============================================================

import HID from 'node-hid'
import { adminSb } from '../lib/authz.js'
import { sesionesActivas } from './virMonitor.js'

let monitorStarted = false
let _broadcast = null
export function setHidBroadcast(fn) { _broadcast = fn }

// ── Helpers ───────────────────────────────────────────────

// Convierte códigos HID de teclado a caracteres
const HID_KEY_MAP = {
  // Dígitos fila superior
  0x1E: '1', 0x1F: '2', 0x20: '3', 0x21: '4', 0x22: '5',
  0x23: '6', 0x24: '7', 0x25: '8', 0x26: '9', 0x27: '0',
  // Teclado numérico
  0x59: '1', 0x5A: '2', 0x5B: '3', 0x5C: '4', 0x5D: '5',
  0x5E: '6', 0x5F: '7', 0x60: '8', 0x61: '9', 0x62: '0',
  // Letras A–F (para UIDs en hexadecimal)
  0x04: 'A', 0x05: 'B', 0x06: 'C', 0x07: 'D', 0x08: 'E', 0x09: 'F',
  // Enter
  0x28: 'ENTER',
}

function parseHidReport(data) {
  // Reporte HID teclado: [modifier, reserved, key1, key2, ...]
  const keyCode = data[2]
  return HID_KEY_MAP[keyCode] ?? null
}

// ── Carga config desde Supabase ───────────────────────────

async function cargarLectores(empresaId) {
  const { data, error } = await adminSb()
    .from('comb_hid_lectores')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activo', true)

  if (error) {
    if (!error.message?.includes('comb_hid_lectores')) {
      console.error('[HIDMonitor] Error cargando lectores:', error.message)
    }
    return []
  }
  return data ?? []
}

// ── Resolución de brazalete ───────────────────────────────
// Usa la misma tabla que el VIR físico: comb_dispositivos_identidad

async function resolverBrazalete(empresaId, uid) {
  const { data } = await adminSb()
    .from('comb_dispositivos_identidad')
    .select('id, operador_nombre, alias, attendant_id, estado')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
    .or(`identificador_uid.eq.${uid},attendant_id.eq.${uid}`)
    .maybeSingle()
  return data ?? null
}

// ── Registrar sesión en memoria — Fusion PG recibe attendant_id vía REQ_PUMP_AUTH_ID ──
function crearSesion(empresaId, pumpId, device) {
  const nombre = device.operador_nombre || device.alias || null
  sesionesActivas[pumpId] = {
    id              : null,
    pump_id         : pumpId,
    attendant_id    : device.attendant_id || null,
    operador_nombre : nombre,
    inicio_at       : new Date().toISOString(),
    origen          : 'hid',
  }
  console.log(`[HIDMonitor] Sesión abierta — ${nombre} → Bomba ${pumpId}`)
  if (_broadcast) _broadcast(empresaId, 'hid_scan', {
    pump_id        : pumpId,
    operador_nombre: nombre,
    attendant_id   : device.attendant_id || null,
    sesion_id      : null,
  })
}

// ── Abrir un lector HID ───────────────────────────────────

function abrirLector(lector, empresaId) {
  const { vendor_id, product_id, pump_id, descripcion } = lector
  let device

  try {
    device = new HID.HID(vendor_id, product_id)
  } catch (err) {
    console.warn(`[HIDMonitor] No se pudo abrir lector VID=${vendor_id} PID=${product_id} (${descripcion}):`, err.message)
    return null
  }

  let buffer = ''

  device.on('data', (data) => {
    const key = parseHidReport(data)
    if (!key) return

    if (key === 'ENTER') {
      const braceletId = buffer.trim()
      buffer = ''
      if (!braceletId) return

      console.log(`[HIDMonitor] Lectura bomba=${pump_id} (${descripcion}): ${braceletId}`)

      void (async () => {
        const brazalete = await resolverBrazalete(empresaId, braceletId)
        if (!brazalete) {
          console.warn(`[HIDMonitor] Brazalete ${braceletId} no registrado o inactivo`)
          return
        }
        crearSesion(empresaId, pump_id, brazalete)
      })()
    } else {
      buffer += key
    }
  })

  device.on('error', (err) => {
    console.error(`[HIDMonitor] Error en lector ${descripcion}:`, err.message)
  })

  console.log(`[HIDMonitor] Lector activo — ${descripcion} (VID=${vendor_id} PID=${product_id}) → Bomba ${pump_id}`)
  return device
}

// ── Entry point ───────────────────────────────────────────

export async function startHidReaderMonitor(empresaId) {
  if (monitorStarted) return
  monitorStarted = true

  const lectores = await cargarLectores(empresaId)
  if (lectores.length === 0) {
    console.log('[HIDMonitor] Sin lectores HID configurados — monitor no iniciado')
    monitorStarted = false
    return
  }

  const devices = []
  for (const lector of lectores) {
    const d = abrirLector(lector, empresaId)
    if (d) devices.push(d)
  }

  if (devices.length === 0) {
    console.warn('[HIDMonitor] Ningún lector pudo abrirse — verifique que están conectados')
    monitorStarted = false
    return
  }

  console.log(`[HIDMonitor] ${devices.length} lector(es) activo(s)`)
}
