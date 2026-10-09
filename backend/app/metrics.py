"""Derived metrics over an account's snapshot series (oldest first). Pure functions, no DB access."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from .models import BalanceSnapshot, utcnow

ZERO = Decimal(0)


@dataclass
class Step:
    at: datetime
    consumed: Decimal   # money used since the previous snapshot
    topped_up: Decimal  # money added since the previous snapshot


def steps(snaps: list[BalanceSnapshot]) -> list[Step]:
    """Change between consecutive snapshots. Uses balance when the provider reports one
    (a drop = consumption, a rise = top-up), otherwise spend (a rise = consumption; a drop is a
    billing-period reset, e.g. AWS month-to-date, and is ignored)."""
    out = []
    for prev, cur in zip(snaps, snaps[1:]):
        consumed = topped_up = ZERO
        if prev.balance is not None and cur.balance is not None:
            delta = cur.balance - prev.balance
            consumed, topped_up = max(-delta, ZERO), max(delta, ZERO)
        elif prev.spend is not None and cur.spend is not None:
            consumed = max(cur.spend - prev.spend, ZERO)
        out.append(Step(cur.fetched_at, consumed, topped_up))
    return out


def last_used_at(snaps: list[BalanceSnapshot]) -> datetime | None:
    return next((s.at for s in reversed(steps(snaps)) if s.consumed > 0), None)


def exhausted_at(snaps: list[BalanceSnapshot]) -> datetime | None:
    """When the current run of zero/negative balance started; None if not exhausted now."""
    since = None
    for s in reversed(snaps):
        if s.balance is None or s.balance > 0:
            break
        since = s.fetched_at
    return since


def state(latest: BalanceSnapshot | None, low_threshold: Decimal | None) -> str:
    if latest is None:
        return "no_data"
    if latest.balance is not None:
        if latest.balance <= 0:
            return "exhausted"
        if low_threshold is not None and latest.balance < low_threshold:
            return "low"
    return "ok"


def daily(snaps: list[BalanceSnapshot], since: date) -> list[dict]:
    """Consumption and top-ups per calendar day (UTC) from `since` to today, zero-filled."""
    consumed: dict[date, Decimal] = defaultdict(Decimal)
    topped: dict[date, Decimal] = defaultdict(Decimal)
    for s in steps(snaps):
        consumed[s.at.date()] += s.consumed
        topped[s.at.date()] += s.topped_up
    today = utcnow().date()
    days = (today - since).days + 1
    return [
        {"date": d, "consumed": consumed[d], "topped_up": topped[d]}
        for d in (since + timedelta(days=i) for i in range(max(days, 0)))
    ]


def burn(snaps: list[BalanceSnapshot], now: datetime, window_days: int = 7) -> dict:
    """Spend today, average daily burn over the window, and days left at that rate."""
    recent = [s for s in steps(snaps) if s.at >= now - timedelta(days=window_days)]
    today = sum((s.consumed for s in recent if s.at.date() == now.date()), ZERO)
    avg = (sum((s.consumed for s in recent), ZERO) / window_days).quantize(Decimal("0.0001"))
    latest = snaps[-1] if snaps else None
    days_left = None
    if latest is not None and latest.balance is not None and latest.balance > 0 and avg > 0:
        days_left = float((latest.balance / avg).quantize(Decimal("0.1")))
    return {"spent_today": today, "avg_daily_burn": avg, "days_left": days_left}


WINDOWS = {"hour": timedelta(hours=1), "day": timedelta(days=1)}


def tokens_today(snap: BalanceSnapshot) -> int | None:
    """Tokens used today: from the provider (OpenRouter activity) or a manual reading (Gemini)."""
    detail = snap.detail or {}
    value = (detail.get("tokens") or {}).get("today")
    if value is None:
        value = (detail.get("reading") or {}).get("tokens_today")
    return None if value is None else int(value)


def tokens_in_window(snaps: list[BalanceSnapshot], now: datetime, window: str) -> int | None:
    """Tokens used in the last hour / day. Providers only report a running "today" total, so the hourly
    figure is the change in that total since the last observation at least an hour old (approximate:
    provider activity data can lag). If the day rolled over in between, today's total is used."""
    if not snaps or (latest_tokens := tokens_today(snaps[-1])) is None:
        return None
    if window == "day":
        return latest_tokens
    cutoff = now - WINDOWS["hour"]
    base = next((s for s in reversed(snaps[:-1]) if s.checked_at <= cutoff), None)
    if base is None or (base_tokens := tokens_today(base)) is None:
        return None  # not enough history yet
    if base.checked_at.date() != snaps[-1].checked_at.date():
        return latest_tokens
    return max(latest_tokens - base_tokens, 0)


def spend_in_window(snaps: list[BalanceSnapshot], now: datetime, window: str) -> Decimal:
    since = now - WINDOWS[window]
    return sum((s.consumed for s in steps(snaps) if s.at >= since), ZERO)


def usage(snaps: list[BalanceSnapshot], now: datetime) -> dict:
    return {
        "tokens_hour": tokens_in_window(snaps, now, "hour"),
        "tokens_day": tokens_in_window(snaps, now, "day"),
        "spend_hour": spend_in_window(snaps, now, "hour"),
        "spend_day": spend_in_window(snaps, now, "day"),
    }


def overuse_value(use: dict, metric: str | None, window: str | None):
    """Current value of the widget's overusage metric (None if no rule or no data)."""
    if not metric or not window:
        return None
    return use.get(f"{metric}_{window}")
