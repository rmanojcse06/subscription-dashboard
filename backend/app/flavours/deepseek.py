from ..models import Category
from .base import Flavour


class DeepSeek(Flavour):
    key = "deepseek"
    label = "DeepSeek"
    description = "Live prepaid balance via the DeepSeek API."
    category = Category.ai_api
    icon = "🐋"
    color = "#60a5fa"
    provider = "deepseek"
    secret_label = "API key (sk-…)"
