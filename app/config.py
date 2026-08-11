import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

# Project root (folder containing run.py)
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
# Nested or sibling JCRide-back .env (local monorepo layouts)
BACKEND_ENV_PATHS = (
    BASE_DIR / "JCRide-back" / ".env",
    BASE_DIR.parent / "JCRide-back" / ".env",
)

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


def get_public_app_url() -> str:
    """Origin for user-facing share links (invite URLs, trip share, etc.)."""
    """Origin for user-facing share links (invite URLs, trip share, etc.)."""
    from flask import request

    configured = _FILE_ENV.get("PUBLIC_APP_URL") or os.getenv("PUBLIC_APP_URL")
    if not configured:
        configured = _FILE_ENV.get("FRONTEND_BASE_URL") or os.getenv("FRONTEND_BASE_URL")
    # Prefer josride.com when a comma-separated list is configured.
    for candidate in _parse_url_list(configured):
        host = candidate.lower().replace("https://", "").replace("http://", "")
        if host.startswith("josride.com") or host.startswith("www.josride.com"):
            return _normalize_url(candidate)
    # Prefer josride.com when a comma-separated list is configured.
    for candidate in _parse_url_list(configured):
        host = candidate.lower().replace("https://", "").replace("http://", "")
        if host.startswith("josride.com") or host.startswith("www.josride.com"):
            return _normalize_url(candidate)
    if configured:
        first = _parse_url_list(configured)
        if first:
            return first[0]
        return _normalize_url(configured.split(",")[0])
        first = _parse_url_list(configured)
        if first:
            return first[0]
        return _normalize_url(configured.split(",")[0])

    proto = request.headers.get("X-Forwarded-Proto", request.scheme)
    host = request.headers.get("X-Forwarded-Host") or request.host
    return f"{proto}://{host}".rstrip("/")


def build_public_trip_share_url(booking_id: str, share_token: str) -> str:
    base = get_public_app_url().rstrip("/")
    # Always expose the brand domain for share links when possible.
    if "vercel.app" in base.lower() or "localhost" in base.lower() or "127.0.0.1" in base.lower():
        base = "https://josride.com"
    return f"{base}/t/{booking_id}?s={share_token}"


def get_driver_support_phone() -> str:
    return (
        _FILE_ENV.get("DRIVER_SUPPORT_PHONE")
        or os.getenv("DRIVER_SUPPORT_PHONE")
        or "0700527433"
    )


def get_emergency_phone() -> str:
    return _FILE_ENV.get("EMERGENCY_PHONE") or os.getenv("EMERGENCY_PHONE") or "112"


def _env_value(*names: str, paths: tuple[Path, ...] | None = None) -> str:
    """First non-empty value for names across env files then process env."""
    search_paths = paths if paths is not None else (ENV_PATH,)
    for path in search_paths:
        if not path.exists():
            continue
        values = dotenv_values(path)
        for name in names:
            raw = (values.get(name) or "").strip()
            if raw:
                return raw
    for name in names:
        raw = (os.getenv(name) or "").strip()
        if raw:
            return raw
    return ""


def get_google_maps_api_key() -> str:
    """
    Google Maps JS / Directions key for website maps.

    Prefer EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (same name as mobile).
    Reads JCRide-front/.env first, then JCRide-back/.env so a single
    backend key works in local monorepo setups.
    """
    names = ("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_API_KEY")
    return _env_value(*names, paths=(ENV_PATH, *BACKEND_ENV_PATHS))


def _env_flag_on(*names: str, fresh: bool = False) -> bool:
    file_env = dotenv_values(ENV_PATH) if fresh and ENV_PATH.exists() else _FILE_ENV
    for name in names:
        raw = (file_env.get(name) or os.getenv(name) or "").strip().lower()
        if raw in {"1", "true", "yes", "on"}:
            return True
    return False


def get_skip_driver_match() -> bool:
    """
    Dev preview for the website (and mobile parity): skip finding-driver wait
    and show Simulate delivery completed controls on /user/live-tracking.

    Read from JCRide-front/.env — not JCRide-back/.env.
    Re-reads the file each call so toggling 0/1 applies without a full restart.
    """
    return _env_flag_on(
        "SIMULATE_DELIVERY_COMPLETED",
        "EXPO_PUBLIC_SIMULATE_DELIVERY_COMPLETED",
        "EXPO_PUBLIC_SKIP_DRIVER_MATCH",
        "SKIP_DRIVER_MATCH",
        fresh=True,
    )


def format_support_phone_display(phone: str | None) -> str:
    raw = "".join(ch for ch in str(phone or "") if ch.isdigit() or ch == "+")
    if raw in {"0700527433", "+234700527433", "234700527433"}:
        return "0700-JOSRIDE"
    return phone or ""


def build_public_trip_share_url(booking_id: str, share_token: str) -> str:
    base = get_public_app_url().rstrip("/")
    # Always expose the brand domain for share links when possible.
    if "vercel.app" in base.lower() or "localhost" in base.lower() or "127.0.0.1" in base.lower():
        base = "https://josride.com"
    return f"{base}/t/{booking_id}?s={share_token}"


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
