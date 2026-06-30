import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

# Project root (folder containing run.py)
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

# .env must override any stale shell / IDE environment variables
load_dotenv(ENV_PATH, override=True)

_FILE_ENV: dict[str, str | None] = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}


def get_api_url() -> str:
    """Return JCRide-back base URL. Reads .env first, then os.environ."""
    url = _FILE_ENV.get("API_URL") or os.getenv("API_URL") or "http://localhost:8000"
    return str(url).strip().rstrip("/")


def get_api_timeout() -> int:
    """HTTP timeout (seconds) for backend requests."""
    raw = _FILE_ENV.get("API_TIMEOUT") or os.getenv("API_TIMEOUT") or "90"
    try:
        return max(10, int(raw))
    except (TypeError, ValueError):
        return 90


def reload_env() -> None:
    """Reload .env from disk (useful after editing the file)."""
    global _FILE_ENV, API_URL, SECRET_KEY, HOST, PORT
    load_dotenv(ENV_PATH, override=True)
    _FILE_ENV = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
    API_URL = get_api_url()
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "5000"))


API_URL = get_api_url()
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "5000"))
