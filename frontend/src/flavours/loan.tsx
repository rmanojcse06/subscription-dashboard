import { displayMoney } from '../format'
import { KeyValues, PLAN_FIELDS, PlanBlock, planHeadline, ReadingHistory } from './shared'
import type { FlavourUI } from './types'

export const loan: FlavourUI = {
  key: 'loan',
  headline: planHeadline,
  moneyCharts: false,
  fields: {
    ...PLAN_FIELDS,
    outstanding: {
      label: 'Outstanding principal',
      render: (w, p) => displayMoney(w.reading.outstanding_principal, w.currency ?? w.plan?.currency ?? 'INR', p, 0).text,
    },
    interest_rate: {
      label: 'Interest rate',
      render: (w) => (w.flavour_config.interest_rate ? `${w.flavour_config.interest_rate}% p.a.` : '—'),
    },
  },
  Expanded: ({ widget: w, history, profile: p }) => {
    const c = w.flavour_config as { lender?: string; loan_account?: string; interest_rate?: string }
    return (
      <>
        <KeyValues
          rows={[
            ['Lender', c.lender ?? '—'],
            ['Loan account', c.loan_account ?? '—'],
            ['Interest rate', c.interest_rate ? `${c.interest_rate}% p.a.` : '—'],
            ['Outstanding principal', displayMoney(w.reading.outstanding_principal, w.currency ?? 'INR', p, 0).text],
          ]}
        />
        <PlanBlock widget={w} profile={p} />
        <h3>Outstanding principal over time</h3>
        <ReadingHistory history={history} profile={p} columns={[{ key: 'outstanding_principal', label: 'Outstanding' }]} />
      </>
    )
  },
}
