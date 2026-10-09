import { compact, displayMoney } from '../format'
import { KeyValues, moneyHeadline } from './shared'
import type { FlavourUI } from './types'

export const openrouter: FlavourUI = {
  key: 'openrouter',
  headline: moneyHeadline,
  moneyCharts: true,
  Expanded: ({ widget: w, profile: p }) => (
    <KeyValues
      rows={[
        ['Total credits bought', displayMoney(w.extra.total_credits as number | undefined, 'USD', p).text],
        ['Total used (all time)', displayMoney(w.extra.total_usage as number | undefined, 'USD', p).text],
        ['Tokens today', compact(w.metrics.tokens_today)],
        ['Tokens (30 days)', compact(w.metrics.tokens_30d)],
      ]}
    />
  ),
}
