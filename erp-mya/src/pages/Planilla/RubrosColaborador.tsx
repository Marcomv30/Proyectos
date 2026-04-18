import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabase';
import { formatMoneyCRC } from '../../utils/reporting';
import { formatCompanyDate } from '../../utils/companyTimeZone';
import { PL_STYLES } from './planillaStyles';

interface Props { empresaId: number; canEdit?: boolean; }

interface Colaborador { id: number; nombre_completo: string; numero_empleado: string | null; }
interface Rubro {
  id: number;
  colaborador_id: number;
  tipo: string;
  descripcion: string | null;
  monto: number;
  recurrente: boolean;
  fecha_inicio: string;
  fecha_fin: string | null;
  activo: boolean;
  referencia: string | null;
}

const TIPOS = [
  { v:'embargo',        l:'Embargo judicial',       c:'#f87171', signo:'-' },
  { v:'adelanto',       l:'Adelanto de salario',     c:'#f59e0b', signo:'-' },
  { v:'bono',           l:'Bono',                    c:'#22c55e', signo:'+' },
  { v:'comision',       l:'Comisión',                c:'#38bdf8', signo:'+' },
  { v:'hora_extra',     l:'Horas extra fijas',       c:'#a78bfa', signo:'+' },
  { v:'otro_ingreso',   l:'Otro ingreso',            c:'#22c55e', signo:'+' },
  { v:'otro_descuento', l:'Otro descuento',          c:'#f87171', signo:'-' },
];
const tipoL = (v: string) => TIPOS.find(t => t.v === v)?.l ?? v;
const tipoC = (v: string) => TIPOS.find(t => t.v === v)?.c ?? '#8ea3c7';
const tipoS = (v: string) => TIPOS.find(t => t.v === v)?.signo ?? '';

const emptyRubro = (): Partial<Rubro> => ({
  tipo: 'embargo', descripcion: '', monto: 0, recurrente: false,
  fecha_inicio: new Date().toLocaleDateString('en-CA', { timeZone:'America/Costa_Rica' }),
  fecha_fin: null, activo: true, referencia: '',
});

export default function RubrosColaborador({ empresaId, canEdit }: Props) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroColab, setFiltroColab] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Rubro> & { colaborador_id?: number }>(emptyRubro());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rubs }, { data: cols }] = await Promise.all([
      supabase.from('pl_rubros_colaborador').select('*').eq('empresa_id', empresaId).order('colaborador_id').order('fecha_inicio', { ascending: false }),
      supabase.from('pl_colaboradores').select('id,nombre_completo,numero_empleado').eq('empresa_id', empresaId).in('estado',['activo','vacaciones','incapacitado']).order('nombre_completo'),
    ]);
    setRubros(rubs || []); setColaboradores(cols || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.colaborador_id) { setError('Seleccione un colaborador.'); return; }
    if (!form.tipo)           { setError('Seleccione el tipo.'); return; }
    if (!form.monto || form.monto <= 0) { setError('El monto debe ser mayor a cero.'); return; }
    if (!form.fecha_inicio)   { setError('Fecha inicio requerida.'); return; }
    setSaving(true); setError('');
    const payload = {
      empresa_id: empresaId,
      colaborador_id: form.colaborador_id,
      tipo: form.tipo,
      descripcion: form.descripcion?.trim() || null,
      monto: form.monto,
      recurrente: form.recurrente ?? false,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin || null,
      activo: form.activo ?? true,
      referencia: form.referencia?.trim() || null,
    };
    const { error: err } = (form as Rubro).id
      ? await supabase.from('pl_rubros_colaborador').update(payload).eq('id', (form as Rubro).id)
      : await supabase.from('pl_rubros_colaborador').insert(payload);
    if (err) { setError(err.message); }
    else { setShowModal(false); load(); }
    setSaving(false);
  };

  const colNombre = (id: number) => {
    const c = colaboradores.find(x => x.id === id);
    return c ? `${c.nombre_completo}${c.numero_empleado ? ` (${c.numero_empleado})` : ''}` : String(id);
  };

  const filtered = rubros.filter(r => {
    const txt = filtroColab.toLowerCase();
    return (!txt || colNombre(r.colaborador_id).toLowerCase().includes(txt))
      && (!filtroTipo || r.tipo === filtroTipo)
      && (!soloActivos || r.activo);
  });

  // Agrupar por colaborador para mostrar resumen
  const porColab = colaboradores.map(c => ({
    ...c,
    ingresos:   filtered.filter(r => r.colaborador_id === c.id && ['+'].includes(tipoS(r.tipo))).reduce((s,r) => s+r.monto, 0),
    descuentos: filtered.filter(r => r.colaborador_id === c.id && ['-'].includes(tipoS(r.tipo))).reduce((s,r) => s+r.monto, 0),
    count:      filtered.filter(r => r.colaborador_id === c.id).length,
  })).filter(c => c.count > 0);

  const modal = showModal && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowModal(false)}>
      <div className="pl-modal" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">{(form as Rubro).id ? 'Editar Rubro' : 'Nuevo Rubro Variable'}</p>
        <p className="pl-modal-sub">Los rubros activos se aplican automáticamente al calcular la planilla.</p>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-field">
          <label>Colaborador *</label>
          <select className="pl-select" value={form.colaborador_id ?? ''} onChange={e => setForm(p => ({ ...p, colaborador_id: Number(e.target.value) }))}>
            <option value="">— Seleccione —</option>
            {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
          </select>
        </div>
        <div className="pl-g2">
          <div className="pl-field">
            <label>Tipo *</label>
            <select className="pl-select" value={form.tipo ?? 'embargo'} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
              {TIPOS.map(t => <option key={t.v} value={t.v}>{t.signo} {t.l}</option>)}
            </select>
          </div>
          <div className="pl-field">
            <label>Monto (CRC) *</label>
            <input type="number" className="pl-input" value={form.monto ?? ''} onChange={e => setForm(p => ({ ...p, monto: Number(e.target.value) }))} />
          </div>
          <div className="pl-field">
            <label>Fecha Inicio *</label>
            <input type="date" className="pl-input" value={form.fecha_inicio ?? ''} onChange={e => setForm(p => ({ ...p, fecha_inicio: e.target.value }))} />
          </div>
          <div className="pl-field">
            <label>Fecha Fin</label>
            <input type="date" className="pl-input" value={form.fecha_fin ?? ''} onChange={e => setForm(p => ({ ...p, fecha_fin: e.target.value || null }))} />
          </div>
        </div>
        <div className="pl-field">
          <label>Descripción</label>
          <input className="pl-input" value={form.descripcion ?? ''} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Embargo Exp. 21-001234-0506" />
        </div>
        <div className="pl-field">
          <label>Referencia / N° Expediente</label>
          <input className="pl-input" value={form.referencia ?? ''} onChange={e => setForm(p => ({ ...p, referencia: e.target.value }))} />
        </div>
        <div style={{ display:'flex', gap:20, marginBottom:14 }}>
          <label className="pl-check-row" style={{ marginBottom:0 }}>
            <input type="checkbox" checked={form.recurrente ?? false} onChange={e => setForm(p => ({ ...p, recurrente: e.target.checked }))} />
            Recurrente (aplica cada período)
          </label>
          <label className="pl-check-row" style={{ marginBottom:0 }}>
            <input type="checkbox" checked={form.activo ?? true} onChange={e => setForm(p => ({ ...p, activo: e.target.checked }))} />
            Activo
          </label>
        </div>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => { setShowModal(false); setError(''); }}>Cancelar</button>
          <button className="pl-btn main" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>, document.body
  );

  return (
    <div className="pl-wrap">
      <style>{PL_STYLES}</style>
      {modal}

      <div className="pl-hdr">
        <div className="pl-hdr-left">
          <h2 className="pl-title">Rubros Variables</h2>
          <p className="pl-sub">Embargos, adelantos, bonos y otros rubros por colaborador</p>
        </div>
        {canEdit && <button className="pl-btn main" onClick={() => { setForm(emptyRubro()); setError(''); setShowModal(true); }}>+ Nuevo Rubro</button>}
      </div>

      {/* Resumen por colaborador */}
      {porColab.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:8, marginBottom:16 }}>
          {porColab.map(c => (
            <div key={c.id} className="pl-card pl-card-p" style={{ padding:'10px 14px' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#f3f7ff', marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.nombre_completo}</div>
              {c.ingresos > 0 && <div style={{ fontSize:11, color:'#22c55e' }}>+ {formatMoneyCRC(c.ingresos)}</div>}
              {c.descuentos > 0 && <div style={{ fontSize:11, color:'#f87171' }}>− {formatMoneyCRC(c.descuentos)}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="pl-filters">
        <input className="pl-input flex" placeholder="Buscar colaborador..." value={filtroColab} onChange={e => setFiltroColab(e.target.value)} />
        <select className="pl-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t.v} value={t.v}>{t.signo} {t.l}</option>)}
        </select>
        <label className="pl-check-row" style={{ marginBottom:0, fontSize:13 }}>
          <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)} />
          Solo activos
        </label>
      </div>

      <div className="pl-card">
        <div className="pl-table-wrap">
          {loading ? <div className="pl-empty">Cargando...</div> : filtered.length === 0 ? <div className="pl-empty">No hay rubros variables registrados.</div> : (
            <table className="pl-table">
              <thead>
                <tr>
                  <th>Colaborador</th><th>Tipo</th><th>Descripción</th>
                  <th className="r">Monto</th><th>Desde</th><th>Hasta</th>
                  <th>Recurrente</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight:600, color:'#f3f7ff' }}>{colNombre(r.colaborador_id)}</td>
                    <td>
                      <span className="pl-chip" style={{ background:tipoC(r.tipo)+'33', color:tipoC(r.tipo) }}>
                        {tipoS(r.tipo)} {tipoL(r.tipo)}
                      </span>
                    </td>
                    <td style={{ color:'#8ea3c7', fontSize:12 }}>{r.descripcion || '—'}</td>
                    <td className="r mono" style={{ fontWeight:700, color: tipoS(r.tipo) === '+' ? '#22c55e' : '#f87171' }}>
                      {tipoS(r.tipo)}{formatMoneyCRC(r.monto)}
                    </td>
                    <td className="mono" style={{ color:'#8ea3c7', fontSize:12 }}>{formatCompanyDate(r.fecha_inicio)}</td>
                    <td className="mono" style={{ color:'#8ea3c7', fontSize:12 }}>{r.fecha_fin ? formatCompanyDate(r.fecha_fin) : '∞'}</td>
                    <td style={{ fontSize:12 }}>{r.recurrente ? <span style={{ color:'#22c55e' }}>Sí</span> : <span style={{ color:'#8ea3c7' }}>No</span>}</td>
                    <td><span className="pl-chip" style={{ background: r.activo ? '#16a34a33' : '#1a2e1a66', color: r.activo ? '#22c55e' : '#8ea3c7' }}>{r.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>{canEdit && <button className="pl-btn" style={{ padding:'4px 11px', fontSize:11 }} onClick={() => { setForm({ ...r }); setError(''); setShowModal(true); }}>Editar</button>}</td>
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
