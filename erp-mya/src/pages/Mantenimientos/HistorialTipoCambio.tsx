import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';

type TipoCambioRow = {
  id: number;
  fecha: string;
  compra: number;
  venta: number;
  fuente: string;
  updated_at: string;
};

interface HistorialTipoCambioProps {
  empresaId: number;
  canEdit?: boolean;
}

const styles = `
  .tc-wrap { max-width:1180px; margin:0 auto; display:grid; grid-template-columns:360px 1fr; gap:14px; }
  .tc-card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:16px; }
  .tc-title { font-size:14px; font-weight:700; color:#1f2937; margin-bottom:10px; }
  .tc-row { display:flex; flex-direction:column; gap:6px; margin-bottom:10px; }
  .tc-label { font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:.05em; font-weight:600; }
  .tc-input { width:100%; padding:9px 11px; border:1px solid #e5e7eb; border-radius:9px; font-size:13px; }
  .tc-input:focus { outline:none; border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,.12); }
  .tc-btn { border:1px solid #86efac; background:#f0fdf4; color:#15803d; border-radius:9px; padding:8px 12px; font-size:12px; font-weight:700; cursor:pointer; }
  .tc-btn:disabled { opacity:.55; cursor:not-allowed; }
  .tc-btn.sec { border-color:#cbd5e1; background:#f8fafc; color:#334155; }
  .tc-kpi { margin-top:12px; border:1px solid #dbeafe; background:#eff6ff; border-radius:10px; padding:10px 12px; }
  .tc-kpi h4 { margin:0 0 6px; font-size:12px; color:#1e3a8a; text-transform:uppercase; letter-spacing:.04em; }
  .tc-kpi .v { font-size:16px; font-weight:700; font-family:'DM Mono', monospace; color:#1d4ed8; }
  .tc-kpi .meta { font-size:11px; color:#334155; margin-top:2px; }
  .tc-msg { margin-top:10px; padding:9px 10px; border-radius:8px; font-size:12px; border:1px solid #e5e7eb; background:#f8fafc; color:#334155; }
  .tc-table { width:100%; border-collapse:collapse; }
  .tc-table th, .tc-table td { border-bottom:1px solid #f1f5f9; padding:8px; font-size:12px; }
  .tc-table th { background:#f8fafc; color:#64748b; text-transform:uppercase; letter-spacing:.04em; font-size:11px; text-align:left; }
  .tc-num { font-family:'DM Mono', monospace; text-align:right; }
  .tc-empty { font-size:13px; color:#64748b; padding:10px 0; }
  @media (max-width:980px) { .tc-wrap { grid-template-columns:1fr; } }
`;

const todayISO = () => new Date().toISOString().slice(0, 10);
const minusDaysISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export default function HistorialTipoCambio({ empresaId, canEdit = false }: HistorialTipoCambioProps) {
  const [fecha, setFecha] = useState(todayISO());
  const [desde, setDesde] = useState(minusDaysISO(30));
  const [hasta, setHasta] = useState(todayISO());
  const [rows, setRows] = useState<TipoCambioRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const ultimo = useMemo(() => rows[0] || null, [rows]);

  const cargar = async () => {
    setMsg('');
    const { data, error } = await supabase.rpc('get_tipo_cambio_historial', {
      p_empresa_id: empresaId,
      p_fecha_desde: desde || null,
      p_fecha_hasta: hasta || null,
    });
    if (error) {
      setMsg(error.message);
      setRows([]);
      return;
    }
    setRows((data || []) as TipoCambioRow[]);
  };

  useEffect(() => {
    cargar();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const consultarBccrYGuardar = async () => {
    if (!canEdit) return;
    setBusy(true);
    setMsg('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('Sesion expirada. Cierre sesion y vuelva a ingresar.');
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresAt = Number(sessionData.session.expires_at || 0);
      let jwt = sessionData.session.access_token;

      // Refrescar solo cuando el token esta por expirar o ya expiro.
      if (!expiresAt || expiresAt - nowSec <= 60) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session?.access_token) {
          throw new Error('Sesion expirada. Cierre sesion y vuelva a ingresar.');
        }
        jwt = refreshed.session.access_token;
      }

      if (!jwt) {
        throw new Error('No se pudo obtener token de sesion valido.');
      }

      const { data: payload, error: fnError } = await supabase.functions.invoke('bccr-tipo-cambio', {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: {
          fecha,
        },
      });
      if (fnError) {
        let detail = fnError.message || 'No se pudo invocar la funcion bccr-tipo-cambio';
        try {
          const ctx = (fnError as any)?.context;
          if (ctx) {
            const errPayload = await ctx.json();
            detail = String(errPayload?.detail || errPayload?.error || detail);
          }
        } catch {
          // Sin detalle adicional
        }
        // Fallback de diagnostico: request directo para obtener status/body real.
        try {
          const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
          if (supabaseUrl) {
            const dbgResp = await fetch(`${supabaseUrl}/functions/v1/bccr-tipo-cambio`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${jwt}`,
                apikey: process.env.REACT_APP_SUPABASE_ANON_KEY || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ fecha }),
            });
            const dbgText = await dbgResp.text();
            detail = `HTTP ${dbgResp.status}: ${dbgText || detail}`;
          }
        } catch {
          // Mantener detalle original
        }
        throw new Error(detail);
      }
      if (!payload?.ok) throw new Error(payload?.detail || payload?.error || 'No se pudo consultar BCCR');

      const { data: saveData, error: saveError } = await supabase.rpc('set_tipo_cambio_dia', {
        p_empresa_id: empresaId,
        p_fecha: payload.fecha,
        p_compra: payload.compra,
        p_venta: payload.venta,
        p_fuente: 'BCCR',
        p_raw_data: payload,
      });
      if (saveError) throw saveError;

      setMsg(`OK ${saveData?.accion === 'insert' ? 'insertado' : 'actualizado'}: ${payload.fecha} Compra ${payload.compra} / Venta ${payload.venta}`);
      await cargar();
    } catch (e: any) {
      const raw = String(e?.message || '');
      if (/failed to fetch/i.test(raw)) {
        setMsg('No se pudo conectar con la funcion bccr-tipo-cambio. Verifique deploy de la Edge Function y conectividad.');
      } else {
        setMsg(raw || 'Error inesperado');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="tc-wrap">
        <div className="tc-card">
          <div className="tc-title">BCCR - Tipo de Cambio Diario</div>

          <div className="tc-row">
            <label className="tc-label">Fecha a Consultar</label>
            <input className="tc-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="tc-btn" type="button" onClick={consultarBccrYGuardar} disabled={!canEdit || busy}>
              {busy ? 'Consultando...' : 'Consultar y Guardar'}
            </button>
            <button className="tc-btn sec" type="button" onClick={cargar} disabled={busy}>
              Recargar
            </button>
          </div>

          {ultimo && (
            <div className="tc-kpi">
              <h4>Ultimo Registro</h4>
              <div className="v">Compra: {Number(ultimo.compra).toFixed(2)}</div>
              <div className="v">Venta: {Number(ultimo.venta).toFixed(2)}</div>
              <div className="meta">{ultimo.fecha} · {ultimo.fuente}</div>
            </div>
          )}
          {!!msg && <div className="tc-msg">{msg}</div>}
        </div>

        <div className="tc-card">
          <div className="tc-title">Historial</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', marginBottom: '10px' }}>
            <input className="tc-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <input className="tc-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            <button className="tc-btn sec" type="button" onClick={cargar}>Filtrar</button>
          </div>

          {rows.length === 0 ? (
            <div className="tc-empty">Sin datos en el rango seleccionado.</div>
          ) : (
            <table className="tc-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Compra</th>
                  <th>Venta</th>
                  <th>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.fecha}</td>
                    <td className="tc-num money-right">{Number(r.compra).toFixed(2)}</td>
                    <td className="tc-num money-right">{Number(r.venta).toFixed(2)}</td>
                    <td>{r.fuente}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
