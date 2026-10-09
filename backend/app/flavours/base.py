"""A flavour = one kind of widget (OpenRouter, Netflix, prepaid mobile, ...). One module per flavour.

A flavour declares:
- where data comes from: `provider` (live API, a key in app.providers.REGISTRY) or manual `Reading`s
- `Config`: non-secret settings entered when the widget is added (stored in Account.flavour_config)
- `Reading`: the fields of one manual entry (stored in BalanceSnapshot.detail["reading"])
- `state()`: optional extra exhausted/low rules beyond "money balance <= 0"
The frontend renders each flavour from frontend/src/flavours/<key>.tsx; forms are generated from the
JSON schema of Config / Reading, so field titles and descriptions here are what the user sees.
"""
from datetime import date
from typing import ClassVar, Literal

from pydantic import BaseModel

from ..models import Category, Subscription

State = Literal["ok", "low", "exhausted"]

# Metadata keys every flavour can show (rendered by frontend/src/widgetFields.ts).
COMMON_FIELDS = (
    "currency", "last_used", "last_checked", "spent_today", "avg_daily_burn", "days_left", "tokens_today",
    "tokens_30d", "balance_native", "spend", "source", "refresh", "category", "tokens_hour", "spend_hour", "overuse",
)


class NoFields(BaseModel):
    pass


class Flavour:
    key: ClassVar[str]
    label: ClassVar[str]
    description: ClassVar[str]
    category: ClassVar[Category]
    icon: ClassVar[str] = "💳"
    color: ClassVar[str] = "#a8a29e"           # default tile colour (light tone; tiles use dark text)

    provider: ClassVar[str | None] = None      # live API sync; None = manual readings
    secret_label: ClassVar[str | None] = None  # asked for at add time when set (required for API flavours)

    Config: ClassVar[type[BaseModel]] = NoFields
    Reading: ClassVar[type[BaseModel] | None] = None
    money_field: ClassVar[str | None] = None   # Reading field that is the money balance (-> snapshot.balance)
    default_currency: ClassVar[str] = "USD"

    uses_plan: ClassVar[bool] = False          # ask for a recurring plan (price + next due) at add time
    default_cycle: ClassVar[str] = "monthly"

    # Flavour-specific metadata keys (rendered by the flavour's frontend file), on top of COMMON_FIELDS.
    fields: ClassVar[tuple[str, ...]] = ()
    # Defaults for a new widget's tile / tooltip.
    tile_fields: ClassVar[tuple[str, ...]] = ("currency", "last_used")
    tooltip_fields: ClassVar[tuple[str, ...]] = ("spent_today", "avg_daily_burn", "days_left", "last_checked")

    @classmethod
    def state(cls, reading: dict, plan: Subscription | None, today: date) -> State | None:
        """Flavour-specific state, or None to fall back to the money-balance rules."""
        return None

    @classmethod
    def describe(cls) -> dict:
        return {
            "key": cls.key,
            "label": cls.label,
            "description": cls.description,
            "category": cls.category,
            "icon": cls.icon,
            "color": cls.color,
            "source": "api" if cls.provider else "manual",
            "provider": cls.provider,
            "secret_label": cls.secret_label,
            "config_schema": cls.Config.model_json_schema(),
            "reading_schema": cls.Reading.model_json_schema() if cls.Reading else None,
            "money_field": cls.money_field,
            "default_currency": cls.default_currency,
            "uses_plan": cls.uses_plan,
            "default_cycle": cls.default_cycle,
            "fields": [*COMMON_FIELDS, *cls.fields],
            "tile_fields": list(cls.tile_fields),
            "tooltip_fields": list(cls.tooltip_fields),
        }

    @classmethod
    def allowed_fields(cls) -> set[str]:
        return {*COMMON_FIELDS, *cls.fields}


def days_until(value: str | date | None, today: date) -> int | None:
    if value is None:
        return None
    d = value if isinstance(value, date) else date.fromisoformat(value)
    return (d - today).days
