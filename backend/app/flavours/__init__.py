"""Widget flavours. To add one: create a module here (subclass Flavour), add it to FLAVOURS below,
and add frontend/src/flavours/<key>.tsx + register it in frontend/src/flavours/index.ts."""
from .aws import AWS
from .base import Flavour
from .deepseek import DeepSeek
from .emi import Emi
from .gemini import Gemini
from .generic import Generic
from .loan import Loan
from .netflix import Netflix
from .openrouter import OpenRouter
from .prepaid_mobile import PrepaidMobile
from .runpod import RunPod
from .streaming import Streaming
from .tv_subscription import TvSubscription

FLAVOURS: dict[str, type[Flavour]] = {
    f.key: f
    for f in (
        OpenRouter, DeepSeek, Gemini, RunPod, AWS,
        Netflix, Streaming, PrepaidMobile, TvSubscription, Emi, Loan, Generic,
    )
}


def flavour_of(account) -> type[Flavour]:
    return FLAVOURS.get(account.flavour, Generic)


__all__ = ["FLAVOURS", "Flavour", "flavour_of"]
