import React from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
  footer?:  React.ReactNode;
  size?:    'sm' | 'md' | 'lg' | 'xl' | '2xl';
  portal?:  boolean;
}

export default function Modal({ title, onClose, children, footer, size = 'md', portal = true }: ModalProps) {
  const widths = {
    sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-5xl',
  };

  const content = (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/75 backdrop-blur-[1px]" style={{ zIndex: 9999 }}>
      <div className={`bg-surface-raised border border-line rounded-lg shadow-2xl w-full ${widths[size]} max-h-[92vh] flex flex-col`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line shrink-0"
          style={{ background: 'linear-gradient(180deg,#0d1829 0%,#101b2e 100%)' }}>
          <h2 className="text-sm font-semibold text-ink tracking-tight">{title}</h2>
          <button onClick={onClose}
            className="text-ink-faint hover:text-ink-muted transition-colors rounded p-0.5 hover:bg-surface-overlay">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 flex-1">{children}</div>

        {/* Footer opcional */}
        {footer && (
          <div className="px-5 py-3 border-t border-line bg-surface-overlay shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (portal && typeof document !== 'undefined') return ReactDOM.createPortal(content, document.body);
  return content;
}
