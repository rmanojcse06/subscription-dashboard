"""Balance/usage sync adapters. Providers without a billing API (Google AI Studio, streaming,
EMI, loans) are manual-entry only and have no entry here."""
from .aws import AWS
from .base import BalanceResult, Provider, ProviderError
from .deepseek import DeepSeek
from .openrouter import OpenRouter
from .runpod import RunPod

REGISTRY: dict[str, Provider] = {p.key: p for p in (OpenRouter(), DeepSeek(), RunPod(), AWS())}

__all__ = ["REGISTRY", "BalanceResult", "Provider", "ProviderError"]
