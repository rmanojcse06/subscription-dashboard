from datetime import date
from decimal import Decimal

import httpx

from .base import BalanceResult, check


class OpenRouter:
    key = "openrouter"
    label = "OpenRouter"
    credential_format = "API key (sk-or-...); /credits and /activity may require a management key"
    min_interval_seconds = 60

    def fetch(self, credential: str, client: httpx.Client) -> BalanceResult:
        auth = {"Authorization": f"Bearer {credential}"}
        data = check(client.get("https://openrouter.ai/api/v1/credits", headers=auth), self.label)["data"]
        total = Decimal(str(data["total_credits"]))
        used = Decimal(str(data["total_usage"]))
        detail = dict(data)
        if (tokens := self._tokens(client, auth)) is not None:
            detail["tokens"] = tokens
        return BalanceResult(currency="USD", balance=total - used, spend=used, detail=detail)

    def _tokens(self, client: httpx.Client, auth: dict) -> dict | None:
        """Best effort: per-day activity (last 30 days). Skipped silently if the key can't read it."""
        try:
            resp = client.get("https://openrouter.ai/api/v1/activity", headers=auth)
            rows = resp.json()["data"] if resp.is_success else None
        except (httpx.HTTPError, ValueError, KeyError):
            return None
        if not isinstance(rows, list):
            return None
        today = date.today().isoformat()
        total = lambda rs: sum(int(r.get("prompt_tokens") or 0) + int(r.get("completion_tokens") or 0) for r in rs)
        return {"today": total(r for r in rows if str(r.get("date", "")).startswith(today)), "last_30d": total(rows)}
