"""Resolve driver notifications from API."""

from __future__ import annotations

from app.driver_api_transforms import (
    driver_alert_settings_from_api,
    driver_channel_settings_from_api,
    driver_notifications_to_ui,
)
from app.services.api_client import (
    ApiError,
    get_driver_settings,
    get_notification_preferences,
    list_notifications,
)


def resolve_notifications_inbox(token: str | None) -> tuple[list[dict], bool]:
    if not token:
        return [], False
    try:
        data = list_notifications(token, limit=50)
        items = data.get("notifications") or data.get("items") or []
        return driver_notifications_to_ui(items), True
    except ApiError:
        return [], False


def resolve_notification_settings(token: str | None) -> tuple[list[dict], list[dict], bool]:
    if not token:
        return [], [], False
    settings = None
    prefs = None
    ok = False
    try:
        settings = get_driver_settings(token)
        ok = True
    except ApiError:
        settings = {}
    try:
        prefs = get_notification_preferences(token)
        ok = True
    except ApiError:
        prefs = {}
    return (
        driver_alert_settings_from_api(settings, prefs),
        driver_channel_settings_from_api(prefs),
        ok,
    )
