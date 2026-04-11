import React from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { btnSecondary } from './ui';

interface ConfirmDialogProps {
  message:   string;
  onConfirm: () => void;
  onCancel:  () => void;
  loading?:  boolean;
}

export default function ConfirmDialog({ message, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-[1px]">
      <div className="rounded-lg shadow-2xl max-w-sm w-full p-5"
        style={{ background: '#101b2e', border: '1px solid #7f1d1d66' }}>
        <div className="flex items-start gap-3 mb-5">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
          <p className="text-sm leading-relaxed" style={{ color: '#d8e3ef' }}>{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className={btnSecondary}>Cancelar</button>
          <button onClick={onConfirm} disabled={loading}
            className="px-4 py-2 rounded text-xs font-semibold transition-colors disabled:opacity-40"
            style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }}>
            {loading ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') return ReactDOM.createPortal(content, document.body);
  return content;
}
