import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

interface Cuenta {
  id?: number;
  codigo: string;
  nombre: string;
  nivel: number;
  padre_id: number | null;
  tipo: string;
  naturaleza: string;
  acepta_movimiento: boolean;
  activo: boolean;
}

interface Props {
  cuenta: Cuenta | null;
  onGuardar: () => void;
  onCancelar: () => void;
}

const styles = `
  .fc-wrap { max-width:760px; margin:0 auto; color:#d6e2ff; }
  .fc-topbar { display:flex; align-items:center; gap:12px; margin-bottom:24px; }
  .btn-back { display:flex; align-items:center; gap:6px; padding:8px 14px;
    background:#243149; border:1px solid rgba(137,160,201,0.18); border-radius:10px;
    color:#d6e2ff; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.15s; }
  .btn-back:hover { background:#2b3a53; }
  .fc-page-title { font-size:18px; font-weight:700; color:#f3f7ff; }
  .fc-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px;
    padding:28px; margin-bottom:16px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .fc-section-title { font-size:11px; font-weight:700; color:#9df4c7;
    letter-spacing:0.08em; text-transform:uppercase; margin-bottom:18px;
    padding-bottom:8px; border-bottom:1px solid rgba(29,110,79,0.36); }
  .fc-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .fc-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
  .fc-group { display:flex; flex-direction:column; gap:5px; }
  .fc-group.span2 { grid-column:span 2; }
  .fc-label { font-size:11px; font-weight:700; color:#8ea3c7;
    letter-spacing:0.04em; text-transform:uppercase; }
  .fc-input { padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px;
    font-size:13px; color:#f3f7ff; font-family:'DM Sans',sans-serif; background:#1d2738;
    outline:none; transition:border-color 0.2s, box-shadow 0.2s; }
  .fc-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .fc-input:disabled { background:#111827; color:#7184a8; }
  .fc-check { display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:4px; }
  .fc-check input { width:16px; height:16px; accent-color:#16a34a; cursor:pointer; }
  .fc-check span { font-size:13px; color:#d6e2ff; }
  .fc-footer { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }
  .btn-guardar { padding:11px 24px;
    background:linear-gradient(135deg,#17a34a,#22c55e);
    border:none; border-radius:10px; color:white; font-size:14px;
    font-weight:700; cursor:pointer; transition:opacity 0.2s; box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .btn-guardar:hover { opacity:0.95; }
  .btn-guardar:disabled { opacity:0.6; cursor:not-allowed; }
  .btn-cancelar { padding:11px 24px; background:#243149; border:1px solid rgba(137,160,201,0.18);
    border-radius:10px; color:#d6e2ff; font-size:14px; font-weight:700;
    cursor:pointer; }
  .btn-cancelar:hover { background:#2b3a53; }
  .fc-error { font-size:12px; color:#ff8d94; margin-top:2px; }
  .fc-success { padding:12px 16px; background:#0f2c20; border:1px solid #1d6e4f;
    border-radius:12px; color:#9df4c7; font-size:13px; font-weight:700; margin-bottom:16px; }
  .fc-info { padding:12px 16px; background:#16263f; border:1px solid #355da8;
    border-radius:12px; color:#9ec3ff; font-size:12px; margin-bottom:16px; }
  .padre-select { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22);
    border-radius:12px; font-size:13px; color:#f3f7ff; outline:none; background:#1d2738;
    font-family:'DM Mono',monospace; transition:border-color 0.2s; }
  .padre-select:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .codigo-preview { font-family:'DM Mono',monospace; font-size:18px; font-weight:700;
    color:#9df4c7; padding:12px 16px; background:#123224; border:1px solid #1d6e4f;
    border-radius:12px; text-align:center; letter-spacing:1px; }
`;

const TIPOS = ['ACTIVO', 'PASIVO', 'CAPITAL', 'INGRESO', 'COSTO', 'GASTO'];
const NATURALEZAS = ['DEBITO', 'CREDITO'];

export default function FormCuenta({ cuenta, onGuardar, onCancelar }: Props) {
  const [cuentasPadre, setCuentasPadre] = useState<any[]>([]);
  const [padreSeleccionado, setPadreSeleccionado] = useState<any>(null);
  const [codigoGenerado, setCodigoGenerado] = useState('');

  const [form, setForm] = useState({
    nombre: cuenta?.nombre || '',
    tipo: cuenta?.tipo || 'ACTIVO',
    naturaleza: cuenta?.naturaleza || 'DEBITO',
    acepta_movimiento: cuenta?.acepta_movimiento || false,
    activo: cuenta?.activo ?? true,
  });
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [codigoEditable, setCodigoEditable] = useState('');
  const [codigoPrefijo, setCodigoPrefijo] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase
        .from('plan_cuentas_base')
        .select('*').lt('nivel', 5).eq('activo', true).order('codigo');
      
      if (data) setCuentasPadre(data);
      
      if (cuenta?.padre_id && data) {
        const padre = data.find(c => c.id === cuenta.padre_id);
        if (padre) {
          setPadreSeleccionado(padre);
          generarCodigo(padre, data);
        }
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

const generarCodigo = async (padre: any, todasCuentas?: any[]) => {
  // Buscar hermanas existentes en BD
  const { data: hermanas } = await supabase
    .from('plan_cuentas_base')
    .select('codigo')
    .eq('padre_id', padre.id)
    .order('codigo', { ascending: false });

  let nuevoCodigo = '';
  let sufijo = '';

  if (padre.nivel === 1) {
    // Nivel 2: 0101, 0102...
    if (hermanas && hermanas.length > 0) {
      const ultimo = hermanas[0].codigo;
      const num = parseInt(ultimo.replace(padre.codigo, '')) + 1;
      sufijo = String(num).padStart(2, '0');
    } else {
      sufijo = '01';
    }
    nuevoCodigo = `${padre.codigo}${sufijo}`;
  } else if (padre.nivel === 2) {
    // Nivel 3: 0101-01, 0101-02...
    if (hermanas && hermanas.length > 0) {
      const ultimo = hermanas[0].codigo;
      const partes = ultimo.split('-');
      const num = parseInt(partes[partes.length - 1]) + 1;
      sufijo = String(num).padStart(2, '0');
    } else {
      sufijo = '01';
    }
    nuevoCodigo = `${padre.codigo}-${sufijo}`;
  } else if (padre.nivel === 3) {
    // Nivel 4: 0101-01-001, 0101-01-002...
    if (hermanas && hermanas.length > 0) {
      const ultimo = hermanas[0].codigo;
      const partes = ultimo.split('-');
      const num = parseInt(partes[partes.length - 1]) + 1;
      sufijo = String(num).padStart(3, '0');
    } else {
      sufijo = '001';
    }
    nuevoCodigo = `${padre.codigo}-${sufijo}`;
  } else if (padre.nivel === 4) {
    // Nivel 5: 0101-01-001-001, 0101-01-001-002...
    if (hermanas && hermanas.length > 0) {
      const ultimo = hermanas[0].codigo;
      const partes = ultimo.split('-');
      const num = parseInt(partes[partes.length - 1]) + 1;
      sufijo = String(num).padStart(3, '0');
    } else {
      sufijo = '001';
    }
    nuevoCodigo = `${padre.codigo}-${sufijo}`;
  }

  setCodigoGenerado(nuevoCodigo);
  setCodigoEditable(sufijo);
  setCodigoPrefijo(nuevoCodigo.replace(sufijo, ''));
  setForm(prev => ({ ...prev, tipo: padre.tipo, naturaleza: padre.naturaleza }));
};

  const seleccionarPadre = (padreId: string) => {
    const padre = cuentasPadre.find(c => c.id === parseInt(padreId));
    if (padre) {
      setPadreSeleccionado(padre);
      generarCodigo(padre);
      setErrores(prev => ({ ...prev, padre: '' }));
    }
  };

  const validar = async () => {
    const e: Record<string, string> = {};
    if (!padreSeleccionado && !cuenta?.id) e.padre = 'Seleccione la cuenta padre';
    if (!form.nombre.trim()) e.nombre = 'Requerido';
    if (!codigoGenerado && !cuenta?.id) e.codigo = 'Seleccione la cuenta padre primero';

    // Verificar duplicado
    if (codigoGenerado) {
      const { data } = await supabase.from('plan_cuentas_base')
        .select('id').eq('codigo', codigoGenerado);
      if (data && data.length > 0 && data[0].id !== cuenta?.id) {
        e.codigo = `El código ${codigoGenerado} ya existe`;
      }
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const guardar = async () => {
    if (!await validar()) return;
    setGuardando(true);

    const datos = {
      codigo: cuenta?.id ? cuenta.codigo : codigoGenerado,
      nombre: form.nombre.toUpperCase(),
      nivel: padreSeleccionado ? padreSeleccionado.nivel + 1 : cuenta?.nivel,
      padre_id: padreSeleccionado?.id || cuenta?.padre_id,
      tipo: form.tipo,
      naturaleza: form.naturaleza,
      acepta_movimiento: padreSeleccionado?.nivel === 4 ? form.acepta_movimiento : false,
      activo: form.activo,
    };

    let error;
    if (cuenta?.id) {
      ({ error } = await supabase.from('plan_cuentas_base').update(datos).eq('id', cuenta.id));
    } else {
      ({ error } = await supabase.from('plan_cuentas_base').insert(datos));
    }

    setGuardando(false);
    if (error) { alert('Error: ' + error.message); return; }
    setExito(cuenta?.id ? 'Cuenta actualizada correctamente' : 'Cuenta creada correctamente');
    setTimeout(() => onGuardar(), 1200);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="fc-wrap">
        <div className="fc-topbar">
          <button className="btn-back" onClick={onCancelar}>← Volver</button>
          <div className="fc-page-title">
            {cuenta?.id ? `Editar Cuenta — ${cuenta.codigo}` : 'Nueva Cuenta'}
          </div>
        </div>

        {exito && <div className="fc-success">✓ {exito}</div>}

        <div className="fc-card">
          <div className="fc-section-title">Ubicación en el Plan</div>
          <div className="fc-grid">
            <div className="fc-group">
              <label className="fc-label">Cuenta Padre *</label>
              <select className="padre-select"
                value={padreSeleccionado?.id || ''}
                onChange={e => seleccionarPadre(e.target.value)}
                disabled={!!cuenta?.id}>
                <option value="">-- Seleccione la cuenta padre --</option>
                {cuentasPadre.map(c => (
                  <option key={c.id} value={c.id}>
                    {'  '.repeat(c.nivel - 1)}{c.codigo} — {c.nombre}
                  </option>
                ))}
              </select>
              {errores.padre && <span className="fc-error">{errores.padre}</span>}
            </div>
            <div className="fc-group">
              <label className="fc-label">Código</label>
              {codigoPrefijo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    fontFamily: 'DM Mono, monospace', fontSize: '13px',
                    color: '#9ca3af', padding: '9px 8px',
                    background: '#1d2738', border: '1px solid rgba(137,160,201,0.18)',
                    borderRadius: '8px 0 0 8px', borderRight: 'none',
                    whiteSpace: 'nowrap'
                  }}>
                    {codigoPrefijo}
                  </span>
                  <input
                    className="fc-input"
                    style={{ borderRadius: '0 8px 8px 0', fontFamily: 'DM Mono, monospace',
                      fontWeight: '700', color: '#16a34a', width: '80px' }}
                    value={codigoEditable}
                    maxLength={3}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '');
                      setCodigoEditable(val);
                      setCodigoGenerado(codigoPrefijo + val);
                    }}
                  />
                </div>
              ) : (
                <div className="codigo-preview">{codigoGenerado || cuenta?.codigo || '—'}</div>
              )}
              {errores.codigo && <span className="fc-error">{errores.codigo}</span>}
            </div>
          </div>

          {padreSeleccionado && (
            <div className="fc-info" style={{ marginTop: '16px' }}>
              📍 Nivel {padreSeleccionado.nivel + 1} •
              Tipo: {padreSeleccionado.tipo} •
              Naturaleza: {padreSeleccionado.naturaleza}
              {padreSeleccionado.nivel === 4 && ' • Esta cuenta podrá aceptar movimientos'}
            </div>
          )}
        </div>

        <div className="fc-card">
          <div className="fc-section-title">Datos de la Cuenta</div>
          <div className="fc-grid">
            <div className="fc-group span2">
              <label className="fc-label">Nombre *</label>
              <input className="fc-input" value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value.toUpperCase() }))}
                placeholder="NOMBRE DE LA CUENTA" />
              {errores.nombre && <span className="fc-error">{errores.nombre}</span>}
            </div>
            <div className="fc-group">
              <label className="fc-label">Tipo</label>
              <select className="fc-input" value={form.tipo}
                onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                disabled={!!padreSeleccionado}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fc-group">
              <label className="fc-label">Naturaleza</label>
              <select className="fc-input" value={form.naturaleza}
                onChange={e => setForm(p => ({ ...p, naturaleza: e.target.value }))}
                disabled={!!padreSeleccionado}>
                {NATURALEZAS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
            {(padreSeleccionado?.nivel === 4 || cuenta?.nivel === 5) && (
              <label className="fc-check">
                <input type="checkbox" checked={form.acepta_movimiento}
                  onChange={e => setForm(p => ({ ...p, acepta_movimiento: e.target.checked }))} />
                <span>Acepta Movimiento Contable</span>
              </label>
            )}
            <label className="fc-check">
              <input type="checkbox" checked={form.activo}
                onChange={e => setForm(p => ({ ...p, activo: e.target.checked }))} />
              <span>Cuenta Activa</span>
            </label>
          </div>
        </div>

        <div className="fc-footer">
          <button className="btn-cancelar" onClick={onCancelar}>Cancelar</button>
          <button className="btn-guardar" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : cuenta?.id ? 'Actualizar Cuenta' : 'Crear Cuenta'}
          </button>
        </div>
      </div>
    </>
  );
}

