import React from 'react';
import { X } from 'lucide-react';
import { type AdvancedSettings } from '../utils/sessionManagement';

interface AdvancedSettingsModalProps {
  settings: AdvancedSettings;
  onSettingsChange: (settings: AdvancedSettings) => void;
  onClose: () => void;
}

export function AdvancedSettingsModal({
  settings,
  onSettingsChange,
  onClose,
}: AdvancedSettingsModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface-raised)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 400,
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          border: '1px solid var(--line)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
            ⚙️ Configuración Avanzada
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-muted)',
              padding: 0,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Sección: Resolución */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
            ⚡ Resolución
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['low', 'medium', 'high'] as const).map((res) => (
              <label
                key={res}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: settings.resolution === res ? '1px solid #60a5fa' : '1px solid var(--line)',
                  background: settings.resolution === res ? '#1e40af22' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="radio"
                  name="resolution"
                  value={res}
                  checked={settings.resolution === res}
                  onChange={() => onSettingsChange({ ...settings, resolution: res })}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12, fontWeight: 500 }}>
                  {res === 'low' ? '🚀 Rápido' : res === 'medium' ? '⚖️ Balance' : '🎨 Calidad'}
                </span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 8 }}>
            {settings.resolution === 'low' && 'Menos fotos, procesamiento rápido'}
            {settings.resolution === 'medium' && 'Balance entre calidad y velocidad'}
            {settings.resolution === 'high' && 'Máxima calidad (más lento)'}
          </div>
        </div>

        {/* Sección: Blend Mode */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
            🎨 Modo de Fusión
          </div>
          <select
            value={settings.blendMode}
            onChange={(e) => onSettingsChange({ ...settings, blendMode: e.target.value as any })}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--line)',
              background: 'var(--surface-overlay)',
              color: 'var(--ink)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="normal">Normal - Superposición simple</option>
            <option value="lighten">Lighten - Píxeles más claros</option>
            <option value="overlay">Overlay - Contraste mejorado</option>
            <option value="screen">Screen - Efecto luminoso</option>
          </select>
        </div>

        {/* Sección: JPEG Quality */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
            📊 Calidad JPEG
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range"
              min="50"
              max="100"
              value={settings.jpegQuality}
              onChange={(e) => onSettingsChange({ ...settings, jpegQuality: Number(e.target.value) })}
              style={{
                flex: 1,
                accentColor: 'var(--accent)',
              }}
            />
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink)',
              minWidth: 40,
              textAlign: 'right',
            }}>
              {settings.jpegQuality}%
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 8 }}>
            50% = archivo pequeño | 100% = máxima calidad
          </div>
        </div>

        {/* Sección: Auto-Save */}
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              padding: '8px 0',
            }}
          >
            <input
              type="checkbox"
              checked={settings.autoSave}
              onChange={(e) => onSettingsChange({ ...settings, autoSave: e.target.checked })}
              style={{ cursor: 'pointer', width: 18, height: 18 }}
            />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
              💾 Guardar sesión automáticamente
            </span>
          </label>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6, marginLeft: 28 }}>
            Guardar en historial cada vez que generes un mosaico
          </div>
        </div>

        {/* Footer: Botones */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
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
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-overlay)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-muted)';
            }}
          >
            Cerrar
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: '#60a5fa',
              color: '#ffffff',
              border: 'none',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#3b82f6';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#60a5fa';
            }}
          >
            ✓ Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
