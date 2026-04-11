import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';

interface EscenariosRentaPruebaProps {
  empresaId: number;
  canView?: boolean;
  canEdit?: boolean;
}

interface EscenarioBase {
  id: number;
  codigo: string;
  nombre: string;
  persona_tipo: string;
  regimen_codigo: string;
  activo: boolean;
}

interface EscenarioPeriodo {
  id: number;
  escenario_id: number;
  escenario_codigo: string;
  escenario_nombre: string;
  anio: number;
  tope_ingreso_bruto: number | null;
  tasa_plana: number;
  juridica_tope_logica: 'ULTIMO_TRAMO' | 'TASA_PLANA';
  ingreso_bruto_prueba: number | null;
  nota: string | null;
  activo: boolean;
}

interface EscenarioTramo {
  id?: number;
  periodo_id: number;
  tramo_orden: number;
  desde: number;
  hasta: number | null;
  tasa: number;
  descripcion: string | null;
  activo: boolean;
}

const styles = `
  .erp-wrap { padding:0; }
  .erp-title { font-size:20px; font-weight:600; color:#1f2937; margin-bottom:6px; }
  .erp-sub { font-size:12px; color:#6b7280; margin-bottom:12px; }
  .erp-msg-ok { margin-bottom:10px; border:1px solid #bbf7d0; background:#dcfce7; color:#166534; border-radius:8px; padding:10px 12px; font-size:12px; }
  .erp-msg-err { margin-bottom:10px; border:1px solid #fecaca; background:#fee2e2; color:#991b1b; border-radius:8px; padding:10px 12px; font-size:12px; }
  .erp-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:12px; }
  .erp-grid { display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:8px; }
  .erp-field { display:flex; flex-direction:column; gap:4px; }
  .erp-field label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .erp-input, .erp-select, .erp-text { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; font-size:13px; }
  .erp-text { min-height:72px; }
  .erp-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px; }
  .erp-btn { border:1px solid #d1d5db; background:#fff; color:#334155; border-radius:8px; padding:8px 11px; font-size:13px; cursor:pointer; }
  .erp-btn.main { border-color:#16a34a; background:#16a34a; color:#fff; }
  .erp-btn.warn { border-color:#f59e0b; color:#92400e; background:#fffbeb; }
  .erp-btn:disabled { opacity:.65; cursor:not-allowed; }
  .erp-note { font-size:12px; color:#64748b; }
  .erp-check { display:flex; align-items:center; gap:6px; font-size:12px; color:#334155; }
  .erp-table { border:1px solid #e5e7eb; border-radius:10px; overflow:auto; }
  .erp-table table { width:100%; border-collapse:collapse; min-width:860px; }
  .erp-table th, .erp-table td { padding:8px 10px; border-top:1px solid #f1f5f9; font-size:12px; }
  .erp-table th { background:#f8fafc; color:#64748b; text-transform:uppercase; letter-spacing:.03em; font-size:11px; text-align:left; }
  .erp-table input[type="number"], .erp-table input[type="text"] { width:100%; border:1px solid #d1d5db; border-radius:6px; padding:6px 8px; font-size:12px; }
  .erp-empty { color:#64748b; padding:14px; text-align:center; font-size:13px; }
  @media (max-width: 980px) { .erp-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .erp-grid { grid-template-columns: 1fr; } }
`;

const toN = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const formatCodeLabel = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  return raw
    .toLowerCase()
    .split('_')
    .map((w) => (w ? `${w[0].toUpperCase()}${w.slice(1)}` : ''))
    .join(' ');
};

const formatTipo = (value: string | null | undefined) => {
  if (value === 'persona_fisica') return 'Persona fisica';
  if (value === 'persona_juridica') return 'Persona juridica';
  return formatCodeLabel(value);
};

const formatRegimen = (value: string | null | undefined) => {
  if (value === 'PERSONA_FISICA_LUCRATIVA') return 'Persona fisica lucrativa';
  if (value === 'PERSONA_JURIDICA_PYME') return 'Persona juridica PYME';
  if (value === 'ASALARIADO_JUBILADO') return 'Asalariado / Jubilado';
  return formatCodeLabel(value);
};

export default function EscenariosRentaPrueba({ empresaId, canView = true, canEdit = false }: EscenariosRentaPruebaProps) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [escenarios, setEscenarios] = useState<EscenarioBase[]>([]);
  const [periodos, setPeriodos] = useState<EscenarioPeriodo[]>([]);
  const [tramos, setTramos] = useState<EscenarioTramo[]>([]);
  const [escenarioId, setEscenarioId] = useState<number>(0);
  const [periodoId, setPeriodoId] = useState<number>(0);
  const [replaceEmpresa, setReplaceEmpresa] = useState(true);
  const [usarIngresoPrueba, setUsarIngresoPrueba] = useState(true);

  const periodo = useMemo(() => periodos.find((p) => p.id === periodoId) || null, [periodos, periodoId]);
  const escenario = useMemo(() => escenarios.find((e) => e.id === escenarioId) || null, [escenarios, escenarioId]);

  const loadEscenarios = async () => {
    if (!canView) return;
    setBusy(true);
    setErr('');
    const { data, error } = await supabase
      .from('vw_impuesto_renta_escenario_base')
      .select('*')
      .eq('activo', true)
      .order('codigo', { ascending: true });
    setBusy(false);
    if (error) {
      setErr(error.message || 'No se pudo cargar escenarios base.');
      return;
    }
    const rows = (data || []) as EscenarioBase[];
    setEscenarios(rows);
    if (rows.length > 0 && !escenarioId) setEscenarioId(rows[0].id);
  };

  const loadPeriodos = async (escId: number) => {
    if (!escId) {
      setPeriodos([]);
      setPeriodoId(0);
      return;
    }
    const { data, error } = await supabase
      .from('vw_impuesto_renta_escenario_periodo')
      .select('*')
      .eq('escenario_id', escId)
      .order('anio', { ascending: false });
    if (error) {
      setErr(error.message || 'No se pudo cargar periodos.');
      return;
    }
    const rows = (data || []) as EscenarioPeriodo[];
    setPeriodos(rows);
    setPeriodoId((prev) => (prev && rows.some((x) => x.id === prev) ? prev : (rows[0]?.id || 0)));
  };

  const loadTramos = async (perId: number) => {
    if (!perId) {
      setTramos([]);
      return;
    }
    const { data, error } = await supabase
      .from('vw_impuesto_renta_escenario_tramo')
      .select('id,periodo_id,tramo_orden,desde,hasta,tasa,descripcion,activo')
      .eq('periodo_id', perId)
      .order('tramo_orden', { ascending: true });
    if (error) {
      setErr(error.message || 'No se pudo cargar tramos.');
      return;
    }
    setTramos((data || []) as EscenarioTramo[]);
  };

  useEffect(() => {
    loadEscenarios();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadPeriodos(escenarioId);
  }, [escenarioId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadTramos(periodoId);
  }, [periodoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPeriodoField = (key: keyof EscenarioPeriodo, value: any) => {
    setPeriodos((prev) => prev.map((p) => (p.id === periodoId ? ({ ...p, [key]: value }) : p)));
  };

  const setTramoField = (idx: number, key: keyof EscenarioTramo, value: any) => {
    setTramos((prev) => prev.map((t, i) => (i === idx ? ({ ...t, [key]: value }) : t)));
  };

  const addTramo = () => {
    if (!periodoId) return;
    const ord = tramos.length > 0 ? Math.max(...tramos.map((x) => toN(x.tramo_orden, 0))) + 1 : 1;
    setTramos((prev) => [...prev, {
      periodo_id: periodoId,
      tramo_orden: ord,
      desde: 0,
      hasta: null,
      tasa: 0,
      descripcion: 'Exceso de',
      activo: true,
    }]);
  };

  const removeTramo = (idx: number) => setTramos((prev) => prev.filter((_, i) => i !== idx));

  const guardarPeriodoYTramos = async () => {
    if (!canEdit || !periodo) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { error: upPerErr } = await supabase
        .from('impuesto_renta_escenario_periodo')
        .update({
          anio: toN(periodo.anio, new Date().getFullYear()),
          tope_ingreso_bruto: periodo.tope_ingreso_bruto == null ? null : toN(periodo.tope_ingreso_bruto, 0),
          tasa_plana: toN(periodo.tasa_plana, 30),
          juridica_tope_logica: periodo.juridica_tope_logica,
          ingreso_bruto_prueba: periodo.ingreso_bruto_prueba == null ? null : toN(periodo.ingreso_bruto_prueba, 0),
          nota: periodo.nota || null,
          activo: periodo.activo !== false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', periodo.id);
      if (upPerErr) throw upPerErr;

      const currentIds = tramos.map((t) => t.id).filter(Boolean) as number[];
      const { data: existing } = await supabase
        .from('impuesto_renta_escenario_tramo')
        .select('id')
        .eq('periodo_id', periodo.id);
      const toDelete = ((existing || []) as { id: number }[]).map((x) => x.id).filter((id) => !currentIds.includes(id));
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase.from('impuesto_renta_escenario_tramo').delete().in('id', toDelete);
        if (delErr) throw delErr;
      }

      const upserts = tramos.map((t) => ({
        id: t.id,
        periodo_id: periodo.id,
        tramo_orden: toN(t.tramo_orden, 1),
        desde: toN(t.desde, 0),
        hasta: t.hasta == null ? null : toN(t.hasta, 0),
        tasa: toN(t.tasa, 0),
        descripcion: t.descripcion || null,
        activo: t.activo !== false,
      }));
      if (upserts.length > 0) {
        const { error: upErr } = await supabase
          .from('impuesto_renta_escenario_tramo')
          .upsert(upserts, { onConflict: 'id' });
        if (upErr) throw upErr;
      }

      await loadPeriodos(escenarioId);
      await loadTramos(periodo.id);
      setOk('Periodo y tramos guardados.');
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo guardar periodo/tramos.'));
    } finally {
      setBusy(false);
    }
  };

  const crearPeriodo = async () => {
    if (!canEdit || !escenarioId) return;
    const anio = window.prompt('Nuevo año del periodo:', String(new Date().getFullYear()));
    if (!anio) return;
    const anioNum = Number(anio);
    if (!Number.isFinite(anioNum) || anioNum < 2000 || anioNum > 2100) {
      setErr('Año inválido.');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const base = periodos[0];
      const payload = {
        escenario_id: escenarioId,
        anio: anioNum,
        tope_ingreso_bruto: base?.tope_ingreso_bruto ?? null,
        tasa_plana: base?.tasa_plana ?? 30,
        juridica_tope_logica: base?.juridica_tope_logica ?? 'TASA_PLANA',
        ingreso_bruto_prueba: base?.ingreso_bruto_prueba ?? null,
        nota: base?.nota ?? null,
        activo: true,
      };
      const { data: inserted, error: insErr } = await supabase
        .from('impuesto_renta_escenario_periodo')
        .insert(payload)
        .select('id')
        .single();
      if (insErr) throw insErr;

      const newPeriodoId = Number((inserted as any)?.id || 0);
      if (newPeriodoId > 0 && base?.id) {
        const { data: srcTramos, error: trErr } = await supabase
          .from('vw_impuesto_renta_escenario_tramo')
          .select('tramo_orden,desde,hasta,tasa,descripcion,activo')
          .eq('periodo_id', base.id)
          .order('tramo_orden', { ascending: true });
        if (trErr) throw trErr;
        const cloneRows = ((srcTramos || []) as any[]).map((t) => ({
          periodo_id: newPeriodoId,
          tramo_orden: toN(t.tramo_orden, 1),
          desde: toN(t.desde, 0),
          hasta: t.hasta == null ? null : toN(t.hasta, 0),
          tasa: toN(t.tasa, 0),
          descripcion: t.descripcion || null,
          activo: t.activo !== false,
        }));
        if (cloneRows.length > 0) {
          const { error: insTrErr } = await supabase.from('impuesto_renta_escenario_tramo').insert(cloneRows);
          if (insTrErr) throw insTrErr;
        }
      }
      await loadPeriodos(escenarioId);
      setPeriodoId(newPeriodoId);
      setOk(`Periodo ${anioNum} creado.`);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo crear periodo.'));
    } finally {
      setBusy(false);
    }
  };

  const aplicarAEmpresa = async () => {
    if (!periodoId) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data, error } = await supabase.rpc('copiar_escenario_renta_base_a_empresa', {
        p_empresa_id: empresaId,
        p_periodo_id: periodoId,
        p_reemplazar: replaceEmpresa,
        p_usar_ingreso_bruto_prueba: usarIngresoPrueba,
      });
      if (error) throw error;
      const rows = Number((data as any)?.tramos_copiados || 0);
      setOk(`Escenario aplicado a empresa. Tramos copiados: ${rows}.`);
    } catch (e: any) {
      setErr(String(e?.message || 'No se pudo aplicar escenario a empresa.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="erp-wrap">
        <div className="erp-title">Escenarios Base de Renta (Pruebas)</div>
        <div className="erp-sub">Mantenga periodos/valores base y copie a la empresa activa para pruebas controladas.</div>
        {ok ? <div className="erp-msg-ok">{ok}</div> : null}
        {err ? <div className="erp-msg-err">{err}</div> : null}

        <div className="erp-card">
          <div className="erp-grid">
            <div className="erp-field">
              <label>Escenario</label>
              <select className="erp-select" value={escenarioId} onChange={(e) => setEscenarioId(Number(e.target.value || 0))}>
                {escenarios.map((e) => (
                  <option key={e.id} value={e.id}>{e.codigo} - {e.nombre}</option>
                ))}
              </select>
            </div>
            <div className="erp-field">
              <label>Periodo</label>
              <select className="erp-select" value={periodoId} onChange={(e) => setPeriodoId(Number(e.target.value || 0))}>
                {periodos.map((p) => (
                  <option key={p.id} value={p.id}>{p.anio} {p.activo ? '' : '(inactivo)'}</option>
                ))}
              </select>
            </div>
            <div className="erp-field">
              <label>Tipo</label>
              <input className="erp-input" value={formatTipo(escenario?.persona_tipo)} readOnly />
            </div>
            <div className="erp-field">
              <label>Régimen</label>
              <input className="erp-input" value={formatRegimen(escenario?.regimen_codigo)} readOnly />
            </div>
          </div>
          <div className="erp-actions">
            <button className="erp-btn" type="button" onClick={loadEscenarios} disabled={busy}>Recargar</button>
            <button className="erp-btn warn" type="button" onClick={crearPeriodo} disabled={!canEdit || busy || !escenarioId}>Nuevo periodo</button>
          </div>
        </div>

        {periodo ? (
          <div className="erp-card">
            <div className="erp-grid">
              <div className="erp-field">
                <label>Año</label>
                <input className="erp-input" type="number" value={periodo.anio} onChange={(e) => setPeriodoField('anio', toN(e.target.value, new Date().getFullYear()))} />
              </div>
              <div className="erp-field">
                <label>Tope ingreso bruto</label>
                <input className="erp-input" type="number" step="0.01" value={periodo.tope_ingreso_bruto ?? ''} onChange={(e) => setPeriodoField('tope_ingreso_bruto', e.target.value === '' ? null : toN(e.target.value, 0))} />
              </div>
              <div className="erp-field">
                <label>Tasa plana (%)</label>
                <input className="erp-input" type="number" step="0.01" value={periodo.tasa_plana} onChange={(e) => setPeriodoField('tasa_plana', toN(e.target.value, 30))} />
              </div>
              <div className="erp-field">
                <label>Lógica tope jurídica</label>
                <select className="erp-select" value={periodo.juridica_tope_logica} onChange={(e) => setPeriodoField('juridica_tope_logica', e.target.value === 'ULTIMO_TRAMO' ? 'ULTIMO_TRAMO' : 'TASA_PLANA')}>
                  <option value="TASA_PLANA">Tasa plana</option>
                  <option value="ULTIMO_TRAMO">Último tramo</option>
                </select>
              </div>
              <div className="erp-field">
                <label>Ingreso bruto prueba</label>
                <input className="erp-input" type="number" step="0.01" value={periodo.ingreso_bruto_prueba ?? ''} onChange={(e) => setPeriodoField('ingreso_bruto_prueba', e.target.value === '' ? null : toN(e.target.value, 0))} />
              </div>
              <div className="erp-field" style={{ gridColumn: '1 / -1' }}>
                <label>Nota</label>
                <textarea className="erp-text" value={periodo.nota || ''} onChange={(e) => setPeriodoField('nota', e.target.value)} />
              </div>
            </div>

            <div className="erp-actions">
              <button className="erp-btn main" type="button" onClick={guardarPeriodoYTramos} disabled={!canEdit || busy}>Guardar periodo y tramos</button>
              <label className="erp-check"><input type="checkbox" checked={replaceEmpresa} onChange={(e) => setReplaceEmpresa(e.target.checked)} />Reemplazar tramos empresa en ese año/régimen</label>
              <label className="erp-check"><input type="checkbox" checked={usarIngresoPrueba} onChange={(e) => setUsarIngresoPrueba(e.target.checked)} />Copiar ingreso bruto de prueba a parámetros</label>
              <button className="erp-btn warn" type="button" onClick={aplicarAEmpresa} disabled={busy || !periodoId}>Aplicar escenario a empresa {empresaId}</button>
            </div>
            <div className="erp-note">Aplicar escenario solo copia datos a la empresa activa para pruebas. No altera la base oficial MH.</div>
          </div>
        ) : null}

        <div className="erp-card">
          <div className="erp-actions">
            <button className="erp-btn" type="button" onClick={addTramo} disabled={!canEdit || !periodoId || busy}>Agregar tramo</button>
          </div>
          <div className="erp-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Ord</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th style={{ width: 120 }}>Tasa %</th>
                  <th>Descripción</th>
                  <th style={{ width: 90 }}>Activo</th>
                  <th style={{ width: 80 }}>Quitar</th>
                </tr>
              </thead>
              <tbody>
                {tramos.length === 0 ? (
                  <tr><td colSpan={7} className="erp-empty">Sin tramos en el período seleccionado.</td></tr>
                ) : tramos.map((t, idx) => (
                  <tr key={`${t.id || 'new'}-${idx}`}>
                    <td><input type="number" step="1" value={t.tramo_orden} onChange={(e) => setTramoField(idx, 'tramo_orden', toN(e.target.value, 1))} /></td>
                    <td><input type="number" step="0.01" value={t.desde} onChange={(e) => setTramoField(idx, 'desde', toN(e.target.value, 0))} /></td>
                    <td><input type="number" step="0.01" value={t.hasta ?? ''} onChange={(e) => setTramoField(idx, 'hasta', e.target.value === '' ? null : toN(e.target.value, 0))} /></td>
                    <td><input type="number" step="0.0001" value={t.tasa} onChange={(e) => setTramoField(idx, 'tasa', toN(e.target.value, 0))} /></td>
                    <td><input type="text" value={t.descripcion || ''} onChange={(e) => setTramoField(idx, 'descripcion', e.target.value)} /></td>
                    <td><input type="checkbox" checked={t.activo !== false} onChange={(e) => setTramoField(idx, 'activo', e.target.checked)} /></td>
                    <td><button className="erp-btn" type="button" onClick={() => removeTramo(idx)} disabled={!canEdit || busy}>X</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
