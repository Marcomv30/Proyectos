import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { BarChart2, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { selectCls } from '../../components/ui';

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Semana { id: string; codigo: string; fecha_inicio: string; }

interface Boleta {
  id: string;
  fecha: string;
  calibre_nombre: string;
  marca_nombre: string | null;
  tipo: string;
  cajas_empacadas: number;
  cajas_por_paleta: number;
  total_frutas: number;
  puchos: number;
  puchos_2: number;
  puchos_3: number;
  lote: string | null;
  programa?: { cliente_nombre: string } | null;
}

interface DiaGroup {
  fecha: string;
  fechaLabel: string;
  cajas: number;
  paletas: number;
  frutas: number;
  puchos: number;
  detalle: CalGroup[];
}

interface CalGroup {
  key: string;
  calibre: string;
  marca: string;
  cajas: number;
  paletas: number;
  frutas: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString('es-CR', { maximumFractionDigits: 0 });
const fmtF = (n: number) => n.toLocaleString('es-CR');

const COLORES = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316'];

function fechaLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CR', { weekday: 'short', day: '2-digit', month: 'short' });
}

// ── Tooltip personalizado ─────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}>
      <p className="font-semibold mb-1">{label}</p>
      <p>Cajas: <strong>{fmt(payload[0]?.value || 0)}</strong></p>
      {payload[1] && <p>Paletas: <strong>{fmt(payload[1]?.value || 0)}</strong></p>}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReporteProduccion() {
  const empresaId = useEmpresaId();

  const [semanas,  setSemanas]  = useState<Semana[]>([]);
  const [semanaId, setSemanaId] = useState('');
  const [boletas,  setBoletas]  = useState<Boleta[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Semanas ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('emp_semanas')
      .select('id, codigo, fecha_inicio')
      .eq('empresa_id', empresaId)
      .order('fecha_inicio', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setSemanas(data || []);
        if (data?.length) setSemanaId(data[0].id);
      });
  }, [empresaId]);

  // ── Boletas de la semana ──────────────────────────────────────────────────
  useEffect(() => {
    if (!semanaId) return;
    setLoading(true);
    supabase
      .from('emp_boletas')
      .select('id,fecha,calibre_nombre,marca_nombre,tipo,cajas_empacadas,cajas_por_paleta,total_frutas,puchos,puchos_2,puchos_3,lote,programa:emp_programas!programa_id(cliente_nombre)')
      .eq('empresa_id', empresaId)
      .eq('semana_id', semanaId)
      .eq('aplica', true)
      .order('fecha')
      .then(({ data }) => {
        setBoletas((data as any) || []);
        setLoading(false);
        setExpanded(new Set()); // colapsar al cambiar semana
      });
  }, [semanaId, empresaId]);

  // ── Agrupación por día → calibre/marca ───────────────────────────────────
  const diasGroup = useMemo((): DiaGroup[] => {
    const map = new Map<string, DiaGroup>();

    for (const b of boletas) {
      const fecha = b.fecha;
      if (!map.has(fecha)) {
        map.set(fecha, {
          fecha,
          fechaLabel: fechaLabel(fecha),
          cajas: 0, paletas: 0, frutas: 0, puchos: 0,
          detalle: [],
        });
      }
      const dia = map.get(fecha)!;
      const paletas = b.cajas_por_paleta > 0 ? b.cajas_empacadas / b.cajas_por_paleta : 0;
      const puchosTotal = (b.puchos || 0) + (b.puchos_2 || 0) + (b.puchos_3 || 0);

      dia.cajas   += b.cajas_empacadas;
      dia.paletas += paletas;
      dia.frutas  += b.total_frutas || 0;
      dia.puchos  += puchosTotal;

      const calKey = `${b.calibre_nombre}||${b.marca_nombre || ''}`;
      let cal = dia.detalle.find(d => d.key === calKey);
      if (!cal) {
        cal = { key: calKey, calibre: b.calibre_nombre, marca: b.marca_nombre || '—', cajas: 0, paletas: 0, frutas: 0 };
        dia.detalle.push(cal);
      }
      cal.cajas   += b.cajas_empacadas;
      cal.paletas += paletas;
      cal.frutas  += b.total_frutas || 0;
    }

    return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [boletas]);

  // ── KPIs globales ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    cajas:   diasGroup.reduce((s, d) => s + d.cajas, 0),
    paletas: diasGroup.reduce((s, d) => s + d.paletas, 0),
    frutas:  diasGroup.reduce((s, d) => s + d.frutas, 0),
    puchos:  diasGroup.reduce((s, d) => s + d.puchos, 0),
    dias:    diasGroup.length,
    promCajas: diasGroup.length > 0
      ? diasGroup.reduce((s, d) => s + d.cajas, 0) / diasGroup.length
      : 0,
  }), [diasGroup]);

  // ── Calibres únicos para colores ──────────────────────────────────────────
  const calibresUnicos = useMemo(() => {
    const set = new Set(boletas.map(b => b.calibre_nombre));
    return Array.from(set);
  }, [boletas]);

  const colorCal = (cal: string) => {
    const i = calibresUnicos.indexOf(cal);
    return COLORES[i % COLORES.length];
  };

  // ── Toggle expand día ─────────────────────────────────────────────────────
  function toggleDia(fecha: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(fecha) ? next.delete(fecha) : next.add(fecha);
      return next;
    });
  }

  const semanaActual = semanas.find(s => s.id === semanaId);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart2 size={22} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Reporte de Producción</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
              Producción diaria por calibre y marca
            </p>
          </div>
        </div>
        <select className={selectCls} value={semanaId}
          onChange={e => setSemanaId(e.target.value)} style={{ minWidth: 180 }}>
          {semanas.map(s => (
            <option key={s.id} value={s.id}>
              {s.codigo} — {new Date(s.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--ink-muted)' }}>
          Cargando datos...
        </div>
      ) : diasGroup.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--ink-muted)' }}>
          Sin producción registrada para esta semana
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Días trabajados', val: kpis.dias,                      color: 'var(--ink)',  fmt: (n:number) => n.toString() },
              { label: 'Total cajas',     val: kpis.cajas,                     color: '#60a5fa',     fmt: fmt },
              { label: 'Total paletas',   val: Math.round(kpis.paletas),       color: '#a78bfa',     fmt: fmt },
              { label: 'Total frutas',    val: kpis.frutas,                    color: '#34d399',     fmt: fmtF },
              { label: 'Puchos',          val: kpis.puchos,                    color: '#f59e0b',     fmt: fmt },
              { label: 'Prom. cajas/día', val: Math.round(kpis.promCajas),     color: '#38bdf8',     fmt: fmt },
            ].map(k => (
              <div key={k.label} className="rounded-xl p-3 text-center"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <div className="text-xl font-bold" style={{ color: k.color }}>{k.fmt(k.val)}</div>
                <div className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Gráfico barras por día */}
          <div className="rounded-xl p-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Cajas por día</span>
              {semanaActual && (
                <span className="text-xs ml-auto" style={{ color: 'var(--ink-faint)' }}>{semanaActual.codigo}</span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={diasGroup} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="fechaLabel" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                  tickFormatter={v => fmt(v)} width={55} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="cajas" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {diasGroup.map((d, i) => (
                    <Cell key={d.fecha} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla diaria expandible */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
            {/* Cabecera tabla */}
            <div className="grid text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5"
              style={{
                background: 'var(--surface-deep)', color: 'var(--ink-faint)',
                gridTemplateColumns: '1fr 80px 80px 100px 90px 28px',
              }}>
              <span>Día / Calibre</span>
              <span className="text-right">Cajas</span>
              <span className="text-right">Paletas</span>
              <span className="text-right">Frutas</span>
              <span className="text-right">Puchos</span>
              <span />
            </div>

            {diasGroup.map((dia, di) => {
              const isOpen = expanded.has(dia.fecha);
              const pct = kpis.cajas > 0 ? (dia.cajas / kpis.cajas * 100).toFixed(1) : '0';
              return (
                <div key={dia.fecha} style={{ borderTop: di > 0 ? '1px solid var(--line)' : undefined }}>

                  {/* Fila día */}
                  <button
                    className="w-full grid items-center px-4 py-3 text-left transition-colors hover:bg-white/5"
                    style={{ gridTemplateColumns: '1fr 80px 80px 100px 90px 28px' }}
                    onClick={() => toggleDia(dia.fecha)}>
                    <span>
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                        {dia.fechaLabel}
                      </span>
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--surface-overlay)', color: 'var(--ink-faint)' }}>
                        {pct}%
                      </span>
                    </span>
                    <span className="text-right font-bold tabular-nums" style={{ color: '#60a5fa' }}>{fmt(dia.cajas)}</span>
                    <span className="text-right tabular-nums" style={{ color: '#a78bfa' }}>{fmt(Math.round(dia.paletas))}</span>
                    <span className="text-right tabular-nums text-xs" style={{ color: '#34d399' }}>{fmtF(dia.frutas)}</span>
                    <span className="text-right tabular-nums text-xs" style={{ color: '#f59e0b' }}>{fmt(dia.puchos)}</span>
                    <span className="flex justify-end" style={{ color: 'var(--ink-faint)' }}>
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>

                  {/* Detalle calibres del día */}
                  {isOpen && (
                    <div style={{ background: 'var(--surface-deep)', borderTop: '1px solid var(--line)' }}>
                      {[...dia.detalle]
                        .sort((a, b) => b.cajas - a.cajas)
                        .map(cal => (
                          <div key={cal.key}
                            className="grid items-center px-6 py-2 text-xs"
                            style={{ gridTemplateColumns: '1fr 80px 80px 100px 90px 28px', borderTop: '1px solid var(--line)' }}>
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: colorCal(cal.calibre) }} />
                              <span style={{ color: 'var(--ink-muted)' }}>
                                <span className="font-medium">{cal.calibre}</span>
                                {cal.marca !== '—' && (
                                  <span style={{ color: 'var(--ink-faint)' }}> / {cal.marca}</span>
                                )}
                              </span>
                            </span>
                            <span className="text-right tabular-nums font-semibold" style={{ color: '#60a5fa' }}>{fmt(cal.cajas)}</span>
                            <span className="text-right tabular-nums" style={{ color: '#a78bfa' }}>{fmt(Math.round(cal.paletas))}</span>
                            <span className="text-right tabular-nums" style={{ color: '#34d399' }}>{fmtF(cal.frutas)}</span>
                            <span className="text-right" style={{ color: 'var(--ink-faint)' }}>—</span>
                            <span />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Total general */}
            <div className="grid items-center px-4 py-3 text-sm font-bold"
              style={{
                gridTemplateColumns: '1fr 80px 80px 100px 90px 28px',
                borderTop: '2px solid var(--line)',
                background: 'var(--surface-deep)',
                color: 'var(--ink)',
              }}>
              <span>TOTAL SEMANA</span>
              <span className="text-right tabular-nums" style={{ color: '#60a5fa' }}>{fmt(kpis.cajas)}</span>
              <span className="text-right tabular-nums" style={{ color: '#a78bfa' }}>{fmt(Math.round(kpis.paletas))}</span>
              <span className="text-right tabular-nums text-xs" style={{ color: '#34d399' }}>{fmtF(kpis.frutas)}</span>
              <span className="text-right tabular-nums text-xs" style={{ color: '#f59e0b' }}>{fmt(kpis.puchos)}</span>
              <span />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
