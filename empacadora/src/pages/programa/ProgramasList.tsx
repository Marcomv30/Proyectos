import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  Plus, Pencil, Trash2, Search, ChevronDown, ChevronUp,
  Ship, CheckCircle, Clock, ArrowUp, ArrowDown, X
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Programa, ProgramaDetalle, Semana, Destino, Marca, Calibre } from '../../types/empacadora';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getCostaRicaDateISO, getISOWeekInfoCostaRica } from '../../utils/costaRicaTime';
import { inputCls, selectCls, btnPrimary, btnSecondary } from '../../components/ui';

// ─── Semana ISO desde fecha ───────────────────────────────────────────────────
function getISOWeekInfo(dateStr: string): { week: number; year: number; codigo: string } {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getUTCDay() || 7;
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day));
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  const yy = String(thu.getUTCFullYear()).slice(-2);
  return { week, year: thu.getUTCFullYear(), codigo: `${week}-${yy}` };
}

function semanasEnRango(
  semanas: Pick<Semana, 'id' | 'codigo' | 'semana' | 'año' | 'fecha_inicio'>[],
  selectedId: string
) {
  const hoy = getISOWeekInfoCostaRica(getCostaRicaDateISO());
  const inRange = semanas.filter(s => {
    const diff = (s.año - hoy.year) * 52 + (s.semana - hoy.week);
    return diff >= -6 && diff <= 4;
  });
  const ids = new Set(inRange.map(s => s.id));
  const sel = semanas.find(s => s.id === selectedId);
  if (sel && !ids.has(sel.id)) inRange.push(sel);
  return inRange.sort((a, b) => b.año - a.año || b.semana - a.semana);
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
type DestinoFull = Pick<Destino, 'id' | 'nombre' | 'emp_cliente_id'>;
type MarcaFull   = Pick<Marca,   'id' | 'nombre' | 'emp_cliente_id'>;
type ClienteItem = { id: string; nombre: string; destino_id?: string; naviera?: string };
type ClienteMarca = { cliente_id: string; marca_id: string };

type ProductoFee = { id: number; codigo: string; descripcion: string; codigo_cabys: string | null; partida_arancelaria: string | null; precio_venta: number | null };
type FormProg = Omit<Programa, 'id' | 'created_at' | 'semana' | 'destino'>;
type FormDet  = { id?: string; marca_id: string; marca_nombre: string; calibre_id: string; calibre_nombre: string; cajas_por_paleta: number; paletas_programadas: number; orden: number; material_caja_id: string; material_colilla_id: string; producto_fee_id?: number };

const EMPTY_PROG: FormProg = {
  empresa_id: 0, semana_id: '', codigo: '',
  cliente_id: undefined, cliente_nombre: '', emp_cliente_id: '',
  destino_id: '', naviera: '', barco: '',
  fecha: getCostaRicaDateISO(),
  hora_inicio: '', hora_fin: '', paletas_programadas: 0, paletas_empacadas: 0,
  terminado: false, notas: '',
  precio_usd_caja: undefined, producto_fee_id: undefined,
};
const EMPTY_DET: FormDet = { marca_id: '', marca_nombre: '', calibre_id: '', calibre_nombre: '', cajas_por_paleta: 70, paletas_programadas: 0, orden: 1, material_caja_id: '', material_colilla_id: '', producto_fee_id: undefined };
const alignedLabelCls = 'block min-h-[2rem] text-[11px] font-semibold uppercase tracking-wider mb-1';

// Barra de progreso
function ProgressBar({ valor, total }: { valor: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-surface-overlay rounded-full h-1.5">
        <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-ink-muted w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function ProgramasList() {
  const empresaId = useEmpresaId();
  const [rows, setRows]           = useState<Programa[]>([]);
  const [filtered, setFiltered]   = useState<Programa[]>([]);
  const [semanas, setSemanas]     = useState<Pick<Semana, 'id' | 'codigo' | 'semana' | 'año' | 'fecha_inicio'>[]>([]);
  const [destinos, setDestinos]   = useState<DestinoFull[]>([]);
  const [marcas, setMarcas]       = useState<MarcaFull[]>([]);
  const [calibres, setCalibre]    = useState<Pick<Calibre, 'id' | 'nombre' | 'cajas_por_paleta' | 'material_caja_id' | 'material_colilla_id'>[]>([]);
  const [cartones, setCartones]   = useState<{ id: string; nombre: string }[]>([]);
  const [colillas, setColillas]   = useState<{ id: string; nombre: string }[]>([]);
  const [productosFee, setProductosFee] = useState<ProductoFee[]>([]);
  const [modalProductoIdx, setModalProductoIdx] = useState<number | null>(null);
  const [busqProducto, setBusqProducto]         = useState('');
  const [clientes, setClientes]     = useState<ClienteItem[]>([]);
  const [clienteMarcas, setClienteMarcas] = useState<ClienteMarca[]>([]);

  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');
  const [semanaFiltro, setSemanaFiltro] = useState('');
  const [view, setView]               = useState<'list' | 'form'>('list');
  const [editing, setEditing]         = useState<Programa | null>(null);
  const [form, setForm]               = useState<FormProg>(EMPTY_PROG);
  const [detalles, setDetalles]       = useState<FormDet[]>([{ ...EMPTY_DET }]);
  const [saving, setSaving]           = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Programa | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [detMap, setDetMap]           = useState<Record<string, ProgramaDetalle[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: progs }, { data: sems }, { data: dests }, { data: mrcs }, { data: cals }, { data: clis }, { data: mats }, { data: prods }] = await Promise.all([
      supabase.from('emp_programas')
        .select('*, semana:emp_semanas(id,codigo), destino:emp_destinos(id,nombre)')
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false }),
      supabase.from('emp_semanas').select('*')
        .eq('empresa_id', empresaId).eq('activo', true)
        .order('año', { ascending: false }).order('semana', { ascending: false }),
      supabase.from('emp_destinos').select('id,nombre,emp_cliente_id')
        .eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_marcas').select('id,nombre,emp_cliente_id')
        .eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_calibres').select('id,nombre,cajas_por_paleta,material_caja_id,material_colilla_id')
        .eq('empresa_id', empresaId).eq('activo', true).order('orden'),
      supabase.from('emp_clientes').select('id,nombre,destino_id,naviera')
        .eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_materiales').select('id,nombre,tipo')
        .eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('inv_productos').select('id,codigo,descripcion,codigo_cabys,partida_arancelaria,precio_venta')
        .eq('empresa_id', empresaId).eq('activo', true).like('codigo', 'EXP-%').order('descripcion'),
    ]);
    const cliIds = (clis || []).map((c: any) => c.id);
    const { data: cm } = cliIds.length > 0
      ? await supabase.from('emp_cliente_marcas').select('cliente_id,marca_id').in('cliente_id', cliIds)
      : { data: [] };
    setRows(progs || []);
    setSemanas(sems || []);
    setDestinos((dests || []) as DestinoFull[]);
    setMarcas((mrcs || []) as MarcaFull[]);
    setCalibre(cals || []);
    setClientes((clis || []) as ClienteItem[]);
    setClienteMarcas((cm || []) as ClienteMarca[]);
    setCartones(((mats || []) as any[]).filter(m => m.tipo === 'carton'));
    setColillas(((mats || []) as any[]).filter(m => m.tipo === 'colilla'));
    setProductosFee((prods || []) as ProductoFee[]);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let r = rows;
    if (semanaFiltro) r = r.filter(x => x.semana_id === semanaFiltro);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(x =>
        (x.cliente_nombre || '').toLowerCase().includes(s) ||
        (x.barco || '').toLowerCase().includes(s) ||
        (x.naviera || '').toLowerCase().includes(s) ||
        (x.codigo || '').toLowerCase().includes(s) ||
        (x.destino as any)?.nombre?.toLowerCase().includes(s)
      );
    }
    setFiltered(r);
  }, [rows, search, semanaFiltro]);

  // ─── Historial de naviera/barco por cliente (para datalist) ─────────────────
  const historialNavieras = useMemo(() => {
    if (!form.emp_cliente_id) return [];
    const set = new Set<string>();
    rows.forEach(p => { if (p.naviera && p.emp_cliente_id === form.emp_cliente_id) set.add(p.naviera); });
    return Array.from(set);
  }, [rows, form.emp_cliente_id]);

  const historialBarcos = useMemo(() => {
    if (!form.emp_cliente_id) return [];
    const set = new Set<string>();
    rows.forEach(p => { if (p.barco && p.emp_cliente_id === form.emp_cliente_id) set.add(p.barco); });
    return Array.from(set);
  }, [rows, form.emp_cliente_id]);

  // Destinos filtrados por cliente seleccionado
  const destinosFiltrados = useMemo(() => {
    if (!form.emp_cliente_id) return destinos;
    const byCliente = destinos.filter(d => d.emp_cliente_id === form.emp_cliente_id);
    return byCliente.length > 0 ? byCliente : destinos;
  }, [destinos, form.emp_cliente_id]);

  // Marcas filtradas desde emp_cliente_marcas
  const marcasFiltradas = useMemo(() => {
    if (!form.emp_cliente_id) return marcas;
    const ids = new Set(
      clienteMarcas.filter(cm => cm.cliente_id === form.emp_cliente_id).map(cm => cm.marca_id)
    );
    if (ids.size === 0) return marcas;
    return marcas.filter(m => ids.has(m.id));
  }, [marcas, clienteMarcas, form.emp_cliente_id]);

  // Semanas en rango para el selector
  const semanasSelector = semanasEnRango(semanas, form.semana_id || '');

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function handleClienteChange(clienteId: string) {
    const cli = clientes.find(c => c.id === clienteId);
    // Destino: desde config del cliente, si no hay uno único de emp_destinos
    const autoDestino = cli?.destino_id || (() => {
      const byCliente = destinos.filter(d => d.emp_cliente_id === clienteId);
      return byCliente.length === 1 ? byCliente[0].id : '';
    })();

    setForm(f => ({
      ...f,
      emp_cliente_id: clienteId,
      cliente_nombre: cli?.nombre || '',
      destino_id: autoDestino || '',
      naviera: cli?.naviera || '',
      barco: '',
    }));

    // Limpiar marcas del detalle que no sean de este cliente
    const marcasIds = new Set(
      clienteMarcas.filter(cm => cm.cliente_id === clienteId).map(cm => cm.marca_id)
    );
    setDetalles(ds => ds.map(d => {
      const valida = !d.marca_id || marcasIds.size === 0 || marcasIds.has(d.marca_id);
      return !valida ? { ...d, marca_id: '', marca_nombre: '' } : d;
    }));
  }

  function handleFechaChange(fecha: string) {
    const info = getISOWeekInfo(fecha);
    const semana = semanas.find(s => s.semana === info.week && s.año === info.year);
    setForm(f => ({ ...f, fecha, semana_id: semana?.id || f.semana_id }));
  }

  // Resuelve materiales para calibre+marca: prefiere específicos de marca, fallback a NULL
  async function resolveMateriales(calibreId: string, marcaId: string): Promise<{ caja: string; colilla: string }> {
    if (!calibreId) return { caja: '', colilla: '' };
    const query = supabase
      .from('emp_calibre_materiales')
      .select('material_id, marca_id, orden')
      .eq('calibre_id', calibreId)
      .order('orden');
    const { data: mats } = marcaId
      ? await query.or(`marca_id.eq.${marcaId},marca_id.is.null`)
      : await query.is('marca_id', null);
    if (!mats || mats.length === 0) return { caja: '', colilla: '' };
    const specific = (mats as any[]).filter(m => m.marca_id === marcaId);
    const resolved = specific.length > 0 ? specific : (mats as any[]).filter(m => m.marca_id === null);
    return { caja: resolved[0]?.material_id || '', colilla: resolved[1]?.material_id || '' };
  }

  async function handleCalibreChange(i: number, calibreId: string) {
    const cal = calibres.find(c => c.id === calibreId);
    const marcaId = detalles[i]?.marca_id || '';
    setDetalles(d => d.map((r, idx) => idx !== i ? r : {
      ...r,
      calibre_id: calibreId,
      calibre_nombre: cal?.nombre || '',
      cajas_por_paleta: cal?.cajas_por_paleta || r.cajas_por_paleta,
    }));
    const { caja, colilla } = await resolveMateriales(calibreId, marcaId);
    setDetalles(d => d.map((r, idx) => idx !== i ? r : {
      ...r,
      material_caja_id: caja || r.material_caja_id,
      material_colilla_id: colilla || r.material_colilla_id,
    }));
  }

  async function handleMarcaChange(i: number, marcaId: string) {
    const marca = marcas.find(m => m.id === marcaId);
    const calibreId = detalles[i]?.calibre_id || '';
    setDetalles(d => d.map((r, idx) => idx !== i ? r : {
      ...r,
      marca_id: marcaId,
      marca_nombre: marca?.nombre || '',
    }));
    if (calibreId) {
      const { caja, colilla } = await resolveMateriales(calibreId, marcaId);
      if (caja || colilla) {
        setDetalles(d => d.map((r, idx) => idx !== i ? r : {
          ...r,
          material_caja_id: caja || r.material_caja_id,
          material_colilla_id: colilla || r.material_colilla_id,
        }));
      }
    }
  }

  function updateDet(i: number, field: keyof FormDet, value: any) {
    setDetalles(d => d.map((r, idx) => {
      if (idx !== i) return r;
      return { ...r, [field]: value };
    }));
  }

  function addDetRow() {
    setDetalles(d => [...d, { ...EMPTY_DET, orden: d.length + 1 }]);
  }

  function removeDetRow(i: number) {
    setDetalles(d => d.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, orden: idx + 1 })));
  }

  function moveDetRow(i: number, dir: -1 | 1) {
    setDetalles(d => {
      const arr = [...d];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr.map((r, idx) => ({ ...r, orden: idx + 1 }));
    });
  }

  // Recalcular total paletas del encabezado
  useEffect(() => {
    const total = detalles.reduce((s, d) => s + (d.paletas_programadas || 0), 0);
    setForm(f => ({ ...f, paletas_programadas: total }));
  }, [detalles]);

  async function loadDetalle(progId: string) {
    if (detMap[progId]) return;
    const { data } = await supabase.from('emp_programas_detalle').select('*').eq('programa_id', progId).order('orden');
    setDetMap(m => ({ ...m, [progId]: data || [] }));
  }

  function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    loadDetalle(id);
  }

  function openNew() {
    setEditing(null);
    const today = getCostaRicaDateISO();
    const info = getISOWeekInfo(today);
    const sem = semanas.find(s => s.semana === info.week && s.año === info.year) || semanas[0];
    setForm({ ...EMPTY_PROG, fecha: today, semana_id: sem?.id || '' });
    setDetalles([{ ...EMPTY_DET, orden: 1 }]);
    setView('form');
  }

  async function openEdit(p: Programa) {
    setEditing(p);
    setForm({
      empresa_id: p.empresa_id, semana_id: p.semana_id || '', codigo: p.codigo || '',
      cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre || '',
      emp_cliente_id: p.emp_cliente_id || '',
      destino_id: p.destino_id || '', naviera: p.naviera || '', barco: p.barco || '',
      fecha: p.fecha, hora_inicio: p.hora_inicio || '', hora_fin: p.hora_fin || '',
      paletas_programadas: p.paletas_programadas, paletas_empacadas: p.paletas_empacadas,
      terminado: p.terminado, notas: p.notas || '',
      precio_usd_caja: p.precio_usd_caja, producto_fee_id: p.producto_fee_id,
    });
    const { data } = await supabase.from('emp_programas_detalle').select('*').eq('programa_id', p.id).order('orden');
    const baseDetalles = data && data.length > 0
      ? data.map(d => ({
          marca_id: d.marca_id || '', marca_nombre: d.marca_nombre || '',
          id: d.id,
          calibre_id: d.calibre_id || '', calibre_nombre: d.calibre_nombre || '',
          cajas_por_paleta: d.cajas_por_paleta, paletas_programadas: d.paletas_programadas,
          orden: d.orden,
          material_caja_id: d.material_caja_id || '',
          material_colilla_id: d.material_colilla_id || '',
          producto_fee_id: d.producto_fee_id || undefined,
        }))
      : [{ ...EMPTY_DET }];
    // Resolver materiales para líneas que tienen calibre pero no tienen material asignado
    const detsFinal = await Promise.all(baseDetalles.map(async d => {
      if (!d.calibre_id || (d.material_caja_id && d.material_colilla_id)) return d;
      const { caja, colilla } = await resolveMateriales(d.calibre_id, d.marca_id);
      return { ...d, material_caja_id: caja || d.material_caja_id, material_colilla_id: colilla || d.material_colilla_id };
    }));
    setDetalles(detsFinal);
    setView('form');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const payload = {
      ...form, empresa_id: empresaId,
      semana_id: form.semana_id || null,
      destino_id: form.destino_id || null,
      hora_inicio: form.hora_inicio || null,
      hora_fin: form.hora_fin || null,
      cliente_id: form.cliente_id || null,
    };

    let progId = editing?.id;
    if (editing) {
      const { error } = await supabase.from('emp_programas').update(payload).eq('id', editing.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('emp_programas').insert(payload).select('id').single();
      if (error) { setError(error.message); setSaving(false); return; }
      progId = data.id;
    }

    const detsValidos = detalles.filter(d => d.paletas_programadas > 0);

    if (editing && progId) {
      const pid = progId; // narrowar tipo para TS
      // Filas con ID existente → UPDATE
      for (const d of detsValidos.filter(d => d.id)) {
        const { error: errUpd } = await supabase.from('emp_programas_detalle').update({
          marca_id: d.marca_id || null, marca_nombre: d.marca_nombre || null,
          calibre_id: d.calibre_id || null, calibre_nombre: d.calibre_nombre || null,
          cajas_por_paleta: d.cajas_por_paleta,
          paletas_programadas: d.paletas_programadas, orden: d.orden,
          material_caja_id: d.material_caja_id || null,
          material_colilla_id: d.material_colilla_id || null,
          producto_fee_id: d.producto_fee_id || null,
        }).eq('id', d.id!);
        if (errUpd) { setError(errUpd.message); setSaving(false); return; }
      }
      // Filas sin ID → INSERT (nuevas) — capturar IDs generados para excluirlos del DELETE
      const nuevas = detsValidos.filter(d => !d.id);
      const insertadosIds: string[] = [];
      if (nuevas.length > 0) {
        const { data: insertados, error: errIns } = await supabase.from('emp_programas_detalle').insert(
          nuevas.map(d => ({
            empresa_id: empresaId, programa_id: pid,
            marca_id: d.marca_id || null, marca_nombre: d.marca_nombre || null,
            calibre_id: d.calibre_id || null, calibre_nombre: d.calibre_nombre || null,
            cajas_por_paleta: d.cajas_por_paleta,
            paletas_programadas: d.paletas_programadas, orden: d.orden,
            material_caja_id: d.material_caja_id || null,
            material_colilla_id: d.material_colilla_id || null,
            producto_fee_id: d.producto_fee_id || null,
          }))
        ).select('id');
        if (errIns) { setError(errIns.message); setSaving(false); return; }
        (insertados || []).forEach(r => insertadosIds.push(r.id));
      }
      // Filas eliminadas del form → DELETE solo si no tienen boletas y no son recién insertadas
      const idsEnForm = new Set([...detsValidos.filter(d => d.id).map(d => d.id!), ...insertadosIds]);
      const { data: todasEnDb } = await supabase.from('emp_programas_detalle').select('id').eq('programa_id', progId);
      const eliminadas = (todasEnDb || []).map(r => r.id).filter(id => !idsEnForm.has(id));
      if (eliminadas.length > 0) {
        const { data: conBoleta } = await supabase.from('emp_boletas').select('programa_det_id').in('programa_det_id', eliminadas);
        const protegidas = new Set((conBoleta || []).map(r => r.programa_det_id));
        const seguras = eliminadas.filter(id => !protegidas.has(id));
        if (seguras.length > 0) {
          await supabase.from('emp_programas_detalle').delete().in('id', seguras);
        }
      }
    } else if (progId && detsValidos.length > 0) {
      // Programa nuevo → INSERT directo
      const { error } = await supabase.from('emp_programas_detalle').insert(
        detsValidos.map(d => ({
          empresa_id: empresaId, programa_id: progId,
          marca_id: d.marca_id || null, marca_nombre: d.marca_nombre || null,
          calibre_id: d.calibre_id || null, calibre_nombre: d.calibre_nombre || null,
          cajas_por_paleta: d.cajas_por_paleta,
          paletas_programadas: d.paletas_programadas, orden: d.orden,
          material_caja_id: d.material_caja_id || null,
          material_colilla_id: d.material_colilla_id || null,
          producto_fee_id: d.producto_fee_id || null,
        }))
      );
      if (error) { setError(error.message); setSaving(false); return; }
    }

    setSaving(false); setView('list');
    setDetMap({});
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_programas').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  async function toggleTerminado(p: Programa) {
    await supabase.from('emp_programas').update({ terminado: !p.terminado }).eq('id', p.id);
    load();
  }

  const totalPaletas = filtered.reduce((s, r) => s + r.paletas_programadas, 0);
  const semanaHint = form.fecha ? getISOWeekInfo(form.fecha) : null;

  // ─── Vista de formulario completo ───────────────────────────────────────────
  if (view === 'form') {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--surface-base)' }}>
        {/* Header pegajoso */}
        <div className="sticky top-0 z-10 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ backgroundColor: 'var(--surface-deep)', borderBottom: '1px solid var(--line)' }}>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {editing ? `Editar Programa — ${editing.codigo || ''}` : 'Nuevo Programa Semanal'}
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
              {editing ? editing.cliente_nombre : 'Complete los datos del programa'}
            </p>
          </div>
          <div className="grid w-full sm:w-auto grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={() => { setView('list'); setEditing(null); }}
              className={btnSecondary + ' w-full sm:min-w-[140px]'}>Cancelar</button>
            <button type="submit" form="prog-form" disabled={saving} className={btnPrimary + ' w-full'}>
              {saving ? 'Guardando...' : (editing ? 'Guardar Cambios' : 'Crear Programa')}
            </button>
          </div>
        </div>

        <form id="prog-form" onSubmit={handleSave} className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
          {error && <div className="mb-2 px-3 py-2 rounded text-xs" style={{ background: '#450a0a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{error}</div>}

          {/* ── INFORMACIÓN DE PROGRAMA ──────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-center mb-3" style={{ color: 'var(--ink-faint)' }}>Información de Programa</p>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">

              {/* Panel izquierdo: datos principales */}
              <div className="rounded-lg p-4 space-y-4 min-w-0" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>

                {/* Cliente */}
                <div>
                  <label className={alignedLabelCls} style={{ color: 'var(--ink-faint)' }}>Cliente *</label>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <select value={form.emp_cliente_id || ''} onChange={e => handleClienteChange(e.target.value)} className={selectCls + ' h-11 flex-1'}>
                      <option value="">— Seleccione —</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <input type="text" value={form.cliente_nombre || ''}
                      onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))}
                      placeholder="o escriba libre" className={inputCls + ' h-11 flex-1'} />
                  </div>
                </div>

                {/* Fecha + Semana */}
                <div className="grid items-start grid-cols-1 gap-3 md:grid-cols-2 md:items-end">
                  <div>
                    <label className={alignedLabelCls} style={{ color: 'var(--ink-faint)' }}>Fecha *</label>
                    <input type="date" required value={form.fecha} onChange={e => handleFechaChange(e.target.value)} className={inputCls + ' h-11'} />
                  </div>
                  <div>
                    <label className={alignedLabelCls} style={{ color: 'var(--ink-faint)' }}>
                      Semana {semanaHint && <span className="font-mono font-normal ml-1" style={{ color: 'var(--ink-faint)' }}>(ISO {semanaHint.codigo})</span>}
                    </label>
                    <select value={form.semana_id} onChange={e => setForm(f => ({ ...f, semana_id: e.target.value }))} className={selectCls + ' h-11'}>
                      <option value="">— Seleccione —</option>
                      {semanasSelector.map(s => <option key={s.id} value={s.id}>Semana {s.codigo}</option>)}
                    </select>
                  </div>
                </div>

                {/* Destino */}
                <div>
                  <label className={alignedLabelCls} style={{ color: 'var(--ink-faint)' }}>
                    Destino {destinosFiltrados.length < destinos.length && <span style={{ color: '#60a5fa' }}>({destinosFiltrados.length} del cliente)</span>}
                  </label>
                  <select value={form.destino_id || ''} onChange={e => setForm(f => ({ ...f, destino_id: e.target.value }))} className={selectCls + ' h-11'}>
                    <option value="">— Seleccione —</option>
                    {destinosFiltrados.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                  </select>
                </div>

                {/* Naviera + Barco */}
                <div className="grid items-start grid-cols-1 gap-3 md:grid-cols-2 md:items-end">
                  <div>
                    <label className={alignedLabelCls} style={{ color: 'var(--ink-faint)' }}>Naviera</label>
                    <input type="text" list="dl-navieras" value={form.naviera || ''}
                      onChange={e => setForm(f => ({ ...f, naviera: e.target.value }))}
                      placeholder="Ej: COSIARMA" className={inputCls + ' h-11'} autoComplete="off" />
                    <datalist id="dl-navieras">{historialNavieras.map(n => <option key={n} value={n} />)}</datalist>
                  </div>
                  <div>
                    <label className={alignedLabelCls} style={{ color: 'var(--ink-faint)' }}>Barco / Viaje</label>
                    <input type="text" list="dl-barcos" value={form.barco || ''}
                      onChange={e => setForm(f => ({ ...f, barco: e.target.value }))}
                      placeholder="Ej: CS SERVICE V.2526" className={inputCls + ' h-11'} autoComplete="off" />
                    <datalist id="dl-barcos">{historialBarcos.map(b => <option key={b} value={b} />)}</datalist>
                  </div>
                </div>

                {/* Horas */}
                <div className="grid items-start grid-cols-1 gap-3 md:grid-cols-2 md:items-end">
                  <div>
                    <label className={alignedLabelCls} style={{ color: 'var(--ink-faint)' }}>Hora inicio</label>
                    <input type="time" value={form.hora_inicio || ''} onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} className={inputCls + ' h-11'} />
                  </div>
                  <div>
                    <label className={alignedLabelCls} style={{ color: 'var(--ink-faint)' }}>Hora fin</label>
                    <input type="time" value={form.hora_fin || ''} onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))} className={inputCls + ' h-11'} />
                  </div>
                </div>
              </div>

              {/* Panel derecho: código + FEE */}
              <div className="rounded-lg p-4 space-y-4 min-w-0" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>

                {/* Código + Terminado */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <label className={alignedLabelCls} style={{ color: 'var(--ink-faint)' }}>Código ORP</label>
                    <input type="text" value={form.codigo || ''} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ej: ORP-001" className={inputCls + ' h-11 font-mono'} />
                  </div>
                  <div className="pb-0 md:pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.terminado} onChange={e => setForm(f => ({ ...f, terminado: e.target.checked }))} className="w-4 h-4 accent-green-600" />
                      <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>Completado</span>
                    </label>
                  </div>
                </div>

                {/* Notas */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-faint)' }}>Notas</label>
                  <textarea value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} className={inputCls + ' resize-none'} />
                </div>

                {/* Separador FEE */}
                <div className="pt-1" style={{ borderTop: '1px solid #78350f44' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#fbbf24' }}>FEE — Factura Exportación</p>
                  <p className="text-[10px] mb-3" style={{ color: 'var(--ink-faint)' }}>El producto y precio se configuran por línea en la tabla de calibres.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── DETALLE DEL PROGRAMA ─────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-center mb-3" style={{ color: 'var(--ink-faint)' }}>Detalle del Programa</p>
            <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ borderBottom: '1px solid var(--line)' }}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Calibres</p>
                  {form.cliente_nombre && marcasFiltradas.length < marcas.length && (
                    <p className="text-[10px] mt-0.5" style={{ color: '#60a5fa' }}>Marcas de {form.cliente_nombre}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-bold" style={{ color: '#4ade80' }}>
                    {detalles.reduce((s, d) => s + (d.paletas_programadas || 0), 0)} paletas
                  </span>
                  <button type="button" onClick={addDetRow}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors"
                    style={{ color: '#4ade80', border: '1px solid #14532d', background: '#052e1640' }}>
                    <Plus size={11} /> Agregar
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-xs">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider w-8 text-ink-faint">#</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Marca *</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Calibre *</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Bandeja (cartón)</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Colilla</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider w-20 text-ink-faint">Cajas/Pal.</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider w-20 text-ink-faint">Paletas *</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider w-28 text-ink-faint" style={{ color: '#fbbf24' }}>Prod. FEE</th>
                    <th className="px-2 py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.map((d, i) => (
                    <tr key={i} className="border-b border-line-dim">
                      <td className="px-3 py-1.5 text-center text-[11px] text-ink-faint">{d.orden}</td>
                      <td className="px-2 py-1.5">
                        <select value={d.marca_id} onChange={e => handleMarcaChange(i, e.target.value)} className={selectCls + ' py-1.5 text-xs'}>
                          <option value="">— Marca —</option>
                          {marcasFiltradas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={d.calibre_id} onChange={e => handleCalibreChange(i, e.target.value)} className={selectCls + ' py-1.5 text-xs'}>
                          <option value="">— Calibre —</option>
                          {calibres.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={d.material_caja_id} onChange={e => updateDet(i, 'material_caja_id', e.target.value)} className={selectCls + ' py-1.5 text-xs'}>
                          <option value="">— Bandeja —</option>
                          {cartones.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={d.material_colilla_id} onChange={e => updateDet(i, 'material_colilla_id', e.target.value)} className={selectCls + ' py-1.5 text-xs'}>
                          <option value="">— Colilla —</option>
                          {colillas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={d.cajas_por_paleta} onChange={e => updateDet(i, 'cajas_por_paleta', +e.target.value)} min={1} className={inputCls + ' py-1.5 text-xs'} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={d.paletas_programadas || ''} onChange={e => updateDet(i, 'paletas_programadas', +e.target.value)} min={0} className={inputCls + ' py-1.5 text-xs font-medium'} />
                      </td>
                      {/* Producto FEE */}
                      <td className="px-2 py-1.5">
                        {(() => {
                          const prod = d.producto_fee_id ? productosFee.find(p => p.id === d.producto_fee_id) : null;
                          return (
                            <button type="button"
                              onClick={() => { setBusqProducto(''); setModalProductoIdx(i); }}
                              title={prod ? `[${prod.codigo}] ${prod.descripcion}` : 'Seleccionar producto FEE'}
                              className="w-full text-left px-2 py-1 rounded text-[10px] flex items-center gap-1 truncate"
                              style={{ background: prod ? '#052e1640' : 'var(--surface-overlay)', border: `1px solid ${prod ? '#14532d' : 'var(--line)'}`, color: prod ? '#4ade80' : 'var(--ink-faint)' }}>
                              {prod
                                ? <><span className="font-mono truncate">{prod.codigo}</span></>
                                : <><Search size={10} /><span>—</span></>
                              }
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex justify-center gap-0.5">
                          <button type="button" onClick={() => moveDetRow(i, -1)} disabled={i === 0} className="p-1 disabled:opacity-30 text-ink-faint"><ArrowUp size={11} /></button>
                          <button type="button" onClick={() => moveDetRow(i, 1)} disabled={i === detalles.length - 1} className="p-1 disabled:opacity-30 text-ink-faint"><ArrowDown size={11} /></button>
                          {detalles.length > 1 && (
                            <button type="button" onClick={() => removeDetRow(i)} className="p-1" style={{ color: '#ef4444' }}><Trash2 size={11} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {detalles.length > 1 && (
                  <tfoot>
                    <tr style={{ borderTop: '1px solid var(--line)' }}>
                      <td colSpan={6} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Total</td>
                      <td className="px-2 py-2 text-sm font-bold" style={{ color: '#4ade80' }}>
                        {detalles.reduce((s, d) => s + (d.paletas_programadas || 0), 0)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
              </div>
            </div>
          </div>
        </form>

        {/* Modal producto FEE por OPC — portal para salir de cualquier stacking context */}
        {modalProductoIdx !== null && ReactDOM.createPortal(
          <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/75 backdrop-blur-[1px]" style={{ zIndex: 9999 }}>
            <div className="w-full max-w-lg rounded-lg shadow-2xl flex flex-col" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', maxHeight: '80vh' }}>
              <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg,#0d1829 0%,#101b2e 100%)' }}>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Producto FEE — Línea {modalProductoIdx + 1}</h2>
                  {detalles[modalProductoIdx] && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                      {detalles[modalProductoIdx].marca_nombre || '—'} / {detalles[modalProductoIdx].calibre_nombre || '—'}
                    </p>
                  )}
                </div>
                <button onClick={() => setModalProductoIdx(null)} className="rounded p-0.5" style={{ color: 'var(--ink-faint)' }}><X size={16} /></button>
              </div>
              <div className="overflow-y-auto p-4 flex-1 space-y-3">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
                  <input autoFocus type="text" placeholder="Buscar por código o descripción..."
                    value={busqProducto} onChange={e => setBusqProducto(e.target.value)}
                    className={inputCls + ' pl-8'} />
                </div>
                <div className="space-y-1">
                  {productosFee.filter(p => {
                    const q = busqProducto.toLowerCase();
                    return !q || p.descripcion.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q);
                  }).map(p => {
                    const isSelected = detalles[modalProductoIdx!]?.producto_fee_id === p.id;
                    return (
                      <button key={p.id} type="button"
                        onClick={() => {
                          updateDet(modalProductoIdx!, 'producto_fee_id', p.id);
                          setModalProductoIdx(null);
                        }}
                        className="w-full text-left px-3 py-2 rounded text-xs transition-colors"
                        style={{ background: isSelected ? '#052e16' : 'var(--surface-overlay)', border: `1px solid ${isSelected ? '#14532d' : 'var(--line)'}`, color: 'var(--ink)' }}>
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            <span className="font-mono text-[10px]" style={{ color: '#4ade80' }}>[{p.codigo}]</span>
                            <span className="ml-2">{p.descripcion}</span>
                          </span>
                          {p.precio_venta != null && (
                            <span className="font-mono text-[10px] shrink-0" style={{ color: '#fbbf24' }}>
                              ${p.precio_venta.toFixed(5)}/caja
                            </span>
                          )}
                        </div>
                        {(p.codigo_cabys || p.partida_arancelaria) && (
                          <div className="mt-0.5 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                            {p.codigo_cabys && <span>CABYS: {p.codigo_cabys}</span>}
                            {p.partida_arancelaria && <span className="ml-3">Partida: {p.partida_arancelaria}</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {productosFee.filter(p => { const q = busqProducto.toLowerCase(); return !q || p.descripcion.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q); }).length === 0 && (
                    <p className="text-center py-6 text-xs" style={{ color: 'var(--ink-faint)' }}>Sin resultados</p>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  // ─── Vista de lista ──────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Programa Semanal</h1>
          <p className="text-ink-muted text-sm mt-1">
            {filtered.length} programas — {totalPaletas.toLocaleString('es-CR')} paletas
          </p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nuevo Programa
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={14} />
          <input type="text" placeholder="Buscar cliente, barco, destino..." value={search}
            onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
        </div>
        <select value={semanaFiltro} onChange={e => setSemanaFiltro(e.target.value)} className={selectCls + ' w-full sm:w-auto'}>
          <option value="">Todas las semanas</option>
          {semanas.map(s => <option key={s.id} value={s.id}>Semana {s.codigo}</option>)}
        </select>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-ink-faint">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-ink-faint">Sin programas registrados</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const destNombre = (p.destino as any)?.nombre || '—';
            const semanaCod  = (p.semana as any)?.codigo || '—';
            const saldo      = p.paletas_programadas - p.paletas_empacadas;
            const expanded   = expandedId === p.id;

            return (
              <div key={p.id} className={`bg-surface-raised border rounded-xl overflow-hidden transition-colors ${p.terminado ? 'border-green-800/50' : 'border-line'}`}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggleTerminado(p)} title="Marcar completado" className="mt-0.5 flex-shrink-0">
                      {p.terminado
                        ? <CheckCircle size={18} className="text-green-400" />
                        : <Clock size={18} className="text-yellow-500" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-ink-faint">{p.codigo || '—'}</span>
                        <span className="font-bold text-ink text-sm">{p.cliente_nombre || 'Sin cliente'}</span>
                        <span className="px-2 py-0.5 bg-blue-900/60 text-blue-300 rounded-full text-xs font-medium">{destNombre}</span>
                        <span className="px-2 py-0.5 bg-yellow-900/40 text-yellow-400 rounded-full text-xs font-mono">Sem {semanaCod}</span>
                        {p.terminado && <span className="px-2 py-0.5 bg-green-900/60 text-green-400 rounded-full text-xs">Completado</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-ink-muted mb-2 flex-wrap">
                        {p.barco && <span className="flex items-center gap-1"><Ship size={11} />{p.barco}</span>}
                        {p.naviera && <span>{p.naviera}</span>}
                        <span>{new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-CR')}</span>
                        {p.hora_inicio && <span>{p.hora_inicio} — {p.hora_fin}</span>}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 max-w-xs">
                          <ProgressBar valor={p.paletas_empacadas} total={p.paletas_programadas} />
                        </div>
                        <span className="text-xs text-ink">
                          <span className="text-ink font-medium">{p.paletas_empacadas}</span>
                          <span className="text-ink-faint">/{p.paletas_programadas} paletas</span>
                          {saldo > 0 && <span className="text-yellow-400 ml-2">({saldo} saldo)</span>}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(p)} className="text-blue-400 hover:text-blue-300 p-1.5 rounded hover:bg-blue-900/30"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteTarget(p)} className="text-red-500 hover:text-red-400 p-1.5 rounded hover:bg-red-900/30"><Trash2 size={14} /></button>
                      <button onClick={() => toggleExpand(p.id)} className="text-ink-muted hover:text-ink p-1.5 rounded hover:bg-surface-overlay">
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-line bg-surface-base/50 px-4 py-3">
                    {detMap[p.id] === undefined ? (
                      <p className="text-xs text-ink-faint">Cargando detalle...</p>
                    ) : detMap[p.id].length === 0 ? (
                      <p className="text-xs text-ink-faint">Sin líneas de detalle</p>
                      ) : (
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-xs">
                        <thead>
                          <tr className="text-ink-faint border-b border-line-dim">
                            <th className="text-left py-1.5 pr-4 font-medium">#</th>
                            <th className="text-left py-1.5 pr-4 font-medium">Marca</th>
                            <th className="text-left py-1.5 pr-4 font-medium">Calibre</th>
                            <th className="text-right py-1.5 pr-4 font-medium">Cajas/Paleta</th>
                            <th className="text-right py-1.5 pr-4 font-medium">Programadas</th>
                            <th className="text-right py-1.5 pr-4 font-medium">Producidas</th>
                            <th className="text-right py-1.5 font-medium">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detMap[p.id].map(d => (
                            <tr key={d.id} className="border-b border-line-dim/50">
                              <td className="py-1.5 pr-4 text-ink-faint">{d.orden}</td>
                              <td className="py-1.5 pr-4 text-yellow-400 font-medium">{d.marca_nombre || '—'}</td>
                              <td className="py-1.5 pr-4 text-ink">{d.calibre_nombre || '—'}</td>
                              <td className="py-1.5 pr-4 text-right text-ink-muted">{d.cajas_por_paleta}</td>
                              <td className="py-1.5 pr-4 text-right text-ink font-medium">{d.paletas_programadas}</td>
                              <td className="py-1.5 pr-4 text-right text-green-400">{d.paletas_producidas}</td>
                              {(() => {
                                const saldo = d.paletas_programadas - d.paletas_producidas;
                                if (saldo === 0 && d.paletas_producidas > 0) return (
                                  <td className="py-1.5 text-right">
                                    <span className="inline-flex items-center gap-1 text-green-400 font-bold text-[11px]">✓ listo</span>
                                  </td>
                                );
                                return (
                                  <td className={`py-1.5 text-right font-bold ${saldo < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {saldo < 0 && <span title="Línea sobregirada" className="mr-1">⚠</span>}
                                    {saldo}
                                  </td>
                                );
                              })()}
                            </tr>
                          ))}
                          <tr className="border-t border-line font-medium">
                            <td colSpan={4} className="py-1.5 pr-4 text-ink-faint">TOTAL</td>
                            <td className="py-1.5 pr-4 text-right text-ink font-medium">{detMap[p.id].reduce((s, d) => s + d.paletas_programadas, 0)}</td>
                            <td className="py-1.5 pr-4 text-right text-green-400">{detMap[p.id].reduce((s, d) => s + d.paletas_producidas, 0)}</td>
                            {(() => {
                              const totalSaldo = detMap[p.id].reduce((s, d) => s + (d.paletas_programadas - d.paletas_producidas), 0);
                              return (
                                <td className={`py-1.5 text-right font-bold ${totalSaldo < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {totalSaldo < 0 && <span title="Programa sobregirado" className="mr-1">⚠</span>}
                                  {totalSaldo}
                                </td>
                              );
                            })()}
                          </tr>
                        </tbody>
                      </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`¿Eliminar el programa ${deleteTarget.codigo || ''} de ${deleteTarget.cliente_nombre}? Se eliminará también el detalle.`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}

    </div>
  );
}
