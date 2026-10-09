from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from ..models import Category, Subscription
from .base import Flavour, State, days_until


class Config(BaseModel):
    mobile_number: str = Field(title="Mobile number", max_length=20)
    operator: Literal["Jio", "Airtel", "Vi", "BSNL", "Other"] = Field(default="Jio", title="Operator")
    plan_name: str | None = Field(default=None, title="Recharge plan", max_length=60, description="e.g. ₹349 · 2GB/day · 28 days")
    daily_data_gb: Decimal | None = Field(default=None, title="Daily data quota (GB)", ge=0)


class Reading(BaseModel):
    validity_until: date = Field(title="Validity until")
    data_left_gb: Decimal | None = Field(default=None, title="Data left today (GB)", ge=0)
    main_balance: Decimal | None = Field(default=None, title="Main balance", ge=0)


class PrepaidMobile(Flavour):
    key = "prepaid_mobile"
    label = "Prepaid mobile"
    description = "Recharge validity, data left and main balance for a prepaid number (manual)."
    category = Category.other
    icon = "📱"
    color = "#22d3ee"
    Config = Config
    Reading = Reading
    money_field = "main_balance"
    default_currency = "INR"
    fields = ("validity", "data_left", "main_balance", "operator")
    tile_fields = ("currency", "validity", "data_left")
    tooltip_fields = ("validity", "data_left", "main_balance", "last_checked")

    @classmethod
    def state(cls, reading: dict, plan: Subscription | None, today: date) -> State | None:
        left = days_until(reading.get("validity_until"), today)
        if left is None:
            return None
        if left < 0:
            return "exhausted"
        if left <= 3:
            return "low"
        if reading.get("data_left_gb") is not None and Decimal(str(reading["data_left_gb"])) == 0:
            return "low"
        return "ok"
