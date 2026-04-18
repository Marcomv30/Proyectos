/**
 * DashboardEmpacadora.tsx
 * Dashboard principal: KPIs, stock, recepción, tendencia cajas,
 * rendimiento semanal, mix calibres, avance programas, tabla clientes.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line, CartesianGrid,
} from 'recharts';
import {
  Package, AlertTriangle, CheckCircle2, TrendingUp,
  Leaf, BarChart2, Box,
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Semana { id: string; codigo: string; semana: number; fecha_inicio: string; fecha_fin: string; }
interface KPIs { cajas: number; paletas: number; programas: number; despachos: number; }
interface TendenciaSemana { codigo: string; cajas: number; }
interface CalibreData { nombre: string; cajas: number; }
interface ClienteData { cliente: string; cajas: number; paletas: number; despachos: number; }
interface ProgAvance { codigo: string; cliente: string; programadas: number; producidas: number; pct: number; }
interface StockStatus { agotado: number; minimo: number; ok: number; total: number; }
interface RecepcionSem { frutas: number; empacada: number; jugo: number; rechazo: number; }
interface RendimientoSem { codigo: string; pct: number; }

// ── Constantes ────────────────────────────────────────────────────────────────
const COLORES = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316', '#a3e635'];
const fmt = (n: number) => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// ── Tooltip genérico ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey}>{p.name}: <strong>{typeof p.value === 'number' && p.name?.includes('%') ? fmtPct(p.value) : fmt(p.value)}</strong></p>
      ))}
    </div>
  );
}

// ── Donut calibres con total al centro ────────────────────────────────────────
function DonutCentro({ data, total }: { data: CalibreData[]; total: number }) {
  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="cajas" nameKey="nombre"
            cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={2}
            label={false} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11, color: '#f1f5f9' }}
            formatter={(v: any) => [fmt(Number(v)), 'Cajas']} />
        </PieChart>
      </ResponsiveContainer>
      {/* Total en el centro */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', pointerEvents: 'none', textAlign: 'center',
      }}>
        <div className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{fmt(total)}</div>
        <div className="text-[9px]" style={{ color: 'var(--ink-faint)' }}>cajas</div>
      </div>
    </div>
  );
}

// ── Barra fruta breakdown ─────────────────────────────────────────────────────
function FrutaBar({ empacada, jugo, rechazo }: { empacada: number; jugo: number; rechazo: number }) {
  const total = empacada + jugo + rechazo;
  if (total === 0) return null;
  const pEmp = (empacada / total * 100);
  const pJugo = (jugo / total * 100);
  const pRec = (rechazo / total * 100);
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex rounded-full overflow-hidden" style={{ height: 10 }}>
        <div style={{ width: `${pEmp}%`, background: '#10b981' }} />
        <div style={{ width: `${pJugo}%`, background: '#f59e0b' }} />
        <div style={{ width: `${pRec}%`, background: '#ef4444' }} />
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: 'var(--ink-faint)' }}>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#10b981' }} />Empacada {fmtPct(pEmp)}</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#f59e0b' }} />Jugo {fmtPct(pJugo)}</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#ef4444' }} />Rechazo {fmtPct(pRec)}</span>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DashboardEmpacadora() {
  const empresaId = useEmpresaId();

  const [semanas,     setSemanas]     = useState<Semana[]>([]);
  const [semanaId,    setSemanaId]    = useState('');
  const [kpis,        setKpis]        = useState<KPIs | null>(null);
  const [tendencia,   setTendencia]   = useState<TendenciaSemana[]>([]);
  const [calibres,    setCalibres]    = useState<CalibreData[]>([]);
  const [clientes,    setClientes]    = useState<ClienteData[]>([]);
  const [avances,     setAvances]     = useState<ProgAvance[]>([]);
  const [stock,       setStock]       = useState<StockStatus | null>(null);
  const [recepcion,   setRecepcion]   = useState<RecepcionSem | null>(null);
  const [rendimiento, setRendimiento] = useState<RendimientoSem[]>([]);
  const [loading,     setLoading]     = useState(true);

  // ── Semanas ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('emp_semanas')
      .select('id, codigo, semana, fecha_inicio, fecha_fin')
      .eq('empresa_id', empresaId)
      .order('fecha_inicio', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (data?.length) {
          setSemanas(data as any);
          setSemanaId((data[0] as any).id);
        } else {
          setLoading(false);
        }
      });
  }, [empresaId]);

  // ── Datos principales ─────────────────────────────────────────────────────
  const loadDatos = useCallback(async () => {
    if (!semanaId || !empresaId) return;
    setLoading(true);

    const ultimas8 = semanas.slice(0, 8);

    const [
      { data: boletas },
      { data: boletasTendencia },
      { data: programas },
      { data: despachos },
      { data: saldos },
      { data: receps },
      { data: recepsTend },
    ] = await Promise.all([
      // Boletas semana actual
      supabase.from('emp_boletas')
        .select('cajas_empacadas, calibre_nombre, marca_nombre, programa_id, numero_paleta, cajas_por_paleta')
        .eq('empresa_id', empresaId).eq('semana_id', semanaId),

      // Boletas tendencia últimas 8
      ultimas8.length > 0
        ? supabase.from('emp_boletas')
            .select('semana_id, cajas_empacadas')
            .eq('empresa_id', empresaId)
            .in('semana_id', ultimas8.map(s => s.id))
        : Promise.resolve({ data: [] as any[] }),

      // Programas semana
      supabase.from('emp_programas')
        .select('id, codigo, cliente_nombre, paletas_programadas, paletas_empacadas')
        .eq('empresa_id', empresaId).eq('semana_id', semanaId),

      // Despachos semana
      supabase.from('emp_despachos')
        .select('id, cliente_nombre, total_cajas, total_paletas, cerrada')
        .eq('empresa_id', empresaId).eq('semana_id', semanaId),

      // Stock global
      supabase.from('emp_v_saldos')
        .select('estado_stock')
        .eq('empresa_id', empresaId),

      // Recepciones semana actual
      supabase.from('emp_recepciones')
        .select('total_frutas, fruta_empacada, fruta_jugo, fruta_rechazo')
        .eq('empresa_id', empresaId).eq('semana_id', semanaId),

      // Recepciones tendencia rendimiento últimas 8
      ultimas8.length > 0
        ? supabase.from('emp_recepciones')
            .select('semana_id, total_frutas, fruta_empacada')
            .eq('empresa_id', empresaId)
            .in('semana_id', ultimas8.map(s => s.id))
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // KPIs
    const cajasSemana = (boletas || []).reduce((s, b) => s + (b.cajas_empacadas || 0), 0);
    const paletasSem  = new Set((boletas || []).map(b => `${b.programa_id}-${b.numero_paleta}`)).size;
    const despCerrados = (despachos || []).filter(d => d.cerrada).length;
    setKpis({ cajas: cajasSemana, paletas: paletasSem, programas: (programas || []).length, despachos: despCerrados });

    // Tendencia cajas
    const tendMap: Record<string, number> = {};
    (boletasTendencia || []).forEach(b => { tendMap[b.semana_id] = (tendMap[b.semana_id] || 0) + (b.cajas_empacadas || 0); });
    setTendencia(ultimas8.map(s => ({ codigo: s.codigo, cajas: tendMap[s.id] || 0 })).reverse());

    // Calibres
    const calMap: Record<string, number> = {};
    (boletas || []).forEach(b => { const k = b.calibre_nombre || 'Sin calibre'; calMap[k] = (calMap[k] || 0) + (b.cajas_empacadas || 0); });
    setCalibres(Object.entries(calMap).map(([nombre, cajas]) => ({ nombre, cajas })).sort((a, b) => b.cajas - a.cajas));

    // Avance programas
    setAvances((programas || []).map(p => {
      const prog = p.paletas_programadas || 0, prod = p.paletas_empacadas || 0;
      return { codigo: p.codigo, cliente: p.cliente_nombre || '-', programadas: prog, producidas: prod, pct: prog > 0 ? Math.min(100, Math.round(prod / prog * 100)) : 0 };
    }));

    // Clientes
    const cliMap: Record<string, ClienteData> = {};
    (despachos || []).forEach(d => {
      const k = d.cliente_nombre || 'Sin cliente';
      if (!cliMap[k]) cliMap[k] = { cliente: k, cajas: 0, paletas: 0, despachos: 0 };
      cliMap[k].cajas += d.total_cajas || 0;
      cliMap[k].paletas += d.total_paletas || 0;
      cliMap[k].despachos += 1;
    });
    setClientes(Object.values(cliMap).sort((a, b) => b.cajas - a.cajas));

    // Stock status
    const ss: StockStatus = { agotado: 0, minimo: 0, ok: 0, total: 0 };
    (saldos || []).forEach(s => {
      ss.total++;
      if (s.estado_stock === 'agotado') ss.agotado++;
      else if (s.estado_stock === 'minimo') ss.minimo++;
      else ss.ok++;
    });
    setStock(ss);

    // Recepción semana
    const totFrutas  = (receps || []).reduce((s, r) => s + (r.total_frutas  || 0), 0);
    const totEmp     = (receps || []).reduce((s, r) => s + (r.fruta_empacada || 0), 0);
    const totJugo    = (receps || []).reduce((s, r) => s + (r.fruta_jugo    || 0), 0);
    const totRechazo = (receps || []).reduce((s, r) => s + (r.fruta_rechazo || 0), 0);
    setRecepcion({ frutas: totFrutas, empacada: totEmp, jugo: totJugo, rechazo: totRechazo });

    // Rendimiento tendencia
    const rendMap: Record<string, { frutas: number; empacada: number }> = {};
    (recepsTend || []).forEach(r => {
      if (!rendMap[r.semana_id]) rendMap[r.semana_id] = { frutas: 0, empacada: 0 };
      rendMap[r.semana_id].frutas   += r.total_frutas    || 0;
      rendMap[r.semana_id].empacada += r.fruta_empacada  || 0;
    });
    setRendimiento(
      ultimas8
        .map(s => {
          const d = rendMap[s.id];
          return { codigo: s.codigo, pct: d && d.frutas > 0 ? parseFloat((d.empacada / d.frutas * 100).toFixed(1)) : 0 };
        })
        .reverse()
        .filter(s => s.pct > 0),
    );

    setLoading(false);
  }, [empresaId, semanaId, semanas]);

  useEffect(() => { loadDatos(); }, [loadDatos]);

  const semanaActual = semanas.find(s => s.id === semanaId);
  const totalCajas   = useMemo(() => calibres.reduce((s, c) => s + c.cajas, 0), [calibres]);

  // ── Leyenda personalizada calibres ───────────────────────────────────────
  function CalLeyenda() {
    return (
      <div className="flex flex-col gap-1 mt-1 px-2">
        {calibres.map((c, i) => {
          const pct = totalCajas > 0 ? (c.cajas / totalCajas * 100).toFixed(1) : '0';
          return (
            <div key={c.nombre} className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORES[i % COLORES.length] }} />
                <span style={{ color: 'var(--ink-muted)' }}>{c.nombre}</span>
              </span>
              <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                {fmt(c.cajas)} <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Dashboard de Empaque</h1>
          {semanaActual && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Semana {semanaActual.semana} — {semanaActual.fecha_inicio} al {semanaActual.fecha_fin}
            </p>
          )}
        </div>
        <select value={semanaId} onChange={e => setSemanaId(e.target.value)}
          className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
          {semanas.map(s => <option key={s.id} value={s.id}>{s.codigo} — {s.fecha_inicio}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-xs" style={{ color: 'var(--ink-faint)' }}>
          Cargando...
        </div>
      ) : (
        <>
          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Cajas empacadas',   value: fmt(kpis?.cajas    || 0), color: '#16a34a', icon: <Box size={14} /> },
              { label: 'Paletas',            value: fmt(kpis?.paletas  || 0), color: '#2563eb', icon: <Package size={14} /> },
              { label: 'Programas activos',  value: fmt(kpis?.programas|| 0), color: '#d97706', icon: <BarChart2 size={14} /> },
              { label: 'Despachos cerrados', value: fmt(kpis?.despachos|| 0), color: '#9333ea', icon: <TrendingUp size={14} /> },
            ].map(k => (
              <div key={k.label} className="rounded-lg p-4"
                style={{ background: `${k.color}18`, border: `1px solid ${k.color}44` }}>
                <p className="text-[10px] font-medium uppercase tracking-wider flex items-center gap-1" style={{ color: k.color }}>
                  {k.icon} {k.label}
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* ── Stock + Recepción fruta ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Stock inventario */}
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                <Package size={13} style={{ color: 'var(--accent)' }} /> Estado de inventario
              </p>
              {!stock || stock.total === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Sin datos de inventario</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: 'Agotado',  count: stock.agotado, color: '#ef4444', icon: <AlertTriangle size={14} /> },
                      { label: 'Mínimo',   count: stock.minimo,  color: '#f59e0b', icon: <AlertTriangle size={14} /> },
                      { label: 'OK',       count: stock.ok,      color: '#10b981', icon: <CheckCircle2  size={14} /> },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg p-2.5 text-center"
                        style={{ background: `${s.color}15`, border: `1px solid ${s.color}40` }}>
                        <div style={{ color: s.color }} className="flex justify-center mb-1">{s.icon}</div>
                        <div className="text-xl font-bold" style={{ color: s.color }}>{s.count}</div>
                        <div className="text-[9px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Barra proporcional */}
                  <div className="rounded-full overflow-hidden" style={{ height: 8 }}>
                    <div className="flex h-full">
                      <div style={{ width: `${stock.agotado / stock.total * 100}%`, background: '#ef4444' }} />
                      <div style={{ width: `${stock.minimo  / stock.total * 100}%`, background: '#f59e0b' }} />
                      <div style={{ width: `${stock.ok      / stock.total * 100}%`, background: '#10b981' }} />
                    </div>
                  </div>
                  <p className="text-[10px] mt-1.5 text-right" style={{ color: 'var(--ink-faint)' }}>
                    {stock.total} materiales en inventario
                  </p>
                </>
              )}
            </div>

            {/* Recepción de fruta */}
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                <Leaf size={13} style={{ color: 'var(--accent)' }} /> Recepción de fruta — semana
              </p>
              {!recepcion || recepcion.frutas === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Sin recepciones registradas</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Total frutas', value: fmt(recepcion.frutas),   color: 'var(--ink)' },
                      { label: 'Empacadas',    value: fmt(recepcion.empacada), color: '#10b981' },
                      { label: 'Rendimiento',
                        value: recepcion.frutas > 0 ? fmtPct(recepcion.empacada / recepcion.frutas * 100) : '—',
                        color: '#38bdf8' },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                        <div className="text-[9px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <FrutaBar empacada={recepcion.empacada} jugo={recepcion.jugo} rechazo={recepcion.rechazo} />
                  <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
                    <div style={{ color: 'var(--ink-faint)' }}>
                      Jugo: <span style={{ color: '#f59e0b' }}>{fmt(recepcion.jugo)}</span>
                    </div>
                    <div style={{ color: 'var(--ink-faint)' }}>
                      Rechazo: <span style={{ color: '#ef4444' }}>{fmt(recepcion.rechazo)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Tendencia cajas + Calibres donut ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Tendencia cajas */}
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--ink)' }}>Cajas empacadas — últimas semanas</p>
              {tendencia.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--ink-faint)' }}>Sin datos</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={tendencia} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="codigo" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} width={52} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="cajas" name="Cajas" radius={[3, 3, 0, 0]} maxBarSize={40}>
                      {tendencia.map((_, i) => (
                        <Cell key={i} fill={i === tendencia.length - 1 ? '#16a34a' : '#16a34a55'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Mix calibres mejorado */}
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink)' }}>Mix por calibre — semana</p>
              {calibres.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--ink-faint)' }}>Sin datos</p>
              ) : (
                <div className="flex gap-3">
                  <div style={{ flex: '0 0 160px' }}>
                    <DonutCentro data={calibres} total={totalCajas} />
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <CalLeyenda />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Rendimiento tendencia ── */}
          {rendimiento.length >= 2 && (
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                <TrendingUp size={13} style={{ color: 'var(--accent)' }} /> Rendimiento de fruta (%) — últimas semanas
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={rendimiento} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="codigo" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v}%`} domain={['auto', 'auto']} width={40} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11, color: '#f1f5f9' }}
                    formatter={(v: any) => [`${v}%`, 'Rendimiento']} />
                  <Line type="monotone" dataKey="pct" name="Rendimiento %"
                    stroke="#38bdf8" strokeWidth={2} dot={{ r: 4, fill: '#38bdf8', strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: '#38bdf8' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Avance de programas ── */}
          {avances.length > 0 && (
            <div className="rounded-lg p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--ink)' }}>Avance de programas — paletas</p>
              <div className="space-y-2.5">
                {avances.map(p => (
                  <div key={p.codigo}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium" style={{ color: 'var(--ink)' }}>
                        {p.codigo} <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>— {p.cliente}</span>
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                        {p.producidas} / {p.programadas} pal. ({p.pct}%)
                      </span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 7, background: 'var(--surface-overlay)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${p.pct}%`, background: p.pct >= 100 ? '#16a34a' : p.pct >= 60 ? '#2563eb' : '#d97706' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tabla clientes ── */}
          {clientes.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
              <div className="px-4 py-2.5" style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--line)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Resumen por cliente — despachos</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-overlay)', borderBottom: '1px solid var(--line)' }}>
                    {['Cliente', 'Cajas', 'Paletas', 'Despachos'].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-semibold" style={{ color: 'var(--ink-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, i) => (
                    <tr key={c.cliente} style={{ borderBottom: i < clientes.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <td className="px-4 py-2 font-medium" style={{ color: 'var(--ink)' }}>{c.cliente}</td>
                      <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--ink-muted)' }}>{fmt(c.cajas)}</td>
                      <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--ink-muted)' }}>{fmt(c.paletas)}</td>
                      <td className="px-4 py-2" style={{ color: 'var(--ink-muted)' }}>{c.despachos}</td>
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
