import { KeyValues, PLAN_FIELDS, PlanBlock, planHeadline } from './shared'
import type { FlavourUI } from './types'

export const emi: FlavourUI = {
  key: 'emi',
  headline: planHeadline,
  fields: PLAN_FIELDS,
  moneyCharts: false,
  Expanded: ({ widget, profile }) => {
    const c = widget.flavour_config as { card_name?: string; item?: string; card_last4?: string }
    return (
      <>
        <KeyValues
          rows={[
            ['Card', `${c.card_name ?? '—'}${c.card_last4 ? ` ••${c.card_last4}` : ''}`],
            ['Purchase', c.item ?? '—'],
          ]}
        />
        <PlanBlock widget={widget} profile={profile} />
      </>
    )
  },
}
