from decimal import Decimal

from pydantic import BaseModel, Field

from ..models import Category
from .base import Flavour


class Reading(BaseModel):
    balance: Decimal = Field(title="Balance", description="0 marks it exhausted")


class Generic(Flavour):
    key = "generic"
    label = "Generic balance"
    description = "Anything else: a balance you enter by hand, optionally with a recurring plan."
    category = Category.other
    icon = "🧾"
    color = "#a8a29e"
    secret_label = "Key / token (optional, stored for reference)"
    Reading = Reading
    money_field = "balance"
