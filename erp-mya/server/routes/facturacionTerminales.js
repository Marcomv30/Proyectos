/**
 * facturacionTerminales.js — CRUD de terminales FE por empresa
 *
 * GET    /api/facturacion/terminales?empresa_id=X
 * POST   /api/facturacion/terminales
 * PUT    /api/facturacion/terminales/:id
 * DELETE /api/facturacion/terminales/:id?empresa_id=X
 */
import { adminSb, requirePermission } from '../lib/authz.js';

export async function getTerminales(req, res) {
  try {
    const empresaId = Number(req.query.empresa_id || 0);
    if (!empresaId) return res.status(400).json({ error: 'empresa_id requerido' });
    const sb = adminSb();
    const { data, error } = await sb
      .from('fe_terminales')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('sucursal')
      .order('punto_venta');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function crearTerminal(req, res) {
  try {
    const { empresa_id, nombre, sucursal, punto_venta, es_defecto } = req.body;
    if (!empresa_id || !nombre || !sucursal || !punto_venta)
      return res.status(400).json({ error: 'Faltan campos requeridos: empresa_id, nombre, sucursal, punto_venta' });
    const ctx = await requirePermission(req, res, Number(empresa_id), 'facturacion:editar');
    if (!ctx) return;
    const sb = adminSb();
    const { data, error } = await sb
      .from('fe_terminales')
      .insert({
        empresa_id:  Number(empresa_id),
        nombre:      String(nombre).trim(),
        sucursal:    String(sucursal).padStart(3, '0'),
        punto_venta: String(punto_venta).padStart(5, '0'),
        es_defecto:  !!es_defecto,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function actualizarTerminal(req, res) {
  try {
    const id = Number(req.params.id);
    const { empresa_id, nombre, sucursal, punto_venta, activo, es_defecto } = req.body;
    if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' });
    const ctx = await requirePermission(req, res, Number(empresa_id), 'facturacion:editar');
    if (!ctx) return;
    const sb = adminSb();
    const { data, error } = await sb
      .from('fe_terminales')
      .update({
        nombre:      String(nombre || '').trim(),
        sucursal:    String(sucursal || '001').padStart(3, '0'),
        punto_venta: String(punto_venta || '00001').padStart(5, '0'),
        activo:      activo !== false,
        es_defecto:  !!es_defecto,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function eliminarTerminal(req, res) {
  try {
    const id = Number(req.params.id);
    const empresaId = Number(req.query.empresa_id || 0);
    if (!empresaId) return res.status(400).json({ error: 'empresa_id requerido' });
    const ctx = await requirePermission(req, res, empresaId, 'facturacion:editar');
    if (!ctx) return;
    const sb = adminSb();
    const { error } = await sb.from('fe_terminales').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
