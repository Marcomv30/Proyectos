import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

interface Empresa {
  id?: number;
  codigo: string;
  cedula: string;
  nombre: string;
  domicilio: string;
  provincia: string;
  canton: string;
  distrito: string;
  apartado: string;
  lugar: string;
  telefono: string;
  fax: string;
  actividad: string;
  email: string;
  rep_nombre: string;
  rep_apellido1: string;
  rep_apellido2: string;
  rep_cedula: string;
  rep_domicilio: string;
  contador: string;
  imp_venta: number;
  imp_incluido: boolean;
  activo: boolean;
  multimoneda: boolean;
  factura_electronica: boolean;
  actividad_id: number | null;
}

const estilos = `
  .form-wrap { max-width:900px; margin:0 auto; }
  .form-topbar { display:flex; align-items:center; gap:12px; margin-bottom:24px; }
  .btn-back { display:flex; align-items:center; gap:6px; padding:8px 14px;
    background:#f3f4f6; border:1px solid #e5e7eb; border-radius:8px;
    color:#374151; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.15s; }
  .btn-back:hover { background:#e5e7eb; }
  .form-page-title { font-size:18px; font-weight:600; color:#1f2937; }
  .form-card { background:white; border:1px solid #e5e7eb; border-radius:14px;
    padding:28px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .form-section-title { font-size:11px; font-weight:600; color:#16a34a;
    letter-spacing:0.08em; text-transform:uppercase; margin-bottom:18px;
    padding-bottom:8px; border-bottom:1px solid #dcfce7; }
  .form-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .form-grid-2 { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
  .form-group { display:flex; flex-direction:column; gap:5px; }
  .form-group.span2 { grid-column:span 2; }
  .form-group.span3 { grid-column:span 3; }
  .form-label { font-size:11px; font-weight:500; color:#6b7280;
    letter-spacing:0.04em; text-transform:uppercase; }
  .form-input { padding:9px 12px; border:1px solid #e5e7eb; border-radius:8px;
    font-size:13px; color:#1f2937; font-family:'DM Sans',sans-serif;
    outline:none; transition:border-color 0.2s, box-shadow 0.2s; }
  .form-input:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.1); }
  .form-check { display:flex; align-items:center; gap:8px; cursor:pointer; }
  .form-check input { width:16px; height:16px; accent-color:#16a34a; cursor:pointer; }
  .form-check span { font-size:13px; color:#374151; }
  .form-footer { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }
  .btn-guardar { padding:11px 24px;
    background:linear-gradient(135deg,#16a34a,#22c55e);
    border:none; border-radius:10px; color:white; font-size:14px;
    font-weight:600; cursor:pointer; transition:opacity 0.2s; }
  .btn-guardar:hover { opacity:0.9; }
  .btn-guardar:disabled { opacity:0.6; cursor:not-allowed; }
  .btn-cancelar { padding:11px 24px; background:#f3f4f6; border:1px solid #e5e7eb;
    border-radius:10px; color:#374151; font-size:14px; font-weight:500;
    cursor:pointer; transition:background 0.15s; }
  .btn-cancelar:hover { background:#e5e7eb; }
  .form-error { font-size:12px; color:#dc2626; margin-top:2px; }
  .form-success { padding:12px 16px; background:#dcfce7; border:1px solid #bbf7d0;
    border-radius:8px; color:#16a34a; font-size:13px; font-weight:500;
    margin-bottom:16px; }
`;

const vacio: Empresa = {
  codigo: '', cedula: '', nombre: '', domicilio: '', provincia: '',
  canton: '', distrito: '', apartado: '', lugar: '', telefono: '',
  fax: '', actividad: '', email: '', rep_nombre: '', rep_apellido1: '',
  rep_apellido2: '', rep_cedula: '', rep_domicilio: '', contador: '',
  imp_venta: 1.00, imp_incluido: true, activo: true,
  multimoneda: false, factura_electronica: false, actividad_id: null,
};
interface Actividad {
  id: number;
  codigo: string;
  descripcion: string;
}

export default function FormEmpresa({ empresa, onGuardar, onCancelar }: {
  empresa: Empresa | null;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState<Empresa>(empresa ? { ...empresa } : { ...vacio });
  const [guardando, setGuardando] = useState(false);
  const [actividades, setActividades] = useState<Actividad[]>([]);
    useEffect(() => {
    supabase.from('actividad_empresa')
        .select('*').eq('activo', true).order('descripcion')
        .then(({ data }) => { if (data) setActividades(data); });
    }, []);
  const [exito, setExito] = useState('');
  const [errores, setErrores] = useState<Partial<Record<keyof Empresa, string>>>({});

  const set = (campo: keyof Empresa, valor: any) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setErrores(prev => ({ ...prev, [campo]: '' }));
  };

  const validar = () => {
    const e: Partial<Record<keyof Empresa, string>> = {};
    if (!form.codigo.trim()) e.codigo = 'Requerido';
    if (!form.cedula.trim()) e.cedula = 'Requerido';
    if (!form.nombre.trim()) e.nombre = 'Requerido';
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const guardar = async () => {
    if (!validar()) return;
    setGuardando(true);
    const { id, ...datos } = form;
    let error;
    if (empresa?.id) {
      ({ error } = await supabase.from('empresas').update(datos).eq('id', empresa.id));
    } else {
      ({ error } = await supabase.from('empresas').insert(datos));
    }
    setGuardando(false);
    if (error) { alert('Error: ' + error.message); return; }
    setExito(empresa?.id ? 'Empresa actualizada correctamente' : 'Empresa creada correctamente');
    setTimeout(() => onGuardar(), 1200);
  };

  return (
    <>
      <style>{estilos}</style>
      <div className="form-wrap">
        <div className="form-topbar">
          <button className="btn-back" onClick={onCancelar}>← Volver</button>
          <div className="form-page-title">
            {empresa?.id ? `Editar Empresa — ${empresa.codigo}` : 'Nueva Empresa'}
          </div>
        </div>

        {exito && <div className="form-success">✓ {exito}</div>}

        {/* Datos generales */}
        <div className="form-card">
          <div className="form-section-title">Datos Generales</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Código *</label>
              <input className="form-input" value={form.codigo}
                onChange={e => set('codigo', e.target.value)} placeholder="001" maxLength={3} />
              {errores.codigo && <span className="form-error">{errores.codigo}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Cédula *</label>
              <input className="form-input" value={form.cedula}
                onChange={e => set('cedula', e.target.value)} placeholder="3101105236" />
              {errores.cedula && <span className="form-error">{errores.cedula}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Actividad</label>
                <select className="form-input" value={form.actividad_id || ''}
                onChange={e => set('actividad_id', e.target.value ? parseInt(e.target.value) : null)}>
                <option value="">-- Seleccione --</option>
                {actividades.map(act => (
                    <option key={act.id} value={act.id}>{act.descripcion}</option>
                ))}
                </select>
            </div>
            <div className="form-group span3">
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={form.nombre}
                onChange={e => set('nombre', e.target.value)}
                placeholder="Nombre completo de la empresa" />
              {errores.nombre && <span className="form-error">{errores.nombre}</span>}
            </div>
            <div className="form-group span2">
              <label className="form-label">Domicilio</label>
              <input className="form-input" value={form.domicilio}
                onChange={e => set('domicilio', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Lugar</label>
              <input className="form-input" value={form.lugar}
                onChange={e => set('lugar', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Provincia</label>
              <input className="form-input" value={form.provincia}
                onChange={e => set('provincia', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cantón</label>
              <input className="form-input" value={form.canton}
                onChange={e => set('canton', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Distrito</label>
              <input className="form-input" value={form.distrito}
                onChange={e => set('distrito', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <input className="form-input" value={form.telefono}
                onChange={e => set('telefono', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fax</label>
              <input className="form-input" value={form.fax}
                onChange={e => set('fax', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Apartado</label>
              <input className="form-input" value={form.apartado}
                onChange={e => set('apartado', e.target.value)} />
            </div>
            <div className="form-group span2">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email}
                onChange={e => set('email', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Representante Legal */}
        <div className="form-card">
          <div className="form-section-title">Representante Legal</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input className="form-input" value={form.rep_nombre}
                onChange={e => set('rep_nombre', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Primer Apellido</label>
              <input className="form-input" value={form.rep_apellido1}
                onChange={e => set('rep_apellido1', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Segundo Apellido</label>
              <input className="form-input" value={form.rep_apellido2}
                onChange={e => set('rep_apellido2', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cédula</label>
              <input className="form-input" value={form.rep_cedula}
                onChange={e => set('rep_cedula', e.target.value)} />
            </div>
            <div className="form-group span2">
              <label className="form-label">Domicilio</label>
              <input className="form-input" value={form.rep_domicilio}
                onChange={e => set('rep_domicilio', e.target.value)} />
            </div>
            <div className="form-group span3">
              <label className="form-label">Contador</label>
              <input className="form-input" value={form.contador}
                onChange={e => set('contador', e.target.value)}
                placeholder="CPI. Marco A. Morales Vargas" />
            </div>
          </div>
        </div>

        {/* Configuración */}
        <div className="form-card">
          <div className="form-section-title">Configuración</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Impuesto de Venta %</label>
              <input className="form-input" type="number" step="0.01"
                value={form.imp_venta}
                onChange={e => set('imp_venta', parseFloat(e.target.value))} />
            </div>
            <div className="form-group" style={{ justifyContent: 'center', gap: '12px' }}>
              <label className="form-check">
                <input type="checkbox" checked={form.imp_incluido}
                  onChange={e => set('imp_incluido', e.target.checked)} />
                <span>Impuesto Incluido</span>
              </label>
              <label className="form-check">
                <input type="checkbox" checked={form.multimoneda}
                  onChange={e => set('multimoneda', e.target.checked)} />
                <span>Multimoneda</span>
              </label>
            </div>
            <div className="form-group" style={{ justifyContent: 'center', gap: '12px' }}>
              <label className="form-check">
                <input type="checkbox" checked={form.factura_electronica}
                  onChange={e => set('factura_electronica', e.target.checked)} />
                <span>Facturación Electrónica</span>
              </label>
              <label className="form-check">
                <input type="checkbox" checked={form.activo}
                  onChange={e => set('activo', e.target.checked)} />
                <span>Empresa Activa</span>
              </label>
            </div>
          </div>
        </div>

        <div className="form-footer">
          <button className="btn-cancelar" onClick={onCancelar}>Cancelar</button>
          <button className="btn-guardar" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : empresa?.id ? 'Actualizar Empresa' : 'Crear Empresa'}
          </button>
        </div>
      </div>
    </>
  );
}