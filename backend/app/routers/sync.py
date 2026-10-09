from datetime import timedelta
from typing import NoReturn

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from .. import crypto
from ..deps import DB, AccountDep, HttpClient
from ..models import Account, BalanceSnapshot, SnapshotSource, utcnow
from ..flavours import flavour_of
from ..providers import REGISTRY, BalanceResult, ProviderError
from ..schemas import ManualSnapshotIn, ProviderOut, ReadingIn, SnapshotOut

router = APIRouter(tags=["sync"])


@router.get("/providers", response_model=list[ProviderOut])
def list_providers():
    return [
        ProviderOut(
            key=p.key, label=p.label, credential_format=p.credential_format, min_interval_seconds=p.min_interval_seconds
        )
        for p in REGISTRY.values()
    ]


def record(account: Account, db, result: BalanceResult, source: SnapshotSource) -> BalanceSnapshot:
    """Store an observation. Same values as the latest snapshot → only bump checked_at (see BalanceSnapshot).
    For manual readings "same" also covers the reading fields (e.g. data left, validity)."""
    latest = account.snapshots[-1] if account.snapshots else None
    now = utcnow()
    if (
        latest is not None
        and latest.balance == result.balance
        and latest.spend == result.spend
        and latest.currency == result.currency
        and (latest.detail or {}).get("reading") == result.detail.get("reading")
    ):
        latest.checked_at = now
        latest.detail = result.detail or latest.detail
        latest.source = source
        db.commit()
        return latest
    snap = BalanceSnapshot(
        account=account,
        balance=result.balance,
        spend=result.spend,
        currency=result.currency,
        source=source,
        detail=result.detail,
        fetched_at=now,
        checked_at=now,
    )
    db.add(snap)
    db.commit()
    return snap


def provider_of(account: Account):
    return REGISTRY.get(flavour_of(account).provider or "")


def sync(account: Account, db, client) -> BalanceSnapshot:
    provider = provider_of(account)
    if provider is None:
        raise HTTPException(400, f"Account '{account.name}' has no live API (flavour '{account.flavour}')")
    latest = account.snapshots[-1] if account.snapshots else None
    if (
        latest is not None
        and latest.source == SnapshotSource.api
        and utcnow() - latest.checked_at < timedelta(seconds=provider.min_interval_seconds)
    ):
        return latest
    secret = next((s for s in account.secrets if s.use_for_sync), None)
    if secret is None:
        _fail(account, db, "no_key", f"Account '{account.name}' has no secret marked use_for_sync", 400)
    try:
        result = provider.fetch(crypto.decrypt(secret.ciphertext), client)
    except ProviderError as e:
        _fail(account, db, e.kind, str(e), 502)
    except httpx.TimeoutException:
        _fail(account, db, "unreachable", f"{provider.label} API timed out", 502)
    except httpx.HTTPError:
        _fail(account, db, "unreachable", f"{provider.label} API is unreachable", 502)
    account.sync_error = account.sync_error_kind = account.sync_error_at = None
    return record(account, db, result, SnapshotSource.api)


def _fail(account: Account, db, kind: str, message: str, status: int) -> NoReturn:
    """Remember the failure on the account (shown on its widget) and raise."""
    account.sync_error, account.sync_error_kind, account.sync_error_at = message, kind, utcnow()
    db.commit()
    raise HTTPException(status, message)


@router.post("/accounts/{account_id}/sync", response_model=SnapshotOut)
def sync_account(account: AccountDep, db: DB, client: HttpClient):
    return sync(account, db, client)


@router.post("/sync")
def sync_all(db: DB, client: HttpClient) -> dict[str, str]:
    """Sync every account that has a provider. Returns {account name: "ok" | error message}."""
    results = {}
    for account in db.scalars(select(Account)).all():
        if provider_of(account) is None:
            continue
        try:
            sync(account, db, client)
            results[account.name] = "ok"
        except HTTPException as e:
            results[account.name] = e.detail
    return results


@router.post("/accounts/{account_id}/snapshots", response_model=SnapshotOut, status_code=201)
def add_manual_snapshot(body: ManualSnapshotIn, account: AccountDep, db: DB):
    if body.balance is None and body.spend is None:
        raise HTTPException(422, "Provide balance or spend")
    result = BalanceResult(currency=body.currency, balance=body.balance, spend=body.spend)
    return record(account, db, result, SnapshotSource.manual)


@router.post("/accounts/{account_id}/readings", response_model=SnapshotOut, status_code=201)
def add_reading(body: ReadingIn, account: AccountDep, db: DB):
    """Manual entry for flavours with a Reading model (prepaid mobile validity/data, DTH balance, ...)."""
    flavour = flavour_of(account)
    if flavour.Reading is None:
        raise HTTPException(422, f"Flavour '{flavour.key}' has no manual readings")
    try:
        reading = flavour.Reading.model_validate(body.values)
    except ValidationError as e:
        raise HTTPException(422, e.errors(include_url=False, include_context=False)) from None
    values = reading.model_dump(mode="json")
    balance = getattr(reading, flavour.money_field) if flavour.money_field else None
    result = BalanceResult(
        currency=body.currency or flavour.default_currency, balance=balance, detail={"reading": values}
    )
    return record(account, db, result, SnapshotSource.manual)


@router.get("/accounts/{account_id}/snapshots", response_model=list[SnapshotOut])
def list_snapshots(account: AccountDep):
    return list(reversed(account.snapshots))
