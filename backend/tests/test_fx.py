from decimal import Decimal

import httpx
import pytest

from app.config import settings

PROFILE = {"display_name": "Me", "currency_a": "EUR", "currency_b": "INR", "rate_a_to_b": "88", "display_currency": "EUR"}


@pytest.fixture
def fx(monkeypatch, mock_http):
    """Serve fake ECB rates (1 USD = 0.9 EUR = 90 INR) and count the fetches."""
    monkeypatch.setattr(settings, "fx_url", "https://fx.test/latest?base=USD")
    calls = []

    def install(status=200):
        def handler(request):
            calls.append(request.url)
            body = {"base": "USD", "date": "2026-10-08", "rates": {"EUR": 0.9, "INR": 90}}
            return httpx.Response(status, json=body)

        mock_http(handler)
        return calls

    return install


def test_rates_fetched_once_and_pair_rate_derived(client, fx):
    calls = fx()
    first = client.get("/api/profile").json()
    assert first["fx_rates"] == {"USD": 1.0, "EUR": 0.9, "INR": 90.0}
    assert first["fx_date"] == "2026-10-08" and first["fx_error"] is None

    # Changing the pair to EUR/INR replaces the old USD/INR rate with the derived EUR->INR one.
    saved = client.put("/api/profile", json=PROFILE).json()
    assert Decimal(saved["rate_a_to_b"]) == Decimal("100")

    client.get("/api/profile")
    assert len(calls) == 1  # fresh rates aren't fetched again


def test_manual_pair_rate_is_kept(client, fx):
    fx()
    client.get("/api/profile")
    saved = client.put("/api/profile", json=PROFILE | {"rate_manual": True}).json()
    assert Decimal(saved["rate_a_to_b"]) == Decimal("88") and saved["rate_manual"] is True


def test_fetch_failure_keeps_profile_usable(client, fx):
    fx(status=503)
    resp = client.get("/api/profile")
    assert resp.status_code == 200
    assert resp.json()["fx_rates"] is None and resp.json()["fx_error"]


def test_forced_refresh(client, fx):
    calls = fx()
    client.get("/api/profile")
    resp = client.post("/api/profile/fx/refresh")
    assert resp.status_code == 200 and resp.json()["fx_rates"]["INR"] == 90.0
    assert len(calls) == 2
