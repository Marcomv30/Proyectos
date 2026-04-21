import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { SessionCard } from './SessionCard';
import { Loader, AlertCircle } from 'lucide-react';
import { type SessionRecord } from '../utils/sessionManagement';

interface SessionHistoryPanelProps {
  empresaId: number;
  onLoad: (session: SessionRecord) => void;
  onEdit: (session: SessionRecord) => void;
}

export function SessionHistoryPanel({ empresaId, onLoad, onEdit }: SessionHistoryPanelProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar sesiones al montar o cuando cambia empresaId
  useEffect(() => {
    loadSessions();
  }, [empresaId]);

  async function loadSessions() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('emp_sesiones_mosaicos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (err) {
        setError(`Error al cargar sesiones: ${err.message}`);
        setSessions([]);
      } else {
        setSessions(data || []);
      }
    } catch (e: any) {
      setError(`Excepción al cargar sesiones: ${e?.message}`);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(sessionId: string) {
    try {
      const { error: err } = await supabase
        .from('emp_sesiones_mosaicos')
        .delete()
        .eq('id', sessionId);

      if (err) {
        alert(`Error al eliminar: ${err.message}`);
      } else {
        // Recargar lista
        setSessions(sessions.filter(s => s.id !== sessionId));
      }
    } catch (e: any) {
      alert(`Excepción: ${e?.message}`);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 0',
      }}
    >
      {/* Header */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
        📋 Historial de Sesiones ({sessions.length})
      </div>

      {/* Loading */}
      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--ink-muted)',
            fontSize: 12,
            padding: '20px 12px',
          }}
        >
          <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
          Cargando sesiones...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            color: '#f87171',
            fontSize: 12,
            padding: '12px',
            background: '#7f1d1d22',
            borderRadius: 6,
            border: '1px solid #7f1d1d',
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{error}</div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && sessions.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--ink-faint)',
            fontStyle: 'italic',
            padding: '20px 12px',
            textAlign: 'center',
          }}
        >
          No hay sesiones guardadas aún. Genera un mosaico para crear una.
        </div>
      )}

      {/* Lista de sesiones */}
      {!loading && !error && sessions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              onLoad={onLoad}
              onEdit={onEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Refresh button */}
      {!loading && (
        <button
          onClick={loadSessions}
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 11,
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
          ⟳ Actualizar
        </button>
      )}
    </div>
  );
}
