import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';

interface BoletaPlano {
  id: string;
  numero_paleta: number;
  calibre_nombre?: string;
  marca_nombre?: string;
  cajas_empacadas: number;
  barcode_cliente?: string;
}

interface EmpConfig {
  nombre_emisor?: string;
  nombre_comercial?: string;
  nombre_planta?: string;
}

interface Props {
  despachoId: string;
  onBack: () => void;
}

function parseCalibreLabel(calibre?: string) {
  return calibre?.replace(/\s+/g, ' ').trim() || '-';
}

function barcodePattern(value: string) {
  const clean = (value || '').replace(/\s+/g, '');
  if (!clean) return 'repeating-linear-gradient(90deg,#111 0 2px,transparent 2px 4px)';
  const widths = clean.split('').map((ch, idx) => {
    const code = ch.charCodeAt(0);
    const width = (code % 4) + 1;
    const gap = ((code + idx) % 3) + 1;
    return `#111 0 ${width}px, transparent ${width}px ${width + gap}px`;
  });
  return `repeating-linear-gradient(90deg, ${widths.join(', ')})`;
}

export default function PlanoCargaImprimir({ despachoId, onBack }: Props) {
  const empresaId = useEmpresaId();
  const [despacho, setDespacho] = useState<any>(null);
  const [boletas, setBoletas] = useState<BoletaPlano[]>([]);
  const [empConfig, setEmpConfig] = useState<EmpConfig>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: des }, { data: bols }, { data: cfg }] = await Promise.all([
        supabase.from('emp_despachos')
          .select('*, semana:emp_semanas(id,codigo), destino:emp_destinos(id,nombre)')
          .eq('id', despachoId).single(),
        supabase.from('emp_boletas')
          .select('id, numero_paleta, calibre_nombre, marca_nombre, cajas_empacadas, barcode_cliente')
          .eq('despacho_id', despachoId)
          .order('numero_paleta'),
        supabase.from('fe_config_empresa')
          .select('nombre_emisor, nombre_comercial, nombre_planta')
          .eq('empresa_id', empresaId)
          .maybeSingle(),
      ]);
      setDespacho(des);
      setBoletas((bols as BoletaPlano[]) || []);
      setEmpConfig((cfg as EmpConfig) || {});
      setLoading(false);
    }
    load();
  }, [despachoId, empresaId]);

  const empresa = empConfig.nombre_emisor || empConfig.nombre_comercial || '-';
  const planta = empConfig.nombre_planta || '-';
  const columnas = useMemo(() => {
    const mitad = Math.ceil(boletas.length / 2);
    return [boletas.slice(0, mitad), boletas.slice(mitad)] as const;
  }, [boletas]);
  const filas = Math.max(columnas[0].length, columnas[1].length);

  if (loading) return <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--ink-muted)' }}>Cargando plano...</div>;
  if (!despacho) return <div className="flex items-center justify-center h-64 text-sm text-red-400">No se encontro el despacho.</div>;

  return (
    <>
      <div
        className="no-print sticky top-0 z-10 flex items-center justify-between px-6 py-3"
        style={{ background: 'var(--surface-deep)', borderBottom: '1px solid var(--line)' }}
      >
        <button onClick={onBack} className="flex items-center gap-2 text-sm hover:text-ink transition-colors" style={{ color: 'var(--ink-muted)' }}>
          <ArrowLeft size={15} /> Volver a despachos
        </button>
        <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Plano de carga - {despacho.codigo || despacho.numero || '-'}
        </span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 text-sm px-4 py-1.5 rounded font-medium"
          style={{ background: '#1d4ed8', color: '#fff' }}
        >
          <Printer size={14} /> Imprimir
        </button>
      </div>

      <div className="mx-auto max-w-[1100px] p-6 print:p-0">
        <div
          id="plano-carga-print"
          className="bg-white text-black shadow print:shadow-none"
          style={{ padding: '14mm 12mm', minHeight: '100vh' }}
        >
          <div style={{ border: '1px solid #111' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.25fr', borderBottom: '1px solid #111' }}>
              <div style={{ padding: '8px 10px', borderRight: '1px solid #111' }}>
                <div style={{ fontSize: 24, fontWeight: 700, textAlign: 'center' }}>Plano de Carga</div>
                <div style={{ marginTop: 6, fontSize: 11 }}>{empresa}</div>
                <div style={{ fontSize: 11 }}>{planta}</div>
              </div>
              <div style={{ padding: '8px 10px', borderRight: '1px solid #111', fontSize: 11, display: 'grid', gap: 4 }}>
                <div><strong>Marchamo:</strong> {despacho.marchamo_salida || despacho.marchamo_llegada || '-'}</div>
                <div><strong>Contenedor:</strong> {despacho.contenedor || '-'}</div>
                <div><strong>Inicio de carga:</strong> {despacho.hora_apertura || '-'}</div>
                <div><strong>Fin de carga:</strong> {despacho.hora_cierre || '-'}</div>
              </div>
              <div style={{ padding: '8px 10px', fontSize: 11, textAlign: 'center' }}>
                <div style={{ fontWeight: 700 }}>Semana</div>
                <div style={{ marginTop: 10, fontSize: 16, fontWeight: 700 }}>{despacho.semana?.codigo || '-'}</div>
              </div>
            </div>

            <div style={{ borderBottom: '1px solid #111', padding: '4px 10px', textAlign: 'center', fontWeight: 700, fontSize: 12 }}>
              DISTRIBUCION DE CARGA DEL CONTENEDOR
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {[0, 1].map((colIdx) => (
                <div key={colIdx} style={{ borderRight: colIdx === 0 ? '1px solid #111' : 'none' }}>
                  <div style={{ borderBottom: '1px solid #111', padding: '4px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11 }}>
                    {colIdx === 0 ? 'PARTE IZQUIERDA' : 'PARTE DERECHA'}
                  </div>
                  <div style={{ display: 'grid', gap: 0 }}>
                    {Array.from({ length: filas }).map((_, rowIdx) => {
                      const b = columnas[colIdx][rowIdx];
                      return (
                        <div key={`${colIdx}-${rowIdx}`} style={{ display: 'grid', gridTemplateColumns: '98px 1fr', minHeight: 86, borderBottom: '1px solid #d4d4d4' }}>
                          <div style={{ borderRight: '1px solid #d4d4d4', padding: '6px 6px 4px', fontSize: 10, display: 'grid', gap: 3 }}>
                            <div><strong>Paleta</strong><br />{b?.numero_paleta || '-'}</div>
                            <div><strong>Calibre</strong><br />{parseCalibreLabel(b?.calibre_nombre)}</div>
                            <div><strong>Marca Caja</strong><br />{b?.marca_nombre || '-'}</div>
                            <div><strong>Etiqueta</strong><br />{b ? b.cajas_empacadas : '-'}</div>
                            <div><strong>Cliente</strong><br />{despacho.cliente_nombre || '-'}</div>
                          </div>
                          <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
                            {b ? (
                              <>
                                <div
                                  style={{
                                    height: 34,
                                    border: '1px solid #111',
                                    backgroundImage: barcodePattern(b.barcode_cliente || String(b.numero_paleta)),
                                    backgroundSize: 'auto 100%',
                                    backgroundRepeat: 'repeat-x',
                                  }}
                                />
                                <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.06em' }}>
                                  {b.barcode_cliente || 'SIN CODIGO ESCANEADO'}
                                </div>
                              </>
                            ) : (
                              <div style={{ height: 46 }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


