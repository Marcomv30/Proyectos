import React, { useEffect, useMemo, useState } from 'react';
import { WorkspaceMainPanel, WorkspaceMetric, WorkspaceShell, WorkspaceSidebarSection } from '../../components/WorkspaceShell';
import { supabase } from '../../supabase';

interface Props {
  empresaId: number;
  canEdit?: boolean;
}

interface ConfigFe {
  empresa_id: number;
  ambiente: 'pruebas' | 'produccion';
  actividad_codigo: string;
  actividad_tributaria_id: number | null;
  sucursal: string;
  punto_venta: string;
  tipo_documento_defecto: string;
  condicion_venta_defecto: string;
  medio_pago_defecto: string;
  plazo_credito_dias: number;
  telefono: string;
  correo_envio: string;
  correo_respuesta: string;
  consulta_exoneracion_mh: boolean;
  activo: boolean;
  // Identidad visual (compartida con todas las apps ligadas)
  logo_url: string;
  nombre_planta: string;
  // Emisor XML
  nombre_emisor: string;
  tipo_identificacion: string;
  numero_identificacion: string;
  nombre_comercial: string;
  provincia: string;
  canton: string;
  distrito: string;
  barrio: string;
  otras_senas: string;
  telefono_emisor: string;
  tipo_cambio_usd: number;
  clave_aplicacion_encriptada?: string | null;
  stag_usuario?: string | null;
  stag_password_encriptada?: string | null;
  stag_usuario_produccion?: string | null;
  stag_password_produccion_encriptada?: string | null;
  certificado_password_encriptada?: string | null;
  certificado_pin_encriptado?: string | null;
  certificado_nombre_archivo?: string | null;
  certificado_ruta_interna?: string | null;
  certificado_vence_en?: string | null;
  certificado_actualizado_at?: string | null;
  certificado_password_produccion_encriptada?: string | null;
  certificado_pin_produccion_encriptado?: string | null;
  certificado_nombre_archivo_produccion?: string | null;
  certificado_ruta_interna_produccion?: string | null;
  certificado_vence_produccion_en?: string | null;
  certificado_actualizado_produccion_at?: string | null;
}

interface HaciendaSnapshot {
  cedula: string | null;
  nombre: string | null;
  tipo_identificacion: string | null;
  situacion: string | null;
  regimen: string | null;
  updated_at: string | null;
}

interface TerminalFe {
  id: number;
  empresa_id: number;
  nombre: string;
  sucursal: string;
  punto_venta: string;
  activo: boolean;
  es_defecto: boolean;
}

interface ActividadTribEmpresa {
  actividad_tributaria_id: number;
  principal: boolean;
  actividad_tributaria?: {
    codigo: string;
    descripcion: string;
  } | null;
}

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const emptyConfig = (empresaId: number): ConfigFe => ({
  empresa_id: empresaId,
  ambiente: 'pruebas',
  actividad_codigo: '',
  actividad_tributaria_id: null,
  sucursal: '001',
  punto_venta: '00001',
  tipo_documento_defecto: '01',
  condicion_venta_defecto: '01',
  medio_pago_defecto: '01',
  plazo_credito_dias: 0,
  telefono: '',
  correo_envio: '',
  correo_respuesta: '',
  consulta_exoneracion_mh: true,
  activo: true,
  nombre_emisor: '',
  tipo_identificacion: '02',
  numero_identificacion: '',
  nombre_comercial: '',
  logo_url: '',
  nombre_planta: '',
  provincia: '1',
  canton: '01',
  distrito: '01',
  barrio: '',
  otras_senas: '',
  telefono_emisor: '',
  tipo_cambio_usd: 530,
  clave_aplicacion_encriptada: null,
  stag_usuario: null,
  stag_password_encriptada: null,
  stag_usuario_produccion: null,
  stag_password_produccion_encriptada: null,
  certificado_password_encriptada: null,
  certificado_pin_encriptado: null,
  certificado_nombre_archivo: null,
  certificado_ruta_interna: null,
  certificado_vence_en: null,
  certificado_actualizado_at: null,
  certificado_password_produccion_encriptada: null,
  certificado_pin_produccion_encriptado: null,
  certificado_nombre_archivo_produccion: null,
  certificado_ruta_interna_produccion: null,
  certificado_vence_produccion_en: null,
  certificado_actualizado_produccion_at: null,
});

const styles = `
  .em-wrap { color:#e5e7eb; }
  .em-title { font-size:28px; font-weight:800; color:#f8fafc; margin-bottom:6px; }
  .em-sub { font-size:13px; color:#94a3b8; margin-bottom:18px; }
  .em-grid { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:12px; }
  .em-field { display:flex; flex-direction:column; gap:6px; }
  .em-field label { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#93c5fd; font-weight:700; }
  .em-input, .em-select { width:100%; border:1px solid #334155; background:#1f2937; color:#f8fafc; border-radius:10px; padding:10px 12px; font-size:13px; outline:none; }
  .em-input:focus, .em-select:focus { border-color:#38bdf8; box-shadow:0 0 0 1px rgba(56,189,248,.25); }
  .em-check { display:flex; align-items:center; gap:8px; padding-top:8px; color:#cbd5e1; font-size:13px; }
  .em-msg-ok, .em-msg-err, .em-msg-warn { border-radius:10px; padding:10px 12px; font-size:12px; margin-bottom:12px; }
  .em-msg-ok { border:1px solid #14532d; background:#052e16; color:#86efac; }
  .em-msg-err { border:1px solid #7f1d1d; background:#2b1111; color:#fca5a5; }
  .em-msg-warn { border:1px solid #854d0e; background:#2a1b06; color:#fcd34d; }
  .em-btns { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
  .em-btn { border-radius:10px; padding:10px 14px; font-size:13px; font-weight:700; cursor:pointer; border:1px solid #334155; background:#1f2937; color:#e5e7eb; }
  .em-btn.primary { background:#16a34a; border-color:#16a34a; color:#fff; }
  .em-btn.alt { background:#2563eb; border-color:#2563eb; color:#fff; }
  .em-btn:disabled { opacity:.65; cursor:not-allowed; }
  .em-mini { font-size:12px; color:#94a3b8; }
  .em-chip { display:inline-flex; align-items:center; border-radius:999px; padding:3px 8px; font-size:11px; font-weight:700; }
  .em-chip.ok { background:#052e16; color:#86efac; border:1px solid #14532d; }
  .em-chip.bad { background:#2b1111; color:#fca5a5; border:1px solid #7f1d1d; }
  .em-env-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
  .em-env-card { background:#0f172a; border:1px solid #334155; border-radius:14px; padding:18px; }
  .em-env-title { font-size:18px; font-weight:800; color:#f8fafc; margin-bottom:14px; }
  .em-env-form { display:grid; grid-template-columns:150px minmax(0,1fr); gap:12px 16px; align-items:center; }
  .em-env-label { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#93c5fd; font-weight:700; }
  .em-env-actions { display:flex; justify-content:center; margin-top:18px; }
  @media (max-width: 1100px) {
    .em-env-grid { grid-template-columns:1fr; }
    .em-env-form { grid-template-columns:1fr; }
  }
`;

function toDateInput(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function fmtTs(value?: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('es-CR');
}

export default function FacturacionConfiguracion({ empresaId, canEdit = false }: Props) {
  const [form, setForm] = useState<ConfigFe>(emptyConfig(empresaId));
  const [mhSnapshot, setMhSnapshot] = useState<HaciendaSnapshot | null>(null);
  const [actividades, setActividades] = useState<ActividadTribEmpresa[]>([]);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPin, setCertPin] = useState('');
  const [certVenceEn, setCertVenceEn] = useState('');
  const [certFileProd, setCertFileProd] = useState<File | null>(null);
  const [certPinProd, setCertPinProd] = useState('');
  const [certVenceEnProd, setCertVenceEnProd] = useState('');
  const [certBusy, setCertBusy] = useState(false);
  const [correoEnvio, setCorreoEnvio] = useState('');
  const [claveAplicacion, setClaveAplicacion] = useState('');
  const [stagUsuario, setStagUsuario] = useState('');
  const [stagPassword, setStagPassword] = useState('');
  const [stagUsuarioProduccion, setStagUsuarioProduccion] = useState('');
  const [stagPasswordProduccion, setStagPasswordProduccion] = useState('');
  const [credBusy, setCredBusy] = useState(false);

  // ── Terminales ──────────────────────────────────────────────────────────────
  const emptyTerminal = (): Omit<TerminalFe, 'id' | 'empresa_id'> => ({ nombre: '', sucursal: '001', punto_venta: '', activo: true, es_defecto: false });
  const [terminales, setTerminales] = useState<TerminalFe[]>([]);
  const [terminalForm, setTerminalForm] = useState<Omit<TerminalFe, 'id' | 'empresa_id'>>(emptyTerminal());
  const [terminalEditId, setTerminalEditId] = useState<number | null>(null);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalOk, setTerminalOk] = useState('');
  const [terminalError, setTerminalError] = useState('');

  const cargarTerminales = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    const resp = await fetch(`${API}/api/facturacion/terminales?empresa_id=${empresaId}`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await resp.json().catch(() => ({}));
    if (resp.ok) setTerminales((payload.data || []) as TerminalFe[]);
  };

  const guardarTerminal = async () => {
    if (!canEdit || terminalBusy) return;
    if (!terminalForm.nombre.trim() || !terminalForm.punto_venta.trim()) {
      setTerminalError('Nombre y punto de venta son requeridos.');
      return;
    }
    setTerminalBusy(true);
    setTerminalOk('');
    setTerminalError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sesion expirada.');
      const url = terminalEditId
        ? `${API}/api/facturacion/terminales/${terminalEditId}`
        : `${API}/api/facturacion/terminales`;
      const resp = await fetch(url, {
        method: terminalEditId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...terminalForm, empresa_id: empresaId }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload?.ok) throw new Error(String(payload?.error || 'No se pudo guardar la terminal.'));
      setTerminalOk(terminalEditId ? 'Terminal actualizada.' : 'Terminal creada.');
      setTerminalForm(emptyTerminal());
      setTerminalEditId(null);
      await cargarTerminales();
    } catch (e: any) {
      setTerminalError(String(e?.message || 'Error al guardar la terminal.'));
    } finally {
      setTerminalBusy(false);
    }
  };

  const eliminarTerminalById = async (id: number) => {
    if (!canEdit || terminalBusy) return;
    setTerminalBusy(true);
    setTerminalOk('');
    setTerminalError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sesion expirada.');
      const resp = await fetch(`${API}/api/facturacion/terminales/${id}?empresa_id=${empresaId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload?.ok) throw new Error(String(payload?.error || 'No se pudo eliminar la terminal.'));
      setTerminalOk('Terminal eliminada.');
      if (terminalEditId === id) { setTerminalForm(emptyTerminal()); setTerminalEditId(null); }
      await cargarTerminales();
    } catch (e: any) {
      setTerminalError(String(e?.message || 'Error al eliminar la terminal.'));
    } finally {
      setTerminalBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data, error: cfgErr }, { data: snapData }, { data: actData }, { data: empresaData }] = await Promise.all([
        supabase.from('fe_config_empresa').select('*').eq('empresa_id', empresaId).maybeSingle(),
        supabase.from('empresa_hacienda_snapshot').select('cedula,nombre,tipo_identificacion,situacion,regimen,updated_at').eq('empresa_id', empresaId).maybeSingle(),
        supabase.from('empresa_actividad_tributaria').select('actividad_tributaria_id,principal,actividad_tributaria(codigo,descripcion)').eq('empresa_id', empresaId).order('principal', { ascending: false }),
        supabase.from('empresas').select('nombre,cedula,telefono,email,domicilio,provincia,canton,distrito').eq('id', empresaId).maybeSingle(),
      ]);
      if (!alive) return;
      if (cfgErr) {
        setError(cfgErr.message);
        return;
      }
      const normalizedActs = ((actData || []) as any[]).map((r) => {
        const rel = Array.isArray(r.actividad_tributaria) ? r.actividad_tributaria[0] : r.actividad_tributaria;
        return { ...r, actividad_tributaria: rel || null } as ActividadTribEmpresa;
      });
      setMhSnapshot((snapData as HaciendaSnapshot) || null);
      setActividades(normalizedActs);

      if (data) {
        const empresa = (empresaData || {}) as any;
        const snap = (snapData || {}) as HaciendaSnapshot;
        setForm({
          ...emptyConfig(empresaId),
          ...data,
          actividad_codigo: String((data as any).actividad_codigo || ''),
          actividad_tributaria_id: Number((data as any).actividad_tributaria_id || 0) || null,
          correo_envio: String((data as any).correo_envio || empresa.email || ''),
          correo_respuesta: String((data as any).correo_respuesta || empresa.email || ''),
          telefono: String((data as any).telefono || empresa.telefono || ''),
          nombre_emisor: String((data as any).nombre_emisor || snap?.nombre || empresa.nombre || ''),
          tipo_identificacion: String((data as any).tipo_identificacion || '02'),
          numero_identificacion: String((data as any).numero_identificacion || snap?.cedula || empresa.cedula || ''),
          nombre_comercial: String((data as any).nombre_comercial || ''),
          provincia: String((data as any).provincia || empresa.provincia || '1'),
          canton: String((data as any).canton || empresa.canton || '01'),
          distrito: String((data as any).distrito || empresa.distrito || '01'),
          barrio: String((data as any).barrio || ''),
          otras_senas: String((data as any).otras_senas || empresa.domicilio || ''),
          telefono_emisor: String((data as any).telefono_emisor || empresa.telefono || ''),
          tipo_cambio_usd: Number((data as any).tipo_cambio_usd || 530),
          clave_aplicacion_encriptada: String((data as any).clave_aplicacion_encriptada || '') || null,
          stag_usuario: String((data as any).stag_usuario || '') || null,
          stag_password_encriptada: String((data as any).stag_password_encriptada || '') || null,
          stag_usuario_produccion: String((data as any).stag_usuario_produccion || '') || null,
          stag_password_produccion_encriptada: String((data as any).stag_password_produccion_encriptada || '') || null,
          certificado_password_encriptada: String((data as any).certificado_password_encriptada || '') || null,
          certificado_pin_encriptado: String((data as any).certificado_pin_encriptado || '') || null,
          certificado_nombre_archivo: String((data as any).certificado_nombre_archivo || '') || null,
          certificado_ruta_interna: String((data as any).certificado_ruta_interna || '') || null,
          certificado_vence_en: toDateInput((data as any).certificado_vence_en),
          certificado_actualizado_at: (data as any).certificado_actualizado_at || null,
          certificado_password_produccion_encriptada: String((data as any).certificado_password_produccion_encriptada || '') || null,
          certificado_pin_produccion_encriptado: String((data as any).certificado_pin_produccion_encriptado || '') || null,
          certificado_nombre_archivo_produccion: String((data as any).certificado_nombre_archivo_produccion || '') || null,
          certificado_ruta_interna_produccion: String((data as any).certificado_ruta_interna_produccion || '') || null,
          certificado_vence_produccion_en: toDateInput((data as any).certificado_vence_produccion_en),
          certificado_actualizado_produccion_at: (data as any).certificado_actualizado_produccion_at || null,
        });
        setCorreoEnvio(String((data as any).correo_envio || empresa.email || ''));
        setStagUsuario(String((data as any).stag_usuario || ''));
        setStagUsuarioProduccion(String((data as any).stag_usuario_produccion || ''));
        setCertVenceEn(toDateInput((data as any).certificado_vence_en));
        setCertVenceEnProd(toDateInput((data as any).certificado_vence_produccion_en));
      } else {
        const principal = normalizedActs.find((a) => a.principal) || normalizedActs[0] || null;
        const empresa = (empresaData || {}) as any;
        const snap = (snapData || {}) as HaciendaSnapshot;
        setForm((prev) => ({
          ...prev,
          actividad_tributaria_id: principal?.actividad_tributaria_id || null,
          actividad_codigo: principal?.actividad_tributaria?.codigo || '',
          correo_envio: String(empresa.email || prev.correo_envio || ''),
          correo_respuesta: String(empresa.email || prev.correo_respuesta || ''),
          telefono: String(empresa.telefono || prev.telefono || ''),
          nombre_emisor: String(snap?.nombre || empresa.nombre || prev.nombre_emisor || ''),
          tipo_identificacion: String(snap?.tipo_identificacion || prev.tipo_identificacion || '02'),
          numero_identificacion: String(snap?.cedula || empresa.cedula || prev.numero_identificacion || ''),
          provincia: String(empresa.provincia || prev.provincia || '1'),
          canton: String(empresa.canton || prev.canton || '01'),
          distrito: String(empresa.distrito || prev.distrito || '01'),
          otras_senas: String(empresa.domicilio || prev.otras_senas || ''),
          telefono_emisor: String(empresa.telefono || prev.telefono_emisor || ''),
        }));
        setCorreoEnvio(String(empresa.email || ''));
      }
    })();
    return () => { alive = false; };
  }, [empresaId]);

  useEffect(() => { void cargarTerminales(); }, [empresaId]);

  const actividadSeleccionada = useMemo(
    () => actividades.find((a) => a.actividad_tributaria_id === form.actividad_tributaria_id) || null,
    [actividades, form.actividad_tributaria_id]
  );

  const envioListo = Boolean(correoEnvio.trim() && (claveAplicacion.trim() || form.clave_aplicacion_encriptada));
  const pruebasListo = Boolean(stagUsuario.trim() && (stagPassword.trim() || form.stag_password_encriptada) && certFile && certPin.trim());
  const produccionListo = Boolean(
    stagUsuarioProduccion.trim() &&
    (stagPasswordProduccion.trim() || form.stag_password_produccion_encriptada) &&
    certFileProd &&
    certPinProd.trim()
  );

  const setField = <K extends keyof ConfigFe>(key: K, value: ConfigFe[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };


  const setActividad = (actividadId: number | null) => {
    const act = actividades.find((a) => a.actividad_tributaria_id === actividadId) || null;
    setForm((prev) => ({
      ...prev,
      actividad_tributaria_id: actividadId,
      actividad_codigo: act?.actividad_tributaria?.codigo || '',
    }));
  };

  const guardar = async () => {
    if (!canEdit || busy) return;
    setBusy(true);
    setOk('');
    setError('');
    try {
      const {
        clave_aplicacion_encriptada,
        stag_usuario,
        stag_password_encriptada,
        stag_usuario_produccion,
        stag_password_produccion_encriptada,
        certificado_password_encriptada,
        certificado_pin_encriptado,
        certificado_nombre_archivo,
        certificado_ruta_interna,
        certificado_vence_en,
        certificado_actualizado_at,
        certificado_password_produccion_encriptada,
        certificado_pin_produccion_encriptado,
        certificado_nombre_archivo_produccion,
        certificado_ruta_interna_produccion,
        certificado_vence_produccion_en,
        certificado_actualizado_produccion_at,
        ...editableForm
      } = form;
      const payload = {
        ...editableForm,
        actividad_codigo: form.actividad_codigo.trim() || null,
        actividad_tributaria_id: form.actividad_tributaria_id || null,
        correo_envio: correoEnvio.trim().toLowerCase() || null,
        correo_respuesta: form.correo_respuesta.trim() || null,
        telefono: form.telefono.trim() || null,
        certificado_vence_en: certVenceEn || form.certificado_vence_en || null,
        certificado_vence_produccion_en: form.certificado_vence_produccion_en || null,
        // Emisor XML — auto-poblar desde snapshot si están vacíos
        nombre_emisor: form.nombre_emisor.trim() || mhSnapshot?.nombre || null,
        tipo_identificacion: form.tipo_identificacion || mhSnapshot?.tipo_identificacion || '02',
        numero_identificacion: form.numero_identificacion.trim() || mhSnapshot?.cedula || null,
        nombre_comercial: form.nombre_comercial.trim() || null,
        provincia: form.provincia.trim() || null,
        canton: form.canton.trim() || null,
        distrito: form.distrito.trim() || null,
        barrio: form.barrio.trim() || null,
        otras_senas: form.otras_senas.trim() || null,
        telefono_emisor: form.telefono_emisor.trim() || null,
        tipo_cambio_usd: form.tipo_cambio_usd || 530,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('fe_config_empresa').upsert(payload, { onConflict: 'empresa_id' });
      if (error) throw error;
      setOk('Datos del emisor guardados.');
    } catch (e: any) {
      setError(String(e?.message || 'No se pudieron guardar los datos del emisor.'));
    } finally {
      setBusy(false);
    }
  };

  const subirCertificado = async (scope: 'pruebas' | 'produccion') => {
    if (!canEdit || certBusy) return;
    const currentFile = scope === 'produccion' ? certFileProd : certFile;
    const currentPin = scope === 'produccion' ? certPinProd : certPin;
    const currentPassword = scope === 'produccion' ? stagPasswordProduccion : stagPassword;
    const currentVenceEn = scope === 'produccion' ? certVenceEnProd : certVenceEn;
    if (!currentFile) {
      setError(`Debe seleccionar el archivo del certificado de ${scope === 'produccion' ? 'produccion' : 'pruebas'}.`);
      return;
    }
    if (!currentPin.trim()) {
      setError(`Debe indicar el PIN del certificado de ${scope === 'produccion' ? 'produccion' : 'pruebas'}.`);
      return;
    }
    if (!currentPassword.trim()) {
      setError(`Debe indicar la contrasena del certificado de ${scope === 'produccion' ? 'produccion' : 'pruebas'}.`);
      return;
    }
    setCertBusy(true);
    setOk('');
    setError('');
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No se encontro la sesion activa para subir el certificado.');

      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo del certificado.'));
        reader.readAsDataURL(currentFile);
      });

      const resp = await fetch(`${API}/api/facturacion/emisor/certificado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          empresa_id: empresaId,
          file_name: currentFile.name,
          file_base64: fileBase64,
          password: currentPassword,
          pin: currentPin,
          vence_en: currentVenceEn || null,
          scope,
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload?.ok) {
        throw new Error(String(payload?.error || 'No se pudo guardar el certificado del emisor.'));
      }

      const cert = payload.certificado || {};
      setForm((prev) => scope === 'produccion'
        ? {
            ...prev,
            certificado_password_produccion_encriptada: 'SI',
            certificado_pin_produccion_encriptado: 'SI',
            certificado_nombre_archivo_produccion: cert.nombre_archivo || currentFile.name,
            certificado_ruta_interna_produccion: cert.ruta_interna || null,
            certificado_vence_produccion_en: cert.vence_en || currentVenceEn || null,
            certificado_actualizado_produccion_at: cert.actualizado_at || new Date().toISOString(),
          }
        : {
            ...prev,
            certificado_password_encriptada: 'SI',
            certificado_pin_encriptado: 'SI',
            certificado_nombre_archivo: cert.nombre_archivo || currentFile.name,
            certificado_ruta_interna: cert.ruta_interna || null,
            certificado_vence_en: cert.vence_en || currentVenceEn || null,
            certificado_actualizado_at: cert.actualizado_at || new Date().toISOString(),
          });
      if (scope === 'produccion') {
        setCertPinProd('');
        setCertFileProd(null);
      } else {
        setCertPin('');
        setCertFile(null);
      }
      setOk(`Certificado de ${scope === 'produccion' ? 'produccion' : 'pruebas'} guardado en almacenamiento privado del backend.`);
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo guardar el certificado del emisor.'));
    } finally {
      setCertBusy(false);
    }
  };

  const guardarCredenciales = async () => {
    if (!canEdit || credBusy) return;
    if (!correoEnvio.trim()) {
      setError('Debe indicar el correo de envio del emisor.');
      return;
    }
    if (!claveAplicacion.trim() && !form.clave_aplicacion_encriptada) {
      setError('Debe indicar la clave de aplicacion.');
      return;
    }
    if (!stagUsuario.trim()) {
      setError('Debe indicar el usuario STAG.');
      return;
    }
    if (!stagPassword.trim()) {
      setError('Debe indicar la contrasena STAG.');
      return;
    }
    if ((stagUsuarioProduccion.trim() && !stagPasswordProduccion.trim()) || (!stagUsuarioProduccion.trim() && stagPasswordProduccion.trim())) {
      setError('Las credenciales STAG de produccion deben completarse juntas.');
      return;
    }
    setCredBusy(true);
    setOk('');
    setError('');
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No se encontro la sesion activa para guardar las credenciales.');

      const resp = await fetch(`${API}/api/facturacion/emisor/credenciales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          empresa_id: empresaId,
          correo_envio: correoEnvio.trim().toLowerCase(),
          clave_aplicacion: claveAplicacion || '__KEEP__',
          stag_usuario: stagUsuario.trim(),
          stag_password: stagPassword,
          stag_usuario_produccion: stagUsuarioProduccion.trim(),
          stag_password_produccion: stagPasswordProduccion,
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload?.ok) {
        throw new Error(String(payload?.error || 'No se pudieron guardar las credenciales del emisor.'));
      }

      setForm((prev) => ({
        ...prev,
        correo_envio: correoEnvio.trim().toLowerCase(),
        clave_aplicacion_encriptada: claveAplicacion.trim() ? 'SI' : prev.clave_aplicacion_encriptada,
        stag_usuario: stagUsuario.trim(),
        stag_password_encriptada: 'SI',
        stag_usuario_produccion: stagUsuarioProduccion.trim() || null,
        stag_password_produccion_encriptada: stagPasswordProduccion.trim() ? 'SI' : prev.stag_password_produccion_encriptada,
      }));
      setClaveAplicacion('');
      setStagPassword('');
      setStagPasswordProduccion('');
      setOk('Credenciales de envio y STAG guardadas de forma segura.');
    } catch (e: any) {
      setError(String(e?.message || 'No se pudieron guardar las credenciales del emisor.'));
    } finally {
      setCredBusy(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="em-wrap">
        <div className="em-title">Datos del emisor</div>
        <div className="em-sub">Base oficial del emisor FE. Aqui dejamos listos los datos tributarios, la terminal y el certificado de firma antes de montar XML y envio a Hacienda.</div>

        <WorkspaceShell
          sidebar={
            <>
              <WorkspaceSidebarSection title="Emisor" subtitle="Datos sincronizados desde empresa y MH.">
                <WorkspaceMetric label="Contribuyente" value={mhSnapshot?.nombre || '-'} accent="#f8fafc" />
              <WorkspaceMetric label="Identificacion" value={mhSnapshot?.cedula || '-'} accent="#38bdf8" />
              <WorkspaceMetric label="Ambiente" value={form.ambiente === 'produccion' ? 'Produccion' : 'Pruebas'} accent={form.ambiente === 'produccion' ? '#4ade80' : '#fbbf24'} />
              <WorkspaceMetric label="Terminal" value={`${form.sucursal}-${form.punto_venta}`} accent="#a78bfa" />
              <WorkspaceMetric label="Envio FE" value={form.correo_envio || '-'} accent="#f59e0b" compact />
              </WorkspaceSidebarSection>
              <WorkspaceSidebarSection title="Firma" subtitle="El certificado se guarda en almacenamiento privado del backend.">
                <div className="em-mini" style={{ marginBottom: 10 }}>
                  No guardamos una ruta de Windows del usuario. El archivo se conserva fuera del frontend y el PIN se cifra antes de persistirlo.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className={`em-chip ${form.certificado_nombre_archivo ? 'ok' : 'bad'}`}>{form.certificado_nombre_archivo ? 'Certificado cargado' : 'Falta certificado'}</span>
                  <span className={`em-chip ${form.certificado_password_encriptada ? 'ok' : 'bad'}`}>{form.certificado_password_encriptada ? 'Contrasena guardada' : 'Falta contrasena'}</span>
                  <span className={`em-chip ${form.actividad_tributaria_id ? 'ok' : 'bad'}`}>{form.actividad_tributaria_id ? 'Actividad lista' : 'Falta actividad'}</span>
                </div>
              </WorkspaceSidebarSection>
            </>
          }
        >
          <WorkspaceMainPanel title="Identidad fiscal" subtitle="Tomamos la actividad economica desde empresa. Si el emisor tiene varias, aqui se selecciona la que aplicara por defecto.">
            {ok ? <div className="em-msg-ok">{ok}</div> : null}
            {error ? <div className="em-msg-err">{error}</div> : null}
            {!mhSnapshot && !(form.nombre_emisor && form.numero_identificacion) ? <div className="em-msg-warn">No hay snapshot MH sincronizado y aún faltan datos base del emisor. Revise Parametros de empresa o complete esta sección manualmente.</div> : null}

            <div className="em-grid">
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Ambiente</label>
                <select className="em-select" value={form.ambiente} disabled={!canEdit || busy} onChange={(e) => setField('ambiente', e.target.value as ConfigFe['ambiente'])}>
                  <option value="pruebas">Pruebas</option>
                  <option value="produccion">Produccion</option>
                </select>
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Sucursal</label>
                <input className="em-input" value={form.sucursal} maxLength={3} disabled={!canEdit || busy} onChange={(e) => setField('sucursal', e.target.value.replace(/\D/g, '').slice(0, 3))} />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Punto de venta</label>
                <input className="em-input" value={form.punto_venta} maxLength={5} disabled={!canEdit || busy} onChange={(e) => setField('punto_venta', e.target.value.replace(/\D/g, '').slice(0, 5))} />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Tipo doc. defecto</label>
                <select className="em-select" value={form.tipo_documento_defecto} disabled={!canEdit || busy} onChange={(e) => setField('tipo_documento_defecto', e.target.value)}>
                  <option value="01">01 - Factura Electronica</option>
                  <option value="09">09 - Factura Exportacion</option>
                  <option value="04">04 - Tiquete Electronico</option>
                  <option value="03">03 - Nota de Credito</option>
                  <option value="02">02 - Nota de Debito</option>
                </select>
              </div>

              <div className="em-field" style={{ gridColumn: 'span 6' }}>
                <label>Actividad tributaria por defecto</label>
                <select className="em-select" value={form.actividad_tributaria_id || ''} disabled={!canEdit || busy || actividades.length === 0} onChange={(e) => setActividad(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">-- seleccione actividad --</option>
                  {actividades.map((a) => (
                    <option key={a.actividad_tributaria_id} value={a.actividad_tributaria_id}>
                      {(a.actividad_tributaria?.codigo || '-') + ' - ' + (a.actividad_tributaria?.descripcion || 'Sin descripcion')}
                    </option>
                  ))}
                </select>
                {actividadSeleccionada ? <div className="em-mini">Codigo MH: {actividadSeleccionada.actividad_tributaria?.codigo || '-'}{actividadSeleccionada.principal ? ' | Principal' : ''}</div> : null}
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Correo respuesta</label>
                <input className="em-input" value={form.correo_respuesta} disabled={!canEdit || busy} onChange={(e) => setField('correo_respuesta', e.target.value)} placeholder="facturas@empresa.com" />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Telefono</label>
                <input className="em-input" value={form.telefono} disabled={!canEdit || busy} onChange={(e) => setField('telefono', e.target.value)} placeholder="2222-2222" />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 4' }}>
                <label>Condicion de venta defecto</label>
                <select className="em-select" value={form.condicion_venta_defecto} disabled={!canEdit || busy} onChange={(e) => setField('condicion_venta_defecto', e.target.value)}>
                  <option value="01">01 - Contado</option>
                  <option value="02">02 - Credito</option>
                  <option value="03">03 - Consignacion</option>
                  <option value="04">04 - Apartado</option>
                  <option value="05">05 - Arrendamiento con opcion de compra</option>
                  <option value="06">06 - Arrendamiento financiero</option>
                  <option value="99">99 - Otros</option>
                </select>
              </div>
              <div className="em-field" style={{ gridColumn: 'span 4' }}>
                <label>Medio de pago defecto</label>
                <select className="em-select" value={form.medio_pago_defecto} disabled={!canEdit || busy} onChange={(e) => setField('medio_pago_defecto', e.target.value)}>
                  <option value="01">01 - Efectivo</option>
                  <option value="02">02 - Tarjeta</option>
                  <option value="03">03 - Transferencia</option>
                  <option value="04">04 - Recaudado por terceros</option>
                  <option value="05">05 - Colecturia</option>
                  <option value="06">06 - Documento fiscal</option>
                  <option value="07">07 - Otro</option>
                  <option value="99">99 - No aplica</option>
                </select>
              </div>
              <div className="em-field" style={{ gridColumn: 'span 4' }}>
                <label>Plazo credito (dias)</label>
                <input className="em-input" type="number" min={0} value={form.plazo_credito_dias} disabled={!canEdit || busy} onChange={(e) => setField('plazo_credito_dias', Number(e.target.value || 0))} />
              </div>

              <div className="em-field" style={{ gridColumn: 'span 12' }}>
                <label className="em-check">
                  <input type="checkbox" checked={form.consulta_exoneracion_mh} disabled={!canEdit || busy} onChange={(e) => setField('consulta_exoneracion_mh', e.target.checked)} />
                  Habilitar consulta de exoneraciones MH en el modulo FE
                </label>
              </div>

              {/* ── Dirección y datos XML ── */}
              <div className="em-field" style={{ gridColumn: 'span 12' }}>
                <label style={{ fontSize:12, color:'#94a3b8', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em' }}>
                  Dirección y datos para XML FE
                </label>
              </div>
              <div className="em-field" style={{ gridColumn: 'span 5' }}>
                <label>Nombre emisor (XML)</label>
                <input className="em-input" value={form.nombre_emisor} disabled={!canEdit || busy}
                  onChange={(e) => setField('nombre_emisor', e.target.value)}
                  placeholder={mhSnapshot?.nombre || 'Se toma del snapshot MH si está vacío'} />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 4' }}>
                <label>Nombre comercial</label>
                <input className="em-input" value={form.nombre_comercial} disabled={!canEdit || busy}
                  onChange={(e) => setField('nombre_comercial', e.target.value)}
                  placeholder="Opcional" />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Tipo identificacion</label>
                <select className="em-select" value={form.tipo_identificacion} disabled={!canEdit || busy}
                  onChange={(e) => setField('tipo_identificacion', e.target.value)}>
                  <option value="01">01 - Fisica</option>
                  <option value="02">02 - Juridica</option>
                  <option value="03">03 - DIMEX</option>
                  <option value="04">04 - NITE</option>
                </select>
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Numero identificacion</label>
                <input className="em-input" value={form.numero_identificacion} disabled={!canEdit || busy}
                  onChange={(e) => setField('numero_identificacion', e.target.value.replace(/\D/g, ''))}
                  placeholder={mhSnapshot?.cedula || 'Sin guiones'} />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 2' }}>
                <label>Provincia</label>
                <input className="em-input" value={form.provincia} maxLength={1} disabled={!canEdit || busy}
                  onChange={(e) => setField('provincia', e.target.value.replace(/\D/g, '').slice(0,1))}
                  placeholder="1" />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 2' }}>
                <label>Canton</label>
                <input className="em-input" value={form.canton} maxLength={2} disabled={!canEdit || busy}
                  onChange={(e) => setField('canton', e.target.value.replace(/\D/g, '').slice(0,2))}
                  placeholder="01" />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 2' }}>
                <label>Distrito</label>
                <input className="em-input" value={form.distrito} maxLength={2} disabled={!canEdit || busy}
                  onChange={(e) => setField('distrito', e.target.value.replace(/\D/g, '').slice(0,2))}
                  placeholder="01" />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Barrio (opcional)</label>
                <input className="em-input" value={form.barrio} maxLength={2} disabled={!canEdit || busy}
                  onChange={(e) => setField('barrio', e.target.value.replace(/\D/g, '').slice(0,2))} />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 6' }}>
                <label>Otras señas</label>
                <input className="em-input" value={form.otras_senas} disabled={!canEdit || busy}
                  onChange={(e) => setField('otras_senas', e.target.value)}
                  placeholder="Ej: 200m norte del parque, edificio azul" />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Telefono emisor</label>
                <input className="em-input" value={form.telefono_emisor} disabled={!canEdit || busy}
                  onChange={(e) => setField('telefono_emisor', e.target.value.replace(/\D/g, ''))}
                  placeholder="22222222" />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Tipo de cambio USD (FEE)</label>
                <input className="em-input" type="number" step="0.5" min={1} value={form.tipo_cambio_usd} disabled={!canEdit || busy}
                  onChange={(e) => setField('tipo_cambio_usd', Number(e.target.value || 530))} />
              </div>
            </div>

            <div className="em-btns">
              <button className="em-btn primary" disabled={!canEdit || busy} onClick={guardar}>Guardar datos del emisor</button>
            </div>
          </WorkspaceMainPanel>

          <WorkspaceMainPanel title="Envio y certificados" subtitle="Aqui concentramos el correo de envio y las credenciales completas de pruebas y produccion, cada una con su propio certificado.">
            <div className="em-grid" style={{ marginBottom: 18 }}>
              <div className="em-field" style={{ gridColumn: 'span 6' }}>
                <label>Correo de envio</label>
                <input className="em-input" value={correoEnvio} disabled={!canEdit || credBusy} onChange={(e) => setCorreoEnvio(e.target.value)} placeholder="facturacion@empresa.com" />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Clave de aplicacion</label>
                <input className="em-input" type="password" value={claveAplicacion} disabled={!canEdit || credBusy} onChange={(e) => setClaveAplicacion(e.target.value)} placeholder={form.clave_aplicacion_encriptada ? 'Actualice solo si desea cambiarla' : 'Clave del correo de envio'} />
              </div>
              <div className="em-field" style={{ gridColumn: 'span 3' }}>
                <label>Estado envio</label>
                <input className="em-input" readOnly value={`${form.correo_envio ? 'Correo: SI' : 'Correo: NO'} | ${form.clave_aplicacion_encriptada ? 'Clave: SI' : 'Clave: NO'}`} />
              </div>
            </div>

            <div className="em-env-grid">
              <div className="em-env-card">
                <div className="em-env-title">Pruebas / STAG</div>
                <div className="em-env-form">
                  <div className="em-env-label">Usuario</div>
                  <input className="em-input" value={stagUsuario} disabled={!canEdit || credBusy} onChange={(e) => setStagUsuario(e.target.value)} placeholder="cpf-xx-xxxx-xxxx@stag.comprobanteselectronicos.go.cr" />
                  <div className="em-env-label">Contrasena</div>
                  <input className="em-input" type="password" value={stagPassword} disabled={!canEdit || credBusy} onChange={(e) => setStagPassword(e.target.value)} placeholder={form.stag_password_encriptada ? 'Actualizar' : 'Contrasena STAG'} />
                  <div className="em-env-label">PIN</div>
                  <input className="em-input" type="password" value={certPin} disabled={!canEdit || certBusy} onChange={(e) => setCertPin(e.target.value)} placeholder="PIN del certificado" />
                  <div className="em-env-label">Certificado</div>
                  <div>
                    <input className="em-input" type="file" accept=".p12,.pfx" disabled={!canEdit || certBusy} onChange={(e) => setCertFile(e.target.files?.[0] || null)} />
                    {certFile ? <div className="em-mini" style={{ marginTop: 6 }}>Seleccionado: {certFile.name}</div> : null}
                  </div>
                  <div className="em-env-label">Vence</div>
                  <input className="em-input" type="date" value={certVenceEn} disabled={!canEdit || certBusy} onChange={(e) => setCertVenceEn(e.target.value)} />
                  <div className="em-env-label">Estado</div>
                  <input className="em-input" readOnly value={`${stagUsuario.trim() || form.stag_usuario ? 'Usuario: SI' : 'Usuario: NO'} | ${stagPassword.trim() || form.stag_password_encriptada ? 'Contrasena: SI' : 'Contrasena: NO'} | ${certPin.trim() || form.certificado_pin_encriptado ? 'PIN: SI' : 'PIN: NO'} | ${certFile || form.certificado_nombre_archivo ? 'Certificado: SI' : 'Certificado: NO'}`} />
                </div>
                <div className="em-env-actions">
                  <button className="em-btn alt" disabled={!canEdit || !envioListo || !pruebasListo || certBusy || credBusy} onClick={async () => { await guardarCredenciales(); await subirCertificado('pruebas'); }}>Guardar pruebas</button>
                </div>
              </div>

              <div className="em-env-card">
                <div className="em-env-title">Produccion</div>
                <div className="em-env-form">
                  <div className="em-env-label">Usuario</div>
                  <input className="em-input" value={stagUsuarioProduccion} disabled={!canEdit || credBusy} onChange={(e) => setStagUsuarioProduccion(e.target.value)} placeholder="usuario STAG de produccion" />
                  <div className="em-env-label">Contrasena</div>
                  <input className="em-input" type="password" value={stagPasswordProduccion} disabled={!canEdit || credBusy} onChange={(e) => setStagPasswordProduccion(e.target.value)} placeholder={form.stag_password_produccion_encriptada ? 'Actualizar' : 'Contrasena STAG'} />
                  <div className="em-env-label">PIN</div>
                  <input className="em-input" type="password" value={certPinProd} disabled={!canEdit || certBusy} onChange={(e) => setCertPinProd(e.target.value)} placeholder="PIN del certificado" />
                  <div className="em-env-label">Certificado</div>
                  <div>
                    <input className="em-input" type="file" accept=".p12,.pfx" disabled={!canEdit || certBusy} onChange={(e) => setCertFileProd(e.target.files?.[0] || null)} />
                    {certFileProd ? <div className="em-mini" style={{ marginTop: 6 }}>Seleccionado: {certFileProd.name}</div> : null}
                  </div>
                  <div className="em-env-label">Vence</div>
                  <input className="em-input" type="date" value={certVenceEnProd} disabled={!canEdit || certBusy} onChange={(e) => setCertVenceEnProd(e.target.value)} />
                  <div className="em-env-label">Estado</div>
                  <input className="em-input" readOnly value={`${stagUsuarioProduccion.trim() || form.stag_usuario_produccion ? 'Usuario: SI' : 'Usuario: NO'} | ${stagPasswordProduccion.trim() || form.stag_password_produccion_encriptada ? 'Contrasena: SI' : 'Contrasena: NO'} | ${certPinProd.trim() || form.certificado_pin_produccion_encriptado ? 'PIN: SI' : 'PIN: NO'} | ${certFileProd || form.certificado_nombre_archivo_produccion ? 'Certificado: SI' : 'Certificado: NO'}`} />
                </div>
                <div className="em-env-actions">
                  <button className="em-btn alt" disabled={!canEdit || !envioListo || !produccionListo || certBusy || credBusy} onClick={async () => { await guardarCredenciales(); await subirCertificado('produccion'); }}>Guardar produccion</button>
                </div>
              </div>
            </div>
          </WorkspaceMainPanel>

          <WorkspaceMainPanel title="Terminales (puntos de venta)" subtitle="Cada terminal tiene su propia serie de consecutivos. El campo sucursal ocupa posiciones 1-3 y punto de venta 4-8 del consecutivo MH.">
            {terminalOk ? <div className="em-msg-ok">{terminalOk}</div> : null}
            {terminalError ? <div className="em-msg-err">{terminalError}</div> : null}

            {/* Tabla de terminales existentes */}
            {terminales.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#93c5fd', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.05em' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #334155' }}>Terminal</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #334155' }}>Nombre</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #334155' }}>Defecto</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #334155' }}>Activo</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid #334155' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {terminales.map((t) => (
                    <tr key={t.id} style={{ background: terminalEditId === t.id ? '#1e293b' : 'transparent' }}>
                      <td style={{ padding: '6px 8px', color: '#a78bfa', fontWeight: 700, fontFamily: 'monospace' }}>{t.sucursal}-{t.punto_venta}</td>
                      <td style={{ padding: '6px 8px', color: '#f8fafc' }}>{t.nombre}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{t.es_defecto ? <span className="em-chip ok">Defecto</span> : null}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}><span className={`em-chip ${t.activo ? 'ok' : 'bad'}`}>{t.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {canEdit && (
                          <>
                            <button className="em-btn" style={{ marginRight: 6, padding: '4px 10px', fontSize: 11 }} disabled={terminalBusy}
                              onClick={() => { setTerminalEditId(t.id); setTerminalForm({ nombre: t.nombre, sucursal: t.sucursal, punto_venta: t.punto_venta, activo: t.activo, es_defecto: t.es_defecto }); setTerminalOk(''); setTerminalError(''); }}>
                              Editar
                            </button>
                            <button className="em-btn" style={{ padding: '4px 10px', fontSize: 11, borderColor: '#7f1d1d', color: '#fca5a5' }} disabled={terminalBusy}
                              onClick={() => { if (window.confirm('Eliminar la terminal ' + t.sucursal + '-' + t.punto_venta + '?')) void eliminarTerminalById(t.id); }}>
                              Eliminar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Formulario nueva / editar terminal */}
            {canEdit && (
              <>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                  {terminalEditId ? `Editando terminal ID ${terminalEditId}` : 'Nueva terminal'}
                </div>
                <div className="em-grid">
                  <div className="em-field" style={{ gridColumn: 'span 4' }}>
                    <label>Nombre</label>
                    <input className="em-input" value={terminalForm.nombre} disabled={terminalBusy}
                      onChange={(e) => setTerminalForm((p) => ({ ...p, nombre: e.target.value }))}
                      placeholder="Ej: Caja principal, Sucursal norte" />
                  </div>
                  <div className="em-field" style={{ gridColumn: 'span 2' }}>
                    <label>Sucursal (3 dígitos)</label>
                    <input className="em-input" value={terminalForm.sucursal} maxLength={3} disabled={terminalBusy}
                      onChange={(e) => setTerminalForm((p) => ({ ...p, sucursal: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                      placeholder="001" />
                  </div>
                  <div className="em-field" style={{ gridColumn: 'span 2' }}>
                    <label>Punto de venta (5 dígitos)</label>
                    <input className="em-input" value={terminalForm.punto_venta} maxLength={5} disabled={terminalBusy}
                      onChange={(e) => setTerminalForm((p) => ({ ...p, punto_venta: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                      placeholder="00001" />
                  </div>
                  <div className="em-field" style={{ gridColumn: 'span 2' }}>
                    <label>Estado</label>
                    <select className="em-select" value={terminalForm.activo ? '1' : '0'} disabled={terminalBusy}
                      onChange={(e) => setTerminalForm((p) => ({ ...p, activo: e.target.value === '1' }))}>
                      <option value="1">Activo</option>
                      <option value="0">Inactivo</option>
                    </select>
                  </div>
                  <div className="em-field" style={{ gridColumn: 'span 2' }}>
                    <label>¿Defecto?</label>
                    <label className="em-check">
                      <input type="checkbox" checked={terminalForm.es_defecto} disabled={terminalBusy}
                        onChange={(e) => setTerminalForm((p) => ({ ...p, es_defecto: e.target.checked }))} />
                      Terminal predeterminada
                    </label>
                  </div>
                </div>
                <div className="em-btns">
                  <button className="em-btn primary" disabled={terminalBusy} onClick={guardarTerminal}>
                    {terminalEditId ? 'Actualizar terminal' : 'Crear terminal'}
                  </button>
                  {terminalEditId && (
                    <button className="em-btn" disabled={terminalBusy} onClick={() => { setTerminalEditId(null); setTerminalForm(emptyTerminal()); setTerminalOk(''); setTerminalError(''); }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </>
            )}
          </WorkspaceMainPanel>
        </WorkspaceShell>
      </div>
    </>
  );
}
