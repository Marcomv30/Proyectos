import React from 'react';

type WorkspaceShellProps = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

type WorkspacePanelProps = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
  style?: React.CSSProperties;
};

export function WorkspaceShell({ sidebar, children }: WorkspaceShellProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '290px minmax(0, 1fr)',
      gap: 14,
      alignItems: 'start',
    }}>
      <div style={{ minWidth: 0 }}>{sidebar}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function WorkspaceSidebarSection({ title, subtitle, children, compact = false, style }: WorkspacePanelProps) {
  return (
    <section
      style={{
        background: '#1f2937',
        border: '1px solid #334155',
        borderRadius: 14,
        padding: compact ? 12 : 16,
        marginBottom: 12,
        color: '#e5e7eb',
        ...style,
      }}
    >
      {title ? <div style={{ fontSize: 11, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 6 }}>{title}</div> : null}
      {subtitle ? <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.45 }}>{subtitle}</div> : null}
      {children}
    </section>
  );
}

export function WorkspaceMainPanel({ title, subtitle, children, compact = false, style }: WorkspacePanelProps) {
  return (
    <section
      style={{
        background: '#111827',
        border: '1px solid #1f2937',
        borderRadius: 14,
        padding: compact ? 12 : 16,
        marginBottom: 12,
        color: '#e5e7eb',
        ...style,
      }}
    >
      {title ? <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 6 }}>{title}</div> : null}
      {subtitle ? <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.45 }}>{subtitle}</div> : null}
      {children}
    </section>
  );
}

export function WorkspaceMetric({
  label,
  value,
  accent,
  compact = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  accent?: string;
  compact?: boolean;
}) {
  return (
    <div style={{
      borderTop: '1px solid #334155',
      paddingTop: 10,
      marginTop: 10,
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: compact ? 18 : 22,
        fontWeight: 700,
        color: accent || '#f8fafc',
        lineHeight: 1.2,
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}>{value}</div>
    </div>
  );
}
