import { compact } from '../format'
import { moneyHeadline, ReadingHistory } from './shared'
import type { FlavourUI } from './types'

export const gemini: FlavourUI = {
  key: 'gemini',
  headline: moneyHeadline,
  moneyCharts: true,
  Expanded: ({ history, profile }) => (
    <ReadingHistory
      history={history}
      profile={profile}
      columns={[
        { key: 'balance', label: 'Credit' },
        { key: 'tokens_today', label: 'Tokens that day', format: (v) => compact(Number(v)) },
      ]}
    />
  ),
}
