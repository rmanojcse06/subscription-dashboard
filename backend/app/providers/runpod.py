from decimal import Decimal

import httpx

from .base import BalanceResult, ProviderError, check

QUERY = "query { myself { clientBalance currentSpendPerHr } }"


class RunPod:
    key = "runpod"
    label = "RunPod"
    credential_format = "API key"
    min_interval_seconds = 60

    def fetch(self, credential: str, client: httpx.Client) -> BalanceResult:
        resp = client.post(
            "https://api.runpod.io/graphql",
            headers={"Authorization": f"Bearer {credential}"},
            json={"query": QUERY},
        )
        data = check(resp, self.label)
        if data.get("errors") or not (data.get("data") or {}).get("myself"):
            raise ProviderError("RunPod GraphQL query failed")
        me = data["data"]["myself"]
        return BalanceResult(currency="USD", balance=Decimal(str(me["clientBalance"])), detail=me)
