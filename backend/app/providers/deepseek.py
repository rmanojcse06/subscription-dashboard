from decimal import Decimal

import httpx

from .base import BalanceResult, ProviderError, check


class DeepSeek:
    key = "deepseek"
    label = "DeepSeek"
    credential_format = "API key (sk-...)"
    min_interval_seconds = 60

    def fetch(self, credential: str, client: httpx.Client) -> BalanceResult:
        resp = client.get(
            "https://api.deepseek.com/user/balance",
            headers={"Authorization": f"Bearer {credential}", "Accept": "application/json"},
        )
        data = check(resp, self.label)
        infos = data.get("balance_infos") or []
        if not infos:
            raise ProviderError("DeepSeek returned no balance info")
        # Prefer USD if the account holds several currencies.
        info = next((i for i in infos if i["currency"] == "USD"), infos[0])
        return BalanceResult(currency=info["currency"], balance=Decimal(info["total_balance"]), detail=data)
