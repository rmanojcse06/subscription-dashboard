import type { ReactNode } from 'react'
import type { Profile, WidgetHistory, WidgetView } from '../api'
import type { FieldDef } from '../widgetFields'

/**
 * Frontend half of a widget flavour (backend half: backend/app/flavours/<key>.py).
 * One file per flavour in this folder, registered in ./index.ts.
 */
export interface FlavourUI {
  key: string
  /** Big value on the collapsed tile, plus the unit shown top-right. */
  headline: (w: WidgetView, p: Profile) => { text: string; unit?: string }
  /** Renderers for this flavour's own metadata keys (the backend flavour's `fields`). */
  fields?: Record<string, FieldDef>
  /** Show the money balance / consumption charts in the expanded dialog. */
  moneyCharts: boolean
  /** Flavour-specific block at the top of the expanded dialog. */
  Expanded?: (props: { widget: WidgetView; history: WidgetHistory; profile: Profile }) => ReactNode
}
