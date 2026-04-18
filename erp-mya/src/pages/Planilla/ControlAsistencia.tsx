import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabase';
import { logModuloEvento } from '../../utils/bitacora';
import { formatCompanyDateTime } from '../../utils/companyTimeZone';
import { PL_STYLES } from './planillaStyles';

interface Props { empresaId: number; canEdit?: boolean; }

interface Colaborador {
  id: number; nombre_completo: string; numero_empleado: string | null;
  identificacion: string; estado: string; qr_token: string | null;
}
interface ResumenDia {
  colaborador_id: number; nombre_completo: string; numero_empleado: string | null;
  fecha: string; hora_entrada: string | null; hora_salida: string | null;
  horas_brutas: number | null; marcaciones_count: number;
}
interface Marcacion {
  id: number; colaborador_id: number; fecha: string; tipo: string;
  hora_marcacion: string; metodo: string; notas: string | null;
}

const TIPO_COLORS: Record<string, string> = { entrada:'#22c55e', salida:'#f87171', inicio_almuerzo:'#f59e0b', fin_almuerzo:'#38bdf8' };

const fmtHora = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CR', { hour:'2-digit', minute:'2-digit', timeZone:'America/Costa_Rica' });
};
const fmtHoras = (h: number | null) => {
  if (!h || h <= 0) return '—';
  return `${Math.floor(h)}h ${Math.round((h - Math.floor(h)) * 60)}m`;
};

export default function ControlAsistencia({ empresaId, canEdit }: Props) {
  const [tab, setTab] = useState<'hoy'|'historial'|'qr'>('hoy');
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone:'America/Costa_Rica' }));
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [resumen, setResumen] = useState<ResumenDia[]>([]);
  const [historial, setHistorial] = useState<Marcacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroColab, setFiltroColab] = useState('');
  // Modal manual
  const [showModal, setShowModal] = useState(false);
  const [fColabId, setFColabId] = useState('');
  const [fTipo, setFTipo] = useState('entrada');
  const [fHora, setFHora] = useState(() => new Date().toLocaleTimeString('es-CR', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'America/Costa_Rica' }));
  const [fMetodo, setFMetodo] = useState('manual');
  const [fNotas, setFNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // QR
  const [codigoQr, setCodigoQr] = useState('');
  const [qrMsg, setQrMsg] = useState('');
  const [qrOk, setQrOk] = useState(false);
  const qrRef = useRef<HTMLInputElement>(null);

  const loadColabs = useCallback(async () => {
    const { data } = await supabase.from('pl_colaboradores')
      .select('id,nombre_completo,numero_empleado,identificacion,estado,qr_token')
      .eq('empresa_id', empresaId).in('estado', ['activo','vacaciones','incapacitado']).order('nombre_completo');
    setColaboradores(data || []);
  }, [empresaId]);

  const loadResumen = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('v_asistencia_diaria').select('*').eq('empresa_id', empresaId).eq('fecha', fecha).order('nombre_completo');
    setResumen(data || []); setLoading(false);
  }, [empresaId, fecha]);

  const loadHistorial = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('pl_marcaciones').select('*').eq('empresa_id', empresaId)
      .gte('hora_marcacion', fecha + 'T00:00:00-06:00').lte('hora_marcacion', fecha + 'T23:59:59-06:00').order('hora_marcacion');
    setHistorial(data || []); setLoading(false);
  }, [empresaId, fecha]);

  useEffect(() => { loadColabs(); }, [loadColabs]);
  useEffect(() => { if (tab === 'hoy') loadResumen(); else if (tab === 'historial') loadHistorial(); }, [tab, fecha, loadResumen, loadHistorial]);

  const registrar = async () => {
    if (!fColabId) { setError('Seleccione un colaborador.'); return; }
    setSaving(true); setError('');
    const horaIso = new Date(`${fecha}T${fHora}:00-06:00`).toISOString();
    const { error: err } = await supabase.from('pl_marcaciones').insert({ empresa_id: empresaId, colaborador_id: Number(fColabId), fecha, tipo: fTipo, hora_marcacion: horaIso, metodo: fMetodo, notas: fNotas || null });
    if (err) { setError(err.message); }
    else {
      logModuloEvento({ empresaId, modulo: 'planilla', accion: 'marcacion_registrada', descripcion: `${fTipo} — ${fMetodo}` });
      setShowModal(false); loadResumen(); loadHistorial();
    }
    setSaving(false);
  };

  const procesarQr = async (codigo: string) => {
    if (!codigo.trim()) return;
    setQrMsg('Buscando...'); setQrOk(false);
    const esUuid = /^[0-9a-f-]{36}$/i.test(codigo.trim());
    const colab = esUuid ? colaboradores.find(c => c.qr_token === codigo.trim()) : colaboradores.find(c => c.identificacion === codigo.trim() || c.numero_empleado === codigo.trim());
    if (!colab) { setQrMsg('Colaborador no encontrado.'); setCodigoQr(''); return; }
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone:'America/Costa_Rica' });
    const { data: hoyM } = await supabase.from('pl_marcaciones').select('tipo').eq('colaborador_id', colab.id).eq('fecha', hoy).order('hora_marcacion');
    const tipos = (hoyM || []).map(m => m.tipo);
    // Determinar siguiente marcación según secuencia real del día:
    // La secuencia válida es: entrada → salida → entrada → salida → ...
    // Contamos entradas y salidas para saber en qué punto estamos.
    const entradas = tipos.filter(t => t === 'entrada').length;
    const salidas  = tipos.filter(t => t === 'salida').length;
    // Si hay más entradas que salidas → el colaborador está adentro → siguiente es salida
    // Si entradas === salidas → no está adentro → siguiente es entrada (nuevo turno)
    const tipo_sig = entradas > salidas ? 'salida' : 'entrada';
    const { error: err } = await supabase.from('pl_marcaciones').insert({ empresa_id: empresaId, colaborador_id: colab.id, fecha: hoy, tipo: tipo_sig, hora_marcacion: new Date().toISOString(), metodo: esUuid ? 'qr' : 'gafete' });
    if (err) { setQrMsg('Error: ' + err.message); }
    else {
      setQrOk(true);
      const turno = entradas >= 1 && tipo_sig === 'entrada' ? ' — Turno 2' : '';
      setQrMsg(`${colab.nombre_completo} — ${tipo_sig.toUpperCase()}${turno} (${new Date().toLocaleTimeString('es-CR', { timeZone:'America/Costa_Rica' })})`);
      loadResumen();
    }
    setCodigoQr('');
    setTimeout(() => { setQrMsg(''); setQrOk(false); qrRef.current?.focus(); }, 4000);
  };

  const colNombre = (id: number) => colaboradores.find(c => c.id === id)?.nombre_completo ?? String(id);
  const resumenF = resumen.filter(r => !filtroColab || r.nombre_completo.toLowerCase().includes(filtroColab.toLowerCase()));
  const presentes = resumen.filter(r => r.hora_entrada && !r.hora_salida).length;

  const modalMarcacion = showModal && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowModal(false)}>
      <div className="pl-modal" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">Registrar Marcación Manual</p>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-field"><label>Colaborador *</label>
          <select className="pl-select" value={fColabId} onChange={e => setFColabId(e.target.value)} autoFocus>
            <option value="">— Seleccione —</option>
            {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nombre_completo}{c.numero_empleado ? ` (${c.numero_empleado})` : ''}</option>)}
          </select>
        </div>
        <div className="pl-g2">
          <div className="pl-field"><label>Tipo</label>
            <select className="pl-select" value={fTipo} onChange={e => setFTipo(e.target.value)}>
              {['entrada','salida','inicio_almuerzo','fin_almuerzo'].map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
            </select>
          </div>
          <div className="pl-field"><label>Hora</label><input type="time" className="pl-input" value={fHora} onChange={e => setFHora(e.target.value)} /></div>
          <div className="pl-field"><label>Método</label>
            <select className="pl-select" value={fMetodo} onChange={e => setFMetodo(e.target.value)}>
              {[{v:'manual',l:'Manual'},{v:'qr',l:'QR'},{v:'gafete',l:'Gafete / Código'},{v:'biometrico',l:'Biométrico'},{v:'importacion',l:'Importación'}].map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div className="pl-field"><label>Notas</label><input className="pl-input" value={fNotas} onChange={e => setFNotas(e.target.value)} /></div>
        </div>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => setShowModal(false)}>Cancelar</button>
          <button className="pl-btn main" onClick={registrar} disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
        </div>
      </div>
    </div>, document.body
  );

  return (
    <div className="pl-wrap">
      <style>{PL_STYLES}</style>
      {modalMarcacion}

      <div className="pl-hdr">
        <div className="pl-hdr-left"><h2 className="pl-title">Control de Asistencia</h2><p className="pl-sub">Marcaciones de entrada y salida</p></div>
        <div className="pl-btn-row">
          <input type="date" className="pl-input" value={fecha} onChange={e => setFecha(e.target.value)} />
          {canEdit && <button className="pl-btn main" onClick={() => { setFColabId(''); setFTipo('entrada'); setFHora(new Date().toLocaleTimeString('es-CR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Costa_Rica'})); setFMetodo('manual'); setFNotas(''); setError(''); setShowModal(true); }}>+ Marcación</button>}
        </div>
      </div>

      <div className="pl-kpi-grid">
        {[
          { l:'Presentes ahora', v: presentes, c:'#22c55e' },
          { l:'Ingresaron hoy',  v: resumen.filter(r=>r.hora_entrada).length, c:'#38bdf8' },
          { l:'Ya salieron',     v: resumen.filter(r=>r.hora_salida).length,  c:'#a78bfa' },
          { l:'Colaboradores activos', v: colaboradores.filter(c=>c.estado==='activo').length, c:'#8ea3c7' },
        ].map(s => (
          <div className="pl-kpi" key={s.l}><div className="k">{s.l}</div><div className="v" style={{ color:s.c }}>{s.v}</div></div>
        ))}
      </div>

      <div className="pl-tabs">
        {([['hoy','Resumen del Día'],['historial','Detalle Marcaciones'],['qr','Registro QR / Código']] as const).map(([k,l]) => (
          <button key={k} className={`pl-tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'hoy' && (
        <>
          <div className="pl-filters">
            <input className="pl-input flex" placeholder="Filtrar colaborador..." value={filtroColab} onChange={e => setFiltroColab(e.target.value)} />
          </div>
          <div className="pl-card">
            <div className="pl-table-wrap">
              {loading ? <div className="pl-empty">Cargando...</div> : resumenF.length === 0 ? <div className="pl-empty">Sin marcaciones para esta fecha.</div> : (
                <table className="pl-table">
                  <thead><tr><th>Colaborador</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Marcaciones</th></tr></thead>
                  <tbody>
                    {resumenF.map(r => {
                      const presente = !!r.hora_entrada && !r.hora_salida;
                      return (
                        <tr key={r.colaborador_id+r.fecha}>
                          <td>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ width:8, height:8, borderRadius:'50%', background: presente ? '#22c55e' : r.hora_salida ? '#8ea3c7' : '#1a2e1a', flexShrink:0 }} />
                              <div>
                                <div style={{ fontWeight:600, color:'#f3f7ff' }}>{r.nombre_completo}</div>
                                <div style={{ fontSize:11, color:'#8ea3c7' }}>{r.numero_empleado || ''}</div>
                              </div>
                            </div>
                          </td>
                          <td className="mono" style={{ color:'#22c55e', fontWeight:600 }}>{fmtHora(r.hora_entrada)}</td>
                          <td className="mono" style={{ color:'#f87171', fontWeight:600 }}>{fmtHora(r.hora_salida)}</td>
                          <td className="mono" style={{ fontWeight:600 }}>{fmtHoras(r.horas_brutas)}</td>
                          <td style={{ color:'#8ea3c7' }}>{r.marcaciones_count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'historial' && (
        <div className="pl-card">
          <div className="pl-table-wrap">
            {loading ? <div className="pl-empty">Cargando...</div> : historial.length === 0 ? <div className="pl-empty">No hay marcaciones para esta fecha.</div> : (
              <table className="pl-table">
                <thead><tr><th>Hora</th><th>Colaborador</th><th>Tipo</th><th>Método</th><th>Notas</th></tr></thead>
                <tbody>
                  {historial.map(m => (
                    <tr key={m.id}>
                      <td className="mono" style={{ fontWeight:700, color:'#f3f7ff' }}>{fmtHora(m.hora_marcacion)}</td>
                      <td style={{ fontWeight:500 }}>{colNombre(m.colaborador_id)}</td>
                      <td><span className="pl-chip" style={{ background:(TIPO_COLORS[m.tipo]??'#8ea3c7')+'33', color:TIPO_COLORS[m.tipo]??'#8ea3c7', textTransform:'uppercase', fontSize:10 }}>{m.tipo.replace('_',' ')}</span></td>
                      <td style={{ color:'#8ea3c7', fontSize:12 }}>{m.metodo}</td>
                      <td style={{ color:'#8ea3c7', fontSize:12 }}>{m.notas || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'qr' && (
        <div className="pl-card pl-card-p" style={{ maxWidth:520 }}>
          <p className="pl-card-title" style={{ textAlign:'center', fontSize:16 }}>📷 Registro por QR o Código</p>
          <p style={{ fontSize:13, color:'#8ea3c7', textAlign:'center', marginBottom:20 }}>
            Escanee el QR del colaborador o ingrese cédula / código de empleado.<br/>
            El sistema determina automáticamente entrada o salida.
          </p>
          <input ref={qrRef} autoFocus className="pl-input" placeholder="Escanee QR o escriba cédula / código..."
            style={{ width:'100%', boxSizing:'border-box', textAlign:'center', fontSize:15, padding:'12px 16px', border:'2px solid #16a34a' }}
            value={codigoQr} onChange={e => setCodigoQr(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') procesarQr(codigoQr); }} />
          <p style={{ fontSize:11, color:'#8ea3c7', textAlign:'center', margin:'6px 0 16px' }}>Presione Enter para registrar</p>
          {qrMsg && <div className={qrOk ? 'pl-ok' : 'pl-err'} style={{ textAlign:'center', fontWeight:600, fontSize:14 }}>{qrOk ? '✓ ' : '✗ '}{qrMsg}</div>}
          <hr className="pl-sep" />
          <p style={{ fontSize:12, color:'#8ea3c7', marginBottom:10, fontWeight:600 }}>Colaboradores activos ({colaboradores.filter(c=>c.estado==='activo').length})</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, maxHeight:240, overflowY:'auto' }}>
            {colaboradores.filter(c=>c.estado==='activo').map(c => (
              <button key={c.id} className="pl-btn" style={{ textAlign:'left', padding:'6px 10px' }} onClick={() => procesarQr(c.identificacion)}>
                <div style={{ fontWeight:600, color:'#f3f7ff', fontSize:12 }}>{c.nombre_completo}</div>
                <div style={{ color:'#8ea3c7', fontSize:11 }}>{c.identificacion}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
