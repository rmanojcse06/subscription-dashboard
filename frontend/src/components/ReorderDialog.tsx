import { useState } from 'react'
import { api, type WidgetView } from '../api'
import { Dialog } from './Dialog'

/** Change the dashboard order: ↑/↓ buttons or type a position number. Saved in one call. */
export function ReorderDialog({
  widgets,
  focusId,
  onClose,
  onSaved,
}: {
  widgets: WidgetView[]
  focusId?: number
  onClose: () => void
  onSaved: (ws: WidgetView[]) => void
}) {
  const [order, setOrder] = useState(widgets)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const original = widgets.map((w) => w.id)

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= order.length || to === from) return
    const next = [...order]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setOrder(next)
  }

  const save = async () => {
    setBusy(true)
    try {
      onSaved(await api.reorderWidgets(order.map((w) => w.id)))
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog title="Widget order" onClose={onClose}>
      <p className="muted small">Position 1 is the first (left-most) widget.</p>
      <ol className="reorder-list">
        {order.map((w, i) => (
          <li key={w.id} className={`reorder-row${original[i] !== w.id ? ' moved' : ''}`}>
            <input
              className="reorder-pos"
              type="number"
              min={1}
              max={order.length}
              value={i + 1}
              autoFocus={w.id === focusId}
              aria-label={`Position of ${w.title ?? w.account_name}`}
              onChange={(e) => moveTo(i, Number(e.target.value) - 1)}
            />
            <span className="reorder-swatch" style={{ background: w.color }} aria-hidden />
            <span className="reorder-name">
              {w.title ?? w.account_name} {w.id === focusId && <span className="muted small">(this widget)</span>}
            </span>
            <button className="icon-btn" disabled={i === 0} onClick={() => moveTo(i, i - 1)} aria-label={`Move ${w.title ?? w.account_name} up`}>↑</button>
            <button className="icon-btn" disabled={i === order.length - 1} onClick={() => moveTo(i, i + 1)} aria-label={`Move ${w.title ?? w.account_name} down`}>↓</button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button className="primary" disabled={busy} onClick={save}>Save order</button>
        <button onClick={() => setOrder(widgets)}>Reset</button>
        {error && <span className="error">{error}</span>}
      </div>
    </Dialog>
  )
}
