"""Resolve vehicle change status for driver profile UI."""

from __future__ import annotations

from app.services.api_client import ApiError, get_vehicle_change_status


def empty_vehicle_change_status() -> dict:
    return {
        "can_submit": False,
        "vehicle_change_locked": False,
        "pending_request": None,
        "next_edit_available_at": None,
        "days_until_next_edit": None,
        "monthly_limit_days": 30,
    }


def resolve_vehicle_change_status(token: str | None) -> tuple[dict, bool]:
    if not token:
        return empty_vehicle_change_status(), False
    try:
        data = get_vehicle_change_status(token)
        return {
            "can_submit": bool(data.get("can_submit")),
            "vehicle_change_locked": bool(data.get("vehicle_change_locked")),
            "pending_request": data.get("pending_request"),
            "next_edit_available_at": data.get("next_edit_available_at"),
            "days_until_next_edit": data.get("days_until_next_edit"),
            "monthly_limit_days": int(data.get("monthly_limit_days") or 30),
        }, True
    except ApiError:
        return empty_vehicle_change_status(), False
