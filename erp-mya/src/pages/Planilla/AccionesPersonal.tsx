import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabase';
import { logModuloEvento } from '../../utils/bitacora';
import { formatMoneyCRC } from '../../utils/reporting';
import { formatCompanyDate } from '../../utils/companyTimeZone';
import { PL_STYLES } from './planillaStyles';

interface Props { empresaId: number; canEdit?: boolean; }
interface Colaborador { id:number; nombre_completo:string; numero_empleado:string|null; departamento_id:number|null; cargo_id:number|null; salario:number; }
interface Departamento { id:number; nombre:string; }
interface Cargo { id:number; nombre:string; }
interface Accion { id:number; colaborador_id:number; tipo:string; fecha_efectiva:string; descripcion:string; departamento_anterior_id:number|null; cargo_anterior_id:number|null; salario_anterior:number|null; departamento_nuevo_id:number|null; cargo_nuevo_id:number|null; salario_nuevo:number|null; aprobado_por:string|null; estado:string; }

const TIPOS = [
  { v:'ingreso',l:'Ingreso',c:'#22c55e' }, { v:'aumento_salario',l:'Aumento de Salario',c:'#38bdf8' },
  { v:'traslado_departamento',l:'Traslado Departamento',c:'#a78bfa' }, { v:'traslado_cargo',l:'Traslado Cargo',c:'#a78bfa' },
  { v:'cambio_horario',l:'Cambio Horario',c:'#8ea3c7' }, { v:'amonestacion_verbal',l:'Amonestación Verbal',c:'#f59e0b' },
  { v:'amonestacion_escrita',l:'Amonestación Escrita',c:'#f87171' }, { v:'suspension',l:'Suspensión',c:'#f87171' },
  { v:'reintegro',l:'Reintegro',c:'#22c55e' }, { v:'nombramiento',l:'Nombramiento',c:'#38bdf8' },
  { v:'reconocimiento',l:'Reconocimiento',c:'#f59e0b' }, { v:'cambio_contrato',l:'Cambio Contrato',c:'#8ea3c7' },
  { v:'desvinculacion',l:'Desvinculación',c:'#8ea3c7' }, { v:'otro',l:'Otro',c:'#8ea3c7' },
];
const tipoL = (v:string) => TIPOS.find(t=>t.v===v)?.l ?? v;
const tipoC = (v:string) => TIPOS.find(t=>t.v===v)?.c ?? '#8ea3c7';
const TIENE_CAMBIO = (t:string) => ['aumento_salario','traslado_departamento','traslado_cargo'].includes(t);

export default function AccionesPersonal({ empresaId, canEdit }: Props) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [deptos, setDeptos] = useState<Departamento[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroColab, setFiltroColab] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Accion>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: acc }, { data: cols }, { data: dep }, { data: car }] = await Promise.all([
      supabase.from('pl_acciones_personal').select('*').eq('empresa_id', empresaId).order('fecha_efectiva',{ascending:false}),
      supabase.from('pl_colaboradores').select('id,nombre_completo,numero_empleado,departamento_id,cargo_id,salario').eq('empresa_id', empresaId).order('nombre_completo'),
      supabase.from('pl_departamentos').select('id,nombre').eq('empresa_id', empresaId).eq('activo',true),
      supabase.from('pl_cargos').select('id,nombre').eq('empresa_id', empresaId).eq('activo',true),
    ]);
    setAcciones(acc||[]); setColaboradores(cols||[]); setDeptos(dep||[]); setCargos(car||[]);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const colabSel = form.colaborador_id ? colaboradores.find(c=>c.id===form.colaborador_id) : null;

  const handleSave = async () => {
    if (!form.colaborador_id) { setError('Seleccione un colaborador.'); return; }
    if (!form.tipo) { setError('Seleccione el tipo.'); return; }
    if (!form.fecha_efectiva) { setError('Fecha efectiva requerida.'); return; }
    if (!form.descripcion?.trim()) { setError('Descripción requerida.'); return; }
    setSaving(true); setError('');
    const colab = colaboradores.find(c=>c.id===form.colaborador_id);
    const payload = { empresa_id:empresaId, colaborador_id:form.colaborador_id, tipo:form.tipo, fecha_efectiva:form.fecha_efectiva, descripcion:form.descripcion.trim(), departamento_anterior_id:colab?.departamento_id??null, cargo_anterior_id:colab?.cargo_id??null, salario_anterior:colab?.salario??null, departamento_nuevo_id:form.departamento_nuevo_id??null, cargo_nuevo_id:form.cargo_nuevo_id??null, salario_nuevo:form.salario_nuevo??null, aprobado_por:form.aprobado_por?.trim()||null, estado:'vigente', updated_at:new Date().toISOString() };
    const esEdicion = !!(form as Accion).id;
    const { error: err } = esEdicion
      ? await supabase.from('pl_acciones_personal').update(payload).eq('id', (form as Accion).id)
      : await supabase.from('pl_acciones_personal').insert(payload);
    if (err) { setError(err.message); }
    else {
      if (!esEdicion && colab) {
        const cambios: Record<string,unknown> = { updated_at:new Date().toISOString() };
        if (form.tipo==='aumento_salario' && form.salario_nuevo) cambios.salario = form.salario_nuevo;
        if (form.tipo==='traslado_departamento' && form.departamento_nuevo_id) cambios.departamento_id = form.departamento_nuevo_id;
        if (form.tipo==='traslado_cargo' && form.cargo_nuevo_id) cambios.cargo_id = form.cargo_nuevo_id;
        if (Object.keys(cambios).length > 1) await supabase.from('pl_colaboradores').update(cambios).eq('id', colab.id);
        logModuloEvento({ empresaId, modulo:'planilla', accion:'accion_personal', descripcion:`${form.tipo} — ${colab.nombre_completo}` });
      }
      setShowModal(false); load();
    }
    setSaving(false);
  };

  const colNombre = (id:number) => colaboradores.find(c=>c.id===id)?.nombre_completo ?? String(id);
  const depNombre = (id:number|null) => deptos.find(d=>d.id===id)?.nombre ?? '—';
  const carNombre = (id:number|null) => cargos.find(c=>c.id===id)?.nombre ?? '—';

  const filtered = acciones.filter(a => {
    const txt = filtroColab.toLowerCase();
    return (!txt || colNombre(a.colaborador_id).toLowerCase().includes(txt)) && (!filtroTipo || a.tipo===filtroTipo);
  });

  const modal = showModal && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowModal(false)}>
      <div className="pl-modal wide" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">{(form as Accion).id ? 'Editar Acción' : 'Nueva Acción de Personal'}</p>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-field"><label>Colaborador *</label>
          <select className="pl-select" value={form.colaborador_id??''} onChange={e => setForm(p=>({...p,colaborador_id:Number(e.target.value)}))}>
            <option value="">— Seleccione —</option>
            {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
          </select>
        </div>
        {colabSel && <div className="pl-info">Depto: <strong>{depNombre(colabSel.departamento_id)}</strong> · Cargo: <strong>{carNombre(colabSel.cargo_id)}</strong> · Salario: <strong>{formatMoneyCRC(colabSel.salario)}</strong></div>}
        <div className="pl-g2">
          <div className="pl-field"><label>Tipo de Acción *</label>
            <select className="pl-select" value={form.tipo??''} onChange={e => setForm(p=>({...p,tipo:e.target.value}))}>
              <option value="">— Seleccione —</option>
              {TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div className="pl-field"><label>Fecha Efectiva *</label><input type="date" className="pl-input" value={form.fecha_efectiva??''} onChange={e => setForm(p=>({...p,fecha_efectiva:e.target.value}))} /></div>
        </div>
        {form.tipo === 'aumento_salario' && (
          <div className="pl-field">
            <label>Nuevo Salario (CRC)</label>
            <input type="number" className="pl-input" value={form.salario_nuevo??''} onChange={e => setForm(p=>({...p,salario_nuevo:Number(e.target.value)}))} />
            {colabSel && form.salario_nuevo && <div style={{ fontSize:12, color:'#22c55e', marginTop:3 }}>{formatMoneyCRC(colabSel.salario)} → {formatMoneyCRC(form.salario_nuevo)} ({colabSel.salario>0?((form.salario_nuevo/colabSel.salario-1)*100).toFixed(1):'—'}%)</div>}
          </div>
        )}
        {form.tipo === 'traslado_departamento' && (
          <div className="pl-field"><label>Nuevo Departamento</label>
            <select className="pl-select" value={form.departamento_nuevo_id??''} onChange={e => setForm(p=>({...p,departamento_nuevo_id:Number(e.target.value)}))}>
              <option value="">— Seleccione —</option>
              {deptos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
        )}
        {form.tipo === 'traslado_cargo' && (
          <div className="pl-field"><label>Nuevo Cargo</label>
            <select className="pl-select" value={form.cargo_nuevo_id??''} onChange={e => setForm(p=>({...p,cargo_nuevo_id:Number(e.target.value)}))}>
              <option value="">— Seleccione —</option>
              {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}
        <div className="pl-field"><label>Descripción / Detalle *</label><textarea value={form.descripcion??''} onChange={e => setForm(p=>({...p,descripcion:e.target.value}))} /></div>
        <div className="pl-field"><label>Aprobado por</label><input className="pl-input" value={form.aprobado_por??''} onChange={e => setForm(p=>({...p,aprobado_por:e.target.value}))} /></div>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => { setShowModal(false); setError(''); }}>Cancelar</button>
          <button className="pl-btn main" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Registrar Acción'}</button>
        </div>
      </div>
    </div>, document.body
  );

  return (
    <div className="pl-wrap">
      <style>{PL_STYLES}</style>
      {modal}
      <div className="pl-hdr">
        <div className="pl-hdr-left"><h2 className="pl-title">Acciones de Personal</h2><p className="pl-sub">Historial de cambios, aumentos, sanciones y nombramientos</p></div>
        {canEdit && <button className="pl-btn main" onClick={() => { setForm({ tipo:'aumento_salario' }); setError(''); setShowModal(true); }}>+ Nueva Acción</button>}
      </div>
      <div className="pl-filters">
        <input className="pl-input flex" placeholder="Buscar colaborador..." value={filtroColab} onChange={e => setFiltroColab(e.target.value)} />
        <select className="pl-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
      </div>
      <div className="pl-card">
        <div className="pl-table-wrap">
          {loading ? <div className="pl-empty">Cargando...</div> : filtered.length === 0 ? <div className="pl-empty">No hay acciones registradas.</div> : (
            <table className="pl-table">
              <thead><tr><th>Fecha</th><th>Colaborador</th><th>Tipo</th><th>Detalle</th><th>Antes</th><th>Después</th><th>Aprobó</th><th></th></tr></thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id}>
                    <td className="mono" style={{ color:'#8ea3c7', whiteSpace:'nowrap' }}>{formatCompanyDate(a.fecha_efectiva)}</td>
                    <td style={{ fontWeight:600, color:'#f3f7ff' }}>{colNombre(a.colaborador_id)}</td>
                    <td><span className="pl-chip" style={{ background:tipoC(a.tipo)+'33', color:tipoC(a.tipo), whiteSpace:'nowrap' }}>{tipoL(a.tipo)}</span></td>
                    <td style={{ color:'#8ea3c7', fontSize:12, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.descripcion}</td>
                    <td style={{ color:'#8ea3c7', fontSize:12 }}>
                      {TIENE_CAMBIO(a.tipo) && (a.tipo==='aumento_salario' ? formatMoneyCRC(a.salario_anterior??0) : a.tipo==='traslado_departamento' ? depNombre(a.departamento_anterior_id) : carNombre(a.cargo_anterior_id))}
                    </td>
                    <td style={{ color:'#22c55e', fontSize:12, fontWeight:600 }}>
                      {TIENE_CAMBIO(a.tipo) && (a.tipo==='aumento_salario' ? formatMoneyCRC(a.salario_nuevo??0) : a.tipo==='traslado_departamento' ? depNombre(a.departamento_nuevo_id) : carNombre(a.cargo_nuevo_id))}
                    </td>
                    <td style={{ color:'#8ea3c7', fontSize:12 }}>{a.aprobado_por||'—'}</td>
                    <td>{canEdit && a.estado==='vigente' && <button className="pl-btn" style={{ padding:'4px 11px', fontSize:11 }} onClick={() => { setForm({...a}); setError(''); setShowModal(true); }}>Editar</button>}</td>
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
