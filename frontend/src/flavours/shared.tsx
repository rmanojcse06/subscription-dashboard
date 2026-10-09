// Building blocks shared by several flavour files.
import type { Profile, WidgetHistory, WidgetView } from '../api'
import { displayMoney, shortDate, stamp } from '../format'
import type { FieldDef } from '../widgetFields'
import type { FlavourUI } from './types'

export const daysUntil = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000)
}

export const inDays = (n: number | null): string =>
  n === null ? '—' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`

/** Money balance headline (API and money-reading flavours). */
export const moneyHeadline: FlavourUI['headline'] = (w, p) => {
  const m = displayMoney(w.balance ?? w.spend, w.currency, p, w.size === 'compact' ? 1 : 2)
  return { text: m.text, unit: m.currency }
}

/** Plan price headline (subscriptions, EMIs, loans). */
export const planHeadline: FlavourUI['headline'] = (w, p) => {
  if (!w.plan) return { text: 'No plan' }
  const m = displayMoney(w.plan.amount, w.plan.currency, p, 0)
  return { text: m.text, unit: `${m.currency}/${CYCLE_SHORT[w.plan.cycle] ?? w.plan.cycle}` }
}

const CYCLE_SHORT: Record<string, string> = { monthly: 'mo', quarterly: 'qtr', yearly: 'yr', prepaid: 'prepaid', one_time: 'once' }
const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, yearly: 1 }

/** Field renderers for flavours with a plan. */
export const PLAN_FIELDS: Record<string, FieldDef> = {
  plan: { label: 'Plan', render: (w) => (w.plan ? `${w.plan.plan_name} · ${w.plan.cycle}` : '—') },
  next_due: {
    label: 'Next due',
    render: (w) => (w.plan?.next_due_date ? `${shortDate(w.plan.next_due_date)} (${inDays(daysUntil(w.plan.next_due_date))})` : '—'),
    tile: (w) => (w.plan?.next_due_date ? `Due ${inDays(daysUntil(w.plan.next_due_date))} · ${shortDate(w.plan.next_due_date)}` : 'No due date'),
  },
  yearly_cost: {
    label: 'Cost per year',
    render: (w, p) => (w.plan && PER_YEAR[w.plan.cycle] ? displayMoney(Number(w.plan.amount) * PER_YEAR[w.plan.cycle], w.plan.currency, p, 0).text : '—'),
  },
  installments_left: {
    label: 'Installments left',
    render: (w) => (w.plan?.remaining_installments ?? '—').toString(),
    tile: (w) => (w.plan?.remaining_installments === null || !w.plan ? '' : `${w.plan.remaining_installments} installments left`),
  },
  remaining_total: {
    label: 'Remaining to pay',
    render: (w, p) =>
      w.plan?.remaining_installments != null ? displayMoney(Number(w.plan.amount) * w.plan.remaining_installments, w.plan.currency, p, 0).text : '—',
  },
}

/** "Plan" summary block for the expanded dialog. */
export function PlanBlock({ widget, profile }: { widget: WidgetView; profile: Profile }) {
  const plan = widget.plan
  if (!plan) return <p className="muted empty">No active plan. Add one in ☰ → Configure subscriptions.</p>
  const rows: [string, string][] = Object.entries(PLAN_FIELDS).map(([, f]) => [f.label, f.render(widget, profile)])
  rows.push(['Auto-renew', plan.auto_renew ? 'Yes' : 'No'])
  if (plan.end_date) rows.push(['Ends on', shortDate(plan.end_date)])
  return <KeyValues rows={rows.filter(([, v]) => v !== '—')} />
}

export function KeyValues({ rows }: { rows: [string, string][] }) {
  return (
    <div className="stats">
      {rows.map(([label, value]) => (
        <div className="stat" key={label}>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
        </div>
      ))}
    </div>
  )
}

/** Table of manual readings over time (flavours with a Reading model). */
export function ReadingHistory({ history, profile, columns }: {
  history: WidgetHistory
  profile: Profile
  columns: { key: string; label: string; format?: (v: string) => string }[]
}) {
  const rows = history.snapshots.filter((s) => s.detail?.reading).slice().reverse()
  if (rows.length === 0) return <p className="muted empty">No readings in this range. Add one in the Configure widget tab.</p>
  return (
    <table className="table">
      <thead>
        <tr><th>Recorded</th>{columns.map((c) => <th key={c.key} className="num">{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const r = s.detail.reading as Record<string, string | null>
          return (
            <tr key={s.id}>
              <td>{stamp(s.fetched_at, profile)}</td>
              {columns.map((c) => <td key={c.key} className="num">{r[c.key] == null ? '—' : c.format ? c.format(r[c.key]!) : r[c.key]}</td>)}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
