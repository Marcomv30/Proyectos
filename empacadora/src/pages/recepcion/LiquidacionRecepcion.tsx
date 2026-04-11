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
  fruta_rechazo: number | null;
  tipo_rechazo: string | null;
  precio_rechazo: number | null;
  notas_rechazo: string | null;
  notas: string | null;
  enviado_por: string | null;
  recibido_por: string | null;
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
}

interface Boleta {
  numero_paleta: number;
  calibre_nombre: string | null;
  marca_nombre: string | null;
  cajas_empacadas: number;
  puchos: number;
  puchos_2: number;
  puchos_3: number;
  total_frutas: number | null;
  trazabilidad: string | null;
  aplica: boolean;
  despacho_id: string | null;
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

// ─── Estilos ──────────────────────────────────────────────────────────────────
const S = {
  page:    { fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#111', background: '#fff', padding: '20px 24px', maxWidth: '960px', margin: '0 auto' },
  h1:      { fontSize: '16px', fontWeight: 'bold', margin: '0 0 2px' },
  h2:      { fontSize: '11px', fontWeight: 'bold', margin: '0 0 12px', color: '#555' },
  logo:    { width: '56px', height: '56px', objectFit: 'cover' as const, borderRadius: '6px' },
  divider: { borderTop: '1px solid #999', margin: '10px 0' },
  tbl:     { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '12px', fontSize: '10px' },
  th:      { background: '#1a3a5c', color: '#fff', padding: '5px 8px', textAlign: 'left' as const, fontWeight: 'bold', border: '1px solid #274e76', fontSize: '10px' },
  thC:     { background: '#1a3a5c', color: '#fff', padding: '5px 8px', textAlign: 'center' as const, fontWeight: 'bold', border: '1px solid #274e76', fontSize: '10px' },
  thR:     { background: '#1a3a5c', color: '#fff', padding: '5px 8px', textAlign: 'right' as const, fontWeight: 'bold', border: '1px solid #274e76', fontSize: '10px' },
  td:      { padding: '4px 8px', border: '1px solid #ccc', verticalAlign: 'top' as const },
  tdC:     { padding: '4px 8px', border: '1px solid #ccc', textAlign: 'center' as const, verticalAlign: 'top' as const },
  tdR:     { padding: '4px 8px', border: '1px solid #ccc', textAlign: 'right' as const, verticalAlign: 'top' as const },
  lbl:     { padding: '3px 6px', border: '1px solid #ddd', color: '#555', fontStyle: 'italic' as const, whiteSpace: 'nowrap' as const },
  val:     { padding: '3px 6px', border: '1px solid #ddd', fontWeight: 'bold' as const },
  valM:    { padding: '3px 6px', border: '1px solid #ddd', fontWeight: 'bold' as const, fontFamily: 'monospace' },
  secHdr:  { background: '#e8f0f8', padding: '4px 8px', fontWeight: 'bold', fontSize: '10px', border: '1px solid #c0d4ea', color: '#1a3a5c', marginBottom: '0' },
  totRow:  { background: '#e8f0f8', fontWeight: 'bold' as const },
  kpiBox:  { border: '1px solid #c0d4ea', borderRadius: '4px', padding: '8px 12px', textAlign: 'center' as const, flex: '1' },
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
function pct(a: number, b: number) {
  if (b === 0) return '0.0%';
  return ((a / b) * 100).toFixed(1) + '%';
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function LiquidacionRecepcion({ recepcionId, onBack }: Props) {
  const empresaId = useEmpresaId();
  const [rec, setRec]         = useState<Recepcion | null>(null);
  const [dets, setDets]       = useState<Detalle[]>([]);
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [config, setConfig]   = useState<EmpConfig>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: d }, { data: b }, { data: cfg }] = await Promise.all([
        supabase
          .from('emp_recepciones')
          .select(`
            id, codigo, fecha, lote, grupo_forza, ggn_gln, placa,
            hora_salida, hora_llegada, total_frutas, fruta_empacada, fruta_jugo,
            fruta_rechazo, tipo_rechazo, precio_rechazo, notas_rechazo,
            notas, enviado_por, recibido_por,
            proveedor:emp_proveedores_fruta(nombre, ggn_gln),
            transportista:emp_transportistas(nombre),
            semana:emp_semanas(codigo),
            programa:emp_programas(codigo, cliente_nombre)
          `)
          .eq('id', recepcionId)
          .single(),
        supabase
          .from('emp_recepciones_detalle')
          .select('id, vin, lote, grupo_forza, carreta, hora_carga, cantidad, observacion')
          .eq('recepcion_id', recepcionId)
          .order('created_at'),
        supabase
          .from('emp_boletas')
          .select('numero_paleta, calibre_nombre, marca_nombre, cajas_empacadas, puchos, puchos_2, puchos_3, total_frutas, trazabilidad, aplica, despacho_id')
          .eq('recepcion_id', recepcionId)
          .order('numero_paleta'),
        supabase
          .from('fe_config_empresa')
          .select('nombre_emisor, nombre_planta, logo_url')
          .eq('empresa_id', empresaId)
          .maybeSingle(),
      ]);
      setRec(r as unknown as Recepcion);
      setDets((d || []) as Detalle[]);
      setBoletas((b || []) as Boleta[]);
      setConfig((cfg || {}) as EmpConfig);
      setLoading(false);
    }
    load();
  }, [recepcionId, empresaId]);

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#555' }}>Cargando liquidación...</div>
  );
  if (!rec) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#c00' }}>No se encontró la recepción.</div>
  );

  // ─── Cálculos ─────────────────────────────────────────────────────────────
  const totalVins      = dets.length;
  const totalCantidad  = dets.reduce((s, d) => s + d.cantidad, 0);
  const totalSistema   = rec.total_frutas ?? totalCantidad;
  const empacada       = boletas.reduce((s, b) => s + (b.total_frutas || 0), 0);
  const jugo           = rec.fruta_jugo ?? 0;
  const rechazo        = rec.fruta_rechazo ?? 0;
  const pendiente      = Math.max(0, totalSistema - empacada - jugo - rechazo);
  const diferencia     = totalCantidad - totalSistema;

  // Agrupado por calibre
  const porCalibre = boletas.reduce<Record<string, { cajas: number; frutas: number }>>((acc, b) => {
    const key = b.calibre_nombre || 'Sin calibre';
    if (!acc[key]) acc[key] = { cajas: 0, frutas: 0 };
    acc[key].cajas  += (b.cajas_empacadas + b.puchos + b.puchos_2 + b.puchos_3);
    acc[key].frutas += b.total_frutas || 0;
    return acc;
  }, {});

  const provNombre   = (rec.proveedor as any)?.nombre ?? '—';
  const ggnGln       = rec.ggn_gln || (rec.proveedor as any)?.ggn_gln || '—';
  const transNombre  = (rec.transportista as any)?.nombre ?? '—';
  const semanaCod    = (rec.semana as any)?.codigo ?? '—';
  const progCod      = (rec.programa as any)?.codigo ?? null;
  const progCliente  = (rec.programa as any)?.cliente_nombre ?? null;

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
        <span className="text-sm font-semibold" style={{ color: '#1a3a5c' }}>
          Liquidación — {rec.codigo || rec.id.substring(0, 8)}
        </span>
        <button onClick={() => window.print()}
          className="ml-auto flex items-center gap-1.5 text-sm px-4 py-1.5 rounded font-semibold"
          style={{ background: '#1a3a5c', color: '#fff' }}>
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
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a3a5c' }}>
              LIQUIDACIÓN DE RECEPCIÓN DE FRUTA
            </div>
          </div>
          {/* Número destacado */}
          <div style={{ textAlign: 'right', minWidth: '110px' }}>
            <div style={{ fontSize: '9px', color: '#777', marginBottom: '2px' }}>No. Boleta</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace', color: '#1a3a5c', lineHeight: 1 }}>
              {rec.codigo || '—'}
            </div>
            <div style={{ fontSize: '9px', color: '#777', marginTop: '4px' }}>Semana</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>{semanaCod}</div>
            <div style={{ fontSize: '9px', color: '#777', marginTop: '4px' }}>Fecha</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{fmtFecha(rec.fecha)}</div>
          </div>
        </div>

        <div style={S.divider} />

        {/* ── Sección 1: Datos del viaje ── */}
        <div style={S.secHdr}>1. DATOS DEL VIAJE</div>
        <table style={S.tbl}>
          <tbody>
            <tr>
              <td style={S.lbl}>Finca / Proveedor</td>
              <td style={{ ...S.val, fontWeight: 'bold' }}>{provNombre}</td>
              <td style={S.lbl}>GGN / GLN</td>
              <td style={S.valM}>{ggnGln}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Lote cosecha</td>
              <td style={S.valM}>{rec.lote || '—'}</td>
              <td style={S.lbl}>Grupo Forza</td>
              <td style={S.valM}>{rec.grupo_forza || '—'}</td>
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

        {/* ── Sección 2: Detalle VINs ── */}
        <div style={S.secHdr}>2. DETALLE DE TARINAS / VINs ({totalVins} registros)</div>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={{ ...S.thC, width: '28px' }}>#</th>
              <th style={{ ...S.thC, width: '44px' }}>VIN</th>
              <th style={{ ...S.thC, width: '38px' }}>Hora</th>
              <th style={S.th}>Lote</th>
              <th style={S.th}>Bloque/GF</th>
              <th style={{ ...S.thC, width: '36px' }}>Carreta</th>
              <th style={{ ...S.thR, width: '60px' }}>Cantidad</th>
              <th style={S.th}>Observaciones</th>
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
                <td style={{ ...S.tdR, fontWeight: 'bold' }}>{fmtNum(d.cantidad)}</td>
                <td style={S.td}>{d.observacion || ''}</td>
              </tr>
            ))}
            <tr style={S.totRow}>
              <td style={{ ...S.tdC, ...S.totRow }} colSpan={6}>TOTAL VINs</td>
              <td style={{ ...S.tdR, ...S.totRow, fontSize: '11px' }}>{fmtNum(totalCantidad)}</td>
              <td style={{ ...S.td, ...S.totRow }} />
            </tr>
          </tbody>
        </table>

        {/* ── Sección 3: Boletas de empaque ── */}
        <div style={S.secHdr}>3. PALETAS EMPACADAS ({boletas.length} paleta{boletas.length !== 1 ? 's' : ''})</div>
        {boletas.length === 0 ? (
          <div style={{ border: '1px solid #ddd', padding: '10px 12px', marginBottom: '12px', color: '#888', fontStyle: 'italic', fontSize: '10px' }}>
            Sin boletas de empaque registradas para esta recepción.
          </div>
        ) : (
          <table style={S.tbl}>
            <thead>
              <tr>
                <th style={{ ...S.thC, width: '40px' }}>Paleta</th>
                <th style={S.th}>Calibre</th>
                <th style={S.th}>Marca</th>
                <th style={{ ...S.thR, width: '55px' }}>Cajas</th>
                <th style={{ ...S.thR, width: '65px' }}>Frutas</th>
                <th style={S.th}>Trazabilidad</th>
                <th style={{ ...S.thC, width: '70px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {boletas.map((b, i) => {
                const cajasTotal = b.cajas_empacadas + b.puchos + b.puchos_2 + b.puchos_3;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ ...S.tdC, fontFamily: 'monospace', fontWeight: 'bold' }}>#{b.numero_paleta}</td>
                    <td style={S.td}>{b.calibre_nombre || '—'}</td>
                    <td style={S.td}>{b.marca_nombre || '—'}</td>
                    <td style={{ ...S.tdR }}>{fmtNum(cajasTotal)}</td>
                    <td style={{ ...S.tdR, fontWeight: 'bold', color: '#15803d' }}>{fmtNum(b.total_frutas)}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '9px', color: '#555' }}>{b.trazabilidad || '—'}</td>
                    <td style={{ ...S.tdC, fontSize: '9px' }}>
                      {b.despacho_id
                        ? <span style={{ color: '#15803d', fontWeight: 'bold' }}>Despachada</span>
                        : <span style={{ color: '#888' }}>En planta</span>}
                    </td>
                  </tr>
                );
              })}
              <tr style={S.totRow}>
                <td style={{ ...S.tdC, ...S.totRow }} colSpan={3}>TOTAL EMPACADO</td>
                <td style={{ ...S.tdR, ...S.totRow }}>
                  {fmtNum(boletas.reduce((s, b) => s + b.cajas_empacadas + b.puchos + b.puchos_2 + b.puchos_3, 0))}
                </td>
                <td style={{ ...S.tdR, ...S.totRow, fontSize: '11px', color: '#15803d' }}>{fmtNum(empacada)}</td>
                <td colSpan={2} style={{ ...S.td, ...S.totRow }} />
              </tr>
            </tbody>
          </table>
        )}

        {/* ── Sección 4: Resumen por calibre ── */}
        {Object.keys(porCalibre).length > 0 && (
          <>
            <div style={S.secHdr}>4. RESUMEN POR CALIBRE</div>
            <table style={{ ...S.tbl, width: 'auto', minWidth: '340px' }}>
              <thead>
                <tr>
                  <th style={S.th}>Calibre</th>
                  <th style={S.thR}>Cajas</th>
                  <th style={S.thR}>Frutas</th>
                  <th style={S.thR}>% del total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(porCalibre).sort((a, b) => b[1].frutas - a[1].frutas).map(([cal, v], i) => (
                  <tr key={cal} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={S.td}>{cal}</td>
                    <td style={S.tdR}>{fmtNum(v.cajas)}</td>
                    <td style={{ ...S.tdR, fontWeight: 'bold' }}>{fmtNum(v.frutas)}</td>
                    <td style={{ ...S.tdR, color: '#1a3a5c' }}>{pct(v.frutas, empacada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ── Sección 5: Liquidación ── */}
        <div style={{ ...S.secHdr, background: '#1a3a5c', color: '#fff', border: '1px solid #1a3a5c' }}>
          {Object.keys(porCalibre).length > 0 ? '5' : '4'}. LIQUIDACIÓN Y RENDIMIENTO
        </div>
        {/* KPIs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', border: '1px solid #c0d4ea', borderTop: 'none', padding: '10px' }}>
          <div style={S.kpiBox}>
            <div style={{ fontSize: '9px', color: '#888', marginBottom: '2px' }}>INGRESADAS (VINs)</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#111' }}>{fmtNum(totalCantidad)}</div>
          </div>
          <div style={S.kpiBox}>
            <div style={{ fontSize: '9px', color: '#888', marginBottom: '2px' }}>INGRESADAS (sistema)</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#111' }}>{fmtNum(totalSistema)}</div>
            {diferencia !== 0 && (
              <div style={{ fontSize: '9px', color: diferencia > 0 ? '#dc2626' : '#15803d' }}>
                Diferencia: {diferencia > 0 ? '+' : ''}{fmtNum(diferencia)}
              </div>
            )}
          </div>
          <div style={S.kpiBox}>
            <div style={{ fontSize: '9px', color: '#888', marginBottom: '2px' }}>EMPACADAS</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d' }}>{fmtNum(empacada)}</div>
          </div>
          <div style={S.kpiBox}>
            <div style={{ fontSize: '9px', color: '#888', marginBottom: '2px' }}>JUGO / DESCARTE</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: jugo > 0 ? '#d97706' : '#888' }}>{fmtNum(jugo)}</div>
          </div>
          {rechazo > 0 && (
            <div style={S.kpiBox}>
              <div style={{ fontSize: '9px', color: '#888', marginBottom: '2px' }}>RECHAZO</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626' }}>{fmtNum(rechazo)}</div>
              {rec.tipo_rechazo && <div style={{ fontSize: '9px', color: '#dc2626' }}>{rec.tipo_rechazo}</div>}
            </div>
          )}
          <div style={{ ...S.kpiBox, background: pendiente > 0 ? '#fff7ed' : '#f0fdf4', borderColor: pendiente > 0 ? '#fed7aa' : '#bbf7d0' }}>
            <div style={{ fontSize: '9px', color: '#888', marginBottom: '2px' }}>PENDIENTE</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: pendiente > 0 ? '#ea580c' : '#15803d' }}>{fmtNum(pendiente)}</div>
          </div>
          <div style={{ ...S.kpiBox, background: '#eff6ff', borderColor: '#93c5fd', minWidth: '100px' }}>
            <div style={{ fontSize: '9px', color: '#888', marginBottom: '2px' }}>RENDIMIENTO</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a3a5c' }}>{pct(empacada, totalSistema)}</div>
          </div>
        </div>

        {/* Notas de rechazo */}
        {rec.notas_rechazo && (
          <div style={{ border: '1px solid #fca5a5', background: '#fff5f5', padding: '6px 10px', marginBottom: '10px', fontSize: '10px' }}>
            <strong style={{ color: '#dc2626' }}>Observaciones rechazo:</strong> {rec.notas_rechazo}
          </div>
        )}

        {/* Notas generales */}
        {rec.notas && (
          <>
            <div style={S.secHdr}>{Object.keys(porCalibre).length > 0 ? '6' : '5'}. OBSERVACIONES</div>
            <div style={{ border: '1px solid #ddd', padding: '8px', minHeight: '32px', marginBottom: '12px', fontSize: '10px' }}>
              {rec.notas}
            </div>
          </>
        )}

        {/* Firmas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '28px' }}>
          {['Jefe de Recepción', 'Control de Calidad', 'Administración'].map(rol => (
            <div key={rol} style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #555', paddingTop: '4px', fontSize: '9px', color: '#666' }}>{rol}</div>
            </div>
          ))}
        </div>

        {/* Pie */}
        <div style={{ marginTop: '16px', borderTop: '1px solid #ddd', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#999' }}>
          <span>Sistema de Trazabilidad — Empacadora de Piña</span>
          <span>Generado: {getCostaRicaDateTimeDisplay('es-CR')}</span>
          <span>Liquidación {rec.codigo || rec.id.substring(0, 8)}</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  );
}
