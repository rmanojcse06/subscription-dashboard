from ..models import Category
from .base import Flavour


class RunPod(Flavour):
    key = "runpod"
    label = "RunPod"
    description = "Live credit balance and current spend per hour via the RunPod API."
    category = Category.cloud
    icon = "🖥️"
    color = "#f472b6"
    provider = "runpod"
    secret_label = "API key"
    fields = ("spend_per_hour",)
    tooltip_fields = ("spend_per_hour", "spent_today", "avg_daily_burn", "days_left", "last_checked")
