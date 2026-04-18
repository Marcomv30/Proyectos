import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { fromBlob } from 'geotiff';
import proj4 from 'proj4';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
  Camera,
  Settings,
  MapPin,
  X,
  Crosshair,
  Target,
  Grid3x3,
  PenLine,
  Check,
  Undo2,
  Layers,
  Download,
  FileImage,
  Save,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Rectangle,
  CircleMarker,
  Polygon,
  Polyline,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBounds } from 'leaflet';
import {
  btnPrimary,
  btnSecondary,
  inputCls,
  labelCls,
} from '../../components/ui';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface PhotoMeta {
  name: string;
  file: File;
  lat: number;
  lng: number;
  alt: number;
  yaw: number;
  bounds: [[number, number], [number, number]];
}

interface InventoryMarker {
  id: string;
  lat: number;
  lng: number;
  count: number;
  nota: string;
}

type ChildZoneType = 'siembra' | 'camino' | 'proteccion' | 'otro';
type DrawingMode = 'lote' | ChildZoneType;

interface Lote {
  id: string;
  label: string;                    // "Lote 1", "Lote 2"…
  coords: Array<[number, number]>;
  closed: boolean;
}

interface ZonaHija {
  id: string;
  loteId: string;                   // FK → Lote.id
  tipo: ChildZoneType;
  num: number;                      // autoincremental por tipo dentro del lote
  coords: Array<[number, number]>;
  closed: boolean;
  plantCount: number;               // inventario (solo siembra)
}

type MosaicResolution = 'low' | 'medium' | 'high';

interface GeoTiffLayer {
  id: string;
  name: string;
  url: string;
  bounds: [[number, number], [number, number]];
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 150;
const DEFAULT_HFOV = 84;
const DEFAULT_VFOV = 65;
const DEFAULT_OPACITY = 0.85;
const DEFAULT_CENTER: [number, number] = [10.0, -84.0]; // Costa Rica

const LOTE_COLOR = '#fde047';   // amarillo — perímetro del lote

const CHILD_COLORS: Record<ChildZoneType, string> = {
  siembra:    '#4ade80',
  camino:     '#fb923c',
  proteccion: '#60a5fa',
  otro:       '#e879f9',
};

const CHILD_LABELS: Record<ChildZoneType, string> = {
  siembra:    'Bloque',
  camino:     'Camino',
  proteccion: 'Protección',
  otro:       'Otro',
};

const MOSAIC_RESOLUTION: Record<MosaicResolution, number> = {
  low: 2000,
  medium: 4000,
  high: 6000,
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Lee hasta `maxBytes` bytes del principio del archivo para encontrar XMP */
function sliceHead(buffer: ArrayBuffer, maxBytes = 262144) {
  return new Uint8Array(buffer, 0, Math.min(buffer.byteLength, maxBytes));
}

/** Busca un campo XMP en varios formatos: atributo, elemento, con/sin namespace prefix */
function xmpField(text: string, ...names: string[]): string | null {
  for (const name of names) {
    // Formato atributo: name="value"
    const attrM = text.match(new RegExp(`${name}="([^"]+)"`));
    if (attrM) return attrM[1];
    // Formato elemento: <name>value</name>
    const elemM = text.match(new RegExp(`<${name}>([^<]+)</${name}>`));
    if (elemM) return elemM[1];
  }
  return null;
}

function parseXmpGps(
  buffer: ArrayBuffer
): { lat: number; lng: number; alt: number; yaw: number } | null {
  const bytes = sliceHead(buffer, 262144);
  const text = new TextDecoder('latin1').decode(bytes);

  const latStr = xmpField(text,
    'drone-dji:GpsLatitude', 'drone-dji:Latitude',
    'dji:GpsLatitude', 'dji:Latitude',
  );
  const lngStr = xmpField(text,
    'drone-dji:GpsLongitude', 'drone-dji:Longitude',
    'dji:GpsLongitude', 'dji:Longitude',
  );

  if (!latStr || !lngStr) return null;

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (isNaN(lat) || isNaN(lng)) return null;

  const altStr = xmpField(text,
    'drone-dji:RelativeAltitude', 'drone-dji:AbsoluteAltitude',
    'dji:RelativeAltitude', 'dji:AbsoluteAltitude',
  );
  const alt = altStr ? Math.abs(parseFloat(altStr)) : 30;

  const yawStr = xmpField(text,
    'drone-dji:GimbalYawDegree', 'drone-dji:FlightYawDegree',
    'dji:GimbalYawDegree', 'dji:FlightYawDegree',
  );
  const yaw = yawStr ? parseFloat(yawStr) : 0;

  return { lat, lng, alt: isNaN(alt) ? 30 : alt, yaw: isNaN(yaw) ? 0 : yaw };
}

function calcBounds(
  lat: number,
  lng: number,
  alt: number,
  hfovDeg: number,
  vfovDeg: number
): [[number, number], [number, number]] {
  const hfovRad = (hfovDeg * Math.PI) / 180;
  const vfovRad = (vfovDeg * Math.PI) / 180;
  const footprintW = 2 * alt * Math.tan(hfovRad / 2);
  const footprintH = 2 * alt * Math.tan(vfovRad / 2);
  const halfLat = footprintH / 2 / 111320;
  const halfLng = footprintW / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lat - halfLat, lng - halfLng],
    [lat + halfLat, lng + halfLng],
  ];
}

function calcAreaHa(photos: PhotoMeta[]): number {
  if (!photos.length) return 0;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const p of photos) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const latDiff = maxLat - minLat;
  const lngDiff = maxLng - minLng;
  const mLat = latDiff * 111320;
  const mLng = lngDiff * 111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  return (mLat * mLng) / 10000;
}

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Área de un polígono lat/lng en hectáreas (fórmula de Gauss proyectada localmente) */
function calcPolygonAreaHa(coords: Array<[number, number]>): number {
  const n = coords.length;
  if (n < 3) return 0;
  const centerLat = coords.reduce((s, c) => s + c[0], 0) / n;
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [lat1, lng1] = coords[i];
    const [lat2, lng2] = coords[(i + 1) % n];
    area += (lng1 * mPerLng) * (lat2 * mPerLat) - (lng2 * mPerLng) * (lat1 * mPerLat);
  }
  return Math.abs(area) / 2 / 10000;
}

function fmtHa(ha: number): string {
  return ha < 1 ? `${(ha * 10000).toFixed(0)} m²` : `${ha.toFixed(4)} ha`;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal map components
// ────────────────────────────────────────────────────────────────────────────

function MapCapture({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function MapEvents({
  onBoundsChange,
  onMapClick,
  onMapDblClick,
}: {
  onBoundsChange: (bounds: LatLngBounds) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onMapDblClick?: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(map.getBounds()),
    zoomend: () => onBoundsChange(map.getBounds()),
    click: (e) => onMapClick?.(e.latlng.lat, e.latlng.lng),
    dblclick: (e) => onMapDblClick?.(e.latlng.lat, e.latlng.lng),
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, []);
  return null;
}

function FitButton({ photos }: { photos: PhotoMeta[] }) {
  const map = useMap();
  const fit = useCallback(() => {
    if (!photos.length) return;
    const bounds = L.latLngBounds(
      photos.map((p) => [p.lat, p.lng] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, photos]);

  if (!photos.length) return null;
  return (
    <div className="leaflet-top leaflet-right" style={{ top: 80, right: 8, zIndex: 1000 }}>
      <div className="leaflet-control">
        <button
          onClick={fit}
          title="Centrar todas las fotos"
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--line)',
            color: 'var(--ink)',
            borderRadius: 6,
            padding: '5px 10px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Target size={14} style={{ display: 'inline', marginRight: 4 }} />
          Centrar
        </button>
      </div>
    </div>
  );
}

function InventoryMarkers({
  markers,
  onIncrement,
  onDelete,
}: {
  markers: InventoryMarker[];
  onIncrement: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const layerGroup = L.layerGroup().addTo(map);

    markers.forEach((m) => {
      const icon = L.divIcon({
        html: `<div style="
          width:32px;height:32px;border-radius:50%;
          background:#16a34a;border:2px solid #fff;
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-weight:700;font-size:13px;
          cursor:pointer;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,0.4);
        ">${m.count}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        className: '',
      });
      const marker = L.marker([m.lat, m.lng], { icon });
      marker.on('click', () => onIncrement(m.id));
      marker.on('dblclick', (e) => {
        L.DomEvent.stopPropagation(e);
        onDelete(m.id);
      });
      marker.addTo(layerGroup);
    });

    return () => {
      layerGroup.remove();
    };
  }, [map, markers, onIncrement, onDelete]);

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Settings panel (portal)
// ────────────────────────────────────────────────────────────────────────────

function SettingsPanel({
  hfovDeg,
  vfovDeg,
  mosaicResolution,
  onHfov,
  onVfov,
  onMosaicResolution,
  onClose,
  onRecalc,
}: {
  hfovDeg: number;
  vfovDeg: number;
  mosaicResolution: MosaicResolution;
  onHfov: (v: number) => void;
  onVfov: (v: number) => void;
  onMosaicResolution: (v: MosaicResolution) => void;
  onClose: () => void;
  onRecalc: () => void;
}) {
  return createPortal(
    <div
      style={{ zIndex: 99999 }}
      className="fixed inset-0 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          width: 340,
          zIndex: 1,
          padding: '20px 24px',
          position: 'relative',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 14 }}>
            Configuración de cámara
          </span>
          <button onClick={onClose}>
            <X size={16} style={{ color: 'var(--ink-muted)' }} />
          </button>
        </div>

        <div className="mb-3">
          <label className={labelCls}>HFOV horizontal (°)</label>
          <input
            className={inputCls}
            type="number"
            min={20}
            max={180}
            value={hfovDeg}
            onChange={(e) => onHfov(Number(e.target.value))}
          />
          <p style={{ color: 'var(--ink-faint)', fontSize: 11, marginTop: 3 }}>
            DJI Mini/Air/Mavic por defecto: 84°
          </p>
        </div>

        <div className="mb-3">
          <label className={labelCls}>VFOV vertical (°)</label>
          <input
            className={inputCls}
            type="number"
            min={20}
            max={150}
            value={vfovDeg}
            onChange={(e) => onVfov(Number(e.target.value))}
          />
          <p style={{ color: 'var(--ink-faint)', fontSize: 11, marginTop: 3 }}>
            Sensor 4:3 por defecto: 65°
          </p>
        </div>

        <div className="mb-4">
          <label className={labelCls}>Resolución del mosaico</label>
          <select
            className={inputCls}
            value={mosaicResolution}
            onChange={(e) => onMosaicResolution(e.target.value as MosaicResolution)}
          >
            <option value="low">Baja (2000 px)</option>
            <option value="medium">Media (4000 px)</option>
            <option value="high">Alta (6000 px)</option>
          </select>
          <p style={{ color: 'var(--ink-faint)', fontSize: 11, marginTop: 3 }}>
            Resolución en el eje más largo del canvas
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <button className={btnSecondary} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={btnPrimary}
            onClick={() => {
              onRecalc();
              onClose();
            }}
          >
            Recalcular footprints
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Inventory table panel (portal)
// ────────────────────────────────────────────────────────────────────────────

function InventoryPanel({
  markers,
  onDelete,
  onClose,
}: {
  markers: InventoryMarker[];
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const totalCount = markers.reduce((s, m) => s + m.count, 0);

  return createPortal(
    <div
      style={{ zIndex: 99999 }}
      className="fixed inset-0 flex items-end justify-end p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          width: 420,
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 13 }}>
            Inventario — {markers.length} marcadores · {totalCount} piñas
          </span>
          <button onClick={onClose}>
            <X size={15} style={{ color: 'var(--ink-muted)' }} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-overlay)' }}>
                {['#', 'Lat', 'Lng', 'Conteo', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontSize: 10,
                      color: 'var(--ink-faint)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {markers.map((m, i) => (
                <tr
                  key={m.id}
                  style={{ borderBottom: '1px solid var(--line-dim)' }}
                >
                  <td style={{ padding: '5px 10px', fontSize: 11, color: 'var(--ink-muted)' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '5px 10px', fontSize: 11, color: 'var(--ink-muted)' }}>
                    {m.lat.toFixed(6)}
                  </td>
                  <td style={{ padding: '5px 10px', fontSize: 11, color: 'var(--ink-muted)' }}>
                    {m.lng.toFixed(6)}
                  </td>
                  <td
                    style={{
                      padding: '5px 10px',
                      fontSize: 12,
                      color: 'var(--ink)',
                      fontWeight: 700,
                    }}
                  >
                    {m.count}
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    <button
                      onClick={() => onDelete(m.id)}
                      style={{ color: 'var(--ink-faint)' }}
                      title="Eliminar"
                    >
                      <X size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ────────────────────────────────────────────────────────────────────────────
// Lotes panel — jerárquico con estadísticas de área
// ────────────────────────────────────────────────────────────────────────────

function LotesPanel({
  lotes,
  zonas,
  onDeleteLote,
  onDeleteZona,
  onSaveLote,
  exportGeoJSON,
  exportCopied,
  savedLoteIds,
  onFocusZona,
}: {
  lotes: Lote[];
  zonas: ZonaHija[];
  onDeleteLote: (id: string) => void;
  onDeleteZona: (id: string) => void;
  onSaveLote: (lote: Lote) => void;
  exportGeoJSON: () => void;
  exportCopied: boolean;
  savedLoteIds?: Set<string>;
  onFocusZona?: (zona: ZonaHija) => void;
}) {
  if (!lotes.length && !zonas.length) return null;

  return (
    <div style={{
      flexShrink: 0,
      background: 'var(--surface-raised)',
      borderBottom: '1px solid var(--line)',
      padding: '6px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {lotes.map((lote) => {
        const hijos = zonas.filter(z => z.loteId === lote.id && z.closed);
        const areaLote = calcPolygonAreaHa(lote.coords);
        const bloques = hijos.filter(z => z.tipo === 'siembra');
        const caminos = hijos.filter(z => z.tipo === 'camino');
        const proteccion = hijos.filter(z => z.tipo === 'proteccion');
        const otros = hijos.filter(z => z.tipo === 'otro');
        const areaSiembra = bloques.reduce((s, z) => s + calcPolygonAreaHa(z.coords), 0);
        const areaCaminos = caminos.reduce((s, z) => s + calcPolygonAreaHa(z.coords), 0);
        const areaProtec = proteccion.reduce((s, z) => s + calcPolygonAreaHa(z.coords), 0);
        const areaOtros = otros.reduce((s, z) => s + calcPolygonAreaHa(z.coords), 0);
        const areaMapeada = areaSiembra + areaCaminos + areaProtec + areaOtros;
        const diferencia = areaLote - areaMapeada;
        const totalPlantas = bloques.reduce((s, z) => s + z.plantCount, 0);

        return (
          <div key={lote.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Cabecera del lote */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: `${LOTE_COLOR}18`, border: `1px solid ${LOTE_COLOR}66`,
                borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700,
                color: LOTE_COLOR,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: LOTE_COLOR, display: 'inline-block' }} />
                {lote.label}
              </span>
              {lote.closed && (
                <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
                  Perímetro: <strong style={{ color: 'var(--ink-muted)' }}>{fmtHa(areaLote)}</strong>
                </span>
              )}
              {areaSiembra > 0 && (
                <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
                  · Sembrado: <strong style={{ color: CHILD_COLORS.siembra }}>{fmtHa(areaSiembra)}</strong>
                </span>
              )}
              {diferencia !== 0 && areaMapeada > 0 && (
                <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
                  · Dif: <strong style={{ color: diferencia > 0 ? '#f87171' : 'var(--ink-faint)' }}>{fmtHa(Math.abs(diferencia))}</strong>
                </span>
              )}
              {totalPlantas > 0 && (
                <span style={{ fontSize: 10, color: '#4ade80' }}>
                  · 🌱 {totalPlantas.toLocaleString('es-CR')} plantas
                </span>
              )}
              {lote.closed && lote.coords.length >= 3 && (
                savedLoteIds?.has(lote.id) ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    background: '#052e16', border: '1px solid #166534',
                    color: '#86efac', borderRadius: 99,
                    padding: '1px 7px', fontSize: 10, fontWeight: 700,
                  }}>
                    <Check size={9} />
                    Guardado
                  </span>
                ) : (
                  <button
                    onClick={() => onSaveLote(lote)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      background: 'transparent', border: '1px solid #065f46',
                      color: '#34d399', borderRadius: 99, cursor: 'pointer',
                      padding: '1px 7px', fontSize: 10, fontWeight: 700,
                    }}
                    title="Guardar como parcela en base de datos"
                  >
                    <Save size={9} />
                    Guardar
                  </button>
                )
              )}
              <button
                onClick={() => onDeleteLote(lote.id)}
                style={{ color: 'var(--ink-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}
                title="Eliminar lote y sus zonas"
              >
                <X size={11} />
              </button>
            </div>

            {/* Zonas hijas */}
            {hijos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 16 }}>
                {hijos.map((z) => (
                  <span
                    key={z.id}
                    onClick={() => onFocusZona?.(z)}
                    title="Clic para enfocar en el mapa"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: 'var(--surface-overlay)',
                      border: `1px solid ${CHILD_COLORS[z.tipo]}44`,
                      borderRadius: 99, padding: '2px 7px', fontSize: 10,
                      cursor: onFocusZona ? 'pointer' : 'default',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={e => { if (onFocusZona) { (e.currentTarget as HTMLElement).style.borderColor = CHILD_COLORS[z.tipo]; (e.currentTarget as HTMLElement).style.background = `${CHILD_COLORS[z.tipo]}18`; } }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${CHILD_COLORS[z.tipo]}44`; (e.currentTarget as HTMLElement).style.background = 'var(--surface-overlay)'; }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 1, background: CHILD_COLORS[z.tipo], display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
                      {z.tipo === 'siembra' ? `Bloque ${z.num}` : `${CHILD_LABELS[z.tipo]} ${z.num}`}
                    </span>
                    <span style={{ color: 'var(--ink-faint)' }}>{fmtHa(calcPolygonAreaHa(z.coords))}</span>
                    {z.tipo === 'siembra' && z.plantCount > 0 && (
                      <span style={{ color: CHILD_COLORS.siembra }}>· {z.plantCount}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteZona(z.id); }}
                      style={{ color: 'var(--ink-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, marginLeft: 1 }}
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Desglose de áreas si hay suficientes zonas */}
            {areaMapeada > 0 && (
              <div style={{ paddingLeft: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { label: 'Caminos', area: areaCaminos, color: CHILD_COLORS.camino },
                  { label: 'Protección', area: areaProtec, color: CHILD_COLORS.proteccion },
                  { label: 'Otros', area: areaOtros, color: CHILD_COLORS.otro },
                ].filter(r => r.area > 0).map(r => (
                  <span key={r.label} style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
                    {r.label}: <strong style={{ color: r.color }}>{fmtHa(r.area)}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Zonas huérfanas (sin lote) */}
      {zonas.filter(z => !lotes.find(l => l.id === z.loteId)).length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
          Hay zonas sin lote asignado
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={exportGeoJSON}
          style={{
            padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
            background: exportCopied ? '#166534' : 'transparent',
            color: exportCopied ? '#bbf7d0' : '#86efac',
            border: '1px solid #166534',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {exportCopied ? <><Check size={10} />Copiado</> : <><Download size={10} />Exportar GeoJSON</>}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Save lote modal — guarda lote como emp_parcela + zonas como emp_bloques
// ────────────────────────────────────────────────────────────────────────────

interface SaveLoteForm {
  codigo: string;
  nombre: string;
  proveedor_id: string;
  tipo_finca: 'propia' | 'alquilada';
  ubicacion: string;
  activo: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Cargar parcela desde BD — modal de selección
// ────────────────────────────────────────────────────────────────────────────

function LoadParcelaModal({
  empresaId,
  onClose,
  onLoad,
}: {
  empresaId: number;
  onClose: () => void;
  onLoad: (lote: Lote, zonas: ZonaHija[]) => void;
}) {
  const [parcelas, setParcelas] = useState<{ id: string; nombre: string; codigo?: string; area_ha_perimetro?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('emp_parcelas')
      .select('id, nombre, codigo, area_ha_perimetro')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => { setParcelas(data || []); setLoading(false); });
  }, [empresaId]);

  async function handleLoad() {
    if (!selectedId) return;
    setImporting(true);
    setError('');

    // Cargar parcela y sus bloques
    const [parcelaRes, bloquesRes] = await Promise.all([
      supabase.from('emp_parcelas').select('id, nombre, geojson').eq('id', selectedId).single(),
      supabase.from('emp_bloques').select('*').eq('parcela_id', selectedId).eq('activo', true).order('tipo').order('num'),
    ]);

    if (parcelaRes.error || !parcelaRes.data) {
      setError('No se pudo cargar la parcela.');
      setImporting(false);
      return;
    }

    const p = parcelaRes.data as { id: string; nombre: string; geojson: any };

    // Convertir GeoJSON de parcela → Lote
    function geojsonToLatLng(geojson: any): Array<[number, number]> {
      let coords: any = null;
      if (geojson?.type === 'Feature') coords = geojson.geometry?.coordinates;
      else if (geojson?.type === 'Polygon') coords = geojson.coordinates;
      else if (geojson?.type === 'FeatureCollection') coords = geojson.features?.[0]?.geometry?.coordinates;
      if (!coords?.[0]) return [];
      // GeoJSON es [lng, lat] → convertir a [lat, lng]
      return (coords[0] as [number, number][])
        .slice(0, -1) // quitar el punto de cierre del anillo
        .map(([lng, lat]) => [lat, lng]);
    }

    const loteCoords = geojsonToLatLng(p.geojson);
    if (loteCoords.length < 3) {
      setError('La parcela no tiene geometría válida para cargar.');
      setImporting(false);
      return;
    }

    const loteId = `lote-loaded-${p.id}`;
    const newLote: Lote = {
      id: loteId,
      label: p.nombre,
      coords: loteCoords,
      closed: true,
    };

    // Convertir bloques → ZonaHija
    const rawBloques = (bloquesRes.data || []) as Array<{
      id: string; tipo: string; num: number; geojson: any; area_ha?: number; plant_count?: number;
    }>;

    const newZonas: ZonaHija[] = rawBloques
      .filter(b => ['siembra', 'camino', 'proteccion', 'otro'].includes(b.tipo))
      .map(b => {
        const bloqueCoords = geojsonToLatLng(b.geojson);
        return {
          id: `zona-loaded-${b.id}`,
          loteId,
          tipo: b.tipo as ChildZoneType,
          num: b.num,
          coords: bloqueCoords,
          closed: true,
          plantCount: b.plant_count || 0,
        };
      })
      .filter(z => z.coords.length >= 3);

    onLoad(newLote, newZonas);
  }

  const BORDER = '#1e3a5f';

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--surface-raised)', border: `1px solid ${BORDER}`,
        borderRadius: 12, width: 480, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Cargar parcela desde base de datos</span>
          <button onClick={onClose} style={{ color: 'var(--ink-faint)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Lista */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          {loading ? (
            <p style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 13 }}>Cargando parcelas…</p>
          ) : parcelas.length === 0 ? (
            <p style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 13 }}>No hay parcelas guardadas aún.</p>
          ) : (
            parcelas.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 18px', border: 'none', background: selectedId === p.id ? '#0d2a4a' : 'transparent',
                  cursor: 'pointer', borderLeft: selectedId === p.id ? '3px solid #3b82f6' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 2, background: LOTE_COLOR, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.nombre}</span>
                {p.codigo && <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'monospace' }}>{p.codigo}</span>}
                {p.area_ha_perimetro && (
                  <span style={{ fontSize: 11, color: LOTE_COLOR }}>
                    {p.area_ha_perimetro < 1 ? `${(p.area_ha_perimetro * 10000).toFixed(0)} m²` : `${p.area_ha_perimetro.toFixed(2)} ha`}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {error && <span style={{ fontSize: 11, color: '#f87171', flex: 1 }}>{error}</span>}
          {!error && <span style={{ fontSize: 11, color: 'var(--ink-faint)', flex: 1 }}>
            {selectedId ? 'Se cargará el lote y sus bloques sobre el mapa actual.' : 'Seleccione una parcela de la lista.'}
          </span>}
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: 'transparent', color: 'var(--ink-muted)', border: '1px solid var(--line)', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={handleLoad}
            disabled={!selectedId || importing}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: selectedId && !importing ? '#1d4ed8' : '#1e3a5f',
              color: selectedId && !importing ? '#fff' : 'var(--ink-faint)',
              border: 'none', cursor: selectedId && !importing ? 'pointer' : 'not-allowed',
            }}
          >
            {importing ? 'Cargando…' : 'Cargar en mapa'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SaveLoteModal({
  lote,
  zonas,
  empresaId,
  onClose,
  onSaved,
}: {
  lote: Lote;
  zonas: ZonaHija[];
  empresaId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const hijasDelLote = zonas.filter(z => z.loteId === lote.id && z.closed && z.coords.length >= 3);
  const areaPerimetro = calcPolygonAreaHa(lote.coords);
  const areaSembrada = hijasDelLote
    .filter(z => z.tipo === 'siembra')
    .reduce((s, z) => s + calcPolygonAreaHa(z.coords), 0);

  const [form, setForm] = useState<SaveLoteForm>({
    codigo: '',
    nombre: lote.label,
    proveedor_id: '',
    tipo_finca: 'propia',
    ubicacion: '',
    activo: true,
  });
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string; tipo: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Construir GeoJSON Feature del lote (coords son [lat,lng], GeoJSON usa [lng,lat])
  function makePolygonFeature(
    coords: Array<[number, number]>,
    props: Record<string, unknown>
  ) {
    const ring = [
      ...coords.map(([lat, lng]) => [lng, lat]),
      [coords[0][1], coords[0][0]], // cerrar anillo
    ];
    return {
      type: 'Feature',
      properties: props,
      geometry: { type: 'Polygon', coordinates: [ring] },
    };
  }

  useEffect(() => {
    supabase
      .from('emp_proveedores_fruta')
      .select('id, nombre, tipo')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => { if (data) setProveedores(data); });
  }, [empresaId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { setSaveError('El nombre es requerido.'); return; }
    setSaving(true);
    setSaveError('');

    const loteGeoJSON = makePolygonFeature(lote.coords, {
      tipo: 'lote',
      label: lote.label,
      area_ha: Number(areaPerimetro.toFixed(4)),
    });

    const parcelaPayload = {
      empresa_id: empresaId,
      proveedor_id: form.proveedor_id || null,
      codigo: form.codigo.trim() || null,
      nombre: form.nombre.trim(),
      ubicacion: form.ubicacion.trim() || null,
      activo: form.activo,
      geojson: loteGeoJSON,
      tipo_finca: form.tipo_finca,
      area_ha_perimetro: Number(areaPerimetro.toFixed(4)),
      area_ha_sembrada: Number(areaSembrada.toFixed(4)),
    };

    const { data: parcelaData, error: parcelaError } = await supabase
      .from('emp_parcelas')
      .insert(parcelaPayload)
      .select('id')
      .single();

    if (parcelaError || !parcelaData) {
      setSaveError(parcelaError?.message ?? 'Error al guardar la parcela.');
      setSaving(false);
      return;
    }

    const parcelaId = (parcelaData as { id: string }).id;

    if (hijasDelLote.length > 0) {
      const bloquesPayload = hijasDelLote.map(z => ({
        empresa_id: empresaId,
        parcela_id: parcelaId,
        tipo: z.tipo,
        num: z.num,
        geojson: makePolygonFeature(z.coords, {
          tipo: z.tipo,
          num: z.num,
          area_ha: Number(calcPolygonAreaHa(z.coords).toFixed(4)),
        }),
        area_ha: Number(calcPolygonAreaHa(z.coords).toFixed(4)),
        plant_count: z.plantCount,
        activo: true,
      }));

      const { error: bloquesError } = await supabase.from('emp_bloques').insert(bloquesPayload);
      if (bloquesError) {
        // Parcela ya guardada — bloques fallaron (posiblemente migración pendiente)
        // Avisar pero NO bloquear el cierre
        console.warn('[DronMosaico] Error guardando bloques:', bloquesError.message);
        setSaveError(`Parcela guardada. Bloques pendientes: ${bloquesError.message}`);
        setSaving(false);
        // Cerrar después de 3 segundos para que el usuario lea el aviso
        setTimeout(() => onSaved(), 3000);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  const BORDER = '#1e3a5f';
  const BG_PANEL = '#0d1829';

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex flex-col" style={{ backgroundColor: '#080f1c' }}>

      {/* ── Header ── */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-5 py-3"
        style={{ borderColor: BORDER, background: `linear-gradient(180deg,${BG_PANEL} 0%,#101b2e 100%)` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition"
            style={{ color: 'var(--ink-muted)' }}
          >
            <ArrowLeft size={14} />
            Cancelar
          </button>
          <span style={{ color: BORDER }}>|</span>
          <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
            Guardar {lote.label} como Parcela
          </h2>
          <span style={{
            borderRadius: 4, padding: '2px 8px', fontSize: 11, flexShrink: 0,
            background: `${LOTE_COLOR}22`, color: LOTE_COLOR, border: `1px solid ${LOTE_COLOR}55`,
          }}>
            {fmtHa(areaPerimetro)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveError && (
            <p className="text-xs max-w-xs truncate" style={{ color: saveError.startsWith('Parcela guardada') ? '#86efac' : '#f87171' }}>
              {saveError}
            </p>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave as any}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: saving ? '#065f46' : '#059669', color: '#fff',
              border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <Save size={13} />
            {saving ? 'Guardando…' : 'Guardar parcela'}
          </button>
        </div>
      </div>

      {/* ── Body: dos columnas ── */}
      <form onSubmit={handleSave} className="flex flex-1 min-h-0 overflow-hidden">

        {/* Columna izquierda — campos */}
        <div
          className="flex flex-col gap-4 overflow-y-auto p-5 shrink-0 min-h-0"
          style={{ width: 440, borderRight: `1px solid ${BORDER}` }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Código
              </label>
              <input
                type="text"
                value={form.codigo}
                onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                placeholder="Ej: LOTE-01-A"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Nombre *
              </label>
              <input
                type="text"
                required
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Proveedor / Finca
            </label>
            <select
              value={form.proveedor_id}
              onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12 }}
            >
              <option value="">— Sin asignar —</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.tipo === 'propio' ? 'Propia' : 'Tercero'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tipo de finca
            </label>
            <select
              value={form.tipo_finca}
              onChange={e => setForm(f => ({ ...f, tipo_finca: e.target.value as 'propia' | 'alquilada' }))}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12 }}
            >
              <option value="propia">Propia</option>
              <option value="alquilada">Alquilada</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Ubicación
            </label>
            <textarea
              value={form.ubicacion}
              onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))}
              rows={2}
              placeholder="Descripción geográfica del lote"
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--surface-overlay)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12, resize: 'none' }}
            />
          </div>

          {/* Resumen de áreas calculadas */}
          <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: BG_PANEL, padding: '12px 14px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Áreas calculadas
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ borderRadius: 8, padding: '8px 10px', background: `${LOTE_COLOR}11`, border: `1px solid ${LOTE_COLOR}33` }}>
                <p style={{ fontSize: 10, color: 'var(--ink-faint)' }}>Perímetro total</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: LOTE_COLOR, marginTop: 2 }}>{fmtHa(areaPerimetro)}</p>
              </div>
              <div style={{ borderRadius: 8, padding: '8px 10px', background: `${CHILD_COLORS.siembra}11`, border: `1px solid ${CHILD_COLORS.siembra}33` }}>
                <p style={{ fontSize: 10, color: 'var(--ink-faint)' }}>Área sembrada</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: CHILD_COLORS.siembra, marginTop: 2 }}>{areaSembrada > 0 ? fmtHa(areaSembrada) : '—'}</p>
              </div>
            </div>
            {hijasDelLote.length > 0 && (
              <p style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 8 }}>
                {hijasDelLote.length} bloque{hijasDelLote.length !== 1 ? 's' : ''}/zona{hijasDelLote.length !== 1 ? 's' : ''} se guardarán en emp_bloques
              </p>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.activo}
              onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: '#22c55e' }}
            />
            <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Activo</span>
          </label>
        </div>

        {/* Columna derecha — resumen visual de zonas */}
        <div
          className="relative flex-1 overflow-y-auto p-8 flex flex-col gap-4"
          style={{ background: '#0a1520' }}
        >
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Contenido del lote
          </p>

          {/* Lote header */}
          <div style={{
            borderRadius: 10, border: `1px solid ${LOTE_COLOR}44`,
            background: `${LOTE_COLOR}09`, padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: LOTE_COLOR, display: 'inline-block' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: LOTE_COLOR }}>{lote.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-muted)', marginLeft: 'auto' }}>{fmtHa(areaPerimetro)}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6 }}>
              {lote.coords.length} vértices · GeoJSON Feature Polygon listo para guardarse
            </p>
          </div>

          {/* Zonas hijas */}
          {hijasDelLote.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {hijasDelLote.map(z => (
                <div key={z.id} style={{
                  borderRadius: 8, border: `1px solid ${CHILD_COLORS[z.tipo]}44`,
                  background: `${CHILD_COLORS[z.tipo]}09`, padding: '8px 12px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CHILD_COLORS[z.tipo], display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                    {z.tipo === 'siembra' ? `Bloque ${z.num}` : `${CHILD_LABELS[z.tipo]} ${z.num}`}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)', marginLeft: 'auto', letterSpacing: '0.01em' }}>
                    {fmtHa(calcPolygonAreaHa(z.coords))}
                  </span>
                  {z.tipo === 'siembra' && z.plantCount > 0 && (
                    <span style={{ fontSize: 11, color: CHILD_COLORS.siembra }}>
                      🌱 {z.plantCount.toLocaleString('es-CR')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
              Sin bloques/zonas dibujados en este lote.
            </p>
          )}
        </div>
      </form>
    </div>,
    document.body
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export default function DronMosaico() {
  const empresaId = useEmpresaId();
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [visibleUrls, setVisibleUrls] = useState<Map<string, string>>(new Map());
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [scanPhase, setScanPhase] = useState('');   // 'Muestra…' | 'Cargando…' | ''
  const [smartLimit, setSmartLimit] = useState(300);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [hfovDeg, setHfovDeg] = useState(DEFAULT_HFOV);
  const [vfovDeg, setVfovDeg] = useState(DEFAULT_VFOV);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [inventoryMode, setInventoryMode] = useState(false);
  const [inventory, setInventory] = useState<InventoryMarker[]>([]);
  const [showInventoryPanel, setShowInventoryPanel] = useState(false);
  const [error, setError] = useState('');

  // Lotes y zonas hijas
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [zonas, setZonas] = useState<ZonaHija[]>([]);
  const [drawingMode, setDrawingMode] = useState<DrawingMode | null>(null);
  const [activeLoteId, setActiveLoteId] = useState<string | null>(null);
  const [draftCoords, setDraftCoords] = useState<Array<[number, number]>>([]);
  const [exportCopied, setExportCopied] = useState(false);
  const [savingLote, setSavingLote] = useState<Lote | null>(null);
  const [savedLoteIds, setSavedLoteIds] = useState<Set<string>>(new Set());
  const [sessionSavedAt, setSessionSavedAt] = useState<string | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);

  // Mosaic state
  const [mosaicResolution, setMosaicResolution] = useState<MosaicResolution>('medium');
  const [mosaicUrl, setMosaicUrl] = useState<string | null>(null);
  const [mosaicBounds, setMosaicBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [generatingMosaic, setGeneratingMosaic] = useState(false);
  const [mosaicProgress, setMosaicProgress] = useState({ done: 0, total: 0 });

  // GeoTIFF externo — múltiples capas
  const [geotiffLayers, setGeotiffLayers] = useState<GeoTiffLayer[]>([]);
  const [geotiffLoading, setGeotiffLoading] = useState(false);
  const geotiffInputRef = useRef<HTMLInputElement>(null);

  const mapRef = useRef<L.Map | null>(null);
  const boundsRef = useRef<LatLngBounds | null>(null);
  const [flashedZonaId, setFlashedZonaId] = useState<string | null>(null);
  // Ref espejo de draftCoords — siempre actualizado, evita closures stale en dblclick
  const draftCoordsRef = useRef<Array<[number, number]>>([]);

  const drawMode = drawingMode !== null;

  // Revoke all blob URLs on unmount
  useEffect(() => {
    return () => {
      setVisibleUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return new Map();
      });
      setMosaicUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setGeotiffLayers((prev) => {
        prev.forEach((l) => URL.revokeObjectURL(l.url));
        return [];
      });
    };
  }, []);

  const fsaSupported =
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const SESSION_KEY = 'dronmosaico_session_v1';

  // ── Restaurar sesión al montar ───────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        lotes?: Lote[];
        zonas?: ZonaHija[];
        savedAt?: string;
        geotiffNames?: string[];
      };
      if (parsed.lotes && parsed.lotes.length > 0) setLotes(parsed.lotes);
      if (parsed.zonas && parsed.zonas.length > 0) setZonas(parsed.zonas);
      if (parsed.savedAt) setSessionSavedAt(parsed.savedAt);
      setSessionRestored(true);
    } catch { /* ignorar */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-guardar sesión cuando cambian lotes/zonas ───────────────────────
  useEffect(() => {
    if (lotes.length === 0 && zonas.length === 0) return;
    const savedAt = new Date().toISOString();
    const session = {
      lotes,
      zonas,
      savedAt,
      geotiffNames: geotiffLayers.map(l => l.name),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setSessionSavedAt(savedAt);
  }, [lotes, zonas, geotiffLayers]);

  // ── File scanning ────────────────────────────────────────────────────────

  const scanFolder = useCallback(async () => {
    if (!fsaSupported) return;
    setError('');

    let dirHandle: FileSystemDirectoryHandle;
    try {
      dirHandle = await (window as unknown as { showDirectoryPicker: (opts: { mode: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'read' });
    } catch {
      return;
    }

    setVisibleUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return new Map();
    });
    setPhotos([]);
    setScanning(true);
    setScanProgress({ done: 0, total: 0 });
    setScanPhase('Leyendo carpeta…');
    setIgnoredCount(0);

    // ── Fase 0: recolectar handles (sin leer archivos) ────────────────────
    const files: File[] = [];

    async function collectFiles(
      handle: FileSystemDirectoryHandle,
      depth: number
    ) {
      for await (const entry of (handle as any).values()) {
        if (
          (entry as FileSystemFileHandle).kind === 'file' &&
          /\.(jpe?g)$/i.test(entry.name)
        ) {
          const file: File = await (entry as FileSystemFileHandle).getFile();
          files.push(file);
        } else if ((entry as FileSystemDirectoryHandle).kind === 'directory' && depth < 2) {
          await collectFiles(entry as FileSystemDirectoryHandle, depth + 1);
        }
      }
    }

    try {
      await collectFiles(dirHandle, 0);
    } catch (e: unknown) {
      setError('Error al leer la carpeta: ' + (e instanceof Error ? e.message : String(e)));
      setScanning(false);
      setScanPhase('');
      return;
    }

    console.log('[Mosaico] Archivos JPG encontrados:', files.length);

    function readWithTimeout(file: File, ms: number): Promise<ArrayBuffer> {
      return Promise.race([
        file.slice(0, Math.min(file.size, 131072)).arrayBuffer(),
        new Promise<ArrayBuffer>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), ms)
        ),
      ]);
    }

    const results: PhotoMeta[] = [];
    let ignored = 0;

    const useSmartScan = files.length > smartLimit;

    if (useSmartScan) {
      // ── Fase 1: muestra rápida (cada 10ª foto) para encontrar el centro ──
      const STEP = 10;
      const sampleIndices: number[] = [];
      for (let i = 0; i < files.length; i += STEP) sampleIndices.push(i);

      setScanPhase('Fase 1/2 — Muestra…');
      setScanProgress({ done: 0, total: sampleIndices.length });

      const sampleGPS: Array<{ index: number; lat: number; lng: number }> = [];

      for (let si = 0; si < sampleIndices.length; si++) {
        if (si % 10 === 0) await new Promise<void>(r => setTimeout(r, 0));
        setScanProgress({ done: si + 1, total: sampleIndices.length });
        try {
          const buf = await readWithTimeout(files[sampleIndices[si]], 3000);
          const gps = parseXmpGps(buf);
          if (gps) sampleGPS.push({ index: sampleIndices[si], lat: gps.lat, lng: gps.lng });
        } catch { /* ignorar */ }
      }

      if (sampleGPS.length === 0) {
        setError('No se encontró GPS en la muestra. Verificá que las fotos sean de DJI.');
        setScanning(false);
        setScanPhase('');
        return;
      }

      // Centro geográfico de la muestra
      const centerLat = sampleGPS.reduce((s, p) => s + p.lat, 0) / sampleGPS.length;
      const centerLng = sampleGPS.reduce((s, p) => s + p.lng, 0) / sampleGPS.length;
      console.log('[Mosaico] Centro estimado:', centerLat.toFixed(6), centerLng.toFixed(6));

      // Índice de la muestra más cercana al centro
      const centerSample = sampleGPS.reduce(
        (best, p) => {
          const d = haversineDistance(centerLat, centerLng, p.lat, p.lng);
          return d < best.dist ? { index: p.index, dist: d } : best;
        },
        { index: sampleGPS[0].index, dist: Infinity }
      );

      // ── Fase 2: leer las `smartLimit` fotos más cercanas al centro ────────
      // Ordenar TODOS los índices por cercanía al índice central (como proxy espacial)
      const targetIndices = Array.from({ length: files.length }, (_, i) => i)
        .sort((a, b) => Math.abs(a - centerSample.index) - Math.abs(b - centerSample.index))
        .slice(0, smartLimit);

      setScanPhase('Fase 2/2 — Cargando…');
      setScanProgress({ done: 0, total: targetIndices.length });

      for (let ti = 0; ti < targetIndices.length; ti++) {
        if (ti % 5 === 0) await new Promise<void>(r => setTimeout(r, 0));
        setScanProgress({ done: ti + 1, total: targetIndices.length });

        const file = files[targetIndices[ti]];
        try {
          const buffer = await readWithTimeout(file, 3000);
          const gps = parseXmpGps(buffer);
          if (!gps) { ignored++; continue; }
          results.push({
            name: file.name, file,
            lat: gps.lat, lng: gps.lng, alt: gps.alt, yaw: gps.yaw,
            bounds: calcBounds(gps.lat, gps.lng, gps.alt, hfovDeg, vfovDeg),
          });
        } catch { ignored++; }
      }

      // Ordenar resultados por distancia real al centro (más cercano primero)
      results.sort(
        (a, b) =>
          haversineDistance(centerLat, centerLng, a.lat, a.lng) -
          haversineDistance(centerLat, centerLng, b.lat, b.lng)
      );

    } else {
      // ── Escaneo completo (pocos archivos) ─────────────────────────────────
      setScanPhase('');
      setScanProgress({ done: 0, total: files.length });

      for (let i = 0; i < files.length; i++) {
        if (i % 5 === 0) await new Promise<void>(r => setTimeout(r, 0));
        setScanProgress({ done: i + 1, total: files.length });

        const file = files[i];
        try {
          const buffer = await readWithTimeout(file, 3000);
          const gps = parseXmpGps(buffer);
          if (i === 0) {
            const text = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 262144)));
            console.log('[Mosaico] Primer archivo:', file.name, 'size:', file.size);
            console.log('[Mosaico] XMP:', text.includes('xmpmeta') || text.includes('x:xmpmeta'));
            console.log('[Mosaico] GPS resultado:', gps);
          }
          if (!gps) { ignored++; continue; }
          results.push({
            name: file.name, file,
            lat: gps.lat, lng: gps.lng, alt: gps.alt, yaw: gps.yaw,
            bounds: calcBounds(gps.lat, gps.lng, gps.alt, hfovDeg, vfovDeg),
          });
        } catch { ignored++; }
      }
    }

    console.log('[Mosaico] GPS OK:', results.length, '| Ignoradas:', ignored, '| Smart:', useSmartScan);

    const newUrls = new Map<string, string>();
    results.slice(0, MAX_VISIBLE).forEach(p => {
      newUrls.set(p.name, URL.createObjectURL(p.file));
    });

    setPhotos(results);
    setIgnoredCount(ignored);
    setScanning(false);
    setScanPhase('');
    setVisibleUrls(newUrls);

    if (results.length > 0) {
      const allBounds = L.latLngBounds(
        results.map(p => [p.lat, p.lng] as [number, number])
      );

      const doFit = () => {
        if (!mapRef.current) return;
        mapRef.current.invalidateSize();
        mapRef.current.fitBounds(allBounds.pad(0.5), { animate: false, maxZoom: 18 });
        boundsRef.current = mapRef.current.getBounds();
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(doFit);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hfovDeg, vfovDeg, smartLimit, fsaSupported]);

  // ── Progressive loading ──────────────────────────────────────────────────

  const updateVisibleUrls = useCallback(
    (currentPhotos: PhotoMeta[], bounds: LatLngBounds) => {
      if (!currentPhotos.length) return;

      const expanded = bounds.pad(0.3);
      const center = bounds.getCenter();

      const inView = currentPhotos.filter(p =>
        expanded.contains([p.lat, p.lng])
      );

      inView.sort(
        (a, b) =>
          haversineDistance(center.lat, center.lng, a.lat, a.lng) -
          haversineDistance(center.lat, center.lng, b.lat, b.lng)
      );

      const next = inView.slice(0, MAX_VISIBLE);
      const nextNames = new Set(next.map(p => p.name));

      setVisibleUrls(prev => {
        const newMap = new Map<string, string>();
        prev.forEach((url, name) => {
          if (nextNames.has(name)) newMap.set(name, url);
          else URL.revokeObjectURL(url);
        });
        next.forEach(p => {
          if (!newMap.has(p.name))
            newMap.set(p.name, URL.createObjectURL(p.file));
        });
        return newMap;
      });
    },
    []
  );

  const handleBoundsChange = useCallback(
    (bounds: LatLngBounds) => {
      boundsRef.current = bounds;
      updateVisibleUrls(photos, bounds);
    },
    [photos, updateVisibleUrls]
  );

  // ── Recalculate footprints when FOV changes ──────────────────────────────

  const recalcFootprints = useCallback(() => {
    setPhotos(prev =>
      prev.map(p => ({
        ...p,
        bounds: calcBounds(p.lat, p.lng, p.alt, hfovDeg, vfovDeg),
      }))
    );
  }, [hfovDeg, vfovDeg]);

  // ── Map click/dblclick handlers ─────────────────────────────────────────

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (inventoryMode) {
        setInventory(prev => [
          ...prev,
          { id: `${Date.now()}-${Math.random()}`, lat, lng, count: 1, nota: '' },
        ]);
      } else if (drawMode) {
        const next: Array<[number, number]> = [...draftCoordsRef.current, [lat, lng]];
        draftCoordsRef.current = next;
        setDraftCoords(next);
      }
    },
    [inventoryMode, drawMode]
  );

  const handleMapDblClick = useCallback(
    (_lat: number, _lng: number) => {
      if (!drawMode || !drawingMode) return;

      // Leer coords desde ref (siempre actualizado, no afectado por batching de React)
      const raw = draftCoordsRef.current;
      // El dblclick provoca 2 clicks previos; eliminamos el último (duplicado)
      const coords = raw.length > 1 ? raw.slice(0, -1) : [...raw];

      // Limpiar draft inmediatamente
      draftCoordsRef.current = [];
      setDraftCoords([]);
      setDrawingMode(null);

      if (coords.length < 3) return;

      if (drawingMode === 'lote') {
        const newLote: Lote = {
          id: `lote-${Date.now()}`,
          label: `Lote ${lotes.length + 1}`,
          coords,
          closed: true,
        };
        setLotes(prev => [...prev, newLote]);
        setActiveLoteId(newLote.id);
      } else {
        const loteId = activeLoteId ?? lotes[lotes.length - 1]?.id;
        if (!loteId) return;
        const tipoActual = drawingMode as ChildZoneType;
        setZonas(prev => {
          const num = prev.filter(z => z.loteId === loteId && z.tipo === tipoActual).length + 1;
          return [...prev, {
            id: `zona-${Date.now()}`,
            loteId,
            tipo: tipoActual,
            num,
            coords,
            closed: true,
            plantCount: 0,
          }];
        });
      }
    },
    [drawMode, drawingMode, lotes, activeLoteId]
  );

  // ── Start drawing ────────────────────────────────────────────────────────

  const startDrawing = useCallback((mode: DrawingMode) => {
    setDrawingMode(mode);
    setDraftCoords([]);
    setInventoryMode(false);
  }, []);

  const cancelDrawing = useCallback(() => {
    draftCoordsRef.current = [];
    setDrawingMode(null);
    setDraftCoords([]);
  }, []);

  const undoLastPoint = useCallback(() => {
    const next = draftCoordsRef.current.slice(0, -1);
    draftCoordsRef.current = next;
    setDraftCoords(next);
  }, []);

  const deleteLote = useCallback((id: string) => {
    setLotes(prev => prev.filter(l => l.id !== id));
    setZonas(prev => prev.filter(z => z.loteId !== id));
    setActiveLoteId(prev => prev === id ? null : prev);
  }, []);

  const deleteZona = useCallback((id: string) => {
    setZonas(prev => prev.filter(z => z.id !== id));
  }, []);

  // ── Focus zona en mapa ───────────────────────────────────────────────────
  const handleFocusZona = useCallback((zona: ZonaHija) => {
    if (!mapRef.current || zona.coords.length < 3) return;
    const bounds = L.latLngBounds(zona.coords);
    mapRef.current.fitBounds(bounds.pad(0.4), { animate: true, duration: 0.5 });
    // Flash: destella el zonaId durante 1.2s para que el polígono en el mapa lo indique
    setFlashedZonaId(zona.id);
    setTimeout(() => setFlashedZonaId(null), 1200);
  }, []);

  // ── Export GeoJSON ───────────────────────────────────────────────────────

  const exportGeoJSON = useCallback(() => {
    const toCoords = (coords: Array<[number, number]>) =>
      [...coords, coords[0]].map(([lat, lng]) => [lng, lat]);

    const features = [
      ...lotes.filter(l => l.closed && l.coords.length >= 3).map(l => ({
        type: 'Feature',
        properties: { tipo: 'lote', id: l.id, label: l.label, area_ha: calcPolygonAreaHa(l.coords) },
        geometry: { type: 'Polygon', coordinates: [toCoords(l.coords)] },
      })),
      ...zonas.filter(z => z.closed && z.coords.length >= 3).map(z => ({
        type: 'Feature',
        properties: {
          tipo: z.tipo,
          lote_id: z.loteId,
          num: z.num,
          label: z.tipo === 'siembra' ? `Bloque ${z.num}` : `${CHILD_LABELS[z.tipo]} ${z.num}`,
          area_ha: calcPolygonAreaHa(z.coords),
          plant_count: z.plantCount,
        },
        geometry: { type: 'Polygon', coordinates: [toCoords(z.coords)] },
      })),
    ];

    const fc = { type: 'FeatureCollection', features };
    navigator.clipboard.writeText(JSON.stringify(fc, null, 2)).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    });
  }, [lotes, zonas]);

  // ── Generate mosaic canvas ───────────────────────────────────────────────

  const generateMosaic = useCallback(async () => {
    if (!photos.length) return;
    setGeneratingMosaic(true);
    setMosaicProgress({ done: 0, total: photos.length });

    // Compute bounding box with 5% padding
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of photos) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;
    const padLat = latRange * 0.05;
    const padLng = lngRange * 0.05;
    minLat -= padLat; maxLat += padLat;
    minLng -= padLng; maxLng += padLng;

    // Canvas size
    const maxPx = MOSAIC_RESOLUTION[mosaicResolution];
    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    let canvasW: number, canvasH: number;
    if (lngSpan > latSpan) {
      canvasW = maxPx;
      canvasH = Math.round(maxPx * (latSpan / lngSpan));
    } else {
      canvasH = maxPx;
      canvasW = Math.round(maxPx * (lngSpan / latSpan));
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setGeneratingMosaic(false);
      return;
    }

    // GPS → pixel mapping
    function gpsToPixel(lat: number, lng: number): [number, number] {
      const px = ((lng - minLng) / lngSpan) * canvasW;
      const py = ((maxLat - lat) / latSpan) * canvasH;
      return [px, py];
    }

    const BATCH = 20;
    for (let i = 0; i < photos.length; i += BATCH) {
      const batch = photos.slice(i, i + BATCH);

      await Promise.all(batch.map(async (p) => {
        try {
          const url = URL.createObjectURL(p.file);
          await new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              // Calculate pixel rect from bounds
              const [[bSouth, bWest], [bNorth, bEast]] = p.bounds;
              const [x0, y0] = gpsToPixel(bNorth, bWest); // top-left
              const [x1, y1] = gpsToPixel(bSouth, bEast); // bottom-right
              const dx = x1 - x0;
              const dy = y1 - y0;
              if (dx > 0 && dy > 0) {
                ctx.drawImage(img, x0, y0, dx, dy);
              }
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(); };
            img.src = url;
          });
        } catch {
          // skip failed image
        }
      }));

      setMosaicProgress({ done: Math.min(i + BATCH, photos.length), total: photos.length });
      await new Promise<void>(r => setTimeout(r, 0));
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setGeneratingMosaic(false);
        return;
      }
      if (mosaicUrl) URL.revokeObjectURL(mosaicUrl);
      const url = URL.createObjectURL(blob);
      setMosaicUrl(url);
      setMosaicBounds([[minLat, minLng], [maxLat, maxLng]]);
      setGeneratingMosaic(false);
    }, 'image/jpeg', 0.85);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, mosaicResolution]);

  const clearMosaic = useCallback(() => {
    if (mosaicUrl) URL.revokeObjectURL(mosaicUrl);
    setMosaicUrl(null);
    setMosaicBounds(null);
  }, [mosaicUrl]);

  // ── Procesa un archivo GeoTIFF y devuelve la capa ───────────────────────
  const processGeoTiff = useCallback(async (file: File): Promise<GeoTiffLayer | null> => {
    try {
      const tiff = await fromBlob(file);
      const image = await tiff.getImage();

      const bbox = image.getBoundingBox();
      const geoKeys = image.getGeoKeys();
      const projCSCode: number = (geoKeys as any).ProjectedCSTypeGeoKey || 0;
      const geogCSCode: number = (geoKeys as any).GeographicTypeGeoKey || 4326;
      const epsg = projCSCode || geogCSCode;

      let swLng: number, swLat: number, neLng: number, neLat: number;

      if (epsg === 4326) {
        [swLng, swLat, neLng, neLat] = bbox;
      } else {
        let fromProj: string;
        if (epsg >= 32601 && epsg <= 32660) {
          fromProj = `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
        } else if (epsg >= 32701 && epsg <= 32760) {
          fromProj = `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
        } else if (epsg >= 25828 && epsg <= 25838) {
          fromProj = `+proj=utm +zone=${epsg - 25800} +ellps=GRS80 +units=m +no_defs`;
        } else {
          throw new Error(`CRS EPSG:${epsg} no soportado. Exportá el GeoTIFF en WGS84 (EPSG:4326).`);
        }
        const sw = proj4(fromProj, 'WGS84', [bbox[0], bbox[1]]);
        const ne = proj4(fromProj, 'WGS84', [bbox[2], bbox[3]]);
        [swLng, swLat] = sw;
        [neLng, neLat] = ne;
      }

      const bounds: [[number, number], [number, number]] = [[swLat, swLng], [neLat, neLng]];

      const origW = image.getWidth();
      const origH = image.getHeight();
      const maxPx = 4000;
      const scale = Math.min(1, maxPx / Math.max(origW, origH));
      const dispW = Math.round(origW * scale);
      const dispH = Math.round(origH * scale);

      const rasters = await image.readRasters({ interleave: true, width: dispW, height: dispH }) as unknown as Uint8Array;

      const canvas = document.createElement('canvas');
      canvas.width = dispW;
      canvas.height = dispH;
      const ctx = canvas.getContext('2d')!;
      const samplesPerPixel = image.getSamplesPerPixel();
      const imgData = ctx.createImageData(dispW, dispH);

      for (let i = 0; i < dispW * dispH; i++) {
        const base = i * samplesPerPixel;
        const r = rasters[base + 0];
        const g = rasters[base + 1];
        const b = rasters[base + 2];
        const a = samplesPerPixel >= 4 ? rasters[base + 3] : (r === 0 && g === 0 && b === 0 ? 0 : 255);
        imgData.data[i * 4] = r;
        imgData.data[i * 4 + 1] = g;
        imgData.data[i * 4 + 2] = b;
        imgData.data[i * 4 + 3] = a;
      }
      ctx.putImageData(imgData, 0, 0);

      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(null); return; }
          resolve({
            id: `gtiff-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            url: URL.createObjectURL(blob),
            bounds,
          });
        }, 'image/png');
      });
    } catch (e: unknown) {
      throw new Error('Error al cargar "' + file.name + '": ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  // ── Carga uno o varios GeoTIFF (agrega capas) ───────────────────────────
  const loadGeoTiffs = useCallback(async (files: File[]) => {
    setGeotiffLoading(true);
    setError('');
    setShowInfo(false);

    const newLayers: GeoTiffLayer[] = [];
    for (const file of files) {
      try {
        const layer = await processGeoTiff(file);
        if (layer) newLayers.push(layer);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    if (newLayers.length > 0) {
      setGeotiffLayers(prev => [...prev, ...newLayers]);

      // Centrar mapa en la unión de todos los bounds nuevos
      requestAnimationFrame(() => {
        if (!mapRef.current) return;
        const combined = L.latLngBounds(
          newLayers.flatMap(l => [l.bounds[0], l.bounds[1]])
        );
        mapRef.current.fitBounds(combined.pad(0.1), { animate: false });
      });
    }

    setGeotiffLoading(false);
  }, [processGeoTiff]);

  // ── Inventory ────────────────────────────────────────────────────────────

  const handleIncrement = useCallback((id: string) => {
    setInventory(prev =>
      prev.map(m => (m.id === id ? { ...m, count: m.count + 1 } : m))
    );
  }, []);

  const handleDeleteMarker = useCallback((id: string) => {
    setInventory(prev => prev.filter(m => m.id !== id));
  }, []);

  // ── Derived stats ────────────────────────────────────────────────────────

  const areaHa = calcAreaHa(photos);
  const totalPinas = inventory.reduce((s, m) => s + m.count, 0);
  const showDots = photos.length < 500;

  // ── Render ────────────────────────────────────────────────────────────────

  if (!fsaSupported) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--ink-muted)',
          fontSize: 14,
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <Camera size={32} />
        <p>Esta función requiere Chrome o Edge con soporte de File System Access API.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--surface-deep)',
        overflow: 'hidden',
      }}
    >
      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--line)',
          overflowX: 'auto',
          flexShrink: 0,
          minHeight: 48,
        }}
      >
        {/* Select folder + límite */}
        <button
          className={btnPrimary}
          onClick={scanFolder}
          disabled={scanning}
          style={{ flexShrink: 0 }}
        >
          <FolderOpen size={13} style={{ display: 'inline', marginRight: 5 }} />
          {scanning ? 'Procesando…' : 'Seleccionar DCIM'}
        </button>

        {/* Cargar parcela desde BD */}
        <button
          onClick={() => setShowLoadModal(true)}
          style={{
            flexShrink: 0, padding: '4px 10px', borderRadius: 99, fontSize: 11,
            fontWeight: 700, cursor: 'pointer',
            background: 'transparent', color: '#93c5fd',
            border: '1px solid #1d4ed8',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
          title="Cargar lote y bloques guardados desde la base de datos"
        >
          <ArrowLeft size={11} style={{ transform: 'rotate(180deg)' }} />
          Cargar parcela
        </button>

        {/* Límite smart-scan */}
        {!scanning && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <MapPin size={10} style={{ color: 'var(--ink-faint)' }} />
            <span style={{ color: 'var(--ink-faint)', fontSize: 10 }}>Límite</span>
            <input
              type="number"
              min={50} max={2000} step={50}
              value={smartLimit}
              onChange={(e) => setSmartLimit(Math.max(50, Number(e.target.value)))}
              style={{
                width: 58,
                padding: '1px 5px',
                borderRadius: 5,
                border: '1px solid var(--line)',
                background: 'var(--surface-overlay)',
                color: 'var(--ink)',
                fontSize: 11,
                textAlign: 'center',
              }}
              title="Máximo de fotos a cargar. Si la carpeta tiene más, se toman las más cercanas al centro del vuelo."
            />
          </label>
        )}

        {/* Scan Progress */}
        {scanning && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {scanPhase && (
              <span style={{ color: 'var(--ink-faint)', fontSize: 10, flexShrink: 0 }}>
                {scanPhase}
              </span>
            )}
            <div
              style={{
                width: 120,
                height: 6,
                background: 'var(--surface-overlay)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: scanPhase.includes('1/2') ? '#fb923c' : 'var(--accent)',
                  borderRadius: 3,
                  width:
                    scanProgress.total > 0
                      ? `${Math.round((scanProgress.done / scanProgress.total) * 100)}%`
                      : '0%',
                  transition: 'width 0.15s',
                }}
              />
            </div>
            <span style={{ color: 'var(--ink-muted)', fontSize: 11, flexShrink: 0 }}>
              {scanProgress.done} / {scanProgress.total}
            </span>
          </div>
        )}

        {/* Mosaic progress */}
        {generatingMosaic && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div
              style={{
                width: 140,
                height: 6,
                background: 'var(--surface-overlay)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: '#a78bfa',
                  borderRadius: 3,
                  width:
                    mosaicProgress.total > 0
                      ? `${Math.round((mosaicProgress.done / mosaicProgress.total) * 100)}%`
                      : '0%',
                  transition: 'width 0.15s',
                }}
              />
            </div>
            <span style={{ color: 'var(--ink-muted)', fontSize: 11, flexShrink: 0 }}>
              Generando mosaico… {mosaicProgress.done} / {mosaicProgress.total}
            </span>
          </div>
        )}

        {/* Stats */}
        {!scanning && photos.length > 0 && (
          <span style={{ color: 'var(--ink-muted)', fontSize: 11, flexShrink: 0 }}>
            <Camera size={11} style={{ display: 'inline', marginRight: 4, color: 'var(--accent)' }} />
            {photos.length} fotos GPS
            {ignoredCount > 0 && (
              <span style={{ color: 'var(--ink-faint)', marginLeft: 4 }}>
                ({ignoredCount} sin GPS)
              </span>
            )}{' '}
            · {visibleUrls.size} visibles · Área ≈{' '}
            {areaHa < 1
              ? (areaHa * 10000).toFixed(0) + ' m²'
              : areaHa.toFixed(2) + ' ha'}
          </span>
        )}

        {/* Dividers and toggles */}
        {photos.length > 0 && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--line)', flexShrink: 0 }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <Grid3x3 size={10} style={{ color: 'var(--ink-faint)' }} />
              <span style={{ color: 'var(--ink-muted)', fontSize: 11 }}>Rejilla</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={showPhotos}
                onChange={(e) => setShowPhotos(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <Camera size={10} style={{ color: 'var(--ink-faint)' }} />
              <span style={{ color: 'var(--ink-muted)', fontSize: 11 }}>Fotos</span>
            </label>

            {showPhotos && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ color: 'var(--ink-faint)', fontSize: 10 }}>Opacidad</span>
                <input
                  type="range"
                  min={0.4}
                  max={1.0}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  style={{ width: 80, accentColor: 'var(--accent)' }}
                />
                <span style={{ color: 'var(--ink-muted)', fontSize: 10, width: 26 }}>
                  {Math.round(opacity * 100)}%
                </span>
              </label>
            )}
          </>
        )}

        {/* Mosaic controls */}
        {photos.length > 0 && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--line)', flexShrink: 0 }} />
            {!mosaicUrl ? (
              <button
                onClick={generateMosaic}
                disabled={generatingMosaic}
                style={{
                  flexShrink: 0,
                  padding: '3px 10px',
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: generatingMosaic ? 'not-allowed' : 'pointer',
                  background: 'transparent',
                  color: '#a78bfa',
                  border: '1px solid #6d28d9',
                  opacity: generatingMosaic ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Layers size={11} />
                {generatingMosaic ? 'Generando…' : 'Generar mosaico'}
              </button>
            ) : (
              <button
                onClick={clearMosaic}
                style={{
                  flexShrink: 0,
                  padding: '3px 10px',
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: '#f87171',
                  border: '1px solid #7f1d1d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <X size={11} />
                Limpiar mosaico
              </button>
            )}
          </>
        )}

        {/* ── Controles de dibujo ─────────────────────────────────────── */}
        <div style={{ width: 1, height: 20, background: 'var(--line)', flexShrink: 0 }} />
        {drawMode ? (
          /* Modo dibujo activo */
          <>
            <span style={{
              fontSize: 11, flexShrink: 0, fontWeight: 700,
              color: drawingMode === 'lote' ? LOTE_COLOR : CHILD_COLORS[drawingMode as ChildZoneType],
            }}>
              ✏ {drawingMode === 'lote' ? `Lote ${lotes.length + 1}` : drawingMode === 'siembra' ? `Bloque` : CHILD_LABELS[drawingMode as ChildZoneType]}
              {draftCoords.length > 0 && (
                <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}> · {draftCoords.length} pts</span>
              )}
            </span>
            <button onClick={undoLastPoint} disabled={!draftCoords.length}
              style={{
                flexShrink: 0, padding: '3px 8px', borderRadius: 6, fontSize: 11,
                cursor: draftCoords.length ? 'pointer' : 'not-allowed',
                background: 'transparent', color: 'var(--ink-muted)',
                border: '1px solid var(--line)', opacity: draftCoords.length ? 1 : 0.4,
              }}
            >
              <Undo2 size={11} style={{ display: 'inline', marginRight: 3 }} />Deshacer
            </button>
            <button onClick={cancelDrawing}
              style={{
                flexShrink: 0, padding: '3px 8px', borderRadius: 6, fontSize: 11,
                cursor: 'pointer', background: 'transparent', color: '#fda4af',
                border: '1px solid #9f1239',
              }}
            >
              <X size={11} style={{ display: 'inline', marginRight: 3 }} />Cancelar
            </button>
          </>
        ) : (
          /* Botones de dibujo: primero Lote, luego zonas hijas */
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            {/* Lote */}
            <button
              onClick={() => startDrawing('lote')}
              style={{
                padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', background: 'transparent',
                color: LOTE_COLOR, border: `1px solid ${LOTE_COLOR}88`,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
              title="Dibujar perímetro del lote"
            >
              <span style={{ width: 7, height: 7, borderRadius: 2, background: LOTE_COLOR, display: 'inline-block' }} />
              Lote
            </button>
            {/* Separador */}
            {lotes.length > 0 && (
              <>
                <span style={{ color: 'var(--line)', fontSize: 14 }}>|</span>
                {/* Selector de lote activo si hay más de uno */}
                {lotes.length > 1 && (
                  <select
                    value={activeLoteId ?? ''}
                    onChange={e => setActiveLoteId(e.target.value)}
                    style={{
                      padding: '2px 6px', borderRadius: 6, fontSize: 10,
                      background: 'var(--surface-overlay)', color: 'var(--ink)',
                      border: '1px solid var(--line)', cursor: 'pointer',
                    }}
                    title="Lote activo para zonas hijas"
                  >
                    {lotes.map(l => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                )}
                {/* Zonas hijas */}
                {(Object.entries(CHILD_LABELS) as [ChildZoneType, string][]).map(([tipo, label]) => (
                  <button
                    key={tipo}
                    onClick={() => startDrawing(tipo)}
                    style={{
                      padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', background: 'transparent',
                      color: CHILD_COLORS[tipo],
                      border: `1px solid ${CHILD_COLORS[tipo]}88`,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    title={`Dibujar: ${label}`}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: CHILD_COLORS[tipo], display: 'inline-block' }} />
                    {label}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* GeoTIFF externo — múltiples capas */}
        <div style={{ width: 1, height: 20, background: 'var(--line)', flexShrink: 0 }} />
        <input
          ref={geotiffInputRef}
          type="file"
          accept=".tif,.tiff"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) loadGeoTiffs(files);
            e.target.value = '';
          }}
        />

        {/* Capas GeoTIFF cargadas */}
        {geotiffLayers.map((layer) => (
          <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <FileImage size={10} style={{ color: '#34d399', flexShrink: 0 }} />
            <span style={{ color: '#34d399', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={layer.name}>
              {layer.name}
            </span>
            <button
              onClick={() => {
                URL.revokeObjectURL(layer.url);
                setGeotiffLayers(prev => prev.filter(l => l.id !== layer.id));
              }}
              style={{ color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}
              title="Quitar esta capa"
            >
              <X size={11} />
            </button>
          </div>
        ))}

        {/* Botón cargar (siempre visible — agrega capas) */}
        <button
          onClick={() => geotiffInputRef.current?.click()}
          disabled={geotiffLoading}
          style={{
            flexShrink: 0, padding: '3px 10px', borderRadius: 99, fontSize: 11,
            fontWeight: 700, cursor: geotiffLoading ? 'not-allowed' : 'pointer',
            background: 'transparent', color: '#34d399',
            border: '1px solid #065f46',
            display: 'flex', alignItems: 'center', gap: 4,
            opacity: geotiffLoading ? 0.6 : 1,
          }}
          title="Cargar uno o varios GeoTIFF — se agregan como capas superpuestas"
        >
          <FileImage size={11} />
          {geotiffLoading ? 'Cargando…' : geotiffLayers.length > 0 ? '+ GeoTIFF' : 'Cargar GeoTIFF'}
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Inventory mode toggle */}
        <button
          onClick={() => setInventoryMode(v => !v)}
          style={{
            flexShrink: 0,
            padding: '3px 10px',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            background: inventoryMode ? '#ca8a04' : 'transparent',
            color: inventoryMode ? '#fff' : 'var(--ink-muted)',
            border: inventoryMode ? '1px solid #a16207' : '1px solid var(--line)',
            transition: 'all 0.15s',
          }}
        >
          <Crosshair size={11} style={{ display: 'inline', marginRight: 4 }} />
          {inventoryMode ? 'Inventario ON' : 'Inventario'}
        </button>

        {/* Inventory summary */}
        {inventory.length > 0 && (
          <button
            onClick={() => setShowInventoryPanel(true)}
            style={{
              flexShrink: 0,
              color: 'var(--ink-muted)',
              fontSize: 11,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            <MapPin size={11} style={{ display: 'inline', marginRight: 3, color: '#16a34a' }} />
            {inventory.length} marcadores · {totalPinas} piñas
          </button>
        )}

        {/* Sesión guardada */}
        {sessionSavedAt && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--line)', flexShrink: 0 }} />
            <span
              style={{ fontSize: 10, color: '#34d399', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
              title={`Sesión guardada automáticamente: ${new Date(sessionSavedAt).toLocaleString('es-CR')}`}
            >
              <Save size={9} />
              {sessionRestored ? 'Sesión restaurada' : 'Sesión guardada'}
            </span>
            <button
              onClick={() => {
                if (!window.confirm('¿Limpiar la sesión guardada? Se borrarán los lotes y bloques del navegador.')) return;
                localStorage.removeItem(SESSION_KEY);
                setLotes([]);
                setZonas([]);
                setSessionSavedAt(null);
                setSessionRestored(false);
              }}
              style={{
                flexShrink: 0, padding: '2px 7px', borderRadius: 99, fontSize: 10,
                cursor: 'pointer', background: 'transparent', color: '#f87171',
                border: '1px solid #7f1d1d',
              }}
              title="Borrar sesión guardada y limpiar lotes del mapa"
            >
              <X size={9} style={{ display: 'inline', marginRight: 2 }} />
              Limpiar
            </button>
          </>
        )}

        {/* Settings button */}
        <button
          className={btnSecondary}
          onClick={() => setShowSettings(true)}
          title="Configuración de cámara / FOV / resolución mosaico"
          style={{ flexShrink: 0, padding: '5px 8px' }}
        >
          <Settings size={13} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 12px', background: '#7f1d1d', color: '#fca5a5', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* ── INFO PANEL ──────────────────────────────────────────────────── */}
      {showInfo && (
        <div style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface-raised)',
          fontSize: 11,
          color: 'var(--ink-muted)',
        }}>
          <button
            onClick={() => setShowInfo(false)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '5px 12px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--accent)', fontSize: 11, fontWeight: 600,
            }}
          >
            <span>¿Cómo funciona el mosaico?</span>
            <X size={12} style={{ color: 'var(--ink-faint)' }} />
          </button>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 1px',
            borderTop: '1px solid var(--line)',
          }}>
            {[
              {
                title: '📍 Posicionamiento',
                body: 'Cada foto JPG del dron trae GPS (lat/lon) y altitud en sus metadatos XMP. Con eso calculamos qué área cubre en el suelo usando el ángulo de visión (FOV) de la cámara.',
              },
              {
                title: '🔲 Acoplamiento',
                body: 'Los vuelos DJI se programan con traslape (70–80%). Las fotos se apilan semitransparentes por sus coordenadas — NO es un ortomosaico real (sin corrección de perspectiva ni mezcla de píxeles).',
              },
              {
                title: '⚠️ Ajuste del polígono',
                body: 'Si el dron voló inclinado o el FOV configurado no coincide con la cámara real, el área cubierta puede quedar desplazada o escalada. Ajustá el FOV en ⚙ hasta que las fotos calcen con el terreno.',
              },
            ].map(({ title, body }) => (
              <div key={title} style={{
                padding: '6px 12px',
                background: 'var(--surface-deep)',
                borderRight: '1px solid var(--line)',
              }}>
                <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>{title}</div>
                <div style={{ lineHeight: 1.5 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón para volver a mostrar el info */}
      {!showInfo && (
        <button
          onClick={() => setShowInfo(true)}
          style={{
            position: 'absolute', bottom: 24, left: 12, zIndex: 1000,
            background: 'var(--surface-raised)', border: '1px solid var(--line)',
            color: 'var(--ink-faint)', borderRadius: 6, padding: '3px 8px',
            fontSize: 10, cursor: 'pointer',
          }}
          title="Ver cómo funciona el mosaico"
        >
          ?
        </button>
      )}

      {/* ── LOTES PANEL ─────────────────────────────────────────────────── */}
      <LotesPanel
        lotes={lotes}
        zonas={zonas}
        onDeleteLote={deleteLote}
        onDeleteZona={deleteZona}
        onSaveLote={(lote) => setSavingLote(lote)}
        exportGeoJSON={exportGeoJSON}
        exportCopied={exportCopied}
        savedLoteIds={savedLoteIds}
        onFocusZona={handleFocusZona}
      />

      {/* ── MAP ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          cursor: (inventoryMode || drawMode) ? 'crosshair' : 'default',
        }}
      >
        {/* Hint overlay cuando está dibujando */}
        {drawMode && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              background: 'rgba(0,0,0,0.75)',
              color: '#fde047',
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 12,
              fontWeight: 600,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(253,224,71,0.3)',
            }}
          >
            <PenLine size={12} style={{ display: 'inline', marginRight: 6 }} />
            Dibujando: <strong>
              {drawingMode === 'lote' ? `Lote ${lotes.length + 1}` :
               drawingMode === 'siembra' ? 'Bloque' :
               CHILD_LABELS[drawingMode as ChildZoneType]}
            </strong>
            &nbsp;·&nbsp;
            <span style={{ color: '#d1fae5' }}>Clic</span> = agregar punto
            &nbsp;·&nbsp;
            <span style={{ color: '#fca5a5' }}>Doble clic</span> = cerrar polígono
            {draftCoords.length > 0 && (
              <span style={{ color: 'var(--ink-faint)', marginLeft: 8 }}>
                ({draftCoords.length} punto{draftCoords.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        )}
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={9}
          style={{ position: 'absolute', inset: 0, background: '#111' }}
          zoomControl
        >
          <MapCapture onReady={(m) => { mapRef.current = m; }} />

          <TileLayer
            url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            attribution="&copy; Google Maps"
            maxZoom={21}
          />

          <MapEvents
            onBoundsChange={handleBoundsChange}
            onMapClick={(inventoryMode || drawMode) ? handleMapClick : undefined}
            onMapDblClick={drawMode ? handleMapDblClick : undefined}
          />

          <FitButton photos={photos} />

          {/* Rejilla de footprints */}
          {showGrid &&
            photos.map((p) => (
              <Rectangle
                key={p.name + '_grid'}
                bounds={p.bounds}
                pathOptions={{
                  color: '#22d3ee',
                  weight: 2,
                  fillColor: '#22d3ee',
                  fillOpacity: 0.25,
                  opacity: 0.9,
                }}
              />
            ))}

          {/* Image overlays individuales */}
          {showPhotos &&
            Array.from(visibleUrls.entries()).map(([name, url]) => {
              const photo = photos.find(p => p.name === name);
              if (!photo) return null;
              return (
                <ImageOverlay
                  key={name}
                  url={url}
                  bounds={photo.bounds}
                  opacity={opacity}
                />
              );
            })}

          {/* Mosaic ImageOverlay (generado en app) */}
          {mosaicUrl && mosaicBounds && (
            <ImageOverlay
              key="mosaic"
              url={mosaicUrl}
              bounds={mosaicBounds}
              opacity={opacity}
            />
          )}

          {/* GeoTIFF externo — capas múltiples */}
          {geotiffLayers.map((layer) => (
            <ImageOverlay
              key={layer.id}
              url={layer.url}
              bounds={layer.bounds}
              opacity={opacity}
            />
          ))}

          {/* Dot markers */}
          {showDots &&
            photos.map((p) => (
              <CircleMarker
                key={p.name + '_dot'}
                center={[p.lat, p.lng]}
                radius={4}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: '#f97316',
                  fillOpacity: 0.9,
                  weight: 1,
                }}
              />
            ))}

          {/* Inventory markers */}
          {inventory.length > 0 && (
            <InventoryMarkers
              markers={inventory}
              onIncrement={handleIncrement}
              onDelete={handleDeleteMarker}
            />
          )}

          {/* Lotes (perímetros) */}
          {lotes.filter(l => l.closed && l.coords.length >= 3).map(l => (
            <Polygon
              key={l.id}
              positions={l.coords}
              pathOptions={{
                color: LOTE_COLOR,
                weight: 3,
                fillColor: LOTE_COLOR,
                fillOpacity: 0.05,
                dashArray: '6 4',
              }}
            />
          ))}

          {/* Zonas hijas */}
          {zonas.filter(z => z.closed && z.coords.length >= 3).map(z => {
            const flashing = flashedZonaId === z.id;
            return (
              <Polygon
                key={z.id}
                positions={z.coords}
                pathOptions={{
                  color: CHILD_COLORS[z.tipo],
                  weight: flashing ? 5 : 2,
                  fillColor: CHILD_COLORS[z.tipo],
                  fillOpacity: flashing ? 0.55 : 0.2,
                  opacity: flashing ? 1 : 0.85,
                }}
              />
            );
          })}

          {/* Polígono en progreso */}
          {draftCoords.length >= 2 && (
            <Polyline
              positions={draftCoords}
              pathOptions={{
                color: drawingMode === 'lote' ? LOTE_COLOR :
                       drawingMode ? CHILD_COLORS[drawingMode as ChildZoneType] : '#fde047',
                weight: 2,
                dashArray: '5 5',
              }}
            />
          )}
          {draftCoords.map(([lat, lng], i) => {
            const col = drawingMode === 'lote' ? LOTE_COLOR :
                        drawingMode ? CHILD_COLORS[drawingMode as ChildZoneType] : '#fde047';
            return (
              <CircleMarker
                key={`draft-${i}`}
                center={[lat, lng]}
                radius={5}
                pathOptions={{ color: col, fillColor: col, fillOpacity: 1, weight: 2 }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────── */}
      {showSettings &&
        createPortal(
          <SettingsPanel
            hfovDeg={hfovDeg}
            vfovDeg={vfovDeg}
            mosaicResolution={mosaicResolution}
            onHfov={setHfovDeg}
            onVfov={setVfovDeg}
            onMosaicResolution={setMosaicResolution}
            onClose={() => setShowSettings(false)}
            onRecalc={recalcFootprints}
          />,
          document.body
        )}

      {showInventoryPanel && (
        <InventoryPanel
          markers={inventory}
          onDelete={handleDeleteMarker}
          onClose={() => setShowInventoryPanel(false)}
        />
      )}

      {savingLote && (
        <SaveLoteModal
          lote={savingLote}
          zonas={zonas}
          empresaId={empresaId}
          onClose={() => setSavingLote(null)}
          onSaved={() => {
            setSavedLoteIds(prev => new Set(Array.from(prev).concat(savingLote.id)));
            setSavingLote(null);
          }}
        />
      )}

      {showLoadModal && (
        <LoadParcelaModal
          empresaId={empresaId}
          onClose={() => setShowLoadModal(false)}
          onLoad={(newLote, newZonas) => {
            setLotes(prev => [...prev, newLote]);
            setZonas(prev => [...prev, ...newZonas]);
            setActiveLoteId(newLote.id);
            setShowLoadModal(false);
            // Centrar mapa en el lote cargado
            requestAnimationFrame(() => {
              if (!mapRef.current || newLote.coords.length === 0) return;
              const bounds = L.latLngBounds(newLote.coords);
              mapRef.current.fitBounds(bounds.pad(0.3), { animate: false });
            });
          }}
        />
      )}
    </div>
  );
}
