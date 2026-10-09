import { useCallback, useEffect, useState } from 'react'
import { api, type Profile, type WidgetStatus, type WidgetView } from '../api'
import { tileStyle } from '../colors'
import { flavourUI, fieldDef } from '../flavours'
import { ALERT_LABEL, convert, displayMoney, stamp, widgetProfile } from '../format'
import { Icon } from './icons'

const STATUS_LABEL: Record<WidgetStatus, string> = {
  failed: 'failed', exhausted: 'exhausted', overusage: 'overusage', online: 'online', manual: 'manual', no_data: 'no data',
}

/**
 * Compact tile (small name in the corner, status badge, big amount) in a fixed-size slot. On hover / focus the card
 * grows over its neighbours to show the alert flag and configured metadata, with the configurable tooltip below it.
 */
export function WidgetTile({
  widget,
  profile: globalProfile,
  onOpen,
  onConfigure,
  onMove,
  onRemoved,
  onChange,
}: {
  widget: WidgetView
  profile: Profile
  onOpen: () => void
  onConfigure: () => void
  onMove: () => void
  onRemoved: (id: number) => void
  onChange: (w: WidgetView) => void
}) {
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      onChange(await api.refreshWidget(widget.id))
    } catch {
      /* network error to our own backend; tile keeps last values */
    } finally {
      setBusy(false)
    }
  }, [widget.id, onChange])

  // Auto-refresh at the widget's effective interval (default 150 s, never below the provider's minimum).
  useEffect(() => {
    const t = setInterval(refresh, widget.refresh_seconds * 1000)
    return () => clearInterval(t)
  }, [refresh, widget.refresh_seconds])

  const remove = async () => {
    if (!confirm(`Remove the "${widget.title ?? widget.account_name}" widget? The account and its history are kept.`)) return
    await api.deleteWidget(widget.id)
    onRemoved(widget.id)
  }

  const w = widget
  const profile = widgetProfile(globalProfile, w) // this tile's own currency choice
  const toggleCurrency = async () => {
    const next = profile.display_currency === profile.currency_a ? profile.currency_b : profile.currency_a
    onChange({ ...w, display_currency: next }) // instant; confirmed by the server below
    try {
      onChange(await api.setWidgetCurrency(w.id, next))
    } catch {
      onChange(w)
    }
  }
  const name = w.title ?? w.account_name
  const head = flavourUI(w.flavour).headline(w, profile)
  const alertLabel = w.alert_kind ? ALERT_LABEL[w.alert_kind] ?? 'Problem' : null
  const ring = w.status === 'failed' || w.status === 'exhausted' ? 'critical' : w.status === 'overusage' || w.state === 'low' ? 'warning' : 'ok'
  const flag = alertLabel ?? (w.state === 'low' ? 'Running low' : null)
  const converted = w.currency && w.currency !== profile.display_currency && displayMoney(1, w.currency, profile).converted
  const tipId = `tip-${w.id}`
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation() // controls inside the card must not also trigger the card's own click (= expand)
    fn()
  }

  return (
    <div className={`tile-slot tile-${w.size}`}>
      <div className={`tile tone-${ring}`} style={tileStyle(w.color)} onClick={onOpen} aria-describedby={tipId}>
        <div className="tile-actions" role="toolbar" aria-label={`${name} actions`}>
          <button className="tile-act tile-act-expand" onClick={act(onOpen)} aria-label={`Expand ${name}`} title="Expand">
            <Icon name="expand" />
          </button>
          <button className="tile-act tile-act-move" onClick={act(onMove)} aria-label={`Change position of ${name}`} title="Move / reorder">
            <Icon name="move" />
          </button>
          <button className="tile-act tile-act-configure" onClick={act(onConfigure)} aria-label={`Configure ${name}`} title="Configure">
            <Icon name="settings" />
          </button>
          <button className="tile-act tile-act-remove" onClick={act(remove)} aria-label={`Remove ${name}`} title="Remove">
            <Icon name="trash" />
          </button>
        </div>

        <div className="tile-name">{name}</div>
        <span className={`tile-badge badge-${w.status}`}>{STATUS_LABEL[w.status]}</span>
        <div className="tile-body">
          <div className="tile-figure">
            <span className="tile-amount">{w.state === 'exhausted' ? 'Exhausted' : head.text}</span>
            {w.tile_fields.includes('currency') && head.unit && w.state !== 'exhausted' && (
              <button
                className="tile-cur"
                onClick={act(toggleCurrency)}
                title={`Switch to ${profile.display_currency === profile.currency_a ? profile.currency_b : profile.currency_a}`}
                aria-label={`Showing ${head.unit}. Switch currency`}
              >
                {head.unit}
              </button>
            )}
          </div>
          {w.sync_provider && (
            <button
              className={`tile-refresh${busy ? ' spinning' : ''}`}
              onClick={act(refresh)}
              disabled={busy}
              aria-label={`Refresh ${name} now`}
              title="Refresh now"
            >
              <Icon name="refresh" size={16} />
            </button>
          )}
        </div>

        {/* Revealed when the card expands on hover / focus */}
        <div className="tile-more">
          {flag && (
            <div className={`tile-flag flag-${ring}`}>
              <span aria-hidden>{ring === 'critical' ? '⛔' : '⚠'}</span> {flag}
            </div>
          )}
          {w.tile_fields
            .filter((f) => f !== 'currency')
            .map((f) => {
              const def = fieldDef(w.flavour, f)
              const text = def ? (def.tile ? def.tile(w, profile) : `${def.label}: ${def.render(w, profile)}`) : ''
              return text ? (
                <div key={f} className="tile-meta">
                  {text}
                </div>
              ) : null
            })}
        </div>

        <div className="tooltip" role="tooltip" id={tipId} onClick={(e) => e.stopPropagation()}>
          {w.alert_message && (
            <p className={`tip-alert tone-${ring}`}>
              {w.alert_message}
              {w.alert_at && <span className="muted"> · {stamp(w.alert_at, profile)}</span>}
            </p>
          )}
          {w.state === 'exhausted' && w.exhausted_at && (
            <p className="tip-alert tone-critical">Exhausted since {stamp(w.exhausted_at, profile)}</p>
          )}
          {w.status === 'overusage' && (
            <p className="tip-alert tone-warning">Over the limit: {fieldDef(w.flavour, 'overuse')!.render(w, profile)}</p>
          )}
          {converted && (
            <p className="muted small">
              Converted from {w.currency} at 1 {w.currency} = {+convert(1, w.currency!, profile.display_currency, profile)!.toPrecision(4)} {profile.display_currency}
            </p>
          )}
          <dl>
            {w.tooltip_fields.map((f) => {
              const def = fieldDef(w.flavour, f)
              return def ? (
                <div key={f} className="tip-row">
                  <dt>{def.label}</dt>
                  <dd>{def.render(w, profile)}</dd>
                </div>
              ) : null
            })}
          </dl>
          {w.tooltip_fields.length === 0 && <p className="muted small">No tooltip fields selected. Use ⚙ to pick some.</p>}
        </div>
      </div>
    </div>
  )
}
