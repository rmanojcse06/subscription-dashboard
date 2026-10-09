from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from ..models import Category
from .base import Flavour


class Config(BaseModel):
    operator: Literal["Tata Play", "Airtel Digital TV", "Dish TV", "d2h", "Sun Direct", "Cable", "Other"] = Field(
        default="Tata Play", title="Operator"
    )
    subscriber_id: str | None = Field(default=None, title="Subscriber / customer ID", max_length=40)
    pack_name: str | None = Field(default=None, title="Pack", max_length=60)
    daily_charge: Decimal | None = Field(default=None, title="Daily deduction", ge=0, description="Used to estimate days left")


class Reading(BaseModel):
    balance: Decimal = Field(title="Account balance", description="0 or below = disconnected")


class TvSubscription(Flavour):
    key = "tv_subscription"
    label = "TV / DTH"
    description = "DTH or cable: balance, daily deduction and estimated days until recharge (manual)."
    category = Category.other
    icon = "📡"
    color = "#fb923c"
    Config = Config
    Reading = Reading
    money_field = "balance"
    default_currency = "INR"
    fields = ("pack", "daily_charge", "days_to_recharge")
    tile_fields = ("currency", "days_to_recharge",)
    tooltip_fields = ("pack", "daily_charge", "days_to_recharge", "last_checked")
