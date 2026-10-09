from contextlib import asynccontextmanager

from fastapi import FastAPI
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

for r in (accounts, subscriptions, payments, secrets, sync, summary, profile, widgets, flavours):
    app.include_router(r.router, prefix="/api")

# The Docker image serves the built frontend from here (same origin, so no CORS); in development Vite does.
if settings.static_dir:
    app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
