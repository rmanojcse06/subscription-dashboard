"""The app has no login, so it only trusts requests that a browser can't forge from another site."""


def test_foreign_host_header_is_rejected(client):
    # DNS rebinding: a site resolving its own domain to 127.0.0.1 would send its own Host header.
    assert client.get("/api/profile", headers={"Host": "evil.example:8000"}).status_code == 403
    assert client.get("/api/profile", headers={"Host": "localhost:8000"}).status_code == 200


def test_cross_site_writes_are_rejected(client):
    evil = {"Origin": "https://evil.example", "Content-Type": "text/plain"}
    assert client.post("/api/sync", headers=evil).status_code == 403
    assert client.post("/api/sync", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.post("/api/sync", headers={"Origin": "http://127.0.0.1:9999"}).status_code == 403  # other local port


def test_same_origin_and_non_browser_writes_are_allowed(client):
    assert client.post("/api/sync", headers={"Origin": "http://127.0.0.1", "Sec-Fetch-Site": "same-origin"}).status_code == 200
    assert client.post("/api/sync").status_code == 200  # curl / scripts send no Origin
