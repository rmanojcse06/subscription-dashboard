from datetime import date, timedelta

import httpx

from app.db import SessionLocal
from app.models import Secret


def make_account(client, **overrides):
    body = {"name": "Netflix", "category": "streaming"} | overrides
    resp = client.post("/api/accounts", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_secret_is_encrypted_and_never_listed(client):
    acc = make_account(client, name="OpenRouter", category="ai_api")
    resp = client.post(f"/api/accounts/{acc['id']}/secrets", json={"label": "main", "value": "sk-or-abcd1234"})
    assert resp.status_code == 201
    created = resp.json()
    assert "value" not in created and created["hint"] == "1234"

    with SessionLocal() as db:
        stored = db.get(Secret, created["id"])
        assert "sk-or-abcd1234" not in stored.ciphertext

    listed = client.get(f"/api/accounts/{acc['id']}/secrets").json()
    assert "sk-or-abcd1234" not in str(listed)

    revealed = client.post(f"/api/secrets/{created['id']}/reveal").json()
    assert revealed["value"] == "sk-or-abcd1234"


def test_only_one_sync_secret_per_account(client):
    acc = make_account(client, name="DeepSeek", category="ai_api")
    url = f"/api/accounts/{acc['id']}/secrets"
    client.post(url, json={"label": "old", "value": "sk-1", "use_for_sync": True})
    client.post(url, json={"label": "new", "value": "sk-2", "use_for_sync": True})
    flags = {s["label"]: s["use_for_sync"] for s in client.get(url).json()}
    assert flags == {"old": False, "new": True}


def test_summary_normalises_to_monthly_per_currency(client):
    acc = make_account(client)
    soon = (date.today() + timedelta(days=5)).isoformat()
    url = f"/api/accounts/{acc['id']}/subscriptions"
    client.post(url, json={"plan_name": "Premium", "amount": "649", "cycle": "monthly", "next_due_date": soon})
    client.post(url, json={"plan_name": "Yearly", "amount": "1200", "cycle": "yearly"})
    client.post(url, json={"plan_name": "Credits", "amount": "10", "currency": "USD", "cycle": "prepaid"})

    s = client.get("/api/summary").json()
    assert s["monthly_total_by_currency"] == {"INR": "749.00"}
    assert [u["plan_name"] for u in s["upcoming_dues"]] == ["Premium"]


def test_sync_deepseek_stores_snapshot(client, mock_http):
    acc = make_account(client, name="DeepSeek", category="ai_api", flavour="deepseek")
    client.post(f"/api/accounts/{acc['id']}/secrets", json={"label": "k", "value": "sk-ds", "use_for_sync": True})

    def handler(request: httpx.Request):
        assert request.headers["Authorization"] == "Bearer sk-ds"
        return httpx.Response(200, json={
            "is_available": True,
            "balance_infos": [{"currency": "CNY", "total_balance": "5.00"}, {"currency": "USD", "total_balance": "7.25"}],
        })

    mock_http(handler)
    snap = client.post(f"/api/accounts/{acc['id']}/sync").json()
    assert snap["currency"] == "USD" and float(snap["balance"]) == 7.25
    assert client.get("/api/summary").json()["latest_balances"][0]["id"] == snap["id"]


def test_sync_auth_failure_is_502_without_leaking_key(client, mock_http):
    acc = make_account(client, name="OR", category="ai_api", flavour="openrouter")
    client.post(f"/api/accounts/{acc['id']}/secrets", json={"label": "k", "value": "sk-secret", "use_for_sync": True})
    mock_http(lambda r: httpx.Response(401, json={"error": "bad key"}))
    resp = client.post(f"/api/accounts/{acc['id']}/sync")
    assert resp.status_code == 502
    assert "sk-secret" not in resp.text


def test_sync_all_reports_per_account(client, mock_http):
    acc = make_account(client, name="RunPod", category="cloud", flavour="runpod")
    client.post(f"/api/accounts/{acc['id']}/secrets", json={"label": "k", "value": "rp", "use_for_sync": True})
    make_account(client, name="AWS", category="cloud", flavour="aws")  # no secret
    mock_http(lambda r: httpx.Response(200, json={"data": {"myself": {"clientBalance": 12.5, "currentSpendPerHr": 0}}}))
    results = client.post("/api/sync").json()
    assert results["RunPod"] == "ok"
    assert "no secret" in results["AWS"]
