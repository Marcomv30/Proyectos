import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';

type GrupoDuplicado = {
  numero_formato: string;
  cantidad: number;
  ids: number[];
  keep_sugerido_id: number;
};

type AsientoFila = {
  id: number;
  fecha: string;
  descripcion: string;
  moneda: string;
  estado: string;
};

interface AsientosDuplicadosProps {
  empresaId: number;
  canEdit?: boolean;
}

const styles = `
  .dup-wrap { max-width:1200px; margin:0 auto; display:grid; grid-template-columns:330px 1fr; gap:14px; }
  .dup-card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:16px; }
  .dup-title { font-size:14px; font-weight:700; color:#1f2937; margin-bottom:10px; }
  .dup-sub { font-size:12px; color:#6b7280; margin-bottom:12px; }
  .dup-group-btn { width:100%; text-align:left; border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:10px; margin-bottom:8px; cursor:pointer; }
  .dup-group-btn:hover { background:#f8fafc; }
  .dup-group-btn.active { border-color:#22c55e; background:#f0fdf4; }
  .dup-num { font-family:'DM Mono', monospace; font-size:13px; font-weight:700; color:#166534; }
  .dup-count { font-size:11px; color:#6b7280; margin-top:2px; }
  .dup-empty { font-size:13px; color:#64748b; padding:10px 0; }
  .dup-table { width:100%; border-collapse:collapse; }
  .dup-table th, .dup-table td { border-bottom:1px solid #f1f5f9; padding:8px; font-size:12px; }
  .dup-table th { background:#f8fafc; text-align:left; color:#64748b; text-transform:uppercase; letter-spacing:.04em; font-size:11px; }
  .dup-table td:first-child { width:38px; text-align:center; }
  .dup-badge { display:inline-flex; align-items:center; padding:3px 8px; border-radius:7px; font-size:11px; font-weight:600; }
  .dup-badge.CONFIRMADO { background:#dcfce7; color:#15803d; }
  .dup-actions { margin-top:12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .dup-btn { border:1px solid #86efac; background:#f0fdf4; color:#15803d; border-radius:9px; padding:8px 12px; font-size:12px; font-weight:600; cursor:pointer; }
  .dup-btn:disabled { opacity:.55; cursor:not-allowed; }
  .dup-note { font-size:12px; color:#6b7280; }
  .dup-info { margin-top:10px; font-size:12px; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; padding:8px 10px; }
  @media (max-width:980px) { .dup-wrap { grid-template-columns:1fr; } }
`;

export default function AsientosDuplicados({ empresaId, canEdit = false }: AsientosDuplicadosProps) {
  const [grupos, setGrupos] = useState<GrupoDuplicado[]>([]);
  const [selectedNumero, setSelectedNumero] = useState<string>('');
  const [detalle, setDetalle] = useState<AsientoFila[]>([]);
  const [keepId, setKeepId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const grupoSeleccionado = useMemo(
    () => grupos.find((g) => g.numero_formato === selectedNumero) || null,
    [grupos, selectedNumero]
  );

  const cargarGrupos = async () => {
    setLoading(true);
    setMsg('');
    const { data, error } = await supabase.rpc('get_asientos_confirmados_duplicados', {
      p_empresa_id: empresaId,
    });
    if (error) {
      setMsg(error.message);
      setGrupos([]);
      setLoading(false);
      return;
    }
    const rows = (data || []) as GrupoDuplicado[];
    setGrupos(rows);
    if (!selectedNumero && rows.length > 0) setSelectedNumero(rows[0].numero_formato);
    if (selectedNumero && !rows.some((r) => r.numero_formato === selectedNumero)) {
      setSelectedNumero(rows[0]?.numero_formato || '');
    }
    setLoading(false);
  };

  const cargarDetalle = async (g: GrupoDuplicado | null) => {
    if (!g || !g.ids?.length) {
      setDetalle([]);
      setKeepId(null);
      return;
    }
    const { data, error } = await supabase
      .from('asientos')
      .select('id, fecha, descripcion, moneda, estado')
      .in('id', g.ids)
      .order('id');
    if (error) {
      setMsg(error.message);
      setDetalle([]);
      setKeepId(null);
      return;
    }
    setDetalle((data || []) as AsientoFila[]);
    setKeepId(g.keep_sugerido_id || (data?.[0] as any)?.id || null);
  };

  useEffect(() => {
    cargarGrupos();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarDetalle(grupoSeleccionado);
  }, [grupoSeleccionado?.numero_formato]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolverGrupo = async () => {
    if (!grupoSeleccionado || !keepId) return;
    if (!canEdit) return;
    if (!window.confirm(`Se anularan los duplicados de ${grupoSeleccionado.numero_formato} dejando el ID ${keepId}. Desea continuar?`)) return;

    setBusy(true);
    setMsg('');
    const { data, error } = await supabase.rpc('resolver_asientos_duplicados_numero', {
      p_empresa_id: empresaId,
      p_numero_formato: grupoSeleccionado.numero_formato,
      p_keep_id: keepId,
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }
    setMsg(`OK: se anularon ${data?.anulados ?? 0} registros duplicados.`);
    await cargarGrupos();
    setBusy(false);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="dup-wrap">
        <div className="dup-card">
          <div className="dup-title">Asientos Duplicados</div>
          <div className="dup-sub">Solo considera asientos en estado CONFIRMADO.</div>
          {loading && <div className="dup-empty">Cargando...</div>}
          {!loading && grupos.length === 0 && <div className="dup-empty">No hay duplicados.</div>}
          {!loading && grupos.map((g) => (
            <button
              key={g.numero_formato}
              type="button"
              className={`dup-group-btn ${selectedNumero === g.numero_formato ? 'active' : ''}`}
              onClick={() => setSelectedNumero(g.numero_formato)}
            >
              <div className="dup-num">{g.numero_formato}</div>
              <div className="dup-count">{g.cantidad} confirmados</div>
            </button>
          ))}
        </div>

        <div className="dup-card">
          <div className="dup-title">Detalle</div>
          {!grupoSeleccionado && <div className="dup-empty">Seleccione un grupo.</div>}
          {grupoSeleccionado && (
            <>
              <table className="dup-table">
                <thead>
                  <tr>
                    <th>Keep</th>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Descripcion</th>
                    <th>Moneda</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="radio"
                          checked={keepId === r.id}
                          onChange={() => setKeepId(r.id)}
                        />
                      </td>
                      <td>{r.id}</td>
                      <td>{r.fecha}</td>
                      <td>{r.descripcion}</td>
                      <td>{r.moneda}</td>
                      <td><span className={`dup-badge ${r.estado}`}>{r.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="dup-actions">
                <button className="dup-btn" type="button" onClick={resolverGrupo} disabled={!canEdit || busy || !keepId}>
                  {busy ? 'Procesando...' : 'Limpiar Duplicados'}
                </button>
                <button className="dup-btn" type="button" onClick={cargarGrupos} disabled={busy}>
                  Recargar
                </button>
                <span className="dup-note">Se conserva el ID seleccionado y se anulan los demas.</span>
              </div>
            </>
          )}
          {!!msg && <div className="dup-info">{msg}</div>}
        </div>
      </div>
    </>
  );
}

