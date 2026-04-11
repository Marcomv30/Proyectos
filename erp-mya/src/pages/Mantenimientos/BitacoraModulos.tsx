import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';

interface BitacoraModulosProps {
  empresaId: number;
  canView?: boolean;
}

interface BitacoraModuloRow {
  id: number;
  empresa_id: number;
  modulo: string;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  descripcion: string | null;
  detalle: any;
  created_at: string;
  actor_nombre: string | null;
  actor_username: string | null;
}

const styles = `
  .bm-wrap { padding: 0; }
  .bm-title { font-size:20px; font-weight:600; color:#1f2937; margin-bottom:6px; }
  .bm-sub { font-size:12px; color:#6b7280; margin-bottom:12px; }
  .bm-msg-err { margin-bottom:10px; border:1px solid #fecaca; background:#fee2e2; color:#991b1b; border-radius:8px; padding:10px 12px; font-size:12px; }
  .bm-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
  .bm-filters { display:grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap:8px; margin-bottom:10px; }
  .bm-field { display:flex; flex-direction:column; gap:4px; }
  .bm-field label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .bm-input, .bm-select { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; font-size:13px; }
  .bm-btn { border:1px solid #d1d5db; background:#fff; color:#334155; border-radius:8px; padding:9px 12px; font-size:13px; cursor:pointer; }
  .bm-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
  .bm-actions-left, .bm-actions-right { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .bm-meta { font-size:12px; color:#64748b; }
  .bm-btn:disabled { opacity:.7; cursor:not-allowed; }
  .bm-pager { display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-top:10px; }
  .bm-pager-info { font-size:12px; color:#64748b; min-width:130px; text-align:right; }
  .bm-table { border:1px solid #e5e7eb; border-radius:10px; overflow:auto; }
  .bm-table table { width:100%; border-collapse:collapse; min-width:1040px; }
  .bm-table th, .bm-table td { padding:8px 10px; border-top:1px solid #f1f5f9; font-size:12px; vertical-align:top; }
  .bm-table th { background:#f8fafc; color:#64748b; text-transform:uppercase; letter-spacing:.03em; font-size:11px; text-align:left; }
  .bm-kv { white-space:pre-wrap; word-break:break-word; color:#0f172a; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:11px; max-width:360px; }
  .bm-empty { color:#64748b; padding:14px; text-align:center; font-size:13px; }
  @media (max-width: 980px) {
    .bm-filters { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 680px) {
    .bm-filters { grid-template-columns: 1fr; }
  }
`;

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v || {}, null, 2);
  } catch {
    return '{}';
  }
}

function accionLabel(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  return raw
    .split('_')
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(' ');
}

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export default function BitacoraModulos({ empresaId, canView = true }: BitacoraModulosProps) {
  const [rows, setRows] = useState<BitacoraModuloRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fModulo, setFModulo] = useState('');
  const [fAccion, setFAccion] = useState('');
  const [fText, setFText] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const cargar = async () => {
    if (!canView || !empresaId) return;
    setLoading(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('vw_bitacora_modulos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(500);
    setLoading(false);
    if (qErr) {
      setRows([]);
      setError(qErr.message || 'No se pudo cargar la bitacora por modulos.');
      return;
    }
    setRows((data || []) as BitacoraModuloRow[]);
  };

  useEffect(() => {
    cargar();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const modulos = useMemo(() => {
    return Array.from(new Set(rows.map((r) => String(r.modulo || '')).filter(Boolean))).sort();
  }, [rows]);

  const acciones = useMemo(() => {
    return Array.from(new Set(rows.map((r) => String(r.accion || '')).filter(Boolean))).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = fText.trim().toLowerCase();
    return rows.filter((r) => {
      if (fModulo && r.modulo !== fModulo) return false;
      if (fAccion && r.accion !== fAccion) return false;
      if (fFrom && new Date(r.created_at) < new Date(`${fFrom}T00:00:00`)) return false;
      if (fTo && new Date(r.created_at) > new Date(`${fTo}T23:59:59`)) return false;
      if (!term) return true;
      const haystack = [
        r.modulo,
        r.accion,
        r.entidad,
        r.entidad_id || '',
        r.descripcion || '',
        r.actor_nombre || '',
        r.actor_username || '',
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, fModulo, fAccion, fText, fFrom, fTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [fModulo, fAccion, fText, fFrom, fTo]);

  const exportCsv = () => {
    const headers = ['fecha', 'empresa_id', 'modulo', 'accion', 'entidad', 'entidad_id', 'actor_nombre', 'actor_username', 'descripcion', 'detalle_json'];
    const lines = [
      headers.join(','),
      ...filtered.map((r) => ([
        new Date(r.created_at).toLocaleString('es-CR'),
        r.empresa_id,
        r.modulo,
        r.accion,
        r.entidad,
        r.entidad_id || '',
        r.actor_nombre || '',
        r.actor_username || '',
        r.descripcion || '',
        JSON.stringify(r.detalle || {}),
      ].map(csvEscape).join(','))),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bitacora_modulos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="bm-wrap">
        <div className="bm-title">Bitacora por Modulos</div>
        <div className="bm-sub">Trazabilidad funcional de eventos por empresa. Registros inmutables.</div>
        {error ? <div className="bm-msg-err">{error}</div> : null}
        <div className="bm-card">
          <div className="bm-filters">
            <div className="bm-field">
              <label>Modulo</label>
              <select className="bm-select" value={fModulo} onChange={(e) => setFModulo(e.target.value)}>
                <option value="">Todos</option>
                {modulos.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="bm-field">
              <label>Accion</label>
              <select className="bm-select" value={fAccion} onChange={(e) => setFAccion(e.target.value)}>
                <option value="">Todas</option>
                {acciones.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="bm-field">
              <label>Buscar</label>
              <input className="bm-input" value={fText} onChange={(e) => setFText(e.target.value)} placeholder="Entidad, actor, descripcion..." />
            </div>
            <div className="bm-field">
              <label>Desde</label>
              <input className="bm-input" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>
            <div className="bm-field">
              <label>Hasta</label>
              <input className="bm-input" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
          </div>

          <div className="bm-actions">
            <div className="bm-actions-left">
              <button className="bm-btn" type="button" onClick={cargar} disabled={loading}>
                {loading ? 'Cargando...' : 'Recargar'}
              </button>
              <button className="bm-btn" type="button" onClick={exportCsv} disabled={filtered.length === 0}>
                Exportar CSV
              </button>
            </div>
            <div className="bm-actions-right">
              <span className="bm-meta">Total filtrado: {filtered.length}</span>
            </div>
          </div>

          <div className="bm-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Fecha</th>
                  <th style={{ width: '8%' }}>Empresa</th>
                  <th style={{ width: '10%' }}>Modulo</th>
                  <th style={{ width: '14%' }}>Accion</th>
                  <th style={{ width: '16%' }}>Entidad</th>
                  <th style={{ width: '14%' }}>Actor</th>
                  <th>Descripcion / Detalle</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td className="bm-empty" colSpan={7}>Sin eventos para los filtros seleccionados.</td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleString('es-CR')}</td>
                      <td>{r.empresa_id}</td>
                      <td>{r.modulo || '-'}</td>
                      <td title={r.accion || '-'}>{accionLabel(r.accion)}</td>
                      <td>
                        <div>{r.entidad || '-'}</div>
                        <div style={{ color: '#64748b' }}>{r.entidad_id || '-'}</div>
                      </td>
                      <td>
                        <div>{r.actor_nombre || 'sistema'}</div>
                        <div style={{ color: '#64748b' }}>{r.actor_username || '-'}</div>
                      </td>
                      <td>
                        <div>{r.descripcion || '-'}</div>
                        <div className="bm-kv">{prettyJson(r.detalle)}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bm-pager">
            <button className="bm-btn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
              Anterior
            </button>
            <span className="bm-pager-info">Pagina {safePage} de {totalPages}</span>
            <button className="bm-btn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
