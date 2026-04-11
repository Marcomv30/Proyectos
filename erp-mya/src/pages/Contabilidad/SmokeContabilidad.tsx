import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';

interface SmokeRow {
  issue: string;
  severity: 'INFO' | 'WARN' | 'ERROR' | string;
  total: number;
}

const styles = `
  .sm-wrap { padding:0; color:#d6e2ff; }
  .sm-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:14px; }
  .sm-grid { display:grid; grid-template-columns:170px 170px auto 1fr; gap:10px; margin-bottom:14px; }
  .sm-input { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; outline:none; background:#1d2738; color:#f3f7ff; }
  .sm-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .sm-btn { padding:10px 14px; border-radius:10px; border:none; font-size:13px; font-weight:700; cursor:pointer; color:#fff; background:linear-gradient(135deg,#17a34a,#22c55e); box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .sm-btn:disabled { opacity:.7; cursor:not-allowed; }
  .sm-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; overflow:hidden; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .sm-table { width:100%; border-collapse:collapse; }
  .sm-table th { background:#131b2a; padding:10px; font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; text-align:left; }
  .sm-table td { padding:10px; font-size:13px; color:#d6e2ff; border-top:1px solid rgba(137,160,201,0.12); }
  .sm-right { text-align:right; font-family:'DM Mono',monospace; }
  .sm-badge { display:inline-flex; align-items:center; justify-content:center; min-width:64px; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700; }
  .sm-badge.INFO { background:#1f2f4c; color:#9ec3ff; }
  .sm-badge.WARN { background:#3a302d; color:#ffd9b0; }
  .sm-badge.ERROR { background:#34181c; color:#ffb3bb; }
  .sm-error { margin-bottom:10px; background:#34181c; border:1px solid #7d2f3a; color:#ffb3bb; border-radius:12px; padding:10px 12px; font-size:12px; }
  .sm-empty { padding:24px; text-align:center; color:#8ea3c7; font-size:13px; }
`;

export default function SmokeContabilidad({ empresaId }: { empresaId: number }) {
  const today = new Date();
  const [desde, setDesde] = useState(`${today.getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(today.toISOString().slice(0, 10));
  const [rows, setRows] = useState<SmokeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

  const cargar = async () => {
    if (desde && hasta && desde > hasta) {
      setError('Rango de fechas invalido: "Desde" no puede ser mayor que "Hasta".');
      setRows([]);
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('get_contabilidad_smoke', {
      p_empresa_id: empresaId,
      p_fecha_desde: desde || null,
      p_fecha_hasta: hasta || null,
    });
    if (reqId !== reqRef.current) return;
    if (rpcError) {
      setError(rpcError.message || 'No se pudo ejecutar el smoke contable');
      setRows([]);
    } else {
      setRows((data || []) as SmokeRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => cargar(), 300);
    return () => clearTimeout(t);
  }, [empresaId, desde, hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sm-wrap">
      <style>{styles}</style>
      <div className="sm-title">Smoke Contable</div>

      {error && <div className="sm-error">{error}</div>}

      <div className="sm-grid">
        <input className="sm-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input className="sm-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button className="sm-btn" onClick={cargar} disabled={loading}>{loading ? 'Verificando...' : 'Actualizar'}</button>
      </div>

      <div className="sm-card">
        <table className="sm-table">
          <thead>
            <tr>
              <th style={{ width: '45%' }}>Indicador</th>
              <th style={{ width: '20%' }}>Severidad</th>
              <th className="sm-right" style={{ width: '35%' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && !loading && (
              <tr>
                <td colSpan={3} className="sm-empty">Sin datos para el rango seleccionado</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.issue}>
                <td>{r.issue}</td>
                <td>
                  <span className={`sm-badge ${r.severity}`}>{r.severity}</span>
                </td>
                <td className="sm-right">{Number(r.total || 0).toLocaleString('es-CR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

