from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import JSON, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import CONFIG_SCHEMA, Base


def utcnow() -> datetime:
    # Naive UTC: SQLite drops tzinfo, so keep everything naive in the DB. Schemas re-attach UTC on output.
    return datetime.now(UTC).replace(tzinfo=None)


def _enum(e: type[StrEnum]):
    return Enum(e, native_enum=False, length=20, values_callable=lambda x: [m.value for m in x])


class Category(StrEnum):
    ai_api = "ai_api"        # Google AI Studio, DeepSeek, OpenRouter
    cloud = "cloud"          # RunPod, AWS
    streaming = "streaming"  # Netflix, JioHotstar, SonyLIV
    emi = "emi"              # credit card EMI
    loan = "loan"            # house loan
    other = "other"


class BillingCycle(StrEnum):
    monthly = "monthly"
    quarterly = "quarterly"
    yearly = "yearly"
    prepaid = "prepaid"      # top-up / pay-as-you-go credits
    one_time = "one_time"


class PaymentKind(StrEnum):
    charge = "charge"
    topup = "topup"
    emi = "emi"
    refund = "refund"


class SecretKind(StrEnum):
    api_key = "api_key"
    token = "token"
    password = "password"
    other = "other"


class Account(Base):
    """One provider/biller, e.g. 'OpenRouter', 'Netflix', 'HDFC Home Loan'."""

    __tablename__ = "accounts"
    __table_args__ = {"schema": CONFIG_SCHEMA}  # committed config DB

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    category: Mapped[Category] = mapped_column(_enum(Category))
    # Key into app.flavours.FLAVOURS: decides the data source (live API vs manual readings), the config
    # fields, and how the widget renders. flavour_config holds that flavour's non-secret settings.
    flavour: Mapped[str] = mapped_column(String(30), default="generic")
    flavour_config: Mapped[dict] = mapped_column(JSON, default=dict)
    website: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    # Outcome of the last sync attempt; cleared on success. kind: auth | unreachable | error | no_key
    sync_error: Mapped[str | None] = mapped_column(Text)
    sync_error_kind: Mapped[str | None] = mapped_column(String(20))
    sync_error_at: Mapped[datetime | None]

    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    secrets: Mapped[list["Secret"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    snapshots: Mapped[list["BalanceSnapshot"]] = relationship(
        back_populates="account", cascade="all, delete-orphan", order_by="BalanceSnapshot.fetched_at"
    )
    widgets: Mapped[list["Widget"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class Subscription(Base):
    """A recurring plan or obligation (streaming plan, EMI, loan installment)."""

    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("config.accounts.id"))
    plan_name: Mapped[str] = mapped_column(String(100))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    cycle: Mapped[BillingCycle] = mapped_column(_enum(BillingCycle))
    next_due_date: Mapped[date | None]
    end_date: Mapped[date | None]                     # loan/EMI tenure end, or plan expiry
    remaining_installments: Mapped[int | None]
    auto_renew: Mapped[bool] = mapped_column(default=True)
    active: Mapped[bool] = mapped_column(default=True)

    account: Mapped[Account] = relationship(back_populates="subscriptions")


class Payment(Base):
    """A money movement that already happened: charge, top-up, EMI paid, refund."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("config.accounts.id"))
    kind: Mapped[PaymentKind] = mapped_column(_enum(PaymentKind))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    paid_on: Mapped[date]
    note: Mapped[str | None] = mapped_column(Text)

    account: Mapped[Account] = relationship(back_populates="payments")


class Secret(Base):
    """An encrypted credential. Plaintext is never stored and only returned by the reveal endpoint."""

    __tablename__ = "secrets"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("config.accounts.id"))
    label: Mapped[str] = mapped_column(String(100))
    kind: Mapped[SecretKind] = mapped_column(_enum(SecretKind))
    ciphertext: Mapped[str] = mapped_column(Text)
    hint: Mapped[str] = mapped_column(String(8))      # last 4 chars, for display
    use_for_sync: Mapped[bool] = mapped_column(default=False)
    expires_on: Mapped[date | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    account: Mapped[Account] = relationship(back_populates="secrets")


class SnapshotSource(StrEnum):
    api = "api"
    manual = "manual"  # entered by hand, e.g. Google AI Studio which has no billing API


class BalanceSnapshot(Base):
    """One observed balance/spend value. A new row is written only when the value changes;
    an unchanged re-check just bumps `checked_at`. So `fetched_at` = when this value was first seen,
    which is what "last used" / "exhausted since" are derived from (see app/metrics.py)."""

    __tablename__ = "balance_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("config.accounts.id"))
    balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    spend: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    currency: Mapped[str] = mapped_column(String(3))
    source: Mapped[SnapshotSource] = mapped_column(_enum(SnapshotSource), default=SnapshotSource.api)
    # Provider extras; `tokens` = {"today": int, "last_30d": int} when the provider reports it.
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    fetched_at: Mapped[datetime] = mapped_column(default=utcnow)
    checked_at: Mapped[datetime] = mapped_column(default=utcnow)

    account: Mapped[Account] = relationship(back_populates="snapshots")


class WidgetSize(StrEnum):
    normal = "normal"
    compact = "compact"


class Widget(Base):
    """A dashboard tile showing one account's balance."""

    __tablename__ = "widgets"
    __table_args__ = {"schema": CONFIG_SCHEMA}  # committed config DB

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("config.accounts.id"))
    position: Mapped[int] = mapped_column(default=0)
    size: Mapped[WidgetSize] = mapped_column(_enum(WidgetSize), default=WidgetSize.normal)
    refresh_seconds: Mapped[int | None]                       # None = Profile.default_refresh_seconds
    low_threshold: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # below this = "low" (amber)
    title: Mapped[str | None] = mapped_column(String(60))  # None = account name
    color: Mapped[str | None] = mapped_column(String(7))   # "#rrggbb"; None = the flavour's default colour
    # Currency this tile shows (one of the profile's pair); None = Profile.display_currency. Toggled per tile.
    display_currency: Mapped[str | None] = mapped_column(String(3))
    # Overusage alert: usage of `overuse_metric` (tokens | spend) per `overuse_window` (hour | day) above
    # `overuse_limit` turns the widget's status to "overusage". Spend is in the account's own currency.
    overuse_metric: Mapped[str | None] = mapped_column(String(10))
    overuse_window: Mapped[str | None] = mapped_column(String(5))
    overuse_limit: Mapped[Decimal | None] = mapped_column(Numeric(16, 4))
    # Which metadata keys the tile and its hover tooltip show, in order (defaults come from the flavour).
    tile_fields: Mapped[list] = mapped_column(JSON, default=list)
    tooltip_fields: Mapped[list] = mapped_column(JSON, default=list)

    account: Mapped[Account] = relationship(back_populates="widgets")


class Profile(Base):
    """Single-row table (id=1): the local user."""

    __tablename__ = "profile"
    __table_args__ = {"schema": CONFIG_SCHEMA}  # committed config DB

    id: Mapped[int] = mapped_column(primary_key=True)
    display_name: Mapped[str] = mapped_column(String(60), default="there")
    avatar: Mapped[str | None] = mapped_column(Text)          # small image as a data: URL
    default_refresh_seconds: Mapped[int] = mapped_column(default=150)
    # The dashboard toggles between a configurable pair of currencies (any ISO codes, e.g. USD/INR, JPY/USD).
    # 1 currency_a = rate_a_to_b currency_b: derived from the fetched rates unless rate_manual. Conversion happens
    # in the frontend; other currencies go through fx_rates, and are shown unconverted if missing there.
    currency_a: Mapped[str] = mapped_column(String(3), default="USD")
    currency_b: Mapped[str] = mapped_column(String(3), default="INR")
    rate_a_to_b: Mapped[Decimal] = mapped_column(Numeric(14, 6), default=Decimal("88"))
    rate_manual: Mapped[bool] = mapped_column(default=False, server_default="0")
    # Daily ECB rates from app.fx: units of each currency per 1 USD (USD itself included as 1).
    fx_rates: Mapped[dict | None] = mapped_column(JSON)
    fx_date: Mapped[str | None] = mapped_column(String(10))  # the rates' publication date
    fx_checked_at: Mapped[datetime | None]
    fx_error: Mapped[str | None] = mapped_column(String(200))
    display_currency: Mapped[str] = mapped_column(String(3), default="USD")  # currency_a or currency_b
    time_format: Mapped[str] = mapped_column(String(3), default="12h")  # 12h | 24h
