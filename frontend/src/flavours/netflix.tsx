import { KeyValues, PLAN_FIELDS, PlanBlock, planHeadline } from './shared'
import type { FlavourUI } from './types'

export const netflix: FlavourUI = {
  key: 'netflix',
  headline: planHeadline,
  fields: PLAN_FIELDS,
  moneyCharts: false,
  Expanded: ({ widget, profile }) => {
    const c = widget.flavour_config as { plan_tier?: string; screens?: number; registered_mobile?: string }
    return (
      <>
        <KeyValues
          rows={[
            ['Netflix plan', c.plan_tier ?? '—'],
            ['Screens', c.screens ? String(c.screens) : '—'],
            ['Registered mobile', c.registered_mobile ?? '—'],
          ]}
        />
        <PlanBlock widget={widget} profile={profile} />
      </>
    )
  },
}
