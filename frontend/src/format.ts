import type { Profile, WidgetView } from './api'

/** The profile as seen by one widget: its own currency choice (if still in the pair) replaces the default. */
export function widgetProfile(p: Profile, w: Pick<WidgetView, 'display_currency'>): Profile {
  const own = w.display_currency
  return own && (own === p.currency_a || own === p.currency_b) ? { ...p, display_currency: own } : p
}

/** Rate from the daily fetched rates (1 `from` = result `to`), or null if either currency is missing. */
export function fxRate(from: string, to: string, p: Pick<Profile, 'fx_rates'>): number | null {
  const r = p.fx_rates
  return r && r[from] && r[to] ? r[to] / r[from] : null
}

/**
 * Convert `amount`. Within the profile's pair the pair rate wins (it may be set by hand); anything else goes
 * through the fetched rates. Returns null when no rate is known.
 */
export function convert(amount: number, from: string, to: string, p: Profile): number | null {
  if (from === to) return amount
  const rate = Number(p.rate_a_to_b)
  if (from === p.currency_a && to === p.currency_b) return amount * rate
  if (from === p.currency_b && to === p.currency_a) return amount / rate
  const fx = fxRate(from, to, p)
  return fx === null ? null : amount * fx
}

/** Amount shown in the display currency when convertible, else in its own currency. */
export function displayMoney(
  value: string | number | null | undefined,
  currency: string | null | undefined,
  p: Profile,
  digits = 2,
): { text: string; currency: string; converted: boolean } {
  if (value === null || value === undefined || !currency) return { text: '—', currency: currency ?? '', converted: false }
  const n = Number(value)
  const c = convert(n, currency, p.display_currency, p)
  const [amount, cur] = c === null ? [n, currency] : [c, p.display_currency]
  return { text: money(amount, cur, digits), currency: cur, converted: c !== null && currency !== p.display_currency }
}

export function money(amount: number, currency: string, digits = 2): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount)
  } catch {
    return `${amount.toFixed(digits)} ${currency}`
  }
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** Wireframe format: 05/OCT/26 05:10:23.544 AM (local time). */
export function stamp(iso: string | null | undefined, p: Profile): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = `${pad(d.getDate())}/${MONTHS[d.getMonth()]}/${pad(d.getFullYear() % 100)}`
  const ms = pad(d.getMilliseconds(), 3)
  if (p.time_format === '24h') return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`
  const h = d.getHours() % 12 || 12
  return `${date} ${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

export function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return `${pad(d)} ${MONTHS[m - 1].charAt(0)}${MONTHS[m - 1].slice(1).toLowerCase()}${y !== new Date().getFullYear() ? ` ${y}` : ''}`
}

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function duration(seconds: number): string {
  if (seconds < 120) return `${seconds}s`
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`
  return `${Math.round(seconds / 3600)} h`
}

export const ALERT_LABEL: Record<string, string> = {
  key_expired: 'Key expired',
  auth: 'Key rejected',
  unreachable: 'API unreachable',
  error: 'Sync failed',
  no_key: 'No sync key',
  key_expiring: 'Key expiring soon',
}
