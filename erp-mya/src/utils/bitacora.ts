import { supabase } from '../supabase';

interface LogModuloEventoParams {
  empresaId: number;
  modulo: string;
  accion: string;
  entidad?: string;
  entidadId?: string | number | null;
  descripcion?: string;
  detalle?: Record<string, unknown>;
}

export async function logModuloEvento(params: LogModuloEventoParams): Promise<void> {
  const empresaId = Number(params.empresaId || 0);
  const modulo = String(params.modulo || '').trim();
  const accion = String(params.accion || '').trim();
  if (!empresaId || !modulo || !accion) return;

  try {
    await supabase.rpc('log_modulo_evento', {
      p_empresa_id: empresaId,
      p_modulo: modulo,
      p_accion: accion,
      p_entidad: params.entidad || null,
      p_entidad_id: params.entidadId == null ? null : String(params.entidadId),
      p_descripcion: params.descripcion || null,
      p_detalle: params.detalle || {},
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch {
    // La bitacora no debe bloquear la operacion principal.
  }
}
