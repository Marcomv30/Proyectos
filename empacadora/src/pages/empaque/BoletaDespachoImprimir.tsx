import React, { useEffect, useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
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
  material_caja?: { nombre: string } | null;
  material_colilla?: { nombre: string } | null;
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

// ─── Helpers de estilo (deben sobrevivir en impresión) ───────────────────────
const S = {
  tbl:      { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '12px', fontSize: '10px' },
  secTh:    { background: '#1e3a5f', color: '#fff', textAlign: 'center' as const, padding: '5px 8px',
              fontStyle: 'italic' as const, fontWeight: 'bold' as const, fontSize: '12px', border: '1px solid #555' },
  detTh:    { background: '#4472c4', color: '#fff', textAlign: 'center' as const, padding: '4px 6px',
              fontStyle: 'italic' as const, fontWeight: 'bold' as const, border: '1px solid #2d5fa6', fontSize: '10px' },
  detThL:   { background: '#4472c4', color: '#fff', textAlign: 'left' as const,   padding: '4px 8px',
              fontStyle: 'italic' as const, fontWeight: 'bold' as const, border: '1px solid #2d5fa6', fontSize: '10px' },
  lbl:      { padding: '3px 6px', border: '1px solid #ccc', fontStyle: 'italic' as const, color: '#444', whiteSpace: 'nowrap' as const, fontSize: '10px' },
  val:      { padding: '3px 6px', border: '1px solid #ccc', fontSize: '10px' },
  valBold:  { padding: '3px 6px', border: '1px solid #ccc', fontWeight: 'bold' as const, fontSize: '11px' },
  td:       { padding: '3px 6px', border: '1px solid #ccc', fontSize: '10px' },
  tdC:      { padding: '3px 6px', border: '1px solid #ccc', textAlign: 'center' as const, fontSize: '10px' },
  tdR:      { padding: '3px 6px', border: '1px solid #ccc', textAlign: 'right' as const, fontSize: '10px' },
  totalRow: { background: '#dce8f5', fontWeight: 'bold' as const },
  resTh:    { background: '#4472c4', color: '#fff', textAlign: 'center' as const, padding: '4px 6px',
              fontStyle: 'italic' as const, fontWeight: 'bold' as const, border: '1px solid #2d5fa6', fontSize: '10px' },
};

// ─── Componente ───────────────────────────────────────────────────────────────
export default function BoletaDespachoImprimir({ despachoId, onBack }: Props) {
  const empresaId = useEmpresaId();
  const [despacho,  setDespacho]  = useState<any>(null);
  const [boletas,   setBoletas]   = useState<BoletaDet[]>([]);
  const [empConfig, setEmpConfig] = useState<EmpConfig>({});
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: des }, { data: bols }, { data: cfg }] = await Promise.all([
        supabase.from('emp_despachos')
          .select('*, semana:emp_semanas(id,codigo), destino:emp_destinos(id,nombre)')
          .eq('id', despachoId).single(),
        supabase.from('emp_boletas')
          .select('id, numero_paleta, calibre_nombre, marca_nombre, cajas_empacadas, total_frutas, material_caja:emp_materiales!material_caja_id(nombre), material_colilla:emp_materiales!material_colilla_id(nombre)')
          .eq('despacho_id', despachoId)
          .order('numero_paleta', { ascending: false }),   // desc: mayor paleta primero (como el modelo)
        supabase.from('fe_config_empresa')
          .select('nombre_emisor, nombre_comercial, logo_url, nombre_planta')
          .eq('empresa_id', empresaId)
          .maybeSingle(),
      ]);
      setDespacho(des);
      setBoletas((bols as any) || []);
      setEmpConfig((cfg as any) || {});
      setLoading(false);
    }
    load();
  }, [despachoId, empresaId]);

  if (loading) return <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--ink-muted)' }}>Cargando boleta...</div>;
  if (!despacho) return <div className="flex items-center justify-center h-64 text-sm text-red-400">No se encontró el despacho.</div>;

  // ── Totales ───────────────────────────────────────────────────────────────
  const totalFrutas = boletas.reduce((s, b) => s + (b.total_frutas || 0), 0);
  const totalCajas  = boletas.reduce((s, b) => s + b.cajas_empacadas, 0);

  // ── Resumen: pivot por marca+tipo vs tamaño ───────────────────────────────
  // Extraer número y tipo del calibre (ej: "COR 9" → tipo="COR", num=9)
  function parseCalibre(cal?: string): { tipo: string; num: number } {
    const parts = (cal || '').trim().split(/\s+/);
    return { tipo: parts[0] || '', num: parts[1] ? parseInt(parts[1], 10) : 0 };
  }

  const allNums = Array.from(new Set(
    boletas.map(b => parseCalibre(b.calibre_nombre).num).filter(n => n > 0)
  )).sort((a, b) => a - b);

  interface ResRow { marca: string; tipo: string; byNum: Record<number, number>; total: number }
  const resMap: Record<string, ResRow> = {};
  boletas.forEach(b => {
    const { tipo, num } = parseCalibre(b.calibre_nombre);
    const marca = b.marca_nombre || '—';
    const key   = `${marca}||${tipo}`;
    if (!resMap[key]) resMap[key] = { marca, tipo, byNum: {}, total: 0 };
    resMap[key].byNum[num] = (resMap[key].byNum[num] || 0) + 1;
    resMap[key].total += 1;
  });
  const resRows = Object.values(resMap).sort((a, b) => a.marca.localeCompare(b.marca) || a.tipo.localeCompare(b.tipo));

  // ── Datos de encabezado ───────────────────────────────────────────────────
  const empresa   = empConfig.nombre_emisor  || empConfig.nombre_comercial || 'Agropecuaria Vasquez y Zúñiga, S. A.';
  const planta    = empConfig.nombre_planta  || 'PLANTA EMPACADORA';
  // Prioridad: 1) logo_url en BD  2) /logo.png en public/  3) placeholder
  const logoUrl   = empConfig.logo_url || '/logo.png';
  const semCodigo = despacho.semana?.codigo  || '';
  const destNombre= despacho.destino?.nombre || despacho.destino_nombre || '';

  const fmt = (d?: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CR') : '';
  const fechaStr       = fmt(despacho.fecha_apertura);
  const fechaCierreStr = despacho.fecha_cierre
    ? `${fmt(despacho.fecha_cierre)} ${despacho.hora_cierre || ''}`.trim()
    : '';

  return (
    <>
      {/* ── Barra de pantalla (no se imprime) ─────────────────────────────── */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between px-6 py-3"
        style={{ background: 'var(--surface-deep)', borderBottom: '1px solid var(--line)' }}>
        <button onClick={onBack} className="flex items-center gap-2 text-sm hover:text-ink transition-colors" style={{ color: 'var(--ink-muted)' }}>
          <ArrowLeft size={15} /> Volver a despachos
        </button>
        <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Boleta {despacho.codigo} — {despacho.cliente_nombre}
        </span>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 text-sm px-4 py-1.5 rounded font-medium"
          style={{ background: '#1d4ed8', color: '#fff' }}>
          <Printer size={14} /> Imprimir
        </button>
      </div>

      {/* ── Fondo gris (simula hoja en pantalla, no se imprime) ──────────── */}
      <div className="no-print-bg" style={{ background: '#e5e7eb', minHeight: '100vh', padding: '24px 16px' }}>

      {/* ── Documento imprimible ──────────────────────────────────────────── */}
      <div id="boleta-print" style={{
        maxWidth: '860px', margin: '0 auto', padding: '20px',
        fontFamily: 'Arial, sans-serif', color: '#000',
        background: '#ffffff',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      }}>

        {/* Encabezado empresa */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #aaa', marginBottom: '8px' }}>
          <tbody>
            <tr>
              <td style={{ width: '76px', padding: '6px', verticalAlign: 'middle', borderRight: '1px solid #aaa' }}>
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ width: '62px', height: '62px', objectFit: 'contain', borderRadius: '50%' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </td>
              <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '6px', borderRight: '1px solid #aaa' }}>
                <div style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: '14px' }}>{empresa}</div>
                <div style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: '11px', marginTop: '2px' }}>{planta}</div>
              </td>
              <td style={{ textAlign: 'right', verticalAlign: 'middle', padding: '6px', width: '155px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Boleta de Despacho</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#cc0000', marginTop: '2px' }}>
                  No. {despacho.numero ?? (despacho.codigo ? String(despacho.codigo).replace(/\D/g, '') : '—')}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Información de Carga */}
        <table style={S.tbl}>
          <thead>
            <tr><th colSpan={6} style={S.secTh}>Información de Carga</th></tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.lbl}>Semana</td><td style={S.val}>{semCodigo}</td>
              <td style={S.lbl}>Cliente:</td><td style={S.valBold} colSpan={3}>{despacho.cliente_nombre || ''}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Fecha</td><td style={S.val}>{fechaStr}</td>
              <td style={S.lbl}>Destino</td><td style={S.valBold} colSpan={3}>{destNombre}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Hora llegada</td><td style={S.val}>{despacho.hora_apertura || ''}</td>
              <td style={S.lbl}>Contenedor</td><td style={S.val}>{despacho.contenedor || ''}</td>
              <td style={S.lbl}>Tipo Contenedor:</td><td style={S.val}>{despacho.tipo_contenedor || ''}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Hora salida</td><td style={S.val}>{despacho.hora_cierre || ''}</td>
              <td style={S.lbl}>Barco:</td><td style={S.val}>{despacho.barco || ''}</td>
              <td style={S.lbl}>Naviera</td><td style={S.valBold}>{despacho.naviera || ''}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Fecha cierre:</td><td style={S.val}>{fechaCierreStr}</td>
              <td style={S.lbl}>Marchamo llegada:</td><td style={S.val}>{despacho.marchamo_llegada || ''}</td>
              <td style={S.lbl}>Marchamo Salida</td><td style={S.valBold}>{despacho.marchamo_salida || ''}</td>
            </tr>
            <tr>
              <td style={S.lbl}>Cerrado por:</td><td style={S.val}></td>
              <td style={S.lbl}>Termógrafo:</td><td style={S.val}>{despacho.termografo || ''}</td>
              <td style={S.lbl}>Clase Contenedor</td><td style={S.valBold}>{despacho.clase_contenedor || ''}</td>
            </tr>
          </tbody>
        </table>

        {/* Detalle de Empaque */}
        <table style={S.tbl}>
          <thead>
            <tr><th colSpan={7} style={S.secTh}>Detalle de Empaque</th></tr>
            <tr>
              <th style={{ ...S.detTh,  width: '50px'  }}>Paleta</th>
              <th style={{ ...S.detTh,  width: '65px'  }}>Calibre</th>
              <th style={{ ...S.detTh,  width: '70px'  }}>Marca</th>
              <th style={{ ...S.detThL                 }}>Bandeja</th>
              <th style={{ ...S.detThL, width: '130px' }}>Colilla</th>
              <th style={{ ...S.detTh,  width: '45px'  }}>Cajas</th>
              <th style={{ ...S.detTh,  width: '55px'  }}>Frutas</th>
            </tr>
          </thead>
          <tbody>
            {boletas.map((b, i) => (
              <tr key={b.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f5f5' }}>
                <td style={S.tdC}>{b.numero_paleta}</td>
                <td style={S.tdC}>{b.calibre_nombre}</td>
                <td style={S.tdC}>{b.marca_nombre}</td>
                <td style={S.td }>{b.material_caja?.nombre   || ''}</td>
                <td style={S.td }>{b.material_colilla?.nombre || ''}</td>
                <td style={S.tdR}>{b.cajas_empacadas}</td>
                <td style={S.tdR}>{b.total_frutas?.toLocaleString('es-CR')}</td>
              </tr>
            ))}
            <tr style={S.totalRow}>
              <td colSpan={5} style={{ ...S.tdC, fontSize: '12px' }}>
                Total Fruta&nbsp;&nbsp;
                <strong style={{ fontSize: '14px' }}>{totalFrutas.toLocaleString('es-CR')}</strong>
                &nbsp;&nbsp;&nbsp;&nbsp;
                Total Paletas&nbsp;&nbsp;
                <strong style={{ fontSize: '14px' }}>{boletas.length}</strong>
                &nbsp;&nbsp;&nbsp;&nbsp;
                Total Caja&nbsp;&nbsp;
                <strong style={{ fontSize: '14px' }}>{totalCajas.toLocaleString('es-CR')}</strong>
              </td>
              <td style={{ ...S.tdR, fontWeight: 'bold', fontSize: '11px' }}>{totalCajas}</td>
              <td style={{ ...S.tdR, fontWeight: 'bold', fontSize: '11px' }}>{totalFrutas.toLocaleString('es-CR')}</td>
            </tr>
          </tbody>
        </table>

        {/* Resumen pivot por marca/tipo/calibre */}
        <table style={S.tbl}>
          <thead>
            <tr><th colSpan={allNums.length + 3} style={S.secTh}>Resumen</th></tr>
            <tr>
              <th style={{ ...S.resTh, textAlign: 'left' as const, width: '120px' }}>Detalle</th>
              <th style={{ ...S.resTh, width: '50px' }}>Tipo</th>
              {allNums.map(n => <th key={n} style={{ ...S.resTh, width: '40px' }}>{n}</th>)}
              <th style={{ ...S.resTh, width: '50px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {resRows.map((r, i) => (
              <tr key={`${r.marca}|${r.tipo}`} style={{ background: i % 2 === 0 ? '#fff' : '#f5f5f5' }}>
                <td style={S.td }>{r.marca}</td>
                <td style={S.tdC}>{r.tipo}</td>
                {allNums.map(n => (
                  <td key={n} style={S.tdC}>{r.byNum[n] || ''}</td>
                ))}
                <td style={{ ...S.tdC, fontWeight: 'bold' }}>{r.total}</td>
              </tr>
            ))}
            {/* Fila total general */}
            {resRows.length > 0 && (
              <tr style={S.totalRow}>
                <td colSpan={2} style={{ ...S.td, fontWeight: 'bold' }}>TOTAL</td>
                {allNums.map(n => (
                  <td key={n} style={{ ...S.tdC, fontWeight: 'bold' }}>
                    {resRows.reduce((s, r) => s + (r.byNum[n] || 0), 0) || ''}
                  </td>
                ))}
                <td style={{ ...S.tdC, fontWeight: 'bold' }}>{boletas.length}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pie */}
        <div style={{ border: '1px solid #ccc', padding: '16px 10px', textAlign: 'center', marginTop: '8px', minHeight: '48px' }}>
          <em>Hecho por: {despacho.usuario_id || 'Marco'}</em>
        </div>
      </div>{/* fin boleta-print */}
      </div>{/* fin fondo gris */}

      <style>{`
        /* ── Pantalla: ocultar scrollbar de la app debajo ── */
        .no-print-bg { isolation: isolate; }

        /* ── Impresión ── */
        @page {
          size: Letter portrait;
          margin: 8mm 10mm;
        }
        @media print {
          /* Ocultar toda la UI de la app */
          .no-print        { display: none !important; }
          .no-print-bg     { background: none !important; padding: 0 !important; min-height: auto !important; }
          nav, aside, header,
          [class*="sidebar"], [class*="Sidebar"],
          [class*="topbar"], [class*="layout"]  { display: none !important; }

          /* Forzar fondo blanco en TODO */
          html, body { background: #ffffff !important; color: #000 !important; margin: 0 !important; padding: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          /* Documento al 100% de la página */
          #boleta-print {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            font-size: 8.5px !important;
          }

          /* Tablas más compactas en impresión */
          #boleta-print table  { font-size: 8.5px !important; margin-bottom: 5px !important; }
          #boleta-print td,
          #boleta-print th     { padding: 2px 4px !important; }
          #boleta-print .ph    { padding: 3px 5px !important; }

          /* Control de saltos de página */
          table { page-break-inside: auto; }
          tr    { page-break-inside: avoid; page-break-after: auto; }
        }
      `}</style>
    </>
  );
}
