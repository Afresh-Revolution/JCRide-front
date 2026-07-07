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


def _parse_url_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [_normalize_url(part) for part in raw.split(",") if part.strip()]


def get_deployed_api_url() -> str:
    """Deployed JosRide-back URL (Render, etc.). Used when local API is unavailable."""
    url = _FILE_ENV.get("DEPLOYED_API_URL") or os.getenv("DEPLOYED_API_URL")
    if url:
        return _normalize_url(url)

    for candidate in _parse_url_list(_FILE_ENV.get("API_URL") or os.getenv("API_URL")):
        if not _is_local_url(candidate):
            return candidate

    return DEFAULT_DEPLOYED_API_URL


def is_local_api_url(url: str | None = None) -> bool:
    return _is_local_url(url or get_api_url())


def get_api_urls() -> list[str]:
    """Backend URLs to try, in order (local first, then deployed)."""
    urls: list[str] = []
    seen: set[str] = set()

    for url in _parse_url_list(_FILE_ENV.get("API_URL") or os.getenv("API_URL")):
        if url not in seen:
            urls.append(url)
            seen.add(url)

    deployed = get_deployed_api_url()
    if deployed not in seen:
        urls.append(deployed)

    return urls or [DEFAULT_DEPLOYED_API_URL]


def get_api_url() -> str:
    """Primary backend URL (first in the try list)."""
    return get_api_urls()[0]


def get_ws_url() -> str:
    """WebSocket URL for live ride updates."""
    base = get_api_url()
    if base.startswith("https://"):
        return base.replace("https://", "wss://", 1) + "/api/v1/ws"
    return base.replace("http://", "ws://", 1) + "/api/v1/ws"


def get_api_timeout() -> int:
    """HTTP timeout (seconds) for backend requests."""
    raw = _FILE_ENV.get("API_TIMEOUT") or os.getenv("API_TIMEOUT") or "30"
    try:
        return max(10, int(raw))
    except (TypeError, ValueError):
        return 30


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
