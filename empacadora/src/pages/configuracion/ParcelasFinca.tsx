import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Plus, Pencil, Trash2, Search, MapPin, Expand, ArrowLeft, Upload, X, Check, Layers, Maximize2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Parcela, EmpBloque, TipoBloque } from '../../types/empacadora';
import GeoMapPreview, { OverlayLayer } from '../../components/GeoMapPreview';
import ParcelProjectMap from '../../components/ParcelProjectMap';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Badge from '../../components/Badge';
import {
  inputCls,
  labelCls,
  btnPrimary,
  btnSecondary,
  tableWrapCls,
  theadCls,
  thCls,
  trCls,
  tdCls,
  errorCls,
} from '../../components/ui';

const EMPTY: Omit<Parcela, 'id' | 'created_at' | 'proveedor'> = {
  empresa_id: 0,
  proveedor_id: '',
  codigo: '',
  nombre: '',
  hectareas: undefined,
  ubicacion: '',
  geojson: null,
  activo: true,
  tipo_finca: 'propia',
  area_ha_perimetro: undefined,
  area_ha_sembrada: undefined,
};

function getFallbackParcelaColor(parcela?: Partial<Pick<Parcela, 'id' | 'codigo' | 'nombre'>> | null) {
  const seed = `${parcela?.codigo || ''}-${parcela?.nombre || ''}-${parcela?.id || ''}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const saturation = 72 + (hash % 10);
  const lightness = 55 + (hash % 6);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function getDistinctParcelaColor(index: number) {
  const hue = (index * 137.508) % 360;
  const saturation = 72 + (index % 3) * 6;
  const lightness = 54 + (index % 4) * 4;
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
}

function safeStringifyGeojson(value: unknown) {
  if (!value) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
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
  if (geojson.type === 'Feature') {
    return { ...geojson, geometry: normalizeGeometryForParcel(geojson.geometry) };
  }
  if (geojson.type === 'FeatureCollection') {
    return {
      ...geojson,
      features: Array.isArray(geojson.features)
        ? geojson.features.map((feature: any) => ({
            ...feature,
            geometry: normalizeGeometryForParcel(feature?.geometry),
          }))
        : [],
    };
  }
  return normalizeGeometryForParcel(geojson);
}

function parseGeojsonInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null as any, error: '' };
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') {
      return { value: null as any, error: 'La geometria debe ser un objeto GeoJSON valido.' };
    }
    const type = typeof parsed.type === 'string' ? parsed.type : '';
    if (!type) {
      return { value: null as any, error: 'El GeoJSON debe incluir el campo type.' };
    }
    if (!['Feature', 'FeatureCollection', 'Polygon', 'MultiPolygon', 'Point', 'MultiPoint', 'LineString', 'MultiLineString'].includes(type)) {
      return { value: null as any, error: `Tipo GeoJSON no soportado: ${type}` };
    }
    return { value: normalizeGeojsonForParcel(parsed), error: '' };
  } catch {
    return { value: null as any, error: 'GeoJSON invalido. Revise comas, llaves y comillas.' };
  }
}

function countGeojsonCoordinates(node: any): number {
  if (!Array.isArray(node)) return 0;
  if (node.length && typeof node[0] === 'number') return 1;
  return node.reduce((sum, child) => sum + countGeojsonCoordinates(child), 0);
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

function getGeojsonSummary(geojson: any) {
  if (!geojson) return 'Sin geometria';
  const geometry = getGeojsonGeometry(geojson);
  if (!geometry) return `${geojson.type || 'GeoJSON'} sin geometria`;
  const vertices = countGeojsonCoordinates(geometry.coordinates);
  return vertices > 0 ? `${geometry.type || geojson.type} · ${vertices} vertices` : (geometry.type || geojson.type || 'GeoJSON');
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

function getParcelaHectareas(parcela?: Pick<Parcela, 'hectareas' | 'geojson'> | null) {
  return parcela?.hectareas || estimateGeojsonAreaHectares(parcela?.geojson) || null;
}

// ─── Bloque drawing helpers ──────────────────────────────────────────────────
const BLOQUE_COLORS: Record<TipoBloque, string> = {
  siembra:    '#4ade80',
  camino:     '#fb923c',
  proteccion: '#60a5fa',
  otro:       '#e879f9',
};
const BLOQUE_LABELS: Record<TipoBloque, string> = {
  siembra:    'Siembra',
  camino:     'Camino',
  proteccion: 'Protección',
  otro:       'Otro',
};

/** Calcula área en ha a partir de un GeoJSON Polygon (coordenadas [lng,lat]) */
function calcAreaHaFromGeojsonPolygon(geojson: any): number {
  const ring: [number, number][] | undefined = geojson?.coordinates?.[0];
  if (!ring || ring.length < 4) return 0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    area += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs(area * 6371000 * 6371000) / 2 / 10000;
}

export default function ParcelasFinca() {
  const empresaId = useEmpresaId();
  const [rows, setRows] = useState<Parcela[]>([]);
  const [filtered, setFiltered] = useState<Parcela[]>([]);
  const [proveedores, setProveedores] = useState<Pick<import('../../types/empacadora').ProveedorFruta, 'id' | 'nombre' | 'tipo'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Parcela | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [geojsonText, setGeojsonText] = useState('');
  const [geojsonError, setGeojsonError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Parcela | null>(null);
  const [mapEditing, setMapEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mapTarget, setMapTarget] = useState<Parcela | null>(null);
  const [mapDraftGeojson, setMapDraftGeojson] = useState<any>(null);
  const [mapSaving, setMapSaving] = useState(false);
  const [mapWide, setMapWide] = useState(false);
  const [mapFullScreen, setMapFullScreen] = useState(false);
  const [mapViewEditing, setMapViewEditing] = useState(false);
  const [projectMapOpen, setProjectMapOpen] = useState(false);
  const [projectMapSelectedId, setProjectMapSelectedId] = useState('');
  const [bloques, setBloques] = useState<EmpBloque[]>([]);
  const [bloquesLoading, setBloquesLoading] = useState(false);
  const [bloquesCountMap, setBloquesCountMap] = useState<Map<string, number>>(new Map());
  const [focusedBloqueId, setFocusedBloqueId] = useState<string | null>(null);
  const [focusFlashKey, setFocusFlashKey] = useState(0);
  const [bloqueDraftTipo, setBloqueDraftTipo] = useState<TipoBloque | null>(null);
  const [bloqueDrawKey, setBloqueDrawKey] = useState(0);
  const [bloqueSaving, setBloqueSaving] = useState(false);
  const [bloqueSaveMsg, setBloqueSaveMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [parcRes, provRes, blqRes] = await Promise.all([
      supabase
        .from('emp_parcelas')
        .select('*, proveedor:emp_proveedores_fruta(id, nombre)')
        .eq('empresa_id', empresaId)
        .order('nombre'),
      supabase
        .from('emp_proveedores_fruta')
        .select('id, nombre, tipo')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('emp_bloques')
        .select('parcela_id')
        .eq('empresa_id', empresaId)
        .eq('activo', true),
    ]);
    if (parcRes.error) setError(parcRes.error.message);
    else setRows(parcRes.data || []);
    if (!provRes.error) setProveedores(provRes.data || []);
    // Contar bloques por parcela (si la tabla ya existe)
    if (!blqRes.error && blqRes.data) {
      const countMap = new Map<string, number>();
      (blqRes.data as { parcela_id: string }[]).forEach(b => {
        countMap.set(b.parcela_id, (countMap.get(b.parcela_id) || 0) + 1);
      });
      setBloquesCountMap(countMap);
    }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => {
    load();
  }, [load]);

  // Carga bloques cuando se abre el detalle de una parcela
  useEffect(() => {
    if (!mapTarget) { setBloques([]); return; }
    setBloquesLoading(true);
    supabase
      .from('emp_bloques')
      .select('*')
      .eq('parcela_id', mapTarget.id)
      .eq('activo', true)
      .order('tipo')
      .order('num')
      .then(({ data }) => {
        setBloques((data as EmpBloque[]) || []);
        setBloquesLoading(false);
      });
  }, [mapTarget]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      !q
        ? rows
        : rows.filter((x) =>
            x.nombre.toLowerCase().includes(q) ||
            (x.codigo || '').toLowerCase().includes(q) ||
            (x.proveedor?.nombre || '').toLowerCase().includes(q)
          )
    );
  }, [rows, search]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY });
    setGeojsonText('');
    setGeojsonError('');
    setMapEditing(true); // nueva parcela: directo a dibujo
    setShowModal(true);
  }

  function openMap(r: Parcela) {
    setMapTarget(r);
    setMapDraftGeojson(r.geojson || null);
    setMapWide(false);
    setMapViewEditing(false);
  }

  function openProjectMap() {
    setProjectMapSelectedId((current) => current || filtered[0]?.id || rows[0]?.id || '');
    setProjectMapOpen(true);
  }

  function openEdit(r: Parcela) {
    setEditing(r);
    setForm({
      empresa_id: r.empresa_id,
      proveedor_id: r.proveedor_id || '',
      codigo: r.codigo || '',
      nombre: r.nombre,
      hectareas: r.hectareas,
      ubicacion: r.ubicacion || '',
      geojson: r.geojson || null,
      activo: r.activo,
      tipo_finca: r.tipo_finca || 'propia',
      area_ha_perimetro: r.area_ha_perimetro,
      area_ha_sembrada: r.area_ha_sembrada,
    });
    setGeojsonText(safeStringifyGeojson(r.geojson));
    setGeojsonError('');
    setMapEditing(false); // edición existente: modo lectura por defecto
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const parsedGeojson = parseGeojsonInput(geojsonText);
    if (parsedGeojson.error) {
      setGeojsonError(parsedGeojson.error);
      setSaving(false);
      return;
    }

    const payload = {
      ...form,
      empresa_id: empresaId,
      proveedor_id: form.proveedor_id || null,
      hectareas: form.hectareas || null,
      geojson: parsedGeojson.value,
      tipo_finca: form.tipo_finca || 'propia',
      area_ha_perimetro: form.area_ha_perimetro ?? null,
      area_ha_sembrada: form.area_ha_sembrada ?? null,
    };

    const { error: saveError } = editing
      ? await supabase.from('emp_parcelas').update(payload).eq('id', editing.id)
      : await supabase.from('emp_parcelas').insert(payload);

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowModal(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from('emp_parcelas').delete().eq('id', deleteTarget.id);
    if (deleteError) setError(deleteError.message);
    setDeleting(false);
    setDeleteTarget(null);
    load();
  }

  async function handleSaveMapGeometry() {
    if (!mapTarget) return;
    setMapSaving(true);
    const { error: saveError } = await supabase
      .from('emp_parcelas')
      .update({ geojson: mapDraftGeojson || null })
      .eq('id', mapTarget.id);
    if (saveError) {
      setError(saveError.message);
      setMapSaving(false);
      return;
    }
    const nextMapTarget = { ...mapTarget, geojson: mapDraftGeojson || null };
    setRows((prev) => prev.map((row) => (row.id === mapTarget.id ? nextMapTarget : row)));
    setMapTarget(nextMapTarget);
    setMapSaving(false);
  }

  async function handleSaveBloque(geojson: any) {
    if (!bloqueDraftTipo || !mapTarget) return;
    setBloqueSaving(true);
    setBloqueSaveMsg('');
    const areaHa = calcAreaHaFromGeojsonPolygon(geojson);
    const existingNums = bloques.filter(b => b.tipo === bloqueDraftTipo).map(b => b.num);
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    const payload = {
      empresa_id: empresaId,
      parcela_id: mapTarget.id,
      tipo: bloqueDraftTipo,
      num: nextNum,
      geojson: { type: 'Feature', geometry: geojson, properties: { tipo: bloqueDraftTipo, num: nextNum } },
      area_ha: Number(areaHa.toFixed(4)),
      activo: true,
    };
    const { data, error: insErr } = await supabase.from('emp_bloques').insert(payload).select().single();
    if (insErr) {
      setBloqueSaveMsg(`Error: ${insErr.message}`);
      setBloqueSaving(false);
      return;
    }
    const newBloque = data as EmpBloque;
    setBloques(prev => [...prev, newBloque]);
    setBloquesCountMap(prev => {
      const m = new Map(prev);
      m.set(mapTarget.id, (m.get(mapTarget.id) || 0) + 1);
      return m;
    });
    const label = `${BLOQUE_LABELS[bloqueDraftTipo]} ${nextNum} guardado (${areaHa < 1 ? `${(areaHa * 10000).toFixed(0)} m²` : `${areaHa.toFixed(2)} ha`})`;
    setBloqueSaveMsg(label);
    setBloqueDrawKey(k => k + 1); // remonta GeoMapPreview para nuevo dibujo
    setBloqueSaving(false);
    setTimeout(() => setBloqueSaveMsg(''), 4000);
  }

  const totalHa = rows.reduce((sum, row) => sum + (getParcelaHectareas(row) || 0), 0);
  const geojsonPreview = parseGeojsonInput(geojsonText).value || form.geojson;
  const estimatedHa = estimateGeojsonAreaHectares(geojsonPreview);
  const mapEstimatedHa = estimateGeojsonAreaHectares(mapDraftGeojson || mapTarget?.geojson);
  const parcelaColorMap = useMemo(() => {
    const sortedRows = [...rows].sort((a, b) => {
      const left = `${a.codigo || ''} ${a.nombre || ''} ${a.id}`.trim();
      const right = `${b.codigo || ''} ${b.nombre || ''} ${b.id}`.trim();
      return left.localeCompare(right);
    });
    const map = new Map<string, string>();
    sortedRows.forEach((row, index) => {
      map.set(row.id, getDistinctParcelaColor(index));
    });
    return map;
  }, [rows]);
  const getParcelaColor = useCallback(
    (parcela?: Partial<Pick<Parcela, 'id' | 'codigo' | 'nombre'>> | null) => {
      if (!parcela) return getFallbackParcelaColor(parcela);
      const id = 'id' in parcela ? parcela.id : undefined;
      if (id && parcelaColorMap.has(id)) return parcelaColorMap.get(id)!;
      return getFallbackParcelaColor(parcela);
    },
    [parcelaColorMap]
  );
  const projectSelectedParcela =
    filtered.find((row) => row.id === projectMapSelectedId) ||
    rows.find((row) => row.id === projectMapSelectedId) ||
    null;

  useEffect(() => {
    if (!projectMapOpen) return;
    if (projectMapSelectedId && rows.some((row) => row.id === projectMapSelectedId)) return;
    setProjectMapSelectedId(filtered[0]?.id || rows[0]?.id || '');
  }, [projectMapOpen, projectMapSelectedId, filtered, rows]);

  if (mapTarget) {
    return (
      <>
      <div className="w-full p-6 space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <button
              onClick={() => setMapTarget(null)}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-surface-overlay px-3 py-2 text-sm text-gray-300 hover:bg-slate-800/60"
            >
              <ArrowLeft size={15} />
              Volver
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-ink break-words">Mapa de Parcela</h1>
              <p className="mt-1 text-sm text-gray-400">Vista completa del lote georreferenciado.</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface-raised p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500 mb-2">Parcela</p>
          <h2 className="text-2xl font-semibold text-ink">{mapTarget.nombre}</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-gray-500">Codigo</p>
              <p className="mt-1 font-mono text-blue-400">{mapTarget.codigo || '-'}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-gray-500">Hectareas</p>
              <p className="mt-1 font-semibold text-green-400">
                {mapEstimatedHa
                  ? `${mapEstimatedHa.toFixed(2)} ha aprox.`
                  : getParcelaHectareas(mapTarget)
                    ? `${getParcelaHectareas(mapTarget)?.toFixed(2)} ha`
                    : '-'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3 md:col-span-2">
              <p className="text-xs text-gray-500">Proveedor / Finca</p>
              <p className="mt-1 text-ink">{mapTarget.proveedor?.nombre || '-'}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-gray-500">Color del lote</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="inline-block h-4 w-4 rounded-full border border-white/20" style={{ background: getParcelaColor(mapTarget) }} />
                <p className="font-mono text-sm text-gray-300">{getParcelaColor(mapTarget)}</p>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3 md:col-span-2 xl:col-span-2">
              <p className="text-xs text-gray-500">Ubicacion</p>
              <p className="mt-1 text-gray-300">{mapTarget.ubicacion || 'Sin descripcion geografica'}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3 md:col-span-2 xl:col-span-2">
              <p className="text-xs text-gray-500">Geometria</p>
              <p className="mt-1 text-gray-300">{getGeojsonSummary(mapDraftGeojson || mapTarget.geojson)}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-gray-500">Uso sugerido</p>
              <p className="mt-1 text-sm text-gray-300 leading-6">
                Validar lote, corregir poligono y cruzarlo con GPS de Recibo Fruta.
              </p>
            </div>
          </div>
          {!mapEstimatedHa && !getParcelaHectareas(mapTarget) && (
            <p className="mt-4 text-xs text-amber-300">
              Para recuperar hectareas estimadas, la geometria debe ser Polygon o MultiPolygon.
            </p>
          )}
        </div>

        {/* ── Panel de Bloques y Zonas ── */}
        <div className="rounded-2xl border border-line bg-surface-raised p-5">
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Bloques y Zonas</p>
              <p className="mt-1 text-sm text-gray-400">
                {bloquesLoading ? 'Cargando…' : bloques.length === 0
                  ? 'Sin bloques registrados — dibuje en DronMosaico y guarde.'
                  : `${bloques.length} zona${bloques.length !== 1 ? 's' : ''} registrada${bloques.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            {bloques.length > 0 && (() => {
              const COLORS: Record<string, string> = { siembra: '#4ade80', camino: '#fb923c', proteccion: '#60a5fa', otro: '#e879f9' };
              const LABELS: Record<string, string> = { siembra: 'Siembra', camino: 'Camino', proteccion: 'Protección', otro: 'Otro' };
              const totalArea = bloques.reduce((s, b) => s + (b.area_ha || 0), 0);
              const totalPlantas = bloques.reduce((s, b) => s + (b.plant_count || 0), 0);
              return (
                <div className="flex flex-wrap gap-2">
                  {(['siembra', 'camino', 'proteccion', 'otro'] as const).map(tipo => {
                    const grupo = bloques.filter(b => b.tipo === tipo);
                    if (!grupo.length) return null;
                    const area = grupo.reduce((s, b) => s + (b.area_ha || 0), 0);
                    return (
                      <div key={tipo} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: `${COLORS[tipo]}44`, background: `${COLORS[tipo]}11` }}>
                        <span style={{ color: COLORS[tipo], fontWeight: 700 }}>{grupo.length} {LABELS[tipo]}</span>
                        <span className="ml-2 text-gray-400">{area < 1 ? `${(area * 10000).toFixed(0)} m²` : `${area.toFixed(2)} ha`}</span>
                      </div>
                    );
                  })}
                  {totalArea > 0 && (
                    <div className="rounded-lg border border-line px-3 py-1.5 text-xs text-gray-300">
                      Total: <strong>{totalArea < 1 ? `${(totalArea * 10000).toFixed(0)} m²` : `${totalArea.toFixed(2)} ha`}</strong>
                      {totalPlantas > 0 && <span className="ml-2 text-green-400">🌱 {totalPlantas.toLocaleString('es-CR')}</span>}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          {bloques.length > 0 && (() => {
            const COLORS: Record<string, string> = { siembra: '#4ade80', camino: '#fb923c', proteccion: '#60a5fa', otro: '#e879f9' };
            const LABELS: Record<string, string> = { siembra: 'Bloque', camino: 'Camino', proteccion: 'Protección', otro: 'Otro' };
            return (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {bloques.map(b => {
                  const isFocused = focusedBloqueId === b.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => {
                        if (!b.geojson) return;
                        setFocusedBloqueId(b.id);
                        setFocusFlashKey(k => k + 1);
                      }}
                      title={b.geojson ? 'Clic para enfocar en el mapa' : undefined}
                      className="rounded-xl border p-3 transition-all"
                      style={{
                        borderColor: isFocused ? COLORS[b.tipo] : `${COLORS[b.tipo]}44`,
                        background: isFocused ? `${COLORS[b.tipo]}22` : `${COLORS[b.tipo]}09`,
                        cursor: b.geojson ? 'pointer' : 'default',
                        boxShadow: isFocused ? `0 0 0 2px ${COLORS[b.tipo]}66` : undefined,
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[b.tipo], display: 'inline-block', flexShrink: 0 }} />
                        <span className="text-xs font-bold" style={{ color: COLORS[b.tipo] }}>{LABELS[b.tipo]} {b.num}</span>
                      </div>
                      <p className="text-xs text-gray-300 mt-1">
                        {b.area_ha ? (b.area_ha < 1 ? `${(b.area_ha * 10000).toFixed(0)} m²` : `${b.area_ha.toFixed(4)} ha`) : '—'}
                      </p>
                      {b.tipo === 'siembra' && (b.plant_count || 0) > 0 && (
                        <p className="text-xs mt-1" style={{ color: COLORS.siembra }}>🌱 {(b.plant_count || 0).toLocaleString('es-CR')}</p>
                      )}
                      {b.notas && <p className="text-xs text-gray-500 mt-1 truncate">{b.notas}</p>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── Panel mapa (vista compacta) ── */}
        <div className="rounded-2xl border border-line bg-surface-raised p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={() => openEdit(mapTarget)} className={btnSecondary + ' inline-flex items-center gap-2'}>
                <Pencil size={14} /> Editar datos
              </button>
              <button
                type="button"
                onClick={() => { setMapFullScreen(true); setBloqueDraftTipo(null); setMapViewEditing(false); }}
                className={btnSecondary + ' inline-flex items-center gap-2'}
              >
                <Maximize2 size={14} /> Editar mapa
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {(['siembra', 'camino', 'proteccion', 'otro'] as TipoBloque[]).map(tipo => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => { setMapFullScreen(true); setBloqueDraftTipo(tipo); setMapViewEditing(false); setBloqueDrawKey(k => k + 1); setBloqueSaveMsg(''); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:opacity-80"
                  style={{ borderColor: `${BLOQUE_COLORS[tipo]}66`, background: `${BLOQUE_COLORS[tipo]}11`, color: BLOQUE_COLORS[tipo] }}
                >
                  <Layers size={11} /> {BLOQUE_LABELS[tipo]}
                </button>
              ))}
            </div>
          </div>

          {/* Una sola instancia Leaflet a la vez: panel o portal, nunca ambos */}
          {mapFullScreen ? (
            <div
              className="flex items-center justify-center rounded-xl border border-dashed"
              style={{ height: 340, borderColor: 'var(--line)', color: 'var(--ink-faint)', background: 'var(--surface-overlay)' }}
            >
              <div className="text-center">
                <Maximize2 size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Mapa abierto en pantalla completa</p>
              </div>
            </div>
          ) : (
            <GeoMapPreview
              geojson={mapTarget.geojson}
              height={340}
              maxWidthClassName="max-w-full"
              polygonColor={getParcelaColor(mapTarget)}
              overlays={bloques.filter(b => b.geojson).map((b): OverlayLayer => ({
                geojson: b.geojson,
                color: BLOQUE_COLORS[b.tipo] || '#4ade80',
                flashing: focusedBloqueId === b.id,
              }))}
              flashKey={focusFlashKey}
            />
          )}
        </div>

      </div>

      {/* ════ Portal Full-Screen editor de mapa ════ */}
      {mapFullScreen && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col" style={{ background: '#080f1c' }}>

          {/* ── Header ── */}
          <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5 flex-wrap" style={{ borderColor: '#1e3a5f', background: '#0d1829' }}>
            <button
              type="button"
              onClick={() => { setMapFullScreen(false); setMapViewEditing(false); setBloqueDraftTipo(null); setBloqueSaveMsg(''); }}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
            >
              <ArrowLeft size={13} /> Cerrar
            </button>
            <span style={{ color: '#1e3a5f' }}>|</span>
            <span className="text-sm font-semibold text-gray-200 truncate">{mapTarget.nombre}</span>
            {mapTarget.codigo && <span className="text-xs font-mono text-blue-400">{mapTarget.codigo}</span>}

            <div className="flex items-center gap-2 ml-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setMapViewEditing(v => !v); setBloqueDraftTipo(null); setBloqueDrawKey(k => k + 1); }}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all"
                style={{
                  borderColor: mapViewEditing ? '#f59e0b' : '#334155',
                  background: mapViewEditing ? '#78350f33' : 'transparent',
                  color: mapViewEditing ? '#fbbf24' : '#94a3b8',
                }}
              >
                <Pencil size={11} />
                {mapViewEditing ? 'Cancelar polígono' : (mapTarget.geojson ? 'Redibujar polígono' : 'Dibujar polígono')}
              </button>

              {mapViewEditing && (
                <button
                  onClick={async () => { await handleSaveMapGeometry(); }}
                  disabled={mapSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                >
                  {mapSaving ? 'Guardando…' : 'Guardar polígono'}
                </button>
              )}

              <span style={{ color: '#1e3a5f' }}>|</span>

              {(['siembra', 'camino', 'proteccion', 'otro'] as TipoBloque[]).map(tipo => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => {
                    setBloqueDraftTipo(prev => prev === tipo ? null : tipo);
                    setMapViewEditing(false);
                    setBloqueDrawKey(k => k + 1);
                    setBloqueSaveMsg('');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all"
                  style={{
                    borderColor: bloqueDraftTipo === tipo ? BLOQUE_COLORS[tipo] : `${BLOQUE_COLORS[tipo]}55`,
                    background: bloqueDraftTipo === tipo ? `${BLOQUE_COLORS[tipo]}25` : 'transparent',
                    color: BLOQUE_COLORS[tipo],
                  }}
                >
                  <Layers size={10} /> {BLOQUE_LABELS[tipo]}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-3">
              {bloqueDraftTipo && !bloqueSaving && !bloqueSaveMsg && (
                <span className="text-xs text-gray-500">Clic = vértice · doble clic = cerrar</span>
              )}
              {bloqueSaving && <span className="text-xs text-gray-400">Guardando…</span>}
              {bloqueSaveMsg && <span className="text-xs font-semibold text-green-400">{bloqueSaveMsg}</span>}
            </div>
          </div>

          {/* ── Mapa full-screen ── */}
          <div className="flex-1 min-h-0 p-1">
            <GeoMapPreview
              geojson={mapViewEditing ? (mapDraftGeojson || mapTarget.geojson) : mapTarget.geojson}
              height="100%"
              maxWidthClassName="max-w-full"
              polygonColor={bloqueDraftTipo ? BLOQUE_COLORS[bloqueDraftTipo] : getParcelaColor(mapTarget)}
              editable={mapViewEditing || bloqueDraftTipo !== null}
              onDrawCommit={(nextGeojson) => {
                if (bloqueDraftTipo) {
                  if (nextGeojson) handleSaveBloque(nextGeojson);
                } else {
                  setMapDraftGeojson(nextGeojson);
                  setMapViewEditing(false);
                }
              }}
              overlays={bloques.filter(b => b.geojson).map((b): OverlayLayer => ({
                geojson: b.geojson,
                color: BLOQUE_COLORS[b.tipo] || '#4ade80',
                flashing: focusedBloqueId === b.id,
              }))}
              flashKey={focusFlashKey}
              drawResetKey={bloqueDrawKey}
            />
          </div>
        </div>,
        document.body
      )}
      </>
    );
  }

  if (projectMapOpen) {
    return (
      <div className="w-full p-6 space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <button
              onClick={() => setProjectMapOpen(false)}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-surface-overlay px-3 py-2 text-sm text-gray-300 hover:bg-slate-800/60"
            >
              <ArrowLeft size={15} />
              Volver
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-ink break-words">Panoramica del Proyecto</h1>
              <p className="mt-1 text-sm text-gray-400">
                Vista general del proyecto con acercamiento rapido por parcela.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface-raised p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-gray-500">Parcelas visibles</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{filtered.length}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-gray-500">Hectareas visibles</p>
              <p className="mt-1 text-2xl font-semibold text-green-400">
                {filtered.reduce((sum, row) => sum + (getParcelaHectareas(row) || 0), 0).toFixed(2)} ha
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3 md:col-span-2">
              <p className="text-xs text-gray-500">Parcela enfocada</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {projectSelectedParcela?.nombre || 'Seleccione una parcela'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-gray-500">Accion</p>
              <p className="mt-1 text-sm text-gray-300">Click en lista o mapa para acercar el lote.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-line bg-surface-raised p-4">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Lista de Parcelas</p>
              <p className="mt-1 text-sm text-gray-400">Seleccione una para enfocar o abrir su detalle.</p>
            </div>

            <div className="space-y-3 max-h-[760px] overflow-y-auto pr-1">
              {filtered.map((row) => {
                const isSelected = row.id === projectMapSelectedId;
                const color = getParcelaColor(row);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setProjectMapSelectedId(row.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${isSelected ? 'bg-surface-overlay' : 'bg-surface hover:bg-surface-overlay'}`}
                    style={{ borderColor: isSelected ? color : 'var(--line)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink break-words">{row.nombre}</p>
                        <p className="mt-1 font-mono text-xs text-blue-400">{row.codigo || 'Sin codigo'}</p>
                      </div>
                      <span
                        className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
                        style={{ background: color }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-300 line-clamp-2">{row.proveedor?.nombre || 'Sin proveedor'}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      <span>{getParcelaHectareas(row) ? `${getParcelaHectareas(row)?.toFixed(2)} ha` : 'Sin ha'}</span>
                      <span>·</span>
                      <span>{(() => { const n = bloquesCountMap.get(row.id) || 0; return n > 0 ? `${n} bloque${n !== 1 ? 's' : ''}` : 'Sin bloques'; })()}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className="inline-flex items-center rounded-md border px-2 py-1 text-xs"
                        style={{ borderColor: isSelected ? color : 'var(--line)', color: isSelected ? color : 'var(--ink-muted)' }}
                      >
                        {isSelected ? 'Enfocada' : 'Enfocar'}
                      </span>
                      <span
                        onClick={(event) => {
                          event.stopPropagation();
                          setProjectMapOpen(false);
                          openMap(row);
                        }}
                        className="inline-flex items-center rounded-md border border-line px-2 py-1 text-xs text-gray-300"
                      >
                        Abrir detalle
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface-raised p-4">
            <ParcelProjectMap
              parcelas={filtered}
              selectedId={projectMapSelectedId}
              onSelect={setProjectMapSelectedId}
              height={760}
              getParcelColor={getParcelaColor}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Parcelas de Finca</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-muted)' }}>{rows.length} parcelas · {totalHa.toFixed(2)} ha totales</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={openProjectMap} className={btnSecondary + ' flex items-center gap-2'}>
            <Expand size={15} /> Ver mapa del proyecto
          </button>
          <button onClick={openNew} className={btnPrimary + ' flex items-center gap-2'}>
            <Plus size={15} /> Nueva Parcela
          </button>
        </div>
      </div>

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
        <input
          type="text"
          placeholder="Buscar parcela..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls + ' pl-9'}
        />
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 rounded-lg text-sm">{error}</div>}

      <div className={`rv-desktop-table ${tableWrapCls}`}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className={thCls}>Codigo</th>
              <th className={thCls}>Nombre</th>
              <th className={thCls}>Ubicacion</th>
              <th className={thCls + ' text-right'}>Hectareas</th>
              <th className={thCls + ' text-center'}>Bloques</th>
              <th className={thCls + ' text-right'}>Área Siembra</th>
              <th className={thCls + ' text-right'}>% Siembra</th>
              <th className={thCls + ' text-center'}>Activo</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-500">Cargando...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-600">Sin registros</td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className={trCls}>
                  <td className={tdCls + ' font-mono'} style={{ color: 'var(--emp-accent, #60a5fa)' }}>{r.codigo || '-'}</td>
                  <td className={tdCls + ' font-medium text-ink'}>{r.nombre}</td>
                  <td className={tdCls + ' max-w-xs truncate'} style={{ color: 'var(--ink-muted)' }}>{r.ubicacion || '-'}</td>
                  <td className={tdCls + ' text-right'} style={{ color: 'var(--emp-accent, #4ade80)' }}>{getParcelaHectareas(r) ? `${getParcelaHectareas(r)?.toFixed(2)} ha` : '-'}</td>
                  <td className={tdCls + ' text-center'}>
                    {(() => {
                      const n = bloquesCountMap.get(r.id) || 0;
                      return n > 0
                        ? <span className="font-semibold" style={{ color: 'var(--emp-accent, #4ade80)' }}>{n}</span>
                        : <span style={{ color: 'var(--ink-faint)' }}>—</span>;
                    })()}
                  </td>
                  <td className={tdCls + ' text-right'}>
                    {r.area_ha_sembrada
                      ? <span style={{ color: 'var(--emp-accent, #4ade80)', fontSize: 11 }}>{r.area_ha_sembrada < 1 ? `${(r.area_ha_sembrada * 10000).toFixed(0)} m²` : `${r.area_ha_sembrada.toFixed(2)} ha`}</span>
                      : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                  </td>
                  <td className={tdCls + ' text-right'}>
                    {(() => {
                      const total = getParcelaHectareas(r);
                      const siembra = r.area_ha_sembrada;
                      if (!total || !siembra || total === 0) return <span style={{ color: 'var(--ink-faint)' }}>—</span>;
                      const pct = (siembra / total) * 100;
                      const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#ca8a04' : '#ea580c';
                      return <span style={{ color, fontSize: 11, fontWeight: 600 }}>{pct.toFixed(0)}%</span>;
                    })()}
                  </td>
                  <td className={tdCls + ' text-center'}>
                    {r.activo
                      ? <Check size={14} className="mx-auto" style={{ color: 'var(--emp-accent, #16a34a)' }} />
                      : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                  </td>
                  <td className={tdCls}>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openMap(r)} style={{ color: 'var(--emp-accent)' }} className="px-2 py-1 rounded transition-colors hover:opacity-70">
                        <Expand size={13} />
                      </button>
                      <button onClick={() => openEdit(r)} className="px-2 py-1 rounded transition-colors hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget(r)} className="px-2 py-1 rounded transition-colors hover:opacity-70" style={{ color: '#ef4444' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rv-mobile-cards space-y-3">
        {filtered.map((r) => (
          <div key={r.id} className="bg-surface-raised border border-line rounded-xl p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="font-semibold text-ink">{r.nombre}</p>
                {r.proveedor && <p className="text-xs text-gray-400 mt-0.5">{r.proveedor.nombre}</p>}
                <div className="flex items-center gap-3 mt-1">
                  {getParcelaHectareas(r) && <span className="text-xs text-green-400 font-medium">{getParcelaHectareas(r)?.toFixed(2)} ha</span>}
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: getParcelaColor(r) }} />
                  {r.ubicacion && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPin size={10} />
                      {r.ubicacion}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {(() => {
                    const n = bloquesCountMap.get(r.id) || 0;
                    return n > 0 ? `${n} bloque${n !== 1 ? 's' : ''}` : 'Sin bloques';
                  })()}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge activo={r.activo} />
                <div className="flex gap-2">
                  <button onClick={() => openMap(r)} className="text-emerald-400 hover:text-emerald-300 p-1.5 rounded hover:bg-emerald-900/30">
                    <Expand size={14} />
                  </button>
                  <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 p-1.5 rounded hover:bg-blue-900/30">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 p-1.5 rounded hover:bg-red-900/30">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col" style={{ backgroundColor: '#080f1c' }}>

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b px-5 py-3"
            style={{ borderColor: 'var(--emp-border)', background: 'linear-gradient(180deg,#0d1829 0%,#101b2e 100%)' }}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition"
                style={{ color: 'var(--ink-muted)' }}
              >
                <ArrowLeft size={14} />
                Volver
              </button>
              <span style={{ color: 'var(--emp-border)' }}>|</span>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {editing ? 'Editar Parcela' : 'Nueva Parcela'}
              </h2>
              {form.codigo && (
                <span className="rounded px-2 py-0.5 font-mono text-xs" style={{ backgroundColor: 'var(--emp-accent-bg)', color: 'var(--emp-accent-txt)' }}>
                  {form.codigo}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {error && <p className={errorCls + ' text-xs'}>{error}</p>}
              <button type="button" onClick={() => setShowModal(false)} className={btnSecondary + ' py-1.5 text-xs'}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={(e) => { e.preventDefault(); handleSave(e as any); }}
                className={btnPrimary + ' py-1.5 text-xs'}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Body: dos columnas */}
          <form onSubmit={handleSave} className="flex flex-1 min-h-0 overflow-hidden">

            {/* ── Columna izquierda: campos ── */}
            <div className="flex w-full flex-col gap-4 overflow-y-auto border-r p-5 md:w-[400px] lg:w-[440px] shrink-0 min-h-0"
              style={{ borderColor: 'var(--emp-border)' }}>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Codigo</label>
                  <input
                    type="text"
                    value={form.codigo || ''}
                    onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                    placeholder="Ej: TIALEZ-63-A"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Nombre *</label>
                  <input
                    type="text"
                    required
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Proveedor / Finca</label>
                  <select
                    value={form.proveedor_id || ''}
                    onChange={(e) => setForm((f) => ({ ...f, proveedor_id: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">- Sin asignar -</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({p.tipo === 'propio' ? 'Propia' : 'Tercero'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tipo de finca</label>
                  <select
                    value={form.tipo_finca || 'propia'}
                    onChange={(e) => setForm((f) => ({ ...f, tipo_finca: e.target.value as 'propia' | 'alquilada' }))}
                    className={inputCls}
                  >
                    <option value="propia">Propia</option>
                    <option value="alquilada">Alquilada</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Hectareas</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.hectareas || ''}
                  onChange={(e) => setForm((f) => ({ ...f, hectareas: parseFloat(e.target.value) || undefined }))}
                  className={inputCls}
                />
                {estimatedHa !== null ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-green-400">Estimadas desde geometria: {estimatedHa.toFixed(2)} ha</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, hectareas: Number(estimatedHa.toFixed(2)) }))}
                      className="inline-flex items-center justify-center rounded-md border border-emerald-700 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-900/30"
                    >
                      Usar {estimatedHa.toFixed(2)} ha
                    </button>
                  </div>
                ) : geojsonPreview ? (
                  <p className="mt-1 text-xs text-amber-300">
                    La geometria no permite calcular hectareas. Debe ser Polygon o MultiPolygon.
                  </p>
                ) : null}
              </div>

              <div>
                <label className={labelCls}>Ubicacion</label>
                <textarea
                  value={form.ubicacion || ''}
                  onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))}
                  rows={2}
                  placeholder="Descripcion geografica"
                  className={inputCls + ' resize-none'}
                />
              </div>

              {/* Geometria */}
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--emp-border)', backgroundColor: 'var(--emp-bg-panel)' }}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Geometria GeoJSON</p>
                    <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{getGeojsonSummary(geojsonPreview)}</p>
                  </div>
                  <label
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:border-emp-accent hover:text-emp-accent"
                    style={{ borderColor: 'var(--emp-border)', color: 'var(--ink-muted)' }}
                    title="Importar archivo GeoJSON o KML del dron"
                  >
                    <Upload size={13} />
                    Importar
                    <input
                      type="file"
                      accept=".geojson,.json,.kml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const text = ev.target?.result as string;
                          try {
                            let geo: any;
                            if (file.name.endsWith('.kml')) {
                              const parser = new DOMParser();
                              const kml = parser.parseFromString(text, 'text/xml');
                              const coordNodes = kml.querySelectorAll('coordinates');
                              const rings: number[][][] = [];
                              coordNodes.forEach((node) => {
                                const raw = node.textContent?.trim() || '';
                                const ring = raw.split(/\s+/).map((pt) => {
                                  const [lon, lat] = pt.split(',').map(Number);
                                  return [lon, lat];
                                }).filter((p) => p.length === 2 && !isNaN(p[0]));
                                if (ring.length >= 3) {
                                  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
                                  rings.push(ring);
                                }
                              });
                              geo = rings.length === 1
                                ? { type: 'Polygon', coordinates: [rings[0]] }
                                : { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) };
                            } else {
                              geo = JSON.parse(text);
                            }

                            setGeojsonText(JSON.stringify(geo, null, 2));
                            setGeojsonError('');

                            // Auto-rellenar nombre y hectáreas desde las propiedades del GeoJSON
                            const props = geo?.properties
                              ?? geo?.features?.[0]?.properties
                              ?? {};
                            if (props.nombre && !form.nombre) {
                              setForm((f) => ({ ...f, nombre: props.nombre }));
                            }
                            if (props.hectareas_calculadas && !form.hectareas) {
                              setForm((f) => ({ ...f, hectareas: Number(Number(props.hectareas_calculadas).toFixed(2)) }));
                            }
                          } catch {
                            setGeojsonError('Archivo sin formato GeoJSON o KML valido.');
                          }
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <textarea
                  value={geojsonText}
                  onChange={(e) => { setGeojsonText(e.target.value); setGeojsonError(''); }}
                  rows={6}
                  placeholder='{"type":"Polygon","coordinates":[...]}'
                  className={inputCls + ' font-mono text-xs leading-5'}
                />
                {geojsonError && <p className={errorCls + ' mt-1.5'}>{geojsonError}</p>}
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                  className="h-4 w-4 accent-green-500"
                />
                <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>Activo</span>
              </label>

              {/* Zona de peligro — solo visible al editar */}
              {editing && (
                <div className="rounded-lg border border-red-900/50 p-3" style={{ background: 'rgba(127,29,29,0.12)' }}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#f87171' }}>
                    Zona de peligro
                  </p>
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setDeleteTarget(editing); }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-800 px-3 py-2 text-xs font-medium transition hover:bg-red-900/40"
                    style={{ color: '#f87171' }}
                  >
                    <Trash2 size={13} />
                    Eliminar parcela "{editing.nombre}"
                  </button>
                </div>
              )}
            </div>

            {/* ── Columna derecha: mapa ── */}
            <div className="relative flex-1 overflow-hidden">
              <GeoMapPreview
                geojson={geojsonPreview}
                height="100%"
                maxWidthClassName="max-w-full h-full"
                polygonColor={getParcelaColor(editing || form)}
                editable={mapEditing}
                onDrawCommit={(nextGeojson) => {
                  const text = nextGeojson ? JSON.stringify(nextGeojson, null, 2) : '';
                  setGeojsonText(text);
                  setGeojsonError('');
                  setMapEditing(false); // vuelve a modo lectura al confirmar
                }}
              />

              {/* Botón flotante Editar / Cancelar edición */}
              {!mapEditing ? (
                <button
                  type="button"
                  onClick={() => setMapEditing(true)}
                  className="absolute bottom-4 right-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold backdrop-blur-sm transition"
                  style={{
                    borderColor: 'var(--emp-accent)',
                    background: 'rgba(6,40,32,0.85)',
                    color: 'var(--emp-accent-txt)',
                  }}
                >
                  <Pencil size={12} />
                  {geojsonPreview ? 'Redibujar polígono' : 'Dibujar polígono'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMapEditing(false)}
                  className="absolute bottom-4 right-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold backdrop-blur-sm transition"
                  style={{
                    borderColor: 'var(--line)',
                    background: 'rgba(8,15,28,0.85)',
                    color: 'var(--ink-muted)',
                  }}
                >
                  <X size={12} />
                  Cancelar edición
                </button>
              )}

              {/* Overlay hectáreas estimadas */}
              {estimatedHa !== null && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-xl border px-4 py-2 text-xs backdrop-blur-sm"
                  style={{ borderColor: '#065f46', backgroundColor: 'rgba(6,40,32,0.85)', color: '#6ee7b7' }}>
                  Área estimada: <strong>{estimatedHa.toFixed(2)} ha</strong>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, hectareas: Number(estimatedHa.toFixed(2)) }))}
                    className="underline underline-offset-2 hover:no-underline"
                  >
                    Usar este valor
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>,
        document.body
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Eliminar la parcela "${deleteTarget.nombre}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
