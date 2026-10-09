// Types mirror backend/app/schemas.py. Decimals arrive as strings.
import type { JsonSchema } from './components/SchemaForm'

export type Category = 'ai_api' | 'cloud' | 'streaming' | 'emi' | 'loan' | 'other'
export type Cycle = 'monthly' | 'quarterly' | 'yearly' | 'prepaid' | 'one_time'
export type PaymentKind = 'charge' | 'topup' | 'emi' | 'refund'
export type SecretKind = 'api_key' | 'token' | 'password' | 'other'

export interface Profile {
  display_name: string
  avatar: string | null
  default_refresh_seconds: number
  currency_a: string
  currency_b: string
  rate_a_to_b: string
  rate_manual: boolean // false: rate_a_to_b follows the daily fetched rates
  display_currency: string
  time_format: '12h' | '24h'
  fx_rates: Record<string, number> | null // units per 1 USD (ECB, daily)
  fx_date: string | null
  fx_checked_at: string | null
  fx_error: string | null
}

export interface Account {
  id: number
  name: string
  category: Category
  flavour: string
  flavour_config: Record<string, unknown>
  website: string | null
  notes: string | null
  created_at: string
}
export type AccountIn = Omit<Account, 'id' | 'created_at'>

export interface Subscription {
  id: number
  account_id: number
  plan_name: string
  amount: string
  currency: string
  cycle: Cycle
  next_due_date: string | null
  end_date: string | null
  remaining_installments: number | null
  auto_renew: boolean
  active: boolean
}
export type SubscriptionIn = Omit<Subscription, 'id' | 'account_id'>

export interface Payment {
  id: number
  account_id: number
  kind: PaymentKind
  amount: string
  currency: string
  paid_on: string
  note: string | null
}
export type PaymentIn = Omit<Payment, 'id' | 'account_id'>

export interface Secret {
  id: number
  account_id: number
  label: string
  kind: SecretKind
  hint: string
  use_for_sync: boolean
  expires_on: string | null
  created_at: string
}
export interface SecretIn {
  label: string
  kind: SecretKind
  value: string | null
  use_for_sync: boolean
  expires_on: string | null
}

export interface Snapshot {
  id: number
  account_id: number
  balance: string | null
  spend: string | null
  currency: string
  source: 'api' | 'manual'
  detail: Record<string, unknown>
  fetched_at: string
  checked_at: string
}

export type WidgetState = 'ok' | 'low' | 'exhausted' | 'no_data'

export interface WidgetView {
  id: number
  account_id: number
  account_name: string
  title: string | null
  color: string
  color_override: string | null
  display_currency: string | null
  tile_fields: string[]
  tooltip_fields: string[]
  category: Category
  flavour: string
  flavour_config: Record<string, unknown>
  sync_provider: string | null
  position: number
  size: 'normal' | 'compact'
  refresh_seconds: number
  refresh_seconds_override: number | null
  low_threshold: string | null
  state: WidgetState
  balance: string | null
  spend: string | null
  currency: string | null
  source: 'api' | 'manual' | null
  last_checked_at: string | null
  last_used_at: string | null
  exhausted_at: string | null
  alert_kind: string | null
  alert_message: string | null
  alert_at: string | null
  metrics: {
    spent_today: string
    avg_daily_burn: string
    days_left: number | null
    tokens_today: number | null
    tokens_30d: number | null
  }
  reading: Record<string, string | null>
  extra: Record<string, unknown>
  plan: Subscription | null
  usage: { tokens_hour: number | null; tokens_day: number | null; spend_hour: string; spend_day: string }
  overuse_metric: OveruseMetric | null
  overuse_window: OveruseWindow | null
  overuse_limit: string | null
  overuse_value: string | null
  status: WidgetStatus
}

export type OveruseMetric = 'tokens' | 'spend'
export type OveruseWindow = 'hour' | 'day'
export type WidgetStatus = 'failed' | 'exhausted' | 'overusage' | 'online' | 'manual' | 'no_data'

export interface FlavourInfo {
  key: string
  label: string
  description: string
  category: Category
  icon: string
  color: string
  source: 'api' | 'manual'
  provider: string | null
  secret_label: string | null
  config_schema: JsonSchema
  reading_schema: JsonSchema | null
  money_field: string | null
  default_currency: string
  uses_plan: boolean
  default_cycle: Cycle
  fields: string[]
  tile_fields: string[]
  tooltip_fields: string[]
}

export interface QuickAddIn {
  flavour: string
  name: string
  config: Record<string, unknown>
  secret: string | null
  plan: SubscriptionIn | null
  reading: { values: Record<string, unknown>; currency?: string } | null
}

export interface WidgetIn {
  account_id: number
  position: number
  size: 'normal' | 'compact'
  refresh_seconds: number | null
  low_threshold: string | null
  title?: string | null
  color?: string | null
  overuse_metric?: OveruseMetric | null
  overuse_window?: OveruseWindow
  overuse_limit?: string | null
  tile_fields?: string[]
  tooltip_fields?: string[]
}

export interface WidgetHistory {
  widget: WidgetView
  snapshots: Snapshot[]
  daily: { date: string; consumed: string; topped_up: string }[]
  payments: Payment[]
  subscriptions: Subscription[]
  total_consumed: string
  total_topped_up: string
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try {
      const data = await resp.json()
      // FastAPI validation errors are a list of {loc, msg}; show them as "field: message".
      msg = typeof data.detail === 'string' ? data.detail
        : Array.isArray(data.detail) ? data.detail.map((d: { loc?: unknown[]; msg: string }) => `${d.loc?.[d.loc.length - 1] ?? ''}: ${d.msg}`).join('; ')
        : JSON.stringify(data.detail)
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg)
  }
  return resp.status === 204 ? (undefined as T) : resp.json()
}

export const api = {
  profile: () => req<Profile>('GET', '/profile'),
  saveProfile: (p: Profile) => req<Profile>('PUT', '/profile', p),
  refreshFx: () => req<Profile>('POST', '/profile/fx/refresh'),


  accounts: () => req<Account[]>('GET', '/accounts'),
  createAccount: (a: AccountIn) => req<Account>('POST', '/accounts', a),
  updateAccount: (id: number, a: AccountIn) => req<Account>('PUT', `/accounts/${id}`, a),
  deleteAccount: (id: number) => req<void>('DELETE', `/accounts/${id}`),

  subscriptions: (accountId: number) => req<Subscription[]>('GET', `/accounts/${accountId}/subscriptions`),
  createSubscription: (accountId: number, s: SubscriptionIn) =>
    req<Subscription>('POST', `/accounts/${accountId}/subscriptions`, s),
  updateSubscription: (id: number, s: SubscriptionIn) => req<Subscription>('PUT', `/subscriptions/${id}`, s),
  deleteSubscription: (id: number) => req<void>('DELETE', `/subscriptions/${id}`),

  payments: (accountId: number) => req<Payment[]>('GET', `/accounts/${accountId}/payments`),
  createPayment: (accountId: number, p: PaymentIn) => req<Payment>('POST', `/accounts/${accountId}/payments`, p),
  deletePayment: (id: number) => req<void>('DELETE', `/payments/${id}`),

  secrets: (accountId: number) => req<Secret[]>('GET', `/accounts/${accountId}/secrets`),
  createSecret: (accountId: number, s: SecretIn) => req<Secret>('POST', `/accounts/${accountId}/secrets`, s),
  updateSecret: (id: number, s: SecretIn) => req<Secret>('PUT', `/secrets/${id}`, s),
  revealSecret: (id: number) => req<{ value: string }>('POST', `/secrets/${id}/reveal`),
  deleteSecret: (id: number) => req<void>('DELETE', `/secrets/${id}`),

  addManualSnapshot: (accountId: number, body: { balance: string | null; spend: string | null; currency: string }) =>
    req<Snapshot>('POST', `/accounts/${accountId}/snapshots`, body),

  flavours: () => req<FlavourInfo[]>('GET', '/flavours'),
  quickAdd: (body: QuickAddIn) => req<WidgetView>('POST', '/flavours/widgets', body),
  addReading: (accountId: number, values: Record<string, unknown>, currency?: string) =>
    req<Snapshot>('POST', `/accounts/${accountId}/readings`, { values, currency }),

  widgets: () => req<WidgetView[]>('GET', '/widgets'),
  createWidget: (w: WidgetIn) => req<WidgetView>('POST', '/widgets', w),
  updateWidget: (id: number, w: WidgetIn) => req<WidgetView>('PUT', `/widgets/${id}`, w),
  deleteWidget: (id: number) => req<void>('DELETE', `/widgets/${id}`),
  setWidgetCurrency: (id: number, display_currency: string | null) =>
    req<WidgetView>('PUT', `/widgets/${id}/display-currency`, { display_currency }),
  reorderWidgets: (ids: number[]) => req<WidgetView[]>('POST', '/widgets/reorder', { ids }),
  refreshWidget: (id: number) => req<WidgetView>('POST', `/widgets/${id}/refresh`),
  widgetHistory: (id: number, days: number) => req<WidgetHistory>('GET', `/widgets/${id}/history?days=${days}`),
}
