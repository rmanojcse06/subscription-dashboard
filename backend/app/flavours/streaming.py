from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from ..models import Category, Subscription
from .base import Flavour, State, days_until


class Config(BaseModel):
    service: Literal["JioHotstar", "SonyLIV", "Prime Video", "ZEE5", "YouTube Premium", "Spotify", "Other"] = Field(
        default="JioHotstar", title="Service"
    )
    plan_name: str | None = Field(default=None, title="Plan name", max_length=60)


class Streaming(Flavour):
    key = "streaming"
    label = "Other streaming / OTT"
    description = "JioHotstar, SonyLIV, Prime Video and similar: price and renewal date (manual)."
    category = Category.streaming
    icon = "📺"
    color = "#818cf8"
    Config = Config
    uses_plan = True
    default_currency = "INR"
    default_cycle = "yearly"
    fields = ("plan", "next_due", "yearly_cost")
    tile_fields = ("currency", "next_due",)
    tooltip_fields = ("plan", "next_due", "yearly_cost")

    @classmethod
    def state(cls, reading: dict, plan: Subscription | None, today: date) -> State | None:
        if plan is None or not plan.active:
            return "exhausted"
        left = days_until(plan.next_due_date, today)
        if left is not None and left < 0 and not plan.auto_renew:
            return "exhausted"
        return "low" if left is not None and left <= 3 else "ok"
