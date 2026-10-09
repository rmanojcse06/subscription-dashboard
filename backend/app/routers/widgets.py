from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .. import metrics
from ..deps import DB, HttpClient, get_or_404
from ..models import Account, Profile, Widget, utcnow
from ..flavours import flavour_of
from ..schemas import WidgetHistory, WidgetIn, WidgetCurrency, WidgetMetrics, WidgetOrder, WidgetView
from .profile import get_profile
from .flavours import resolve_fields
from .sync import provider_of, sync

KEY_EXPIRY_WARN_DAYS = 7

router = APIRouter(prefix="/widgets", tags=["widgets"])


def alert(account: Account) -> tuple[str | None, str | None, datetime | None]:
    """Most urgent problem to show on the tile."""
    today = utcnow().date()
    dated = sorted((s for s in account.secrets if s.expires_on), key=lambda s: (not s.use_for_sync, s.expires_on))
    expired = next((s for s in dated if s.expires_on < today), None)
    if expired:
        return "key_expired", f"Key '{expired.label}' expired on {expired.expires_on:%d %b %Y}", None
    if account.sync_error_kind:
        return account.sync_error_kind, account.sync_error, account.sync_error_at
    soon = next((s for s in dated if s.expires_on <= today + timedelta(days=KEY_EXPIRY_WARN_DAYS)), None)
    if soon:
        return "key_expiring", f"Key '{soon.label}' expires on {soon.expires_on:%d %b %Y}", None
    return None, None, None


def view(w: Widget, profile: Profile) -> WidgetView:
    account = w.account
    snaps = account.snapshots
    latest = snaps[-1] if snaps else None
    flavour = flavour_of(account)
    provider = provider_of(account)
    refresh = w.refresh_seconds or profile.default_refresh_seconds
    if provider is not None:
        refresh = max(refresh, provider.min_interval_seconds)
    detail = (latest.detail or {}) if latest else {}
    tokens = detail.get("tokens", {})
    reading = detail.get("reading") or {}
    plan = next((s for s in account.subscriptions if s.active), None)
    state = flavour.state(reading, plan, utcnow().date()) or metrics.state(latest, w.low_threshold)
    alert_kind, alert_message, alert_at = alert(account)
    now = utcnow()
    use = metrics.usage(snaps, now)
    over_value = metrics.overuse_value(use, w.overuse_metric, w.overuse_window)
    overused = over_value is not None and w.overuse_limit is not None and over_value > w.overuse_limit
    return WidgetView(
        id=w.id,
        account_id=account.id,
        account_name=account.name,
        title=w.title,
        color=w.color or flavour.color,
        color_override=w.color,
        display_currency=w.display_currency,
        tile_fields=w.tile_fields,
        tooltip_fields=w.tooltip_fields,
        category=account.category,
        flavour=flavour.key,
        flavour_config=account.flavour_config or {},
        sync_provider=flavour.provider,
        position=w.position,
        size=w.size,
        refresh_seconds_override=w.refresh_seconds,
        refresh_seconds=refresh,
        low_threshold=w.low_threshold,
        state=state,
        balance=latest.balance if latest else None,
        spend=latest.spend if latest else None,
        currency=latest.currency if latest else None,
        source=latest.source if latest else None,
        last_checked_at=latest.checked_at if latest else None,
        last_used_at=metrics.last_used_at(snaps),
        exhausted_at=metrics.exhausted_at(snaps),
        alert_kind=alert_kind,
        alert_message=alert_message,
        alert_at=alert_at,
        metrics=WidgetMetrics(
            **metrics.burn(snaps, utcnow()), tokens_today=tokens.get("today"), tokens_30d=tokens.get("last_30d")
        ),
        reading=reading,
        extra={k: v for k, v in detail.items() if k not in ("reading", "tokens")},
        plan=plan,
        usage=use,
        overuse_metric=w.overuse_metric,
        overuse_window=w.overuse_window if w.overuse_metric else None,
        overuse_limit=w.overuse_limit,
        overuse_value=over_value,
        status=status(alert_kind, state, overused, provider is not None),
    )


FAILED_ALERTS = {"key_expired", "auth", "unreachable", "error", "no_key"}


def status(alert_kind: str | None, state: str, overused: bool, live: bool) -> str:
    if alert_kind in FAILED_ALERTS:
        return "failed"
    if state == "exhausted":
        return "exhausted"
    if overused:
        return "overusage"
    if state == "no_data":
        return "no_data"
    return "online" if live else "manual"


@router.get("", response_model=list[WidgetView])
def list_widgets(db: DB):
    profile = get_profile(db)
    return [view(w, profile) for w in db.scalars(select(Widget).order_by(Widget.position, Widget.id))]


@router.post("/reorder", response_model=list[WidgetView])
def reorder_widgets(body: WidgetOrder, db: DB):
    """Set the dashboard order: `ids` lists every widget id, first = leftmost."""
    widgets = {w.id: w for w in db.scalars(select(Widget))}
    if sorted(body.ids) != sorted(widgets):
        raise HTTPException(422, "ids must list every widget exactly once")
    for position, wid in enumerate(body.ids):
        widgets[wid].position = position
    db.commit()
    return list_widgets(db)


@router.post("", response_model=WidgetView, status_code=201)
def create_widget(body: WidgetIn, db: DB):
    account = get_or_404(db, Account, body.account_id)
    body.tile_fields, body.tooltip_fields = resolve_fields(flavour_of(account), body.tile_fields, body.tooltip_fields)
    w = Widget(**body.model_dump())
    db.add(w)
    db.commit()
    return view(w, get_profile(db))


@router.put("/{widget_id}", response_model=WidgetView)
def update_widget(widget_id: int, body: WidgetIn, db: DB):
    w = get_or_404(db, Widget, widget_id)
    account = get_or_404(db, Account, body.account_id)
    body.tile_fields, body.tooltip_fields = resolve_fields(flavour_of(account), body.tile_fields, body.tooltip_fields)
    for k, v in body.model_dump().items():
        setattr(w, k, v)
    db.commit()
    db.refresh(w)
    return view(w, get_profile(db))


@router.put("/{widget_id}/display-currency", response_model=WidgetView)
def set_display_currency(widget_id: int, body: WidgetCurrency, db: DB):
    """Toggle one tile's currency without touching its other settings."""
    w = get_or_404(db, Widget, widget_id)
    w.display_currency = body.display_currency
    db.commit()
    return view(w, get_profile(db))


@router.delete("/{widget_id}", status_code=204)
def delete_widget(widget_id: int, db: DB):
    db.delete(get_or_404(db, Widget, widget_id))
    db.commit()


@router.post("/{widget_id}/refresh", response_model=WidgetView)
def refresh_widget(widget_id: int, db: DB, client: HttpClient):
    """Sync from the provider API if there is one (manual accounts just re-read). A sync failure is
    shown as the tile's alert with the last known values, so the tile keeps showing something."""
    w = get_or_404(db, Widget, widget_id)
    if provider_of(w.account):
        try:
            sync(w.account, db, client)
        except HTTPException:
            pass  # recorded on the account; view() turns it into the tile's alert
    return view(w, get_profile(db))


@router.get("/{widget_id}/history", response_model=WidgetHistory)
def widget_history(widget_id: int, db: DB, days: int = 30):
    w = get_or_404(db, Widget, widget_id)
    account = w.account
    since = utcnow() - timedelta(days=days)
    # Include the last snapshot before the window so the first in-window change can be computed.
    snaps = account.snapshots
    first = next((i for i, s in enumerate(snaps) if s.fetched_at >= since), len(snaps))
    window = snaps[max(first - 1, 0):]
    daily = metrics.daily(window, since.date())
    return WidgetHistory(
        widget=view(w, get_profile(db)),
        snapshots=[s for s in window if s.fetched_at >= since],
        daily=daily,
        payments=[p for p in sorted(account.payments, key=lambda p: p.paid_on, reverse=True) if p.paid_on >= since.date()],
        subscriptions=account.subscriptions,
        total_consumed=sum((d["consumed"] for d in daily), Decimal(0)),
        total_topped_up=sum((d["topped_up"] for d in daily), Decimal(0)),
    )
