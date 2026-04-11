import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';

interface RowAudit {
  fecha_hora: string;
  accion: string;
  usuario: string;
  asiento_id: number | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  moneda: string | null;
  motivo: string | null;
}

interface EmpresaParametrosResp {
  cierre_contable?: {
    activo?: boolean;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
  };
}

const styles = `
  .ac-wrap { padding:0; color:#d6e2ff; }
  .ac-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:14px; }
  .ac-grid { display:grid; grid-template-columns:190px 190px auto 1fr; gap:10px; margin-bottom:14px; }
  .ac-input { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; outline:none; background:#1d2738; color:#f3f7ff; }
  .ac-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .ac-btn { padding:10px 14px; border-radius:10px; border:none; font-size:13px; font-weight:700; cursor:pointer; color:#fff; background:linear-gradient(135deg,#17a34a,#22c55e); }
  .ac-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; overflow:hidden; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .ac-table { width:100%; border-collapse:collapse; }
  .ac-table th { background:#131b2a; padding:10px; font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; text-align:left; }
  .ac-table td { padding:10px; font-size:12px; color:#d6e2ff; border-top:1px solid rgba(137,160,201,0.12); vertical-align:top; }
  .ac-badge { display:inline-flex; align-items:center; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700; }
  .ac-badge.APLICADO { background:#0f2c20; color:#9df4c7; }
  .ac-badge.REVERTIDO { background:#34181c; color:#ffb3bb; }
  .ac-mono { font-family:'DM Mono',monospace; }
  .ac-err { margin-bottom:10px; background:#34181c; border:1px solid #7d2f3a; color:#ffb3bb; border-radius:12px; padding:10px 12px; font-size:12px; }
  .ac-status { margin-bottom:12px; background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:10px 12px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; box-shadow:0 16px 28px rgba(3,8,20,.16); }
  .ac-status-lbl { font-size:12px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
  .ac-status-val { font-size:13px; font-weight:700; }
  .ac-status-open { color:#9df4c7; }
  .ac-status-closed { color:#ffb3bb; }
`;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

export default function AuditoriaCierres({ empresaId }: { empresaId: number }) {
  const now = new Date();
  const [desde, setDesde] = useState(`${now.getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(now.toISOString().slice(0, 10));
  const [rows, setRows] = useState<RowAudit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cierreActual, setCierreActual] = useState<{ activo: boolean; inicio: string | null; fin: string | null }>({
    activo: false,
    inicio: null,
    fin: null,
  });

  const cargarEstadoActual = async () => {
    const { data, error: rpcError } = await supabase.rpc('get_empresa_parametros', { p_empresa_id: empresaId });
    if (rpcError || !data) {
      setCierreActual({ activo: false, inicio: null, fin: null });
      return;
    }
    const parsed = data as EmpresaParametrosResp;
    setCierreActual({
      activo: Boolean(parsed?.cierre_contable?.activo),
      inicio: parsed?.cierre_contable?.fecha_inicio || null,
      fin: parsed?.cierre_contable?.fecha_fin || null,
    });
  };

  const cargar = async () => {
    setLoading(true);
    setError('');
    const [{ data, error: rpcError }] = await Promise.all([
      supabase.rpc('get_auditoria_cierres_contables', {
        p_empresa_id: empresaId,
        p_desde: desde ? `${desde}T00:00:00` : null,
        p_hasta: hasta ? `${hasta}T23:59:59` : null,
      }),
      cargarEstadoActual(),
    ]);
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message || 'No se pudo cargar auditoria de cierres');
      setRows([]);
      return;
    }
    setRows((data || []) as RowAudit[]);
  };

  useEffect(() => {
    cargar();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ac-wrap">
      <style>{styles}</style>
      <div className="ac-title">Auditoria de Cierres</div>
      {error && <div className="ac-err">{error}</div>}

      <div className="ac-status">
        <span className="ac-status-lbl">Estado actual:</span>
        <span className={`ac-status-val ${cierreActual.activo ? 'ac-status-closed' : 'ac-status-open'}`}>
          {cierreActual.activo ? 'CERRADO' : 'ABIERTO'}
        </span>
        <span className="ac-mono">
          {cierreActual.inicio && cierreActual.fin ? `${cierreActual.inicio} a ${cierreActual.fin}` : '-'}
        </span>
      </div>

      <div className="ac-grid">
        <input className="ac-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input className="ac-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button className="ac-btn" onClick={cargar} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
      </div>

      <div className="ac-card">
        <table className="ac-table">
          <thead>
            <tr>
              <th>Fecha/Hora</th>
              <th>Accion</th>
              <th>Usuario</th>
              <th>Rango</th>
              <th>Asiento</th>
              <th>Moneda</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr><td colSpan={7} style={{ padding: 22, textAlign: 'center', color: '#94a3b8' }}>Sin eventos para el rango</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.fecha_hora}-${i}`}>
                <td className="ac-mono">{fmtDateTime(r.fecha_hora)}</td>
                <td><span className={`ac-badge ${r.accion}`}>{r.accion}</span></td>
                <td>{r.usuario || 'SISTEMA'}</td>
                <td className="ac-mono">{(r.fecha_desde || '-') + ' a ' + (r.fecha_hasta || '-')}</td>
                <td className="ac-mono">{r.asiento_id ? `#${r.asiento_id}` : '-'}</td>
                <td className="ac-mono">{r.moneda || '-'}</td>
                <td>{r.motivo || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
