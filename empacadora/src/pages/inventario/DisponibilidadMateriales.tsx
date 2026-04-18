import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, PackageSearch, XCircle, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { selectCls } from '../../components/ui';

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Semana { id: string; codigo: string; fecha_inicio: string; }

interface OPC {
  id: string;
  calibre_id: string;
  calibre_nombre: string;
  marca_id: string | null;
  marca_nombre: string | null;
  paletas_programadas: number;
  paletas_producidas: number;
  cajas_por_paleta: number;
}

interface CalMat {
  calibre_id: string;
  marca_id: string | null;
  material_id: string;
  cantidad: number;
}

interface PaletaMat {
  material_id: string;
  cantidad: number;
}

interface Saldo {
  material_id: string;
  codigo: string | null;
  nombre: string;
  stock_bg: number;
  stock_ip: number;
  stock_total: number;
  stock_minimo: number;
  unidad_medida: string;
}

type FuenteMat = 'caja' | 'paleta' | 'ambos';

interface Row extends Saldo {
  necesidad:  number;
  producida:  number;   // ya consumida (paletas producidas)
  pendiente:  number;   // necesidad restante
  disponible: number;   // stock_total - pendiente
  estado: 'ok' | 'justo' | 'faltante' | 'sin_necesidad';
  fuente: FuenteMat;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function estadoRow(disponible: number, pendiente: number, necesidad: number): Row['estado'] {
  if (necesidad === 0)  return 'sin_necesidad';
  if (pendiente === 0)  return 'ok';
  if (disponible < 0)   return 'faltante';
  if (disponible < pendiente * 0.15) return 'justo';
  return 'ok';
}

function fmt(n: number) { return n.toLocaleString('es-CR', { maximumFractionDigits: 0 }); }

// ── Badge de estado ──────────────────────────────────────────────────────────
function EstadoBadge({ estado }: { estado: Row['estado'] }) {
  const map = {
    ok:           { label: 'Suficiente', bg: '#14532d', color: '#86efac', icon: <CheckCircle2 size={11} /> },
    justo:        { label: 'Justo',      bg: '#422006', color: '#fde68a', icon: <AlertTriangle size={11} /> },
    faltante:     { label: 'Faltante',   bg: '#450a0a', color: '#fca5a5', icon: <XCircle size={11} /> },
    sin_necesidad:{ label: '—',          bg: 'transparent', color: 'var(--ink-faint)', icon: null },
  };
  const m = map[estado];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold"
      style={{ background: m.bg, color: m.color }}>
      {m.icon}{m.label}
    </span>
  );
}

// ── Badge de fuente de consumo ────────────────────────────────────────────────
function FuenteBadge({ fuente }: { fuente: FuenteMat }) {
  if (fuente === 'caja') return null; // la mayoría — no hace ruido
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ml-1.5 align-middle"
      style={{ background: '#1e1a0a', color: '#fbbf24', border: '1px solid #92400e' }}
      title={fuente === 'paleta' ? 'Consumo por paleta' : 'Consumo por caja y por paleta'}
    >
      <Layers size={9} />
      {fuente === 'paleta' ? 'paleta' : 'caja+paleta'}
    </span>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DisponibilidadMateriales() {
  const empresaId = useEmpresaId();

  const [semanas,    setSemanas]    = useState<Semana[]>([]);
  const [semanaId,   setSemanaId]   = useState('');
  const [opcs,       setOpcs]       = useState<OPC[]>([]);
  const [calMats,    setCalMats]    = useState<CalMat[]>([]);
  const [paletaMats, setPaletaMats] = useState<PaletaMat[]>([]);
  const [saldos,     setSaldos]     = useState<Saldo[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [soloProb,   setSoloProb]   = useState(false);
  const [sortCol,    setSortCol]    = useState<'nombre' | 'necesidad' | 'disponible' | 'estado'>('estado');
  const [sortAsc,    setSortAsc]    = useState(true);

  // ── Cargar semanas al montar ────────────────────────────────────────────
  useEffect(() => {
    supabase.from('emp_semanas')
      .select('id, codigo, fecha_inicio')
      .eq('empresa_id', empresaId)
      .order('fecha_inicio', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setSemanas(data || []);
        if (data && data.length > 0) setSemanaId(data[0].id);
      });
  }, [empresaId]);

  // ── Cargar datos cuando cambia la semana ────────────────────────────────
  useEffect(() => {
    if (!semanaId) return;
    setLoading(true);

    Promise.all([
      // OPCs de todos los programas de la semana
      supabase
        .from('emp_programas_detalle')
        .select('id,calibre_id,calibre_nombre,marca_id,marca_nombre,paletas_programadas,paletas_producidas,cajas_por_paleta,programa:emp_programas!programa_id(semana_id)')
        .eq('programa.semana_id', semanaId),

      // Materiales por calibre de esta empresa
      supabase
        .from('emp_calibre_materiales')
        .select('calibre_id,marca_id,material_id,cantidad')
        .eq('empresa_id', empresaId),

      // Materiales por paleta de esta empresa
      supabase
        .from('emp_materiales_paleta')
        .select('material_id,cantidad')
        .eq('empresa_id', empresaId)
        .eq('activo', true),

      // Saldos actuales
      supabase
        .from('emp_v_saldos')
        .select('material_id,codigo,nombre,stock_bg,stock_ip,stock_total,stock_minimo,unidad_medida')
        .eq('empresa_id', empresaId),
    ]).then(([{ data: opcData }, { data: cmData }, { data: pmData }, { data: saldosData }]) => {
      setOpcs((opcData || []) as OPC[]);
      setCalMats(cmData || []);
      setPaletaMats((pmData || []) as PaletaMat[]);
      setSaldos(saldosData || []);
      setLoading(false);
    });
  }, [semanaId, empresaId]);

  // ── Calcular necesidades por material ───────────────────────────────────
  const necesidadMap = useMemo(() => {
    const total    = new Map<string, number>();
    const producida = new Map<string, number>();
    const cajaIds  = new Set<string>();
    const palIds   = new Set<string>();

    // ─ Materiales por CAJA (dependientes de calibre/marca) ─
    for (const opc of opcs) {
      const cajasTotales    = opc.paletas_programadas * opc.cajas_por_paleta;
      const cajasProducidas = opc.paletas_producidas  * opc.cajas_por_paleta;

      const mats = calMats.filter(cm =>
        cm.calibre_id === opc.calibre_id &&
        (cm.marca_id === null || cm.marca_id === opc.marca_id)
      );

      for (const cm of mats) {
        cajaIds.add(cm.material_id);
        total.set(cm.material_id,    (total.get(cm.material_id)    || 0) + cajasTotales    * cm.cantidad);
        producida.set(cm.material_id,(producida.get(cm.material_id)|| 0) + cajasProducidas * cm.cantidad);
      }
    }

    // ─ Materiales por PALETA (independientes de calibre/marca) ─
    const totalPaletas    = opcs.reduce((s, o) => s + o.paletas_programadas, 0);
    const producidaPaletas = opcs.reduce((s, o) => s + o.paletas_producidas,  0);

    for (const pm of paletaMats) {
      palIds.add(pm.material_id);
      total.set(pm.material_id,    (total.get(pm.material_id)    || 0) + totalPaletas    * pm.cantidad);
      producida.set(pm.material_id,(producida.get(pm.material_id)|| 0) + producidaPaletas * pm.cantidad);
    }

    return { total, producida, cajaIds, palIds };
  }, [opcs, calMats, paletaMats]);

  // ── Construir filas de la tabla ──────────────────────────────────────────
  const rows = useMemo((): Row[] => {
    const { total, producida, cajaIds, palIds } = necesidadMap;
    const allIds = Array.from(new Set([...Array.from(total.keys()), ...saldos.map(s => s.material_id)]));
    const saldoMap = new Map(saldos.map(s => [s.material_id, s]));

    const result: Row[] = [];

    for (const matId of allIds) {
      const saldo = saldoMap.get(matId);
      if (!saldo) continue;

      const necesidad  = total.get(matId)    || 0;
      const producidaQ = producida.get(matId) || 0;
      const pendiente  = Math.max(0, necesidad - producidaQ);
      const disponible = saldo.stock_total - pendiente;
      const estado     = estadoRow(disponible, pendiente, necesidad);

      const esCaja  = cajaIds.has(matId);
      const esPal   = palIds.has(matId);
      const fuente: FuenteMat = esCaja && esPal ? 'ambos' : esPal ? 'paleta' : 'caja';

      result.push({ ...saldo, necesidad, producida: producidaQ, pendiente, disponible, estado, fuente });
    }

    return result;
  }, [necesidadMap, saldos]);

  // ── Filtrar y ordenar ────────────────────────────────────────────────────
  const rowsFiltrados = useMemo(() => {
    let r = rows.filter(r =>
      r.estado !== 'sin_necesidad' &&
      (!soloProb || r.estado === 'faltante' || r.estado === 'justo')
    );

    const orden = { faltante: 0, justo: 1, ok: 2, sin_necesidad: 3 };
    r = [...r].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'estado')       cmp = orden[a.estado] - orden[b.estado];
      else if (sortCol === 'nombre')  cmp = a.nombre.localeCompare(b.nombre);
      else if (sortCol === 'necesidad')  cmp = b.necesidad - a.necesidad;
      else if (sortCol === 'disponible') cmp = a.disponible - b.disponible;
      return sortAsc ? cmp : -cmp;
    });
    return r;
  }, [rows, soloProb, sortCol, sortAsc]);

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const withNeed = rows.filter(r => r.estado !== 'sin_necesidad');
    return {
      faltante: withNeed.filter(r => r.estado === 'faltante').length,
      justo:    withNeed.filter(r => r.estado === 'justo').length,
      ok:       withNeed.filter(r => r.estado === 'ok').length,
      total:    withNeed.length,
    };
  }, [rows]);

  // ── Totales paletas para la info bar ─────────────────────────────────────
  const totPalProg = opcs.reduce((s, o) => s + o.paletas_programadas, 0);
  const totPalProd = opcs.reduce((s, o) => s + o.paletas_producidas,  0);

  // ── Semana seleccionada ──────────────────────────────────────────────────
  const semanaActual = semanas.find(s => s.id === semanaId);

  // ── Helpers de columna ordenable ────────────────────────────────────────
  function ThSort({ col, label, right }: { col: typeof sortCol; label: string; right?: boolean }) {
    const active = sortCol === col;
    return (
      <th className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
        style={{ color: active ? 'var(--accent)' : 'var(--ink-faint)' }}
        onClick={() => { if (sortCol === col) setSortAsc(a => !a); else { setSortCol(col); setSortAsc(true); } }}>
        <span className="inline-flex items-center gap-1">
          {label}
          {active ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null}
        </span>
      </th>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PackageSearch size={22} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              Disponibilidad de Materiales
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
              Necesidad proyectada del programa vs stock actual
            </p>
          </div>
        </div>

        {/* Selector semana */}
        <select
          className={selectCls}
          value={semanaId}
          onChange={e => setSemanaId(e.target.value)}
          style={{ minWidth: 180 }}>
          {semanas.map(s => (
            <option key={s.id} value={s.id}>
              {s.codigo} — {new Date(s.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--ink-muted)' }}>
          Calculando disponibilidad...
        </div>
      ) : !semanaId ? (
        <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--ink-muted)' }}>
          Seleccioná una semana
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Con faltante',     val: kpis.faltante, bg: '#450a0a', border: '#7f1d1d', color: '#f87171' },
              { label: 'Stock justo',      val: kpis.justo,    bg: '#422006', border: '#92400e', color: '#fbbf24' },
              { label: 'Suficiente',       val: kpis.ok,       bg: '#14532d', border: '#166534', color: '#4ade80' },
              { label: 'Total analizados', val: kpis.total,    bg: 'var(--surface-raised)', border: 'var(--line)', color: 'var(--ink)' },
            ].map(k => (
              <div key={k.label} className="rounded-xl p-4 text-center"
                style={{ background: k.bg, border: `1px solid ${k.border}` }}>
                <div className="text-2xl font-bold" style={{ color: k.color }}>{k.val}</div>
                <div className="text-xs mt-1" style={{ color: k.color, opacity: 0.8 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Barra de semana actual */}
          {semanaActual && opcs.length > 0 && (
            <div className="rounded-lg px-4 py-2 text-xs flex flex-wrap gap-4"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
              <span><strong style={{ color: 'var(--ink)' }}>Semana:</strong> {semanaActual.codigo}</span>
              <span><strong style={{ color: 'var(--ink)' }}>OPCs:</strong> {opcs.length}</span>
              <span><strong style={{ color: 'var(--ink)' }}>Paletas prog.:</strong> {fmt(totPalProg)}</span>
              <span><strong style={{ color: 'var(--ink)' }}>Paletas prod.:</strong> {fmt(totPalProd)}</span>
              <span><strong style={{ color: 'var(--ink)' }}>Cajas programadas:</strong> {fmt(opcs.reduce((s, o) => s + o.paletas_programadas * o.cajas_por_paleta, 0))}</span>
              <span><strong style={{ color: 'var(--ink)' }}>Cajas producidas:</strong> {fmt(opcs.reduce((s, o) => s + o.paletas_producidas * o.cajas_por_paleta, 0))}</span>
              {paletaMats.length > 0 && (
                <span className="inline-flex items-center gap-1" style={{ color: '#fbbf24' }}>
                  <Layers size={11} />
                  {paletaMats.length} mat. por paleta configurados
                </span>
              )}
            </div>
          )}

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--ink-muted)' }}>
              <input type="checkbox" checked={soloProb}
                onChange={e => setSoloProb(e.target.checked)}
                className="accent-blue-500" />
              Solo faltante / stock justo
            </label>
            {rowsFiltrados.length > 0 && (
              <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {rowsFiltrados.length} material{rowsFiltrados.length !== 1 ? 'es' : ''}
              </span>
            )}
          </div>

          {/* Tabla */}
          {rowsFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2"
              style={{ color: 'var(--ink-faint)' }}>
              <CheckCircle2 size={32} style={{ color: '#4ade80', opacity: 0.6 }} />
              <p className="text-sm">Todos los materiales tienen stock suficiente</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 780 }}>
                  <thead style={{ background: 'var(--surface-deep)' }}>
                    <tr>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--ink-faint)', width: 90 }}>Código</th>
                      <ThSort col="nombre"     label="Material" />
                      <ThSort col="necesidad"  label="Necesidad total" right />
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--ink-faint)' }}>Ya consumida</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--ink-faint)' }}>Pendiente</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--ink-faint)' }}>Stock BG</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--ink-faint)' }}>Stock IP</th>
                      <ThSort col="disponible" label="Diferencia" right />
                      <ThSort col="estado"     label="Estado" />
                    </tr>
                  </thead>
                  <tbody>
                    {rowsFiltrados.map(r => {
                      const esFaltante = r.estado === 'faltante';
                      const esJusto    = r.estado === 'justo';
                      return (
                        <tr key={r.material_id}
                          style={{
                            borderTop: '1px solid var(--line)',
                            background: esFaltante ? 'rgba(127,29,29,0.15)'
                              : esJusto ? 'rgba(120,53,15,0.12)' : undefined,
                          }}>
                          {/* Código */}
                          <td className="px-3 py-2.5">
                            <span className="font-mono text-xs" style={{ color: '#60a5fa' }}>
                              {r.codigo || '—'}
                            </span>
                          </td>

                          {/* Nombre + badge fuente */}
                          <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--ink)' }}>
                            {r.nombre}
                            <span className="ml-1.5 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                              {r.unidad_medida}
                            </span>
                            <FuenteBadge fuente={r.fuente} />
                          </td>

                          {/* Necesidad total */}
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                            {fmt(r.necesidad)}
                          </td>

                          {/* Ya consumida */}
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: '#38bdf8', fontSize: 13 }}>
                            {fmt(r.producida)}
                          </td>

                          {/* Pendiente */}
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                            {fmt(r.pendiente)}
                          </td>

                          {/* Stock BG */}
                          <td className="px-3 py-2.5 text-right tabular-nums text-xs" style={{ color: '#94a3b8' }}>
                            {fmt(r.stock_bg)}
                          </td>

                          {/* Stock IP */}
                          <td className="px-3 py-2.5 text-right tabular-nums text-xs" style={{ color: '#60a5fa' }}>
                            {fmt(r.stock_ip)}
                          </td>

                          {/* Diferencia */}
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                            style={{ color: esFaltante ? '#f87171' : esJusto ? '#fbbf24' : '#4ade80' }}>
                            {r.disponible >= 0 ? '+' : ''}{fmt(r.disponible)}
                          </td>

                          {/* Estado */}
                          <td className="px-3 py-2.5">
                            <EstadoBadge estado={r.estado} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Leyenda */}
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--ink-faint)' }}>
            <span><strong style={{ color: '#f87171' }}>Faltante</strong> — stock insuficiente para completar el programa</span>
            <span><strong style={{ color: '#fbbf24' }}>Justo</strong> — margen menor al 15% de la necesidad pendiente</span>
            <span><strong style={{ color: '#4ade80' }}>Suficiente</strong> — stock disponible con margen adecuado</span>
            <span className="inline-flex items-center gap-1"><Layers size={10} style={{ color: '#fbbf24' }} /><strong style={{ color: '#fbbf24' }}>paleta</strong> — consumo por paleta (tarimas, esquineros, flejes…)</span>
          </div>
        </>
      )}
    </div>
  );
}
