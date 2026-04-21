import React, { useRef, useEffect, useState } from 'react';
import { Save, RotateCcw } from 'lucide-react';

interface MosaicEditorPanelProps {
  mosaicUrl: string;
  mosaicBounds?: [[number, number], [number, number]];
  initialEdits?: {
    cropBounds?: [[number, number], [number, number]];
    brightness: number;
    contrast: number;
    saturation: number;
  };
  onSaveEdits: (edits: {
    cropBounds?: [[number, number], [number, number]];
    brightness: number;
    contrast: number;
    saturation: number;
  }) => void;
  onCancel: () => void;
}

export function MosaicEditorPanel({
  mosaicUrl,
  mosaicBounds,
  initialEdits,
  onSaveEdits,
  onCancel,
}: MosaicEditorPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Estado de edits
  const [brightness, setBrightness] = useState(initialEdits?.brightness ?? 0);
  const [contrast, setContrast] = useState(initialEdits?.contrast ?? 0);
  const [saturation, setSaturation] = useState(initialEdits?.saturation ?? 0);
  const [cropBounds, setCropBounds] = useState<[[number, number], [number, number]] | undefined>(
    initialEdits?.cropBounds
  );

  // Estado del crop tool
  const [isDrawingCrop, setIsDrawingCrop] = useState(false);
  const [cropStart, setCropStart] = useState<[number, number] | null>(null);
  const [cropEnd, setCropEnd] = useState<[number, number] | null>(null);

  // Cargar imagen y dibujar preview
  useEffect(() => {
    if (!mosaicUrl || !canvasRef.current) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      redrawCanvas();
    };
    img.src = mosaicUrl;
  }, [mosaicUrl]);

  // Redibujar cuando cambian los sliders
  useEffect(() => {
    redrawCanvas();
  }, [brightness, contrast, saturation, cropBounds]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Establecer tamaño del canvas
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Dibujar imagen
    ctx.drawImage(img, 0, 0);

    // Aplicar crop (oscurecer áreas fuera del crop)
    if (cropBounds) {
      const [[minLat, minLng], [maxLat, maxLng]] = cropBounds;
      const [[fullMinLat, fullMinLng], [fullMaxLat, fullMaxLng]] = mosaicBounds || [
        [0, 0],
        [1, 1],
      ];

      const latSpan = fullMaxLat - fullMinLat;
      const lngSpan = fullMaxLng - fullMinLng;

      // Convertir GPS a pixels
      const x0 = ((minLng - fullMinLng) / lngSpan) * canvas.width;
      const y0 = ((fullMaxLat - maxLat) / latSpan) * canvas.height;
      const x1 = ((maxLng - fullMinLng) / lngSpan) * canvas.width;
      const y1 = ((fullMaxLat - minLat) / latSpan) * canvas.height;

      // Oscurecer fuera del crop
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
      ctx.drawImage(img, 0, 0);
    }

    // Aplicar filters (brightness, contrast, saturation)
    const filterValue = `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%)`;
    canvas.style.filter = filterValue;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCropStart([x, y]);
    setIsDrawingCrop(true);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingCrop || !cropStart) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCropEnd([x, y]);

    // Dibujar preview del crop
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    overlayCanvas.width = rect.width;
    overlayCanvas.height = rect.height;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Dibujar rectángulo
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.rect(
      Math.min(cropStart[0], x),
      Math.min(cropStart[1], y),
      Math.abs(x - cropStart[0]),
      Math.abs(y - cropStart[1])
    );
    ctx.stroke();
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawingCrop || !cropStart || !cropEnd) {
      setIsDrawingCrop(false);
      return;
    }

    // Convertir pixels a GPS bounds
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !mosaicBounds) {
      setIsDrawingCrop(false);
      return;
    }

    const [[fullMinLat, fullMinLng], [fullMaxLat, fullMaxLng]] = mosaicBounds;
    const latSpan = fullMaxLat - fullMinLat;
    const lngSpan = fullMaxLng - fullMinLng;

    const x0 = Math.min(cropStart[0], cropEnd[0]);
    const x1 = Math.max(cropStart[0], cropEnd[0]);
    const y0 = Math.min(cropStart[1], cropEnd[1]);
    const y1 = Math.max(cropStart[1], cropEnd[1]);

    const minLng = fullMinLng + (x0 / canvas.width) * lngSpan;
    const maxLng = fullMinLng + (x1 / canvas.width) * lngSpan;
    const maxLat = fullMaxLat - (y0 / canvas.height) * latSpan;
    const minLat = fullMaxLat - (y1 / canvas.height) * latSpan;

    setCropBounds([[minLat, minLng], [maxLat, maxLng]]);
    setIsDrawingCrop(false);
    setCropStart(null);
    setCropEnd(null);
  };

  const handleReset = () => {
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setCropBounds(undefined);
  };

  const handleSave = () => {
    onSaveEdits({
      cropBounds,
      brightness,
      contrast,
      saturation,
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '12px 0',
      }}
    >
      {/* Instrucciones */}
      <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
        📐 Dibuja un rectángulo en el mosaico para recortar • Usa los sliders para ajustar color
      </div>

      {/* Canvas con mosaico */}
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          border: '1px solid var(--line)',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={() => setIsDrawingCrop(false)}
          style={{
            display: 'block',
            cursor: isDrawingCrop ? 'crosshair' : 'pointer',
            maxWidth: '100%',
            height: 'auto',
          }}
        />
        <canvas
          ref={overlayCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            cursor: isDrawingCrop ? 'crosshair' : 'pointer',
          }}
        />
      </div>

      {/* Sliders de edición */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Brightness */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
            ☀️ Brillo: {brightness > 0 ? '+' : ''}{brightness}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min="-100"
              max="100"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--ink-muted)', minWidth: 30, textAlign: 'right' }}>
              {brightness}
            </span>
          </div>
        </div>

        {/* Contrast */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
            ⚡ Contraste: {contrast > 0 ? '+' : ''}{contrast}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min="-100"
              max="100"
              value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--ink-muted)', minWidth: 30, textAlign: 'right' }}>
              {contrast}
            </span>
          </div>
        </div>

        {/* Saturation */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
            🎨 Saturación: {saturation > 0 ? '+' : ''}{saturation}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min="-100"
              max="100"
              value={saturation}
              onChange={(e) => setSaturation(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--ink-muted)', minWidth: 30, textAlign: 'right' }}>
              {saturation}
            </span>
          </div>
        </div>
      </div>

      {/* Info de crop */}
      {cropBounds && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-muted)',
            padding: '8px 10px',
            background: 'var(--bg-subtle)',
            borderRadius: 6,
            border: '1px solid var(--line)',
          }}
        >
          ✂️ Crop activo: {cropBounds[0][0].toFixed(4)}°, {cropBounds[0][1].toFixed(4)}° →{' '}
          {cropBounds[1][0].toFixed(4)}°, {cropBounds[1][1].toFixed(4)}°
        </div>
      )}

      {/* Botones */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8 }}>
        <button
          onClick={handleReset}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            color: 'var(--ink-muted)',
            border: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ink-faint)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-muted)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line)';
          }}
        >
          <RotateCcw size={12} />
          Reiniciar
        </button>

        <button
          onClick={onCancel}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            color: 'var(--ink-muted)',
            border: '1px solid var(--line)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ink-faint)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-muted)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line)';
          }}
        >
          Cancelar
        </button>

        <button
          onClick={handleSave}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            background: '#60a5fa',
            color: '#ffffff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#3b82f6';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#60a5fa';
          }}
        >
          <Save size={12} />
          Guardar Edits
        </button>
      </div>
    </div>
  );
}
