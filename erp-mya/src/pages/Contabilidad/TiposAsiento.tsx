import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, exportExcelXml, exportPdfWithPrint, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';

interface TipoAsiento {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  orden: number;
  activo: boolean;
}

interface CategoriaEfectiva {
  categoria_id: number;
  categoria_base_id: number;
  codigo: string;
  descripcion: string;
  tipo_id: number | null;
  activo: boolean;
  modo: 'override_empresa' | 'herencia_base';
}

interface CategoriaForm {
  categoria_base_id: number;
  codigo: string;
  descripcion: string;
  tipo_id: number | '';
  activo: boolean;
}

const styles = `
  .ta-wrap { padding:0; color:#d6e2ff; }
  .ta-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; gap:12px; }
  .ta-head-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .ta-title { font-size:20px; font-weight:700; color:#f8fbff; letter-spacing:-0.3px; }
  .ta-title span { font-size:13px; font-weight:500; color:#8ea3c7; margin-left:8px; }
  .ta-btn { padding:10px 16px; border-radius:10px; border:none; cursor:pointer; font-size:13px; font-weight:700; }
  .ta-btn.primary { color:#fff; background:linear-gradient(135deg,#17a34a,#22c55e); box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .ta-btn.neutral { color:#d6e2ff; background:#243149; border:1px solid rgba(137,160,201,0.18); }
  .ta-export-btn { padding:9px 12px; border-radius:10px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; color:#d6e2ff; cursor:pointer; font-size:12px; font-weight:700; }
  .ta-export-btn:hover { border-color:#4c7bf7; color:#ffffff; background:#243149; }
  .ta-btn:disabled { opacity:.6; cursor:not-allowed; }
  .ta-msg-ok { margin-bottom:12px; padding:10px 14px; border-radius:12px; border:1px solid #1d6e4f; background:#0f2c20; color:#9df4c7; font-size:12px; }
  .ta-msg-err { margin-bottom:12px; padding:10px 14px; border-radius:12px; border:1px solid #7d2f3a; background:#34181c; color:#ffb3bb; font-size:12px; }
  .ta-table-wrap { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; overflow:hidden; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .ta-table { width:100%; border-collapse:collapse; }
  .ta-table th { background:#131b2a; padding:12px 14px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#8ea3c7; text-align:left; border-bottom:1px solid rgba(137,160,201,0.16); }
  .ta-table td { padding:12px 14px; border-bottom:1px solid rgba(137,160,201,0.12); font-size:13px; color:#d6e2ff; }
  .ta-table tr:last-child td { border-bottom:none; }
  .ta-mobile-list { display:none; }
  .ta-row-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px; margin-bottom:8px; }
  .ta-row-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .ta-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; font-size:11px; font-weight:600; background:#1f2f4c; border:1px solid rgba(137,160,201,0.18); color:#9ec3ff; }
  .ta-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
  .ta-actions { display:flex; gap:8px; }
  .ta-link { padding:6px 10px; border-radius:9px; border:1px solid rgba(76,123,247,0.34); background:#243149; color:#9ec3ff; cursor:pointer; font-size:11px; font-weight:700; }
  .ta-link.danger { border-color:#7d2f3a; background:#34181c; color:#ffb3bb; }
  .ta-modal-bg { position:fixed; inset:0; background:rgba(3,8,20,.72); display:flex; align-items:center; justify-content:center; z-index:1000; }
  .ta-modal { width:min(560px,96vw); background:#172131; border-radius:16px; border:1px solid rgba(137,160,201,0.18); padding:22px; }
  .ta-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .ta-group { display:flex; flex-direction:column; gap:6px; }
  .ta-group.span2 { grid-column:span 2; }
  .ta-label { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.04em; }
  .ta-input { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; outline:none; background:#1d2738; color:#f3f7ff; }
  .ta-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .ta-footer { margin-top:16px; display:flex; justify-content:flex-end; gap:8px; }
  .ta-mode { margin-bottom:12px; padding:10px 12px; border:1px solid rgba(137,160,201,0.18); border-radius:12px; background:#1d2738; font-size:12px; color:#d6e2ff; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .ta-mode-badge { display:inline-flex; align-items:center; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:600; }
  .ta-mode-badge.override { background:#0f2c20; color:#9df4c7; border:1px solid #1d6e4f; }
  .ta-mode-badge.base { background:#1f2f4c; color:#9ec3ff; border:1px solid rgba(137,160,201,0.18); }
  .ta-subtitle { margin:18px 0 10px; font-size:13px; font-weight:700; color:#d6e2ff; text-transform:uppercase; letter-spacing:.04em; }

  @media (max-width: 620px) {
    .ta-header { flex-wrap:wrap; gap:10px; }
    .ta-head-actions { width:100%; display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .ta-btn.primary { width:100%; }
    .ta-export-btn { width:100%; }
    .ta-table-wrap { display:none; }
    .ta-mobile-list { display:block; }
    .ta-grid { grid-template-columns:1fr; gap:8px; }
    .ta-group.span2 { grid-column:span 1; }
    .ta-footer { flex-direction:column; }
    .ta-btn.neutral, .ta-btn.primary { width:100%; }
  }
`;

const defaultForm = {
  codigo: '',
  nombre: '',
  descripcion: '',
  color: '#16a34a',
  orden: 100,
  activo: true,
};

export default function TiposAsiento({ canEdit, empresaId }: { canEdit: boolean; empresaId: number }) {
  const [tipos, setTipos] = useState<TipoAsiento[]>([]);
  const [categoriasEmpresa, setCategoriasEmpresa] = useState<CategoriaEfectiva[]>([]);
  const [msgOk, setMsgOk] = useState('');
  const [msgErr, setMsgErr] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catSaving, setCatSaving] = useState(false);
  const [catForm, setCatForm] = useState<CategoriaForm | null>(null);
  const [catEstadoFiltro, setCatEstadoFiltro] = useState<'todas' | 'activas' | 'inactivas'>('todas');
  const [catBusqueda, setCatBusqueda] = useState('');

  const exportRows = tipos.map((t) => ({
    codigo: t.codigo,
    nombre: t.nombre,
    descripcion: t.descripcion || '',
    color: t.color || '#16a34a',
    orden: t.orden,
    estado: t.activo ? 'Activo' : 'Inactivo',
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'codigo', title: 'Codigo', getValue: (r) => r.codigo, align: 'left', width: '14%' },
    { key: 'nombre', title: 'Nombre', getValue: (r) => r.nombre, align: 'left', width: '22%' },
    { key: 'descripcion', title: 'Descripcion', getValue: (r) => r.descripcion, align: 'left', width: '28%' },
    { key: 'color', title: 'Color', getValue: (r) => r.color, width: '12%' },
    { key: 'orden', title: 'Orden', getValue: (r) => r.orden, width: '10%' },
    { key: 'estado', title: 'Estado', getValue: (r) => r.estado, width: '14%' },
  ];

  const categoriasFiltradas = categoriasEmpresa.filter((c) => {
    if (catEstadoFiltro === 'activas') return !!c.activo;
    if (catEstadoFiltro === 'inactivas') return !c.activo;
    return true;
  }).filter((c) => {
    const q = catBusqueda.trim().toLowerCase();
    if (!q) return true;
    const tipo = tipos.find((t) => t.id === c.tipo_id);
    const tipoTxt = tipo ? `${tipo.codigo} ${tipo.nombre}`.toLowerCase() : '';
    return c.codigo.toLowerCase().includes(q) ||
      c.descripcion.toLowerCase().includes(q) ||
      tipoTxt.includes(q);
  });

  const categoriasExportRows = categoriasFiltradas.map((c) => {
    const tipo = tipos.find((t) => t.id === c.tipo_id);
    return {
      codigo: c.codigo,
      descripcion: c.descripcion,
      tipo: tipo ? `${tipo.codigo} - ${tipo.nombre}` : '',
      estado: c.activo ? 'Activo' : 'Inactivo',
      modo: c.modo,
    };
  });

  const categoriasExportColumns: ReportColumn<(typeof categoriasExportRows)[number]>[] = [
    { key: 'codigo', title: 'Codigo', getValue: (r) => r.codigo, align: 'left', width: '18%' },
    { key: 'descripcion', title: 'Descripcion', getValue: (r) => r.descripcion, align: 'left', width: '36%' },
    { key: 'tipo', title: 'Tipo', getValue: (r) => r.tipo, align: 'left', width: '26%' },
    { key: 'estado', title: 'Estado', getValue: (r) => r.estado, width: '10%' },
    { key: 'modo', title: 'Modo', getValue: (r) => r.modo, width: '10%' },
  ];

  const cargar = async () => {
    setMsgErr('');
    const { data, error } = await supabase
      .from('asiento_tipos')
      .select('*')
      .order('orden', { ascending: true })
      .order('codigo', { ascending: true });
    if (error) {
      setMsgErr(error.message);
      setTipos([]);
      return;
    }
    setTipos((data || []) as TipoAsiento[]);
  };

  const cargarCategoriasEmpresa = async () => {
    const { data, error } = await supabase.rpc('get_asiento_categorias_effective', {
      p_empresa_id: empresaId,
    });
    if (!error && data) {
      setCategoriasEmpresa((data || []) as CategoriaEfectiva[]);
      return;
    }

    // Fallback silencioso cuando la RPC aun no existe en el schema cache
    const { data: fallback, error: fallbackError } = await supabase
      .from('asiento_categorias')
      .select('id, codigo, descripcion, tipo_id, activo')
      .eq('activo', true)
      .order('codigo');

    if (fallbackError) {
      setMsgErr(fallbackError.message || 'No se pudieron cargar categorias.');
      setCategoriasEmpresa([]);
      return;
    }

    const mapped = (fallback || []).map((c: any) => ({
      categoria_id: c.id,
      categoria_base_id: c.id,
      codigo: c.codigo,
      descripcion: c.descripcion,
      tipo_id: c.tipo_id ?? null,
      activo: !!c.activo,
      modo: 'herencia_base' as const,
    }));
    setCategoriasEmpresa(mapped);
  };

  useEffect(() => {
    cargar();
    cargarCategoriasEmpresa();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirNuevo = () => {
    setEditingId(null);
    setForm(defaultForm);
    setModalOpen(true);
  };

  const abrirEditar = (t: TipoAsiento) => {
    setEditingId(t.id);
    setForm({
      codigo: t.codigo,
      nombre: t.nombre,
      descripcion: t.descripcion || '',
      color: t.color || '#16a34a',
      orden: t.orden ?? 100,
      activo: !!t.activo,
    });
    setModalOpen(true);
  };

  const guardar = async () => {
    if (!form.codigo.trim() || !form.nombre.trim()) {
      setMsgErr('Codigo y nombre son obligatorios.');
      return;
    }
    setSaving(true);
    setMsgErr('');

    const payload = {
      codigo: form.codigo.trim().toUpperCase(),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      color: form.color || '#16a34a',
      orden: Number(form.orden) || 100,
      activo: !!form.activo,
    };

    let error: any = null;
    if (editingId) {
      ({ error } = await supabase.from('asiento_tipos').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('asiento_tipos').insert(payload));
    }

    setSaving(false);
    if (error) {
      setMsgErr(error.message || 'No se pudo guardar.');
      return;
    }

    setModalOpen(false);
    setMsgOk(editingId ? 'Tipo actualizado.' : 'Tipo creado.');
    setTimeout(() => setMsgOk(''), 2500);
    await cargar();
  };

  const toggleActivo = async (t: TipoAsiento) => {
    if (!canEdit) return;
    const { error } = await supabase.from('asiento_tipos').update({ activo: !t.activo }).eq('id', t.id);
    if (error) {
      setMsgErr(error.message);
      return;
    }
    await cargar();
  };

  const inicializarCategoriasEmpresa = async () => {
    if (!canEdit) return;
    const { error, data } = await supabase.rpc('seed_asiento_categorias_empresa', {
      p_empresa_id: empresaId,
    });
    if (error) {
      setMsgErr(error.message || 'No se pudo inicializar categorias.');
      return;
    }
    setMsgErr('');
    setMsgOk(`Categorias inicializadas: ${Number(data || 0)} registros nuevos.`);
    setTimeout(() => setMsgOk(''), 2800);
    await cargarCategoriasEmpresa();
  };

  const restaurarCategoriasEmpresa = async () => {
    if (!canEdit) return;
    if (!window.confirm('Esto restaurara categorias de asiento desde la base para esta empresa. Desea continuar?')) {
      return;
    }
    const { error, data } = await supabase.rpc('reset_asiento_categorias_empresa', {
      p_empresa_id: empresaId,
    });
    if (error) {
      setMsgErr(error.message || 'No se pudo restaurar categorias.');
      return;
    }
    setMsgErr('');
    setMsgOk(`Categorias restauradas: ${Number(data || 0)} registros actualizados.`);
    setTimeout(() => setMsgOk(''), 2800);
    await cargarCategoriasEmpresa();
  };

  const modoEmpresa = categoriasEmpresa[0]?.modo || 'herencia_base';

  const abrirEditarCategoria = (c: CategoriaEfectiva) => {
    setCatForm({
      categoria_base_id: c.categoria_base_id,
      codigo: c.codigo,
      descripcion: c.descripcion,
      tipo_id: c.tipo_id ?? '',
      activo: c.activo,
    });
    setCatModalOpen(true);
  };

  const guardarCategoriaEmpresa = async () => {
    if (!canEdit || !catForm) return;
    if (!catForm.codigo.trim() || !catForm.descripcion.trim()) {
      setMsgErr('Codigo y descripcion son obligatorios.');
      return;
    }

    setCatSaving(true);
    setMsgErr('');

    const { error: seedError } = await supabase.rpc('seed_asiento_categorias_empresa', {
      p_empresa_id: empresaId,
    });
    if (seedError) {
      setCatSaving(false);
      setMsgErr(seedError.message || 'No se pudo preparar override por empresa.');
      return;
    }

    const { error } = await supabase
      .from('asiento_categorias_empresa')
      .upsert({
        empresa_id: empresaId,
        categoria_base_id: catForm.categoria_base_id,
        codigo: catForm.codigo.trim().toUpperCase(),
        descripcion: catForm.descripcion.trim(),
        tipo_id: catForm.tipo_id === '' ? null : Number(catForm.tipo_id),
        activo: catForm.activo,
      }, {
        onConflict: 'empresa_id,categoria_base_id',
      });

    setCatSaving(false);
    if (error) {
      setMsgErr(error.message || 'No se pudo guardar la categoria.');
      return;
    }

    setCatModalOpen(false);
    setCatForm(null);
    setMsgOk('Categoria actualizada para la empresa activa.');
    setTimeout(() => setMsgOk(''), 2500);
    await cargarCategoriasEmpresa();
  };

  return (
    <>
      <style>{styles}</style>
      <div className="ta-wrap">
        <div className="ta-header">
          <div className="ta-title">Tipos de Asiento <span>{tipos.length} registros</span></div>
          <div className="ta-head-actions">
            <button
              className="ta-export-btn"
              onClick={() => exportCsv('tipos_asiento.csv', exportRows, exportColumns)}
              disabled={exportRows.length === 0}
            >
              CSV
            </button>
            <button
              className="ta-export-btn"
              onClick={() => exportExcelXml('tipos_asiento.xls', exportRows, exportColumns)}
              disabled={exportRows.length === 0}
            >
              EXCEL
            </button>
            <button
              className="ta-export-btn"
              onClick={() =>
                exportPdfWithPrint({
                  title: 'Tipos de Asiento',
                  subtitle: `Total: ${exportRows.length} tipos`,
                  rows: exportRows,
                  columns: exportColumns,
                  orientation: 'portrait',
                  footerText: '',
                })
              }
              disabled={exportRows.length === 0}
            >
              PDF
            </button>
            <button className="ta-btn primary" onClick={abrirNuevo} disabled={!canEdit}>+ Nuevo Tipo</button>
          </div>
        </div>

        {msgOk && <div className="ta-msg-ok">{msgOk}</div>}
        {msgErr && <div className="ta-msg-err">{msgErr}</div>}

        <div className="ta-mode">
          <div>
            Categorias por empresa activa ({empresaId})
          </div>
          <div className={`ta-mode-badge ${modoEmpresa === 'override_empresa' ? 'override' : 'base'}`}>
            {modoEmpresa === 'override_empresa' ? 'Override Empresa' : 'Herencia Base'}
          </div>
        </div>

        <div className="ta-table-wrap">
          <table className="ta-table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Nombre</th>
                <th>Descripcion</th>
                <th>Color</th>
                <th>Orden</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tipos.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af' }}>Sin tipos de asiento</td></tr>
              ) : tipos.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'DM Mono, monospace' }}>{t.codigo}</td>
                  <td>{t.nombre}</td>
                  <td>{t.descripcion || '-'}</td>
                  <td>
                    <span className="ta-chip">
                      <span className="ta-dot" style={{ background: t.color || '#16a34a' }} />
                      {t.color || '#16a34a'}
                    </span>
                  </td>
                  <td>{t.orden}</td>
                  <td>{t.activo ? 'Activo' : 'Inactivo'}</td>
                  <td>
                    <div className="ta-actions">
                      <button className="ta-link" disabled={!canEdit} onClick={() => abrirEditar(t)}>Editar</button>
                      <button className="ta-link danger" disabled={!canEdit} onClick={() => toggleActivo(t)}>
                        {t.activo ? 'Inactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ta-mobile-list">
          {tipos.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#8ea3c7', padding: '20px', background: '#172131', border: '1px solid rgba(137,160,201,0.18)', borderRadius: '14px' }}>
              Sin tipos de asiento
            </div>
          ) : tipos.map((t) => (
            <div key={`m-${t.id}`} className="ta-row-card">
              <div className="ta-row-head">
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{t.codigo}</span>
                <span>{t.activo ? 'Activo' : 'Inactivo'}</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', marginBottom: '6px' }}>{t.nombre}</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>{t.descripcion || '-'}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="ta-chip">
                  <span className="ta-dot" style={{ background: t.color || '#16a34a' }} />
                  {t.color || '#16a34a'}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Orden: {t.orden}</span>
              </div>
              <div className="ta-actions">
                <button className="ta-link" disabled={!canEdit} onClick={() => abrirEditar(t)}>Editar</button>
                <button className="ta-link danger" disabled={!canEdit} onClick={() => toggleActivo(t)}>
                  {t.activo ? 'Inactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="ta-subtitle">Categorias Efectivas de Asiento</div>
        <ListToolbar
          className="ta-head-actions"
          search={(
            <input
              className="ta-input"
              style={{ minWidth: '260px', maxWidth: '420px' }}
              placeholder="Buscar categoria o tipo..."
              value={catBusqueda}
              onChange={(e) => setCatBusqueda(e.target.value)}
            />
          )}
          filters={(
            <>
              <button
                className="ta-export-btn"
                onClick={() => setCatEstadoFiltro('todas')}
                style={catEstadoFiltro === 'todas' ? { borderColor: '#22c55e', color: '#166534', background: '#f0fdf4' } : undefined}
              >
                Todas
              </button>
              <button
                className="ta-export-btn"
                onClick={() => setCatEstadoFiltro('activas')}
                style={catEstadoFiltro === 'activas' ? { borderColor: '#22c55e', color: '#166534', background: '#f0fdf4' } : undefined}
              >
                Activas
              </button>
              <button
                className="ta-export-btn"
                onClick={() => setCatEstadoFiltro('inactivas')}
                style={catEstadoFiltro === 'inactivas' ? { borderColor: '#22c55e', color: '#166534', background: '#f0fdf4' } : undefined}
              >
                Inactivas
              </button>
            </>
          )}
          exports={(
            <>
              <button
                className="ta-export-btn"
                onClick={() => exportCsv('categorias_asiento_empresa.csv', categoriasExportRows, categoriasExportColumns)}
                disabled={categoriasExportRows.length === 0}
              >
                CSV
              </button>
              <button
                className="ta-export-btn"
                onClick={() => exportExcelXml('categorias_asiento_empresa.xls', categoriasExportRows, categoriasExportColumns)}
                disabled={categoriasExportRows.length === 0}
              >
                EXCEL
              </button>
              <button
                className="ta-export-btn"
                onClick={() =>
                  exportPdfWithPrint({
                    title: 'Categorias Efectivas de Asiento',
                    subtitle: `Empresa ${empresaId} | Total: ${categoriasExportRows.length} | Filtro: ${catEstadoFiltro}`,
                    rows: categoriasExportRows,
                    columns: categoriasExportColumns,
                    orientation: 'portrait',
                  })
                }
                disabled={categoriasExportRows.length === 0}
              >
                PDF
              </button>
            </>
          )}
          actions={(
            <>
              <button className="ta-btn neutral" onClick={inicializarCategoriasEmpresa} disabled={!canEdit}>
                Inicializar Categorias Empresa
              </button>
              <button className="ta-btn neutral" onClick={restaurarCategoriasEmpresa} disabled={!canEdit}>
                Restaurar desde Base
              </button>
            </>
          )}
        />
        <div className="ta-table-wrap">
          <table className="ta-table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Descripcion</th>
                <th>Tipo ID</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categoriasFiltradas.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af' }}>Sin categorias efectivas</td></tr>
              ) : categoriasFiltradas.map((c) => (
                <tr key={c.categoria_id}>
                  <td style={{ fontFamily: 'DM Mono, monospace' }}>{c.codigo}</td>
                  <td>{c.descripcion}</td>
                  <td>
                    {c.tipo_id
                      ? (() => {
                          const tipo = tipos.find((t) => t.id === c.tipo_id);
                          return tipo ? `${tipo.codigo} - ${tipo.nombre}` : c.tipo_id;
                        })()
                      : '-'}
                  </td>
                  <td>{c.activo ? 'Activo' : 'Inactivo'}</td>
                  <td>
                    <div className="ta-actions">
                      <button className="ta-link" disabled={!canEdit} onClick={() => abrirEditarCategoria(c)}>
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="ta-modal-bg">
          <div className="ta-modal">
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>
              {editingId ? 'Editar Tipo de Asiento' : 'Nuevo Tipo de Asiento'}
            </div>
            <div className="ta-grid">
              <div className="ta-group">
                <label className="ta-label">Codigo *</label>
                <input className="ta-input" value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} />
              </div>
              <div className="ta-group">
                <label className="ta-label">Nombre *</label>
                <input className="ta-input" value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div className="ta-group span2">
                <label className="ta-label">Descripcion</label>
                <input className="ta-input" value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} />
              </div>
              <div className="ta-group">
                <label className="ta-label">Color</label>
                <input className="ta-input" type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} />
              </div>
              <div className="ta-group">
                <label className="ta-label">Orden</label>
                <input className="ta-input" type="number" value={form.orden} onChange={(e) => setForm((p) => ({ ...p, orden: Number(e.target.value) || 100 }))} />
              </div>
              <div className="ta-group span2" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))} />
                <label>Activo</label>
              </div>
            </div>
            <div className="ta-footer">
              <button className="ta-btn neutral" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button>
              <button className="ta-btn primary" onClick={guardar} disabled={saving || !canEdit}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {catModalOpen && catForm && (
        <div className="ta-modal-bg">
          <div className="ta-modal">
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>
              Editar Categoria de Asiento (Empresa {empresaId})
            </div>
            <div className="ta-grid">
              <div className="ta-group">
                <label className="ta-label">Codigo *</label>
                <input
                  className="ta-input"
                  value={catForm.codigo}
                  onChange={(e) => setCatForm((p) => p ? ({ ...p, codigo: e.target.value }) : p)}
                />
              </div>
              <div className="ta-group">
                <label className="ta-label">Tipo</label>
                <select
                  className="ta-input"
                  value={catForm.tipo_id}
                  onChange={(e) =>
                    setCatForm((p) => p ? ({ ...p, tipo_id: e.target.value === '' ? '' : Number(e.target.value) }) : p)
                  }
                >
                  <option value="">-- Sin tipo --</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} - {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ta-group span2">
                <label className="ta-label">Descripcion *</label>
                <input
                  className="ta-input"
                  value={catForm.descripcion}
                  onChange={(e) => setCatForm((p) => p ? ({ ...p, descripcion: e.target.value }) : p)}
                />
              </div>
              <div className="ta-group span2" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={catForm.activo}
                  onChange={(e) => setCatForm((p) => p ? ({ ...p, activo: e.target.checked }) : p)}
                />
                <label>Activo</label>
              </div>
            </div>
            <div className="ta-footer">
              <button className="ta-btn neutral" onClick={() => setCatModalOpen(false)} disabled={catSaving}>
                Cancelar
              </button>
              <button className="ta-btn primary" onClick={guardarCategoriaEmpresa} disabled={catSaving || !canEdit}>
                {catSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
