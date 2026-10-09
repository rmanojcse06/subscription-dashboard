import { useState } from 'react'
import { api, type Cycle, type FlavourInfo, type SubscriptionIn, type WidgetView } from '../api'
import { Dialog } from './Dialog'
import { CurrencySelect } from './CurrencySelect'
import { initialValues, missingRequired, SchemaForm, toPayload, type FormValues } from './SchemaForm'

const CYCLES: Cycle[] = ['monthly', 'quarterly', 'yearly', 'prepaid', 'one_time']
const GROUPS: [string, string[]][] = [
  ['AI & cloud', ['ai_api', 'cloud']],
  ['Streaming', ['streaming']],
  ['Bills & loans', ['emi', 'loan', 'other']],
]

/** Add-widget flow: pick a flavour, fill its form, done (account + key + plan + widget in one call). */
export function AddWidgetDialog({
  flavours,
  onClose,
  onAdded,
}: {
  flavours: FlavourInfo[]
  onClose: () => void
  onAdded: (w: WidgetView) => void
}) {
  const [picked, setPicked] = useState<FlavourInfo | null>(null)
  return (
    <Dialog title={picked ? <>{picked.icon} Add {picked.label}</> : 'Add widget'} onClose={onClose} wide={!picked}>
      {picked ? (
        <FlavourForm flavour={picked} onBack={() => setPicked(null)} onAdded={(w) => { onAdded(w); onClose() }} />
      ) : (
        GROUPS.map(([title, cats]) => (
          <section key={title} className="flavour-group">
            <h3>{title}</h3>
            <div className="flavour-grid">
              {flavours
                .filter((f) => cats.includes(f.category))
                .map((f) => (
                  <button key={f.key} className="flavour-card" onClick={() => setPicked(f)}>
                    <span className="flavour-icon" aria-hidden>{f.icon}</span>
                    <strong>{f.label}</strong>
                    <span className={`pill ${f.source === 'api' ? 'pill-live' : ''}`}>{f.source === 'api' ? 'Live API' : 'Manual'}</span>
                    <span className="muted small">{f.description}</span>
                  </button>
                ))}
            </div>
          </section>
        ))
      )}
    </Dialog>
  )
}

function FlavourForm({ flavour, onBack, onAdded }: { flavour: FlavourInfo; onBack: () => void; onAdded: (w: WidgetView) => void }) {
  const [name, setName] = useState(flavour.label)
  const [config, setConfig] = useState<FormValues>(() => initialValues(flavour.config_schema))
  const [secret, setSecret] = useState('')
  const [plan, setPlan] = useState<SubscriptionIn>({
    plan_name: flavour.label, amount: '', currency: flavour.default_currency, cycle: flavour.default_cycle,
    next_due_date: null, end_date: null, remaining_installments: null, auto_renew: true, active: true,
  })
  const [reading, setReading] = useState<FormValues>(() => initialValues(flavour.reading_schema))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const readingFilled = flavour.reading_schema && Object.values(reading).some((v) => v !== '' && v !== false)
  const missing = [
    !name && 'name',
    ...missingRequired(flavour.config_schema, config),
    flavour.source === 'api' && !secret && 'key',
    flavour.uses_plan && plan.amount === '' && 'plan amount',
    ...(readingFilled ? missingRequired(flavour.reading_schema, reading) : []),
  ].filter(Boolean)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      let w = await api.quickAdd({
        flavour: flavour.key,
        name,
        config: toPayload(flavour.config_schema, config),
        secret: secret || null,
        plan: flavour.uses_plan ? plan : null,
        reading: readingFilled ? { values: toPayload(flavour.reading_schema, reading) } : null,
      })
      if (flavour.source === 'api') w = await api.refreshWidget(w.id) // first live sync
      onAdded(w)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-grid">
      <p className="full muted small">{flavour.description}</p>
      <label className="full">Widget name *<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <SchemaForm schema={flavour.config_schema} values={config} onChange={setConfig} />

      {flavour.secret_label && (
        <label className="full">
          {flavour.secret_label}{flavour.source === 'api' ? ' *' : ''}
          <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <span className="hint">Encrypted before it is stored. Shown later only as ••••{secret.slice(-4) || 'xxxx'}.</span>
        </label>
      )}

      {flavour.uses_plan && (
        <fieldset className="full">
          <legend>Plan</legend>
          <div className="form-grid full">
            <label>Plan name<input value={plan.plan_name} onChange={(e) => setPlan({ ...plan, plan_name: e.target.value })} /></label>
            <label>Amount *<input type="number" step="0.01" value={plan.amount} onChange={(e) => setPlan({ ...plan, amount: e.target.value })} /></label>
            <label>Currency<CurrencySelect value={plan.currency} onChange={(currency) => setPlan({ ...plan, currency })} /></label>
            <label>Cycle<select value={plan.cycle} onChange={(e) => setPlan({ ...plan, cycle: e.target.value as Cycle })}>
              {CYCLES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Next due<input type="date" value={plan.next_due_date ?? ''} onChange={(e) => setPlan({ ...plan, next_due_date: e.target.value || null })} /></label>
            {(flavour.category === 'emi' || flavour.category === 'loan') && (
              <label>Installments left<input type="number" min={0} value={plan.remaining_installments ?? ''}
                onChange={(e) => setPlan({ ...plan, remaining_installments: e.target.value ? Number(e.target.value) : null })} /></label>
            )}
          </div>
        </fieldset>
      )}

      {flavour.reading_schema && (
        <fieldset className="full">
          <legend>Current reading (optional)</legend>
          <div className="form-grid full">
            <SchemaForm schema={flavour.reading_schema} values={reading} onChange={setReading} />
          </div>
        </fieldset>
      )}

      <div className="full row">
        <button onClick={onBack}>← Back</button>
        <button className="primary" disabled={busy || missing.length > 0} onClick={submit}>
          {busy ? 'Adding…' : 'Add widget'}
        </button>
        {missing.length > 0 && <span className="muted small">Needs: {missing.join(', ')}</span>}
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  )
}
