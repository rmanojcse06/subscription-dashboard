from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SUBDASH_", env_file=".env", extra="ignore")

    # History and keys: never committed (see app/db.py).
    data_db_url: str = "sqlite:///./data/data.db"
    # Profile, accounts and widgets: committed to git so the dashboard set-up travels with the code.
    config_db_path: str = "./config/config.db"
    # Built frontend to serve at / (the Docker image sets it); empty in development, where Vite serves it.
    static_dir: str = ""
    # Fernet key used to encrypt stored secrets. Losing it makes stored secrets unrecoverable.
    master_key: str = ""
    # Daily ECB exchange rates (no key needed). Empty disables fetching (the tests do this).
    fx_url: str = "https://api.frankfurter.dev/v1/latest?base=USD"


settings = Settings()
