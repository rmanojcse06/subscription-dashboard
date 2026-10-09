from fastapi import APIRouter

from ..deps import DB, AccountDep, get_or_404
from ..models import Subscription
from ..schemas import SubscriptionIn, SubscriptionOut

router = APIRouter(tags=["subscriptions"])


@router.get("/accounts/{account_id}/subscriptions", response_model=list[SubscriptionOut])
def list_subscriptions(account: AccountDep):
    return account.subscriptions


@router.post("/accounts/{account_id}/subscriptions", response_model=SubscriptionOut, status_code=201)
def create_subscription(body: SubscriptionIn, account: AccountDep, db: DB):
    sub = Subscription(account=account, **body.model_dump())
    db.add(sub)
    db.commit()
    return sub


@router.put("/subscriptions/{sub_id}", response_model=SubscriptionOut)
def update_subscription(sub_id: int, body: SubscriptionIn, db: DB):
    sub = get_or_404(db, Subscription, sub_id)
    for k, v in body.model_dump().items():
        setattr(sub, k, v)
    db.commit()
    return sub


@router.delete("/subscriptions/{sub_id}", status_code=204)
def delete_subscription(sub_id: int, db: DB):
    db.delete(get_or_404(db, Subscription, sub_id))
    db.commit()
