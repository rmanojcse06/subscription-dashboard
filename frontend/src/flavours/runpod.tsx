import { displayMoney } from '../format'
import { KeyValues, moneyHeadline } from './shared'
import type { FlavourUI } from './types'

const perHour = (v: unknown) => (typeof v === 'number' ? v : null)

export const runpod: FlavourUI = {
  key: 'runpod',
  headline: moneyHeadline,
  moneyCharts: true,
  fields: {
    spend_per_hour: {
      label: 'Current spend / hour',
      render: (w, p) => displayMoney(perHour(w.extra.currentSpendPerHr), 'USD', p, 3).text,
    },
  },
  Expanded: ({ widget: w, profile: p }) => {
    const hr = perHour(w.extra.currentSpendPerHr)
    return (
      <KeyValues
        rows={[
          ['Spend / hour now', displayMoney(hr, 'USD', p, 3).text],
          ['Spend / day at this rate', hr === null ? '—' : displayMoney(hr * 24, 'USD', p).text],
          ['Hours left at this rate', hr && w.balance ? `${(Number(w.balance) / hr).toFixed(1)} h` : '—'],
        ]}
      />
    )
  },
}
