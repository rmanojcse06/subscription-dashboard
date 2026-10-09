// Frontend flavour registry. Keys must match FLAVOURS in backend/app/flavours/__init__.py.
// To add a flavour: create ./<key>.tsx exporting a FlavourUI and add it to ALL.
import { COMMON_FIELDS, type FieldDef } from '../widgetFields'
import { aws } from './aws'
import { deepseek } from './deepseek'
import { emi } from './emi'
import { gemini } from './gemini'
import { generic } from './generic'
import { loan } from './loan'
import { netflix } from './netflix'
import { openrouter } from './openrouter'
import { prepaid_mobile } from './prepaid_mobile'
import { runpod } from './runpod'
import { streaming } from './streaming'
import { tv_subscription } from './tv_subscription'
import type { FlavourUI } from './types'

const ALL: FlavourUI[] = [openrouter, deepseek, gemini, runpod, aws, netflix, streaming, prepaid_mobile, tv_subscription, emi, loan, generic]

const FLAVOUR_UI: Record<string, FlavourUI> = Object.fromEntries(ALL.map((f) => [f.key, f]))

export const flavourUI = (key: string): FlavourUI => FLAVOUR_UI[key] ?? generic

/** Renderer for a metadata key: the flavour's own first, then the common ones. */
export const fieldDef = (flavour: string, key: string): FieldDef | undefined =>
  flavourUI(flavour).fields?.[key] ?? COMMON_FIELDS[key]
