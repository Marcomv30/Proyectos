import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabase';
import { logModuloEvento } from '../../utils/bitacora';
import { formatCompanyDate } from '../../utils/companyTimeZone';
import { PL_STYLES } from './planillaStyles';
import GafeteColaborador from './GafeteColaborador';

interface Props { empresaId: number; canEdit?: boolean; empresaNombre?: string; empresaLogo?: string | null; }
interface Departamento { id: number; nombre: string; }
interface Cargo { id: number; nombre: string; departamento_id: number | null; salario_base_ref: number | null; }

interface Colaborador {
  id: number; numero_empleado: string | null; tipo_identificacion: string;
  identificacion: string; nombre_completo: string; primer_apellido: string | null;
  segundo_apellido: string | null; nombre: string | null; fecha_nacimiento: string | null;
  sexo: string | null; estado_civil: string | null; nacionalidad: string | null;
  email: string | null; email_personal: string | null; telefono: string | null;
  telefono_emergencia: string | null; contacto_emergencia: string | null;
  provincia: string | null; canton: string | null; distrito: string | null;
  direccion_detalle: string | null; departamento_id: number | null; cargo_id: number | null;
  fecha_ingreso: string; fecha_salida: string | null; tipo_contrato: string;
  tipo_salario: string; salario: number; jornada: string; horas_semana: number | null;
  horas_mes_base: number | null;
  banco: string | null; tipo_cuenta: string | null; numero_cuenta: string | null;
  numero_asegurado: string | null; regimen_pensiones: string; apto_campo: boolean;
  aplica_ccss: boolean; aplica_renta: boolean; aplica_banco_popular: boolean;
  observacion_deducciones: string | null;
  licencia_conducir: string | null; notas: string | null; estado: string;
  qr_token: string | null; foto_url: string | null;
}

const PROVINCIAS = ['San José','Alajuela','Cartago','Heredia','Guanacaste','Puntarenas','Limón'];
const ESTADOS_COLOR: Record<string, string> = {
  activo: '#22c55e', inactivo: '#8ea3c7', incapacitado: '#f59e0b',
  vacaciones: '#38bdf8', suspendido: '#f87171',
};
const fmtSalario = (n: number) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n);

const emptyColab = (): Partial<Colaborador> => ({
  tipo_identificacion: 'cedula', nombre_completo: '', primer_apellido: '', segundo_apellido: '',
  nombre: '', identificacion: '', numero_empleado: '', fecha_nacimiento: null, sexo: null,
  estado_civil: null, nacionalidad: 'costarricense', email: '', email_personal: '', telefono: '',
  telefono_emergencia: '', contacto_emergencia: '', provincia: '', canton: '', distrito: '',
  direccion_detalle: '', departamento_id: null, cargo_id: null, fecha_ingreso: '',
  tipo_contrato: 'indefinido', tipo_salario: 'mensual', salario: 0, jornada: 'ordinaria',
  horas_semana: 48, banco: '', tipo_cuenta: null, numero_cuenta: '', numero_asegurado: '',
  regimen_pensiones: 'ccss', apto_campo: false, licencia_conducir: '', notas: '', estado: 'activo',
  aplica_ccss: true, aplica_renta: true, aplica_banco_popular: true,
  observacion_deducciones: '', horas_mes_base: 240, foto_url: null,
});

export default function Colaboradores({ empresaId, canEdit, empresaNombre, empresaLogo }: Props) {
  const [lista, setLista] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(false);
  const [deptos, setDeptos] = useState<Departamento[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [buscar, setBuscar] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroDepto, setFiltroDepto] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal'|'laboral'|'banco'|'otros'>('personal');
  const [form, setForm] = useState<Partial<Colaborador>>(emptyColab());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [verDetalle, setVerDetalle] = useState<Colaborador | null>(null);
  const [gafeteColab, setGafeteColab] = useState<Colaborador | null>(null);
  // Foto upload
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [fotoUploading, setFotoUploading] = useState(false);
  const [fotoErr, setFotoErr] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: cols }, { data: deps }, { data: cars }] = await Promise.all([
      supabase.from('pl_colaboradores').select('*').eq('empresa_id', empresaId).order('nombre_completo'),
      supabase.from('pl_departamentos').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('pl_cargos').select('id,nombre,departamento_id,salario_base_ref').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
    ]);
    setLista(cols || []); setDeptos(deps || []); setCargos(cars || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setFotoErr('El archivo debe ser una imagen.'); return; }
    if (file.size > 3 * 1024 * 1024) { setFotoErr('La foto no debe superar 3 MB.'); return; }
    const colabId = (form as Colaborador).id;
    if (!colabId) { setFotoErr('Guarde el colaborador primero antes de subir la foto.'); return; }
    setFotoUploading(true); setFotoErr('');
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `empresa_${empresaId}/colab_${colabId}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('fotos-colaboradores').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setFotoErr('Error al subir: ' + upErr.message); setFotoUploading(false); return; }
    const { data: urlData } = supabase.storage.from('fotos-colaboradores').getPublicUrl(path);
    // Usamos la URL base sin cache-buster para guardar en DB; el buster lo agregamos solo en UI
    const fotoUrlBase = urlData.publicUrl;
    const fotoUrl = fotoUrlBase + '?t=' + Date.now();
    const { error: dbErr } = await supabase.from('pl_colaboradores').update({ foto_url: fotoUrlBase }).eq('id', colabId);
    if (dbErr) { setFotoErr('Foto subida pero error al guardar en DB: ' + dbErr.message); setFotoUploading(false); return; }
    setForm(p => ({ ...p, foto_url: fotoUrl }));
    setLista(prev => prev.map(c => c.id === colabId ? { ...c, foto_url: fotoUrl } : c));
    setFotoUploading(false);
    if (fotoInputRef.current) fotoInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.nombre_completo?.trim()) { setError('Nombre completo requerido.'); return; }
    if (!form.identificacion?.trim())  { setError('Identificación requerida.'); return; }
    if (!form.fecha_ingreso)           { setError('Fecha de ingreso requerida.'); return; }
    if (!form.salario || form.salario <= 0) { setError('Salario debe ser mayor a cero.'); return; }
    setSaving(true); setError('');
    const payload: Record<string, unknown> = {
      empresa_id: empresaId,
      numero_empleado: form.numero_empleado?.trim() || null,
      tipo_identificacion: form.tipo_identificacion,
      identificacion: form.identificacion!.trim(),
      nombre_completo: form.nombre_completo!.trim(),
      primer_apellido: form.primer_apellido?.trim() || null,
      segundo_apellido: form.segundo_apellido?.trim() || null,
      nombre: form.nombre?.trim() || null,
      fecha_nacimiento: form.fecha_nacimiento || null,
      sexo: form.sexo || null,
      estado_civil: form.estado_civil || null,
      nacionalidad: form.nacionalidad?.trim() || 'costarricense',
      email: form.email?.trim() || null,
      email_personal: form.email_personal?.trim() || null,
      telefono: form.telefono?.trim() || null,
      telefono_emergencia: form.telefono_emergencia?.trim() || null,
      contacto_emergencia: form.contacto_emergencia?.trim() || null,
      provincia: form.provincia?.trim() || null,
      canton: form.canton?.trim() || null,
      distrito: form.distrito?.trim() || null,
      direccion_detalle: form.direccion_detalle?.trim() || null,
      departamento_id: form.departamento_id || null,
      cargo_id: form.cargo_id || null,
      fecha_ingreso: form.fecha_ingreso,
      tipo_contrato: form.tipo_contrato,
      tipo_salario: form.tipo_salario,
      salario: form.salario,
      jornada: form.jornada,
      horas_semana: form.horas_semana || 48,
      banco: form.banco?.trim() || null,
      tipo_cuenta: form.tipo_cuenta || null,
      numero_cuenta: form.numero_cuenta?.trim() || null,
      numero_asegurado: form.numero_asegurado?.trim() || null,
      regimen_pensiones: form.regimen_pensiones,
      apto_campo: form.apto_campo ?? false,
      licencia_conducir: form.licencia_conducir?.trim() || null,
      notas: form.notas?.trim() || null,
      estado: form.estado || 'activo',
      aplica_ccss: form.aplica_ccss ?? true,
      aplica_renta: form.aplica_renta ?? true,
      aplica_banco_popular: form.aplica_banco_popular ?? true,
      observacion_deducciones: form.observacion_deducciones?.trim() || null,
      horas_mes_base: form.horas_mes_base ?? 240,
      foto_url: (form as Colaborador).foto_url ?? null,
      updated_at: new Date().toISOString(),
    };
    const esEdicion = !!(form as Colaborador).id;
    const { error: err } = esEdicion
      ? await supabase.from('pl_colaboradores').update(payload).eq('id', (form as Colaborador).id)
      : await supabase.from('pl_colaboradores').insert(payload);
    if (err) { setError(err.message); }
    else {
      logModuloEvento({ empresaId, modulo: 'planilla', accion: esEdicion ? 'colaborador_editado' : 'colaborador_creado', descripcion: String(payload.nombre_completo) });
      setShowModal(false); loadData();
    }
    setSaving(false);
  };

  const depto = (id: number | null) => deptos.find(d => d.id === id)?.nombre ?? '—';
  const cargo = (id: number | null) => cargos.find(c => c.id === id)?.nombre ?? '—';

  const colsFilt = lista.filter(c => {
    const txt = buscar.toLowerCase();
    return (!txt || c.nombre_completo.toLowerCase().includes(txt) || c.identificacion.includes(txt) || (c.numero_empleado || '').includes(txt))
      && (!filtroEstado || c.estado === filtroEstado)
      && (!filtroDepto || String(c.departamento_id) === filtroDepto);
  });

  // Campos del formulario helper
  const F = (key: keyof Colaborador, label: string, opts?: { type?: string; options?: { v: string; l: string }[]; required?: boolean }) => (
    <div className="pl-field">
      <label>{label}{opts?.required ? ' *' : ''}</label>
      {opts?.options ? (
        <select className="pl-select" value={(form[key] as string) ?? ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value || null }))}>
          <option value="">— Seleccione —</option>
          {opts.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      ) : (
        <input type={opts?.type || 'text'} className="pl-input"
          value={(form[key] as string | number) ?? ''}
          onChange={e => setForm(p => ({ ...p, [key]: opts?.type === 'number' ? Number(e.target.value) : e.target.value }))} />
      )}
    </div>
  );

  const modal = showModal && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowModal(false)}>
      <div className="pl-modal wide" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">{(form as Colaborador).id ? 'Editar Colaborador' : 'Nuevo Colaborador'}</p>
        {/* Tabs modal */}
        <div className="pl-tabs" style={{ marginBottom: 16 }}>
          {(['personal','laboral','banco','otros'] as const).map(t => (
            <button key={t} className={`pl-tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
              {t === 'personal' ? 'Datos Personales' : t === 'laboral' ? 'Laboral' : t === 'banco' ? 'Pago / CCSS' : 'Otros'}
            </button>
          ))}
        </div>
        {error && <div className="pl-err">{error}</div>}

        {activeTab === 'personal' && (
          <>
            {/* Foto del colaborador */}
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16, padding:'12px 14px', background:'#162010', borderRadius:10, border:'1px solid rgba(34,197,94,0.15)' }}>
              <div style={{ flexShrink:0 }}>
                {form.foto_url
                  ? <img src={form.foto_url} alt="foto" style={{ width:60, height:60, borderRadius:'50%', objectFit:'cover', border:'2px solid #16a34a', display:'block' }} />
                  : <div style={{ width:60, height:60, borderRadius:'50%', background:'linear-gradient(135deg,#16a34a,#22c55e)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:22 }}>
                      {(form.nombre_completo || '?').charAt(0).toUpperCase()}
                    </div>
                }
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, color:'#8ea3c7', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Foto para Gafete</div>
                {fotoErr && <div style={{ fontSize:11, color:'#f87171', marginBottom:4 }}>{fotoErr}</div>}
                <input ref={fotoInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFotoUpload} />
                {(form as Colaborador).id
                  ? <button className="pl-btn" style={{ fontSize:11, padding:'5px 12px' }} onClick={() => fotoInputRef.current?.click()} disabled={fotoUploading}>
                      {fotoUploading ? 'Subiendo...' : form.foto_url ? 'Cambiar foto' : 'Subir foto'}
                    </button>
                  : <span style={{ fontSize:11, color:'#4e6280' }}>Guarde primero para poder subir la foto</span>
                }
              </div>
            </div>

            <div className="pl-field"><label>Nombre completo *</label><input className="pl-input" value={form.nombre_completo ?? ''} onChange={e => setForm(p => ({ ...p, nombre_completo: e.target.value }))} autoFocus /></div>
            <div className="pl-g2">
              {F('primer_apellido','1er Apellido')}
              {F('segundo_apellido','2do Apellido')}
              {F('nombre','Nombre(s)')}
              {F('numero_empleado','Cód. Empleado')}
              {F('tipo_identificacion','Tipo ID',{ options:[{v:'cedula',l:'Cédula CR'},{v:'dimex',l:'DIMEX'},{v:'pasaporte',l:'Pasaporte'},{v:'otro',l:'Otro'}]})}
              {F('identificacion','Identificación',{ required:true })}
              {F('fecha_nacimiento','Fecha Nacimiento',{ type:'date' })}
              {F('sexo','Sexo',{ options:[{v:'masculino',l:'Masculino'},{v:'femenino',l:'Femenino'},{v:'otro',l:'Otro'}]})}
              {F('estado_civil','Estado Civil',{ options:[{v:'soltero',l:'Soltero/a'},{v:'casado',l:'Casado/a'},{v:'divorciado',l:'Divorciado/a'},{v:'viudo',l:'Viudo/a'},{v:'union_libre',l:'Unión libre'},{v:'otro',l:'Otro'}]})}
              {F('nacionalidad','Nacionalidad')}
              {F('email','Email corporativo',{ type:'email' })}
              {F('email_personal','Email personal',{ type:'email' })}
              {F('telefono','Teléfono')}
              {F('telefono_emergencia','Tel. Emergencia')}
            </div>
            {F('contacto_emergencia','Nombre Contacto Emergencia')}
            <div className="pl-g2">
              <div className="pl-field"><label>Provincia</label>
                <select className="pl-select" value={form.provincia ?? ''} onChange={e => setForm(p => ({ ...p, provincia: e.target.value }))}>
                  <option value="">— Seleccione —</option>
                  {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {F('canton','Cantón')} {F('distrito','Distrito')}
            </div>
            <div className="pl-field"><label>Dirección detallada</label><textarea value={form.direccion_detalle ?? ''} onChange={e => setForm(p => ({ ...p, direccion_detalle: e.target.value }))} /></div>
          </>
        )}

        {activeTab === 'laboral' && (
          <div className="pl-g2">
            {F('fecha_ingreso','Fecha Ingreso *',{ type:'date', required:true })}
            {F('estado','Estado',{ options:[{v:'activo',l:'Activo'},{v:'inactivo',l:'Inactivo'},{v:'incapacitado',l:'Incapacitado'},{v:'vacaciones',l:'Vacaciones'},{v:'suspendido',l:'Suspendido'}]})}
            <div className="pl-field"><label>Departamento</label>
              <select className="pl-select" value={form.departamento_id ?? ''} onChange={e => setForm(p => ({ ...p, departamento_id: e.target.value ? Number(e.target.value) : null, cargo_id: null }))}>
                <option value="">— Sin departamento —</option>
                {deptos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
            <div className="pl-field"><label>Cargo</label>
              <select className="pl-select" value={form.cargo_id ?? ''} onChange={e => setForm(p => ({ ...p, cargo_id: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">— Sin cargo —</option>
                {cargos.filter(c => !form.departamento_id || c.departamento_id === form.departamento_id || !c.departamento_id).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            {F('tipo_contrato','Tipo Contrato',{ options:[{v:'indefinido',l:'Indefinido'},{v:'plazo_fijo',l:'Plazo fijo'},{v:'obra_determinada',l:'Obra determinada'},{v:'aprendizaje',l:'Aprendizaje'}]})}
            {F('tipo_salario','Tipo Salario',{ options:[{v:'mensual',l:'Mensual'},{v:'quincenal',l:'Quincenal'},{v:'semanal',l:'Semanal'},{v:'jornal',l:'Jornal'},{v:'hora',l:'Por hora'}]})}
            {F('jornada','Jornada',{ options:[{v:'ordinaria',l:'Ordinaria (48h/sem)'},{v:'mixta',l:'Mixta'},{v:'nocturna',l:'Nocturna'},{v:'parcial',l:'Parcial'}]})}
            {F('horas_semana','Horas / Semana',{ type:'number' })}
            <div className="pl-field" style={{ gridColumn:'1/-1' }}>
              <label>Salario (CRC) *</label>
              <input type="number" className="pl-input" value={form.salario ?? 0}
                onChange={e => setForm(p => ({ ...p, salario: Number(e.target.value) }))} />
              {/* Advertencia si el salario es menor al salario de referencia del cargo */}
              {form.cargo_id && (form.salario ?? 0) > 0 && (() => {
                const refSal = cargos.find(c => c.id === form.cargo_id)?.salario_base_ref;
                return refSal && (form.salario ?? 0) < refSal ? (
                  <div style={{ marginTop:4, fontSize:11, color:'#f59e0b', fontWeight:600 }}>
                    ⚠ Salario inferior al mínimo de referencia del cargo ({new Intl.NumberFormat('es-CR',{style:'currency',currency:'CRC',maximumFractionDigits:0}).format(refSal)})
                  </div>
                ) : null;
              })()}
            </div>
            <div className="pl-field">
              <label>Horas base / mes</label>
              <select className="pl-select" value={form.horas_mes_base ?? 240} onChange={e => setForm(p => ({ ...p, horas_mes_base: Number(e.target.value) }))}>
                <option value={240}>240 — Jornada diurna ordinaria</option>
                <option value={216}>216 — Jornada mixta</option>
                <option value={180}>180 — Jornada nocturna</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'banco' && (
          <div className="pl-g2">
            {F('banco','Banco')}
            {F('tipo_cuenta','Tipo Cuenta',{ options:[{v:'corriente',l:'Corriente'},{v:'ahorros',l:'Ahorros'},{v:'sinpe',l:'SINPE Móvil'}]})}
            <div className="pl-field" style={{ gridColumn:'1/-1' }}>{F('numero_cuenta','N° Cuenta / SINPE')}</div>
            {F('numero_asegurado','N° Asegurado CCSS')}
            {F('regimen_pensiones','Régimen Pensiones',{ options:[{v:'ccss',l:'CCSS'},{v:'magisterio',l:'Magisterio'},{v:'poder_judicial',l:'Poder Judicial'},{v:'opc',l:'OPC'},{v:'otro',l:'Otro'}]})}
          </div>
        )}

        {activeTab === 'otros' && (
          <>
            <label className="pl-check-row">
              <input type="checkbox" checked={form.apto_campo ?? false} onChange={e => setForm(p => ({ ...p, apto_campo: e.target.checked }))} />
              Apto para labores de campo / finca (módulo Aplicaciones)
            </label>
            <div style={{ background:'#162010', border:'1px solid rgba(34,197,94,0.15)', borderRadius:10, padding:'12px 14px', marginBottom:13 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#8ea3c7', marginBottom:10, textTransform:'uppercase', letterSpacing:'.05em' }}>Exenciones de Deducciones</div>
              <label className="pl-check-row" style={{ marginBottom:8 }}>
                <input type="checkbox" checked={form.aplica_ccss ?? true} onChange={e => setForm(p => ({ ...p, aplica_ccss: e.target.checked }))} />
                Aplica CCSS obrero y patronal
              </label>
              <label className="pl-check-row" style={{ marginBottom:8 }}>
                <input type="checkbox" checked={form.aplica_renta ?? true} onChange={e => setForm(p => ({ ...p, aplica_renta: e.target.checked }))} />
                Aplica retención Impuesto sobre la Renta
              </label>
              <label className="pl-check-row" style={{ marginBottom:8 }}>
                <input type="checkbox" checked={form.aplica_banco_popular ?? true} onChange={e => setForm(p => ({ ...p, aplica_banco_popular: e.target.checked }))} />
                Aplica descuento Banco Popular (1%)
              </label>
              {(!form.aplica_ccss || !form.aplica_renta || !form.aplica_banco_popular) && (
                <div className="pl-field" style={{ marginBottom:0, marginTop:8 }}>
                  <label>Razón / Sustento legal de exención</label>
                  <input className="pl-input" value={form.observacion_deducciones ?? ''} onChange={e => setForm(p => ({ ...p, observacion_deducciones: e.target.value }))} placeholder="Ej: Pensionado reingresado, art. X CCSS..." />
                </div>
              )}
            </div>
            {F('licencia_conducir','Categoría Licencia')}
            <div className="pl-field"><label>Notas internas</label><textarea value={form.notas ?? ''} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} style={{ minHeight: 80 }} /></div>
          </>
        )}

        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => { setShowModal(false); setError(''); }}>Cancelar</button>
          <button className="pl-btn main" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>, document.body
  );

  const detalleModal = verDetalle && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setVerDetalle(null)}>
      <div className="pl-modal wide" onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
          {verDetalle.foto_url
            ? <img src={verDetalle.foto_url} alt="foto" style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover', border:'2px solid #16a34a', flexShrink:0 }} />
            : <div className="pl-avatar lg">{verDetalle.nombre_completo[0]?.toUpperCase()}</div>
          }
          <div style={{ flex:1 }}>
            <p className="pl-modal-title" style={{ marginBottom:2 }}>{verDetalle.nombre_completo}</p>
            <p className="pl-modal-sub">{cargo(verDetalle.cargo_id)} · {depto(verDetalle.departamento_id)}</p>
          </div>
          <span className="pl-chip" style={{ background: (ESTADOS_COLOR[verDetalle.estado]??'#8ea3c7') + '33', color: ESTADOS_COLOR[verDetalle.estado]??'#8ea3c7', fontSize:12 }}>
            {verDetalle.estado.charAt(0).toUpperCase()+verDetalle.estado.slice(1)}
          </span>
        </div>
        <div className="pl-g2" style={{ gap: '6px 20px' }}>
          {[
            ['Cédula', verDetalle.identificacion],
            ['Cód. Empleado', verDetalle.numero_empleado],
            ['Fecha Nacimiento', formatCompanyDate(verDetalle.fecha_nacimiento)],
            ['Fecha Ingreso', formatCompanyDate(verDetalle.fecha_ingreso)],
            ['Salario', fmtSalario(verDetalle.salario)],
            ['Tipo Salario', verDetalle.tipo_salario],
            ['Tipo Contrato', verDetalle.tipo_contrato],
            ['Jornada', verDetalle.jornada],
            ['Email', verDetalle.email],
            ['Teléfono', verDetalle.telefono],
            ['N° Asegurado', verDetalle.numero_asegurado],
            ['Banco', verDetalle.banco ? `${verDetalle.banco} — ${verDetalle.numero_cuenta}` : null],
          ].map(([l, v]) => (
            <div key={l as string}>
              <div style={{ fontSize:10, color:'#8ea3c7', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:700 }}>{l}</div>
              <div style={{ fontSize:13, color:'#d6e2ff', marginTop:2 }}>{v || '—'}</div>
            </div>
          ))}
        </div>
        {verDetalle.notas && <div className="pl-info" style={{ marginTop:12 }}><strong>Notas:</strong> {verDetalle.notas}</div>}
        <div className="pl-modal-foot">
          <button className="pl-btn" style={{ borderColor:'#16a34a', color:'#22c55e' }} onClick={() => { setGafeteColab(verDetalle); setVerDetalle(null); }}>Gafete</button>
          {canEdit && <button className="pl-btn main" onClick={() => { setForm({ ...verDetalle }); setActiveTab('personal'); setShowModal(true); setVerDetalle(null); setError(''); }}>Editar</button>}
          <button className="pl-btn" onClick={() => setVerDetalle(null)}>Cerrar</button>
        </div>
      </div>
    </div>, document.body
  );

  return (
    <div className="pl-wrap">
      <style>{PL_STYLES}</style>
      {modal}{detalleModal}
      {gafeteColab && (
        <GafeteColaborador
          colaborador={{
            ...gafeteColab,
            cargo:       cargos.find(c => c.id === gafeteColab.cargo_id)?.nombre ?? null,
            departamento: deptos.find(d => d.id === gafeteColab.departamento_id)?.nombre ?? null,
          }}
          empresa={{ id: empresaId, nombre: empresaNombre ?? 'MYA ERP', logo_url: empresaLogo }}
          onClose={() => setGafeteColab(null)}
        />
      )}

      <div className="pl-hdr">
        <div className="pl-hdr-left">
          <h2 className="pl-title">Colaboradores</h2>
          <p className="pl-sub">{lista.length} registrado{lista.length !== 1 ? 's' : ''}</p>
        </div>
        {canEdit && <button className="pl-btn main" onClick={() => { setForm(emptyColab()); setActiveTab('personal'); setError(''); setShowModal(true); }}>+ Nuevo Colaborador</button>}
      </div>

      {/* KPIs */}
      <div className="pl-kpi-grid">
        {[
          { l:'Activos',       v: lista.filter(c=>c.estado==='activo').length,       c:'#22c55e' },
          { l:'Vacaciones',    v: lista.filter(c=>c.estado==='vacaciones').length,    c:'#38bdf8' },
          { l:'Incapacitados', v: lista.filter(c=>c.estado==='incapacitado').length,  c:'#f59e0b' },
          { l:'Inactivos',     v: lista.filter(c=>c.estado==='inactivo').length,      c:'#8ea3c7' },
        ].map(s => (
          <div className="pl-kpi" key={s.l}>
            <div className="k">{s.l}</div>
            <div className="v" style={{ color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="pl-filters">
        <input className="pl-input flex" placeholder="Buscar nombre, cédula, código..." value={buscar} onChange={e => setBuscar(e.target.value)} />
        <select className="pl-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {['activo','inactivo','incapacitado','vacaciones','suspendido'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
        <select className="pl-select" value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)}>
          <option value="">Todos los departamentos</option>
          {deptos.map(d => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
        </select>
      </div>

      <div className="pl-card">
        <div className="pl-table-wrap">
          {loading ? <div className="pl-empty">Cargando colaboradores...</div> :
            colsFilt.length === 0 ? <div className="pl-empty">{lista.length === 0 ? 'No hay colaboradores. Agregue el primero.' : 'Sin resultados.'}</div> : (
              <table className="pl-table">
                <thead><tr><th>Cód.</th><th>Colaborador</th><th>Identificación</th><th>Departamento</th><th>Cargo</th><th className="r">Salario</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {colsFilt.map(c => (
                    <tr key={c.id} style={{ cursor:'pointer' }} onClick={() => setVerDetalle(c)}>
                      <td className="mono" style={{ color:'#8ea3c7', fontSize:12 }}>{c.numero_empleado || '—'}</td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                          {c.foto_url
                            ? <img src={c.foto_url} alt="foto" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', border:'1.5px solid #16a34a', flexShrink:0 }} />
                            : <div className="pl-avatar">{c.nombre_completo[0]?.toUpperCase()}</div>
                          }
                          <div>
                            <div style={{ fontWeight:600, color:'#f3f7ff' }}>{c.nombre_completo}</div>
                            <div style={{ fontSize:11, color:'#8ea3c7' }}>{c.email || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize:12 }}>{c.identificacion}</td>
                      <td style={{ color:'#8ea3c7' }}>{depto(c.departamento_id)}</td>
                      <td style={{ color:'#8ea3c7' }}>{cargo(c.cargo_id)}</td>
                      <td className="mono r">{fmtSalario(c.salario)}</td>
                      <td><span className="pl-chip" style={{ background:(ESTADOS_COLOR[c.estado]??'#8ea3c7')+'33', color:ESTADOS_COLOR[c.estado]??'#8ea3c7' }}>{c.estado.charAt(0).toUpperCase()+c.estado.slice(1)}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button className="pl-btn" style={{ padding:'4px 10px', fontSize:12, borderColor:'#16a34a', color:'#22c55e' }} onClick={() => setGafeteColab(c)}>Gafete</button>
                          {canEdit && <button className="pl-btn" style={{ padding:'4px 10px', fontSize:12 }} onClick={() => { setForm({ ...c }); setActiveTab('personal'); setError(''); setShowModal(true); }}>Editar</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}
