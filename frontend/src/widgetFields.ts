// Metadata every flavour can show (keys = COMMON_FIELDS in backend/app/flavours/base.py).
// Flavour-specific keys live in src/flavours/<key>.tsx.
import type { Profile, WidgetView } from './api'
import { compact, displayMoney, duration, stamp } from './format'

export interface FieldDef {
  label: string
  /** Value as shown in the tooltip (label: value). */
  render: (w: WidgetView, p: Profile) => string
  /** Line as shown on the collapsed tile; default `label: value`. */
  tile?: (w: WidgetView, p: Profile) => string
}

const CATEGORY_LABEL: Record<string, string> = {
  ai_api: 'AI API', cloud: 'Cloud', streaming: 'Streaming', emi: 'EMI', loan: 'Loan', other: 'Other',
}

export const COMMON_FIELDS: Record<string, FieldDef> = {
  currency: { label: 'Currency code', render: (w, p) => displayMoney(w.balance ?? w.spend, w.currency, p).currency },
  last_used: {
    label: 'Last used',
    render: (w, p) => stamp(w.last_used_at, p),
    tile: (w, p) =>
      w.state === 'exhausted' && w.exhausted_at
        ? `Last exhausted: ${stamp(w.exhausted_at, p)}`
        : `Last used: ${stamp(w.last_used_at, p)}`,
  },
  last_checked: { label: 'Last checked', render: (w, p) => stamp(w.last_checked_at, p), tile: (w, p) => `Checked: ${stamp(w.last_checked_at, p)}` },
  spent_today: { label: 'Spent today', render: (w, p) => displayMoney(w.metrics.spent_today, w.currency, p).text },
  avg_daily_burn: { label: 'Avg daily burn (7d)', render: (w, p) => displayMoney(w.metrics.avg_daily_burn, w.currency, p).text },
  days_left: {
    label: 'Days left at this rate',
    render: (w) => (w.metrics.days_left === null ? '—' : `${w.metrics.days_left}`),
    tile: (w) => (w.metrics.days_left === null ? 'Days left: —' : `~${w.metrics.days_left} days left`),
  },
  tokens_today: { label: 'Tokens today', render: (w) => compact(w.metrics.tokens_today) },
  tokens_30d: { label: 'Tokens (30 days)', render: (w) => compact(w.metrics.tokens_30d) },
  balance_native: {
    label: 'Balance (original currency)',
    render: (w) => (w.balance === null ? '—' : `${Number(w.balance).toFixed(2)} ${w.currency}`),
  },
  spend: { label: 'Total spend', render: (w, p) => displayMoney(w.spend, w.currency, p).text },
  source: {
    label: 'Source',
    render: (w) => (w.source === 'manual' ? 'Entered manually' : w.source === 'api' ? 'Live API' : '—'),
    tile: (w) => (w.source === 'manual' ? 'Manual' : w.source === 'api' ? 'Live API' : '—'),
  },
  refresh: { label: 'Auto-refresh', render: (w) => `every ${duration(w.refresh_seconds)}` },
  tokens_hour: { label: 'Tokens (last hour, approx.)', render: (w) => compact(w.usage.tokens_hour) },
  spend_hour: { label: 'Spent (last hour)', render: (w, p) => displayMoney(w.usage.spend_hour, w.currency, p, 3).text },
  overuse: {
    label: 'Overusage limit',
    render: (w, p) => {
      if (!w.overuse_metric || !w.overuse_limit) return 'not set'
      const fmt = (v: string | null) =>
        v === null ? '—' : w.overuse_metric === 'tokens' ? compact(Number(v)) : displayMoney(v, w.currency, p).text
      return `${fmt(w.overuse_value)} / ${fmt(w.overuse_limit)} per ${w.overuse_window}`
    },
  },
  category: { label: 'Category', render: (w) => CATEGORY_LABEL[w.category], tile: (w) => CATEGORY_LABEL[w.category] },
}
