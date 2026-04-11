import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, exportExcelXml, exportPdfWithPrint, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';

interface Recipient {
  id: number;
  email: string;
  activo: boolean;
  created_at: string;
}

const styles = `
  .ar-wrap { padding:0; }
  .ar-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; }
  .ar-title { font-size:20px; font-weight:600; color:#1f2937; }
  .ar-title span { font-size:12px; color:#6b7280; margin-left:8px; font-weight:500; }
  .ar-msg-ok { padding:10px 12px; margin-bottom:10px; border-radius:8px; background:#dcfce7; border:1px solid #bbf7d0; color:#166534; font-size:12px; }
  .ar-msg-err { padding:10px 12px; margin-bottom:10px; border-radius:8px; background:#fee2e2; border:1px solid #fecaca; color:#991b1b; font-size:12px; }
  .ar-search { margin-bottom:10px; }
  .ar-add { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; display:grid; grid-template-columns:1fr 140px; gap:10px; margin-bottom:12px; }
  .ar-input { border:1px solid #d1d5db; border-radius:8px; padding:9px 10px; font-size:13px; outline:none; }
  .ar-input:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.12); }
  .ar-btn-add { border:1px solid #86efac; background:#dcfce7; color:#166534; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; }
  .ar-btn-add:disabled { opacity:0.6; cursor:not-allowed; }
  .ar-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }
  .ar-table { width:100%; border-collapse:collapse; }
  .ar-table th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; padding:10px; border-bottom:1px solid #e5e7eb; background:#f9fafb; }
  .ar-table td { font-size:13px; color:#374151; padding:10px; border-bottom:1px solid #f3f4f6; }
  .ar-email { font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .ar-badge { font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px; border:1px solid; display:inline-block; }
  .ar-badge.on { color:#166534; border-color:#bbf7d0; background:#dcfce7; }
  .ar-badge.off { color:#991b1b; border-color:#fecaca; background:#fee2e2; }
  .ar-actions { display:flex; gap:8px; }
  .ar-btn { border:1px solid; border-radius:7px; font-size:11px; font-weight:700; padding:5px 9px; cursor:pointer; }
  .ar-btn.on { color:#166534; border-color:#bbf7d0; background:#dcfce7; }
  .ar-btn.off { color:#9a3412; border-color:#fdba74; background:#ffedd5; }
  .ar-btn.del { color:#991b1b; border-color:#fecaca; background:#fee2e2; }
  .ar-mobile-list { display:none; }
  .ar-row-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin-bottom:8px; }
  .ar-row-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }

  @media (max-width: 620px) {
    .ar-title { font-size:18px; }
    .ar-add { grid-template-columns:1fr; }
    .ar-btn-add { padding:10px 12px; }
    .ar-card { display:none; }
    .ar-mobile-list { display:block; }
    .ar-actions { flex-direction:column; align-items:stretch; }
    .ar-btn { width:100%; text-align:center; }
  }
`;

interface AlertasDestinatariosProps {
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function AlertasDestinatarios({
  canCreate = true,
  canEdit = true,
  canDelete = true
}: AlertasDestinatariosProps) {
  const [rows, setRows] = useState<Recipient[]>([]);
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const rowsFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      (r.email || '').toLowerCase().includes(term) ||
      (r.activo ? 'activo' : 'inactivo').includes(term)
    );
  }, [rows, search]);

  const exportRows = rowsFiltrados.map((r) => ({
    email: r.email,
    estado: r.activo ? 'Activo' : 'Inactivo',
    creado: new Date(r.created_at).toLocaleString('es-CR'),
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'email', title: 'Email', getValue: (row) => row.email, align: 'left', width: '50%' },
    { key: 'estado', title: 'Estado', getValue: (row) => row.estado, width: '20%' },
    { key: 'creado', title: 'Creado', getValue: (row) => row.creado, width: '30%' },
  ];

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('security_alert_recipients')
      .select('*')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      setErr('No se pudieron cargar destinatarios');
      return;
    }
    setRows((data || []) as Recipient[]);
  };

  useEffect(() => {
    load();
  }, []);

  const toastOk = (msg: string) => {
    setOk(msg);
    setTimeout(() => setOk(''), 2200);
  };
  const toastErr = (msg: string) => {
    setErr(msg);
    setTimeout(() => setErr(''), 3000);
  };

  const add = async () => {
    if (!canCreate) return;
    const v = email.trim().toLowerCase();
    if (!v) return;
    setErr('');
    const { error } = await supabase.rpc('upsert_security_alert_recipient', {
      p_email: v,
      p_activo: true,
    });
    if (error) return toastErr(error.message);
    setEmail('');
    toastOk('Destinatario guardado');
    await load();
  };

  const toggle = async (row: Recipient, activo: boolean) => {
    if (!canEdit) return;
    const { error } = await supabase.rpc('set_security_alert_recipient_active', {
      p_id: row.id,
      p_activo: activo,
    });
    if (error) return toastErr(error.message);
    toastOk('Estado actualizado');
    await load();
  };

  const remove = async (row: Recipient) => {
    if (!canDelete) return;
    const { error } = await supabase.rpc('delete_security_alert_recipient', {
      p_id: row.id,
    });
    if (error) return toastErr(error.message);
    toastOk('Destinatario eliminado');
    await load();
  };

  return (
    <>
      <style>{styles}</style>
      <div className="ar-wrap">
        <div className="ar-head">
          <div className="ar-title">Destinatarios de Alertas <span>{rowsFiltrados.length} registros</span></div>
          <ListToolbar
            exports={(
              <>
                <button
                  className="ar-btn on"
                  onClick={() => exportCsv('destinatarios_alertas.csv', exportRows, exportColumns)}
                  disabled={exportRows.length === 0}
                >
                  CSV
                </button>
                <button
                  className="ar-btn on"
                  onClick={() => exportExcelXml('destinatarios_alertas.xls', exportRows, exportColumns)}
                  disabled={exportRows.length === 0}
                >
                  EXCEL
                </button>
                <button
                  className="ar-btn on"
                  onClick={() =>
                    exportPdfWithPrint({
                      title: 'Destinatarios de Alertas',
                      subtitle: `Total: ${exportRows.length} registros`,
                      rows: exportRows,
                      columns: exportColumns,
                    })
                  }
                  disabled={exportRows.length === 0}
                >
                  PDF
                </button>
              </>
            )}
          />
        </div>
        {ok && <div className="ar-msg-ok">{ok}</div>}
        {err && <div className="ar-msg-err">{err}</div>}
        <div className="ar-search">
          <input
            className="ar-input"
            placeholder="Buscar por email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {canCreate && (
          <div className="ar-add">
            <input
              className="ar-input"
              placeholder="correo@dominio.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <button className="ar-btn-add" onClick={add} disabled={!email.trim()}>
              Agregar / Reactivar
            </button>
          </div>
        )}

        <div className="ar-card">
          <table className="ar-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Estado</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rowsFiltrados.map(r => (
                <tr key={r.id}>
                  <td className="ar-email">{r.email}</td>
                  <td>
                    <span className={`ar-badge ${r.activo ? 'on' : 'off'}`}>
                      {r.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>{new Date(r.created_at).toLocaleString('es-CR')}</td>
                  <td>
                    {(canEdit || canDelete) && (
                      <div className="ar-actions">
                        {canEdit && r.activo ? (
                          <button className="ar-btn off" onClick={() => toggle(r, false)}>Desactivar</button>
                        ) : canEdit ? (
                          <button className="ar-btn on" onClick={() => toggle(r, true)}>Activar</button>
                        ) : null}
                        {canDelete && (
                          <button className="ar-btn del" onClick={() => remove(r)}>Eliminar</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rowsFiltrados.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: '18px' }}>
                    Sin destinatarios configurados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="ar-mobile-list">
          {rowsFiltrados.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '18px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              Sin destinatarios configurados
            </div>
          ) : rowsFiltrados.map((r) => (
            <div key={`m-${r.id}`} className="ar-row-card">
              <div className="ar-row-head">
                <span className="ar-email">{r.email}</span>
                <span className={`ar-badge ${r.activo ? 'on' : 'off'}`}>
                  {r.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                {new Date(r.created_at).toLocaleString('es-CR')}
              </div>
              {(canEdit || canDelete) && (
                <div className="ar-actions">
                  {canEdit && r.activo ? (
                    <button className="ar-btn off" onClick={() => toggle(r, false)}>Desactivar</button>
                  ) : canEdit ? (
                    <button className="ar-btn on" onClick={() => toggle(r, true)}>Activar</button>
                  ) : null}
                  {canDelete && (
                    <button className="ar-btn del" onClick={() => remove(r)}>Eliminar</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

