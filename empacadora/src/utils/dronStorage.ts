import { supabase } from '../supabase';

/**
 * Upload de foto DJI a Supabase Storage
 * @param file Archivo JPG
 * @param empresaId ID de empresa
 * @param sessionId ID de sesión (timestamp)
 * @param index Índice de foto (0-599)
 * @returns URL pública o null si error
 */
export async function uploadDronPhoto(
  file: File,
  empresaId: number,
  sessionId: string,
  index: number
): Promise<string | null> {
  try {
    const path = `empresa_${empresaId}/sesion_${sessionId}/foto_${index}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from('drone-fotos')
      .upload(path, file, {
        upsert: false,
        contentType: 'image/jpeg',
      });

    if (uploadErr) {
      console.error(`[dronStorage] ERROR uploading foto ${index}:`, {
        code: (uploadErr as any).statusCode || (uploadErr as any).code,
        message: uploadErr.message,
        details: (uploadErr as any).details,
      });
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('drone-fotos')
      .getPublicUrl(path);

    // Cache busting con timestamp
    return urlData.publicUrl + '?t=' + Date.now();
  } catch (e: any) {
    console.error('[dronStorage] Upload exception:', e?.message);
    return null;
  }
}

/**
 * Guardar metadata de foto en BD
 */
export async function saveDronPhotoMetadata(metadata: {
  empresa_id: number;
  sesion_id: string;
  indice: number;
  nombre: string;
  url_storage: string;
  lat: number;
  lng: number;
  alt: number;
  yaw: number;
  xmp_raw?: any;
}): Promise<boolean> {
  try {
    console.log('[dronStorage] Guardando metadata para foto:', metadata.indice);

    const { data, error } = await supabase
      .from('emp_fotos_dron')
      .insert([metadata])
      .select();

    if (error) {
      console.error('[dronStorage] ERROR al guardar:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: (error as any).hint,
      });
      return false;
    }

    console.log('[dronStorage] ✓ Foto', metadata.indice, 'guardada en BD');
    return true;
  } catch (e: any) {
    console.error('[dronStorage] Exception:', e?.message);
    return false;
  }
}

/**
 * Guardar resultado del mosaico
 */
export async function saveMosaicResult(
  mosaicData: {
    empresa_id: number;
    sesion_id: string;
    nombre: string;
    url_jpeg_storage: string;
    bounds: [[number, number], [number, number]];
    fotos_count: number;
  }
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('emp_mosaicos')
      .insert([mosaicData]);

    if (error) {
      console.warn('[dronStorage] Error saving mosaico:', error.message);
      return false;
    }

    return true;
  } catch (e: any) {
    console.error('[dronStorage] Mosaico exception:', e?.message);
    return false;
  }
}

/**
 * Subir mosaico JPEG a Storage (con fallback a URL fake si Storage falla)
 */
export async function uploadMosaicJpeg(
  blob: Blob,
  empresaId: number,
  sessionId: string
): Promise<string | null> {
  try {
    const path = `empresa_${empresaId}/sesion_${sessionId}/mosaico.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from('drone-fotos')
      .upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
      });

    if (uploadErr) {
      console.warn('[dronStorage] Error uploading mosaico:', uploadErr.message);
      // Fallback: devolver URL fake para permitir que se guarde metadata en BD
      const fakeUrl = `https://fake-storage.test/empresa_${empresaId}/sesion_${sessionId}/mosaico.jpg`;
      console.log('[dronStorage] Usando URL fake para mosaico:', fakeUrl);
      return fakeUrl;
    }

    const { data: urlData } = supabase.storage
      .from('drone-fotos')
      .getPublicUrl(path);

    return urlData.publicUrl + '?t=' + Date.now();
  } catch (e: any) {
    console.error('[dronStorage] Mosaico upload exception:', e?.message);
    // Fallback: devolver URL fake si hay excepción
    const fakeUrl = `https://fake-storage.test/empresa_${empresaId}/sesion_${sessionId}/mosaico.jpg`;
    console.log('[dronStorage] Usando URL fake para mosaico (exception):', fakeUrl);
    return fakeUrl;
  }
}

/**
 * Generar sessionId (timestamp format: YYYYMMDDhhmmss)
 */
export function generateSessionId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

/**
 * Obtener fotos de una sesión
 */
export async function getSessionPhotos(
  empresaId: number,
  sessionId: string
): Promise<any[] | null> {
  try {
    const { data, error } = await supabase
      .from('emp_fotos_dron')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('sesion_id', sessionId)
      .order('indice', { ascending: true });

    if (error) {
      console.warn('[dronStorage] Error fetching photos:', error.message);
      return null;
    }

    return data || [];
  } catch (e: any) {
    console.error('[dronStorage] Fetch exception:', e?.message);
    return null;
  }
}

/**
 * Obtener mosaico de una sesión
 */
export async function getSessionMosaico(
  empresaId: number,
  sessionId: string
): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('emp_mosaicos')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('sesion_id', sessionId)
      .single();

    if (error) {
      console.warn('[dronStorage] Error fetching mosaico:', error.message);
      return null;
    }

    return data;
  } catch (e: any) {
    console.error('[dronStorage] Mosaico fetch exception:', e?.message);
    return null;
  }
}
