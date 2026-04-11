/**
 * DashboardEmpacadora.tsx
 * Estadisticas de empaque por semana con graficos Recharts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';

interface Semana {
  id: string;
  codigo: string;
  semana: number;
  ano: number;
  fecha_inicio: string;
  fecha_fin: string;
}

interface KPIs {
  cajas: number;
  paletas: number;
  programas: number;
  despachos: number;
  frutas: number;
}

interface TendenciaSemana {
  codigo: string;
  cajas: number;
}

interface CalibreData {
  nombre: string;
  cajas: number;
}

interface ClienteData {
  cliente: string;
  cajas: number;
  paletas: number;
  despachos: number;
}

interface ProgAvance {
  codigo: string;
  cliente: string;
  programadas: number;
  producidas: number;
  pct: number;
}

const COLORES = ['#16a34a', '#2563eb', '#d97706', '#9333ea', '#e11d48', '#0891b2', '#65a30d', '#c2410c'];

const fmtNum = (n: number) =>
  new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(n);

export default function DashboardEmpacadora() {
  const empresaId = useEmpresaId();

  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [semanaId, setSemanaId] = useState<string>('');
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [tendencia, setTendencia] = useState<TendenciaSemana[]>([]);
  const [calibres, setCalibres] = useState<CalibreData[]>([]);
  const [clientes, setClientes] = useState<ClienteData[]>([]);
  const [avances, setAvances] = useState<ProgAvance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSemanas() {
      const { data } = await supabase
        .from('emp_semanas')
        .select('id, codigo, semana, fecha_inicio, fecha_fin')
        .eq('empresa_id', empresaId)
        .order('fecha_inicio', { ascending: false })
        .limit(12);

      if (data && data.length > 0) {
        setSemanas(data as unknown as Semana[]);
        setSemanaId((data[0] as { id: string }).id);
      } else {
        setLoading(false);
      }
    }

    loadSemanas();
  }, [empresaId]);

  const loadDatos = useCallback(async () => {
    if (!semanaId || !empresaId) return;
    setLoading(true);

    const ultimas8 = semanas.slice(0, 8);

    const [
      { data: boletas },
      { data: boletasTendencia },
      { data: programas },
      { data: despachos },
    ] = await Promise.all([
      supabase
        .from('emp_boletas')
        .select('cajas_empacadas, calibre_nombre, marca_nombre, programa_id, numero_paleta')
        .eq('empresa_id', empresaId)
        .eq('semana_id', semanaId),

      ultimas8.length > 0
        ? supabase
            .from('emp_boletas')
            .select('semana_id, cajas_empacadas')
            .eq('empresa_id', empresaId)
            .in('semana_id', ultimas8.map((s) => s.id))
        : Promise.resolve({ data: [] }),

      supabase
        .from('emp_programas')
        .select('id, codigo, cliente_nombre, paletas_programadas, paletas_empacadas')
        .eq('empresa_id', empresaId)
        .eq('semana_id', semanaId),

      supabase
        .from('emp_despachos')
        .select('id, cliente_nombre, total_cajas, total_paletas, cerrada')
        .eq('empresa_id', empresaId)
        .eq('semana_id', semanaId),
    ]);

    const cajasSemana = (boletas || []).reduce((s, b) => s + (b.cajas_empacadas || 0), 0);
    const paletasSem = new Set((boletas || []).map((b) => `${b.programa_id}-${b.numero_paleta}`)).size;
    const despCerrados = (despachos || []).filter((d) => d.cerrada).length;

    setKpis({
      cajas: cajasSemana,
      paletas: paletasSem,
      programas: (programas || []).length,
      despachos: despCerrados,
      frutas: 0,
    });

    const tendMap: Record<string, number> = {};
    (boletasTendencia || []).forEach((b) => {
      tendMap[b.semana_id] = (tendMap[b.semana_id] || 0) + (b.cajas_empacadas || 0);
    });
    setTendencia(
      ultimas8
        .map((s) => ({ codigo: s.codigo, cajas: tendMap[s.id] || 0 }))
        .reverse(),
    );

    const calMap: Record<string, number> = {};
    (boletas || []).forEach((b) => {
      const key = b.calibre_nombre || 'Sin calibre';
      calMap[key] = (calMap[key] || 0) + (b.cajas_empacadas || 0);
    });
    setCalibres(
      Object.entries(calMap)
        .map(([nombre, cajas]) => ({ nombre, cajas }))
        .sort((a, b) => b.cajas - a.cajas),
    );

    setAvances(
      (programas || []).map((p) => {
        const prog = p.paletas_programadas || 0;
        const prod = p.paletas_empacadas || 0;
        return {
          codigo: p.codigo,
          cliente: p.cliente_nombre || '-',
          programadas: prog,
          producidas: prod,
          pct: prog > 0 ? Math.min(100, Math.round((prod / prog) * 100)) : 0,
        };
      }),
    );

    const cliMap: Record<string, ClienteData> = {};
    (despachos || []).forEach((d) => {
      const key = d.cliente_nombre || 'Sin cliente';
      if (!cliMap[key]) cliMap[key] = { cliente: key, cajas: 0, paletas: 0, despachos: 0 };
      cliMap[key].cajas += d.total_cajas || 0;
      cliMap[key].paletas += d.total_paletas || 0;
      cliMap[key].despachos += 1;
    });
    setClientes(Object.values(cliMap).sort((a, b) => b.cajas - a.cajas));

    setLoading(false);
  }, [empresaId, semanaId, semanas]);

  useEffect(() => {
    loadDatos();
  }, [loadDatos]);

  const semanaActual = semanas.find((s) => s.id === semanaId);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Dashboard de Empaque
          </h1>
          {semanaActual && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Semana {semanaActual.semana} - {semanaActual.fecha_inicio} al {semanaActual.fecha_fin}
            </p>
          )}
        </div>
        <select
          value={semanaId}
          onChange={(e) => setSemanaId(e.target.value)}
          className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)' }}
        >
          {semanas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.codigo} - {s.fecha_inicio}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-xs" style={{ color: 'var(--ink-faint)' }}>
          Cargando...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Cajas empacadas', value: fmtNum(kpis?.cajas || 0), color: '#16a34a' },
              { label: 'Paletas', value: fmtNum(kpis?.paletas || 0), color: '#2563eb' },
              { label: 'Programas activos', value: fmtNum(kpis?.programas || 0), color: '#d97706' },
              { label: 'Despachos cerrados', value: fmtNum(kpis?.despachos || 0), color: '#9333ea' },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-lg p-4"
                style={{ background: `${k.color}18`, border: `1px solid ${k.color}44` }}
              >
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: k.color }}>
                  {k.label}
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>
                  {k.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--ink)' }}>
                Cajas empacadas - ultimas semanas
              </p>
              {tendencia.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--ink-faint)' }}>
                  Sin datos
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={tendencia} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <XAxis dataKey="codigo" tick={{ fontSize: 9, fill: 'var(--ink-muted)' }} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--ink-muted)' }} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)', fontSize: 11 }}
                      formatter={(value) => [fmtNum(Number(value ?? 0)), 'Cajas']}
                    />
                    <Bar dataKey="cajas" radius={[3, 3, 0, 0]}>
                      {tendencia.map((_, i) => (
                        <Cell key={i} fill={i === tendencia.length - 1 ? '#16a34a' : '#16a34a66'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--ink)' }}>
                Mix por calibre - semana seleccionada
              </p>
              {calibres.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--ink-faint)' }}>
                  Sin datos
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={calibres}
                      dataKey="cajas"
                      nameKey="nombre"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name || ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {calibres.map((_, i) => (
                        <Cell key={i} fill={COLORES[i % COLORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)', fontSize: 11 }}
                      formatter={(value) => [fmtNum(Number(value ?? 0)), 'Cajas']}
                    />
                    <Legend iconSize={9} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {avances.length > 0 && (
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--ink)' }}>
                Avance de programas - paletas
              </p>
              <div className="space-y-2.5">
                {avances.map((p) => (
                  <div key={p.codigo}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium" style={{ color: 'var(--ink)' }}>
                        {p.codigo}{' '}
                        <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>- {p.cliente}</span>
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                        {p.producidas} / {p.programadas} paletas ({p.pct}%)
                      </span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 7, background: 'var(--surface-overlay)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${p.pct}%`,
                          background: p.pct >= 100 ? '#16a34a' : p.pct >= 60 ? '#2563eb' : '#d97706',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {clientes.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
              <div className="px-4 py-2.5" style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--line)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                  Resumen por cliente - despachos
                </p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-overlay)', borderBottom: '1px solid var(--line)' }}>
                    {['Cliente', 'Cajas', 'Paletas', 'Despachos'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left font-semibold" style={{ color: 'var(--ink-muted)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, i) => (
                    <tr key={c.cliente} style={{ borderBottom: i < clientes.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <td className="px-4 py-2 font-medium" style={{ color: 'var(--ink)' }}>
                        {c.cliente}
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--ink-muted)' }}>
                        {fmtNum(c.cajas)}
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--ink-muted)' }}>
                        {fmtNum(c.paletas)}
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--ink-muted)' }}>
                        {c.despachos}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {kpis?.cajas === 0 && kpis?.programas === 0 && (
            <div className="text-center py-12 text-xs" style={{ color: 'var(--ink-faint)' }}>
              No hay datos registrados para esta semana.
            </div>
          )}
        </>
      )}
    </div>
  );
}
