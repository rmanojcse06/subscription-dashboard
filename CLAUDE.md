# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal, **local-only** web app for tracking subscriptions, bills, and the API keys, secrets, and tokens that go with them. It covers AI APIs (Google AI Studio, DeepSeek, OpenRouter), cloud (RunPod, AWS), streaming (Netflix, JioHotstar, SonyLIV), credit card EMIs, and a house loan.

- `backend/`: FastAPI + SQLAlchemy 2 + SQLite.
- `frontend/`: Vite + React 19 + TypeScript. It has no UI or chart libraries; the charts are hand-built SVG.
- `wireframes/`: the user's MS Paint wireframes. They are the source of truth for the **layout only**. The thick black borders were just there to separate areas in the sketch; the real UI is borderless and colourful. The user iterates on the design one change at a time, so build what's asked and don't redesign unprompted.

## Commands

There is no `uv` on this machine, so the backend uses a plain venv. The shell is Windows, so the venv binaries are in `.venv/Scripts/`.

```sh
# backend/
python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m app.crypto            # print a new SUBDASH_MASTER_KEY; put it in backend/.env (see .env.example)
.venv/Scripts/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000   # API docs at /docs
.venv/Scripts/python -m pytest                # all tests
.venv/Scripts/python -m pytest tests/test_widgets.py::test_manual_widget_goes_exhausted   # one test

# frontend/
npm install
npm run dev      # http://127.0.0.1:5173; proxies /api to :8000 (the backend has no CORS, so it relies on this)
# Second copy alongside (e.g. a demo DB on :8001): set API_PORT=8001 and run `npx vite --port 5174`
npm run build    # tsc -b + vite build; this is the type check
npm run lint
```

Docker (one image; FastAPI serves the built frontend from `SUBDASH_STATIC_DIR`, on 127.0.0.1:8000 only): `docker compose up -d --build`. It mounts `backend/data/` and `backend/config/` from the host. `README.md` has the clone-and-run steps.

There are no frontend tests; `npm run build` and `npm run lint` are the checks. `frontend/README.md` is the unmodified Vite template.

## Layout

The layout follows the wireframe in `App.tsx`:
- **Upper widget panel:** the `WidgetTile`s plus a "+ Add widget" tile.
  - Each tile is coloured: `Widget.color` if set, else the flavour's `color`. `tileStyle()` (`src/colors.ts`) sets only `--tile`. The background is a near-white wash of it, mixed into `--surface` with `color-mix` (`.tile` in `index.css`), so text uses the theme ink and dark mode gets dark tints. The full colour is used for the border, shadow and tooltip strip.
  - **Size and hover:** a tile is compact: a fixed `.tile-slot` with a small name in the corner, the status badge, and a big amount. On hover or focus the `.tile` card scales up and grows over its neighbours to reveal `.tile-more` (alert flag and `tile_fields`) and the toolbar. The configurable tooltip sits below. Touch screens show everything in normal flow.
  - **Status badge:** always visible, just above the amount. `WidgetView.status` is computed in `routers/widgets.py:status()`, worst first: failed (red), exhausted (red), overusage (orange), online (green, live API), manual, no_data. Failed, exhausted and overusage also add an outline ring.
  - **Overusage rule** (per widget): `overuse_metric` is tokens or spend, `overuse_window` is hour or day, and `overuse_limit` is the threshold. The UI accepts `2M` and `500k`. Values come from `metrics.usage()`. Tokens per hour are *estimated* from the change in the provider's running "today" total since the last snapshot at least an hour old.
  - A floating toolbar appears on hover or focus, and is always shown on touch screens. Its icons are colour-coded: expand green, move blue, configure orange, remove red.
  - The currency chip on a tile toggles **only that widget** (`Widget.display_currency`, `PUT /widgets/{id}/display-currency`). Untoggled widgets follow `Profile.display_currency`, set in Profile. The frontend applies it with `widgetProfile(profile, widget)`, so pass that, not the raw profile, when rendering a widget.
  - **Order:** the move icon, or ☰ → Reorder widgets, opens `ReorderDialog`. It saves the whole order with `POST /widgets/reorder {ids}`.
- **Top right:** only the avatar, which has a turning colour ring and slides out "Hi, {name} 👋" on hover. Clicking it opens Profile (`SettingsDialog`, which also exports `Avatar`). Next to it is the ☰ button that opens `MenuDrawer`. There is no header currency toggle; each tile's currency chip toggles it. The drawer is the menu area: Profile, Add widget, Configure, and a placeholder for future items.
- **Middle:** `PromptBox`, a Google-style search bar. On hover its placeholder types out "Please type here !". Submitting doesn't send anything yet; the user plans to add an LLM later.
- **Bottom:** `BottomPanel`, which shows important notices (dues and key expiries within 7 days) and a reserved ad/announcement slot.

Everything else is a modal built on `components/Dialog.tsx`, which uses `<dialog>`:
- **Widget dialog:** clicking a tile opens `WidgetDialog`. It has two tabs: usage and history (stats, balance step-line, daily consumption bars, a data table, payments, plans), and configure widget. An open widget is mirrored in the URL as `#widget/<id>` or `#widget/<id>/configure`.
- **Configure dialog:** `ConfigureDialog` is the CRUD screen for accounts, keys (add, rotate, reveal), plans, and payments.

## Widget flavours (the main extension point)

A **flavour** is one kind of widget: OpenRouter, Netflix, prepaid mobile, TV/DTH, EMI, loan, and so on. Each flavour is **two files with the same key**:
- `backend/app/flavours/<key>.py`: a `Flavour` subclass. It defines:
  - the data source: `provider` (live API) or a manual `Reading` model;
  - a `Config` model for non-secret settings, stored in `Account.flavour_config`;
  - `uses_plan` (whether it needs a recurring `Subscription`);
  - its own metadata keys in `fields`, plus default `tile_fields` / `tooltip_fields`;
  - optionally `state()`, for exhausted/low rules such as "validity passed" or "EMI overdue".
- `frontend/src/flavours/<key>.tsx`: a `FlavourUI`. It defines:
  - `headline`: the big value on the collapsed tile;
  - renderers for the flavour's own `fields`;
  - `moneyCharts`: whether the expanded dialog shows the balance charts;
  - `Expanded`: the flavour-specific block in the expanded dialog.

Register a new flavour in **both** `backend/app/flavours/__init__.py` (`FLAVOURS`) and `frontend/src/flavours/index.ts`. `tests/test_flavours.py` checks that every default field is declared.

Config and reading forms are generated from the pydantic models' JSON schema (`components/SchemaForm.tsx`, using `GET /api/flavours`). Adding a field to a `Config` or `Reading` model therefore needs no form code. Its `title` and `description` are the UI label and hint.

**Add-widget flow**: `POST /api/flavours/widgets` creates the account, key, plan, first reading and widget in one call. Manual readings go to `POST /accounts/{id}/readings` and are validated against the flavour's `Reading`. They are stored in `snapshot.detail["reading"]`, and the `money_field` value is copied to `snapshot.balance`.

**Netflix and other streaming services are manual on purpose.** Netflix has no API, and automating a login with mobile + OTP would break their terms and is fragile. The registered mobile is stored for reference only.

## Architecture

- **Settings** (`app/config.py`) come from env vars with the `SUBDASH_` prefix, or from `backend/.env`. They are read at import time, which is why `tests/conftest.py` sets env vars *before* importing `app`. Tests use in-memory SQLite for both files (`sqlite://` gets a `StaticPool`; the config path is `:memory:`).
- **Two SQLite files** (`app/db.py`): the data DB (`SUBDASH_DATA_DB_URL`, `backend/data/data.db`, gitignored) holds secrets, snapshots, subscriptions and payments. The config DB (`SUBDASH_CONFIG_DB_PATH`, `backend/config/config.db`) holds `profile`, `accounts` and `widgets`, and **is committed to git** so the dashboard set-up travels with the code.
  - The config DB is `ATTACH`ed to every connection as schema `config`. Config models set `__table_args__ = {"schema": CONFIG_SCHEMA}`, and FKs point at `config.accounts.id`. Joins, relationships and transactions work across both files, but SQLite drops cross-file FKs from the DDL.
  - Never put secrets or anything sensitive in a config table: the repo is public.
  - `init_db()` moves config tables left in the data DB (from the old single `subdash.db`) into the config DB, unless the config DB already has rows for that table.
- **Schema**: there are no real migrations. `db.init_db()` runs at startup: it creates missing tables and **adds missing columns** to existing ones, so new model columns must be nullable or have a `server_default`. The `server_default` is emitted as the column's `DEFAULT`, so existing rows get it; a plain `default=` alone leaves them NULL. Renames, drops and type changes still need the DB file deleted (or Alembic). Enums are stored as strings.
- **Datetimes**: the DB stores **naive UTC** (`models.utcnow()`) because SQLite drops tzinfo. Output schemas use `UtcDatetime`, which re-attaches UTC so browsers convert to local time. Never mix aware and naive datetimes.
- **Data model** (`app/models.py`):
  - An `Account` is one provider or biller. Its `flavour` selects the widget type and data source. It owns `Subscription` (plan, EMI, or loan; `cycle=prepaid` is top-up credit), `Payment`, `Secret`, `BalanceSnapshot`, and `Widget`.
  - It also stores the last sync failure in `sync_error*`.
  - `Profile` is a single row (id=1).
- **Snapshots are change-only.** `routers/sync.py:record()` inserts a row only when balance, spend, or currency changes; an unchanged check just bumps `checked_at`. So `fetched_at` means "when this value was first seen". `app/metrics.py` depends on this to derive "last used", "exhausted since", daily consumption, burn rate, and days left. A balance drop counts as consumption and a rise counts as a top-up. For spend-only providers (AWS), a rise counts as consumption and a drop is a period reset.
- **`WidgetView`** (`routers/widgets.py:view()`) is the one object a tile and its tooltip render from. It holds:
  - `state`: `ok`, `low`, `exhausted`, or `no_data`.
  - The alert: `alert()` picks the most urgent problem in this order: expired key date, then the last sync error (`auth`, `unreachable`, `error`, `no_key`), then a key expiring within 7 days.
  - `refresh_seconds`: the widget override, else the profile default (150), but never below the provider's `min_interval_seconds`.
- **Configurable widget metadata**: each widget stores `tile_fields` and `tooltip_fields` lists.
  - Allowed keys are `COMMON_FIELDS` (`flavours/base.py`) plus the flavour's own `fields`. `routers/flavours.py:resolve_fields` validates them.
  - Common keys render in `frontend/src/widgetFields.ts`; flavour keys render in the flavour's `.tsx` file.
  - `fieldDef()` looks in the flavour's file first.
- **Currency**: the profile holds a pair (`currency_a`, `currency_b`, picked from the major-currency list in `components/CurrencySelect.tsx`) with `rate_a_to_b`, and `display_currency` toggles between them.
  - `app/fx.py` fetches daily ECB rates (`SUBDASH_FX_URL`, frankfurter.dev, USD base) into `Profile.fx_rates`. It runs on `GET /profile` when they are more than 12 h old (1 h after a failure), or on `POST /profile/fx/refresh`.
  - Unless `rate_manual` is set, `rate_a_to_b` is derived from those rates, both on fetch and when the pair changes on save.
  - The **only** place conversion happens is `frontend/src/format.ts:convert`. It uses the pair rate within the pair and `fx_rates` for any other currency, such as a USD widget with a EUR/INR pair. Amounts with no known rate are shown unconverted.
  - Tests set `SUBDASH_FX_URL=""` so nothing hits the network; `tests/test_fx.py` patches it back with a mock. `/api/summary` totals per currency without converting.
- **Secrets** (`app/crypto.py`): values are Fernet-encrypted using `SUBDASH_MASTER_KEY`, and the app refuses to start without it. Only `ciphertext` and a 4-character `hint` are stored. Plaintext comes back only from `POST /api/secrets/{id}/reveal`. `PUT /api/secrets/{id}` with a new `value` rotates the key and clears the account's sync error. Never log secret values or put them in error messages, URLs, or GET responses.
- **Provider sync** (`app/providers/`): each adapter has `key`, `label`, `credential_format`, `min_interval_seconds`, and `fetch(credential, httpx.Client) -> BalanceResult`, and is registered in `REGISTRY`.
  - Adapters raise `ProviderError(message, kind)` with a user-safe message; `kind` is `auth`, `unreachable`, or `error`. `httpx` network errors are mapped to `unreachable` in `sync()`.
  - An account syncs only when its flavour has a `provider` *and* it has one secret with `use_for_sync=True`.
  - The backend has no scheduler. Each `WidgetTile` polls `POST /widgets/{id}/refresh` on a `setInterval` of `refresh_seconds`; `POST /accounts/{id}/sync` and `POST /sync` also exist. Inside `sync()`, a call within `min_interval_seconds` of the latest snapshot's `checked_at` reuses that snapshot and doesn't hit the provider.
  - **Live sync**: OpenRouter (`/credits`, plus best-effort token counts from `/activity`, which may need a management key), DeepSeek (`/user/balance`), RunPod (GraphQL `myself.clientBalance`), and AWS (Cost Explorer month-to-date). AWS credentials are stored as `ACCESS_KEY_ID:SECRET`. AWS bills about $0.01 per call, so its minimum interval is 6 h.
  - **Manual only**: Google AI Studio (Gemini), streaming, prepaid mobile, DTH, EMI, and loans. Enter values through readings; a money balance of 0 means exhausted. `POST /accounts/{id}/snapshots` is a raw balance override for API flavours.
  - The adapters are tested only against mocks (`mock_http` fixture → `httpx.MockTransport`), never the live APIs.

## Conventions

- All routes are under `/api`. Nested resources are created under `/accounts/{id}/...` and updated or deleted under their own `/<resource>/{id}` path.
- Store money as `Decimal` / `Numeric` in the backend. Decimals reach the frontend as strings.
- Frontend API types in `src/api.ts` mirror `backend/app/schemas.py`. Update both together.
- Chart styling follows the dataviz conventions in `index.css`: single-series charts with no legend, a 2px line, rounded bar tops, hover tooltips, and a table view. Light and dark tokens are on `:root`.
- `.env`, `*.db`, and `backend/data/` are gitignored, except `backend/config/config.db`. Keep it that way.
