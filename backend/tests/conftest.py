import os

from cryptography.fernet import Fernet

# Must be set before any app module is imported (settings are read at import time).
os.environ["SUBDASH_DATA_DB_URL"] = "sqlite://"
os.environ["SUBDASH_CONFIG_DB_PATH"] = ":memory:"
os.environ["SUBDASH_MASTER_KEY"] = Fernet.generate_key().decode()
os.environ["SUBDASH_FX_URL"] = ""  # no live exchange-rate fetches; tests/test_fx.py mocks them

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.deps import get_http_client  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:  # lifespan runs create_all
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def mock_http():
    """Route outbound provider HTTP calls to a handler: mock_http(lambda request: httpx.Response(...))."""

    def install(handler):
        app.dependency_overrides[get_http_client] = lambda: httpx.Client(transport=httpx.MockTransport(handler))

    return install
