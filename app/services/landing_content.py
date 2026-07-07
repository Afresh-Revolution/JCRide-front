import copy
import time

from app.landing_defaults import DEFAULT_LANDING_PAGE
from app.services.api_client import ApiError, get_public_landing_page

_LANDING_CACHE_TTL_SECONDS = 120
_landing_cache: dict[str, object] = {"expires_at": 0.0, "value": None}


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
        return copy.deepcopy(cached)
    try:
        data = get_public_landing_page()
        if isinstance(data, dict):
            merged = _deep_merge(default_landing_page(), data)
            _landing_cache["value"] = copy.deepcopy(merged)
            _landing_cache["expires_at"] = now + _LANDING_CACHE_TTL_SECONDS
            return merged
    except ApiError:
        pass
    fallback = default_landing_page()
    _landing_cache["value"] = copy.deepcopy(fallback)
    _landing_cache["expires_at"] = now + _LANDING_CACHE_TTL_SECONDS
    return fallback
