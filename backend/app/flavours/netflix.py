from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from ..models import Category, Subscription
from .base import Flavour, State, days_until


class Config(BaseModel):
    plan_tier: Literal["Mobile", "Basic", "Standard with ads", "Standard", "Premium"] = Field(
        default="Standard", title="Plan"
    )
    registered_mobile: str | None = Field(
        default=None,
        title="Registered mobile",
        description="Reference only. Netflix has no API; automated login with mobile + OTP is not supported.",
        max_length=20,
    )
    screens: int | None = Field(default=None, title="Screens", ge=1, le=8)


class Netflix(Flavour):
    key = "netflix"
    label = "Netflix"
    description = "Plan, monthly price and next billing date (manual; Netflix has no public API)."
    category = Category.streaming
    icon = "🎬"
    color = "#f87171"
    Config = Config
    uses_plan = True
    default_currency = "INR"
    fields = ("plan", "next_due", "yearly_cost")
    tile_fields = ("currency", "next_due",)
    tooltip_fields = ("plan", "next_due", "yearly_cost")

    @classmethod
    def state(cls, reading: dict, plan: Subscription | None, today: date) -> State | None:
        if plan is None or not plan.active:
            return "exhausted"  # cancelled / lapsed
        left = days_until(plan.next_due_date, today)
        return "low" if left is not None and left <= 2 else "ok"
