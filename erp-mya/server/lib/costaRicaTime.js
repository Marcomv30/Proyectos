const COSTA_RICA_TZ = 'America/Costa_Rica'
const COSTA_RICA_OFFSET = '-06:00'

export function fusionDateTimeToUtcIso(date8, time6) {
  if (!date8 || !time6) return null
  const d = String(date8).trim()
  const t = String(time6).trim().padStart(6, '0')
  if (!/^\d{8}$/.test(d) || !/^\d{6}$/.test(t)) return null

  const isoWithOffset =
    `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T` +
    `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}${COSTA_RICA_OFFSET}`

  const dt = new Date(isoWithOffset)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

export function costaRicaDayRangeUtc(fechaYmd) {
  const fecha = String(fechaYmd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null

  const desde = new Date(`${fecha}T00:00:00${COSTA_RICA_OFFSET}`)
  if (Number.isNaN(desde.getTime())) return null

  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000)
  return {
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
  }
}

export function currentCostaRicaDateYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COSTA_RICA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

export { COSTA_RICA_TZ, COSTA_RICA_OFFSET }
