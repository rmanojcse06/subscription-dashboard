import { useState } from 'react'
import { api, type Profile } from '../api'
import { Dialog } from './Dialog'
import { CurrencySelect } from './CurrencySelect'
import { fxRate } from '../format'

const MAX_AVATAR_BYTES = 250_000

/** Unless the rate is set by hand, the pair's rate follows the fetched daily rates (the backend does the same on save). */
function withAutoRate(p: Profile): Profile {
  const r = p.rate_manual ? null : fxRate(p.currency_a, p.currency_b, p)
  return r === null ? p : { ...p, rate_a_to_b: String(+r.toFixed(6)) }
}

export function SettingsDialog({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: (p: Profile) => void }) {
  const [form, setForm] = useState(profile)
  const [msg, setMsg] = useState<string | null>(null)

  const pickAvatar = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_AVATAR_BYTES) return setMsg('Image too large (max 250 KB)')
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, avatar: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  const setPair = (key: 'currency_a' | 'currency_b', v: string) =>
    setForm((f) => {
      const next = { ...f, [key]: v.toUpperCase().slice(0, 3) }
      // Keep the toggle pointing at a member of the pair.
      if (next.display_currency !== next.currency_a && next.display_currency !== next.currency_b) next.display_currency = next.currency_a
      return withAutoRate(next)
    })

  const updateRates = async () => {
    try {
      const p = await api.refreshFx()
      setForm((f) => withAutoRate({ ...f, fx_rates: p.fx_rates, fx_date: p.fx_date, fx_error: p.fx_error }))
      onSaved(p)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  const save = async () => {
    try {
      onSaved(await api.saveProfile(form))
      onClose()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <Dialog title="Profile" onClose={onClose}>
      <div className="form-grid">
        <div className="full row">
          <Avatar profile={form} size={56} />
          <label className="grow">Profile picture<input type="file" accept="image/*" onChange={(e) => pickAvatar(e.target.files?.[0])} /></label>
          {form.avatar && <button onClick={() => setForm({ ...form, avatar: null })}>Remove</button>}
        </div>
        <label className="full">Display name<input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>

        <fieldset className="full">
          <legend>Currency toggle pair</legend>
          <div className="row">
            <span>1</span>
            <CurrencySelect value={form.currency_a} exclude={form.currency_b} label="First currency" onChange={(c) => setPair('currency_a', c)} />
            <span>=</span>
            <input type="number" step="any" min="0" value={form.rate_a_to_b} readOnly={!form.rate_manual}
              onChange={(e) => setForm({ ...form, rate_a_to_b: e.target.value })} aria-label="Exchange rate" />
            <CurrencySelect value={form.currency_b} exclude={form.currency_a} label="Second currency" onChange={(c) => setPair('currency_b', c)} />
          </div>
          <div className="row">
            <label className="row">
              <input type="checkbox" checked={form.rate_manual} onChange={(e) => setForm(withAutoRate({ ...form, rate_manual: e.target.checked }))} />
              Set this rate by hand
            </label>
            <button type="button" onClick={updateRates}>Update rates</button>
          </div>
          <p className={`small ${form.fx_error ? 'error' : 'muted'}`}>
            {form.fx_error ?? (form.fx_date ? `Daily ECB exchange rates from ${form.fx_date}.` : 'Exchange rates not fetched yet.')}{' '}
            Widgets in any other currency are converted with these rates; ones without a rate are shown unconverted.
          </p>
          <label className="row">
            Default for widgets
            <select value={form.display_currency} onChange={(e) => setForm({ ...form, display_currency: e.target.value })}>
              <option value={form.currency_a}>{form.currency_a}</option>
              <option value={form.currency_b}>{form.currency_b}</option>
            </select>
            <span className="muted small">Clicking a widget's currency chip switches just that widget.</span>
          </label>
        </fieldset>

        <fieldset className="full">
          <legend>Time</legend>
          <div className="row">
            <label>Default refresh (seconds)<input type="number" min={30} value={form.default_refresh_seconds}
              onChange={(e) => setForm({ ...form, default_refresh_seconds: Number(e.target.value) })} /></label>
            <label>Clock<select value={form.time_format} onChange={(e) => setForm({ ...form, time_format: e.target.value as '12h' | '24h' })}>
              <option value="12h">12-hour</option><option value="24h">24-hour</option></select></label>
          </div>
        </fieldset>

        <div className="full row">
          <button className="primary" onClick={save}>Save</button>
          {msg && <span className="error">{msg}</span>}
        </div>
      </div>
    </Dialog>
  )
}

export function Avatar({ profile, size = 36 }: { profile: Pick<Profile, 'avatar' | 'display_name'>; size?: number }) {
  return profile.avatar ? (
    <img className="avatar" src={profile.avatar} alt="" width={size} height={size} />
  ) : (
    <span className="avatar avatar-initial" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden>
      {profile.display_name.charAt(0).toUpperCase()}
    </span>
  )
}
