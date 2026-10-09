import { KeyValues, PLAN_FIELDS, PlanBlock, planHeadline } from './shared'
import type { FlavourUI } from './types'

export const streaming: FlavourUI = {
  key: 'streaming',
  headline: planHeadline,
  fields: PLAN_FIELDS,
  moneyCharts: false,
  Expanded: ({ widget, profile }) => {
    const c = widget.flavour_config as { service?: string; plan_name?: string }
    return (
      <>
        <KeyValues rows={[['Service', c.service ?? '—'], ['Plan', c.plan_name ?? widget.plan?.plan_name ?? '—']]} />
        <PlanBlock widget={widget} profile={profile} />
      </>
    )
  },
}
