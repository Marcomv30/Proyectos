import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabase';
import { logModuloEvento } from '../../utils/bitacora';
import { formatMoneyCRC, roundMoney } from '../../utils/reporting';
import { formatCompanyDate } from '../../utils/companyTimeZone';
import { PL_STYLES } from './planillaStyles';

interface Props { empresaId: number; canEdit?: boolean; }
interface Colaborador { id:number; nombre_completo:string; numero_empleado:string|null; identificacion:string; fecha_ingreso:string; salario:number; estado:string; }
interface Prestacion { id:number; colaborador_id:number; fecha_calculo:string; fecha_ingreso:string; fecha_salida:string; motivo_salida:string; salario_promedio_6m:number; anios_servicio:number; dias_preaviso:number; monto_preaviso:number; dias_cesantia:number; monto_cesantia:number; tope_cesantia:number; dias_vacaciones_prop:number; monto_vacaciones:number; meses_aguinaldo:number; monto_aguinaldo:number; total_prestaciones:number; estado:string; aprobado_por:string|null; notas:string|null; }

const MOTIVOS = [
  { v:'renuncia', l:'Renuncia voluntaria' }, { v:'despido_justificado', l:'Despido justificado' },
  { v:'despido_sin_causa', l:'Despido sin causa justificada' }, { v:'mutuo_acuerdo', l:'Mutuo acuerdo' },
  { v:'fin_contrato', l:'Fin de contrato' }, { v:'jubilacion', l:'Jubilación' },
  { v:'fallecimiento', l:'Fallecimiento' }, { v:'otro', l:'Otro' },
];
const ESTADO_COLORS: Record<string,string> = { borrador:'#f59e0b', aprobado:'#22c55e', pagado:'#38bdf8', cancelado:'#8ea3c7' };

function calcPrestaciones(fechaIngreso: string, fechaSalida: string, motivo: string, salario: number) {
  const anios = roundMoney((new Date(fechaSalida+'T12:00:00').getTime() - new Date(fechaIngreso+'T12:00:00').getTime()) / (365.25*86400000));
  const salDiario = roundMoney(salario / 30);
  const apliPre = ['despido_sin_causa','mutuo_acuerdo','jubilacion'].includes(motivo);
  const apliCes = ['despido_sin_causa','mutuo_acuerdo','jubilacion','fallecimiento'].includes(motivo);
  const tabPre = anios < 0.25 ? 0 : anios < 0.5 ? 7 : anios < 1 ? 14 : 30;
  const diasPre = apliPre ? tabPre : 0;
  const montoPre = roundMoney(diasPre * salDiario);
  const a = Math.min(Math.floor(anios), 8);
  const tabCes = [0,19.5,20,20.5,21,21.24,21.5,22,22];
  const diasCes = apliCes ? roundMoney((tabCes[a]??22) * Math.min(anios, 8)) : 0;
  const montoCes = roundMoney(diasCes * salDiario);
  const mesesRest = roundMoney(anios * 12 % 12);
  const diasVac = roundMoney((mesesRest / 12) * 14);
  const montoVac = roundMoney(diasVac * salDiario);
  const mesIni = new Date(new Date(fechaSalida+'T12:00:00').getFullYear(), 11, 1);
  if (new Date(fechaSalida+'T12:00:00') < mesIni) mesIni.setFullYear(mesIni.getFullYear()-1);
  const mesesAg = roundMoney(Math.max(0, (new Date(fechaSalida+'T12:00:00').getTime() - mesIni.getTime()) / (30.44*86400000)));
  const montoAg = roundMoney((mesesAg/12)*salario);
  const total = roundMoney(montoPre + montoCes + montoVac + montoAg);
  return { fecha_calculo: new Date().toISOString().slice(0,10), fecha_ingreso:fechaIngreso, fecha_salida:fechaSalida, motivo_salida:motivo, salario_promedio_6m:salario, anios_servicio:anios, dias_preaviso:diasPre, monto_preaviso:montoPre, dias_cesantia:diasCes, monto_cesantia:montoCes, tope_cesantia:roundMoney(22*8*salDiario), dias_vacaciones_prop:diasVac, monto_vacaciones:montoVac, meses_aguinaldo:mesesAg, monto_aguinaldo:montoAg, total_prestaciones:total };
}

export default function PrestacionesLegales({ empresaId, canEdit }: Props) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [prestaciones, setPrestaciones] = useState<Prestacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [colabSel, setColabSel] = useState('');
  const [fechaSalida, setFechaSalida] = useState(() => new Date().toLocaleDateString('en-CA',{timeZone:'America/Costa_Rica'}));
  const [motivo, setMotivo] = useState('despido_sin_causa');
  const [calculo, setCalculo] = useState<ReturnType<typeof calcPrestaciones>|null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [verDetalle, setVerDetalle] = useState<Prestacion|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: pres }, { data: cols }] = await Promise.all([
      supabase.from('pl_prestaciones').select('*').eq('empresa_id', empresaId).order('fecha_calculo',{ascending:false}),
      supabase.from('pl_colaboradores').select('id,nombre_completo,numero_empleado,identificacion,fecha_ingreso,salario,estado').eq('empresa_id', empresaId).order('nombre_completo'),
    ]);
    setPrestaciones(pres||[]); setColaboradores(cols||[]); setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const calcular = () => {
    if (!colabSel || !fechaSalida || !motivo) return;
    const c = colaboradores.find(x => x.id === Number(colabSel));
    if (!c) return;
    setCalculo(calcPrestaciones(c.fecha_ingreso, fechaSalida, motivo, c.salario));
  };

  const guardar = async () => {
    if (!calculo || !colabSel) return;
    setSaving(true); setError('');
    const c = colaboradores.find(x => x.id === Number(colabSel))!;
    const { error: err } = await supabase.from('pl_prestaciones').insert({ empresa_id:empresaId, colaborador_id:Number(colabSel), ...calculo, estado:'borrador' });
    if (err) { setError(err.message); }
    else {
      await supabase.from('pl_colaboradores').update({ estado:'inactivo', fecha_salida:fechaSalida, motivo_salida:motivo, updated_at:new Date().toISOString() }).eq('id', Number(colabSel));
      logModuloEvento({ empresaId, modulo:'planilla', accion:'prestaciones_calculadas', descripcion:c.nombre_completo, detalle:{ motivo, total:calculo.total_prestaciones } });
      setShowModal(false); load();
    }
    setSaving(false);
  };

  const colNombre = (id: number) => colaboradores.find(c => c.id === id)?.nombre_completo ?? String(id);
  const motivoL = (v: string) => MOTIVOS.find(m => m.v === v)?.l ?? v;

  const modal = showModal && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowModal(false)}>
      <div className="pl-modal wide" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">Calculadora de Prestaciones Legales</p>
        <p className="pl-modal-sub">Código de Trabajo CR — art. 28, 29, 153 y Ley Aguinaldo</p>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-field"><label>Colaborador</label>
          <select className="pl-select" value={colabSel} onChange={e => { setColabSel(e.target.value); setCalculo(null); }}>
            <option value="">— Seleccione —</option>
            {colaboradores.filter(c=>c.estado!=='inactivo').map(c => <option key={c.id} value={c.id}>{c.nombre_completo} — Ingresó: {formatCompanyDate(c.fecha_ingreso)}</option>)}
          </select>
        </div>
        {colabSel && (() => { const c = colaboradores.find(x=>x.id===Number(colabSel)); return c ? <div className="pl-info"><strong>{formatMoneyCRC(c.salario)}</strong> · Ingreso: <strong>{formatCompanyDate(c.fecha_ingreso)}</strong> · Cédula: <strong>{c.identificacion}</strong></div> : null; })()}
        <div className="pl-g2">
          <div className="pl-field"><label>Fecha de Salida</label><input type="date" className="pl-input" value={fechaSalida} onChange={e => { setFechaSalida(e.target.value); setCalculo(null); }} /></div>
          <div className="pl-field"><label>Motivo de Salida</label>
            <select className="pl-select" value={motivo} onChange={e => { setMotivo(e.target.value); setCalculo(null); }}>
              {MOTIVOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
        </div>
        <button className="pl-btn blue" style={{ width:'100%', padding:'10px', marginBottom:14 }} onClick={calcular} disabled={!colabSel||!fechaSalida}>Calcular Prestaciones</button>
        {calculo && (
          <div className="pl-result">
            <div className="row"><span>Años de servicio</span><span className="mono">{calculo.anios_servicio.toFixed(2)}</span></div>
            <div className="row"><span>Salario base</span><span className="mono">{formatMoneyCRC(calculo.salario_promedio_6m)}</span></div>
            <hr className="pl-sep" style={{ margin:'6px 0' }} />
            <div className="row"><span>Preaviso (art.28)</span><span className="mono">{calculo.dias_preaviso}d → <strong>{formatMoneyCRC(calculo.monto_preaviso)}</strong></span></div>
            <div className="row"><span>Cesantía (art.29)</span><span className="mono">{calculo.dias_cesantia.toFixed(1)}d → <strong>{formatMoneyCRC(calculo.monto_cesantia)}</strong></span></div>
            <div className="row"><span>Vacaciones prop.</span><span className="mono">{calculo.dias_vacaciones_prop.toFixed(1)}d → <strong>{formatMoneyCRC(calculo.monto_vacaciones)}</strong></span></div>
            <div className="row"><span>Aguinaldo prop.</span><span className="mono">{calculo.meses_aguinaldo.toFixed(1)}m → <strong>{formatMoneyCRC(calculo.monto_aguinaldo)}</strong></span></div>
            <div className="total"><span>TOTAL PRESTACIONES</span><span className="mono">{formatMoneyCRC(calculo.total_prestaciones)}</span></div>
          </div>
        )}
        {calculo && <p style={{ fontSize:11, color:'#8ea3c7', marginBottom:14 }}>* El colaborador será marcado como Inactivo al guardar.</p>}
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => { setShowModal(false); setCalculo(null); setError(''); }}>Cancelar</button>
          {calculo && <button className="pl-btn main" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar y Desactivar Colaborador'}</button>}
        </div>
      </div>
    </div>, document.body
  );

  const detalleModal = verDetalle && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setVerDetalle(null)}>
      <div className="pl-modal" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">{colNombre(verDetalle.colaborador_id)}</p>
        <p className="pl-modal-sub">{motivoL(verDetalle.motivo_salida)}</p>
        <div className="pl-result">
          {[
            ['Motivo', motivoL(verDetalle.motivo_salida)],
            ['Fecha ingreso', formatCompanyDate(verDetalle.fecha_ingreso)],
            ['Fecha salida', formatCompanyDate(verDetalle.fecha_salida)],
            ['Años servicio', verDetalle.anios_servicio.toFixed(2)],
            ['Salario base', formatMoneyCRC(verDetalle.salario_promedio_6m)],
            ['Preaviso', `${verDetalle.dias_preaviso}d → ${formatMoneyCRC(verDetalle.monto_preaviso)}`],
            ['Cesantía', `${verDetalle.dias_cesantia.toFixed(1)}d → ${formatMoneyCRC(verDetalle.monto_cesantia)}`],
            ['Vacaciones', formatMoneyCRC(verDetalle.monto_vacaciones)],
            ['Aguinaldo', formatMoneyCRC(verDetalle.monto_aguinaldo)],
          ].map(([l,v]) => <div className="row" key={l as string}><span style={{ color:'#8ea3c7' }}>{l}</span><span className="mono">{v}</span></div>)}
          <div className="total"><span>TOTAL</span><span className="mono">{formatMoneyCRC(verDetalle.total_prestaciones)}</span></div>
        </div>
        {canEdit && (
          <div className="pl-btn-row">
            {verDetalle.estado !== 'aprobado' && <button className="pl-btn blue" onClick={async () => { await supabase.from('pl_prestaciones').update({ estado:'aprobado', updated_at:new Date().toISOString() }).eq('id', verDetalle.id); setVerDetalle(null); load(); }}>Marcar Aprobado</button>}
            {verDetalle.estado !== 'pagado' && <button className="pl-btn main" onClick={async () => { await supabase.from('pl_prestaciones').update({ estado:'pagado', updated_at:new Date().toISOString() }).eq('id', verDetalle.id); setVerDetalle(null); load(); }}>Marcar Pagado</button>}
          </div>
        )}
        <div className="pl-modal-foot"><button className="pl-btn" onClick={() => setVerDetalle(null)}>Cerrar</button></div>
      </div>
    </div>, document.body
  );

  return (
    <div className="pl-wrap">
      <style>{PL_STYLES}</style>
      {modal}{detalleModal}
      <div className="pl-hdr">
        <div className="pl-hdr-left"><h2 className="pl-title">Prestaciones Legales</h2><p className="pl-sub">Liquidaciones según Código de Trabajo de Costa Rica</p></div>
        {canEdit && <button className="pl-btn main" onClick={() => { setColabSel(''); setFechaSalida(new Date().toLocaleDateString('en-CA',{timeZone:'America/Costa_Rica'})); setMotivo('despido_sin_causa'); setCalculo(null); setError(''); setShowModal(true); }}>+ Calcular Prestaciones</button>}
      </div>
      <div className="pl-legal">Preaviso (art.28 CT) · Cesantía (art.29 CT, tope 8 años) · Vacaciones proporcionales (art.153 CT, 14 días/año) · Aguinaldo proporcional (Ley 1788)</div>
      <div className="pl-card">
        <div className="pl-table-wrap">
          {loading ? <div className="pl-empty">Cargando...</div> : prestaciones.length === 0 ? <div className="pl-empty">No hay liquidaciones registradas.</div> : (
            <table className="pl-table">
              <thead><tr><th>Colaborador</th><th>Salida</th><th>Motivo</th><th className="r">Años</th><th className="r">Preaviso</th><th className="r">Cesantía</th><th className="r">Vacac.</th><th className="r">Aguinaldo</th><th className="r">TOTAL</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {prestaciones.map(p => (
                  <tr key={p.id} style={{ cursor:'pointer' }} onClick={() => setVerDetalle(p)}>
                    <td style={{ fontWeight:600, color:'#f3f7ff' }}>{colNombre(p.colaborador_id)}</td>
                    <td className="mono" style={{ color:'#8ea3c7' }}>{formatCompanyDate(p.fecha_salida)}</td>
                    <td style={{ color:'#8ea3c7', fontSize:12 }}>{motivoL(p.motivo_salida)}</td>
                    <td className="r mono">{p.anios_servicio.toFixed(1)}</td>
                    <td className="r mono">{formatMoneyCRC(p.monto_preaviso)}</td>
                    <td className="r mono">{formatMoneyCRC(p.monto_cesantia)}</td>
                    <td className="r mono">{formatMoneyCRC(p.monto_vacaciones)}</td>
                    <td className="r mono">{formatMoneyCRC(p.monto_aguinaldo)}</td>
                    <td className="r mono" style={{ fontWeight:800, color:'#22c55e' }}>{formatMoneyCRC(p.total_prestaciones)}</td>
                    <td><span className="pl-chip" style={{ background:(ESTADO_COLORS[p.estado]??'#8ea3c7')+'33', color:ESTADO_COLORS[p.estado]??'#8ea3c7' }}>{p.estado.charAt(0).toUpperCase()+p.estado.slice(1)}</span></td>
                    <td style={{ color:'#22c55e', fontSize:12 }}>Ver →</td>
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
