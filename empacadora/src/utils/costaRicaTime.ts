const COSTA_RICA_TZ = 'America/Costa_Rica';

export function getCostaRicaDateISO(baseDate: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COSTA_RICA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(baseDate);
  const year = parts.find((p) => p.type === 'year')?.value || '0000';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

export function getCostaRicaTimeHM(baseDate: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COSTA_RICA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(baseDate);
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

export function getCostaRicaDateTimeDisplay(locale = 'es-CR', baseDate: Date = new Date()) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: COSTA_RICA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(baseDate);
}

export function getCostaRicaYear(baseDate: Date = new Date()) {
  return Number(getCostaRicaDateISO(baseDate).slice(0, 4));
}

export function parseIsoDateAtNoonUTC(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return new Date(NaN);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function getISOWeekInfoCostaRica(dateStr: string) {
  const d = parseIsoDateAtNoonUTC(dateStr);
  const day = d.getUTCDay() || 7;
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day));
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  const yy = String(thu.getUTCFullYear()).slice(-2);
  return { week, year: thu.getUTCFullYear(), codigo: `${week}-${yy}` };
}
