import { useCallback, useEffect, useState } from 'react'
import {
  api,
  type Account,
  type AccountIn,
  type Category,
  type Cycle,
  type Payment,
  type PaymentIn,
  type PaymentKind,
  type FlavourInfo,
  type Secret,
  type SecretIn,
  type SecretKind,
  type Subscription,
  type SubscriptionIn,
} from '../api'
import { shortDate } from '../format'
import { Dialog } from './Dialog'
import { CurrencySelect } from './CurrencySelect'
import { initialValues, missingRequired, SchemaForm, toPayload } from './SchemaForm'

const CATEGORIES: Category[] = ['ai_api', 'cloud', 'streaming', 'emi', 'loan', 'other']
const CYCLES: Cycle[] = ['monthly', 'quarterly', 'yearly', 'prepaid', 'one_time']
const PAYMENT_KINDS: PaymentKind[] = ['charge', 'topup', 'emi', 'refund']
const SECRET_KINDS: SecretKind[] = ['api_key', 'token', 'password', 'other']
const today = () => new Date().toISOString().slice(0, 10)

export function ConfigureDialog({ flavours, onClose, onChanged }: { flavours: FlavourInfo[]; onClose: () => void; onChanged: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selected, setSelected] = useState<number | 'new' | null>(null)

  const load = useCallback(async () => {
    const list = await api.accounts()
    setAccounts(list)
    return list
  }, [])
  useEffect(() => {
    load().then((l) => setSelected(l[0]?.id ?? 'new'))
  }, [load])

  const account = typeof selected === 'number' ? accounts.find((a) => a.id === selected) : undefined
  const changed = async (id?: number) => {
    await load()
    if (id !== undefined) setSelected(id)
    onChanged()
  }

  return (
    <Dialog title="Configure subscriptions" onClose={onClose} wide>
      <div className="config">
        <nav className="config-nav">
          <button className={selected === 'new' ? 'active' : ''} onClick={() => setSelected('new')}>+ New account</button>
          {accounts.map((a) => (
            <button key={a.id} className={selected === a.id ? 'active' : ''} onClick={() => setSelected(a.id)}>
              {a.name}
              <span className="muted small">{a.category}</span>
            </button>
          ))}
        </nav>
        <div className="config-main">
          {selected === 'new' && <AccountForm key="new" flavours={flavours} onSaved={(a) => changed(a.id)} />}
          {account && (
            <>
              <AccountForm key={account.id} account={account} flavours={flavours} onSaved={() => changed()}
                onDeleted={async () => { const l = await load(); setSelected(l[0]?.id ?? 'new'); onChanged() }} />
              <Keys account={account} flavour={flavours.find((f) => f.key === account.flavour)} onChanged={onChanged} />
              <Plans account={account} onChanged={onChanged} />
              <Payments account={account} onChanged={onChanged} />
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function useError() {
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<unknown>) => async () => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return { error, run }
}

function AccountForm({ account, flavours, onSaved, onDeleted }: {
  account?: Account; flavours: FlavourInfo[]; onSaved: (a: Account) => void; onDeleted?: () => void
}) {
  const [form, setForm] = useState<AccountIn>(
    account ?? { name: '', category: 'other', flavour: 'generic', flavour_config: {}, website: null, notes: null },
  )
  const flavour = flavours.find((f) => f.key === form.flavour)
  const [config, setConfig] = useState(() => initialValues(flavour?.config_schema ?? null, form.flavour_config))
  const { error, run } = useError()
  const save = run(async () => {
    const body = { ...form, flavour_config: toPayload(flavour?.config_schema ?? null, config) }
    onSaved(account ? await api.updateAccount(account.id, body) : await api.createAccount(body))
  })
  const pickFlavour = (key: string) => {
    const next = flavours.find((f) => f.key === key)
    setForm({ ...form, flavour: key, category: next?.category ?? form.category })
    setConfig(initialValues(next?.config_schema ?? null, key === account?.flavour ? account.flavour_config : {}))
  }
  return (
    <section className="card">
      <h3>{account ? 'Account' : 'New account'}</h3>
      <div className="form-grid">
        <label>Name<input value={form.name} placeholder="e.g. OpenRouter, Netflix, HDFC Home Loan" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Widget flavour<select value={form.flavour} onChange={(e) => pickFlavour(e.target.value)}>
          {flavours.map((f) => <option key={f.key} value={f.key}>{f.icon} {f.label} ({f.source === 'api' ? 'live API' : 'manual'})</option>)}</select></label>
        <SchemaForm schema={flavour?.config_schema ?? null} values={config} onChange={setConfig} />
        <label>Website<input value={form.website ?? ''} onChange={(e) => setForm({ ...form, website: e.target.value || null })} /></label>
        <label className="full">Notes<textarea rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} /></label>
        <div className="full row">
          <button className="primary" disabled={!form.name || missingRequired(flavour?.config_schema ?? null, config).length > 0} onClick={save}>{account ? 'Save' : 'Create account'}</button>
          {account && onDeleted && (
            <button className="danger" onClick={run(async () => {
              if (confirm(`Delete ${account.name} with all its plans, payments, keys, history and widgets?`)) {
                await api.deleteAccount(account.id); onDeleted()
              }
            })}>Delete account</button>
          )}
          {error && <span className="error">{error}</span>}
        </div>
      </div>
    </section>
  )
}

function Keys({ account, flavour, onChanged }: { account: Account; flavour?: FlavourInfo; onChanged: () => void }) {
  const [items, setItems] = useState<Secret[]>([])
  const [editing, setEditing] = useState<Secret | 'new' | null>(null)
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  const { error, run } = useError()
  const load = useCallback(() => api.secrets(account.id).then(setItems), [account.id])
  useEffect(() => { load() }, [load])

  const done = async () => { setEditing(null); await load(); onChanged() }
  const isExpired = (s: Secret) => s.expires_on !== null && s.expires_on < today()

  return (
    <section className="card">
      <h3>Keys, secrets & tokens</h3>
      {flavour?.source === 'api' && <p className="muted small">For live sync, mark one key "Use for sync". Format: {flavour.secret_label}</p>}
      <ul className="list">
        {items.map((s) => (
          <li key={s.id}>
            <span>
              <strong>{s.label}</strong> <span className="muted small">{s.kind} · ••••{s.hint}</span>
              {s.use_for_sync && <span className="pill">sync</span>}
              {s.expires_on && <span className={`pill${isExpired(s) ? ' tone-critical' : ''}`}>{isExpired(s) ? 'expired' : 'expires'} {shortDate(s.expires_on)}</span>}
              {revealed[s.id] && <code className="revealed">{revealed[s.id]}</code>}
            </span>
            <span className="row">
              <button onClick={run(async () => {
                if (revealed[s.id]) return setRevealed((r) => { const next = { ...r }; delete next[s.id]; return next })
                const { value } = await api.revealSecret(s.id); setRevealed((r) => ({ ...r, [s.id]: value }))
              })}>{revealed[s.id] ? 'Hide' : 'Reveal'}</button>
              <button onClick={() => setEditing(s)}>Edit / rotate</button>
              <button className="danger" onClick={run(async () => { if (confirm(`Delete key "${s.label}"?`)) { await api.deleteSecret(s.id); await done() } })}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      {editing ? (
        <SecretForm secret={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)}
          save={async (body) => {
            if (editing === 'new') await api.createSecret(account.id, body)
            else await api.updateSecret(editing.id, body)
            await done()
          }} />
      ) : (
        <button onClick={() => setEditing('new')}>+ Add key</button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function SecretForm({ secret, save, onCancel }: {
  secret?: Secret; save: (b: SecretIn) => Promise<void>; onCancel: () => void
}) {
  const [form, setForm] = useState<SecretIn>({
    label: secret?.label ?? '', kind: secret?.kind ?? 'api_key', value: null,
    use_for_sync: secret?.use_for_sync ?? false, expires_on: secret?.expires_on ?? null,
  })
  const { error, run } = useError()
  return (
    <div className="form-grid subform">
      <label>Label<input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
      <label>Type<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SecretKind })}>
        {SECRET_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
      <label className="full">{secret ? 'New value (leave blank to keep current)' : 'Value'}
        <input type="password" autoComplete="off" value={form.value ?? ''} onChange={(e) => setForm({ ...form, value: e.target.value || null })} /></label>
      <label>Expires on<input type="date" value={form.expires_on ?? ''} onChange={(e) => setForm({ ...form, expires_on: e.target.value || null })} /></label>
      <label className="check"><input type="checkbox" checked={form.use_for_sync} onChange={(e) => setForm({ ...form, use_for_sync: e.target.checked })} />Use for sync</label>
      <div className="full row">
        <button className="primary" disabled={!form.label || (!secret && !form.value)} onClick={run(() => save(form))}>Save key</button>
        <button onClick={onCancel}>Cancel</button>
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  )
}

function Plans({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const blank: SubscriptionIn = { plan_name: '', amount: '', currency: 'INR', cycle: 'monthly', next_due_date: null, end_date: null,
    remaining_installments: null, auto_renew: true, active: true }
  const [items, setItems] = useState<Subscription[]>([])
  const [form, setForm] = useState<SubscriptionIn | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const { error, run } = useError()
  const load = useCallback(() => api.subscriptions(account.id).then(setItems), [account.id])
  useEffect(() => { load() }, [load])

  const save = run(async () => {
    if (!form) return
    if (editId) await api.updateSubscription(editId, form)
    else await api.createSubscription(account.id, form)
    setForm(null); setEditId(null); await load(); onChanged()
  })

  return (
    <section className="card">
      <h3>Plans, EMIs & loans</h3>
      <ul className="list">
        {items.map((s) => (
          <li key={s.id}>
            <span><strong>{s.plan_name}</strong> <span className="muted small">{s.amount} {s.currency} · {s.cycle}
              {s.next_due_date && ` · due ${shortDate(s.next_due_date)}`}{s.remaining_installments !== null && ` · ${s.remaining_installments} left`}
              {!s.active && ' · inactive'}</span></span>
            <span className="row">
              <button onClick={() => { setEditId(s.id); setForm(s) }}>Edit</button>
              <button className="danger" onClick={run(async () => { if (confirm(`Delete plan "${s.plan_name}"?`)) { await api.deleteSubscription(s.id); await load(); onChanged() } })}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      {form ? (
        <div className="form-grid subform">
          <label>Plan<input value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} /></label>
          <label>Amount<input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label>Currency<CurrencySelect value={form.currency} onChange={(currency) => setForm({ ...form, currency })} /></label>
          <label>Cycle<select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value as Cycle })}>
            {CYCLES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Next due<input type="date" value={form.next_due_date ?? ''} onChange={(e) => setForm({ ...form, next_due_date: e.target.value || null })} /></label>
          <label>Ends on<input type="date" value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} /></label>
          <label>Installments left<input type="number" min={0} value={form.remaining_installments ?? ''}
            onChange={(e) => setForm({ ...form, remaining_installments: e.target.value ? Number(e.target.value) : null })} /></label>
          <label className="check"><input type="checkbox" checked={form.auto_renew} onChange={(e) => setForm({ ...form, auto_renew: e.target.checked })} />Auto-renew</label>
          <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Active</label>
          <div className="full row">
            <button className="primary" disabled={!form.plan_name || form.amount === ''} onClick={save}>Save plan</button>
            <button onClick={() => { setForm(null); setEditId(null) }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setForm(blank)}>+ Add plan</button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function Payments({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [items, setItems] = useState<Payment[]>([])
  const [form, setForm] = useState<PaymentIn | null>(null)
  const { error, run } = useError()
  const load = useCallback(() => api.payments(account.id).then(setItems), [account.id])
  useEffect(() => { load() }, [load])

  return (
    <section className="card">
      <h3>Payments & top-ups</h3>
      <ul className="list">
        {items.slice(0, 20).map((p) => (
          <li key={p.id}>
            <span>{shortDate(p.paid_on)} · {p.kind} · <strong>{p.amount} {p.currency}</strong>{p.note && <span className="muted small"> · {p.note}</span>}</span>
            <button className="danger" onClick={run(async () => { await api.deletePayment(p.id); await load(); onChanged() })}>Delete</button>
          </li>
        ))}
      </ul>
      {form ? (
        <div className="form-grid subform">
          <label>Type<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PaymentKind })}>
            {PAYMENT_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
          <label>Amount<input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label>Currency<CurrencySelect value={form.currency} onChange={(currency) => setForm({ ...form, currency })} /></label>
          <label>Date<input type="date" value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} /></label>
          <label className="full">Note<input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value || null })} /></label>
          <div className="full row">
            <button className="primary" disabled={form.amount === ''} onClick={run(async () => {
              await api.createPayment(account.id, form); setForm(null); await load(); onChanged()
            })}>Save payment</button>
            <button onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setForm({ kind: 'topup', amount: '', currency: 'USD', paid_on: today(), note: null })}>+ Add payment</button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
