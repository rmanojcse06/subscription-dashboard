import { displayMoney } from '../format'
import type { FlavourUI } from './types'

export const aws: FlavourUI = {
  key: 'aws',
  // AWS reports month-to-date cost, not a balance.
  headline: (w, p) => {
    const m = displayMoney(w.spend, w.currency, p)
    return { text: m.text, unit: `${m.currency} MTD` }
  },
  moneyCharts: true,
}
