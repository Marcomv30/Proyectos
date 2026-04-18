/**
 * DronImporter.tsx
 * Importa archivos .MRK del dron DJI, genera polígonos GeoJSON por lote
 * y permite guardarlos directo en emp_parcelas.
 *
 * Usa File System Access API (Chrome/Edge) — sin servidor.
 */

import React, { useState, useCallback } from 'react';
import {
  FolderOpen, ScanLine, CheckSquare, Square, Layers,
  ChevronDown, ChevronRight, Save, MapPin, AlertCircle, Info,
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useEmpresaId } from '../../context/EmpresaContext';
import GeoMapPreview from '../../components/GeoMapPreview';
import { btnPrimary, btnSecondary, inputCls, labelCls } from '../../components/ui';

// ── Algoritmos geoespaciales ──────────────────────────────────────────────────

function cross(O: number[], A: number[], B: number[]) {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
}

function convexHull(pts: number[][]): number[][] {
  const points = [...pts].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
  if (points.length <= 1) return points;
  const lower: number[][] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: number[][] = [];
  for (const p of [...points].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function ringAreaHa(ring: number[][]): number {
  if (ring.length < 3) return 0;
  const meanLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const mLon = 111320 * Math.cos((meanLat * Math.PI) / 180);
  const mLat = 111320;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    area += ring[i][0] * mLon * ring[j][1] * mLat - ring[j][0] * mLon * ring[i][1] * mLat;
  }
  return Math.abs(area) / 2 / 10_000;
}

function parseMRK(text: string): number[][] {
  const points: number[][] = [];
  for (const line of text.split('\n')) {
    const latM = line.match(/([\d.]+),Lat/);
    const lonM = line.match(/(-[\d.]+),Lon/);
    if (latM && lonM) points.push([parseFloat(lonM[1]), parseFloat(latM[1])]);
  }
  return points;
}

function buildGeoJSON(allPoints: number[][]): any {
  const hull = convexHull(allPoints);
  const ring = [...hull, hull[0]];
  return { type: 'Polygon', coordinates: [ring] };
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface VueloInfo {
  carpeta: string;
  file: File;
  puntos: number;
  allPoints: number[][];
}

interface LoteResult {
  id: string;
  nombre: string;
  vuelos: VueloInfo[];
  geojson: any;
  hectareas: number;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function DronImporter() {
  const empresaId = useEmpresaId();

  const [scanning, setScanning]       = useState(false);
  const [vuelos, setVuelos]           = useState<VueloInfo[]>([]);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [loteNombre, setLoteNombre]   = useState('');
  const [preview, setPreview]         = useState<LoteResult | null>(null);
  const [lotes, setLotes]             = useState<LoteResult[]>([]);
  const [saving, setSaving]           = useState<string | null>(null);
  const [savedIds, setSavedIds]       = useState<Set<string>>(new Set());
  const [error, setError]             = useState('');
  const [expandedVuelos, setExpandedVuelos] = useState(true);

  const apiSupported = typeof (window as any).showDirectoryPicker === 'function';

  // ── Escanear carpeta ────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    setError('');
    try {
      const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
      setScanning(true);
      setVuelos([]);
      setSelected(new Set());
      setPreview(null);
      setLotes([]);
      setSavedIds(new Set());

      const found: VueloInfo[] = [];

      // Recorrer subcarpetas (nivel 1)
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (handle.kind !== 'directory') continue;
        // Buscar archivo *_Timestamp.MRK dentro
        for await (const [fname, fhandle] of (handle as any).entries()) {
          if (fhandle.kind !== 'file' || !fname.endsWith('_Timestamp.MRK')) continue;
          const file: File = await fhandle.getFile();
          const text = await file.text();
          const pts = parseMRK(text);
          if (pts.length >= 3) {
            found.push({ carpeta: name, file, puntos: pts.length, allPoints: pts });
          }
        }
      }

      found.sort((a, b) => a.carpeta.localeCompare(b.carpeta));
      setVuelos(found);
      if (found.length === 0) setError('No se encontraron archivos MRK en la carpeta seleccionada.');
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Error al leer la carpeta: ' + (e?.message || String(e)));
    } finally {
      setScanning(false);
    }
  }, []);

  // ── Selección ───────────────────────────────────────────────────────────────

  function toggleSelect(carpeta: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(carpeta) ? next.delete(carpeta) : next.add(carpeta);
      return next;
    });
    setPreview(null);
  }

  function selectAll() {
    setSelected(new Set(vuelos.map(v => v.carpeta)));
    setPreview(null);
  }

  function clearAll() {
    setSelected(new Set());
    setPreview(null);
  }

  // ── Generar polígono de los vuelos seleccionados ────────────────────────────

  function generarPoligono() {
    const selVuelos = vuelos.filter(v => selected.has(v.carpeta));
    if (selVuelos.length === 0) { setError('Seleccioná al menos un vuelo.'); return; }

    const allPoints = selVuelos.flatMap(v => v.allPoints);
    const geojson = buildGeoJSON(allPoints);
    const ring = geojson.coordinates[0] as number[][];
    const ha = ringAreaHa(ring);
    const nombre = loteNombre.trim() || selVuelos.map(v => v.carpeta).join(', ');

    const result: LoteResult = {
      id: Date.now().toString(),
      nombre,
      vuelos: selVuelos,
      geojson,
      hectareas: Math.round(ha * 100) / 100,
    };
    setPreview(result);
    setError('');
  }

  // ── Confirmar y agregar al listado ──────────────────────────────────────────

  function confirmarLote() {
    if (!preview) return;
    setLotes(prev => [...prev, preview]);
    setPreview(null);
    setSelected(new Set());
    setLoteNombre('');
  }

  // ── Guardar en Supabase ─────────────────────────────────────────────────────

  async function guardarParcela(lote: LoteResult) {
    setSaving(lote.id);
    setError('');
    try {
      const { error: err } = await supabase.from('emp_parcelas').insert({
        empresa_id: empresaId,
        nombre: lote.nombre,
        hectareas: lote.hectareas,
        geojson: lote.geojson,
        activo: true,
      });
      if (err) throw new Error(err.message);
      setSavedIds(prev => { const next = new Set(prev); next.add(lote.id); return next; });
    } catch (e: any) {
      setError('Error al guardar: ' + (e?.message || String(e)));
    } finally {
      setSaving(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!apiSupported) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <AlertCircle size={40} className="mx-auto mb-3 text-amber-400" />
        <p className="text-sm font-semibold text-amber-300">Esta función requiere Chrome o Edge</p>
        <p className="mt-1 text-xs text-gray-500">
          El explorador de archivos del dron usa la File System Access API, disponible en Chrome 86+ y Edge 86+.
        </p>
      </div>
    );
  }

  const selectedVuelos = vuelos.filter(v => selected.has(v.carpeta));
  const totalPuntosSeleccionados = selectedVuelos.reduce((s, v) => s + v.puntos, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">

      {/* Encabezado */}
      <div className="shrink-0 border-b px-6 py-4" style={{ borderColor: 'var(--emp-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: 'var(--ink)' }}>
              <ScanLine size={20} style={{ color: 'var(--emp-accent)' }} />
              Importar desde Dron
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
              Seleccioná la carpeta DCIM de la tarjeta SD del dron para generar polígonos de lotes.
            </p>
          </div>
          <button onClick={handleScan} disabled={scanning} className={btnPrimary + ' flex items-center gap-2'}>
            <FolderOpen size={15} />
            {scanning ? 'Escaneando...' : 'Seleccionar carpeta DCIM'}
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-800/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Cuerpo */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Panel izquierdo: vuelos detectados */}
        <div className="flex w-[380px] shrink-0 flex-col border-r" style={{ borderColor: 'var(--emp-border)' }}>

          {vuelos.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center" style={{ color: 'var(--ink-faint)' }}>
              <ScanLine size={36} strokeWidth={1} />
              <p className="text-sm">Seleccioná la carpeta DCIM del dron para detectar los vuelos disponibles.</p>
              <div className="mt-2 rounded-lg border px-3 py-2 text-left text-xs" style={{ borderColor: 'var(--emp-border)', color: 'var(--ink-muted)' }}>
                <p className="flex items-center gap-1.5 font-medium"><Info size={11} /> ¿Qué se detecta?</p>
                <p className="mt-1">Archivos <code>*_Timestamp.MRK</code> dentro de subcarpetas de la tarjeta SD del DJI.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Barra de selección */}
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5" style={{ borderColor: 'var(--emp-border)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                  {vuelos.length} vuelo{vuelos.length !== 1 ? 's' : ''} detectado{vuelos.length !== 1 ? 's' : ''}
                </span>
                <div className="flex gap-2 text-xs" style={{ color: 'var(--emp-accent)' }}>
                  <button onClick={selectAll} className="hover:underline">Todos</button>
                  <span style={{ color: 'var(--emp-border)' }}>·</span>
                  <button onClick={clearAll} className="hover:underline">Ninguno</button>
                </div>
              </div>

              {/* Lista de vuelos */}
              <div className="flex-1 overflow-y-auto">
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--ink-faint)' }}
                  onClick={() => setExpandedVuelos(x => !x)}
                >
                  {expandedVuelos ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  Vuelos disponibles
                </button>
                {expandedVuelos && vuelos.map(v => {
                  const isSelected = selected.has(v.carpeta);
                  return (
                    <button
                      key={v.carpeta}
                      onClick={() => toggleSelect(v.carpeta)}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-white/5"
                      style={{ borderTop: '1px solid var(--emp-border)' }}
                    >
                      {isSelected
                        ? <CheckSquare size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--emp-accent)' }} />
                        : <Square size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--ink-faint)' }} />}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium" style={{ color: 'var(--ink)' }}>{v.carpeta}</p>
                        <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{v.puntos.toLocaleString()} fotos con GPS</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Panel generación */}
              {selected.size > 0 && !preview && (
                <div className="shrink-0 border-t p-4 space-y-3" style={{ borderColor: 'var(--emp-border)' }}>
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                    <strong style={{ color: 'var(--ink)' }}>{selected.size}</strong> vuelo{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''} · {totalPuntosSeleccionados.toLocaleString()} fotos
                  </p>
                  <div>
                    <label className={labelCls}>Nombre del lote</label>
                    <input
                      type="text"
                      placeholder="Ej: TIALEZ-63-A"
                      value={loteNombre}
                      onChange={e => setLoteNombre(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <button onClick={generarPoligono} className={btnPrimary + ' w-full flex items-center justify-center gap-2'}>
                    <Layers size={14} />
                    Generar polígono
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Panel derecho: preview + lotes generados */}
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-5 gap-5">

          {/* Preview del polígono en construcción */}
          {preview && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--emp-accent)', boxShadow: '0 0 0 1px var(--emp-accent)20' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--emp-border)', background: 'var(--emp-accent-bg)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--emp-accent-txt)' }}>{preview.nombre}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    {preview.vuelos.length} vuelo{preview.vuelos.length !== 1 ? 's' : ''} · {preview.hectareas} ha · {preview.geojson.coordinates[0].length - 1} vértices
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPreview(null)} className={btnSecondary + ' text-xs py-1.5'}>Cancelar</button>
                  <button onClick={confirmarLote} className={btnPrimary + ' text-xs py-1.5 flex items-center gap-1.5'}>
                    <CheckSquare size={13} />
                    Confirmar lote
                  </button>
                </div>
              </div>
              <GeoMapPreview geojson={preview.geojson} height={340} maxWidthClassName="max-w-full" polygonColor="#4ade80" />
            </div>
          )}

          {/* Lotes confirmados */}
          {lotes.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>
                Lotes listos para guardar
              </p>
              {lotes.map(lote => {
                const saved = savedIds.has(lote.id);
                const isSaving = saving === lote.id;
                return (
                  <div key={lote.id} className="rounded-xl border overflow-hidden" style={{ borderColor: saved ? '#065f46' : 'var(--emp-border)' }}>
                    <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--emp-border)' }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{lote.nombre}</p>
                        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                          {lote.hectareas} ha · {lote.vuelos.length} vuelo{lote.vuelos.length !== 1 ? 's' : ''} · {lote.vuelos.reduce((s, v) => s + v.puntos, 0).toLocaleString()} fotos
                        </p>
                      </div>
                      {saved ? (
                        <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: '#065f46', color: '#6ee7b7' }}>
                          ✓ Guardado en Parcelas
                        </span>
                      ) : (
                        <button
                          onClick={() => guardarParcela(lote)}
                          disabled={isSaving}
                          className={btnPrimary + ' text-xs py-1.5 flex items-center gap-1.5'}
                        >
                          <Save size={13} />
                          {isSaving ? 'Guardando...' : 'Guardar en Parcelas'}
                        </button>
                      )}
                    </div>
                    <GeoMapPreview geojson={lote.geojson} height={280} maxWidthClassName="max-w-full" polygonColor={saved ? '#4ade80' : '#60a5fa'} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Estado vacío */}
          {!preview && lotes.length === 0 && vuelos.length > 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" style={{ color: 'var(--ink-faint)' }}>
              <MapPin size={36} strokeWidth={1} />
              <p className="text-sm">Seleccioná los vuelos del mismo lote y hacé click en <strong style={{ color: 'var(--ink)' }}>Generar polígono</strong>.</p>
              <p className="text-xs">Podés combinar varios vuelos del mismo lote para un polígono más preciso.</p>
            </div>
          )}

          {!preview && lotes.length === 0 && vuelos.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" style={{ color: 'var(--ink-faint)' }}>
              <ScanLine size={48} strokeWidth={1} />
              <p className="text-sm">Conectá la tarjeta SD del dron y seleccioná la carpeta DCIM.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
