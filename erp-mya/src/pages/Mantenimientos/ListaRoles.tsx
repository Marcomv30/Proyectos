import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, exportExcelXml, exportPdfWithPrint, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';

interface Rol {
  id: number;
  nombre: string;
  descripcion: string | null;
}

interface Modulo {
  id: number;
  codigo: string;
  nombre: string;
}

interface PermisoCatalogo {
  id: number;
  modulo_id: number;
  accion: string;
  modulos?: Modulo;
}

interface RolPermisoRow {
  id: number;
  permiso_id: number;
}

const ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'aprobar'];

const styles = `
  .rol-wrap { padding: 0; }
  .rol-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
  .rol-title { font-size:20px; font-weight:600; color:#1f2937; }
  .rol-title span { font-size:13px; font-weight:400; color:#9ca3af; margin-left:8px; }
  .btn-nuevo { display:flex; align-items:center; gap:8px; padding:10px 18px; background:linear-gradient(135deg,#16a34a,#22c55e); border:none; border-radius:10px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; }
  .btn-nuevo:hover { opacity:0.92; }
  .msg-ok { padding:10px 14px; background:#dcfce7; border:1px solid #bbf7d0; border-radius:8px; color:#166534; font-size:12px; margin-bottom:12px; }
  .msg-err { padding:10px 14px; background:#fee2e2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:12px; margin-bottom:12px; }

  .rol-layout { display:grid; grid-template-columns: 360px 1fr; gap:16px; align-items:start; }
  .rol-panel, .perm-panel { background:#fff; border:1px solid #e5e7eb; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
  .rol-panel-head, .perm-panel-head { padding:14px 16px; border-bottom:1px solid #f3f4f6; }
  .perm-head-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .rol-panel-title, .perm-panel-title { font-size:13px; font-weight:600; color:#111827; }
  .rol-panel-sub, .perm-panel-sub { font-size:12px; color:#6b7280; margin-top:2px; }
  .perm-head-actions { display:flex; gap:8px; }
  .btn-mass { padding:7px 10px; border-radius:8px; border:1px solid; font-size:11px; font-weight:600; cursor:pointer; }
  .btn-mass.add { background:#dcfce7; border-color:#bbf7d0; color:#166534; }
  .btn-mass.add:hover { background:#bbf7d0; }
  .btn-mass.del { background:#fee2e2; border-color:#fecaca; color:#991b1b; }
  .btn-mass.del:hover { background:#fecaca; }
  .btn-mass:disabled { opacity:0.6; cursor:not-allowed; }

  .rol-list { padding:8px; display:flex; flex-direction:column; gap:8px; max-height:620px; overflow:auto; }
  .rol-search { padding:10px 12px 0; }
  .rol-search-input { width:100%; padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; font-size:12px; color:#1f2937; outline:none; }
  .rol-search-input:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.1); }
  .rol-card { border:1px solid #e5e7eb; border-radius:10px; padding:10px; transition:border-color 0.15s, background 0.15s; cursor:pointer; }
  .rol-card:hover { border-color:#86efac; background:#f0fdf4; }
  .rol-card.sel { border-color:#22c55e; background:#dcfce7; }
  .rol-card-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .rol-name { font-size:14px; font-weight:600; color:#111827; }
  .rol-desc { font-size:12px; color:#6b7280; margin-top:4px; }
  .rol-chip { font-size:11px; color:#166534; background:#dcfce7; border:1px solid #bbf7d0; border-radius:999px; padding:2px 8px; white-space:nowrap; }
  .rol-actions { display:flex; gap:6px; margin-top:8px; }
  .btn-edit, .btn-del { padding:5px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; border:1px solid; }
  .btn-edit { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
  .btn-edit:hover { background:#dbeafe; }
  .btn-del { background:#fef2f2; border-color:#fecaca; color:#b91c1c; }
  .btn-del:hover { background:#fee2e2; }

  .perm-wrap { padding:12px 16px 16px; }
  .perm-mobile-list { display:none; }
  .perm-card { border:1px solid #e5e7eb; border-radius:10px; padding:10px; margin-bottom:8px; background:#fff; }
  .perm-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px; }
  .perm-card-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
  .perm-card-item { display:flex; align-items:center; gap:6px; }
  .perm-card-item label { font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:.04em; min-width:56px; }
  .perm-table { width:100%; border-collapse:collapse; }
  .perm-table th { text-align:left; font-size:11px; color:#6b7280; letter-spacing:0.04em; text-transform:uppercase; border-bottom:1px solid #e5e7eb; padding:8px 6px; }
  .perm-table td { border-bottom:1px solid #f3f4f6; padding:8px 6px; font-size:13px; color:#374151; }
  .perm-table tr:last-child td { border-bottom:none; }
  .perm-modulo { font-weight:600; color:#111827; }
  .perm-codigo { font-size:11px; color:#6b7280; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .perm-row-actions { display:flex; gap:6px; align-items:center; justify-content:flex-start; }
  .btn-row { width:26px; height:24px; padding:0; border-radius:6px; border:1px solid;
    font-size:13px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
  .btn-row.add { background:#ecfdf3; border-color:#bbf7d0; color:#166534; }
  .btn-row.add:hover { background:#dcfce7; }
  .btn-row.del { background:#fff1f2; border-color:#fecdd3; color:#9f1239; }
  .btn-row.del:hover { background:#ffe4e6; }
  .btn-row:disabled { opacity:0.6; cursor:not-allowed; }
  .perm-check { width:16px; height:16px; cursor:pointer; accent-color:#16a34a; }
  .perm-empty { padding:24px; color:#9ca3af; font-size:13px; text-align:center; }

  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:1000; }
  .modal-box { width:420px; background:#fff; border-radius:14px; padding:22px; box-shadow:0 20px 60px rgba(0,0,0,0.2); }
  .modal-title { font-size:16px; font-weight:600; color:#111827; margin-bottom:16px; }
  .modal-field { margin-bottom:12px; }
  .modal-label { display:block; margin-bottom:6px; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:#6b7280; font-weight:600; }
  .modal-input { width:100%; padding:9px 10px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; outline:none; }
  .modal-input:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.12); }
  .modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:16px; }
  .btn-cancelar, .btn-guardar { border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; padding:9px 16px; }
  .btn-cancelar { background:#f3f4f6; color:#374151; }
  .btn-guardar { background:linear-gradient(135deg,#16a34a,#22c55e); color:#fff; }

  @media (max-width: 980px) {
    .rol-layout { grid-template-columns:1fr; }
    .rol-list { max-height:unset; }
    .perm-wrap { overflow-x:auto; }
    .perm-table { min-width:760px; }
  }

  @media (max-width: 620px) {
    .rol-header { flex-wrap:wrap; gap:10px; }
    .btn-nuevo { width:100%; justify-content:center; }
    .perm-head-row { flex-direction:column; align-items:flex-start; }
    .perm-head-actions { width:100%; }
    .btn-mass { flex:1; }
    .perm-table { display:none; }
    .perm-mobile-list { display:block; }
    .modal-box { width:92vw; padding:20px; border-radius:12px; }
    .modal-actions { flex-direction:column; }
    .btn-cancelar, .btn-guardar { width:100%; }
  }
`;

interface ListaRolesProps {
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function ListaRoles({
  canCreate = true,
  canEdit = true,
  canDelete = true
}: ListaRolesProps) {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [usuariosPorRol, setUsuariosPorRol] = useState<Record<number, number>>({});
  const [rolSeleccionado, setRolSeleccionado] = useState<Rol | null>(null);
  const [catalogoPermisos, setCatalogoPermisos] = useState<PermisoCatalogo[]>([]);
  const [permisosRol, setPermisosRol] = useState<RolPermisoRow[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [searchRol, setSearchRol] = useState('');

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Rol | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '' });

  const showOk = (text: string) => {
    setOk(text);
    setTimeout(() => setOk(''), 2600);
  };

  const showErr = (text: string) => {
    setErr(text);
    setTimeout(() => setErr(''), 3500);
  };

  const cargarRoles = useCallback(async () => {
    const { data, error } = await supabase.from('roles').select('*').order('nombre');
    if (error) {
      showErr(error.message);
      return;
    }
    const lista = (data || []) as Rol[];
    setRoles(lista);

    const conteos: Record<number, number> = {};
    for (const rol of lista) {
      const { count } = await supabase
        .from('usuarios_empresas')
        .select('*', { count: 'exact', head: true })
        .eq('rol_id', rol.id)
        .eq('activo', true);
      conteos[rol.id] = count || 0;
    }
    setUsuariosPorRol(conteos);

    setRolSeleccionado(prev => {
      if (!prev && lista.length > 0) return lista[0];
      if (!prev) return null;
      return lista.find(r => r.id === prev.id) || (lista[0] || null);
    });
  }, []);

  const cargarCatalogoPermisos = useCallback(async () => {
    const { data, error } = await supabase
      .from('permisos')
      .select('id,modulo_id,accion,modulos:modulo_id(id,codigo,nombre)')
      .order('modulo_id')
      .order('accion');
    if (error) {
      showErr('No se pudo cargar el catalogo de permisos. Verifica migracion 001.');
      return;
    }
    setCatalogoPermisos((data || []) as unknown as PermisoCatalogo[]);
  }, []);

  const cargarPermisosRol = useCallback(async (rolId: number) => {
    const { data, error } = await supabase
      .from('roles_permisos')
      .select('id,permiso_id')
      .eq('rol_id', rolId);
    if (error) {
      showErr(error.message);
      return;
    }
    setPermisosRol((data || []) as RolPermisoRow[]);
  }, []);

  useEffect(() => {
    cargarRoles();
    cargarCatalogoPermisos();
  }, [cargarRoles, cargarCatalogoPermisos]);

  useEffect(() => {
    if (rolSeleccionado) {
      cargarPermisosRol(rolSeleccionado.id);
    } else {
      setPermisosRol([]);
    }
  }, [rolSeleccionado, cargarPermisosRol]);

  const permisosRolSet = useMemo(() => {
    return new Set(permisosRol.map(p => p.permiso_id));
  }, [permisosRol]);

  const modulosOrdenados = useMemo(() => {
    const map = new Map<number, Modulo>();
    for (const p of catalogoPermisos) {
      if (p.modulos?.id && !map.has(p.modulos.id)) {
        map.set(p.modulos.id, p.modulos);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [catalogoPermisos]);

  const rolesFiltrados = useMemo(() => {
    const term = searchRol.trim().toLowerCase();
    if (!term) return roles;
    return roles.filter((r) =>
      (r.nombre || '').toLowerCase().includes(term) ||
      (r.descripcion || '').toLowerCase().includes(term)
    );
  }, [roles, searchRol]);

  const exportRows = modulosOrdenados.map((mod) => ({
    modulo: mod.nombre,
    codigo: mod.codigo,
    ver: permisoIdByModuloAccion(mod.id, 'ver') ? (permisosRolSet.has(permisoIdByModuloAccion(mod.id, 'ver') as number) ? 'SI' : 'NO') : 'NO',
    crear: permisoIdByModuloAccion(mod.id, 'crear') ? (permisosRolSet.has(permisoIdByModuloAccion(mod.id, 'crear') as number) ? 'SI' : 'NO') : 'NO',
    editar: permisoIdByModuloAccion(mod.id, 'editar') ? (permisosRolSet.has(permisoIdByModuloAccion(mod.id, 'editar') as number) ? 'SI' : 'NO') : 'NO',
    eliminar: permisoIdByModuloAccion(mod.id, 'eliminar') ? (permisosRolSet.has(permisoIdByModuloAccion(mod.id, 'eliminar') as number) ? 'SI' : 'NO') : 'NO',
    aprobar: permisoIdByModuloAccion(mod.id, 'aprobar') ? (permisosRolSet.has(permisoIdByModuloAccion(mod.id, 'aprobar') as number) ? 'SI' : 'NO') : 'NO',
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'modulo', title: 'Modulo', getValue: (r) => r.modulo, align: 'left', width: '26%' },
    { key: 'codigo', title: 'Codigo', getValue: (r) => r.codigo, width: '12%' },
    { key: 'ver', title: 'Ver', getValue: (r) => r.ver, width: '12%' },
    { key: 'crear', title: 'Crear', getValue: (r) => r.crear, width: '12%' },
    { key: 'editar', title: 'Editar', getValue: (r) => r.editar, width: '12%' },
    { key: 'eliminar', title: 'Eliminar', getValue: (r) => r.eliminar, width: '13%' },
    { key: 'aprobar', title: 'Aprobar', getValue: (r) => r.aprobar, width: '13%' },
  ];

  function permisoIdByModuloAccion(moduloId: number, accion: string): number | null {
    const row = catalogoPermisos.find(p => p.modulo_id === moduloId && p.accion === accion);
    return row?.id ?? null;
  }

  const togglePermiso = async (moduloId: number, accion: string, checked: boolean) => {
    if (!canEdit) return;
    if (!rolSeleccionado) return;
    const permisoId = permisoIdByModuloAccion(moduloId, accion);
    if (!permisoId) return;

    const key = `${rolSeleccionado.id}:${moduloId}:${accion}`;
    setSavingKey(key);
    setErr('');

    if (checked) {
      const { error } = await supabase
        .from('roles_permisos')
        .insert({ rol_id: rolSeleccionado.id, permiso_id: permisoId });
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        showErr(error.message);
      } else {
        setPermisosRol(prev => (prev.some(p => p.permiso_id === permisoId) ? prev : [...prev, { id: 0, permiso_id: permisoId }]));
      }
    } else {
      const { error } = await supabase
        .from('roles_permisos')
        .delete()
        .eq('rol_id', rolSeleccionado.id)
        .eq('permiso_id', permisoId);
      if (error) {
        showErr(error.message);
      } else {
        setPermisosRol(prev => prev.filter(p => p.permiso_id !== permisoId));
      }
    }
    setSavingKey(null);
  };

  const marcarTodos = async () => {
    if (!canEdit) return;
    if (!rolSeleccionado || bulkBusy) return;
    setBulkBusy(true);
    setErr('');

    const todosPermisosIds = catalogoPermisos.map(p => p.id);
    const faltantes = todosPermisosIds.filter(id => !permisosRolSet.has(id));

    if (faltantes.length === 0) {
      showOk('El rol ya tiene todos los permisos');
      setBulkBusy(false);
      return;
    }

    const payload = faltantes.map(permisoId => ({
      rol_id: rolSeleccionado.id,
      permiso_id: permisoId,
    }));

    const { error } = await supabase.from('roles_permisos').insert(payload);

    if (error) {
      showErr(error.message);
      setBulkBusy(false);
      return;
    }

    await cargarPermisosRol(rolSeleccionado.id);
    showOk('Todos los permisos fueron asignados');
    setBulkBusy(false);
  };

  const quitarTodos = async () => {
    if (!canEdit) return;
    if (!rolSeleccionado || bulkBusy) return;
    setBulkBusy(true);
    setErr('');

    const { error } = await supabase
      .from('roles_permisos')
      .delete()
      .eq('rol_id', rolSeleccionado.id);

    if (error) {
      showErr(error.message);
      setBulkBusy(false);
      return;
    }

    setPermisosRol([]);
    showOk('Todos los permisos fueron removidos');
    setBulkBusy(false);
  };

  const marcarFila = async (moduloId: number) => {
    if (!canEdit || !rolSeleccionado || bulkBusy) return;
    setBulkBusy(true);
    setErr('');

    const permisosModulo = catalogoPermisos.filter((p) => p.modulo_id === moduloId);
    const faltantes = permisosModulo.filter((p) => !permisosRolSet.has(p.id));
    if (faltantes.length === 0) {
      showOk('La fila ya esta marcada');
      setBulkBusy(false);
      return;
    }

    const payload = faltantes.map((p) => ({
      rol_id: rolSeleccionado.id,
      permiso_id: p.id,
    }));

    const { error } = await supabase.from('roles_permisos').insert(payload);
    if (error) {
      showErr(error.message);
      setBulkBusy(false);
      return;
    }

    await cargarPermisosRol(rolSeleccionado.id);
    setBulkBusy(false);
  };

  const quitarFila = async (moduloId: number) => {
    if (!canEdit || !rolSeleccionado || bulkBusy) return;
    setBulkBusy(true);
    setErr('');

    const permisosModuloIds = catalogoPermisos
      .filter((p) => p.modulo_id === moduloId)
      .map((p) => p.id);

    if (permisosModuloIds.length === 0) {
      setBulkBusy(false);
      return;
    }

    const { error } = await supabase
      .from('roles_permisos')
      .delete()
      .eq('rol_id', rolSeleccionado.id)
      .in('permiso_id', permisosModuloIds);

    if (error) {
      showErr(error.message);
      setBulkBusy(false);
      return;
    }

    await cargarPermisosRol(rolSeleccionado.id);
    setBulkBusy(false);
  };

  const abrirNuevo = () => {
    if (!canCreate) return;
    setEditando(null);
    setForm({ nombre: '', descripcion: '' });
    setModal(true);
  };

  const abrirEditar = (rol: Rol) => {
    if (!canEdit) return;
    setEditando(rol);
    setForm({ nombre: rol.nombre, descripcion: rol.descripcion || '' });
    setModal(true);
  };

  const guardarRol = async () => {
    if (editando && !canEdit) return;
    if (!editando && !canCreate) return;
    if (!form.nombre.trim()) return;
    if (editando) {
      const { error } = await supabase
        .from('roles')
        .update({ nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null })
        .eq('id', editando.id);
      if (error) return showErr(error.message);
      showOk('Rol actualizado');
    } else {
      const { error } = await supabase
        .from('roles')
        .insert({ nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null });
      if (error) return showErr(error.message);
      showOk('Rol creado');
    }
    setModal(false);
    await cargarRoles();
  };

  const eliminarRol = async (rol: Rol) => {
    if (!canDelete) return;
    const count = usuariosPorRol[rol.id] || 0;
    if (count > 0) {
      showErr('Este rol tiene usuarios asignados y no se puede eliminar');
      return;
    }
    await supabase.from('roles_permisos').delete().eq('rol_id', rol.id);
    const { error } = await supabase.from('roles').delete().eq('id', rol.id);
    if (error) return showErr(error.message);
    showOk('Rol eliminado');
    await cargarRoles();
  };

  return (
    <>
      <style>{styles}</style>
      <div className="rol-wrap">
        <div className="rol-header">
          <div className="rol-title">
            Roles y Permisos <span>{roles.length} roles</span>
          </div>
          {canCreate && (
            <button className="btn-nuevo" onClick={abrirNuevo}>+ Nuevo Rol</button>
          )}
        </div>

        {ok && <div className="msg-ok">{ok}</div>}
        {err && <div className="msg-err">{err}</div>}

        <div className="rol-layout">
          <section className="rol-panel">
            <div className="rol-panel-head">
              <div className="rol-panel-title">Roles</div>
              <div className="rol-panel-sub">Selecciona un rol para editar permisos</div>
            </div>
            <div className="rol-search">
              <input
                className="rol-search-input"
                placeholder="Buscar rol..."
                value={searchRol}
                onChange={(e) => setSearchRol(e.target.value)}
              />
            </div>
            <div className="rol-list">
              {rolesFiltrados.map(rol => (
                <article
                  key={rol.id}
                  className={`rol-card ${rolSeleccionado?.id === rol.id ? 'sel' : ''}`}
                  onClick={() => setRolSeleccionado(rol)}
                >
                  <div className="rol-card-row">
                    <div className="rol-name">{rol.nombre}</div>
                    <span className="rol-chip">{usuariosPorRol[rol.id] || 0} usuarios</span>
                  </div>
                  <div className="rol-desc">{rol.descripcion || 'Sin descripcion'}</div>
                  <div className="rol-actions" onClick={e => e.stopPropagation()}>
                    {canEdit && (
                      <button className="btn-edit" onClick={() => abrirEditar(rol)}>Editar</button>
                    )}
                    {canDelete && (
                      <>
                        <button className="btn-del" onClick={() => eliminarRol(rol)}>Eliminar</button>
                      </>
                    )}
                  </div>
                </article>
              ))}
              {rolesFiltrados.length === 0 && <div className="perm-empty">No hay roles registrados</div>}
            </div>
          </section>

          <section className="perm-panel">
            <div className="perm-panel-head">
              <div className="perm-head-row">
                <div className="perm-panel-title">
                  Matriz de permisos {rolSeleccionado ? `- ${rolSeleccionado.nombre}` : ''}
                </div>
                <ListToolbar
                  className="perm-head-actions"
                  exports={(
                    <>
                      <button
                        className="btn-mass add"
                        onClick={() => exportCsv('roles_permisos.csv', exportRows, exportColumns)}
                        disabled={!rolSeleccionado || exportRows.length === 0}
                      >
                        CSV
                      </button>
                      <button
                        className="btn-mass add"
                        onClick={() => exportExcelXml('roles_permisos.xls', exportRows, exportColumns)}
                        disabled={!rolSeleccionado || exportRows.length === 0}
                      >
                        EXCEL
                      </button>
                      <button
                        className="btn-mass add"
                        onClick={() =>
                          exportPdfWithPrint({
                            title: 'Roles y Permisos',
                            subtitle: `Rol: ${rolSeleccionado?.nombre || '-'} | Modulos: ${exportRows.length}`,
                            rows: exportRows,
                            columns: exportColumns,
                            orientation: 'landscape',
                          })
                        }
                        disabled={!rolSeleccionado || exportRows.length === 0}
                      >
                        PDF
                      </button>
                    </>
                  )}
                  actions={(
                    <>
                      <button
                        className="btn-mass add"
                        onClick={marcarTodos}
                        disabled={!canEdit || !rolSeleccionado || bulkBusy}
                      >
                        Marcar Todos
                      </button>
                      <button
                        className="btn-mass del"
                        onClick={quitarTodos}
                        disabled={!canEdit || !rolSeleccionado || bulkBusy}
                      >
                        Quitar Todos
                      </button>
                    </>
                  )}
                />
              </div>
              <div className="perm-panel-sub">Marca los permisos del rol por modulo y accion</div>
            </div>
            <div className="perm-wrap">
              {!rolSeleccionado ? (
                <div className="perm-empty">Selecciona un rol</div>
              ) : (
                <>
                  <table className="perm-table rv-desktop-table">
                    <thead>
                      <tr>
                        <th>Modulo</th>
                        {ACCIONES.map(a => <th key={a}>{a}</th>)}
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modulosOrdenados.map(mod => (
                        <tr key={mod.id}>
                          <td>
                            <div className="perm-modulo">{mod.nombre}</div>
                            <div className="perm-codigo">{mod.codigo}</div>
                          </td>
                          {ACCIONES.map(accion => {
                            const permisoId = permisoIdByModuloAccion(mod.id, accion);
                            const checked = permisoId ? permisosRolSet.has(permisoId) : false;
                            const inputKey = `${rolSeleccionado.id}:${mod.id}:${accion}`;
                            return (
                              <td key={accion}>
                                <input
                                  className="perm-check"
                                  type="checkbox"
                                  disabled={!canEdit || !permisoId || savingKey === inputKey}
                                  checked={checked}
                                  onChange={e => togglePermiso(mod.id, accion, e.target.checked)}
                                />
                              </td>
                            );
                          })}
                          <td>
                            <div className="perm-row-actions">
                              <button
                                className="btn-row add"
                                disabled={!canEdit || !rolSeleccionado || bulkBusy}
                                onClick={() => marcarFila(mod.id)}
                                title="Marcar toda la fila"
                              >
                                +
                              </button>
                              <button
                                className="btn-row del"
                                disabled={!canEdit || !rolSeleccionado || bulkBusy}
                                onClick={() => quitarFila(mod.id)}
                                title="Quitar toda la fila"
                              >
                                -
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {modulosOrdenados.length === 0 && (
                        <tr>
                          <td colSpan={2 + ACCIONES.length}>
                            <div className="perm-empty">No hay catalogo de permisos. Ejecuta migracion 001.</div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="perm-mobile-list rv-mobile-cards">
                    {modulosOrdenados.length === 0 ? (
                      <div className="perm-empty">No hay catalogo de permisos. Ejecuta migracion 001.</div>
                    ) : modulosOrdenados.map((mod) => (
                      <div key={`m-${mod.id}`} className="perm-card">
                        <div className="perm-card-head">
                          <div>
                            <div className="perm-modulo">{mod.nombre}</div>
                            <div className="perm-codigo">{mod.codigo}</div>
                          </div>
                          <div className="perm-row-actions">
                            <button className="btn-row add" disabled={!canEdit || !rolSeleccionado || bulkBusy} onClick={() => marcarFila(mod.id)}>+</button>
                            <button className="btn-row del" disabled={!canEdit || !rolSeleccionado || bulkBusy} onClick={() => quitarFila(mod.id)}>-</button>
                          </div>
                        </div>
                        <div className="perm-card-grid">
                          {ACCIONES.map((accion) => {
                            const permisoId = permisoIdByModuloAccion(mod.id, accion);
                            const checked = permisoId ? permisosRolSet.has(permisoId) : false;
                            const inputKey = `${rolSeleccionado.id}:${mod.id}:${accion}`;
                            return (
                              <div key={accion} className="perm-card-item">
                                <label>{accion}</label>
                                <input
                                  className="perm-check"
                                  type="checkbox"
                                  disabled={!canEdit || !permisoId || savingKey === inputKey}
                                  checked={checked}
                                  onChange={(e) => togglePermiso(mod.id, accion, e.target.checked)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">{editando ? 'Editar Rol' : 'Nuevo Rol'}</div>
            <div className="modal-field">
              <label className="modal-label">Nombre *</label>
              <input
                className="modal-input"
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Administrador"
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Descripcion</label>
              <input
                className="modal-input"
                value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Acceso total al sistema"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancelar" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarRol}>{editando ? 'Actualizar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
