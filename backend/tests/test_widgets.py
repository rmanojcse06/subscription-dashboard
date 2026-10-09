from datetime import date, timedelta

import httpx
from sqlalchemy import inspect, text
from sqlalchemy.dialects import sqlite

from tests.test_api import make_account


def add_widget(client, account_id, **overrides):
    resp = client.post("/api/widgets", json={"account_id": account_id} | overrides)
    assert resp.status_code == 201, resp.text
    return resp.json()


def manual(client, account_id, balance):
    resp = client.post(f"/api/accounts/{account_id}/snapshots", json={"balance": balance, "currency": "USD"})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_profile_defaults_and_update(client):
    p = client.get("/api/profile").json()
    assert p["default_refresh_seconds"] == 150 and p["display_currency"] == "USD"
    p |= {"display_name": "Manoj", "currency_a": "JPY", "currency_b": "USD", "rate_a_to_b": "0.0067",
          "display_currency": "JPY", "time_format": "24h"}
    assert client.put("/api/profile", json=p).json()["currency_a"] == "JPY"
    assert client.put("/api/profile", json=p | {"display_currency": "EUR"}).status_code == 422  # not in pair
    assert client.put("/api/profile", json=p | {"currency_b": "JPY"}).status_code == 422       # same twice
    assert client.put("/api/profile", json=p | {"currency_a": "yen"}).status_code == 422       # not ISO


def test_manual_widget_goes_exhausted(client):
    acc = make_account(client, name="Gemini", category="ai_api")
    w = add_widget(client, acc["id"], low_threshold="2")
    assert w["state"] == "no_data"

    manual(client, acc["id"], "10")
    manual(client, acc["id"], "10")  # unchanged → no new history row
    manual(client, acc["id"], "1.5")
    w = client.post(f"/api/widgets/{w['id']}/refresh").json()
    assert w["state"] == "low" and w["last_used_at"] is not None and w["exhausted_at"] is None

    manual(client, acc["id"], "0")
    w = client.get("/api/widgets").json()[0]
    assert w["state"] == "exhausted" and w["exhausted_at"] is not None
    assert w["exhausted_at"].endswith("+00:00") or w["exhausted_at"].endswith("Z")

    h = client.get(f"/api/widgets/{w['id']}/history").json()
    assert len(h["snapshots"]) == 3
    assert float(h["total_consumed"]) == 10.0


def test_refresh_seconds_respects_provider_minimum(client):
    acc = make_account(client, name="AWS", category="cloud", flavour="aws")
    w = add_widget(client, acc["id"], refresh_seconds=60)
    assert w["refresh_seconds"] == 6 * 3600
    gem = add_widget(client, make_account(client, name="Gemini", category="ai_api")["id"])
    assert gem["refresh_seconds"] == 150


def _sync_account(client, mock_http, handler, **secret):
    acc = make_account(client, name="OpenRouter", category="ai_api", flavour="openrouter")
    s = client.post(
        f"/api/accounts/{acc['id']}/secrets", json={"label": "main", "value": "sk-or-1", "use_for_sync": True} | secret
    ).json()
    mock_http(handler)
    return acc, add_widget(client, acc["id"]), s


def test_openrouter_tokens_in_widget_metrics(client, mock_http):
    today = date.today().isoformat()

    def handler(req: httpx.Request):
        if req.url.path.endswith("/credits"):
            return httpx.Response(200, json={"data": {"total_credits": 20, "total_usage": 4.5}})
        return httpx.Response(200, json={"data": [
            {"date": f"{today} 00:00:00", "prompt_tokens": 100, "completion_tokens": 50},
            {"date": "2000-01-01 00:00:00", "prompt_tokens": 1000, "completion_tokens": 0},
        ]})

    _, w, _ = _sync_account(client, mock_http, handler)
    w = client.post(f"/api/widgets/{w['id']}/refresh").json()
    assert float(w["balance"]) == 15.5 and w["alert_kind"] is None
    assert w["metrics"]["tokens_today"] == 150 and w["metrics"]["tokens_30d"] == 1150


def test_activity_endpoint_failure_does_not_break_sync(client, mock_http):
    def handler(req):
        if req.url.path.endswith("/credits"):
            return httpx.Response(200, json={"data": {"total_credits": 5, "total_usage": 0}})
        return httpx.Response(403)

    _, w, _ = _sync_account(client, mock_http, handler)
    w = client.post(f"/api/widgets/{w['id']}/refresh").json()
    assert float(w["balance"]) == 5 and w["metrics"]["tokens_today"] is None


def test_rejected_key_shows_on_widget_and_rotation_clears_it(client, mock_http):
    acc, w, s = _sync_account(client, mock_http, lambda r: httpx.Response(401))
    w = client.post(f"/api/widgets/{w['id']}/refresh").json()
    assert w["alert_kind"] == "auth" and "rejected" in w["alert_message"]

    resp = client.put(f"/api/secrets/{s['id']}", json={"label": "main", "value": "sk-or-new9", "use_for_sync": True})
    assert resp.json()["hint"] == "new9"
    assert client.get("/api/widgets").json()[0]["alert_kind"] is None


def test_unreachable_api_shows_on_widget(client, mock_http):
    def handler(req):
        raise httpx.ConnectError("no route")

    _, w, _ = _sync_account(client, mock_http, handler)
    w = client.post(f"/api/widgets/{w['id']}/refresh").json()
    assert w["alert_kind"] == "unreachable"


def test_expired_key_date_shows_on_widget(client, mock_http):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    _, w, _ = _sync_account(client, mock_http, lambda r: httpx.Response(500), expires_on=yesterday)
    assert client.get("/api/widgets").json()[0]["alert_kind"] == "key_expired"


def test_deleting_account_removes_its_widgets(client):
    acc = make_account(client)
    add_widget(client, acc["id"])
    client.delete(f"/api/accounts/{acc['id']}")
    assert client.get("/api/widgets").json() == []


def test_widget_field_config_round_trips_and_is_validated(client):
    acc = make_account(client, name="Gemini", category="ai_api")
    w = add_widget(client, acc["id"])
    assert w["tile_fields"] == ["currency", "last_used"] and w["title"] is None
    body = {"account_id": acc["id"], "title": "Gemini Pro", "tile_fields": ["days_left"], "tooltip_fields": ["refresh"]}
    w = client.put(f"/api/widgets/{w['id']}", json=body).json()
    assert w["title"] == "Gemini Pro" and w["tile_fields"] == ["days_left"] and w["tooltip_fields"] == ["refresh"]
    assert client.put(f"/api/widgets/{w['id']}", json=body | {"tile_fields": ["bogus"]}).status_code == 422


def test_widget_colour_defaults_to_flavour_and_can_be_overridden(client):
    acc = make_account(client, name="Netflix", category="streaming", flavour="netflix")
    w = add_widget(client, acc["id"])
    assert w["color"] == "#f87171" and w["color_override"] is None
    w = client.put(f"/api/widgets/{w['id']}", json={"account_id": acc["id"], "color": "#123abc"}).json()
    assert w["color"] == "#123abc"
    assert client.put(f"/api/widgets/{w['id']}", json={"account_id": acc["id"], "color": "red"}).status_code == 422


def _init_files(tmp_path, setup_sql):
    """Run init_db against fresh data/config files after running `setup_sql` on the data file."""
    from app import db

    engine = db.make_engine(f"sqlite:///{tmp_path / 'data.db'}", str(tmp_path / "config.db"))
    with engine.begin() as conn:
        for stmt in setup_sql:
            conn.execute(text(stmt))
    original = db.engine
    db.engine = engine
    try:
        db.init_db()
    finally:
        db.engine = original
    return engine


def test_init_db_adds_missing_columns(tmp_path):
    engine = _init_files(tmp_path, [  # an "old" widgets table without the newer columns
        "CREATE TABLE config.widgets (id INTEGER PRIMARY KEY, account_id INTEGER)",
    ])
    cols = {c["name"] for c in inspect(engine).get_columns("widgets", schema="config")}
    assert {"color", "title", "tile_fields"} <= cols


def test_init_db_moves_config_tables_out_of_old_single_db(tmp_path):
    from sqlalchemy import MetaData
    from sqlalchemy.schema import CreateTable

    from app.models import Account

    old_accounts = Account.__table__.to_metadata(MetaData(), schema=None)  # before the split: no schema
    engine = _init_files(tmp_path, [
        str(CreateTable(old_accounts).compile(dialect=sqlite.dialect())),
        "INSERT INTO accounts (id, name, category, flavour, flavour_config, created_at)"
        " VALUES (7, 'OpenRouter', 'ai_api', 'openrouter', '{}', '2026-01-01')",
        "CREATE TABLE balance_snapshots (id INTEGER PRIMARY KEY, account_id INTEGER)",
        "INSERT INTO balance_snapshots VALUES (1, 7)",
    ])
    insp = inspect(engine)
    assert "accounts" not in insp.get_table_names()
    assert "accounts" in insp.get_table_names(schema="config")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT name FROM config.accounts WHERE id = 7")).scalar() == "OpenRouter"
        assert conn.execute(text("SELECT account_id FROM main.balance_snapshots")).scalar() == 7  # history stays


def test_reorder_widgets(client):
    ids = [add_widget(client, make_account(client, name=f"A{i}")["id"])["id"] for i in range(3)]
    new = [ids[2], ids[0], ids[1]]
    resp = client.post("/api/widgets/reorder", json={"ids": new})
    assert [w["id"] for w in resp.json()] == new
    assert [w["id"] for w in client.get("/api/widgets").json()] == new
    assert client.post("/api/widgets/reorder", json={"ids": ids[:2]}).status_code == 422       # missing one
    assert client.post("/api/widgets/reorder", json={"ids": ids + [ids[0]]}).status_code == 422  # duplicate


def test_currency_toggle_is_per_widget(client):
    a = add_widget(client, make_account(client, name="A")["id"], title="Keep me")
    b = add_widget(client, make_account(client, name="B")["id"])
    resp = client.put(f"/api/widgets/{a['id']}/display-currency", json={"display_currency": "INR"})
    assert resp.json()["display_currency"] == "INR" and resp.json()["title"] == "Keep me"  # other settings untouched
    by_id = {w["id"]: w for w in client.get("/api/widgets").json()}
    assert by_id[b["id"]]["display_currency"] is None
    assert client.put(f"/api/widgets/{a['id']}/display-currency", json={"display_currency": "inr"}).status_code == 422
