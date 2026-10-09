from fastapi import APIRouter

from ..deps import DB, AccountDep, get_or_404
from ..models import Payment
from ..schemas import PaymentIn, PaymentOut

router = APIRouter(tags=["payments"])


@router.get("/accounts/{account_id}/payments", response_model=list[PaymentOut])
def list_payments(account: AccountDep):
    return sorted(account.payments, key=lambda p: p.paid_on, reverse=True)


@router.post("/accounts/{account_id}/payments", response_model=PaymentOut, status_code=201)
def create_payment(body: PaymentIn, account: AccountDep, db: DB):
    payment = Payment(account=account, **body.model_dump())
    db.add(payment)
    db.commit()
    return payment


@router.delete("/payments/{payment_id}", status_code=204)
def delete_payment(payment_id: int, db: DB):
    db.delete(get_or_404(db, Payment, payment_id))
    db.commit()
