import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, exportExcelXml, exportPdfWithPrint, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';

const MAYOR_GENERAL_PREFILL_KEY = 'mya_mayor_general_prefill';

interface MovimientoMayor {
  fecha: string;
  asiento: string;
  categoria: string;
  cuenta: string;
  nombre: string;
  detalle: string;
  debe: number;
  haber: number;
  naturaleza: string;
  saldo?: number;
}

interface MovimientoMayorRow {
  empresa_id: number;
  asiento_id: number;
  fecha: string;
  asiento: string;
  categoria: string;
  cuenta: string;
  nombre: string;
  detalle: string;
  debe: number;
  haber: number;
  naturaleza: string;
}

interface CuentaConMovimientos {
  codigo: string;
  nombre: string;
  saldo_anterior: number;
  movimientos: MovimientoMayor[];
  total_debe: number;
  total_haber: number;
  saldo_final: number;
}

const styles = `
  .mg-wrap { padding:0; color:#d6e2ff; }
  .mg-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; gap:16px; }
  .mg-title { font-size:20px; font-weight:700; color:#f8fbff; letter-spacing:-0.03em; }
  .mg-export { display:flex; gap:8px; flex-wrap:wrap; }
  .mg-export-btn { padding:8px 13px; border-radius:11px; border:1px solid rgba(137,160,201,0.22); background:#1c2739; color:#d6e2ff; font-size:12px; font-weight:700; cursor:pointer; }
  .mg-export-btn:hover { border-color:#4c7bf7; color:#ffffff; background:#243149; }
  .mg-back-btn { padding:8px 12px; border-radius:10px; border:1px solid rgba(137,160,201,0.18); background:#243149; color:#d6e2ff; font-size:12px; font-weight:700; cursor:pointer; }
  .mg-back-btn:hover { background:#2b3a53; color:#ffffff; }
  .mg-filtros { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px;
    padding:20px 24px; margin-bottom:20px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .mg-filtros-grid { display:grid; grid-template-columns:1fr 1fr 120px 2fr auto; gap:16px; align-items:end; }
  .mg-group { display:flex; flex-direction:column; gap:5px; }
  .mg-label { font-size:11px; font-weight:700; color:#8ea3c7;
    letter-spacing:0.04em; text-transform:uppercase; }
  .mg-input { padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px;
    font-size:13px; color:#f3f7ff; font-family:'DM Sans',sans-serif; background:#1d2738;
    outline:none; transition:border-color 0.2s; width:100%; }
  .mg-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .btn-consultar { padding:10px 24px; background:linear-gradient(135deg,#17a34a,#22c55e);
    border:none; border-radius:10px; color:white; font-size:13px; font-weight:600;
    cursor:pointer; transition:opacity 0.2s; white-space:nowrap; box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .btn-consultar:hover { opacity:0.95; }
  .btn-consultar:disabled { opacity:0.6; cursor:not-allowed; }

  .cuenta-mayor { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px;
    overflow:hidden; margin-bottom:16px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .cuenta-mayor-header { padding:14px 20px; background:#123224;
    border-bottom:1px solid #1d6e4f; display:flex; align-items:center; gap:12px; }
  .cuenta-codigo { font-family:'DM Mono',monospace; font-size:13px; font-weight:700; color:#9df4c7; }
  .cuenta-nombre { font-size:14px; font-weight:700; color:#f3f7ff; }
  .cuenta-saldo-ant { margin-left:auto; font-size:12px; color:#8ea3c7; }
  .cuenta-saldo-ant span { font-family:'DM Mono',monospace; font-weight:700; color:#f3f7ff; margin-left:4px; }

  .mg-table { width:100%; border-collapse:collapse; }
  .mg-table th { padding:9px 14px; text-align:left; font-size:10px; font-weight:600;
    color:#8ea3c7; letter-spacing:0.06em; text-transform:uppercase;
    background:#131b2a; border-bottom:1px solid rgba(137,160,201,0.16); }
  .mg-table th.right { text-align:right; }
  .mg-table td { padding:9px 14px; font-size:12px; color:#d6e2ff; border-bottom:1px solid rgba(137,160,201,0.12); }
  .mg-table tr:last-child td { border-bottom:none; }
  .mg-table tr:hover td { background:#1d2738; }
  .mg-mobile-list { display:none; }
  .mg-mov-card { border:1px solid rgba(137,160,201,0.18); border-radius:12px; padding:10px; margin-bottom:8px; background:#1d2738; }
  .mg-mov-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:6px; }
  .mg-mov-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px; }
  .mg-mov-label { font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; display:block; }
  .mg-fecha { font-family:'DM Mono',monospace; font-size:11px; color:#9bb0d3; }
  .mg-asiento { font-family:'DM Mono',monospace; font-size:11px; font-weight:700; color:#9ec3ff; }
  .mg-cat { font-family:'DM Mono',monospace; font-size:10px; font-weight:600;
    background:#1f2f4c; color:#9ec3ff; padding:2px 6px; border-radius:6px; }
  .mg-debe { text-align:right; font-family:'DM Mono',monospace; font-size:12px; color:#9df4c7; font-weight:700; }
  .mg-haber { text-align:right; font-family:'DM Mono',monospace; font-size:12px; color:#ffb3bb; font-weight:700; }
  .mg-saldo { text-align:right; font-family:'DM Mono',monospace; font-size:12px; font-weight:700; color:#f3f7ff; }
  .mg-saldo.negativo { color:#ff8d94; }

  .mg-totales { background:#123224; border-top:2px solid #1d6e4f; }
  .mg-totales td { padding:10px 14px; font-size:12px; font-weight:700; color:#f3f7ff; }
  .mg-totales .mg-debe { color:#9df4c7; font-size:13px; }
  .mg-totales .mg-haber { color:#ffb3bb; font-size:13px; }
  .mg-totales .mg-saldo { font-size:13px; }

  .sumas-iguales { text-align:center; padding:4px 12px; border-radius:6px;
    font-size:11px; font-weight:600; margin-left:8px; }
  .sumas-ok { background:#0f2c20; color:#9df4c7; }
  .sumas-error { background:#34181c; color:#ffb3bb; }

  .mg-empty { padding:48px; text-align:center; color:#8ea3c7; font-size:13px; }
  .mg-loading { padding:48px; text-align:center; color:#9df4c7; font-size:13px; }
  .mg-stats { display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
  .mg-stat { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px;
    padding:12px 16px; display:flex; flex-direction:column; gap:4px; box-shadow:0 16px 28px rgba(3,8,20,.16); }
  .mg-stat-num { font-size:18px; font-weight:800; font-family:'DM Mono',monospace; color:#f3f7ff; }
  .mg-stat-label { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; }

  .cuenta-search-wrap { position:relative; }
  .cuenta-dropdown { position:absolute; top:100%; left:0; right:0; background:#172131;
    border:1px solid rgba(137,160,201,0.18); border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.28);
    z-index:100; max-height:200px; overflow-y:auto; }
  .cuenta-option { padding:8px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid rgba(137,160,201,0.12); color:#d6e2ff; }
  .cuenta-option:hover { background:#1d2738; }
  .cuenta-option-codigo { font-family:'DM Mono',monospace; color:#9df4c7; font-weight:700; }

  @media (max-width: 980px) {
    .mg-header { flex-wrap:wrap; gap:10px; }
    .mg-export { width:100%; }
    .mg-export-btn { flex:1; text-align:center; }
    .mg-filtros { padding:14px; }
    .mg-filtros-grid { grid-template-columns:1fr 1fr; gap:10px; }
    .btn-consultar { width:100%; }
  }

  @media (max-width: 620px) {
    .mg-title { font-size:18px; }
    .mg-filtros-grid { grid-template-columns:1fr; }
    .mg-stats { gap:8px; }
    .mg-stat { width:100%; }
    .cuenta-mayor-header { flex-direction:column; align-items:flex-start; gap:6px; padding:12px; }
    .cuenta-saldo-ant { margin-left:0; }
    .mg-table { display:none; }
    .mg-mobile-list { display:block; padding:10px 12px 12px; background:#172131; }
  }
`;

const fmt = (n: number) => Math.abs(n).toLocaleString('es-CR', { minimumFractionDigits: 2 });

export default function MayorGeneral({
  empresaId,
  onVolver,
}: {
  empresaId: number;
  onVolver?: (destino?: 'balancecomprobacion' | 'estadoderesultados' | 'balancesituacion') => void;
}) {
  const [fechaInicio, setFechaInicio] = useState(`${new Date().getFullYear()}-01-01`);
  const [fechaFin, setFechaFin] = useState(new Date().toISOString().split('T')[0]);
  const [busquedaCuenta, setBusquedaCuenta] = useState('');
  const [cuentaFiltro, setCuentaFiltro] = useState<any>(null);
  const [monedaReporte, setMonedaReporte] = useState<'CRC' | 'USD'>('CRC');
  const [resultados, setResultados] = useState<CuentaConMovimientos[]>([]);
  const [cargando, setCargando] = useState(false);
  const [consultado, setConsultado] = useState(false);
  const [errorConsulta, setErrorConsulta] = useState('');
  const [cuentasDropdown, setCuentasDropdown] = useState<any[]>([]);
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const [origenVolver, setOrigenVolver] = useState<'balancecomprobacion' | 'estadoderesultados' | 'balancesituacion'>('balancecomprobacion');
  const reqRef = useRef(0);

  const simbolo = monedaReporte === 'USD' ? '$' : '₡';

  const buscarCuentas = async (q: string) => {
    setBusquedaCuenta(q);
    setCuentaFiltro(null);
    if (q.length < 2) {
      setCuentasDropdown([]);
      return;
    }
    const { data } = await supabase
      .from('plan_cuentas_base')
      .select('id, codigo, nombre')
      .eq('acepta_movimiento', true)
      .or(`codigo.ilike.%${q}%,nombre.ilike.%${q}%`)
      .limit(10);
    if (data) {
      setCuentasDropdown(data);
      setDropdownAbierto(true);
    }
  };

  const seleccionarCuenta = (cuenta: any) => {
    setCuentaFiltro(cuenta);
    setBusquedaCuenta(`${cuenta.codigo} - ${cuenta.nombre}`);
    setDropdownAbierto(false);
  };

  const diaAnterior = (fechaIso: string) => {
    const dt = new Date(`${fechaIso}T00:00:00`);
    dt.setDate(dt.getDate() - 1);
    return dt.toISOString().slice(0, 10);
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MAYOR_GENERAL_PREFILL_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        empresaId?: number;
        cuenta?: string;
        nombre?: string;
        desde?: string;
        hasta?: string;
        moneda?: 'CRC' | 'USD';
        origen?: 'balancecomprobacion' | 'estadoderesultados' | 'balancesituacion';
      };
      if (Number(data.empresaId || 0) !== Number(empresaId)) return;

      if (data.desde) setFechaInicio(data.desde);
      if (data.hasta) setFechaFin(data.hasta);
      if (data.moneda === 'USD' || data.moneda === 'CRC') setMonedaReporte(data.moneda);
      if (data.cuenta) {
        const cuenta = { codigo: String(data.cuenta), nombre: String(data.nombre || '') };
        setCuentaFiltro(cuenta);
        setBusquedaCuenta(cuenta.nombre ? `${cuenta.codigo} - ${cuenta.nombre}` : cuenta.codigo);
      }
      if (data.origen === 'estadoderesultados' || data.origen === 'balancecomprobacion' || data.origen === 'balancesituacion') {
        setOrigenVolver(data.origen);
      }
      sessionStorage.removeItem(MAYOR_GENERAL_PREFILL_KEY);
    } catch {
      // ignore prefill errors
    }
  }, [empresaId]);

  const consultar = async () => {
    if (!fechaInicio || !fechaFin) return;
    if (fechaInicio > fechaFin) return;

    const reqId = ++reqRef.current;
    setCargando(true);
    setConsultado(true);
    setErrorConsulta('');

    const cuentaCodigo = cuentaFiltro?.codigo || null;

    const [rangoResp, antResp] = await Promise.all([
      supabase.rpc('get_mayor_general_movimientos', {
        p_empresa_id: empresaId,
        p_fecha_desde: fechaInicio,
        p_fecha_hasta: fechaFin,
        p_cuenta_codigo: cuentaCodigo,
        p_moneda: monedaReporte,
      }),
      supabase.rpc('get_mayor_general_movimientos', {
        p_empresa_id: empresaId,
        p_fecha_desde: null,
        p_fecha_hasta: diaAnterior(fechaInicio),
        p_cuenta_codigo: cuentaCodigo,
        p_moneda: monedaReporte,
      }),
    ]);

    if (reqId !== reqRef.current) return;

    if (rangoResp.error) {
      setResultados([]);
      setErrorConsulta(rangoResp.error.message || 'Error consultando Mayor General');
      setCargando(false);
      return;
    }

    const movimientos = (rangoResp.data || []) as MovimientoMayorRow[];
    const anteriores = (antResp.data || []) as MovimientoMayorRow[];
    if (antResp.error) {
      setErrorConsulta(antResp.error.message || 'Error consultando saldo anterior');
    }

    if (movimientos.length === 0) {
      setResultados([]);
      setCargando(false);
      return;
    }

    const saldoAnteriorPorCuenta = new Map<string, number>();
    for (const mov of anteriores) {
      const actual = saldoAnteriorPorCuenta.get(mov.cuenta) || 0;
      const debe = Number(mov.debe) || 0;
      const haber = Number(mov.haber) || 0;
      const delta = (mov.naturaleza === 'CREDITO') ? (haber - debe) : (debe - haber);
      saldoAnteriorPorCuenta.set(mov.cuenta, actual + delta);
    }

    const cuentasMap = new Map<string, CuentaConMovimientos>();

    for (const mov of movimientos) {
      if (!cuentasMap.has(mov.cuenta)) {
        const saldoAnterior = saldoAnteriorPorCuenta.get(mov.cuenta) || 0;
        cuentasMap.set(mov.cuenta, {
          codigo: mov.cuenta,
          nombre: mov.nombre,
          saldo_anterior: saldoAnterior,
          movimientos: [],
          total_debe: 0,
          total_haber: 0,
          saldo_final: saldoAnterior,
        });
      }

      const cuenta = cuentasMap.get(mov.cuenta)!;
      const debe = Number(mov.debe) || 0;
      const haber = Number(mov.haber) || 0;

      if (mov.naturaleza === 'CREDITO') {
        cuenta.saldo_final += haber - debe;
      } else {
        cuenta.saldo_final += debe - haber;
      }

      cuenta.movimientos.push({
        fecha: mov.fecha,
        asiento: mov.asiento,
        categoria: mov.categoria,
        cuenta: mov.cuenta,
        nombre: mov.nombre,
        detalle: mov.detalle,
        debe,
        haber,
        naturaleza: mov.naturaleza,
        saldo: cuenta.saldo_final,
      });

      cuenta.total_debe += debe;
      cuenta.total_haber += haber;
    }

    setResultados(Array.from(cuentasMap.values()));
    setCargando(false);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      consultar();
    }, 450);
    return () => clearTimeout(t);
  }, [empresaId, fechaInicio, fechaFin, cuentaFiltro?.codigo, monedaReporte]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDebe = resultados.reduce((s, c) => s + c.total_debe, 0);
  const totalHaber = resultados.reduce((s, c) => s + c.total_haber, 0);
  const sumasIguales = Math.abs(totalDebe - totalHaber) < 0.01;

  const exportRows = resultados.flatMap((cuenta) =>
    cuenta.movimientos.map((mov) => ({
      cuenta_codigo: cuenta.codigo,
      cuenta_nombre: cuenta.nombre,
      fecha: mov.fecha,
      asiento: mov.asiento,
      categoria: mov.categoria,
      detalle: mov.detalle,
      debe: mov.debe,
      haber: mov.haber,
      saldo: mov.saldo || 0,
    }))
  );

  const exportColumns: ReportColumn<(typeof exportRows)[number]>[] = [
    { key: 'cuenta_codigo', title: 'Cuenta', getValue: (r) => r.cuenta_codigo, align: 'left', width: '9%' },
    { key: 'cuenta_nombre', title: 'Nombre Cuenta', getValue: (r) => r.cuenta_nombre, align: 'left', width: '18%' },
    { key: 'fecha', title: 'Fecha', getValue: (r) => r.fecha, width: '9%' },
    { key: 'asiento', title: 'Asiento', getValue: (r) => r.asiento, width: '10%' },
    { key: 'categoria', title: 'Tipo', getValue: (r) => r.categoria, width: '7%' },
    { key: 'detalle', title: 'Detalle', getValue: (r) => r.detalle, align: 'left', width: '23%' },
    { key: 'debe', title: `Debe ${monedaReporte}`, getValue: (r) => Number(r.debe || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), align: 'right', width: '8%' },
    { key: 'haber', title: `Haber ${monedaReporte}`, getValue: (r) => Number(r.haber || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), align: 'right', width: '8%' },
    { key: 'saldo', title: `Saldo ${monedaReporte}`, getValue: (r) => Number(r.saldo || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), align: 'right', width: '8%' },
  ];

  return (
    <>
      <style>{styles}</style>
      <div className="mg-wrap">
        <div className="mg-header">
          <div className="mg-title">Mayor General</div>
          <ListToolbar
            className="mg-export"
            exports={(
              <>
                <button className="mg-back-btn" onClick={() => onVolver?.(origenVolver)} title="Volver">Volver</button>
                <button className="mg-export-btn" onClick={() => exportCsv('mayor_general.csv', exportRows, exportColumns)} disabled={exportRows.length === 0}>CSV</button>
                <button className="mg-export-btn" onClick={() => exportExcelXml('mayor_general.xls', exportRows, exportColumns)} disabled={exportRows.length === 0}>EXCEL</button>
                <button
                  className="mg-export-btn"
                  onClick={() =>
                    exportPdfWithPrint({
                      title: 'Mayor General',
                      subtitle: `Desde ${fechaInicio} Hasta ${fechaFin} - ${monedaReporte}`,
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
        </div>

        <div className="mg-filtros">
          <div className="mg-filtros-grid">
            <div className="mg-group">
              <label className="mg-label">Fecha Inicio</label>
              <input className="mg-input" type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
            </div>
            <div className="mg-group">
              <label className="mg-label">Fecha Fin</label>
              <input className="mg-input" type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
            </div>
            <div className="mg-group">
              <label className="mg-label">Moneda</label>
              <select className="mg-input" value={monedaReporte} onChange={(e) => setMonedaReporte(e.target.value as 'CRC' | 'USD')}>
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="mg-group">
              <label className="mg-label">Cuenta (opcional)</label>
              <div className="cuenta-search-wrap">
                <input
                  className="mg-input"
                  value={busquedaCuenta}
                  onChange={e => buscarCuentas(e.target.value)}
                  onFocus={() => cuentasDropdown.length > 0 && setDropdownAbierto(true)}
                  placeholder="Buscar por codigo o nombre... (vacio = todas)"
                />
                {dropdownAbierto && cuentasDropdown.length > 0 && (
                  <div className="cuenta-dropdown">
                    <div
                      className="cuenta-option"
                      style={{ color: '#9ca3af', fontStyle: 'italic' }}
                      onClick={() => {
                        setCuentaFiltro(null);
                        setBusquedaCuenta('');
                        setDropdownAbierto(false);
                      }}
                    >
                      Todas las cuentas
                    </div>
                    {cuentasDropdown.map(c => (
                      <div key={c.id} className="cuenta-option" onClick={() => seleccionarCuenta(c)}>
                        <span className="cuenta-option-codigo">{c.codigo}</span>
                        <span style={{ marginLeft: '8px', color: '#374151' }}>{c.nombre}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button className="btn-consultar" onClick={consultar} disabled={cargando} title="Actualizar manual">
              {cargando ? 'Consultando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {cargando && <div className="mg-loading">Consultando movimientos...</div>}

        {!cargando && !!errorConsulta && (
          <div className="mg-empty" style={{ color: '#ffb3bb', background: '#34181c', border: '1px solid #7d2f3a', borderRadius: '12px' }}>
            Error en consulta: {errorConsulta}
          </div>
        )}

        {!cargando && consultado && resultados.length === 0 && (
          <div className="mg-empty">No hay movimientos en el rango de fechas seleccionado</div>
        )}

        {!cargando && resultados.length > 0 && (
          <>
            <div className="mg-stats">
              <div className="mg-stat">
                <span className="mg-stat-num">{resultados.length}</span>
                <span className="mg-stat-label">Cuentas con movimientos</span>
              </div>
              <div className="mg-stat">
                <span className="mg-stat-num" style={{ color: '#16a34a' }}>{simbolo} {fmt(totalDebe)}</span>
                <span className="mg-stat-label">Total Debitos</span>
              </div>
              <div className="mg-stat">
                <span className="mg-stat-num" style={{ color: '#dc2626' }}>{simbolo} {fmt(totalHaber)}</span>
                <span className="mg-stat-label">Total Creditos</span>
              </div>
              <div className="mg-stat">
                <span className={`sumas-iguales ${sumasIguales ? 'sumas-ok' : 'sumas-error'}`} style={{ fontSize: '14px', padding: '8px 16px' }}>
                  {sumasIguales ? 'OK Sumas Iguales' : `Diferencia: ${simbolo} ${fmt(Math.abs(totalDebe - totalHaber))}`}
                </span>
              </div>
            </div>

            {resultados.map(cuenta => (
              <div key={cuenta.codigo} className="cuenta-mayor">
                <div className="cuenta-mayor-header">
                  <span className="cuenta-codigo">{cuenta.codigo}</span>
                  <span className="cuenta-nombre">{cuenta.nombre}</span>
                  <span className="cuenta-saldo-ant">
                    Saldo Anterior:
                    <span className={cuenta.saldo_anterior < 0 ? 'negativo' : ''}>
                      {cuenta.saldo_anterior < 0 ? ' -' : ' '}{simbolo} {fmt(cuenta.saldo_anterior)}
                    </span>
                  </span>
                </div>
                <table className="mg-table rv-desktop-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Asiento</th>
                      <th>Tipo</th>
                      <th>Moneda</th>
                      <th>Detalle</th>
                      <th className="right">Debe</th>
                      <th className="right">Haber</th>
                      <th className="right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuenta.saldo_anterior !== 0 && (
                      <tr style={{ background: '#3a302d' }}>
                        <td className="mg-fecha">-</td>
                        <td><span style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#d97706' }}>SALDO ANT.</span></td>
                        <td></td>
                        <td>{monedaReporte}</td>
                        <td style={{ color: '#d97706', fontSize: '11px' }}>Saldo anterior al periodo</td>
                        <td></td>
                        <td></td>
                        <td className={`mg-saldo ${cuenta.saldo_anterior < 0 ? 'negativo' : ''}`}>
                          {cuenta.saldo_anterior < 0 ? '-' : ''}{simbolo} {fmt(cuenta.saldo_anterior)}
                        </td>
                      </tr>
                    )}
                    {cuenta.movimientos.map((mov, idx) => (
                      <tr key={idx}>
                        <td className="mg-fecha">{mov.fecha}</td>
                        <td className="mg-asiento">{mov.asiento}</td>
                        <td><span className="mg-cat">{mov.categoria}</span></td>
                        <td>{monedaReporte}</td>
                        <td style={{ maxWidth: '300px', fontSize: '12px' }}>{mov.detalle}</td>
                        <td className="mg-debe">{mov.debe > 0 ? `${simbolo} ${fmt(mov.debe)}` : ''}</td>
                        <td className="mg-haber">{mov.haber > 0 ? `${simbolo} ${fmt(mov.haber)}` : ''}</td>
                        <td className={`mg-saldo ${(mov.saldo || 0) < 0 ? 'negativo' : ''}`}>
                          {(mov.saldo || 0) < 0 ? '-' : ''}{simbolo} {fmt(mov.saldo || 0)}
                        </td>
                      </tr>
                    ))}
                    <tr className="mg-totales">
                      <td colSpan={5} style={{ textAlign: 'right', color: '#6b7280' }}>TOTALES ({monedaReporte})</td>
                      <td className="mg-debe">{simbolo} {fmt(cuenta.total_debe)}</td>
                      <td className="mg-haber">{simbolo} {fmt(cuenta.total_haber)}</td>
                      <td className={`mg-saldo ${cuenta.saldo_final < 0 ? 'negativo' : ''}`}>
                        {cuenta.saldo_final < 0 ? '-' : ''}{simbolo} {fmt(cuenta.saldo_final)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="mg-mobile-list rv-mobile-cards">
                  {cuenta.saldo_anterior !== 0 && (
                    <div className="mg-mov-card" style={{ background: '#3a302d' }}>
                      <div className="mg-mov-head">
                        <span className="mg-asiento">SALDO ANT.</span>
                        <span className={`mg-saldo ${cuenta.saldo_anterior < 0 ? 'negativo' : ''}`}>
                          {cuenta.saldo_anterior < 0 ? '-' : ''}{simbolo} {fmt(cuenta.saldo_anterior)}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#d97706' }}>Saldo anterior al periodo</div>
                    </div>
                  )}

                  {cuenta.movimientos.map((mov, idx) => (
                    <div key={`m-${idx}`} className="mg-mov-card">
                      <div className="mg-mov-head">
                        <span className="mg-fecha">{mov.fecha}</span>
                        <span className="mg-asiento">{mov.asiento}</span>
                      </div>
                      <div><span className="mg-cat">{mov.categoria}</span></div>
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#8ea3c7' }}>Moneda: {monedaReporte}</div>
                      <div style={{ marginTop: '6px', fontSize: '12px', color: '#374151' }}>{mov.detalle || '-'}</div>
                      <div className="mg-mov-grid">
                        <div>
                          <span className="mg-mov-label">Debe</span>
                          <span className="mg-debe">{mov.debe > 0 ? `${simbolo} ${fmt(mov.debe)}` : '-'}</span>
                        </div>
                        <div>
                          <span className="mg-mov-label">Haber</span>
                          <span className="mg-haber">{mov.haber > 0 ? `${simbolo} ${fmt(mov.haber)}` : '-'}</span>
                        </div>
                      </div>
                      <div style={{ marginTop: '6px' }}>
                        <span className="mg-mov-label">Saldo</span>
                        <span className={`mg-saldo ${(mov.saldo || 0) < 0 ? 'negativo' : ''}`}>
                          {(mov.saldo || 0) < 0 ? '-' : ''}{simbolo} {fmt(mov.saldo || 0)}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="mg-mov-card mg-totales">
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Totales</div>
                    <div className="mg-mov-grid">
                      <div>
                        <span className="mg-mov-label">Debe</span>
                        <span className="mg-debe">{simbolo} {fmt(cuenta.total_debe)}</span>
                      </div>
                      <div>
                        <span className="mg-mov-label">Haber</span>
                        <span className="mg-haber">{simbolo} {fmt(cuenta.total_haber)}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      <span className="mg-mov-label">Saldo Final</span>
                      <span className={`mg-saldo ${cuenta.saldo_final < 0 ? 'negativo' : ''}`}>
                        {cuenta.saldo_final < 0 ? '-' : ''}{simbolo} {fmt(cuenta.saldo_final)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
