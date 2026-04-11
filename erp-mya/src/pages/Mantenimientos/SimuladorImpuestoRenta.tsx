import React, { useState } from 'react';
import { supabase } from '../../supabase';

interface SimuladorImpuestoRentaProps {
  empresaId: number;
  canView?: boolean;
}

interface DetallePreview {
  empresa_id: number | null;
  anio: number;
  tipo_contribuyente: string;
  regimen_codigo: string;
  utilidad_gravable: number;
  ingreso_bruto_anual: number | null;
  tope_ingreso_bruto: number | null;
  metodo: string;
  tasa_aplicada: number | null;
  impuesto_calculado: number;
}

interface EscalonadoPreviewRow {
  tramo_orden: number;
  tramo_descripcion: string;
  desde: number | null;
  hasta: number | null;
  monto_gravado: number | null;
  impuesto_pct: number | null;
  total: number | null;
}

const styles = `
  .sir-wrap { padding: 0; }
  .sir-title { font-size:20px; font-weight:600; color:#1f2937; margin-bottom:6px; }
  .sir-sub { font-size:12px; color:#6b7280; margin-bottom:12px; }
  .sir-msg-err { margin-bottom:10px; border:1px solid #fecaca; background:#fee2e2; color:#991b1b; border-radius:8px; padding:10px 12px; font-size:12px; }
  .sir-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:12px; }
  .sir-grid { display:grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap:8px; }
  .sir-field { display:flex; flex-direction:column; gap:4px; }
  .sir-field label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.03em; font-weight:700; }
  .sir-input, .sir-select { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; font-size:13px; }
  .sir-actions { display:flex; gap:8px; align-items:center; margin-top:10px; flex-wrap:wrap; }
  .sir-btn { border:1px solid #d1d5db; background:#fff; color:#334155; border-radius:8px; padding:9px 12px; font-size:13px; cursor:pointer; }
  .sir-btn.main { border-color:#16a34a; background:#16a34a; color:#fff; }
  .sir-btn:disabled { opacity:.7; cursor:not-allowed; }
  .sir-mini { font-size:12px; color:#64748b; }
  .sir-empty { color:#64748b; padding:14px; text-align:center; font-size:13px; }
  .sir-excel { border:1px solid #e5e7eb; border-radius:10px; overflow:auto; margin-top:10px; }
  .sir-excel table { width:100%; border-collapse:collapse; min-width:860px; }
  .sir-excel th, .sir-excel td { padding:8px 10px; border-top:1px solid #f1f5f9; font-size:12px; }
  .sir-excel th { background:#f1f5f9; color:#475569; font-size:12px; font-weight:700; }
  .sir-excel .num { text-align:right; font-variant-numeric: tabular-nums; }
  .sir-excel .total-row td { background:#fff7ed; font-weight:700; }
  .sir-kpi { display:grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap:8px; }
  .sir-kpi-item { border:1px solid #e5e7eb; border-radius:10px; padding:10px; background:#fff; }
  .sir-kpi-label { font-size:10px; text-transform:uppercase; color:#64748b; font-weight:700; margin-bottom:4px; }
  .sir-kpi-value { font-size:16px; font-weight:700; color:#0f172a; }
  @media (max-width: 980px) { .sir-grid { grid-template-columns:1fr 1fr; } .sir-kpi { grid-template-columns:1fr 1fr; } }
  @media (max-width: 640px) { .sir-grid { grid-template-columns:1fr; } .sir-kpi { grid-template-columns:1fr; } }
`;

function money(v: number | null | undefined): string {
  if (v == null) return '-';
  return `₡ ${Number(v).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return '';
  return Number(v).toLocaleString('es-CR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function parseLocaleNumber(value: string): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let n = raw.replace(/\s/g, '');
  const hasComma = n.includes(',');
  const hasDot = n.includes('.');
  if (hasComma && hasDot) {
    if (n.lastIndexOf(',') > n.lastIndexOf('.')) {
      n = n.replace(/\./g, '').replace(',', '.');
    } else {
      n = n.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    n = n.replace(',', '.');
  }
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(v: number | null | undefined): string {
  if (v == null) return '-';
  return `${Number(v).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} %`;
}

function pctSimple(v: number | null | undefined): string {
  if (v == null) return '-';
  return `${Number(v).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%`;
}

function formatMetodo(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw === 'SIN_TRAMOS_PERSONA_FISICA') return 'Sin tramos (persona fisica)';
  if (raw === 'TRAMOS') return 'Calculo por tramos';
  if (raw === 'TASA_PLANA') return 'Tasa plana';
  return raw
    .toLowerCase()
    .split('_')
    .map((w) => (w ? `${w[0].toUpperCase()}${w.slice(1)}` : ''))
    .join(' ');
}

export default function SimuladorImpuestoRenta({ empresaId, canView = true }: SimuladorImpuestoRentaProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [tipo, setTipo] = useState<'persona_fisica' | 'persona_juridica'>('persona_fisica');
  const [regimen, setRegimen] = useState('PERSONA_FISICA_LUCRATIVA');
  const [ingresoBruto, setIngresoBruto] = useState<string>('');
  const [tasaPlana, setTasaPlana] = useState<number>(30);
  const [logicaTope] = useState<'ULTIMO_TRAMO' | 'TASA_PLANA'>('TASA_PLANA');
  const [utilidadCaso, setUtilidadCaso] = useState<string>('');
  const [detalle, setDetalle] = useState<DetallePreview | null>(null);
  const [escalonado, setEscalonado] = useState<EscalonadoPreviewRow[]>([]);

  const syncRegimenByTipo = (nextTipo: 'persona_fisica' | 'persona_juridica') => {
    if (nextTipo === 'persona_fisica') setRegimen('PERSONA_FISICA_LUCRATIVA');
    else setRegimen('PERSONA_JURIDICA_PYME');
  };

  const cargarDetalle = async () => {
    if (!canView || busy) return;
    setBusy(true);
    setError('');
    try {
      const utilidad = parseLocaleNumber(utilidadCaso) ?? 0;
      const ingreso = parseLocaleNumber(ingresoBruto);
      const { data, error: rpcErr } = await supabase.rpc('simular_impuesto_renta_detalle', {
        p_empresa_id: empresaId,
        p_anio: anio,
        p_tipo_contribuyente: tipo,
        p_regimen_codigo: regimen,
        p_ingreso_bruto_anual: ingreso,
        p_utilidad_gravable: utilidad,
        p_juridica_tope_logica: logicaTope,
        p_tasa_plana: tasaPlana,
      });
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setDetalle(row as DetallePreview | null);

      const { data: escData, error: escErr } = await supabase.rpc('simular_impuesto_renta_escalonado', {
        p_empresa_id: empresaId,
        p_anio: anio,
        p_tipo_contribuyente: tipo,
        p_regimen_codigo: regimen,
        p_ingreso_bruto_anual: ingreso,
        p_utilidad_gravable: utilidad,
        p_juridica_tope_logica: logicaTope,
        p_tasa_plana: tasaPlana,
      });
      if (escErr) throw escErr;
      setEscalonado((escData || []) as EscalonadoPreviewRow[]);
    } catch (e: any) {
      setError(String(e?.message || 'No se pudo calcular detalle.'));
      setEscalonado([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="sir-wrap">
        <div className="sir-title">Simulador de Impuesto sobre la Renta</div>
        <div className="sir-sub">Pruebas de escenario sin guardar datos. Usa funciones de simulacion SQL.</div>
        {error ? <div className="sir-msg-err">{error}</div> : null}

        <div className="sir-card">
          <div className="sir-grid">
            <div className="sir-field">
              <label>Año</label>
              <input className="sir-input" type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value || new Date().getFullYear()))} />
            </div>
            <div className="sir-field">
              <label>Tipo contribuyente</label>
              <select
                className="sir-select"
                value={tipo}
                onChange={(e) => {
                  const next = e.target.value === 'persona_juridica' ? 'persona_juridica' : 'persona_fisica';
                  setTipo(next);
                  syncRegimenByTipo(next);
                }}
              >
                <option value="persona_fisica">Persona fisica</option>
                <option value="persona_juridica">Persona juridica</option>
              </select>
            </div>
            <div className="sir-field">
              <label>Régimen</label>
              <select className="sir-select" value={regimen} onChange={(e) => setRegimen(e.target.value)}>
                <option value="PERSONA_FISICA_LUCRATIVA">Persona fisica lucrativa</option>
                <option value="ASALARIADO_JUBILADO">Asalariado/Jubilado</option>
                <option value="PERSONA_JURIDICA_PYME">Persona juridica pyme</option>
              </select>
            </div>
            <div className="sir-field">
              <label>Ingreso bruto anual (jurídica)</label>
              <input
                className="sir-input"
                type="text"
                inputMode="decimal"
                value={ingresoBruto}
                onChange={(e) => setIngresoBruto(e.target.value)}
                onBlur={() => {
                  const n = parseLocaleNumber(ingresoBruto);
                  if (n === null) return;
                  setIngresoBruto(formatNumber(n, 2));
                }}
                placeholder="opcional"
              />
            </div>
            <div className="sir-field">
              <label>Lógica tope jurídica</label>
              <select className="sir-select" value={logicaTope} disabled>
                <option value="TASA_PLANA">Tasa plana (fija)</option>
              </select>
            </div>
            <div className="sir-field">
              <label>Tasa plana (%) jurídica</label>
              <input className="sir-input" type="number" step="0.01" value={tasaPlana} onChange={(e) => setTasaPlana(Number(e.target.value || 0))} />
            </div>
            <div className="sir-field">
              <label>Utilidad para caso puntual</label>
              <input
                className="sir-input"
                type="text"
                inputMode="decimal"
                value={utilidadCaso}
                onChange={(e) => setUtilidadCaso(e.target.value)}
                onBlur={() => {
                  const n = parseLocaleNumber(utilidadCaso);
                  if (n === null) return;
                  setUtilidadCaso(formatNumber(n, 2));
                }}
              />
            </div>
          </div>
          <div className="sir-actions">
            <button className="sir-btn main" type="button" onClick={cargarDetalle} disabled={busy || !canView}>Calcular detalle</button>
            <span className="sir-mini">Empresa: {empresaId} | Valores de prueba, no persiste cambios.</span>
          </div>
        </div>

        {detalle ? (
          <div className="sir-card">
            <div className="sir-kpi">
              <div className="sir-kpi-item"><div className="sir-kpi-label">Metodo de calculo</div><div className="sir-kpi-value">{formatMetodo(detalle.metodo)}</div></div>
              <div className="sir-kpi-item"><div className="sir-kpi-label">Utilidad</div><div className="sir-kpi-value">{money(detalle.utilidad_gravable)}</div></div>
              <div className="sir-kpi-item"><div className="sir-kpi-label">Impuesto</div><div className="sir-kpi-value">{money(detalle.impuesto_calculado)}</div></div>
              <div className="sir-kpi-item"><div className="sir-kpi-label">Tope ingreso</div><div className="sir-kpi-value">{money(detalle.tope_ingreso_bruto)}</div></div>
              <div className="sir-kpi-item"><div className="sir-kpi-label">Tasa aplicada</div><div className="sir-kpi-value">{pct(detalle.tasa_aplicada)}</div></div>
            </div>
            <div className="sir-excel">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Tramos de Renta</th>
                    <th style={{ width: '16%' }} className="num">De</th>
                    <th style={{ width: '16%' }} className="num">Hasta</th>
                    <th style={{ width: '16%' }} className="num">Monto Gravado</th>
                    <th style={{ width: '12%' }} className="num">Impuesto</th>
                    <th style={{ width: '18%' }} className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {escalonado.length === 0 ? (
                    <tr><td colSpan={6} className="sir-empty">Sin desglose de tramos para este escenario.</td></tr>
                  ) : (
                    <>
                      {escalonado.map((r) => (
                        <tr key={`${r.tramo_orden}-${r.tramo_descripcion}`}>
                          <td>{r.tramo_descripcion}</td>
                          <td className="num">{r.desde == null ? '-' : money(r.desde).replace('₡ ', '')}</td>
                          <td className="num">{r.hasta == null ? '-' : money(r.hasta).replace('₡ ', '')}</td>
                          <td className="num">{r.monto_gravado == null ? '-' : money(r.monto_gravado).replace('₡ ', '')}</td>
                          <td className="num">{pctSimple(r.impuesto_pct)}</td>
                          <td className="num">{r.total == null ? '-' : `₡ ${Number(r.total).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td>Totales</td>
                        <td className="num">-</td>
                        <td className="num">-</td>
                        <td className="num">
                          {money(escalonado.reduce((a, b) => a + Number(b.monto_gravado || 0), 0)).replace('₡ ', '')}
                        </td>
                        <td className="num">Monto del Impuesto</td>
                        <td className="num">
                          {money(escalonado.reduce((a, b) => a + Number(b.total || 0), 0))}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
