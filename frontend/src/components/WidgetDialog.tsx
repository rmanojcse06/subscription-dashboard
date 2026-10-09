import { useEffect, useState } from 'react'
import { api, type FlavourInfo, type OveruseMetric, type OveruseWindow, type Profile, type WidgetHistory, type WidgetIn, type WidgetView } from '../api'
import { fieldDef, flavourUI } from '../flavours'
import { ALERT_LABEL, compact, convert, displayMoney, money, shortDate, stamp, widgetProfile } from '../format'
import { PRESET_COLORS, tileStyle } from '../colors'
import { BarChart, StepLineChart } from './charts'
import { Dialog } from './Dialog'
import { CurrencySelect } from './CurrencySelect'
import { initialValues, missingRequired, SchemaForm, toPayload } from './SchemaForm'

const RANGES = [7, 30, 90]

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 }

/** "2M" / "500k" / "1.5b" / "2000000" -> number; null if not a positive number. */
function parseLimit(text: string): number | null {
  const m = text.trim().replace(/,/g, '').match(/^(d+(?:.d+)?)s*([kmb])?$/i)
  if (!m) return null
  const n = Number(m[1]) * (m[2] ? SUFFIX[m[2].toLowerCase()] : 1)
  return n > 0 ? n : null
}

function formatLimit(n: number): string {
  if (n >= 1e9 && n % 1e8 === 0) return `${n / 1e9}B`
  if (n >= 1e6 && n % 1e5 === 0) return `${n / 1e6}M`
  if (n >= 1e3 && n % 100 === 0) return `${n / 1e3}k`
  return String(n)
}

export function WidgetDialog({
  widget,
  initialTab = 'history',
  flavour,
  profile,
  onClose,
  onChange,
  onRemoved,
}: {
  widget: WidgetView
  initialTab?: 'history' | 'configure'
  flavour: FlavourInfo | undefined
  profile: Profile
  onClose: () => void
  onChange: (w: WidgetView) => void
  onRemoved: () => void
}) {
  const [tab, setTab] = useState<'history' | 'configure'>(initialTab)
  return (
    <Dialog title={<>{flavour?.icon} {widget.title ?? widget.account_name}</>} onClose={onClose} wide>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>
          Usage & history
        </button>
        <button role="tab" aria-selected={tab === 'configure'} onClick={() => setTab('configure')}>
          Configure widget
        </button>
        {flavour && <span className="muted small tab-note">{flavour.label} · {flavour.source === 'api' ? 'live API' : 'manual entry'}</span>}
      </div>
      {tab === 'history' ? (
        <History widget={widget} profile={widgetProfile(profile, widget)} />
      ) : (
        <Configure widget={widget} flavour={flavour} onChange={onChange} onRemoved={onRemoved} />
      )}
    </Dialog>
  )
}

function History({ widget, profile }: { widget: WidgetView; profile: Profile }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<WidgetHistory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    api.widgetHistory(widget.id, days).then(setData, (e) => setError(String(e.message)))
  }, [widget.id, days, widget.last_checked_at, widget.plan?.id])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const ui = flavourUI(widget.flavour)
  const w = data.widget
  const Expanded = ui.Expanded

  return (
    <div className="history">
      <div className="row between">
        <div className="seg" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r} aria-pressed={days === r} onClick={() => setDays(r)}>
              {r} days
            </button>
          ))}
        </div>
        {w.alert_kind && (
          <span className={`pill tone-${w.alert_kind === 'key_expiring' ? 'warning' : 'critical'}`}>
            ⚠ {ALERT_LABEL[w.alert_kind]}: {w.alert_message}
          </span>
        )}
      </div>

      {Expanded && <Expanded widget={w} history={data} profile={profile} />}
      {ui.moneyCharts && <MoneyHistory data={data} days={days} profile={profile} showTable={showTable} setShowTable={setShowTable} />}

      <div className="two-col">
        <section>
          <h3>Payments & top-ups</h3>
          {data.payments.length === 0 ? <p className="muted">None in this range.</p> : (
            <ul className="list">
              {data.payments.map((p) => (
                <li key={p.id}><span>{shortDate(p.paid_on)} · {p.kind}{p.note ? ` · ${p.note}` : ''}</span>
                  <strong>{displayMoney(p.amount, p.currency, profile).text}</strong></li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>Plans</h3>
          {data.subscriptions.length === 0 ? <p className="muted">No plans configured.</p> : (
            <ul className="list">
              {data.subscriptions.map((s) => (
                <li key={s.id}><span>{s.plan_name} · {s.cycle}{s.next_due_date ? ` · due ${shortDate(s.next_due_date)}` : ''}{!s.active && ' · inactive'}</span>
                  <strong>{displayMoney(s.amount, s.currency, profile).text}</strong></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/** Balance / consumption stats and charts, for flavours with a money balance. */
function MoneyHistory({ data, days, profile, showTable, setShowTable }: {
  data: WidgetHistory; days: number; profile: Profile; showTable: boolean; setShowTable: (f: (s: boolean) => boolean) => void
}) {
  const w = data.widget
  const m = w.metrics
  const native = w.currency ?? 'USD'
  // Charts use the display currency when convertible, else the account's own.
  const conv = (n: number) => convert(n, native, profile.display_currency, profile) ?? n
  const cur = convert(1, native, profile.display_currency, profile) === null ? native : profile.display_currency
  const fmt = (n: number) => money(n, cur, n !== 0 && Math.abs(n) < 1 ? 3 : 2)
  const balancePoints = data.snapshots
    .filter((s) => s.balance !== null)
    .map((s) => ({ label: `${shortDate(s.fetched_at)} ${stamp(s.fetched_at, profile).slice(10, 15)}`, value: conv(Number(s.balance)) }))
  const daily = data.daily.map((d) => ({ label: shortDate(d.date), value: conv(Number(d.consumed)) }))

  return (
    <>
      <div className="stats">
        <Stat label={w.balance !== null ? 'Balance' : 'Spend (period)'} value={displayMoney(w.balance ?? w.spend, w.currency, profile).text}
          note={w.state === 'exhausted' && w.exhausted_at ? `Exhausted since ${stamp(w.exhausted_at, profile)}` : undefined} />
        <Stat label={`Consumed (${days}d)`} value={fmt(conv(Number(data.total_consumed)))} />
        <Stat label={`Topped up (${days}d)`} value={fmt(conv(Number(data.total_topped_up)))} />
        <Stat label="Avg daily burn (7d)" value={fmt(conv(Number(m.avg_daily_burn)))} />
        <Stat label="Days left" value={m.days_left === null ? '—' : String(m.days_left)} />
        <Stat label="Spent today" value={fmt(conv(Number(m.spent_today)))} />
        {m.tokens_30d !== null && <Stat label="Tokens today" value={compact(m.tokens_today)} />}
        {m.tokens_30d !== null && <Stat label="Tokens (30d)" value={compact(m.tokens_30d)} />}
      </div>

      {balancePoints.length > 1 ? (
        <StepLineChart data={balancePoints} fmt={fmt} title={`Balance over time (${cur})`} />
      ) : (
        <p className="muted empty">Balance history appears after the balance changes at least once.</p>
      )}
      <BarChart data={daily} fmt={fmt} title={`Consumed per day (${cur})`} />

      <button className="link" onClick={() => setShowTable((s) => !s)}>
        {showTable ? 'Hide' : 'Show'} data table
      </button>
      {showTable && (
        <table className="table">
          <thead>
            <tr><th>Date</th><th className="num">Consumed</th><th className="num">Topped up</th></tr>
          </thead>
          <tbody>
            {data.daily.slice().reverse().map((d) => (
              <tr key={d.date}>
                <td>{shortDate(d.date)}</td>
                <td className="num">{fmt(conv(Number(d.consumed)))}</td>
                <td className="num">{fmt(conv(Number(d.topped_up)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

function Configure({ widget, flavour, onChange, onRemoved }: {
  widget: WidgetView; flavour: FlavourInfo | undefined; onChange: (w: WidgetView) => void; onRemoved: () => void
}) {
  const [form, setForm] = useState({
    account_id: widget.account_id,
    position: widget.position,
    size: widget.size,
    refresh_seconds: widget.refresh_seconds_override,
    low_threshold: widget.low_threshold,
    title: widget.title,
    color: widget.color_override,
    overuse_metric: widget.overuse_metric,
    overuse_window: widget.overuse_window ?? ('hour' as OveruseWindow),
    tile_fields: widget.tile_fields,
    tooltip_fields: widget.tooltip_fields,
  })
  const [config, setConfig] = useState(() => initialValues(flavour?.config_schema ?? null, widget.flavour_config))
  const [reading, setReading] = useState(() => initialValues(flavour?.reading_schema ?? null, widget.reading))
  const [manual, setManual] = useState({ balance: '', currency: widget.currency ?? 'USD' })
  const [msg, setMsg] = useState<string | null>(null)
  const [limitText, setLimitText] = useState(widget.overuse_limit ? formatLimit(Number(widget.overuse_limit)) : '')
  const parsedLimit = parseLimit(limitText)

  const run = (fn: () => Promise<string>) => async () => {
    try {
      setMsg(await fn())
    } catch (e) {
      setMsg((e as Error).message)
    }
  }
  const toggle = (key: 'tile_fields' | 'tooltip_fields', f: string) =>
    setForm((s) => ({ ...s, [key]: s[key].includes(f) ? s[key].filter((x) => x !== f) : [...s[key], f] }))

  const saveWidget = run(async () => {
    if (form.overuse_metric && parsedLimit === null) throw new Error('Enter an overusage limit, e.g. 2M or 5')
    const body: WidgetIn = { ...form, overuse_limit: form.overuse_metric ? String(parsedLimit) : null }
    onChange(await api.updateWidget(widget.id, body))
    return 'Widget saved'
  })
  const saveConfig = run(async () => {
    const account = (await api.accounts()).find((a) => a.id === widget.account_id)!
    await api.updateAccount(account.id, { ...account, flavour_config: toPayload(flavour!.config_schema, config) })
    onChange(await api.refreshWidget(widget.id))
    return 'Settings saved'
  })
  const saveReading = run(async () => {
    await api.addReading(widget.account_id, toPayload(flavour!.reading_schema, reading))
    onChange(await api.refreshWidget(widget.id))
    return 'Reading recorded'
  })
  const recordBalance = (balance: string) => run(async () => {
    await api.addManualSnapshot(widget.account_id, { balance, spend: null, currency: manual.currency })
    onChange(await api.refreshWidget(widget.id))
    return balance === '0' ? 'Marked exhausted' : 'Balance recorded'
  })

  const fields = flavour?.fields ?? []
  const label = (f: string) => fieldDef(widget.flavour, f)?.label ?? f
  const hasConfig = Object.keys(flavour?.config_schema.properties ?? {}).length > 0

  return (
    <div className="form-grid">
      {msg && <p className="full notice">{msg}</p>}

      {flavour?.reading_schema && (
        <fieldset className="full">
          <legend>New reading</legend>
          <div className="form-grid full">
            <SchemaForm schema={flavour.reading_schema} values={reading} onChange={setReading} />
          </div>
          <div className="row">
            <button className="primary" disabled={missingRequired(flavour.reading_schema, reading).length > 0} onClick={saveReading}>
              Record reading
            </button>
            {flavour.money_field && (
              <button className="danger" onClick={run(async () => {
                await api.addReading(widget.account_id, { ...toPayload(flavour.reading_schema, reading), [flavour.money_field!]: '0' })
                onChange(await api.refreshWidget(widget.id))
                return 'Marked exhausted'
              })}>Mark exhausted</button>
            )}
          </div>
        </fieldset>
      )}

      {flavour?.source === 'api' && (
        <fieldset className="full">
          <legend>Override balance manually (until the next API sync)</legend>
          <div className="row">
            <input type="number" step="0.01" placeholder="Balance" value={manual.balance} onChange={(e) => setManual({ ...manual, balance: e.target.value })} />
            <CurrencySelect value={manual.currency} label="Currency" onChange={(currency) => setManual({ ...manual, currency })} />
            <button disabled={!manual.balance} onClick={recordBalance(manual.balance)}>Record</button>
            <button className="danger" onClick={recordBalance('0')}>Mark exhausted</button>
          </div>
        </fieldset>
      )}

      {hasConfig && (
        <fieldset className="full">
          <legend>{flavour!.label} settings</legend>
          <div className="form-grid full">
            <SchemaForm schema={flavour!.config_schema} values={config} onChange={setConfig} />
          </div>
          <div className="row">
            <button disabled={missingRequired(flavour!.config_schema, config).length > 0} onClick={saveConfig}>Save settings</button>
          </div>
        </fieldset>
      )}

      {flavour?.uses_plan && (
        <p className="full muted small">Price, due date and installments are edited in ☰ → Configure subscriptions → {widget.account_name} → Plans.</p>
      )}

      <fieldset className="full">
        <legend>Widget</legend>
        <div className="form-grid full">
          <label>Title<input value={form.title ?? ''} placeholder={widget.account_name}
            onChange={(e) => setForm({ ...form, title: e.target.value || null })} /></label>
          <label>Size<select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value as 'normal' | 'compact' })}>
            <option value="normal">Normal</option><option value="compact">Compact</option></select></label>
          <label>Refresh every (seconds)<input type="number" min={30} value={form.refresh_seconds ?? ''} placeholder={`default (${widget.refresh_seconds})`}
            onChange={(e) => setForm({ ...form, refresh_seconds: e.target.value ? Number(e.target.value) : null })} /></label>
          <label>Low-balance warning below<input type="number" min={0} step="0.01" value={form.low_threshold ?? ''}
            onChange={(e) => setForm({ ...form, low_threshold: e.target.value || null })} /></label>
        </div>
      </fieldset>
      <fieldset className="full">
        <legend>Overusage alert</legend>
        <div className="row">
          <select value={form.overuse_metric ?? ''} aria-label="Overusage metric"
            onChange={(e) => setForm({ ...form, overuse_metric: (e.target.value || null) as OveruseMetric | null })}>
            <option value="">Off</option>
            <option value="tokens">Tokens</option>
            <option value="spend">Spend ({widget.currency ?? 'account currency'})</option>
          </select>
          {form.overuse_metric && (
            <>
              <span>above</span>
              <input className="limit-input" value={limitText} placeholder={form.overuse_metric === 'tokens' ? 'e.g. 2M' : 'e.g. 5'}
                aria-label="Overusage limit" onChange={(e) => setLimitText(e.target.value)} />
              <span>per</span>
              <select value={form.overuse_window} aria-label="Overusage window"
                onChange={(e) => setForm({ ...form, overuse_window: e.target.value as OveruseWindow })}>
                <option value="hour">hour</option>
                <option value="day">day</option>
              </select>
              {limitText && parsedLimit === null && <span className="error small">Use a number like 2000000, 2M or 500k</span>}
            </>
          )}
        </div>
        <p className="hint">
          Shows an orange <strong>overusage</strong> badge and ring when crossed.
          {form.overuse_metric === 'tokens' && ' Token counts come from the provider (OpenRouter) or manual readings; the hourly figure is estimated from the change in today’s total.'}
          {widget.usage.tokens_hour !== null || widget.usage.tokens_day !== null
            ? ` Now: ${compact(widget.usage.tokens_hour)} tokens/hour, ${compact(widget.usage.tokens_day)} tokens today.`
            : ''}
        </p>
      </fieldset>
      <fieldset className="full">
        <legend>Colour</legend>
        <div className="swatches" role="radiogroup" aria-label="Tile colour">
          {PRESET_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={(form.color ?? widget.color) === c} aria-label={c}
              className="swatch" style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
          ))}
          <label className="swatch-custom" title="Custom colour">
            <input type="color" value={form.color ?? widget.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            Custom
          </label>
          <button type="button" className="link" onClick={() => setForm({ ...form, color: null })}>
            Reset to {flavour?.label ?? 'flavour'} default
          </button>
        </div>
        <div className="swatch-preview" style={tileStyle(form.color ?? flavour?.color ?? widget.color)}>
          {form.title ?? widget.account_name} · preview
        </div>
      </fieldset>
      <fieldset className="full">
        <legend>Shown on the collapsed tile</legend>
        {fields.map((k) => (
          <label key={k} className="check"><input type="checkbox" checked={form.tile_fields.includes(k)} onChange={() => toggle('tile_fields', k)} />{label(k)}</label>
        ))}
      </fieldset>
      <fieldset className="full">
        <legend>Shown in the hover tooltip</legend>
        {fields.map((k) => (
          <label key={k} className="check"><input type="checkbox" checked={form.tooltip_fields.includes(k)} onChange={() => toggle('tooltip_fields', k)} />{label(k)}</label>
        ))}
      </fieldset>
      <div className="full row">
        <button className="primary" onClick={saveWidget}>Save widget</button>
        <button className="danger" onClick={async () => { if (confirm('Remove this widget? The account and its data are kept.')) { await api.deleteWidget(widget.id); onRemoved() } }}>
          Remove widget
        </button>
      </div>
    </div>
  )
}
