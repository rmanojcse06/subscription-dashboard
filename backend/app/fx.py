"""Daily exchange rates (ECB, via frankfurter.dev) so any widget currency converts to the profile's pair."""

from datetime import timedelta
from decimal import Decimal

import httpx

from .config import settings
from .models import Profile, utcnow

FRESH_FOR = timedelta(hours=12)  # ECB publishes once per working day
RETRY_AFTER = timedelta(hours=1)  # after a failed fetch


def refresh_rates(profile: Profile, client: httpx.Client, force: bool = False) -> None:
    """Fetch rates if the stored ones are stale. A failure keeps the last known rates and sets fx_error."""
    if not settings.fx_url:
        return
    last = profile.fx_checked_at
    if not force and last and utcnow() - last < (RETRY_AFTER if profile.fx_error else FRESH_FOR):
        return
    profile.fx_checked_at = utcnow()
    try:
        resp = client.get(settings.fx_url, timeout=8)
        resp.raise_for_status()
        body = resp.json()
        rates = {code: float(v) for code, v in body["rates"].items()}
        rates[body.get("base", "USD")] = 1.0
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        profile.fx_error = "Couldn't fetch exchange rates; using the last known ones."
        return
    profile.fx_rates = rates
    profile.fx_date = body.get("date")
    profile.fx_error = None
    apply_pair_rate(profile)


def apply_pair_rate(profile: Profile) -> None:
    """Unless the user set it by hand, derive the pair's rate from the fetched rates."""
    rates = profile.fx_rates or {}
    a, b = profile.currency_a, profile.currency_b
    if not profile.rate_manual and a in rates and b in rates:
        profile.rate_a_to_b = Decimal(str(rates[b] / rates[a])).quantize(Decimal("0.000001"))
