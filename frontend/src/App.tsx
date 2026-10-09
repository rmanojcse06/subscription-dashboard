import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Account, type FlavourInfo, type Profile, type WidgetView } from './api'
import { AddWidgetDialog } from './components/AddWidgetDialog'
import { BottomPanel } from './components/BottomPanel'
import { ConfigureDialog } from './components/ConfigureDialog'
import { MenuDrawer, type MenuAction } from './components/MenuDrawer'
import { PromptBox } from './components/PromptBox'
import { ReorderDialog } from './components/ReorderDialog'
import { Avatar, SettingsDialog } from './components/SettingsDialog'
import { WidgetDialog } from './components/WidgetDialog'
import { WidgetTile } from './components/WidgetTile'

type WidgetTab = 'history' | 'configure'
type Open = MenuAction | { widget: number; tab: WidgetTab } | null

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [widgets, setWidgets] = useState<WidgetView[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [flavours, setFlavours] = useState<FlavourInfo[]>([])
  const [menu, setMenu] = useState(false)
  const [moveFocus, setMoveFocus] = useState<number | undefined>(undefined)
  // An open widget dialog is mirrored in the URL (#widget/3, #widget/3/configure) so it survives reloads.
  const [open, setOpenState] = useState<Open>(() => {
    const m = location.hash.match(/^#widget\/(\d+)(\/configure)?$/)
    return m ? { widget: Number(m[1]), tab: m[2] ? 'configure' : 'history' } : null
  })
  const setOpen = (o: Open) => {
    setOpenState(o)
    const hash = typeof o === 'object' && o !== null ? `#widget/${o.widget}${o.tab === 'configure' ? '/configure' : ''}` : ''
    history.replaceState(null, '', hash || location.pathname)
  }
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(async () => {
    try {
      const [p, w, a, f] = await Promise.all([api.profile(), api.widgets(), api.accounts(), api.flavours()])
      setFlavours(f)
      setProfile(p)
      setWidgets(w)
      setAccounts(a)
      setError(null)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setError(`Cannot reach the backend: ${(e as Error).message}. Is uvicorn running on 127.0.0.1:8000?`)
    }
  }, [])
  useEffect(() => {
    reload()
  }, [reload])

  const updateWidget = useCallback((w: WidgetView) => setWidgets((ws) => ws.map((x) => (x.id === w.id ? w : x))), [])
  const accountNames = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])

  if (!profile) return <div className="boot">{error ?? 'Loading…'}</div>
  const openWidget = typeof open === 'object' && open !== null ? widgets.find((w) => w.id === open.widget) : undefined
  const openTab: WidgetTab = typeof open === 'object' && open !== null ? open.tab : 'history'

  return (
    <div className="frame">
      {error && <div className="banner error">{error}</div>}

      <header className="top">
        <section className="widget-panel" aria-label="Billing widgets">
          {widgets.map((w) => (
            <WidgetTile
              key={w.id}
              widget={w}
              profile={profile}
              onOpen={() => setOpen({ widget: w.id, tab: 'history' })}
              onConfigure={() => setOpen({ widget: w.id, tab: 'configure' })}
              onMove={() => { setMoveFocus(w.id); setOpen('reorder') }}
              onRemoved={(id) => setWidgets((ws) => ws.filter((x) => x.id !== id))}
              onChange={updateWidget}
            />
          ))}
          <button className="tile-add" onClick={() => setOpen('add_widget')}>
            <span aria-hidden>＋</span>
            Add widget
          </button>
        </section>

        <div className="top-right">
          {/* Avatar only; hover / focus slides out the greeting. Currency is toggled from the tiles' chips. */}
          <button className="profile" onClick={() => setOpen('profile')} aria-label={`Hi, ${profile.display_name}. Profile`}>
            <span className="avatar-ring">
              <Avatar profile={profile} />
            </span>
            <span className="greeting" aria-hidden>
              Hi, {profile.display_name} <span className="wave">👋</span>
            </span>
          </button>
          <button className="icon-btn hamburger" aria-label="Open menu" onClick={() => setMenu(true)}>☰</button>
        </div>
      </header>

      <main className="middle">
        <PromptBox />
      </main>

      <BottomPanel profile={profile} accountNames={accountNames} reloadKey={reloadKey} />

      {menu && <MenuDrawer onClose={() => setMenu(false)} onPick={(a) => { setMenu(false); setOpen(a) }} />}
      {open === 'profile' && <SettingsDialog profile={profile} onClose={() => setOpen(null)} onSaved={(p) => { setProfile(p); reload() }} />}
      {open === 'add_widget' && (
        <AddWidgetDialog flavours={flavours} onClose={() => setOpen(null)} onAdded={(w) => { setWidgets((ws) => [...ws, w]); reload() }} />
      )}
      {open === 'reorder' && (
        <ReorderDialog widgets={widgets} focusId={moveFocus} onClose={() => { setOpen(null); setMoveFocus(undefined) }} onSaved={setWidgets} />
      )}
      {open === 'configure' && <ConfigureDialog flavours={flavours} onClose={() => { setOpen(null); reload() }} onChanged={() => undefined} />}
      {openWidget && (
        <WidgetDialog key={`${openWidget.id}-${openTab}`} widget={openWidget} initialTab={openTab} flavour={flavours.find((f) => f.key === openWidget.flavour)} profile={profile} onClose={() => setOpen(null)} onChange={updateWidget}
          onRemoved={() => { setOpen(null); reload() }} />
      )}
    </div>
  )
}
