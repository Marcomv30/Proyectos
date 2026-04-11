import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { exportCsv, exportExcelXml, exportPdfWithPrint, ReportColumn } from '../../utils/reporting';
import ListToolbar from '../../components/ListToolbar';

interface TipoAsiento {
  id: number;
  codigo: string;
  nombre: string;
}

interface RowDetalle {
  asiento_id: number;
  numero_formato: string;
  fecha: string;
  estado: string;
  tipo_id: number;
  tipo_codigo: string;
  tipo_nombre: string;
  categoria_id: number;
  categoria_codigo: string;
  categoria_descripcion: string;
  descripcion: string;
  total_debito_crc: number;
  total_credito_crc: number;
  total_debito_usd: number;
  total_credito_usd: number;
}

const styles = `
  .rat-wrap { padding:0; color:#d6e2ff; }
  .rat-title { font-size:20px; font-weight:700; color:#f8fbff; margin-bottom:14px; }
  .rat-grid { display:grid; grid-template-columns:180px 170px 170px 110px 140px auto 1fr; gap:10px; margin-bottom:14px; }
  .rat-input { width:100%; padding:10px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; outline:none; background:#1d2738; color:#f3f7ff; }
  .rat-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .rat-btn { padding:10px 14px; border-radius:10px; border:none; font-size:13px; font-weight:700; cursor:pointer; }
  .rat-btn.primary { color:#fff; background:linear-gradient(135deg,#17a34a,#22c55e); box-shadow:0 14px 24px rgba(34,197,94,.18); }
  .rat-btn.neutral { color:#d6e2ff; background:#243149; border:1px solid rgba(137,160,201,0.18); }
  .rat-toolbar { margin-bottom:10px; }
  .rat-search { margin-bottom:10px; }
  .rat-cards { display:grid; grid-template-columns:repeat(4,minmax(160px,1fr)); gap:10px; margin-bottom:14px; }
  .rat-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px 14px; box-shadow:0 16px 28px rgba(3,8,20,.16); }
  .rat-card-num { font-size:20px; font-weight:700; color:#f3f7ff; }
  .rat-card-label { font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.04em; }
  .rat-table-wrap { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:16px; overflow:hidden; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .rat-table { width:100%; border-collapse:collapse; table-layout:fixed; }
  .rat-table th { background:#131b2a; padding:9px 10px; font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; text-align:center; border-bottom:1px solid rgba(137,160,201,0.16); }
  .rat-table td { padding:8px 10px; font-size:12px; color:#d6e2ff; border-bottom:1px solid rgba(137,160,201,0.12); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:center; }
  .rat-table tr:last-child td { border-bottom:none; }
  .rat-money-head { text-align:right !important; }
  .rat-money { font-family:'DM Mono',monospace; }
  .rat-desc-head { text-align:left !important; }
  .rat-desc { text-align:left !important; }
  .rat-mobile-list { display:none; }
  .rat-row-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:14px; padding:12px; margin-bottom:8px; }
  .rat-row-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .rat-row-num { font-family:'DM Mono',monospace; color:#f3f7ff; font-size:12px; font-weight:600; }
  .rat-row-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
  .rat-row-label { font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.05em; display:block; }
  .rat-chip { display:inline-flex; align-items:center; padding:3px 8px; border-radius:999px; background:#1f2f4c; color:#9ec3ff; font-size:11px; font-weight:600; font-family:'DM Mono',monospace; }
  .rat-empty { text-align:center; color:#8ea3c7; padding:24px; }

  @media (max-width: 980px) {
    .rat-grid { grid-template-columns:1fr 1fr; gap:8px; }
    .rat-cards { grid-template-columns:repeat(2,minmax(140px,1fr)); }
    .rat-toolbar { justify-content:flex-start !important; }
    .rat-table-wrap { overflow-x:auto; }
    .rat-table { min-width:880px; }
  }

  @media (max-width: 620px) {
    .rat-title { font-size:18px; }
    .rat-grid { grid-template-columns:1fr; }
    .rat-cards { grid-template-columns:1fr; }
    .rat-card-num { font-size:18px; }
    .rat-toolbar { gap:6px; }
    .rat-table-wrap { display:none; }
    .rat-mobile-list { display:block; }
  }
`;

function toMoney(n: number, moneda: 'CRC' | 'USD') {
  const simbolo = moneda === 'USD' ? '$' : '₡';
  return `${simbolo} ${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReporteAsientosTipo({ empresaId }: { empresaId: number }) {
  const today = new Date();
  const startYear = `${today.getFullYear()}-01-01`;
  const endYear = `${today.getFullYear()}-12-31`;

  const [tipos, setTipos] = useState<TipoAsiento[]>([]);
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [rows, setRows] = useState<RowDetalle[]>([]);
  const [tipoId, setTipoId] = useState<number | ''>('');
  const [desde, setDesde] = useState(startYear);
  const [hasta, setHasta] = useState(endYear);
  const [monedaReporte, setMonedaReporte] = useState<'CRC' | 'USD'>('CRC');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const reqRef = useRef(0);

  const cargarTipos = async () => {
    const { data } = await supabase
      .from('asiento_tipos')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('orden')
      .order('codigo');
    setTipos((data || []) as TipoAsiento[]);
  };

  const cargarEmpresa = async () => {
    const { data } = await supabase
      .from('empresas')
      .select('nombre')
      .eq('id', empresaId)
      .single();
    setEmpresaNombre((data as any)?.nombre || '');
  };

  const cargar = async () => {
    if (desde && hasta && desde > hasta) {
      setError('Rango de fechas invalido: "Desde" no puede ser mayor que "Hasta".');
      setRows([]);
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('reporte_asientos_por_tipo_detalle', {
      p_empresa_id: empresaId,
      p_fecha_desde: desde || null,
      p_fecha_hasta: hasta || null,
      p_tipo_id: tipoId === '' ? null : Number(tipoId),
    });
    if (reqId !== reqRef.current) return;
    if (rpcError) {
      setError(rpcError.message || 'No se pudo cargar el reporte');
      setRows([]);
    } else {
      setRows((data || []) as RowDetalle[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    cargarTipos();
    cargarEmpresa();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => {
      cargar();
    }, 350);
    return () => clearTimeout(t);
  }, [empresaId, tipoId, desde, hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowsFiltradas = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      (r.numero_formato || '').toLowerCase().includes(term) ||
      (r.tipo_codigo || '').toLowerCase().includes(term) ||
      (r.tipo_nombre || '').toLowerCase().includes(term) ||
      (r.categoria_codigo || '').toLowerCase().includes(term) ||
      (r.categoria_descripcion || '').toLowerCase().includes(term) ||
      (r.descripcion || '').toLowerCase().includes(term) ||
      (r.fecha || '').toLowerCase().includes(term)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const asientos = new Set(rowsFiltradas.map((r) => r.asiento_id)).size;
    const deb = rowsFiltradas.reduce((acc, r) => acc + Number(monedaReporte === 'USD' ? r.total_debito_usd : r.total_debito_crc || 0), 0);
    const cre = rowsFiltradas.reduce((acc, r) => acc + Number(monedaReporte === 'USD' ? r.total_credito_usd : r.total_credito_crc || 0), 0);
    return { asientos, deb, cre };
  }, [rowsFiltradas, monedaReporte]);

  const columns: ReportColumn<RowDetalle>[] = [
    { key: 'fecha', title: 'Fecha', getValue: (r) => r.fecha },
    { key: 'numero_formato', title: 'Asiento', getValue: (r) => r.numero_formato },
    { key: 'tipo_codigo', title: 'Tipo', getValue: (r) => r.tipo_codigo },
    { key: 'tipo_nombre', title: 'Tipo Nombre', getValue: (r) => r.tipo_nombre },
    { key: 'categoria_codigo', title: 'Categoria', getValue: (r) => r.categoria_codigo },
    { key: 'categoria_descripcion', title: 'Categoria Desc', getValue: (r) => r.categoria_descripcion || '' },
    { key: 'descripcion', title: 'Descripcion', getValue: (r) => r.descripcion || '' },
    { key: 'moneda_reporte', title: 'Moneda', getValue: () => monedaReporte },
    {
      key: 'debito_reporte',
      title: 'Debito',
      getValue: (r) => toMoney(monedaReporte === 'USD' ? r.total_debito_usd : r.total_debito_crc || 0, monedaReporte),
    },
    {
      key: 'credito_reporte',
      title: 'Credito',
      getValue: (r) => toMoney(monedaReporte === 'USD' ? r.total_credito_usd : r.total_credito_crc || 0, monedaReporte),
    },
  ];

  const onExportCsv = () => {
    exportCsv(`reporte_asientos_tipo_${empresaId}.csv`, rowsFiltradas, columns);
  };

  const onExportExcel = () => {
    exportExcelXml(`reporte_asientos_tipo_${empresaId}.xls`, rowsFiltradas, columns);
  };

  const onExportPdf = () => {
    exportPdfWithPrint({
      title: 'Reporte de Asientos por Tipo',
      subtitle: `Desde ${desde} Hasta ${hasta}`,
      rows: rowsFiltradas,
      columns,
      orientation,
      headerBrand: empresaNombre || undefined,
      footerText: '',
      generatedLabel: 'Generado',
      summaryLines: [
        `Asientos: ${totals.asientos}`,
        `Registros: ${rowsFiltradas.length}`,
        `Debito ${monedaReporte}: ${toMoney(totals.deb, monedaReporte)}`,
        `Credito ${monedaReporte}: ${toMoney(totals.cre, monedaReporte)}`,
      ],
    });
  };

  return (
    <>
      <style>{styles}</style>
      <div className="rat-wrap">
        <div className="rat-title">Reporte de Asientos por Tipo</div>

        <div className="rat-grid">
          <select className="rat-input" value={tipoId} onChange={(e) => setTipoId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos los tipos</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.codigo} - {t.nombre}</option>)}
          </select>
          <input className="rat-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <input className="rat-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <select className="rat-input" value={monedaReporte} onChange={(e) => setMonedaReporte(e.target.value as 'CRC' | 'USD')}>
            <option value="CRC">CRC</option>
            <option value="USD">USD</option>
          </select>
          <select className="rat-input" value={orientation} onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}>
            <option value="landscape">Horizontal</option>
            <option value="portrait">Vertical</option>
          </select>
          <button className="rat-btn primary" onClick={cargar} disabled={loading} title="Actualizar manual">
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
          <div />
        </div>
        <ListToolbar
          className="rat-toolbar"
          exports={(
            <>
              <button className="rat-btn neutral" onClick={onExportCsv} disabled={rowsFiltradas.length === 0}>
                CSV
              </button>
              <button className="rat-btn neutral" onClick={onExportExcel} disabled={rowsFiltradas.length === 0}>
                EXCEL
              </button>
              <button className="rat-btn neutral" onClick={onExportPdf} disabled={rowsFiltradas.length === 0}>
                PDF
              </button>
            </>
          )}
        />
        <div className="rat-search">
          <input
            className="rat-input"
            placeholder="Buscar asiento, tipo, categoria o descripcion..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && (
          <div style={{ marginBottom: 10, background: '#34181c', border: '1px solid #7d2f3a', color: '#ffb3bb', borderRadius: 12, padding: '10px 12px', fontSize: 12 }}>
            {error}
          </div>
        )}

        <div className="rat-cards">
          <div className="rat-card">
            <div className="rat-card-num">{totals.asientos}</div>
            <div className="rat-card-label">Asientos</div>
          </div>
          <div className="rat-card">
            <div className="rat-card-num">{rowsFiltradas.length}</div>
            <div className="rat-card-label">Registros</div>
          </div>
          <div className="rat-card">
            <div className="rat-card-num">{toMoney(totals.deb, monedaReporte)}</div>
            <div className="rat-card-label">Debito</div>
          </div>
          <div className="rat-card">
            <div className="rat-card-num">{toMoney(totals.cre, monedaReporte)}</div>
            <div className="rat-card-label">Credito</div>
          </div>
        </div>

        <div className="rat-table-wrap">
          <table className="rat-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Asiento</th>
                <th>Tipo</th>
                <th>Categoria</th>
                <th className="rat-desc-head">Descripcion</th>
                <th>Moneda</th>
                <th className="rat-money-head">Debito</th>
                <th className="rat-money-head">Credito</th>
              </tr>
            </thead>
            <tbody>
              {rowsFiltradas.length === 0 ? (
                <tr><td colSpan={8} className="rat-empty">Sin datos para los filtros seleccionados</td></tr>
              ) : rowsFiltradas.map((r) => (
                <tr key={r.asiento_id}>
                  <td>{r.fecha}</td>
                  <td style={{ fontFamily: 'DM Mono, monospace' }}>{r.numero_formato}</td>
                  <td><span className="rat-chip">{r.tipo_codigo}</span></td>
                  <td><span className="rat-chip">{r.categoria_codigo}</span></td>
                  <td className="rat-desc" title={r.descripcion}>{r.descripcion}</td>
                  <td>{monedaReporte}</td>
                  <td className="rat-money money-right">{toMoney(monedaReporte === 'USD' ? r.total_debito_usd : r.total_debito_crc, monedaReporte)}</td>
                  <td className="rat-money money-right">{toMoney(monedaReporte === 'USD' ? r.total_credito_usd : r.total_credito_crc, monedaReporte)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rat-mobile-list">
          {rowsFiltradas.length === 0 ? (
            <div className="rat-empty">Sin datos para los filtros seleccionados</div>
          ) : rowsFiltradas.map((r) => (
            <div key={`m-${r.asiento_id}`} className="rat-row-card">
              <div className="rat-row-head">
                <span className="rat-row-num">{r.numero_formato}</span>
                <span className="rat-row-num">{r.fecha}</span>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <span className="rat-chip">{r.tipo_codigo}</span>
                <span className="rat-chip" style={{ marginLeft: '6px' }}>{r.categoria_codigo}</span>
              </div>
              <div className="rat-row-grid">
                <div>
                  <span className="rat-row-label">Moneda</span>
                  <span className="rat-row-num">{monedaReporte}</span>
                </div>
                <div>
                  <span className="rat-row-label">Debito</span>
                  <span className="rat-row-num">{toMoney(monedaReporte === 'USD' ? r.total_debito_usd : r.total_debito_crc, monedaReporte)}</span>
                </div>
              </div>
              <div className="rat-row-grid">
                <div>
                  <span className="rat-row-label">Credito</span>
                  <span className="rat-row-num">{toMoney(monedaReporte === 'USD' ? r.total_credito_usd : r.total_credito_crc, monedaReporte)}</span>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#8ea3c7' }}>
                {r.descripcion || '-'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
