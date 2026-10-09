from fastapi import APIRouter
from sqlalchemy.orm import Session

from ..deps import DB, HttpClient
from ..fx import apply_pair_rate, refresh_rates
from ..models import Profile
from ..schemas import ProfileIn, ProfileOut

router = APIRouter(prefix="/profile", tags=["profile"])


def get_profile(db: Session) -> Profile:
    """The single profile row, created with defaults on first use."""
    profile = db.get(Profile, 1)
    if profile is None:
        profile = Profile(id=1)
        db.add(profile)
        db.commit()
    return profile


@router.get("", response_model=ProfileOut)
def read_profile(db: DB, client: HttpClient):
    profile = get_profile(db)
    refresh_rates(profile, client)  # no-op while the stored rates are fresh
    db.commit()
    return profile


@router.put("", response_model=ProfileOut)
def update_profile(body: ProfileIn, db: DB):
    profile = get_profile(db)
    for k, v in body.model_dump().items():
        setattr(profile, k, v)
    apply_pair_rate(profile)  # a changed pair gets its own rate, not the old pair's
    db.commit()
    return profile


@router.post("/fx/refresh", response_model=ProfileOut)
def refresh_fx(db: DB, client: HttpClient):
    profile = get_profile(db)
    refresh_rates(profile, client, force=True)
    db.commit()
    return profile
