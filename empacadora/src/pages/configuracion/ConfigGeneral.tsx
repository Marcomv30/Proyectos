import React, { useEffect, useRef, useState } from 'react';
import { Save, Building2, Upload, X } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { inputCls, labelCls, btnPrimary, errorCls } from '../../components/ui';

interface Config {
  nombre_emisor:    string;
  nombre_comercial: string;
  nombre_planta:    string;
  logo_url:         string;
  telefono:         string;
  correo_respuesta: string;
  contacto:         string;
  codigo_exportador_default: string;
  ggn_global_gap_default: string;
}

const EMPTY: Config = {
  nombre_emisor: '', nombre_comercial: '', nombre_planta: '', logo_url: '',
  telefono: '', correo_respuesta: '', contacto: '',
  codigo_exportador_default: '', ggn_global_gap_default: '',
};

export default function ConfigGeneral() {
  const empresaId  = useEmpresaId();
  const fileRef    = useRef<HTMLInputElement>(null);
  const [form,     setForm]     = useState<Config>(EMPTY);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [uploading,setUploading]= useState(false);
  const [error,    setError]    = useState('');
  const [ok,       setOk]       = useState(false);

  useEffect(() => {
    async function load() {
      let data: any = null;
      const primary = await supabase
        .from('fe_config_empresa')
        .select('nombre_emisor, nombre_comercial, nombre_planta, logo_url, telefono, correo_respuesta, contacto, codigo_exportador_default, ggn_global_gap_default')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (primary.error && /codigo_exportador_default|ggn_global_gap_default/i.test(primary.error.message || '')) {
        const fallback = await supabase
          .from('fe_config_empresa')
          .select('nombre_emisor, nombre_comercial, nombre_planta, logo_url, telefono, correo_respuesta, contacto')
          .eq('empresa_id', empresaId)
          .maybeSingle();
        data = fallback.data || null;
      } else {
        data = primary.data || null;
      }

      if (data) setForm({
        nombre_emisor: data.nombre_emisor || '',
        nombre_comercial: data.nombre_comercial || '',
        nombre_planta: data.nombre_planta || '',
        logo_url: data.logo_url || '',
        telefono: data.telefono || '',
        correo_respuesta: data.correo_respuesta || '',
        contacto: data.contacto || '',
        codigo_exportador_default: data.codigo_exportador_default || '',
        ggn_global_gap_default: data.ggn_global_gap_default || '',
      });
      setLoading(false);
    }
    load();
  }, [empresaId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setOk(false);
    const payload: any = { empresa_id: empresaId, ...form };
    let err: any = null;
    let saveResult = await supabase
      .from('fe_config_empresa')
      .upsert(payload, { onConflict: 'empresa_id' });
    err = saveResult.error;

    if (err && /codigo_exportador_default|ggn_global_gap_default/i.test(err.message || '')) {
      const fallbackPayload = {
        empresa_id: empresaId,
        nombre_emisor: form.nombre_emisor,
        nombre_comercial: form.nombre_comercial,
        nombre_planta: form.nombre_planta,
        logo_url: form.logo_url,
        telefono: form.telefono,
        correo_respuesta: form.correo_respuesta,
        contacto: form.contacto,
      };
      saveResult = await supabase
        .from('fe_config_empresa')
        .upsert(fallbackPayload, { onConflict: 'empresa_id' });
      err = saveResult.error;
    }
    setSaving(false);
    if (err) { setError(err.message); return; }
    setOk(true);
    setTimeout(() => setOk(false), 3000);
    window.dispatchEvent(new CustomEvent('empresa-config-updated'));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('El archivo debe ser una imagen.'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('El logo no debe superar 2 MB.'); return; }

    setUploading(true); setError('');
    const ext  = file.name.split('.').pop() || 'png';
    const path = `empresa_${empresaId}/logo.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) { setError('Error al subir imagen: ' + upErr.message); setUploading(false); return; }

    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path);
    // Añadir timestamp para evitar caché del navegador
    const url = urlData.publicUrl + '?t=' + Date.now();
    setForm(f => ({ ...f, logo_url: url }));
    setUploading(false);
    // Limpiar el input para permitir subir el mismo archivo de nuevo
    if (fileRef.current) fileRef.current.value = '';
  }

  const F = (key: keyof Config, label: string, placeholder = '') => (
    <div>
      <label className={labelCls}>{label}</label>
      <input className={inputCls} value={form[key]}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--ink-muted)' }}>
      Cargando configuración...
    </div>
  );

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Building2 size={22} style={{ color: 'var(--accent)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Configuración General</h1>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {F('nombre_planta',    'Nombre de la Planta',      'Ej: Planta Tialez')}
        {F('nombre_emisor',    'Razón Social / Emisor',    'Ej: Agropecuaria Vasquez y Zúñiga, S. A.')}
        {F('nombre_comercial', 'Nombre Comercial',         'Ej: Thialez')}
        {F('telefono',         'Teléfono',                 'Ej: 2400-0000')}
        {F('correo_respuesta', 'Correo electrónico',       'Ej: info@thialez.com')}
        {F('contacto',         'Persona de contacto',      'Ej: Juan Pérez')}

        {F('codigo_exportador_default', 'Codigo exportador por defecto', 'Ej: 4128 o EXP-002')}
        {F('ggn_global_gap_default', 'GGN GlobalG.A.P. por defecto', 'Ej: 4052852198479')}

        {/* Logo */}
        <div>
          <label className={labelCls}>Logo de la Empresa</label>
          <div className="flex items-center gap-3 mt-1">
            {/* Vista previa */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
              border: '2px dashed var(--line)', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-raised)',
            }}>
              {form.logo_url
                ? <img src={form.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <Building2 size={24} style={{ color: 'var(--ink-faint)' }} />}
            </div>

            <div className="flex flex-col gap-2 flex-1">
              {/* Botón subir */}
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={handleLogoUpload} />
              <button type="button" disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded transition-colors"
                style={{ border: '1px solid var(--line)', background: 'var(--surface-raised)', color: 'var(--ink-muted)' }}>
                <Upload size={13} />
                {uploading ? 'Subiendo...' : 'Subir desde computadora'}
              </button>

              {/* URL manual */}
              <input className={inputCls} value={form.logo_url}
                placeholder="O pegar URL externa (https://...)"
                onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} />
            </div>

            {/* Quitar logo */}
            {form.logo_url && (
              <button type="button" onClick={() => setForm(f => ({ ...f, logo_url: '' }))}
                className="p-1 rounded" style={{ color: 'var(--ink-faint)' }}
                title="Quitar logo">
                <X size={14} />
              </button>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            PNG o JPG cuadrado, máximo 2 MB. Se almacena en Supabase Storage (bucket <code>logos</code>).
          </p>
        </div>

        {error && <p className={errorCls}>{error}</p>}
        {ok    && <p className="text-sm text-green-400">Configuración guardada correctamente.</p>}

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving || uploading} className={btnPrimary}>
            <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
