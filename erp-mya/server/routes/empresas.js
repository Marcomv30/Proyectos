// ─── Operaciones de empresa que requieren service role ────────────────────────
import { requirePermission } from '../lib/authz.js';

// GET /api/empresas/:id/modulos
// Devuelve override_ids (específicos de empresa) y actividad_ids (heredados de la actividad)
export async function getEmpresaModulos(req, res) {
  const empresa_id = Number(req.params.id);
  if (!empresa_id) return res.status(400).json({ ok: false, error: 'empresa_id requerido' });

  const ctx = await requirePermission(req, res, empresa_id, 'mantenimientos:aprobar');
  if (!ctx) return;
  const sb = ctx.sb;

  // Obtener override de empresa
  const { data: overrideRows } = await sb
    .from('empresa_modulos')
    .select('modulo_id')
    .eq('empresa_id', empresa_id);
  const override_ids = (overrideRows || []).map(r => Number(r.modulo_id));

  // Obtener actividad_id de la empresa
  const { data: empresaData } = await sb
    .from('empresas')
    .select('actividad_id')
    .eq('id', empresa_id)
    .maybeSingle();

  let actividad_ids = [];
  console.log('[empresas] empresa_id=%d empresaData=%o', empresa_id, empresaData);
  if (empresaData?.actividad_id) {
    const { data: actRows, error: actErr } = await sb
      .from('actividad_modulos')
      .select('modulo_id')
      .eq('actividad_id', empresaData.actividad_id);
    console.log('[empresas] actividad_id=%d actRows=%o actErr=%o', empresaData.actividad_id, actRows, actErr);
    actividad_ids = (actRows || []).map(r => Number(r.modulo_id));
  }

  const has_override = override_ids.length > 0;
  return res.json({
    ok: true,
    has_override,
    modulo_ids:    has_override ? override_ids : actividad_ids,
    override_ids,
    actividad_ids,
  });
}

// POST /api/empresas/:id/modulos  { modulo_ids: number[] }
export async function setEmpresaModulos(req, res) {
  const empresa_id = Number(req.params.id);
  const { modulo_ids } = req.body || {};
  if (!empresa_id) return res.status(400).json({ ok: false, error: 'empresa_id requerido' });

  const ctx = await requirePermission(req, res, empresa_id, 'mantenimientos:aprobar');
  if (!ctx) return;
  const sb = ctx.sb;

  // Eliminar overrides existentes
  const { error: delErr } = await sb.from('empresa_modulos').delete().eq('empresa_id', empresa_id);
  if (delErr) return res.status(500).json({ ok: false, error: delErr.message });

  // Insertar nuevos (si hay seleccionados)
  if (modulo_ids?.length) {
    const rows = modulo_ids.map(id => ({ empresa_id, modulo_id: Number(id) }));
    const { error: insErr } = await sb.from('empresa_modulos').insert(rows);
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
  }

  return res.json({ ok: true });
}

// DELETE /api/empresas/:id/modulos
export async function clearEmpresaModulos(req, res) {
  const empresa_id = Number(req.params.id);
  if (!empresa_id) return res.status(400).json({ ok: false, error: 'empresa_id requerido' });

  const ctx = await requirePermission(req, res, empresa_id, 'mantenimientos:aprobar');
  if (!ctx) return;
  const { error } = await ctx.sb.from('empresa_modulos').delete().eq('empresa_id', empresa_id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
}
