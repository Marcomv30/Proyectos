import React from 'react';
import ReactDOM from 'react-dom';
import { formatMoneyCRC } from '../../utils/reporting';
import { formatCompanyDate } from '../../utils/companyTimeZone';

interface Linea {
  colaborador_id: number;
  salario_base: number;
  dias_laborados: number;
  horas_extra_diurnas: number;
  horas_extra_nocturnas: number;
  horas_extra_feriado?: number;
  monto_he_diurnas?: number;
  monto_he_nocturnas?: number;
  monto_he_feriado?: number;
  bonificacion: number;
  comision: number;
  otros_ingresos: number;
  total_bruto: number;
  ded_ccss_obrero: number;
  ded_banco_popular: number;
  ded_renta: number;
  ded_pension_comp: number;
  ded_asfa: number;
  ded_embargo: number;
  ded_adelanto: number;
  ded_otras: number;
  total_deducciones: number;
  salario_neto: number;
  notas: string | null;
}

interface Colaborador {
  nombre_completo: string;
  identificacion: string;
  numero_empleado: string | null;
  numero_asegurado: string | null;
  cargo?: string;
  departamento?: string;
  banco?: string | null;
  numero_cuenta?: string | null;
  email?: string | null;
  email_personal?: string | null;
}

interface Periodo {
  nombre: string;
  frecuencia: string;
  fecha_inicio: string;
  fecha_fin: string;
}

interface Empresa {
  nombre: string;
  cedula?: string;
}

interface Props {
  linea: Linea;
  colaborador: Colaborador;
  periodo: Periodo;
  empresa: Empresa;
  periodoId?: number;
  onClose: () => void;
}

export default function ColillaPago({ linea, colaborador, periodo, empresa, periodoId, onClose }: Props) {
  const handlePrint = () => {
    const el = document.getElementById('colilla-print');
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Colilla de Pago</title>
<style>
@page { size: Letter; margin: 12mm 14mm; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'DM Sans',Arial,sans-serif; font-size:12px; color:#0f172a; background:#fff; padding:24px 28px; }
.c-row { display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #f1f5f9; font-size:12px; }
.c-row:last-child { border-bottom:none; }
.c-lbl { color:#64748b; }
.c-val { font-weight:600; font-family:'DM Mono',monospace; }
.c-neg { color:#dc2626; }
.c-sec { background:#f8fafc; border-radius:8px; padding:10px 14px; margin-bottom:10px; }
.c-sec-t { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#64748b; margin:0 0 8px; }
.c-total { display:flex; justify-content:space-between; padding:8px 0 0; font-size:14px; font-weight:800; border-top:2px solid #e2e8f0; margin-top:4px; }
.no-print { display:none!important; }
</style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.onafterprint = () => win.close();
    setTimeout(() => { win.print(); }, 400);
  };
  const [emailDestino, setEmailDestino] = React.useState(colaborador.email ?? colaborador.email_personal ?? '');
  const [enviando, setEnviando] = React.useState(false);
  const [emailMsg, setEmailMsg] = React.useState('');
  const [emailOk, setEmailOk] = React.useState(false);
  const [descargando, setDescargando] = React.useState(false);

  const handlePdf = async () => {
    if (!periodoId) return;
    setDescargando(true);
    try {
      const { supabase } = await import('../../supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch(`/api/planilla/colilla/${periodoId}/${linea.colaborador_id}/pdf`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setEmailMsg(err.error ?? 'Error generando PDF');
        setEmailOk(false);
        setDescargando(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disp = res.headers.get('Content-Disposition') ?? '';
      const match = disp.match(/filename="(.+?)"/);
      a.href = url;
      a.download = match ? match[1] : `Colilla_${linea.colaborador_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setEmailMsg(e.message);
      setEmailOk(false);
    }
    setDescargando(false);
  };

  const handleEmail = async () => {
    if (!periodoId) return;
    if (!emailDestino.trim()) { setEmailMsg('Ingrese un email destino.'); return; }
    setEnviando(true); setEmailMsg(''); setEmailOk(false);
    try {
      // Importar supabase para obtener el token de sesión
      const { supabase } = await import('../../supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';

      const res = await fetch(`/api/planilla/colilla/${periodoId}/${linea.colaborador_id}/enviar-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email_destino: emailDestino.trim() }),
      });
      const data = await res.json();
      if (data.ok) { setEmailOk(true); setEmailMsg(`Enviado a ${data.enviado_a}`); }
      else { setEmailMsg(data.error); }
    } catch (e: any) { setEmailMsg(e.message); }
    setEnviando(false);
  };

  const content = (
    <div id="colilla-print" style={{ fontFamily: "'DM Sans', Arial, sans-serif", fontSize: 12, color: '#0f172a', background: '#fff', width: 680, margin: '0 auto', padding: '28px 32px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
      <style>{`
        .c-row { display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #f1f5f9; font-size:12px; }
        .c-row:last-child { border-bottom:none; }
        .c-lbl { color:#64748b; }
        .c-val { font-weight:600; font-family:'DM Mono',monospace; }
        .c-neg { color:#dc2626; }
        .c-sec { background:#f8fafc; border-radius:8px; padding:10px 14px; margin-bottom:10px; }
        .c-sec-t { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#64748b; margin:0 0 8px; }
        .c-total { display:flex; justify-content:space-between; padding:8px 0 0; font-size:14px; font-weight:800; border-top:2px solid #e2e8f0; margin-top:4px; }
      `}</style>

      {/* Encabezado empresa */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, paddingBottom:16, borderBottom:'2px solid #16a34a' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {/* Logo verde MYA */}
          <div style={{ width:48, height:48, borderRadius:12, background:'linear-gradient(135deg,#16a34a,#22c55e)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:18, flexShrink:0 }}>
            {empresa.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#0f172a', lineHeight:1.2 }}>{empresa.nombre}</div>
            {empresa.cedula && <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>Cédula Jurídica: {empresa.cedula}</div>}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#16a34a', textTransform:'uppercase', letterSpacing:'.04em' }}>Comprobante de Pago</div>
          <div style={{ fontSize:11, color:'#475569', marginTop:3 }}>{periodo.nombre}</div>
          <div style={{ fontSize:11, color:'#94a3b8' }}>{formatCompanyDate(periodo.fecha_inicio)} al {formatCompanyDate(periodo.fecha_fin)}</div>
        </div>
      </div>

      {/* Datos del colaborador */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 24px', marginBottom:16, padding:'12px 16px', background:'#f0fdf4', borderRadius:8, border:'1px solid #bbf7d0' }}>
        <div style={{ gridColumn:'1/-1' }}>
          <div style={{ fontSize:10, color:'#16a34a', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>Colaborador</div>
          <div style={{ fontSize:16, fontWeight:800, color:'#0f172a', marginTop:2 }}>{colaborador.nombre_completo}</div>
        </div>
        {([
          ['Cédula', colaborador.identificacion],
          colaborador.numero_empleado ? ['Código', colaborador.numero_empleado] : null,
          colaborador.cargo ? ['Cargo', colaborador.cargo] : null,
          colaborador.departamento ? ['Departamento', colaborador.departamento] : null,
          colaborador.numero_asegurado ? ['N° Asegurado CCSS', colaborador.numero_asegurado] : null,
        ].filter(Boolean) as [string, string][]).map(([l, v]) => (
          <div key={l as string}>
            <span style={{ fontSize:10, color:'#16a34a', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em' }}>{l}</span>
            <div style={{ fontSize:12, color:'#0f172a', marginTop:1 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Ingresos */}
      <div className="c-sec">
        <p className="c-sec-t">Ingresos</p>
        <div className="c-row">
          <span className="c-lbl">Salario base ({linea.dias_laborados} días)</span>
          <span className="c-val">{formatMoneyCRC(linea.salario_base)}</span>
        </div>
        {linea.horas_extra_diurnas > 0 && (
          <div className="c-row">
            <span className="c-lbl">H. Extra diurnas ({linea.horas_extra_diurnas}h × 1.5)</span>
            <span className="c-val">{formatMoneyCRC(linea.monto_he_diurnas ?? 0)}</span>
          </div>
        )}
        {linea.horas_extra_nocturnas > 0 && (
          <div className="c-row">
            <span className="c-lbl">H. Extra nocturnas ({linea.horas_extra_nocturnas}h × 2.0)</span>
            <span className="c-val">{formatMoneyCRC(linea.monto_he_nocturnas ?? 0)}</span>
          </div>
        )}
        {(linea.horas_extra_feriado ?? 0) > 0 && (
          <div className="c-row">
            <span className="c-lbl">H. Feriado ({linea.horas_extra_feriado}h × 2.0)</span>
            <span className="c-val">{formatMoneyCRC(linea.monto_he_feriado ?? 0)}</span>
          </div>
        )}
        {linea.bonificacion > 0 && <div className="c-row"><span className="c-lbl">Bonificación</span><span className="c-val">{formatMoneyCRC(linea.bonificacion)}</span></div>}
        {linea.comision > 0 && <div className="c-row"><span className="c-lbl">Comisión</span><span className="c-val">{formatMoneyCRC(linea.comision)}</span></div>}
        {linea.otros_ingresos > 0 && <div className="c-row"><span className="c-lbl">Otros ingresos</span><span className="c-val">{formatMoneyCRC(linea.otros_ingresos)}</span></div>}
        <div className="c-total"><span>Total Bruto</span><span>{formatMoneyCRC(linea.total_bruto)}</span></div>
      </div>

      {/* Deducciones */}
      <div className="c-sec">
        <p className="c-sec-t" style={{ color:'#dc2626' }}>Deducciones</p>
        {([
          ['CCSS Obrero',              linea.ded_ccss_obrero],
          ['Banco Popular (1%)',       linea.ded_banco_popular],
          ['Impuesto sobre la Renta',  linea.ded_renta],
          ['Pensión Complementaria',   linea.ded_pension_comp],
          ['Solidarista',              linea.ded_asfa],
          ['Embargo judicial',         linea.ded_embargo],
          ['Adelanto de salario',      linea.ded_adelanto],
          ['Otras deducciones',        linea.ded_otras],
        ] as [string, number][]).filter(([, v]) => v > 0).map(([l, v]) => (
          <div className="c-row" key={l}>
            <span className="c-lbl">{l}</span>
            <span className="c-val c-neg">({formatMoneyCRC(v)})</span>
          </div>
        ))}
        <div className="c-total" style={{ color:'#dc2626' }}>
          <span>Total Deducciones</span>
          <span>({formatMoneyCRC(linea.total_deducciones)})</span>
        </div>
      </div>

      {/* Neto a pagar */}
      <div style={{ background:'#f0fdf4', border:'2px solid #16a34a', borderRadius:10, padding:'16px 20px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'#16a34a' }}>SALARIO NETO A PAGAR</div>
          {colaborador.banco && (
            <div style={{ fontSize:11, color:'#475569', marginTop:3 }}>
              Depósito en {colaborador.banco}
              {colaborador.numero_cuenta ? ` — ${colaborador.numero_cuenta}` : ''}
            </div>
          )}
        </div>
        <div style={{ fontSize:26, fontWeight:900, color:'#16a34a', fontFamily:"'DM Mono',monospace" }}>
          {formatMoneyCRC(linea.salario_neto)}
        </div>
      </div>

      {linea.notas && (
        <div style={{ fontSize:11, color:'#64748b', padding:'8px 12px', background:'#f8fafc', borderRadius:6, marginBottom:16 }}>
          <strong>Observaciones:</strong> {linea.notas}
        </div>
      )}

      {/* Firmas */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginTop:28, paddingTop:14, borderTop:'1px solid #e2e8f0' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ height:40 }} />
          <div style={{ borderTop:'1px solid #94a3b8', paddingTop:6, fontSize:11, color:'#64748b' }}>
            {empresa.nombre}<br />Patrono / Representante Legal
          </div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ height:40 }} />
          <div style={{ borderTop:'1px solid #94a3b8', paddingTop:6, fontSize:11, color:'#64748b' }}>
            {colaborador.nombre_completo}<br />Cédula: {colaborador.identificacion}
          </div>
        </div>
      </div>

      <div style={{ marginTop:16, fontSize:10, color:'#94a3b8', textAlign:'center' }}>
        Documento generado por MYA ERP · {new Date().toLocaleDateString('es-CR', { timeZone:'America/Costa_Rica' })} · Confidencial
      </div>
    </div>
  );

  return ReactDOM.createPortal(
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', zIndex:9999, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 16px', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:744 }}>
        {/* Barra de acciones */}
        <div className="no-print" style={{ display:'flex', gap:10, justifyContent:'flex-end', marginBottom: emailMsg ? 6 : 12, flexWrap:'wrap', alignItems:'center' }}>
          {periodoId && (
            <>
              <input
                type="email"
                value={emailDestino}
                onChange={e => { setEmailDestino(e.target.value); setEmailMsg(''); setEmailOk(false); }}
                placeholder="Email del colaborador"
                style={{
                  padding:'9px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.2)',
                  background:'rgba(255,255,255,0.10)', color:'#f3f7ff', fontSize:13,
                  outline:'none', minWidth:230, flex:1,
                }}
                onFocus={e => e.target.style.borderColor = '#38bdf8'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
              />
              <button onClick={handleEmail} disabled={enviando || !emailDestino.trim()}
                style={{ padding:'9px 20px', borderRadius:10, border:'none', background:'#0891b2', color:'#fff', cursor: (enviando || !emailDestino.trim()) ? 'not-allowed' : 'pointer', fontSize:14, fontWeight:600, opacity: (enviando || !emailDestino.trim()) ? 0.6 : 1, whiteSpace:'nowrap' }}>
                {enviando ? 'Enviando...' : '✉ Enviar'}
              </button>
            </>
          )}
          {periodoId && (
            <button onClick={handlePdf} disabled={descargando}
              style={{ padding:'9px 20px', borderRadius:10, border:'none', background:'#7c3aed', color:'#fff', cursor: descargando ? 'not-allowed' : 'pointer', fontSize:14, fontWeight:600, whiteSpace:'nowrap', opacity: descargando ? 0.65 : 1 }}>
              {descargando ? 'Generando...' : '⬇ Descargar PDF'}
            </button>
          )}
          <button onClick={handlePrint}
            style={{ padding:'9px 20px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#16a34a,#22c55e)', color:'#fff', cursor:'pointer', fontSize:14, fontWeight:600, whiteSpace:'nowrap' }}>
            🖨 Imprimir / PDF
          </button>
          <button onClick={onClose}
            style={{ padding:'9px 16px', borderRadius:10, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.08)', color:'#fff', cursor:'pointer', fontSize:14, whiteSpace:'nowrap' }}>
            Cerrar
          </button>
        </div>
        {emailMsg && (
          <div className="no-print" style={{ marginBottom:12, padding:'8px 14px', borderRadius:8, background: emailOk ? '#0f2c20' : '#34181c', border: `1px solid ${emailOk ? '#1d6e4f' : '#7d2f3a'}`, color: emailOk ? '#9df4c7' : '#ffb3bb', fontSize:13, textAlign:'right' }}>
            {emailOk ? '✓ ' : '✗ '}{emailMsg}
          </div>
        )}
        {content}
      </div>
    </div>,
    document.body
  );
}
