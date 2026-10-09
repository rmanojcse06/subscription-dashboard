from fastapi import APIRouter

from .. import crypto
from ..deps import DB, AccountDep, get_or_404
from ..models import Secret
from ..schemas import SecretIn, SecretOut, SecretReveal, SecretUpdate

router = APIRouter(tags=["secrets"])


@router.get("/accounts/{account_id}/secrets", response_model=list[SecretOut])
def list_secrets(account: AccountDep):
    return account.secrets


@router.post("/accounts/{account_id}/secrets", response_model=SecretOut, status_code=201)
def create_secret(body: SecretIn, account: AccountDep, db: DB):
    if body.use_for_sync:
        # Only one secret per account drives sync.
        for s in account.secrets:
            s.use_for_sync = False
    secret = Secret(
        account=account,
        label=body.label,
        kind=body.kind,
        ciphertext=crypto.encrypt(body.value),
        hint=body.value[-4:],
        use_for_sync=body.use_for_sync,
        expires_on=body.expires_on,
    )
    db.add(secret)
    db.commit()
    return secret


@router.put("/secrets/{secret_id}", response_model=SecretOut)
def update_secret(secret_id: int, body: SecretUpdate, db: DB):
    secret = get_or_404(db, Secret, secret_id)
    if body.use_for_sync:
        for s in secret.account.secrets:
            s.use_for_sync = False
    secret.label, secret.kind = body.label, body.kind
    secret.use_for_sync, secret.expires_on = body.use_for_sync, body.expires_on
    if body.value is not None:
        secret.ciphertext = crypto.encrypt(body.value)
        secret.hint = body.value[-4:]
        # A new key gets a fresh chance: drop the old sync error so the next refresh calls the API.
        account = secret.account
        account.sync_error = account.sync_error_kind = account.sync_error_at = None
    db.commit()
    return secret


@router.post("/secrets/{secret_id}/reveal", response_model=SecretReveal)
def reveal_secret(secret_id: int, db: DB):
    # POST (not GET) so the plaintext never lands in browser history or access-log URLs.
    secret = get_or_404(db, Secret, secret_id)
    return SecretReveal(value=crypto.decrypt(secret.ciphertext))


@router.delete("/secrets/{secret_id}", status_code=204)
def delete_secret(secret_id: int, db: DB):
    db.delete(get_or_404(db, Secret, secret_id))
    db.commit()
