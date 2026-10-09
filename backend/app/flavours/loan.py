from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field

from ..models import Category, Subscription
from .base import Flavour, State, days_until


class Config(BaseModel):
    lender: str = Field(title="Lender", max_length=60, description="e.g. HDFC, SBI")
    loan_account: str | None = Field(default=None, title="Loan account no.", max_length=30)
    interest_rate: Decimal | None = Field(default=None, title="Interest rate (% p.a.)", ge=0, le=50)


class Reading(BaseModel):
    outstanding_principal: Decimal = Field(title="Outstanding principal", ge=0)


class Loan(Flavour):
    key = "loan"
    label = "Home / other loan"
    description = "EMI, next due date, installments left and outstanding principal."
    category = Category.loan
    icon = "🏠"
    color = "#94a3b8"
    Config = Config
    Reading = Reading
    uses_plan = True
    default_currency = "INR"
    fields = ("plan", "next_due", "installments_left", "remaining_total", "outstanding", "interest_rate")
    tile_fields = ("currency", "next_due", "installments_left")
    tooltip_fields = ("plan", "next_due", "installments_left", "outstanding", "interest_rate")

    @classmethod
    def state(cls, reading: dict, plan: Subscription | None, today: date) -> State | None:
        if plan is None or not plan.active:
            return "ok"
        left = days_until(plan.next_due_date, today)
        if left is not None and left < 0:
            return "exhausted"  # overdue
        return "low" if left is not None and left <= 3 else "ok"
