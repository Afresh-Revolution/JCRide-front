"""Resolve driver dashboard from API."""

from __future__ import annotations

from app.driver_api_transforms import dashboard_from_api
from app.services.api_client import (
    ApiError,
    get_driver_dashboard,
    get_driver_delivery_requests,
    get_driver_earnings,
    get_driver_nearby_demand,
    get_driver_ride_requests,
)


def empty_dashboard(*, is_bike: bool = False) -> dict:
    return dashboard_from_api(
        {
            "driver_name": "",
            "is_online": False,
            "approval_status": "",
            "rating_avg": 0,
            "completed_trips": 0,
            "online_hours": 0,
            "weekly_earnings": [],
        },
        is_bike=is_bike,
    )


def _pending_request_count(token: str, *, is_bike: bool) -> int:
    try:
        data = (
            get_driver_delivery_requests(token)
            if is_bike
            else get_driver_ride_requests(token)
        )
        items = (
            data
            if isinstance(data, list)
            else data.get("requests") or data.get("rides") or data.get("deliveries") or []
        )
        return len(items or [])
    except ApiError:
        return 0


def resolve_dashboard(token: str | None, *, is_bike: bool = False) -> tuple[dict, bool]:
    if not token:
        return empty_dashboard(is_bike=is_bike), False
    try:
        dashboard = get_driver_dashboard(token)
        earnings = None
        demand = None
        try:
            earnings = get_driver_earnings(token)
        except ApiError:
            pass
        try:
            demand = get_driver_nearby_demand(token)
        except ApiError:
            # Backend demand endpoint may be unavailable; fall back to live request count.
            pending = _pending_request_count(token, is_bike=is_bike)
            demand = {
                "zone": "Your area",
                "surge_multiplier": None,
                "new_requests": pending,
                "is_bike": is_bike,
            }
        return dashboard_from_api(dashboard, earnings, demand, is_bike=is_bike), True
    except ApiError:
        return empty_dashboard(is_bike=is_bike), False
