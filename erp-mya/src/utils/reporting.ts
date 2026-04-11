/** Convierte fecha ISO YYYY-MM-DD (o YYYY-MM-DDTHH:mm...) a DD/MM/AAAA (formato CR) */
export function fmtFecha(value: string | null | undefined): string {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(value);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export interface ReportColumn<T> {
  key: string;
  title: string;
  getValue: (row: T) => string | number | null | undefined;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

const REPORT_COMPANY_NAME_KEY = 'mya_report_company_name';
const MONEY_EPSILON = 0.000001;

export type BoolDisplayMode = 'ui' | 'export';

export function formatBooleanFlag(value: boolean, mode: BoolDisplayMode = 'ui'): string {
  if (mode === 'export') return value ? '✓' : '';
  return value ? '✓' : '·';
}

export function normalizeMoney(value: number): number {
  const n = Number(value || 0);
  return Math.abs(n) < MONEY_EPSILON ? 0 : n;
}

export function roundMoney(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  const n = normalizeMoney(Number(value || 0));
  const rounded = Math.round(n * factor) / factor;
  return normalizeMoney(rounded);
}

export function sumMoney(values: number[], decimals = 2): number {
  const factor = 10 ** decimals;
  const totalUnits = values.reduce((acc, val) => acc + Math.round(normalizeMoney(Number(val || 0)) * factor), 0);
  return normalizeMoney(totalUnits / factor);
}

function escapeCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatMoneyCRC(value: number): string {
  return roundMoney(value, 2).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildCsv<T>(rows: T[], columns: ReportColumn<T>[]): string {
  const header = columns.map((c) => c.title).join(',');
  const body = rows.map((row) =>
    columns
      .map((col) => escapeCsv(String(col.getValue(row) ?? '')))
      .join(',')
  );
  return [header, ...body].join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv<T>(filename: string, rows: T[], columns: ReportColumn<T>[]) {
  const csv = buildCsv(rows, columns);
  downloadTextFile(filename, csv, 'text/csv;charset=utf-8;');
}

export function exportExcelXml<T>(filename: string, rows: T[], columns: ReportColumn<T>[]) {
  const headers = columns.map((c) => `<Cell><Data ss:Type="String">${escapeHtml(c.title)}</Data></Cell>`).join('');
  const rowsXml = rows
    .map((row) => {
      const cells = columns.map((c) => {
        const raw = c.getValue(row);
        const value = raw == null ? '' : String(raw);
        const isNumber = /^-?\d+(\.\d+)?$/.test(value.trim());
        const type = isNumber ? 'Number' : 'String';
        return `<Cell><Data ss:Type="${type}">${escapeHtml(value)}</Data></Cell>`;
      }).join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="Reporte">
    <Table>
      <Row>${headers}</Row>
      ${rowsXml}
    </Table>
  </Worksheet>
</Workbook>`;

  downloadTextFile(filename, xml, 'application/vnd.ms-excel;charset=utf-8;');
}

export function exportPdfWithPrint<T>(params: {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: ReportColumn<T>[];
  summaryLines?: string[];
  orientation?: 'portrait' | 'landscape';
  headerBrand?: string;
  footerText?: string;
  generatedLabel?: string;
}) {
  const {
    title,
    subtitle,
    rows,
    columns,
    summaryLines = [],
    orientation = 'landscape',
    headerBrand,
    footerText = 'Documento generado por ERP MYA',
    generatedLabel = 'Generado',
  } = params;
  const dateNow = new Date().toLocaleString('es-CR');
  let resolvedBrand = (headerBrand || '').trim();
  if (!resolvedBrand) {
    try {
      resolvedBrand = (localStorage.getItem(REPORT_COMPANY_NAME_KEY) || '').trim();
    } catch {
      resolvedBrand = '';
    }
  }
  if (!resolvedBrand) resolvedBrand = 'Sistemas MYA';

  const colgroup = `<colgroup>${columns
    .map((c) => `<col style="width:${c.width || 'auto'}">`)
    .join('')}</colgroup>`;

  const thead = columns
    .map((c) => `<th class="al-${c.align || 'center'}">${escapeHtml(c.title)}</th>`)
    .join('');
  const tbody = rows
    .map((row) => {
      const tds = columns
        .map((col) => `<td class="al-${col.align || 'center'}">${escapeHtml(String(col.getValue(row) ?? ''))}</td>`)
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  const summaryHtml = summaryLines.length
    ? `<div class="summary">${summaryLines.map((s) => `<div>${escapeHtml(s)}</div>`).join('')}</div>`
    : '';

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 ${orientation}; margin: 16mm 12mm 14mm 12mm; }
    html, body { background: #ffffff !important; color: #0f172a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, sans-serif; margin: 0; color: #0f172a; font-size: 11px; }
    .sheet { padding: 18px 16px 10px; }
    .report-head {
      display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
      border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 10px;
    }
    .brand { font-size: 22px; color:#0f172a; letter-spacing: .01em; font-weight: 700; line-height: 1.1; margin-bottom: 2px; }
    h1 { margin: 0 0 4px; font-size: 15px; line-height: 1.2; color:#334155; font-weight: 600; }
    .sub { margin: 0; color: #475569; font-size: 12px; }
    .summary { margin: 0; font-size: 12px; text-align: right; min-width: 220px; }
    .summary div { margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 6px;
      text-align: center;
      vertical-align: middle;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .al-left { text-align:left; }
    .al-center { text-align:center; }
    .al-right { text-align:right; }
    th { background: #f8fafc; font-size: 10px; letter-spacing: .03em; }
    .report-foot {
      margin-top: 10px; padding-top: 6px; border-top:1px solid #e2e8f0;
      display:flex; justify-content:space-between; color:#64748b; font-size:10px;
    }
    .page-no::after { content: "Página 1"; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="report-head">
      <div>
        <div class="brand">${escapeHtml(resolvedBrand)}</div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      ${summaryHtml}
    </div>
    <table>
      ${colgroup}
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody || '<tr><td colspan="99">Sin datos</td></tr>'}</tbody>
    </table>
    <div class="report-foot">
      <span>${escapeHtml(generatedLabel)}: ${escapeHtml(dateNow)}${footerText ? ` | ${escapeHtml(footerText)}` : ''}</span>
      <span class="page-no"></span>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1200,height=780');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onafterprint = () => {
    try { win.close(); } catch { /* noop */ }
  };
  // Fallback for browsers that don't reliably fire onafterprint.
  if (typeof win.matchMedia === 'function') {
    const mediaQueryList = win.matchMedia('print');
    const handler = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        try { win.close(); } catch { /* noop */ }
      }
    };
    try {
      mediaQueryList.addEventListener('change', handler);
    } catch {
      // Safari/legacy fallback
      // @ts-ignore
      mediaQueryList.addListener(handler);
    }
  }
  setTimeout(() => {
    win.focus();
    win.print();
  }, 350);
}
