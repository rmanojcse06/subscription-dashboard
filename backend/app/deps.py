from collections.abc import Iterator
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from .db import Base, get_db
from .models import Account

DB = Annotated[Session, Depends(get_db)]


def get_or_404[T: Base](db: Session, model: type[T], id: int) -> T:
    obj = db.get(model, id)
    if obj is None:
        raise HTTPException(404, f"{model.__name__} {id} not found")
    return obj


def get_account(account_id: int, db: DB) -> Account:
    return get_or_404(db, Account, account_id)


AccountDep = Annotated[Account, Depends(get_account)]


def get_http_client() -> Iterator[httpx.Client]:
    with httpx.Client(timeout=15) as client:
        yield client


HttpClient = Annotated[httpx.Client, Depends(get_http_client)]
