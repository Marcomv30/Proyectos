const MONEY_EPSILON = 0.000001;

export function normalizeMoney(value: number): number {
  const n = Number(value || 0);
  return Math.abs(n) < MONEY_EPSILON ? 0 : n;
}

export function roundMoney(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  const n = normalizeMoney(Number(value || 0));
  return normalizeMoney(Math.round(n * factor) / factor);
}

export function sumMoney(values: number[], decimals = 2): number {
  const factor = 10 ** decimals;
  const totalUnits = values.reduce(
    (acc, val) => acc + Math.round(normalizeMoney(Number(val || 0)) * factor), 0
  );
  return normalizeMoney(totalUnits / factor);
}

export function formatMoneyCRC(value: number): string {
  return roundMoney(value, 2).toLocaleString('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Fecha ISO → DD/MM/AAAA */
export function fmtFecha(value: string | null | undefined): string {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(value);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Número entero con separador de miles */
export function fmtCantidad(value: number): string {
  return Math.round(value).toLocaleString('es-CR');
}
