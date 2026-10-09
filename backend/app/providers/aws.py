from datetime import date, timedelta
from decimal import Decimal

import httpx

from .base import BalanceResult, ProviderError

AUTH_ERRORS = {"UnrecognizedClientException", "InvalidClientTokenId", "ExpiredTokenException", "AccessDeniedException"}


class AWS:
    """Month-to-date cost via Cost Explorer. Note: AWS charges ~$0.01 per Cost Explorer API request."""

    key = "aws"
    label = "AWS"
    credential_format = "ACCESS_KEY_ID:SECRET_ACCESS_KEY (IAM user with ce:GetCostAndUsage only)"
    min_interval_seconds = 6 * 3600  # each Cost Explorer call is billed; data only updates a few times a day

    def fetch(self, credential: str, client: httpx.Client) -> BalanceResult:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError, EndpointConnectionError

        key_id, sep, secret = credential.partition(":")
        if not sep:
            raise ProviderError(f"AWS credential must be in the form {self.credential_format}")
        today = date.today()
        ce = boto3.client(
            "ce", aws_access_key_id=key_id, aws_secret_access_key=secret, region_name="us-east-1"
        )
        try:
            resp = ce.get_cost_and_usage(
                TimePeriod={"Start": today.replace(day=1).isoformat(), "End": (today + timedelta(days=1)).isoformat()},
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
            )
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in AUTH_ERRORS:
                raise ProviderError(f"AWS rejected the key ({code}) - it may be expired or revoked", "auth") from None
            raise ProviderError(f"AWS Cost Explorer error: {code or 'ClientError'}") from None
        except EndpointConnectionError:
            raise ProviderError("AWS Cost Explorer is unreachable", "unreachable") from None
        except BotoCoreError as e:
            raise ProviderError(f"AWS error: {type(e).__name__}") from None
        cost = resp["ResultsByTime"][0]["Total"]["UnblendedCost"]
        return BalanceResult(
            currency=cost["Unit"], spend=Decimal(cost["Amount"]), detail={"period_start": today.replace(day=1).isoformat()}
        )
