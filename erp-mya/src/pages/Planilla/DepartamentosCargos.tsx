import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabase';
import { logModuloEvento } from '../../utils/bitacora';
import { PL_STYLES } from './planillaStyles';

interface Props { empresaId: number; canEdit?: boolean; }

interface Departamento {
  id: number; nombre: string; codigo: string | null;
  descripcion: string | null; tipo: string; activo: boolean;
}
interface Cargo {
  id: number; departamento_id: number | null; nombre: string;
  codigo: string | null; categoria: string; salario_base_ref: number | null;
  tipo_trabajo: string; descripcion: string | null; activo: boolean;
}

const TIPOS_DEPTO = [
  { v: 'oficina', l: 'Oficina' }, { v: 'campo', l: 'Campo / Finca' },
  { v: 'produccion', l: 'Producción' }, { v: 'ventas', l: 'Ventas' },
  { v: 'logistica', l: 'Logística' }, { v: 'mixto', l: 'Mixto' },
];
const CATS_CARGO = [
  { v: 'operario', l: 'Operario' }, { v: 'tecnico', l: 'Técnico' },
  { v: 'profesional', l: 'Profesional' }, { v: 'gerencial', l: 'Gerencial' },
  { v: 'directivo', l: 'Directivo' }, { v: 'otro', l: 'Otro' },
];
const TIPO_TRABAJO = [
  { v: 'oficina', l: 'Oficina' }, { v: 'campo', l: 'Campo' }, { v: 'mixto', l: 'Mixto' },
];
const TIPO_COLOR: Record<string, string> = {
  campo: '#22c55e', produccion: '#f59e0b', ventas: '#a78bfa',
  logistica: '#38bdf8', mixto: '#f87171', oficina: '#8ea3c7',
};

const fmtMonto = (n: number | null) => n == null ? '—'
  : new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(n);

const emptyDepto = (): Partial<Departamento> => ({ nombre: '', codigo: '', descripcion: '', tipo: 'oficina', activo: true });
const emptyCargo = (): Partial<Cargo> => ({ nombre: '', codigo: '', categoria: 'operario', tipo_trabajo: 'oficina', salario_base_ref: null, descripcion: '', activo: true, departamento_id: null });

const styles = PL_STYLES;

export default function DepartamentosCargos({ empresaId, canEdit }: Props) {
  const [tab, setTab] = useState<'deptos' | 'cargos'>('deptos');
  const [deptos, setDeptos] = useState<Departamento[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroDepto, setFiltroDepto] = useState<number | ''>('');
  const [showDepto, setShowDepto] = useState(false);
  const [editDepto, setEditDepto] = useState<Partial<Departamento>>(emptyDepto());
  const [showCargo, setShowCargo] = useState(false);
  const [editCargo, setEditCargo] = useState<Partial<Cargo>>(emptyCargo());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('pl_departamentos').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('pl_cargos').select('*').eq('empresa_id', empresaId).order('nombre'),
    ]);
    setDeptos(d || []); setCargos(c || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const saveDepto = async () => {
    if (!editDepto.nombre?.trim()) { setError('Nombre requerido.'); return; }
    setSaving(true); setError('');
    const payload = { empresa_id: empresaId, nombre: editDepto.nombre.trim(), codigo: editDepto.codigo?.trim() || null, descripcion: editDepto.descripcion?.trim() || null, tipo: editDepto.tipo || 'oficina', activo: editDepto.activo ?? true, updated_at: new Date().toISOString() };
    const { error: err } = (editDepto as Departamento).id
      ? await supabase.from('pl_departamentos').update(payload).eq('id', (editDepto as Departamento).id)
      : await supabase.from('pl_departamentos').insert(payload);
    if (err) { setError(err.message); } else {
      logModuloEvento({ empresaId, modulo: 'planilla', accion: (editDepto as Departamento).id ? 'departamento_editado' : 'departamento_creado', descripcion: payload.nombre });
      setShowDepto(false); load();
    }
    setSaving(false);
  };

  const saveCargo = async () => {
    if (!editCargo.nombre?.trim()) { setError('Nombre requerido.'); return; }
    setSaving(true); setError('');
    const payload = { empresa_id: empresaId, departamento_id: editCargo.departamento_id || null, nombre: editCargo.nombre.trim(), codigo: editCargo.codigo?.trim() || null, categoria: editCargo.categoria || 'operario', salario_base_ref: editCargo.salario_base_ref || null, tipo_trabajo: editCargo.tipo_trabajo || 'oficina', descripcion: editCargo.descripcion?.trim() || null, activo: editCargo.activo ?? true, updated_at: new Date().toISOString() };
    const { error: err } = (editCargo as Cargo).id
      ? await supabase.from('pl_cargos').update(payload).eq('id', (editCargo as Cargo).id)
      : await supabase.from('pl_cargos').insert(payload);
    if (err) { setError(err.message); } else { setShowCargo(false); load(); }
    setSaving(false);
  };

  const dNombre = (id: number | null) => deptos.find(d => d.id === id)?.nombre ?? '—';
  const tipoL = (v: string) => TIPOS_DEPTO.find(t => t.v === v)?.l ?? v;
  const catL  = (v: string) => CATS_CARGO.find(c => c.v === v)?.l ?? v;
  const cargosF = filtroDepto ? cargos.filter(c => c.departamento_id === filtroDepto) : cargos;

  const modalDepto = showDepto && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowDepto(false)}>
      <div className="pl-modal" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">{(editDepto as Departamento).id ? 'Editar Departamento' : 'Nuevo Departamento'}</p>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-field"><label>Nombre *</label><input className="pl-input" value={editDepto.nombre ?? ''} onChange={e => setEditDepto(p => ({ ...p, nombre: e.target.value }))} autoFocus /></div>
        <div className="pl-grid2">
          <div className="pl-field"><label>Código</label><input className="pl-input" value={editDepto.codigo ?? ''} onChange={e => setEditDepto(p => ({ ...p, codigo: e.target.value }))} /></div>
          <div className="pl-field"><label>Tipo</label>
            <select className="pl-select" value={editDepto.tipo ?? 'oficina'} onChange={e => setEditDepto(p => ({ ...p, tipo: e.target.value }))}>
              {TIPOS_DEPTO.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
        </div>
        <div className="pl-field"><label>Descripción</label><textarea value={editDepto.descripcion ?? ''} onChange={e => setEditDepto(p => ({ ...p, descripcion: e.target.value }))} /></div>
        <label className="pl-check-row"><input type="checkbox" checked={editDepto.activo ?? true} onChange={e => setEditDepto(p => ({ ...p, activo: e.target.checked }))} /> Activo</label>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => { setShowDepto(false); setError(''); }}>Cancelar</button>
          <button className="pl-btn main" onClick={saveDepto} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>, document.body
  );

  const modalCargo = showCargo && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowCargo(false)}>
      <div className="pl-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">{(editCargo as Cargo).id ? 'Editar Cargo' : 'Nuevo Cargo'}</p>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-field"><label>Nombre *</label><input className="pl-input" value={editCargo.nombre ?? ''} onChange={e => setEditCargo(p => ({ ...p, nombre: e.target.value }))} autoFocus /></div>
        <div className="pl-grid2">
          <div className="pl-field"><label>Código</label><input className="pl-input" value={editCargo.codigo ?? ''} onChange={e => setEditCargo(p => ({ ...p, codigo: e.target.value }))} /></div>
          <div className="pl-field"><label>Categoría</label>
            <select className="pl-select" value={editCargo.categoria ?? 'operario'} onChange={e => setEditCargo(p => ({ ...p, categoria: e.target.value }))}>
              {CATS_CARGO.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          <div className="pl-field"><label>Departamento</label>
            <select className="pl-select" value={editCargo.departamento_id ?? ''} onChange={e => setEditCargo(p => ({ ...p, departamento_id: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">— Sin depto —</option>
              {deptos.filter(d => d.activo).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <div className="pl-field"><label>Tipo trabajo</label>
            <select className="pl-select" value={editCargo.tipo_trabajo ?? 'oficina'} onChange={e => setEditCargo(p => ({ ...p, tipo_trabajo: e.target.value }))}>
              {TIPO_TRABAJO.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div className="pl-field"><label>Salario ref. (CRC)</label><input type="number" className="pl-input" value={editCargo.salario_base_ref ?? ''} onChange={e => setEditCargo(p => ({ ...p, salario_base_ref: e.target.value ? Number(e.target.value) : null }))} /></div>
        </div>
        <div className="pl-field"><label>Descripción</label><textarea value={editCargo.descripcion ?? ''} onChange={e => setEditCargo(p => ({ ...p, descripcion: e.target.value }))} /></div>
        <label className="pl-check-row"><input type="checkbox" checked={editCargo.activo ?? true} onChange={e => setEditCargo(p => ({ ...p, activo: e.target.checked }))} /> Activo</label>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => { setShowCargo(false); setError(''); }}>Cancelar</button>
          <button className="pl-btn main" onClick={saveCargo} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>, document.body
  );

  return (
    <div className="pl-wrap">
      <style>{styles}</style>
      {modalDepto}{modalCargo}

      <div className="pl-hdr">
        <div><h2 className="pl-title">Departamentos y Cargos</h2><p className="pl-sub">Estructura organizacional de la empresa</p></div>
        {canEdit && tab === 'deptos' && <button className="pl-btn main" onClick={() => { setEditDepto(emptyDepto()); setError(''); setShowDepto(true); }}>+ Nuevo Departamento</button>}
        {canEdit && tab === 'cargos' && <button className="pl-btn main" onClick={() => { setEditCargo(emptyCargo()); setError(''); setShowCargo(true); }}>+ Nuevo Cargo</button>}
      </div>

      <div className="pl-tabs">
        <button className={`pl-tab${tab === 'deptos' ? ' active' : ''}`} onClick={() => setTab('deptos')}>
          🏢 Departamentos<span className="pl-badge" style={{ background: tab === 'deptos' ? '#16a34a22' : '#1a2e1a', color: tab === 'deptos' ? '#22c55e' : '#8ea3c7' }}>{deptos.length}</span>
        </button>
        <button className={`pl-tab${tab === 'cargos' ? ' active' : ''}`} onClick={() => setTab('cargos')}>
          💼 Cargos<span className="pl-badge" style={{ background: tab === 'cargos' ? '#16a34a22' : '#1a2e1a', color: tab === 'cargos' ? '#22c55e' : '#8ea3c7' }}>{cargos.length}</span>
        </button>
      </div>

      {tab === 'deptos' && (
        <div className="pl-card">
          <div className="pl-table-wrap">
            {loading ? <div className="pl-empty">Cargando...</div> : deptos.length === 0 ? <div className="pl-empty">No hay departamentos. Agregue el primero.</div> : (
              <table className="pl-table">
                <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Cargos</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {deptos.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: "'DM Mono',monospace", color: '#8ea3c7', fontSize: 12 }}>{d.codigo || '—'}</td>
                      <td style={{ fontWeight: 600, color: '#f3f7ff' }}>{d.nombre}</td>
                      <td><span className="pl-chip" style={{ background: (TIPO_COLOR[d.tipo] ?? '#8ea3c7') + '33', color: TIPO_COLOR[d.tipo] ?? '#8ea3c7', border: `1px solid ${TIPO_COLOR[d.tipo] ?? '#8ea3c7'}44` }}>{tipoL(d.tipo)}</span></td>
                      <td style={{ color: '#8ea3c7' }}>{cargos.filter(c => c.departamento_id === d.id).length}</td>
                      <td><span className="pl-chip" style={{ background: d.activo ? '#16a34a33' : '#1a2e1a66', color: d.activo ? '#22c55e' : '#8ea3c7' }}>{d.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td>{canEdit && <button className="pl-btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => { setEditDepto({ ...d }); setError(''); setShowDepto(true); }}>Editar</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'cargos' && (
        <>
          <div className="pl-filters">
            <label style={{ fontSize: 12, color: '#8ea3c7' }}>Departamento:</label>
            <select className="pl-select" value={filtroDepto} onChange={e => setFiltroDepto(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Todos</option>
              {deptos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <div className="pl-card">
            <div className="pl-table-wrap">
              {loading ? <div className="pl-empty">Cargando...</div> : cargosF.length === 0 ? <div className="pl-empty">No hay cargos.</div> : (
                <table className="pl-table">
                  <thead><tr><th>Código</th><th>Cargo</th><th>Categoría</th><th>Departamento</th><th>Tipo</th><th>Salario Ref.</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {cargosF.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: "'DM Mono',monospace", color: '#8ea3c7', fontSize: 12 }}>{c.codigo || '—'}</td>
                        <td style={{ fontWeight: 600, color: '#f3f7ff' }}>{c.nombre}</td>
                        <td><span className="pl-chip" style={{ background: '#a78bfa33', color: '#a78bfa', border: '1px solid #a78bfa44' }}>{catL(c.categoria)}</span></td>
                        <td style={{ color: '#8ea3c7' }}>{dNombre(c.departamento_id)}</td>
                        <td><span className="pl-chip" style={{ background: (TIPO_COLOR[c.tipo_trabajo] ?? '#8ea3c7') + '33', color: TIPO_COLOR[c.tipo_trabajo] ?? '#8ea3c7' }}>{c.tipo_trabajo}</span></td>
                        <td style={{ fontFamily: "'DM Mono',monospace", textAlign: 'right' }}>{fmtMonto(c.salario_base_ref)}</td>
                        <td><span className="pl-chip" style={{ background: c.activo ? '#16a34a33' : '#1a2e1a66', color: c.activo ? '#22c55e' : '#8ea3c7' }}>{c.activo ? 'Activo' : 'Inactivo'}</span></td>
                        <td>{canEdit && <button className="pl-btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => { setEditCargo({ ...c }); setError(''); setShowCargo(true); }}>Editar</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
