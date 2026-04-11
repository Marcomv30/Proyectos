import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, exportExcelXml, exportPdfWithPrint, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';

type Accion = 'ver' | 'crear' | 'editar' | 'eliminar' | 'aprobar';

interface Usuario {
  id: number;
  username: string;
  nombre: string;
  activo: boolean;
}

interface EmpresaAsignada {
  id: number;
  empresa_id: number;
  rol_id: number;
  activo: boolean;
  empresas: { codigo: string; nombre: string } | null;
  roles: { nombre: string } | null;
}

interface PermisoRow {
  modulo_codigo: string;
  accion: string;
}

interface EstadoAccesoProps {
  canView?: boolean;
}

const ACCIONES: Accion[] = ['ver', 'crear', 'editar', 'eliminar', 'aprobar'];

const styles = `
  .acceso-wrap { padding:0; }
  .acceso-title { font-size:20px; font-weight:600; color:#1f2937; margin-bottom:4px; }
  .acceso-sub { font-size:13px; color:#9ca3af; margin-bottom:16px; }
  .acceso-info { padding:10px 14px; background:#e0f2fe; border:1px solid #bae6fd; border-radius:8px; color:#075985; font-size:12px; font-weight:500; margin-bottom:16px; }
  .acceso-actions { display:flex; gap:8px; margin-bottom:12px; justify-content:flex-end; }
  .acceso-export-btn { padding:7px 12px; border-radius:8px; border:1px solid #e5e7eb; background:#fff; color:#334155; font-size:12px; font-weight:600; cursor:pointer; }
  .acceso-export-btn:hover { border-color:#22c55e; color:#16a34a; background:#f0fdf4; }
  .acceso-search { margin-bottom:12px; }
  .acceso-search-input { width:100%; max-width:420px; padding:9px 10px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; color:#1f2937; outline:none; background:#fff; }
  .acceso-search-input:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.1); }
  .acceso-error { padding:10px 14px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#b91c1c; font-size:12px; margin-bottom:16px; }
  .acceso-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
  .acceso-field label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-bottom:6px; }
  .acceso-field select { width:100%; padding:9px 10px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; color:#1f2937; background:#fff; }
  .acceso-cards { display:grid; grid-template-columns:repeat(3, minmax(120px, 1fr)); gap:10px; margin:14px 0 16px; }
  .acceso-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; }
  .acceso-card-k { font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px; }
  .acceso-card-v { font-size:13px; color:#111827; font-weight:600; }
  .acceso-table-wrap { background:#fff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }
  .acceso-table { width:100%; border-collapse:collapse; }
  .acceso-table thead { background:#f9fafb; }
  .acceso-table th { text-align:left; padding:10px 12px; font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid #e5e7eb; }
  .acceso-table td { padding:10px 12px; border-bottom:1px solid #f3f4f6; font-size:13px; color:#374151; }
  .acceso-table tr:last-child td { border-bottom:none; }
  .acceso-mobile-list { display:none; }
  .acceso-row-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin-bottom:8px; }
  .acceso-row-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .acceso-row-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .acceso-chip-ok { color:#16a34a; font-weight:700; }
  .acceso-chip-no { color:#d1d5db; font-weight:700; }
  .acceso-empty { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:20px; text-align:center; color:#9ca3af; font-size:13px; }

  @media (max-width: 900px) {
    .acceso-actions { justify-content:stretch; }
    .acceso-export-btn { flex:1; }
    .acceso-grid { grid-template-columns:1fr; }
    .acceso-cards { grid-template-columns:1fr; }
    .acceso-table-wrap { overflow-x:auto; }
    .acceso-table { min-width:720px; }
  }

  @media (max-width: 620px) {
    .acceso-table-wrap { display:none; }
    .acceso-mobile-list { display:block; }
    .acceso-row-grid { grid-template-columns:repeat(2,1fr); }
  }
`;

export default function EstadoAcceso({ canView = true }: EstadoAccesoProps) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioId, setUsuarioId] = useState<number | null>(null);
  const [empresasAsignadas, setEmpresasAsignadas] = useState<EmpresaAsignada[]>([]);
  const [usuarioEmpresaId, setUsuarioEmpresaId] = useState<number | null>(null);
  const [permisos, setPermisos] = useState<PermisoRow[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id,username,nombre,activo')
        .eq('activo', true)
        .order('nombre');

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const list = (data || []) as Usuario[];
      setUsuarios(list);
      setUsuarioId(list[0]?.id ?? null);
    };
    init();
  }, []);

  useEffect(() => {
    const loadAsignaciones = async () => {
      if (!usuarioId) {
        setEmpresasAsignadas([]);
        setUsuarioEmpresaId(null);
        return;
      }
      setErrorMsg('');
      const { data, error } = await supabase
        .from('usuarios_empresas')
        .select('id,empresa_id,rol_id,activo,empresas(codigo,nombre),roles(nombre)')
        .eq('usuario_id', usuarioId)
        .eq('activo', true);

      if (error) {
        setErrorMsg(error.message);
        setEmpresasAsignadas([]);
        setUsuarioEmpresaId(null);
        return;
      }

      const list = (data || []) as unknown as EmpresaAsignada[];
      setEmpresasAsignadas(list);
      setUsuarioEmpresaId(list[0]?.id ?? null);
    };
    loadAsignaciones();
  }, [usuarioId]);

  useEffect(() => {
    const loadPermisos = async () => {
      if (!canView || !usuarioId || !usuarioEmpresaId) {
        setPermisos([]);
        return;
      }
      const ue = empresasAsignadas.find((x) => x.id === usuarioEmpresaId);
      if (!ue) {
        setPermisos([]);
        return;
      }

      setCargando(true);
      setErrorMsg('');
      const { data, error } = await supabase.rpc('get_user_effective_permissions_admin', {
        p_usuario_id: usuarioId,
        p_empresa_id: ue.empresa_id,
      });
      setCargando(false);

      if (error) {
        setErrorMsg(error.message);
        setPermisos([]);
        return;
      }
      setPermisos((data || []) as PermisoRow[]);
    };
    loadPermisos();
  }, [canView, usuarioId, usuarioEmpresaId, empresasAsignadas]);

  const matriz = useMemo(() => {
    const map = new Map<string, Set<string>>();
    permisos.forEach((p) => {
      const mod = (p.modulo_codigo || '').toLowerCase();
      const acc = (p.accion || '').toLowerCase();
      if (!mod || !acc) return;
      if (!map.has(mod)) map.set(mod, new Set());
      map.get(mod)?.add(acc);
    });
    return Array.from(map.entries())
      .map(([modulo, acciones]) => ({ modulo, acciones }))
      .sort((a, b) => a.modulo.localeCompare(b.modulo));
  }, [permisos]);

  const matrizFiltrada = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return matriz;
    return matriz.filter((row) => row.modulo.toLowerCase().includes(term));
  }, [matriz, search]);

  const ueSelected = empresasAsignadas.find((x) => x.id === usuarioEmpresaId) || null;
  const usuarioSelected = usuarios.find((u) => u.id === usuarioId) || null;
  const exportRows = matrizFiltrada.map((row) => ({
    modulo: row.modulo,
    ver: row.acciones.has('ver') ? 'SI' : 'NO',
    crear: row.acciones.has('crear') ? 'SI' : 'NO',
    editar: row.acciones.has('editar') ? 'SI' : 'NO',
    eliminar: row.acciones.has('eliminar') ? 'SI' : 'NO',
    aprobar: row.acciones.has('aprobar') ? 'SI' : 'NO',
  }));

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'modulo', title: 'Modulo', getValue: (r) => r.modulo, align: 'left', width: '30%' },
    { key: 'ver', title: 'Ver', getValue: (r) => r.ver, width: '14%' },
    { key: 'crear', title: 'Crear', getValue: (r) => r.crear, width: '14%' },
    { key: 'editar', title: 'Editar', getValue: (r) => r.editar, width: '14%' },
    { key: 'eliminar', title: 'Eliminar', getValue: (r) => r.eliminar, width: '14%' },
    { key: 'aprobar', title: 'Aprobar', getValue: (r) => r.aprobar, width: '14%' },
  ];

  if (!canView) {
    return <div className="acceso-empty">No tiene permisos para ver esta seccion.</div>;
  }

  return (
    <>
      <style>{styles}</style>
      <div className="acceso-wrap">
        <div className="acceso-title">Estado de Acceso</div>
        <div className="acceso-sub">Depuracion rapida por usuario, empresa, rol y permisos efectivos.</div>
        <div className="acceso-info">
          Esta pantalla usa permisos efectivos (rol + filtros de empresa/modulos) para identificar en segundos por que un usuario ve o no un menu.
        </div>
        {errorMsg && <div className="acceso-error">{errorMsg}</div>}
        <ListToolbar
          className="acceso-actions"
          exports={(
            <>
              <button
                className="acceso-export-btn"
                onClick={() => exportCsv('estado_acceso.csv', exportRows, exportColumns)}
                disabled={exportRows.length === 0}
              >
                CSV
              </button>
              <button
                className="acceso-export-btn"
                onClick={() => exportExcelXml('estado_acceso.xls', exportRows, exportColumns)}
                disabled={exportRows.length === 0}
              >
                EXCEL
              </button>
              <button
                className="acceso-export-btn"
                onClick={() =>
                  exportPdfWithPrint({
                    title: 'Estado de Acceso',
                    subtitle: `Usuario: ${usuarioSelected?.username || '-'} | Empresa: ${ueSelected?.empresas?.codigo || '-'}`,
                    rows: exportRows,
                    columns: exportColumns,
                    orientation: 'landscape',
                  })
                }
                disabled={exportRows.length === 0}
              >
                PDF
              </button>
            </>
          )}
        />
        <div className="acceso-search">
          <input
            className="acceso-search-input"
            placeholder="Buscar modulo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="acceso-grid">
          <div className="acceso-field">
            <label>Usuario</label>
            <select
              value={usuarioId ?? ''}
              onChange={(e) => setUsuarioId(Number(e.target.value) || null)}
            >
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.username})
                </option>
              ))}
            </select>
          </div>

          <div className="acceso-field">
            <label>Empresa / Rol</label>
            <select
              value={usuarioEmpresaId ?? ''}
              onChange={(e) => setUsuarioEmpresaId(Number(e.target.value) || null)}
            >
              {empresasAsignadas.map((ue) => (
                <option key={ue.id} value={ue.id}>
                  {ue.empresas?.codigo} - {ue.empresas?.nombre} | {ue.roles?.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="acceso-cards">
          <div className="acceso-card">
            <div className="acceso-card-k">Usuario</div>
            <div className="acceso-card-v">{usuarioSelected ? usuarioSelected.username : '-'}</div>
          </div>
          <div className="acceso-card">
            <div className="acceso-card-k">Empresa</div>
            <div className="acceso-card-v">{ueSelected?.empresas?.codigo || '-'}</div>
          </div>
          <div className="acceso-card">
            <div className="acceso-card-k">Rol</div>
            <div className="acceso-card-v">{ueSelected?.roles?.nombre || '-'}</div>
          </div>
        </div>

        {cargando ? (
          <div className="acceso-empty">Cargando permisos...</div>
        ) : matrizFiltrada.length === 0 ? (
          <div className="acceso-empty">Sin permisos efectivos para esta combinacion.</div>
        ) : (
          <>
          <div className="acceso-table-wrap rv-desktop-table">
            <table className="acceso-table">
              <thead>
                <tr>
                  <th>Modulo</th>
                  <th>Ver</th>
                  <th>Crear</th>
                  <th>Editar</th>
                  <th>Eliminar</th>
                  <th>Aprobar</th>
                </tr>
              </thead>
              <tbody>
                {matrizFiltrada.map((row) => (
                  <tr key={row.modulo}>
                    <td>{row.modulo}</td>
                    {ACCIONES.map((a) => (
                      <td key={a}>
                        <span className={row.acciones.has(a) ? 'acceso-chip-ok' : 'acceso-chip-no'}>
                          {row.acciones.has(a) ? 'SI' : 'NO'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          
          
          
          
          <div className="acceso-mobile-list rv-mobile-cards">
            {matrizFiltrada.map((row) => (
              <div key={`m-${row.modulo}`} className="acceso-row-card">
                <div className="acceso-row-head">
                  <strong style={{ color: '#111827' }}>{row.modulo}</strong>
                </div>
                <div className="acceso-row-grid">
                  {ACCIONES.map((a) => (
                    <div key={a}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{a}</div>
                      <span className={row.acciones.has(a) ? 'acceso-chip-ok' : 'acceso-chip-no'}>
                        {row.acciones.has(a) ? 'SI' : 'NO'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
    </>
  );
}
