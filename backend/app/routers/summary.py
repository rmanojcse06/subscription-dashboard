from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter
from sqlalchemy import func, select

from ..deps import DB
from ..models import BalanceSnapshot, BillingCycle, Secret, Subscription
from ..schemas import Summary

router = APIRouter(tags=["summary"])

# Divisor to normalise a recurring amount to a monthly figure. Prepaid/one-time are excluded.
MONTHLY_DIVISOR = {BillingCycle.monthly: 1, BillingCycle.quarterly: 3, BillingCycle.yearly: 12}


@router.get("/summary", response_model=Summary)
def summary(db: DB, days: int = 30):
    horizon = date.today() + timedelta(days=days)
    active = db.scalars(select(Subscription).where(Subscription.active)).all()

    # Totals are kept per currency (INR vs USD); there is no FX conversion.
    totals: dict[str, Decimal] = defaultdict(Decimal)
    for sub in active:
        if sub.cycle in MONTHLY_DIVISOR:
            totals[sub.currency] += (sub.amount / MONTHLY_DIVISOR[sub.cycle]).quantize(Decimal("0.01"))

    upcoming = sorted(
        (s for s in active if s.next_due_date and s.next_due_date <= horizon), key=lambda s: s.next_due_date
    )
    expiring = db.scalars(
        select(Secret).where(Secret.expires_on.is_not(None), Secret.expires_on <= horizon).order_by(Secret.expires_on)
    ).all()

    latest_ids = select(func.max(BalanceSnapshot.id)).group_by(BalanceSnapshot.account_id)
    latest = db.scalars(select(BalanceSnapshot).where(BalanceSnapshot.id.in_(latest_ids))).all()

    return Summary(
        monthly_total_by_currency=dict(totals),
        upcoming_dues=upcoming,
        expiring_secrets=expiring,
        latest_balances=latest,
    )
