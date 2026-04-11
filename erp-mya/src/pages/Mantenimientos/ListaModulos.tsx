import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';

import { exportCsv, exportExcelXml, exportPdfWithPrint, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';
import { mantenimientoBaseStyles } from './mantenimientoTheme';

interface Modulo {
  id: number;
  codigo: string;
  nombre: string;
  icono: string;
  orden: number;
  activo: boolean;
}

interface EmpresaChip {
  id: number;
  codigo: string;
  nombre: string;
}

const styles = `
  ${mantenimientoBaseStyles}
  .mod-wrap { padding:0; }
  .mod-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; }
  .mod-title { font-size:20px; font-weight:600; color:var(--card-text); letter-spacing:-0.3px; }
  .mod-title span { font-size:13px; font-weight:400; color:var(--gray-400); margin-left:8px; }
  .btn-nuevo { display:flex; align-items:center; gap:8px; padding:10px 18px;
    border-radius:10px; font-size:13px; font-weight:600;
    cursor:pointer; transition:opacity 0.2s; }
  .btn-nuevo:hover { opacity:0.92; }

  .mod-table-wrap { border-radius:14px; overflow:hidden; }
  .mod-table { width:100%; border-collapse:collapse; }
  .mod-table thead { background:var(--bg-dark2); }
  .mod-table th { padding:11px 16px; text-align:left; font-size:11px; font-weight:600;
    color:var(--gray-400); letter-spacing:0.06em; text-transform:uppercase;
    border-bottom:1px solid var(--card-border); }
  .mod-table td { padding:11px 16px; font-size:13px; color:var(--card-text);
    border-bottom:1px solid var(--card-border); vertical-align:middle; }
  .mod-table tr.mod-main-row:last-of-type td { border-bottom:none; }
  .mod-table tr.mod-main-row { cursor:pointer; transition:background 0.12s; }
  .mod-table tr.mod-main-row:hover td { background:color-mix(in srgb, var(--green-main) 8%, var(--card-bg)); }
  .mod-table tr.mod-main-row.expanded td { background:color-mix(in srgb, var(--green-main) 12%, var(--card-bg)); border-bottom:none; }
  .mod-table tr.mod-detail-row td { background:color-mix(in srgb, var(--green-main) 6%, var(--card-bg));
    border-bottom:1px solid color-mix(in srgb, var(--green-main) 20%, var(--card-border));
    padding:10px 16px 14px 40px; }

  .mod-chevron-btn { background:none; border:none; cursor:pointer; padding:2px;
    color:var(--gray-400); display:flex; align-items:center; transition:color 0.15s; }
  .mod-chevron-btn:hover { color:var(--green-main); }

  .mod-empresa-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
  .mod-empresa-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
    background:color-mix(in srgb, var(--green-main) 12%, var(--card-bg));
    border:1px solid color-mix(in srgb, var(--green-main) 30%, transparent);
    border-radius:20px; font-size:11px; font-weight:500; color:var(--card-text);
    white-space:nowrap; }
  .mod-empresa-chip-code { font-family:'DM Mono',monospace; font-weight:700;
    color:var(--green-main); }
  .mod-empresa-empty { font-size:12px; color:var(--gray-400); font-style:italic; }
  .mod-empresa-label { font-size:11px; font-weight:600; color:var(--gray-400);
    letter-spacing:0.05em; text-transform:uppercase; margin-bottom:6px;
    display:flex; align-items:center; gap:5px; }

  .mod-mobile-list { display:none; }
  .mod-search-row { margin-bottom:12px; }
  .mod-search-input { width:100%; max-width:360px; padding:9px 12px;
    border-radius:8px; font-size:13px; outline:none; }
  .mod-search-input::placeholder { color:var(--gray-400); }

  .mod-card { border-radius:10px; padding:12px; margin-bottom:8px; }
  .mod-card.expanded { border-color:color-mix(in srgb, var(--green-main) 40%, transparent); }
  .mod-card-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; align-items:center; }
  .mod-card-detail { border-top:1px solid var(--card-border); margin-top:10px; padding-top:10px; }
  .mod-codigo { font-family:'DM Mono',monospace; color:var(--green-main); font-weight:600; }
  .mod-icono { font-size:18px; }
  .mod-order { font-family:'DM Mono',monospace; color:var(--gray-400); }

  /* Badge sin fondo — solo punto + texto */
  .mod-badge { display:inline-flex; align-items:center; gap:5px;
    font-size:12px; font-weight:500; padding:0; background:none; border:none; }
  .mod-badge::before { content:''; display:inline-block; width:6px; height:6px;
    border-radius:50%; flex-shrink:0; }
  .mod-badge.activo { color:var(--green-main); }
  .mod-badge.activo::before { background:var(--green-main);
    box-shadow:0 0 4px color-mix(in srgb, var(--green-main) 60%, transparent); }
  .mod-badge.inactivo { color:var(--gray-400); }
  .mod-badge.inactivo::before { background:var(--gray-400); }

  .mod-actions { display:flex; gap:5px; }
  /* Botones ghost con borde sutil */
  .btn-edit { padding:5px 11px;
    background:color-mix(in srgb, var(--green-main) 10%, transparent);
    border:1px solid color-mix(in srgb, var(--green-main) 30%, transparent);
    border-radius:6px; color:var(--green-main); font-size:11px; font-weight:600;
    cursor:pointer; transition:all 0.15s; }
  .btn-edit:hover { background:var(--green-main); color:#fff; border-color:var(--green-main); }
  .btn-del { padding:5px 11px;
    background:color-mix(in srgb, #f87171 8%, transparent);
    border:1px solid color-mix(in srgb, #f87171 30%, transparent);
    border-radius:6px; color:#f87171; font-size:11px; font-weight:600;
    cursor:pointer; transition:all 0.15s; }
  .btn-del:hover { background:#ef4444; color:#fff; border-color:#ef4444; }

  .success-msg { padding:10px 14px;
    background:color-mix(in srgb, var(--green-main) 12%, var(--card-bg));
    border:1px solid color-mix(in srgb, var(--green-main) 30%, transparent);
    border-radius:8px; color:var(--green-main); font-size:12px; font-weight:500;
    margin-bottom:16px; }

  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.65);
    display:flex; align-items:center; justify-content:center; z-index:1000; }
  .modal-box { background:var(--bg-dark2); border-radius:16px; padding:28px; width:460px;
    box-shadow:0 24px 64px rgba(0,0,0,0.4); border:1px solid var(--card-border); }
  .modal-title { font-size:16px; font-weight:600; color:var(--card-text); margin-bottom:20px; }
  .modal-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .modal-field { margin-bottom:14px; }
  .modal-field.full { grid-column:1 / -1; }
  .modal-label { display:block; font-size:10px; font-weight:700; color:var(--gray-400);
    letter-spacing:0.06em; text-transform:uppercase; margin-bottom:5px; }
  .modal-input { width:100%; padding:9px 11px; border:1px solid var(--card-border);
    border-radius:8px; font-size:13px; color:var(--card-text); background:var(--card-bg);
    outline:none; font-family:'DM Sans',sans-serif; transition:border-color 0.2s;
    box-sizing:border-box; }
  .modal-input:focus { border-color:var(--green-main);
    box-shadow:0 0 0 3px color-mix(in srgb, var(--green-main) 18%, transparent); }
  .modal-input::placeholder { color:var(--gray-400); }
  .modal-check { display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:4px; }
  .modal-check input { width:15px; height:15px; accent-color:var(--green-main); }
  .modal-check span { font-size:13px; color:var(--card-text); }
  .modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:22px; }
  .btn-cancelar { padding:8px 16px;
    background:color-mix(in srgb, var(--gray-400) 10%, transparent);
    border:1px solid var(--card-border); border-radius:8px;
    color:var(--gray-400); font-size:13px; font-weight:500; cursor:pointer; transition:all 0.15s; }
  .btn-cancelar:hover { background:var(--card-border); color:var(--card-text); }
  .btn-guardar { padding:8px 20px;
    background:linear-gradient(135deg, var(--green-dim), var(--green-main));
    border:none; border-radius:8px; color:#fff; font-size:13px; font-weight:600;
    cursor:pointer; transition:opacity 0.15s; }
  .btn-guardar:hover { opacity:0.88; }

  @media (max-width: 640px) {
    .mod-header { flex-wrap:wrap; gap:10px; }
    .btn-nuevo { width:100%; justify-content:center; }
    .mod-table-wrap { display:none; }
    .mod-mobile-list { display:block; }
    .modal-box { width:92vw; padding:20px; border-radius:12px; }
    .modal-grid { grid-template-columns:1fr; gap:8px; }
    .modal-actions { flex-direction:column; }
    .btn-cancelar, .btn-guardar { width:100%; }
  }
`;

const iconosBase = ['🧮', '🏛️', '📬', '🧑‍💼', '📦', '🪪', '🏗️', '🗂️', '🧾', '💳', '📈', '📊', '🛠️', '🌿', '⛽'];

interface ListaModulosProps {
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function ListaModulos({
  canCreate = true,
  canEdit = true,
  canDelete = true
}: ListaModulosProps) {
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [empresasPorModulo, setEmpresasPorModulo] = useState<Record<number, EmpresaChip[]>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Modulo | null>(null);
  const [exito, setExito] = useState('');
  const [form, setForm] = useState({
    codigo: '', nombre: '', icono: '🧩', orden: 1, activo: true
  });
  const [search, setSearch] = useState('');

  const modulosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return modulos;
    return modulos.filter((m) =>
      (m.codigo || '').toLowerCase().includes(term) ||
      (m.nombre || '').toLowerCase().includes(term)
    );
  }, [modulos, search]);

  const exportRows = modulosFiltrados.map((m) => ({
    codigo: m.codigo,
    nombre: m.nombre,
    icono: m.icono || '',
    orden: m.orden,
    estado: m.activo ? 'Activo' : 'Inactivo',
    empresas: (empresasPorModulo[m.id] || []).map(e => e.codigo).join(', '),
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'codigo',   title: 'Codigo',   getValue: (r) => r.codigo,   align: 'left', width: '12%' },
    { key: 'nombre',   title: 'Nombre',   getValue: (r) => r.nombre,   align: 'left', width: '32%' },
    { key: 'icono',    title: 'Icono',    getValue: (r) => r.icono,    width: '8%' },
    { key: 'orden',    title: 'Orden',    getValue: (r) => r.orden,    width: '8%' },
    { key: 'estado',   title: 'Estado',   getValue: (r) => r.estado,   width: '12%' },
    { key: 'empresas', title: 'Empresas', getValue: (r) => r.empresas, align: 'left', width: '28%' },
  ];

  const cargar = async () => {
    const [{ data: modsData }, { data: emData }] = await Promise.all([
      supabase.from('modulos').select('*').order('orden'),
      supabase
        .from('empresa_modulos')
        .select('modulo_id, empresas(id, codigo, nombre)')
        .order('modulo_id'),
    ]);

    if (modsData) setModulos(modsData);

    if (emData) {
      const map: Record<number, EmpresaChip[]> = {};
      for (const row of emData) {
        const mid = row.modulo_id as number;
        const emp = (Array.isArray(row.empresas) ? null : row.empresas) as { id: number; codigo: string; nombre: string } | null;
        if (!emp) continue;
        if (!map[mid]) map[mid] = [];
        map[mid].push(emp);
      }
      setEmpresasPorModulo(map);
    }
  };

  useEffect(() => { cargar(); }, []);

  const mostrarExito = (msg: string) => {
    setExito(msg);
    setTimeout(() => setExito(''), 3000);
  };

  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedId(prev => prev === id ? null : id);
  };

  const abrirNuevo = () => {
    if (!canCreate) return;
    setEditando(null);
    setForm({ codigo: '', nombre: '', icono: '🧩', orden: modulos.length + 1, activo: true });
    setModal(true);
  };

  const abrirEditar = (modulo: Modulo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    setEditando(modulo);
    setForm({
      codigo: modulo.codigo, nombre: modulo.nombre,
      icono: modulo.icono || '🧩', orden: modulo.orden ?? 1, activo: modulo.activo
    });
    setModal(true);
  };

  const guardar = async () => {
    if (editando && !canEdit) return;
    if (!editando && !canCreate) return;
    if (!form.codigo.trim() || !form.nombre.trim()) return;

    const payload = {
      codigo: form.codigo.trim().toUpperCase(),
      nombre: form.nombre.trim(),
      icono: form.icono || '🧩',
      orden: Number(form.orden) || 1,
      activo: form.activo,
    };

    if (editando) {
      await supabase.from('modulos').update(payload).eq('id', editando.id);
      mostrarExito('Módulo actualizado correctamente');
    } else {
      await supabase.from('modulos').insert(payload);
      mostrarExito('Módulo creado correctamente');
    }
    setModal(false);
    cargar();
  };

  const eliminar = async (modulo: Modulo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canDelete) return;
    const { count } = await supabase
      .from('actividad_modulos')
      .select('*', { count: 'exact', head: true })
      .eq('modulo_id', modulo.id);
    if (count && count > 0) {
      alert('⚠️ Este módulo está asignado a actividades. No se puede eliminar.');
      return;
    }
    await supabase.from('modulos').delete().eq('id', modulo.id);
    mostrarExito('Módulo eliminado');
    cargar();
  };

  // ─── Chips de empresas ───────────────────────────────────────────────────────
  const renderEmpresaDetail = (modulo: Modulo) => {
    const chips = empresasPorModulo[modulo.id] || [];
    return (
      <tr className="mod-detail-row">
        <td colSpan={5}>
          <div className="mod-empresa-label">
            <Building2 size={12} />
            Empresas con este módulo asignado
          </div>
          {chips.length === 0 ? (
            <span className="mod-empresa-empty">Sin asignación específica — hereda por actividad</span>
          ) : (
            <div className="mod-empresa-chips">
              {chips.map(e => (
                <span key={e.id} className="mod-empresa-chip">
                  <span className="mod-empresa-chip-code">{e.codigo}</span>
                  {e.nombre}
                </span>
              ))}
            </div>
          )}
        </td>
      </tr>
    );
  };

  return (
    <>
      <style>{styles}</style>
      <div className="mod-wrap mnt-wrap">
        <div className="mod-header">
          <div className="mod-title mnt-title">
            Módulos
            <span>{modulos.length} registros</span>
          </div>
          <ListToolbar
            exports={(
              <>
                <button className="btn-edit" onClick={() => exportCsv('modulos.csv', exportRows, exportColumns)} disabled={exportRows.length === 0}>CSV</button>
                <button className="btn-edit" onClick={() => exportExcelXml('modulos.xls', exportRows, exportColumns)} disabled={exportRows.length === 0}>EXCEL</button>
                <button className="btn-edit" onClick={() => exportPdfWithPrint({ title: 'Módulos', subtitle: `Total: ${exportRows.length} registros`, rows: exportRows, columns: exportColumns })} disabled={exportRows.length === 0}>PDF</button>
              </>
            )}
            actions={canCreate ? <button className="btn-nuevo mnt-btn mnt-btn-primary" onClick={abrirNuevo}>+ Nuevo Módulo</button> : null}
          />
        </div>

        <div className="mod-search-row">
          <input
            className="mod-search-input mnt-input"
            placeholder="Buscar por código o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {exito && <div className="success-msg">{exito}</div>}

        {/* ─── Tabla desktop ─────────────────────────────────────────────────── */}
        <div className="mod-table-wrap mnt-card mnt-table-wrap rv-desktop-table">
          <table className="mod-table">
            <thead>
              <tr>
                <th style={{ width: '32px' }}></th>
                <th>Nombre</th>
                <th>Ícono</th>
                <th>Orden</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {modulosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--gray-400)' }}>
                    No hay módulos registrados
                  </td>
                </tr>
              ) : modulosFiltrados.map(modulo => {
                const isOpen = expandedId === modulo.id;
                const nEmpresas = (empresasPorModulo[modulo.id] || []).length;
                return (
                  <React.Fragment key={modulo.id}>
                    <tr
                      className={`mod-main-row${isOpen ? ' expanded' : ''}`}
                      onClick={(e) => toggleExpand(modulo.id, e)}
                    >
                      <td>
                        <button className="mod-chevron-btn" onClick={(e) => toggleExpand(modulo.id, e)}>
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--card-text)' }}>{modulo.nombre}</div>
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>
                          <span className="mod-codigo" style={{ fontSize: '11px' }}>{modulo.codigo}</span>
                          {nEmpresas > 0 && <span style={{ marginLeft: '8px' }}>· {nEmpresas} empresa{nEmpresas !== 1 ? 's' : ''}</span>}
                        </div>
                      </td>
                      <td><span className="mod-icono">{modulo.icono || '🧩'}</span></td>
                      <td><span className="mod-order">{modulo.orden}</span></td>
                      <td>
                        <span className={`mod-badge ${modulo.activo ? 'activo' : 'inactivo'}`}>
                          {modulo.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="mod-actions">
                          {canEdit && <button className="btn-edit" onClick={(e) => abrirEditar(modulo, e)}>Editar</button>}
                          {canDelete && <button className="btn-del" onClick={(e) => eliminar(modulo, e)}>Eliminar</button>}
                        </div>
                      </td>
                    </tr>
                    {isOpen && renderEmpresaDetail(modulo)}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ─── Cards móvil ───────────────────────────────────────────────────── */}
        <div className="mod-mobile-list rv-mobile-cards">
          {modulosFiltrados.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--gray-400)', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '12px' }}>
              No hay módulos registrados
            </div>
          ) : modulosFiltrados.map((modulo) => {
            const isOpen = expandedId === modulo.id;
            const chips = empresasPorModulo[modulo.id] || [];
            return (
              <div key={modulo.id} className={`mod-card mnt-card${isOpen ? ' expanded' : ''}`} onClick={() => setExpandedId(prev => prev === modulo.id ? null : modulo.id)}>
                <div className="mod-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="mod-icono">{modulo.icono || '🧩'}</span>
                    <div>
                      <span className="mod-codigo">{modulo.codigo}</span>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--card-text)' }}>{modulo.nombre}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`mod-badge ${modulo.activo ? 'activo' : 'inactivo'}`}>
                      {modulo.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    {isOpen ? <ChevronDown size={14} style={{ color: 'var(--gray-400)' }} /> : <ChevronRight size={14} style={{ color: 'var(--gray-400)' }} />}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--gray-400)' }}>
                  <span>Orden: <span className="mod-order">{modulo.orden}</span></span>
                  <span>{chips.length} empresa{chips.length !== 1 ? 's' : ''}</span>
                </div>
                {isOpen && (
                  <div className="mod-card-detail">
                    <div className="mod-empresa-label" style={{ marginBottom: '6px' }}>
                      <Building2 size={11} /> Empresas asignadas
                    </div>
                    {chips.length === 0 ? (
                      <span className="mod-empresa-empty">Sin asignación específica</span>
                    ) : (
                      <div className="mod-empresa-chips">
                        {chips.map(e => (
                          <span key={e.id} className="mod-empresa-chip">
                            <span className="mod-empresa-chip-code">{e.codigo}</span>
                            {e.nombre}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mod-actions" style={{ marginTop: '10px' }} onClick={e => e.stopPropagation()}>
                      {canEdit && <button className="btn-edit" onClick={(e) => abrirEditar(modulo, e)}>Editar</button>}
                      {canDelete && <button className="btn-del" onClick={(e) => eliminar(modulo, e)}>Eliminar</button>}
                    </div>
                  </div>
                )}
                {!isOpen && (
                  <div className="mod-actions" style={{ marginTop: '8px' }} onClick={e => e.stopPropagation()}>
                    {canEdit && <button className="btn-edit" onClick={(e) => abrirEditar(modulo, e)}>Editar</button>}
                    {canDelete && <button className="btn-del" onClick={(e) => eliminar(modulo, e)}>Eliminar</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Modal ──────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? 'Editar Módulo' : 'Nuevo Módulo'}</div>

            <div className="modal-grid">
              <div className="modal-field">
                <label className="modal-label">Código *</label>
                <input
                  className="modal-input"
                  maxLength={20}
                  value={form.codigo}
                  onChange={e => setForm(prev => ({ ...prev, codigo: e.target.value.toUpperCase() }))}
                  placeholder="CONTAB"
                />
              </div>
              <div className="modal-field">
                <label className="modal-label">Orden</label>
                <input
                  className="modal-input"
                  type="number"
                  min={1}
                  value={form.orden}
                  onChange={e => setForm(prev => ({ ...prev, orden: Number(e.target.value) || 1 }))}
                />
              </div>
              <div className="modal-field full">
                <label className="modal-label">Nombre *</label>
                <input
                  className="modal-input"
                  value={form.nombre}
                  onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Contabilidad"
                />
              </div>
              <div className="modal-field full">
                <label className="modal-label">Ícono</label>
                <input
                  className="modal-input"
                  maxLength={4}
                  value={form.icono}
                  onChange={e => setForm(prev => ({ ...prev, icono: e.target.value }))}
                  placeholder="🧩"
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {iconosBase.map(icono => (
                    <button key={icono} type="button" onClick={() => setForm(prev => ({ ...prev, icono }))}
                      style={{ width: '32px', height: '32px', borderRadius: '7px', border: form.icono === icono ? '2px solid var(--green-main)' : '1px solid var(--gray-200)', background: form.icono === icono ? 'var(--green-soft)' : 'var(--card-bg)', cursor: 'pointer', fontSize: '16px' }}>
                      {icono}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="modal-check">
              <input type="checkbox" checked={form.activo} onChange={e => setForm(prev => ({ ...prev, activo: e.target.checked }))} />
              <span>Activo</span>
            </label>

            <div className="modal-actions">
              <button className="btn-cancelar" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-guardar" onClick={guardar}>{editando ? 'Actualizar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
