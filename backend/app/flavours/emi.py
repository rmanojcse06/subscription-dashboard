from datetime import date

from pydantic import BaseModel, Field

from ..models import Category, Subscription
from .base import Flavour, State, days_until


class Config(BaseModel):
    card_name: str = Field(title="Card", max_length=60, description="e.g. HDFC Regalia")
    item: str | None = Field(default=None, title="Purchased item", max_length=60)
    card_last4: str | None = Field(default=None, title="Card last 4 digits", pattern=r"^\d{4}$")


class Emi(Flavour):
    key = "emi"
    label = "Credit card EMI"
    description = "Monthly EMI amount, next due date and installments left."
    category = Category.emi
    icon = "💳"
    color = "#4ade80"
    Config = Config
    uses_plan = True
    default_currency = "INR"
    fields = ("plan", "next_due", "installments_left", "remaining_total")
    tile_fields = ("currency", "next_due", "installments_left")
    tooltip_fields = ("plan", "next_due", "installments_left", "remaining_total")

    @classmethod
    def state(cls, reading: dict, plan: Subscription | None, today: date) -> State | None:
        if plan is None or not plan.active or plan.remaining_installments == 0:
            return "ok"  # closed EMI is good news, not an alarm
        left = days_until(plan.next_due_date, today)
        if left is not None and left < 0:
            return "exhausted"  # overdue
        return "low" if left is not None and left <= 3 else "ok"
