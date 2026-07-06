"""Resolve driver ride requests from API."""

from __future__ import annotations

from app.driver_api_transforms import ride_requests_from_api
from app.services.api_client import ApiError, get_driver_ride_requests


def resolve_ride_requests(token: str | None) -> tuple[list[dict], bool]:
    if not token:
        return [], False
    try:
        data = get_driver_ride_requests(token)
        items = data if isinstance(data, list) else data.get("requests") or data.get("rides") or []
        return ride_requests_from_api(items), True
    except ApiError:
        return [], False
