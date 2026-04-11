import React from 'react';

interface ListToolbarProps {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  exports?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export default function ListToolbar({
  search,
  filters,
  exports,
  actions,
  className = '',
}: ListToolbarProps) {
  return (
    <div className={className} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
      {search}
      {filters}
      {exports && <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{exports}</div>}
      {actions}
    </div>
  );
}

