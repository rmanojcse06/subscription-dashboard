from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import crypto
from .config import settings
from .db import init_db
from .routers import accounts, flavours, payments, profile, secrets, subscriptions, summary, sync, widgets


@asynccontextmanager
async def lifespan(app: FastAPI):
    crypto.check_master_key()  # fail fast rather than on first secret write
    init_db()
    yield


app = FastAPI(title="Subscription Dashboard", lifespan=lifespan)

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def local_only(request: Request, call_next):
    """There is no login and the API can reveal keys, so refuse what another website could send from a browser.

    - Host must be local: blocks DNS rebinding (a site pointing its own domain at 127.0.0.1).
    - Writes must be same-origin: blocks cross-site form posts / fetches (CSRF). Requests with no Origin or
      Sec-Fetch-Site (curl, scripts) are allowed; browsers always send one on cross-site writes.
    """
    host = request.headers.get("host", "")
    if urlsplit(f"//{host}").hostname not in LOCAL_HOSTS:
        return PlainTextResponse("Forbidden host", status_code=403)
    if request.method not in SAFE_METHODS:
        site = request.headers.get("sec-fetch-site")
        origin = request.headers.get("origin")
        if (site and site not in ("same-origin", "none")) or (origin and urlsplit(origin).netloc != host):
            return PlainTextResponse("Cross-site request refused", status_code=403)
    return await call_next(request)


for r in (accounts, subscriptions, payments, secrets, sync, summary, profile, widgets, flavours):
    app.include_router(r.router, prefix="/api")

# The Docker image serves the built frontend from here (same origin, so no CORS); in development Vite does.
if settings.static_dir:
    app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
