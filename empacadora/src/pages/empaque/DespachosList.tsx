import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Search, ChevronDown, ChevronUp,
  Container, Lock, Unlock, Ship, Tag, Printer, FileText, Copy
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import BoletaDespachoImprimir from './BoletaDespachoImprimir';
import GuiaDespachoImprimir from './GuiaDespachoImprimir';
import FeeDespachoImprimir from './FeeDespachoImprimir';
import PlanoCargaImprimir from './PlanoCargaImprimir';
import { Despacho, Boleta, Programa, Semana, Destino } from '../../types/empacadora';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getCostaRicaDateISO, getCostaRicaTimeHM } from '../../utils/costaRicaTime';
import { inputCls, selectCls, labelCls, btnPrimary, btnSecondary } from '../../components/ui';

type ProgramaItem = Pick<Programa, 'id' | 'codigo' | 'cliente_nombre' | 'naviera' | 'barco'> & {
  semana_id?: string; destino_id?: string;
};

type BoletaCierreDet = Pick<Boleta, 'calibre_nombre' | 'marca_nombre' | 'cajas_empacadas' | 'total_frutas' | 'numero_paleta' | 'trazabilidad'>;

type FormDes = Omit<Despacho, 'id' | 'created_at' | 'total_cajas' | 'total_paletas' | 'total_frutas' | 'codigo' | 'numero' | 'semana' | 'programa' | 'destino'>;

type ExportDefaults = {
  codigo_exportador_default?: string | null;
  ggn_global_gap_default?: string | null;
};

const EMPTY: FormDes = {
  empresa_id: 0, semana_id: '', programa_id: '',
  cliente_nombre: '', destino_id: '', destino_nombre: '',
  naviera: '', barco: '', fecha_apertura: getCostaRicaDateISO(),
  hora_apertura: '', fecha_cierre: '', hora_cierre: '',
  contenedor: '', tipo_contenedor: 'Estandar', clase_contenedor: 'HIGH CUBE',
  marchamo_llegada: '', marchamo_salida: '', termografo: '',
  peso_bruto: undefined, peso_neto: undefined, cerrada: false, notas: '',
  incoterms: 'EXW', shipper: '', ggn_global_gap: '', estado_actual: '',
  codigo_exportador: '', ep_mag: '',
};

export default function DespachosList() {
  const empresaId = useEmpresaId();
  const [rows, setRows]       = useState<Despacho[]>([]);
  const [semanas, setSemanas] = useState<Pick<Semana, 'id' | 'codigo'>[]>([]);
  const [programas, setProgramas] = useState<ProgramaItem[]>([]);
  const [destinos, setDestinos]   = useState<Pick<Destino, 'id' | 'nombre'>[]>([]);
  const [exportDefaults, setExportDefaults] = useState<ExportDefaults>({});

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [soloAbiertas, setSoloAbiertas] = useState(true);
  const [view, setView]         = useState<'list' | 'form'>('list');
  const [editing, setEditing]   = useState<Despacho | null>(null);
  const [form, setForm]         = useState<FormDes>(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Despacho | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [asignandoId, setAsignandoId]   = useState<string | null>(null);
  const [boletasDisp, setBoletasDisp]   = useState<Boleta[]>([]);
  const [boletasDes, setBoletasDes]     = useState<Boleta[]>([]);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [boletasMap, setBoletasMap]     = useState<Record<string, Boleta[]>>({});
  const [printId, setPrintId]   = useState<string | null>(null);
  const [guiaId,  setGuiaId]    = useState<string | null>(null);
  const [feeId,   setFeeId]     = useState<string | null>(null);
  const [planoId, setPlanoId]   = useState<string | null>(null);

  const [filtCal, setFiltCal]     = useState('');
  const [filtMarca, setFiltMarca] = useState('');
  const [pendientesCount, setPendientesCount] = useState<number | null>(null);

  const [cierreTarget, setCierreTarget] = useState<Despacho | null>(null);
  const [cierreForm, setCierreForm] = useState({ hora_cierre: '', marchamo_salida: '', peso_bruto: '', peso_neto: '' });
  const [cierreBoletasDet, setCierreBoletasDet] = useState<BoletaCierreDet[]>([]);
  const [cierreLoading, setCierreLoading] = useState(false);
  const [cierreSaving, setCierreSaving] = useState(false);
  const [cierreWarnings, setCierreWarnings] = useState<string[]>([]);

  const [generandoFeeId, setGenerandoFeeId] = useState<string | null>(null);
  const [feeError, setFeeError] = useState('');

  // Preview FEE
  interface FeePreview {
    despacho: Despacho;
    prog: { id: string; emp_cliente_id: number };
    receptor: { razon_social: string; identificacion: string; email: string; direccion: string } | null;
    lineas: { opc_id: string | null; marca: string; calibre: string; cajas: number; precio: number; total: number; producto_desc: string; codigo_cabys: string; partida_arancelaria: string | null }[];
    errores: string[];
    plazoEditable: number;
    condicionEditable: string;
  }
  const [feePreview, setFeePreview] = useState<FeePreview | null>(null);
  const [feePreviewLoading, setFeePreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: des }, { data: sems }, { data: progs }, { data: dests }] = await Promise.all([
      supabase.from('emp_despachos')
        .select('*, semana:emp_semanas(id,codigo), programa:emp_programas(id,codigo,cliente_nombre), destino:emp_destinos(id,nombre)')
        .eq('empresa_id', empresaId)
        .order('fecha_apertura', { ascending: false })
        .order('numero', { ascending: false }),
      supabase.from('emp_semanas').select('id,codigo').eq('empresa_id', empresaId).eq('activo', true).order('semana', { ascending: false }),
      supabase.from('emp_programas').select('id,codigo,cliente_nombre,naviera,barco,semana_id,destino_id')
        .eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('emp_destinos').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
    ]);
    let cfg: any = null;
    const cfgResult = await supabase
      .from('fe_config_empresa')
      .select('codigo_exportador_default, ggn_global_gap_default')
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (!cfgResult.error) cfg = cfgResult.data;
    setRows(des || []);
    setSemanas(sems || []);
    setProgramas((progs as any) || []);
    setDestinos(dests || []);
    setExportDefaults((cfg as ExportDefaults) || {});
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  // Query pendientes count on load
  useEffect(() => {
    async function fetchPendientes() {
      const { count } = await supabase
        .from('emp_boletas')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .is('despacho_id', null);
      setPendientesCount(count ?? 0);
    }
    fetchPendientes();
  }, [empresaId]);

  const filtered = rows.filter(r => {
    if (soloAbiertas && r.cerrada) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.contenedor || '').toLowerCase().includes(s) ||
        (r.cliente_nombre || '').toLowerCase().includes(s) ||
        (r.destino_nombre || '').toLowerCase().includes(s) ||
        (r.codigo || '').toLowerCase().includes(s) ||
        (r.barco || '').toLowerCase().includes(s);
    }
    return true;
  });

  // Al seleccionar programa → pre-llenar datos editables
  function handleProgramaChange(progId: string) {
    const p = programas.find(x => x.id === progId) as ProgramaItem | undefined;
    const dest = p?.destino_id ? destinos.find(d => d.id === p.destino_id) : undefined;
    setForm(f => ({
      ...f,
      programa_id:    progId,
      cliente_nombre: p?.cliente_nombre || f.cliente_nombre,
      naviera:        p?.naviera        || f.naviera,
      barco:          p?.barco          || f.barco,
      semana_id:      p?.semana_id      || f.semana_id,
      destino_id:     p?.destino_id     || f.destino_id,
      destino_nombre: dest?.nombre      || f.destino_nombre,
    }));
  }

  function handleDestinoChange(destId: string) {
    const d = destinos.find(x => x.id === destId);
    setForm(f => ({ ...f, destino_id: destId, destino_nombre: d?.nombre || '' }));
  }

  function openNew() {
    setEditing(null);
    // Pre-llenar campos de exportación del último despacho cerrado (machote)
    const ultimo = rows.find(r => r.cerrada);
    setForm({
      ...EMPTY,
      semana_id: semanas[0]?.id || '',
      incoterms:         ultimo?.incoterms         || 'EXW',
      shipper:           ultimo?.shipper           || '',
      ggn_global_gap:    ultimo?.ggn_global_gap    || exportDefaults.ggn_global_gap_default || '',
      codigo_exportador: ultimo?.codigo_exportador || exportDefaults.codigo_exportador_default || '',
      ep_mag:            ultimo?.ep_mag            || '',
    });
    setView('form');
  }

  function openEdit(d: Despacho) {
    setEditing(d);
    setForm({
      empresa_id: d.empresa_id, semana_id: d.semana_id || '', programa_id: d.programa_id || '',
      cliente_nombre: d.cliente_nombre || '', destino_id: d.destino_id || '',
      destino_nombre: d.destino_nombre || '', naviera: d.naviera || '', barco: d.barco || '',
      fecha_apertura: d.fecha_apertura, hora_apertura: d.hora_apertura || '',
      fecha_cierre: d.fecha_cierre || '', hora_cierre: d.hora_cierre || '',
      contenedor: d.contenedor || '', tipo_contenedor: d.tipo_contenedor || 'Estandar',
      clase_contenedor: d.clase_contenedor || 'HIGH CUBE',
      marchamo_llegada: d.marchamo_llegada || '', marchamo_salida: d.marchamo_salida || '',
      termografo: d.termografo || '', peso_bruto: d.peso_bruto, peso_neto: d.peso_neto,
      cerrada: d.cerrada, notas: d.notas || '',
      incoterms: d.incoterms || 'EXW', shipper: d.shipper || '',
      ggn_global_gap: d.ggn_global_gap || '', estado_actual: d.estado_actual || '',
      codigo_exportador: d.codigo_exportador || '', ep_mag: d.ep_mag || '',
    });
    setView('form');
  }

  function openDuplicate(d: Despacho) {
    setEditing(null); // nuevo, no edición
    setForm({
      empresa_id: d.empresa_id, semana_id: semanas[0]?.id || d.semana_id || '',
      programa_id: d.programa_id || '',
      cliente_nombre: d.cliente_nombre || '', destino_id: d.destino_id || '',
      destino_nombre: d.destino_nombre || '', naviera: d.naviera || '', barco: d.barco || '',
      fecha_apertura: getCostaRicaDateISO(),
      hora_apertura: '', fecha_cierre: '', hora_cierre: '',
      contenedor: '', tipo_contenedor: d.tipo_contenedor || 'Estandar',
      clase_contenedor: d.clase_contenedor || 'HIGH CUBE',
      marchamo_llegada: '', marchamo_salida: '', termografo: '',
      peso_bruto: undefined, peso_neto: undefined, cerrada: false, notas: '',
      incoterms: d.incoterms || 'EXW', shipper: d.shipper || '',
      ggn_global_gap: d.ggn_global_gap || '', estado_actual: d.estado_actual || '',
      codigo_exportador: d.codigo_exportador || '', ep_mag: d.ep_mag || '',
    });
    setView('form');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    const payload = {
      ...form, empresa_id: empresaId,
      semana_id:    form.semana_id    || null,
      programa_id:  form.programa_id  || null,
      destino_id:   form.destino_id   || null,
      hora_apertura: form.hora_apertura || null,
      fecha_cierre:  form.fecha_cierre  || null,
      hora_cierre:   form.hora_cierre   || null,
    };
    const { error } = editing
      ? await supabase.from('emp_despachos').update(payload).eq('id', editing.id)
      : await supabase.from('emp_despachos').insert(payload);
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false); setView('list'); load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('emp_despachos').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDeleting(false); setDeleteTarget(null); load();
  }

  async function toggleCerrada(d: Despacho) {
    if (!d.cerrada) {
      await supabase.from('emp_despachos').update({
        cerrada: true,
        fecha_cierre: getCostaRicaDateISO(),
        hora_cierre:  getCostaRicaTimeHM(),
      }).eq('id', d.id);
    } else {
      await supabase.from('emp_despachos').update({ cerrada: false, fecha_cierre: null, hora_cierre: null }).eq('id', d.id);
    }
    load();
  }

  async function abrirCierre(d: Despacho) {
    setCierreTarget(d);
    setCierreWarnings([]);
    setCierreForm({
      hora_cierre: getCostaRicaTimeHM(),
      marchamo_salida: d.marchamo_salida || '',
      peso_bruto: d.peso_bruto ? String(d.peso_bruto) : '',
      peso_neto: d.peso_neto ? String(d.peso_neto) : '',
    });
    setCierreLoading(true);

    const [{ data: boletas }, { data: materiales }] = await Promise.all([
      supabase.from('emp_boletas')
        .select('calibre_id,calibre_nombre,marca_id,marca_nombre,cajas_empacadas,total_frutas,numero_paleta,trazabilidad')
        .eq('despacho_id', d.id).order('numero_paleta'),
      supabase.from('emp_calibre_materiales')
        .select('calibre_id,marca_id')
        .eq('empresa_id', empresaId),
    ]);

    setCierreBoletasDet(boletas || []);

    // ── Verificar calibres sin materiales configurados ────────────────────
    const warnings: string[] = [];
    const matSet = new Set(
      (materiales || []).map(m => `${m.calibre_id}__${m.marca_id ?? 'null'}`)
    );
    const vistos = new Set<string>();
    for (const b of (boletas || [])) {
      if (!b.cajas_empacadas) continue;
      const keyEspecifico = `${b.calibre_id}__${b.marca_id ?? 'null'}`;
      const keyGeneral    = `${b.calibre_id}__null`;
      const label = `${b.calibre_nombre || '?'}${b.marca_nombre ? ' / ' + b.marca_nombre : ''}`;
      if (!vistos.has(keyEspecifico) && !matSet.has(keyEspecifico) && !matSet.has(keyGeneral)) {
        warnings.push(label);
        vistos.add(keyEspecifico);
      }
    }
    setCierreWarnings(warnings);
    setCierreLoading(false);
  }

  async function confirmarCierre() {
    if (!cierreTarget) return;
    if (cierreWarnings.length > 0) return; // bloqueado por falta de configuración
    setCierreSaving(true);
    const { error: errCierre } = await supabase.from('emp_despachos').update({
      cerrada: true,
      fecha_cierre: getCostaRicaDateISO(),
      hora_cierre: cierreForm.hora_cierre || null,
      marchamo_salida: cierreForm.marchamo_salida || null,
      peso_bruto: cierreForm.peso_bruto ? +cierreForm.peso_bruto : null,
      peso_neto: cierreForm.peso_neto ? +cierreForm.peso_neto : null,
    }).eq('id', cierreTarget.id);
    setCierreSaving(false);
    if (errCierre) {
      // El trigger puede lanzar excepción con mensaje descriptivo
      alert('Error al cerrar la BD: ' + (errCierre.message || 'Error desconocido'));
      return;
    }
    setCierreTarget(null);
    load();
  }

  async function abrirAsignacion(des: Despacho) {
    setAsignandoId(des.id);
    setFiltCal('');
    setFiltMarca('');
    const [{ data: disp }, { data: asig }] = await Promise.all([
      supabase.from('emp_boletas').select('*, opc:emp_programas_detalle(id,marca_nombre,calibre_nombre)')
        .eq('empresa_id', empresaId).is('despacho_id', null).order('numero_paleta'),
      supabase.from('emp_boletas').select('*, opc:emp_programas_detalle(id,marca_nombre,calibre_nombre)')
        .eq('empresa_id', empresaId).eq('despacho_id', des.id).order('numero_paleta'),
    ]);
    setBoletasDisp(disp || []);
    setBoletasDes(asig || []);
  }

  async function asignarBoleta(boletaId: string, desId: string) {
    await supabase.from('emp_boletas').update({ despacho_id: desId }).eq('id', boletaId);
    if (asignandoId) abrirAsignacion(rows.find(r => r.id === asignandoId)!);
    load();
  }

  async function desasignarBoleta(boletaId: string) {
    await supabase.from('emp_boletas').update({ despacho_id: null }).eq('id', boletaId);
    if (asignandoId) abrirAsignacion(rows.find(r => r.id === asignandoId)!);
    load();
  }

  async function abrirPreviewFEE(d: Despacho) {
    setFeePreviewLoading(true);
    setFeeError('');
    try {
      const errores: string[] = [];
      if (!d.programa_id) errores.push('El despacho no tiene programa asociado');

      const [{ data: prog }, { data: boletas }, { data: opcs }] = await Promise.all([
        d.programa_id
          ? supabase.from('emp_programas').select('id, emp_cliente_id').eq('id', d.programa_id).single()
          : { data: null },
        supabase.from('emp_boletas')
          .select('programa_det_id, calibre_nombre, marca_nombre, cajas_empacadas')
          .eq('despacho_id', d.id),
        d.programa_id
          ? supabase.from('emp_programas_detalle')
              .select('id, marca_nombre, calibre_nombre, producto_fee_id')
              .eq('programa_id', d.programa_id)
          : { data: [] },
      ]);

      if (!prog && d.programa_id) errores.push('No se encontró el programa');
      if (!boletas || boletas.length === 0) errores.push('El despacho no tiene paletas asignadas');

      // Cargar productos únicos usados en los OPCs
      const prodIds = Array.from(new Set((opcs || []).map((o: any) => o.producto_fee_id).filter(Boolean)));
      const productosMap: Record<number, { descripcion: string; codigo_cabys: string; partida_arancelaria: string | null; precio_venta: number | null }> = {};
      if (prodIds.length > 0) {
        const { data: prods } = await supabase.from('inv_productos')
          .select('id, descripcion, codigo_cabys, partida_arancelaria, precio_venta')
          .in('id', prodIds);
        (prods || []).forEach((p: any) => { productosMap[p.id] = p; });
      }

      let receptor = null;
      if (prog?.emp_cliente_id) {
        const { data: cli } = await supabase.from('emp_clientes').select('fe_receptor_id').eq('id', prog.emp_cliente_id).single();
        if (!cli?.fe_receptor_id) {
          errores.push('El cliente exportador no tiene receptor FE configurado');
        } else {
          const { data: rec } = await supabase.from('fe_receptores_bitacora')
            .select('razon_social, identificacion, email, direccion').eq('id', cli.fe_receptor_id).single();
          receptor = rec;
          if (!rec) errores.push('No se encontró el receptor FE');
        }
      } else if (prog) {
        errores.push('El programa no tiene cliente exportador asignado');
      }

      // Agrupar boletas por OPC (programa_det_id)
      const gruposOpc: Record<string, { cajas: number; opc: any }> = {};
      (boletas || []).forEach((b: any) => {
        const key = b.programa_det_id || `${b.marca_nombre}||${b.calibre_nombre}`;
        if (!gruposOpc[key]) {
          const opc = (opcs || []).find((o: any) => o.id === b.programa_det_id) || null;
          gruposOpc[key] = { cajas: 0, opc };
        }
        gruposOpc[key].cajas += b.cajas_empacadas;
      });

      const lineas = Object.entries(gruposOpc).map(([, g]) => {
        const opc = g.opc;
        const prodId = opc?.producto_fee_id;
        const prod = prodId ? productosMap[prodId] : null;
        const precio = prod?.precio_venta || 0;
        if (!prod) errores.push(`Línea ${opc?.calibre_nombre || '?'} / ${opc?.marca_nombre || '?'}: sin producto FEE configurado en el OPC`);
        if (prod && !prod.precio_venta) errores.push(`Línea ${opc?.calibre_nombre || '?'}: el producto no tiene precio de venta en el catálogo`);
        if (prod && !prod.codigo_cabys) errores.push(`Línea ${opc?.calibre_nombre || '?'}: producto sin código CABYS`);
        return {
          opc_id: opc?.id || null,
          marca: opc?.marca_nombre || '-',
          calibre: opc?.calibre_nombre || '-',
          cajas: g.cajas,
          precio,
          total: +(g.cajas * precio).toFixed(5),
          producto_desc: prod?.descripcion || '(sin producto)',
          codigo_cabys: prod?.codigo_cabys || '',
          partida_arancelaria: prod?.partida_arancelaria || null,
        };
      });

      // Deduplicar errores
      const erroresUniq = Array.from(new Set(errores));

      setFeePreview({
        despacho: d,
        prog: prog || { id: '', emp_cliente_id: 0 },
        receptor,
        lineas,
        errores: erroresUniq,
        plazoEditable: 21,
        condicionEditable: '02',
      });
    } finally {
      setFeePreviewLoading(false);
    }
  }

  async function generarFEE(d: Despacho, overrides?: { plazo: number; condicion: string }) {
    setGenerandoFeeId(d.id);
    setFeeError('');
    setFeePreview(null);
    try {
      // 1. Programa → emp_cliente_id
      if (!d.programa_id) throw new Error('El despacho no tiene programa asociado');
      const { data: prog, error: progErr } = await supabase
        .from('emp_programas')
        .select('emp_cliente_id')
        .eq('id', d.programa_id)
        .single();
      if (progErr || !prog) throw new Error('No se encontró el programa: ' + (progErr?.message || ''));
      if (!prog.emp_cliente_id) throw new Error('El programa no tiene cliente exportador asignado');

      // 2. OPCs del programa con producto y precio por línea
      const { data: opcs, error: opcErr } = await supabase
        .from('emp_programas_detalle')
        .select('id, marca_nombre, calibre_nombre, producto_fee_id, precio_usd_caja')
        .eq('programa_id', d.programa_id);
      if (opcErr) throw new Error('Error al leer OPCs: ' + opcErr.message);

      // 3. Boletas del despacho agrupadas por OPC
      const { data: boletas, error: bolErr } = await supabase
        .from('emp_boletas')
        .select('programa_det_id, calibre_nombre, marca_nombre, cajas_empacadas')
        .eq('despacho_id', d.id);
      if (bolErr) throw new Error('Error al leer boletas: ' + bolErr.message);
      if (!boletas || boletas.length === 0) throw new Error('El despacho no tiene paletas asignadas');

      const gruposOpc: Record<string, { cajas: number; opc: any }> = {};
      (boletas as any[]).forEach(b => {
        const key = b.programa_det_id || `${b.marca_nombre}||${b.calibre_nombre}`;
        if (!gruposOpc[key]) {
          const opc = (opcs || []).find((o: any) => o.id === b.programa_det_id) || null;
          gruposOpc[key] = { cajas: 0, opc };
        }
        gruposOpc[key].cajas += b.cajas_empacadas;
      });

      // 4. Cargar productos únicos
      const prodIds = Array.from(new Set(Object.values(gruposOpc).map(g => g.opc?.producto_fee_id).filter(Boolean)));
      const productosMap: Record<number, { descripcion: string; codigo_cabys: string; partida_arancelaria: string | null; precio_venta: number | null }> = {};
      if (prodIds.length > 0) {
        const { data: prods } = await supabase.from('inv_productos')
          .select('id, descripcion, codigo_cabys, partida_arancelaria').in('id', prodIds);
        (prods || []).forEach((p: any) => { productosMap[p.id] = p; });
      }

      // Validar que todas las líneas tengan producto y precio
      for (const [, g] of Object.entries(gruposOpc)) {
        const opc = g.opc;
        if (!opc?.producto_fee_id) throw new Error(`Línea ${opc?.calibre_nombre || '?'} / ${opc?.marca_nombre || '?'}: sin producto FEE configurado en el programa`);
        const prod = productosMap[opc.producto_fee_id];
        if (!prod) throw new Error(`No se encontró el producto ${opc.producto_fee_id} en el catálogo`);
        if (!prod.precio_venta) throw new Error(`El producto de la línea ${opc.calibre_nombre} no tiene precio de venta en el catálogo ERP`);
        if (!prod.codigo_cabys) throw new Error(`El producto de la línea ${opc.calibre_nombre} no tiene código CABYS`);
      }

      // 5. Cliente → receptor FE
      const { data: cliente, error: cliErr } = await supabase
        .from('emp_clientes')
        .select('fe_receptor_id')
        .eq('id', prog.emp_cliente_id)
        .single();
      if (cliErr || !cliente) throw new Error('No se encontró el cliente exportador');
      if (!cliente.fe_receptor_id) throw new Error('El cliente exportador no tiene receptor FE configurado');

      // 6. Receptor FE
      const { data: receptor, error: recErr } = await supabase
        .from('fe_receptores_bitacora')
        .select('id, razon_social, tipo_identificacion, identificacion, actividad_codigo, actividad_descripcion, email, telefono, direccion')
        .eq('id', cliente.fe_receptor_id)
        .single();
      if (recErr || !receptor) throw new Error('No se encontró el receptor FE');

      // 7. Tipo de cambio USD
      const { data: feConfig } = await supabase
        .from('fe_config_empresa')
        .select('tipo_cambio_usd')
        .eq('empresa_id', empresaId)
        .single();
      const tipoCambio = feConfig?.tipo_cambio_usd ?? 1; // eslint-disable-line @typescript-eslint/no-unused-vars

      // 8. Construir líneas FEE (una por OPC)
      const lineasData = Object.values(gruposOpc).map((g, i) => {
        const opc = g.opc;
        const prod = productosMap[opc.producto_fee_id];
        const precioFinal = prod.precio_venta!;
        const total = +(g.cajas * precioFinal).toFixed(5);
        return {
          linea: i + 1,
          tipo_linea: 'mercaderia',
          cabys: prod.codigo_cabys,
          descripcion: `${prod.descripcion} - ${opc.marca_nombre || ''} ${opc.calibre_nombre || ''}`.trim(),
          unidad_medida: 'Unid',
          cantidad: g.cajas,
          precio_unitario: +precioFinal,
          descuento_monto: 0,
          tarifa_iva_codigo: '01',
          tarifa_iva_porcentaje: 0,
          subtotal: total,
          impuesto_monto: 0,
          total_linea: total,
          partida_arancelaria: prod.partida_arancelaria || null,
        };
      });
      const totalComprobante = +lineasData.reduce((s, l) => s + l.total_linea, 0).toFixed(5);

      // 7. Insertar fe_documentos
      const { data: doc, error: docErr } = await supabase
        .from('fe_documentos')
        .insert({
          empresa_id: empresaId,
          tipo_documento: '09',
          origen: 'facturacion',
          estado: 'confirmado',
          fecha_emision: d.fecha_cierre || getCostaRicaDateISO(),
          moneda: 'USD',
          condicion_venta: overrides?.condicion || '01',
          medio_pago: '01',
          plazo_credito_dias: overrides?.plazo || 0,
          observacion: [
            `Despacho ${d.codigo || d.id}`,
            d.contenedor ? `Cont: ${d.contenedor}` : null,
            d.barco ? `Barco: ${d.barco}` : null,
          ].filter(Boolean).join(' | '),
          subtotal: totalComprobante,
          total_descuento: 0,
          total_impuesto: 0,
          total_comprobante: totalComprobante,
          receptor_bitacora_id: receptor.id,
          receptor_tipo_identificacion: receptor.tipo_identificacion,
          receptor_identificacion: receptor.identificacion,
          receptor_nombre: receptor.razon_social,
          receptor_actividad_codigo: receptor.actividad_codigo,
          receptor_actividad_descripcion: receptor.actividad_descripcion,
          receptor_email: receptor.email,
          receptor_telefono: receptor.telefono,
          receptor_direccion: receptor.direccion,
        })
        .select('id')
        .single();
      if (docErr || !doc) throw new Error('Error al crear fe_documentos: ' + (docErr?.message || ''));

      // 8. Insertar fe_documento_lineas
      const lineasInsert = lineasData.map(l => ({ ...l, documento_id: doc.id }));
      const { error: linErr } = await supabase.from('fe_documento_lineas').insert(lineasInsert);
      if (linErr) throw new Error('Error al crear líneas: ' + linErr.message);

      // 9. Marcar despacho con fee_documento_id
      await supabase.from('emp_despachos').update({
        fee_documento_id: doc.id,
        fee_generada_at: new Date().toISOString(),
      }).eq('id', d.id);

      // 10. Emitir FEE: firmar y enviar al Ministerio de Hacienda
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sesión expirada, vuelva a ingresar');

      const emitResp = await fetch(`/api/facturacion/emitir/${doc.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const emitData = await emitResp.json();
      if (!emitData.ok) {
        // Rollback: quitar fee_documento_id para que el botón FEE reaparezca
        await supabase.from('emp_despachos')
          .update({ fee_documento_id: null, fee_generada_at: null })
          .eq('id', d.id);
        throw new Error('Error al emitir FEE: ' + (emitData.error || 'Error desconocido'));
      }

      load();
    } catch (err: any) {
      setFeeError(err.message || 'Error desconocido');
    } finally {
      setGenerandoFeeId(null);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!boletasMap[id]) {
      const { data } = await supabase.from('emp_boletas')
        .select('*, opc:emp_programas_detalle(id,marca_nombre,calibre_nombre)')
        .eq('despacho_id', id).order('numero_paleta');
      setBoletasMap(m => ({ ...m, [id]: data || [] }));
    }
  }

  const despachoAsignando = rows.find(r => r.id === asignandoId);
  const progSeleccionado  = form.programa_id ? programas.find(p => p.id === form.programa_id) : null;

  // Unique calibre and marca options for filter selects
  const calibreOpts = Array.from(new Set(boletasDisp.map(b => b.calibre_nombre).filter(Boolean)));
  const marcaOpts   = Array.from(new Set(boletasDisp.map(b => b.marca_nombre).filter(Boolean)));

  // Filtered boletas disponibles
  const boletasDispFilt = boletasDisp.filter(b => {
    if (filtCal   && !(b.calibre_nombre || '').includes(filtCal))   return false;
    if (filtMarca && !(b.marca_nombre   || '').includes(filtMarca)) return false;
    return true;
  });

  // ─── Vista de formulario completo ─────────────────────────────────────────
  if (view === 'form') {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--surface-base)' }}>
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-3 flex items-center justify-between"
          style={{ backgroundColor: 'var(--surface-deep)', borderBottom: '1px solid var(--line)' }}>
          <div>
            <h1 className="text-sm font-semibold text-ink">
              {editing ? `Editar Boleta - ${editing.codigo || ''}` : 'Nueva Boleta de Despacho'}
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
              {editing ? editing.cliente_nombre : 'Seleccione un programa para pre-llenar los datos'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setView('list'); setEditing(null); }} className={btnSecondary}>Cancelar</button>
            <button type="submit" form="des-form" disabled={saving} className={btnPrimary}>
              {saving ? 'Guardando...' : (editing ? 'Guardar Cambios' : 'Crear Boleta')}
            </button>
          </div>
        </div>

        <form id="des-form" onSubmit={handleSave} className="p-6 max-w-5xl mx-auto">
          {error && <div className="mb-4 px-3 py-2 rounded text-xs" style={{ background: '#450a0a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{error}</div>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Columna izquierda: programa + logística ────────────── */}
            <div className="space-y-5">

              {/* Selector de programa */}
              <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Programa ORP</p>
                <div>
                  <label className={labelCls}>Programa *</label>
                  <select value={form.programa_id} onChange={e => handleProgramaChange(e.target.value)} className={selectCls}>
                    <option value="">- Seleccione un programa -</option>
                    {programas.map(p => (
                      <option key={p.id} value={p.id}>{p.codigo} - {p.cliente_nombre}</option>
                    ))}
                  </select>
                </div>
                {/* Resumen del programa seleccionado */}
                {progSeleccionado && (
                  <div className="rounded px-3 py-2 text-xs space-y-0.5" style={{ background: '#0a1a0a', border: '1px solid #14532d' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#4ade80' }}>Datos del programa</p>
                    {progSeleccionado.cliente_nombre && <p style={{ color: '#86efac' }}>Cliente: <span className="text-ink">{progSeleccionado.cliente_nombre}</span></p>}
                    {progSeleccionado.naviera && <p style={{ color: '#86efac' }}>Naviera: <span className="text-ink">{progSeleccionado.naviera}</span></p>}
                    {progSeleccionado.barco && <p style={{ color: '#86efac' }}>Barco: <span className="text-ink">{progSeleccionado.barco}</span></p>}
                    <p className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>Datos copiados abajo - puede editarlos libremente</p>
                  </div>
                )}
                <div>
                  <label className={labelCls}>Semana</label>
                  <select value={form.semana_id} onChange={e => setForm(f => ({ ...f, semana_id: e.target.value }))} className={selectCls}>
                    <option value="">- Seleccione -</option>
                    {semanas.map(s => <option key={s.id} value={s.id}>Sem {s.codigo}</option>)}
                  </select>
                </div>
              </div>

              {/* Datos logísticos (editables, pre-llenados desde programa) */}
              <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Datos Logisticos</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className={labelCls}>Cliente</label>
                    <input type="text" value={form.cliente_nombre || ''} onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Destino</label>
                    <select value={form.destino_id} onChange={e => handleDestinoChange(e.target.value)} className={selectCls}>
                      <option value="">- Seleccione -</option>
                      {destinos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Naviera</label>
                    <input type="text" value={form.naviera || ''} onChange={e => setForm(f => ({ ...f, naviera: e.target.value }))} placeholder="COSIARMA" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Barco / Viaje</label>
                    <input type="text" value={form.barco || ''} onChange={e => setForm(f => ({ ...f, barco: e.target.value }))} placeholder="CS SERVICE V.2526" className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Fechas */}
              <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Apertura / Cierre</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Fecha Apertura *</label>
                    <input type="date" required value={form.fecha_apertura} onChange={e => setForm(f => ({ ...f, fecha_apertura: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Hora Apertura</label>
                    <input type="time" value={form.hora_apertura || ''} onChange={e => setForm(f => ({ ...f, hora_apertura: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Fecha Cierre</label>
                    <input type="date" value={form.fecha_cierre || ''} onChange={e => setForm(f => ({ ...f, fecha_cierre: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Hora Cierre</label>
                    <input type="time" value={form.hora_cierre || ''} onChange={e => setForm(f => ({ ...f, hora_cierre: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Columna derecha: contenedor + marchamos + pesos ───── */}
            <div className="space-y-5">

              {/* Contenedor */}
              <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Contenedor</p>
                <div>
                  <label className={labelCls}>Numero de Contenedor</label>
                  <input type="text" value={form.contenedor || ''}
                    onChange={e => setForm(f => ({ ...f, contenedor: e.target.value.toUpperCase() }))}
                    placeholder="SEKU9348367" className={inputCls + ' font-mono text-base tracking-widest'} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Tipo</label>
                    <input type="text" value={form.tipo_contenedor || ''} onChange={e => setForm(f => ({ ...f, tipo_contenedor: e.target.value }))} placeholder="Estandar" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Clase</label>
                    <input type="text" value={form.clase_contenedor || ''} onChange={e => setForm(f => ({ ...f, clase_contenedor: e.target.value }))} placeholder="HIGH CUBE" className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Marchamos y termógrafo */}
              <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Marchamos y Termografo</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Marchamo Llegada</label>
                    <input type="text" value={form.marchamo_llegada || ''} onChange={e => setForm(f => ({ ...f, marchamo_llegada: e.target.value }))} className={inputCls + ' font-mono'} />
                  </div>
                  <div>
                    <label className={labelCls}>Marchamo Salida</label>
                    <input type="text" value={form.marchamo_salida || ''} onChange={e => setForm(f => ({ ...f, marchamo_salida: e.target.value }))} className={inputCls + ' font-mono'} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Termografo</label>
                    <input type="text" value={form.termografo || ''} onChange={e => setForm(f => ({ ...f, termografo: e.target.value }))} className={inputCls + ' font-mono'} />
                  </div>
                </div>
              </div>

              {/* Pesos */}
              <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Pesos</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Peso Bruto (kg)</label>
                    <input type="number" step="0.001" value={form.peso_bruto ?? ''}
                      onChange={e => setForm(f => ({ ...f, peso_bruto: e.target.value ? +e.target.value : undefined }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Peso Neto (kg)</label>
                    <input type="number" step="0.001" value={form.peso_neto ?? ''}
                      onChange={e => setForm(f => ({ ...f, peso_neto: e.target.value ? +e.target.value : undefined }))} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Datos Exportación FEE */}
              <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Exportacion (FEE pag. 2)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Incoterms</label>
                    <input type="text" value={form.incoterms || ''} onChange={e => setForm(f => ({ ...f, incoterms: e.target.value.toUpperCase() }))} placeholder="EXW" className={inputCls + ' font-mono'} />
                  </div>
                  <div>
                    <label className={labelCls}>Shipper</label>
                    <input type="text" value={form.shipper || ''} onChange={e => setForm(f => ({ ...f, shipper: e.target.value }))} placeholder="MUW" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Codigo Exportador</label>
                    <input type="text" value={form.codigo_exportador || ''} onChange={e => setForm(f => ({ ...f, codigo_exportador: e.target.value }))} placeholder="EXP-002" className={inputCls + ' font-mono'} />
                  </div>
                  <div>
                    <label className={labelCls}>EP-MAG</label>
                    <input type="text" value={form.ep_mag || ''} onChange={e => setForm(f => ({ ...f, ep_mag: e.target.value }))} placeholder="8046" className={inputCls + ' font-mono'} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>GGN GlobalG.A.P.</label>
                    <input type="text" value={form.ggn_global_gap || ''} onChange={e => setForm(f => ({ ...f, ggn_global_gap: e.target.value }))} placeholder="4052852198479" className={inputCls + ' font-mono'} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Estado Actual (fitosanitario, etc.)</label>
                    <input type="text" value={form.estado_actual || ''} onChange={e => setForm(f => ({ ...f, estado_actual: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Notas + estado */}
              <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Otros</p>
                <div>
                  <label className={labelCls}>Notas</label>
                  <textarea value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3} className={inputCls + ' resize-none'} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.cerrada} onChange={e => setForm(f => ({ ...f, cerrada: e.target.checked }))} className="w-4 h-4 accent-green-600" />
                  <span className="text-xs text-ink-muted">Boleta cerrada</span>
                </label>
              </div>
            </div>
          </div>
        </form>
      </div>
    );
  }

  if (printId) {
    return <BoletaDespachoImprimir despachoId={printId} onBack={() => setPrintId(null)} />;
  }
  if (guiaId) {
    return <GuiaDespachoImprimir despachoId={guiaId} onBack={() => setGuiaId(null)} />;
  }
  if (planoId) {
    return <PlanoCargaImprimir despachoId={planoId} onBack={() => setPlanoId(null)} />;
  }
  if (feeId) {
    return <FeeDespachoImprimir despachoId={feeId} onBack={() => setFeeId(null)} />;
  }

  // ─── Vista de lista ──────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-ink">Boletas de Despacho</h1>
            {pendientesCount !== null && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{ background: 'var(--surface-raised)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
                {pendientesCount} paletas pendientes de despacho
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{filtered.length} despachos</p>
        </div>
        <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
          <Plus size={14} /> Nueva Boleta
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={13} style={{ color: 'var(--ink-faint)' }} />
          <input type="text" placeholder="Buscar contenedor, cliente, barco..." value={search}
            onChange={e => setSearch(e.target.value)} className={inputCls + ' pl-9'} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-muted">
          <input type="checkbox" checked={soloAbiertas} onChange={e => setSoloAbiertas(e.target.checked)} className="w-4 h-4 accent-green-600" />
          Solo abiertas
        </label>
      </div>

      {error && <div className="mb-4 p-3 rounded text-xs" style={{ background: '#450a0a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{error}</div>}
      {feeError && (
        <div className="mb-4 p-3 rounded text-xs flex items-start justify-between gap-3"
          style={{ background: '#451a03', color: '#fed7aa', border: '1px solid #92400e' }}>
          <span><strong>Error FEE:</strong> {feeError}</span>
          <button onClick={() => setFeeError('')} className="shrink-0 text-orange-400 hover:text-orange-300">X</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-xs" style={{ color: 'var(--ink-faint)' }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-xs" style={{ color: 'var(--ink-faint)' }}>Sin despachos</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => {
            const expanded = expandedId === d.id;
            return (
              <div key={d.id} className="rounded-lg overflow-hidden"
                style={{ background: 'var(--surface-raised)', border: `1px solid ${d.cerrada ? 'var(--line)' : '#1c3a46'}`, opacity: d.cerrada ? 0.75 : 1 }}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {d.cerrada
                        ? <Lock size={14} style={{ color: 'var(--ink-faint)' }} />
                        : <Unlock size={14} style={{ color: '#4ade80' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-sm font-bold text-ink">{d.codigo || '-'}</span>
                        {d.numero && <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>#{d.numero}</span>}
                        <span className="text-xs font-medium text-ink">{d.cliente_nombre || '-'}</span>
                        {d.destino_nombre && (
                          <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: '#1e3a5f44', color: '#93c5fd', border: '1px solid #1e3a5f' }}>{d.destino_nombre}</span>
                        )}
                        {d.cerrada && <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'var(--line)', color: 'var(--ink-faint)' }}>Cerrada</span>}
                      </div>
                      <div className="flex items-center gap-4 text-[11px] mb-2 flex-wrap" style={{ color: 'var(--ink-faint)' }}>
                        {d.barco && <span className="flex items-center gap-1"><Ship size={10} />{d.barco}</span>}
                        {d.naviera && <span>{d.naviera}</span>}
                        <span>{new Date(d.fecha_apertura + 'T12:00:00').toLocaleDateString('es-CR')}</span>
                        {d.hora_apertura && <span>{d.hora_apertura}{d.hora_cierre ? ` - ${d.hora_cierre}` : ''}</span>}
                        {d.contenedor && (
                          <span className="flex items-center gap-1 font-mono" style={{ color: '#67e8f9' }}>
                            <Container size={10} />{d.contenedor}
                          </span>
                        )}
                        {d.clase_contenedor && <span>{d.clase_contenedor}</span>}
                      </div>
                      {(d.marchamo_llegada || d.marchamo_salida || d.termografo) && (
                        <div className="flex items-center gap-3 text-[11px] mb-2" style={{ color: 'var(--ink-faint)' }}>
                          {d.marchamo_llegada && <span>M.Llegada: <span className="font-mono" style={{ color: '#fbbf24' }}>{d.marchamo_llegada}</span></span>}
                          {d.marchamo_salida && <span>M.Salida: <span className="font-mono" style={{ color: '#fbbf24' }}>{d.marchamo_salida}</span></span>}
                          {d.termografo && <span>Termógrafo: <span className="font-mono" style={{ color: '#67e8f9' }}>{d.termografo}</span></span>}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                        <span>Cajas: <span className="text-ink font-medium">{d.total_cajas.toLocaleString('es-CR')}</span></span>
                        <span>Frutas: <span className="text-ink font-medium">{d.total_frutas.toLocaleString('es-CR')}</span></span>
                        {d.peso_bruto && <span>P.Bruto: <span className="text-ink">{d.peso_bruto.toLocaleString('es-CR')} kg</span></span>}
                      </div>
                      {/* Capacidad contenedor */}
                      {!d.cerrada && (() => {
                        const CAP = 21;
                        const used = d.total_paletas;
                        const pct = Math.min(100, Math.round((used / CAP) * 100));
                        const full = used >= CAP;
                        const barColor = full ? '#ef4444' : used >= 18 ? '#f59e0b' : '#4ade80';
                        return (
                          <div className="mt-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>Capacidad contenedor</span>
                              <span className="text-[11px] font-bold" style={{ color: barColor }}>
                                {used} / {CAP} paletas{full ? ' - LLENO' : ` - ${CAP - used} disponibles`}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                      {!d.cerrada && (() => {
                        const lleno = d.total_paletas >= 21;
                        return (
                          <button onClick={() => !lleno && abrirAsignacion(d)}
                            title={lleno ? 'Contenedor lleno (21/21)' : 'Asignar paletas'}
                            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors"
                            style={lleno
                              ? { color: '#6b7280', border: '1px solid #374151', background: 'transparent', cursor: 'not-allowed' }
                              : { color: '#4ade80', border: '1px solid #14532d', background: '#052e1640' }}>
                            <Tag size={11} /> Paletas
                          </button>
                        );
                      })()}
                      {d.cerrada && !d.fee_documento_id && (
                        <button
                          onClick={() => abrirPreviewFEE(d)}
                          disabled={generandoFeeId === d.id || feePreviewLoading}
                          title="Previsualizar y generar FEE"
                          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors"
                          style={{ color: '#fbbf24', border: '1px solid #78350f', background: '#451a0340' }}>
                          {generandoFeeId === d.id || feePreviewLoading ? '...' : <><FileText size={11} /> FEE</>}
                        </button>
                      )}
                      {d.cerrada && d.fee_documento_id && (
                        <button onClick={() => setFeeId(d.id)} title={`Ver / imprimir FEE #${d.fee_documento_id}`}
                          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors"
                          style={{ color: '#4ade80', border: '1px solid #14532d', background: '#052e1640' }}>
                          <FileText size={11} /> FEE OK
                        </button>
                      )}
                      {d.cerrada && (
                        <>
                          <button onClick={() => setGuiaId(d.id)} title="Imprimir guia de despacho"
                            className="p-1.5 rounded transition-colors"
                            style={{ color: '#34d399' }}>
                            <FileText size={13} />
                          </button>
                          <button onClick={() => setPlanoId(d.id)} title="Imprimir plano de carga"
                            className="p-1.5 rounded transition-colors"
                            style={{ color: '#fbbf24' }}>
                            <Tag size={13} />
                          </button>
                          <button onClick={() => setPrintId(d.id)} title="Imprimir boleta de despacho"
                            className="p-1.5 rounded transition-colors"
                            style={{ color: '#60a5fa' }}>
                            <Printer size={13} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => d.cerrada ? toggleCerrada(d) : abrirCierre(d)}
                        title={d.cerrada ? 'Reabrir' : 'Cerrar boleta'}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: d.cerrada ? '#fbbf24' : '#4ade80' }}>
                        {d.cerrada ? <Unlock size={13} /> : <Lock size={13} />}
                      </button>
                      <button onClick={() => openDuplicate(d)} title="Duplicar despacho" className="p-1.5 rounded transition-colors" style={{ color: '#a78bfa' }}><Copy size={13} /></button>
                      <button onClick={() => openEdit(d)} className="p-1.5 rounded transition-colors" style={{ color: '#60a5fa' }}><Pencil size={13} /></button>
                      <button onClick={() => setDeleteTarget(d)} className="p-1.5 rounded transition-colors" style={{ color: '#f87171' }}><Trash2 size={13} /></button>
                      <button onClick={() => toggleExpand(d.id)} className="p-1.5 rounded transition-colors" style={{ color: 'var(--ink-faint)' }}>
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="px-4 py-3" style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-deep)' }}>
                    {!boletasMap[d.id] ? (
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Cargando...</p>
                    ) : boletasMap[d.id].length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Sin paletas asignadas</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--line)' }}>
                            {['# Paleta','Calibre','Marca','Cajas','Frutas','Barcode','Trazabilidad'].map(h => (
                              <th key={h} className={h === '# Paleta' || h === 'Cajas' || h === 'Frutas' ? 'text-right py-1.5 pr-4 font-semibold' : 'text-left py-1.5 pr-4 font-semibold'}
                                style={{ color: 'var(--ink-faint)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {boletasMap[d.id].map(b => (
                            <tr key={b.id} style={{ borderBottom: '1px solid var(--line)' }}>
                              <td className="py-1.5 pr-4 text-right font-bold text-ink">{b.numero_paleta}</td>
                              <td className="py-1.5 pr-4">
                                <span className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: 'var(--line)', color: 'var(--ink)' }}>{b.calibre_nombre}</span>
                              </td>
                              <td className="py-1.5 pr-4" style={{ color: '#fbbf24' }}>{b.marca_nombre}</td>
                              <td className="py-1.5 pr-4 text-right text-ink">{b.cajas_empacadas}</td>
                              <td className="py-1.5 pr-4 text-right text-ink">{b.total_frutas?.toLocaleString('es-CR')}</td>
                              <td className="py-1.5 pr-4 font-mono text-[11px]" style={{ color: '#67e8f9' }}>{(b as any).barcode_cliente || '-'}</td>
                              <td className="py-1.5 font-mono text-[11px]" style={{ color: '#4ade80' }}>{b.trazabilidad || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                        </table>
                      </div>
                    )}
                    {d.cerrada && boletasMap[d.id] && boletasMap[d.id].length > 0 && (() => {
                      const groups: Record<string, { paletas: number; cajas: number; frutas: number }> = {};
                      boletasMap[d.id].forEach(b => {
                        const key = `${b.calibre_nombre || '-'} / ${b.marca_nombre || '-'}`;
                        if (!groups[key]) groups[key] = { paletas: 0, cajas: 0, frutas: 0 };
                        groups[key].paletas += 1;
                        groups[key].cajas += b.cajas_empacadas;
                        groups[key].frutas += b.total_frutas || 0;
                      });
                      return (
                        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#fbbf24' }}>
                            Resumen para Facturación
                          </p>
                          <div className="rounded overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[620px] text-xs">
                              <thead>
                                <tr style={{ background: 'var(--surface-raised)' }}>
                                  {['Calibre / Marca', 'Paletas', 'Cajas', 'Frutas'].map(h => (
                                    <th key={h} className="px-3 py-1.5 text-left font-semibold" style={{ color: 'var(--ink-faint)' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(groups).map(([key, g]) => (
                                  <tr key={key} style={{ borderTop: '1px solid var(--line)' }}>
                                    <td className="px-3 py-1.5 font-medium text-ink">{key}</td>
                                    <td className="px-3 py-1.5 text-ink-muted">{g.paletas}</td>
                                    <td className="px-3 py-1.5 text-ink">{g.cajas}</td>
                                    <td className="px-3 py-1.5 text-ink">{g.frutas.toLocaleString('es-CR')}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr style={{ borderTop: '2px solid var(--line)', background: 'var(--surface-raised)' }}>
                                  <td className="px-3 py-2 font-bold text-ink">TOTAL</td>
                                  <td className="px-3 py-2 font-bold text-ink">{boletasMap[d.id].length}</td>
                                  <td className="px-3 py-2 font-bold text-ink">{boletasMap[d.id].reduce((s, b) => s + b.cajas_empacadas, 0)}</td>
                                  <td className="px-3 py-2 font-bold text-ink">{boletasMap[d.id].reduce((s, b) => s + (b.total_frutas || 0), 0).toLocaleString('es-CR')}</td>
                                </tr>
                              </tfoot>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal asignación de paletas - uso correcto de modal (datos compactos) */}
      {asignandoId && despachoAsignando && (() => {
        const CAP = 21;
        const usado = boletasDes.length;
        const libre = CAP - usado;
        const pct = Math.min(100, Math.round((usado / CAP) * 100));
        const capColor = libre <= 0 ? '#ef4444' : libre <= 3 ? '#f59e0b' : '#4ade80';
        return (
        <Modal title={`Asignar Paletas - ${despachoAsignando.codigo}`} onClose={() => setAsignandoId(null)} size="xl">
          {/* Capacity bar */}
          <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--surface-deep)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>Ocupacion del contenedor</span>
              <span className="text-[11px] font-bold" style={{ color: capColor }}>
                {usado} / {CAP} paletas{libre <= 0 ? ' - LLENO' : ` - ${libre} espacio${libre !== 1 ? 's' : ''} libre${libre !== 1 ? 's' : ''}`}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: capColor }} />
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-faint)' }}>
                Sin despacho ({boletasDispFilt.length})
              </h3>
              {/* Filter bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <select
                  value={filtCal}
                  onChange={e => setFiltCal(e.target.value)}
                  className={selectCls + ' flex-1 text-xs'}
                >
                  <option value="">Todos calibres</option>
                  {calibreOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={filtMarca}
                  onChange={e => setFiltMarca(e.target.value)}
                  className={selectCls + ' flex-1 text-xs'}
                >
                  <option value="">Todas marcas</option>
                  {marcaOpts.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {boletasDispFilt.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--ink-faint)' }}>Sin paletas disponibles</p>
                ) : boletasDispFilt.map(b => (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded"
                    style={{ background: 'var(--surface-deep)', border: '1px solid var(--line)' }}>
                    <div>
                      <span className="font-bold text-sm text-ink">#{b.numero_paleta}</span>
                      <span className="text-xs ml-2 text-ink-muted">{b.calibre_nombre} - {b.marca_nombre}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{b.cajas_empacadas} cajas</span>
                    </div>
                    <button onClick={() => libre > 0 && asignarBoleta(b.id, asignandoId)}
                      disabled={libre <= 0}
                      title={libre <= 0 ? 'Contenedor lleno' : 'Agregar al contenedor'}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={libre <= 0
                        ? { color: '#4b5563', border: '1px solid #374151', cursor: 'not-allowed' }
                        : { color: '#4ade80', border: '1px solid #14532d' }}>
                      Agregar →
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--ink-faint)' }}>
                En este despacho ({boletasDes.length}) - {boletasDes.reduce((s, b) => s + b.cajas_empacadas, 0)} cajas - {boletasDes.reduce((s, b) => s + (b.total_frutas || 0), 0).toLocaleString('es-CR')} frutas
              </h3>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {boletasDes.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--ink-faint)' }}>Ninguna paleta asignada aun</p>
                ) : boletasDes.map(b => (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded"
                    style={{ background: '#0a1a0a', border: '1px solid #14532d' }}>
                    <div>
                      <span className="font-bold text-sm text-ink">#{b.numero_paleta}</span>
                      <span className="text-xs ml-2 text-ink-muted">{b.calibre_nombre} - {b.marca_nombre}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--ink-faint)' }}>{b.cajas_empacadas} cajas</span>
                      {b.trazabilidad && <span className="text-xs font-mono ml-2" style={{ color: '#4ade80' }}>{b.trazabilidad}</span>}
                    </div>
                    <button onClick={() => desasignarBoleta(b.id)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ color: '#f87171', border: '1px solid #7f1d1d' }}>
                      â†Â Quitar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={() => { setAsignandoId(null); load(); }} className={btnPrimary}>Listo</button>
          </div>
        </Modal>
        );
      })()}

      {/* ── Modal Preview FEE ──────────────────────────────────── */}
      {feePreview && (
        <Modal title={`Previsualizar FEE - ${feePreview.despacho.codigo}`} onClose={() => setFeePreview(null)} size="xl">
          <div className="space-y-4 text-xs" style={{ color: 'var(--ink)' }}>

            {/* Errores bloqueantes */}
            {feePreview.errores.length > 0 && (
              <div className="rounded p-3 space-y-1" style={{ background: '#450a0a', border: '1px solid #7f1d1d' }}>
                <p className="font-bold text-[11px]" style={{ color: '#fca5a5' }}>Problemas encontrados:</p>
                {feePreview.errores.map((e, i) => (
                  <p key={i} style={{ color: '#fca5a5' }}>- {e}</p>
                ))}
              </div>
            )}

            {/* Receptor */}
            {feePreview.receptor && (
              <div className="rounded p-3 space-y-1" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--ink-faint)' }}>Receptor</p>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>{feePreview.receptor.razon_social}</p>
                <p style={{ color: 'var(--ink-muted)' }}>{feePreview.receptor.identificacion} | {feePreview.receptor.email}</p>
                <p style={{ color: 'var(--ink-muted)' }}>{feePreview.receptor.direccion}</p>
              </div>
            )}

            {/* Condición + plazo */}
            <div className="rounded p-3 space-y-3" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--ink-faint)' }}>Condiciones de venta</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Condicion</label>
                  <select value={feePreview.condicionEditable}
                    onChange={e => setFeePreview(p => p ? { ...p, condicionEditable: e.target.value } : p)}
                    className={selectCls}>
                    <option value="01">Contado</option>
                    <option value="02">Credito</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Plazo (dias)</label>
                  <input type="number" min="0"
                    value={feePreview.plazoEditable}
                    onChange={e => setFeePreview(p => p ? { ...p, plazoEditable: +e.target.value } : p)}
                    className={inputCls} />
                </div>
              </div>
            </div>

            {/* Líneas preview - una por OPC con producto y precio propios */}
            {feePreview.lineas.length > 0 && (
              <div className="rounded p-3" style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
                <p className="font-bold uppercase tracking-widest text-[10px] mb-2" style={{ color: 'var(--ink-faint)' }}>Lineas del comprobante</p>
                <div className="overflow-x-auto">
                  <table className="min-w-[680px]" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <th className="text-left pb-1 pr-2" style={{ color: 'var(--ink-faint)' }}>Marca / Calibre</th>
                      <th className="text-left pb-1 pr-2" style={{ color: 'var(--ink-faint)' }}>Producto</th>
                      <th className="text-right pb-1 pr-2" style={{ color: 'var(--ink-faint)' }}>Cajas</th>
                      <th className="text-right pb-1 pr-2" style={{ color: 'var(--ink-faint)' }}>$/Caja</th>
                      <th className="text-right pb-1" style={{ color: 'var(--ink-faint)' }}>Total USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feePreview.lineas.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--line-dim)' }}>
                        <td className="py-1 pr-2 font-medium">{l.marca} / {l.calibre}</td>
                        <td className="py-1 pr-2" style={{ color: 'var(--ink-muted)', maxWidth: '200px' }}>
                          <span className="truncate block">{l.producto_desc}</span>
                          {l.codigo_cabys && <span className="font-mono text-[10px]" style={{ color: 'var(--ink-faint)' }}>CABYS: {l.codigo_cabys}</span>}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono">{l.cajas.toLocaleString('es-CR')}</td>
                        <td className="py-1 pr-2 text-right font-mono" style={{ color: l.precio ? 'var(--ink)' : '#f87171' }}>
                          {l.precio ? `$${l.precio.toFixed(5)}` : '-'}
                        </td>
                        <td className="py-1 text-right font-mono font-medium">{l.total > 0 ? `$${l.total.toLocaleString('es-CR', { minimumFractionDigits: 2 })}` : '-'}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--line)' }}>
                      <td colSpan={4} className="pt-1 font-bold text-right pr-2" style={{ color: 'var(--ink-muted)' }}>TOTAL</td>
                      <td className="pt-1 text-right font-mono font-bold" style={{ color: 'var(--emp-accent-txt)' }}>
                        ${feePreview.lineas.reduce((s, l) => s + l.total, 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setFeePreview(null)}
                className="text-xs px-3 py-1.5 rounded" style={{ background: 'var(--surface-overlay)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
                Cancelar
              </button>
              <button
                disabled={feePreview.errores.length > 0 || !!generandoFeeId}
                onClick={() => generarFEE(feePreview.despacho, {
                  plazo: feePreview.plazoEditable,
                  condicion: feePreview.condicionEditable,
                })}
                className="text-xs px-4 py-1.5 rounded font-medium"
                style={{ background: '#166534', color: '#fff', opacity: feePreview.errores.length > 0 ? 0.4 : 1 }}>
                {generandoFeeId ? 'Generando...' : 'Confirmar y generar FEE'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {cierreTarget && (
        <Modal title={`Cerrar Despacho - ${cierreTarget.codigo}`} onClose={() => setCierreTarget(null)} size="lg">
          <div className="space-y-5">
            {/* Resumen paletas */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-faint)' }}>
                Paletas asignadas
              </p>
              {cierreLoading ? (
                <p className="text-xs text-ink-muted">Cargando...</p>
              ) : (
                <>
                  {(() => {
                    const groups: Record<string, { cajas: number; frutas: number; paletas: number }> = {};
                    cierreBoletasDet.forEach(b => {
                      const key = `${b.calibre_nombre || '-'} / ${b.marca_nombre || '-'}`;
                      if (!groups[key]) groups[key] = { cajas: 0, frutas: 0, paletas: 0 };
                      groups[key].cajas += b.cajas_empacadas;
                      groups[key].frutas += b.total_frutas || 0;
                      groups[key].paletas += 1;
                    });
                    const totalCajas = cierreBoletasDet.reduce((s, b) => s + b.cajas_empacadas, 0);
                    const totalFrutas = cierreBoletasDet.reduce((s, b) => s + (b.total_frutas || 0), 0);
                    return (
                      <>
                        <div className="rounded overflow-hidden mb-2" style={{ border: '1px solid var(--line)' }}>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-xs">
                            <thead>
                              <tr style={{ background: 'var(--surface-deep)' }}>
                                {['Calibre / Marca', 'Paletas', 'Cajas', 'Frutas'].map(h => (
                                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink-faint)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(groups).map(([key, g]) => {
                                const sinConfig = cierreWarnings.includes(key);
                                return (
                                  <tr key={key} style={{
                                    borderTop: '1px solid var(--line)',
                                    background: sinConfig ? 'rgba(127,29,29,0.25)' : undefined,
                                  }}>
                                    <td className="px-3 py-1.5 font-medium" style={{ color: sinConfig ? '#fca5a5' : 'var(--ink)' }}>
                                      {sinConfig && <span className="mr-1">⛔</span>}{key}
                                      {sinConfig && <span className="ml-2 text-[10px] font-normal" style={{ color: '#f87171' }}>sin materiales</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-ink-muted">{g.paletas}</td>
                                    <td className="px-3 py-1.5 text-ink">{g.cajas}</td>
                                    <td className="px-3 py-1.5 text-ink">{g.frutas.toLocaleString('es-CR')}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ borderTop: '2px solid var(--line)', background: 'var(--surface-deep)' }}>
                                <td className="px-3 py-2 font-bold text-ink">TOTAL</td>
                                <td className="px-3 py-2 font-bold text-ink">{cierreBoletasDet.length}</td>
                                <td className="px-3 py-2 font-bold text-ink">{totalCajas}</td>
                                <td className="px-3 py-2 font-bold text-ink">{totalFrutas.toLocaleString('es-CR')}</td>
                              </tr>
                            </tfoot>
                            </table>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Campos finales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Hora Cierre</label>
                <input type="time" value={cierreForm.hora_cierre}
                  onChange={e => setCierreForm(f => ({ ...f, hora_cierre: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Marchamo Salida</label>
                <input type="text" value={cierreForm.marchamo_salida}
                  onChange={e => setCierreForm(f => ({ ...f, marchamo_salida: e.target.value }))}
                  className={inputCls + ' font-mono'} />
              </div>
              <div>
                <label className={labelCls}>Peso Bruto (kg)</label>
                <input type="number" step="0.001" value={cierreForm.peso_bruto}
                  onChange={e => setCierreForm(f => ({ ...f, peso_bruto: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Peso Neto (kg)</label>
                <input type="number" step="0.001" value={cierreForm.peso_neto}
                  onChange={e => setCierreForm(f => ({ ...f, peso_neto: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>

            {/* ── Advertencia calibres sin materiales ─────────────────── */}
            {cierreWarnings.length > 0 && (
              <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                style={{ background: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5' }}>
                <span>⛔</span>
                <span>Configurá los materiales faltantes en <strong>Configuración → Calibres</strong> antes de cerrar.</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
              <button type="button" onClick={() => setCierreTarget(null)} className={btnSecondary}>Cancelar</button>
              <button type="button" onClick={confirmarCierre}
                disabled={cierreSaving || cierreWarnings.length > 0}
                className={btnPrimary + ' flex items-center gap-2'}
                style={{ opacity: cierreWarnings.length > 0 ? 0.4 : 1 }}>
                <Lock size={13} /> {cierreSaving ? 'Cerrando...' : 'Confirmar Cierre'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Eliminar la boleta ${deleteTarget.codigo}? Las paletas asignadas quedaran sin despacho.`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  );
}


