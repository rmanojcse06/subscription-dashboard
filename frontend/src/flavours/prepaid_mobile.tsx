import { displayMoney, shortDate } from '../format'
import { daysUntil, inDays, KeyValues, ReadingHistory } from './shared'
import type { FlavourUI } from './types'

const gb = (v: string | null | undefined) => (v == null ? '—' : `${Number(v).toFixed(2)} GB`)
const validity = (v: string | null | undefined) => (v ? `${shortDate(v)} (${inDays(daysUntil(v))})` : '—')

export const prepaid_mobile: FlavourUI = {
  key: 'prepaid_mobile',
  // Collapsed: days of validity left is what matters for a prepaid number.
  headline: (w) => {
    const left = daysUntil(w.reading.validity_until)
    const unit = String(w.flavour_config.operator ?? '')
    if (left === null) return { text: 'No reading', unit }
    return { text: left < 0 ? 'Expired' : `${left} day${left === 1 ? '' : 's'}`, unit }
  },
  moneyCharts: false,
  fields: {
    validity: {
      label: 'Validity',
      render: (w) => validity(w.reading.validity_until),
      tile: (w) => (w.reading.validity_until ? `Valid till ${shortDate(w.reading.validity_until)}` : 'Add a reading'),
    },
    data_left: { label: 'Data left today', render: (w) => gb(w.reading.data_left_gb), tile: (w) => `Data left: ${gb(w.reading.data_left_gb)}` },
    main_balance: { label: 'Main balance', render: (w, p) => displayMoney(w.reading.main_balance, w.currency ?? 'INR', p).text },
    operator: { label: 'Operator', render: (w) => String(w.flavour_config.operator ?? '—') },
  },
  Expanded: ({ widget: w, history, profile: p }) => {
    const c = w.flavour_config as { mobile_number?: string; operator?: string; plan_name?: string; daily_data_gb?: string }
    return (
      <>
        <KeyValues
          rows={[
            ['Number', c.mobile_number ?? '—'],
            ['Operator', c.operator ?? '—'],
            ['Plan', c.plan_name ?? '—'],
            ['Validity', validity(w.reading.validity_until)],
            ['Data left today', `${gb(w.reading.data_left_gb)}${c.daily_data_gb ? ` of ${gb(c.daily_data_gb)}` : ''}`],
            ['Main balance', displayMoney(w.reading.main_balance, w.currency ?? 'INR', p).text],
          ]}
        />
        <h3>Reading history</h3>
        <ReadingHistory
          history={history}
          profile={p}
          columns={[
            { key: 'validity_until', label: 'Valid till', format: shortDate },
            { key: 'data_left_gb', label: 'Data left', format: gb },
            { key: 'main_balance', label: 'Balance' },
          ]}
        />
      </>
    )
  },
}
