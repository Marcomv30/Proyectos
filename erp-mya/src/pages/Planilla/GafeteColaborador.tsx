import React from 'react';
import ReactDOM from 'react-dom';
import { formatCompanyDate } from '../../utils/companyTimeZone';

interface Empresa {
  id: number;
  nombre: string;
  cedula?: string | null;
  logo_url?: string | null;
}

interface Colaborador {
  id: number;
  nombre_completo: string;
  numero_empleado: string | null;
  identificacion: string;
  cargo?: string | null;          // nombre del cargo (ya resuelto)
  departamento?: string | null;   // nombre del depto (ya resuelto)
  fecha_ingreso: string;
  qr_token: string | null;
  foto_url: string | null;
}

interface Props {
  colaborador: Colaborador;
  empresa: Empresa;
  onClose: () => void;
}

// QR via API de qr-server.com (libre, no requiere key, genera PNG)
const qrUrl = (token: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(token)}&bgcolor=ffffff&color=0f172a&margin=4`;

function buildGafeteHtml(colaborador: Colaborador, empresa: Empresa): string {
  const qr = colaborador.qr_token ? qrUrl(colaborador.qr_token) : '';
  const foto = colaborador.foto_url ?? '';
  const cargo = colaborador.cargo ?? '';
  const depto = colaborador.departamento ?? '';
  const ingreso = formatCompanyDate(colaborador.fecha_ingreso);

  const avatarHtml = foto
    ? `<img src="${foto}" alt="foto" style="width:84px;height:84px;border-radius:50%;object-fit:cover;border:3px solid #16a34a;" />`
    : `<div style="width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,#16a34a,#22c55e);display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;font-weight:800;flex-shrink:0;border:3px solid #16a34a;">${colaborador.nombre_completo.charAt(0).toUpperCase()}</div>`;

  const logoHtml = empresa.logo_url
    ? `<img src="${empresa.logo_url}" alt="logo" style="height:32px;max-width:80px;object-fit:contain;" />`
    : `<div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#16a34a,#22c55e);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;">${empresa.nombre.charAt(0).toUpperCase()}</div>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Gafete — ${colaborador.nombre_completo}</title>
<style>
@page { size: 54mm 86mm; margin: 0; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Segoe UI',Arial,sans-serif; background:#f0f4f8; display:flex; align-items:center; justify-content:center; min-height:100vh; }
.card {
  width:54mm; height:86mm;
  background:#fff;
  border-radius:10px;
  overflow:hidden;
  display:flex; flex-direction:column;
  box-shadow:0 4px 24px rgba(0,0,0,0.18);
}
/* Franja superior verde */
.card-top {
  background:linear-gradient(135deg,#15803d,#22c55e);
  padding:8px 10px 0;
  display:flex; flex-direction:column; align-items:center;
}
.card-empresa {
  display:flex; align-items:center; gap:5px; width:100%; margin-bottom:6px;
}
.card-empresa-nombre {
  font-size:7.5pt; font-weight:700; color:#fff;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:35mm;
}
/* Foto circular con borde */
.foto-wrap {
  margin-bottom:-20px; z-index:2; position:relative;
}
/* Cuerpo blanco */
.card-body {
  flex:1; display:flex; flex-direction:column; align-items:center;
  padding:24px 10px 8px;
  background:#fff;
}
.nombre {
  font-size:9pt; font-weight:800; color:#0f172a; text-align:center;
  line-height:1.2; margin-bottom:3px; margin-top:2px;
}
.cargo {
  font-size:7pt; font-weight:600; color:#16a34a; text-align:center;
  text-transform:uppercase; letter-spacing:.04em; margin-bottom:1px;
}
.depto {
  font-size:6.5pt; color:#64748b; text-align:center; margin-bottom:6px;
}
.cedula {
  font-size:6.5pt; color:#475569; font-family:monospace; text-align:center;
  background:#f0fdf4; border-radius:4px; padding:2px 8px; margin-bottom:6px;
}
/* QR */
.qr-wrap {
  background:#fff; border-radius:6px; padding:3px;
  border:1px solid #e2e8f0;
  display:flex; align-items:center; justify-content:center;
  margin-bottom:4px;
}
.qr-label {
  font-size:5.5pt; color:#94a3b8; text-align:center; margin-top:0;
}
/* Franja pie */
.card-foot {
  background:#0f172a; padding:4px 8px;
  display:flex; justify-content:space-between; align-items:center;
}
.card-foot-cod {
  font-size:6pt; color:#94a3b8; font-family:monospace;
}
.card-foot-ingreso {
  font-size:6pt; color:#475569;
}
@media screen {
  body { padding:20px; }
}
@media print {
  body { background:#fff; min-height:unset; }
  .card { box-shadow:none; border-radius:8px; }
}
</style>
</head><body>
<div class="card">
  <!-- Franja top -->
  <div class="card-top">
    <div class="card-empresa">
      ${logoHtml}
      <div class="card-empresa-nombre">${empresa.nombre}</div>
    </div>
    <div class="foto-wrap">
      ${avatarHtml}
    </div>
  </div>

  <!-- Cuerpo -->
  <div class="card-body">
    <div class="nombre">${colaborador.nombre_completo}</div>
    ${cargo ? `<div class="cargo">${cargo}</div>` : ''}
    ${depto ? `<div class="depto">${depto}</div>` : ''}
    <div class="cedula">${colaborador.identificacion}</div>

    ${qr ? `
    <div class="qr-wrap">
      <img src="${qr}" alt="QR" width="62" height="62" style="display:block;" />
    </div>
    <div class="qr-label">Escanear para marcar asistencia</div>
    ` : ''}
  </div>

  <!-- Pie -->
  <div class="card-foot">
    <span class="card-foot-cod">${colaborador.numero_empleado ? `Cód. ${colaborador.numero_empleado}` : 'MYA ERP'}</span>
    <span class="card-foot-ingreso">Ingreso: ${ingreso}</span>
  </div>
</div>
</body></html>`;
}

export default function GafeteColaborador({ colaborador, empresa, onClose }: Props) {
  const handleImprimir = () => {
    const html = buildGafeteHtml(colaborador, empresa);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onafterprint = () => win.close();
    setTimeout(() => win.print(), 600);
  };

  const qr = colaborador.qr_token ? qrUrl(colaborador.qr_token) : null;
  const foto = colaborador.foto_url;

  return ReactDOM.createPortal(
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
      onClick={onClose}
    >
      <div
        style={{ background:'#111e13', border:'1px solid rgba(34,197,94,0.2)', borderRadius:16, padding:'22px 26px', maxWidth:400, width:'100%', boxShadow:'0 24px 60px rgba(0,0,0,0.55)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontSize:17, fontWeight:700, color:'#f8fbff', margin:'0 0 18px' }}>Gafete de Identificación</p>

        {/* Preview tarjeta */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:20 }}>
          <div style={{
            width:162, height:258,
            background:'#fff', borderRadius:10, overflow:'hidden',
            display:'flex', flexDirection:'column',
            boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
          }}>
            {/* Top verde */}
            <div style={{ background:'linear-gradient(135deg,#15803d,#22c55e)', padding:'10px 10px 0', display:'flex', flexDirection:'column', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, width:'100%', marginBottom:8 }}>
                <div style={{ width:18, height:18, borderRadius:4, background:'rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:9, flexShrink:0 }}>
                  {empresa.nombre.charAt(0).toUpperCase()}
                </div>
                <div style={{ fontSize:8, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:108 }}>{empresa.nombre}</div>
              </div>
              {/* Avatar */}
              <div style={{ marginBottom:-16, zIndex:2, position:'relative' }}>
                {foto
                  ? <img src={foto} alt="foto" style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover', border:'2.5px solid #16a34a', display:'block' }} />
                  : <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#1d4ed8,#3b82f6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:20, border:'2.5px solid #16a34a' }}>
                      {colaborador.nombre_completo.charAt(0).toUpperCase()}
                    </div>
                }
              </div>
            </div>

            {/* Body */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'22px 8px 6px', background:'#fff' }}>
              <div style={{ fontSize:8.5, fontWeight:800, color:'#0f172a', textAlign:'center', lineHeight:1.2, marginBottom:2 }}>{colaborador.nombre_completo}</div>
              {colaborador.cargo && <div style={{ fontSize:7, fontWeight:600, color:'#16a34a', textAlign:'center', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:1 }}>{colaborador.cargo}</div>}
              {colaborador.departamento && <div style={{ fontSize:6.5, color:'#64748b', textAlign:'center', marginBottom:5 }}>{colaborador.departamento}</div>}
              <div style={{ fontSize:6.5, color:'#475569', fontFamily:'monospace', background:'#f0fdf4', borderRadius:4, padding:'2px 6px', marginBottom:5 }}>{colaborador.identificacion}</div>
              {qr && (
                <>
                  <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:5, padding:2, marginBottom:2 }}>
                    <img src={qr} alt="QR" width={50} height={50} style={{ display:'block' }} />
                  </div>
                  <div style={{ fontSize:5.5, color:'#94a3b8', textAlign:'center' }}>Escanear para asistencia</div>
                </>
              )}
            </div>

            {/* Pie */}
            <div style={{ background:'#0f172a', padding:'3px 7px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:5.5, color:'#94a3b8', fontFamily:'monospace' }}>{colaborador.numero_empleado ? `Cód. ${colaborador.numero_empleado}` : 'MYA ERP'}</span>
              <span style={{ fontSize:5.5, color:'#475569' }}>Ing. {formatCompanyDate(colaborador.fecha_ingreso)}</span>
            </div>
          </div>
        </div>

        {!colaborador.foto_url && (
          <div style={{ fontSize:11, color:'#f59e0b', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:8, padding:'8px 12px', marginBottom:14, textAlign:'center' }}>
            Sin foto — el gafete usará inicial. Puede agregar foto en el perfil del colaborador.
          </div>
        )}
        {!colaborador.qr_token && (
          <div style={{ fontSize:11, color:'#f87171', background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:8, padding:'8px 12px', marginBottom:14, textAlign:'center' }}>
            Este colaborador no tiene token QR generado.
          </div>
        )}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button
            onClick={onClose}
            style={{ border:'1px solid rgba(34,197,94,0.2)', background:'#1a2e1a', color:'#d6e2ff', borderRadius:10, padding:'8px 18px', fontSize:13, cursor:'pointer' }}
          >
            Cerrar
          </button>
          <button
            onClick={handleImprimir}
            style={{ border:'1px solid #16a34a', background:'linear-gradient(135deg,#16a34a,#22c55e)', color:'#fff', borderRadius:10, padding:'8px 22px', fontSize:13, fontWeight:700, cursor:'pointer' }}
          >
            Imprimir Gafete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
