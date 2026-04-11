import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Pencil, Trash2, Search, ChevronDown, ChevronUp,
  CheckCircle, Box, Printer
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import {
  Boleta, Programa, ProgramaDetalle, Semana,
  Marca, Calibre, Recepcion, MaterialEmpaque
} from '../../types/empacadora';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import EtiquetaPaletaImprimir from './EtiquetaPaletaImprimir';
import { getCostaRicaDateISO } from '../../utils/costaRicaTime';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary, tableWrapCls, theadCls, thCls, trCls, tdCls, errorCls } from '../../components/ui';

// â”€â”€â”€ Semana ISO desde fecha â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getIsoDayNumber(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return 0;
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return d.getUTCDay() || 7;
}

function formatNumeroPaletaVisual(numeroPaleta: number | string | null | undefined, fecha?: string | null) {
  const numero = Number(numeroPaleta || 0);
  if (!numero) return '';
  const dayPrefix = fecha ? getIsoDayNumber(fecha) : 0;
  return dayPrefix ? `${dayPrefix}-${numero}` : String(numero);
}

// Semanas a mostrar: Â±6 semanas desde hoy
// â”€â”€â”€ CÃ³digo de planta fijo por empresa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PLANTA_CODIGO = '01';
const LAST_PALLET_SELECTION_KEY = 'empacadora:last-pallet-selection';

type RecepcionConInfo = Pick<Recepcion, 'id' | 'codigo' | 'fecha' | 'lote'> & {
  grupo_forza: string | null;
  proveedor_codigo: string | null;
};

function generarTrazabilidad(recepId: string, fecha: string, lote: string, recs: RecepcionConInfo[]): string {
  const rec = recs.find(r => r.id === recepId);
  if (!rec || !fecha) return '';
  const d = new Date(fecha + 'T12:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const gf    = (rec.grupo_forza        || '00').padStart(2, '0').slice(0, 2);
  const loteS = (lote                   || '00').padStart(2, '0').slice(0, 2);
  const finca = (rec.proveedor_codigo   || '00').padStart(2, '0').slice(0, 2);
  return `B${rec.codigo} ${dd}${mm}${yy} ${gf}${loteS} ${finca}${PLANTA_CODIGO}`;
}

type FormBoleta = Omit<Boleta, 'id' | 'created_at' | 'total_frutas' | 'programa' | 'opc'>;

type LastPalletSelection = {
  programa_id?: string;
  programa_det_id?: string;
  recepcion_id?: string;
  semana_id?: string;
  calibre_id?: string;
  calibre_nombre?: string;
  tipo?: 'COR' | 'CRW';
  marca_id?: string;
  marca_nombre?: string;
  frutas_por_caja?: number;
  cajas_por_paleta?: number;
  material_caja_id?: string;
  material_colilla_id?: string;
  tarina?: 'EUROPEA' | 'AMERICANA';
};

const EMPTY: FormBoleta = {
  empresa_id: 0, programa_id: '', programa_det_id: '', recepcion_id: '',
  semana_id: '', numero_paleta: 0, fecha: getCostaRicaDateISO(),
  calibre_id: '', calibre_nombre: '', tipo: 'COR', marca_id: '', marca_nombre: '',
  lote: '', frutas_por_caja: 0, cajas_por_paleta: 70, cajas_empacadas: 0,
  cajas_a_puchos: 0, puchos: 0, puchos_2: 0, puchos_3: 0,
  material_caja_id: '', material_colilla_id: '',
  tarina: 'EUROPEA', trazabilidad: '', barcode_cliente: '', aplica: false,
};

export default function BoleasList() {
  const empresaId = useEmpresaId();
  const cajasEmpacadasRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Boleta[]>([]);
  const [programas, setProgramas] = useState<Pick<Programa, 'id' | 'codigo' | 'cliente_nombre' | 'semana_id'>[]>([]);
  const [programaDets, setProgramaDets] = useState<ProgramaDetalle[]>([]);
  const [semanas, setSemanas] = useState<Pick<Semana, 'id' | 'codigo' | 'semana' | 'año' | 'fecha_inicio'>[]>([]);
  const [marcas, setMarcas] = useState<Pick<Marca, 'id' | 'nombre'>[]>([]);
  const [calibres, setCalibre] = useState<Pick<Calibre, 'id' | 'nombre' | 'frutas_por_caja' | 'cajas_por_paleta' | 'tipo'>[]>([]);
  const [recepciones, setRecepciones] = useState<RecepcionConInfo[]>([]);
  const [cartones, setCartones] = useState<Pick<MaterialEmpaque, 'id' | 'nombre'>[]>([]);
  const [colillas, setColillas] = useState<Pick<MaterialEmpaque, 'id' | 'nombre'>[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [programaFiltro, setProgramaFiltro] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [editing, setEditing] = useState<Boleta | null>(null);
  const [form, setForm] = useState<FormBoleta>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Boleta | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedOrp, setExpandedOrp] = useState<string | null>(null);
  const [labelPrintId, setLabelPrintId] = useState<string | null>(null);
  const lastSelectionStorageKey = `${LAST_PALLET_SELECTION_KEY}:${empresaId}`;

  const writeLastSelection = useCallback((source: FormBoleta) => {
    try {
      const payload: LastPalletSelection = {
        programa_id: source.programa_id || '',
        programa_det_id: source.programa_det_id || '',
        recepcion_id: source.recepcion_id || '',
        semana_id: source.semana_id || '',
        calibre_id: source.calibre_id || '',
        calibre_nombre: source.calibre_nombre || '',
        tipo: source.tipo || 'COR',
        marca_id: source.marca_id || '',
        marca_nombre: source.marca_nombre || '',
        frutas_por_caja: Number(source.frutas_por_caja || 0),
        cajas_por_paleta: Number(source.cajas_por_paleta || 0),
        material_caja_id: source.material_caja_id || '',
        material_colilla_id: source.material_colilla_id || '',
        tarina: source.tarina || 'EUROPEA',
      };
      localStorage.setItem(lastSelectionStorageKey, JSON.stringify(payload));
    } catch {}
  }, [lastSelectionStorageKey]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: bols }, { data: progs }, { data: sems }, { data: mrcs }, { data: cals }, { data: recs }, { data: mats }] = await Promise.all([
      supabase.from('emp_boletas')
        .select('*, programa:emp_programas(id,codigo,cliente_nombre), opc:emp_programas_detalle(id,marca_nombre,calibre_nombre)')
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false })
        .order('numero_paleta'),
      supabase.from('emp_programas').select('id,codigo,cliente_nombre,semana_id')
        .eq('empresa_id', empresaId).eq('terminado', false).order('fecha', { ascending: false }),
      supabase.from('emp_semanas').select('*')
        .eq('empresa_id', empresaId).eq('activo', true).order('año', { ascending: false }).order('semana', { ascending: false }),
      supabase.from('emp_marcas').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_calibres').select('id,nombre,frutas_por_caja,cajas_por_paleta,tipo').eq('empresa_id', empresaId).eq('activo', true).order('orden'),
      supabase.from('emp_recepciones').select('id,codigo,fecha,lote,grupo_forza,proveedor:emp_proveedores_fruta(codigo)').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(100),
      supabase.from('emp_materiales').select('id,nombre,tipo').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
    ]);
    setRows(bols || []);
    setProgramas(progs || []);
    setSemanas(sems || []);
    setMarcas(mrcs || []);
    setCalibre(cals || []);
    setRecepciones((recs || []).map((r: any) => ({
      ...r,
      proveedor_codigo: r.proveedor?.codigo || null,
    })));
    const allMats = (mats || []) as Pick<MaterialEmpaque, 'id' | 'nombre' | 'tipo'>[];
    setCartones(allMats.filter(m => m.tipo === 'carton'));
    setColillas(allMats.filter(m => m.tipo === 'colilla'));
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  // Cuando cambia el programa en el form, cargar sus OPC
  useEffect(() => {
    if (!form.programa_id) { setProgramaDets([]); return; }
    supabase.from('emp_programas_detalle').select('*')
      .eq('programa_id', form.programa_id).order('orden')
      .then(({ data }) => setProgramaDets(data || []));
  }, [form.programa_id]);

  useEffect(() => {
    if (!showModal || editing || !form.programa_det_id) return;
    if (!programaDets.length) return;
    const det = programaDets.find((d) => d.id === form.programa_det_id) || null;
    if (det) return;
    setForm((f) => ({ ...f, programa_det_id: '' }));
  }, [showModal, editing, form.programa_det_id, programaDets]);

  // Filtrado
  const filtered = rows.filter(r => {
    if (programaFiltro === 'pendientes-aplicar') {
      if (r.aplica) return false;
    } else if (programaFiltro && r.programa_id !== programaFiltro) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.marca_nombre || '').toLowerCase().includes(s) ||
        (r.calibre_nombre || '').toLowerCase().includes(s) ||
        (r.lote || '').toLowerCase().includes(s) ||
        (r.barcode_cliente || '').toLowerCase().includes(s) ||
        (r.trazabilidad || '').toLowerCase().includes(s) ||
        String(r.numero_paleta).includes(s);
    }
    return true;
  });

  // Agrupar por programa (ORP)
  const grupos = filtered.reduce<Record<string, { prog: typeof programas[0] | undefined; boletas: Boleta[] }>>((acc, b) => {
    const key = b.programa_id || 'sin-programa';
    if (!acc[key]) {
      acc[key] = { prog: programas.find(p => p.id === b.programa_id), boletas: [] };
    }
    acc[key].boletas.push(b);
    return acc;
  }, {});

  // â”€â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function handleCalibreChange(calibreId: string) {
    const cal = calibres.find(c => c.id === calibreId);
    setForm(f => ({
      ...f,
      calibre_id: calibreId,
      calibre_nombre: cal?.nombre || '',
      tipo: (cal?.tipo as 'COR' | 'CRW') || 'COR',
      frutas_por_caja: cal?.frutas_por_caja || f.frutas_por_caja,
      cajas_por_paleta: cal?.cajas_por_paleta || f.cajas_por_paleta,
    }));
  }

  function handleMarcaChange(marcaId: string) {
    setForm(f => ({ ...f, marca_id: marcaId, marca_nombre: marcas.find(m => m.id === marcaId)?.nombre || '' }));
  }

  async function handleOpcChange(detId: string) {
    const det = programaDets.find(d => d.id === detId);
    // Llenar campos base del OPC
    setForm(f => ({
      ...f,
      programa_det_id: detId,
      marca_id: det?.marca_id || f.marca_id,
      marca_nombre: det?.marca_nombre || f.marca_nombre,
      calibre_id: det?.calibre_id || f.calibre_id,
      calibre_nombre: det?.calibre_nombre || f.calibre_nombre,
      cajas_por_paleta: det?.cajas_por_paleta || f.cajas_por_paleta,
      cajas_empacadas: det?.cajas_por_paleta || f.cajas_empacadas,
      material_caja_id: det?.material_caja_id || f.material_caja_id,
      material_colilla_id: det?.material_colilla_id || f.material_colilla_id,
    }));
    if (det?.calibre_id) {
      const cal = calibres.find(c => c.id === det.calibre_id);
      if (cal) setForm(f => ({ ...f, frutas_por_caja: cal.frutas_por_caja, tipo: cal.tipo as 'COR' | 'CRW' }));
      // Si la lÃ­nea OPC no tiene materiales, resolver desde emp_calibre_materiales (marca+calibre)
      if (!det.material_caja_id || !det.material_colilla_id) {
        const marcaId = det.marca_id || '';
        const { data: mats } = await supabase
          .from('emp_calibre_materiales')
          .select('material_id, marca_id, orden')
          .eq('calibre_id', det.calibre_id)
          .or(marcaId ? `marca_id.eq.${marcaId},marca_id.is.null` : 'marca_id.is.null')
          .order('orden');
        if (mats && mats.length > 0) {
          const specific = (mats as any[]).filter(m => m.marca_id === marcaId);
          const resolved = specific.length > 0 ? specific : (mats as any[]).filter(m => m.marca_id === null);
          setForm(f => ({
            ...f,
            material_caja_id: resolved[0]?.material_id || f.material_caja_id,
            material_colilla_id: resolved[1]?.material_id || f.material_colilla_id,
          }));
        }
      }
    }
    // Enfocar y seleccionar el campo cajas empacadas para confirmaciÃ³n
    setTimeout(() => { cajasEmpacadasRef.current?.focus(); cajasEmpacadasRef.current?.select(); }, 50);
  }

  // Auto-genera trazabilidad cuando cambian recepcion, fecha o lote
  useEffect(() => {
    if (!form.recepcion_id || !form.fecha) return;
    const traza = generarTrazabilidad(form.recepcion_id, form.fecha, form.lote || '', recepciones);
    if (traza) setForm(f => ({ ...f, trazabilidad: traza }));
  }, [form.recepcion_id, form.fecha, form.lote, recepciones]);

  useEffect(() => {
    if (!form.programa_id) return;
    const programa = programas.find((p) => p.id === form.programa_id) || null;
    if (!programa?.semana_id) return;
    setForm((f) => (f.semana_id === programa.semana_id ? f : { ...f, semana_id: programa.semana_id || '' }));
  }, [form.programa_id, programas]);

  function openNew() {
    setEditing(null);
    const today = getCostaRicaDateISO();
    const paletasHoy = rows.filter((r) => r.fecha === today);
    const nextPaleta = paletasHoy.length > 0 ? Math.max(...paletasHoy.map(r => r.numero_paleta)) + 1 : 1;
    setForm({
      ...EMPTY,
      programa_id: '',
      programa_det_id: '',
      recepcion_id: '',
      semana_id: '',
      fecha: today,
      numero_paleta: nextPaleta,
      calibre_id: '',
      calibre_nombre: '',
      tipo: 'COR',
      marca_id: '',
      marca_nombre: '',
      frutas_por_caja: 0,
      cajas_por_paleta: 70,
      material_caja_id: '',
      material_colilla_id: '',
      tarina: 'EUROPEA',
      lote: '',
      trazabilidad: '',
      barcode_cliente: '',
      trazabilidad_2: '',
      trazabilidad_3: '',
      aplica: false,
    });
    setShowModal(true);
  }

  function openEdit(b: Boleta) {
    setEditing(b);
    setForm({
      empresa_id: b.empresa_id, programa_id: b.programa_id || '',
      programa_det_id: b.programa_det_id || '', recepcion_id: b.recepcion_id || '',
      semana_id: b.semana_id || '', numero_paleta: b.numero_paleta, fecha: b.fecha,
      calibre_id: b.calibre_id || '', calibre_nombre: b.calibre_nombre || '',
      tipo: b.tipo, marca_id: b.marca_id || '', marca_nombre: b.marca_nombre || '',
      lote: b.lote || '', frutas_por_caja: b.frutas_por_caja,
      cajas_por_paleta: b.cajas_por_paleta, cajas_empacadas: b.cajas_empacadas,
      cajas_a_puchos: b.cajas_a_puchos || 0, puchos: b.puchos, puchos_2: b.puchos_2, puchos_3: b.puchos_3,
      material_caja_id: b.material_caja_id || '',
      material_colilla_id: b.material_colilla_id || '',
      tarina: b.tarina, trazabilidad: b.trazabilidad || '',
      barcode_cliente: b.barcode_cliente || '',
      trazabilidad_2: b.trazabilidad_2, trazabilidad_3: b.trazabilidad_3,
      aplica: b.aplica,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const payload = {
      ...form, empresa_id: empresaId,
      programa_id: form.programa_id || null,
      programa_det_id: form.programa_det_id || null,
      recepcion_id: form.recepcion_id || null,
      semana_id: form.semana_id || null,
      calibre_id: form.calibre_id || null,
      marca_id: form.marca_id || null,
      material_caja_id: form.material_caja_id || null,
      material_colilla_id: form.material_colilla_id || null,
    };
    const { error } = editing
      ? await supabase.from('emp_boletas').update(payload).eq('id', editing.id)
      : await supabase.from('emp_boletas').insert(payload);
    if (error) { setError(error.message); setSaving(false); return; }
    writeLastSelection(form);
    setSaving(false); setShowModal(false); load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_boletas').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  async function toggleAplica(b: Boleta) {
    const { error: err } = await supabase.from('emp_boletas').update({ aplica: !b.aplica }).eq('id', b.id);
    if (err) {
      const msg = err.message.includes('bandeja') ? 'Asigne la bandeja antes de aplicar la paleta.'
        : err.message.includes('colilla') ? 'Asigne la colilla antes de aplicar la paleta.'
        : err.message;
      setError(msg);
    }
    load();
  }

  // Stock de puchos disponibles para el calibre seleccionado en el formulario
  const puchosDisponibles = useMemo(() => {
    if (!form.calibre_id) return 0;
    const del = rows.filter(b => b.calibre_id === form.calibre_id);
    const generados  = del.reduce((s, b) => s + (b.cajas_a_puchos || 0), 0);
    const consumidos = del.reduce((s, b) => s + b.puchos + b.puchos_2 + b.puchos_3, 0);
    // Si estamos editando, descontar los puchos consumidos por esta misma boleta
    const propios = editing ? (editing.puchos + editing.puchos_2 + editing.puchos_3) : 0;
    return Math.max(0, generados - consumidos + propios);
  }, [rows, form.calibre_id, editing]);

  const totalPaletas = filtered.length;
  const totalCajas   = filtered.reduce((s, b) => s + b.cajas_empacadas, 0);
  const totalFrutas  = filtered.reduce((s, b) => s + (b.total_frutas || 0), 0);
  const pendingBoletas = filtered.filter((b) => !b.aplica);
  const totalPendientesAsignacion = pendingBoletas.length;

  const semanaSeleccionada = semanas.find((s) => s.id === form.semana_id) || null;
  const selectedProgramaBoletas = form.programa_id ? rows.filter((b) => b.programa_id === form.programa_id) : [];
  const selectedProgramaAplicadas = selectedProgramaBoletas.filter((b) => b.aplica).length;
  const selectedProgramaProgressPct = selectedProgramaBoletas.length > 0
    ? Math.round((selectedProgramaAplicadas / selectedProgramaBoletas.length) * 100)
    : 0;
  const selectedProgramaCumplido = !!form.programa_id && selectedProgramaBoletas.length > 0 && selectedProgramaProgressPct >= 100;

  if (labelPrintId) {
    return <EtiquetaPaletaImprimir boletaId={labelPrintId} onBack={() => setLabelPrintId(null)} />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <style>{`
        @keyframes emp-pending-border-shift {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .emp-pending-spotlight {
          position: relative;
          border-radius: 0.85rem;
          padding: 1px;
          background: linear-gradient(
            120deg,
            rgba(245,158,11,0.18) 0%,
            rgba(251,191,36,0.78) 18%,
            rgba(245,158,11,0.22) 34%,
            rgba(245,158,11,0.12) 50%,
            rgba(251,191,36,0.76) 66%,
            rgba(245,158,11,0.18) 82%,
            rgba(245,158,11,0.18) 100%
          );
          background-size: 220% 220%;
          animation: emp-pending-border-shift 4.8s linear infinite;
          box-shadow: 0 0 0 1px rgba(245,158,11,0.12), 0 16px 32px rgba(15,23,42,0.18);
        }
      `}</style>
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Control de Empaque</h1>
          <p className="text-gray-400 text-sm mt-1">
            {totalPaletas} paletas - {totalCajas.toLocaleString('es-CR')} cajas - {totalFrutas.toLocaleString('es-CR')} frutas
          </p>
          {totalPendientesAsignacion > 0 && (
            <p className="text-amber-400 text-xs mt-1 font-medium">
              {totalPendientesAsignacion} paletas pendientes de aplicar a la Programacion
            </p>
          )}
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={15} /> Nueva Paleta
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
          <input type="text" placeholder="Buscar marca, calibre, lote, trazabilidad..." value={search}
            onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
        </div>
        <select value={programaFiltro} onChange={e => setProgramaFiltro(e.target.value)} className={selectCls}>
          <option value="">Todos los programas</option>
          {programas.map(p => <option key={p.id} value={p.id}>{p.codigo} - {p.cliente_nombre}</option>)}
        </select>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : Object.keys(grupos).length === 0 ? (
        <div className="text-center py-12 text-gray-600">Sin boletas registradas</div>
      ) : (
        <div className="space-y-4">
          {pendingBoletas.length > 0 && (
            <div className="emp-pending-spotlight">
              <div className="bg-surface-raised rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-500/20" style={{ background: 'rgba(245, 158, 11, 0.08)' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-amber-300">PENDIENTES</span>
                  <span className="font-bold text-ink">Pendientes de aplicar</span>
                  <span className="text-xs text-amber-200">{pendingBoletas.length} paletas</span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
                  Estas paletas ya existen en su ORP, pero aun no cuentan para el avance hasta marcar `Paleta aplicada`.
                </p>
              </div>
              <div className={tableWrapCls.replace('rounded-xl', '')}>
                <table className="w-full text-xs">
                  <thead className={theadCls}>
                    <tr>
                      <th className={thCls + ' text-right'}># Paleta</th>
                      <th className={thCls}>ORP</th>
                      <th className={thCls}>Cliente</th>
                      <th className={thCls}>Fecha</th>
                      <th className={thCls}>Calibre</th>
                      <th className={thCls}>Marca</th>
                      <th className={thCls + ' text-right'}>Cajas</th>
                      <th className={thCls}>Barcode cliente</th>
                      <th className={thCls}>Trazabilidad</th>
                      <th className={thCls}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingBoletas.map((b) => {
                      const prog = programas.find((p) => p.id === b.programa_id);
                      return (
                        <tr key={`pend-${b.id}`} className={trCls}>
                          <td className={tdCls + ' text-right font-bold text-ink'}>{formatNumeroPaletaVisual(b.numero_paleta, b.fecha)}</td>
                          <td className={tdCls}>
                            <span className="font-mono text-amber-300">{prog?.codigo || 'Sin ORP'}</span>
                          </td>
                          <td className={tdCls + ' text-ink'}>{prog?.cliente_nombre || 'Sin programa'}</td>
                          <td className={tdCls + ' text-gray-400'}>
                            {new Date(b.fecha + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit' })}
                          </td>
                          <td className={tdCls}>
                            <span className="px-1.5 py-0.5 bg-surface-overlay rounded text-ink">{b.calibre_nombre || '-'}</span>
                          </td>
                          <td className={tdCls + ' text-yellow-400'}>{b.marca_nombre || '-'}</td>
                          <td className={tdCls + ' text-right text-ink font-medium'}>{b.cajas_empacadas}</td>
                          <td className={tdCls + ' font-mono text-xs text-cyan-300'}>{b.barcode_cliente || '-'}</td>
                          <td className={tdCls + ' font-mono text-xs text-green-400'}>{b.trazabilidad || '-'}</td>
                          <td className={tdCls}>
                            <div className="flex justify-end gap-1">
                              <button onClick={() => setLabelPrintId(b.id)} title="Imprimir etiqueta R23" className="text-emerald-400 hover:text-emerald-300 p-1 rounded hover:bg-emerald-900/30"><Printer size={12} /></button>
                              <button onClick={() => openEdit(b)} className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-900/30"><Pencil size={12} /></button>
                              <button onClick={() => setDeleteTarget(b)} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-900/30"><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          )}

          {Object.entries(grupos).map(([key, { prog, boletas }]) => {
            const expanded = expandedOrp === key;
            const aplicadas = boletas.filter(b => b.aplica).length;
            const cajasTot = boletas.reduce((s, b) => s + b.cajas_empacadas, 0);
            const pendientes = boletas.length - aplicadas;
            const progressPct = boletas.length > 0 ? Math.round((aplicadas / boletas.length) * 100) : 0;
            const progressColor = pendientes > 0 ? '#f59e0b' : '#22c55e';
            const codigoLabel = prog?.codigo || 'Sin ORP';
            const nombreLabel = prog?.cliente_nombre || 'Sin programa';

            return (
              <div key={key} className="bg-surface-raised border border-line rounded-xl overflow-hidden">
                {/* Header ORP */}
                <button onClick={() => setExpandedOrp(expanded ? null : key)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-surface-overlay transition-colors text-left">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs" style={{ color: pendientes > 0 ? '#fbbf24' : '#6b7280' }}>{codigoLabel}</span>
                      <span className="font-bold text-ink">{nombreLabel}</span>
                      <span className="text-xs text-gray-400">
                        {aplicadas}/{boletas.length} paletas aplicadas
                      </span>
                      {pendientes > 0 && (
                        <span className="text-xs font-medium text-amber-400">{pendientes} pendientes</span>
                      )}
                      <span className="text-xs text-gray-500">|</span>
                      <span className="text-xs text-gray-400">{cajasTot.toLocaleString('es-CR')} cajas</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 max-w-xs">
                      <div className="flex-1 bg-surface-overlay rounded-full h-1">
                        <div className="h-1 rounded-full"
                          style={{ width: `${progressPct}%`, background: progressColor }} />
                      </div>
                      <span className="text-xs" style={{ color: pendientes > 0 ? '#fbbf24' : '#6b7280' }}>
                        {progressPct}%
                      </span>
                    </div>
                  </div>
                  {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {/* Tabla de boletas */}
                {expanded && (
                  <div className={tableWrapCls.replace('rounded-xl', '') + ' border-t border-line'}>
                    <table className="w-full text-xs">
                      <thead className={theadCls}>
                        <tr>
                          <th className={thCls + ' text-center'}>OK</th>
                          <th className={thCls + ' text-right'}># Paleta</th>
                          <th className={thCls}>Fecha</th>
                          <th className={thCls}>OPC</th>
                          <th className={thCls}>Calibre</th>
                          <th className={thCls}>Marca</th>
                          <th className={thCls + ' text-right'}>Cjs/Pal</th>
                          <th className={thCls + ' text-right'}>Cajas</th>
                          <th className={thCls + ' text-right'}>Puchos</th>
                          <th className={thCls + ' text-right'}>Total Frutas</th>
                          <th className={thCls}>Tarina</th>
                          <th className={thCls}>Barcode cliente</th>
                          <th className={thCls}>Trazabilidad</th>
                          <th className={thCls}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {boletas.map(b => (
                          <tr key={b.id} className={trCls + (b.aplica ? ' opacity-60' : '')}>
                            <td className={tdCls + ' text-center'}>
                              <button onClick={() => toggleAplica(b)} title="Aplicar paleta">
                                <CheckCircle size={14} className={b.aplica ? 'text-green-400' : 'text-gray-700'} />
                              </button>
                            </td>
                            <td className={tdCls + ' text-right font-bold text-ink'}>{formatNumeroPaletaVisual(b.numero_paleta, b.fecha)}</td>
                            <td className={tdCls + ' text-gray-400'}>
                              {new Date(b.fecha + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit' })}
                            </td>
                            <td className={tdCls + ' font-mono text-gray-500 text-xs'}>
                              {(b.opc as any)?.id?.slice(-6) || '-'}
                            </td>
                            <td className={tdCls}>
                              <span className="px-1.5 py-0.5 bg-surface-overlay rounded text-ink">{b.calibre_nombre || '-'}</span>
                            </td>
                            <td className={tdCls + ' text-yellow-400'}>{b.marca_nombre || '-'}</td>
                            <td className={tdCls + ' text-right text-gray-400'}>{b.cajas_por_paleta}</td>
                            <td className={tdCls + ' text-right text-ink font-medium'}>{b.cajas_empacadas}</td>
                            <td className={tdCls + ' text-right text-orange-400'}>{b.puchos + b.puchos_2 + b.puchos_3 || '-'}</td>
                            <td className={tdCls + ' text-right text-ink'}>{b.total_frutas?.toLocaleString('es-CR') || '-'}</td>
                            <td className={tdCls}>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${b.tarina === 'EUROPEA' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'}`}>
                                {b.tarina}
                              </span>
                            </td>
                            <td className={tdCls + ' font-mono text-xs text-cyan-300'}>{b.barcode_cliente || '-'}</td>
                            <td className={tdCls + ' font-mono text-xs text-green-400'}>{b.trazabilidad || '-'}</td>
                            <td className={tdCls}>
                              <div className="flex justify-end gap-1">
                                <button onClick={() => setLabelPrintId(b.id)} title="Imprimir etiqueta R23" className="text-emerald-400 hover:text-emerald-300 p-1 rounded hover:bg-emerald-900/30"><Printer size={12} /></button>
                                <button onClick={() => openEdit(b)} className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-900/30"><Pencil size={12} /></button>
                                <button onClick={() => setDeleteTarget(b)} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-900/30"><Trash2 size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {/* Subtotales */}
                        <tr className="bg-surface-base/60 font-medium border-t border-line">
                          <td colSpan={7} className="px-3 py-2 text-xs text-gray-500">SUBTOTAL</td>
                          <td className="px-3 py-2 text-right text-xs text-ink">{cajasTot.toLocaleString('es-CR')}</td>
                          <td className="px-3 py-2 text-right text-xs text-orange-400">
                            {boletas.reduce((s, b) => s + b.puchos + b.puchos_2 + b.puchos_3, 0) || '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-ink">
                            {boletas.reduce((s, b) => s + (b.total_frutas || 0), 0).toLocaleString('es-CR')}
                          </td>
                          <td colSpan={4}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nueva/editar boleta */}
      {showModal && (
        <Modal title={editing ? `Editar Paleta #${formatNumeroPaletaVisual(editing.numero_paleta, editing.fecha)}` : 'Nueva Paleta de Empaque'} onClose={() => setShowModal(false)} size="xl">
          <form onSubmit={handleSave} className="space-y-5">

            {/* LÃ­nea 1: Programa y referencias */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Programa (ORP)</label>
                <select value={form.programa_id} onChange={e => {
                  const programaId = e.target.value;
                  const programa = programas.find((p) => p.id === programaId) || null;
                  setForm(f => ({
                    ...f,
                    programa_id: programaId,
                    programa_det_id: '',
                    semana_id: programa?.semana_id || '',
                  }));
                }} className={selectCls + ' w-full'}>
                  <option value="">- Seleccione -</option>
                  {programas.map(p => <option key={p.id} value={p.id}>{p.codigo} - {p.cliente_nombre}</option>)}
                </select>
                {selectedProgramaCumplido && (
                  <div className="mt-2 rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
                    Este programa ya alcanzo el 100% de paletas aplicadas. Es solo una alerta; puede continuar si lo necesita.
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Linea OPC (Marca/Calibre)</label>
                <select value={form.programa_det_id} onChange={e => handleOpcChange(e.target.value)} className={selectCls + ' w-full'} disabled={!form.programa_id}>
                  <option value="">- Seleccione OPC -</option>
                  {programaDets.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.orden}. {d.marca_nombre} - {d.calibre_nombre} ({d.paletas_programadas}p)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Recepcion de fruta</label>
                <select value={form.recepcion_id || ''}
                  onChange={e => {
                    const rec = recepciones.find(r => r.id === e.target.value);
                    setForm(f => ({
                      ...f,
                      recepcion_id: e.target.value,
                      lote: rec?.lote || '',
                    }));
                  }}
                  className={selectCls + ' w-full'}>
                  <option value="">- Sin asignar -</option>
                  {recepciones.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.codigo || r.id.slice(0, 6)} - {new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit' })}
                      {r.lote ? ` (L${r.lote})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* LÃ­nea 2: Fecha â†’ semana auto */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}># Paleta *</label>
                <input
                  type="text"
                  value={formatNumeroPaletaVisual(form.numero_paleta, form.fecha)}
                  readOnly
                  placeholder="Se asigna automaticamente"
                  className={inputCls}
                  style={{ opacity: 0.82, cursor: 'not-allowed' }}
                />
              </div>
              <div>
                <label className={labelCls}>Fecha *</label>
                <input type="date" required value={form.fecha}
                  readOnly className={inputCls}
                  style={{ opacity: 0.82, cursor: 'not-allowed' }} />
              </div>
              <div>
                <label className={labelCls}>Semana</label>
                <input
                  type="text"
                  value={semanaSeleccionada ? `Sem ${semanaSeleccionada.codigo}` : ''}
                  readOnly
                  placeholder={form.programa_id ? 'Semana del programa' : 'Seleccione ORP'}
                  className={inputCls}
                  style={{ opacity: 0.82, cursor: 'not-allowed' }}
                />
              </div>
              <div>
                <label className={labelCls}>Lote</label>
                <input type="text" value={form.lote || ''}
                  readOnly
                  placeholder={form.recepcion_id ? 'Lote traido desde recepcion' : 'Seleccione recepcion'}
                  className={inputCls}
                  style={{ opacity: 0.82, cursor: 'not-allowed' }} />
              </div>
            </div>

            {/* LÃ­nea 3: Calibre y marca */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Calibre</label>
                <select value={form.calibre_id} onChange={e => handleCalibreChange(e.target.value)} className={selectCls + ' w-full'}>
                  <option value="">- Seleccione -</option>
                  {calibres.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Marca</label>
                <select value={form.marca_id} onChange={e => handleMarcaChange(e.target.value)} className={selectCls + ' w-full'}>
                  <option value="">- Seleccione -</option>
                  {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Frutas/Caja</label>
                <input type="number" value={form.frutas_por_caja || ''}
                  onChange={e => setForm(f => ({ ...f, frutas_por_caja: +e.target.value }))}
                  min={1} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cajas/Paleta prog.</label>
                <div className={inputCls + ' flex items-center justify-between cursor-default select-none'}
                  style={{ opacity: 0.75, borderStyle: 'dashed' }}>
                  <span className="font-mono font-bold text-ink">{form.cajas_por_paleta || '-'}</span>
                  <span className="text-[10px] text-ink-faint">del OPC</span>
                </div>
              </div>
            </div>

            {/* LÃ­nea 4: Materiales de empaque */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nombre Caja (carton)</label>
                <select value={form.material_caja_id || ''} onChange={e => setForm(f => ({ ...f, material_caja_id: e.target.value }))} className={selectCls + ' w-full'}>
                  <option value="">- Seleccione -</option>
                  {cartones.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Colilla</label>
                <select value={form.material_colilla_id || ''} onChange={e => setForm(f => ({ ...f, material_colilla_id: e.target.value }))} className={selectCls + ' w-full'}>
                  <option value="">- Seleccione -</option>
                  {colillas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>

            {/* LÃ­nea 5: Tarina y cajas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Tarina</label>
                <select value={form.tarina} onChange={e => setForm(f => ({ ...f, tarina: e.target.value as any }))} className={selectCls + ' w-full'}>
                  <option value="EUROPEA">EUROPEA</option>
                  <option value="AMERICANA">AMERICANA</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Cajas Empacadas *</label>
                <input ref={cajasEmpacadasRef} type="number" required value={form.cajas_empacadas || ''}
                  onChange={e => setForm(f => ({ ...f, cajas_empacadas: +e.target.value }))}
                  min={0} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cajas a Pool Puchos</label>
                <input type="number" value={form.cajas_a_puchos || ''}
                  onChange={e => setForm(f => ({ ...f, cajas_a_puchos: +e.target.value }))}
                  min={0} className={inputCls} />
              </div>
              <div className="flex items-end pb-1">
                {form.calibre_id && (
                  <div className={`w-full text-center rounded-lg px-2 py-2 text-xs font-semibold ${
                    puchosDisponibles > 0
                      ? 'bg-orange-900/40 text-orange-300 border border-orange-700/50'
                      : 'bg-surface-overlay text-ink-faint border border-line'
                  }`}>
                    Pool {form.calibre_nombre || ''}:<br/>
                    <span className="text-base font-bold">{puchosDisponibles}</span> cajas disponibles
                  </div>
                )}
              </div>
            </div>

            {/* Puchos incorporados desde pool */}
            <div className="rounded-lg border border-line p-3 space-y-2" style={{ background: 'var(--surface-overlay)' }}>
              <p className={labelCls + ' mb-2'}>Cajas incorporadas desde pool de puchos</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Fuente 1 - cajas</label>
                  <input type="number" value={form.puchos || ''}
                    onChange={e => setForm(f => ({ ...f, puchos: +e.target.value }))}
                    min={0} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Fuente 2 - cajas</label>
                  <input type="number" value={form.puchos_2 || ''}
                    onChange={e => setForm(f => ({ ...f, puchos_2: +e.target.value }))}
                    min={0} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Fuente 3 - cajas</label>
                  <input type="number" value={form.puchos_3 || ''}
                    onChange={e => setForm(f => ({ ...f, puchos_3: +e.target.value }))}
                    min={0} className={inputCls} />
                </div>
              </div>
            </div>

            {/* Total cajas y frutas */}
            <div className="bg-surface-base rounded-lg px-4 py-2 flex flex-wrap items-center gap-4 text-sm">
              <Box size={14} className="text-green-400" />
              <span className="text-ink-muted">Total cajas en tarima:</span>
              <span className="text-ink font-bold">
                {(form.cajas_empacadas + form.puchos + form.puchos_2 + form.puchos_3).toLocaleString('es-CR')}
              </span>
              <span className="text-ink-faint">|</span>
              <span className="text-ink-muted">Total frutas:</span>
              <span className="text-ink font-bold">
                {((form.cajas_empacadas + form.puchos + form.puchos_2 + form.puchos_3) * form.frutas_por_caja).toLocaleString('es-CR')}
              </span>
            </div>

            {/* Trazabilidad */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className={labelCls}>Codigo de barras cliente</label>
                <div className="flex flex-col gap-2 md:flex-row">
                  <input type="text" value={form.barcode_cliente || ''}
                    onChange={e => setForm(f => ({ ...f, barcode_cliente: e.target.value.trimStart() }))}
                    placeholder="Escanee o pegue la etiqueta suministrada por el cliente"
                    className={inputCls + ' font-mono tracking-wide md:flex-1'}
                    inputMode="text" autoComplete="off" />
                  <button
                    type="button"
                    onClick={() => setShowBarcodeScanner(true)}
                    className={btnSecondary + ' whitespace-nowrap'}
                  >
                    Escanear
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Trazabilidad (produccion)</label>
                <input type="text" value={form.trazabilidad || ''}
                  readOnly
                  placeholder={form.recepcion_id ? 'Completar lote y fecha' : 'Seleccione recepcion'}
                  className={inputCls + ' font-mono text-xs bg-surface-deep cursor-default'} />
              </div>
              <div>
                <label className={labelCls}>Trazabilidad Puchos Fuente 1</label>
                <input type="text" value={form.trazabilidad_2 || ''}
                  onChange={e => setForm(f => ({ ...f, trazabilidad_2: e.target.value }))}
                  placeholder="Codigo de boleta origen"
                  className={inputCls + ' font-mono text-xs'} />
              </div>
              <div>
                <label className={labelCls}>Trazabilidad Puchos Fuente 2</label>
                <input type="text" value={form.trazabilidad_3 || ''}
                  onChange={e => setForm(f => ({ ...f, trazabilidad_3: e.target.value }))}
                  placeholder="Codigo de boleta origen"
                  className={inputCls + ' font-mono text-xs'} />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.aplica}
                onChange={e => setForm(f => ({ ...f, aplica: e.target.checked }))}
                className="w-4 h-4 accent-green-500" />
              <span className="text-sm text-ink-muted">Paleta aplicada (cuenta para avance del programa)</span>
            </label>

            {error && <p className={errorCls}>{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando...' : 'Guardar Paleta'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Eliminar la paleta #${formatNumeroPaletaVisual(deleteTarget.numero_paleta, deleteTarget.fecha)}?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}

      {showBarcodeScanner && (
        <BarcodeScannerModal
          onClose={() => setShowBarcodeScanner(false)}
          onDetected={(value) => {
            setForm((f) => ({ ...f, barcode_cliente: value }));
            setShowBarcodeScanner(false);
          }}
        />
      )}
    </div>
  );
}


