// ============================================================
// MYA ERP — Brazaletes HID
// CRUD para catálogo de brazaletes y config de lectores HID
// ============================================================

import express from 'express'
import { adminSb, requirePermission } from '../lib/authz.js'
import { sesionesActivas } from '../services/virMonitor.js'

export const brazaletesRouter = express.Router()

let _broadcast = null
export function setBrazoleteBroadcast(fn) { _broadcast = fn }

// ── Buffer en memoria de lecturas crudas (para test de lector) ───────────────
// { [empresa_id]: { pump_id, uid, at } }
const _ultimaLectura = {}

// ── Brazaletes ────────────────────────────────────────────

// GET /api/brazaletes?empresa_id=4
brazaletesRouter.get('/', async (req, res) => {
  const { empresa_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  const { data, error } = await adminSb()
    .from('comb_brazaletes')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('operador_nombre')

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, brazaletes: data })
})

// POST /api/brazaletes
brazaletesRouter.post('/', async (req, res) => {
  const { empresa_id, bracelet_id, operador_nombre, attendant_id, notas } = req.body
  if (!empresa_id || !bracelet_id || !operador_nombre)
    return res.status(400).json({ error: 'empresa_id, bracelet_id y operador_nombre requeridos' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:crear')
  if (!ctx) return

  const { data, error } = await adminSb()
    .from('comb_brazaletes')
    .insert({ empresa_id, bracelet_id: String(bracelet_id).trim(), operador_nombre, attendant_id: attendant_id || null, notas: notas || null })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: `El brazalete ${bracelet_id} ya está registrado` })
    return res.status(500).json({ error: error.message })
  }
  res.json({ ok: true, brazalete: data })
})

// PUT /api/brazaletes/:id
brazaletesRouter.put('/:id', async (req, res) => {
  const { empresa_id, operador_nombre, attendant_id, estado, notas } = req.body
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:editar')
  if (!ctx) return

  const updates = { updated_at: new Date().toISOString() }
  if (operador_nombre !== undefined) updates.operador_nombre = operador_nombre
  if (attendant_id   !== undefined) updates.attendant_id   = attendant_id || null
  if (estado         !== undefined) updates.estado         = estado
  if (notas          !== undefined) updates.notas          = notas || null

  const { data, error } = await adminSb()
    .from('comb_brazaletes')
    .update(updates)
    .eq('id', req.params.id)
    .eq('empresa_id', empresa_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, brazalete: data })
})

// DELETE /api/brazaletes/:id
brazaletesRouter.delete('/:id', async (req, res) => {
  const { empresa_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:eliminar')
  if (!ctx) return

  const { error } = await adminSb()
    .from('comb_brazaletes')
    .delete()
    .eq('id', req.params.id)
    .eq('empresa_id', empresa_id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ── Lectores HID ──────────────────────────────────────────

// GET /api/brazaletes/lectores?empresa_id=4
brazaletesRouter.get('/lectores', async (req, res) => {
  const { empresa_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  const { data, error } = await adminSb()
    .from('comb_hid_lectores')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('pump_id')

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, lectores: data })
})

// PUT /api/brazaletes/lectores/:id
brazaletesRouter.put('/lectores/:id', async (req, res) => {
  const { empresa_id, pump_id, descripcion, activo } = req.body
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:editar')
  if (!ctx) return

  const updates = {}
  if (pump_id      !== undefined) updates.pump_id      = pump_id
  if (descripcion  !== undefined) updates.descripcion  = descripcion
  if (activo       !== undefined) updates.activo       = activo

  const { data, error } = await adminSb()
    .from('comb_hid_lectores')
    .update(updates)
    .eq('id', req.params.id)
    .eq('empresa_id', empresa_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, lector: data })
})

// POST /api/brazaletes/lectura  — llamado por el agente HID de cada PC de pista
brazaletesRouter.post('/lectura', async (req, res) => {
  // Autenticación por AGENT_SECRET (no requiere JWT)
  const authHeader = req.headers.authorization || ''
  const secret = authHeader.startsWith('Agent ') ? authHeader.slice(6) : ''
  if (!secret || secret !== process.env.AGENT_SECRET) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  const { empresa_id, pump_id, uid } = req.body
  if (!empresa_id || !pump_id || !uid)
    return res.status(400).json({ error: 'empresa_id, pump_id y uid requeridos' })

  // Guardar lectura cruda para el test de lector (independiente del registro)
  _ultimaLectura[empresa_id] = { pump_id, uid: String(uid).trim(), at: new Date().toISOString() }

  const sb = adminSb()

  // Resolver dispositivo
  const { data: device } = await sb
    .from('comb_dispositivos_identidad')
    .select('id, operador_nombre, alias, attendant_id')
    .eq('empresa_id', empresa_id)
    .eq('estado', 'activo')
    .or(`identificador_uid.eq.${String(uid).trim()},attendant_id.eq.${String(uid).trim()}`)
    .maybeSingle()

  if (!device) {
    console.warn(`[HID] uid=${uid} no registrado (empresa=${empresa_id} pump=${pump_id})`)
    return res.json({ ok: false, error: 'Dispositivo no registrado o inactivo' })
  }

  const nombre = device.operador_nombre || device.alias || uid

  // Registrar sesión en memoria — Fusion PG recibe attendant_id vía REQ_PUMP_AUTH_ID
  sesionesActivas[Number(pump_id)] = {
    id              : null,
    pump_id         : Number(pump_id),
    attendant_id    : device.attendant_id || null,
    operador_nombre : nombre,
    inicio_at       : new Date().toISOString(),
    origen          : 'hid_agente',
  }
  console.log(`[HID] Sesión abierta — ${nombre} → Bomba ${pump_id}`)

  if (_broadcast) _broadcast(Number(empresa_id), 'pistero_asignado', {
    pump_id        : Number(pump_id),
    operador_nombre: nombre,
    attendant_id   : device.attendant_id || null,
    dispositivo_id : device.id,
    origen         : 'hid',
  })

  res.json({ ok: true, operador_nombre: nombre })
})

// GET /api/brazaletes/test-scan?empresa_id=4&since=<ISO>
// Devuelve la última lectura cruda del agente después de `since` (no requiere registro)
brazaletesRouter.get('/test-scan', async (req, res) => {
  const { empresa_id, since } = req.query
  if (!empresa_id || !since) return res.status(400).json({ error: 'empresa_id y since requeridos' })

  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  const lectura = _ultimaLectura[empresa_id]
  if (!lectura || lectura.at <= since) return res.json({ found: false })

  res.json({ found: true, pump_id: lectura.pump_id, uid: lectura.uid })
})

// GET /api/brazaletes/buscar?empresa_id=4&uid=3045679459
// Resuelve un UID leído por lector HID → dispositivo registrado
brazaletesRouter.get('/buscar', async (req, res) => {
  const { empresa_id, uid } = req.query
  if (!empresa_id || !uid) return res.status(400).json({ error: 'empresa_id y uid requeridos' })

  const uidStr = String(uid).trim()
  const { data, error } = await adminSb()
    .from('comb_dispositivos_identidad')
    .select('id, operador_nombre, alias, attendant_id, estado')
    .eq('empresa_id', empresa_id)
    .eq('estado', 'activo')
    .or(`identificador_uid.eq.${uidStr},attendant_id.eq.${uidStr}`)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.json({ ok: false, error: 'Dispositivo no registrado o inactivo' })
  res.json({ ok: true, dispositivo: data })
})
