import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';

type SubModulo = 'home' | 'dashboard';

type StatsState = {
  semanas: number;
  programas: number;
  recepciones: number;
  despachos: number;
  boletas: number;
  materiales: number;
  clientes: number;
  proveedores: number;
};

type ProgramaRow = {
  id: string;
  codigo: string | null;
  fecha: string | null;
  cliente_nombre: string | null;
  paletas_programadas: number | null;
  paletas_empacadas: number | null;
  terminado: boolean | null;
};

type RecepcionRow = {
  id: string;
  codigo: string | null;
  fecha: string | null;
  lote: string | null;
  total_frutas: number | null;
  recibida: boolean | null;
};

type DespachoRow = {
  id: string;
  codigo: string | null;
  cliente_nombre: string | null;
  fecha_apertura: string | null;
  total_cajas: number | null;
  cerrada: boolean | null;
};

type MaterialRow = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  tipo: string | null;
  stock_actual?: number | null;
  stock_minimo?: number | null;
};

interface Props {
  empresaId: number;
  onHome: () => void;
}

const INITIAL_STATS: StatsState = {
  semanas: 0,
  programas: 0,
  recepciones: 0,
  despachos: 0,
  boletas: 0,
  materiales: 0,
  clientes: 0,
  proveedores: 0,
};

const CARDS = [
  {
    id: 'dashboard' as SubModulo,
    icon: 'EP',
    nombre: 'Centro de control',
    descripcion: 'Resumen operativo de programas, recepciones, despachos y materiales de empaque.',
    color: '#f59e0b',
    disponible: true,
  },
];

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Costa_Rica',
  });
}

function MetricCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent: string }) {
  return (
    <div
      style={{
        background: '#111827',
        border: `1px solid ${accent}33`,
        borderRadius: 18,
        padding: 18,
        minHeight: 118,
        boxShadow: '0 18px 40px rgba(0,0,0,.22)',
      }}
    >
      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</div>
      {hint ? <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>{hint}</div> : null}
    </div>
  );
}

function DataTable<T extends { id: string }>({
  title,
  subtitle,
  rows,
  columns,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: T[];
  columns: Array<{ key: string; label: string; render: (row: T) => React.ReactNode }>;
  empty: string;
}) {
  return (
    <section
      style={{
        background: '#111827',
        border: '1px solid #1f2937',
        borderRadius: 18,
        padding: 18,
        boxShadow: '0 18px 40px rgba(0,0,0,.18)',
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>{title}</div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>{subtitle}</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderBottom: '1px solid #1f2937',
                    color: '#94a3b8',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    fontWeight: 800,
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{
                      padding: '11px 12px',
                      borderBottom: '1px solid rgba(31,41,55,.8)',
                      color: '#e5e7eb',
                      fontSize: 13,
                      verticalAlign: 'top',
                    }}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length} style={{ padding: '18px 12px', color: '#64748b', fontSize: 13 }}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function EmpacadoraModule({ empresaId, onHome }: Props) {
  const [activo, setActivo] = useState<SubModulo>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<StatsState>(INITIAL_STATS);
  const [programas, setProgramas] = useState<ProgramaRow[]>([]);
  const [recepciones, setRecepciones] = useState<RecepcionRow[]>([]);
  const [despachos, setDespachos] = useState<DespachoRow[]>([]);
  const [materialesCriticos, setMaterialesCriticos] = useState<MaterialRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const [
          semanasRes,
          programasCountRes,
          recepcionesCountRes,
          despachosCountRes,
          boletasCountRes,
          materialesCountRes,
          clientesCountRes,
          proveedoresCountRes,
          programasRes,
          recepcionesRes,
          despachosRes,
          materialesRes,
        ] = await Promise.all([
          supabase.from('emp_semanas').select('id', { head: true, count: 'exact' }).eq('empresa_id', empresaId),
          supabase.from('emp_programas').select('id', { head: true, count: 'exact' }).eq('empresa_id', empresaId),
          supabase.from('emp_recepciones').select('id', { head: true, count: 'exact' }).eq('empresa_id', empresaId),
          supabase.from('emp_despachos').select('id', { head: true, count: 'exact' }).eq('empresa_id', empresaId),
          supabase.from('emp_boletas').select('id', { head: true, count: 'exact' }).eq('empresa_id', empresaId),
          supabase.from('emp_materiales').select('id', { head: true, count: 'exact' }).eq('empresa_id', empresaId),
          supabase.from('emp_clientes').select('id', { head: true, count: 'exact' }).eq('empresa_id', empresaId),
          supabase.from('emp_proveedores_fruta').select('id', { head: true, count: 'exact' }).eq('empresa_id', empresaId),
          supabase
            .from('emp_programas')
            .select('id, codigo, fecha, cliente_nombre, paletas_programadas, paletas_empacadas, terminado')
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })
            .limit(6),
          supabase
            .from('emp_recepciones')
            .select('id, codigo, fecha, lote, total_frutas, recibida')
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })
            .limit(6),
          supabase
            .from('emp_despachos')
            .select('id, codigo, cliente_nombre, fecha_apertura, total_cajas, cerrada')
            .eq('empresa_id', empresaId)
            .order('fecha_apertura', { ascending: false })
            .limit(6),
          supabase
            .from('emp_materiales')
            .select('id, codigo, nombre, tipo, stock_minimo, emp_inv_materiales(stock_actual)')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .limit(20),
        ]);

        const fatalError = [
          semanasRes.error,
          programasCountRes.error,
          recepcionesCountRes.error,
          despachosCountRes.error,
          boletasCountRes.error,
          materialesCountRes.error,
          clientesCountRes.error,
          proveedoresCountRes.error,
          programasRes.error,
          recepcionesRes.error,
          despachosRes.error,
          materialesRes.error,
        ].find(Boolean);

        if (fatalError) {
          throw fatalError;
        }

        const criticalMaterials = ((materialesRes.data || []) as any[])
          .map((row) => {
            const stockActual = Array.isArray(row.emp_inv_materiales)
              ? Number(row.emp_inv_materiales[0]?.stock_actual || 0)
              : Number(row.emp_inv_materiales?.stock_actual || 0);
            return {
              id: row.id,
              codigo: row.codigo,
              nombre: row.nombre,
              tipo: row.tipo,
              stock_minimo: Number(row.stock_minimo || 0),
              stock_actual: stockActual,
            } as MaterialRow;
          })
          .filter((row) => Number(row.stock_minimo || 0) > 0 && Number(row.stock_actual || 0) <= Number(row.stock_minimo || 0))
          .sort((a, b) => Number(a.stock_actual || 0) - Number(b.stock_actual || 0))
          .slice(0, 8);

        if (cancelled) return;

        setStats({
          semanas: Number(semanasRes.count || 0),
          programas: Number(programasCountRes.count || 0),
          recepciones: Number(recepcionesCountRes.count || 0),
          despachos: Number(despachosCountRes.count || 0),
          boletas: Number(boletasCountRes.count || 0),
          materiales: Number(materialesCountRes.count || 0),
          clientes: Number(clientesCountRes.count || 0),
          proveedores: Number(proveedoresCountRes.count || 0),
        });
        setProgramas((programasRes.data || []) as ProgramaRow[]);
        setRecepciones((recepcionesRes.data || []) as RecepcionRow[]);
        setDespachos((despachosRes.data || []) as DespachoRow[]);
        setMaterialesCriticos(criticalMaterials);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'No se pudo cargar el modulo de empacadora.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [empresaId]);

  const resumenOperativo = useMemo(() => {
    const programasTerminados = programas.filter((item) => item.terminado).length;
    const recepcionesRecibidas = recepciones.filter((item) => item.recibida).length;
    const despachosCerrados = despachos.filter((item) => item.cerrada).length;
    return { programasTerminados, recepcionesRecibidas, despachosCerrados };
  }, [programas, recepciones, despachos]);

  if (activo === 'home') {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-6 font-mono">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={onHome} className="text-xs text-gray-500 hover:text-gray-300 transition-colors mr-1">
              Home /
            </button>
            <span className="text-3xl">EMP</span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Planta Empacadora</h1>
          </div>
          <p className="text-gray-500 text-sm ml-12">
            Operacion de empaque, recepcion de fruta, programas, despachos y materiales.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <MetricCard label="Programas" value={String(stats.programas)} accent="#f59e0b" hint="Ordenes y corridas de produccion registradas." />
          <MetricCard label="Recepciones" value={String(stats.recepciones)} accent="#38bdf8" hint="Ingresos de fruta desde finca o proveedor." />
          <MetricCard label="Despachos" value={String(stats.despachos)} accent="#22c55e" hint="Contenedores, guias y salidas de producto terminado." />
          <MetricCard label="Materiales" value={String(stats.materiales)} accent="#a78bfa" hint="Catalogo de cajas, colillas y otros insumos de empaque." />
        </div>

        {error ? (
          <div style={{ background: '#34181c', border: '1px solid #7d2f3a', color: '#ffb3bb', padding: 14, borderRadius: 14, marginBottom: 16 }}>
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
          {CARDS.map((card) => (
            <button
              key={card.id}
              onClick={() => setActivo(card.id)}
              className="text-left rounded-2xl border p-5 flex flex-col gap-3 transition-all bg-gray-900 border-gray-700 hover:border-opacity-80 hover:scale-[1.02] cursor-pointer"
              style={{ borderColor: `${card.color}55` }}
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold"
                  style={{ background: `${card.color}22`, color: card.color }}
                >
                  {card.icon}
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full mt-1 font-medium"
                  style={{ background: `${card.color}22`, color: card.color }}
                >
                  Disponible
                </span>
              </div>

              <div>
                <h2 className="text-base font-semibold mb-1" style={{ color: card.color }}>
                  {card.nombre}
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed">{card.descripcion}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-mono">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => setActivo('home')} className="text-xs text-gray-500 hover:text-gray-300 transition-colors mr-1">
              Empacadora /
            </button>
            <h1 className="text-2xl font-bold text-white tracking-tight">Centro de control</h1>
          </div>
          <p className="text-gray-500 text-sm ml-12">
            Vista inicial para publicar el modulo al VPS y validar que la empresa ya tiene datos operativos.
          </p>
        </div>
        <button
          onClick={() => setActivo('home')}
          className="text-xs px-3 py-2 rounded-xl border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
        >
          Volver al inicio
        </button>
      </div>

      {loading ? (
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 18, padding: 18, color: '#94a3b8' }}>
          Cargando resumen de empacadora...
        </div>
      ) : (
        <>
          {error ? (
            <div style={{ background: '#34181c', border: '1px solid #7d2f3a', color: '#ffb3bb', padding: 14, borderRadius: 14, marginBottom: 16 }}>
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Semanas activas" value={String(stats.semanas)} accent="#f59e0b" hint="Catalogo operativo de semanas de empaque." />
            <MetricCard label="Boletas" value={String(stats.boletas)} accent="#38bdf8" hint="Trazabilidad de paletas y cajas producidas." />
            <MetricCard label="Clientes" value={String(stats.clientes)} accent="#22c55e" hint="Clientes comerciales configurados en empacadora." />
            <MetricCard label="Proveedores" value={String(stats.proveedores)} accent="#a78bfa" hint="Productores o proveedores de fruta asociados." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <MetricCard label="Programas cerrados" value={String(resumenOperativo.programasTerminados)} accent="#f97316" hint="De la muestra reciente cargada." />
            <MetricCard label="Recepciones recibidas" value={String(resumenOperativo.recepcionesRecibidas)} accent="#14b8a6" hint="Recepciones marcadas como recibidas." />
            <MetricCard label="Despachos cerrados" value={String(resumenOperativo.despachosCerrados)} accent="#84cc16" hint="Contenedores o salidas ya cerradas." />
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 mb-6">
            <DataTable
              title="Programas recientes"
              subtitle="Ultimos programas de empaque registrados para esta empresa."
              rows={programas}
              empty="No hay programas cargados todavia."
              columns={[
                { key: 'codigo', label: 'Codigo', render: (row) => row.codigo || 'Sin codigo' },
                { key: 'fecha', label: 'Fecha', render: (row) => formatDate(row.fecha) },
                { key: 'cliente', label: 'Cliente', render: (row) => row.cliente_nombre || 'Sin cliente' },
                {
                  key: 'paletas',
                  label: 'Paletas',
                  render: (row) => `${Number(row.paletas_empacadas || 0)} / ${Number(row.paletas_programadas || 0)}`,
                },
                {
                  key: 'estado',
                  label: 'Estado',
                  render: (row) => (
                    <span style={{ color: row.terminado ? '#86efac' : '#fcd34d', fontWeight: 700 }}>
                      {row.terminado ? 'Terminado' : 'En proceso'}
                    </span>
                  ),
                },
              ]}
            />

            <DataTable
              title="Recepciones recientes"
              subtitle="Ingreso de fruta y lotes recientes."
              rows={recepciones}
              empty="No hay recepciones cargadas todavia."
              columns={[
                { key: 'codigo', label: 'Codigo', render: (row) => row.codigo || 'Sin codigo' },
                { key: 'fecha', label: 'Fecha', render: (row) => formatDate(row.fecha) },
                { key: 'lote', label: 'Lote', render: (row) => row.lote || 'Sin lote' },
                { key: 'frutas', label: 'Frutas', render: (row) => Number(row.total_frutas || 0).toLocaleString('es-CR') },
                {
                  key: 'estado',
                  label: 'Estado',
                  render: (row) => (
                    <span style={{ color: row.recibida ? '#86efac' : '#fcd34d', fontWeight: 700 }}>
                      {row.recibida ? 'Recibida' : 'Pendiente'}
                    </span>
                  ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <DataTable
              title="Despachos recientes"
              subtitle="Resumen de cargas, clientes y estado de cierre."
              rows={despachos}
              empty="No hay despachos cargados todavia."
              columns={[
                { key: 'codigo', label: 'Codigo', render: (row) => row.codigo || 'Sin codigo' },
                { key: 'cliente', label: 'Cliente', render: (row) => row.cliente_nombre || 'Sin cliente' },
                { key: 'fecha', label: 'Apertura', render: (row) => formatDate(row.fecha_apertura) },
                { key: 'cajas', label: 'Cajas', render: (row) => Number(row.total_cajas || 0).toLocaleString('es-CR') },
                {
                  key: 'estado',
                  label: 'Estado',
                  render: (row) => (
                    <span style={{ color: row.cerrada ? '#86efac' : '#fcd34d', fontWeight: 700 }}>
                      {row.cerrada ? 'Cerrado' : 'Abierto'}
                    </span>
                  ),
                },
              ]}
            />

            <DataTable
              title="Materiales criticos"
              subtitle="Materiales cuyo stock actual esta igual o por debajo del minimo configurado."
              rows={materialesCriticos}
              empty="No hay materiales criticos en la muestra actual."
              columns={[
                { key: 'codigo', label: 'Codigo', render: (row) => row.codigo || 'Sin codigo' },
                { key: 'nombre', label: 'Material', render: (row) => row.nombre || 'Sin nombre' },
                { key: 'tipo', label: 'Tipo', render: (row) => row.tipo || 'Sin tipo' },
                { key: 'actual', label: 'Stock actual', render: (row) => Number(row.stock_actual || 0).toLocaleString('es-CR') },
                { key: 'minimo', label: 'Minimo', render: (row) => Number(row.stock_minimo || 0).toLocaleString('es-CR') },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
