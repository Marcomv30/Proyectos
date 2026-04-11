import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, Search, MapPin, Expand, ArrowLeft } from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import { Parcela } from '../../types/empacadora';
import GeoMapPreview from '../../components/GeoMapPreview';
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
  const [deleting, setDeleting] = useState(false);
  const [mapTarget, setMapTarget] = useState<Parcela | null>(null);
  const [mapDraftGeojson, setMapDraftGeojson] = useState<any>(null);
  const [mapSaving, setMapSaving] = useState(false);
  const [mapWide, setMapWide] = useState(false);
  const [projectMapOpen, setProjectMapOpen] = useState(false);
  const [projectMapSelectedId, setProjectMapSelectedId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [parcRes, provRes] = await Promise.all([
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
    ]);
    if (parcRes.error) setError(parcRes.error.message);
    else setRows(parcRes.data || []);
    if (!provRes.error) setProveedores(provRes.data || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => {
    load();
  }, [load]);

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
    setShowModal(true);
  }

  function openMap(r: Parcela) {
    setMapTarget(r);
    setMapDraftGeojson(r.geojson || null);
    setMapWide(false);
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
    });
    setGeojsonText(safeStringifyGeojson(r.geojson));
    setGeojsonError('');
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

        <div className="rounded-2xl border border-line bg-surface-raised p-4">
          <div className="mb-4 flex w-full justify-end">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              <button onClick={() => openEdit(mapTarget)} className={btnSecondary + ' inline-flex items-center justify-center gap-2'}>
                <Pencil size={15} />
                Editar datos
              </button>
              <button onClick={handleSaveMapGeometry} disabled={mapSaving} className={btnPrimary + ' inline-flex items-center justify-center gap-2'}>
                {mapSaving ? 'Guardando...' : 'Guardar poligono'}
              </button>
              <button
                type="button"
                onClick={() => setMapWide((value) => !value)}
                className={btnSecondary + ' inline-flex items-center justify-center gap-2'}
              >
                {mapWide ? 'Contraer mapa' : 'Expandir mapa'}
              </button>
            </div>
          </div>

          <GeoMapPreview
            geojson={mapDraftGeojson || mapTarget.geojson}
            height={mapWide ? 760 : 560}
            maxWidthClassName="max-w-full"
            polygonColor={getParcelaColor(mapTarget)}
            editable
            onDrawCommit={(nextGeojson) => setMapDraftGeojson(nextGeojson)}
            onRequestExpand={() => setMapWide((value) => !value)}
          />
        </div>
      </div>
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
                      <span>{getGeojsonSummary(row.geojson)}</span>
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
          <p className="text-gray-400 text-sm mt-1">{rows.length} parcelas · {totalHa.toFixed(2)} ha totales</p>
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
              <th className={thCls}>Proveedor / Finca</th>
              <th className={thCls + ' text-right'}>Hectareas</th>
              <th className={thCls}>Ubicacion</th>
              <th className={thCls}>Geometria</th>
              <th className={thCls + ' text-center'}>Estado</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">Cargando...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-600">Sin registros</td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className={trCls}>
                  <td className={tdCls + ' font-mono text-blue-400'}>{r.codigo || '-'}</td>
                  <td className={tdCls + ' font-medium text-ink'}>{r.nombre}</td>
                  <td className={tdCls + ' text-gray-300'}>{r.proveedor?.nombre || '-'}</td>
                  <td className={tdCls + ' text-right text-green-400'}>{getParcelaHectareas(r) ? `${getParcelaHectareas(r)?.toFixed(2)} ha` : '-'}</td>
                  <td className={tdCls + ' text-gray-400 max-w-xs truncate'}>{r.ubicacion || '-'}</td>
                  <td className={tdCls + ' text-gray-300'}>{getGeojsonSummary(r.geojson)}</td>
                  <td className={tdCls + ' text-center'}><Badge activo={r.activo} /></td>
                  <td className={tdCls}>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openMap(r)} className="text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-900/30 transition-colors">
                        <Expand size={13} />
                      </button>
                      <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-900/30 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget(r)} className="text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/30 transition-colors">
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
                <p className="text-xs text-gray-500 mt-2">{getGeojsonSummary(r.geojson)}</p>
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

      {showModal && (
        <Modal title={editing ? 'Editar Parcela' : 'Nueva Parcela'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Codigo</label>
                <input
                  type="text"
                  value={form.codigo || ''}
                  onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                  placeholder="Ej: PARC-A1"
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
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
                  <p className="mt-2 text-xs text-amber-300">
                    La geometria actual no permite calcular hectareas. Debe ser Polygon o MultiPolygon.
                  </p>
                ) : null}
              </div>
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

            <div className="rounded-xl border border-line bg-surface px-4 py-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">Geometria del lote</p>
                  <p className="text-xs text-gray-400">
                    Pegue un GeoJSON valido del lote o parcela. En la siguiente fase lo usaremos en recibo fruta.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{getGeojsonSummary(geojsonPreview)}</p>
                  {estimatedHa !== null && <p className="text-xs text-green-400 mt-1">Area estimada: {estimatedHa.toFixed(2)} ha</p>}
                </div>
              </div>

              <textarea
                value={geojsonText}
                onChange={(e) => {
                  setGeojsonText(e.target.value);
                  setGeojsonError('');
                }}
                rows={8}
                placeholder='{"type":"Polygon","coordinates":[[[-84.8604,10.6883],[-84.8595,10.6883],[-84.8595,10.6891],[-84.8604,10.6891],[-84.8604,10.6883]]]}'
                className={inputCls + ' mt-3 font-mono text-xs leading-5'}
              />

              {geojsonError && <p className={errorCls + ' mt-2'}>{geojsonError}</p>}

              {estimatedHa !== null && (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-300">Hectareas estimadas desde la geometria</p>
                    <p className="text-xs text-emerald-200/80">Puede usarlas como referencia o cargarlas directo en el campo de hectareas.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, hectareas: Number(estimatedHa.toFixed(2)) }))}
                    className="inline-flex items-center justify-center rounded-lg border border-emerald-700 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/30"
                  >
                    Usar {estimatedHa.toFixed(2)} ha
                  </button>
                </div>
              )}

              <div className="mt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Vista previa</p>
                <GeoMapPreview
                  geojson={geojsonPreview}
                  height={260}
                  maxWidthClassName="max-w-full"
                  polygonColor={getParcelaColor(editing || form)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="w-4 h-4 accent-green-500"
              />
              <span className="text-sm text-gray-300">Activo</span>
            </label>

            {error && <p className={errorCls}>{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
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
