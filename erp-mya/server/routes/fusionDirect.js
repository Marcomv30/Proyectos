import express from 'express'
import { manager } from '../services/fusionSync.js'
import { requirePermission } from '../lib/authz.js'
import { fusionDateTimeToUtcIso } from '../lib/costaRicaTime.js'

export const fusionDirectRouter = express.Router()

function fusionDateTime(date8, time6) {
  return fusionDateTimeToUtcIso(date8, time6)
}

function getInstance(empresaId, res) {
  const inst = manager.getInstance(Number(empresaId))
  if (!inst) {
    res.status(404).json({ error: `No hay instancia Fusion para empresa_id=${empresaId}` })
    return null
  }
  return inst
}

async function fetchFusionRows(inst, tabla, cant = null) {
  const limit = Number(cant ?? inst?.cfg?.cant_registros ?? 500)
  const rows = await inst.fetchFusion(tabla, limit)
  return Array.isArray(rows) ? rows : []
}

function normalizeTurnoRow(r) {
  return {
    period_id: Number(r.period_id),
    period_status: r.period_status || '',
    start_at: fusionDateTime(r.period_start_date, r.period_start_time),
    end_at: fusionDateTime(r.period_end_date, r.period_end_time),
    start_trans_id: r.period_start_trans_id ? Number(r.period_start_trans_id) : null,
    end_trans_id: r.period_end_trans_id ? Number(r.period_end_trans_id) : null,
  }
}

function normalizeVentaRow(r) {
  return {
    sale_id: Number(r.sale_id),
    pump_id: Number(r.pump_id),
    hose_id: Number(r.hose_id),
    grade_id: Number(r.grade_id),
    volume: parseFloat(r.volume) || 0,
    money: parseFloat(r.money) || 0,
    ppu: parseFloat(r.ppu) || 0,
    sale_type: Number(r.sale_type) || 1,
    start_at: fusionDateTime(r.start_date, r.start_time),
    end_at: fusionDateTime(r.end_date, r.end_time),
    preset_amount: r.preset_amount ? parseFloat(r.preset_amount) : null,
    payment_type: String(r.payment_type || 'CASH').trim(),
    payment_info: r.payment_info || null,
    attendant_id: r.attendant_id || null,
    customer_name: r.customer_name || null,
    customer_tax_id: r.customer_tax_id || null,
  }
}

function dateToFusionYmd(iso) {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

async function listTurnos(inst, { fecha, estado }) {
  if (inst.fusionPool) {
    const params = []
    let where = `period_type = 'S'`

    if (fecha) {
      params.push(String(fecha).replace(/-/g, ''))
      where += ` AND period_start_date = $${params.length}`
    }
    if (estado) {
      params.push(String(estado).toUpperCase())
      where += ` AND UPPER(period_status) = $${params.length}`
    }

    const result = await inst.fusionPool.query(`
      SELECT
        period_id,
        period_status,
        period_start_date,
        period_start_time,
        period_end_date,
        period_end_time,
        period_start_trans_id,
        period_end_trans_id
      FROM ssf_addin_shifts_data
      WHERE ${where}
      ORDER BY period_id DESC
      LIMIT 100
    `, params)

    return result.rows.map(normalizeTurnoRow)
  }

  const rows = await fetchFusionRows(inst, 'ssf_addin_shifts_data')
  let turnos = rows
    .filter((r) => String(r.period_type || '').toUpperCase() === 'S')
    .map(normalizeTurnoRow)

  if (fecha) {
    const fechaFusion = String(fecha).replace(/-/g, '')
    turnos = turnos.filter((t) => t.start_at && dateToFusionYmd(t.start_at) === fechaFusion)
  }
  if (estado) {
    const estadoKey = String(estado).toUpperCase()
    turnos = turnos.filter((t) => String(t.period_status || '').toUpperCase() === estadoKey)
  }

  return turnos.sort((a, b) => b.period_id - a.period_id).slice(0, 100)
}

async function listVentas(inst, { turnoId, fecha, pumpId }) {
  let saleIdDesde = 0
  let saleIdHasta = null
  let fechaFusion = null
  const usarUltimas = !turnoId && !fecha

  if (turnoId) {
    const turnos = await listTurnos(inst, {})
    const turno = turnos.find((t) => t.period_id === Number(turnoId))
    if (!turno) {
      const error = new Error(`Turno ${turnoId} no encontrado`)
      error.status = 404
      throw error
    }
    saleIdDesde = turno.start_trans_id || 0
    saleIdHasta = turno.end_trans_id || null
  } else {
    fechaFusion = String(fecha).replace(/-/g, '')
  }

  if (inst.fusionPool) {
    const params = []
    let ventaWhere = '1=1'

    if (turnoId && saleIdHasta != null) {
      params.push(saleIdDesde, saleIdHasta)
      ventaWhere = `s.sale_id >= $${params.length - 1} AND s.sale_id <= $${params.length}`
    } else if (turnoId) {
      params.push(saleIdDesde)
      ventaWhere = `s.sale_id >= $${params.length}`
    } else if (fecha) {
      params.push(fechaFusion)
      ventaWhere = `s.end_date = $${params.length}`
    }

    if (pumpId) {
      params.push(Number(pumpId))
      ventaWhere += ` AND s.pump_id = $${params.length}`
    }

    const result = await inst.fusionPool.query(`
      SELECT
        s.sale_id,
        s.pump_id,
        s.hose_id,
        s.grade_id,
        s.volume,
        s.money,
        s.ppu,
        s.sale_type,
        s.start_date, s.start_time,
        s.end_date, s.end_time,
        s.preset_amount,
        p.pay_payment_type AS payment_type,
        p.pay_payment_info AS payment_info,
        h.tkt_attendant_id AS attendant_id,
        h.tkt_customer_name AS customer_name,
        h.tkt_customer_tax_id AS customer_tax_id
      FROM ssf_pump_sales s
      LEFT JOIN ssf_addin_payments_data p ON p.pay_sale_id = s.sale_id
      LEFT JOIN ssf_tkt_trx_detail d ON d.tkt_spirit_sale_id = s.sale_id
      LEFT JOIN ssf_tkt_trx_header h ON h.tkt_trans_id = d.tkt_trans_id
      WHERE ${ventaWhere}
      ORDER BY s.sale_id ${usarUltimas ? 'DESC' : 'ASC'}
      ${usarUltimas ? 'LIMIT 300' : ''}
    `, params)

    return result.rows.map(normalizeVentaRow)
  }

  const salesRows = await fetchFusionRows(inst, 'ssf_pump_sales')
  const pagosRows = await fetchFusionRows(inst, 'ssf_addin_payments_data')
  const detailRows = await fetchFusionRows(inst, 'ssf_tkt_trx_detail')
  const headerRows = await fetchFusionRows(inst, 'ssf_tkt_trx_header')

  const pagosMap = new Map(
    pagosRows.map((r) => [Number(r.pay_sale_id), { payment_type: r.pay_payment_type, payment_info: r.pay_payment_info }])
  )
  const detailMap = new Map()
  detailRows.forEach((r) => {
    const saleId = Number(r.tkt_spirit_sale_id)
    if (!detailMap.has(saleId) && r.tkt_trans_id != null) detailMap.set(saleId, Number(r.tkt_trans_id))
  })
  const headerMap = new Map(
    headerRows.map((r) => [Number(r.tkt_trans_id), r])
  )

  return salesRows
    .filter((r) => {
      const saleId = Number(r.sale_id)
      if (turnoId) {
        if (saleId < saleIdDesde) return false
        if (saleIdHasta != null && saleId > saleIdHasta) return false
      } else if (fechaFusion && String(r.end_date || '') !== fechaFusion) {
        return false
      }
      if (pumpId && Number(r.pump_id) !== Number(pumpId)) return false
      return true
    })
    .map((r) => {
      const saleId = Number(r.sale_id)
      const pago = pagosMap.get(saleId) || {}
      const trxId = detailMap.get(saleId)
      const header = trxId ? headerMap.get(trxId) : null
      return normalizeVentaRow({
        ...r,
        payment_type: pago.payment_type,
        payment_info: pago.payment_info,
        attendant_id: header?.tkt_attendant_id,
        customer_name: header?.tkt_customer_name,
        customer_tax_id: header?.tkt_customer_tax_id,
      })
    })
    .sort((a, b) => usarUltimas ? b.sale_id - a.sale_id : a.sale_id - b.sale_id)
    .slice(0, usarUltimas ? 300 : undefined)
}

async function getVenta(inst, saleId) {
  if (inst.fusionPool) {
    const result = await inst.fusionPool.query(`
      SELECT
        s.sale_id, s.pump_id, s.hose_id, s.grade_id,
        s.volume, s.money, s.ppu, s.sale_type,
        s.start_date, s.start_time, s.end_date, s.end_time,
        s.initial_volume, s.final_volume, s.preset_amount,
        s.level,
        p.pay_payment_type AS payment_type,
        p.pay_payment_info AS payment_info,
        h.tkt_attendant_id AS attendant_id,
        h.tkt_customer_name AS customer_name,
        h.tkt_customer_tax_id AS customer_tax_id,
        h.tkt_net_amount AS net_amount,
        h.tkt_total_amount AS total_amount
      FROM ssf_pump_sales s
      LEFT JOIN ssf_addin_payments_data p ON p.pay_sale_id = s.sale_id
      LEFT JOIN ssf_tkt_trx_detail d ON d.tkt_spirit_sale_id = s.sale_id
      LEFT JOIN ssf_tkt_trx_header h ON h.tkt_trans_id = d.tkt_trans_id
      WHERE s.sale_id = $1
      LIMIT 1
    `, [saleId])

    if (!result.rows.length) return null
    const r = result.rows[0]
    return {
      ...normalizeVentaRow(r),
      price_level: Number(r.level) || 1,
      initial_volume: r.initial_volume ? parseFloat(r.initial_volume) : null,
      final_volume: r.final_volume ? parseFloat(r.final_volume) : null,
      net_amount: r.net_amount ? parseFloat(r.net_amount) : null,
      total_amount: r.total_amount ? parseFloat(r.total_amount) : null,
    }
  }

  const salesRows = await fetchFusionRows(inst, 'ssf_pump_sales')
  const pagosRows = await fetchFusionRows(inst, 'ssf_addin_payments_data')
  const detailRows = await fetchFusionRows(inst, 'ssf_tkt_trx_detail')
  const headerRows = await fetchFusionRows(inst, 'ssf_tkt_trx_header')

  const sale = salesRows.find((r) => Number(r.sale_id) === Number(saleId))
  if (!sale) return null

  const pago = pagosRows.find((r) => Number(r.pay_sale_id) === Number(saleId))
  const detail = detailRows.find((r) => Number(r.tkt_spirit_sale_id) === Number(saleId))
  const header = detail ? headerRows.find((r) => Number(r.tkt_trans_id) === Number(detail.tkt_trans_id)) : null

  return {
    ...normalizeVentaRow({
      ...sale,
      payment_type: pago?.pay_payment_type,
      payment_info: pago?.pay_payment_info,
      attendant_id: header?.tkt_attendant_id,
      customer_name: header?.tkt_customer_name,
      customer_tax_id: header?.tkt_customer_tax_id,
    }),
    price_level: Number(sale.level) || 1,
    initial_volume: sale.initial_volume ? parseFloat(sale.initial_volume) : null,
    final_volume: sale.final_volume ? parseFloat(sale.final_volume) : null,
    net_amount: header?.tkt_net_amount ? parseFloat(header.tkt_net_amount) : null,
    total_amount: header?.tkt_total_amount ? parseFloat(header.tkt_total_amount) : null,
  }
}

async function listTanques(inst) {
  if (inst.fusionPool) {
    const result = await inst.fusionPool.query(`
      SELECT
        tank_id, prod_vol, prod_height, water_vol, water_height,
        prod_temp, tc_vol, probe_status,
        date_last_read, time_last_read
      FROM ssf_tank_actual_info
      ORDER BY tank_id ASC
    `)
    return result.rows
  }

  return fetchFusionRows(inst, 'ssf_tank_actual_info')
}

fusionDirectRouter.get('/turnos', async (req, res) => {
  const { empresa_id, fecha, estado } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  const inst = getInstance(empresa_id, res)
  if (!inst) return

  try {
    const turnos = await listTurnos(inst, { fecha, estado })
    res.json(turnos)
  } catch (err) {
    console.error('[fusionDirect] Error turnos:', err.message)
    res.status(err.status || 500).json({ error: err.message })
  }
})

fusionDirectRouter.get('/ventas', async (req, res) => {
  const { empresa_id, turno_id, fecha, pump_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  const inst = getInstance(empresa_id, res)
  if (!inst) return

  try {
    const ventas = await listVentas(inst, {
      turnoId: turno_id ? Number(turno_id) : null,
      fecha: fecha ? String(fecha) : null,
      pumpId: pump_id ? Number(pump_id) : null,
    })
    res.json(ventas)
  } catch (err) {
    console.error('[fusionDirect] Error ventas:', err.message)
    res.status(err.status || 500).json({ error: err.message })
  }
})

fusionDirectRouter.get('/venta/:sale_id', async (req, res) => {
  const { empresa_id } = req.query
  const saleId = Number(req.params.sale_id)
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
  if (!saleId) return res.status(400).json({ error: 'sale_id invalido' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  const inst = getInstance(empresa_id, res)
  if (!inst) return

  try {
    const venta = await getVenta(inst, saleId)
    if (!venta) return res.status(404).json({ error: `Venta ${saleId} no encontrada` })
    res.json(venta)
  } catch (err) {
    console.error('[fusionDirect] Error venta:', err.message)
    res.status(500).json({ error: err.message })
  }
})

fusionDirectRouter.get('/tanques', async (req, res) => {
  const { empresa_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  const inst = getInstance(empresa_id, res)
  if (!inst) return

  try {
    const rows = await listTanques(inst)
    const tanques = rows.map((r) => ({
      tank_id: Number(r.tank_id),
      prod_vol: r.prod_vol ? parseFloat(r.prod_vol) : null,
      prod_height: r.prod_height ? parseFloat(r.prod_height) : null,
      water_vol: r.water_vol ? parseFloat(r.water_vol) : null,
      water_height: r.water_height ? parseFloat(r.water_height) : null,
      prod_temp: r.prod_temp ? parseFloat(r.prod_temp) : null,
      tc_vol: r.tc_vol ? parseFloat(r.tc_vol) : null,
      probe_status: r.probe_status || null,
      leido_at: fusionDateTime(r.date_last_read, r.time_last_read),
    }))
    res.json(tanques)
  } catch (err) {
    console.error('[fusionDirect] Error tanques:', err.message)
    res.status(500).json({ error: err.message })
  }
})

fusionDirectRouter.get('/grados', async (req, res) => {
  const { empresa_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  const inst = getInstance(empresa_id, res)
  if (!inst) return

  try {
    if (!inst.fusionPool) {
      return res.status(503).json({ error: 'Tunnel Fusion PG no disponible' })
    }
    const result = await inst.fusionPool.query(`
      SELECT grade_id, level AS grade_level, ppu AS grade_price,
             application_date, last_modified_date
      FROM ssf_grade_prices
      WHERE level = 1
      ORDER BY grade_id ASC
    `)
    const grados = result.rows.map((r) => ({
      grade_id: Number(r.grade_id),
      grade_name: null,
      grade_price: r.grade_price != null ? parseFloat(r.grade_price) : null,
      grade_level: r.grade_level != null ? Number(r.grade_level) : null,
      application_date: r.application_date || null,
    }))
    res.json(grados)
  } catch (err) {
    console.error('[fusionDirect] Error grados:', err.message)
    res.status(500).json({ error: err.message })
  }
})
