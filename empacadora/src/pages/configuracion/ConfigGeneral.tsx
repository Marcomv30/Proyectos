import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, Building2, Upload, X, Bell, Send, CheckCircle2, Clock } from 'lucide-react';
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

interface AlertaConfig {
  activo:       boolean;
  emails:       string;
  hora_envio:   number;
  solo_cambios: boolean;
}

interface AlertaLog {
  created_at:       string;
  estado:           string;
  materiales_count: number;
  emails_enviados:  string;
}

// ── Modal resultado prueba ───────────────────────────────────────────────────
function TestResultModal({ resultado, onClose }: { resultado: any; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-xl p-6 w-full max-w-md"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>Resultado del envío de prueba</h3>
          <button onClick={onClose} style={{ color: 'var(--ink-faint)' }}><X size={16} /></button>
        </div>
        <pre className="text-xs rounded p-3 overflow-auto max-h-64"
          style={{ background: 'var(--surface)', color: 'var(--ink-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(resultado, null, 2)}
        </pre>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className={btnPrimary}>Cerrar</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const EMPTY: Config = {
  nombre_emisor: '', nombre_comercial: '', nombre_planta: '', logo_url: '',
  telefono: '', correo_respuesta: '', contacto: '',
  codigo_exportador_default: '', ggn_global_gap_default: '',
};

const ALERTA_EMPTY: AlertaConfig = {
  activo: false, emails: '', hora_envio: 7, solo_cambios: true,
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

  // ── Alertas de Stock ───────────────────────────────────────────────────────
  const [alerta,      setAlerta]      = useState<AlertaConfig>(ALERTA_EMPTY);
  const [alertaLog,   setAlertaLog]   = useState<AlertaLog | null>(null);
  const [alertaSaving,setAlertaSaving]= useState(false);
  const [alertaOk,    setAlertaOk]    = useState(false);
  const [alertaErr,   setAlertaErr]   = useState('');
  const [testing,     setTesting]     = useState(false);
  const [testResult,  setTestResult]  = useState<any>(null);

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

      // ── Cargar config de alertas ─────────────────────────────────────────
      const [{ data: ac }, { data: al }] = await Promise.all([
        supabase
          .from('emp_alertas_config')
          .select('activo, emails, hora_envio, solo_cambios')
          .eq('empresa_id', empresaId)
          .maybeSingle(),
        supabase
          .from('emp_alertas_log')
          .select('created_at, estado, materiales_count, emails_enviados')
          .eq('empresa_id', empresaId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (ac) setAlerta({
        activo:       ac.activo ?? false,
        emails:       ac.emails ?? '',
        hora_envio:   ac.hora_envio ?? 7,
        solo_cambios: ac.solo_cambios ?? true,
      });
      if (al) setAlertaLog(al);

      setLoading(false);
    }
    load();
  }, [empresaId]);

  // ── Guardar config de alertas ────────────────────────────────────────────
  async function handleAlertaSave(e: React.FormEvent) {
    e.preventDefault();
    setAlertaSaving(true); setAlertaErr(''); setAlertaOk(false);
    const { error: err } = await supabase
      .from('emp_alertas_config')
      .upsert({ empresa_id: empresaId, ...alerta }, { onConflict: 'empresa_id' });
    setAlertaSaving(false);
    if (err) { setAlertaErr(err.message); return; }
    setAlertaOk(true);
    setTimeout(() => setAlertaOk(false), 3000);
  }

  // ── Enviar prueba (vía pg_net → sin CORS) ───────────────────────────────
  async function handleTestAlert() {
    setTesting(true); setAlertaErr('');
    try {
      const { data, error: err } = await supabase.rpc('emp_test_alertas', {
        p_empresa_id: empresaId,
      });
      if (err) { setAlertaErr('Error: ' + err.message); return; }
      setTestResult(data);
    } catch (e: any) {
      setAlertaErr('Error inesperado: ' + e.message);
    } finally {
      setTesting(false);
    }
  }

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

  // ── Horas para selector ──────────────────────────────────────────────────
  const HORAS = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: i === 0 ? '12:00 am (medianoche)' : i < 12
      ? `${i}:00 am`
      : i === 12 ? '12:00 pm (mediodía)' : `${i - 12}:00 pm`,
  }));

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

      {/* ════════════════════════════════════════════════════════════════════
          ALERTAS DE STOCK
      ════════════════════════════════════════════════════════════════════ */}
      <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 mb-5">
          <Bell size={20} style={{ color: 'var(--accent)' }} />
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Alertas de Stock por Correo</h2>
        </div>

        {/* Último envío */}
        {alertaLog && (
          <div className="mb-5 rounded-lg p-3 flex items-start gap-3"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
            <Clock size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--ink-faint)' }} />
            <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              <span className="font-medium" style={{ color: 'var(--ink)' }}>Último envío: </span>
              {new Date(alertaLog.created_at).toLocaleString('es-CR', {
                dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Costa_Rica',
              })}
              {' — '}
              <span style={{
                color: alertaLog.estado === 'enviado' ? '#4ade80'
                  : alertaLog.estado === 'error' ? '#f87171' : 'var(--ink-faint)',
              }}>
                {alertaLog.estado === 'enviado'   ? `✓ Enviado (${alertaLog.materiales_count} materiales)`
                  : alertaLog.estado === 'error'  ? '✗ Error al enviar'
                  : alertaLog.estado === 'sin_alertas' ? 'Sin alertas en ese momento'
                  : alertaLog.estado}
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleAlertaSave} className="flex flex-col gap-4">

          {/* Toggle activo */}
          <div className="flex items-center justify-between rounded-lg px-4 py-3"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {alerta.activo ? '🟢 Alertas activadas' : '⚫ Alertas desactivadas'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                Se revisará el stock cada hora y se enviará correo si hay materiales bajo el mínimo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAlerta(a => ({ ...a, activo: !a.activo }))}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
              style={{ background: alerta.activo ? 'var(--accent)' : 'var(--line)' }}>
              <span
                className="inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200"
                style={{ transform: alerta.activo ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>

          {/* Emails */}
          <div>
            <label className={labelCls}>Destinatarios (correos electrónicos)</label>
            <textarea
              className={inputCls}
              rows={3}
              placeholder={'gerencia@empresa.com\ncontabilidad@empresa.com'}
              value={alerta.emails}
              onChange={e => setAlerta(a => ({ ...a, emails: e.target.value }))}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
              Un correo por línea, o separados por coma.
            </p>
          </div>

          {/* Hora de envío */}
          <div>
            <label className={labelCls}>Hora de envío (zona horaria Costa Rica)</label>
            <select
              className={inputCls}
              value={alerta.hora_envio}
              onChange={e => setAlerta(a => ({ ...a, hora_envio: Number(e.target.value) }))}>
              {HORAS.map(h => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
              El cron se ejecuta cada hora; la función solo envía en la hora configurada.
            </p>
          </div>

          {/* Solo cambios */}
          <label className="flex items-start gap-3 cursor-pointer rounded-lg px-4 py-3"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
            <input
              type="checkbox"
              checked={alerta.solo_cambios}
              onChange={e => setAlerta(a => ({ ...a, solo_cambios: e.target.checked }))}
              className="mt-0.5 shrink-0 accent-blue-500"
            />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Solo cuando hay cambios</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                No reenvía si la cantidad de materiales en alerta es la misma que el último correo enviado hace menos de 20 horas.
              </p>
            </div>
          </label>

          {alertaErr && <p className={errorCls}>{alertaErr}</p>}
          {alertaOk  && (
            <p className="flex items-center gap-1.5 text-sm text-green-400">
              <CheckCircle2 size={14} /> Configuración guardada.
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            {/* Botón prueba */}
            <button
              type="button"
              disabled={testing}
              onClick={handleTestAlert}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors"
              style={{
                border: '1px solid var(--line)',
                background: 'var(--surface-raised)',
                color: 'var(--ink-muted)',
                opacity: testing ? 0.6 : 1,
              }}>
              <Send size={13} />
              {testing ? 'Enviando...' : 'Enviar prueba ahora'}
            </button>

            {/* Guardar */}
            <button type="submit" disabled={alertaSaving} className={btnPrimary}>
              <Save size={14} /> {alertaSaving ? 'Guardando...' : 'Guardar alertas'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal resultado prueba */}
      {testResult && (
        <TestResultModal resultado={testResult} onClose={() => setTestResult(null)} />
      )}
    </div>
  );
}
