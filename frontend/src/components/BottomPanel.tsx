import { useEffect, useState } from 'react'
import type { Profile, Secret, Subscription } from '../api'
import { displayMoney, shortDate } from '../format'

interface Summary {
  upcoming_dues: Subscription[]
  expiring_secrets: Secret[]
}

/** Bottom panel: important notices (dues in 7 days, expiring keys) + a reserved slot for ads / announcements. */
export function BottomPanel({ profile, accountNames, reloadKey }: { profile: Profile; accountNames: Map<number, string>; reloadKey: number }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  useEffect(() => {
    fetch('/api/summary?days=7')
      .then((r) => (r.ok ? r.json() : null))
      .then(setSummary, () => setSummary(null))
  }, [reloadKey])

  const notices = [
    ...(summary?.upcoming_dues ?? []).map((s) => ({
      key: `due-${s.id}`,
      text: `${accountNames.get(s.account_id) ?? 'Bill'} · ${s.plan_name}: ${displayMoney(s.amount, s.currency, profile).text} due ${shortDate(s.next_due_date!)}`,
    })),
    ...(summary?.expiring_secrets ?? []).map((s) => ({
      key: `key-${s.id}`,
      text: `${accountNames.get(s.account_id) ?? 'Account'} key "${s.label}" expires ${shortDate(s.expires_on!)}`,
    })),
  ]

  return (
    <footer className="bottom-panel">
      <section className="notices" aria-label="Important info">
        <h3>Important</h3>
        {notices.length === 0 ? (
          <p className="muted small">Nothing due in the next 7 days.</p>
        ) : (
          <ul>{notices.map((n) => <li key={n.key}>{n.text}</li>)}</ul>
        )}
      </section>
      <aside className="placeholder-slot ad-slot" aria-label="Announcements">
        Reserved space: advertisement / announcements
      </aside>
    </footer>
  )
}
