"""Resolve driver dashboard from API."""

from __future__ import annotations

from app.driver_api_transforms import dashboard_from_api
from app.services.api_client import (
    ApiError,
    get_driver_dashboard,
    get_driver_earnings,
    get_driver_nearby_demand,
)


def empty_dashboard() -> dict:
    return dashboard_from_api(
        {
            "driver_name": "",
            "is_online": False,
            "approval_status": "",
            "rating_avg": 0,
            "completed_trips": 0,
            "online_hours": 0,
            "weekly_earnings": [],
        }
    )


def resolve_dashboard(token: str | None) -> tuple[dict, bool]:
    if not token:
        return empty_dashboard(), False
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
            pass
        return dashboard_from_api(dashboard, earnings, demand), True
    except ApiError:
        return empty_dashboard(), False
