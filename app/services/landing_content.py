import copy

from app.landing_defaults import DEFAULT_LANDING_PAGE
from app.services.api_client import ApiError, get_public_landing_page


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
    try:
        data = get_public_landing_page()
        if isinstance(data, dict):
            return _deep_merge(default_landing_page(), data)
    except ApiError:
        pass
    return default_landing_page()
