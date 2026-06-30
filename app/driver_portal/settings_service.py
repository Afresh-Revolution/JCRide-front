"""Resolve driver settings page data from API or session defaults."""

from __future__ import annotations

import copy

from app.driver_portal.data import (
    DRIVER_SETTINGS_AUDIO,
    DRIVER_SETTINGS_LOCALE,
    DRIVER_SETTINGS_PREFERENCES,
    LOCALE_OPTIONS,
)
from app.services.api_client import ApiError, get_driver_settings


def default_settings() -> dict:
    return {
        "preferences": [dict(row) for row in DRIVER_SETTINGS_PREFERENCES],
        "locale": dict(DRIVER_SETTINGS_LOCALE),
        "audio": [dict(row) for row in DRIVER_SETTINGS_AUDIO],
        "locale_options": LOCALE_OPTIONS,
    }


def resolve_settings_page(token: str | None, session_store: dict | None) -> dict:
    if session_store:
        merged = default_settings()
        if session_store.get("preferences"):
            merged["preferences"] = session_store["preferences"]
        if session_store.get("locale"):
            merged["locale"] = {**merged["locale"], **session_store["locale"]}
        if session_store.get("audio"):
            merged["audio"] = session_store["audio"]
        return merged

    if token:
        try:
            data = get_driver_settings(token)
            return _from_api(data)
        except ApiError:
            pass

    return default_settings()


def _from_api(data: dict) -> dict:
    payload = data.get("data") or data
    base = default_settings()

    prefs = payload.get("driving_preferences") or payload.get("preferences")
    if isinstance(prefs, list):
        base["preferences"] = prefs
    elif isinstance(prefs, dict):
        base["preferences"] = _merge_toggles(base["preferences"], prefs)

    locale = payload.get("locale") or payload.get("localization")
    if isinstance(locale, dict):
        base["locale"] = {**base["locale"], **locale}

    audio = payload.get("audio_alerts") or payload.get("audio")
    if isinstance(audio, list):
        base["audio"] = audio
    elif isinstance(audio, dict):
        base["audio"] = _merge_toggles(base["audio"], audio)

    return base


def _merge_toggles(defaults: list, values: dict) -> list:
    merged = []
    for row in defaults:
        item = dict(row)
        if row["id"] in values:
            item["enabled"] = bool(values[row["id"]])
        merged.append(item)
    return merged


def settings_to_session_payload(settings: dict) -> dict:
    return {
        "preferences": copy.deepcopy(settings.get("preferences", [])),
        "locale": copy.deepcopy(settings.get("locale", {})),
        "audio": copy.deepcopy(settings.get("audio", [])),
    }
