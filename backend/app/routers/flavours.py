from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from .. import crypto
from ..deps import DB
from ..flavours import FLAVOURS, Flavour
from ..models import Account, Secret, SecretKind, Subscription, Widget
from ..schemas import QuickAddIn, WidgetView
from .profile import get_profile

router = APIRouter(tags=["flavours"])


def get_flavour(key: str) -> type[Flavour]:
    flavour = FLAVOURS.get(key)
    if flavour is None:
        raise HTTPException(422, f"Unknown flavour '{key}'")
    return flavour


def validate_config(flavour: type[Flavour], config: dict) -> dict:
    try:
        return flavour.Config.model_validate(config).model_dump(mode="json")
    except ValidationError as e:
        raise HTTPException(422, e.errors(include_url=False, include_context=False)) from None


def resolve_fields(flavour: type[Flavour], tile: list[str] | None, tooltip: list[str] | None) -> tuple[list, list]:
    """Fill defaults from the flavour and reject keys the flavour can't render."""
    tile = list(flavour.tile_fields) if tile is None else tile
    tooltip = list(flavour.tooltip_fields) if tooltip is None else tooltip
    bad = sorted(set(tile + tooltip) - flavour.allowed_fields())
    if bad:
        raise HTTPException(422, f"Fields not available for flavour '{flavour.key}': {', '.join(bad)}")
    return tile, tooltip


@router.get("/flavours")
def list_flavours() -> list[dict]:
    """Every flavour with its config / reading JSON schemas; the frontend builds forms from them."""
    return [f.describe() for f in FLAVOURS.values()]


@router.post("/flavours/widgets", response_model=WidgetView, status_code=201)
def quick_add(body: QuickAddIn, db: DB):
    """Add-widget flow in one transaction: account (+ key, + plan, + first reading) + widget."""
    from .sync import add_reading  # local import: sync imports nothing from here, keep it that way
    from .widgets import view

    flavour = get_flavour(body.flavour)
    if flavour.provider and not body.secret:
        raise HTTPException(422, f"{flavour.label} needs a key for live sync: {flavour.secret_label}")
    if flavour.uses_plan and body.plan is None:
        raise HTTPException(422, f"{flavour.label} needs a plan (price and next due date)")

    account = Account(
        name=body.name, category=flavour.category, flavour=flavour.key, flavour_config=validate_config(flavour, body.config)
    )
    db.add(account)
    if body.secret:
        db.add(Secret(
            account=account, label="main", kind=SecretKind.api_key, ciphertext=crypto.encrypt(body.secret),
            hint=body.secret[-4:], use_for_sync=flavour.provider is not None,
        ))
    if body.plan:
        db.add(Subscription(account=account, **body.plan.model_dump()))
    tile, tooltip = resolve_fields(flavour, None, None)
    position = max((w.position for w in db.query(Widget).all()), default=-1) + 1
    widget = Widget(account=account, position=position, tile_fields=tile, tooltip_fields=tooltip)
    db.add(widget)
    db.flush()
    if body.reading:
        add_reading(body.reading, account, db)  # commits
    db.commit()
    return view(widget, get_profile(db))
