"""Encryption for stored secrets. Run `python -m app.crypto` to generate a master key."""
from functools import lru_cache

from cryptography.fernet import Fernet

from .config import settings


class MasterKeyMissing(RuntimeError):
    pass


@lru_cache
def _fernet() -> Fernet:
    if not settings.master_key:
        raise MasterKeyMissing(
            "SUBDASH_MASTER_KEY is not set. Generate one with `python -m app.crypto` and put it in backend/.env"
        )
    return Fernet(settings.master_key.encode())


def check_master_key() -> None:
    _fernet()


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


if __name__ == "__main__":
    print(Fernet.generate_key().decode())
