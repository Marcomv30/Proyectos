// ============================================================
// MYA ERP — POS (Punto de Venta)
// server/routes/pos.js
// ============================================================

import express from 'express'
import { adminSb, requireSuperuser } from '../lib/authz.js'
import { emitirDocumentoCore, consultarYActualizarEstadoFeDoc } from './facturacionEmitir.js'
import { sendMail } from '../services/mailer.js'
import { htmlToPdf } from '../services/pdfGenerator.js'

// Mapa tipo_pago POS → código medio_pago MH
const MEDIO_PAGO_MAP = { efectivo: '01', tarjeta: '02', transferencia: '04', sinpe: '04' }

export const posRouter = express.Router()

// ── Auth básica (cualquier usuario autenticado) ───────────────
async function requirePosAuth(req, res) {
  let token = (req.headers.authorization || '').replace('Bearer ', '').trim()

  // Si no hay token en header, intentar desde query param (fallback temporal)
  if (!token && req.query.token) {
    token = req.query.token
  }

  if (!token) { res.status(401).json({ ok: false, error: 'No autenticado' }); return null }
  const sb = adminSb()
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) { res.status(401).json({ ok: false, error: 'Token inválido' }); return null }
  return user
}

// ════════════════════════════════════════════════════════════
// PRODUCTOS
// ════════════════════════════════════════════════════════════

const SEL_PRODUCTOS = 'id, codigo, descripcion, precio_venta, unidad_medida, tarifa_iva, stock_actual, codigo_cabys, exento, descuento_autorizado_pct, impuesto_venta_incluido'

// Inyecta stock de bodega y precio de escala 1 en un array de productos
async function enriquecerProductos(sb, empresaId, bodegaId, productos) {
  if (!productos.length) return productos
  const ids = productos.map((p) => p.id)

  // Stock por bodega y precio escala 1 en paralelo
  const [stocksRes, escalasRes] = await Promise.all([
    bodegaId
      ? sb.from('inv_stock_bodega').select('producto_id, stock_actual')
          .eq('empresa_id', empresaId).eq('bodega_id', bodegaId).in('producto_id', ids)
      : Promise.resolve({ data: [] }),
    sb.from('inv_producto_escalas').select('producto_id, precio_venta')
      .eq('escala', 1).eq('activo', true).in('producto_id', ids),
  ])

  const stockMap  = new Map((stocksRes.data  || []).map((s) => [s.producto_id, Number(s.stock_actual)]))
  const escalaMap = new Map((escalasRes.data || []).map((e) => [e.producto_id, Number(e.precio_venta)]))

  return productos.map((p) => ({
    ...p,
    // Precio: escala 1 si existe, sino precio_venta base
    precio_venta: escalaMap.has(p.id) ? escalaMap.get(p.id) : Number(p.precio_venta),
    // Stock: de la bodega específica (null = sin registro), o global si no hay bodega
    stock_actual: bodegaId
      ? (stockMap.has(p.id) ? stockMap.get(p.id) : null)
      : Number(p.stock_actual ?? 0),
    descuento_autorizado_pct: Number(p.descuento_autorizado_pct ?? 0),
  }))
}

posRouter.get('/productos/buscar', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  const q = String(req.query.q || '').trim()
  const bodegaId = Number(req.query.bodega_id || 0) || null
  if (!empresaId || !q) return res.json({ ok: true, productos: [] })

  const sb = adminSb()

  // Intenta código exacto primero
  const { data: exactoRaw } = await sb
    .from('inv_productos')
    .select(SEL_PRODUCTOS)
    .eq('empresa_id', empresaId)
    .or('activo.is.null,activo.eq.true')
    .or(`codigo.eq.${q},codigo_barras.eq.${q}`)
    .limit(1)

  if (exactoRaw?.length) {
    const exacto = await enriquecerProductos(sb, empresaId, bodegaId, exactoRaw)
    return res.json({ ok: true, productos: exacto, exacto: true })
  }

  const { data, error } = await sb
    .from('inv_productos')
    .select(SEL_PRODUCTOS)
    .eq('empresa_id', empresaId)
    .or(`activo.is.null,activo.eq.true`)
    .or(`descripcion.ilike.%${q}%,codigo.ilike.%${q}%`)
    .order('descripcion')
    .limit(12)

  if (error) return res.json({ ok: false, error: error.message })
  const productos = await enriquecerProductos(sb, empresaId, bodegaId, data || [])
  res.json({ ok: true, productos })
})

posRouter.get('/productos/recientes', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  const bodegaId = Number(req.query.bodega_id || 0) || null
  if (!empresaId) return res.json({ ok: true, productos: [] })

  const sb = adminSb()

  // Paso 1: últimas ventas de esta empresa
  const { data: ventas } = await sb
    .from('pos_ventas')
    .select('id')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(30)

  let ids = []

  if (ventas?.length) {
    const ventaIds = ventas.map((v) => v.id)

    // Paso 2: líneas de esas ventas (sin join)
    const { data: lineas } = await sb
      .from('pos_venta_lineas')
      .select('producto_id')
      .in('venta_id', ventaIds)
      .not('producto_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(80)

    // IDs únicos respetando orden de reciente
    const seen = new Set()
    for (const l of (lineas || [])) {
      if (!seen.has(l.producto_id)) {
        seen.add(l.producto_id)
        ids.push(l.producto_id)
        if (ids.length >= 12) break
      }
    }
  }

  // Fallback: catálogo ordenado si no hay historial
  if (!ids.length) {
    const { data: top } = await sb
      .from('inv_productos')
      .select(SEL_PRODUCTOS)
      .eq('empresa_id', empresaId)
      .or('activo.is.null,activo.eq.true')
      .order('descripcion')
      .limit(12)
    const productos = await enriquecerProductos(sb, empresaId, bodegaId, top || [])
    return res.json({ ok: true, productos })
  }

  // Traer precios actuales desde inv_productos
  const { data: raw } = await sb
    .from('inv_productos')
    .select(SEL_PRODUCTOS)
    .in('id', ids)

  const prodMap = new Map((raw || []).map((p) => [p.id, p]))
  const ordenados = ids.map((id) => prodMap.get(id)).filter(Boolean)
  const recientes = await enriquecerProductos(sb, empresaId, bodegaId, ordenados)

  res.json({ ok: true, productos: recientes })
})

// ════════════════════════════════════════════════════════════
// CLIENTES
// ════════════════════════════════════════════════════════════

posRouter.get('/clientes/buscar', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  const q = String(req.query.q || '').trim()
  if (!empresaId || !q) return res.json({ ok: true, clientes: [] })

  const sb = adminSb()
  const { data, error } = await sb
    .from('terceros')
    .select('id, nombre, identificacion, email, exonerado, exoneracion_numero, exoneracion_porcentaje')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .or(`nombre.ilike.%${q}%,identificacion.ilike.%${q}%`)
    .order('nombre')
    .limit(8)

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, clientes: data || [] })
})

// ════════════════════════════════════════════════════════════
// SETUP — Sucursales
// ════════════════════════════════════════════════════════════

posRouter.get('/sucursales', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  if (!empresaId) return res.json({ ok: true, sucursales: [] })

  const sb = adminSb()
  const { data, error } = await sb
    .from('pos_sucursales')
    .select('id, nombre, bodega_id, activo, inv_bodegas(nombre)')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('nombre')

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, sucursales: data || [] })
})

posRouter.post('/sucursales', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const { empresa_id, nombre, bodega_id } = req.body || {}
  if (!empresa_id || !nombre) return res.status(400).json({ ok: false, error: 'empresa_id y nombre requeridos' })

  const sb = adminSb()
  const { data, error } = await sb
    .from('pos_sucursales')
    .insert({ empresa_id: Number(empresa_id), nombre: nombre.trim(), bodega_id: bodega_id || null })
    .select()
    .single()

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, sucursal: data })
})

posRouter.patch('/sucursales/:id', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const id = Number(req.params.id)
  const { nombre, bodega_id, activo } = req.body || {}

  const sb = adminSb()
  const updates = {}
  if (nombre !== undefined) updates.nombre = nombre.trim()
  if (bodega_id !== undefined) updates.bodega_id = bodega_id || null
  if (activo !== undefined) updates.activo = activo

  const { data, error } = await sb
    .from('pos_sucursales')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, sucursal: data })
})

// Carga inicial de stock en una bodega:
// Para cada producto de la empresa que NO tenga registro en inv_stock_bodega
// para esa bodega, inserta stock_actual = inv_productos.stock_actual.
// Los productos que ya tienen registro NO se tocan.
posRouter.post('/bodegas/:bodega_id/carga-inicial', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const bodegaId = Number(req.params.bodega_id)
  const empresaId = Number(req.body?.empresa_id || 0)
  if (!bodegaId || !empresaId) return res.status(400).json({ ok: false, error: 'bodega_id y empresa_id requeridos' })

  const sb = adminSb()

  // Verificar que la bodega pertenece a la empresa
  const { data: bodega } = await sb
    .from('inv_bodegas')
    .select('id, nombre')
    .eq('id', bodegaId)
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (!bodega) return res.json({ ok: false, error: 'Bodega no encontrada' })

  // Traer todos los productos activos con stock > 0
  const { data: productos, error: eProd } = await sb
    .from('inv_productos')
    .select('id, stock_actual')
    .eq('empresa_id', empresaId)
    .or('activo.is.null,activo.eq.true')
    .gt('stock_actual', 0)

  if (eProd) return res.json({ ok: false, error: eProd.message })
  if (!productos?.length) return res.json({ ok: true, insertados: 0, omitidos: 0, mensaje: 'No hay productos con stock' })

  // Traer los que ya tienen registro en esta bodega
  const { data: existentes } = await sb
    .from('inv_stock_bodega')
    .select('producto_id')
    .eq('empresa_id', empresaId)
    .eq('bodega_id', bodegaId)

  const yaExisten = new Set((existentes || []).map((e) => e.producto_id))

  const nuevos = productos
    .filter((p) => !yaExisten.has(p.id))
    .map((p) => ({
      empresa_id: empresaId,
      producto_id: p.id,
      bodega_id: bodegaId,
      stock_actual: p.stock_actual,
      updated_at: new Date().toISOString(),
    }))

  if (!nuevos.length) {
    return res.json({ ok: true, insertados: 0, omitidos: productos.length, mensaje: 'Todos los productos ya tienen registro en esta bodega' })
  }

  // Insertar en lotes de 500 para no exceder límites de Supabase
  const LOTE = 500
  let insertados = 0
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const { error } = await sb.from('inv_stock_bodega').insert(nuevos.slice(i, i + LOTE))
    if (error) return res.json({ ok: false, error: error.message, insertados })
    insertados += nuevos.slice(i, i + LOTE).length
  }

  res.json({
    ok: true,
    insertados,
    omitidos: yaExisten.size,
    mensaje: `${insertados} productos cargados en "${bodega.nombre}". ${yaExisten.size} ya tenían registro y no se modificaron.`,
  })
})

// ════════════════════════════════════════════════════════════
// SETUP — Cajas
// ════════════════════════════════════════════════════════════

posRouter.get('/cajas', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  const sucursalId = Number(req.query.sucursal_id || 0)
  if (!empresaId) return res.json({ ok: true, cajas: [] })

  const sb = adminSb()
  let query = sb
    .from('pos_cajas')
    .select('id, nombre, descripcion, sucursal_id, terminal_id, fe_terminales(id, nombre, sucursal, punto_venta)')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('nombre')

  if (sucursalId) query = query.eq('sucursal_id', sucursalId)

  const { data, error } = await query
  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, cajas: data || [] })
})

posRouter.post('/cajas', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const { empresa_id, nombre, descripcion, sucursal_id, terminal_id } = req.body || {}
  if (!empresa_id || !nombre || !sucursal_id) {
    return res.status(400).json({ ok: false, error: 'empresa_id, nombre y sucursal_id requeridos' })
  }

  const sb = adminSb()
  const { data, error } = await sb
    .from('pos_cajas')
    .insert({
      empresa_id: Number(empresa_id),
      nombre: nombre.trim(),
      descripcion: descripcion || null,
      sucursal_id: Number(sucursal_id),
      terminal_id: terminal_id ? Number(terminal_id) : null,
    })
    .select()
    .single()

  if (error) return res.json({ ok: false, error: error.message })

  // Inicializar consecutivos para esta caja
  await sb.from('pos_consecutivos').insert([
    { caja_id: data.id, tipo_doc: '001', ultimo_num: 0 },  // Factura Electrónica
    { caja_id: data.id, tipo_doc: '004', ultimo_num: 0 },  // Tiquete Electrónico
  ])

  res.json({ ok: true, caja: data })
})

posRouter.patch('/cajas/:id', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const id = Number(req.params.id)
  const { nombre, descripcion, terminal_id, activo } = req.body || {}

  const sb = adminSb()
  const updates = {}
  if (nombre !== undefined) updates.nombre = nombre.trim()
  if (descripcion !== undefined) updates.descripcion = descripcion
  if (terminal_id !== undefined) updates.terminal_id = terminal_id || null
  if (activo !== undefined) updates.activo = activo

  const { data, error } = await sb
    .from('pos_cajas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, caja: data })
})

// ════════════════════════════════════════════════════════════
// SETUP — Terminales FE y Bodegas (para selección en setup)
// ════════════════════════════════════════════════════════════

posRouter.get('/terminales-fe', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  if (!empresaId) return res.json({ ok: true, terminales: [] })

  const sb = adminSb()
  const { data, error } = await sb
    .from('fe_terminales')
    .select('id, nombre, sucursal, punto_venta, es_defecto, activo')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('sucursal')
    .order('punto_venta')

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, terminales: data || [] })
})

posRouter.get('/bodegas', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  if (!empresaId) return res.json({ ok: true, bodegas: [] })

  const sb = adminSb()
  const { data, error } = await sb
    .from('inv_bodegas')
    .select('id, nombre, es_principal, activo')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('es_principal', { ascending: false })
    .order('nombre')

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, bodegas: data || [] })
})

// ════════════════════════════════════════════════════════════
// CONFIGURACIÓN POS (solo SU)
// ════════════════════════════════════════════════════════════

posRouter.get('/config', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  if (!empresaId) return res.json({ ok: false, error: 'empresa_id requerido' })

  const sb = adminSb()
  const { data } = await sb
    .from('pos_config')
    .select('*')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  // Retornar defaults si no existe
  res.json({
    ok: true,
    config: data || {
      empresa_id: empresaId,
      bloquear_sin_stock: false,
      permitir_descuentos: true,
      max_descuento_pct: 100,
    }
  })
})

posRouter.put('/config', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const { empresa_id, bloquear_sin_stock, permitir_descuentos, max_descuento_pct } = req.body || {}
  if (!empresa_id) return res.status(400).json({ ok: false, error: 'empresa_id requerido' })

  const sb = adminSb()
  const { data, error } = await sb
    .from('pos_config')
    .upsert({
      empresa_id: Number(empresa_id),
      bloquear_sin_stock: !!bloquear_sin_stock,
      permitir_descuentos: permitir_descuentos !== false,
      max_descuento_pct: Number(max_descuento_pct ?? 100),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, config: data })
})

// ════════════════════════════════════════════════════════════
// SESIONES (turnos de caja)
// ════════════════════════════════════════════════════════════

// Sesión activa para una caja
posRouter.get('/sesion/activa', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const cajaId = Number(req.query.caja_id || 0)
  if (!cajaId) return res.json({ ok: true, sesion: null })

  const sb = adminSb()
  const { data } = await sb
    .from('pos_sesiones')
    .select('id, apertura_at, monto_inicial, cajero_nombre, estado')
    .eq('caja_id', cajaId)
    .eq('estado', 'abierta')
    .order('apertura_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  res.json({ ok: true, sesion: data || null })
})

// Abrir turno
posRouter.post('/sesion/abrir', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { empresa_id, caja_id, cajero_nombre, monto_inicial, notas } = req.body || {}
  if (!empresa_id || !caja_id) return res.status(400).json({ ok: false, error: 'empresa_id y caja_id requeridos' })

  const sb = adminSb()

  // Verificar que no haya sesión abierta
  const { data: existing } = await sb
    .from('pos_sesiones')
    .select('id')
    .eq('caja_id', Number(caja_id))
    .eq('estado', 'abierta')
    .maybeSingle()

  if (existing) return res.json({ ok: false, error: 'Ya hay un turno abierto para esta caja' })

  const { data, error } = await sb
    .from('pos_sesiones')
    .insert({
      empresa_id: Number(empresa_id),
      caja_id: Number(caja_id),
      cajero_id: user.id,
      cajero_nombre: cajero_nombre || '',
      monto_inicial: Number(monto_inicial || 0),
      notas: notas || null,
      estado: 'abierta',
    })
    .select()
    .single()

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, sesion: data })
})

// Resumen de ventas de una sesión
posRouter.get('/sesion/:id/resumen', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const sesionId = Number(req.params.id)
  const sb = adminSb()

  const [sesionRes, ventasRes] = await Promise.all([
    sb.from('pos_sesiones').select('monto_inicial, apertura_at, cajero_nombre').eq('id', sesionId).maybeSingle(),
    sb.from('pos_ventas').select('tipo_pago, total, cambio').eq('sesion_id', sesionId).eq('anulada', false),
  ])

  const monto_inicial = Number(sesionRes.data?.monto_inicial || 0)
  const resumen = {
    monto_inicial,
    apertura_at: sesionRes.data?.apertura_at,
    cajero_nombre: sesionRes.data?.cajero_nombre,
    num_ventas: 0,
    total_ventas: 0,
    total_efectivo: 0,
    total_sinpe: 0,
    total_tarjeta: 0,
    total_transferencia: 0,
    total_cambio: 0,
  }

  for (const v of (ventasRes.data || [])) {
    resumen.num_ventas++
    resumen.total_ventas += Number(v.total)
    resumen.total_cambio += Number(v.cambio || 0)
    if (v.tipo_pago === 'efectivo')       resumen.total_efectivo      += Number(v.total)
    else if (v.tipo_pago === 'sinpe')     resumen.total_sinpe         += Number(v.total)
    else if (v.tipo_pago === 'tarjeta')   resumen.total_tarjeta       += Number(v.total)
    else if (v.tipo_pago === 'transferencia') resumen.total_transferencia += Number(v.total)
  }

  // Efectivo esperado en gaveta
  resumen.efectivo_esperado = monto_inicial + resumen.total_efectivo - resumen.total_cambio

  res.json({ ok: true, resumen })
})

// PDF elaborado de cierre de turno
posRouter.get('/sesion/:id/pdf', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const sesionId = Number(req.params.id)
  const sucursalMh = req.query.sucursal_mh || null
  const puntoVentaMh = req.query.punto_venta_mh || null
  const sb = adminSb()
  const [sesionRes, ventasRes] = await Promise.all([
    sb.from('pos_sesiones')
      .select('id, monto_inicial, apertura_at, cierre_at, cajero_nombre, notas, empresa_id, caja_id')
      .eq('id', sesionId).maybeSingle(),
    sb.from('pos_ventas')
      .select('tipo_pago, total, cambio, tipo_documento')
      .eq('sesion_id', sesionId).eq('anulada', false),
  ])

  const ses = sesionRes.data
  if (!ses) return res.status(404).json({ ok: false, error: 'Sesión no encontrada' })

  // cfg por empresa
  const { data: cfg } = await sb.from('fe_config_empresa')
    .select('nombre_emisor, nombre_comercial, numero_identificacion, telefono_emisor, logo_url, otras_senas')
    .eq('empresa_id', ses.empresa_id).maybeSingle()

  // info caja
  const cajaRes = ses.caja_id
    ? await sb.from('pos_cajas').select('nombre').eq('id', ses.caja_id).maybeSingle()
    : { data: null }
  const sucRes = { data: null }

  const ventas = ventasRes.data || []
  const num_ventas = ventas.length
  const total_ventas   = ventas.reduce((s, v) => s + Number(v.total), 0)
  const total_efectivo = ventas.filter(v => v.tipo_pago === 'efectivo').reduce((s, v) => s + Number(v.total), 0)
  const total_sinpe    = ventas.filter(v => v.tipo_pago === 'sinpe').reduce((s, v) => s + Number(v.total), 0)
  const total_tarjeta  = ventas.filter(v => v.tipo_pago === 'tarjeta').reduce((s, v) => s + Number(v.total), 0)
  const total_transf   = ventas.filter(v => v.tipo_pago === 'transferencia').reduce((s, v) => s + Number(v.total), 0)
  const total_cambio   = ventas.reduce((s, v) => s + Number(v.cambio || 0), 0)
  const monto_inicial  = Number(ses.monto_inicial || 0)
  const efectivo_esp   = monto_inicial + total_efectivo - total_cambio
  const num_tiquetes   = ventas.filter(v => v.tipo_documento === 'tiquete').length
  const num_facturas   = ventas.filter(v => v.tipo_documento === 'factura').length

  const TZ = 'America/Costa_Rica'
  const fmtN = (n) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtCRC = (n) => '₡\u2009' + fmtN(n)
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-CR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '—'
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('es-CR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const durMs = ses.cierre_at ? new Date(ses.cierre_at) - new Date(ses.apertura_at) : null
  const durStr = durMs ? `${Math.floor(durMs / 3_600_000)}h ${Math.floor((durMs % 3_600_000) / 60_000)}m` : '—'
  const generadoEn = new Date().toLocaleString('es-CR', { timeZone: TZ })
  // Número de control: CIERRE-YYYYMMDD-{sesionId padded 6}
  const ahora = new Date()
  const yyyymmdd = ahora.toLocaleDateString('es-CR', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('')
  const numControl = `CIERRE-${yyyymmdd}-${String(ses.id).padStart(6, '0')}`

  const logoHtml = cfg?.logo_url
    ? `<img src="${cfg.logo_url}" alt="logo" style="width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0">`
    : `<div style="width:40px;height:40px;border-radius:6px;background:linear-gradient(135deg,#16a34a,#22c55e);display:flex;align-items:center;justify-content:center;flex-shrink:0"><span style="color:#fff;font-size:18px;font-weight:900">₡</span></div>`

  const cajaNombre = cajaRes.data?.nombre ?? `Caja ${ses.caja_id ?? '—'}`
  const terminalLabel = sucursalMh && puntoVentaMh
    ? `Terminal ${sucursalMh}-${puntoVentaMh} · ${cajaNombre}`
    : cajaNombre

  const pagoRows = [
    { label: 'Efectivo',      val: total_efectivo, color: '#16a34a' },
    { label: 'SINPE',         val: total_sinpe,    color: '#7c3aed' },
    { label: 'Tarjeta',       val: total_tarjeta,  color: '#0369a1' },
    { label: 'Transferencia', val: total_transf,   color: '#b45309' },
  ].filter(r => r.val > 0).map(r => {
    const pct = total_ventas > 0 ? ((r.val / total_ventas) * 100).toFixed(1) : '0.0'
    return `<tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:7px 12px;font-weight:600;color:#1e293b;font-size:12px">${r.label}</td>
      <td style="padding:7px 12px;text-align:right;font-family:monospace;font-weight:700;font-size:13px;color:${r.color}">${fmtCRC(r.val)}</td>
      <td style="padding:7px 12px;text-align:right;font-family:monospace;color:#64748b;font-size:12px">${pct}%</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cierre de Turno POS — ${fmtDate(ses.cierre_at || ses.apertura_at)}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:#334155; background:#fff; }
  table { border-collapse:collapse; width:100%; }
  td, th { vertical-align:middle; }
  @page { size:A4; margin:12mm 14mm 22mm 14mm; }
  @media print { body { background:#fff; } }
  .pie-pagina { position:fixed; bottom:0; left:0; right:0; border-top:1px solid #e2e8f0; padding:5px 16px; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; background:#fff; }
</style>
</head>
<body>
<div style="max-width:720px;margin:0 auto;padding:16px 16px">

  <!-- Encabezado compacto -->
  <div style="background:#1e3a5f;border-radius:10px;padding:14px 18px;margin-bottom:12px;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:12px">
    <div style="display:flex;gap:10px;align-items:center">
      ${logoHtml}
      <div>
        <div style="font-size:14px;font-weight:700;line-height:1.2">${cfg?.nombre_emisor ?? 'Empresa'}</div>
        ${cfg?.nombre_comercial ? `<div style="font-size:10px;opacity:.7;margin-top:1px">${cfg.nombre_comercial}</div>` : ''}
        <div style="font-size:10px;opacity:.55;margin-top:2px;font-family:monospace">${cfg?.numero_identificacion ? 'Cédula: ' + cfg.numero_identificacion : ''}${cfg?.telefono_emisor ? ' · Tel: ' + cfg.telefono_emisor : ''}</div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:9px;opacity:.6;text-transform:uppercase;letter-spacing:1px">Cierre de Turno</div>
      <div style="font-size:20px;font-weight:900;color:#fcd34d;letter-spacing:-1px;line-height:1.1">POS</div>
      <div style="font-size:9px;opacity:.6;margin-top:2px">${terminalLabel}</div>
      <div style="font-size:11px;opacity:.7;margin-top:4px;font-family:monospace;letter-spacing:.5px;font-weight:600">${numControl}</div>
    </div>
  </div>

  <!-- Período + KPIs en misma fila -->
  <div style="display:grid;grid-template-columns:1.6fr 1fr 1fr 1.4fr;gap:8px;margin-bottom:10px">
    <!-- Apertura -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px">
      <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Período</div>
      <div style="display:flex;gap:8px;align-items:flex-start">
        <div>
          <div style="font-size:9px;color:#94a3b8;margin-bottom:1px">Apertura</div>
          <div style="font-weight:700;color:#1e293b;font-size:12px">${fmtTime(ses.apertura_at)}</div>
          <div style="font-size:10px;color:#64748b">${fmtDate(ses.apertura_at)}</div>
        </div>
        <div style="margin-left:8px">
          <div style="font-size:9px;color:#94a3b8;margin-bottom:1px">Cierre</div>
          <div style="font-weight:700;color:#1e293b;font-size:12px">${fmtTime(ses.cierre_at)}</div>
          <div style="font-size:10px;color:#64748b">${durStr ? 'Duración: ' + durStr : '—'}</div>
        </div>
      </div>
      <div style="font-size:10px;color:#64748b;margin-top:4px">Cajero: <b>${ses.cajero_nombre ?? '—'}</b></div>
    </div>
    <!-- Transacciones -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;text-align:center">
      <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Transacciones</div>
      <div style="font-size:28px;font-weight:900;color:#1e293b;font-family:monospace;line-height:1">${num_ventas}</div>
      <div style="font-size:9px;color:#94a3b8;margin-top:3px">${num_tiquetes ? num_tiquetes + ' tiq.' : ''}${num_tiquetes && num_facturas ? ' · ' : ''}${num_facturas ? num_facturas + ' fact.' : ''}</div>
    </div>
    <!-- Monto inicial -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;text-align:center">
      <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Monto inicial</div>
      <div style="font-size:16px;font-weight:900;color:#1e293b;font-family:monospace;line-height:1">${fmtCRC(monto_inicial)}</div>
    </div>
    <!-- Total ventas -->
    <div style="background:#1e3a5f;border-radius:8px;padding:10px 12px;text-align:center;display:flex;flex-direction:column;justify-content:center">
      <div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Total ventas</div>
      <div style="font-size:22px;font-weight:900;color:#fcd34d;font-family:monospace;line-height:1">${fmtCRC(total_ventas)}</div>
    </div>
  </div>

  <!-- Desglose + Cuadre en dos columnas -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">

    <!-- Desglose por forma de pago -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:8px 12px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b">Desglose por forma de pago</div>
      </div>
      <table>
        <thead>
          <tr style="background:#f1f5f9;border-bottom:1.5px solid #e2e8f0">
            <th style="padding:6px 12px;text-align:left;font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase">Forma de pago</th>
            <th style="padding:6px 12px;text-align:right;font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase">Monto</th>
            <th style="padding:6px 12px;text-align:right;font-size:9px;color:#64748b;font-weight:700">%</th>
          </tr>
        </thead>
        <tbody>${pagoRows}</tbody>
        <tfoot>
          <tr style="background:#f8fafc;border-top:1.5px solid #cbd5e1">
            <td style="padding:7px 12px;font-weight:700;color:#1e293b;font-size:12px">TOTAL</td>
            <td style="padding:7px 12px;text-align:right;font-family:monospace;font-weight:900;font-size:13px;color:#1e293b">${fmtCRC(total_ventas)}</td>
            <td style="padding:7px 12px;text-align:right;font-family:monospace;color:#64748b;font-size:11px">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Cuadre de efectivo -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:8px 12px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b">Cuadre de efectivo</div>
      </div>
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:#64748b">Monto inicial gaveta</span><span style="font-family:monospace;font-weight:600">${fmtCRC(monto_inicial)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:#64748b">+ Ventas en efectivo</span><span style="font-family:monospace;font-weight:600;color:#16a34a">+${fmtCRC(total_efectivo)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:#64748b">− Cambios entregados</span><span style="font-family:monospace;font-weight:600;color:#dc2626">−${fmtCRC(total_cambio)}</span></div>
        <div style="border-top:1px solid #e2e8f0;padding-top:6px;margin-top:2px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;color:#1e293b;font-size:11px">Esperado en gaveta</span>
          <span style="font-family:monospace;font-weight:900;font-size:14px;color:#1e293b">${fmtCRC(efectivo_esp)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:#f1f5f9;border-radius:6px;padding:7px 10px;margin-top:2px">
          <span style="font-weight:600;color:#64748b;font-size:11px">Efectivo contado</span>
          <span style="font-family:monospace;font-weight:700;font-size:13px;color:#0369a1">_______________</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:#f1f5f9;border-radius:6px;padding:7px 10px">
          <span style="font-weight:600;color:#64748b;font-size:11px">Diferencia (±)</span>
          <span style="font-family:monospace;font-weight:700;font-size:13px;color:#64748b">_______________</span>
        </div>
      </div>
    </div>
  </div>

  ${ses.notas ? `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:10px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:4px">Notas</div><div style="font-size:11px;color:#334155">${ses.notas}</div></div>` : ''}

  <!-- Firmas -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:28px;margin-bottom:12px">
    ${['Cajero', 'Administración'].map(rol => `
      <div style="text-align:center">
        <div style="height:32px"></div>
        <div style="border-top:1px solid #94a3b8;padding-top:5px;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">${rol}</div>
      </div>`).join('')}
  </div>

  <!-- Pie fijo al fondo -->
  <div class="pie-pagina">
    <span>Sistema MYA — Punto de Venta</span>
    <span style="font-family:monospace">${numControl}</span>
    <span>Generado: ${generadoEn}</span>
  </div>

</div>
</body>
</html>`

  try {
    const pdfBuffer = await htmlToPdf(html)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="cierre_turno_${ses.id}.pdf"`)
    res.send(pdfBuffer)
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Cerrar turno
posRouter.post('/sesion/cerrar', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { sesion_id, efectivo_contado, notas } = req.body || {}
  if (!sesion_id) return res.status(400).json({ ok: false, error: 'sesion_id requerido' })

  const sb = adminSb()

  // Calcular totales reales al momento del cierre
  const { data: ventas } = await sb
    .from('pos_ventas')
    .select('tipo_pago, total, cambio')
    .eq('sesion_id', Number(sesion_id))
    .eq('anulada', false)

  const totales = { total_ventas: 0, total_efectivo: 0, total_sinpe: 0, total_tarjeta: 0, total_transferencia: 0 }
  for (const v of (ventas || [])) {
    totales.total_ventas += Number(v.total)
    if (v.tipo_pago === 'efectivo')           totales.total_efectivo      += Number(v.total)
    else if (v.tipo_pago === 'sinpe')         totales.total_sinpe         += Number(v.total)
    else if (v.tipo_pago === 'tarjeta')       totales.total_tarjeta       += Number(v.total)
    else if (v.tipo_pago === 'transferencia') totales.total_transferencia += Number(v.total)
  }

  const { data, error } = await sb
    .from('pos_sesiones')
    .update({
      estado: 'cerrada',
      cierre_at: new Date().toISOString(),
      notas: notas || null,
      ...totales,
    })
    .eq('id', Number(sesion_id))
    .eq('estado', 'abierta')
    .select()
    .single()

  if (error) return res.json({ ok: false, error: error.message })
  if (!data) return res.json({ ok: false, error: 'Sesión no encontrada o ya cerrada' })

  res.json({ ok: true, sesion: data })
})

// Editar monto inicial de una sesión abierta
posRouter.patch('/sesion/:sesion_id/monto-inicial', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { sesion_id } = req.params
  const { monto_inicial } = req.body || {}
  if (!sesion_id || monto_inicial === undefined) return res.status(400).json({ ok: false, error: 'Parámetros requeridos' })

  const sb = adminSb()
  const { data, error } = await sb
    .from('pos_sesiones')
    .update({ monto_inicial: Number(monto_inicial) })
    .eq('id', Number(sesion_id))
    .eq('estado', 'abierta')
    .select()
    .single()

  if (error) return res.json({ ok: false, error: error.message })
  if (!data) return res.json({ ok: false, error: 'Sesión no encontrada o ya cerrada' })

  res.json({ ok: true, sesion: data })
})

// Obtener últimos cierres de una caja
posRouter.get('/cierres/ultimos', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { empresa_id, caja_id, limit = 10 } = req.query
  if (!empresa_id || !caja_id) return res.status(400).json({ ok: false, error: 'empresa_id y caja_id requeridos' })

  const sb = adminSb()
  const { data, error } = await sb
    .from('pos_sesiones')
    .select('id, monto_inicial, apertura_at, cierre_at, total_ventas, total_efectivo, total_sinpe, total_tarjeta, total_transferencia, notas')
    .eq('empresa_id', Number(empresa_id))
    .eq('caja_id', Number(caja_id))
    .eq('estado', 'cerrada')
    .order('cierre_at', { ascending: false })
    .limit(Number(limit))

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, cierres: data || [] })
})

// ════════════════════════════════════════════════════════════
// CONTABILIZACIÓN DE CIERRES POS
// ════════════════════════════════════════════════════════════

// Lista cierres contabilizables
posRouter.get('/cierres', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { empresa_id, caja_id, desde, hasta } = req.query
  if (!empresa_id) return res.status(400).json({ ok: false, error: 'empresa_id requerido' })

  const sb = adminSb()
  let query = sb
    .from('pos_sesiones')
    .select(`
      id, monto_inicial, apertura_at, cierre_at, total_ventas, total_efectivo,
      total_sinpe, total_tarjeta, total_transferencia, notas,
      contabilizado, asiento_id,
      caja:pos_cajas(id, nombre),
      asiento:asientos(id, numero_formato)
    `)
    .eq('empresa_id', Number(empresa_id))
    .eq('estado', 'cerrada')

  if (caja_id) query = query.eq('caja_id', Number(caja_id))
  if (desde) query = query.gte('cierre_at', desde)
  if (hasta) query = query.lte('cierre_at', hasta)

  const { data, error } = await query.order('cierre_at', { ascending: false })

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, cierres: data || [] })
})

// Preparar asiento contable (dry-run, devuelve sugerencia)
posRouter.get('/cierres/:sesion_id/preparar-asiento', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { sesion_id } = req.params
  const { empresa_id } = req.query
  if (!sesion_id || !empresa_id) return res.status(400).json({ ok: false, error: 'Parámetros requeridos' })

  const sb = adminSb()

  // Obtener sesión
  const { data: sesion, error: sesionErr } = await sb
    .from('pos_sesiones')
    .select('*')
    .eq('id', Number(sesion_id))
    .eq('empresa_id', Number(empresa_id))
    .maybeSingle()

  if (sesionErr || !sesion) return res.json({ ok: false, error: 'Sesión no encontrada' })
  if (sesion.contabilizado) return res.json({ ok: false, error: 'Esta sesión ya está contabilizada' })

  // Obtener config POS
  const { data: config } = await sb
    .from('empresa_config_pos')
    .select('*')
    .eq('empresa_id', Number(empresa_id))
    .maybeSingle()

  if (!config) return res.json({ ok: false, error: 'Configuración POS no encontrada. Asigne las cuentas en Configuración → POS' })

  // Calcular IVA (suponemos 13% sobre el total de ventas)
  const totalVentas = Number(sesion.total_ventas || 0)
  const totalEfectivo = Number(sesion.total_efectivo || 0)
  const totalSinpe = Number(sesion.total_sinpe || 0)
  const totalTarjeta = Number(sesion.total_tarjeta || 0)
  const totalTransferencia = Number(sesion.total_transferencia || 0)
  const montoInicial = Number(sesion.monto_inicial || 0)

  // IVA: 13% del total de ventas (aproximado)
  const iva = Math.round(totalVentas * (13 / 113) * 100) / 100
  const ventasNetas = totalVentas - iva

  // Diferencia de caja
  const totalDébitos = montoInicial + totalEfectivo + totalSinpe + totalTarjeta + totalTransferencia
  const totalCréditos = totalVentas
  const diferencia = totalDébitos - totalCréditos

  // Construir líneas del asiento
  const lineas = []

  // DÉBITOS
  if (config.cuenta_efectivo_id) {
    lineas.push({
      cuenta_id: config.cuenta_efectivo_id,
      descripcion: `Efectivo en caja — cierre ${sesion.id}`,
      debito_crc: montoInicial + totalEfectivo,
      credito_crc: 0,
    })
  }

  if (totalSinpe > 0 && config.cuenta_sinpe_id) {
    lineas.push({
      cuenta_id: config.cuenta_sinpe_id,
      descripcion: `Depósito SINPE — cierre ${sesion.id}`,
      debito_crc: totalSinpe,
      credito_crc: 0,
    })
  }

  if (totalTarjeta > 0 && config.cuenta_tarjeta_id) {
    lineas.push({
      cuenta_id: config.cuenta_tarjeta_id,
      descripcion: `Depósito tarjeta — cierre ${sesion.id}`,
      debito_crc: totalTarjeta,
      credito_crc: 0,
    })
  }

  if (totalTransferencia > 0 && config.cuenta_transferencia_id) {
    lineas.push({
      cuenta_id: config.cuenta_transferencia_id,
      descripcion: `Transferencia bancaria — cierre ${sesion.id}`,
      debito_crc: totalTransferencia,
      credito_crc: 0,
    })
  }

  // CRÉDITOS
  if (config.cuenta_ventas_id) {
    lineas.push({
      cuenta_id: config.cuenta_ventas_id,
      descripcion: `Ventas realizadas — cierre ${sesion.id}`,
      debito_crc: 0,
      credito_crc: ventasNetas,
    })
  }

  if (iva > 0 && config.cuenta_iva_ventas_id) {
    lineas.push({
      cuenta_id: config.cuenta_iva_ventas_id,
      descripcion: `IVA por pagar — cierre ${sesion.id}`,
      debito_crc: 0,
      credito_crc: iva,
    })
  }

  if (Math.abs(diferencia) > 0.01 && config.cuenta_diferencias_id) {
    lineas.push({
      cuenta_id: config.cuenta_diferencias_id,
      descripcion: diferencia > 0 ? `Sobrante de caja` : `Faltante de caja`,
      debito_crc: diferencia > 0 ? 0 : Math.abs(diferencia),
      credito_crc: diferencia > 0 ? diferencia : 0,
    })
  }

  // Enriquecer con info de cuentas
  const { data: cuentasInfo } = await sb
    .from('plan_cuentas_empresa')
    .select('id, codigo, nombre')
    .eq('empresa_id', Number(empresa_id))
    .in('id', lineas.map(l => l.cuenta_id))

  const cuentasMap = {}
  cuentasInfo?.forEach(c => { cuentasMap[c.id] = c })

  lineas.forEach(l => {
    const info = cuentasMap[l.cuenta_id]
    l.cuenta_codigo = info?.codigo || ''
    l.cuenta_nombre = info?.nombre || ''
  })

  // Totales
  const totalDebito = lineas.reduce((s, l) => s + (l.debito_crc || 0), 0)
  const totalCredito = lineas.reduce((s, l) => s + (l.credito_crc || 0), 0)

  res.json({
    ok: true,
    asiento: {
      sesion_id: Number(sesion_id),
      fecha: new Date(sesion.cierre_at).toISOString().slice(0, 10),
      descripcion: `Cierre de caja ${sesion.id}`,
      categoria_id: config.categoria_pos_id,
      moneda: 'CRC',
      lineas,
      totalDebito: Math.round(totalDebito * 100) / 100,
      totalCredito: Math.round(totalCredito * 100) / 100,
      cuadra: Math.abs(totalDebito - totalCredito) < 0.01,
    },
  })
})

// Confirmar asiento (guarda en BD)
posRouter.post('/cierres/:sesion_id/confirmar-asiento', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { sesion_id } = req.params
  const { empresa_id, lineas, descripcion, categoria_id } = req.body
  if (!sesion_id || !empresa_id || !lineas?.length) {
    return res.status(400).json({ ok: false, error: 'Parámetros incompletos' })
  }

  const sb = adminSb()

  // Verificar sesión
  const { data: sesion, error: sesionErr } = await sb
    .from('pos_sesiones')
    .select('*')
    .eq('id', Number(sesion_id))
    .eq('empresa_id', Number(empresa_id))
    .maybeSingle()

  if (sesionErr || !sesion) return res.json({ ok: false, error: 'Sesión no encontrada' })
  if (sesion.contabilizado) return res.json({ ok: false, error: 'Esta sesión ya está contabilizada' })

  try {
    // Llamar RPC para crear asiento
    const { data: resultRpc, error: rpcErr } = await sb.rpc('contabilizar_comprobante', {
      p_empresa_id: Number(empresa_id),
      p_fecha: new Date(sesion.cierre_at).toISOString().slice(0, 10),
      p_descripcion: descripcion || `Cierre de caja ${sesion_id}`,
      p_categoria_id: categoria_id,
      p_moneda: 'CRC',
      p_tipo_cambio: 1,
      p_lineas: lineas.map((l, i) => ({
        linea: i + 1,
        cuenta_id: Number(l.cuenta_id),
        descripcion: l.descripcion,
        referencia: `POS-CIERRE-${sesion_id}`,
        debito_crc: Number(l.debito_crc || 0),
        credito_crc: Number(l.credito_crc || 0),
        debito_usd: 0,
        credito_usd: 0,
      })),
    })

    if (rpcErr) throw new Error(rpcErr.message)
    if (!resultRpc) throw new Error('No se pudo crear el asiento')

    const asientoId = resultRpc.asiento_id
    const numeroFormato = resultRpc.numero_formato

    // Actualizar pos_sesiones
    const { error: updateErr } = await sb
      .from('pos_sesiones')
      .update({
        contabilizado: true,
        asiento_id: asientoId,
      })
      .eq('id', Number(sesion_id))

    if (updateErr) throw new Error(updateErr.message)

    res.json({ ok: true, asiento_id: asientoId, numero_formato: numeroFormato })
  } catch (e) {
    console.error('Error contabilizando cierre POS:', e)
    res.json({ ok: false, error: e.message })
  }
})

// Obtener configuración contable POS
posRouter.get('/config-pos', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { empresa_id } = req.query
  if (!empresa_id) return res.status(400).json({ ok: false, error: 'empresa_id requerido' })

  const sb = adminSb()
  const { data, error } = await sb
    .from('empresa_config_pos')
    .select('*')
    .eq('empresa_id', Number(empresa_id))
    .maybeSingle()

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, config: data || null })
})

// Guardar configuración contable POS
posRouter.post('/config-pos', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { empresa_id, ...config } = req.body
  if (!empresa_id) return res.status(400).json({ ok: false, error: 'empresa_id requerido' })

  const sb = adminSb()

  // Intentar update primero
  const { data: existente } = await sb
    .from('empresa_config_pos')
    .select('id')
    .eq('empresa_id', Number(empresa_id))
    .maybeSingle()

  let result
  if (existente) {
    // Ya existe, hacer update
    result = await sb
      .from('empresa_config_pos')
      .update({
        ...config,
        updated_at: new Date().toISOString(),
      })
      .eq('empresa_id', Number(empresa_id))
      .select()
      .single()
  } else {
    // No existe, hacer insert
    result = await sb
      .from('empresa_config_pos')
      .insert({
        empresa_id: Number(empresa_id),
        ...config,
      })
      .select()
      .single()
  }

  if (result.error) return res.json({ ok: false, error: result.error.message })
  res.json({ ok: true, config: result.data })
})

// Obtener información de cuentas (para modal selector)
posRouter.get('/cuentas', async (req, res) => {
  // No requiere autenticación - es data pública de plan de cuentas
  const { ids, q } = req.query

  const sb = adminSb()
  let query = sb
    .from('plan_cuentas_empresa')
    .select('id, codigo, nombre')

  if (ids) {
    // Si pasa IDs, devuelve esas cuentas específicas
    const idArray = ids.split(',').map(Number)
    query = query.in('id', idArray)
  } else {
    // Si no pasa nada, devuelve todas (limitadas)
    query = query.limit(100)
  }

  const { data, error } = await query

  if (error) return res.json({ ok: false, error: error.message })

  const cuentas = data || []

  // Si hay búsqueda, filtrar en memoria
  if (q) {
    const qLower = q.toLowerCase()
    return res.json({
      ok: true,
      cuentas: cuentas.filter(c =>
        c.codigo?.toLowerCase().includes(qLower) ||
        c.nombre?.toLowerCase().includes(qLower)
      )
    })
  }

  res.json({ ok: true, cuentas })
})

// Verificar si cliente puede vender a crédito (según políticas CXC)
posRouter.get('/credito-cliente', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  const terceroId = Number(req.query.tercero_id || 0)

  if (!empresaId || !terceroId) {
    return res.json({ ok: false, error: 'empresa_id y tercero_id requeridos' })
  }

  const sb = adminSb()

  try {
    // 1. Obtener parámetros de crédito del cliente
    const { data: params } = await sb
      .from('vw_tercero_cliente_parametros')
      .select('limite_credito, dias_credito')
      .eq('tercero_id', terceroId)
      .maybeSingle()

    if (!params) {
      return res.json({
        ok: true,
        bloqueado: true,
        motivo_cajero: 'Cliente no encontrado en parámetros de crédito',
        dias_credito: 0,
        tiene_vencido: false,
        puede_credito: false,
      })
    }

    const diasCredito = Number(params.dias_credito || 0)
    const limiteCredito = Number(params.limite_credito || 0)

    // Regla 1: dias_credito > 0 = cliente es crédito
    if (diasCredito <= 0) {
      return res.json({
        ok: true,
        bloqueado: true,
        motivo_cajero: 'Este cliente no está disponible para venta a crédito. Consulte con el Administrador.',
        dias_credito: diasCredito,
        tiene_vencido: false,
        puede_credito: false,
      })
    }

    // 2. Obtener cartera y vencido del cliente (con zona horaria CR)
    const hoy = new Date().toLocaleString('en-CA', { timeZone: 'America/Costa_Rica' }).split(' ')[0]
    const { data: documentos, error: carteraErr } = await sb.rpc('get_cxc_documentos_cartera', {
      p_empresa_id: empresaId,
      p_fecha_corte: hoy,
    })

    if (carteraErr) {
      console.error('Error en RPC cartera:', carteraErr)
      return res.json({
        ok: false,
        error: 'Error consultando cartera del cliente',
      })
    }

    // Filtrar documentos por tercero_id y calcular vencido
    const docsDelCliente = (documentos || []).filter(d => d.tercero_id === terceroId)
    const totalPendiente = docsDelCliente.reduce((sum, d) => sum + Number(d.saldo || 0), 0)

    // Calcular vencido: documentos con fecha_vencimiento < hoy
    const hoyDate = new Date(hoy)
    const docsVencidos = docsDelCliente.filter(d => {
      const fechaVencimiento = new Date(d.fecha_vencimiento)
      return fechaVencimiento < hoyDate
    })
    const tieneVencido = docsVencidos.length > 0

    // Regla 3: facturas_vencidas >= 1 → bloquea crédito
    if (tieneVencido) {
      return res.json({
        ok: true,
        bloqueado: true,
        motivo_cajero: 'Este cliente no está disponible para venta a crédito. Consulte con el Administrador.',
        dias_credito: diasCredito,
        tiene_vencido: tieneVencido,
        puede_credito: false,
      })
    }

    // Regla 2: límite de crédito no excedible (se validará por línea en el frontend)
    const disponible = limiteCredito - totalPendiente
    const bloqueado = disponible <= 0

    if (bloqueado) {
      return res.json({
        ok: true,
        bloqueado: true,
        motivo_cajero: 'Este cliente no está disponible para venta a crédito. Consulte con el Administrador.',
        dias_credito: diasCredito,
        tiene_vencido: tieneVencido,
        puede_credito: false,
      })
    }

    // Regla 5: Si todas las reglas se cumplen → puede crédito
    res.json({
      ok: true,
      bloqueado: false,
      motivo_cajero: '',
      dias_credito: diasCredito,
      tiene_vencido: tieneVencido,
      puede_credito: true,
    })

  } catch (err) {
    console.error('Error en credito-cliente:', err)
    res.json({
      ok: false,
      error: err.message,
    })
  }
})


// ════════════════════════════════════════════════════════════
// VENTAS
// ════════════════════════════════════════════════════════════

// Crea fe_documento + líneas desde una venta POS y emite a MH
async function emitirFePOS(sb, ventaData, lineas, empresaId) {
  // Tipo de documento MH: tiquete='04', factura='01'
  const tipoDoc = ventaData.tipo_documento === 'factura' ? '01' : '04'

  // Usar zona horaria de Costa Rica (America/Costa_Rica)
  const hoy = new Date().toLocaleString('en-CA', { timeZone: 'America/Costa_Rica' }).split(' ')[0]

  // Obtener terminal FE de la caja — obligatorio
  if (!ventaData.caja_id) throw new Error('La caja no está configurada. No se puede emitir comprobante electrónico.')

  const { data: caja } = await sb
    .from('pos_cajas')
    .select('terminal_id, fe_terminales(sucursal, punto_venta)')
    .eq('id', ventaData.caja_id).maybeSingle()

  if (!caja?.fe_terminales?.sucursal || !caja?.fe_terminales?.punto_venta) {
    throw new Error('La caja no tiene terminal FE asignado. Asigne un terminal en la configuración del POS antes de emitir comprobantes.')
  }

  const sucursal   = String(caja.fe_terminales.sucursal).padStart(3, '0')
  const puntoVenta = String(caja.fe_terminales.punto_venta).padStart(5, '0')

  // Crear fe_documento
  const { data: feDoc, error: feErr } = await sb.from('fe_documentos').insert({
    empresa_id:              empresaId,
    tipo_documento:          tipoDoc,
    origen:                  'pos',
    estado:                  'confirmado',
    estado_mh:               null,
    fecha_emision:           hoy,
    moneda:                  'CRC',
    condicion_venta:         '01',
    medio_pago:              MEDIO_PAGO_MAP[ventaData.tipo_pago] || '01',
    sucursal,
    punto_venta:             puntoVenta,
    receptor_nombre:         ventaData.cliente_nombre || 'Consumidor Final',
    receptor_tipo_identificacion: ventaData.cliente_cedula ? '01' : null,
    receptor_identificacion: ventaData.cliente_cedula || null,
    receptor_email:          ventaData.cliente_email  || null,
    total_comprobante:       Number(ventaData.total),
    pos_venta_id:            ventaData.id,
    auto_emitir:             false,
  }).select('id').single()

  if (feErr) throw new Error('Error creando FE: ' + feErr.message)
  const feDocId = feDoc.id

  // Crear líneas FE desde líneas POS
  const lineasFe = lineas.map((l, i) => {
    const subtotal      = Number(l.gravado ?? 0)
    const impuestoMonto = Number(l.iva_monto ?? 0)
    const totalLinea    = Number(l.total ?? 0)
    // Código tarifa IVA: 08=13%, 04=4%, 01=1%, 02=2%, 07=exento
    let tarifaCodigo = '07'
    const ivaPct = Number(l.iva_pct ?? 0)
    if      (ivaPct === 13) tarifaCodigo = '08'
    else if (ivaPct === 4)  tarifaCodigo = '04'
    else if (ivaPct === 2)  tarifaCodigo = '02'
    else if (ivaPct === 1)  tarifaCodigo = '01'
    return {
      documento_id:           feDocId,
      linea:                  i + 1,
      tipo_linea:             'mercaderia',
      producto_id:            l.producto_id || null,
      codigo_interno:         l.codigo      || null,
      cabys:                  l.cabys_code  || null,
      descripcion:            l.descripcion || '',
      unidad_medida:          l.unidad      || 'Unid',
      cantidad:               Number(l.cantidad),
      precio_unitario:        Number(l.precio_unit),
      descuento_monto:        Number(l.descuento_monto ?? 0),
      tarifa_iva_codigo:      tarifaCodigo,
      tarifa_iva_porcentaje:  ivaPct,
      subtotal,
      impuesto_monto:         impuestoMonto,
      total_linea:            totalLinea,
    }
  })

  const { error: linErr } = await sb.from('fe_documento_lineas').insert(lineasFe)
  if (linErr) throw new Error('Error creando líneas FE: ' + linErr.message)

  // Emitir a Hacienda
  const resultado = await emitirDocumentoCore(sb, feDocId, empresaId)
  return { feDocId, ...resultado }
}

posRouter.post('/ventas', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { venta, lineas } = req.body
  if (!venta || !lineas?.length) return res.status(400).json({ ok: false, error: 'Datos incompletos' })

  const sb = adminSb()

  // Obtener config y bodega en paralelo
  const [configRes, sucursalRes] = await Promise.all([
    sb.from('pos_config').select('bloquear_sin_stock').eq('empresa_id', venta.empresa_id).maybeSingle(),
    venta.sucursal_id
      ? sb.from('pos_sucursales').select('bodega_id').eq('id', venta.sucursal_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const bloquearSinStock = configRes.data?.bloquear_sin_stock ?? false
  const bodegaId = sucursalRes.data?.bodega_id ?? null

  // Validar stock si está configurado
  if (bloquearSinStock) {
    for (const l of lineas) {
      if (!l.producto_id) continue
      let stockDisponible = Infinity

      if (bodegaId) {
        const { data: sb_stock } = await sb
          .from('inv_stock_bodega')
          .select('stock_actual')
          .eq('empresa_id', venta.empresa_id)
          .eq('producto_id', l.producto_id)
          .eq('bodega_id', bodegaId)
          .maybeSingle()
        stockDisponible = sb_stock?.stock_actual ?? 0
      } else {
        const { data: prod } = await sb
          .from('inv_productos')
          .select('stock_actual')
          .eq('id', l.producto_id)
          .maybeSingle()
        stockDisponible = prod?.stock_actual ?? 0
      }

      if (stockDisponible < l.cantidad) {
        return res.json({ ok: false, error: `Stock insuficiente: ${l.descripcion} (disponible: ${stockDisponible})` })
      }
    }
  }

  // Obtener sesión activa para la caja si no viene en el payload
  let sesionId = venta.sesion_id || null
  if (!sesionId && venta.caja_id) {
    const { data: sesAct } = await sb
      .from('pos_sesiones')
      .select('id')
      .eq('caja_id', Number(venta.caja_id))
      .eq('estado', 'abierta')
      .maybeSingle()
    sesionId = sesAct?.id || null
  }

  // Insertar venta
  const ventaPayload = { ...venta, cajero_id: user.id, sesion_id: sesionId }
  let { data: ventaData, error: ventaErr } = await sb
    .from('pos_ventas')
    .insert(ventaPayload)
    .select()
    .single()

  // Compatibilidad temporal: algunos entornos no tienen la columna referencia_pago.
  if (ventaErr?.message?.includes('referencia_pago') && Object.prototype.hasOwnProperty.call(ventaPayload, 'referencia_pago')) {
    const { referencia_pago, ...payloadSinReferencia } = ventaPayload
    console.warn('[POS] referencia_pago no existe en esquema actual; reintentando inserción sin referencia_pago')
    ;({ data: ventaData, error: ventaErr } = await sb
      .from('pos_ventas')
      .insert(payloadSinReferencia)
      .select()
      .single())
  }

  if (ventaErr) return res.json({ ok: false, error: ventaErr.message })

  // Insertar líneas
  const lineasConId = lineas.map((l) => ({ ...l, venta_id: ventaData.id }))
  const { error: lineasErr } = await sb.from('pos_venta_lineas').insert(lineasConId)
  if (lineasErr) return res.json({ ok: false, error: lineasErr.message })

  // Descontar stock vía inv_movimientos (trigger actualiza stock_actual global y por bodega)
  const hoy = new Date().toLocaleString('en-CA', { timeZone: 'America/Costa_Rica' }).split(' ')[0]
  const movimientos = lineas
    .filter((l) => l.producto_id)
    .map((l) => ({
      empresa_id: venta.empresa_id,
      fecha: hoy,
      tipo: 'salida',
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      costo_unitario: 0,
      referencia: `POS-${ventaData.id}`,
      notas: 'Venta POS',
      bodega_id: bodegaId,
    }))

  if (movimientos.length) {
    await sb.from('inv_movimientos').insert(movimientos)
  }

  // Si es venta a crédito, crear registro en cxc_documentos
  if (venta.tipo_pago === 'credito' && venta.tercero_id) {
    try {
      const hoy = new Date().toLocaleString('en-CA', { timeZone: 'America/Costa_Rica' }).split(' ')[0]
      const diasCredito = venta.dias_credito || 0
      const fechaVencimiento = new Date(new Date(hoy + 'T00:00:00').getTime() + diasCredito * 24 * 60 * 60 * 1000)
        .toLocaleString('en-CA', { timeZone: 'America/Costa_Rica' }).split(' ')[0]

      const { data: cxcDoc, error: cxcErr } = await sb
        .from('cxc_documentos')
        .insert({
          empresa_id: venta.empresa_id,
          tercero_id: venta.tercero_id,
          tipo_documento: 'factura_pos', // nuevo tipo para diferenciar de FE
          numero_documento: String(ventaData.id),
          fecha_documento: hoy,
          fecha_vencimiento: fechaVencimiento,
          valor_original: Number(ventaData.total),
          valor_pagado: 0,
          estado: 'pendiente',
          referencia: `POS-${ventaData.id}`,
          fe_documento_id: ventaData.fe_doc_id || null,
        })
        .select('id')
        .single()

      if (cxcErr) {
        console.error('[POS] Error creando cxc_documentos:', cxcErr.message)
      } else {
        console.log(`[POS] CXC documento creado: ${cxcDoc.id} para venta ${ventaData.id}`)
      }
    } catch (cxcErr) {
      console.error('[POS] Error CXC en background:', cxcErr.message)
    }
  }

  // Responder al cajero inmediatamente — FE se emite en segundo plano
  res.json({ ok: true, venta: ventaData })

  // Emitir FE en background si corresponde (tiquete o factura)
  if (['tiquete', 'factura'].includes(venta.tipo_documento)) {
    const emailCliente = ventaData.cliente_email || null
    emitirFePOS(sb, ventaData, lineas, ventaData.empresa_id)
      .then(async (feResult) => {
        if (!feResult?.clave) return
        await sb.from('pos_ventas').update({
          fe_clave:        feResult.clave,
          fe_documento_id: feResult.feDocId,
          fe_doc_id:       feResult.feDocId,
          fe_consecutivo:  String(feResult.consecutivo || ''),
          fe_estado:       feResult.estado_mh || 'enviado',
        }).eq('id', ventaData.id)
        console.log(`[POS] FE emitida en background: venta ${ventaData.id} clave ${feResult.clave}`)

        // Si no hay email del cliente ni doc FE, no hay nada más que hacer
        if (!feResult.feDocId) return

        // Polling: reintentar hasta obtener aceptado/rechazado o agotar intentos
        // Intervalos: 8s, 15s, 30s, 60s, 120s (máx ~4 min en total)
        const INTERVALOS = [8000, 15000, 30000, 60000, 120000]
        for (const espera of INTERVALOS) {
          await new Promise((r) => setTimeout(r, espera))
          try {
            const estadoMh = await consultarYActualizarEstadoFeDoc(sb, feResult.feDocId, ventaData.empresa_id)
            console.log(`[POS] FE venta ${ventaData.id} estado: ${estadoMh}`)
            if (estadoMh === 'aceptado') {
              await sb.from('pos_ventas').update({ fe_estado: 'aceptado' }).eq('id', ventaData.id)
              if (emailCliente) {
                await enviarEmailVentaPOS(sb, ventaData.id, emailCliente)
                await sb.from('pos_ventas').update({ fe_email_enviado: true }).eq('id', ventaData.id)
                console.log(`[POS] Email FE enviado a ${emailCliente} (venta ${ventaData.id})`)
              }
              break // estado definitivo — terminar polling
            }
            if (estadoMh === 'rechazado') {
              await sb.from('pos_ventas').update({ fe_estado: 'rechazado' }).eq('id', ventaData.id)
              console.warn(`[POS] FE rechazada por MH venta ${ventaData.id}`)
              break // estado definitivo — terminar polling
            }
            // 'enviado' / 'pendiente' → seguir reintentando
          } catch (pollingErr) {
            console.error(`[POS] Error polling FE venta ${ventaData.id}:`, pollingErr.message)
            // No abortar — intentar en el siguiente ciclo
          }
        }
      })
      .catch((feErr) => {
        console.error(`[POS] Error FE background venta ${ventaData.id}:`, feErr.message)
        sb.from('pos_ventas').update({ fe_error: feErr.message }).eq('id', ventaData.id).then(() => {})
      })
  }
})

posRouter.get('/ventas/hoy', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  if (!empresaId) return res.json({ ok: true, ventas: [] })

  const sb = adminSb()
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const { data, error } = await sb
    .from('pos_ventas')
    .select('id, created_at, cliente_nombre, total, tipo_pago, tipo_documento, fe_clave, fe_doc_id, fe_consecutivo, fe_estado, anulada, cajero_nombre')
    .eq('empresa_id', empresaId)
    .eq('anulada', false)
    .gte('created_at', hoy.toISOString())
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, ventas: data || [] })
})

// Comprobantes FE por caja
posRouter.get('/ventas/fe-comprobantes', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const empresaId = Number(req.query.empresa_id || 0)
  const cajaId    = Number(req.query.caja_id    || 0)
  if (!empresaId || !cajaId) return res.json({ ok: true, docs: [] })

  const sb = adminSb()

  const { data: ventasData, error: ventasErr } = await sb
    .from('pos_ventas')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('caja_id', cajaId)

  if (ventasErr) return res.json({ ok: false, error: ventasErr.message })
  const ventaIds = (ventasData || []).map((v) => v.id)
  if (!ventaIds.length) return res.json({ ok: true, docs: [] })

  const { data, error } = await sb
    .from('fe_documentos')
    .select('id, tipo_documento, numero_consecutivo, fecha_emision, receptor_nombre, total_comprobante, estado_mh, clave_mh, receptor_email, pos_venta_id')
    .eq('empresa_id', empresaId)
    .eq('origen', 'pos')
    .in('pos_venta_id', ventaIds)
    .order('id', { ascending: false })
    .limit(100)

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, docs: data || [] })
})

// Líneas de una venta (para modal de devolución parcial) — debe ir ANTES de /ventas/:id
posRouter.get('/ventas/:id/lineas', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const ventaId = Number(req.params.id)
  const sb = adminSb()

  const { data, error } = await sb
    .from('pos_venta_lineas')
    .select('id, producto_id, codigo, descripcion, unidad, cantidad, precio_unit, iva_pct, iva_monto, gravado, exento, total, cabys_code')
    .eq('venta_id', ventaId)
    .order('id')

  if (error) return res.json({ ok: false, error: error.message })
  res.json({ ok: true, lineas: data || [] })
})

// Detalle de una venta (para reimprimir tiquete) — debe ir DESPUÉS de /ventas/hoy
posRouter.get('/ventas/:id', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const ventaId = Number(req.params.id)
  const sb = adminSb()

  const [ventaRes, lineasRes] = await Promise.all([
    sb.from('pos_ventas')
      .select('id, created_at, empresa_id, cliente_nombre, cliente_cedula, total, subtotal, descuento, gravado, exento, iva, tipo_pago, tipo_documento, monto_recibido, cambio, cajero_nombre, fe_clave, fe_consecutivo, fe_estado')
      .eq('id', ventaId).maybeSingle(),
    sb.from('pos_venta_lineas')
      .select('codigo, descripcion, unidad, cantidad, precio_unit, descuento_pct, iva_pct, iva_monto, gravado, exento, total')
      .eq('venta_id', ventaId)
      .order('id'),
  ])

  if (ventaRes.error || !ventaRes.data) return res.status(404).json({ ok: false, error: 'Venta no encontrada' })

  res.json({ ok: true, venta: ventaRes.data, lineas: lineasRes.data || [] })
})

// ── Helpers para email profesional ───────────────────────────

const MEDIO_PAGO_EMAIL_LABEL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', sinpe: 'SINPE Móvil', transferencia: 'Transferencia / Depósito' }

function enteroALetrasPos(n) {
  if (n === 0) return 'CERO'
  if (n < 0) return 'MENOS ' + enteroALetrasPos(-n)
  const u = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE']
  const d = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA']
  const c = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS']
  if (n === 100) return 'CIEN'
  if (n < 20) return u[n]
  if (n < 100) return d[Math.floor(n/10)] + (n%10 ? ' Y '+u[n%10] : '')
  if (n < 1000) return c[Math.floor(n/100)] + (n%100 ? ' '+enteroALetrasPos(n%100) : '')
  if (n === 1000) return 'MIL'
  if (n < 2000) return 'MIL' + (n%1000 ? ' '+enteroALetrasPos(n%1000) : '')
  if (n < 1000000) return enteroALetrasPos(Math.floor(n/1000))+' MIL'+(n%1000 ? ' '+enteroALetrasPos(n%1000) : '')
  if (n === 1000000) return 'UN MILLÓN'
  if (n < 2000000) return 'UN MILLÓN'+(n%1000000 ? ' '+enteroALetrasPos(n%1000000) : '')
  return enteroALetrasPos(Math.floor(n/1000000))+' MILLONES'+(n%1000000 ? ' '+enteroALetrasPos(n%1000000) : '')
}

function montoALetrasPos(monto) {
  const entero = Math.floor(monto)
  const cents  = Math.round((monto - entero) * 100)
  return enteroALetrasPos(entero) + ' CON ' + String(cents).padStart(2,'0') + '/100'
}

function generarHtmlEmailTiquete(venta, lineas, cfg) {
  const fmt = (n) => Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const G = '#1a5c38'
  const nombreComercial = cfg.nombre_comercial || cfg.nombre_emisor || 'ERP MYA'
  const nombreEmisor    = cfg.nombre_emisor    || cfg.nombre_comercial || 'ERP MYA'
  const esPruebas       = String(cfg.ambiente || 'pruebas').toLowerCase() !== 'produccion'
  const iniciales       = nombreComercial.split(' ').slice(0,2).map(w => w[0]||'').join('').toUpperCase() || 'MYA'

  const fechaStr = new Date(venta.created_at || new Date()).toLocaleDateString('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Costa_Rica'
  })

  const subtotal  = Number(venta.subtotal   || 0)
  const descuento = Number(venta.descuento  || 0)
  const iva       = Number(venta.iva        || 0)
  const total     = Number(venta.total      || 0)
  const recibido  = Number(venta.monto_recibido || total)
  const cambio    = Number(venta.cambio     || 0)

  const logoTag = cfg.logo_url
    ? `<img src="${cfg.logo_url}" style="width:62px;height:62px;object-fit:contain;border-radius:50%" onerror="this.style.display='none'">`
    : `<div style="width:62px;height:62px;border-radius:50%;border:3px solid ${G};display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:${G}">${iniciales}</div>`

  const filaRows = lineas.map((l, i) => {
    const dscto = Number(l.descuento_pct || 0)
    const iva   = Number(l.iva_pct || 0)
    return `<tr>
      <td class="tc">${l.codigo || String(i+1).padStart(2,'0')}</td>
      <td class="tr">${Number(l.cantidad).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td class="tc">${l.unidad || 'Unid'}</td>
      <td>${l.descripcion || ''}</td>
      <td class="tr">${dscto > 0 ? dscto+'%' : ''}</td>
      <td class="tr">&#8353;${fmt(l.precio_unit)}</td>
      <td class="tr fw">&#8353;${fmt(l.total)}</td>
      <td class="tc nb">${iva > 0 ? iva+'%' : '0%'}</td>
    </tr>`
  }).join('')

  const nVacias = lineas.length < 5 ? 5 - lineas.length : 0
  const filasVacias = Array(nVacias).fill(
    '<tr><td class="tc ev"></td><td class="tr ev"></td><td class="tc ev"></td><td class="ev"></td><td class="tr ev"></td><td class="tr ev"></td><td class="tr ev"></td><td class="tc ev nb"></td></tr>'
  ).join('')

  const tipoLabel = venta.tipo_documento === 'factura' ? 'FACTURA ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO'
  const numDoc    = venta.fe_consecutivo || String(venta.id).padStart(10,'0')

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>${tipoLabel} ${numDoc}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a1a;background:#fff}
  body{padding:14px 16px;position:relative}
  .wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9999;overflow:hidden}
  .wm span{transform:rotate(-32deg);font-size:64px;font-weight:900;letter-spacing:.18em;color:rgba(185,28,28,.12);white-space:nowrap}
  table.hdr{width:100%;border-collapse:collapse;border:1px solid #aaa}
  table.hdr td{padding:8px 12px;border-right:1px solid #aaa;vertical-align:middle}
  table.hdr td:last-child{border-right:0}
  .emi-name{font-weight:900;font-size:13px;margin-bottom:2px}
  .emi-legal{font-weight:700;font-size:11px;margin-bottom:4px;color:#374151}
  .emi-data{font-size:10px;color:#333;line-height:1.7}
  .doc-tipo{color:${G};font-weight:900;font-size:14px;text-align:right;line-height:1.15}
  .doc-num{font-weight:700;font-size:12px;text-align:right;margin-top:4px}
  .doc-fecha{font-size:10px;color:#555;text-align:right;margin-top:3px}
  .clave{border:1px solid #aaa;border-top:0;background:#f8f8f8;padding:4px 10px;font-size:9px;color:#555;word-break:break-all;line-height:1.5}
  table.cli{width:100%;border-collapse:collapse;border:1px solid #aaa;border-top:0}
  table.cli th.sec{background:${G};color:#fff;padding:5px 10px;text-align:center;font-weight:700;font-size:11px}
  table.cli td.lbl{padding:3px 8px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;color:#555;font-style:italic;white-space:nowrap;font-size:10.5px;width:80px}
  table.cli td.val{padding:3px 8px;border-right:1px solid #d1d5db;border-bottom:1px solid #e5e7eb;font-size:11px}
  table.cli td.val.bold{font-weight:700;font-size:12px}
  table.cli tr:last-child td{border-bottom:0}
  table.lineas{width:100%;border-collapse:collapse;border:1px solid #aaa;border-top:0}
  table.lineas thead td{background:${G};color:#fff;padding:5px 7px;font-weight:700;font-size:10px;border-right:1px solid ${G};white-space:nowrap}
  table.lineas thead td:last-child{border-right:0}
  table.lineas tbody td{padding:4px 7px;border-right:1px solid #d1d5db;font-size:11px;vertical-align:middle}
  table.lineas tbody td.nb{border-right:0}
  table.lineas tbody tr:nth-child(even) td{background:#f5f5f5}
  table.lineas tbody td.ev{height:20px}
  .tc{text-align:center}.tr{text-align:right}.fw{font-weight:700}
  table.bot{width:100%;border-collapse:collapse;border:1px solid #aaa;border-top:0}
  table.bot td.obs{padding:8px 10px;border-right:1px solid #aaa;vertical-align:top;font-size:10px;color:#555;width:55%}
  table.tots{width:100%;border-collapse:collapse}
  table.tots td{padding:4px 10px;font-size:11px;border-bottom:1px solid #e5e7eb}
  table.tots td.tl{font-weight:700;text-align:right;border-right:1px solid #e5e7eb}
  table.tots td.tv{text-align:right;font-family:monospace}
  table.tots tr.grand td{background:${G};color:#fff;font-weight:900;font-size:12px;border-bottom:0}
  .son{border:1px solid #aaa;border-top:0;padding:5px 10px;font-size:10px;line-height:1.5}
  .footer{margin-top:14px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
  .auth{text-align:center;font-size:9px;color:#777;line-height:1.6}
</style>
</head>
<body>
${esPruebas ? '<div class="wm"><span>PRUEBAS</span></div>' : ''}
<table class="hdr">
<tr>
  <td style="width:74px;text-align:center;border-right:1px solid #aaa">${logoTag}</td>
  <td>
    <div class="emi-name">${nombreComercial}</div>
    <div class="emi-legal">${nombreEmisor}</div>
    <div class="emi-data">${cfg.numero_identificacion ? 'Cédula '+cfg.numero_identificacion+'<br>' : ''}${cfg.otras_senas ? cfg.otras_senas+'<br>' : ''}${cfg.telefono_emisor ? 'Teléfono: '+cfg.telefono_emisor+'<br>' : ''}${cfg.correo_envio ? 'Email: '+cfg.correo_envio : ''}</div>
  </td>
  <td style="width:260px">
    <div class="doc-tipo">${tipoLabel}</div>
    <div class="doc-num">No. ${numDoc}</div>
    <div class="doc-fecha">Fecha: ${fechaStr}</div>
  </td>
</tr>
</table>
<div class="clave">Clave MH: <span style="font-family:monospace;color:#222">${venta.fe_clave || 'Pendiente'}</span></div>
<table class="cli">
<thead><tr><th class="sec" colspan="4">Datos del Cliente</th></tr></thead>
<tbody>
  <tr>
    <td class="lbl">Cliente:</td><td class="val bold">${venta.cliente_nombre || 'Consumidor Final'}</td>
    <td class="lbl">Forma de pago:</td><td class="val">${MEDIO_PAGO_EMAIL_LABEL[venta.tipo_pago] || venta.tipo_pago || 'Efectivo'}</td>
  </tr>
  <tr>
    <td class="lbl">Cédula:</td><td class="val">${venta.cliente_cedula || '—'}</td>
    <td class="lbl">Moneda:</td><td class="val">Colón Costarricense</td>
  </tr>
  <tr>
    <td class="lbl">Email:</td><td class="val">${venta.cliente_email || '—'}</td>
    <td class="lbl">Cajero:</td><td class="val">${venta.cajero_nombre || '—'}</td>
  </tr>
</tbody>
</table>
<table class="lineas">
<thead><tr>
  <td class="tc" style="width:50px">Código</td>
  <td class="tr" style="width:66px">Cantidad</td>
  <td class="tc" style="width:40px">Emp</td>
  <td>Descripción</td>
  <td class="tr" style="width:60px">Dcto</td>
  <td class="tr" style="width:100px">Precio</td>
  <td class="tr" style="width:100px">Total</td>
  <td class="tc nb" style="width:40px">IVA</td>
</tr></thead>
<tbody>${filaRows}${filasVacias}</tbody>
</table>
<table class="bot">
<tr>
  <td class="obs">
    ${venta.fe_clave ? '<strong>Estado MH:</strong> '+(venta.fe_estado||'enviado').toUpperCase()+'<br>' : ''}
    <small style="color:#999">Autorizado mediante resolución DGT-R-033-2019 del 20/06/2019</small>
  </td>
  <td style="padding:0;vertical-align:bottom">
    <table class="tots">
      <tr><td class="tl">Subtotal</td><td class="tv">&#8353;${fmt(subtotal)}</td></tr>
      ${descuento > 0 ? `<tr><td class="tl">Descuento</td><td class="tv">&#8353;${fmt(descuento)}</td></tr>` : ''}
      ${iva > 0 ? `<tr><td class="tl">I.V.A.</td><td class="tv">&#8353;${fmt(iva)}</td></tr>` : ''}
      <tr class="grand"><td class="tl">Total</td><td class="tv">&#8353;${fmt(total)}</td></tr>
      ${venta.tipo_pago === 'efectivo' ? `<tr><td class="tl">Recibido</td><td class="tv">&#8353;${fmt(recibido)}</td></tr><tr><td class="tl">Cambio</td><td class="tv">&#8353;${fmt(cambio)}</td></tr>` : ''}
    </table>
  </td>
</tr>
</table>
<div class="son"><strong>Son:</strong> ${montoALetrasPos(total)} colones</div>
<div class="footer">
  <div></div>
  <div class="auth">Autorización No. DGT-R-033-2019 del 20/06/2019 — DGTD v.4.4<br>${nombreComercial}${cfg.telefono_emisor ? ' · Tel. '+cfg.telefono_emisor : ''}</div>
</div>
</body></html>`
}

// ── Función interna: enviar email del comprobante POS (reutilizable desde background) ──
async function enviarEmailVentaPOS(sb, ventaId, email) {
  const [ventaRes, lineasRes] = await Promise.all([
    sb.from('pos_ventas')
      .select('id, created_at, empresa_id, cliente_nombre, cliente_cedula, cliente_email, total, subtotal, descuento, gravado, exento, iva, tipo_pago, tipo_documento, monto_recibido, cambio, cajero_nombre, fe_clave, fe_consecutivo, fe_estado, fe_doc_id')
      .eq('id', Number(ventaId)).maybeSingle(),
    sb.from('pos_venta_lineas')
      .select('codigo, descripcion, unidad, cantidad, precio_unit, descuento_pct, iva_pct, iva_monto, gravado, exento, total')
      .eq('venta_id', Number(ventaId)).order('id'),
  ])

  if (!ventaRes.data) throw new Error('Venta no encontrada')
  const venta  = ventaRes.data
  const lineas = lineasRes.data || []

  const { data: cfg } = await sb
    .from('fe_config_empresa')
    .select('nombre_emisor, nombre_comercial, numero_identificacion, otras_senas, telefono_emisor, correo_envio, logo_url, ambiente')
    .eq('empresa_id', venta.empresa_id)
    .maybeSingle()

  const htmlDoc       = generarHtmlEmailTiquete(venta, lineas, cfg || {})
  const tipoLabel     = venta.tipo_documento === 'factura' ? 'Factura' : 'Tiquete'
  const numDoc        = venta.fe_consecutivo || String(venta.id).padStart(10, '0')
  const pdfBuffer     = await htmlToPdf(htmlDoc)
  const nombreArchivo = `${tipoLabel.replace(' ', '_')}_${numDoc}.pdf`
  const attachments   = [{ filename: nombreArchivo, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }]

  if (venta.fe_doc_id) {
    const { data: feDoc } = await sb
      .from('fe_documentos')
      .select('numero_consecutivo, xml_firmado, respuesta_mh_json')
      .eq('id', venta.fe_doc_id)
      .maybeSingle()

    if (feDoc?.xml_firmado) {
      attachments.push({
        filename: `${numDoc}_firmado.xml`,
        content: Buffer.from(String(feDoc.xml_firmado), 'utf8').toString('base64'),
        contentType: 'application/xml',
      })
    }
    const xmlMhB64 = feDoc?.respuesta_mh_json?.['respuesta-xml']
                  || feDoc?.respuesta_mh_json?.xml
                  || feDoc?.respuesta_mh_json?.comprobanteXml
                  || null
    if (xmlMhB64) {
      try {
        attachments.push({
          filename: `${numDoc}_respuesta_mh.xml`,
          content: Buffer.from(xmlMhB64, 'base64').toString('base64'),
          contentType: 'application/xml',
        })
      } catch { /* omitir si no decodifica */ }
    }
  }

  const htmlCuerpo = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:520px;margin:0 auto">
  <div style="background:#1a5c38;padding:18px 24px;border-radius:8px 8px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:900">${cfg?.nombre_comercial || 'Sistema MYA'}</span>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 8px 8px">
    <p style="margin-bottom:12px">Estimado/a <strong>${venta.cliente_nombre || 'Cliente'}</strong>,</p>
    <p style="margin-bottom:16px">Adjunto encontrará su <strong>${tipoLabel} Electrónico No. ${numDoc}</strong> en formato PDF${venta.fe_doc_id ? ' y los archivos XML de Hacienda' : ''}.</p>
    ${venta.fe_clave ? `<p style="font-size:11px;color:#6b7280;margin-bottom:16px;word-break:break-all">Clave MH: ${venta.fe_clave}</p>` : ''}
    <p style="font-size:11px;color:#9ca3af">Autorizado mediante resolución DGT-R-033-2019 del 20/06/2019</p>
  </div>
</div>`

  await sendMail({
    to: email,
    subject: `${tipoLabel} Electrónico No. ${numDoc} — ${cfg?.nombre_comercial || 'Sistema MYA'}`,
    html: htmlCuerpo,
    attachments,
  })
}

// Enviar tiquete por email como PDF adjunto
// ── Devoluciones POS ─────────────────────────────────────────
// Crea una devolución parcial o total ligada a una venta existente.
// Si la venta tenía FE aceptada, emite NC electrónica automáticamente.
posRouter.post('/devoluciones', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { empresa_id, venta_id, motivo_codigo, motivo_razon, lineas } = req.body || {}
  if (!empresa_id || !venta_id || !motivo_codigo || !motivo_razon || !Array.isArray(lineas) || !lineas.length) {
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' })
  }

  const sb = adminSb()

  // Cargar venta original
  const { data: venta, error: ventaErr } = await sb
    .from('pos_ventas')
    .select('id, empresa_id, fe_doc_id, fe_clave, tipo_documento, cliente_nombre, cliente_cedula, anulada')
    .eq('id', venta_id)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (ventaErr || !venta) return res.status(404).json({ ok: false, error: 'Venta no encontrada' })
  if (venta.anulada) return res.status(400).json({ ok: false, error: 'La venta ya está anulada' })

  // Calcular totales de las líneas a devolver
  let subtotal = 0, impuesto = 0, total = 0
  for (const l of lineas) {
    const base = Number(l.precio_unit) * Number(l.cantidad)
    const iva  = Math.round(base * (Number(l.iva_pct) / 100) * 100) / 100
    subtotal += base
    impuesto += iva
    total    += base + iva
  }
  subtotal = Math.round(subtotal * 100) / 100
  impuesto = Math.round(impuesto * 100) / 100
  total    = Math.round(total    * 100) / 100

  // Insertar encabezado de devolución
  const { data: dev, error: devErr } = await sb
    .from('pos_devoluciones')
    .insert({
      empresa_id,
      venta_id,
      motivo_codigo,
      motivo_razon,
      subtotal,
      impuesto,
      total,
      cajero_id:     user.id,
      cajero_nombre: user.nombre || user.email || '',
    })
    .select('id')
    .single()

  if (devErr) return res.json({ ok: false, error: devErr.message })

  // Insertar líneas de la devolución
  const lineasInsert = lineas.map((l) => {
    const base = Math.round(Number(l.precio_unit) * Number(l.cantidad) * 100) / 100
    const iva  = Math.round(base * (Number(l.iva_pct) / 100) * 100) / 100
    return {
      devolucion_id:    dev.id,
      venta_linea_id:   l.id || null,
      producto_id:      l.producto_id || null,
      descripcion:      l.descripcion,
      cantidad:         Number(l.cantidad),
      precio_unitario:  Number(l.precio_unit),
      tarifa_iva:       Number(l.iva_pct),
      subtotal:         base,
      impuesto:         iva,
      total_linea:      base + iva,
    }
  })

  await sb.from('pos_devolucion_lineas').insert(lineasInsert)

  // Revertir stock: insertar inv_movimientos tipo 'entrada' por cada línea con producto
  const movimientos = lineas
    .filter((l) => l.producto_id)
    .map((l) => ({
      empresa_id,
      fecha: new Date().toISOString().slice(0, 10),
      tipo: 'entrada',
      producto_id: l.producto_id,
      cantidad: Number(l.cantidad),
      costo_unitario: 0,
      referencia: `DEV-POS-${dev.id}`,
      notas: `Devolución POS venta #${venta_id}`,
    }))

  if (movimientos.length) {
    await sb.from('inv_movimientos').insert(movimientos)
  }

  // Si la venta tenía FE aceptada, crear NC electrónica
  let feDocId = null
  let feEstado = null

  if (venta.fe_doc_id) {
    // Cargar fe_documento original para obtener clave_mh, fecha y datos receptor
    const { data: feOrig } = await sb
      .from('fe_documentos')
      .select('id, tipo_documento, clave_mh, fecha_emision, estado_mh, receptor_nombre, receptor_tipo_identificacion, receptor_identificacion, receptor_email, numero_consecutivo')
      .eq('id', venta.fe_doc_id)
      .maybeSingle()

    if (feOrig && feOrig.estado_mh === 'aceptado' && feOrig.clave_mh) {
      // Construir líneas para fe_documento_lineas
      const feLineas = lineas.map((l, i) => {
        const base = Math.round(Number(l.precio_unit) * Number(l.cantidad) * 100) / 100
        const iva  = Math.round(base * (Number(l.iva_pct) / 100) * 100) / 100
        return {
          linea:             i + 1,
          tipo_linea:        'mercaderia',
          producto_id:       l.producto_id || null,
          cabys:             l.cabys_code || null,
          descripcion:       l.descripcion,
          unidad_medida:     l.unidad || 'Unid',
          cantidad:          Number(l.cantidad),
          precio_unitario:   Number(l.precio_unit),
          descuento_monto:   0,
          tarifa_iva_codigo: l.iva_pct > 0 ? '08' : '10',
          tarifa_iva_porcentaje: Number(l.iva_pct),
          subtotal:          base,
          impuesto_monto:    iva,
          total_linea:       base + iva,
        }
      })

      // Insertar fe_documento tipo '03' (NC)
      const { data: feDoc, error: feErr } = await sb
        .from('fe_documentos')
        .insert({
          empresa_id,
          tipo_documento:              '03',
          origen:                      'pos',
          estado:                      'confirmado',
          auto_emitir:                 true,
          fecha_emision:               new Date().toISOString().slice(0, 10),
          moneda:                      'CRC',
          condicion_venta:             '01',
          medio_pago:                  '01',
          receptor_nombre:             feOrig.receptor_nombre || venta.cliente_nombre || 'Consumidor Final',
          receptor_tipo_identificacion: feOrig.receptor_tipo_identificacion || null,
          receptor_identificacion:     feOrig.receptor_identificacion || venta.cliente_cedula || null,
          receptor_email:              feOrig.receptor_email || null,
          subtotal,
          total_descuento:             0,
          total_impuesto:              impuesto,
          total_comprobante:           total,
          ref_tipo_doc:                feOrig.tipo_documento || '01',
          ref_numero:                  feOrig.clave_mh,
          ref_fecha_emision:           feOrig.fecha_emision,
          ref_codigo:                  motivo_codigo,
          ref_razon:                   motivo_razon,
          ref_doc_id:                  feOrig.id,
        })
        .select('id')
        .single()

      if (!feErr && feDoc) {
        // Insertar líneas del fe_documento
        await sb.from('fe_documento_lineas').insert(feLineas.map((fl) => ({ ...fl, documento_id: feDoc.id })))

        feDocId = feDoc.id
        feEstado = 'pendiente'

        // Actualizar devolución con fe_doc_id
        await sb.from('pos_devoluciones').update({ fe_doc_id: feDoc.id, fe_estado: 'pendiente' }).eq('id', dev.id)

        // Emitir NC a MH (fire-and-forget, igual que en ventas)
        try {
          const emitirUrl = `http://localhost:3001/api/facturacion/emitir/${feDoc.id}`
          const token = req.headers.authorization || ''
          fetch(emitirUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({ empresa_id }),
          }).then(async (r) => {
            const json = await r.json().catch(() => ({}))
            const nuevoEstado = json.ok ? (json.estado_mh || 'enviado') : 'error'
            await sb.from('pos_devoluciones').update({ fe_clave: json.clave || null, fe_estado: nuevoEstado }).eq('id', dev.id)
          }).catch(() => {})
        } catch (_) {}
      }
    }
  }

  res.json({ ok: true, devolucion_id: dev.id, fe_doc_id: feDocId, fe_estado: feEstado, total })
})

posRouter.post('/ventas/email', async (req, res) => {
  const user = await requirePosAuth(req, res)
  if (!user) return

  const { email, venta_id } = req.body || {}
  if (!email || !venta_id) return res.status(400).json({ ok: false, error: 'email y venta_id requeridos' })

  try {
    await enviarEmailVentaPOS(adminSb(), venta_id, email)
    res.json({ ok: true })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})
