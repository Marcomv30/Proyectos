import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';

interface Props {
  onBack: () => void;
}

interface Row {
  material_id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  stock_actual: number;
  stock_minimo: number;
  bodega_id: string;
  bodega_nombre: string;
  bodega_principal: boolean;
}

const TIPO_LABEL: Record<string, string> = {
  carton: 'Cartón', colilla: 'Colilla', etiqueta: 'Etiqueta',
  accesorio: 'Accesorio', otro: 'Otro',
};

const TIPO_ORDER = ['carton', 'colilla', 'etiqueta', 'accesorio', 'otro'];

function estadoLabel(stock: number, minimo: number): { text: string; color: string } {
  if (stock <= 0)       return { text: 'Sin stock',   color: '#ef4444' };
  if (stock <= minimo)  return { text: 'Stock bajo',  color: '#f59e0b' };
  return                       { text: 'Normal',       color: '#22c55e' };
}

export default function InventarioMaterialesPrint({ onBack }: Props) {
  const empresaId = useEmpresaId();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const fecha = new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('emp_inv_materiales')
        .select('stock_actual, bodega_id, material_id, material:emp_materiales(codigo,nombre,tipo,stock_minimo,activo), bodega:emp_bodegas(nombre,es_principal)')
        .eq('empresa_id', empresaId);

      const mapped: Row[] = ((data || []) as any[])
        .filter(r => r.material?.activo !== false)
        .map(r => ({
          material_id:    r.material_id,
          codigo:         r.material?.codigo || '',
          nombre:         r.material?.nombre || '',
          tipo:           r.material?.tipo || 'otro',
          stock_actual:   r.stock_actual,
          stock_minimo:   r.material?.stock_minimo ?? 0,
          bodega_id:      r.bodega_id,
          bodega_nombre:  r.bodega?.nombre || '',
          bodega_principal: r.bodega?.es_principal ?? false,
        }));

      // Ordenar: bodega principal primero, luego por nombre de bodega, tipo, nombre
      mapped.sort((a, b) => {
        if (a.bodega_principal !== b.bodega_principal) return a.bodega_principal ? -1 : 1;
        if (a.bodega_nombre !== b.bodega_nombre) return a.bodega_nombre.localeCompare(b.bodega_nombre);
        const ta = TIPO_ORDER.indexOf(a.tipo), tb = TIPO_ORDER.indexOf(b.tipo);
        if (ta !== tb) return ta - tb;
        return a.nombre.localeCompare(b.nombre);
      });

      setRows(mapped);
      setLoading(false);
    }
    fetch();
  }, [empresaId]);

  // Agrupar: bodega → tipo → filas
  const bodegas = Array.from(new Set(rows.map(r => r.bodega_id))).map(bid => {
    const bodRows = rows.filter(r => r.bodega_id === bid);
    const tipos = Array.from(new Set(bodRows.map(r => r.tipo)));
    tipos.sort((a, b) => TIPO_ORDER.indexOf(a) - TIPO_ORDER.indexOf(b));
    return {
      id: bid,
      nombre: bodRows[0]?.bodega_nombre || '',
      tipos: tipos.map(t => ({ tipo: t, filas: bodRows.filter(r => r.tipo === t) })),
      total: bodRows.length,
      bajos: bodRows.filter(r => r.stock_actual <= r.stock_minimo).length,
    };
  });

  const totalMateriales = rows.length;
  const totalBajos = rows.filter(r => r.stock_actual <= r.stock_minimo).length;

  const s = {
    page:    { fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#111', background: '#fff', padding: '24px', maxWidth: '900px', margin: '0 auto' } as React.CSSProperties,
    header:  { borderBottom: '2px solid #111', paddingBottom: '10px', marginBottom: '16px' } as React.CSSProperties,
    title:   { fontSize: '18px', fontWeight: 'bold', margin: 0 } as React.CSSProperties,
    sub:     { fontSize: '11px', color: '#555', marginTop: '2px' } as React.CSSProperties,
    bodega:  { marginBottom: '20px' } as React.CSSProperties,
    bodHead: { background: '#1e293b', color: '#fff', padding: '6px 10px', fontWeight: 'bold', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '4px 4px 0 0' } as React.CSSProperties,
    tipoHead:{ background: '#f1f5f9', padding: '4px 10px', fontWeight: 'bold', fontSize: '10px', color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    table:   { width: '100%', borderCollapse: 'collapse' as const, fontSize: '10.5px' },
    th:      { padding: '5px 8px', textAlign: 'left' as const, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase' as const },
    td:      { padding: '5px 8px', borderBottom: '1px solid #f1f5f9' },
    tdR:     { padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' as const },
    footer:  { borderTop: '1px solid #e2e8f0', marginTop: '20px', paddingTop: '10px', fontSize: '10px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' } as React.CSSProperties,
    summary: { display: 'flex', gap: '24px', marginBottom: '16px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' } as React.CSSProperties,
    statVal: { fontSize: '20px', fontWeight: 'bold' } as React.CSSProperties,
    statLbl: { fontSize: '10px', color: '#64748b' } as React.CSSProperties,
    toolbar: { display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' } as React.CSSProperties,
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando...</div>;

  return (
    <>
      {/* Toolbar — oculto al imprimir */}
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 15mm; } }`}</style>
      <div className="no-print" style={s.toolbar}>
        <button onClick={onBack}
          style={{ background: '#334155', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          ← Volver
        </button>
        <button onClick={() => window.print()}
          style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          🖨 Imprimir / Guardar PDF
        </button>
        <span style={{ fontSize: 12, color: '#64748b' }}>Usa "Guardar como PDF" en el diálogo de impresión</span>
      </div>

      {/* Reporte */}
      <div style={s.page}>
        {/* Encabezado */}
        <div style={s.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={s.title}>Reporte de Inventario de Materiales</div>
              <div style={s.sub}>Planta Empacadora — Stock por Bodega y Tipo</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '10px', color: '#555' }}>
              <div>{fecha}</div>
              <div style={{ marginTop: 2 }}>Empresa ID: {empresaId}</div>
            </div>
          </div>
        </div>

        {/* Resumen general */}
        <div style={s.summary}>
          <div>
            <div style={s.statVal}>{totalMateriales}</div>
            <div style={s.statLbl}>Total materiales</div>
          </div>
          <div>
            <div style={{ ...s.statVal, color: totalBajos > 0 ? '#f59e0b' : '#22c55e' }}>{totalBajos}</div>
            <div style={s.statLbl}>Stock bajo o en cero</div>
          </div>
          <div>
            <div style={s.statVal}>{bodegas.length}</div>
            <div style={s.statLbl}>Bodegas</div>
          </div>
        </div>

        {/* Bodegas */}
        {bodegas.map(bod => (
          <div key={bod.id} style={s.bodega}>
            <div style={s.bodHead}>
              <span>📦 {bod.nombre}</span>
              <span style={{ fontSize: '10px', fontWeight: 'normal', opacity: 0.8 }}>
                {bod.total} materiales{bod.bajos > 0 ? ` · ${bod.bajos} con stock bajo` : ''}
              </span>
            </div>

            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Código</th>
                  <th style={s.th}>Material</th>
                  <th style={s.th}>Tipo</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Stock Actual</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Stock Mín.</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {bod.tipos.map(({ tipo, filas }) => (
                  <>
                    {/* Subencabezado por tipo */}
                    <tr key={`tipo-${tipo}`}>
                      <td colSpan={6} style={s.tipoHead}>{TIPO_LABEL[tipo] || tipo}</td>
                    </tr>
                    {filas.map(r => {
                      const est = estadoLabel(r.stock_actual, r.stock_minimo);
                      return (
                        <tr key={`${r.material_id}-${r.bodega_id}`}>
                          <td style={{ ...s.td, fontFamily: 'monospace', color: '#2563eb' }}>{r.codigo || '—'}</td>
                          <td style={{ ...s.td, fontWeight: 500 }}>{r.nombre}</td>
                          <td style={s.td}>{TIPO_LABEL[r.tipo] || r.tipo}</td>
                          <td style={{ ...s.tdR, fontWeight: 'bold', color: r.stock_actual <= 0 ? '#ef4444' : '#111' }}>
                            {r.stock_actual.toLocaleString('es-CR')}
                          </td>
                          <td style={{ ...s.tdR, color: '#64748b' }}>{r.stock_minimo.toLocaleString('es-CR')}</td>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            <span style={{ background: `${est.color}18`, color: est.color, border: `1px solid ${est.color}40`, borderRadius: 4, padding: '1px 7px', fontSize: '9.5px', fontWeight: 600 }}>
                              {est.text}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Pie de página */}
        <div style={s.footer}>
          <span>Sistema Empacadora — Reporte generado el {fecha}</span>
          <span>Stock bajo = stock actual ≤ stock mínimo</span>
        </div>
      </div>
    </>
  );
}
