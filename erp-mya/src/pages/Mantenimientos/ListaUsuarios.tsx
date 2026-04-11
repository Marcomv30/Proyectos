import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';

import { exportCsv, exportExcelXml, exportPdfWithPrint, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';

interface Usuario {
  id: number;
  username: string;
  nombre: string;
  email: string;
  activo: boolean;
  es_superusuario?: boolean;
  auth_user_id?: string | null;
}

interface Empresa {
  id: number;
  codigo: string;
  nombre: string;
}

interface Rol {
  id: number;
  nombre: string;
}

interface UsuarioEmpresa {
  id: number;
  empresa_id: number;
  rol_id: number;
  activo: boolean;
  empresas: { codigo: string; nombre: string };
  roles: { nombre: string };
}

interface ListaUsuariosProps {
  empresaId?: number;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  esSuperUsuario?: boolean;
}

const styles = `
  .usr-wrap { padding:0; }
  .usr-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; }
  .usr-title { font-size:20px; font-weight:600; color:#1f2937; letter-spacing:-0.3px; }
  .usr-title span { font-size:13px; font-weight:400; color:#9ca3af; margin-left:8px; }
  .btn-nuevo { display:flex; align-items:center; gap:8px; padding:10px 18px;
    background:linear-gradient(135deg,#16a34a,#22c55e); border:none; border-radius:10px;
    color:white; font-size:13px; font-weight:600; cursor:pointer; transition:opacity 0.2s; }
  .btn-nuevo:hover { opacity:0.9; }
  .usr-layout { display:grid; grid-template-columns:1fr 1.2fr; gap:20px; align-items:start; }
  .usr-table-wrap { background:white; border-radius:14px; border:1px solid #e5e7eb;
    overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .usr-table { width:100%; border-collapse:collapse; }
  .usr-table thead { background:#f9fafb; }
  .usr-table th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600;
    color:#6b7280; letter-spacing:0.06em; text-transform:uppercase; border-bottom:1px solid #e5e7eb; }
  .usr-table td { padding:12px 16px; font-size:13px; color:#374151; border-bottom:1px solid #f3f4f6; }
  .usr-table tr:last-child td { border-bottom:none; }
  .usr-table tr:hover td { background:#f9fafb; cursor:pointer; }
  .usr-table tr.selected td { background:#dcfce7; }
  .usr-mobile-list { display:none; }
  .usr-search-row { margin-bottom:12px; }
  .usr-search-input { width:100%; max-width:420px; padding:9px 12px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; color:#1f2937; outline:none; }
  .usr-search-input:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.1); }
  .usr-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin-bottom:8px; }
  .usr-card-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .usr-avatar { width:32px; height:32px; border-radius:8px;
    background:linear-gradient(135deg,#16a34a,#22c55e);
    display:inline-flex; align-items:center; justify-content:center;
    color:white; font-size:13px; font-weight:600; }
  .usr-badge { display:inline-flex; align-items:center; padding:3px 8px;
    border-radius:6px; font-size:11px; font-weight:500; }
  .usr-badge.activo { background:#dcfce7; color:#16a34a; }
  .usr-badge.inactivo { background:#fee2e2; color:#dc2626; }
  .usr-badge.super { background:#ede9fe; color:#6d28d9; }
  .usr-actions { display:flex; gap:6px; }
  .btn-edit { padding:5px 10px; background:#eff6ff; border:1px solid #bfdbfe;
    border-radius:6px; color:#2563eb; font-size:11px; font-weight:500; cursor:pointer; }
  .btn-edit:hover { background:#2563eb; color:white; }
  .btn-del { padding:5px 10px; background:#fef2f2; border:1px solid #fecaca;
    border-radius:6px; color:#dc2626; font-size:11px; font-weight:500; cursor:pointer; }
  .btn-del:hover { background:#dc2626; color:white; }
  .btn-reset { padding:5px 10px; background:#fffbeb; border:1px solid #fde68a;
    border-radius:6px; color:#b45309; font-size:11px; font-weight:500; cursor:pointer; }
  .btn-reset:hover { background:#f59e0b; color:white; border-color:#f59e0b; }

  .emp-panel { background:white; border-radius:14px; border:1px solid #e5e7eb;
    padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .emp-panel-title { font-size:13px; font-weight:600; color:#1f2937; margin-bottom:4px; }
  .emp-panel-sub { font-size:12px; color:#9ca3af; margin-bottom:16px; }
  .emp-info { font-size:12px; color:#075985; background:#e0f2fe; border:1px solid #bae6fd;
    padding:10px 12px; border-radius:8px; margin-bottom:12px; }
  .emp-asignada { display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; border:1px solid #e5e7eb; border-radius:10px; margin-bottom:8px; }
  .emp-asignada-info { display:flex; flex-direction:column; gap:2px; }
  .emp-asignada-nombre { font-size:13px; font-weight:500; color:#1f2937; }
  .emp-asignada-rol { font-size:11px; color:#16a34a; font-weight:500; }
  .btn-quitar { padding:4px 10px; background:#fef2f2; border:1px solid #fecaca;
    border-radius:6px; color:#dc2626; font-size:11px; cursor:pointer; }
  .btn-quitar:hover { background:#dc2626; color:white; }
  .emp-agregar { display:grid; grid-template-columns:1fr 1fr auto; gap:8px;
    margin-top:8px; margin-bottom:14px; align-items:end; }
  .emp-agregar-label { font-size:11px; font-weight:500; color:#6b7280;
    text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px; }
  .emp-select { width:100%; padding:8px 10px; border:1px solid #e5e7eb;
    border-radius:8px; font-size:13px; color:#1f2937; outline:none;
    font-family:'DM Sans',sans-serif; }
  .emp-select:focus { border-color:#22c55e; }
  .btn-agregar { padding:9px 14px; background:linear-gradient(135deg,#16a34a,#22c55e);
    border:none; border-radius:8px; color:white; font-size:12px;
    font-weight:600; cursor:pointer; white-space:nowrap; }
  .btn-agregar:hover { opacity:0.9; }
  .panel-empty { text-align:center; padding:32px; color:#9ca3af; font-size:13px; }
  .success-msg { padding:10px 14px; background:#dcfce7; border:1px solid #bbf7d0;
    border-radius:8px; color:#16a34a; font-size:12px; font-weight:500; margin-bottom:16px; }

  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5);
    display:flex; align-items:center; justify-content:center; z-index:1000; }
  .modal-box { background:white; border-radius:16px; padding:32px; width:420px;
    box-shadow:0 20px 60px rgba(0,0,0,0.2); }
  .modal-title { font-size:17px; font-weight:600; color:#1f2937; margin-bottom:20px; }
  .modal-field { margin-bottom:16px; }
  .modal-label { display:block; font-size:11px; font-weight:500; color:#6b7280;
    letter-spacing:0.04em; text-transform:uppercase; margin-bottom:6px; }
  .modal-input { width:100%; padding:9px 12px; border:1px solid #e5e7eb;
    border-radius:8px; font-size:13px; color:#1f2937; outline:none;
    font-family:'DM Sans',sans-serif; transition:border-color 0.2s; }
  .modal-input:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.1); }
  .modal-check { display:flex; align-items:center; gap:8px; cursor:pointer; }
  .modal-check input { width:15px; height:15px; accent-color:#16a34a; }
  .modal-check span { font-size:13px; color:#374151; }
  .modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:24px; }
  .btn-cancelar { padding:9px 16px; background:#f3f4f6; border:none; border-radius:8px;
    color:#374151; font-size:13px; font-weight:500; cursor:pointer; }
  .btn-cancelar:hover { background:#e5e7eb; }
  .btn-guardar { padding:9px 20px; background:linear-gradient(135deg,#16a34a,#22c55e);
    border:none; border-radius:8px; color:white; font-size:13px;
    font-weight:600; cursor:pointer; }
  .btn-guardar:hover { opacity:0.9; }
  .modal-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }

  @media (max-width: 980px) {
    .usr-layout { grid-template-columns:1fr; }
    .emp-agregar { grid-template-columns:1fr; }
    .btn-agregar { width:100%; }
  }

  @media (max-width: 620px) {
    .usr-header { flex-wrap:wrap; gap:10px; }
    .btn-nuevo { width:100%; justify-content:center; }
    .usr-table-wrap { display:none; }
    .usr-mobile-list { display:block; }
    .modal-box { width:92vw; padding:20px; border-radius:12px; }
    .modal-grid { grid-template-columns:1fr; gap:8px; }
    .modal-actions { flex-direction:column; }
    .btn-cancelar, .btn-guardar { width:100%; }
  }
`;

export default function ListaUsuarios({ empresaId = 0, canCreate = true, canEdit = true, canDelete = true, esSuperUsuario = false }: ListaUsuariosProps) {
  const [esAdminSuper, setEsAdminSuper] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null);
  const [empresasUsuario, setEmpresasUsuario] = useState<UsuarioEmpresa[]>([]);
  const [empresaAgregar, setEmpresaAgregar] = useState('');
  const [rolAgregar, setRolAgregar] = useState('');
  const [exito, setExito] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [modalReset, setModalReset] = useState(false);
  const [usuarioReset, setUsuarioReset] = useState<Usuario | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPassword2, setResetPassword2] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    username: '', nombre: '', email: '', password: '', activo: true, es_superusuario: false,
  });

  const usuariosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visibles = esSuperUsuario ? usuarios : usuarios.filter(u => !u.es_superusuario);
    if (!term) return visibles;
    return visibles.filter((u) =>
      (u.username || '').toLowerCase().includes(term) ||
      (u.nombre || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term)
    );
  }, [usuarios, search, esSuperUsuario]);

  const exportRows = usuariosFiltrados.map((u) => ({
    username: u.username,
    nombre: u.nombre,
    nivel: u.es_superusuario ? 'Super Usuario' : '',
    auth: u.auth_user_id ? 'Vinculado' : 'Pendiente',
    estado: u.activo ? 'Activo' : 'Inactivo',
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'username', title: 'Usuario', getValue: (r) => r.username, align: 'left', width: '20%' },
    { key: 'nombre', title: 'Nombre', getValue: (r) => r.nombre, align: 'left', width: '34%' },
    { key: 'nivel', title: 'Nivel', getValue: (r) => r.nivel, width: '16%' },
    { key: 'auth', title: 'Auth', getValue: (r) => r.auth, width: '15%' },
    { key: 'estado', title: 'Estado', getValue: (r) => r.estado, width: '15%' },
  ];

  const mostrarExito = (msg: string) => {
    setExito(msg);
    setTimeout(() => setExito(''), 3000);
  };

  const cargar = async () => {
    const { data } = await supabase.from('usuarios').select('*').order('nombre');
    if (data) setUsuarios(data);
  };

  const cargarPermisosAdmin = async () => {
    const { data } = await supabase.rpc('is_superuser');
    setEsAdminSuper(Boolean(data));
  };

  const cargarCatalogos = async () => {
    const [{ data: emps }, { data: rols }] = await Promise.all([
      supabase.from('empresas').select('id,codigo,nombre').eq('activo', true).order('codigo'),
      supabase.from('roles').select('*').order('nombre'),
    ]);

    if (emps) {
      setEmpresas(emps);
      setEmpresaAgregar(String(emps[0]?.id || ''));
    }

    if (rols) {
      setRoles(rols);
      setRolAgregar(String(rols[0]?.id || ''));
    }
  };

  const cargarEmpresasUsuario = async (usuarioId: number) => {
    const { data } = await supabase
      .from('usuarios_empresas')
      .select('id, empresa_id, rol_id, activo, empresas(codigo, nombre), roles(nombre)')
      .eq('usuario_id', usuarioId);

    if (data) setEmpresasUsuario(data as any as UsuarioEmpresa[]);
  };

  useEffect(() => {
    cargar();
    cargarCatalogos();
    cargarPermisosAdmin();
  }, []);

  const seleccionar = (usr: Usuario) => {
    setSeleccionado(usr);
    cargarEmpresasUsuario(usr.id);
    setExito('');
  };

  const agregarEmpresa = async () => {
    if (!canEdit || !seleccionado || !empresaAgregar || !rolAgregar) return;

    const yaExiste = empresasUsuario.find((e) => e.empresa_id === parseInt(empresaAgregar, 10));
    if (yaExiste) {
      mostrarExito('Ya tiene acceso a esa empresa');
      return;
    }

    await supabase.from('usuarios_empresas').insert({
      usuario_id: seleccionado.id,
      empresa_id: parseInt(empresaAgregar, 10),
      rol_id: parseInt(rolAgregar, 10),
      activo: true,
    });

    await cargarEmpresasUsuario(seleccionado.id);
    mostrarExito('Empresa asignada correctamente');
  };

  const quitarEmpresa = async (id: number) => {
    if (!canEdit) return;
    await supabase.from('usuarios_empresas').delete().eq('id', id);
    if (seleccionado) await cargarEmpresasUsuario(seleccionado.id);
  };

  const abrirNuevo = () => {
    if (!canCreate) return;
    setEditando(null);
    setForm({ username: '', nombre: '', email: '', password: '', activo: true, es_superusuario: false });
    setModal(true);
  };

  const abrirEditar = (usr: Usuario) => {
    if (!canEdit) return;
    setEditando(usr);
    setForm({
      username: usr.username,
      nombre: usr.nombre,
      email: usr.email || '',
      password: '',
      activo: usr.activo,
      es_superusuario: Boolean(usr.es_superusuario),
    });
    setModal(true);
  };

  const abrirReset = (usr: Usuario) => {
    if (!canEdit) return;
    setUsuarioReset(usr);
    setResetPassword('');
    setResetPassword2('');
    setModalReset(true);
  };

  const confirmarReset = async () => {
    if (!canEdit || !usuarioReset) return;

    if (!resetPassword || resetPassword.length < 6) {
      mostrarExito('La contrasena debe tener minimo 6 caracteres');
      return;
    }

    if (resetPassword !== resetPassword2) {
      mostrarExito('Las contrasenas no coinciden');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    const resp = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ usuario_id: usuarioReset.id, password: resetPassword, empresa_id: empresaId }),
    });
    const payload = await resp.json().catch(() => ({}));

    if (!resp.ok || !payload.ok) {
      mostrarExito(payload.error || 'Error al actualizar contraseña');
      return;
    }

    setModalReset(false);
    mostrarExito(`Contraseña actualizada para ${usuarioReset.username}`);
  };

  const guardarUsuario = async () => {
    if (editando && !canEdit) return;
    if (!editando && !canCreate) return;
    if (!form.username || !form.nombre || !form.email) return;

    if (editando) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const resp = await fetch(`/api/auth/update-user/${editando.id}?empresa_id=${empresaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          empresa_id: empresaId,
          username: form.username,
          nombre: form.nombre,
          email: form.email,
          activo: form.activo,
          ...(esAdminSuper ? { es_superusuario: form.es_superusuario } : {}),
        }),
      });
      const payload = await resp.json().catch(() => ({}));

      if (!resp.ok || !payload.ok) {
        mostrarExito(payload.error || 'Error al actualizar usuario');
        return;
      }

      mostrarExito('Usuario actualizado');
    } else {
      if (!form.password || !empresaAgregar || !rolAgregar) {
        mostrarExito('Complete contrasena, empresa y rol inicial');
        return;
      }

      const { data: nuevoUsuarioId, error } = await supabase.rpc('create_user_with_access', {
        p_username: form.username.trim(),
        p_nombre: form.nombre.trim(),
        p_email: form.email.trim().toLowerCase(),
        p_password: form.password,
        p_empresa_id: parseInt(empresaAgregar, 10),
        p_rol_id: parseInt(rolAgregar, 10),
        p_activo: form.activo,
      });

      if (error) {
        mostrarExito(error.message);
        return;
      }

      if (esAdminSuper) {
        const { error: superError } = await supabase.rpc('set_user_superuser', {
          p_usuario_id: Number(nuevoUsuarioId),
          p_es_superusuario: form.es_superusuario,
        });
        if (superError) {
          mostrarExito(superError.message);
          return;
        }
      }

      mostrarExito('Usuario creado y vinculado en Auth correctamente');
    }

    setModal(false);
    await cargar();
  };

  const eliminar = async (usr: Usuario) => {
    if (!canDelete) return;
    await supabase.from('usuarios_empresas').delete().eq('usuario_id', usr.id);
    await supabase.from('usuarios').delete().eq('id', usr.id);
    if (seleccionado?.id === usr.id) setSeleccionado(null);
    await cargar();
  };

  return (
    <>
      <style>{styles}</style>
      <div className="usr-wrap">
        <div className="usr-header">
          <div className="usr-title">Usuarios <span>{usuarios.length} registros</span></div>
          <ListToolbar
            exports={(
              <>
                <button
                  className="btn-edit"
                  onClick={() => exportCsv('usuarios.csv', exportRows, exportColumns)}
                  disabled={exportRows.length === 0}
                >
                  CSV
                </button>
                <button
                  className="btn-edit"
                  onClick={() => exportExcelXml('usuarios.xls', exportRows, exportColumns)}
                  disabled={exportRows.length === 0}
                >
                  EXCEL
                </button>
                <button
                  className="btn-edit"
                  onClick={() =>
                    exportPdfWithPrint({
                      title: 'Usuarios',
                      subtitle: `Total: ${exportRows.length} registros`,
                      rows: exportRows,
                      columns: exportColumns,
                    })
                  }
                  disabled={exportRows.length === 0}
                >
                  PDF
                </button>
              </>
            )}
            actions={canCreate ? <button className="btn-nuevo" onClick={abrirNuevo}>+ Nuevo Usuario</button> : null}
          />
        </div>

        <div className="usr-search-row">
          <input
            className="usr-search-input"
            placeholder="Buscar usuario por login, nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {exito && <div className="success-msg">{exito}</div>}

        <div className="usr-layout">
          <div className="usr-table-wrap rv-desktop-table">
            <table className="usr-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Nivel</th>
                  <th>Auth</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
                      No hay usuarios registrados
                    </td>
                  </tr>
                ) : usuariosFiltrados.map((usr) => (
                  <tr
                    key={usr.id}
                    className={seleccionado?.id === usr.id ? 'selected' : ''}
                    onClick={() => seleccionar(usr)}
                  >
                    <td><div className="usr-avatar">{usr.nombre[0]?.toUpperCase()}</div></td>
                    <td><strong>{usr.username}</strong></td>
                    <td>{usr.nombre}</td>
                    <td>
                      {usr.es_superusuario ? (
                        <span className="usr-badge super">Super Usuario</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`usr-badge ${usr.auth_user_id ? 'activo' : 'inactivo'}`}>
                        {usr.auth_user_id ? 'Vinculado' : 'Pendiente'}
                      </span>
                    </td>
                    <td>
                      <span className={`usr-badge ${usr.activo ? 'activo' : 'inactivo'}`}>
                        {usr.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="usr-actions" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <>
                            <button className="btn-edit" onClick={() => abrirEditar(usr)}>Editar</button>
                            <button className="btn-reset" onClick={() => abrirReset(usr)}>Reset clave</button>
                          </>
                        )}
                        {canDelete && <button className="btn-del" onClick={() => eliminar(usr)}>Eliminar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="usr-mobile-list rv-mobile-cards">
            {usuariosFiltrados.length === 0 ? (
              <div className="panel-empty">No hay usuarios registrados</div>
            ) : usuariosFiltrados.map((usr) => (
              <div
                key={`m-${usr.id}`}
                className="usr-card"
                style={seleccionado?.id === usr.id ? { borderColor: '#22c55e', background: '#f0fdf4' } : undefined}
                onClick={() => seleccionar(usr)}
              >
                <div className="usr-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="usr-avatar">{usr.nombre[0]?.toUpperCase()}</div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{usr.username}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{usr.nombre}</div>
                    </div>
                  </div>
                  <span className={`usr-badge ${usr.activo ? 'activo' : 'inactivo'}`}>
                    {usr.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {usr.es_superusuario ? <span className="usr-badge super">Super Usuario</span> : null}
                  <span className={`usr-badge ${usr.auth_user_id ? 'activo' : 'inactivo'}`}>
                    {usr.auth_user_id ? 'Vinculado' : 'Pendiente'}
                  </span>
                </div>
                <div className="usr-actions" onClick={(e) => e.stopPropagation()}>
                  {canEdit && (
                    <>
                      <button className="btn-edit" onClick={() => abrirEditar(usr)}>Editar</button>
                      <button className="btn-reset" onClick={() => abrirReset(usr)}>Reset clave</button>
                    </>
                  )}
                  {canDelete && <button className="btn-del" onClick={() => eliminar(usr)}>Eliminar</button>}
                </div>
              </div>
            ))}
          </div>

          <div className="emp-panel">
            {!seleccionado ? (
              <div className="panel-empty">Seleccione un usuario para gestionar sus empresas</div>
            ) : (
              <>
                <div className="emp-panel-title">Empresas de: {seleccionado.nombre}</div>
                <div className="emp-panel-sub">
                  Asigne empresa y rol para este usuario. Los modulos se administran desde Empresa/Actividad.
                </div>
                <div className="emp-info">
                  Aqui solo se define Empresa + Rol. La visibilidad de modulos se configura en
                  Mantenimientos {'>'} Actividades y se consulta desde Empresas.
                </div>

                {canEdit && (
                  <div className="emp-agregar">
                    <div>
                      <div className="emp-agregar-label">Empresa</div>
                      <select className="emp-select" value={empresaAgregar} onChange={(e) => setEmpresaAgregar(e.target.value)}>
                        {empresas.map((emp) => (
                          <option key={emp.id} value={emp.id}>{emp.codigo} - {emp.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="emp-agregar-label">Rol</div>
                      <select className="emp-select" value={rolAgregar} onChange={(e) => setRolAgregar(e.target.value)}>
                        {roles.map((rol) => (
                          <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <button className="btn-agregar" onClick={agregarEmpresa}>+ Asignar</button>
                  </div>
                )}

                <div>
                  {empresasUsuario.length === 0 ? (
                    <div style={{ color: '#9ca3af', fontSize: '13px' }}>Sin empresas asignadas aun</div>
                  ) : empresasUsuario.map((eu) => (
                    <div key={eu.id} className="emp-asignada">
                      <div className="emp-asignada-info">
                        <span className="emp-asignada-nombre">{(eu.empresas as any)?.codigo} - {(eu.empresas as any)?.nombre}</span>
                        <span className="emp-asignada-rol">Rol: {(eu.roles as any)?.nombre}</span>
                      </div>
                      {canEdit && <button className="btn-quitar" onClick={() => quitarEmpresa(eu.id)}>Quitar</button>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">{editando ? 'Editar Usuario' : 'Nuevo Usuario'}</div>
            <div className="modal-grid">
              <div className="modal-field">
                <label className="modal-label">Usuario *</label>
                <input className="modal-input" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
              </div>
              <div className="modal-field">
                <label className="modal-label">Email *</label>
                <input className="modal-input" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
            </div>

            {!editando && (
              <>
                <div className="modal-grid">
                  <div className="modal-field">
                    <label className="modal-label">Contrasena inicial *</label>
                    <input className="modal-input" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Empresa inicial *</label>
                    <select className="modal-input" value={empresaAgregar} onChange={(e) => setEmpresaAgregar(e.target.value)}>
                      {empresas.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.codigo} - {emp.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Rol inicial *</label>
                  <select className="modal-input" value={rolAgregar} onChange={(e) => setRolAgregar(e.target.value)}>
                    {roles.map((rol) => (
                      <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="modal-field">
              <label className="modal-label">Nombre completo *</label>
              <input className="modal-input" value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
            </div>
            <label className="modal-check">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))} />
              <span>Usuario Activo</span>
            </label>
            {esAdminSuper && (
              <label className="modal-check" style={{ marginTop: '8px' }}>
                <input
                  type="checkbox"
                  checked={form.es_superusuario}
                  onChange={(e) => setForm((p) => ({ ...p, es_superusuario: e.target.checked }))}
                />
                <span>Super Usuario (sin restricciones)</span>
              </label>
            )}
            <div className="modal-actions">
              <button className="btn-cancelar" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarUsuario}>{editando ? 'Actualizar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}

      {modalReset && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Reset de contrasena: {usuarioReset?.username}</div>
            <div className="modal-field">
              <label className="modal-label">Nueva contrasena *</label>
              <input className="modal-input" type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Confirmar contrasena *</label>
              <input className="modal-input" type="password" value={resetPassword2} onChange={(e) => setResetPassword2(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn-cancelar" onClick={() => setModalReset(false)}>Cancelar</button>
              <button className="btn-guardar" onClick={confirmarReset}>Actualizar clave</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
