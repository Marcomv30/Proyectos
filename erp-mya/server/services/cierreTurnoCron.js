// ============================================================
// MYA — Cierre automático de turno
// Ejecuta el cierre MYA a las horas configuradas (CR timezone)
// sincronizado con los cierres automáticos de Fusion.
// ============================================================

import { adminSb } from '../lib/authz.js'
import { manager } from './fusionSync.js'

// Horas de cierre en formato HH:MM (America/Costa_Rica)
// Deben coincidir con Fusion: Tiempo de cierres
const CLOSE_TIMES = (process.env.SHIFT_CLOSE_TIMES || '06:00,14:00,22:00')
  .split(',').map(t => t.trim()).filter(Boolean)

// Usa el empresa_id de la instancia Fusion activa (puede diferir del .env EMPRESA_ID)
function getEmpresaId() {
  const envId = parseInt(process.env.EMPRESA_ID || '1')
  if (manager.getInstance(envId)) return envId
  const primera = manager.getAll()[0]
  return primera?.cfg?.empresa_id ?? envId
}

function horaActualCR() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Costa_Rica',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const h = parts.find(p => p.type === 'hour')?.value   || '00'
  const m = parts.find(p => p.type === 'minute')?.value || '00'
  return `${h}:${m}` // siempre "06:00", "14:00", "22:00"
}

function turnoDelDia(fecha) {
  const h = Number(new Date(fecha).toLocaleString('en-US', {
    hour: 'numeric', hour12: false, timeZone: 'America/Costa_Rica',
  }))
  if (h >= 6 && h < 14) return 'Mañana'
  if (h >= 14 && h < 22) return 'Tarde'
  return 'Noche'
}

async function ejecutarCierreMya(empresaId) {
  const sb = adminSb()

  // Verificar que no se hizo ya un cierre en los últimos 10 minutos
  const { data: reciente } = await sb
    .from('comb_cierres_turno')
    .select('cierre_at')
    .eq('empresa_id', empresaId)
    .order('cierre_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (reciente?.cierre_at) {
    const minutosDesdeUltimo = (Date.now() - new Date(reciente.cierre_at).getTime()) / 60000
    if (minutosDesdeUltimo < 10) {
      console.log(`[CierreCron] Cierre reciente hace ${minutosDesdeUltimo.toFixed(1)} min — omitido`)
      return
    }
  }

  const inicioPeriodo = reciente?.cierre_at || '1970-01-01T00:00:00Z'
  const cierreAt = new Date().toISOString()

  const { data: ventas } = await sb
    .from('ventas_combustible')
    .select('grade_id, volume, money, pump_id, attendant_id, end_at')
    .eq('empresa_id', empresaId)
    .gt('end_at', inicioPeriodo)
    .not('volume', 'is', null)

  const lista = ventas || []

  const porGrado = {}
  const porPistero = {}
  const porBomba = {}

  lista.forEach(v => {
    const gk = String(v.grade_id)
    if (!porGrado[gk]) porGrado[gk] = { grade_id: v.grade_id, litros: 0, monto: 0, ventas: 0 }
    porGrado[gk].litros += Number(v.volume || 0)
    porGrado[gk].monto  += Number(v.money  || 0)
    porGrado[gk].ventas++

    const pk = v.attendant_id || 'SIN_PISTERO'
    if (!porPistero[pk]) porPistero[pk] = { attendant_id: pk, litros: 0, monto: 0, ventas: 0 }
    porPistero[pk].litros += Number(v.volume || 0)
    porPistero[pk].monto  += Number(v.money  || 0)
    porPistero[pk].ventas++

    const bk = String(v.pump_id)
    if (!porBomba[bk]) porBomba[bk] = { pump_id: v.pump_id, litros: 0, monto: 0, ventas: 0 }
    porBomba[bk].litros += Number(v.volume || 0)
    porBomba[bk].monto  += Number(v.money  || 0)
    porBomba[bk].ventas++
  })

  const { data: cierre, error } = await sb
    .from('comb_cierres_turno')
    .insert({
      empresa_id      : empresaId,
      turno_nombre    : turnoDelDia(cierreAt),
      inicio_at       : inicioPeriodo,
      cierre_at       : cierreAt,
      cerrado_por     : 'sistema',
      total_ventas    : lista.length,
      total_litros    : lista.reduce((s, v) => s + Number(v.volume || 0), 0),
      total_monto     : lista.reduce((s, v) => s + Number(v.money  || 0), 0),
      resumen_grados  : Object.values(porGrado),
      resumen_pisteros: Object.values(porPistero),
      resumen_bombas  : Object.values(porBomba),
      notas           : 'Cierre automático del sistema',
    })
    .select()
    .single()

  if (error) {
    console.error('[CierreCron] Error al insertar cierre:', error.message)
    return
  }

  console.log(`[CierreCron] Turno ${cierre.turno_nombre} cerrado — empresa=${empresaId} ventas=${lista.length} monto=₡${cierre.total_monto}`)
}

let cronRunning = false
let lastChecked = ''

export function startCierreTurnoCron() {
  if (cronRunning) return
  cronRunning = true

  console.log(`[CierreCron] Iniciado. Horarios: ${CLOSE_TIMES.join(', ')} (America/Costa_Rica)`)

  setInterval(async () => {
    const ahora = horaActualCR()
    if (ahora === lastChecked) return          // ya se procesó este minuto

    // Log cada hora en punto para confirmar que el cron está vivo
    if (ahora.endsWith(':00')) {
      console.log(`[CierreCron] Check ${ahora} CR — horarios: ${CLOSE_TIMES.join(', ')}`)
    }

    if (!CLOSE_TIMES.includes(ahora)) return  // no es hora de cierre

    lastChecked = ahora
    const empresaId = getEmpresaId()
    console.log(`[CierreCron] Ejecutando cierre de turno: ${ahora} (empresa_id=${empresaId})`)
    try {
      await ejecutarCierreMya(empresaId)
    } catch (err) {
      console.error('[CierreCron] Error:', err.message)
    }
  }, 30_000) // chequea cada 30 segundos
}
