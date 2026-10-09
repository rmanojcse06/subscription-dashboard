from datetime import timedelta
from decimal import Decimal

import httpx

from app.db import SessionLocal
from app.models import BalanceSnapshot, SnapshotSource, utcnow
from tests.test_flavours import quick_add


def put_widget(client, w, **fields):
    resp = client.put(f"/api/widgets/{w['id']}", json={"account_id": w["account_id"], **fields})
    assert resp.status_code == 200, resp.text
    return resp.json()


def snapshot(account_id, minutes_ago, balance, tokens_today=None):
    t = utcnow() - timedelta(minutes=minutes_ago)
    detail = {"tokens": {"today": tokens_today, "last_30d": tokens_today}} if tokens_today is not None else {}
    with SessionLocal() as db:
        db.add(BalanceSnapshot(account_id=account_id, balance=Decimal(balance), currency="USD", source=SnapshotSource.api,
                               detail=detail, fetched_at=t, checked_at=t))
        db.commit()


def test_status_online_failed_exhausted(client, mock_http):
    w = quick_add(client, flavour="openrouter", name="OR", secret="sk-or-x")
    assert w["status"] == "no_data"

    mock_http(lambda r: httpx.Response(200, json={"data": {"total_credits": 5, "total_usage": 1}}))
    assert client.post(f"/api/widgets/{w['id']}/refresh").json()["status"] == "online"

    m = quick_add(client, flavour="generic", name="Manual", reading={"values": {"balance": "3"}})
    assert m["status"] == "manual"
    client.post(f"/api/accounts/{m['account_id']}/readings", json={"values": {"balance": "0"}})
    statuses = {x["account_name"]: x["status"] for x in client.get("/api/widgets").json()}
    assert statuses["Manual"] == "exhausted"


def test_status_failed_beats_everything(client, mock_http):
    w = quick_add(client, flavour="deepseek", name="DS", secret="sk-x")
    mock_http(lambda r: httpx.Response(401))
    assert client.post(f"/api/widgets/{w['id']}/refresh").json()["status"] == "failed"


def test_overusage_tokens_per_hour(client):
    w = quick_add(client, flavour="openrouter", name="OR", secret="sk-or-x")
    acc = w["account_id"]
    snapshot(acc, 90, "10.00", tokens_today=1_000_000)
    snapshot(acc, 1, "9.00", tokens_today=3_500_000)   # +2.5M in the last ~hour
    w = put_widget(client, w, overuse_metric="tokens", overuse_window="hour", overuse_limit="2000000")
    assert w["usage"]["tokens_hour"] == 2_500_000
    assert w["status"] == "overusage" and float(w["overuse_value"]) == 2_500_000

    w = put_widget(client, w, overuse_metric="tokens", overuse_window="hour", overuse_limit="3000000")
    assert w["status"] == "online"


def test_overusage_spend_per_day(client):
    w = quick_add(client, flavour="generic", name="G")
    acc = w["account_id"]
    snapshot(acc, 600, "20")
    snapshot(acc, 5, "14")  # spent 6 today
    w = put_widget(client, w, overuse_metric="spend", overuse_window="day", overuse_limit="5")
    assert float(w["usage"]["spend_day"]) == 6 and w["status"] == "overusage"
    w = put_widget(client, w, overuse_metric=None)
    assert w["status"] == "manual" and w["overuse_value"] is None


def test_tokens_hour_unknown_without_history(client):
    w = quick_add(client, flavour="openrouter", name="OR", secret="sk-or-x")
    snapshot(w["account_id"], 2, "5", tokens_today=10)
    assert client.get("/api/widgets").json()[0]["usage"]["tokens_hour"] is None
