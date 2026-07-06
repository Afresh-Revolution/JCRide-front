"""Resolve driver settings page data from API."""

from __future__ import annotations

import copy

from app.driver_portal.data import (
    DRIVER_SETTINGS_AUDIO,
    DRIVER_SETTINGS_LOCALE,
    DRIVER_SETTINGS_PREFERENCES,
    LOCALE_OPTIONS,
)
from app.services.api_client import ApiError, get_driver_settings

PREFERENCE_API_KEYS = {
    "auto_accept_short": "auto_accept_short_trips",
    "long_trip_filter": "long_trip_filter_enabled",
    "airport_queue": "airport_queue_enabled",
    "night_mode": "night_mode",
}

AUDIO_API_KEYS = {
    "voice_nav": "voice_navigation",
    "request_sound": "request_sound",
    "surge_alerts": "surge_alerts",
}

LOCALE_API_KEYS = {
    "language": "language",
    "nav_voice": "navigation_voice",
    "distance_units": "distance_unit",
    "timezone": "timezone",
}


def _distance_unit_label(value: str | None) -> str:
    if value == "mi":
        return "Miles (mi)"
    return "Kilometers (km)"


def _distance_unit_value(label: str) -> str:
    return "mi" if "mile" in label.lower() else "km"


def default_settings() -> dict:
    return {
        "preferences": [dict(row) for row in DRIVER_SETTINGS_PREFERENCES],
        "locale": dict(DRIVER_SETTINGS_LOCALE),
        "audio": [dict(row) for row in DRIVER_SETTINGS_AUDIO],
        "locale_options": LOCALE_OPTIONS,
    }


def empty_settings() -> dict:
    base = default_settings()
    for group in ("preferences", "audio"):
        for row in base[group]:
            row["enabled"] = False
    return base


def resolve_settings_page(token: str | None, session_store: dict | None) -> tuple[dict, bool]:
    if session_store:
        merged = default_settings()
        if session_store.get("preferences"):
            merged["preferences"] = session_store["preferences"]
        if session_store.get("locale"):
            merged["locale"] = {**merged["locale"], **session_store["locale"]}
        if session_store.get("audio"):
            merged["audio"] = session_store["audio"]
        return merged, bool(token)

    if token:
        try:
            return _from_api(get_driver_settings(token)), True
        except ApiError:
            pass

    return empty_settings(), False


def _from_api(payload: dict) -> dict:
    base = default_settings()

    for row in base["preferences"]:
        api_key = PREFERENCE_API_KEYS.get(row["id"])
        if api_key in payload:
            row["enabled"] = bool(payload[api_key])

    for row in base["audio"]:
        api_key = AUDIO_API_KEYS.get(row["id"])
        if api_key in payload:
            row["enabled"] = bool(payload[api_key])

    locale = base["locale"]
    if payload.get("language"):
        locale["language"] = payload["language"]
    if payload.get("navigation_voice"):
        locale["nav_voice"] = payload["navigation_voice"]
    if payload.get("distance_unit"):
        locale["distance_units"] = _distance_unit_label(payload["distance_unit"])
    if payload.get("timezone"):
        locale["timezone"] = payload["timezone"]

    return base


def settings_toggle_to_api(group: str, setting_id: str, enabled: bool) -> dict:
    if group == "preferences":
        api_key = PREFERENCE_API_KEYS.get(setting_id)
        if api_key:
            return {api_key: enabled}
    if group == "audio":
        api_key = AUDIO_API_KEYS.get(setting_id)
        if api_key:
            return {api_key: enabled}
    return {}


def locale_form_to_api(locale: dict) -> dict:
    payload = {}
    language = locale.get("language", "").strip()
    nav_voice = locale.get("nav_voice", "").strip()
    distance_units = locale.get("distance_units", "").strip()
    timezone = locale.get("timezone", "").strip()
    if language:
        payload["language"] = language
    if nav_voice:
        payload["navigation_voice"] = nav_voice
    if distance_units:
        payload["distance_unit"] = _distance_unit_value(distance_units)
    if timezone:
        payload["timezone"] = timezone
    return payload


def notification_alert_to_api(setting_id: str, enabled: bool) -> tuple[dict, dict]:
    driver_payload = {}
    prefs_payload = {}
    if setting_id == "ride_requests":
        driver_payload["request_sound"] = enabled
    elif setting_id == "surge":
        driver_payload["surge_alerts"] = enabled
    elif setting_id == "earnings":
        prefs_payload["wallet_updates"] = enabled
    elif setting_id == "ratings":
        prefs_payload["ride_updates"] = enabled
    elif setting_id == "documents":
        prefs_payload["security_alerts"] = enabled
    elif setting_id == "promotions":
        prefs_payload["promos"] = enabled
    return driver_payload, prefs_payload


def notification_channel_to_api(setting_id: str, enabled: bool) -> dict:
    mapping = {
        "push": "push_enabled",
        "email": "email_enabled",
        "sms": "sms_enabled",
    }
    api_key = mapping.get(setting_id)
    return {api_key: enabled} if api_key else {}


def settings_to_session_payload(settings: dict) -> dict:
    return {
        "preferences": copy.deepcopy(settings.get("preferences", [])),
        "locale": copy.deepcopy(settings.get("locale", {})),
        "audio": copy.deepcopy(settings.get("audio", [])),
    }
