import express from 'express'
import { requirePermission, requireSuperuser, adminSb } from '../lib/authz.js'
import {
  buildFusionCommand,
  normalizePumpId,
  normalizePumpStatus,
  normalizeVirRead,
  parseFusionFields,
  resolveFusionConsoleTarget,
  sendFusionSocketCommand,
} from '../services/fusionConsoleSocket.js'
import { manager } from '../services/fusionSync.js'

export const consolaFusionRouter = express.Router()

async function requireEmpresaRead(req, res) {
  const empresaId = Number(req.query.empresa_id || req.body?.empresa_id)
  if (!empresaId) {
    res.status(400).json({ ok: false, error: 'empresa_id requerido' })
    return null
  }

  const ctx = await requirePermission(req, res, empresaId, 'combustible:ver')
  if (!ctx) return null

  const target = await resolveFusionConsoleTarget(empresaId)
  if (!target) {
    res.status(404).json({ ok: false, error: `No hay configuracion Fusion para empresa_id=${empresaId}` })
    return null
  }

  return { empresaId, ctx, target }
}

async function requireEmpresaWrite(req, res) {
  const empresaId = Number(req.query.empresa_id || req.body?.empresa_id)
  if (!empresaId) {
    res.status(400).json({ ok: false, error: 'empresa_id requerido' })
    return null
  }

  const ctx = await requireSuperuser(req, res)
  if (!ctx) return null

  const target = await resolveFusionConsoleTarget(empresaId)
  if (!target) {
    res.status(404).json({ ok: false, error: `No hay configuracion Fusion para empresa_id=${empresaId}` })
    return null
  }

  return { empresaId, ctx, target }
}

async function runCommand(target, command, timeoutMs = 2500) {
  const raw = await sendFusionSocketCommand({
    host: target.host,
    port: target.port,
    command,
    timeoutMs,
  })
  return { raw, fields: parseFusionFields(raw) }
}

consolaFusionRouter.get('/estado', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return

  res.json({
    ok: true,
    empresa_id: payload.empresaId,
    host: payload.target.host,
    port: payload.target.port,
    source: payload.target.source,
    write_enabled: process.env.FUSION_ENABLE_WRITE_COMMANDS === 'true',
  })
})

consolaFusionRouter.get('/surtidores/:pumpId/status', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return

  try {
    const pumpId = normalizePumpId(req.params.pumpId)
    const command = buildFusionCommand(`REQ_PUMP_STATUS_ID_${pumpId}`)
    const result = await runCommand(payload.target, command)
    res.json({ ok: true, pump_id: pumpId, command, ...normalizePumpStatus(result.raw) })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

consolaFusionRouter.get('/surtidores/:pumpId/progreso', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return

  try {
    const pumpId = normalizePumpId(req.params.pumpId)
    const command = buildFusionCommand(`REQ_PUMP_DELIVERY_PROGRESS_ID_${pumpId}`)
    const result = await runCommand(payload.target, command)
    res.json({ ok: true, pump_id: pumpId, command, ...normalizePumpStatus(result.raw) })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

consolaFusionRouter.get('/surtidores/:pumpId/ultima-venta', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return

  try {
    const pumpId = normalizePumpId(req.params.pumpId)
    const command = buildFusionCommand(`REQ_PUMP_GET_LAST_SALE_ID_${pumpId}`)
    const result = await runCommand(payload.target, command)
    res.json({ ok: true, pump_id: pumpId, command, ...normalizePumpStatus(result.raw) })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

consolaFusionRouter.post('/dispositivos/:pumpId/abrir', async (req, res) => {
  const payload = await requireEmpresaWrite(req, res)
  if (!payload) return

  const pumpId = normalizePumpId(req.params.pumpId)
  const command = buildFusionCommand(`REQ_VIR_OPEN_ID_${pumpId}`)

  if (process.env.FUSION_ENABLE_WRITE_COMMANDS !== 'true') {
    return res.status(501).json({
      ok: false,
      error: 'Escritura Fusion deshabilitada en este entorno.',
      pump_id: pumpId,
      command_preview: command,
    })
  }

  try {
    const result = await runCommand(payload.target, command)
    res.json({ ok: true, pump_id: pumpId, command, fields: result.fields, raw: result.raw })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message, command })
  }
})

consolaFusionRouter.post('/dispositivos/:pumpId/iniciar-lectura', async (req, res) => {
  const payload = await requireEmpresaWrite(req, res)
  if (!payload) return

  const pumpId = normalizePumpId(req.params.pumpId)
  const command = buildFusionCommand(`REQ_VIR_START_READ_ID_${pumpId}`)

  if (process.env.FUSION_ENABLE_WRITE_COMMANDS !== 'true') {
    return res.status(501).json({
      ok: false,
      error: 'Escritura Fusion deshabilitada en este entorno.',
      pump_id: pumpId,
      command_preview: command,
    })
  }

  try {
    const result = await runCommand(payload.target, command)
    res.json({ ok: true, pump_id: pumpId, command, fields: result.fields, raw: result.raw })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message, command })
  }
})

// ─── Acciones de control por surtidor ────────────────────────────────────────

function writeGated(fusionCmd) {
  return async (req, res) => {
    const payload = await requireEmpresaWrite(req, res)
    if (!payload) return

    const pumpId = normalizePumpId(req.params.pumpId)
    const command = buildFusionCommand(`${fusionCmd}_${pumpId}`)

    if (process.env.FUSION_ENABLE_WRITE_COMMANDS !== 'true') {
      return res.status(501).json({
        ok: false,
        error: 'Escritura Fusion deshabilitada en este entorno.',
        pump_id: pumpId,
        command_preview: command,
      })
    }

    try {
      const result = await runCommand(payload.target, command)
      res.json({ ok: true, pump_id: pumpId, command, ...normalizePumpStatus(result.raw) })
    } catch (err) {
      res.status(502).json({ ok: false, error: err.message, command })
    }
  }
}

consolaFusionRouter.post('/surtidores/:pumpId/desautorizar', writeGated('REQ_PUMP_DEAUTH_ID'))
consolaFusionRouter.post('/surtidores/:pumpId/pausar',       writeGated('REQ_PUMP_PAUSE_ID'))
consolaFusionRouter.post('/surtidores/:pumpId/reanudar',     writeGated('REQ_PUMP_RESUME_ID'))
consolaFusionRouter.post('/surtidores/:pumpId/detener',      writeGated('REQ_PUMP_STOP_ID'))

consolaFusionRouter.get('/dispositivos/:pumpId/ultima-lectura', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return

  try {
    const pumpId = normalizePumpId(req.params.pumpId)
    const command = buildFusionCommand(`REQ_VIR_GET_LAST_VI_READ_ID_${pumpId}`)
    const result = await runCommand(payload.target, command)
    res.json({ ok: true, pump_id: pumpId, command, ...normalizeVirRead(result.raw) })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

consolaFusionRouter.post('/surtidores/:pumpId/autorizar', async (req, res) => {
  const payload = await requireEmpresaWrite(req, res)
  if (!payload) return

  const pumpId = normalizePumpId(req.params.pumpId)
  const params = {
    HO: req.body?.hose_id || null,
    GR: req.body?.grade_id || null,
    FTS: req.body?.force_send ? 'YES' : null,
    PAY_TY: req.body?.payment_type || null,
    PAY_IN: req.body?.payment_info || null,
  }
  const command = buildFusionCommand(`REQ_PUMP_AUTH_ID_${pumpId}`, params)

  if (process.env.FUSION_ENABLE_WRITE_COMMANDS !== 'true') {
    return res.status(501).json({
      ok: false,
      error: 'Escritura Fusion deshabilitada en este entorno. Se devuelve preview del comando.',
      pump_id: pumpId,
      command_preview: command,
      params,
    })
  }

  try {
    const result = await runCommand(payload.target, command)
    res.json({ ok: true, pump_id: pumpId, command, fields: result.fields, raw: result.raw })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message, command })
  }
})

// ─── Turnos ───────────────────────────────────────────────────

consolaFusionRouter.get('/turnos/estado', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return
  const command = buildFusionCommand('REQ_SHIFT_PERIOD_STATUS')
  try {
    const result = await runCommand(payload.target, command)
    res.json({ ok: true, fields: result.fields, raw: result.raw })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

consolaFusionRouter.post('/turnos/cerrar', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return

  // Formato correcto MRS: len|5|2||POST|EVENT|destination|origin|PARAMS|^
  // buildFusionCommand pone params antes de destination — incorrecto para Shifts Add In
  const body = `2||POST|REQ_SHIFT_CLOSE_PERIOD|||PT=S|^`
  const command = `${String(body.length).padStart(5, '0')}|5|${body}`

  if (process.env.FUSION_ENABLE_WRITE_COMMANDS !== 'true') {
    return res.status(501).json({ ok: false, error: 'Escritura Fusion deshabilitada.', command_preview: command })
  }
  try {
    const { raw, fields } = await runCommand(payload.target, command, 20000)
    console.log('[turnos/cerrar] raw:', raw)
    res.json({ ok: true, fields, raw, command })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message, command })
  }
})

// ─── Precios ──────────────────────────────────────────────────

consolaFusionRouter.post('/precios/programar', async (req, res) => {
  const payload = await requireEmpresaWrite(req, res)
  if (!payload) return

  const grades = req.body?.grades
  if (!Array.isArray(grades) || grades.length === 0) {
    return res.status(400).json({ ok: false, error: 'grades requerido (array de {grade_id, price, price_level?})' })
  }

  // Fecha efectiva: YYYYMMDD. Por defecto mañana a medianoche (inicio del día) en CR
  let fechaEfectiva
  if (req.body?.fecha_efectiva) {
    fechaEfectiva = String(req.body.fecha_efectiva).replace(/-/g, '').slice(0, 8)
  } else {
    const cr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }))
    cr.setDate(cr.getDate() + 1)
    fechaEfectiva = `${cr.getFullYear()}${String(cr.getMonth() + 1).padStart(2, '0')}${String(cr.getDate()).padStart(2, '0')}`
  }

  // Armar params: QTY + bloques G01..GNN
  const qty = grades.length
  let params = `QTY=${qty}`
  grades.forEach((g, i) => {
    const n = String(i + 1).padStart(2, '0')
    const lvl = g.price_level ?? 1
    params += `|G${n}NR=${g.grade_id}|G${n}LV=${lvl}|G${n}PR=${g.price}`
  })
  params += `|DT=${fechaEfectiva}|TI=000000`

  // MRS format correcto: params DESPUÉS de destination/origin
  const body = `2||POST|REQ_PRICES_SET_NEW_PRICE_CHANGE|||${params}|^`
  const command = `${String(body.length).padStart(5, '0')}|5|${body}`

  if (process.env.FUSION_ENABLE_WRITE_COMMANDS !== 'true') {
    return res.status(501).json({
      ok: false,
      error: 'Escritura Fusion deshabilitada.',
      command_preview: command,
      params_preview: params,
      fecha_efectiva: fechaEfectiva,
    })
  }

  try {
    const result = await runCommand(payload.target, command, 5000)
    console.log('[precios/programar] raw:', result.raw)
    res.json({ ok: true, command, fields: result.fields, raw: result.raw, fecha_efectiva: fechaEfectiva })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message, command })
  }
})

// ─── Mantenimiento turno ──────────────────────────────────────

function getFusionPool(empresaId) {
  // Busca la instancia por empresa_id; si no existe, usa la primera disponible
  let inst = manager.getInstance(Number(empresaId))
  if (!inst) inst = manager.getAll().find(i => i?.fusionPool)
  return inst?.fusionPool || null
}

consolaFusionRouter.get('/turnos/diagnostico-pagos', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return

  const pool = getFusionPool(payload.empresaId)
  if (!pool) return res.status(503).json({ ok: false, error: 'Tunnel Fusion PG no disponible' })

  try {
    // Turno abierto más antiguo tipo S
    const turnoRes = await pool.query(`
      SELECT period_id, period_start_trans_id
      FROM ssf_addin_shifts_data
      WHERE period_type = 'S' AND period_status = 'O'
      ORDER BY period_id ASC
      LIMIT 1
    `)
    if (!turnoRes.rows.length) {
      return res.json({ ok: true, turno_abierto: null, huerfanas: 0 })
    }
    const { period_id, period_start_trans_id } = turnoRes.rows[0]

    const countRes = await pool.query(`
      SELECT COUNT(*) AS total
      FROM ssf_pump_sales s
      WHERE s.sale_id >= $1
        AND NOT EXISTS (
          SELECT 1 FROM ssf_addin_payments_data p
          WHERE p.pay_sale_id::bigint = s.sale_id::bigint
        )
    `, [period_start_trans_id])

    res.json({
      ok: true,
      period_id: Number(period_id),
      period_start_trans_id: Number(period_start_trans_id),
      huerfanas: Number(countRes.rows[0].total),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

consolaFusionRouter.post('/turnos/reparar-pagos', async (req, res) => {
  const payload = await requireEmpresaWrite(req, res)
  if (!payload) return

  const pool = getFusionPool(payload.empresaId)
  if (!pool) return res.status(503).json({ ok: false, error: 'Tunnel Fusion PG no disponible' })

  const pay_type = String(req.body?.payment_type || 'CASH').toUpperCase()

  try {
    const turnoRes = await pool.query(`
      SELECT period_id, period_start_trans_id
      FROM ssf_addin_shifts_data
      WHERE period_type = 'S' AND period_status = 'O'
      ORDER BY period_id ASC
      LIMIT 1
    `)
    if (!turnoRes.rows.length) {
      return res.json({ ok: true, insertadas: 0, message: 'No hay turno abierto' })
    }
    const { period_id, period_start_trans_id } = turnoRes.rows[0]
    const now = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)

    const insertRes = await pool.query(`
      INSERT INTO ssf_addin_payments_data (pay_sale_id, pay_payment_type, pay_payment_info, last_modified_date)
      SELECT s.sale_id, $2, '', $3
      FROM ssf_pump_sales s
      WHERE s.sale_id >= $1
        AND NOT EXISTS (
          SELECT 1 FROM ssf_addin_payments_data p
          WHERE p.pay_sale_id::bigint = s.sale_id::bigint
        )
      ON CONFLICT DO NOTHING
    `, [period_start_trans_id, pay_type, now])

    console.log(`[turnos/reparar-pagos] period_id=${period_id} insertadas=${insertRes.rowCount} tipo=${pay_type}`)
    res.json({
      ok: true,
      period_id: Number(period_id),
      insertadas: insertRes.rowCount,
      payment_type: pay_type,
    })
  } catch (err) {
    console.error('[turnos/reparar-pagos] Error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Cierre de turno MYA (independiente de Fusion) ───────────

// GET: último cierre + resumen ventas del turno actual
consolaFusionRouter.get('/turnos/cierre-mya', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return
  const { empresaId } = payload
  const sb = adminSb()

  try {
    // Último cierre registrado en MYA
    const { data: ultimo } = await sb
      .from('comb_cierres_turno')
      .select('id, turno_nombre, inicio_at, cierre_at, total_ventas, total_litros, total_monto')
      .eq('empresa_id', empresaId)
      .order('cierre_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Inicio del período actual = cierre anterior o inicio arbitrario (epoch)
    const inicioPeriodo = ultimo?.cierre_at || '1970-01-01T00:00:00Z'

    // Ventas desde ese momento
    const { data: ventas } = await sb
      .from('ventas_combustible')
      .select('grade_id, volume, money, pump_id, attendant_id, end_at')
      .eq('empresa_id', empresaId)
      .gt('end_at', inicioPeriodo)
      .not('volume', 'is', null)

    const lista = ventas || []
    const totalVentas = lista.length
    const totalLitros = lista.reduce((s, v) => s + Number(v.volume || 0), 0)
    const totalMonto  = lista.reduce((s, v) => s + Number(v.money  || 0), 0)

    res.json({
      ok: true,
      ultimo_cierre: ultimo || null,
      periodo_inicio: inicioPeriodo,
      total_ventas: totalVentas,
      total_litros: totalLitros,
      total_monto: totalMonto,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST: ejecutar cierre MYA
consolaFusionRouter.post('/turnos/cierre-mya', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return
  const { empresaId } = payload
  const sb = adminSb()

  const cerradoPor = String(req.body?.cerrado_por || '').trim() || null
  const notas      = String(req.body?.notas || '').trim() || null
  const fusionPeriodId = req.body?.fusion_period_id ? Number(req.body.fusion_period_id) : null

  // Nombre del turno según hora CR
  function turnoDelDia(fecha) {
    const h = new Date(fecha).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Costa_Rica' })
    const hr = Number(h)
    if (hr >= 6 && hr < 14) return 'Mañana'
    if (hr >= 14 && hr < 22) return 'Tarde'
    return 'Noche'
  }

  try {
    const { data: ultimo } = await sb
      .from('comb_cierres_turno')
      .select('cierre_at')
      .eq('empresa_id', empresaId)
      .order('cierre_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const inicioPeriodo = ultimo?.cierre_at || '1970-01-01T00:00:00Z'
    const cierreAt = new Date().toISOString()

    const { data: ventas } = await sb
      .from('ventas_combustible')
      .select('grade_id, volume, money, pump_id, attendant_id, end_at')
      .eq('empresa_id', empresaId)
      .gt('end_at', inicioPeriodo)
      .not('volume', 'is', null)

    const lista = ventas || []

    // Resumen por grado
    const porGrado = {}
    lista.forEach(v => {
      const k = String(v.grade_id)
      if (!porGrado[k]) porGrado[k] = { grade_id: v.grade_id, litros: 0, monto: 0, ventas: 0 }
      porGrado[k].litros += Number(v.volume || 0)
      porGrado[k].monto  += Number(v.money  || 0)
      porGrado[k].ventas++
    })

    // Resumen por pistero
    const porPistero = {}
    lista.forEach(v => {
      const k = v.attendant_id || 'SIN_PISTERO'
      if (!porPistero[k]) porPistero[k] = { attendant_id: k, litros: 0, monto: 0, ventas: 0 }
      porPistero[k].litros += Number(v.volume || 0)
      porPistero[k].monto  += Number(v.money  || 0)
      porPistero[k].ventas++
    })

    // Resumen por bomba
    const porBomba = {}
    lista.forEach(v => {
      const k = String(v.pump_id)
      if (!porBomba[k]) porBomba[k] = { pump_id: v.pump_id, litros: 0, monto: 0, ventas: 0 }
      porBomba[k].litros += Number(v.volume || 0)
      porBomba[k].monto  += Number(v.money  || 0)
      porBomba[k].ventas++
    })

    const { data: cierre, error } = await sb
      .from('comb_cierres_turno')
      .insert({
        empresa_id       : empresaId,
        turno_nombre     : turnoDelDia(cierreAt),
        inicio_at        : inicioPeriodo,
        cierre_at        : cierreAt,
        cerrado_por      : cerradoPor,
        fusion_period_id : fusionPeriodId,
        total_ventas     : lista.length,
        total_litros     : lista.reduce((s, v) => s + Number(v.volume || 0), 0),
        total_monto      : lista.reduce((s, v) => s + Number(v.money  || 0), 0),
        resumen_grados   : Object.values(porGrado),
        resumen_pisteros : Object.values(porPistero),
        resumen_bombas   : Object.values(porBomba),
        notas,
      })
      .select()
      .single()

    if (error) return res.status(500).json({ ok: false, error: error.message })

    console.log(`[turnos/cierre-mya] empresa=${empresaId} cierre=${cierre.id} ventas=${lista.length} monto=${cierre.total_monto}`)
    res.json({ ok: true, cierre })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET: historial de cierres MYA
consolaFusionRouter.get('/turnos/cierres-mya', async (req, res) => {
  const payload = await requireEmpresaRead(req, res)
  if (!payload) return
  const sb = adminSb()

  const { data, error } = await sb
    .from('comb_cierres_turno')
    .select('id, turno_nombre, inicio_at, cierre_at, cerrado_por, total_ventas, total_litros, total_monto, resumen_grados, notas')
    .eq('empresa_id', payload.empresaId)
    .order('cierre_at', { ascending: false })
    .limit(20)

  if (error) return res.status(500).json({ ok: false, error: error.message })
  res.json({ ok: true, cierres: data || [] })
})
