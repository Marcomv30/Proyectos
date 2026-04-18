import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabase';
import { logModuloEvento } from '../../utils/bitacora';
import { formatCompanyDate } from '../../utils/companyTimeZone';
import { PL_STYLES } from './planillaStyles';

interface Props { empresaId: number; canEdit?: boolean; }
interface Colaborador { id: number; nombre_completo: string; numero_empleado: string | null; }
interface TipoAusencia { id: number; nombre: string; tipo_base: string; remunerado: boolean; }
interface Ausencia {
  id: number; colaborador_id: number; tipo_ausencia_id: number;
  fecha_inicio: string; fecha_fin: string; dias_habiles: number | null;
  dias_naturales: number | null; remunerada: boolean; numero_expediente: string | null;
  porcentaje_pago: number; aprobado: boolean; aprobado_por: string | null;
  notas: string | null; estado: string;
}
interface SaldoVac {
  colaborador_id: number;
  periodo_inicio: string;
  periodo_fin: string;
  dias_generados: number;
  dias_disfrutados: number;
  dias_saldo: number;
}

interface AusenciaVac {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_naturales: number | null;
  dias_habiles: number | null;
  estado: string;
  notas: string | null;
  tipo_ausencia_id: number;
}

const ESTADO_COLORS: Record<string, string> = { pendiente:'#f59e0b', aprobada:'#22c55e', rechazada:'#f87171', cancelada:'#8ea3c7' };
const diffDias = (a: string, b: string) => Math.round((new Date(b+'T12:00:00').getTime() - new Date(a+'T12:00:00').getTime()) / 86400000) + 1;

export default function AusenciasPermisos({ empresaId, canEdit }: Props) {
  const [tab, setTab] = useState<'ausencias'|'saldos'>('ausencias');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [tipos, setTipos] = useState<TipoAusencia[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [saldos, setSaldos] = useState<SaldoVac[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroColab, setFiltroColab] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroMes, setFiltroMes] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone:'America/Costa_Rica' }).slice(0,7));
  const [filtroAnio, setFiltroAnio] = useState(() => new Date().getFullYear());
  const [generando, setGenerando] = useState(false);
  const [genMsg, setGenMsg] = useState('');
  const [genOk, setGenOk] = useState(false);
  const [historialColab, setHistorialColab] = useState<{ colab: Colaborador; saldo: SaldoVac } | null>(null);
  const [historial, setHistorial] = useState<AusenciaVac[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Ausencia>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const inicio = filtroMes + '-01';
    const fin = new Date(new Date(inicio).getFullYear(), new Date(inicio).getMonth() + 1, 0).toISOString().slice(0,10);
    const [{ data: aus }, { data: cols }, { data: tip }, { data: sal }] = await Promise.all([
      supabase.from('pl_ausencias').select('*').eq('empresa_id', empresaId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin).order('fecha_inicio', { ascending:false }),
      supabase.from('pl_colaboradores').select('id,nombre_completo,numero_empleado').eq('empresa_id', empresaId).in('estado',['activo','vacaciones','incapacitado']).order('nombre_completo'),
      supabase.from('pl_tipos_ausencia').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('pl_vacaciones_saldo').select('*').eq('empresa_id', empresaId).gte('periodo_inicio', `${filtroAnio}-01-01`).lte('periodo_inicio', `${filtroAnio}-12-31`).order('colaborador_id'),
    ]);
    setAusencias(aus || []); setColaboradores(cols || []); setTipos(tip || []); setSaldos(sal || []);
    setLoading(false);
  }, [empresaId, filtroMes, filtroAnio]);

  useEffect(() => { load(); }, [load]);

  const handleGenerarSaldos = async () => {
    setGenerando(true); setGenMsg(''); setGenOk(false);
    const { data, error: err } = await supabase.rpc('fn_generar_saldo_vacaciones_anual', { p_empresa_id: empresaId, p_anio: filtroAnio });
    if (err) { setGenMsg(err.message); }
    else {
      const n = data as number ?? 0;
      setGenOk(true);
      setGenMsg(n > 0 ? `Se generaron ${n} saldo(s) para ${filtroAnio}.` : `No hay colaboradores nuevos para generar en ${filtroAnio} (los existentes ya tienen saldo o no tienen 50 semanas).`);
      load();
    }
    setGenerando(false);
  };

  const handleVerHistorial = async (colab: Colaborador, saldo: SaldoVac) => {
    setHistorialColab({ colab, saldo });
    setLoadingHistorial(true);
    setHistorial([]);
    // Buscar tipos de ausencia que descuentan vacaciones
    const tiposVac = tipos.filter(t => t.tipo_base === 'vacaciones').map(t => t.id);
    const { data } = await supabase
      .from('pl_ausencias')
      .select('id,fecha_inicio,fecha_fin,dias_naturales,dias_habiles,estado,notas,tipo_ausencia_id')
      .eq('empresa_id', empresaId)
      .eq('colaborador_id', colab.id)
      .gte('fecha_inicio', saldo.periodo_inicio)
      .lte('fecha_inicio', saldo.periodo_fin)
      .in('tipo_ausencia_id', tiposVac.length > 0 ? tiposVac : [-1])
      .order('fecha_inicio', { ascending: false });
    setHistorial((data as AusenciaVac[]) || []);
    setLoadingHistorial(false);
  };

  const handleSave = async () => {
    if (!form.colaborador_id) { setError('Seleccione un colaborador.'); return; }
    if (!form.tipo_ausencia_id) { setError('Seleccione el tipo.'); return; }
    if (!form.fecha_inicio || !form.fecha_fin) { setError('Fechas requeridas.'); return; }
    if (form.fecha_fin < form.fecha_inicio) { setError('Fecha fin no puede ser anterior a inicio.'); return; }
    setSaving(true); setError('');
    const tipo = tipos.find(t => t.id === form.tipo_ausencia_id);
    const payload = {
      empresa_id: empresaId, colaborador_id: form.colaborador_id, tipo_ausencia_id: form.tipo_ausencia_id,
      fecha_inicio: form.fecha_inicio, fecha_fin: form.fecha_fin,
      dias_naturales: diffDias(form.fecha_inicio!, form.fecha_fin!),
      dias_habiles: form.dias_habiles ?? null,
      remunerada: form.remunerada ?? tipo?.remunerado ?? true,
      numero_expediente: form.numero_expediente?.trim() || null,
      porcentaje_pago: form.porcentaje_pago ?? 100,
      aprobado: form.estado === 'aprobada',
      aprobado_por: form.aprobado_por?.trim() || null,
      notas: form.notas?.trim() || null,
      estado: form.estado ?? 'pendiente',
      updated_at: new Date().toISOString(),
    };
    const esEdicion = !!(form as Ausencia).id;
    const { error: err } = esEdicion
      ? await supabase.from('pl_ausencias').update(payload).eq('id', (form as Ausencia).id)
      : await supabase.from('pl_ausencias').insert(payload);
    if (err) { setError(err.message); }
    else {
      if (!esEdicion) logModuloEvento({ empresaId, modulo: 'planilla', accion: 'ausencia_registrada', descripcion: tipo?.nombre });
      setShowModal(false); load();
    }
    setSaving(false);
  };

  const colNombre = (id: number) => { const c = colaboradores.find(x => x.id === id); return c ? `${c.nombre_completo}${c.numero_empleado?` (${c.numero_empleado})`:'' }` : String(id); };
  const tipNombre = (id: number) => tipos.find(t => t.id === id)?.nombre ?? String(id);

  const filtered = ausencias.filter(a => {
    const txt = filtroColab.toLowerCase();
    return (!txt || colNombre(a.colaborador_id).toLowerCase().includes(txt)) && (!filtroEstado || a.estado === filtroEstado);
  });

  const resumen = tipos.map(t => ({ ...t, count: ausencias.filter(a => a.tipo_ausencia_id===t.id && a.estado!=='cancelada').length, dias: ausencias.filter(a => a.tipo_ausencia_id===t.id && a.estado!=='cancelada').reduce((s,a)=>s+(a.dias_naturales??0),0) })).filter(r => r.count > 0);

  const modal = showModal && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowModal(false)}>
      <div className="pl-modal" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">{(form as Ausencia).id ? 'Editar Ausencia' : 'Registrar Ausencia / Permiso'}</p>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-field"><label>Colaborador *</label>
          <select className="pl-select" value={form.colaborador_id ?? ''} onChange={e => setForm(p => ({ ...p, colaborador_id: Number(e.target.value) }))}>
            <option value="">— Seleccione —</option>
            {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
          </select>
        </div>
        <div className="pl-field"><label>Tipo de Ausencia *</label>
          <select className="pl-select" value={form.tipo_ausencia_id ?? ''}
            onChange={e => { const t = tipos.find(x => x.id===Number(e.target.value)); setForm(p => ({ ...p, tipo_ausencia_id: Number(e.target.value), remunerada: t?.remunerado ?? true })); }}>
            <option value="">— Seleccione —</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div className="pl-g2">
          <div className="pl-field"><label>Fecha Inicio *</label><input type="date" className="pl-input" value={form.fecha_inicio ?? ''} onChange={e => setForm(p => ({ ...p, fecha_inicio: e.target.value }))} /></div>
          <div className="pl-field"><label>Fecha Fin *</label><input type="date" className="pl-input" value={form.fecha_fin ?? ''} onChange={e => setForm(p => ({ ...p, fecha_fin: e.target.value }))} /></div>
        </div>
        {form.fecha_inicio && form.fecha_fin && form.fecha_fin >= form.fecha_inicio && (
          <div className="pl-ok" style={{ textAlign:'center', fontWeight:700, fontSize:13 }}>{diffDias(form.fecha_inicio, form.fecha_fin)} días naturales</div>
        )}
        <div className="pl-g2">
          <div className="pl-field"><label>Días Hábiles</label><input type="number" className="pl-input" value={form.dias_habiles ?? ''} onChange={e => setForm(p => ({ ...p, dias_habiles: e.target.value ? Number(e.target.value) : null }))} /></div>
          <div className="pl-field"><label>% Pago</label><input type="number" min={0} max={100} className="pl-input" value={form.porcentaje_pago ?? 100} onChange={e => setForm(p => ({ ...p, porcentaje_pago: Number(e.target.value) }))} /></div>
          <div className="pl-field"><label>N° Expediente CCSS</label><input className="pl-input" value={form.numero_expediente ?? ''} onChange={e => setForm(p => ({ ...p, numero_expediente: e.target.value }))} /></div>
          <div className="pl-field"><label>Estado</label>
            <select className="pl-select" value={form.estado ?? 'pendiente'} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
              {['pendiente','aprobada','rechazada','cancelada'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        {form.estado === 'aprobada' && (
          <div className="pl-field"><label>Aprobado por</label><input className="pl-input" value={form.aprobado_por ?? ''} onChange={e => setForm(p => ({ ...p, aprobado_por: e.target.value }))} /></div>
        )}
        <div className="pl-field"><label>Notas</label><textarea value={form.notas ?? ''} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} /></div>
        <label className="pl-check-row"><input type="checkbox" checked={form.remunerada ?? true} onChange={e => setForm(p => ({ ...p, remunerada: e.target.checked }))} />Ausencia remunerada</label>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => { setShowModal(false); setError(''); }}>Cancelar</button>
          <button className="pl-btn main" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>, document.body
  );

  const modalHistorial = historialColab && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setHistorialColab(null)}>
      <div className="pl-modal" style={{ maxWidth:580 }} onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">Historial de Vacaciones — {historialColab.colab.nombre_completo}</p>
        <p className="pl-modal-sub">
          Período {formatCompanyDate(historialColab.saldo.periodo_inicio)} al {formatCompanyDate(historialColab.saldo.periodo_fin)}
        </p>

        {/* Resumen de saldo */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          {([
            ['Días generados', historialColab.saldo.dias_generados, '#38bdf8'],
            ['Días disfrutados', historialColab.saldo.dias_disfrutados, '#f87171'],
            ['Saldo disponible', historialColab.saldo.dias_saldo, historialColab.saldo.dias_saldo <= 0 ? '#f87171' : historialColab.saldo.dias_saldo <= 3 ? '#f59e0b' : '#22c55e'],
          ] as [string, number, string][]).map(([lbl, val, color]) => (
            <div key={lbl} style={{ background:'#1a2740', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
              <div style={{ fontSize:10, color:'#8ea3c7', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{lbl}</div>
              <div style={{ fontSize:22, fontWeight:900, color, fontFamily:"'DM Mono',monospace" }}>{val}</div>
              <div style={{ fontSize:10, color:'#8ea3c7' }}>días</div>
            </div>
          ))}
        </div>

        {/* Lista de ausencias de vacaciones */}
        {loadingHistorial ? (
          <div className="pl-empty">Cargando...</div>
        ) : historial.length === 0 ? (
          <div className="pl-empty">No hay vacaciones disfrutadas en este período.</div>
        ) : (
          <div className="pl-table-wrap">
            <table className="pl-table">
              <thead>
                <tr>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th className="r">Días nat.</th>
                  <th className="r">Días háb.</th>
                  <th>Estado</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {historial.map(h => (
                  <tr key={h.id}>
                    <td className="mono">{formatCompanyDate(h.fecha_inicio)}</td>
                    <td className="mono">{formatCompanyDate(h.fecha_fin)}</td>
                    <td className="r mono">{h.dias_naturales ?? '—'}</td>
                    <td className="r mono" style={{ color:'#8ea3c7' }}>{h.dias_habiles ?? '—'}</td>
                    <td><span className="pl-chip" style={{ background:(ESTADO_COLORS[h.estado]??'#8ea3c7')+'33', color:ESTADO_COLORS[h.estado]??'#8ea3c7' }}>{h.estado.charAt(0).toUpperCase()+h.estado.slice(1)}</span></td>
                    <td style={{ color:'#8ea3c7', fontSize:12 }}>{h.notas || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontWeight:700, color:'#f3f7ff', paddingTop:8 }}>Total</td>
                  <td className="r mono" style={{ fontWeight:800, color:'#f87171', paddingTop:8 }}>
                    {historial.filter(h => h.estado === 'aprobada').reduce((s, h) => s + (h.dias_naturales ?? 0), 0)}
                  </td>
                  <td className="r mono" style={{ fontWeight:800, color:'#8ea3c7', paddingTop:8 }}>
                    {historial.filter(h => h.estado === 'aprobada').reduce((s, h) => s + (h.dias_habiles ?? 0), 0)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="pl-modal-foot">
          <button className="pl-btn main" onClick={() => setHistorialColab(null)}>Cerrar</button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="pl-wrap">
      <style>{PL_STYLES}</style>
      {modal}
      {modalHistorial}

      <div className="pl-hdr">
        <div className="pl-hdr-left"><h2 className="pl-title">Ausencias y Permisos</h2><p className="pl-sub">Vacaciones, incapacidades, permisos</p></div>
        {canEdit && tab === 'ausencias' && <button className="pl-btn main" onClick={() => { setForm({ remunerada:true, porcentaje_pago:100, estado:'pendiente', aprobado:false }); setShowModal(true); setError(''); }}>+ Registrar Ausencia</button>}
      </div>

      <div className="pl-tabs">
        <button className={`pl-tab${tab==='ausencias'?' active':''}`} onClick={() => setTab('ausencias')}>📅 Ausencias y Permisos</button>
        <button className={`pl-tab${tab==='saldos'?' active':''}`} onClick={() => setTab('saldos')}>
          🌴 Saldo de Vacaciones
          <span className="pl-badge" style={{ background: tab==='saldos'?'#16a34a22':'#1a2e1a', color: tab==='saldos'?'#22c55e':'#8ea3c7' }}>{saldos.length}</span>
        </button>
      </div>

      {/* Tab: Ausencias */}
      {tab === 'ausencias' && (
        <>
          {resumen.length > 0 && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
              {resumen.map(r => (
                <div key={r.id} className="pl-info" style={{ margin:0 }}>
                  <strong>{r.nombre}</strong> — {r.count} caso{r.count!==1?'s':''} · {r.dias} días
                </div>
              ))}
            </div>
          )}
          <div className="pl-filters">
            <input type="month" className="pl-input" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} />
            <input className="pl-input flex" placeholder="Buscar colaborador..." value={filtroColab} onChange={e => setFiltroColab(e.target.value)} />
            <select className="pl-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {['pendiente','aprobada','rechazada','cancelada'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div className="pl-card">
            <div className="pl-table-wrap">
              {loading ? <div className="pl-empty">Cargando...</div> : filtered.length === 0 ? <div className="pl-empty">No hay ausencias para el período.</div> : (
                <table className="pl-table">
                  <thead><tr><th>Colaborador</th><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Días</th><th>Rem.</th><th>Expediente</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {filtered.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight:600, color:'#f3f7ff' }}>{colNombre(a.colaborador_id)}</td>
                        <td style={{ color:'#8ea3c7' }}>{tipNombre(a.tipo_ausencia_id)}</td>
                        <td className="mono">{formatCompanyDate(a.fecha_inicio)}</td>
                        <td className="mono">{formatCompanyDate(a.fecha_fin)}</td>
                        <td style={{ fontWeight:600 }}>{a.dias_naturales ?? '—'}</td>
                        <td>{a.remunerada ? <span style={{ color:'#22c55e' }}>Sí</span> : <span style={{ color:'#f87171' }}>No</span>}</td>
                        <td className="mono" style={{ color:'#8ea3c7', fontSize:12 }}>{a.numero_expediente || '—'}</td>
                        <td><span className="pl-chip" style={{ background:(ESTADO_COLORS[a.estado]??'#8ea3c7')+'33', color:ESTADO_COLORS[a.estado]??'#8ea3c7' }}>{a.estado.charAt(0).toUpperCase()+a.estado.slice(1)}</span></td>
                        <td>{canEdit && <button className="pl-btn" style={{ padding:'4px 12px', fontSize:12 }} onClick={() => { setForm({ ...a }); setShowModal(true); setError(''); }}>Editar</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* Tab: Saldo de Vacaciones */}
      {tab === 'saldos' && (
        <>
          {/* Toolbar: filtro año + botón generar */}
          <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <label style={{ fontSize:12, color:'#8ea3c7' }}>Año</label>
              <select className="pl-select" style={{ width:100 }} value={filtroAnio} onChange={e => { setFiltroAnio(Number(e.target.value)); setGenMsg(''); }}>
                {[filtroAnio - 1, filtroAnio, filtroAnio + 1].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {canEdit && (
              <button className="pl-btn" style={{ borderColor:'#16a34a', color:'#22c55e' }} onClick={handleGenerarSaldos} disabled={generando}>
                {generando ? 'Generando...' : '+ Generar Saldos ' + filtroAnio}
              </button>
            )}
            {genMsg && (
              <span style={{ fontSize:12, color: genOk ? '#22c55e' : '#f87171', padding:'4px 10px', background: genOk ? '#0f2c20' : '#34181c', borderRadius:6 }}>
                {genOk ? '✓ ' : '✗ '}{genMsg}
              </span>
            )}
          </div>

          <div className="pl-card">
            <div className="pl-table-wrap">
              {loading ? <div className="pl-empty">Cargando...</div> : saldos.length === 0 ? (
                <div className="pl-empty">
                  No hay saldos de vacaciones para {filtroAnio}.<br />
                  {canEdit && <span>Use el botón <strong>"+ Generar Saldos {filtroAnio}"</strong> para crearlos (solo aplica a colaboradores con ≥ 50 semanas).</span>}
                </div>
              ) : (
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      <th>Período</th>
                      <th className="r">Generados</th>
                      <th className="r">Disfrutados</th>
                      <th className="r">Saldo</th>
                      <th>Uso</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {saldos.map(s => {
                      const colab = colaboradores.find(c => c.id === s.colaborador_id);
                      const pct = s.dias_generados > 0 ? (s.dias_disfrutados / s.dias_generados) * 100 : 0;
                      const saldoColor = s.dias_saldo <= 0 ? '#f87171' : s.dias_saldo <= 3 ? '#f59e0b' : '#22c55e';
                      return (
                        <tr key={`${s.colaborador_id}-${s.periodo_inicio}`}>
                          <td style={{ fontWeight:600, color:'#f3f7ff' }}>
                            {colab?.nombre_completo ?? `Colaborador ${s.colaborador_id}`}
                            {colab?.numero_empleado && <span style={{ color:'#8ea3c7', fontSize:11, marginLeft:6 }}>({colab.numero_empleado})</span>}
                          </td>
                          <td className="mono" style={{ color:'#8ea3c7', fontSize:12 }}>
                            {formatCompanyDate(s.periodo_inicio)} — {formatCompanyDate(s.periodo_fin)}
                          </td>
                          <td className="r mono">{s.dias_generados}</td>
                          <td className="r mono" style={{ color: s.dias_disfrutados > 0 ? '#f87171' : '#8ea3c7' }}>{s.dias_disfrutados}</td>
                          <td className="r">
                            <span style={{ fontWeight:800, color: saldoColor, fontFamily:"'DM Mono',monospace", fontSize:15 }}>
                              {s.dias_saldo}
                            </span>
                            <span style={{ color:'#8ea3c7', fontSize:10, marginLeft:4 }}>días</span>
                          </td>
                          <td>
                            <div style={{ width:80, height:6, background:'#1a2e1a', borderRadius:3, overflow:'hidden' }}>
                              <div style={{ width:`${Math.min(100,pct)}%`, height:'100%', background: pct >= 100 ? '#f87171' : pct >= 70 ? '#f59e0b' : '#22c55e', borderRadius:3 }} />
                            </div>
                            <div style={{ fontSize:10, color:'#8ea3c7', marginTop:2 }}>{pct.toFixed(0)}% usado</div>
                          </td>
                          <td>
                            {colab && (
                              <button className="pl-btn" style={{ padding:'4px 12px', fontSize:12 }}
                                onClick={() => handleVerHistorial(colab, s)}>
                                Historial
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div className="pl-legal" style={{ marginTop:12 }}>
            Art. 153 CT: el trabajador tiene derecho a 2 semanas de vacaciones por cada 50 semanas de trabajo continuo (14 días). El saldo se descuenta automáticamente al aprobar ausencias de tipo Vacaciones.
          </div>
        </>
      )}
    </div>
  );
}
