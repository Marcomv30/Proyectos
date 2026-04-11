import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import {
  exportCsv as reportExportCsv,
  exportExcelXml,
  exportPdfWithPrint,
  ReportColumn,
} from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';

interface AuditRow {
  id: number;
  created_at: string;
  actor_uid: string | null;
  actor_usuario_id: number | null;
  evento: string;
  entidad: string;
  entidad_id: string | null;
  detalle: any;
  ip: string | null;
  user_agent: string | null;
}

const styles = `
  .sec-wrap { padding:0; }
  .sec-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; }
  .sec-title { font-size:20px; font-weight:600; color:#1f2937; }
  .sec-title span { font-size:12px; color:#6b7280; margin-left:8px; font-weight:500; }
  .sec-actions { display:flex; gap:8px; }
  .btn { border:none; border-radius:8px; font-size:12px; font-weight:600; padding:9px 12px; cursor:pointer; }
  .btn-refresh { background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; }
  .btn-csv { background:#dcfce7; color:#166534; border:1px solid #bbf7d0; }
  .btn-unlock { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
  .btn:disabled { opacity:0.6; cursor:not-allowed; }
  .sec-msg-ok { padding:9px 12px; background:#dcfce7; border:1px solid #bbf7d0; border-radius:8px; color:#166534; font-size:12px; margin-bottom:10px; }
  .sec-msg-err { padding:9px 12px; background:#fee2e2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:12px; margin-bottom:10px; }

  .sec-filters { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:12px; display:grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap:8px; align-items:end; }
  .sec-field label { display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:#6b7280; font-weight:600; }
  .sec-input, .sec-select { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; font-size:13px; outline:none; }
  .sec-input:focus, .sec-select:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.12); }
  .sec-unlock-box { display:flex; gap:8px; align-items:end; }
  .sec-kpis { display:grid; grid-template-columns: repeat(5, minmax(140px, 1fr)); gap:10px; margin-bottom:12px; }
  .sec-kpi { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
  .sec-kpi-label { font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; font-weight:700; margin-bottom:6px; }
  .sec-kpi-value { font-size:24px; font-weight:700; color:#0f172a; line-height:1; }
  .sec-kpi-sub { margin-top:6px; font-size:11px; color:#6b7280; }
  .sec-kpi.high .sec-kpi-value { color:#b91c1c; }
  .sec-kpi.medium .sec-kpi-value { color:#b45309; }
  .sec-kpi.low .sec-kpi-value { color:#166534; }
  .sec-ranked { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:12px; }
  .sec-ranked-title { font-size:12px; font-weight:700; color:#111827; margin-bottom:8px; }
  .sec-ranked-list { display:grid; grid-template-columns:repeat(3, minmax(180px, 1fr)); gap:8px; }
  .sec-ranked-item { border:1px solid #f3f4f6; border-radius:8px; padding:8px; display:flex; justify-content:space-between; align-items:center; font-size:12px; }
  .sec-ranked-user { font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; color:#1f2937; }
  .sec-ranked-count { font-weight:700; color:#b91c1c; }

  .sec-table-wrap { background:#fff; border:1px solid #e5e7eb; border-radius:12px; overflow:auto; }
  .sec-table { width:100%; border-collapse:collapse; min-width:1080px; }
  .sec-table th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; padding:10px; border-bottom:1px solid #e5e7eb; background:#f9fafb; }
  .sec-table td { font-size:12px; color:#374151; padding:10px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
  .sec-mobile-list { display:none; }
  .sec-row-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin-bottom:8px; }
  .sec-row-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .sec-evt { font-weight:700; color:#0f766e; }
  .sec-evt.sev-low { color:#166534; }
  .sec-evt.sev-medium { color:#b45309; }
  .sec-evt.sev-high { color:#b91c1c; }
  .sec-user { font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:11px; }
  .sec-json { max-width:320px; white-space:pre-wrap; word-break:break-word; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:11px; color:#111827; }

  @media (max-width: 980px) {
    .sec-head { flex-wrap:wrap; }
    .sec-actions { width:100%; }
    .sec-filters { grid-template-columns:1fr 1fr; }
    .sec-kpis { grid-template-columns:repeat(2,minmax(140px,1fr)); }
    .sec-ranked-list { grid-template-columns:1fr 1fr; }
  }

  @media (max-width: 620px) {
    .sec-title { font-size:18px; }
    .sec-actions { flex-direction:column; }
    .btn { width:100%; }
    .sec-filters { grid-template-columns:1fr; }
    .sec-unlock-box { flex-direction:column; align-items:stretch; }
    .sec-kpis { grid-template-columns:1fr; }
    .sec-ranked-list { grid-template-columns:1fr; }
    .sec-table-wrap { display:none; }
    .sec-mobile-list { display:block; }
  }
`;

const EVENTOS = [
  '',
  'login_success',
  'login_failed',
  'login_blocked',
  'login_unlocked',
  'roles_permisos_insert',
  'roles_permisos_delete',
  'usuarios_empresas_insert',
  'usuarios_empresas_update',
  'usuarios_empresas_delete',
];

const EVENT_LABELS: Record<string, { es: string; en: string }> = {
  login_success: { es: 'Inicio de sesión exitoso', en: 'Login success' },
  login_failed: { es: 'Inicio de sesión fallido', en: 'Login failed' },
  login_blocked: { es: 'Usuario bloqueado por intentos', en: 'User blocked by attempts' },
  login_unlocked: { es: 'Usuario desbloqueado', en: 'User unlocked' },
  roles_permisos_insert: { es: 'Permiso asignado al rol', en: 'Role permission assigned' },
  roles_permisos_delete: { es: 'Permiso removido del rol', en: 'Role permission removed' },
  usuarios_empresas_insert: { es: 'Asignación usuario-empresa creada', en: 'User-company assignment created' },
  usuarios_empresas_update: { es: 'Asignación usuario-empresa actualizada', en: 'User-company assignment updated' },
  usuarios_empresas_delete: { es: 'Asignación usuario-empresa eliminada', en: 'User-company assignment deleted' },
};

function getEventSeverity(evento: string): 'low' | 'medium' | 'high' {
  if (evento === 'login_blocked') return 'high';
  if (evento === 'login_failed' || evento.endsWith('_delete')) return 'medium';
  return 'low';
}

interface BitacoraSeguridadProps {
  canUnlock?: boolean;
}

export default function BitacoraSeguridad({ canUnlock = true }: BitacoraSeguridadProps) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  const [fEvento, setFEvento] = useState('');
  const [fUsuario, setFUsuario] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [unlockUsername, setUnlockUsername] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [systemLocale] = useState(() => {
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
    return 'es-CR';
  });

  const lang = systemLocale.toLowerCase().startsWith('es') ? 'es' : 'en';

  const eventLabel = (eventCode: string) => {
    if (!eventCode) return lang === 'es' ? 'Todos' : 'All';
    const label = EVENT_LABELS[eventCode];
    if (!label) return eventCode;
    return lang === 'es' ? label.es : label.en;
  };

  const cargar = async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await supabase
      .from('security_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(400);
    setLoading(false);
    if (error) {
      setErr('No se pudo cargar la bitacora de seguridad');
      return;
    }
    setRows((data || []) as AuditRow[]);
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (fEvento && r.evento !== fEvento) return false;
      if (fUsuario && !(r.entidad_id || '').toLowerCase().includes(fUsuario.toLowerCase())) return false;
      if (fFrom && new Date(r.created_at) < new Date(`${fFrom}T00:00:00`)) return false;
      if (fTo && new Date(r.created_at) > new Date(`${fTo}T23:59:59`)) return false;
      return true;
    });
  }, [rows, fEvento, fUsuario, fFrom, fTo]);

  const executive = useMemo(() => {
    const now = new Date();
    const last24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let total = rows.length;
    let failed24 = 0;
    let blocked24 = 0;
    let success24 = 0;
    let critical7 = 0;
    const attacked = new Map<string, number>();

    for (const r of rows) {
      const d = new Date(r.created_at);
      if (d >= last24) {
        if (r.evento === 'login_failed') {
          failed24++;
          const k = (r.entidad_id || 'desconocido').toLowerCase();
          attacked.set(k, (attacked.get(k) || 0) + 1);
        }
        if (r.evento === 'login_blocked') {
          blocked24++;
          const k = (r.entidad_id || 'desconocido').toLowerCase();
          attacked.set(k, (attacked.get(k) || 0) + 1);
        }
        if (r.evento === 'login_success') success24++;
      }
      if (d >= last7 && getEventSeverity(r.evento) === 'high') {
        critical7++;
      }
    }

    const topAttacked = Array.from(attacked.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return { total, failed24, blocked24, success24, critical7, topAttacked };
  }, [rows]);

  const exportRows = filtered.map((r) => ({
    fecha: new Date(r.created_at).toLocaleString(systemLocale),
    evento: eventLabel(r.evento),
    entidad: r.entidad,
    entidad_id: r.entidad_id || '',
    actor_uid: r.actor_uid || '',
    ip: r.ip || '',
    detalle: JSON.stringify(r.detalle || {}),
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'fecha', title: 'Fecha', getValue: (row) => row.fecha, width: '13%' },
    { key: 'evento', title: 'Evento', getValue: (row) => row.evento, align: 'left', width: '19%' },
    { key: 'entidad', title: 'Entidad', getValue: (row) => row.entidad, width: '11%' },
    { key: 'entidad_id', title: 'Entidad ID', getValue: (row) => row.entidad_id, width: '11%' },
    { key: 'actor_uid', title: 'Actor UID', getValue: (row) => row.actor_uid, width: '16%' },
    { key: 'ip', title: 'IP', getValue: (row) => row.ip, width: '10%' },
    { key: 'detalle', title: 'Detalle', getValue: (row) => row.detalle, align: 'left', width: '20%' },
  ];

  const desbloquear = async () => {
    if (!canUnlock) return;
    const key = unlockUsername.trim().toLowerCase();
    if (!key) return;
    setUnlocking(true);
    setErr('');
    setOk('');
    const { error } = await supabase.rpc('unlock_login_guard', { p_username: key });
    setUnlocking(false);
    if (error) {
      setErr(error.message || 'No se pudo desbloquear el usuario');
      return;
    }
    setOk(`Usuario ${key} desbloqueado correctamente`);
    setUnlockUsername('');
    await cargar();
  };

  return (
    <>
      <style>{styles}</style>
      <div className="sec-wrap">
        <div className="sec-head">
          <div className="sec-title">
            Bitácora de Seguridad <span>{filtered.length} eventos</span>
          </div>
          <ListToolbar
            className="sec-actions"
            exports={(
              <>
                <button
                  className="btn btn-csv"
                  onClick={() => reportExportCsv('bitacora_seguridad.csv', exportRows, exportColumns)}
                  disabled={filtered.length === 0}
                >
                  CSV
                </button>
                <button
                  className="btn btn-refresh"
                  onClick={() => exportExcelXml('bitacora_seguridad.xls', exportRows, exportColumns)}
                  disabled={filtered.length === 0}
                >
                  EXCEL
                </button>
                <button
                  className="btn btn-refresh"
                  onClick={() =>
                    exportPdfWithPrint({
                      title: 'Bitacora de Seguridad',
                      subtitle: `Eventos: ${exportRows.length}`,
                      rows: exportRows,
                      columns: exportColumns,
                      orientation: 'landscape',
                    })
                  }
                  disabled={filtered.length === 0}
                >
                  PDF
                </button>
              </>
            )}
            actions={<button className="btn btn-refresh" onClick={cargar} disabled={loading}>Actualizar</button>}
          />
        </div>

        {ok && <div className="sec-msg-ok">{ok}</div>}
        {err && <div className="sec-msg-err">{err}</div>}

        <div className="sec-kpis">
          <div className="sec-kpi">
            <div className="sec-kpi-label">{lang === 'es' ? 'Eventos cargados' : 'Loaded events'}</div>
            <div className="sec-kpi-value">{executive.total}</div>
            <div className="sec-kpi-sub">{lang === 'es' ? 'Base actual de monitoreo' : 'Current monitoring base'}</div>
          </div>
          <div className="sec-kpi medium">
            <div className="sec-kpi-label">{lang === 'es' ? 'Fallos (24h)' : 'Failures (24h)'}</div>
            <div className="sec-kpi-value">{executive.failed24}</div>
            <div className="sec-kpi-sub">{lang === 'es' ? 'Intentos de login fallidos' : 'Failed login attempts'}</div>
          </div>
          <div className="sec-kpi high">
            <div className="sec-kpi-label">{lang === 'es' ? 'Bloqueos (24h)' : 'Blocks (24h)'}</div>
            <div className="sec-kpi-value">{executive.blocked24}</div>
            <div className="sec-kpi-sub">{lang === 'es' ? 'Usuarios bloqueados por fuerza bruta' : 'Users blocked by brute-force'}</div>
          </div>
          <div className="sec-kpi low">
            <div className="sec-kpi-label">{lang === 'es' ? 'Éxitos (24h)' : 'Success (24h)'}</div>
            <div className="sec-kpi-value">{executive.success24}</div>
            <div className="sec-kpi-sub">{lang === 'es' ? 'Logins correctos' : 'Successful logins'}</div>
          </div>
          <div className="sec-kpi high">
            <div className="sec-kpi-label">{lang === 'es' ? 'Críticos (7d)' : 'Critical (7d)'}</div>
            <div className="sec-kpi-value">{executive.critical7}</div>
            <div className="sec-kpi-sub">{lang === 'es' ? 'Eventos severidad alta' : 'High severity events'}</div>
          </div>
        </div>

        <div className="sec-ranked">
          <div className="sec-ranked-title">
            {lang === 'es' ? 'Usuarios más atacados (últimas 24h)' : 'Most attacked users (last 24h)'}
          </div>
          <div className="sec-ranked-list">
            {executive.topAttacked.length === 0 && (
              <div className="sec-ranked-item">
                <span className="sec-ranked-user">{lang === 'es' ? 'Sin actividad de ataque' : 'No attack activity'}</span>
                <span className="sec-ranked-count">0</span>
              </div>
            )}
            {executive.topAttacked.map(([user, count]) => (
              <div key={user} className="sec-ranked-item">
                <span className="sec-ranked-user">{user}</span>
                <span className="sec-ranked-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sec-filters">
          <div className="sec-field">
            <label>Evento</label>
            <select className="sec-select" value={fEvento} onChange={e => setFEvento(e.target.value)}>
              {EVENTOS.map(evt => (
                <option key={evt || 'all'} value={evt}>
                  {eventLabel(evt)}
                </option>
              ))}
            </select>
          </div>
          <div className="sec-field">
            <label>Usuario (entidad_id)</label>
            <input className="sec-input" value={fUsuario} onChange={e => setFUsuario(e.target.value)} placeholder="marco" />
          </div>
          <div className="sec-field">
            <label>Fecha desde</label>
            <input className="sec-input" type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} />
          </div>
          <div className="sec-field">
            <label>Fecha hasta</label>
            <input className="sec-input" type="date" value={fTo} onChange={e => setFTo(e.target.value)} />
          </div>
          {canUnlock && (
            <div className="sec-unlock-box">
              <div className="sec-field" style={{ minWidth: '190px' }}>
                <label>Desbloquear usuario</label>
                <input className="sec-input" value={unlockUsername} onChange={e => setUnlockUsername(e.target.value)} placeholder="username" />
              </div>
              <button className="btn btn-unlock" onClick={desbloquear} disabled={unlocking || !unlockUsername.trim()}>
                Desbloquear
              </button>
            </div>
          )}
        </div>

        <div className="sec-table-wrap rv-desktop-table">
          <table className="sec-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Evento</th>
                <th>Entidad</th>
                <th>Entidad ID</th>
                <th>Actor UID</th>
                <th>IP</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString(systemLocale)}</td>
                  <td className={`sec-evt sev-${getEventSeverity(r.evento)}`}>{eventLabel(r.evento)}</td>
                  <td>{r.entidad}</td>
                  <td className="sec-user">{r.entidad_id || '-'}</td>
                  <td className="sec-user">{r.actor_uid || '-'}</td>
                  <td className="sec-user">{r.ip || '-'}</td>
                  <td className="sec-json">{JSON.stringify(r.detalle || {}, null, 2)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>
                    Sin eventos para los filtros seleccionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="sec-mobile-list rv-mobile-cards">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              Sin eventos para los filtros seleccionados
            </div>
          ) : filtered.map((r) => (
            <div key={`m-${r.id}`} className="sec-row-card">
              <div className="sec-row-head">
                <span style={{ fontSize: '11px', color: '#6b7280' }}>{new Date(r.created_at).toLocaleString(systemLocale)}</span>
                <span className={`sec-evt sev-${getEventSeverity(r.evento)}`}>{eventLabel(r.evento)}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
                <strong>{r.entidad}</strong> · <span className="sec-user">{r.entidad_id || '-'}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
                Actor: <span className="sec-user">{r.actor_uid || '-'}</span> · IP: <span className="sec-user">{r.ip || '-'}</span>
              </div>
              <div className="sec-json">{JSON.stringify(r.detalle || {}, null, 2)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
