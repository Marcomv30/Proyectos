/**
 * LiquidacionIP.tsx
 * Liquidación del inventario en proceso (IP) al cierre de semana.
 *
 * Fase 1 — Cotejo AJ-IP : corrige diferencias físicas vs sistema (+/-)
 * Fase 2 — Retorno IP→BG: traslada el saldo restante a Bodega General
 *
 * El trigger emp_fn_actualizar_stock actualiza emp_inv_materiales
 * automáticamente en cada inserción a emp_mov_materiales.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Scale, AlertTriangle, CheckCircle2, RotateCcw,
  ChevronRight, ArrowRightLeft, Warehouse,
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { selectCls } from '../../components/ui';
import { getCostaRicaDateISO } from '../../utils/costaRicaTime';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Semana { id: string; codigo: string; fecha_inicio: string; }
interface Bodega  { id: string; nombre: string; tipo?: string; }

interface MatRow {
  material_id: string;
  codigo?: string;
  nombre: string;
  tipo: string;
  unidad: string;
  stock: number;
  conteo: string;   // AJ-IP: conteo físico ('')= no ingresado
}

interface RetRow {
  material_id: string;
  nombre: string;
  unidad: string;
  stock: number;    // stock IP actual (tras AJ)
  cantidad: string; // cantidad a retornar (default = stock)
}

interface AjMov {
  id: string;
  tipo: 'entrada' | 'salida';
  cantidad: number;
  material_id: string;
  material_nombre: string;
  created_at: string;
}

interface RetMov {
  id: string;
  cantidad: number;
  material_id: string;
  material_nombre: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => Math.abs(n).toLocaleString('es-CR', { maximumFractionDigits: 0 });
const fmtN = (n: number) => n.toLocaleString('es-CR', { maximumFractionDigits: 0 });

function difColor(dif: number | null) {
  if (dif === null || dif === 0) return 'var(--ink-faint)';
  return dif > 0 ? '#10b981' : '#ef4444';
}

// ── Badge tipo movimiento ──────────────────────────────────────────────────────
function AjBadge({ dif }: { dif: number }) {
  const pos = dif > 0;
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold"
      style={{
        background: pos ? '#10b98120' : '#ef444420',
        color: pos ? '#10b981' : '#ef4444',
        border: `1px solid ${pos ? '#10b98140' : '#ef444440'}`,
      }}>
      {pos ? 'AJ+' : 'AJ−'}
    </span>
  );
}

// ── Modal AJ-IP ────────────────────────────────────────────────────────────────
function ConfirmAJ({ ajustes, semCodigo, rectificando, onCancel, onConfirm, applying }: {
  ajustes: { material_id: string; nombre: string; stock: number; conteo: number; dif: number }[];
  semCodigo: string;
  rectificando: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  applying: boolean;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="rounded-xl w-full max-w-lg shadow-2xl"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--ink)' }}>
            {rectificando ? '⚠ Reemplazar AJ-IP' : 'Confirmar AJ-IP'} — Semana {semCodigo}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
            {ajustes.length === 0 ? 'Sin diferencias — IP conciliado' : `${ajustes.length} material(es) con diferencia`}
            {rectificando && ' · Se revertirá el ajuste anterior'}
          </p>
        </div>
        <div className="px-5 py-3 max-h-64 overflow-y-auto">
          {ajustes.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <CheckCircle2 size={28} style={{ color: '#10b981' }} />
              <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>IP conciliado — sin movimientos</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--ink-faint)' }}>
                  <th className="text-left pb-2 pr-3">Material</th>
                  <th className="text-right pb-2 px-2">Sistema</th>
                  <th className="text-right pb-2 px-2">Físico</th>
                  <th className="text-right pb-2 pl-2">Diferencia</th>
                  <th className="text-center pb-2 pl-2">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {ajustes.map(r => (
                  <tr key={r.material_id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="py-2 pr-3" style={{ color: 'var(--ink)' }}>{r.nombre}</td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: '#60a5fa' }}>{fmt(r.stock)}</td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--ink-muted)' }}>{fmt(r.conteo)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums font-bold" style={{ color: difColor(r.dif) }}>
                      {r.dif > 0 ? '+' : '−'}{fmt(r.dif)}
                    </td>
                    <td className="py-2 pl-2 text-center"><AjBadge dif={r.dif} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--line)' }}>
          <button onClick={onCancel} disabled={applying}
            className="px-4 py-2 rounded text-sm"
            style={{ background: 'var(--surface-overlay)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={applying}
            className="px-5 py-2 rounded text-sm font-bold"
            style={{ background: 'var(--accent)', color: 'white', opacity: applying ? 0.6 : 1 }}>
            {applying ? 'Aplicando...' : ajustes.length === 0 ? 'Confirmar (sin movimientos)' : `Aplicar ${ajustes.length} AJ`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Modal Retorno IP → BG ──────────────────────────────────────────────────────
function ConfirmRetorno({ retRows, semCodigo, bodegaBG, onCancel, onConfirm, applying }: {
  retRows: RetRow[];
  semCodigo: string;
  bodegaBG: Bodega | null;
  onCancel: () => void;
  onConfirm: () => void;
  applying: boolean;
}) {
  const validos = retRows.filter(r => r.cantidad !== '' && Number(r.cantidad) > 0);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="rounded-xl w-full max-w-lg shadow-2xl"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--ink)' }}>
            Confirmar Retorno IP → BG — Semana {semCodigo}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
            {validos.length} material(es) · Destino: {bodegaBG?.nombre || 'BG'}
          </p>
        </div>
        <div className="px-5 py-3 max-h-64 overflow-y-auto">
          {validos.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--ink-faint)' }}>
              Sin materiales a retornar
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--ink-faint)' }}>
                  <th className="text-left pb-2 pr-3">Material</th>
                  <th className="text-right pb-2 px-2">Stock IP</th>
                  <th className="text-right pb-2 pl-2">Retorna</th>
                  <th className="text-right pb-2 pl-2">Queda en IP</th>
                </tr>
              </thead>
              <tbody>
                {validos.map(r => (
                  <tr key={r.material_id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="py-2 pr-3" style={{ color: 'var(--ink)' }}>{r.nombre}</td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: '#60a5fa' }}>{fmt(r.stock)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums font-bold" style={{ color: '#a78bfa' }}>
                      {fmtN(Number(r.cantidad))} {r.unidad}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums"
                      style={{ color: r.stock - Number(r.cantidad) === 0 ? '#10b981' : '#f59e0b' }}>
                      {fmtN(r.stock - Number(r.cantidad))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--line)' }}>
          <button onClick={onCancel} disabled={applying}
            className="px-4 py-2 rounded text-sm"
            style={{ background: 'var(--surface-overlay)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={applying || validos.length === 0}
            className="px-5 py-2 rounded text-sm font-bold"
            style={{ background: '#7c3aed', color: 'white', opacity: (applying || validos.length === 0) ? 0.5 : 1 }}>
            {applying ? 'Trasladando...' : `Retornar ${validos.length} material(es)`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function LiquidacionIP() {
  const empresaId = useEmpresaId();

  const [semanas,       setSemanas]       = useState<Semana[]>([]);
  const [semanaId,      setSemanaId]      = useState('');
  const [bodegaIP,      setBodegaIP]      = useState<Bodega | null>(null);
  const [bodegaBG,      setBodegaBG]      = useState<Bodega | null>(null);

  // Fase 1 — AJ-IP
  const [rows,          setRows]          = useState<MatRow[]>([]);
  const [ajMov,         setAjMov]         = useState<AjMov[]>([]);
  const [rectificando,  setRectificando]  = useState(false);
  const [confirmAJ,     setConfirmAJ]     = useState(false);
  const [applyingAJ,    setApplyingAJ]    = useState(false);

  // Fase 2 — Retorno
  const [retRows,       setRetRows]       = useState<RetRow[]>([]);
  const [retMov,        setRetMov]        = useState<RetMov[]>([]);
  const [confirmRet,    setConfirmRet]    = useState(false);
  const [applyingRet,   setApplyingRet]   = useState(false);

  const [loading,       setLoading]       = useState(false);
  const [msg,           setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ── Semanas ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('emp_semanas')
      .select('id, codigo, fecha_inicio')
      .eq('empresa_id', empresaId)
      .order('fecha_inicio', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setSemanas(data || []);
        if (data?.length) setSemanaId((data[0] as any).id);
      });
  }, [empresaId]);

  // ── Bodegas ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('emp_bodegas')
      .select('id, nombre, tipo, es_principal')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('es_principal', { ascending: false })
      .then(({ data }) => {
        const bods = (data || []) as (Bodega & { es_principal: boolean })[];
        // IP: única bodega con tipo='IP'
        const ip = bods.find(b => b.tipo === 'IP') || null;
        // BG: entre las tipo='BG', preferir la principal (es_principal=true)
        const bgCandidatos = bods.filter(b => b.tipo === 'BG');
        const bg = bgCandidatos.find(b => b.es_principal) || bgCandidatos[0] || null;
        setBodegaIP(ip);
        setBodegaBG(bg);
      });
  }, [empresaId]);

  // ── refAJ / refRET ────────────────────────────────────────────────────────
  const semana = semanas.find(s => s.id === semanaId);
  const refAJ  = semana ? `AJ-IP-${semana.codigo}`  : '';
  const refRET = semana ? `RET-IP-${semana.codigo}` : '';

  // ── Carga de datos ────────────────────────────────────────────────────────
  const loadDatos = useCallback(async () => {
    if (!semanaId || !bodegaIP || !refAJ) return;
    setLoading(true);
    setMsg(null);

    const [{ data: inv }, { data: ajMovs }, { data: retMovs }] = await Promise.all([
      // Stock actual IP
      supabase.from('emp_inv_materiales')
        .select('material_id, stock_actual, material:emp_materiales(codigo, nombre, tipo, unidad_medida)')
        .eq('empresa_id', empresaId)
        .eq('bodega_id', bodegaIP.id)
        .gt('stock_actual', 0),

      // AJ-IP ya aplicados
      supabase.from('emp_mov_materiales')
        .select('id, tipo, cantidad, material_id, created_at, material:emp_materiales!material_id(nombre)')
        .eq('empresa_id', empresaId)
        .eq('referencia', refAJ)
        .order('created_at'),

      // Retorno ya aplicado
      supabase.from('emp_mov_materiales')
        .select('id, cantidad, material_id, created_at, material:emp_materiales!material_id(nombre)')
        .eq('empresa_id', empresaId)
        .eq('referencia', refRET)
        .order('created_at'),
    ]);

    const matRows: MatRow[] = (inv || []).map((i: any) => ({
      material_id: i.material_id,
      codigo:      i.material?.codigo,
      nombre:      i.material?.nombre || i.material_id,
      tipo:        i.material?.tipo   || '',
      unidad:      i.material?.unidad_medida || 'u',
      stock:       i.stock_actual,
      conteo:      '',
    }));
    setRows(matRows);

    // Retorno: mismos materiales, cantidad default = stock completo
    setRetRows(matRows.map(r => ({ ...r, cantidad: String(r.stock) })));

    setAjMov((ajMovs || []).map((m: any) => ({
      id: m.id, tipo: m.tipo, cantidad: m.cantidad,
      material_id: m.material_id,
      material_nombre: m.material?.nombre || m.material_id,
      created_at: m.created_at,
    })));

    setRetMov((retMovs || []).map((m: any) => ({
      id: m.id, cantidad: m.cantidad,
      material_id: m.material_id,
      material_nombre: m.material?.nombre || m.material_id,
      created_at: m.created_at,
    })));

    setRectificando(false);
    setLoading(false);
  }, [semanaId, bodegaIP, refAJ, refRET, empresaId]);

  useEffect(() => { loadDatos(); }, [loadDatos]);

  // ── Handlers AJ ──────────────────────────────────────────────────────────
  const setConteo = (material_id: string, val: string) =>
    setRows(prev => prev.map(r => r.material_id === material_id ? { ...r, conteo: val } : r));

  const liquidarTodoACero = () =>
    setRows(prev => prev.map(r => ({ ...r, conteo: '0' })));

  // ── Handlers Retorno ──────────────────────────────────────────────────────
  const setCantidadRet = (material_id: string, val: string) =>
    setRetRows(prev => prev.map(r => r.material_id === material_id ? { ...r, cantidad: val } : r));

  const retornarTodo = () =>
    setRetRows(prev => prev.map(r => ({ ...r, cantidad: String(r.stock) })));

  // ── Computed AJ ───────────────────────────────────────────────────────────
  const ajustesPreview = useMemo(() =>
    rows
      .filter(r => r.conteo !== '')
      .map(r => ({ ...r, conteo: Number(r.conteo), dif: Number(r.conteo) - r.stock }))
      .filter(r => r.dif !== 0),
    [rows]);

  const kpisAJ = useMemo(() => ({
    totalIP:    rows.length,
    conDif:     ajustesPreview.length,
    ajPos:      ajustesPreview.filter(r => r.dif > 0).reduce((s, r) => s + r.dif, 0),
    ajNeg:      ajustesPreview.filter(r => r.dif < 0).reduce((s, r) => s + Math.abs(r.dif), 0),
    ingresados: rows.filter(r => r.conteo !== '').length,
  }), [rows, ajustesPreview]);

  // ── Computed Retorno ──────────────────────────────────────────────────────
  const totalRetorno = useMemo(() =>
    retRows.reduce((s, r) => s + (r.cantidad !== '' ? Number(r.cantidad) : 0), 0),
    [retRows]);

  const quedaEnIP = useMemo(() =>
    retRows.reduce((s, r) => s + r.stock - (r.cantidad !== '' ? Number(r.cantidad) : 0), 0),
    [retRows]);

  // ── Aplicar AJ-IP ─────────────────────────────────────────────────────────
  const aplicarAJ = async () => {
    if (!bodegaIP || !refAJ) return;
    setApplyingAJ(true);
    setMsg(null);
    const hoy = getCostaRicaDateISO();
    try {
      // Revertir ajuste anterior si rectificando
      if (rectificando && ajMov.length > 0) {
        const rev = ajMov.map(m => ({
          empresa_id: empresaId, material_id: m.material_id, bodega_id: bodegaIP.id,
          tipo: m.tipo === 'entrada' ? 'salida' : 'entrada',
          cantidad: m.cantidad,
          referencia: `${refAJ}-RECT`, origen_tipo: 'ajuste',
          notas: `Reversión automática de ${refAJ}`, fecha: hoy,
        }));
        const { error } = await supabase.from('emp_mov_materiales').insert(rev);
        if (error) throw error;
      }
      // Insertar ajustes (trigger actualiza stock)
      if (ajustesPreview.length > 0) {
        const movs = ajustesPreview.map(r => ({
          empresa_id: empresaId, material_id: r.material_id, bodega_id: bodegaIP.id,
          tipo:       r.dif > 0 ? 'entrada' : 'salida',
          cantidad:   Math.abs(r.dif),
          referencia: refAJ, origen_tipo: 'ajuste',
          notas:      `AJ-IP ${semana?.codigo} — Liquidación física`,
          fecha:      hoy,
        }));
        const { error } = await supabase.from('emp_mov_materiales').insert(movs);
        if (error) throw error;
      }
      setConfirmAJ(false);
      setMsg({
        type: 'ok',
        text: ajustesPreview.length === 0
          ? 'IP conciliado — sin diferencias'
          : `AJ-IP aplicado — ${ajustesPreview.length} movimiento(s)`,
      });
      await loadDatos();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Error al aplicar AJ-IP' });
    } finally { setApplyingAJ(false); }
  };

  // ── Aplicar Retorno IP → BG ───────────────────────────────────────────────
  const aplicarRetorno = async () => {
    if (!bodegaIP || !bodegaBG || !refRET) return;
    setApplyingRet(true);
    setMsg(null);
    const hoy = getCostaRicaDateISO();
    try {
      const validos = retRows.filter(r => r.cantidad !== '' && Number(r.cantidad) > 0);
      if (validos.length === 0) throw new Error('Ningún material con cantidad a retornar');

      const movs = validos.map(r => ({
        empresa_id:       empresaId,
        material_id:      r.material_id,
        bodega_id:        bodegaIP.id,        // origen = IP
        bodega_destino_id: bodegaBG.id,       // destino = BG
        tipo:             'traslado',
        cantidad:         Number(r.cantidad),
        referencia:       refRET,
        origen_tipo:      'manual',
        notas:            `Retorno IP→BG semana ${semana?.codigo}`,
        fecha:            hoy,
      }));

      const { error } = await supabase.from('emp_mov_materiales').insert(movs);
      if (error) throw error;

      setConfirmRet(false);
      setMsg({
        type: 'ok',
        text: `Retorno IP→BG aplicado — ${validos.length} traslado(s) a ${bodegaBG.nombre}`,
      });
      await loadDatos();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Error al aplicar retorno' });
    } finally { setApplyingRet(false); }
  };

  // ── Estados derivados ─────────────────────────────────────────────────────
  const ajYaAplicado  = ajMov.length > 0 && !rectificando;
  const retYaAplicado = retMov.length > 0;
  const ajFecha       = ajMov[0]?.created_at;
  const retFecha      = retMov[0]?.created_at;
  const pctIngresado  = rows.length > 0 ? Math.round(kpisAJ.ingresados / rows.length * 100) : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Scale size={22} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Liquidación IP</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>
              Cotejo físico + retorno a BG al cierre de semana
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {bodegaIP && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="px-2 py-1 rounded font-semibold"
                style={{ background: '#16a34a20', color: '#4ade80', border: '1px solid #16a34a30' }}>
                IP: {bodegaIP.nombre}
              </span>
              {bodegaBG && <>
                <span style={{ color: 'var(--ink-faint)' }}>→</span>
                <span className="px-2 py-1 rounded font-semibold"
                  style={{ background: '#2563eb20', color: '#60a5fa', border: '1px solid #2563eb30' }}>
                  BG: {bodegaBG.nombre}
                </span>
              </>}
            </div>
          )}
          <select className={selectCls} value={semanaId}
            onChange={e => setSemanaId(e.target.value)} style={{ minWidth: 190 }}>
            {semanas.map(s => (
              <option key={s.id} value={s.id}>
                {s.codigo} — {new Date(s.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sin bodega IP */}
      {!bodegaIP && !loading && (
        <div className="rounded-xl p-8 text-center"
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
          <AlertTriangle size={28} className="mx-auto mb-3" style={{ color: '#f59e0b' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No hay bodega IP configurada</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
            Configurá una bodega con tipo IP en Configuración → Bodegas.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--ink-faint)' }}>Cargando...</div>
      )}

      {!loading && bodegaIP && (
        <>
          {/* ════════════════════════════════════════
              FASE 1 — AJ-IP (Cotejo físico)
          ════════════════════════════════════════ */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
            {/* Encabezado fase */}
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: 'var(--surface-overlay)', borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-center gap-2">
                <Scale size={14} style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  Fase 1 — Cotejo AJ-IP
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: 'var(--surface-deep)', color: 'var(--ink-faint)' }}>
                  {ajYaAplicado ? '✓ Aplicado' : rows.length === 0 ? 'IP vacío' : 'Pendiente'}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Banner AJ aplicado */}
              {ajYaAplicado && (
                <div className="rounded-lg p-3"
                  style={{ background: '#10b98110', border: '1px solid #10b98135' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <p className="text-xs font-bold" style={{ color: '#10b981' }}>
                          AJ-IP — {ajMov.length} movimiento(s)
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                          {ajFecha && new Date(ajFecha).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {ajMov.map(m => {
                            const isPos = m.tipo === 'entrada';
                            return (
                              <span key={m.id} className="flex items-center gap-1 text-[11px]">
                                <span className="px-1.5 py-0.5 rounded font-bold text-[10px]"
                                  style={{ background: isPos ? '#10b98120' : '#ef444420', color: isPos ? '#10b981' : '#ef4444' }}>
                                  {isPos ? 'AJ+' : 'AJ−'}
                                </span>
                                <span style={{ color: 'var(--ink-muted)' }}>
                                  {isPos ? '+' : '−'}{fmt(m.cantidad)} {m.material_nombre}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setRectificando(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold shrink-0"
                      style={{ background: 'var(--surface-deep)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
                      <RotateCcw size={10} /> Rectificar
                    </button>
                  </div>
                </div>
              )}

              {/* IP vacío */}
              {!ajYaAplicado && rows.length === 0 && (
                <div className="py-6 text-center">
                  <CheckCircle2 size={24} className="mx-auto mb-2" style={{ color: '#10b981' }} />
                  <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>IP en cero — sin stock que ajustar</p>
                </div>
              )}

              {/* Formulario cotejo */}
              {(!ajYaAplicado || rectificando) && rows.length > 0 && (
                <>
                  {rectificando && (
                    <div className="rounded px-3 py-2 text-xs flex items-center gap-2"
                      style={{ background: '#f59e0b10', border: '1px solid #f59e0b35', color: '#f59e0b' }}>
                      <AlertTriangle size={12} /> Modo rectificación — se revertirá el ajuste anterior
                    </div>
                  )}

                  {/* KPIs mini */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'En IP', val: kpisAJ.totalIP, color: 'var(--ink)' },
                      { label: 'Con dif.', val: kpisAJ.conDif, color: '#f59e0b' },
                      { label: 'AJ+', val: kpisAJ.ajPos, color: '#10b981' },
                      { label: 'AJ−', val: kpisAJ.ajNeg, color: '#ef4444' },
                    ].map(k => (
                      <div key={k.label} className="rounded-lg p-2.5 text-center"
                        style={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)' }}>
                        <div className="text-base font-bold" style={{ color: k.color }}>{fmtN(k.val)}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Progress + botón */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span style={{ color: 'var(--ink-faint)' }}>{kpisAJ.ingresados}/{rows.length} ingresados</span>
                        <span style={{ color: 'var(--ink-faint)' }}>{pctIngresado}%</span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'var(--surface-overlay)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pctIngresado}%`, background: 'var(--accent)' }} />
                      </div>
                    </div>
                    <button onClick={liquidarTodoACero}
                      className="px-3 py-1.5 rounded text-xs font-semibold shrink-0"
                      style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                      Todo a cero
                    </button>
                  </div>

                  {/* Tabla */}
                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                    <div className="grid px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        background: 'var(--surface-deep)', color: 'var(--ink-faint)',
                        gridTemplateColumns: '1fr 55px 90px 110px 80px 65px',
                      }}>
                      <span>Material</span>
                      <span className="text-center">Tipo</span>
                      <span className="text-right">Stock IP</span>
                      <span className="text-right">Conteo físico</span>
                      <span className="text-right">Diferencia</span>
                      <span className="text-center">AJ</span>
                    </div>
                    {rows.map((r, i) => {
                      const conteoNum = r.conteo === '' ? null : Number(r.conteo);
                      const dif = conteoNum === null ? null : conteoNum - r.stock;
                      const hasDif = dif !== null && dif !== 0;
                      return (
                        <div key={r.material_id}
                          className="grid items-center px-3 py-2.5 text-sm"
                          style={{
                            gridTemplateColumns: '1fr 55px 90px 110px 80px 65px',
                            borderTop: i > 0 ? '1px solid var(--line)' : undefined,
                            background: hasDif ? (dif! > 0 ? '#10b98108' : '#ef444408') : undefined,
                          }}>
                          <div>
                            <span className="font-medium" style={{ color: 'var(--ink)' }}>{r.nombre}</span>
                            {r.codigo && <span className="ml-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>{r.codigo}</span>}
                          </div>
                          <span className="text-center text-[10px] capitalize" style={{ color: 'var(--ink-faint)' }}>{r.tipo}</span>
                          <span className="text-right tabular-nums font-semibold" style={{ color: '#60a5fa' }}>
                            {fmtN(r.stock)} <span className="text-[10px] font-normal" style={{ color: 'var(--ink-faint)' }}>{r.unidad}</span>
                          </span>
                          <div className="flex justify-end">
                            <input type="number" min="0" value={r.conteo} placeholder="0"
                              onChange={e => setConteo(r.material_id, e.target.value)}
                              className="w-24 text-right rounded px-2 py-1 text-sm tabular-nums"
                              style={{
                                background: 'var(--surface-overlay)',
                                border: `1px solid ${hasDif ? (dif! > 0 ? '#10b981' : '#ef4444') : 'var(--line)'}`,
                                color: 'var(--ink)', outline: 'none',
                              }} />
                          </div>
                          <span className="text-right tabular-nums font-bold text-sm" style={{ color: difColor(dif) }}>
                            {dif === null ? <span className="text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>—</span>
                              : dif === 0 ? <span className="text-xs" style={{ color: '#10b981' }}>✓</span>
                              : <>{dif > 0 ? '+' : '−'}{fmt(dif)}</>}
                          </span>
                          <div className="flex justify-center">
                            {dif !== null && dif !== 0 && <AjBadge dif={dif} />}
                            {dif === 0 && <CheckCircle2 size={13} style={{ color: '#10b981' }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Botones AJ */}
                  <div className="flex justify-end gap-2 pt-1">
                    {rectificando && (
                      <button onClick={() => setRectificando(false)}
                        className="px-4 py-2 rounded text-sm"
                        style={{ background: 'var(--surface-overlay)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
                        Cancelar
                      </button>
                    )}
                    <button onClick={() => setConfirmAJ(true)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-bold"
                      style={{ background: 'var(--accent)', color: 'white' }}>
                      <Scale size={13} />
                      {rectificando ? 'Reemplazar AJ-IP' : 'Aplicar AJ-IP'}
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ════════════════════════════════════════
              FASE 2 — Retorno IP → BG
          ════════════════════════════════════════ */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: 'var(--surface-overlay)', borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={14} style={{ color: '#a78bfa' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  Fase 2 — Retorno IP → BG
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: 'var(--surface-deep)', color: 'var(--ink-faint)' }}>
                  {retYaAplicado ? '✓ Aplicado' : retRows.length === 0 ? 'Sin stock' : 'Pendiente'}
                </span>
              </div>
              {bodegaBG && (
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                  <Warehouse size={11} /> Destino: {bodegaBG.nombre}
                </div>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Sin bodega BG */}
              {!bodegaBG && (
                <div className="py-4 text-center text-xs" style={{ color: 'var(--ink-faint)' }}>
                  No hay bodega BG configurada. Configurá una bodega tipo BG.
                </div>
              )}

              {/* Retorno ya aplicado */}
              {retYaAplicado && bodegaBG && (
                <div className="rounded-lg p-3"
                  style={{ background: '#7c3aed12', border: '1px solid #7c3aed35' }}>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={16} style={{ color: '#a78bfa', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p className="text-xs font-bold" style={{ color: '#a78bfa' }}>
                        Retorno IP→BG — {retMov.length} traslado(s)
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                        {retFecha && new Date(retFecha).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {retMov.map(m => (
                          <span key={m.id} className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                            {fmtN(m.cantidad)} {m.material_nombre}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sin stock IP para retornar */}
              {!retYaAplicado && retRows.length === 0 && bodegaBG && (
                <div className="py-5 text-center">
                  <CheckCircle2 size={22} className="mx-auto mb-2" style={{ color: '#10b981' }} />
                  <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>IP vacío — nada que retornar</p>
                </div>
              )}

              {/* Formulario retorno */}
              {!retYaAplicado && retRows.length > 0 && bodegaBG && (
                <>
                  {/* KPIs retorno */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Materiales IP', val: retRows.length,    color: 'var(--ink)' },
                      { label: 'Retorna a BG',  val: totalRetorno,      color: '#a78bfa' },
                      { label: 'Queda en IP',   val: quedaEnIP,         color: quedaEnIP === 0 ? '#10b981' : '#f59e0b' },
                    ].map(k => (
                      <div key={k.label} className="rounded-lg p-2.5 text-center"
                        style={{ background: 'var(--surface-overlay)', border: '1px solid var(--line)' }}>
                        <div className="text-base font-bold" style={{ color: k.color }}>{fmtN(k.val)}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <button onClick={retornarTodo}
                      className="px-3 py-1.5 rounded text-xs font-semibold"
                      style={{ background: '#7c3aed18', color: '#a78bfa', border: '1px solid #7c3aed35' }}>
                      Retornar todo a BG
                    </button>
                  </div>

                  {/* Tabla retorno */}
                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                    <div className="grid px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        background: 'var(--surface-deep)', color: 'var(--ink-faint)',
                        gridTemplateColumns: '1fr 90px 120px 90px',
                      }}>
                      <span>Material</span>
                      <span className="text-right">Stock IP</span>
                      <span className="text-right">Cantidad a retornar</span>
                      <span className="text-right">Queda en IP</span>
                    </div>
                    {retRows.map((r, i) => {
                      const cantNum = r.cantidad === '' ? 0 : Number(r.cantidad);
                      const queda  = r.stock - cantNum;
                      const full   = cantNum === r.stock;
                      return (
                        <div key={r.material_id}
                          className="grid items-center px-3 py-2.5 text-sm"
                          style={{
                            gridTemplateColumns: '1fr 90px 120px 90px',
                            borderTop: i > 0 ? '1px solid var(--line)' : undefined,
                          }}>
                          <span className="font-medium" style={{ color: 'var(--ink)' }}>
                            {r.nombre}
                            <span className="ml-1.5 text-[10px]" style={{ color: 'var(--ink-faint)' }}>{r.unidad}</span>
                          </span>
                          <span className="text-right tabular-nums" style={{ color: '#60a5fa' }}>
                            {fmtN(r.stock)}
                          </span>
                          <div className="flex justify-end">
                            <input type="number" min="0" max={r.stock}
                              value={r.cantidad}
                              onChange={e => setCantidadRet(r.material_id, e.target.value)}
                              className="w-28 text-right rounded px-2 py-1 text-sm tabular-nums"
                              style={{
                                background: 'var(--surface-overlay)',
                                border: `1px solid ${full ? '#7c3aed50' : 'var(--line)'}`,
                                color: 'var(--ink)', outline: 'none',
                              }} />
                          </div>
                          <span className="text-right tabular-nums font-semibold text-sm"
                            style={{ color: queda === 0 ? '#10b981' : queda < 0 ? '#ef4444' : '#f59e0b' }}>
                            {queda < 0 ? <span className="text-xs" style={{ color: '#ef4444' }}>excede</span> : fmtN(queda)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Botón retorno */}
                  <div className="flex justify-end">
                    <button onClick={() => setConfirmRet(true)}
                      className="flex items-center gap-1.5 px-5 py-2 rounded text-sm font-bold"
                      style={{ background: '#7c3aed', color: 'white' }}>
                      <ArrowRightLeft size={13} />
                      Aplicar Retorno IP → BG
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mensaje global */}
          {msg && (
            <div className="rounded-lg px-4 py-3 text-sm font-semibold"
              style={{
                background: msg.type === 'ok' ? '#10b98112' : '#ef444412',
                border: `1px solid ${msg.type === 'ok' ? '#10b98140' : '#ef444440'}`,
                color: msg.type === 'ok' ? '#10b981' : '#ef4444',
              }}>
              {msg.text}
            </div>
          )}
        </>
      )}

      {/* ── Modales ── */}
      {confirmAJ && semana && (
        <ConfirmAJ
          ajustes={ajustesPreview}
          semCodigo={semana.codigo}
          rectificando={rectificando}
          onCancel={() => setConfirmAJ(false)}
          onConfirm={aplicarAJ}
          applying={applyingAJ}
        />
      )}

      {confirmRet && semana && (
        <ConfirmRetorno
          retRows={retRows}
          semCodigo={semana.codigo}
          bodegaBG={bodegaBG}
          onCancel={() => setConfirmRet(false)}
          onConfirm={aplicarRetorno}
          applying={applyingRet}
        />
      )}
    </div>
  );
}
