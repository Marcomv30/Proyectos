import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Polygon, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';

export interface OverlayLayer {
  geojson: any;
  color: string;
  flashing?: boolean;
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

function getPolygonDraftCoordinates(geojson: any): Array<[number, number]> {
  const geometry = getGeojsonGeometry(geojson);
  if (!geometry || geometry.type !== 'Polygon') return [];
  const ring = Array.isArray(geometry.coordinates?.[0]) ? geometry.coordinates[0] : [];
  if (ring.length < 4) return [];
  return ring.slice(0, -1).map(([lng, lat]: [number, number]) => [lat, lng]);
}

function polygonGeojsonFromDraft(coords: Array<[number, number]>) {
  if (coords.length < 3) return null;
  const ring = [...coords, coords[0]].map(([lat, lng]) => [lng, lat]);
  return { type: 'Polygon', coordinates: [ring] };
}

function collectPoints(node: any, points: Array<[number, number]> = []) {
  if (!Array.isArray(node)) return points;
  if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
    points.push([node[1], node[0]]);
    return points;
  }
  node.forEach((child) => collectPoints(child, points));
  return points;
}

function computeBounds(
  geojson: any,
  gps?: { lat: number; lng: number } | null,
  draftCoords?: Array<[number, number]>
): LatLngBoundsExpression | null {
  const geometry = getGeojsonGeometry(geojson);
  const points = draftCoords?.length
    ? [...draftCoords]
    : geometry
      ? collectPoints(geometry.coordinates)
      : [];
  if (gps) points.push([gps.lat, gps.lng]);
  if (!points.length) return null;

  const bounds = points.reduce(
    (acc, [lat, lng]) => ({
      minLat: Math.min(acc.minLat, lat),
      minLng: Math.min(acc.minLng, lng),
      maxLat: Math.max(acc.maxLat, lat),
      maxLng: Math.max(acc.maxLng, lng),
    }),
    { minLat: points[0][0], minLng: points[0][1], maxLat: points[0][0], maxLng: points[0][1] }
  );

  const padLat = Math.max((bounds.maxLat - bounds.minLat) * 0.2, 0.0003);
  const padLng = Math.max((bounds.maxLng - bounds.minLng) * 0.2, 0.0003);

  return [
    [bounds.minLat - padLat, bounds.minLng - padLng],
    [bounds.maxLat + padLat, bounds.maxLng + padLng],
  ];
}

function FitToBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [18, 18] });
  }, [map, bounds]);
  return null;
}

function DraftCapture({
  enabled,
  onPointAdd,
  onClose,
}: {
  enabled: boolean;
  onPointAdd: (lat: number, lng: number) => void;
  onClose: () => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onPointAdd(event.latlng.lat, event.latlng.lng);
    },
    dblclick(event) {
      if (!enabled) return;
      // Doble clic cierra el polígono (sin agregar punto extra)
      onClose();
    },
  });
  return null;
}

function FlyToFlashing({ overlays, flashKey }: { overlays?: OverlayLayer[]; flashKey?: string | number }) {
  const map = useMap();
  useEffect(() => {
    if (flashKey === undefined || flashKey === null || !overlays) return;
    const flashing = overlays.find(o => o.flashing);
    if (!flashing) return;
    const geom = getGeojsonGeometry(flashing.geojson);
    if (!geom) return;
    const pts = collectPoints(geom.coordinates);
    if (!pts.length) return;
    try {
      const bounds = L.latLngBounds(pts as [number, number][]).pad(0.35);
      map.flyToBounds(bounds, { animate: true, duration: 0.5, maxZoom: 20 });
    } catch { /* bounds inválidos */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashKey]);
  return null;
}

type Props = {
  geojson?: any;
  gps?: { lat: number; lng: number; precision?: number } | null;
  height?: number | string;
  maxWidthClassName?: string;
  polygonColor?: string;
  editable?: boolean;
  onDrawCommit?: (geojson: any | null) => void;
  onRequestExpand?: () => void;
  overlays?: OverlayLayer[];
  flashKey?: string | number;
  drawResetKey?: number;
};

export default function GeoMapPreview({
  geojson,
  gps = null,
  height = 220 as number | string,
  maxWidthClassName = 'max-w-[260px]',
  polygonColor = '#4ade80',
  editable = false,
  onDrawCommit,
  onRequestExpand,
  overlays,
  flashKey,
  drawResetKey,
}: Props) {
  const [layer, setLayer] = useState<'map' | 'satellite'>('satellite');
  const [draftCoords, setDraftCoords] = useState<Array<[number, number]>>([]);
  const geometry = useMemo(() => getGeojsonGeometry(geojson), [geojson]);

  useEffect(() => {
    if (!editable) return;
    setDraftCoords(getPolygonDraftCoordinates(geojson));
  }, [editable, geojson]);

  // Limpia el borrador cuando cambia drawResetKey (sin remontar el mapa)
  useEffect(() => {
    if (drawResetKey === undefined) return;
    setDraftCoords([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawResetKey]);

  const previewGeojson = useMemo(
    () => (draftCoords.length >= 3 ? polygonGeojsonFromDraft(draftCoords) : geojson),
    [draftCoords, geojson]
  );
  const bounds = useMemo(() => computeBounds(previewGeojson, gps, draftCoords), [previewGeojson, gps, draftCoords]);

  // Sin datos y sin modo edición: placeholder
  if (!geometry && !gps && !draftCoords.length && !editable) {
    return (
      <div
        className={`flex w-full ${maxWidthClassName} items-center justify-center rounded-lg border border-dashed`}
        style={{ height, borderColor: 'var(--line)', color: 'var(--ink-faint)', background: 'var(--surface-overlay)' }}
      >
        Sin geometria ni GPS para mostrar.
      </div>
    );
  }

  // Cuando height='100%' usamos flex column para que la toolbar no ocupe
  // espacio del mapa y éste rellene el resto disponible.
  const isFull = height === '100%';

  return (
    <div
      className={`w-full ${maxWidthClassName}`}
      style={isFull ? { height: '100%', display: 'flex', flexDirection: 'column' } : {}}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2" style={isFull ? { flexShrink: 0 } : {}}>
        <div className="inline-flex rounded-lg border border-line bg-surface-overlay p-1">
          <button
            type="button"
            onClick={() => setLayer('map')}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: layer === 'map' ? 'var(--emp-accent)' : 'transparent',
              color: layer === 'map' ? '#fff' : 'var(--ink-muted)',
            }}
          >
            Mapa
          </button>
          <button
            type="button"
            onClick={() => setLayer('satellite')}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: layer === 'satellite' ? 'var(--emp-accent)' : 'transparent',
              color: layer === 'satellite' ? '#fff' : 'var(--ink-muted)',
            }}
          >
            Satelite
          </button>
        </div>

        {editable && (
          <>
            <button
              type="button"
              onClick={onRequestExpand}
              className="rounded-md border border-line bg-surface-overlay px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-slate-800/50"
            >
              Expandir
            </button>
            <button
              type="button"
              onClick={() => setDraftCoords((coords) => coords.slice(0, -1))}
              className="rounded-md border border-line bg-surface-overlay px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-slate-800/50"
              disabled={!draftCoords.length}
            >
              Deshacer
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftCoords([]);
                onDrawCommit?.(null);
              }}
              className="rounded-md border border-line bg-surface-overlay px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-slate-800/50"
              disabled={!draftCoords.length && !geojson}
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => onDrawCommit?.(polygonGeojsonFromDraft(draftCoords))}
              className="rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900/30"
              disabled={draftCoords.length < 3}
            >
              Usar poligono
            </button>
          </>
        )}
      </div>

      {editable && (
        <p className="mb-2 text-[11px] text-gray-500" style={isFull ? { flexShrink: 0 } : {}}>
          Clic en el mapa para marcar vértices · doble clic para cerrar · con 3+ puntos presioná "Usar polígono".
        </p>
      )}

      <div
        className="overflow-hidden rounded-lg border"
        style={
          isFull
            ? { flex: 1, minHeight: 0, borderColor: 'var(--line)', background: 'var(--surface-overlay)' }
            : { height, borderColor: 'var(--line)', background: 'var(--surface-overlay)' }
        }
      >
        <MapContainer
          center={gps ? [gps.lat, gps.lng] : [10.68838, -84.86049]}
          zoom={17}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution={layer === 'satellite' ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap'}
            url={
              layer === 'satellite'
                ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            }
          />
          <FitToBounds bounds={bounds} />
          <DraftCapture
            enabled={editable}
            onPointAdd={(lat, lng) => setDraftCoords((coords) => [...coords, [lat, lng]])}
            onClose={() => onDrawCommit?.(polygonGeojsonFromDraft(draftCoords))}
          />

          {draftCoords.length >= 3 ? (
            <Polygon
              positions={draftCoords}
              pathOptions={{
                color: polygonColor,
                weight: 3,
                fillColor: polygonColor,
                fillOpacity: 0.18,
              }}
            />
          ) : geometry ? (
            <GeoJSON
              data={geometry as any}
              style={() => ({
                color: polygonColor,
                weight: 3,
                fillColor: polygonColor,
                fillOpacity: 0.18,
              })}
            />
          ) : null}

          {draftCoords.length > 0 && (
            <>
              <Polyline positions={draftCoords} pathOptions={{ color: polygonColor, weight: 2, dashArray: '4 4' }} />
              {draftCoords.map(([lat, lng], index) => (
                <CircleMarker
                  key={`${lat}-${lng}-${index}`}
                  center={[lat, lng]}
                  radius={5}
                  pathOptions={{ color: polygonColor, fillColor: polygonColor, fillOpacity: 1, weight: 2 }}
                />
              ))}
            </>
          )}

          {/* Overlays de bloques / zonas externas */}
          {overlays?.map((o, i) => (
            <GeoJSON
              key={`overlay-${i}-${o.flashing}`}
              data={o.geojson}
              style={() => ({
                color: o.color,
                weight: o.flashing ? 5 : 2,
                fillColor: o.color,
                fillOpacity: o.flashing ? 0.5 : 0.18,
                opacity: o.flashing ? 1 : 0.75,
              })}
            />
          ))}

          <FlyToFlashing overlays={overlays} flashKey={flashKey} />

          {gps && (
            <CircleMarker
              center={[gps.lat, gps.lng]}
              radius={7}
              pathOptions={{
                color: '#38bdf8',
                fillColor: '#38bdf8',
                fillOpacity: 0.9,
                weight: 2,
              }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
