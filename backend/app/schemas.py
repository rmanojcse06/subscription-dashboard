from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .models import BillingCycle, Category, PaymentKind, SecretKind, SnapshotSource, WidgetSize

# DB datetimes are naive UTC; mark them UTC so JSON carries "+00:00" and browsers convert to local time.
UtcDatetime = Annotated[datetime, AfterValidator(lambda d: d if d.tzinfo else d.replace(tzinfo=UTC))]
Currency = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]  # ISO 4217 code


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: Category
    flavour: str = "generic"           # key into app.flavours.FLAVOURS
    flavour_config: dict = Field(default_factory=dict)  # validated against the flavour's Config
    website: str | None = None
    notes: str | None = None


class AccountOut(AccountIn, _Out):
    id: int
    created_at: UtcDatetime


class SubscriptionIn(BaseModel):
    plan_name: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    cycle: BillingCycle
    next_due_date: date | None = None
    end_date: date | None = None
    remaining_installments: int | None = Field(default=None, ge=0)
    auto_renew: bool = True
    active: bool = True


class SubscriptionOut(SubscriptionIn, _Out):
    id: int
    account_id: int


class PaymentIn(BaseModel):
    kind: PaymentKind
    amount: Decimal = Field(ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    paid_on: date
    note: str | None = None


class PaymentOut(PaymentIn, _Out):
    id: int
    account_id: int


class SecretIn(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    kind: SecretKind = SecretKind.api_key
    value: str = Field(min_length=1)
    use_for_sync: bool = False
    expires_on: date | None = None


class SecretOut(_Out):
    """Never includes the secret value."""

    id: int
    account_id: int
    label: str
    kind: SecretKind
    hint: str
    use_for_sync: bool
    expires_on: date | None
    created_at: UtcDatetime


class SecretUpdate(BaseModel):
    """Edit or rotate a key. Omitted / null `value` keeps the current secret."""

    label: str = Field(min_length=1, max_length=100)
    kind: SecretKind = SecretKind.api_key
    value: str | None = Field(default=None, min_length=1)
    use_for_sync: bool = False
    expires_on: date | None = None


class SecretReveal(BaseModel):
    value: str


class SnapshotOut(_Out):
    id: int
    account_id: int
    balance: Decimal | None
    spend: Decimal | None
    currency: str
    source: SnapshotSource
    detail: dict
    fetched_at: UtcDatetime
    checked_at: UtcDatetime


class ReadingIn(BaseModel):
    """One manual entry for a flavour with a Reading model; `values` is validated against it."""

    values: dict
    currency: Currency | None = None  # default: the flavour's default currency


class ManualSnapshotIn(BaseModel):
    """Hand-entered balance, for providers without an API. balance=0 marks the account exhausted."""

    balance: Decimal | None = None
    spend: Decimal | None = None
    currency: str = Field(default="USD", min_length=3, max_length=3)


class ProviderOut(BaseModel):
    key: str
    label: str
    credential_format: str
    min_interval_seconds: int


class Summary(BaseModel):
    monthly_total_by_currency: dict[str, Decimal]
    upcoming_dues: list[SubscriptionOut]
    expiring_secrets: list[SecretOut]
    latest_balances: list[SnapshotOut]


class ProfileIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    avatar: str | None = Field(default=None, max_length=400_000)  # data: URL
    default_refresh_seconds: int = Field(default=150, ge=30, le=86_400)
    currency_a: Currency = "USD"
    currency_b: Currency = "INR"
    rate_a_to_b: Decimal = Field(default=Decimal("88"), gt=0)  # 1 currency_a = rate_a_to_b currency_b
    rate_manual: bool = False  # False: rate_a_to_b follows the fetched daily rates
    display_currency: Currency = "USD"
    time_format: Literal["12h", "24h"] = "12h"

    @model_validator(mode="after")
    def _pair(self):
        if self.currency_a == self.currency_b:
            raise ValueError("currency_a and currency_b must differ")
        if self.display_currency not in (self.currency_a, self.currency_b):
            raise ValueError("display_currency must be currency_a or currency_b")
        return self


class ProfileOut(ProfileIn, _Out):
    fx_rates: dict[str, float] | None  # units per 1 USD
    fx_date: str | None
    fx_checked_at: UtcDatetime | None
    fx_error: str | None


class WidgetIn(BaseModel):
    account_id: int
    position: int = 0
    size: WidgetSize = WidgetSize.normal
    refresh_seconds: int | None = Field(default=None, ge=30, le=86_400)
    low_threshold: Decimal | None = Field(default=None, ge=0)
    title: str | None = Field(default=None, max_length=60)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")  # None = flavour default
    overuse_metric: Literal["tokens", "spend"] | None = None   # None = no overusage alert
    overuse_window: Literal["hour", "day"] = "hour"
    overuse_limit: Decimal | None = Field(default=None, gt=0)
    # Metadata keys shown on the tile / tooltip; None = the flavour's defaults.
    # Allowed keys: flavours.base.COMMON_FIELDS + the flavour's own `fields`.
    tile_fields: list[str] | None = None
    tooltip_fields: list[str] | None = None


class WidgetCurrency(BaseModel):
    display_currency: Currency | None  # None = follow the profile default


class WidgetOrder(BaseModel):
    ids: list[int]


class QuickAddIn(BaseModel):
    """Add-widget flow: creates the account, its key and plan, and the widget in one call."""

    flavour: str
    name: str = Field(min_length=1, max_length=100)
    config: dict = Field(default_factory=dict)
    secret: str | None = Field(default=None, min_length=1)
    plan: SubscriptionIn | None = None
    reading: ReadingIn | None = None  # optional first manual entry


class WidgetMetrics(BaseModel):
    spent_today: Decimal
    avg_daily_burn: Decimal
    days_left: float | None
    tokens_today: int | None = None
    tokens_30d: int | None = None


class WidgetUsage(BaseModel):
    tokens_hour: int | None    # approximate, see metrics.tokens_in_window
    tokens_day: int | None
    spend_hour: Decimal
    spend_day: Decimal


class WidgetView(BaseModel):
    """Everything a dashboard tile and its tooltip need, in one object."""

    id: int
    account_id: int
    account_name: str
    title: str | None
    color: str                    # effective tile colour (override, else flavour default)
    display_currency: str | None  # this tile's own currency choice; None = profile default
    color_override: str | None
    tile_fields: list[str]
    tooltip_fields: list[str]
    category: Category
    flavour: str
    flavour_config: dict
    sync_provider: str | None     # the flavour's live API, if any
    position: int
    size: WidgetSize
    refresh_seconds_override: int | None
    refresh_seconds: int          # effective (widget override, else profile default, never below provider minimum)
    low_threshold: Decimal | None
    state: Literal["ok", "low", "exhausted", "no_data"]
    balance: Decimal | None
    spend: Decimal | None
    currency: str | None
    source: SnapshotSource | None
    last_checked_at: UtcDatetime | None
    last_used_at: UtcDatetime | None
    exhausted_at: UtcDatetime | None
    metrics: WidgetMetrics
    reading: dict                 # latest manual Reading values (flavours with a Reading model)
    extra: dict                   # latest provider detail, e.g. RunPod currentSpendPerHr
    plan: SubscriptionOut | None  # the account's active plan (flavours with uses_plan)
    usage: WidgetUsage
    overuse_metric: str | None
    overuse_window: str | None
    overuse_limit: Decimal | None
    overuse_value: Decimal | None   # current value of the overuse metric over its window
    # One-word badge, worst first: failed | exhausted | overusage | online (live API ok) | manual | no_data
    status: Literal["failed", "exhausted", "overusage", "online", "manual", "no_data"]
    # Problem to flag on the tile, most urgent first: key_expired | auth | unreachable | error | no_key | key_expiring
    alert_kind: str | None = None
    alert_message: str | None = None
    alert_at: UtcDatetime | None = None


class DailyPoint(BaseModel):
    date: date
    consumed: Decimal
    topped_up: Decimal


class WidgetHistory(BaseModel):
    widget: WidgetView
    snapshots: list[SnapshotOut]
    daily: list[DailyPoint]
    payments: list[PaymentOut]
    subscriptions: list[SubscriptionOut]
    total_consumed: Decimal
    total_topped_up: Decimal
