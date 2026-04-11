import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Printer, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';

type BoletaEtiqueta = {
  id: string;
  numero_paleta: number;
  fecha: string;
  cajas_empacadas: number;
  calibre_nombre?: string | null;
  marca_nombre?: string | null;
  frutas_por_caja?: number | null;
  total_frutas?: number | null;
  tarina?: string | null;
  barcode_cliente?: string | null;
  trazabilidad?: string | null;
  semana?: { id: string; codigo?: string | null; semana?: number | null } | null;
  despacho?: {
    id: string;
    codigo?: string | null;
    cliente_nombre?: string | null;
    codigo_exportador?: string | null;
    ggn_global_gap?: string | null;
  } | null;
  programa?: {
    id: string;
    codigo?: string | null;
    cliente_nombre?: string | null;
  } | null;
};

type EmpConfig = {
  nombre_emisor?: string | null;
  nombre_comercial?: string | null;
  nombre_planta?: string | null;
  codigo_exportador_default?: string | null;
  ggn_global_gap_default?: string | null;
};

type Props = {
  boletaId: string;
  onBack: () => void;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

const LABEL_WIDTH_MM = 32;
const LABEL_HEIGHT_MM = 23;

function digitsOnly(value?: string | null) {
  return (value || '').replace(/\D+/g, '');
}

function alphaNumOnly(value?: string | null) {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function resolveExporterRaw(boleta: BoletaEtiqueta, config?: EmpConfig) {
  return (boleta.despacho?.codigo_exportador || config?.codigo_exportador_default || '').trim().toUpperCase();
}

function padLast(value: string, size: number, fill = '0') {
  const clean = value || '';
  return clean.length >= size ? clean.slice(-size) : clean.padStart(size, fill);
}

function resolveWeek2(boleta: BoletaEtiqueta) {
  if (boleta.semana?.semana) return String(boleta.semana.semana).padStart(2, '0');
  const fromCodigo = digitsOnly(boleta.semana?.codigo || '').slice(0, 2);
  if (fromCodigo.length === 2) return fromCodigo;
  const date = new Date(`${boleta.fecha}T12:00:00`);
  const day = date.getUTCDay() || 7;
  const thu = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 4 - day));
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return String(week).padStart(2, '0');
}

function resolveExporter4(boleta: BoletaEtiqueta, config?: EmpConfig) {
  const base = resolveExporterRaw(boleta, config);
  const raw = /[A-Z]/.test(base) ? alphaNumOnly(base) : (digitsOnly(base) || alphaNumOnly(base));
  return padLast(raw, 4);
}

function resolveDay1(dateStr: string) {
  return String(new Date(`${dateStr}T12:00:00`).getDate()).slice(-1);
}

function resolvePallet2(numeroPaleta: number) {
  return padLast(String(numeroPaleta || ''), 2);
}

function resolveBarcode6(barcode?: string | null) {
  return padLast(digitsOnly(barcode), 6);
}

function resolveGgn(boleta: BoletaEtiqueta, config?: EmpConfig) {
  const clean = digitsOnly(boleta.despacho?.ggn_global_gap || config?.ggn_global_gap_default);
  return clean || 'SIN_GGN';
}

function buildLabelLines(boleta: BoletaEtiqueta, config?: EmpConfig) {
  const exporterRaw = resolveExporterRaw(boleta, config);
  const exporter4 = resolveExporter4(boleta, config);
  const line1 = `L${resolveWeek2(boleta)}${exporter4}${resolveDay1(boleta.fecha)}${resolvePallet2(boleta.numero_paleta)}`;
  const line2 = resolveBarcode6(boleta.barcode_cliente);
  const exporterLabel = exporterRaw || exporter4;
  const line3 = `EXP: ${exporterLabel} // EMP: ${exporterLabel}`;
  const line4 = `GGN ${resolveGgn(boleta, config)}`;
  return { line1, line2, line3, line4, exporter4, exporterLabel };
}

function warningList(boleta: BoletaEtiqueta, config?: EmpConfig) {
  const warnings: string[] = [];
  if (!boleta.barcode_cliente) warnings.push('La paleta no tiene Codigo de barras cliente.');
  if (!boleta.despacho?.codigo_exportador && !config?.codigo_exportador_default) warnings.push('La paleta no tiene Codigo exportador en despacho ni en configuracion.');
  if (!boleta.despacho?.ggn_global_gap && !config?.ggn_global_gap_default) warnings.push('La paleta no tiene GGN en despacho ni en configuracion.');
  return warnings;
}

export default function EtiquetaPaletaImprimir({ boletaId, onBack }: Props) {
  const empresaId = useEmpresaId();
  const [boleta, setBoleta] = useState<BoletaEtiqueta | null>(null);
  const [empConfig, setEmpConfig] = useState<EmpConfig>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: bol }] = await Promise.all([
        supabase
          .from('emp_boletas')
          .select(`
            id,
            numero_paleta,
            fecha,
            cajas_empacadas,
            calibre_nombre,
            marca_nombre,
            frutas_por_caja,
            total_frutas,
            tarina,
            barcode_cliente,
            trazabilidad,
            semana:emp_semanas(id,codigo,semana),
            despacho:emp_despachos(id,codigo,cliente_nombre,codigo_exportador,ggn_global_gap),
            programa:emp_programas(id,codigo,cliente_nombre)
          `)
          .eq('id', boletaId)
          .maybeSingle(),
      ]);
      let cfg: any = null;
      const cfgResult = await supabase
        .from('fe_config_empresa')
        .select('nombre_emisor,nombre_comercial,nombre_planta,codigo_exportador_default,ggn_global_gap_default')
        .eq('empresa_id', empresaId)
        .maybeSingle();
      if (cfgResult.error && /codigo_exportador_default|ggn_global_gap_default/i.test(cfgResult.error.message || '')) {
        const fallback = await supabase
          .from('fe_config_empresa')
          .select('nombre_emisor,nombre_comercial,nombre_planta')
          .eq('empresa_id', empresaId)
          .maybeSingle();
        cfg = fallback.data;
      } else {
        cfg = cfgResult.data;
      }
      const normalized = bol
        ? ({
            ...(bol as any),
            semana: firstOf((bol as any).semana),
            despacho: firstOf((bol as any).despacho),
            programa: firstOf((bol as any).programa),
          } as BoletaEtiqueta)
        : null;
      setBoleta(normalized);
      setEmpConfig((cfg as EmpConfig) || {});
      setLoading(false);
    }
    load();
  }, [boletaId, empresaId]);

  const empresa = empConfig.nombre_emisor || empConfig.nombre_comercial || 'Empresa';
  const planta = empConfig.nombre_planta || 'Planta';

  const lines = useMemo(() => (boleta ? buildLabelLines(boleta, empConfig) : null), [boleta, empConfig]);
  const warnings = useMemo(() => (boleta ? warningList(boleta, empConfig) : []), [boleta, empConfig]);
  const copies = Math.max(1, Number(boleta?.cajas_empacadas || 1));

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--ink-muted)' }}>Cargando etiqueta...</div>;
  }

  if (!boleta || !lines) {
    return <div className="flex items-center justify-center h-64 text-sm text-red-400">No se encontro la paleta.</div>;
  }

  return (
    <>
      <div
        className="no-print sticky top-0 z-10 flex items-center justify-between px-6 py-3"
        style={{ background: 'var(--surface-deep)', borderBottom: '1px solid var(--line)' }}
      >
        <button onClick={onBack} className="flex items-center gap-2 text-sm hover:text-ink transition-colors" style={{ color: 'var(--ink-muted)' }}>
          <ArrowLeft size={15} /> Volver a paletas
        </button>
        <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Etiqueta R23 - Paleta #{boleta.numero_paleta}
        </span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 text-sm px-4 py-1.5 rounded font-medium"
          style={{ background: '#1d4ed8', color: '#fff' }}
        >
          <Printer size={14} /> Imprimir {copies} etiqueta{copies === 1 ? '' : 's'}
        </button>
      </div>

      <div className="mx-auto max-w-[1180px] p-6 print:p-0">
        <style>{`
          @page { margin: 6mm; }
          @media print {
            body { background: #fff !important; }
            .no-print { display: none !important; }
            .r23-sheet { padding: 0 !important; }
          }
        `}</style>

        <div className="no-print space-y-5 mb-6">
          <div className="rounded-xl border border-line p-5" style={{ background: 'var(--surface-raised)' }}>
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-xl font-bold text-ink">Etiqueta R23 por paleta</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--ink-muted)' }}>
                  {empresa} - {planta}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
                  Paleta #{boleta.numero_paleta} - {copies} cajas - {boleta.programa?.codigo || 'Sin ORP'}
                </p>
              </div>
              <div className="text-xs text-right" style={{ color: 'var(--ink-muted)' }}>
                <div>Tamano asumido R23</div>
                <div className="font-mono">{LABEL_WIDTH_MM} mm x {LABEL_HEIGHT_MM} mm</div>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="mb-4 rounded-lg border p-3" style={{ background: '#451a03', borderColor: '#92400e', color: '#fed7aa' }}>
                <div className="flex items-center gap-2 font-medium mb-1">
                  <AlertTriangle size={15} /> Datos incompletos para la etiqueta
                </div>
                <ul className="text-xs space-y-1">
                  {warnings.map((warning) => (
                    <li key={warning}>- {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-line p-4 text-sm" style={{ background: 'var(--surface-overlay)' }}>
              <div className="font-semibold text-ink mb-3">Resumen de la paleta</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div><span style={{ color: 'var(--ink-faint)' }}>Paleta:</span> <span className="font-mono text-ink">#{boleta.numero_paleta}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>ORP:</span> <span className="font-mono text-ink">{boleta.programa?.codigo || '-'}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Cliente:</span> <span className="font-mono text-ink">{boleta.programa?.cliente_nombre || boleta.despacho?.cliente_nombre || '-'}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Semana:</span> <span className="font-mono text-ink">{resolveWeek2(boleta)}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Calibre:</span> <span className="font-mono text-ink">{boleta.calibre_nombre || '-'}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Marca:</span> <span className="font-mono text-ink">{boleta.marca_nombre || '-'}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Tarina:</span> <span className="font-mono text-ink">{boleta.tarina || '-'}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Cajas:</span> <span className="font-mono text-ink">{boleta.cajas_empacadas}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Frutas/caja:</span> <span className="font-mono text-ink">{boleta.frutas_por_caja || '-'}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Total frutas:</span> <span className="font-mono text-ink">{boleta.total_frutas || '-'}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Exportador:</span> <span className="font-mono text-ink">{lines.exporterLabel}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Barcode 6:</span> <span className="font-mono text-ink">{lines.line2}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Barcode cliente:</span> <span className="font-mono text-ink break-all">{boleta.barcode_cliente || '-'}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>GGN:</span> <span className="font-mono text-ink">{resolveGgn(boleta, empConfig)}</span></div>
                <div><span style={{ color: 'var(--ink-faint)' }}>Trazabilidad:</span> <span className="font-mono text-ink break-all">{boleta.trazabilidad || '-'}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="r23-sheet rounded-xl border border-neutral-200 bg-white p-4 print:border-0">
          <div className="grid justify-start gap-[3mm]" style={{ gridTemplateColumns: `repeat(auto-fill, ${LABEL_WIDTH_MM}mm)` }}>
            {Array.from({ length: copies }).map((_, idx) => (
              <div
                key={`label-${idx + 1}`}
                className="border border-black bg-[#ece6c9] text-black"
                style={{
                  width: `${LABEL_WIDTH_MM}mm`,
                  minHeight: `${LABEL_HEIGHT_MM}mm`,
                  padding: '1.6mm 1.8mm',
                  breakInside: 'avoid',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <div className="font-mono text-[10.5px] font-bold tracking-[0.08em] leading-[1.05] w-full text-center">{lines.line1}</div>
                <div className="mt-[0.8mm] font-mono text-[10.5px] font-bold tracking-[0.12em] leading-[1.05] w-full text-center">{lines.line2}</div>
                <div className="mt-[1.1mm] font-mono text-[8px] font-bold leading-[1.05] w-full text-center">{lines.line3}</div>
                <div className="mt-[0.7mm] font-mono text-[7.8px] font-bold leading-[1.05] w-full text-center">{lines.line4}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
