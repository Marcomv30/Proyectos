import React, { useEffect, useMemo, useState } from 'react';
import { WorkspaceMainPanel, WorkspaceMetric, WorkspaceShell, WorkspaceSidebarSection } from '../../components/WorkspaceShell';
import { supabase } from '../../supabase';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Props {
  empresaId: number;
  canEdit?: boolean;
}

interface ExoneracionCabys {
  cabys: string;
  detalle: string;
  iva: number;
}

interface ExoneracionConsulta {
  autorizacion: string;
  identificacion: string;
  nombre_contribuyente: string;
  nombre_institucion: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  porcentaje_exoneracion: number;
  tipo_autorizacion: string;
  tipo_documento_codigo: string;
  tipo_documento_descripcion: string;
  tipo_autorizacion_descripcion?: string;
  posee_cabys: boolean;
  cabys: ExoneracionCabys[];
}

interface ExoneracionRow {
  id: number;
  autorizacion: string;
  identificacion: string | null;
  nombre_contribuyente: string | null;
  nombre_institucion: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  porcentaje_exoneracion: number;
  tipo_autorizacion: string | null;
  tipo_documento_codigo: string | null;
  tipo_documento_descripcion: string | null;
  posee_cabys: boolean;
  vigente: boolean;
  cabys_count: number;
}

const styles = `
  .fex-wrap { color:#e5e7eb; }
  .fex-title { font-size:28px; font-weight:800; color:#f8fafc; margin-bottom:6px; }
  .fex-sub { font-size:13px; color:#94a3b8; margin-bottom:18px; }
  .fex-row { display:grid; grid-template-columns: 240px minmax(0,1fr) 180px 180px; gap:10px; align-items:end; }
  .fex-field { display:flex; flex-direction:column; gap:6px; }
  .fex-field label { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#93c5fd; font-weight:700; }
  .fex-input { width:100%; border:1px solid #334155; background:#1f2937; color:#f8fafc; border-radius:10px; padding:10px 12px; font-size:13px; outline:none; }
  .fex-input:focus { border-color:#38bdf8; box-shadow:0 0 0 1px rgba(56,189,248,.25); }
  .fex-btn { border-radius:10px; padding:10px 14px; font-size:13px; font-weight:700; cursor:pointer; border:1px solid #334155; background:#1f2937; color:#e5e7eb; }
  .fex-btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
  .fex-btn.success { background:#16a34a; border-color:#16a34a; color:#fff; }
  .fex-btn:disabled { opacity:.65; cursor:not-allowed; }
  .fex-msg-ok, .fex-msg-err, .fex-msg-warn { border-radius:10px; padding:10px 12px; font-size:12px; margin-bottom:12px; }
  .fex-msg-ok { border:1px solid #14532d; background:#052e16; color:#86efac; }
  .fex-msg-err { border:1px solid #7f1d1d; background:#2b1111; color:#fca5a5; }
  .fex-msg-warn { border:1px solid #854d0e; background:#2a1b06; color:#fcd34d; }
  .fex-grid { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:12px; margin-top:12px; }
  .fex-box { border:1px solid #243244; background:#0f172a; border-radius:12px; padding:12px; }
  .fex-box-label { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#93c5fd; margin-bottom:6px; font-weight:700; }
  .fex-box-value { font-size:15px; font-weight:700; color:#f8fafc; }
  .fex-table-hint { display:none; font-size:12px; color:#94a3b8; margin:0 0 10px; }
  .fex-table-wrap { overflow:auto; border:1px solid #243244; border-radius:12px; background:#0f172a; touch-action:pan-x; -webkit-overflow-scrolling:touch; }
  .fex-table { width:100%; border-collapse:collapse; }
  .fex-table th, .fex-table td { padding:10px 12px; border-top:1px solid #243244; font-size:13px; vertical-align:top; }
  .fex-table th { text-align:left; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#93c5fd; background:#0f172a; }
  .fex-table td { color:#e5e7eb; }
  .fex-mini { font-size:12px; color:#94a3b8; }
  .fex-chip { display:inline-flex; align-items:center; border-radius:999px; padding:3px 8px; font-size:11px; font-weight:700; }
  .fex-chip.ok { background:#052e16; color:#86efac; border:1px solid #14532d; }
  .fex-chip.bad { background:#2b1111; color:#fca5a5; border:1px solid #7f1d1d; }
  .fex-link { color:#38bdf8; text-decoration:none; font-weight:700; cursor:pointer; }
  .fex-link:hover { text-decoration:underline; }
  .fex-progress { margin:12px 0 14px; border:1px solid #243244; background:#0f172a; border-radius:12px; overflow:hidden; }
  .fex-progress-bar { height:10px; background:linear-gradient(90deg, #2563eb, #38bdf8); transition:width .2s ease; }
  .fex-progress-meta { display:flex; justify-content:space-between; gap:12px; padding:8px 12px 10px; font-size:12px; color:#cbd5e1; }
  @media (max-width: 1200px) {
    .fex-row { grid-template-columns:1fr 1fr; }
  }
  @media (max-width: 760px) {
    .fex-row { grid-template-columns:1fr; }
    .fex-grid { grid-template-columns:1fr; }
    .fex-box { grid-column:auto !important; }
    .fex-table-hint { display:block; }
  }
`;

const normalizeDate = (v?: string | null) => {
  const raw = String(v || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
};

const safeNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pickFirst = (...values: any[]) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

const formatDate = (v?: string | null) => {
  const raw = normalizeDate(v);
  if (!raw) return '-';
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : raw;
};

export default function ExoneracionesMH({ empresaId, canEdit = false }: Props) {
  const [autorizacion, setAutorizacion] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const [consulta, setConsulta] = useState<ExoneracionConsulta | null>(null);
  const [listado, setListado] = useState<ExoneracionRow[]>([]);
  const [cabysGuardados, setCabysGuardados] = useState<Record<number, ExoneracionCabys[]>>({});
  const [cabysSearch, setCabysSearch] = useState('');
  const [cabysGuardadosSearch, setCabysGuardadosSearch] = useState<Record<number, string>>({});
  const [cabysProgress, setCabysProgress] = useState<{ current: number; total: number; codigo: string } | null>(null);

  const cargarListado = async () => {
    const { data, error } = await supabase
      .from('vw_fe_exoneraciones')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
      return;
    }
    setListado((data || []) as ExoneracionRow[]);
  };

  useEffect(() => {
    void cargarListado();
  }, [empresaId]);

  const vencida = useMemo(() => {
    if (!consulta?.fecha_vencimiento) return false;
    return normalizeDate(consulta.fecha_vencimiento) < new Date().toISOString().slice(0, 10);
  }, [consulta]);

  const consultar = async () => {
    const numero = autorizacion.trim();
    if (!numero || busy) return;
    setBusy(true);
    setOk('');
    setError('');
    setConsulta(null);
    setCabysProgress(null);
    try {
      const resp = await fetch(`${API}/api/facturacion/exoneracion?autorizacion=${encodeURIComponent(numero)}`);
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'No se pudo consultar la exoneracion en Hacienda.');
      }

      const ex = data.exoneracion || {};
      const contrib = data.contribuyente || {};
      const rawCabys = Array.isArray(ex?._cabys?.array)
        ? ex._cabys.array
        : Array.isArray(ex?.cabys)
          ? ex.cabys
          : [];

      const cabysDetails: ExoneracionCabys[] = [];
      const totalCabys = rawCabys.length;
      let currentCabys = 0;
      for (const code of rawCabys) {
        const cabysCode = String(code || '').trim();
        if (!cabysCode) continue;
        currentCabys += 1;
        setCabysProgress({ current: currentCabys, total: totalCabys, codigo: cabysCode });
        let detalle = '';
        let iva = 0;
        try {
          const cabysResp = await fetch(`${API}/api/cabys?codigo=${encodeURIComponent(cabysCode)}`);
          const cabysData = await cabysResp.json();
          const item = Array.isArray(cabysData?.items) ? cabysData.items[0] : null;
          if (item) {
            detalle = String(item.descripcion || '');
            iva = safeNumber(item.impuesto);
          }
        } catch {
        }
        cabysDetails.push({ cabys: cabysCode, detalle, iva });
      }

      setConsulta({
        autorizacion: String(pickFirst(ex?._autorizacion, ex?.autorizacion, ex?.Autorizacion, numero) || numero),
        identificacion: String(pickFirst(ex?._identificacion, ex?.identificacion, ex?.Identificacion, contrib?._identificacion, contrib?._numeroIdentificacion, contrib?.identificacion, contrib?.numeroIdentificacion, '') || ''),
        nombre_contribuyente: String(pickFirst(contrib?._nombre, contrib?.nombre, contrib?.Nombre, ex?._nombre, ex?.nombre, ex?.Nombre, '') || ''),
        nombre_institucion: String(pickFirst(ex?._nombreInstitucion, ex?._nombreinstitucion, ex?.nombreInstitucion, ex?.NombreInstitucion, '') || ''),
        fecha_emision: normalizeDate(pickFirst(ex?._fechaemision, ex?._fechaEmision, ex?.fechaemision, ex?.fechaEmision, ex?.FechaEmision, ex?.fecha_emision)),
        fecha_vencimiento: normalizeDate(pickFirst(ex?._fechavencimiento, ex?._fechaVencimiento, ex?.fechavencimiento, ex?.fechaVencimiento, ex?.FechaVencimiento, ex?.fecha_vencimiento)),
        porcentaje_exoneracion: safeNumber(pickFirst(ex?._porcentajeExoneracion, ex?._porcentajeexoneracion, ex?.porcentajeExoneracion, ex?.PorcentajeExoneracion, 0)),
        tipo_autorizacion: String(pickFirst(ex?._tipoautorizacion, ex?._tipoAutorizacion, ex?.tipoautorizacion, ex?.tipoAutorizacion, ex?.TipoAutorizacion, '') || ''),
        tipo_documento_codigo: String(pickFirst(ex?._tipodocumento?._codigo, ex?._tipodocumento?.codigo, ex?.tipodocumento?._codigo, ex?.tipodocumento?.codigo, ex?.tipoDocumento?._codigo, ex?.tipoDocumento?.codigo, ex?.TipoDocumento?._codigo, ex?.TipoDocumento?.codigo, '') || ''),
        tipo_documento_descripcion: String(pickFirst(ex?._tipodocumento?._descripcion, ex?._tipodocumento?.descripcion, ex?.tipodocumento?._descripcion, ex?.tipodocumento?.descripcion, ex?.tipoDocumento?._descripcion, ex?.tipoDocumento?.descripcion, ex?.TipoDocumento?._descripcion, ex?.TipoDocumento?.descripcion, '') || ''),
        tipo_autorizacion_descripcion: String(pickFirst(ex?._tipoautorizacionDescripcion, ex?._tipoAutorizacionDescripcion, ex?.tipoautorizacionDescripcion, ex?.tipoAutorizacionDescripcion, ex?.TipoAutorizacionDescripcion, '') || ''),
        posee_cabys: Boolean(pickFirst(ex?._poseeCabys, ex?._poseecabys, ex?.poseeCabys, ex?.PoseeCabys, rawCabys.length > 0)),
        cabys: cabysDetails,
      });
      setOk('Exoneracion consultada correctamente.');
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo consultar la exoneracion.'));
    } finally {
      setCabysProgress(null);
      setBusy(false);
    }
  };

  const guardar = async () => {
    if (!consulta || saving || !canEdit) return;
    setSaving(true);
    setOk('');
    setError('');
    try {
      const payload = {
        empresa_id: empresaId,
        autorizacion: consulta.autorizacion,
        identificacion: consulta.identificacion || null,
        nombre_contribuyente: consulta.nombre_contribuyente || null,
        nombre_institucion: consulta.nombre_institucion || null,
        fecha_emision: consulta.fecha_emision || null,
        fecha_vencimiento: consulta.fecha_vencimiento || null,
        porcentaje_exoneracion: consulta.porcentaje_exoneracion || 0,
        tipo_autorizacion: consulta.tipo_autorizacion || null,
        tipo_documento_codigo: consulta.tipo_documento_codigo || null,
        tipo_documento_descripcion: consulta.tipo_documento_descripcion || null,
        posee_cabys: consulta.posee_cabys,
        payload_json: consulta,
        updated_at: new Date().toISOString(),
      };
      const { data: saved, error: saveErr } = await supabase
        .from('fe_exoneraciones')
        .upsert(payload, { onConflict: 'empresa_id,autorizacion' })
        .select('id')
        .single();
      if (saveErr) throw saveErr;

      const exoneracionId = Number((saved as any)?.id || 0);
      if (!exoneracionId) throw new Error('No se pudo obtener el id de la exoneracion guardada.');

      const { error: delErr } = await supabase
        .from('fe_exoneraciones_cabys')
        .delete()
        .eq('exoneracion_id', exoneracionId);
      if (delErr) throw delErr;

      if (consulta.cabys.length > 0) {
        const cabysUnicos = consulta.cabys.filter((item, index, arr) =>
          arr.findIndex((x) => String(x.cabys || '').trim() === String(item.cabys || '').trim()) === index
        );
        const { error: insErr } = await supabase
          .from('fe_exoneraciones_cabys')
          .insert(
            cabysUnicos.map((item) => ({
              exoneracion_id: exoneracionId,
              cabys: String(item.cabys || '').trim(),
              detalle: item.detalle || null,
              iva: item.iva || 0,
            }))
          );
        if (insErr) throw insErr;
      }

      setOk(`Exoneracion guardada (#${exoneracionId}).`);
      await cargarListado();
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo guardar la exoneracion.'));
    } finally {
      setSaving(false);
    }
  };

  const verCabysGuardados = async (row: ExoneracionRow) => {
    if (cabysGuardados[row.id]) return;
    const { data, error } = await supabase
      .from('fe_exoneraciones_cabys')
      .select('cabys, detalle, iva')
      .eq('exoneracion_id', row.id)
      .order('cabys');
    if (error) {
      setError(error.message);
      return;
    }
    setCabysGuardados((prev) => ({ ...prev, [row.id]: (data || []) as ExoneracionCabys[] }));
  };

  const cabysConsultaFiltrados = useMemo(() => {
    const term = cabysSearch.trim().toLowerCase();
    if (!term || !consulta) return consulta?.cabys || [];
    return (consulta?.cabys || []).filter((item) =>
      String(item.cabys || '').toLowerCase().includes(term) ||
      String(item.detalle || '').toLowerCase().includes(term)
    );
  }, [consulta, cabysSearch]);

  return (
    <>
      <style>{styles}</style>
      <div className="fex-wrap">
        <div className="fex-title">Exoneraciones MH</div>
        <div className="fex-sub">Consulta oficial por numero de autorizacion, guarda encabezado y detalle CABYS para consumo posterior de Facturacion y CXP.</div>

        <WorkspaceShell
          sidebar={
            <>
              <WorkspaceSidebarSection title="Consulta actual" subtitle="Resumen de la ultima exoneracion consultada.">
                <WorkspaceMetric label="Autorizacion" value={consulta?.autorizacion || '-'} accent="#f8fafc" />
                <WorkspaceMetric label="Porcentaje" value={consulta ? `${consulta.porcentaje_exoneracion}%` : '-'} accent="#38bdf8" />
                <WorkspaceMetric label="Vigencia" value={consulta ? (vencida ? 'Vencida' : 'Vigente') : '-'} accent={consulta ? (vencida ? '#f87171' : '#4ade80') : '#f8fafc'} />
                <WorkspaceMetric label="CABYS" value={consulta ? consulta.cabys.length : 0} accent="#a78bfa" />
              </WorkspaceSidebarSection>
              <WorkspaceSidebarSection title="Uso en ERP" subtitle="Esta consulta se reaprovechara en Facturacion y CXP cuando montemos el calculo fiscal completo.">
                <div className="fex-mini">Primero dejamos la exoneracion bien registrada; luego la consumiremos en FE, TE, NCE y NDE.</div>
              </WorkspaceSidebarSection>
            </>
          }
        >
          <WorkspaceMainPanel title="Consulta MH" subtitle="Proxy local al API de Hacienda para evitar problemas de CORS y dejar trazabilidad interna.">
            {ok ? <div className="fex-msg-ok">{ok}</div> : null}
            {error ? <div className="fex-msg-err">{error}</div> : null}
            {consulta && vencida ? <div className="fex-msg-warn">La exoneracion consultada ya esta vencida. Se puede guardar para historico, pero no deberia usarse para emitir.</div> : null}
            {cabysProgress ? (
              <div className="fex-progress">
                <div
                  className="fex-progress-bar"
                  style={{ width: `${cabysProgress.total > 0 ? (cabysProgress.current / cabysProgress.total) * 100 : 0}%` }}
                />
                <div className="fex-progress-meta">
                  <span>Cargando CABYS {cabysProgress.current}/{cabysProgress.total}</span>
                  <span>{cabysProgress.codigo}</span>
                </div>
              </div>
            ) : null}

            <div className="fex-row">
              <div className="fex-field">
                <label>Numero de autorizacion</label>
                <input className="fex-input" value={autorizacion} onChange={(e) => setAutorizacion(e.target.value)} placeholder="Ej: 12345678901234567890" />
              </div>
              <div className="fex-field">
                <label>Institucion</label>
                <input className="fex-input" value={consulta?.nombre_institucion || ''} readOnly placeholder="Se completa al consultar" />
              </div>
              <div>
                <button className="fex-btn primary" disabled={busy || !autorizacion.trim()} onClick={consultar}>Consultar MH</button>
              </div>
              <div>
                <button className="fex-btn success" disabled={!consulta || saving || !canEdit} onClick={guardar}>Guardar exoneracion</button>
              </div>
            </div>

            {consulta ? (
              <>
                <div className="fex-grid">
                  <div className="fex-box" style={{ gridColumn: 'span 4' }}>
                    <div className="fex-box-label">Contribuyente</div>
                    <div className="fex-box-value">{consulta.nombre_contribuyente || '-'}</div>
                  </div>
                  <div className="fex-box" style={{ gridColumn: 'span 2' }}>
                    <div className="fex-box-label">Identificacion</div>
                    <div className="fex-box-value">{consulta.identificacion || '-'}</div>
                  </div>
                  <div className="fex-box" style={{ gridColumn: 'span 2' }}>
                    <div className="fex-box-label">Emision</div>
                    <div className="fex-box-value">{formatDate(consulta.fecha_emision)}</div>
                  </div>
                  <div className="fex-box" style={{ gridColumn: 'span 2' }}>
                    <div className="fex-box-label">Vencimiento</div>
                    <div className="fex-box-value">{formatDate(consulta.fecha_vencimiento)}</div>
                  </div>
                  <div className="fex-box" style={{ gridColumn: 'span 2' }}>
                    <div className="fex-box-label">Tipo doc.</div>
                    <div className="fex-box-value">{consulta.tipo_documento_codigo || '-'} {consulta.tipo_documento_descripcion ? `- ${consulta.tipo_documento_descripcion}` : ''}</div>
                  </div>
                  <div className="fex-box" style={{ gridColumn: 'span 3' }}>
                    <div className="fex-box-label">Institucion</div>
                    <div className="fex-box-value">{consulta.nombre_institucion || '-'}</div>
                  </div>
                  <div className="fex-box" style={{ gridColumn: 'span 3' }}>
                    <div className="fex-box-label">Tipo autorizacion</div>
                    <div className="fex-box-value">{consulta.tipo_autorizacion || '-'} {consulta.tipo_autorizacion_descripcion ? `- ${consulta.tipo_autorizacion_descripcion}` : ''}</div>
                  </div>
                  <div className="fex-box" style={{ gridColumn: 'span 2' }}>
                    <div className="fex-box-label">% Exoneracion</div>
                    <div className="fex-box-value">{consulta.porcentaje_exoneracion}%</div>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="fex-field" style={{ marginBottom: 10, maxWidth: 440 }}>
                    <label>Buscar CABYS autorizado</label>
                    <input
                      className="fex-input"
                      value={cabysSearch}
                      onChange={(e) => setCabysSearch(e.target.value)}
                      placeholder="Codigo CABYS o detalle"
                    />
                  </div>
                  <div className="fex-table-hint">Desliza horizontalmente para revisar el detalle CABYS autorizado.</div>
                  <div className="fex-table-wrap">
                    <table className="fex-table">
                      <thead>
                        <tr>
                          <th style={{ width: '18%' }}>CABYS</th>
                          <th>Detalle</th>
                          <th style={{ width: '12%' }}>IVA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consulta.cabys.length === 0 ? (
                          <tr><td colSpan={3} className="fex-mini">No hay CABYS detallados en esta exoneracion.</td></tr>
                        ) : cabysConsultaFiltrados.length === 0 ? (
                          <tr><td colSpan={3} className="fex-mini">No hay CABYS que coincidan con la busqueda.</td></tr>
                        ) : cabysConsultaFiltrados.map((item) => (
                          <tr key={item.cabys}>
                            <td style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{item.cabys}</td>
                            <td>{item.detalle || <span className="fex-mini">Sin detalle local</span>}</td>
                            <td>{item.iva}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </WorkspaceMainPanel>

          <WorkspaceMainPanel title="Exoneraciones guardadas" subtitle="Historico por empresa. Mas adelante este catalogo alimentara facturacion y recepcion de comprobantes.">
            <div className="fex-table-hint">Desliza horizontalmente para revisar historico, vigencia y detalle CABYS.</div>
            <div className="fex-table-wrap">
              <table className="fex-table">
                <thead>
                  <tr>
                    <th>Autorizacion</th>
                    <th>Institucion</th>
                    <th>Vence</th>
                    <th>%</th>
                    <th>CABYS</th>
                    <th>Estado</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {listado.length === 0 ? (
                    <tr><td colSpan={7} className="fex-mini">Aun no hay exoneraciones guardadas.</td></tr>
                  ) : listado.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr>
                        <td style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{row.autorizacion}</td>
                        <td>{row.nombre_institucion || row.nombre_contribuyente || '-'}</td>
                        <td>{formatDate(row.fecha_vencimiento)}</td>
                        <td>{row.porcentaje_exoneracion}%</td>
                        <td>{row.cabys_count}</td>
                        <td><span className={`fex-chip ${row.vigente ? 'ok' : 'bad'}`}>{row.vigente ? 'Vigente' : 'Vencida'}</span></td>
                        <td><span className="fex-link" onClick={() => void verCabysGuardados(row)}>Ver CABYS</span></td>
                      </tr>
                      {cabysGuardados[row.id] ? (
                        <tr>
                          <td colSpan={7} style={{ background: '#0b1220' }}>
                            <div className="fex-field" style={{ padding: '10px 12px', maxWidth: 420 }}>
                              <label>Buscar CABYS guardado</label>
                              <input
                                className="fex-input"
                                value={cabysGuardadosSearch[row.id] || ''}
                                onChange={(e) => setCabysGuardadosSearch((prev) => ({ ...prev, [row.id]: e.target.value }))}
                                placeholder="Codigo CABYS o detalle"
                              />
                            </div>
                            <div className="fex-table-wrap" style={{ margin: '0 12px 12px' }}>
                              <table className="fex-table">
                                <tbody>
                                  {cabysGuardados[row.id]
                                    .filter((item) => {
                                      const term = String(cabysGuardadosSearch[row.id] || '').trim().toLowerCase();
                                      if (!term) return true;
                                      return String(item.cabys || '').toLowerCase().includes(term) || String(item.detalle || '').toLowerCase().includes(term);
                                    })
                                    .map((item) => (
                                    <tr key={`${row.id}-${item.cabys}`}>
                                      <td style={{ width: '20%', fontFamily: 'monospace', color: '#93c5fd' }}>{item.cabys}</td>
                                      <td>{item.detalle || <span className="fex-mini">Sin detalle local</span>}</td>
                                      <td style={{ width: '12%' }}>{item.iva}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </WorkspaceMainPanel>
        </WorkspaceShell>
      </div>
    </>
  );
}
