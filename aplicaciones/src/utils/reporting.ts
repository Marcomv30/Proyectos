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

export function formatMoneyCRC(value: number): string {
  return roundMoney(value, 2).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
