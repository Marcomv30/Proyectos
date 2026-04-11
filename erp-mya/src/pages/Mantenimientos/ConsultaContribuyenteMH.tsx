import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { logModuloEvento } from '../../utils/bitacora';

interface ConsultaContribuyenteMHProps {
  canView?: boolean;
  canEdit?: boolean;
  empresaId?: number;
}

interface Actividad {
  codigo: string;
  descripcion: string;
  categoria?: string | null;
}

interface ResultadoMH {
  ok: boolean;
  cedula?: string;
  nombre?: string;
  tipo_identificacion?: string;
  situacion?: string;
  regimen?: string;
  tipo_contribuyente?: string;
  actividades?: Actividad[];
  detail?: string;
  error?: string;
}

interface HistItem {
  cedula: string;
  nombre: string;
  when: string;
}

const styles = `
  .mhc-wrap { padding:0; }
  .mhc-title { font-size:20px; font-weight:600; color:#1f2937; margin-bottom:6px; }
  .mhc-sub { font-size:12px; color:#6b7280; margin-bottom:12px; }
  .mhc-box { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:14px; }
  .mhc-row { display:grid; grid-template-columns:1fr 150px; gap:8px; align-items:center; margin-bottom:10px; }
  .mhc-row-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
  .mhc-input { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:9px 10px; font-size:13px; }
  .mhc-btn { border:1px solid #16a34a; background:#16a34a; color:#fff; border-radius:8px; padding:9px 10px; font-size:13px; font-weight:600; cursor:pointer; }
  .mhc-btn.sec { border-color:#d1d5db; background:#fff; color:#374151; }
  .mhc-btn:disabled { opacity:.7; cursor:not-allowed; }
  .mhc-msg-ok { margin-bottom:10px; border:1px solid #bbf7d0; background:#dcfce7; color:#166534; border-radius:8px; padding:10px 12px; font-size:12px; }
  .mhc-msg-err { margin-bottom:10px; border:1px solid #fecaca; background:#fee2e2; color:#991b1b; border-radius:8px; padding:10px 12px; font-size:12px; }
  .mhc-msg-warn { margin-bottom:10px; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:8px; padding:10px 12px; font-size:12px; }
  .mhc-history { margin-bottom:10px; border:1px solid #e5e7eb; background:#f8fafc; border-radius:10px; padding:8px; }
  .mhc-history-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; }
  .mhc-history-title { font-size:11px; text-transform:uppercase; letter-spacing:.03em; color:#64748b; font-weight:700; }
  .mhc-history-clear { border:1px solid #e5e7eb; background:#fff; color:#64748b; border-radius:7px; padding:4px 8px; font-size:11px; cursor:pointer; }
  .mhc-history-list { display:flex; gap:6px; flex-wrap:wrap; }
  .mhc-history-item { border:1px solid #dbe3ef; background:#fff; border-radius:999px; padding:4px 8px; font-size:12px; cursor:pointer; }
  .mhc-history-item small { color:#64748b; margin-left:5px; }
  .mhc-table { border:1px solid #e5e7eb; border-radius:10px; overflow:auto; margin-top:10px; }
  .mhc-table table { width:100%; border-collapse:collapse; }
  .mhc-table th, .mhc-table td { padding:8px 10px; border-top:1px solid #f1f5f9; font-size:13px; }
  .mhc-table th { background:#f8fafc; color:#64748b; text-transform:uppercase; letter-spacing:.03em; font-size:11px; text-align:left; }
  .mhc-chip { display:inline-flex; align-items:center; border-radius:999px; padding:2px 8px; font-size:10px; font-weight:700; border:1px solid #86efac; color:#15803d; background:#f0fdf4; }
  @media (max-width: 900px) {
    .mhc-row { grid-template-columns:1fr; }
  }
`;

const tipoIdentidadLabel = (code?: string) => {
  const c = String(code || '').trim();
  if (c === '01') return '01 - Persona fisica';
  if (c === '02') return '02 - Persona juridica';
  if (c === '03') return '03 - DIMEX';
  if (c === '04') return '04 - NITE';
  return c || '-';
};

const HISTORY_KEY = 'mya_mh_consulta_hist_v1';

export default function ConsultaContribuyenteMH({ canView = true, canEdit = false, empresaId }: ConsultaContribuyenteMHProps) {
  const [cedula, setCedula] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [data, setData] = useState<ResultadoMH | null>(null);
  const [historial, setHistorial] = useState<HistItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        setHistorial(arr.slice(0, 10));
      }
    } catch {
      // ignore
    }
  }, []);

  const saveHist = (item: HistItem) => {
    const next = [item, ...historial.filter((h) => h.cedula !== item.cedula)].slice(0, 10);
    setHistorial(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const consultar = async () => {
    if (!canView || busy) return;
    const id = String(cedula || '').trim();
    if (!id) {
      setError('Ingrese una cedula para consultar.');
      setData(null);
      return;
    }
    setBusy(true);
    setError('');
    setOk('');
    setData(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error('Sesion expirada. Ingrese de nuevo.');
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresAt = Number(sessionData.session.expires_at || 0);
      let jwt = sessionData.session.access_token;
      if (!expiresAt || expiresAt - nowSec <= 60) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session?.access_token) {
          throw new Error('Sesion expirada. Ingrese de nuevo.');
        }
        jwt = refreshed.session.access_token;
      }
      if (!jwt) throw new Error('No se pudo obtener token de sesion valido.');

      const { data: payload, error: fnError } = await supabase.functions.invoke('mh-contribuyente', {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: { cedula: id },
      });
      if (fnError) {
        let detail = fnError.message || 'No se pudo invocar la funcion mh-contribuyente';
        try {
          const ctx = (fnError as any)?.context;
          if (ctx) {
            const errPayload = await ctx.json();
            detail = String(errPayload?.detail || errPayload?.error || detail);
          }
        } catch {
          // Sin detalle adicional
        }
        try {
          const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
          if (supabaseUrl) {
            const dbgResp = await fetch(`${supabaseUrl}/functions/v1/mh-contribuyente`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${jwt}`,
                apikey: process.env.REACT_APP_SUPABASE_ANON_KEY || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ cedula: id }),
            });
            const dbgText = await dbgResp.text();
            detail = `HTTP ${dbgResp.status}: ${dbgText || detail}`;
          }
        } catch {
          // Mantener detalle original
        }
        throw new Error(detail);
      }
      const result = (payload || {}) as ResultadoMH;
      if (!result.ok) throw new Error(String(result.detail || result.error || 'Consulta MH no exitosa.'));
      setData(result);
      saveHist({
        cedula: String(result.cedula || id),
        nombre: String(result.nombre || '-'),
        when: new Date().toISOString(),
      });
      if (empresaId) {
        void logModuloEvento({
          empresaId,
          modulo: 'mantenimientos',
          accion: 'consulta_mh_contribuyente',
          entidad: 'mh_contribuyente',
          entidadId: String(result.cedula || id),
          descripcion: 'Consulta manual de contribuyente en MH',
          detalle: {
            cedula: String(result.cedula || id),
            nombre: String(result.nombre || ''),
            tipo_identificacion: String(result.tipo_identificacion || ''),
            tipo_contribuyente: String(result.tipo_contribuyente || ''),
            actividades_count: Array.isArray(result.actividades) ? result.actividades.length : 0,
          },
        });
      }
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo consultar MH.'));
    } finally {
      setBusy(false);
    }
  };

  const limpiarHistorial = () => {
    setHistorial([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // ignore
    }
  };

  const usarCedulaEnEmpresa = async () => {
    if (!canEdit || !empresaId || !data?.cedula || busy) return;
    const nuevaCedula = String(data.cedula || '').trim();
    if (!nuevaCedula) return;
    const okConfirm = window.confirm(`Actualizar cedula de la empresa actual a: ${nuevaCedula}?`);
    if (!okConfirm) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      const { error: updErr } = await supabase
        .from('empresas')
        .update({ cedula: nuevaCedula })
        .eq('id', empresaId);
      if (updErr) throw updErr;
      void logModuloEvento({
        empresaId,
        modulo: 'mantenimientos',
        accion: 'actualizar_cedula_empresa',
        entidad: 'empresas',
        entidadId: String(empresaId),
        descripcion: 'Cedula de empresa actualizada desde consulta MH',
        detalle: { cedula_nueva: nuevaCedula },
      });
      setOk(`Cedula de empresa actualizada a ${nuevaCedula}.`);
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo actualizar la cedula de la empresa.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="mhc-wrap">
        <div className="mhc-title">Consulta Contribuyente MH</div>
        <div className="mhc-sub">Herramienta de consulta puntual por cedula. No guarda ni altera datos de empresa.</div>

        <div className="mhc-box">
          {historial.length > 0 ? (
            <div className="mhc-history">
              <div className="mhc-history-head">
                <div className="mhc-history-title">Historial local (navegador)</div>
                <button className="mhc-history-clear" type="button" onClick={limpiarHistorial}>Limpiar</button>
              </div>
              <div className="mhc-history-list">
                {historial.map((h) => (
                  <button
                    key={h.cedula}
                    className="mhc-history-item"
                    type="button"
                    onClick={() => setCedula(h.cedula)}
                    title={h.nombre}
                  >
                    {h.cedula}
                    <small>{h.nombre}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mhc-row">
            <input
              className="mhc-input"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              placeholder="Cedula / identificacion"
              disabled={!canView || busy}
            />
            <button className="mhc-btn" onClick={consultar} disabled={!canView || busy}>
              {busy ? 'Consultando...' : 'Consultar MH'}
            </button>
          </div>

          <div className="mhc-row-actions">
            <button
              className="mhc-btn sec"
              type="button"
              onClick={usarCedulaEnEmpresa}
              disabled={!canEdit || !empresaId || !data?.cedula || busy}
              title="Actualiza la cedula de la empresa activa con la cedula consultada"
            >
              Usar cedula en empresa actual
            </button>
          </div>

          <div className="mhc-msg-warn">
            Advertencia: una nueva consulta puede traer cambios del contribuyente (actividades, regimen o situacion). Revalide periodicamente antes de usar los datos en facturacion.
          </div>

          {ok ? <div className="mhc-msg-ok">{ok}</div> : null}
          {error ? <div className="mhc-msg-err">{error}</div> : null}

          {data ? (
            <>
              <div className="mhc-table">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '18%' }}>Cedula</th>
                      <th>Nombre</th>
                      <th style={{ width: '18%' }}>Tipo Identidad</th>
                      <th style={{ width: '14%' }}>Situacion</th>
                      <th style={{ width: '16%' }}>Regimen</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{data.cedula || '-'}</td>
                      <td>{data.nombre || '-'}</td>
                      <td>{tipoIdentidadLabel(data.tipo_identificacion)}</td>
                      <td>{data.situacion || '-'}</td>
                      <td>{data.regimen || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mhc-table">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>Codigo</th>
                      <th>Actividad Tributaria</th>
                      <th style={{ width: '16%' }}>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.actividades || []).length === 0 ? (
                      <tr><td colSpan={3} style={{ color: '#64748b' }}>Sin actividades reportadas.</td></tr>
                    ) : (
                      (data.actividades || []).map((a, idx) => (
                        <tr key={`${a.codigo}-${idx}`}>
                          <td>{a.codigo || '-'}</td>
                          <td>{a.descripcion || '-'}</td>
                          <td>{idx === 0 ? <span className="mhc-chip">Principal</span> : 'Secundaria'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
