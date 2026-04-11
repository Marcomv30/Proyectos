import React, { useEffect, useState } from 'react';
import { Printer, ArrowLeft, Mail, X, Send, Loader } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface BoletaDet {
  id: string;
  numero_paleta: number;
  calibre_nombre?: string;
  marca_nombre?: string;
  cajas_empacadas: number;
  total_frutas?: number;
  tarina?: string;
}

interface EmpConfig {
  nombre_emisor?: string;
  nombre_comercial?: string;
  logo_url?: string;
  nombre_planta?: string;
}

interface Props {
  despachoId: string;
  onBack: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseCalibreNum(cal?: string): number {
  const m = (cal || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function abrevTarina(t?: string): string {
  if (!t) return '';
  const u = t.toUpperCase();
  if (u.startsWith('EUR')) return 'EUR';
  if (u.startsWith('AMER')) return 'AMER';
  return t.substring(0, 4).toUpperCase();
}

// ─── Estilos inline (sobreviven en impresión) ─────────────────────────────────
const S = {
  tbl:   { width: '100%', borderCollapse: 'collapse' as const, fontSize: '9px' },
  secTh: { background: '#1e3a5f', color: '#fff', textAlign: 'center' as const,
            padding: '3px 4px', fontWeight: 'bold' as const, fontSize: '9px',
            border: '1px solid #333', fontStyle: 'italic' as const },
  th:    { background: '#4472c4', color: '#fff', textAlign: 'center' as const,
            padding: '2px 3px', fontWeight: 'bold' as const, fontSize: '8px',
            border: '1px solid #2d5fa6', fontStyle: 'italic' as const },
  thL:   { background: '#4472c4', color: '#fff', textAlign: 'left' as const,
            padding: '2px 3px', fontWeight: 'bold' as const, fontSize: '8px',
            border: '1px solid #2d5fa6', fontStyle: 'italic' as const },
  td:    { padding: '1px 3px', border: '1px solid #ccc', fontSize: '8px' },
  tdC:   { padding: '1px 3px', border: '1px solid #ccc', textAlign: 'center' as const, fontSize: '8px' },
  tdR:   { padding: '1px 3px', border: '1px solid #ccc', textAlign: 'right' as const, fontSize: '8px' },
  lbl:   { padding: '1px 4px', border: '1px solid #ccc', fontStyle: 'italic' as const,
            color: '#444', whiteSpace: 'nowrap' as const, fontSize: '8px' },
  val:   { padding: '1px 4px', border: '1px solid #ccc', fontSize: '8px' },
  valB:  { padding: '1px 4px', border: '1px solid #ccc', fontWeight: 'bold' as const, fontSize: '9px' },
  tot:   { background: '#dce8f5', fontWeight: 'bold' as const },
};

// ─── Componente ───────────────────────────────────────────────────────────────
export default function GuiaDespachoImprimir({ despachoId, onBack }: Props) {
  const empresaId = useEmpresaId();
  const [despacho,  setDespacho]  = useState<any>(null);
  const [boletas,   setBoletas]   = useState<BoletaDet[]>([]);
  const [empConfig, setEmpConfig] = useState<EmpConfig>({});
  const [loading,   setLoading]   = useState(true);

  // ── Email modal ─────────────────────────────────────────────────────────────
  const [showEmail,   setShowEmail]   = useState(false);
  const [emailTo,     setEmailTo]     = useState('');
  const [emailNote,   setEmailNote]   = useState('');
  const [sending,     setSending]     = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: des }, { data: bols }, { data: cfg }] = await Promise.all([
        supabase.from('emp_despachos')
          .select('*, semana:emp_semanas(id,codigo), destino:emp_destinos(id,nombre)')
          .eq('id', despachoId).single(),
        supabase.from('emp_boletas')
          .select('id, numero_paleta, calibre_nombre, marca_nombre, cajas_empacadas, total_frutas, tarina')
          .eq('despacho_id', despachoId)
          .order('marca_nombre', { ascending: true }),
        supabase.from('fe_config_empresa')
          .select('nombre_emisor, nombre_comercial, logo_url, nombre_planta')
          .eq('empresa_id', empresaId)
          .maybeSingle(),
      ]);
      setDespacho(des);
      // Ordenar: marca ASC, calibre num ASC, paleta ASC
      const sorted = ((bols as any) || []).sort((a: BoletaDet, b: BoletaDet) => {
        const ma = (a.marca_nombre || '').localeCompare(b.marca_nombre || '');
        if (ma !== 0) return ma;
        const ca = parseCalibreNum(a.calibre_nombre) - parseCalibreNum(b.calibre_nombre);
        if (ca !== 0) return ca;
        return a.numero_paleta - b.numero_paleta;
      });
      setBoletas(sorted);
      setEmpConfig((cfg as any) || {});
      setLoading(false);
    }
    load();
  }, [despachoId, empresaId]);

  if (loading) return <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--ink-muted)' }}>Cargando guía...</div>;
  if (!despacho) return <div className="flex items-center justify-center h-64 text-sm text-red-400">No se encontró el despacho.</div>;

  async function handleSendEmail() {
    if (!emailTo.trim()) return;
    setSending(true); setEmailResult(null);
    const el = document.getElementById('guia-print');
    const htmlContent = el ? el.innerHTML : '';
    try {
      const resp = await fetch('/api/empacadora/email/guia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo.trim(),
          html_content: htmlContent,
          guia_numero: guiaNum,
          empresa_nombre: empresa,
          subject: `Guía de Despacho ${guiaNum}${emailNote ? ` — ${emailNote}` : ''}`,
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        setEmailResult({ ok: true, msg: `Enviado correctamente a ${emailTo}` });
        setEmailTo(''); setEmailNote('');
      } else {
        setEmailResult({ ok: false, msg: data.error || 'Error al enviar' });
      }
    } catch {
      setEmailResult({ ok: false, msg: 'No se pudo conectar con el servidor' });
    }
    setSending(false);
  }

  // ── Datos empresa ─────────────────────────────────────────────────────────
  const empresa = empConfig.nombre_emisor || empConfig.nombre_comercial || 'Agropecuaria Vasquez y Zúñiga, S. A.';
  const planta  = empConfig.nombre_planta || 'PLANTA EMPACADORA';
  const logoUrl = empConfig.logo_url || '/logo.png';

  const semCodigo  = despacho.semana?.codigo   || '';
  const destNombre = despacho.destino?.nombre  || despacho.destino_nombre || '';
  const fmt = (d?: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const fechaStr = fmt(despacho.fecha_apertura);
  const guiaNum  = despacho.codigo || despacho.numero || '—';

  // ── División en dos columnas (sin renglones vacíos) ───────────────────────
  const mitad  = Math.ceil(boletas.length / 2);
  const colA   = boletas.slice(0, mitad);
  const colB   = boletas.slice(mitad);
  const filas  = Math.max(colA.length, colB.length);

  // ── Calibres únicos presentes ─────────────────────────────────────────────
  const calNums = Array.from(new Set(boletas.map(b => parseCalibreNum(b.calibre_nombre)).filter(n => n > 0))).sort((a, b) => a - b);

  // ── Marcas únicas presentes ───────────────────────────────────────────────
  const marcas = Array.from(new Set(boletas.map(b => b.marca_nombre || '—'))).sort();

  // ── Pivot: paletas y cajas por marca/calibre ──────────────────────────────
  interface MarcaPivot { paletas: Record<number, number>; cajas: Record<number, number>; totalPal: number; totalCaj: number }
  const pivot: Record<string, MarcaPivot> = {};
  marcas.forEach(m => { pivot[m] = { paletas: {}, cajas: {}, totalPal: 0, totalCaj: 0 }; });
  boletas.forEach(b => {
    const m   = b.marca_nombre || '—';
    const num = parseCalibreNum(b.calibre_nombre);
    if (!num) return;
    pivot[m].paletas[num] = (pivot[m].paletas[num] || 0) + 1;
    pivot[m].cajas[num]   = (pivot[m].cajas[num]   || 0) + b.cajas_empacadas;
    pivot[m].totalPal     += 1;
    pivot[m].totalCaj     += b.cajas_empacadas;
  });

  // ── Pivot frutas por marca/calibre (esquina inferior) ────────────────────
  const frutasMap: Record<string, Record<number, number>> = {};
  marcas.forEach(m => { frutasMap[m] = {}; });
  boletas.forEach(b => {
    const m   = b.marca_nombre || '—';
    const num = parseCalibreNum(b.calibre_nombre);
    if (!num) return;
    frutasMap[m][num] = (frutasMap[m][num] || 0) + (b.total_frutas || 0);
  });

  const totalCajas  = boletas.reduce((s, b) => s + b.cajas_empacadas, 0);
  const totalFrutas = boletas.reduce((s, b) => s + (b.total_frutas || 0), 0);

  // ─── Celda pallet helper ──────────────────────────────────────────────────
  const PalletCells = ({ b }: { b?: BoletaDet }) => b ? (
    <>
      <td style={{ ...S.tdC, width: '30px' }}>{parseCalibreNum(b.calibre_nombre)}</td>
      <td style={{ ...S.tdC, width: '38px' }}>{b.numero_paleta}</td>
      <td style={{ ...S.tdC, width: '34px' }}>{b.cajas_empacadas}</td>
      <td style={{ ...S.tdC, width: '46px' }}>{b.marca_nombre}</td>
      <td style={{ ...S.tdC, width: '34px' }}>{abrevTarina(b.tarina)}</td>
    </>
  ) : (
    <>
      <td style={S.tdC}></td>
      <td style={S.tdC}></td>
      <td style={S.tdC}></td>
      <td style={S.tdC}></td>
      <td style={S.tdC}></td>
    </>
  );

  const CheckRow = ({ label }: { label: string }) => (
    <tr>
      <td style={S.td}>{label}</td>
      <td style={{ ...S.tdC, width: '28px' }}></td>
      <td style={{ ...S.tdC, width: '28px' }}></td>
    </tr>
  );

  return (
    <>
      {/* Barra de pantalla (no se imprime) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between px-6 py-3"
        style={{ background: 'var(--surface-deep)', borderBottom: '1px solid var(--line)' }}>
        <button onClick={onBack} className="flex items-center gap-2 text-sm hover:text-ink transition-colors" style={{ color: 'var(--ink-muted)' }}>
          <ArrowLeft size={15} /> Volver a despachos
        </button>
        <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Guía {guiaNum} — {despacho.cliente_nombre}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowEmail(true); setEmailResult(null); }}
            className="flex items-center gap-2 text-sm px-4 py-1.5 rounded font-medium"
            style={{ background: '#0f766e', color: '#fff' }}>
            <Mail size={14} /> Enviar
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 text-sm px-4 py-1.5 rounded font-medium"
            style={{ background: '#1d4ed8', color: '#fff' }}>
            <Printer size={14} /> Imprimir
          </button>
        </div>
      </div>

      {/* ── Modal email ── */}
      {showEmail && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md shadow-2xl"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg" style={{ background: '#0f766e22' }}>
                  <Mail size={16} style={{ color: '#0f766e' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Enviar por correo</p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Guía {guiaNum} — {despacho.cliente_nombre}</p>
                </div>
              </div>
              <button onClick={() => setShowEmail(false)} style={{ color: 'var(--ink-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Campos */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
                  Destinatario(s) *
                </label>
                <input
                  type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)}
                  placeholder="cliente@ejemplo.com, otro@ejemplo.com"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)', outline: 'none' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Separe múltiples correos con coma</p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
                  Nota en el asunto (opcional)
                </label>
                <input
                  type="text" value={emailNote} onChange={e => setEmailNote(e.target.value)}
                  placeholder="ej: favor confirmar recibo"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)', outline: 'none' }}
                />
              </div>
            </div>

            {/* Resultado */}
            {emailResult && (
              <div className="mt-3 px-3 py-2 rounded-lg text-sm"
                style={{
                  background: emailResult.ok ? '#0f766e18' : '#dc262618',
                  border: `1px solid ${emailResult.ok ? '#0f766e44' : '#dc262644'}`,
                  color: emailResult.ok ? '#0f766e' : '#dc2626',
                }}>
                {emailResult.msg}
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowEmail(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--surface-overlay)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
                Cancelar
              </button>
              <button onClick={handleSendEmail} disabled={sending || !emailTo.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: '#0f766e', color: '#fff' }}>
                {sending ? <><Loader size={14} className="animate-spin" /> Enviando...</> : <><Send size={14} /> Enviar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fondo gris */}
      <div className="no-print-bg" style={{ background: '#e5e7eb', minHeight: '100vh', padding: '24px 16px' }}>

      {/* Documento imprimible */}
      <div id="guia-print" style={{
        maxWidth: '700px', margin: '0 auto', padding: '14px',
        fontFamily: 'Arial, sans-serif', color: '#000', background: '#fff',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      }}>

        {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #aaa', marginBottom: '8px' }}>
          <tbody>
            <tr>
              <td style={{ width: '72px', padding: '5px', verticalAlign: 'middle', borderRight: '1px solid #aaa' }}>
                <img src={logoUrl} alt="Logo"
                  style={{ width: '58px', height: '58px', objectFit: 'contain', borderRadius: '50%' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </td>
              <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '5px', borderRight: '1px solid #aaa' }}>
                <div style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: '13px' }}>{empresa}</div>
                <div style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: '10px', marginTop: '2px' }}>{planta}</div>
              </td>
              <td style={{ textAlign: 'right', verticalAlign: 'middle', padding: '5px', width: '140px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Guia de Despacho</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#cc0000', marginTop: '2px' }}>
                  {guiaNum}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── TABLA PALLETS + INFO CARGA (lado a lado) ───────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px', fontSize: '9px' }}>
          <tbody>
            <tr style={{ verticalAlign: 'top' }}>

              {/* Columna izquierda: tabla de pallets */}
              <td style={{ width: '58%', padding: 0, verticalAlign: 'top' }}>
                <table style={{ ...S.tbl, height: '100%' }}>
                  <thead>
                    <tr>
                      <th colSpan={10} style={S.secTh}>Pallets Despachados</th>
                    </tr>
                    <tr>
                      <th style={{ ...S.th, width: '30px' }}>TAM</th>
                      <th style={{ ...S.th, width: '38px' }}>Pallet</th>
                      <th style={{ ...S.th, width: '34px' }}>Cajas</th>
                      <th style={{ ...S.th, width: '46px' }}>MARCA</th>
                      <th style={{ ...S.th, width: '34px' }}>TARIMA</th>
                      <th style={{ ...S.th, width: '6px', background: '#888', border: '1px solid #555' }}></th>
                      <th style={{ ...S.th, width: '30px' }}>TAM</th>
                      <th style={{ ...S.th, width: '38px' }}>Pallet</th>
                      <th style={{ ...S.th, width: '34px' }}>Cajas</th>
                      <th style={{ ...S.th, width: '46px' }}>MARCA</th>
                      <th style={{ ...S.th, width: '34px' }}>TARIMA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: filas }).map((_, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f5f5f5' }}>
                        <PalletCells b={colA[i]} />
                        <td style={{ ...S.tdC, background: '#ddd', width: '6px', padding: 0 }}></td>
                        <PalletCells b={colB[i]} />
                      </tr>
                    ))}
                    {/* Fila totales */}
                    <tr style={S.tot}>
                      <td colSpan={4} style={{ ...S.td, fontWeight: 'bold', textAlign: 'right' }}>Total cajas:</td>
                      <td style={{ ...S.tdC, fontWeight: 'bold' }}>{totalCajas}</td>
                      <td style={{ background: '#ddd', padding: 0 }}></td>
                      <td colSpan={4} style={{ ...S.td, fontWeight: 'bold', textAlign: 'right' }}>Total paletas:</td>
                      <td style={{ ...S.tdC, fontWeight: 'bold' }}>{boletas.length}</td>
                    </tr>
                  </tbody>
                </table>
              </td>

              {/* Columna derecha: info de carga */}
              <td style={{ width: '2%', padding: '0 4px' }}></td>
              <td style={{ width: '40%', padding: 0, verticalAlign: 'top' }}>
                <table style={{ ...S.tbl, marginBottom: '6px' }}>
                  <thead>
                    <tr><th colSpan={2} style={S.secTh}>Información de Carga</th></tr>
                  </thead>
                  <tbody>
                    <tr><td style={S.lbl}>Cliente:</td><td style={S.valB}>{despacho.cliente_nombre || ''}</td></tr>
                    <tr><td style={S.lbl}>Semana:</td><td style={S.val}>{semCodigo}</td></tr>
                    <tr><td style={S.lbl}>Fecha:</td><td style={S.val}>{fechaStr}</td></tr>
                    <tr><td style={S.lbl}>Contenedor:</td><td style={S.valB}>{despacho.contenedor || ''}</td></tr>
                    <tr>
                      <td style={S.lbl}>Tipo:</td>
                      <td style={S.val}>
                        {[despacho.clase_contenedor, despacho.tipo_contenedor].filter(Boolean).join(' — ')}
                      </td>
                    </tr>
                    <tr><td style={S.lbl}>Barco:</td><td style={S.val}>{despacho.barco || ''}</td></tr>
                    <tr><td style={S.lbl}>Naviera:</td><td style={S.valB}>{despacho.naviera || ''}</td></tr>
                    <tr><td style={S.lbl}>Destino:</td><td style={S.valB}>{destNombre}</td></tr>
                    <tr><td style={S.lbl}>Marchamo llegada:</td><td style={S.val}>{despacho.marchamo_llegada || ''}</td></tr>
                    <tr><td style={S.lbl}>Marchamo salida:</td><td style={S.valB}>{despacho.marchamo_salida || ''}</td></tr>
                    <tr><td style={S.lbl}>Termógrafo:</td><td style={S.val}>{despacho.termografo || ''}</td></tr>
                    <tr><td style={S.lbl}>Inicio de carga:</td><td style={S.val}>{despacho.hora_apertura || ''}</td></tr>
                    <tr><td style={S.lbl}>Fin de carga:</td><td style={S.val}>{despacho.hora_cierre || ''}</td></tr>
                    <tr><td style={S.lbl}>Inspector:</td><td style={S.val}>&nbsp;</td></tr>
                  </tbody>
                </table>

                {/* NOTA */}
                <table style={{ ...S.tbl, marginBottom: '6px' }}>
                  <thead>
                    <tr><th colSpan={2} style={S.secTh}>NOTA</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ ...S.td, height: '36px', verticalAlign: 'top' }}>
                        {despacho.notas || ''}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Fecha/hora llegada y salida */}
                <table style={S.tbl}>
                  <tbody>
                    <tr>
                      <td style={S.lbl}>Fecha y hora de llegada:</td>
                      <td style={S.val}>{despacho.fecha_apertura ? new Date(despacho.fecha_apertura + 'T12:00:00').toLocaleDateString('es-CR') : ''}</td>
                      <td style={S.val}>{despacho.hora_apertura || ''}</td>
                    </tr>
                    <tr>
                      <td style={S.lbl}>Fecha y hora de salida:</td>
                      <td style={S.val}>{despacho.fecha_cierre  ? new Date(despacho.fecha_cierre  + 'T12:00:00').toLocaleDateString('es-CR') : ''}</td>
                      <td style={S.val}>{despacho.hora_cierre   || ''}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── RESUMEN: PALETAS Y CAJAS POR MARCA/CALIBRE ─────────────────── */}
        <table style={{ ...S.tbl, marginBottom: '6px' }}>
          <thead>
            <tr><th colSpan={calNums.length + 3} style={S.secTh}>Resumen de Exportación</th></tr>
            <tr>
              <th style={{ ...S.thL, width: '80px' }}>Marca</th>
              <th style={{ ...S.thL, width: '120px' }}>Detalle</th>
              {calNums.map(n => <th key={n} style={{ ...S.th, width: '40px' }}>{n}</th>)}
              <th style={{ ...S.th, width: '50px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {marcas.map((m, mi) => (
              <React.Fragment key={m}>
                <tr style={{ background: mi % 2 === 0 ? '#fff' : '#f0f4ff' }}>
                  <td rowSpan={2} style={{ ...S.tdC, fontWeight: 'bold', verticalAlign: 'middle' }}>{m}</td>
                  <td style={{ ...S.td, fontStyle: 'italic' }}>Paletas exportadas</td>
                  {calNums.map(n => <td key={n} style={S.tdC}>{pivot[m].paletas[n] || ''}</td>)}
                  <td style={{ ...S.tdC, fontWeight: 'bold' }}>{pivot[m].totalPal}</td>
                </tr>
                <tr style={{ background: mi % 2 === 0 ? '#f9f9f9' : '#e8ecff' }}>
                  <td style={{ ...S.td, fontStyle: 'italic' }}>Cajas exportadas</td>
                  {calNums.map(n => <td key={n} style={S.tdC}>{pivot[m].cajas[n] || ''}</td>)}
                  <td style={{ ...S.tdC, fontWeight: 'bold' }}>{pivot[m].totalCaj}</td>
                </tr>
              </React.Fragment>
            ))}
            {/* Total general */}
            <tr style={S.tot}>
              <td colSpan={2} style={{ ...S.td, fontWeight: 'bold' }}>TOTAL GENERAL</td>
              {calNums.map(n => (
                <td key={n} style={{ ...S.tdC, fontWeight: 'bold' }}>
                  {marcas.reduce((s, m) => s + (pivot[m].cajas[n] || 0), 0) || ''}
                </td>
              ))}
              <td style={{ ...S.tdC, fontWeight: 'bold' }}>{totalCajas}</td>
            </tr>
          </tbody>
        </table>

        {/* ── CHEQUEO + MATRIZ FRUTAS ─────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px', fontSize: '9px' }}>
          <tbody>
            <tr style={{ verticalAlign: 'top' }}>

              {/* Checklist */}
              <td style={{ width: '50%', padding: 0, verticalAlign: 'top' }}>
                <table style={S.tbl}>
                  <thead>
                    <tr>
                      <th style={{ ...S.thL }}>Chequeo</th>
                      <th style={{ ...S.th, width: '28px' }}>Sí</th>
                      <th style={{ ...S.th, width: '28px' }}>No</th>
                    </tr>
                  </thead>
                  <tbody>
                    <CheckRow label="Interior del contenedor limpio" />
                    <CheckRow label="Interior del contenedor limpiado en seco" />
                    <CheckRow label="Interior del contenedor se lavó" />
                    <CheckRow label="Revisión de puntos de drenaje" />
                    <CheckRow label="Se colocó termógrafo" />
                    <CheckRow label="Se colocó marchamo" />
                    <tr>
                      <td colSpan={2} style={S.lbl}>Temperatura interior:</td>
                      <td style={S.val}></td>
                    </tr>
                  </tbody>
                </table>
              </td>

              <td style={{ width: '4%', padding: '0 4px' }}></td>

              {/* Matriz frutas por calibre/marca */}
              <td style={{ width: '46%', padding: 0, verticalAlign: 'top' }}>
                <table style={S.tbl}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width: '50px' }}>Calibre</th>
                      {marcas.map(m => <th key={m} style={S.th}>{m}</th>)}
                      <th style={{ ...S.th, width: '55px' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calNums.map((n, i) => {
                      const tot = marcas.reduce((s, m) => s + (frutasMap[m][n] || 0), 0);
                      return (
                        <tr key={n} style={{ background: i % 2 === 0 ? '#fff' : '#f5f5f5' }}>
                          <td style={S.tdC}>{n}</td>
                          {marcas.map(m => <td key={m} style={S.tdC}>{frutasMap[m][n]?.toLocaleString('es-CR') || ''}</td>)}
                          <td style={{ ...S.tdC, fontWeight: 'bold' }}>{tot ? tot.toLocaleString('es-CR') : ''}</td>
                        </tr>
                      );
                    })}
                    <tr style={S.tot}>
                      <td style={{ ...S.tdC, fontWeight: 'bold' }}>Total</td>
                      {marcas.map(m => (
                        <td key={m} style={{ ...S.tdC, fontWeight: 'bold' }}>
                          {Object.values(frutasMap[m]).reduce((s, v) => s + v, 0).toLocaleString('es-CR')}
                        </td>
                      ))}
                      <td style={{ ...S.tdC, fontWeight: 'bold' }}>{totalFrutas.toLocaleString('es-CR')}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── PIE ────────────────────────────────────────────────────────── */}
        <table style={{ ...S.tbl, marginTop: '4px' }}>
          <tbody>
            <tr>
              <td style={S.lbl}>Inspector responsable:</td>
              <td style={{ ...S.val, width: '35%' }}>&nbsp;</td>
              <td style={S.lbl}>Semana:</td>
              <td style={S.val}>{semCodigo}</td>
              <td style={S.lbl}>Fecha:</td>
              <td style={S.val}>{despacho.fecha_apertura ? new Date(despacho.fecha_apertura + 'T12:00:00').toLocaleDateString('es-CR') : ''}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Chofer:</td>
              <td style={S.val}>&nbsp;</td>
              <td style={S.lbl}>Placa:</td>
              <td style={S.val}>&nbsp;</td>
              <td style={S.lbl}>Cédula:</td>
              <td style={S.val}>&nbsp;</td>
            </tr>
            <tr>
              <td style={S.lbl}>Revisado por:</td>
              <td colSpan={3} style={S.val}>&nbsp;</td>
              <td style={S.lbl}>Firma chofer:</td>
              <td style={S.val}>&nbsp;</td>
            </tr>
          </tbody>
        </table>

      </div>{/* fin guia-print */}
      </div>{/* fin fondo gris */}

      <style>{`
        .no-print-bg { isolation: isolate; }
        @page {
          size: Letter portrait;
          margin: 12mm 12mm;
        }
        @media print {
          .no-print        { display: none !important; }
          .no-print-bg     { background: none !important; padding: 0 !important; min-height: auto !important; }
          nav, aside, header,
          [class*="sidebar"], [class*="Sidebar"],
          [class*="topbar"], [class*="layout"] { display: none !important; }
          html, body { background: #ffffff !important; color: #000 !important; margin: 0 !important; padding: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          #guia-print {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            font-size: 7px !important;
          }
          #guia-print table  { font-size: 7px !important; margin-bottom: 3px !important; }
          #guia-print td,
          #guia-print th     { padding: 1px 3px !important; }
          table { page-break-inside: auto; }
          tr    { page-break-inside: avoid; page-break-after: auto; }
        }
      `}</style>
    </>
  );
}
