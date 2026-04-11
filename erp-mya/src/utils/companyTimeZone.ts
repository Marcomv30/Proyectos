import { supabase } from '../supabase'

export const DEFAULT_COMPANY_TIME_ZONE = 'America/Costa_Rica'

export function resolveCompanyTimeZone(timeZone?: string | null) {
  const candidate = String(timeZone || '').trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_COMPANY_TIME_ZONE
  try {
    Intl.DateTimeFormat('es-CR', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return DEFAULT_COMPANY_TIME_ZONE
  }
}

export async function fetchEmpresaTimeZone(empresaId: number): Promise<string> {
  try {
    const { data } = await supabase.rpc('get_empresa_parametros', { p_empresa_id: empresaId })
    return resolveCompanyTimeZone(data?.varios?.zona_horaria || null)
  } catch {
    return resolveCompanyTimeZone(null)
  }
}

export function safeCompanyDate(value?: string | null) {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  }
  const dt = new Date(raw)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function formatCompanyDate(value?: string | null, timeZone?: string | null, locale = 'es-CR') {
  if (!value) return '-'
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split('-')
    return `${dd}/${mm}/${yyyy}`
  }
  const dt = safeCompanyDate(raw)
  if (!dt) return raw
  return dt.toLocaleDateString(locale, {
    timeZone: resolveCompanyTimeZone(timeZone),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatCompanyDateTime(value?: string | null, timeZone?: string | null, locale = 'es-CR') {
  const dt = safeCompanyDate(value)
  if (!dt) return '—'
  return dt.toLocaleString(locale, {
    timeZone: resolveCompanyTimeZone(timeZone),
  })
}

export function formatCompanyDateYmd(value?: string | null, timeZone?: string | null) {
  if (!value) {
    return new Date().toLocaleDateString('en-CA', {
      timeZone: resolveCompanyTimeZone(timeZone),
    })
  }
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const dt = safeCompanyDate(raw)
  if (!dt) return raw.slice(0, 10)
  return dt.toLocaleDateString('en-CA', {
    timeZone: resolveCompanyTimeZone(timeZone),
  })
}
