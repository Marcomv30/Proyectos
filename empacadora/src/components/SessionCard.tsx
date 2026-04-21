import React from 'react';
import { Trash2, Edit, Download } from 'lucide-react';
import { type SessionRecord } from '../utils/sessionManagement';

interface SessionCardProps {
  session: SessionRecord;
  onLoad: (session: SessionRecord) => void;
  onEdit: (session: SessionRecord) => void;
  onDelete: (sessionId: string) => void;
}

export function SessionCard({ session, onLoad, onEdit, onDelete }: SessionCardProps) {
  // Formatear fecha
  const createdDate = new Date(session.created_at);
  const dateStr = createdDate.toLocaleDateString('es-CR', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        background: 'var(--bg-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header: nombre + fecha */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            {session.nombre_sesion || `Sesión ${session.sesion_id}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>
            {dateStr}
          </div>
        </div>
      </div>

      {/* Metadata: fotos, resolución, blend mode */}
      {(session.fotos_usadas || session.resolucion || session.blend_mode) && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            fontSize: 11,
            color: 'var(--ink-muted)',
            flexWrap: 'wrap',
          }}
        >
          {session.fotos_usadas && (
            <div>
              📸 {session.fotos_usadas} fotos
            </div>
          )}
          {session.resolucion && (
            <div>
              ⚡ {session.resolucion}
            </div>
          )}
          {session.blend_mode && (
            <div>
              🎨 {session.blend_mode}
            </div>
          )}
        </div>
      )}

      {/* Notas (si existen) */}
      {session.notas && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-faint)',
            fontStyle: 'italic',
            borderLeft: '2px solid var(--line)',
            paddingLeft: 8,
          }}
        >
          {session.notas}
        </div>
      )}

      {/* Botones de acción */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          justifyContent: 'flex-end',
          paddingTop: 4,
          borderTop: '1px solid var(--line)',
        }}
      >
        <button
          onClick={() => onLoad(session)}
          title="Cargar esta sesión"
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            color: '#60a5fa',
            border: '1px solid #1e40af',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#1e40af';
            (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = '#60a5fa';
          }}
        >
          <Download size={11} />
          Cargar
        </button>

        <button
          onClick={() => onEdit(session)}
          title="Editar esta sesión"
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            color: '#a78bfa',
            border: '1px solid #6d28d9',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#6d28d9';
            (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = '#a78bfa';
          }}
        >
          <Edit size={11} />
          Editar
        </button>

        <button
          onClick={() => {
            if (window.confirm(`¿Eliminar sesión "${session.nombre_sesion || session.sesion_id}"?`)) {
              onDelete(session.id);
            }
          }}
          title="Eliminar esta sesión"
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            color: '#f87171',
            border: '1px solid #7f1d1d',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#7f1d1d';
            (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
          }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
