import React, { useEffect, useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { getCostaRicaDateTimeDisplay } from '../../utils/costaRicaTime';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Recepcion {
  id: string;
  codigo: string | null;
  fecha: string;
  lote: string | null;
  grupo_forza: string | null;
  ggn_gln: string | null;
  placa: string | null;
  hora_salida: string | null;
  hora_llegada: string | null;
  total_frutas: number | null;
  fruta_empacada: number | null;
  fruta_jugo: number | null;
  notas: string | null;
  enviado_por: string | null;
  recibido_por: string | null;
  created_at: string;
  proveedor?: { nombre: string; ggn_gln: string | null } | null;
  transportista?: { nombre: string } | null;
  semana?: { codigo: string } | null;
  programa?: { codigo: string; cliente_nombre: string } | null;
}

interface Detalle {
  id: string;
  vin: string | null;
  lote: string | null;
  grupo_forza: string | null;
  carreta: string | null;
  hora_carga: string | null;
  cantidad: number;
  observacion: string | null;
  lat: number | null;
  lng: number | null;
  gps_precision: number | null;
}

interface EmpConfig {
  nombre_emisor?: string;
  nombre_planta?: string;
  logo_url?: string;
}

interface Props {
  recepcionId: string;
  onBack: () => void;
}

// ─── Estilos inline para print ────────────────────────────────────────────────
const S = {
  page:    { fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#111', background: '#fff', padding: '20px 24px', maxWidth: '900px', margin: '0 auto' },
  h1:      { fontSize: '16px', fontWeight: 'bold', margin: '0 0 2px' },
  h2:      { fontSize: '11px', fontWeight: 'bold', margin: '0 0 12px', color: '#555' },
  logo:    { width: '56px', height: '56px', objectFit: 'cover' as const, borderRadius: '6px' },
  divider: { borderTop: '1px solid #999', margin: '10px 0' },
  tbl:     { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '12px', fontSize: '10px' },
  th:      { background: '#1e3a2f', color: '#fff', padding: '5px 8px', textAlign: 'left' as const, fontWeight: 'bold', border: '1px solid #2d5a40', fontSize: '10px' },
  thC:     { background: '#1e3a2f', color: '#fff', padding: '5px 8px', textAlign: 'center' as const, fontWeight: 'bold', border: '1px solid #2d5a40', fontSize: '10px' },
  td:      { padding: '4px 8px', border: '1px solid #ccc', verticalAlign: 'top' as const },
  tdC:     { padding: '4px 8px', border: '1px solid #ccc', textAlign: 'center' as const, verticalAlign: 'top' as const },
  lbl:     { padding: '3px 6px', border: '1px solid #ddd', color: '#555', fontStyle: 'italic' as const, whiteSpace: 'nowrap' as const },
  val:     { padding: '3px 6px', border: '1px solid #ddd', fontWeight: 'bold' as const },
  valM:    { padding: '3px 6px', border: '1px solid #ddd', fontWeight: 'bold' as const, fontFamily: 'monospace' },
  secHdr:  { background: '#f0f7f0', padding: '4px 8px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #c8e0c8', color: '#1e3a2f' },
  gpsOk:   { color: '#15803d', fontFamily: 'monospace', fontSize: '9px' },
  gpsBad:  { color: '#9ca3af', fontSize: '9px' },
  totRow:  { background: '#f0f7f0', fontWeight: 'bold' as const },
  diffPos: { color: '#dc2626', fontWeight: 'bold' as const },
  diffOk:  { color: '#15803d' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtHora(h: string | null) { return h ? h.substring(0, 5) : '—'; }
function fmtFecha(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return '—';
  return n.toLocaleString('es-CR');
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function BoletaRecepcionImprimir({ recepcionId, onBack }: Props) {
  const empresaId = useEmpresaId();
  const [rec, setRec]         = useState<Recepcion | null>(null);
  const [dets, setDets]       = useState<Detalle[]>([]);
  const [config, setConfig]   = useState<EmpConfig>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: d }, { data: cfg }] = await Promise.all([
        supabase
          .from('emp_recepciones')
          .select(`
            id, codigo, fecha, lote, grupo_forza, ggn_gln, placa,
            hora_salida, hora_llegada, total_frutas, fruta_empacada, fruta_jugo,
            notas, enviado_por, recibido_por, created_at,
            proveedor:emp_proveedores_fruta(nombre, ggn_gln),
            transportista:emp_transportistas(nombre),
            semana:emp_semanas(codigo),
            programa:emp_programas(codigo, cliente_nombre)
          `)
          .eq('id', recepcionId)
          .single(),
        supabase
          .from('emp_recepciones_detalle')
          .select('id, vin, lote, grupo_forza, carreta, hora_carga, cantidad, observacion, lat, lng, gps_precision')
          .eq('recepcion_id', recepcionId)
          .order('created_at'),
        supabase
          .from('fe_config_empresa')
          .select('nombre_emisor, nombre_planta, logo_url')
          .eq('empresa_id', empresaId)
          .maybeSingle(),
      ]);
      setRec(r as unknown as Recepcion);
      setDets((d || []) as Detalle[]);
      setConfig((cfg || {}) as EmpConfig);
      setLoading(false);
    }
    load();
  }, [recepcionId, empresaId]);

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#555' }}>Cargando boleta...</div>
  );
  if (!rec) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#c00' }}>No se encontró la recepción.</div>
  );

  const totalVins       = dets.length;
  const totalCantidad   = dets.reduce((s, d) => s + d.cantidad, 0);
  const vinsConGps      = dets.filter(d => d.lat !== null).length;
  const empacada        = rec.fruta_empacada ?? 0;
  const jugo            = rec.fruta_jugo ?? 0;
  const totalRecibido   = rec.total_frutas ?? totalCantidad;
  const rendimiento     = totalRecibido > 0 ? ((empacada / totalRecibido) * 100).toFixed(1) : '—';
  const diferencia      = totalCantidad - totalRecibido;

  const provNombre = (rec.proveedor as any)?.nombre ?? '—';
  const ggnGln     = rec.ggn_gln || (rec.proveedor as any)?.ggn_gln || '—';
  const transNombre = (rec.transportista as any)?.nombre ?? '—';
  const semanaCod  = (rec.semana as any)?.codigo ?? '—';
  const progCod    = (rec.programa as any)?.codigo ?? null;
  const progCliente = (rec.programa as any)?.cliente_nombre ?? null;

  return (
    <div>
      {/* ── Barra de acciones (no se imprime) ────────────────────────────── */}
      <div className="no-print flex items-center gap-3 px-4 py-3"
        style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border"
          style={{ borderColor: '#cbd5e1', color: '#475569' }}>
          <ArrowLeft size={14} /> Volver
        </button>
        <span className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>
          Boleta de Recepción — {rec.codigo || rec.id.substring(0, 8)}
        </span>
        <button onClick={() => window.print()}
          className="ml-auto flex items-center gap-1.5 text-sm px-4 py-1.5 rounded font-semibold"
          style={{ background: '#15803d', color: '#fff' }}>
          <Printer size={14} /> Imprimir
        </button>
      </div>

      {/* ── Documento imprimible ─────────────────────────────────────────── */}
      <div style={S.page}>

        {/* Encabezado empresa */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '10px' }}>
          {config.logo_url && (
            <img src={config.logo_url} alt="logo" style={S.logo}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={S.h1}>{config.nombre_emisor || config.nombre_planta || 'Empacadora de Piña'}</div>
            <div style={S.h2}>{config.nombre_planta || ''}</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e3a2f' }}>
              BOLETA DE RECEPCIÓN DE FRUTA
            </div>
          </div>
          {/* Número de boleta destacado */}
          <div style={{ textAlign: 'right', minWidth: '110px' }}>
            <div style={{ fontSize: '9px', color: '#777', marginBottom: '2px' }}>No. Boleta</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace', color: '#1e3a2f', lineHeight: 1 }}>
              {rec.codigo || '—'}
            </div>
            <div style={{ fontSize: '9px', color: '#777', marginTop: '4px' }}>Semana</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>{semanaCod}</div>
          </div>
        </div>

        <div style={S.divider} />

        {/* ── Sección 1: Datos del viaje ── */}
        <div style={S.secHdr}>1. DATOS DEL VIAJE</div>
        <table style={S.tbl}>
          <tbody>
            <tr>
              <td style={S.lbl}>Fecha</td>
              <td style={S.val}>{fmtFecha(rec.fecha)}</td>
              <td style={S.lbl}>Finca / Proveedor</td>
              <td style={{ ...S.val, fontWeight: 'bold' }}>{provNombre}</td>
            </tr>
            <tr>
              <td style={S.lbl}>GGN / GLN</td>
              <td style={S.valM}>{ggnGln}</td>
              <td style={S.lbl}>Lote cosecha</td>
              <td style={S.valM}>{rec.lote || '—'}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Transportista</td>
              <td style={S.val}>{transNombre}</td>
              <td style={S.lbl}>Placa</td>
              <td style={S.valM}>{rec.placa || '—'}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Hora salida finca</td>
              <td style={S.val}>{fmtHora(rec.hora_salida)}</td>
              <td style={S.lbl}>Hora llegada planta</td>
              <td style={S.val}>{fmtHora(rec.hora_llegada)}</td>
            </tr>
            {(progCod || progCliente) && (
              <tr>
                <td style={S.lbl}>Programa ORP</td>
                <td style={S.val} colSpan={3}>{[progCod, progCliente].filter(Boolean).join(' — ')}</td>
              </tr>
            )}
            <tr>
              <td style={S.lbl}>Enviado por</td>
              <td style={S.val}>{rec.enviado_por || '—'}</td>
              <td style={S.lbl}>Recibido por</td>
              <td style={S.val}>{rec.recibido_por || '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* ── Sección 2: Detalle por VIN ── */}
        <div style={S.secHdr}>2. DETALLE DE TARINAS / VINs ({totalVins} registros)</div>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={{ ...S.thC, width: '28px' }}>#</th>
              <th style={{ ...S.thC, width: '40px' }}>VIN</th>
              <th style={{ ...S.thC, width: '38px' }}>Hora</th>
              <th style={S.th}>Lote</th>
              <th style={S.th}>Bloque/GF</th>
              <th style={{ ...S.thC, width: '36px' }}>Carreta</th>
              <th style={{ ...S.thC, width: '55px' }}>Cantidad</th>
              <th style={S.th}>Observaciones</th>
              <th style={{ ...S.thC, width: '90px' }}>GPS</th>
            </tr>
          </thead>
          <tbody>
            {dets.map((d, i) => (
              <tr key={d.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                <td style={{ ...S.tdC, color: '#888' }}>{i + 1}</td>
                <td style={{ ...S.tdC, fontFamily: 'monospace', fontWeight: 'bold' }}>{d.vin || '—'}</td>
                <td style={{ ...S.tdC, fontFamily: 'monospace' }}>{fmtHora(d.hora_carga)}</td>
                <td style={{ ...S.tdC, fontFamily: 'monospace' }}>{d.lote || '—'}</td>
                <td style={{ ...S.tdC, fontFamily: 'monospace' }}>{d.grupo_forza || '—'}</td>
                <td style={{ ...S.tdC, fontFamily: 'monospace' }}>{d.carreta || '—'}</td>
                <td style={{ ...S.tdC, fontWeight: 'bold' }}>{fmtNum(d.cantidad)}</td>
                <td style={S.td}>{d.observacion || ''}</td>
                <td style={S.tdC}>
                  {d.lat !== null
                    ? <span style={S.gpsOk}>
                        {d.lat.toFixed(4)},{d.lng!.toFixed(4)}<br />
                        <span style={{ color: '#6b7280' }}>±{d.gps_precision?.toFixed(0)}m</span>
                      </span>
                    : <span style={S.gpsBad}>—</span>
                  }
                </td>
              </tr>
            ))}
            {/* Fila total */}
            <tr style={S.totRow}>
              <td style={{ ...S.tdC, ...S.totRow }} colSpan={6}>TOTAL RECIBIDO (VINs)</td>
              <td style={{ ...S.tdC, ...S.totRow, fontSize: '12px' }}>{fmtNum(totalCantidad)}</td>
              <td style={{ ...S.td, ...S.totRow }} colSpan={2}>
                {vinsConGps > 0 && (
                  <span style={{ color: '#15803d', fontSize: '9px' }}>
                    📍 {vinsConGps}/{totalVins} VINs con GPS
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Sección 3: Resumen de rendimiento ── */}
        <div style={S.secHdr}>3. RESUMEN Y RENDIMIENTO</div>
        <table style={S.tbl}>
          <tbody>
            <tr>
              <td style={S.lbl}>Total frutas declaradas (VINs)</td>
              <td style={{ ...S.valM, fontWeight: 'bold', fontSize: '12px', color: '#1e3a2f' }}>{fmtNum(totalCantidad)}</td>
              <td style={S.lbl}>Fruta empacada</td>
              <td style={{ ...S.valM, color: '#15803d', fontWeight: 'bold', fontSize: '12px' }}>{fmtNum(empacada)}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Total registrado en sistema</td>
              <td style={S.valM}>{fmtNum(rec.total_frutas)}</td>
              <td style={S.lbl}>Fruta descarte (jugo)</td>
              <td style={{ ...S.valM, color: '#d97706' }}>{fmtNum(jugo)}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Diferencia (VINs − sistema)</td>
              <td style={{ ...S.valM, ...(diferencia !== 0 ? S.diffPos : S.diffOk) }}>
                {diferencia > 0 ? '+' : ''}{fmtNum(diferencia)}
              </td>
              <td style={S.lbl}>Rendimiento empaque</td>
              <td style={{ ...S.valM, color: '#1e3a2f', fontWeight: 'bold', fontSize: '13px' }}>
                {rendimiento}%
              </td>
            </tr>
          </tbody>
        </table>

        {/* Notas */}
        {rec.notas && (
          <>
            <div style={S.secHdr}>4. OBSERVACIONES</div>
            <div style={{ border: '1px solid #ddd', padding: '8px', minHeight: '36px', marginBottom: '12px', fontSize: '10px' }}>
              {rec.notas}
            </div>
          </>
        )}

        {/* Firmas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '24px' }}>
          {['Enviado por campo', 'Recibido en planta', 'Revisado por'].map(rol => (
            <div key={rol} style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #555', paddingTop: '4px', fontSize: '9px', color: '#666' }}>{rol}</div>
            </div>
          ))}
        </div>

        {/* Pie */}
        <div style={{ marginTop: '16px', borderTop: '1px solid #ddd', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#999' }}>
          <span>Sistema de Trazabilidad — Empacadora de Piña</span>
          <span>Generado: {getCostaRicaDateTimeDisplay('es-CR')}</span>
          <span>Boleta {rec.codigo || rec.id.substring(0, 8)}</span>
        </div>
      </div>

      {/* CSS print */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  );
}
