"""Resolve driver profile page data from API."""

from __future__ import annotations

from app.driver_api_transforms import profile_from_api
from app.driver_portal.profile_documents import merge_profile_documents
from app.services.api_client import ApiError, get_driver_performance, get_driver_profile


def empty_profile() -> dict:
    return {
        "name": "-",
        "initials": "DR",
        "since": "-",
        "rating": 0,
        "trips": 0,
        "acceptance": "-",
        "completion": "-",
        "on_time": "-",
        "vehicle": {
            "make_model": "-",
            "make": "",
            "model": "",
            "color": "-",
            "plate": "-",
            "category": "-",
            "vehicle_category": "car",
            "service_tier": "economy",
        },
        "documents": merge_profile_documents([]),
    }


def resolve_profile_page(token: str | None) -> tuple[dict, bool]:
    if not token:
        return empty_profile(), False
    try:
        data = get_driver_profile(token)
        performance = None
        try:
            performance = get_driver_performance(token)
        except ApiError:
            pass
        profile = profile_from_api(data, performance)
        driver = data.get("driver") or data
        profile["documents"] = merge_profile_documents(driver.get("documents"))
        return profile, True
    except ApiError:
        return empty_profile(), False
