import { useEffect } from 'react'

export type MenuAction = 'profile' | 'add_widget' | 'reorder' | 'configure'

/** Slide-in menu area (top-right ☰). Items below the divider are placeholders for future features. */
export function MenuDrawer({ onPick, onClose }: { onPick: (a: MenuAction) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <nav className="drawer" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <strong>Menu</strong>
          <button className="icon-btn" aria-label="Close menu" onClick={onClose}>✕</button>
        </div>
        <button className="drawer-item" onClick={() => onPick('profile')}>👤 Profile</button>
        <button className="drawer-item" onClick={() => onPick('add_widget')}>➕ Add widget</button>
        <button className="drawer-item" onClick={() => onPick('reorder')}>↕ Reorder widgets</button>
        <button className="drawer-item" onClick={() => onPick('configure')}>⚙ Configure subscriptions</button>
        <hr />
        <div className="placeholder-slot">Menu area — reserved for future items</div>
      </nav>
    </div>
  )
}
