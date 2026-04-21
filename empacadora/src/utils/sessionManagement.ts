import { supabase } from '../supabase';

export interface SessionRecord {
  id: string;
  empresa_id: number;
  sesion_id: string;
  resolucion?: string;
  blend_mode?: string;
  jpeg_quality?: number;
  crop_bounds?: [[number, number], [number, number]] | null;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  nombre_sesion?: string;
  notas?: string;
  fotos_usadas?: number;
  fecha_vuelo?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Cargar sesiones guardadas de una empresa
 */
export async function loadSessionHistory(
  empresaId: number
): Promise<SessionRecord[]> {
  try {
    const { data, error } = await supabase
      .from('emp_sesiones_mosaicos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[sessionManagement] Error loading sessions:', error.message);
      return [];
    }

    return data || [];
  } catch (e: any) {
    console.error('[sessionManagement] Exception loading sessions:', e?.message);
    return [];
  }
}

/**
 * Guardar o actualizar una sesión
 */
export async function saveSession(
  empresaId: number,
  sessionId: string,
  sessionData: Partial<SessionRecord>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('emp_sesiones_mosaicos')
      .upsert(
        {
          empresa_id: empresaId,
          sesion_id: sessionId,
          ...sessionData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'empresa_id,sesion_id' }
      );

    if (error) {
      console.error('[sessionManagement] Error saving session:', error.message);
      return false;
    }

    console.log('[sessionManagement] ✓ Session saved:', sessionId);
    return true;
  } catch (e: any) {
    console.error('[sessionManagement] Exception saving session:', e?.message);
    return false;
  }
}

/**
 * Eliminar una sesión
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('emp_sesiones_mosaicos')
      .delete()
      .eq('id', sessionId);

    if (error) {
      console.error('[sessionManagement] Error deleting session:', error.message);
      return false;
    }

    console.log('[sessionManagement] ✓ Session deleted:', sessionId);
    return true;
  } catch (e: any) {
    console.error('[sessionManagement] Exception deleting session:', e?.message);
    return false;
  }
}

/**
 * Persistir settings en localStorage
 */
const SETTINGS_KEY = 'dronmosaico_lab_settings_v2';

export interface AdvancedSettings {
  resolution: 'low' | 'medium' | 'high';
  blendMode: 'normal' | 'lighten' | 'overlay' | 'screen';
  jpegQuality: number;
  autoSave: boolean;
}

export function loadSettingsFromLocalStorage(): AdvancedSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('[sessionManagement] Error loading settings from localStorage');
  }

  // Defaults
  return {
    resolution: 'medium',
    blendMode: 'normal',
    jpegQuality: 90,
    autoSave: true,
  };
}

export function saveSettingsToLocalStorage(settings: AdvancedSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('[sessionManagement] Error saving settings to localStorage:', e);
  }
}
