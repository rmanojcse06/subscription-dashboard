# Subscription Dashboard

A personal, local-only dashboard for subscriptions, bills, and the API keys that go with them: AI APIs (OpenRouter, DeepSeek, Google AI Studio), cloud (RunPod, AWS), streaming, EMIs and loans. Live balances are pulled from provider APIs where one exists; everything else is entered by hand.

FastAPI + SQLite backend, React + TypeScript frontend, packaged as one Docker image.

## Run with Docker

```sh
git clone https://github.com/rmanojcse06/subscription-dashboard.git
cd subscription-dashboard
cp backend/.env.example backend/.env
docker compose run --rm --no-deps app python -m app.crypto   # prints a new master key
# paste it after SUBDASH_MASTER_KEY= in backend/.env
docker compose up -d --build
```

Open http://127.0.0.1:8000. Stop it with `docker compose down`. After a `git pull`, run `docker compose up -d --build` again.

## Two databases

| File | Holds | In git? |
| --- | --- | --- |
| `backend/config/config.db` | Profile, accounts and widgets: names, colours, order, fields, currency choices | **Yes** |
| `backend/data/data.db` | Encrypted API keys, balance history, plans and payments | **No** |

Committing the config DB means a fresh clone shows the same dashboard set-up. History and keys stay on the machine that recorded them, so on a new machine the tiles start empty: add the keys again under ☰ → Configure.

To share set-up changes, commit the config DB like code:

```sh
git add backend/config/config.db
git commit -m "Update dashboard config"
git push
```

It is a binary file, so git can't merge it: if two machines both change it, the last push wins. Pull before you make changes.

Each machine has its own `SUBDASH_MASTER_KEY` in `backend/.env`. Never commit that file. Losing the key makes that machine's stored API keys unreadable.

## Develop without Docker

There is no `uv` here; the backend uses a plain venv. On Windows the venv binaries are in `.venv/Scripts/`, on Linux and macOS in `.venv/bin/`.

```sh
# backend/
python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m app.crypto            # master key for backend/.env
.venv/Scripts/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
.venv/Scripts/python -m pytest

# frontend/
npm install
npm run dev      # http://127.0.0.1:5173, proxies /api to :8000
npm run build    # type check + production build
```

## Security

The app has no login and the API can reveal stored keys, so:

- It only listens on `127.0.0.1`. Don't expose port 8000 to a network.
- It only answers requests addressed to `127.0.0.1`, `localhost` or `::1`, so a website can't reach it through DNS rebinding.
- It refuses writes (POST, PUT, DELETE) that a browser marks as coming from another site, so a page you visit can't change or delete anything (CSRF). Tools like curl, which send no `Origin` header, still work.
