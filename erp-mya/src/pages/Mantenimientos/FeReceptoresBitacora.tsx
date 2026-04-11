import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import ListToolbar from '../../components/ListToolbar';
import { exportExcelXml, exportPdfWithPrint, ReportColumn } from '../../utils/reporting';
import { mantenimientoBaseStyles } from './mantenimientoTheme';

interface FeReceptoresBitacoraProps {
  empresaId: number;
  canView?: boolean;
  canEdit?: boolean;
}

interface ReceptorRow {
  id: number;
  empresa_id: number;
  tipo_identificacion: string | null;
  identificacion: string;
  razon_social: string;
  actividad_codigo: string | null;
  actividad_descripcion: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  origen_mh: boolean;
  payload_json?: any;
  updated_at: string | null;
  created_at: string | null;
}

interface ReceptorForm {
  id: number | null;
  tipo_identificacion: string;
  identificacion: string;
  razon_social: string;
  actividad_codigo: string;
  actividad_descripcion: string;
  email: string;
  telefono: string;
  direccion: string;
  origen_mh: boolean;
}

interface ResultadoMh {
  ok?: boolean;
  cedula?: string;
  nombre?: string;
  tipo_identificacion?: string;
  actividades?: Array<{ codigo?: string; descripcion?: string }>;
  detail?: string;
  error?: string;
}

interface ActividadMh {
  codigo: string;
  descripcion: string;
}

const styles = `
  ${mantenimientoBaseStyles}
  .frb-wrap { padding:0; color:var(--card-text); }
  .frb-title { font-size:20px; font-weight:800; margin-bottom:6px; }
  .frb-sub { font-size:12px; margin-bottom:14px; }
  .frb-msg-ok, .frb-msg-err {
    margin-bottom:10px; border-radius:12px; padding:10px 12px; font-size:12px;
  }
  .frb-msg-ok {
    border:1px solid color-mix(in srgb, var(--green-main) 30%, var(--card-border));
    background:color-mix(in srgb, var(--green-main) 10%, var(--bg-dark2));
    color:var(--card-text);
  }
  .frb-msg-err {
    border:1px solid color-mix(in srgb, #ef4444 30%, var(--card-border));
    background:color-mix(in srgb, #ef4444 10%, var(--bg-dark2));
    color:var(--card-text);
  }
  .frb-card {
    border-radius:16px;
    padding:14px;
  }
  .frb-table-wrap { border-radius:16px; overflow:hidden; }
  .frb-table { width:100%; border-collapse:collapse; min-width:1120px; }
  .frb-table th, .frb-table td {
    padding:10px 12px;
    border-top:1px solid var(--card-border);
    font-size:12px;
    color:var(--card-text);
    vertical-align:middle;
    white-space:nowrap;
  }
  .frb-table th {
    background:color-mix(in srgb, var(--bg-dark) 82%, var(--bg-dark2));
    color:var(--gray-400);
    text-transform:uppercase;
    letter-spacing:.04em;
    font-size:11px;
    text-align:left;
  }
  .frb-table tr:first-child td { border-top:none; }
  .frb-table tr:hover td { background:color-mix(in srgb, var(--green-main) 6%, var(--bg-dark2)); }
  .frb-table tr.active td { background:color-mix(in srgb, var(--green-main) 10%, var(--bg-dark2)); }
  .frb-name { max-width:260px; overflow:hidden; text-overflow:ellipsis; font-weight:700; }
  .frb-muted { color:var(--gray-400); }
  .frb-chip {
    display:inline-flex; align-items:center; border-radius:999px; padding:2px 8px;
    font-size:10px; font-weight:800; letter-spacing:.04em; text-transform:uppercase;
    border:1px solid var(--card-border);
    background:color-mix(in srgb, var(--bg-dark2) 70%, var(--card-bg));
    color:var(--card-text);
  }
  .frb-chip.mh {
    border-color:color-mix(in srgb, var(--green-main) 24%, var(--card-border));
    background:color-mix(in srgb, var(--green-main) 12%, var(--bg-dark2));
    color:color-mix(in srgb, var(--green-soft) 68%, var(--card-text));
  }
  .frb-toolbar-btn, .frb-row-btn {
    border-radius:10px;
    padding:8px 10px;
    font-size:12px;
    cursor:pointer;
  }
  .frb-row-actions { display:flex; gap:6px; }
  .frb-layout { display:grid; grid-template-columns: 1.2fr .9fr; gap:12px; }
  .frb-editor { border-radius:16px; padding:14px; }
  .frb-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; }
  .frb-field { display:flex; flex-direction:column; gap:4px; }
  .frb-field label { font-size:11px; }
  .frb-input, .frb-select, .frb-text {
    width:100%;
    border-radius:12px;
    padding:10px 12px;
    font-size:13px;
    border:1px solid color-mix(in srgb, var(--card-border) 82%, var(--green-main));
    background:color-mix(in srgb, var(--bg-dark2) 44%, var(--card-bg));
    color:var(--card-text);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
  }
  .frb-input::placeholder, .frb-text::placeholder { color:var(--gray-400); }
  .frb-input:focus, .frb-select:focus, .frb-text:focus {
    outline:none; border-color:var(--green-main); box-shadow:0 0 0 2px color-mix(in srgb, var(--green-main) 18%, transparent);
  }
  .frb-text { min-height:88px; resize:vertical; }
  .frb-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .frb-empty {
    padding:24px; text-align:center; color:var(--gray-400); font-size:12px;
  }
  .frb-modal-backdrop {
    position:fixed;
    inset:0;
    background:rgba(3,8,20,.68);
    display:flex;
    align-items:flex-start;
    justify-content:center;
    z-index:30000;
    padding:92px 20px 20px;
  }
  .frb-modal {
    position:relative;
    isolation:isolate;
    width:min(960px, calc(100vw - 40px));
    max-height:calc(100vh - 112px);
    overflow:auto;
    border-radius:18px;
    padding:16px;
    background:var(--bg-dark2) !important;
    border:1px solid color-mix(in srgb, var(--card-border) 86%, var(--green-main));
    box-shadow:0 28px 70px rgba(3,8,20,.42);
    box-sizing:border-box;
  }
  .frb-modal::before {
    content:'';
    position:absolute;
    inset:0;
    background:var(--bg-dark2);
    border-radius:18px;
    z-index:-1;
  }
  .frb-modal-head {
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
    margin-bottom:14px;
  }
  .frb-modal-title { font-size:18px; font-weight:800; color:var(--card-text); }
  .frb-modal-sub { font-size:12px; color:var(--gray-400); margin-top:4px; }
  .frb-modal-head-actions { display:flex; gap:8px; flex-wrap:wrap; }
  .frb-modal-flash { margin-bottom:12px; }
  .frb-activity-pill {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    border:1px solid color-mix(in srgb, var(--card-border) 82%, var(--green-main));
    background:color-mix(in srgb, var(--bg-dark2) 52%, var(--card-bg));
    color:var(--card-text);
    padding:10px 12px;
    border-radius:12px;
    min-height:46px;
  }
  .frb-activity-pill span {
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:13px;
  }
  .frb-activity-count {
    font-size:11px;
    color:var(--gray-400);
    font-weight:700;
    text-transform:uppercase;
    letter-spacing:.06em;
  }
  .frb-activity-list { display:grid; gap:8px; }
  .frb-activity-item {
    width:100%;
    text-align:left;
    border:1px solid var(--card-border);
    background:color-mix(in srgb, var(--bg-dark2) 62%, var(--card-bg));
    color:var(--card-text);
    border-radius:12px;
    padding:12px 14px;
    cursor:pointer;
  }
  .frb-activity-item:hover { border-color:var(--green-main); }
  .frb-activity-item.active {
    border-color:color-mix(in srgb, var(--green-main) 46%, var(--card-border));
    background:color-mix(in srgb, var(--green-main) 12%, var(--bg-dark2));
  }
  .frb-activity-code { font-weight:800; color:var(--card-text); font-size:13px; }
  .frb-activity-desc { color:var(--gray-400); font-size:12px; margin-top:4px; line-height:1.45; }
  @media (max-width: 1200px) {
    .frb-layout { grid-template-columns: 1fr; }
  }
  @media (max-width: 760px) {
    .frb-grid { grid-template-columns: 1fr; }
  }
`;

const emptyForm: ReceptorForm = {
  id: null,
  tipo_identificacion: '',
  identificacion: '',
  razon_social: '',
  actividad_codigo: '',
  actividad_descripcion: '',
  email: '',
  telefono: '',
  direccion: '',
  origen_mh: false,
};

const fmtFecha = (v?: string | null) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const tipoIdLabel = (v?: string | null) => {
  const s = String(v || '').trim();
  if (s === '01') return '01 Fisica';
  if (s === '02') return '02 Juridica';
  if (s === '03') return '03 DIMEX';
  if (s === '04') return '04 NITE';
  return s || '-';
};

const parseActividades = (value: any, fallbackCodigo?: string | null, fallbackDescripcion?: string | null): ActividadMh[] => {
  const raw = Array.isArray(value?.actividades) ? value.actividades : [];
  const base = raw
    .map((item: any) => ({
      codigo: String(item?.codigo || '').trim(),
      descripcion: String(item?.descripcion || '').trim(),
    }))
    .filter((item: ActividadMh) => item.codigo || item.descripcion);
  const fallback = String(fallbackCodigo || '').trim()
    ? [{ codigo: String(fallbackCodigo || '').trim(), descripcion: String(fallbackDescripcion || '').trim() }]
    : [];
  const merged = [...base, ...fallback];
  return merged.filter((item, index, arr) => arr.findIndex((x) => x.codigo === item.codigo && x.descripcion === item.descripcion) === index);
};

const mhErrorLabel = (err: any) => {
  const raw = String(err?.message || err || '').toLowerCase();
  if (!raw) return 'No hubo respuesta del MH.';
  if (raw.includes('404') || raw.includes('not found') || raw.includes('no se encontraron') || raw.includes('sin datos') || raw.includes('no data')) {
    return 'No se encontraron datos.';
  }
  if (raw.includes('timeout') || raw.includes('failed to fetch') || raw.includes('network') || raw.includes('http 5') || raw.includes('api mh')) {
    return 'No hubo respuesta del MH.';
  }
  return 'No se encontraron datos.';
};

export default function FeReceptoresBitacora({ empresaId, canView = true, canEdit = false }: FeReceptoresBitacoraProps) {
  const [rows, setRows] = useState<ReceptorRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<ReceptorForm>(emptyForm);
  const [actividadesMh, setActividadesMh] = useState<ActividadMh[]>([]);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.identificacion || '').toLowerCase().includes(q) ||
      String(row.razon_social || '').toLowerCase().includes(q) ||
      String(row.email || '').toLowerCase().includes(q) ||
      String(row.telefono || '').toLowerCase().includes(q) ||
      String(row.actividad_codigo || '').toLowerCase().includes(q) ||
      String(row.actividad_descripcion || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const exportRows = filtered.map((row) => ({
    identificacion: row.identificacion,
    tipo_id: tipoIdLabel(row.tipo_identificacion),
    razon_social: row.razon_social,
    actividad_codigo: row.actividad_codigo || '',
    actividad_descripcion: row.actividad_descripcion || '',
    email: row.email || '',
    telefono: row.telefono || '',
    origen: row.origen_mh ? 'MH' : 'Manual',
    actualizacion: fmtFecha(row.updated_at),
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'identificacion', title: 'Identificacion', getValue: (r) => r.identificacion, width: '12%' },
    { key: 'tipo_id', title: 'Tipo ID', getValue: (r) => r.tipo_id, width: '10%' },
    { key: 'razon_social', title: 'Razon Social', getValue: (r) => r.razon_social, align: 'left', width: '26%' },
    { key: 'actividad_codigo', title: 'Act. Cod.', getValue: (r) => r.actividad_codigo, width: '8%' },
    { key: 'actividad_descripcion', title: 'Actividad', getValue: (r) => r.actividad_descripcion, align: 'left', width: '18%' },
    { key: 'email', title: 'Email', getValue: (r) => r.email, align: 'left', width: '14%' },
    { key: 'telefono', title: 'Telefono', getValue: (r) => r.telefono, width: '8%' },
    { key: 'origen', title: 'Origen', getValue: (r) => r.origen, width: '6%' },
    { key: 'actualizacion', title: 'Actualizacion', getValue: (r) => r.actualizacion, width: '8%' },
  ];

  const loadRows = async () => {
    if (!canView) return [] as ReceptorRow[];
    setLoadingRows(true);
    setErr('');
    const { data, error } = await supabase
      .from('fe_receptores_bitacora')
      .select('id,empresa_id,tipo_identificacion,identificacion,razon_social,actividad_codigo,actividad_descripcion,email,telefono,direccion,origen_mh,payload_json,updated_at,created_at')
      .eq('empresa_id', empresaId)
      .order('razon_social', { ascending: true });
    setLoadingRows(false);
    if (error) {
      setRows([]);
      setErr(error.message || 'No se pudo cargar la bitacora de receptores FE.');
      return [] as ReceptorRow[];
    }
    const next = (data || []) as ReceptorRow[];
    setRows(next);
    if (selectedId && !next.some((r) => r.id === selectedId)) {
      setSelectedId(null);
      setForm(emptyForm);
    }
    return next;
  };

  useEffect(() => {
    void loadRows();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectRow = (row: ReceptorRow, preserveFlash = false) => {
    setSelectedId(row.id);
    setEditorOpen(true);
    setActividadesMh(parseActividades(row.payload_json, row.actividad_codigo, row.actividad_descripcion));
    setForm({
      id: row.id,
      tipo_identificacion: row.tipo_identificacion || '',
      identificacion: row.identificacion || '',
      razon_social: row.razon_social || '',
      actividad_codigo: row.actividad_codigo || '',
      actividad_descripcion: row.actividad_descripcion || '',
      email: row.email || '',
      telefono: row.telefono || '',
      direccion: row.direccion || '',
      origen_mh: Boolean(row.origen_mh),
    });
    if (!preserveFlash) {
      setOk('');
      setErr('');
    }
  };

  const resetForm = () => {
    setSelectedId(null);
    setEditorOpen(false);
    setActivityPanelOpen(false);
    setActividadesMh([]);
    setForm(emptyForm);
    setOk('');
    setErr('');
  };

  const openNew = () => {
    setSelectedId(null);
    setActivityPanelOpen(false);
    setActividadesMh([]);
    setForm(emptyForm);
    setOk('');
    setErr('');
    setEditorOpen(true);
  };

  const saveRow = async () => {
    if (!canEdit || saving) return;
    if (!form.identificacion.trim() || !form.razon_social.trim()) {
      setErr('Identificacion y razon social son requeridas.');
      return;
    }
    setSaving(true);
    setErr('');
    setOk('');
    try {
      const identificacion = form.identificacion.trim();
      const payload = {
        empresa_id: empresaId,
        tipo_identificacion: form.tipo_identificacion || null,
        identificacion,
        razon_social: form.razon_social.trim(),
        actividad_tributaria_id: null,
        actividad_codigo: form.actividad_codigo.trim() || null,
        actividad_descripcion: form.actividad_descripcion.trim() || null,
        email: form.email.trim() || null,
        telefono: form.telefono.trim() || null,
        direccion: form.direccion.trim() || null,
        origen_mh: form.origen_mh,
        payload_json: actividadesMh.length ? { actividades: actividadesMh } : null,
        updated_at: new Date().toISOString(),
      };
      const { error: saveError } = await supabase
        .from('fe_receptores_bitacora')
        .upsert(payload, { onConflict: 'empresa_id,identificacion' });
      if (saveError) throw saveError;
      const { data, error } = await supabase
          .from('fe_receptores_bitacora')
          .select('id,empresa_id,tipo_identificacion,identificacion,razon_social,actividad_codigo,actividad_descripcion,email,telefono,direccion,origen_mh,payload_json,updated_at,created_at')
          .eq('empresa_id', empresaId)
          .eq('identificacion', identificacion)
          .single();
      if (error) throw error;
      const savedRow = (data || null) as ReceptorRow | null;
      if (savedRow) {
        setRows((prev) => {
          const next = prev.filter((r) => r.id !== savedRow.id);
          next.push(savedRow);
          next.sort((a, b) => String(a.razon_social || '').localeCompare(String(b.razon_social || ''), 'es', { sensitivity: 'base' }));
          return next;
        });
        setSelectedId(savedRow.id);
      }
      setEditorOpen(false);
      setActivityPanelOpen(false);
      setOk('Receptor FE guardado correctamente.');
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo guardar el receptor FE.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="frb-wrap mnt-wrap">
        <div className="frb-title mnt-title">Bitacora Receptores FE</div>
        <div className="frb-sub mnt-sub">Mantenimiento de receptores fiscales usados en FE. Permite navegar, corregir y completar datos desde MH.</div>
        {ok ? <div className="frb-msg-ok">{ok}</div> : null}
        {err ? <div className="frb-msg-err">{err}</div> : null}

        <div className="frb-card mnt-card">
            <ListToolbar
              search={(
                <input
                  className="frb-input mnt-input"
                  placeholder="Buscar por identificacion, nombre, email, telefono o actividad..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ minWidth: 320 }}
                />
              )}
              exports={(
                <>
                  <button className="frb-toolbar-btn mnt-btn" onClick={() => exportExcelXml('fe_receptores_bitacora.xls', exportRows, exportColumns)} disabled={!exportRows.length}>Excel</button>
                  <button className="frb-toolbar-btn mnt-btn" onClick={() => exportPdfWithPrint({ title: 'Bitacora Receptores FE', subtitle: `Empresa ${empresaId} · ${exportRows.length} registro(s)`, rows: exportRows, columns: exportColumns })} disabled={!exportRows.length}>PDF</button>
                </>
              )}
              actions={<button className="frb-toolbar-btn mnt-btn mnt-btn-primary" onClick={openNew} disabled={loadingRows || saving}>Nuevo receptor</button>}
            />

            <div className="frb-table-wrap mnt-card mnt-table-wrap" style={{ marginTop: 12 }}>
              <table className="frb-table">
                <thead>
                  <tr>
                    <th>Identificacion</th>
                    <th>Tipo</th>
                    <th>Razon social</th>
                    <th>Actividad</th>
                    <th>Email</th>
                    <th>Telefono</th>
                    <th>Origen</th>
                    <th>Actualizado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {!filtered.length ? (
                    <tr><td colSpan={9} className="frb-empty">No hay receptores en bitacora para ese criterio.</td></tr>
                  ) : filtered.map((row) => (
                    <tr key={row.id} className={selectedId === row.id ? 'active' : ''}>
                      <td>{row.identificacion}</td>
                      <td>{tipoIdLabel(row.tipo_identificacion)}</td>
                      <td><div className="frb-name" title={row.razon_social}>{row.razon_social}</div></td>
                      <td title={row.actividad_descripcion || ''}>{row.actividad_codigo || '-'}</td>
                      <td className="frb-muted">{row.email || '-'}</td>
                      <td className="frb-muted">{row.telefono || '-'}</td>
                      <td><span className={`frb-chip ${row.origen_mh ? 'mh' : ''}`}>{row.origen_mh ? 'MH' : 'Manual'}</span></td>
                      <td className="frb-muted">{fmtFecha(row.updated_at)}</td>
                      <td>
                        <div className="frb-row-actions">
                          <button className="frb-row-btn mnt-btn" onClick={() => selectRow(row)}>Abrir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>
      </div>
      {editorOpen ? (
        <div className="frb-modal-backdrop" onClick={() => (loadingRows || saving ? null : resetForm())}>
          <div className="frb-modal frb-editor" onClick={(e) => e.stopPropagation()}>
            <div className="frb-modal-head">
              <div>
                <div className="frb-modal-title">{selectedId ? 'Editar receptor FE' : 'Nuevo receptor FE'}</div>
                <div className="frb-modal-sub">Revisa, corrige o completa la ficha fiscal del receptor y consulta MH cuando haga falta.</div>
              </div>
              <div className="frb-modal-head-actions">
                <button className="frb-toolbar-btn mnt-btn mnt-btn-primary" onClick={() => void saveRow()} disabled={!canEdit || saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                <button className="frb-toolbar-btn mnt-btn" onClick={resetForm} disabled={loadingRows || saving}>Cerrar</button>
              </div>
            </div>
            {ok ? <div className="frb-msg-ok frb-modal-flash">{ok}</div> : null}
            {err ? <div className="frb-msg-err frb-modal-flash">{err}</div> : null}
            <div className="frb-grid">
              <div className="frb-field">
                <label className="mnt-label">Tipo ID</label>
                <select className="frb-select mnt-select" value={form.tipo_identificacion} onChange={(e) => setForm((p) => ({ ...p, tipo_identificacion: e.target.value }))} disabled={!canEdit || saving}>
                  <option value="">--</option>
                  <option value="01">01 Persona fisica</option>
                  <option value="02">02 Persona juridica</option>
                  <option value="03">03 DIMEX</option>
                  <option value="04">04 NITE</option>
                </select>
              </div>
              <div className="frb-field">
                <label className="mnt-label">Identificacion</label>
                <input className="frb-input mnt-input" value={form.identificacion} onChange={(e) => setForm((p) => ({ ...p, identificacion: e.target.value }))} disabled={!canEdit || saving} />
              </div>
              <div className="frb-field" style={{ gridColumn: '1 / -1' }}>
                <label className="mnt-label">Razon social</label>
                <input className="frb-input mnt-input" value={form.razon_social} onChange={(e) => setForm((p) => ({ ...p, razon_social: e.target.value }))} disabled={!canEdit || saving} />
              </div>
              {actividadesMh.length > 1 ? (
                <div className="frb-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="mnt-label">Actividad MH</label>
                  <div className="frb-activity-pill">
                    <span title={form.actividad_codigo ? `${form.actividad_codigo} - ${form.actividad_descripcion}` : form.actividad_descripcion}>
                      {form.actividad_codigo ? `${form.actividad_codigo} - ${form.actividad_descripcion}` : (form.actividad_descripcion || '-- seleccione actividad --')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="frb-activity-count">{actividadesMh.length} actividades</span>
                      <button className="frb-toolbar-btn mnt-btn" type="button" onClick={() => setActivityPanelOpen((v) => !v)} disabled={!canEdit || saving}>
                        {activityPanelOpen ? 'Ocultar' : 'Elegir'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {actividadesMh.length > 1 && activityPanelOpen ? (
                <div className="frb-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="mnt-label">Lista de actividades</label>
                  <div className="frb-activity-list">
                    {actividadesMh.map((actividad) => {
                      const active = actividad.codigo === form.actividad_codigo && actividad.descripcion === form.actividad_descripcion;
                      return (
                        <button
                          key={`${actividad.codigo}-${actividad.descripcion}`}
                          type="button"
                          className={`frb-activity-item${active ? ' active' : ''}`}
                          onClick={() => {
                            setForm((p) => ({
                              ...p,
                              actividad_codigo: String(actividad.codigo || ''),
                              actividad_descripcion: String(actividad.descripcion || ''),
                            }));
                            setActivityPanelOpen(false);
                          }}
                        >
                          <div className="frb-activity-code">{actividad.codigo || 'Sin codigo'}</div>
                          <div className="frb-activity-desc">{actividad.descripcion || 'Sin descripcion'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="frb-field">
                <label className="mnt-label">Actividad codigo</label>
                <input className="frb-input mnt-input" value={form.actividad_codigo} onChange={(e) => setForm((p) => ({ ...p, actividad_codigo: e.target.value }))} disabled={!canEdit || saving} />
              </div>
              <div className="frb-field">
                <label className="mnt-label">Actividad descripcion</label>
                <input className="frb-input mnt-input" value={form.actividad_descripcion} onChange={(e) => setForm((p) => ({ ...p, actividad_descripcion: e.target.value }))} disabled={!canEdit || saving} />
              </div>
              <div className="frb-field">
                <label className="mnt-label">Email</label>
                <input className="frb-input mnt-input" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} disabled={!canEdit || saving} />
              </div>
              <div className="frb-field">
                <label className="mnt-label">Telefono</label>
                <input className="frb-input mnt-input" value={form.telefono} onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))} disabled={!canEdit || saving} />
              </div>
              <div className="frb-field" style={{ gridColumn: '1 / -1' }}>
                <label className="mnt-label">Direccion</label>
                <textarea className="frb-text mnt-text" value={form.direccion} onChange={(e) => setForm((p) => ({ ...p, direccion: e.target.value }))} disabled={!canEdit || saving} />
              </div>
            </div>

            <div className="frb-actions">
              <button className="frb-toolbar-btn mnt-btn" onClick={() => void loadRows()} disabled={loadingRows || saving}>{loadingRows ? 'Recargando...' : 'Recargar'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
