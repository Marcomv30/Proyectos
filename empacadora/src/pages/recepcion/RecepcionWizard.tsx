import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Plus, Trash2,
  Package, CheckCircle, ChevronDown, ChevronUp, MapPin
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Parcela } from '../../types/empacadora';
import GeoMapPreview from '../../components/GeoMapPreview';
import { getCostaRicaDateISO, getISOWeekInfoCostaRica } from '../../utils/costaRicaTime';
import { inputCls, selectCls, labelCls, errorCls } from '../../components/ui';

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Proveedor = { id: string; nombre: string; ggn_gln: string | null; codigo: string | null };
type Transportista = { id: string; nombre: string; placa: string | null };
type Semana = { id: string; codigo: string; semana: number; [key: string]: any };

type VinRow = {
  _key: string;
  vin: string; carreta: string; hora_carga: string;
  lote: string; grupo_forza: string; cantidad: number; observacion: string;
  expanded: boolean;
  lat: number | null; lng: number | null; gps_precision: number | null;
};

type Header = {
  codigo: string; fecha: string; semana_id: string; programa_id: string;
  proveedor_id: string; ggn_gln: string;
  parcela_id: string;
  transportista_id: string; placa: string;
  hora_salida: string; lote: string; grupo_forza: string; enviado_por: string;
};

type Cierre = {
  hora_llegada: string; recibido_por: string;
  fruta_empacada: number; fruta_jugo: number; notas: string;
};

const PARCEL_COLORS = ['#4ade80', '#38bdf8', '#f59e0b', '#f472b6', '#a78bfa', '#fb7185', '#22c55e', '#14b8a6'];

function getParcelaColor(parcela?: Pick<Parcela, 'id' | 'codigo' | 'nombre'> | null) {
  const seed = `${parcela?.codigo || ''}-${parcela?.nombre || ''}-${parcela?.id || ''}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PARCEL_COLORS[hash % PARCEL_COLORS.length];
}

function ringAreaSqMeters(ring: number[][]) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const meanLat = ring.reduce((sum, pair) => sum + (pair[1] || 0), 0) / ring.length;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((meanLat * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    const x1 = lng1 * metersPerDegLng;
    const y1 = lat1 * metersPerDegLat;
    const x2 = lng2 * metersPerDegLng;
    const y2 = lat2 * metersPerDegLat;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function estimateGeojsonAreaHectares(geojson: any) {
  const geometry = getGeojsonGeometry(geojson);
  if (!geometry || !geometry.type || !geometry.coordinates) return null;
  let areaSqMeters = 0;
  if (geometry.type === 'Polygon') {
    areaSqMeters = (geometry.coordinates || []).reduce((sum: number, ring: number[][], index: number) => {
      const ringArea = ringAreaSqMeters(ring);
      return index === 0 ? sum + ringArea : sum - ringArea;
    }, 0);
  } else if (geometry.type === 'MultiPolygon') {
    areaSqMeters = (geometry.coordinates || []).reduce((sum: number, polygon: number[][][], polygonIndex: number) => {
      const polygonArea = (polygon || []).reduce((polySum: number, ring: number[][], ringIndex: number) => {
        const ringArea = ringAreaSqMeters(ring);
        return ringIndex === 0 ? polySum + ringArea : polySum - ringArea;
      }, 0);
      return polygonIndex >= 0 ? sum + polygonArea : sum;
    }, 0);
  }
  if (areaSqMeters <= 0) return null;
  return areaSqMeters / 10000;
}

function newVin(defaults: { lote: string; grupo_forza: string }): VinRow {
  return {
    _key: crypto.randomUUID(), vin: '', carreta: '', hora_carga: '',
    lote: defaults.lote, grupo_forza: defaults.grupo_forza,
    cantidad: 0, observacion: '', expanded: true,
    lat: null, lng: null, gps_precision: null,
  };
}

function closeLineRing(coords: any) {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const ring = coords.map((pair: any) => [pair?.[0], pair?.[1]]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return null;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring.length >= 4 ? ring : null;
}

function normalizeGeometryForParcel(geometry: any): any {
  if (!geometry || typeof geometry !== 'object') return geometry;
  if (geometry.type === 'LineString') {
    const ring = closeLineRing(geometry.coordinates);
    return ring ? { type: 'Polygon', coordinates: [ring] } : geometry;
  }
  if (geometry.type === 'MultiLineString') {
    const polygons = (geometry.coordinates || [])
      .map((line: any) => closeLineRing(line))
      .filter(Boolean)
      .map((ring: any) => [ring]);
    return polygons.length ? { type: 'MultiPolygon', coordinates: polygons } : geometry;
  }
  return geometry;
}

function normalizeGeojsonForParcel(geojson: any): any {
  if (!geojson || typeof geojson !== 'object') return geojson;
  if (geojson.type === 'Feature') return { ...geojson, geometry: normalizeGeometryForParcel(geojson.geometry) };
  if (geojson.type === 'FeatureCollection') {
    return {
      ...geojson,
      features: Array.isArray(geojson.features)
        ? geojson.features.map((feature: any) => ({ ...feature, geometry: normalizeGeometryForParcel(feature?.geometry) }))
        : [],
    };
  }
  return normalizeGeometryForParcel(geojson);
}

function getGeojsonGeometry(geojson: any) {
  const normalized = normalizeGeojsonForParcel(geojson);
  if (!normalized) return null;
  if (normalized.type === 'Feature') return normalized.geometry || null;
  if (normalized.type === 'FeatureCollection') {
    const features = Array.isArray(normalized.features) ? normalized.features : [];
    const preferred = features.find((feature: any) => ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type));
    return preferred?.geometry || features[0]?.geometry || null;
  }
  return normalized;
}

function pointInRing(point: [number, number], ring: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || 0.0000001) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPointInsideParcel(geojson: any, lng: number, lat: number) {
  const geometry = getGeojsonGeometry(geojson);
  if (!geometry?.type || !geometry.coordinates) return null;
  const point: [number, number] = [lng, lat];
  if (geometry.type === 'Polygon') {
    const outerRing = geometry.coordinates?.[0] || [];
    return outerRing.length >= 4 ? pointInRing(point, outerRing) : null;
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || []).some((polygon: any) => {
      const outerRing = polygon?.[0] || [];
      return outerRing.length >= 4 ? pointInRing(point, outerRing) : false;
    });
  }
  return null;
}

function ParcelGpsPreview({
  geojson,
  gps,
  polygonColor,
}: {
  geojson: any;
  gps: { lat: number; lng: number; precision: number } | null;
  polygonColor?: string;
}) {
  return <GeoMapPreview geojson={geojson} gps={gps} height={220} maxWidthClassName="max-w-[260px]" polygonColor={polygonColor} />;
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface Props {
  editing?: any;
  editingDets?: any[];
  onSaved: () => void;
  onCancel: () => void;
}

export default function RecepcionWizard({ editing, editingDets, onSaved, onCancel }: Props) {
  const empresaId = useEmpresaId();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Catálogos
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [programas, setProgramas] = useState<{ id: string; codigo: string; cliente_nombre: string }[]>([]);

  // Estado del wizard
  const today = getCostaRicaDateISO();
  const [header, setHeader] = useState<Header>({
    codigo: '', fecha: today, semana_id: '', programa_id: '',
    proveedor_id: '', ggn_gln: '', parcela_id: '', transportista_id: '', placa: '',
    hora_salida: '', lote: '', grupo_forza: '', enviado_por: '',
  });
  const [vins, setVins] = useState<VinRow[]>([newVin({ lote: '', grupo_forza: '' })]);
  const [cierre, setCierre] = useState<Cierre>({
    hora_llegada: '', recibido_por: '', fruta_empacada: 0, fruta_jugo: 0, notas: '',
  });
  const [currentGps, setCurrentGps] = useState<{ lat: number; lng: number; precision: number } | null>(null);
  const [savedGps, setSavedGps] = useState<{ lat: number; lng: number; precision: number } | null>(null);

  const vinsEndRef = useRef<HTMLDivElement>(null);

  // ─── GPS silencioso ───────────────────────────────────────────────────────
  // Guardamos la última posición conocida para asignarla a cada VIN nuevo.
  const lastGps = useRef<{ lat: number; lng: number; precision: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    // Solicitar permiso y empezar a monitorear la posición
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const nextGps = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy,
        };
        lastGps.current = nextGps;
        setCurrentGps(nextGps);
      },
      () => { /* sin GPS disponible — no bloquear al operario */ },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!currentGps) return;
    setVins((vs) => vs.map((v) => {
      if (v.lat !== null && v.lng !== null) return v;
      return {
        ...v,
        lat: currentGps.lat,
        lng: currentGps.lng,
        gps_precision: currentGps.precision,
      };
    }));
  }, [currentGps]);

  // Cargar catálogos
  useEffect(() => {
    Promise.all([
      supabase.from('emp_proveedores_fruta').select('id,nombre,ggn_gln,codigo').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_transportistas').select('id,nombre,placa').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_parcelas').select('id,nombre,proveedor_id,geojson,ubicacion,hectareas,activo').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('emp_semanas').select('id,codigo,semana,año').eq('empresa_id', empresaId).eq('activo', true).order('año', { ascending: false }).order('semana', { ascending: false }),
      supabase.from('emp_programas').select('id,codigo,cliente_nombre').eq('empresa_id', empresaId).eq('terminado', false).order('fecha', { ascending: false }),
      supabase.from('emp_recepciones').select('codigo').eq('empresa_id', empresaId).like('codigo', 'BC-%'),
    ]).then(([{ data: p }, { data: t }, { data: parc }, { data: s }, { data: pr }, { data: last }]) => {
      setProveedores(p || []);
      setTransportistas(t || []);
      setParcelas((parc as Parcela[]) || []);
      setSemanas((s || []) as unknown as Semana[]);
      setProgramas(pr || []);
      // Auto-semana
      const info = getISOWeekInfoCostaRica(today);
      const sem = (s as any[] || []).find((x: any) => x.semana === info.week && x['a\xF1o'] === info.year);
      if (sem) setHeader(h => ({ ...h, semana_id: sem.id }));
      // Auto-incrementar número de boleta BC- solo en modo nuevo
      if (!editing) {
        const bcRecords = (last || []).filter((r: any) => (r.codigo || '').startsWith('BC-'));
        let nextNum = 1;
        if (bcRecords.length > 0) {
          const nums = bcRecords.map((r: any) => parseInt((r.codigo || '').replace('BC-', ''), 10)).filter((n: number) => !isNaN(n));
          if (nums.length > 0) nextNum = Math.max(...nums) + 1;
        }
        setHeader(h => ({ ...h, codigo: `BC-${String(nextNum).padStart(4, '0')}` }));
      }
    });
  }, [empresaId, editing, today]);

  // Si viene en modo edición, cargar datos
  useEffect(() => {
    if (!editing) return;
    setHeader({
      codigo: editing.codigo || '', fecha: editing.fecha || today,
      semana_id: editing.semana_id || '', programa_id: editing.programa_id || '',
      proveedor_id: editing.proveedor_id || '', ggn_gln: editing.ggn_gln || '', parcela_id: editing.parcela_id || '',
      transportista_id: editing.transportista_id || '', placa: editing.placa || '',
      hora_salida: editing.hora_salida || '', lote: editing.lote || '',
      grupo_forza: editing.grupo_forza || '', enviado_por: editing.enviado_por || '',
    });
    setCierre({
      hora_llegada: editing.hora_llegada || '', recibido_por: editing.recibido_por || '',
      fruta_empacada: editing.fruta_empacada || 0, fruta_jugo: editing.fruta_jugo || 0,
      notas: editing.notas || '',
    });
    if (editingDets && editingDets.length > 0) {
      const firstSavedGps = editingDets.find((d: any) => d.lat !== null && d.lng !== null) as any;
      setSavedGps(firstSavedGps
        ? {
            lat: firstSavedGps.lat,
            lng: firstSavedGps.lng,
            precision: firstSavedGps.gps_precision ?? 0,
          }
        : null);
      setVins(editingDets.map(d => ({
        _key: crypto.randomUUID(),
        vin: d.vin || '', carreta: d.carreta || '', hora_carga: d.hora_carga || '',
        lote: d.lote || editing.lote || '', grupo_forza: d.grupo_forza || editing.grupo_forza || '',
        cantidad: d.cantidad || 0, observacion: d.observacion || '', expanded: false,
        lat: d.lat ?? null, lng: d.lng ?? null, gps_precision: d.gps_precision ?? null,
      })));
    } else {
      setSavedGps(null);
    }
  }, [editing, editingDets, today]);

  // Auto-fill GGN desde proveedor (cubre selección manual y modo edición)
  useEffect(() => {
    if (!header.proveedor_id || !proveedores.length) return;
    const p = proveedores.find(x => x.id === header.proveedor_id);
    if (p?.ggn_gln && !header.ggn_gln) {
      setHeader(h => ({ ...h, ggn_gln: p.ggn_gln || '' }));
    }
  }, [header.proveedor_id, header.ggn_gln, proveedores]);

  useEffect(() => {
    if (!header.proveedor_id) return;
    const disponibles = parcelas.filter((parcela) => !parcela.proveedor_id || parcela.proveedor_id === header.proveedor_id);
    if (disponibles.length !== 1) return;
    if (header.parcela_id === disponibles[0].id) return;
    if (header.parcela_id && disponibles.some((parcela) => parcela.id === header.parcela_id)) return;
    setHeader((h) => ({ ...h, parcela_id: disponibles[0].id }));
  }, [header.proveedor_id, header.parcela_id, parcelas]);

  function handleProveedorChange(id: string) {
    const p = proveedores.find(x => x.id === id);
    setHeader(h => {
      const nextParcelas = parcelas.filter(parcela => !id || !parcela.proveedor_id || parcela.proveedor_id === id);
      const parcelaId = nextParcelas.some(parcela => parcela.id === h.parcela_id) ? h.parcela_id : '';
      return { ...h, proveedor_id: id, ggn_gln: p?.ggn_gln || '', parcela_id: parcelaId };
    });
  }

  // Auto-fill transportista → placa
  function handleTransportistaChange(id: string) {
    const t = transportistas.find(x => x.id === id);
    setHeader(h => ({ ...h, transportista_id: id, placa: t?.placa || h.placa }));
  }

  // Auto-semana al cambiar fecha
  function handleFechaChange(fecha: string) {
    const info = getISOWeekInfoCostaRica(fecha);
    const sem = semanas.find(s => s.semana === info.week && s['a\xF1o'] === info.year);
    setHeader(h => ({ ...h, fecha, semana_id: sem?.id || h.semana_id }));
  }

  // ─── VINs ────────────────────────────────────────────────────────────────
  const totalFrutas = vins.reduce((s, v) => s + (v.cantidad || 0), 0);

  function addVin() {
    const gps = lastGps.current;
    const vin = newVin({ lote: header.lote, grupo_forza: header.grupo_forza });
    if (gps) {
      vin.lat = gps.lat;
      vin.lng = gps.lng;
      vin.gps_precision = gps.precision;
    }
    setVins(vs => [...vs.map(v => ({ ...v, expanded: false })), vin]);
    setTimeout(() => vinsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  function updateVin(key: string, field: keyof VinRow, value: any) {
    setVins(vs => vs.map(v => v._key === key ? { ...v, [field]: value } : v));
  }

  function removeVin(key: string) {
    setVins(vs => vs.filter(v => v._key !== key));
  }

  function toggleVin(key: string) {
    setVins(vs => vs.map(v => v._key === key ? { ...v, expanded: !v.expanded } : v));
  }

  const displayGps = savedGps || currentGps;
  const displayGpsIsSaved = !!savedGps;
  const parcelasDisponibles = parcelas.filter(parcela => !header.proveedor_id || !parcela.proveedor_id || parcela.proveedor_id === header.proveedor_id);
  const parcelaSeleccionada = parcelas.find(parcela => parcela.id === header.parcela_id) || null;
  const gpsInsideParcel = parcelaSeleccionada && displayGps
    ? isPointInsideParcel(parcelaSeleccionada.geojson, displayGps.lng, displayGps.lat)
    : null;

  // ─── Guardar ──────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setError('');
    const payload = {
      empresa_id: empresaId,
      codigo: header.codigo || null,
      fecha: header.fecha,
      semana_id: header.semana_id || null,
      programa_id: header.programa_id || null,
      proveedor_id: header.proveedor_id || null,
      parcela_id: header.parcela_id || null,
      ggn_gln: header.ggn_gln || null,
      transportista_id: header.transportista_id || null,
      placa: header.placa || null,
      hora_salida: header.hora_salida || null,
      hora_llegada: cierre.hora_llegada || null,
      lote: header.lote || null,
      grupo_forza: header.grupo_forza || null,
      enviado_por: header.enviado_por || null,
      recibido_por: cierre.recibido_por || null,
      total_frutas: totalFrutas || null,
      fruta_empacada: cierre.fruta_empacada || 0,
      fruta_jugo: cierre.fruta_jugo || 0,
      notas: cierre.notas || null,
      recibida: true,
    };

    let recepcionId = editing?.id;
    if (editing) {
      const { error: e } = await supabase.from('emp_recepciones').update(payload).eq('id', editing.id);
      if (e) { setError(e.message); setSaving(false); return; }
      await supabase.from('emp_recepciones_detalle').delete().eq('recepcion_id', editing.id);
    } else {
      const { data, error: e } = await supabase.from('emp_recepciones').insert(payload).select('id').single();
      if (e) { setError(e.message); setSaving(false); return; }
      recepcionId = data.id;
    }

    const detsValidos = vins.filter(v => v.vin || v.cantidad > 0);
    if (detsValidos.length > 0 && recepcionId) {
      const { error: e } = await supabase.from('emp_recepciones_detalle').insert(
        detsValidos.map(v => ({
          empresa_id: empresaId,
          recepcion_id: recepcionId,
          vin: v.vin || null,
          carreta: v.carreta || null,
          hora_carga: v.hora_carga || null,
          lote: v.lote || null,
          grupo_forza: v.grupo_forza || null,
          cantidad: v.cantidad || 0,
          observacion: v.observacion || null,
          lat: v.lat ?? currentGps?.lat ?? null,
          lng: v.lng ?? currentGps?.lng ?? null,
          gps_precision: v.gps_precision ?? currentGps?.precision ?? null,
        }))
      );
      if (e) { setError(e.message); setSaving(false); return; }
    }

    setSaving(false);
    onSaved();
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const stepLabel = ['Encabezado', 'VINs de fruta', 'Cierre'];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface-base)' }}>

      {/* Header del wizard */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--surface-deep)', borderBottom: '1px solid var(--line)' }}>
        <button onClick={onCancel} className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--ink-muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
            {editing ? `Editar Recepción ${editing.codigo || ''}` : 'Nueva Recepción'}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{stepLabel[step - 1]}</p>
        </div>
        {/* Step dots */}
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className="w-2 h-2 rounded-full transition-colors"
              style={{ background: s <= step ? 'var(--emp-accent)' : 'var(--line)' }} />
          ))}
        </div>
      </div>

      {/* Contenido del paso */}
      <div className="flex-1 overflow-auto px-4 py-5 space-y-4">

        {/* ── PASO 1: Encabezado ── */}
        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>No. Boleta</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={header.codigo}
                  readOnly
                  placeholder="Se asigna automaticamente"
                  className={inputCls + ' text-lg font-mono font-bold'}
                  style={{ opacity: 0.82, cursor: 'not-allowed' }}
                />
              </div>
              <div>
                <label className={labelCls}>Fecha</label>
                <input type="date" value={header.fecha}
                  onChange={e => handleFechaChange(e.target.value)}
                  className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Proveedor / Finca</label>
              <select value={header.proveedor_id} onChange={e => handleProveedorChange(e.target.value)}
                className={selectCls + ' text-base py-3'}>
                <option value="">— Seleccione —</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>GGN / GLN (GlobalG.A.P.)</label>
              <input type="text" value={header.ggn_gln}
                onChange={e => setHeader(h => ({ ...h, ggn_gln: e.target.value }))}
                placeholder="Auto-fill desde proveedor"
                className={inputCls + ' font-mono'} />
            </div>

            <div>
              <label className={labelCls}>Parcela / Lote georreferenciado</label>
              <select value={header.parcela_id} onChange={e => setHeader(h => ({ ...h, parcela_id: e.target.value }))}
                className={selectCls + ' text-base py-3'}>
                <option value="">— Sin parcela —</option>
                {parcelasDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.hectareas ? ` — ${p.hectareas} ha` : ''}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Transportista</label>
              <select value={header.transportista_id} onChange={e => handleTransportistaChange(e.target.value)}
                className={selectCls + ' text-base py-3'}>
                <option value="">— Seleccione —</option>
                {transportistas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Placa</label>
                <input type="text" value={header.placa}
                  onChange={e => setHeader(h => ({ ...h, placa: e.target.value.toUpperCase() }))}
                  placeholder="151830" className={inputCls + ' font-mono uppercase'} />
              </div>
              <div>
                <label className={labelCls}>Hora salida finca</label>
                <input type="time" value={header.hora_salida}
                  onChange={e => setHeader(h => ({ ...h, hora_salida: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Lote (default VINs)</label>
                <input type="text" inputMode="numeric" value={header.lote}
                  onChange={e => setHeader(h => ({ ...h, lote: e.target.value }))}
                  placeholder="28" className={inputCls + ' font-mono'} />
              </div>
              <div>
                <label className={labelCls}>Bloque/GF (default)</label>
                <input type="text" inputMode="numeric" value={header.grupo_forza}
                  onChange={e => setHeader(h => ({ ...h, grupo_forza: e.target.value }))}
                  placeholder="03" className={inputCls + ' font-mono'} />
              </div>
            </div>

            <div className="rounded-xl border px-4 py-3"
              style={{ background: 'var(--surface-overlay)', borderColor: 'var(--line)' }}>
              <div className="flex items-center gap-2 mb-1">
                <MapPin size={14} style={{ color: displayGps ? '#22c55e' : 'var(--ink-faint)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>
                  {displayGpsIsSaved ? 'Ubicacion GPS guardada' : 'Ubicacion GPS capturada silenciosamente'}
                </span>
              </div>
              {displayGps ? (
                <div className="space-y-3">
                  <div className="text-sm font-mono" style={{ color: 'var(--ink)' }}>
                    {displayGps.lat.toFixed(5)}, {displayGps.lng.toFixed(5)}
                    <span className="ml-2 text-xs" style={{ color: 'var(--ink-faint)' }}>
                      +/-{displayGps.precision.toFixed(0)} m
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start">
                    <ParcelGpsPreview geojson={parcelaSeleccionada?.geojson} gps={displayGps} polygonColor={getParcelaColor(parcelaSeleccionada)} />
                    <div className="min-w-0 space-y-2">
                      {parcelaSeleccionada ? (
                        <>
                          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                            Parcela: <span style={{ color: 'var(--emp-accent-txt)' }}>{parcelaSeleccionada.nombre}</span>
                          </p>
                          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                            {parcelaSeleccionada.hectareas
                              ? `${parcelaSeleccionada.hectareas} ha`
                              : estimateGeojsonAreaHectares(parcelaSeleccionada.geojson)
                                ? `${estimateGeojsonAreaHectares(parcelaSeleccionada.geojson)?.toFixed(2)} ha aprox.`
                                : 'Sin hectareas definidas'}
                            {parcelaSeleccionada.ubicacion ? ` · ${parcelaSeleccionada.ubicacion}` : ''}
                          </p>
                          {gpsInsideParcel !== null && (
                            <div
                              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                              style={{
                                background: gpsInsideParcel ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                                color: gpsInsideParcel ? '#4ade80' : '#fbbf24',
                                border: `1px solid ${gpsInsideParcel ? 'rgba(34,197,94,0.35)' : 'rgba(245,158,11,0.35)'}`,
                              }}
                            >
                              {gpsInsideParcel ? 'GPS dentro de la parcela' : 'GPS fuera de la parcela'}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                          Seleccione una parcela para comparar el punto GPS con el lote georreferenciado.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm" style={{ color: 'var(--ink-faint)' }}>
                  Esperando ubicacion del dispositivo...
                </div>
              )}
              <p className="text-[11px] mt-1" style={{ color: 'var(--ink-faint)' }}>
                {displayGpsIsSaved ? 'Se muestra la ubicacion ya guardada en la recepcion.' : 'Esta es la ultima posicion conocida y se asigna automaticamente a cada VIN nuevo.'}
              </p>
            </div>

            <div>
              <label className={labelCls}>Programa ORP (opcional)</label>
              <select value={header.programa_id} onChange={e => setHeader(h => ({ ...h, programa_id: e.target.value }))}
                className={selectCls}>
                <option value="">— Sin programa —</option>
                {programas.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente_nombre}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Enviado por</label>
              <input type="text" value={header.enviado_por}
                onChange={e => setHeader(h => ({ ...h, enviado_por: e.target.value }))}
                placeholder="Nombre de quien despacha" className={inputCls} />
            </div>
          </>
        )}

        {/* ── PASO 2: VINs ── */}
        {step === 2 && (
          <>
            {/* Total sticky */}
            <div className="rounded-xl px-4 py-3 flex items-center justify-between"
              style={{ background: 'var(--emp-accent-bg)', border: '1px solid var(--emp-accent)44' }}>
              <div className="flex items-center gap-2">
                <Package size={16} style={{ color: 'var(--emp-accent-txt)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--emp-accent-txt)' }}>
                  Total fruta
                </span>
              </div>
              <span className="text-2xl font-bold" style={{ color: 'var(--emp-accent-txt)' }}>
                {totalFrutas.toLocaleString('es-CR')}
              </span>
            </div>

            {/* Tarjetas VIN */}
            {vins.map((v, idx) => (
              <div key={v._key} className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--line)', background: 'var(--surface-raised)' }}>
                {/* Header de la tarjeta */}
                <button type="button" onClick={() => toggleVin(v._key)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{ borderBottom: v.expanded ? '1px solid var(--line)' : 'none' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: v.cantidad > 0 ? 'var(--emp-accent-bg)' : 'var(--surface-overlay)', color: v.cantidad > 0 ? 'var(--emp-accent-txt)' : 'var(--ink-faint)' }}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    {v.vin || v.cantidad > 0 ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm" style={{ color: 'var(--ink)' }}>
                          {v.vin ? `VIN ${v.vin}` : '—'}
                        </span>
                        {v.hora_carga && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{v.hora_carga}</span>}
                        {v.lote && <span className="text-xs font-mono" style={{ color: 'var(--ink-muted)' }}>L{v.lote}</span>}
                        {v.grupo_forza && <span className="text-xs font-mono" style={{ color: 'var(--ink-muted)' }}>GF{v.grupo_forza}</span>}
                        {v.cantidad > 0 && (
                          <span className="ml-auto font-bold text-sm" style={{ color: 'var(--emp-accent-txt)' }}>
                            {v.cantidad.toLocaleString('es-CR')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--ink-faint)' }}>Completar datos...</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Indicador GPS silencioso */}
                    <span title={v.lat ? `GPS: ${v.lat.toFixed(5)}, ${v.lng!.toFixed(5)} (±${v.gps_precision?.toFixed(0)}m)` : 'Sin GPS'}>
                      <MapPin size={12} style={{ color: v.lat ? '#22c55e' : 'var(--ink-faint)', flexShrink: 0 }} />
                    </span>
                    {vins.length > 1 && (
                      <button type="button" onClick={e => { e.stopPropagation(); removeVin(v._key); }}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: '#ef4444' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                    {v.expanded ? <ChevronUp size={16} style={{ color: 'var(--ink-faint)' }} /> : <ChevronDown size={16} style={{ color: 'var(--ink-faint)' }} />}
                  </div>
                </button>

                {/* Campos del VIN */}
                {v.expanded && (
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>VIN #</label>
                        <input type="text" inputMode="numeric" value={v.vin}
                          onChange={e => updateVin(v._key, 'vin', e.target.value)}
                          placeholder="21" className={inputCls + ' text-xl font-mono font-bold text-center py-3'}
                          autoFocus={idx === vins.length - 1 && !v.vin} />
                      </div>
                      <div>
                        <label className={labelCls}>Hora carga</label>
                        <input type="time" value={v.hora_carga}
                          onChange={e => updateVin(v._key, 'hora_carga', e.target.value)}
                          className={inputCls + ' py-3'} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Lote</label>
                        <input type="text" inputMode="numeric" value={v.lote}
                          onChange={e => updateVin(v._key, 'lote', e.target.value)}
                          className={inputCls + ' font-mono text-center'} />
                      </div>
                      <div>
                        <label className={labelCls}>Bloque/GF</label>
                        <input type="text" inputMode="numeric" value={v.grupo_forza}
                          onChange={e => updateVin(v._key, 'grupo_forza', e.target.value)}
                          className={inputCls + ' font-mono text-center'} />
                      </div>
                      <div>
                        <label className={labelCls}>Carreta</label>
                        <input type="text" inputMode="numeric" value={v.carreta}
                          onChange={e => updateVin(v._key, 'carreta', e.target.value)}
                          className={inputCls + ' font-mono text-center'} />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Cantidad de frutas *</label>
                      <input type="number" inputMode="numeric" value={v.cantidad || ''}
                        onChange={e => updateVin(v._key, 'cantidad', +e.target.value)}
                        placeholder="0" min={0}
                        className={inputCls + ' text-2xl font-bold text-center py-4'} />
                    </div>

                    <div>
                      <label className={labelCls}>Observaciones</label>
                      <input type="text" value={v.observacion}
                        onChange={e => updateVin(v._key, 'observacion', e.target.value)}
                        placeholder="ej: Segunda cosecha" className={inputCls} />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div ref={vinsEndRef} />

            {/* Botón agregar VIN */}
            <button type="button" onClick={addVin}
              className="w-full py-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-colors"
              style={{ border: '2px dashed var(--emp-accent)', color: 'var(--emp-accent-txt)', background: 'var(--emp-accent-bg)' }}>
              <Plus size={18} /> Agregar VIN
            </button>
          </>
        )}

        {/* ── PASO 3: Cierre ── */}
        {step === 3 && (
          <>
            {/* Resumen */}
            <div className="rounded-xl p-4 space-y-2"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Resumen</p>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>VINs registrados</span>
                <span className="font-bold" style={{ color: 'var(--ink)' }}>{vins.filter(v => v.vin || v.cantidad > 0).length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>Total fruta</span>
                <span className="text-xl font-bold" style={{ color: 'var(--emp-accent-txt)' }}>{totalFrutas.toLocaleString('es-CR')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Hora llegada planta</label>
                <input type="time" value={cierre.hora_llegada}
                  onChange={e => setCierre(c => ({ ...c, hora_llegada: e.target.value }))}
                  className={inputCls + ' py-3 text-center text-lg'} />
              </div>
              <div>
                <label className={labelCls}>Recibido por</label>
                <input type="text" value={cierre.recibido_por}
                  onChange={e => setCierre(c => ({ ...c, recibido_por: e.target.value }))}
                  placeholder="Nombre" className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Fruta empacada</label>
                <input type="number" inputMode="numeric" value={cierre.fruta_empacada || ''}
                  onChange={e => setCierre(c => ({ ...c, fruta_empacada: +e.target.value }))}
                  min={0} className={inputCls + ' font-mono'} />
              </div>
              <div>
                <label className={labelCls}>Fruta jugo</label>
                <input type="number" inputMode="numeric" value={cierre.fruta_jugo || ''}
                  onChange={e => setCierre(c => ({ ...c, fruta_jugo: +e.target.value }))}
                  min={0} className={inputCls + ' font-mono'} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Notas</label>
              <textarea value={cierre.notas} onChange={e => setCierre(c => ({ ...c, notas: e.target.value }))}
                rows={3} placeholder="Observaciones generales..."
                className={inputCls + ' resize-none'} />
            </div>

            {error && <p className={errorCls + ' text-sm'}>{error}</p>}
          </>
        )}
      </div>

      {/* Barra de navegación inferior */}
      <div className="sticky bottom-0 px-4 py-3 flex gap-3"
        style={{ background: 'var(--surface-deep)', borderTop: '1px solid var(--line)' }}>
        {step > 1 && (
          <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-colors"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-muted)', background: 'var(--surface-overlay)' }}>
            <ArrowLeft size={16} /> Atrás
          </button>
        )}

        {step < 3 ? (
          <button onClick={() => setStep(s => (s + 1) as 2 | 3)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors"
            style={{ background: 'var(--emp-accent)', color: '#fff' }}>
            Siguiente <ArrowRight size={16} />
          </button>
        ) : (
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            style={{ background: 'var(--emp-accent)', color: '#fff' }}>
            {saving ? 'Guardando...' : <><CheckCircle size={16} /> Guardar recepción</>}
          </button>
        )}
      </div>
    </div>
  );
}
