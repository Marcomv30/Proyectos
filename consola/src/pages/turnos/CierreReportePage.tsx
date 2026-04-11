/**
 * CierreReportePage — Reporte elegante de cierre de turno
 * Imprimible y apto para enviar por email (HTML standalone)
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { supabase } from '../../supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type CierreMya = {
  id: number;
  turno_nombre: string;
  inicio_at: string;
  cierre_at: string;
  cerrado_por: string | null;
  total_ventas: number;
  total_litros: number;
  total_monto: number;
  resumen_grados: Array<{ grade_id: number; litros: number; monto: number; ventas: number }> | null;
  resumen_pisteros: Array<{ attendant_id: string; litros: number; monto: number; ventas: number }> | null;
};

interface Cfg {
  nombre_emisor: string | null;
  nombre_comercial: string | null;
  numero_identificacion: string | null;
  telefono_emisor: string | null;
  logo_url: string | null;
  otras_senas: string | null;
}

interface Props {
  cierre: CierreMya;
  grades: Record<number, string>;         // grade_id → nombre
  gradeColors?: Record<string, string>;   // nombre → color hex
  empresaId: number;
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TZ = 'America/Costa_Rica';

function fmt(n: number, dec = 0) {
  return n.toLocaleString('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtCRC(n: number) {
  return '₡' + fmt(n, 0);
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CR', {
    timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}
function duracion(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

const TURNO_COLOR: Record<string, { bg: string; accent: string; label: string }> = {
  'Mañana': { bg: '#1e3a5f', accent: '#f59e0b', label: '#fcd34d' },
  'Tarde':  { bg: '#1e3a5f', accent: '#f97316', label: '#fed7aa' },
  'Noche':  { bg: '#1e1f3a', accent: '#818cf8', label: '#c7d2fe' },
};
const DEFAULT_COLORS: Record<string, string> = {
  'Regular': '#22c55e', 'Super': '#a855f7', 'Diesel': '#38bdf8', 'Gas LP': '#f59e0b',
};

// ─── Build HTML standalone (para email/print via server) ──────────────────────
export function buildCierreHtml(
  cierre: CierreMya,
  grades: Record<number, string>,
  cfg: Cfg,
  gradeColors: Record<string, string> = {}
): string {
  const tc = TURNO_COLOR[cierre.turno_nombre] ?? TURNO_COLOR['Tarde'];
  const colors = { ...DEFAULT_COLORS, ...gradeColors };

  const grados = cierre.resumen_grados ?? [];
  const pisteros = cierre.resumen_pisteros ?? [];

  const gradoRows = grados.map(g => {
    const nombre = grades[g.grade_id] ?? `Grado ${g.grade_id}`;
    const color = colors[nombre] ?? '#94a3b8';
    const pct = cierre.total_monto > 0 ? ((g.monto / cierre.total_monto) * 100).toFixed(1) : '0.0';
    return `
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 12px;display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
          <span style="font-weight:600;color:#1e293b">${nombre}</span>
        </td>
        <td style="padding:8px 12px;text-align:center;color:#475569;font-family:monospace">${g.ventas}</td>
        <td style="padding:8px 12px;text-align:right;font-family:monospace;color:#475569">${fmt(g.litros, 2)} L</td>
        <td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#1e293b">${fmtCRC(g.monto)}</td>
        <td style="padding:8px 12px;text-align:right;font-family:monospace;color:#64748b">${pct}%</td>
      </tr>`;
  }).join('');

  const pisteroRows = pisteros.map(p => {
    const nombre = p.attendant_id === 'SIN_PISTERO' ? '<em style="color:#94a3b8">Sin asignar</em>' : `<strong>${p.attendant_id}</strong>`;
    const pct = cierre.total_monto > 0 ? ((p.monto / cierre.total_monto) * 100).toFixed(1) : '0.0';
    return `
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 12px">${nombre}</td>
        <td style="padding:8px 12px;text-align:center;font-family:monospace;color:#475569">${p.ventas}</td>
        <td style="padding:8px 12px;text-align:right;font-family:monospace;color:#475569">${fmt(p.litros, 2)} L</td>
        <td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#1e293b">${fmtCRC(p.monto)}</td>
        <td style="padding:8px 12px;text-align:right;font-family:monospace;color:#64748b">${pct}%</td>
      </tr>`;
  }).join('');

  const logoHtml = cfg.logo_url
    ? `<img src="${cfg.logo_url}" alt="logo" style="width:52px;height:52px;object-fit:cover;border-radius:8px;flex-shrink:0">`
    : '';

  const dur = duracion(cierre.inicio_at, cierre.cierre_at);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cierre de Turno — ${cierre.turno_nombre} — ${fmtDate(cierre.cierre_at)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #334155; background: #f8fafc; }
  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    @page { margin: 18mm 14mm; }
  }
  table { border-collapse: collapse; width: 100%; }
  td, th { vertical-align: middle; }
  .wm { position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex;
        align-items: center; justify-content: center; pointer-events: none; z-index: 999; }
  .wm span { font-size: 52px; font-weight: 900; color: rgba(100,116,139,0.07);
             transform: rotate(-35deg); letter-spacing: 4px; white-space: nowrap; }
</style>
</head>
<body>
<div style="max-width:760px;margin:0 auto;padding:24px 20px">

  <!-- Encabezado empresa -->
  <div style="background:${tc.bg};border-radius:16px;padding:24px 28px;margin-bottom:20px;color:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
    <div style="display:flex;gap:14px;align-items:flex-start">
      ${logoHtml}
      <div>
        <div style="font-size:17px;font-weight:700;line-height:1.2">${cfg.nombre_emisor ?? 'Estación de Servicio'}</div>
        ${cfg.nombre_comercial ? `<div style="font-size:12px;opacity:0.75;margin-top:2px">${cfg.nombre_comercial}</div>` : ''}
        ${cfg.numero_identificacion ? `<div style="font-size:11px;opacity:0.6;margin-top:4px;font-family:monospace">Cédula: ${cfg.numero_identificacion}</div>` : ''}
        ${cfg.telefono_emisor ? `<div style="font-size:11px;opacity:0.6;margin-top:2px">Tel: ${cfg.telefono_emisor}</div>` : ''}
        ${cfg.otras_senas ? `<div style="font-size:11px;opacity:0.55;margin-top:2px">${cfg.otras_senas}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:11px;opacity:0.6;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">Cierre de Turno</div>
      <div style="font-size:26px;font-weight:900;color:${tc.label};letter-spacing:-1px;line-height:1">${cierre.turno_nombre.toUpperCase()}</div>
      <div style="font-size:11px;opacity:0.6;margin-top:6px">#${cierre.id}</div>
    </div>
  </div>

  <!-- Período -->
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:16px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:12px">Período del turno</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Inicio</div>
        <div style="font-weight:700;color:#1e293b;font-size:14px">${fmtTime(cierre.inicio_at)}</div>
        <div style="font-size:11px;color:#64748b">${fmtDate(cierre.inicio_at)}</div>
      </div>
      <div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Cierre</div>
        <div style="font-weight:700;color:#1e293b;font-size:14px">${fmtTime(cierre.cierre_at)}</div>
        <div style="font-size:11px;color:#64748b">${fmtDate(cierre.cierre_at)}</div>
      </div>
      <div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Duración</div>
        <div style="font-weight:700;color:#1e293b;font-size:14px">${dur}</div>
        <div style="font-size:11px;color:#64748b">Cerrado por: ${cierre.cerrado_por ?? 'sistema'}</div>
      </div>
    </div>
  </div>

  <!-- KPIs totales -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;text-align:center">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Transacciones</div>
      <div style="font-size:28px;font-weight:900;color:#1e293b;font-family:monospace;line-height:1">${cierre.total_ventas}</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;text-align:center">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Total litros</div>
      <div style="font-size:28px;font-weight:900;color:#0369a1;font-family:monospace;line-height:1">${fmt(cierre.total_litros, 2)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">litros</div>
    </div>
    <div style="background:${tc.bg};border:1px solid ${tc.bg};border-radius:12px;padding:16px 20px;text-align:center">
      <div style="font-size:10px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Total monto</div>
      <div style="font-size:22px;font-weight:900;color:${tc.label};font-family:monospace;line-height:1">${fmtCRC(cierre.total_monto)}</div>
    </div>
  </div>

  <!-- Por grado -->
  ${grados.length > 0 ? `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;overflow:hidden">
    <div style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:12px 20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b">Desglose por producto</div>
    </div>
    <table>
      <thead>
        <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Producto</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Txns</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Litros</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Monto</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">%</th>
        </tr>
      </thead>
      <tbody>${gradoRows}</tbody>
      <tfoot>
        <tr style="background:#f8fafc;border-top:2px solid #cbd5e1">
          <td style="padding:10px 12px;font-weight:700;color:#1e293b">TOTAL</td>
          <td style="padding:10px 12px;text-align:center;font-family:monospace;font-weight:700;color:#1e293b">${cierre.total_ventas}</td>
          <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:700;color:#1e293b">${fmt(cierre.total_litros, 2)} L</td>
          <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:900;font-size:14px;color:#1e293b">${fmtCRC(cierre.total_monto)}</td>
          <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:700;color:#64748b">100%</td>
        </tr>
      </tfoot>
    </table>
  </div>` : ''}

  <!-- Por pistero -->
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;overflow:hidden">
    <div style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:12px 20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b">Desglose por pistero</div>
    </div>
    ${pisteros.length > 0 ? `
    <table>
      <thead>
        <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Pistero</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Txns</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Litros</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Monto</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">%</th>
        </tr>
      </thead>
      <tbody>${pisteroRows}</tbody>
    </table>` : `
    <div style="padding:16px 20px;font-size:12px;color:#94a3b8;font-style:italic">Sin datos de pisteros para este período.</div>`}
  </div>

  <!-- Firmas -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px;margin-bottom:12px">
    ${['Jefe de Turno', 'Administración'].map(rol => `
      <div style="text-align:center">
        <div style="border-top:1.5px solid #94a3b8;padding-top:6px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">${rol}</div>
      </div>`).join('')}
  </div>

  <!-- Pie -->
  <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:12px;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">
    <span>Sistema MYA — Control de Combustible</span>
    <span>Generado: ${new Date().toLocaleString('es-CR', { timeZone: TZ })}</span>
    <span>Cierre #${cierre.id}</span>
  </div>

</div>
</body>
</html>`;
}

// ─── Componente React (vista in-app) ──────────────────────────────────────────
export default function CierreReportePage({ cierre, grades, gradeColors = {}, empresaId, onBack }: Props) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('fe_config_empresa')
      .select('nombre_emisor, nombre_comercial, numero_identificacion, telefono_emisor, logo_url, otras_senas')
      .eq('empresa_id', empresaId)
      .maybeSingle()
      .then(({ data }) => { setCfg(data as Cfg | null); setLoading(false); });
  }, [empresaId]);

  function handlePrint() {
    if (!cfg) return;
    const html = buildCierreHtml(cierre, grades, cfg, gradeColors);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none';
    document.body.appendChild(iframe);
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(html);
    iframe.contentDocument!.close();
    iframe.contentWindow!.focus();
    // Pequeño delay para que el DOM esté listo
    setTimeout(() => {
      iframe.contentWindow!.print();
      iframe.addEventListener('afterprint', () => document.body.removeChild(iframe));
    }, 400);
  }

  if (loading) return <div className="p-10 text-center text-slate-400">Cargando reporte...</div>;

  const tc = TURNO_COLOR[cierre.turno_nombre] ?? TURNO_COLOR['Tarde'];
  const colors = { ...DEFAULT_COLORS, ...gradeColors };
  const grados = cierre.resumen_grados ?? [];
  const pisteros = cierre.resumen_pisteros ?? [];
  const dur = duracion(cierre.inicio_at, cierre.cierre_at);

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      {/* Barra de acciones */}
      <div className="no-print sticky top-0 z-50 flex items-center gap-3 px-5 py-3 shadow-sm"
        style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
          <ArrowLeft size={14} /> Volver
        </button>
        <div className="flex-1">
          <span className="text-sm font-semibold text-slate-200">Cierre de Turno</span>
          <span className="ml-2 text-sm text-slate-400">— {cierre.turno_nombre} · {fmtDate(cierre.cierre_at)}</span>
        </div>
        <button onClick={handlePrint}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold transition-colors"
          style={{ background: tc.accent, color: '#fff' }}>
          <Printer size={14} /> Imprimir / PDF
        </button>
      </div>

      {/* Documento */}
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '28px 20px' }}>

        {/* Header empresa */}
        <div style={{ background: tc.bg, borderRadius: '16px', padding: '24px 28px', marginBottom: '20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            {cfg?.logo_url && (
              <img src={cfg.logo_url} alt="logo"
                style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.2 }}>{cfg?.nombre_emisor ?? 'Estación de Servicio'}</div>
              {cfg?.nombre_comercial && <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>{cfg.nombre_comercial}</div>}
              {cfg?.numero_identificacion && <div style={{ fontSize: '11px', opacity: 0.55, marginTop: '4px', fontFamily: 'monospace' }}>Cédula: {cfg.numero_identificacion}</div>}
              {cfg?.telefono_emisor && <div style={{ fontSize: '11px', opacity: 0.55, marginTop: '2px' }}>Tel: {cfg.telefono_emisor}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '11px', opacity: 0.55, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Cierre de Turno</div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: tc.label, letterSpacing: '-1px', lineHeight: 1 }}>{cierre.turno_nombre.toUpperCase()}</div>
            <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '6px' }}>#{cierre.id}</div>
          </div>
        </div>

        {/* Período */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 22px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', marginBottom: '14px' }}>Período del turno</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            {[
              { label: 'Inicio', time: fmtTime(cierre.inicio_at), date: fmtDate(cierre.inicio_at) },
              { label: 'Cierre', time: fmtTime(cierre.cierre_at), date: fmtDate(cierre.cierre_at) },
              { label: 'Duración', time: dur, date: `Cerrado por: ${cierre.cerrado_por ?? 'sistema'}` },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '3px' }}>{item.label}</div>
                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '16px' }}>{item.time}</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{item.date}</div>
              </div>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>Transacciones</div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#1e293b', fontFamily: 'monospace', lineHeight: 1 }}>{cierre.total_ventas}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>Total litros</div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#0369a1', fontFamily: 'monospace', lineHeight: 1 }}>{fmt(cierre.total_litros, 2)}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>litros</div>
          </div>
          <div style={{ background: tc.bg, border: `1px solid ${tc.bg}`, borderRadius: '12px', padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>Total monto</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: tc.label, fontFamily: 'monospace', lineHeight: 1 }}>{fmtCRC(cierre.total_monto)}</div>
          </div>
        </div>

        {/* Por grado */}
        {grados.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>Desglose por producto</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                  {['Producto', 'Txns', 'Litros', 'Monto', '%'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 14px', fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grados.map(g => {
                  const nombre = grades[g.grade_id] ?? `Grado ${g.grade_id}`;
                  const color = colors[nombre] ?? '#94a3b8';
                  const pct = cierre.total_monto > 0 ? ((g.monto / cierre.total_monto) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={g.grade_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{nombre}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#475569', fontFamily: 'monospace' }}>{g.ventas}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#475569' }}>{fmt(g.litros, 2)} L</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1e293b' }}>{fmtCRC(g.monto)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>TOTAL</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: '#1e293b' }}>{cierre.total_ventas}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1e293b' }}>{fmt(cierre.total_litros, 2)} L</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: '15px', color: '#1e293b' }}>{fmtCRC(cierre.total_monto)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#64748b' }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Por pistero — siempre visible */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>Desglose por pistero</div>
          </div>
          {pisteros.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                  {['Pistero', 'Txns', 'Litros', 'Monto', '%'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 14px', fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pisteros.map(p => {
                  const pct = cierre.total_monto > 0 ? ((p.monto / cierre.total_monto) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={p.attendant_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', color: '#1e293b', fontWeight: p.attendant_id === 'SIN_PISTERO' ? 400 : 600 }}>
                        {p.attendant_id === 'SIN_PISTERO'
                          ? <em style={{ color: '#94a3b8' }}>Sin asignar</em>
                          : p.attendant_id}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'monospace', color: '#475569' }}>{p.ventas}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#475569' }}>{fmt(p.litros, 2)} L</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1e293b' }}>{fmtCRC(p.monto)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '16px 20px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
              Sin datos de pisteros para este período.
            </div>
          )}
        </div>

        {/* Firmas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginTop: '40px', marginBottom: '16px' }}>
          {['Jefe de Turno', 'Administración'].map(rol => (
            <div key={rol} style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1.5px solid #94a3b8', paddingTop: '8px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>{rol}</div>
            </div>
          ))}
        </div>

        {/* Pie */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginTop: '20px' }}>
          <span>Sistema MYA — Control de Combustible</span>
          <span>Generado: {new Date().toLocaleString('es-CR', { timeZone: TZ })}</span>
          <span>Cierre #{cierre.id}</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
