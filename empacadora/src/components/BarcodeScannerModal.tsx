import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import NotFoundException from '@zxing/library/esm/core/NotFoundException';
import BarcodeFormat from '@zxing/library/esm/core/BarcodeFormat';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import Modal from './Modal';
import { btnPrimary, btnSecondary } from './ui';
import type { IScannerControls } from '@zxing/browser';

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

interface Props {
  onClose: () => void;
  onDetected: (value: string) => void;
}

export default function BarcodeScannerModal({ onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [ready, setReady] = useState(false);
  const [autoMode, setAutoMode] = useState<'zxing' | 'native' | 'manual'>('manual');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Este navegador no permite abrir la camara desde la app.');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            ...( {
              advanced: [
                { focusMode: 'continuous' as any },
                { zoom: 2 as any },
              ],
            } as any ),
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const [videoTrack] = stream.getVideoTracks();
        if (videoTrack?.applyConstraints) {
          try {
            await videoTrack.applyConstraints({
              advanced: [
                { focusMode: 'continuous' as any },
                { exposureMode: 'continuous' as any },
                { whiteBalanceMode: 'continuous' as any },
              ],
            } as any);
          } catch {
            // algunos navegadores ignoran estas mejoras
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }

        if (!videoRef.current) {
          setError('No se pudo preparar el video para escanear.');
          return;
        }

        // ZXing mejora mucho la compatibilidad en PC y navegadores sin BarcodeDetector.
        try {
          const hints = new Map();
          hints.set(DecodeHintType.TRY_HARDER, true);
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.ITF,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
          ]);
          const reader = new BrowserMultiFormatReader(hints);
          zxingReaderRef.current = reader;
          setAutoMode('zxing');
          controlsRef.current = await reader.decodeFromVideoElement(videoRef.current, (result, err) => {
            if (cancelled) return;
            if (result?.getText()) {
              onDetected(result.getText().trim());
              return;
            }
            if (err && !(err instanceof NotFoundException)) {
              setError('La camara esta activa, pero hubo un problema leyendo el codigo. Puede usar ingreso manual o un lector Bluetooth.');
            }
          });
          return;
        } catch {
          // seguimos con fallback nativo si existe
        }

        if (typeof window.BarcodeDetector === 'undefined') {
          setAutoMode('manual');
          setError('La camara esta lista, pero este navegador no soporta deteccion automatica. Puede usar ingreso manual o un lector Bluetooth.');
          return;
        }

        const detector = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'qr_code'],
        });
        setAutoMode('native');

        const scan = async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes?.length) {
              const rawValue = barcodes[0]?.rawValue?.trim();
              if (rawValue) {
                onDetected(rawValue);
                return;
              }
            }
          } catch {
            // seguimos intentando en cuadros siguientes
          }
          window.requestAnimationFrame(scan);
        };

        window.requestAnimationFrame(scan);
      } catch (err: any) {
        setError(err?.message || 'No se pudo iniciar la camara.');
      }
    }

    start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      zxingReaderRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [onDetected]);

  return (
    <Modal title="Escanear codigo de barras" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="rounded-xl overflow-hidden border border-line bg-surface-deep">
          <div className="aspect-video bg-black flex items-center justify-center">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          </div>
        </div>

        <div className="text-xs space-y-1" style={{ color: 'var(--ink-muted)' }}>
          <p>Apunte la camara al codigo del cliente y mantengala estable unos segundos.</p>
          {ready && autoMode === 'zxing' && (
            <p style={{ color: '#4ade80' }}>Deteccion automatica activa (modo compatible).</p>
          )}
          {ready && autoMode === 'native' && (
            <p style={{ color: '#4ade80' }}>Deteccion automatica activa.</p>
          )}
          {ready && autoMode === 'manual' && (
            <p style={{ color: '#fbbf24' }}>
              La camara esta disponible, pero en este navegador puede necesitar ingreso manual o un lector externo.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#451a03', color: '#fed7aa', border: '1px solid #92400e' }}>
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>
            Ingreso manual
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="Pegue o digite el codigo"
              className="flex-1 bg-surface-base border border-line rounded-lg px-3 py-2 text-sm font-mono text-ink"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => manualValue.trim() && onDetected(manualValue.trim())}
              className={btnPrimary}
              disabled={!manualValue.trim()}
            >
              Usar
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className={btnSecondary}>Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}
