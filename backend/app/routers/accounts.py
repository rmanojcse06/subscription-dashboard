from fastapi import APIRouter
from sqlalchemy import select

from ..deps import DB, AccountDep
from ..models import Account
from ..schemas import AccountIn, AccountOut
from .flavours import get_flavour, validate_config

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
def list_accounts(db: DB):
    return db.scalars(select(Account).order_by(Account.category, Account.name)).all()


@router.post("", response_model=AccountOut, status_code=201)
def create_account(body: AccountIn, db: DB):
    body.flavour_config = validate_config(get_flavour(body.flavour), body.flavour_config)
    account = Account(**body.model_dump())
    db.add(account)
    db.commit()
    return account


@router.get("/{account_id}", response_model=AccountOut)
def get_account(account: AccountDep):
    return account


@router.put("/{account_id}", response_model=AccountOut)
def update_account(body: AccountIn, account: AccountDep, db: DB):
    body.flavour_config = validate_config(get_flavour(body.flavour), body.flavour_config)
    for k, v in body.model_dump().items():
        setattr(account, k, v)
    db.commit()
    return account


@router.delete("/{account_id}", status_code=204)
def delete_account(account: AccountDep, db: DB):
    db.delete(account)
    db.commit()
