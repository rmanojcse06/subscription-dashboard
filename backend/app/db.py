"""Two SQLite files on one connection.

- data DB (the main file, never committed): secrets, balance snapshots, plans, payments — history and keys.
- config DB (attached as schema "config", committed to git): profile, accounts and widgets — what the dashboard
  shows and how. Models opt in with CONFIG_SCHEMA; everything else lives in the data DB.

Attaching (rather than two engines) keeps cross-file joins, relationships and transactions working unchanged.
SQLite can't enforce foreign keys across files, so SQLAlchemy leaves those out of the DDL; the ORM cascades still
apply.
"""

import logging
from pathlib import Path

from sqlalchemy import Engine, create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import settings

CONFIG_SCHEMA = "config"
log = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def make_engine(data_url: str, config_path: str) -> Engine:
    kwargs: dict = {"connect_args": {"check_same_thread": False}}
    if data_url in ("sqlite://", "sqlite:///:memory:"):
        # Share one in-memory DB across connections (used by tests).
        kwargs["poolclass"] = StaticPool
    elif data_url.startswith("sqlite:///"):
        Path(data_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    if config_path != ":memory:":
        Path(config_path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(data_url, **kwargs)

    @event.listens_for(engine, "connect")
    def _attach_config(dbapi_conn, _record):
        dbapi_conn.execute(f"ATTACH DATABASE ? AS {CONFIG_SCHEMA}", (config_path,))

    return engine


engine = make_engine(settings.data_db_url, settings.config_db_path)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    """Create tables, add any model columns missing from existing tables, and move config tables still in the
    data DB (from before the split) into the config DB.

    A minimal stand-in for migrations: it only ever ADDs columns (new columns must be nullable or have a
    server_default). Renames, drops and type changes still need the DB file deleted, or Alembic.
    """
    from . import models  # noqa: F401  (register tables)

    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            existing = {c["name"] for c in inspector.get_columns(table.name, schema=table.schema)}
            for column in table.columns:
                if column.name not in existing:
                    name = f'"{table.schema}"."{table.name}"' if table.schema else f'"{table.name}"'
                    ddl = f'ALTER TABLE {name} ADD COLUMN "{column.name}" {column.type.compile(engine.dialect)}'
                    if column.server_default is not None:  # existing rows get it too, not NULL
                        ddl += f" DEFAULT {column.server_default.arg}"
                    conn.execute(text(ddl))
        _move_legacy_config_tables(conn)


def _move_legacy_config_tables(conn) -> None:
    inspector = inspect(conn)
    in_data = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.schema != CONFIG_SCHEMA or table.name not in in_data:
            continue
        if conn.execute(text(f'SELECT count(*) FROM {CONFIG_SCHEMA}."{table.name}"')).scalar():
            # e.g. a config DB pulled from git next to an old local DB: the config DB wins, keep the old table.
            log.warning("Both DBs have a %s table; using the config DB's and leaving the old one alone", table.name)
            continue
        old = {c["name"] for c in inspector.get_columns(table.name)}
        cols = ", ".join(f'"{c.name}"' for c in table.columns if c.name in old)
        conn.execute(text(f'INSERT INTO {CONFIG_SCHEMA}."{table.name}" ({cols}) SELECT {cols} FROM main."{table.name}"'))
        conn.execute(text(f'DROP TABLE main."{table.name}"'))
        log.info("Moved table %s into the config DB", table.name)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
