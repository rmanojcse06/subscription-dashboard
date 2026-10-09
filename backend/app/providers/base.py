from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal, Protocol

import httpx

# auth = key rejected/expired, unreachable = network/timeout/5xx, error = anything else
ErrorKind = Literal["auth", "unreachable", "error"]


class ProviderError(Exception):
    """Raised with a user-safe message (must never contain the credential)."""

    def __init__(self, message: str, kind: ErrorKind = "error"):
        super().__init__(message)
        self.kind = kind


@dataclass
class BalanceResult:
    currency: str
    balance: Decimal | None = None  # remaining prepaid credit
    spend: Decimal | None = None    # usage / cost so far
    detail: dict = field(default_factory=dict)


class Provider(Protocol):
    key: str
    label: str
    credential_format: str  # shown in the UI so the user stores the secret in the right shape
    min_interval_seconds: int  # sync calls closer together than this reuse the last snapshot

    def fetch(self, credential: str, client: httpx.Client) -> BalanceResult: ...


def check(resp: httpx.Response, label: str) -> dict:
    if resp.status_code in (401, 403):
        raise ProviderError(f"{label} rejected the key (HTTP {resp.status_code}) - it may be expired or revoked", "auth")
    if resp.status_code >= 500:
        raise ProviderError(f"{label} API is unavailable (HTTP {resp.status_code})", "unreachable")
    if resp.is_error:
        raise ProviderError(f"{label} returned HTTP {resp.status_code}")
    return resp.json()
