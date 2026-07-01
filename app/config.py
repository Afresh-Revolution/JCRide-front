import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

# Project root (folder containing run.py)
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

# .env must override any stale shell / IDE environment variables
load_dotenv(ENV_PATH, override=True)

_FILE_ENV: dict[str, str | None] = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}

DEFAULT_DEPLOYED_API_URL = "https://jcride-back.onrender.com"


def _normalize_url(url: str) -> str:
    return str(url).strip().rstrip("/")


def _is_local_url(url: str) -> bool:
    lowered = url.lower()
    return "localhost" in lowered or "127.0.0.1" in lowered


def get_deployed_api_url() -> str:
    """Deployed JCRide-back URL (Render, etc.). Used when local API is unavailable."""
    url = _FILE_ENV.get("DEPLOYED_API_URL") or os.getenv("DEPLOYED_API_URL")
    if url:
        return _normalize_url(url)

    api_url = _FILE_ENV.get("API_URL") or os.getenv("API_URL")
    if api_url and not _is_local_url(_normalize_url(api_url)):
        return _normalize_url(api_url)

    return DEFAULT_DEPLOYED_API_URL


def is_local_api_url(url: str | None = None) -> bool:
    return _is_local_url(url or get_api_url())


def get_api_url() -> str:
    """Return JCRide-back base URL. Localhost when set; otherwise deployed backend."""
    url = _FILE_ENV.get("API_URL") or os.getenv("API_URL")
    if url:
        return _normalize_url(url)
    return get_deployed_api_url()


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
