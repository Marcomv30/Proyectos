/**
 * POST /api/backfill/exoneracion
 * Re-parsea los XML almacenados y rellena exoneracion_numero / exoneracion_institucion
 * en comprobantes_lineas para todos los comprobantes de una empresa.
 */

import fs from 'fs-extra';
import { requirePermission } from '../lib/authz.js';

// Extrae texto de una tag XML en un bloque de texto
function getText(bloque, tag) {
  const m = bloque.match(new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

// Extrae los datos de exoneración de cada LineaDetalle (num_linea → {numero, institucion})
function extraerExoneraciones(xmlText) {
  const resultado = new Map(); // num_linea (1-based) → { numero, institucion }
  const lineaRegex = /<LineaDetalle>([\s\S]*?)<\/LineaDetalle>/g;
  let match;
  let numLinea = 1;

  while ((match = lineaRegex.exec(xmlText)) !== null) {
    const bloque = match[1];
    const exonMatch = bloque.match(/<Exoneracion>([\s\S]*?)<\/Exoneracion>/i);
    if (exonMatch) {
      const getEx = (tag) => getText(exonMatch[1], tag);
      resultado.set(numLinea, {
        exoneracion_numero:      getEx('NumeroDocumento') || null,
        exoneracion_institucion: getEx('NombreInstitucion') || null,
      });
    }
    numLinea++;
  }
  return resultado;
}

export async function backfillExoneracion(req, res) {
  const empresa_id = Number(req.query.empresa_id || req.body?.empresa_id || process.env.EMPRESA_ID || 1);
  const ctx = await requirePermission(req, res, empresa_id, 'contabilidad:editar');
  if (!ctx) return;
  const supabase = ctx.sb;

  try {
    // 1. Traer todos los comprobantes con archivo_xml
    const { data: comprobantes, error: cErr } = await supabase
      .from('comprobantes_recibidos')
      .select('id, archivo_xml')
      .eq('empresa_id', empresa_id)
      .not('archivo_xml', 'is', null);

    if (cErr) return res.status(500).json({ ok: false, error: cErr.message });

    let procesados = 0, actualizadas = 0, errores = [];

    for (const comp of comprobantes) {
      try {
        if (!comp.archivo_xml || !(await fs.pathExists(comp.archivo_xml))) continue;

        const xmlText = await fs.readFile(comp.archivo_xml, 'utf-8');
        const exonMap = extraerExoneraciones(xmlText);
        if (exonMap.size === 0) { procesados++; continue; }

        // 2. Traer las líneas existentes de este comprobante
        const { data: lineas, error: lErr } = await supabase
          .from('comprobantes_lineas')
          .select('id, num_linea')
          .eq('comprobante_id', comp.id)
          .order('num_linea');

        if (lErr || !lineas?.length) { procesados++; continue; }

        // 3. Actualizar cada línea que tiene exoneración
        for (const linea of lineas) {
          const exon = exonMap.get(linea.num_linea);
          if (!exon) continue;

          const { error: uErr } = await supabase
            .from('comprobantes_lineas')
            .update({
              exoneracion_numero:      exon.exoneracion_numero,
              exoneracion_institucion: exon.exoneracion_institucion,
            })
            .eq('id', linea.id);

          if (uErr) errores.push(`Comp ${comp.id} línea ${linea.num_linea}: ${uErr.message}`);
          else actualizadas++;
        }
        procesados++;
      } catch (e) {
        errores.push(`Comp ${comp.id}: ${e.message}`);
      }
    }

    res.json({
      ok:         true,
      procesados,
      actualizadas,
      errores:    errores.slice(0, 20),
    });

  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
