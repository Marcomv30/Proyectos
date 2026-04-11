import React, { useEffect, useMemo, useState } from 'react';
import { GeoJSON, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { Parcela } from '../types/empacadora';

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

function collectPoints(node: any, points: Array<[number, number]> = []) {
  if (!Array.isArray(node)) return points;
  if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
    points.push([node[1], node[0]]);
    return points;
  }
  node.forEach((child) => collectPoints(child, points));
  return points;
}

function getParcelaBounds(parcela?: Parcela | null): LatLngBoundsExpression | null {
  const geometry = getGeojsonGeometry(parcela?.geojson);
  if (!geometry) return null;
  const points = collectPoints(geometry.coordinates);
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
  const padLat = Math.max((bounds.maxLat - bounds.minLat) * 0.18, 0.0003);
  const padLng = Math.max((bounds.maxLng - bounds.minLng) * 0.18, 0.0003);
  return [
    [bounds.minLat - padLat, bounds.minLng - padLng],
    [bounds.maxLat + padLat, bounds.maxLng + padLng],
  ];
}

function getAllParcelasBounds(parcelas: Parcela[]): LatLngBoundsExpression | null {
  const points = parcelas.flatMap((parcela) => {
    const geometry = getGeojsonGeometry(parcela.geojson);
    return geometry ? collectPoints(geometry.coordinates) : [];
  });
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
  const padLat = Math.max((bounds.maxLat - bounds.minLat) * 0.12, 0.0004);
  const padLng = Math.max((bounds.maxLng - bounds.minLng) * 0.12, 0.0004);
  return [
    [bounds.minLat - padLat, bounds.minLng - padLng],
    [bounds.maxLat + padLat, bounds.maxLng + padLng],
  ];
}

function getGeometryCenter(geojson: any): [number, number] | null {
  const geometry = getGeojsonGeometry(geojson);
  if (!geometry) return null;
  const points = collectPoints(geometry.coordinates);
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
  return [(bounds.minLat + bounds.maxLat) / 2, (bounds.minLng + bounds.maxLng) / 2];
}

function FitToBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

type Props = {
  parcelas: Parcela[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  height?: number;
  getParcelColor?: (parcela: Parcela) => string;
};

export default function ParcelProjectMap({
  parcelas,
  selectedId = '',
  onSelect,
  height = 720,
  getParcelColor,
}: Props) {
  const [layer, setLayer] = useState<'map' | 'satellite'>('map');

  const selectedParcela = useMemo(
    () => parcelas.find((parcela) => parcela.id === selectedId) || null,
    [parcelas, selectedId]
  );
  const fitBounds = useMemo(
    () => getParcelaBounds(selectedParcela) || getAllParcelasBounds(parcelas),
    [selectedParcela, parcelas]
  );

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <p className="text-xs text-gray-500">
          Vista panoramica del proyecto. Toque una parcela de la lista o del mapa para acercarse.
        </p>
      </div>

      <div
        className="overflow-hidden rounded-xl border border-line"
        style={{ height, background: 'var(--surface-overlay)' }}
      >
        <MapContainer
          center={[10.68838, -84.86049]}
          zoom={16}
          scrollWheelZoom
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
          <FitToBounds bounds={fitBounds} />

          {parcelas.map((parcela) => {
            const geometry = getGeojsonGeometry(parcela.geojson);
            if (!geometry) return null;
            const color = getParcelColor ? getParcelColor(parcela) : '#4ade80';
            const isSelected = parcela.id === selectedId;
            const center = getGeometryCenter(parcela.geojson);
            const label = parcela.codigo || parcela.nombre;
            const labelBg = layer === 'satellite' ? 'rgba(8,12,22,.92)' : 'rgba(255,255,255,.92)';
            const labelText = layer === 'satellite' ? '#ffffff' : '#0f172a';
            const labelBorder = layer === 'satellite' ? 'rgba(255,255,255,.22)' : 'rgba(15,23,42,.18)';
            const labelShadow = layer === 'satellite' ? '0 1px 2px rgba(0,0,0,.55)' : '0 1px 1px rgba(255,255,255,.45)';
            return (
              <React.Fragment key={parcela.id}>
                <GeoJSON
                  data={geometry as any}
                  style={() => ({
                    color,
                    weight: isSelected ? 4 : 2.5,
                    fillColor: color,
                    fillOpacity: isSelected ? 0.28 : 0.14,
                  })}
                  eventHandlers={{
                    click: () => onSelect?.(parcela.id),
                  }}
                />
                {center && label ? (
                  <Marker
                    position={center}
                    interactive={false}
                    icon={divIcon({
                      className: 'parcel-map-label',
                      html: `<div style="padding:5px 10px;border-radius:999px;background:${labelBg};border:1px solid ${labelBorder};color:${labelText};font-weight:800;font-size:${isSelected ? '16px' : '14px'};line-height:1;letter-spacing:.01em;white-space:nowrap;text-shadow:${labelShadow};box-shadow:0 6px 18px rgba(0,0,0,.22);backdrop-filter:blur(2px);">${label}</div>`,
                      iconSize: [0, 0],
                      iconAnchor: [0, 0],
                    })}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
