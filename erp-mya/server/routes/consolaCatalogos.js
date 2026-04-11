import express from 'express'
import { adminSb, requirePermission, requireSuperuser } from '../lib/authz.js'

export const consolaCatalogosRouter = express.Router()

function normalizePayload(body = {}) {
  return {
    tipo_dispositivo: String(body.tipo_dispositivo || 'tag').trim().toLowerCase(),
    identificador_uid: String(body.identificador_uid || '').trim(),
    alias: String(body.alias || '').trim() || null,
    estado: String(body.estado || 'activo').trim().toLowerCase(),
    usuario_id: body.usuario_id ? Number(body.usuario_id) : null,
    attendant_id: String(body.attendant_id || '').trim() || null,
    operador_nombre: String(body.operador_nombre || '').trim() || null,
    vehiculo_codigo: String(body.vehiculo_codigo || '').trim() || null,
    placa: String(body.placa || '').trim() || null,
    pump_id_preferido: body.pump_id_preferido ? Number(body.pump_id_preferido) : null,
    grade_id_preferido: body.grade_id_preferido ? Number(body.grade_id_preferido) : null,
    payment_type: String(body.payment_type || '').trim() || null,
    payment_info: String(body.payment_info || '').trim() || null,
    notas: String(body.notas || '').trim() || null,
  }
}

consolaCatalogosRouter.get('/dispositivos', async (req, res) => {
  const empresaId = Number(req.query.empresa_id)
  if (!empresaId) return res.status(400).json({ ok: false, error: 'empresa_id requerido' })

  const ctx = await requirePermission(req, res, empresaId, 'combustible:ver')
  if (!ctx) return

  const sb = adminSb()
  const { data, error } = await sb
    .from('comb_dispositivos_identidad')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('alias', { ascending: true })
    .order('identificador_uid', { ascending: true })

  if (error) return res.status(500).json({ ok: false, error: error.message })
  res.json(data || [])
})

consolaCatalogosRouter.post('/dispositivos', async (req, res) => {
  const empresaId = Number(req.body?.empresa_id)
  if (!empresaId) return res.status(400).json({ ok: false, error: 'empresa_id requerido' })

  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const payload = normalizePayload(req.body)
  if (!payload.identificador_uid) {
    return res.status(400).json({ ok: false, error: 'identificador_uid requerido' })
  }

  const sb = adminSb()
  const { data, error } = await sb
    .from('comb_dispositivos_identidad')
    .insert({
      empresa_id: empresaId,
      ...payload,
    })
    .select('*')
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })
  res.status(201).json(data)
})

consolaCatalogosRouter.put('/dispositivos/:id', async (req, res) => {
  const empresaId = Number(req.body?.empresa_id)
  const id = Number(req.params.id)
  if (!empresaId || !id) {
    return res.status(400).json({ ok: false, error: 'empresa_id e id requeridos' })
  }

  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const payload = normalizePayload(req.body)
  if (!payload.identificador_uid) {
    return res.status(400).json({ ok: false, error: 'identificador_uid requerido' })
  }

  const sb = adminSb()

  // Leer estado anterior para bitácora
  const { data: anterior } = await sb
    .from('comb_dispositivos_identidad')
    .select('operador_nombre, attendant_id, alias, estado')
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle()

  const { data, error } = await sb
    .from('comb_dispositivos_identidad')
    .update(payload)
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select('*')
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })

  // Registrar en bitácora si cambió el operador o el estado
  const cambiaron = []
  if (anterior?.operador_nombre !== payload.operador_nombre) cambiaron.push('operador_nombre')
  if (anterior?.estado !== payload.estado) cambiaron.push('estado')

  if (cambiaron.length > 0) {
    const cambiado_por = ctx.usuario?.nombre || ctx.authUser?.email || null
    await sb.from('comb_dispositivos_bitacora').insert({
      empresa_id       : empresaId,
      dispositivo_id   : id,
      attendant_id     : data.attendant_id,
      operador_anterior: anterior?.operador_nombre || null,
      operador_nuevo   : payload.operador_nombre || null,
      campo_cambiado   : cambiaron.join(', '),
      cambiado_por,
    })
  }

  res.json(data)
})

consolaCatalogosRouter.post('/dispositivos/registrar-lectura', async (req, res) => {
  const empresaId = Number(req.body?.empresa_id)
  const identificador = String(
    req.body?.identificador_uid ||
      req.body?.device_id ||
      req.body?.card_number ||
      '',
  ).trim()

  if (!empresaId || !identificador) {
    return res.status(400).json({ ok: false, error: 'empresa_id e identificador requeridos' })
  }

  const ctx = await requirePermission(req, res, empresaId, 'combustible:ver')
  if (!ctx) return

  const sb = adminSb()
  const { data, error } = await sb
    .from('comb_dispositivos_identidad')
    .update({ ultimo_leido_at: new Date().toISOString() })
    .eq('empresa_id', empresaId)
    .eq('identificador_uid', identificador)
    .select('*')
    .maybeSingle()

  if (error) return res.status(500).json({ ok: false, error: error.message })
  res.json({ ok: true, dispositivo: data || null })
})
