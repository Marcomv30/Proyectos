import React from 'react';

interface BadgeProps {
  activo: boolean;
  labelOn?: string;
  labelOff?: string;
}

export default function Badge({ activo, labelOn = 'Activo', labelOff = 'Inactivo' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      activo ? 'bg-green-900 text-green-300' : 'bg-surface-overlay text-ink-faint'
    }`}>
      {activo ? labelOn : labelOff}
    </span>
  );
}
