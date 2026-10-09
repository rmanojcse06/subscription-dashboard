from ..models import Category
from .base import Flavour


class OpenRouter(Flavour):
    key = "openrouter"
    label = "OpenRouter"
    description = "Live credit balance and token usage via the OpenRouter API."
    category = Category.ai_api
    icon = "🔀"
    color = "#a78bfa"
    provider = "openrouter"
    secret_label = "API key (sk-or-…); token stats may need a management key"
    tooltip_fields = ("tokens_today", "tokens_30d", "spent_today", "avg_daily_burn", "days_left", "last_checked")
