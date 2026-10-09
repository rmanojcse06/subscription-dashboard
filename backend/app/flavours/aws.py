from ..models import Category
from .base import Flavour


class AWS(Flavour):
    key = "aws"
    label = "AWS"
    description = "Month-to-date cost via Cost Explorer (refreshes at most every 6 h; each call costs ~$0.01)."
    category = Category.cloud
    icon = "☁️"
    color = "#fbbf24"
    provider = "aws"
    secret_label = "ACCESS_KEY_ID:SECRET_ACCESS_KEY (IAM user with only ce:GetCostAndUsage)"
    tile_fields = ("currency", "last_checked")
    tooltip_fields = ("spend", "spent_today", "avg_daily_burn", "last_checked", "refresh")
