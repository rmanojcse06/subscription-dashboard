from decimal import Decimal

from pydantic import BaseModel, Field

from ..models import Category
from .base import Flavour


class Reading(BaseModel):
    balance: Decimal = Field(title="Credit remaining", ge=0, description="0 marks it exhausted")
    tokens_today: int | None = Field(default=None, title="Tokens used today", ge=0)


class Gemini(Flavour):
    key = "gemini"
    label = "Google AI Studio (Gemini)"
    description = "Manual: Google AI Studio has no billing API. Enter remaining credit; 0 = exhausted."
    category = Category.ai_api
    icon = "✨"
    color = "#2dd4bf"
    secret_label = "API key (optional, stored for reference)"
    Reading = Reading
    money_field = "balance"
