import type { WidgetView } from '../api'
import { displayMoney } from '../format'
import { KeyValues, moneyHeadline, ReadingHistory } from './shared'
import type { FlavourUI } from './types'

/** Days until the balance runs out at the configured daily deduction. */
const daysToRecharge = (w: WidgetView): number | null => {
  const daily = Number(w.flavour_config.daily_charge ?? 0)
  if (!daily || w.balance === null) return null
  return Math.max(0, Math.floor(Number(w.balance) / daily))
}

export const tv_subscription: FlavourUI = {
  key: 'tv_subscription',
  headline: moneyHeadline,
  moneyCharts: true,
  fields: {
    pack: { label: 'Pack', render: (w) => String(w.flavour_config.pack_name ?? '—') },
    daily_charge: {
      label: 'Daily deduction',
      render: (w, p) => displayMoney(w.flavour_config.daily_charge as string | undefined, w.currency ?? 'INR', p).text,
    },
    days_to_recharge: {
      label: 'Recharge needed in',
      render: (w) => {
        const d = daysToRecharge(w)
        return d === null ? 'set daily deduction' : `${d} days`
      },
      tile: (w) => {
        const d = daysToRecharge(w)
        return d === null ? 'Set daily deduction' : `Recharge in ~${d} days`
      },
    },
  },
  Expanded: ({ widget: w, history, profile: p }) => {
    const c = w.flavour_config as { operator?: string; subscriber_id?: string; pack_name?: string; daily_charge?: string }
    const days = daysToRecharge(w)
    return (
      <>
        <KeyValues
          rows={[
            ['Operator', c.operator ?? '—'],
            ['Subscriber ID', c.subscriber_id ?? '—'],
            ['Pack', c.pack_name ?? '—'],
            ['Daily deduction', displayMoney(c.daily_charge, w.currency ?? 'INR', p).text],
            ['Recharge needed in', days === null ? '—' : `${days} days`],
          ]}
        />
        <h3>Balance readings</h3>
        <ReadingHistory history={history} profile={p} columns={[{ key: 'balance', label: 'Balance' }]} />
      </>
    )
  },
}
