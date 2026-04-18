import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabase';
import { PL_STYLES } from './planillaStyles';
import { formatCompanyDate } from '../../utils/companyTimeZone';

interface Props { canEdit?: boolean; }

interface Tasa {
  id: number;
  fecha_vigencia: string;
  tasa_ccss_obrero: number;
  tasa_banco_popular: number;
  tasa_pension_comp: number;
  tasa_ccss_patronal: number;
  tasa_sem_patronal: number | null;
  tasa_ivm_patronal: number | null;
  tasa_asfa_patronal: number | null;
  tasa_fcl_patronal: number | null;
  tasa_imas_patronal: number | null;
  tasa_ina_patronal: number | null;
  decreto_referencia: string | null;
  notas: string | null;
}

const pct = (n: number | null) => n == null ? '—' : (n * 100).toFixed(2) + '%';
const emptyTasa = (): Partial<Tasa> => ({
  fecha_vigencia: '', tasa_ccss_obrero: 0.1067, tasa_banco_popular: 0.0100,
  tasa_pension_comp: 0.0100, tasa_ccss_patronal: 0.2667,
  tasa_sem_patronal: 0.0950, tasa_ivm_patronal: 0.0584,
  tasa_asfa_patronal: 0.0542, tasa_fcl_patronal: 0.0300,
  tasa_imas_patronal: 0.0050, tasa_ina_patronal: 0.0150,
  decreto_referencia: '', notas: '',
});

export default function TasasCCSS({ canEdit }: Props) {
  const [tab, setTab] = useState<'historial' | 'comparativo'>('historial');
  const [tasas, setTasas] = useState<Tasa[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Tasa>>(emptyTasa());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [vigente, setVigente] = useState<Tasa | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: hist }, { data: vig }] = await Promise.all([
      supabase.from('pl_tasas_ccss_hist').select('*').order('fecha_vigencia', { ascending: false }),
      supabase.from('v_tasas_ccss_vigente').select('*').maybeSingle(),
    ]);
    setTasas(hist || []);
    setVigente(vig || null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.fecha_vigencia) { setError('La fecha de vigencia es requerida.'); return; }
    if (!form.tasa_ccss_obrero || !form.tasa_ccss_patronal) { setError('Las tasas CCSS son requeridas.'); return; }
    setSaving(true); setError('');

    // Validar que el desglose patronal cuadre con el total
    const desglose = (form.tasa_sem_patronal ?? 0) + (form.tasa_ivm_patronal ?? 0) +
      (form.tasa_asfa_patronal ?? 0) + (form.tasa_fcl_patronal ?? 0) +
      (form.tasa_imas_patronal ?? 0) + (form.tasa_ina_patronal ?? 0);
    const diferencia = Math.abs(desglose - (form.tasa_ccss_patronal ?? 0));
    if (desglose > 0 && diferencia > 0.001) {
      setError(`El desglose patronal suma ${(desglose * 100).toFixed(4)}% pero el total es ${((form.tasa_ccss_patronal ?? 0) * 100).toFixed(4)}%. Revise.`);
      setSaving(false); return;
    }

    const payload = {
      fecha_vigencia:    form.fecha_vigencia,
      tasa_ccss_obrero:  form.tasa_ccss_obrero,
      tasa_banco_popular: form.tasa_banco_popular,
      tasa_pension_comp: form.tasa_pension_comp,
      tasa_ccss_patronal: form.tasa_ccss_patronal,
      tasa_sem_patronal:  form.tasa_sem_patronal ?? null,
      tasa_ivm_patronal:  form.tasa_ivm_patronal ?? null,
      tasa_asfa_patronal: form.tasa_asfa_patronal ?? null,
      tasa_fcl_patronal:  form.tasa_fcl_patronal ?? null,
      tasa_imas_patronal: form.tasa_imas_patronal ?? null,
      tasa_ina_patronal:  form.tasa_ina_patronal ?? null,
      decreto_referencia: form.decreto_referencia?.trim() || null,
      notas:              form.notas?.trim() || null,
    };

    let err;
    if ((form as Tasa).id) {
      ({ error: err } = await supabase.from('pl_tasas_ccss_hist').update(payload).eq('id', (form as Tasa).id));
    } else {
      ({ error: err } = await supabase.from('pl_tasas_ccss_hist').insert(payload));
    }

    if (err) { setError(err.message); }
    else { setShowModal(false); load(); }
    setSaving(false);
  };

  // Campo numérico porcentaje helper
  const FP = (key: keyof Tasa, label: string, required = false) => (
    <div className="pl-field">
      <label>{label}{required ? ' *' : ''}</label>
      <div style={{ position: 'relative' }}>
        <input
          type="number" step="0.0001" min="0" max="1" className="pl-input"
          style={{ width: '100%', boxSizing: 'border-box', paddingRight: 36 }}
          value={(form[key] as number) ?? ''}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value ? Number(e.target.value) : null }))}
        />
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#8ea3c7', pointerEvents: 'none' }}>
          {form[key] != null ? ((form[key] as number) * 100).toFixed(2) + '%' : ''}
        </span>
      </div>
    </div>
  );

  const modal = showModal && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowModal(false)}>
      <div className="pl-modal wide" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">{(form as Tasa).id ? 'Editar Tasas CCSS' : 'Nuevas Tasas CCSS'}</p>
        <p className="pl-modal-sub">Las tasas ingresadas son decimales: 10.67% = 0.1067</p>

        {error && <div className="pl-err">{error}</div>}

        <div className="pl-field">
          <label>Fecha de Vigencia *</label>
          <input type="date" className="pl-input" value={form.fecha_vigencia ?? ''}
            onChange={e => setForm(p => ({ ...p, fecha_vigencia: e.target.value }))} autoFocus />
        </div>
        <div className="pl-field">
          <label>Decreto / Referencia</label>
          <input className="pl-input" placeholder="Ej: Acuerdo JD CCSS N°1234-2026"
            value={form.decreto_referencia ?? ''}
            onChange={e => setForm(p => ({ ...p, decreto_referencia: e.target.value }))} />
        </div>

        <hr className="pl-sep" />

        {/* Cargas obreras */}
        <p style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 10px' }}>
          Cargas Obreras (descuentos al trabajador)
        </p>
        <div className="pl-g3">
          {FP('tasa_ccss_obrero', 'CCSS Obrero (SEM+IVM)', true)}
          {FP('tasa_banco_popular', 'Banco Popular')}
          {FP('tasa_pension_comp', 'Pensión Comp. OPC')}
        </div>
        <div className="pl-info" style={{ marginBottom: 14 }}>
          Total obrero: <strong>{(((form.tasa_ccss_obrero ?? 0) + (form.tasa_banco_popular ?? 0)) * 100).toFixed(2)}%</strong>
          {' '}(sin OPC) · Con OPC: <strong>{(((form.tasa_ccss_obrero ?? 0) + (form.tasa_banco_popular ?? 0) + (form.tasa_pension_comp ?? 0)) * 100).toFixed(2)}%</strong>
        </div>

        <hr className="pl-sep" />

        {/* Cargas patronales */}
        <p style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 10px' }}>
          Cargas Patronales (gasto de la empresa)
        </p>
        <div className="pl-g2" style={{ marginBottom: 10 }}>
          {FP('tasa_ccss_patronal', 'TOTAL Patronal *', true)}
        </div>
        <p style={{ fontSize: 11, color: '#8ea3c7', margin: '0 0 10px' }}>Desglose por componente (informativo — la suma debe igualar el total):</p>
        <div className="pl-g3">
          {FP('tasa_sem_patronal', 'SEM Patronal')}
          {FP('tasa_ivm_patronal', 'IVM Patronal')}
          {FP('tasa_asfa_patronal', 'ASFA/Fodesaf')}
          {FP('tasa_fcl_patronal', 'FCL')}
          {FP('tasa_imas_patronal', 'IMAS')}
          {FP('tasa_ina_patronal', 'INA')}
        </div>
        {/* Validación visual desglose */}
        {(() => {
          const sum = (form.tasa_sem_patronal ?? 0) + (form.tasa_ivm_patronal ?? 0) +
            (form.tasa_asfa_patronal ?? 0) + (form.tasa_fcl_patronal ?? 0) +
            (form.tasa_imas_patronal ?? 0) + (form.tasa_ina_patronal ?? 0);
          const total = form.tasa_ccss_patronal ?? 0;
          const dif = Math.abs(sum - total);
          if (sum === 0) return null;
          return (
            <div className={dif < 0.001 ? 'pl-ok' : 'pl-err'} style={{ marginBottom: 14 }}>
              Suma desglose: <strong>{(sum * 100).toFixed(4)}%</strong>
              {' — '}Total declarado: <strong>{(total * 100).toFixed(4)}%</strong>
              {dif < 0.001 ? ' ✓ Cuadra' : ` — Diferencia: ${(dif * 100).toFixed(4)}%`}
            </div>
          );
        })()}

        <div className="pl-field">
          <label>Notas</label>
          <textarea value={form.notas ?? ''} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
            placeholder="Descripción de cambios, referencias legales..." />
        </div>

        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => { setShowModal(false); setError(''); }}>Cancelar</button>
          <button className="pl-btn main" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar Tasas'}
          </button>
        </div>
      </div>
    </div>, document.body
  );

  return (
    <div className="pl-wrap">
      <style>{PL_STYLES}</style>
      {modal}

      <div className="pl-hdr">
        <div className="pl-hdr-left">
          <h2 className="pl-title">Tasas CCSS — Historial</h2>
          <p className="pl-sub">Tabla universal — válida para todas las empresas en Costa Rica</p>
        </div>
        {canEdit && (
          <button className="pl-btn main" onClick={() => { setForm(emptyTasa()); setError(''); setShowModal(true); }}>
            + Nueva Tasa
          </button>
        )}
      </div>

      {/* Tasa vigente destacada */}
      {vigente && (
        <div style={{ background: '#0f2c20', border: '1px solid #1d6e4f', borderRadius: 14, padding: '18px 22px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                ✓ Tasa Vigente
              </span>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f3f7ff', marginTop: 2 }}>
                Desde {formatCompanyDate(vigente.fecha_vigencia)}
                {vigente.decreto_referencia && <span style={{ fontSize: 13, fontWeight: 400, color: '#8ea3c7', marginLeft: 10 }}>({vigente.decreto_referencia})</span>}
              </div>
            </div>
            {canEdit && (
              <button className="pl-btn" style={{ fontSize: 12, padding: '5px 14px' }}
                onClick={() => { setForm({ ...vigente }); setError(''); setShowModal(true); }}>
                Editar
              </button>
            )}
          </div>

          {/* Resumen tasas vigentes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div style={{ background: '#111e13', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Cargas Obreras</div>
              {[
                ['CCSS Obrero (SEM+IVM)', vigente.tasa_ccss_obrero],
                ['Banco Popular', vigente.tasa_banco_popular],
              ].map(([l, v]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                  <span style={{ color: '#8ea3c7' }}>{l}</span>
                  <span className="mono" style={{ fontWeight: 600, color: '#f3f7ff' }}>{pct(v as number)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid rgba(34,197,94,0.15)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>Total obrero</span>
                <span className="mono" style={{ fontWeight: 800, color: '#38bdf8' }}>{pct(vigente.tasa_ccss_obrero + vigente.tasa_banco_popular)}</span>
              </div>
            </div>

            <div style={{ background: '#111e13', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Cargas Patronales</div>
              {[
                ['SEM', vigente.tasa_sem_patronal],
                ['IVM', vigente.tasa_ivm_patronal],
                ['ASFA/Fodesaf', vigente.tasa_asfa_patronal],
                ['FCL', vigente.tasa_fcl_patronal],
                ['IMAS', vigente.tasa_imas_patronal],
                ['INA', vigente.tasa_ina_patronal],
              ].filter(([, v]) => v != null).map(([l, v]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '1px 0' }}>
                  <span style={{ color: '#8ea3c7' }}>{l}</span>
                  <span className="mono" style={{ color: '#d6e2ff' }}>{pct(v as number)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid rgba(34,197,94,0.15)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#22c55e', fontWeight: 700 }}>Total patronal</span>
                <span className="mono" style={{ fontWeight: 800, color: '#22c55e' }}>{pct(vigente.tasa_ccss_patronal)}</span>
              </div>
            </div>

            <div style={{ background: '#111e13', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Costo Total Empresa</div>
              <div style={{ fontSize: 11, color: '#8ea3c7', marginBottom: 8 }}>Por cada ₡100 de salario bruto:</div>
              {[
                ['Salario bruto', 1],
                ['+ CCSS Patronal', vigente.tasa_ccss_patronal],
                ['+ Aguinaldo (1/12)', 1/12],
                ['+ Vacaciones (~4.17%)', 2/48],
                ['+ Cesantía (prov.)', 22/30/12],
              ].map(([l, v]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                  <span style={{ color: '#8ea3c7' }}>{l}</span>
                  <span className="mono" style={{ color: '#d6e2ff' }}>{pct(v as number)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid rgba(34,197,94,0.15)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#a78bfa', fontWeight: 700 }}>Costo total aprox.</span>
                <span className="mono" style={{ fontWeight: 800, color: '#a78bfa' }}>
                  {pct(1 + vigente.tasa_ccss_patronal + 1/12 + 2/48 + 22/30/12)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="pl-tabs">
        <button className={`pl-tab${tab === 'historial' ? ' active' : ''}`} onClick={() => setTab('historial')}>
          📋 Historial completo
        </button>
        <button className={`pl-tab${tab === 'comparativo' ? ' active' : ''}`} onClick={() => setTab('comparativo')}>
          📊 Comparativo últimos 3 años
        </button>
      </div>

      {/* Tab: Historial */}
      {tab === 'historial' && (
        <div className="pl-card">
          <div className="pl-table-wrap">
            {loading ? <div className="pl-empty">Cargando...</div> :
              tasas.length === 0 ? <div className="pl-empty">No hay tasas registradas.</div> : (
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Vigencia</th>
                      <th>Decreto</th>
                      <th className="r">CCSS Ob.</th>
                      <th className="r">B.Popular</th>
                      <th className="r">Total Obrero</th>
                      <th className="r">SEM Pat.</th>
                      <th className="r">IVM Pat.</th>
                      <th className="r">ASFA</th>
                      <th className="r">FCL</th>
                      <th className="r">IMAS</th>
                      <th className="r">INA</th>
                      <th className="r">Total Patronal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasas.map((t, i) => {
                      const esVigente = vigente?.id === t.id;
                      return (
                        <tr key={t.id} style={{ background: esVigente ? 'rgba(34,197,94,0.06)' : i % 2 === 0 ? '' : 'rgba(255,255,255,0.01)' }}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {esVigente && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />}
                              <span className="mono" style={{ fontWeight: esVigente ? 700 : 400, color: esVigente ? '#22c55e' : '#d6e2ff' }}>
                                {formatCompanyDate(t.fecha_vigencia)}
                              </span>
                            </div>
                          </td>
                          <td style={{ fontSize: 12, color: '#8ea3c7' }}>{t.decreto_referencia || '—'}</td>
                          <td className="r mono" style={{ color: '#38bdf8' }}>{pct(t.tasa_ccss_obrero)}</td>
                          <td className="r mono" style={{ color: '#8ea3c7' }}>{pct(t.tasa_banco_popular)}</td>
                          <td className="r mono" style={{ fontWeight: 700, color: '#38bdf8' }}>{pct(t.tasa_ccss_obrero + t.tasa_banco_popular)}</td>
                          <td className="r mono" style={{ color: '#8ea3c7', fontSize: 12 }}>{pct(t.tasa_sem_patronal)}</td>
                          <td className="r mono" style={{ color: '#8ea3c7', fontSize: 12 }}>{pct(t.tasa_ivm_patronal)}</td>
                          <td className="r mono" style={{ color: '#8ea3c7', fontSize: 12 }}>{pct(t.tasa_asfa_patronal)}</td>
                          <td className="r mono" style={{ color: '#8ea3c7', fontSize: 12 }}>{pct(t.tasa_fcl_patronal)}</td>
                          <td className="r mono" style={{ color: '#8ea3c7', fontSize: 12 }}>{pct(t.tasa_imas_patronal)}</td>
                          <td className="r mono" style={{ color: '#8ea3c7', fontSize: 12 }}>{pct(t.tasa_ina_patronal)}</td>
                          <td className="r mono" style={{ fontWeight: 700, color: '#22c55e' }}>{pct(t.tasa_ccss_patronal)}</td>
                          <td>
                            {canEdit && (
                              <button className="pl-btn" style={{ padding: '4px 11px', fontSize: 11 }}
                                onClick={() => { setForm({ ...t }); setError(''); setShowModal(true); }}>
                                Editar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {/* Tab: Comparativo últimos 3 años */}
      {tab === 'comparativo' && (() => {
        // Tomar los 3 más recientes
        const ultimas3 = [...tasas].sort((a, b) => b.fecha_vigencia.localeCompare(a.fecha_vigencia)).slice(0, 3).reverse();
        if (ultimas3.length < 2) return <div className="pl-empty">Se necesitan al menos 2 registros para comparar.</div>;

        const anio = (t: Tasa) => new Date(t.fecha_vigencia + 'T12:00:00').getFullYear();

        // Diferencia entre dos tasas consecutivas
        const dif = (a: number | null, b: number | null): React.ReactNode => {
          if (a == null || b == null) return null;
          const d = b - a;
          if (Math.abs(d) < 0.00005) return <span style={{ color: '#8ea3c7', fontSize: 10 }}>sin cambio</span>;
          const color = d > 0 ? '#f87171' : '#22c55e';
          return <span style={{ color, fontSize: 10, fontWeight: 700 }}>{d > 0 ? '▲' : '▼'} {(Math.abs(d) * 100).toFixed(2)}%</span>;
        };

        const filas: { label: string; key: keyof Tasa; esTotal?: boolean }[] = [
          { label: 'SEM Obrero', key: 'tasa_ccss_obrero' },  // aproximado — no tenemos SEM separado
          { label: 'IVM Obrero', key: 'tasa_ccss_obrero' },  // placeholder visual
          { label: 'CCSS Obrero puro', key: 'tasa_ccss_obrero', esTotal: true },
          { label: 'Banco Popular', key: 'tasa_banco_popular' },
          { label: 'Total deducción obrero', key: 'tasa_ccss_obrero', esTotal: true },
          { label: '—', key: 'tasa_ccss_obrero' },
          { label: 'SEM Patronal', key: 'tasa_sem_patronal' },
          { label: 'IVM Patronal', key: 'tasa_ivm_patronal' },
          { label: 'ASFA / Fodesaf', key: 'tasa_asfa_patronal' },
          { label: 'FCL', key: 'tasa_fcl_patronal' },
          { label: 'IMAS', key: 'tasa_imas_patronal' },
          { label: 'INA', key: 'tasa_ina_patronal' },
          { label: 'Total Patronal', key: 'tasa_ccss_patronal', esTotal: true },
        ];

        // Calcular filas correctamente
        const getVal = (t: Tasa, key: string, label: string): number | null => {
          if (label === 'SEM Obrero') return 0.0550; // fijo histórico SEM obrero
          if (label === 'IVM Obrero') return (t.tasa_ccss_obrero ?? 0) - 0.0550;
          if (label === 'Total deducción obrero') return (t.tasa_ccss_obrero ?? 0) + (t.tasa_banco_popular ?? 0);
          if (label === '—') return null;
          return t[key as keyof Tasa] as number | null;
        };

        return (
          <div className="pl-card">
            <div className="pl-table-wrap">
              <table className="pl-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Componente</th>
                    {ultimas3.map(t => (
                      <th key={t.id} className="r" style={{ color: vigente?.id === t.id ? '#22c55e' : '#8ea3c7' }}>
                        {anio(t)}
                        {vigente?.id === t.id && <span style={{ fontSize: 9, marginLeft: 4, color: '#22c55e' }}>●</span>}
                      </th>
                    ))}
                    {ultimas3.length >= 2 && <th className="r" style={{ color: '#f59e0b', fontSize: 10 }}>Δ {anio(ultimas3[ultimas3.length-2])}→{anio(ultimas3[ultimas3.length-1])}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(({ label, key, esTotal }) => {
                    if (label === '—') return (
                      <tr key="sep"><td colSpan={ultimas3.length + 2}><hr style={{ border: 'none', borderTop: '1px solid rgba(137,160,201,0.12)', margin: '2px 0' }} /></td></tr>
                    );
                    const vals = ultimas3.map(t => getVal(t, key, label));
                    const penultimo = vals[vals.length - 2];
                    const ultimo = vals[vals.length - 1];
                    return (
                      <tr key={label} style={{ background: esTotal ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                        <td style={{ color: esTotal ? '#f3f7ff' : '#8ea3c7', fontWeight: esTotal ? 700 : 400, fontSize: esTotal ? 13 : 12 }}>
                          {label}
                        </td>
                        {vals.map((v, vi) => (
                          <td key={vi} className="r mono" style={{
                            color: esTotal ? (label.includes('obrero') || label.includes('Obrero') ? '#38bdf8' : '#22c55e') : '#d6e2ff',
                            fontWeight: esTotal ? 800 : 400,
                            fontSize: esTotal ? 13 : 12,
                          }}>
                            {v == null ? '—' : pct(v)}
                          </td>
                        ))}
                        {ultimas3.length >= 2 && (
                          <td className="r" style={{ verticalAlign: 'middle' }}>
                            {dif(penultimo, ultimo)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Resumen de cambios */}
            {ultimas3.length >= 2 && (() => {
              const prev = ultimas3[ultimas3.length - 2];
              const curr = ultimas3[ultimas3.length - 1];
              const cambios: string[] = [];
              if (Math.abs((curr.tasa_ccss_obrero ?? 0) - (prev.tasa_ccss_obrero ?? 0)) > 0.00005)
                cambios.push(`CCSS Obrero: ${pct(prev.tasa_ccss_obrero)} → ${pct(curr.tasa_ccss_obrero)}`);
              if (Math.abs((curr.tasa_ivm_patronal ?? 0) - (prev.tasa_ivm_patronal ?? 0)) > 0.00005)
                cambios.push(`IVM Patronal: ${pct(prev.tasa_ivm_patronal)} → ${pct(curr.tasa_ivm_patronal)}`);
              if (Math.abs((curr.tasa_ccss_patronal ?? 0) - (prev.tasa_ccss_patronal ?? 0)) > 0.00005)
                cambios.push(`Total Patronal: ${pct(prev.tasa_ccss_patronal)} → ${pct(curr.tasa_ccss_patronal)}`);
              if (cambios.length === 0) return null;
              return (
                <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(137,160,201,0.14)' }}>
                  <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                    Cambios {anio(prev)} → {anio(curr)}
                  </div>
                  {cambios.map(c => (
                    <div key={c} style={{ fontSize: 13, color: '#d6e2ff', padding: '2px 0' }}>▲ {c}</div>
                  ))}
                  {curr.notas && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#8ea3c7', fontStyle: 'italic' }}>{curr.notas}</div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Nota legal */}
      <div className="pl-legal" style={{ marginTop: 14 }}>
        <strong>Fuente:</strong> CCSS — Junta Directiva. Las tasas son definidas por ley y aplican para todas las empresas en Costa Rica.
        Ante un cambio de decreto, agregue una nueva fila con la fecha de vigencia. El sistema usará automáticamente la tasa más reciente ≤ a la fecha del período.
        <strong> Nota:</strong> Tasas 2025 y 2026 basadas en plan gradual IVM (Acta 9038/2019). Verifique con la CCSS antes de procesar planillas.
      </div>
    </div>
  );
}
