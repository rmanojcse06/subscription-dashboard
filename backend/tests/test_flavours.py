from datetime import date, timedelta

import httpx

from app.flavours import FLAVOURS


def quick_add(client, **body):
    resp = client.post("/api/flavours/widgets", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_every_flavour_describes_itself(client):
    flavours = {f["key"]: f for f in client.get("/api/flavours").json()}
    assert set(flavours) == set(FLAVOURS)
    assert flavours["openrouter"]["source"] == "api" and flavours["netflix"]["source"] == "manual"
    assert "validity_until" in flavours["prepaid_mobile"]["reading_schema"]["properties"]
    for f in flavours.values():  # defaults must be renderable by the flavour
        assert set(f["tile_fields"] + f["tooltip_fields"]) <= set(f["fields"]), f["key"]


def test_api_flavour_needs_key_and_syncs(client, mock_http):
    resp = client.post("/api/flavours/widgets", json={"flavour": "openrouter", "name": "OpenRouter"})
    assert resp.status_code == 422
    w = quick_add(client, flavour="openrouter", name="OpenRouter", secret="sk-or-abcd")
    assert w["sync_provider"] == "openrouter" and w["state"] == "no_data"
    assert "tokens_today" in w["tooltip_fields"]

    mock_http(lambda r: httpx.Response(200, json={"data": {"total_credits": 10, "total_usage": 1}}))
    w = client.post(f"/api/widgets/{w['id']}/refresh").json()
    assert float(w["balance"]) == 9 and w["extra"]["total_credits"] == 10


def test_netflix_plan_flavour(client):
    due = (date.today() + timedelta(days=1)).isoformat()
    plan = {"plan_name": "Premium", "amount": "649", "currency": "INR", "cycle": "monthly", "next_due_date": due}
    w = quick_add(client, flavour="netflix", name="Netflix", config={"plan_tier": "Premium", "registered_mobile": "98xxxxxx01"}, plan=plan)
    assert w["flavour_config"]["plan_tier"] == "Premium"
    assert w["plan"]["amount"] == "649.00" or float(w["plan"]["amount"]) == 649
    assert w["state"] == "low"  # renews within 2 days
    assert client.post("/api/flavours/widgets", json={"flavour": "netflix", "name": "N"}).status_code == 422  # plan required


def test_prepaid_mobile_readings_drive_state(client):
    w = quick_add(
        client, flavour="prepaid_mobile", name="Jio", config={"mobile_number": "9800000001", "operator": "Jio"},
        reading={"values": {"validity_until": (date.today() + timedelta(days=20)).isoformat(), "data_left_gb": "1.5"}},
    )
    assert w["state"] == "ok" and w["reading"]["data_left_gb"] == "1.5"

    acc = w["account_id"]
    past = (date.today() - timedelta(days=1)).isoformat()
    assert client.post(f"/api/accounts/{acc}/readings", json={"values": {"validity_until": past}}).status_code == 201
    w = client.get("/api/widgets").json()[0]
    assert w["state"] == "exhausted"

    bad = client.post(f"/api/accounts/{acc}/readings", json={"values": {"data_left_gb": "-1"}})
    assert bad.status_code == 422


def test_config_validated_against_flavour(client):
    resp = client.post("/api/flavours/widgets", json={"flavour": "prepaid_mobile", "name": "x", "config": {"operator": "Nope"}})
    assert resp.status_code == 422
    assert client.post("/api/flavours/widgets", json={"flavour": "nope", "name": "x"}).status_code == 422


def test_flavour_specific_fields_rejected_elsewhere(client):
    w = quick_add(client, flavour="generic", name="Thing")
    body = {"account_id": w["account_id"], "tile_fields": ["validity"]}
    assert client.put(f"/api/widgets/{w['id']}", json=body).status_code == 422


def test_dth_reading_uses_money_field(client):
    w = quick_add(client, flavour="tv_subscription", name="Tata Play", config={"daily_charge": "12"},
                  reading={"values": {"balance": "0"}})
    assert w["state"] == "exhausted" and w["currency"] == "INR"
