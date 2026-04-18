import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Search,
  Warehouse, Layers, Pencil, Trash2, Printer, PackageOpen,
  AlertTriangle, CheckCircle, XCircle, RefreshCw, Settings2,
} from 'lucide-react';
import ReactDOM from 'react-dom';
import InventarioMaterialesPrint from './InventarioMaterialesPrint';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Bodega, MaterialEmpaque, SaldoBGIP, InvConversion } from '../../types/empacadora';
import Modal from '../../components/Modal';
import { getCostaRicaDateISO } from '../../utils/costaRicaTime';
import {
  inputCls, selectCls, labelCls, btnPrimary, btnSecondary,
  tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls,
} from '../../components/ui';

// ─── tipos internos ───────────────────────────────────────────────────────────
interface StockRow {
  material_id: string;
  material_codigo: string;
  material_nombre: string;
  material_tipo: string;
  bodega_id: string;
  bodega_nombre: string;
  bodega_tipo: string;
  stock_actual: number;
}

interface MovRow {
  id: string;
  fecha: string;
  tipo: 'entrada' | 'salida' | 'traslado';
  cantidad: number;
  cantidad_paquetes?: number;
  origen_tipo?: string;
  referencia?: string;
  notas?: string;
  material_codigo: string;
  material_nombre: string;
  bodega_nombre: string;
  bodega_destino_nombre?: string;
  created_at: string;
}

interface TarimaConfig {
  id: string;
  material_id: string;
  material_nombre: string;
  material_codigo: string;
  descripcion: string;
  cantidad: number;
  activo: boolean;
}

const TIPO_LABELS = { entrada: 'Entrada', salida: 'Salida', traslado: 'Traslado' };
const TIPO_COLORS = {
  entrada:  { bg: '#052e16', border: '#14532d', text: '#4ade80' },
  salida:   { bg: '#450a0a', border: '#7f1d1d', text: '#f87171' },
  traslado: { bg: '#1e1b4b', border: '#3730a3', text: '#a5b4fc' },
};

const ORIGEN_LABELS: Record<string, string> = {
  xml_fe:        'FE',
  apertura_caja: 'Apertura',
  boleta:        'Boleta',
  ajuste:        'Ajuste',
  manual:        'Manual',
};

// ─── badge estado stock ───────────────────────────────────────────────────────
function EstadoBadge({ estado }: { estado: string }) {
  if (estado === 'agotado') return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-950/50 border border-red-800/50 text-red-400">
      <XCircle size={10} /> Agotado
    </span>
  );
  if (estado === 'minimo') return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-yellow-950/50 border border-yellow-700/50 text-yellow-400">
      <AlertTriangle size={10} /> Mínimo
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-950/40 border border-green-800/40 text-green-400">
      <CheckCircle size={10} /> OK
    </span>
  );
}

// ─── modal Abrir Caja (BG → IP) ───────────────────────────────────────────────
function AbrirCajaModal({
  saldo,
  empresaId,
  onClose,
  onSaved,
}: {
  saldo: SaldoBGIP;
  empresaId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cajas, setCajas] = useState('1');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cajasNum = parseFloat(cajas) || 0;
  const unidades = cajasNum * (saldo.unidades_por_paquete ?? 1);
  const disponibleCajas = saldo.stock_bg_paquetes;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cajasNum <= 0) { setError('Ingrese una cantidad válida'); return; }
    if (cajasNum > disponibleCajas) {
      setError(`Solo hay ${disponibleCajas} ${saldo.unidad_compra ?? 'cajas'} disponibles en BG`);
      return;
    }
    setSaving(true); setError('');
    const { error: rpcError } = await supabase.rpc('emp_abrir_caja', {
      p_empresa_id:  empresaId,
      p_material_id: saldo.material_id,
      p_cajas:       cajasNum,
      p_notas:       notas || null,
    });
    if (rpcError) { setError(rpcError.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
    onClose();
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-md rounded-xl shadow-2xl border" style={{ background: 'var(--surface-raised)', borderColor: 'var(--line)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-2">
            <PackageOpen size={16} className="text-blue-400" />
            <span className="font-semibold text-sm text-ink">Abrir Caja — BG → IP</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
        </div>
        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Material info */}
          <div className="rounded-lg p-3 border" style={{ background: 'var(--surface-deep)', borderColor: 'var(--line)' }}>
            <div className="text-xs text-ink-muted mb-1">Material</div>
            <div className="font-semibold text-sm text-ink">{saldo.nombre}</div>
            {saldo.codigo && <div className="font-mono text-[11px] text-blue-400">{saldo.codigo}</div>}
          </div>

          {/* Conversión */}
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="rounded-lg p-2.5 border" style={{ background: 'var(--surface-deep)', borderColor: 'var(--line)' }}>
              <div style={{ color: 'var(--ink-faint)' }}>Stock BG</div>
              <div className="font-bold text-lg text-ink mt-1">{disponibleCajas.toLocaleString('es-CR')}</div>
              <div style={{ color: 'var(--ink-muted)' }}>{saldo.unidad_compra ?? 'cajas'}</div>
            </div>
            <div className="flex items-center justify-center text-gray-600">
              <ArrowLeftRight size={18} />
            </div>
            <div className="rounded-lg p-2.5 border" style={{ background: 'var(--surface-deep)', borderColor: 'var(--line)' }}>
              <div style={{ color: 'var(--ink-faint)' }}>Stock IP</div>
              <div className="font-bold text-lg text-ink mt-1">{saldo.stock_ip.toLocaleString('es-CR')}</div>
              <div style={{ color: 'var(--ink-muted)' }}>{saldo.unidad_uso ?? 'unidades'}</div>
            </div>
          </div>

          {saldo.unidades_por_paquete && (
            <p className="text-[11px] text-center" style={{ color: 'var(--ink-faint)' }}>
              1 {saldo.unidad_compra} = {saldo.unidades_por_paquete.toLocaleString('es-CR')} {saldo.unidad_uso}
            </p>
          )}

          {/* Cantidad */}
          <div>
            <label className={labelCls}>Cantidad de {saldo.unidad_compra ?? 'cajas'} a abrir *</label>
            <input
              type="number" min="0.01" step="0.01" required
              value={cajas}
              onChange={e => setCajas(e.target.value)}
              className={inputCls}
              autoFocus
            />
          </div>

          {/* Preview */}
          {cajasNum > 0 && saldo.unidades_por_paquete && (
            <div className="rounded-lg p-3 border border-blue-800/40 bg-blue-950/20 text-xs text-blue-300">
              {cajasNum.toLocaleString('es-CR')} {saldo.unidad_compra} × {saldo.unidades_por_paquete.toLocaleString('es-CR')} = {' '}
              <span className="font-bold text-blue-200">{unidades.toLocaleString('es-CR')} {saldo.unidad_uso}</span> → IP
            </div>
          )}

          {/* Notas */}
          <div>
            <label className={labelCls}>Notas <span style={{ color: 'var(--ink-faint)' }}>(opcional)</span></label>
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)} className={inputCls} placeholder="Ej: Apertura para producción semana 26" />
          </div>

          {error && <p className={errorCls}>{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Procesando...' : 'Abrir Caja'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function InventarioMateriales() {
  const empresaId = useEmpresaId();
  const [tab, setTab] = useState<'saldos' | 'stock' | 'movimientos' | 'tarimas' | 'conversiones'>('saldos');
  const [printMode, setPrintMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  // ── Saldos BG/IP ──────────────────────────────────────────────────────────
  const [saldos, setSaldos] = useState<SaldoBGIP[]>([]);
  const [abrirCajaSaldo, setAbrirCajaSaldo] = useState<SaldoBGIP | null>(null);

  // ── Stock por bodega ───────────────────────────────────────────────────────
  const [stock, setStock] = useState<StockRow[]>([]);
  const [filtBodega, setFiltBodega] = useState('');

  // ── Movimientos ───────────────────────────────────────────────────────────
  const [movs, setMovs] = useState<MovRow[]>([]);
  const [filtTipo, setFiltTipo] = useState('');

  // ── Bodegas + materiales (compartidos) ────────────────────────────────────
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [materiales, setMateriales] = useState<MaterialEmpaque[]>([]);

  // ── Modal registrar movimiento manual ─────────────────────────────────────
  const [showMovModal, setShowMovModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    material_id: '', bodega_id: '', bodega_destino_id: '',
    tipo: 'entrada' as 'entrada' | 'salida' | 'traslado',
    cantidad: '', cantidad_paquetes: '', referencia: '', notas: '',
    fecha: getCostaRicaDateISO(),
  });

  // ── Tarimas ───────────────────────────────────────────────────────────────
  const [tarimaRows, setTarimaRows] = useState<TarimaConfig[]>([]);
  const [tarimaModal, setTarimaModal] = useState(false);
  const [tarimaEditing, setTarimaEditing] = useState<TarimaConfig | null>(null);
  const [tarimaForm, setTarimaForm] = useState({ material_id: '', descripcion: '', cantidad: '1', activo: true });
  const [tarimaBusqueda, setTarimaBusqueda] = useState('');
  const [tarimaSaving, setTarimaSaving] = useState(false);

  // ── Conversiones ──────────────────────────────────────────────────────────
  const [conversiones, setConversiones] = useState<InvConversion[]>([]);
  const [convModal, setConvModal] = useState(false);
  const [convEditing, setConvEditing] = useState<InvConversion | null>(null);
  const [convForm, setConvForm] = useState({
    material_id: '', unidad_compra: 'caja', unidades_por_paquete: '', unidad_uso: 'unidad', notas: '', activo: true,
  });
  const [convBusqueda, setConvBusqueda] = useState('');
  const [convSaving, setConvSaving] = useState(false);

  // ── Carga principal ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    // Cargar movimientos por separado para aislar errores
    const [{ data: saldosData }, { data: inv }, { data: bods }, { data: mats }] = await Promise.all([
      supabase.from('emp_v_saldos').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('emp_inv_materiales')
        .select('material_id, stock_actual, bodega_id, material:emp_materiales(id,codigo,nombre,tipo), bodega:emp_bodegas(id,nombre,tipo)')
        .eq('empresa_id', empresaId),
      supabase.from('emp_bodegas').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_materiales').select('id,codigo,nombre,tipo,unidad_medida').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
    ]);

    // Movimientos: select mínimo primero, los campos nuevos los ignoramos si fallan
    const { data: movData, error: movErr } = await supabase
      .from('emp_mov_materiales')
      .select('id, fecha, tipo, cantidad, referencia, notas, created_at, bodega_destino_id, material:emp_materiales(codigo,nombre), bodega:emp_bodegas!bodega_id(id,nombre)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(300);

    if (movErr) {
      console.error('[InventarioMateriales] movimientos error:', movErr);
      setLoadError(`Error cargando movimientos: ${movErr.message}`);
    }

    // Intentar también los campos nuevos (pueden no estar en cache todavía)
    let movDataFull: any[] | null = null;
    if (!movErr) {
      const { data: mdf } = await supabase
        .from('emp_mov_materiales')
        .select('id, cantidad_paquetes, origen_tipo')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(300);
      movDataFull = mdf;
    }

    // Merge: combinar campos nuevos si cargaron
    const movDataMerged = (movData || []).map((r: any) => {
      const extra = movDataFull?.find((x: any) => x.id === r.id);
      return { ...r, cantidad_paquetes: extra?.cantidad_paquetes ?? null, origen_tipo: extra?.origen_tipo ?? null };
    });
    setSaldos((saldosData || []) as SaldoBGIP[]);
    setStock((inv || []).map((r: any) => ({
      material_id: r.material_id,
      material_codigo: r.material?.codigo || '',
      material_nombre: r.material?.nombre || '',
      material_tipo: r.material?.tipo || '',
      bodega_id: r.bodega_id,
      bodega_nombre: r.bodega?.nombre || '',
      bodega_tipo: r.bodega?.tipo || '',
      stock_actual: r.stock_actual,
    })));
    const bodsMap = new Map((bods || []).map((b: any) => [b.id, b.nombre]));
    setMovs(movDataMerged.map((r: any) => ({
      id: r.id, fecha: r.fecha, tipo: r.tipo, cantidad: r.cantidad,
      cantidad_paquetes: r.cantidad_paquetes,
      origen_tipo: r.origen_tipo,
      referencia: r.referencia, notas: r.notas, created_at: r.created_at,
      material_codigo: r.material?.codigo || '',
      material_nombre: r.material?.nombre || '',
      bodega_nombre: r.bodega?.nombre || '',
      bodega_destino_nombre: r.bodega_destino_id ? bodsMap.get(r.bodega_destino_id) : undefined,
    })));
    setBodegas(bods || []);
    setMateriales((mats as any) || []);
    setLoading(false);
  }, [empresaId]);

  const loadConversiones = useCallback(async () => {
    const { data } = await supabase
      .from('emp_inv_conversion')
      .select('*, material:emp_materiales(id,nombre,codigo)')
      .eq('empresa_id', empresaId)
      .order('created_at');
    setConversiones((data || []).map((r: any) => ({
      ...r, material: r.material,
    })));
  }, [empresaId]);

  const loadTarimas = useCallback(async () => {
    const { data } = await supabase
      .from('emp_config_materiales_tarima')
      .select('id, material_id, descripcion, cantidad, activo, material:emp_materiales(nombre, codigo)')
      .eq('empresa_id', empresaId)
      .order('created_at');
    setTarimaRows((data || []).map((r: any) => ({
      id: r.id, material_id: r.material_id,
      material_nombre: r.material?.nombre || '',
      material_codigo: r.material?.codigo || '',
      descripcion: r.descripcion || '',
      cantidad: r.cantidad, activo: r.activo,
    })));
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'tarimas') loadTarimas(); }, [tab, loadTarimas]);
  useEffect(() => { if (tab === 'conversiones') loadConversiones(); }, [tab, loadConversiones]);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const saldosFilt = useMemo(() => {
    if (!search) return saldos;
    const q = search.toLowerCase();
    return saldos.filter(s => s.nombre.toLowerCase().includes(q) || (s.codigo || '').toLowerCase().includes(q));
  }, [saldos, search]);

  const alertCount = useMemo(() => saldos.filter(s => s.estado_stock !== 'ok').length, [saldos]);

  const stockFilt = useMemo(() => {
    let r = stock;
    if (filtBodega) r = r.filter(s => s.bodega_id === filtBodega);
    if (search) r = r.filter(s =>
      s.material_nombre.toLowerCase().includes(search.toLowerCase()) ||
      (s.material_codigo || '').toLowerCase().includes(search.toLowerCase()),
    );
    return r;
  }, [stock, filtBodega, search]);

  // Mapa de conversiones derivado de saldos (material_id → conversión)
  const conversionMap = useMemo(() => {
    const map = new Map<string, { unidad_compra: string; unidades_por_paquete: number; unidad_uso: string }>();
    saldos.forEach(s => {
      if (s.unidades_por_paquete) {
        map.set(s.material_id, {
          unidad_compra: s.unidad_compra ?? 'caja',
          unidades_por_paquete: s.unidades_por_paquete,
          unidad_uso: s.unidad_uso ?? 'unidad',
        });
      }
    });
    return map;
  }, [saldos]);

  const movsFilt = useMemo(() => {
    let r = movs;
    if (filtTipo) r = r.filter(m => m.tipo === filtTipo);
    if (search) r = r.filter(m => m.material_nombre.toLowerCase().includes(search.toLowerCase()) || (m.referencia || '').toLowerCase().includes(search.toLowerCase()));
    return r;
  }, [movs, filtTipo, search]);

  // ── Guardar movimiento manual ─────────────────────────────────────────────
  async function handleSaveMov(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    if (!form.material_id || !form.bodega_id) {
      setError('Complete material y bodega'); setSaving(false); return;
    }
    if (form.tipo === 'traslado' && !form.bodega_destino_id) {
      setError('Seleccione la bodega destino'); setSaving(false); return;
    }
    const conv = conversionMap.get(form.material_id);
    const bodegaSel = bodegas.find(b => b.id === form.bodega_id);
    const isBGConConv = !!conv && bodegaSel?.tipo === 'BG' && form.tipo === 'entrada';

    // Validación según modo
    if (isBGConConv && !form.cantidad_paquetes) {
      setError(`Ingrese la cantidad de ${conv.unidad_compra}s`); setSaving(false); return;
    }
    if (!isBGConConv && !form.cantidad) {
      setError('Ingrese la cantidad'); setSaving(false); return;
    }

    const cantPaquetes = form.cantidad_paquetes ? +form.cantidad_paquetes : null;
    const payload: any = {
      empresa_id: empresaId, material_id: form.material_id, bodega_id: form.bodega_id,
      tipo: form.tipo, cantidad: +form.cantidad,
      cantidad_paquetes: cantPaquetes,
      referencia: form.referencia || null,
      notas: form.notas || null, fecha: form.fecha, origen_tipo: 'manual',
    };
    if (form.tipo === 'traslado') payload.bodega_destino_id = form.bodega_destino_id;
    const { error: err } = await supabase.from('emp_mov_materiales').insert(payload);
    if (err) { setError(err.message); setSaving(false); return; }

    // Si es entrada con paquetes → actualizar stock_paquetes en emp_inv_materiales
    if (form.tipo === 'entrada' && cantPaquetes && cantPaquetes > 0) {
      const { data: invRow } = await supabase
        .from('emp_inv_materiales')
        .select('id, stock_paquetes')
        .eq('empresa_id', empresaId)
        .eq('material_id', form.material_id)
        .eq('bodega_id', form.bodega_id)
        .maybeSingle();
      if (invRow) {
        await supabase
          .from('emp_inv_materiales')
          .update({ stock_paquetes: ((invRow as any).stock_paquetes || 0) + cantPaquetes, ultima_actualizacion: new Date().toISOString() })
          .eq('id', (invRow as any).id);
      } else {
        await supabase.from('emp_inv_materiales').insert({
          empresa_id: empresaId, material_id: form.material_id, bodega_id: form.bodega_id,
          stock_actual: +form.cantidad, stock_paquetes: cantPaquetes,
        });
      }
    }

    setSaving(false); setShowMovModal(false); load();
    setForm(f => ({ ...f, material_id: '', cantidad: '', cantidad_paquetes: '', referencia: '', notas: '' }));
  }

  // ── Conversiones CRUD ─────────────────────────────────────────────────────
  async function saveConversion(e: React.FormEvent) {
    e.preventDefault(); setConvSaving(true);
    const payload = {
      empresa_id: empresaId,
      material_id: convForm.material_id,
      unidad_compra: convForm.unidad_compra,
      unidades_por_paquete: +convForm.unidades_por_paquete,
      unidad_uso: convForm.unidad_uso,
      notas: convForm.notas || null,
      activo: convForm.activo,
    };
    const { error: err } = convEditing
      ? await supabase.from('emp_inv_conversion').update(payload).eq('id', convEditing.id)
      : await supabase.from('emp_inv_conversion').insert(payload);
    if (!err) { setConvModal(false); loadConversiones(); }
    setConvSaving(false);
  }

  async function deleteConversion(id: string) {
    if (!window.confirm('¿Eliminar esta conversión?')) return;
    await supabase.from('emp_inv_conversion').delete().eq('id', id);
    loadConversiones();
  }

  // ── Tarimas CRUD ──────────────────────────────────────────────────────────
  async function saveTarima(e: React.FormEvent) {
    e.preventDefault(); setTarimaSaving(true);
    const payload = { empresa_id: empresaId, material_id: tarimaForm.material_id, descripcion: tarimaForm.descripcion || null, cantidad: +tarimaForm.cantidad, activo: tarimaForm.activo };
    const { error: err } = tarimaEditing
      ? await supabase.from('emp_config_materiales_tarima').update(payload).eq('id', tarimaEditing.id)
      : await supabase.from('emp_config_materiales_tarima').insert(payload);
    if (!err) { setTarimaModal(false); loadTarimas(); }
    setTarimaSaving(false);
  }

  async function deleteTarima(id: string) {
    await supabase.from('emp_config_materiales_tarima').delete().eq('id', id);
    loadTarimas();
  }

  const tipoIcon = (t: string) => t === 'entrada' ? <ArrowDownCircle size={12} /> : t === 'salida' ? <ArrowUpCircle size={12} /> : <ArrowLeftRight size={12} />;

  if (printMode) return <InventarioMaterialesPrint onBack={() => setPrintMode(false)} />;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Inventario de Materiales</h1>
          <p className="text-ink-muted text-sm mt-1">
            Bodega General (BG) · Inventario en Proceso (IP)
            {alertCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-950/60 border border-yellow-700/50 text-yellow-400">
                {alertCount} alerta{alertCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => load()}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          <button onClick={() => setPrintMode(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
            <Printer size={13} /> PDF
          </button>
          {tab === 'tarimas' ? (
            <button
              onClick={() => { setTarimaEditing(null); setTarimaForm({ material_id: '', descripcion: '', cantidad: '1', activo: true }); setTarimaBusqueda(''); setTarimaModal(true); }}
              className={btnPrimary + ' flex items-center gap-1.5'}>
              <Plus size={14} /> Agregar Material
            </button>
          ) : tab === 'conversiones' ? (
            <button
              onClick={() => { setConvEditing(null); setConvForm({ material_id: '', unidad_compra: 'caja', unidades_por_paquete: '', unidad_uso: 'unidad', notas: '', activo: true }); setConvBusqueda(''); setConvModal(true); }}
              className={btnPrimary + ' flex items-center gap-1.5'}>
              <Plus size={14} /> Nueva Conversión
            </button>
          ) : tab !== 'saldos' ? (
            <button onClick={() => setShowMovModal(true)} className={btnPrimary + ' flex items-center gap-1.5'}>
              <Plus size={14} /> Registrar Movimiento
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-lg w-full sm:w-fit" style={{ background: 'var(--surface-deep)' }}>
        {([
          ['saldos', 'Saldos BG / IP'],
          ['stock', 'Por Bodega'],
          ['movimientos', 'Movimientos'],
          ['tarimas', 'Mat. Tarima'],
          ['conversiones', 'Conversiones'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
            style={tab === t
              ? { background: 'var(--surface-raised)', color: 'var(--ink)', border: '1px solid var(--line)' }
              : { color: 'var(--ink-muted)' }}>
            {t === 'tarimas' && <Layers size={11} />}
            {t === 'conversiones' && <Settings2 size={11} />}
            {label}
            {t === 'saldos' && alertCount > 0 && (
              <span className="px-1 rounded text-[9px] font-bold bg-yellow-700/50 text-yellow-300">{alertCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Buscador general */}
      {(tab === 'saldos' || tab === 'stock' || tab === 'movimientos') && (
        <div className="flex flex-col sm:flex-row gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            <input type="text" placeholder="Buscar material..." value={search}
              onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
          </div>
          {tab === 'stock' && (
            <select value={filtBodega} onChange={e => setFiltBodega(e.target.value)} className={selectCls + ' w-full sm:w-auto'}>
              <option value="">Todas las bodegas</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          )}
          {tab === 'movimientos' && (
            <select value={filtTipo} onChange={e => setFiltTipo(e.target.value)} className={selectCls + ' w-full sm:w-auto'}>
              <option value="">Todos los tipos</option>
              <option value="entrada">Entradas</option>
              <option value="salida">Salidas</option>
              <option value="traslado">Traslados</option>
            </select>
          )}
        </div>
      )}

      {/* ═══ TAB: SALDOS BG / IP ═══════════════════════════════════════════════ */}
      {tab === 'saldos' && (
        <>
          {/* Resumen rápido */}
          {!loading && saldos.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Materiales', val: saldos.length, color: 'var(--ink)' },
                { label: 'En mínimo', val: saldos.filter(s => s.estado_stock === 'minimo').length, color: '#facc15' },
                { label: 'Agotados', val: saldos.filter(s => s.estado_stock === 'agotado').length, color: '#f87171' },
              ].map(({ label, val, color }) => (
                <div key={label} className="rounded-lg p-3 border text-center" style={{ background: 'var(--surface-raised)', borderColor: 'var(--line)' }}>
                  <div className="text-2xl font-bold" style={{ color }}>{val}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          <div className={tableWrapCls}>
            <table className="w-full text-xs">
              <thead className={theadCls}>
                <tr>
                  <th className={thCls}>Material</th>
                  <th className={thCls + ' text-right'}>Stock BG</th>
                  <th className={thCls + ' text-right'}>Cajas BG</th>
                  <th className={thCls + ' text-right'}>Stock IP</th>
                  <th className={thCls + ' text-right'}>Total</th>
                  <th className={thCls + ' text-center'}>Estado</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Cargando...</td></tr>
                ) : saldosFilt.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-600">Sin materiales</td></tr>
                ) : saldosFilt.map(s => (
                  <tr key={s.material_id} className={trCls}>
                    <td className={tdCls}>
                      <div className="font-medium text-ink">{s.nombre}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.codigo && <span className="font-mono text-[10px] text-blue-400">{s.codigo}</span>}
                        <span className="text-[10px] capitalize" style={{ color: 'var(--ink-faint)' }}>{s.material_tipo}</span>
                      </div>
                    </td>
                    <td className={tdCls + ' text-right font-bold'} style={{ color: s.stock_bg <= 0 ? '#f87171' : 'var(--ink)' }}>
                      {s.stock_bg.toLocaleString('es-CR')}
                      <span className="ml-1 text-[10px] font-normal" style={{ color: 'var(--ink-faint)' }}>
                        {s.unidad_uso ?? s.unidad_medida}
                      </span>
                    </td>
                    <td className={tdCls + ' text-right'} style={{ color: 'var(--ink-muted)' }}>
                      {s.unidades_por_paquete ? (
                        <span>{s.stock_bg_paquetes.toLocaleString('es-CR')} <span className="text-[10px]">{s.unidad_compra}</span></span>
                      ) : '—'}
                    </td>
                    <td className={tdCls + ' text-right font-bold'} style={{ color: s.stock_ip <= 0 ? '#6b7280' : '#60a5fa' }}>
                      {s.stock_ip.toLocaleString('es-CR')}
                      <span className="ml-1 text-[10px] font-normal" style={{ color: 'var(--ink-faint)' }}>
                        {s.unidad_uso ?? s.unidad_medida}
                      </span>
                    </td>
                    <td className={tdCls + ' text-right font-bold'} style={{ color: s.stock_total <= 0 ? '#f87171' : s.stock_total <= s.stock_minimo ? '#facc15' : '#4ade80' }}>
                      {s.stock_total.toLocaleString('es-CR')}
                    </td>
                    <td className={tdCls + ' text-center'}>
                      <EstadoBadge estado={s.estado_stock} />
                    </td>
                    <td className={tdCls}>
                      {s.unidades_por_paquete && s.bodega_bg_id && (
                        <button
                          onClick={() => setAbrirCajaSaldo(s)}
                          title="Abrir caja BG → IP"
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-blue-300 hover:text-blue-200 border border-blue-800/40 hover:border-blue-700 bg-blue-950/20 hover:bg-blue-900/30 transition-colors whitespace-nowrap">
                          <PackageOpen size={11} /> Abrir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ TAB: POR BODEGA ══════════════════════════════════════════════════ */}
      {tab === 'stock' && (
        <div className={tableWrapCls}>
          <table className="w-full text-xs">
            <thead className={theadCls}>
              <tr>
                <th className={thCls}>Código</th>
                <th className={thCls}>Material</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}><div className="flex items-center gap-1"><Warehouse size={11} /> Bodega</div></th>
                <th className={thCls + ' text-right'}>Stock</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : stockFilt.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-600">Sin registros</td></tr>
              ) : stockFilt.map(r => (
                <tr key={`${r.material_id}-${r.bodega_id}`} className={trCls}>
                  <td className={tdCls + ' font-mono text-blue-400'}>{r.material_codigo || '—'}</td>
                  <td className={tdCls + ' font-medium text-ink'}>{r.material_nombre}</td>
                  <td className={tdCls}>
                    <span className="px-1.5 py-0.5 rounded text-[10px] capitalize"
                      style={{ background: 'var(--surface-deep)', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
                      {r.material_tipo}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-1.5 text-ink-muted">
                      <Warehouse size={11} />
                      {r.bodega_nombre}
                      {r.bodega_tipo && (
                        <span className={`px-1 rounded text-[9px] font-bold ${r.bodega_tipo === 'BG' ? 'bg-emerald-900/40 text-emerald-400' : r.bodega_tipo === 'IP' ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-800 text-gray-500'}`}>
                          {r.bodega_tipo}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={tdCls + ' text-right'}>
                    <span className={`font-bold text-sm ${r.stock_actual <= 0 ? 'text-red-400' : 'text-ink'}`}>
                      {r.stock_actual.toLocaleString('es-CR')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ TAB: MOVIMIENTOS ════════════════════════════════════════════════ */}
      {tab === 'movimientos' && (
        <>
        {loadError && (
          <div className="mb-3 rounded-lg p-3 border border-red-800/50 bg-red-950/30 text-xs text-red-400">
            ⚠ {loadError}
          </div>
        )}
        <div className={tableWrapCls}>
          <table className="w-full text-xs">
            <thead className={theadCls}>
              <tr>
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Tipo</th>
                <th className={thCls}>Origen</th>
                <th className={thCls}>Material</th>
                <th className={thCls}>Bodega</th>
                <th className={thCls + ' text-right'}>Cantidad</th>
                <th className={thCls}>Referencia</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : movsFilt.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-600">Sin movimientos</td></tr>
              ) : movsFilt.map(m => {
                const c = TIPO_COLORS[m.tipo];
                return (
                  <tr key={m.id} className={trCls}>
                    <td className={tdCls + ' text-ink-muted'}>{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CR')}</td>
                    <td className={tdCls}>
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded w-fit text-[10px] font-medium"
                        style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
                        {tipoIcon(m.tipo)}{TIPO_LABELS[m.tipo]}
                      </span>
                    </td>
                    <td className={tdCls}>
                      {m.origen_tipo && (
                        <span className="px-1.5 py-0.5 rounded text-[10px]"
                          style={{ background: 'var(--surface-deep)', border: '1px solid var(--line)', color: 'var(--ink-faint)' }}>
                          {ORIGEN_LABELS[m.origen_tipo] ?? m.origen_tipo}
                        </span>
                      )}
                    </td>
                    <td className={tdCls}>
                      <div className="font-medium text-ink">{m.material_nombre}</div>
                      {m.material_codigo && <div className="font-mono text-xs text-blue-400">{m.material_codigo}</div>}
                    </td>
                    <td className={tdCls + ' text-ink-muted'}>
                      {m.bodega_nombre}{m.bodega_destino_nombre ? ` → ${m.bodega_destino_nombre}` : ''}
                    </td>
                    <td className={tdCls + ' text-right font-bold text-ink'}>
                      {m.cantidad.toLocaleString('es-CR')}
                      {m.cantidad_paquetes ? (
                        <div className="text-xs font-normal" style={{ color: 'var(--ink-faint)' }}>
                          ({m.cantidad_paquetes} cajas)
                        </div>
                      ) : null}
                    </td>
                    <td className={tdCls + ' text-ink-muted'}>{m.referencia || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* ═══ TAB: TARIMAS ════════════════════════════════════════════════════ */}
      {tab === 'tarimas' && (
        <>
          <p className="text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>
            Materiales que se descargan automáticamente por tarima al aplicar una boleta (fleje, tarima, esquineros, etc.).
          </p>
          <div className={tableWrapCls}>
            <table className="w-full text-xs">
              <thead className={theadCls}>
                <tr>
                  <th className={thCls}>Material</th>
                  <th className={thCls}>Descripción</th>
                  <th className={thCls + ' text-right'}>Cant. / tarima</th>
                  <th className={thCls + ' text-center'}>Estado</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody>
                {tarimaRows.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">Sin materiales configurados</td></tr>
                ) : tarimaRows.map(r => (
                  <tr key={r.id} className={trCls}>
                    <td className={tdCls}>
                      <div className="font-medium text-ink">{r.material_nombre}</div>
                      {r.material_codigo && <div className="text-[11px] font-mono" style={{ color: 'var(--ink-faint)' }}>{r.material_codigo}</div>}
                    </td>
                    <td className={tdCls + ' text-ink-muted'}>{r.descripcion || '—'}</td>
                    <td className={tdCls + ' text-right font-bold text-ink'}>{r.cantidad}</td>
                    <td className={tdCls + ' text-center'}>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${r.activo ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {r.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setTarimaEditing(r); setTarimaForm({ material_id: r.material_id, descripcion: r.descripcion, cantidad: String(r.cantidad), activo: r.activo }); setTarimaBusqueda(''); setTarimaModal(true); }}
                          className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-900/30"><Pencil size={13} /></button>
                        <button onClick={() => deleteTarima(r.id)}
                          className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-900/30"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ TAB: CONVERSIONES ═══════════════════════════════════════════════ */}
      {tab === 'conversiones' && (
        <>
          <p className="text-xs mb-4" style={{ color: 'var(--ink-faint)' }}>
            Define cuántas unidades de uso (ej: etiquetas) trae cada unidad de compra (ej: caja cerrada).
            Permite registrar el BG en cajas y descargar el IP en unidades sueltas.
          </p>
          <div className={tableWrapCls}>
            <table className="w-full text-xs">
              <thead className={theadCls}>
                <tr>
                  <th className={thCls}>Material</th>
                  <th className={thCls + ' text-right'}>Unidades / paquete</th>
                  <th className={thCls}>Unidad compra</th>
                  <th className={thCls}>Unidad uso</th>
                  <th className={thCls}>Notas</th>
                  <th className={thCls + ' text-center'}>Estado</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody>
                {conversiones.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Sin conversiones definidas</td></tr>
                ) : conversiones.map(c => (
                  <tr key={c.id} className={trCls}>
                    <td className={tdCls}>
                      <div className="font-medium text-ink">{c.material?.nombre || c.material_id}</div>
                      {c.material?.codigo && <div className="font-mono text-[10px] text-blue-400">{c.material.codigo}</div>}
                    </td>
                    <td className={tdCls + ' text-right font-bold text-ink'}>{c.unidades_por_paquete.toLocaleString('es-CR')}</td>
                    <td className={tdCls + ' text-ink-muted'}>{c.unidad_compra}</td>
                    <td className={tdCls + ' text-ink-muted'}>{c.unidad_uso}</td>
                    <td className={tdCls + ' text-ink-muted'}>{c.notas || '—'}</td>
                    <td className={tdCls + ' text-center'}>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${c.activo ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setConvEditing(c);
                            setConvForm({ material_id: c.material_id, unidad_compra: c.unidad_compra, unidades_por_paquete: String(c.unidades_por_paquete), unidad_uso: c.unidad_uso, notas: c.notas || '', activo: c.activo });
                            setConvBusqueda('');
                            setConvModal(true);
                          }}
                          className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-900/30"><Pencil size={13} /></button>
                        <button onClick={() => deleteConversion(c.id)}
                          className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-900/30"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ MODAL: Abrir Caja ════════════════════════════════════════════════ */}
      {abrirCajaSaldo && (
        <AbrirCajaModal
          saldo={abrirCajaSaldo}
          empresaId={empresaId}
          onClose={() => setAbrirCajaSaldo(null)}
          onSaved={load}
        />
      )}

      {/* ═══ MODAL: Registrar Movimiento Manual ══════════════════════════════ */}
      {showMovModal && (
        <Modal title="Registrar Movimiento" onClose={() => setShowMovModal(false)} size="lg">
          <form onSubmit={handleSaveMov} className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(['entrada', 'salida', 'traslado'] as const).map(t => {
                const c = TIPO_COLORS[t];
                return (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tipo: t }))}
                    className="flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-all"
                    style={form.tipo === t
                      ? { background: c.bg, border: `2px solid ${c.border}`, color: c.text }
                      : { background: 'var(--surface-deep)', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
                    {tipoIcon(t)}{TIPO_LABELS[t]}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Material *</label>
                <select required value={form.material_id} onChange={e => setForm(f => ({ ...f, material_id: e.target.value }))} className={selectCls}>
                  <option value="">— Seleccione —</option>
                  {materiales.map(m => <option key={m.id} value={m.id}>{m.codigo ? `[${m.codigo}] ` : ''}{m.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{form.tipo === 'traslado' ? 'Bodega Origen *' : 'Bodega *'}</label>
                <select required value={form.bodega_id} onChange={e => setForm(f => ({ ...f, bodega_id: e.target.value }))} className={selectCls}>
                  <option value="">— Seleccione —</option>
                  {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}{b.tipo ? ` (${b.tipo})` : ''}</option>)}
                </select>
              </div>
              {form.tipo === 'traslado' && (
                <div>
                  <label className={labelCls}>Bodega Destino *</label>
                  <select required value={form.bodega_destino_id} onChange={e => setForm(f => ({ ...f, bodega_destino_id: e.target.value }))} className={selectCls}>
                    <option value="">— Seleccione —</option>
                    {bodegas.filter(b => b.id !== form.bodega_id).map(b => <option key={b.id} value={b.id}>{b.nombre}{b.tipo ? ` (${b.tipo})` : ''}</option>)}
                  </select>
                </div>
              )}
              {/* ── Cantidad: lógica según conversión ── */}
              {(() => {
                const conv = conversionMap.get(form.material_id);
                const bodegaSel = bodegas.find(b => b.id === form.bodega_id);
                const isBGConConv = !!conv && bodegaSel?.tipo === 'BG' && form.tipo === 'entrada';

                if (isBGConConv) {
                  // BG + entrada + conversión: el usuario ingresa CAJAS, unidades se calculan solas
                  const cajas = parseFloat(form.cantidad_paquetes) || 0;
                  const unidades = cajas * conv.unidades_por_paquete;
                  return (
                    <div className="col-span-2 space-y-2">
                      <div>
                        <label className={labelCls}>
                          Cantidad de {conv.unidad_compra}s *
                          <span className="ml-1 font-normal" style={{ color: 'var(--ink-faint)' }}>
                            (1 {conv.unidad_compra} = {conv.unidades_por_paquete.toLocaleString('es-CR')} {conv.unidad_uso})
                          </span>
                        </label>
                        <input
                          type="number" min="0.01" step="0.01" required
                          value={form.cantidad_paquetes}
                          onChange={e => {
                            const c = e.target.value;
                            const u = parseFloat(c) * conv.unidades_por_paquete;
                            setForm(f => ({ ...f, cantidad_paquetes: c, cantidad: isNaN(u) ? '' : String(u) }));
                          }}
                          placeholder={`Ej: 30 ${conv.unidad_compra}s`}
                          className={inputCls}
                          autoFocus
                        />
                      </div>
                      {cajas > 0 && (
                        <div className="rounded-lg px-3 py-2 border border-emerald-800/40 bg-emerald-950/20 text-xs text-emerald-300">
                          {cajas.toLocaleString('es-CR')} {conv.unidad_compra}
                          {cajas !== 1 ? 's' : ''} × {conv.unidades_por_paquete.toLocaleString('es-CR')} ={' '}
                          <span className="font-bold text-emerald-200">
                            {unidades.toLocaleString('es-CR')} {conv.unidad_uso}
                          </span>{' '}
                          → BG
                        </div>
                      )}
                    </div>
                  );
                }

                // Caso normal: campo cantidad libre
                return (
                  <div>
                    <label className={labelCls}>Cantidad *</label>
                    <input type="number" min="0.01" step="0.01" required value={form.cantidad}
                      onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} className={inputCls} />
                  </div>
                );
              })()}
              <div className="col-span-2">
                <label className={labelCls}>Referencia <span className="text-ink-muted">(# factura, lote, etc.)</span></label>
                <input type="text" value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Notas</label>
                <textarea value={form.notas} rows={2} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={inputCls + ' resize-none'} />
              </div>
            </div>
            {error && <p className={errorCls}>{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowMovModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando...' : 'Registrar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══ MODAL: Nueva / Editar Conversión ════════════════════════════════ */}
      {convModal && (
        <Modal title={convEditing ? 'Editar Conversión' : 'Nueva Conversión'} onClose={() => setConvModal(false)} size="md">
          <form onSubmit={saveConversion} className="space-y-4">
            <div>
              <label className={labelCls}>Material *</label>
              {!convEditing && (
                <div className="relative mb-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={13} />
                  <input type="text" placeholder="Buscar..." value={convBusqueda} onChange={e => setConvBusqueda(e.target.value)} className={inputCls + ' pl-8 py-1.5 text-xs'} />
                </div>
              )}
              <select required value={convForm.material_id} onChange={e => setConvForm(f => ({ ...f, material_id: e.target.value }))} className={selectCls} size={convEditing ? 1 : 5} disabled={!!convEditing}>
                <option value="">— Seleccione —</option>
                {materiales
                  .filter(m => {
                    const q = convBusqueda.toLowerCase();
                    return !q || m.nombre.toLowerCase().includes(q) || (m.codigo || '').toLowerCase().includes(q);
                  })
                  .map(m => <option key={m.id} value={m.id}>{m.codigo ? `[${m.codigo}] ` : ''}{m.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Unidad compra *</label>
                <input type="text" required value={convForm.unidad_compra} onChange={e => setConvForm(f => ({ ...f, unidad_compra: e.target.value }))} className={inputCls} placeholder="caja, rollo..." />
              </div>
              <div>
                <label className={labelCls}>Unidades / paquete *</label>
                <input type="number" required min="0.0001" step="0.0001" value={convForm.unidades_por_paquete} onChange={e => setConvForm(f => ({ ...f, unidades_por_paquete: e.target.value }))} className={inputCls} placeholder="1000" />
              </div>
              <div>
                <label className={labelCls}>Unidad uso *</label>
                <input type="text" required value={convForm.unidad_uso} onChange={e => setConvForm(f => ({ ...f, unidad_uso: e.target.value }))} className={inputCls} placeholder="unidad, mt..." />
              </div>
            </div>
            <div>
              <label className={labelCls}>Notas <span style={{ color: 'var(--ink-faint)' }}>(opcional)</span></label>
              <input type="text" value={convForm.notas} onChange={e => setConvForm(f => ({ ...f, notas: e.target.value }))} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={convForm.activo} onChange={e => setConvForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 accent-green-500" />
              <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>Activo</span>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setConvModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={convSaving} className={btnPrimary}>{convSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══ MODAL: Tarima ════════════════════════════════════════════════════ */}
      {tarimaModal && (
        <Modal title={tarimaEditing ? 'Editar Material por Tarima' : 'Agregar Material por Tarima'} onClose={() => setTarimaModal(false)} size="md">
          <form onSubmit={saveTarima} className="space-y-4">
            <div>
              <label className={labelCls}>Material *</label>
              <div className="relative mb-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={13} />
                <input type="text" placeholder="Buscar material..." value={tarimaBusqueda} onChange={e => setTarimaBusqueda(e.target.value)} className={inputCls + ' pl-8 py-1.5 text-xs'} />
              </div>
              <select required value={tarimaForm.material_id} onChange={e => setTarimaForm(f => ({ ...f, material_id: e.target.value }))} className={selectCls} size={5}>
                <option value="">— Seleccione —</option>
                {materiales.filter(m => {
                  const q = tarimaBusqueda.toLowerCase();
                  return !q || m.nombre.toLowerCase().includes(q) || (m.codigo || '').toLowerCase().includes(q);
                }).map(m => <option key={m.id} value={m.id}>{m.codigo ? `[${m.codigo}] ` : ''}{m.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Descripción <span style={{ color: 'var(--ink-faint)' }}>(opcional)</span></label>
              <input type="text" value={tarimaForm.descripcion} onChange={e => setTarimaForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Fleje plástico por tarima" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Cantidad por tarima *</label>
              <input type="number" required min="0.01" step="0.01" value={tarimaForm.cantidad} onChange={e => setTarimaForm(f => ({ ...f, cantidad: e.target.value }))} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={tarimaForm.activo} onChange={e => setTarimaForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 accent-green-500" />
              <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>Activo</span>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setTarimaModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={tarimaSaving} className={btnPrimary}>{tarimaSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
