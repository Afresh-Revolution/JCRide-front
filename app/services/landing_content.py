import copy
import time

from app.config import BACKEND_ENV_PATHS, ENV_PATH, _env_value
from app.landing_defaults import DEFAULT_LANDING_PAGE
from app.services.api_client import ApiError, get_public_landing_page

_LANDING_CACHE_TTL_SECONDS = 120
_landing_cache: dict[str, object] = {"expires_at": 0.0, "value": None}

_APP_STORE_ENV = {
    "josride_android_url": ("JOSRIDE_ANDROID_URL", "ANDROID_APP_URL", "PLAY_STORE_URL"),
    "josride_ios_url": ("JOSRIDE_IOS_URL", "IOS_APP_URL", "APP_STORE_URL"),
    "josride_driver_android_url": ("JOSRIDE_DRIVER_ANDROID_URL", "DRIVER_ANDROID_APP_URL"),
    "josride_driver_ios_url": ("JOSRIDE_DRIVER_IOS_URL", "DRIVER_IOS_APP_URL"),
}


def _http_url(value) -> str:
    raw = str(value or "").strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    return ""


def overlay_mobile_apps(landing: dict) -> dict:
    """Prefer API/env store URLs. Empty URL → Coming soon on the landing buttons."""
    apps = dict(landing.get("mobile_apps") or {})
    for field, names in _APP_STORE_ENV.items():
        current = _http_url(apps.get(field))
        if not current:
            current = _http_url(_env_value(*names, paths=(ENV_PATH, *BACKEND_ENV_PATHS)))
        apps[field] = current
    landing["mobile_apps"] = apps
    return landing


def _deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if value is None:
            continue
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def default_landing_page() -> dict:
    return copy.deepcopy(DEFAULT_LANDING_PAGE)


def merge_landing_page(data: dict | None) -> dict:
    if not isinstance(data, dict):
        data = {}
    return _deep_merge(default_landing_page(), data)


def load_landing_page() -> dict:
    now = time.time()
    cached = _landing_cache.get("value")
    if isinstance(cached, dict) and _landing_cache.get("expires_at", 0.0) > now:
        return overlay_mobile_apps(copy.deepcopy(cached))
    try:
        data = get_public_landing_page()
        if isinstance(data, dict):
            merged = _deep_merge(default_landing_page(), data)
            _landing_cache["value"] = copy.deepcopy(merged)
            _landing_cache["expires_at"] = now + _LANDING_CACHE_TTL_SECONDS
            return overlay_mobile_apps(merged)
    except ApiError:
        pass
    fallback = default_landing_page()
    _landing_cache["value"] = copy.deepcopy(fallback)
    _landing_cache["expires_at"] = now + _LANDING_CACHE_TTL_SECONDS
    return overlay_mobile_apps(fallback)
