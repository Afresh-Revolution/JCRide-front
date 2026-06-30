"""Resolve driver profile page data from API or defaults."""

from __future__ import annotations

from app.driver_portal.data import DRIVER_PROFILE, PROFILE_DETAIL
from app.driver_portal.profile_documents import merge_profile_documents
from app.services.api_client import ApiError, get_driver_profile


def _initials(name: str) -> str:
    parts = (name or "").split()
    return "".join(part[0] for part in parts[:2]).upper() or "DR"


def _format_since(value: str) -> str:
    if not value:
        return PROFILE_DETAIL["since"]
    if value.lower().startswith("driver since"):
        return value.replace("Driver since ", "").strip()
    return value


def resolve_profile_page(token: str | None) -> dict:
    if token:
        try:
            data = get_driver_profile(token)
            return _from_api(data)
        except ApiError:
            pass
    return dict(PROFILE_DETAIL)


def _from_api(data: dict) -> dict:
    driver = data.get("driver") or data.get("data") or data
    user = driver.get("user") or driver
    name = user.get("full_name") or driver.get("full_name") or PROFILE_DETAIL["name"]
    stats = driver.get("stats") or {}
    vehicle = driver.get("vehicle") or {}

    make = vehicle.get("make") or driver.get("vehicle_make") or ""
    model = vehicle.get("model") or driver.get("vehicle_model") or ""
    year = vehicle.get("year") or driver.get("vehicle_year") or ""
    make_model = f"{make} {model}".strip()
    if year:
        make_model = f"{make_model} {year}".strip()

    category = (
        driver.get("service_tier")
        or vehicle.get("category")
        or driver.get("vehicle_category")
        or "Economy"
    )

    documents = merge_profile_documents(driver.get("documents"))

    return {
        "name": name,
        "initials": _initials(name),
        "since": _format_since(driver.get("driver_since") or driver.get("joined_at") or ""),
        "rating": float(driver.get("rating") or stats.get("rating") or PROFILE_DETAIL["rating"]),
        "trips": int(stats.get("total_trips") or driver.get("total_trips") or PROFILE_DETAIL["trips"]),
        "acceptance": f"{int(stats.get('acceptance_rate') or 96)}%",
        "completion": f"{int(stats.get('completion_rate') or 99)}%",
        "on_time": f"{int(stats.get('on_time_rate') or 94)}%",
        "vehicle": {
            "make_model": make_model or PROFILE_DETAIL["vehicle"]["make_model"],
            "color": vehicle.get("color") or driver.get("vehicle_color") or PROFILE_DETAIL["vehicle"]["color"],
            "plate": driver.get("plate_number") or PROFILE_DETAIL["vehicle"]["plate"],
            "category": str(category).replace("_", " ").title(),
        },
        "documents": documents,
    }
