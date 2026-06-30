"""Resolve driver earnings page data from API or local defaults."""

from __future__ import annotations

from app.driver_portal.data import (
    EARNINGS_DAILY_TRIPS,
    EARNINGS_SUMMARY,
    EARNINGS_WEEKLY_TREND,
    WITHDRAWAL_INFO,
)
from app.services.api_client import ApiError, get_driver_earnings


def _fmt_ngn(amount) -> str:
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0
    return f"₦{value:,.0f}"


def _fmt_ngn_decimal(amount) -> str:
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0
    return f"₦{value:,.2f}"


def resolve_earnings_page(token: str | None) -> dict:
    """Return earnings view model for template and charts."""
    if token:
        try:
            data = get_driver_earnings(token)
            return _from_api(data)
        except ApiError:
            pass

    return {
        "summary": EARNINGS_SUMMARY,
        "weekly_trend": EARNINGS_WEEKLY_TREND,
        "daily_trips": EARNINGS_DAILY_TRIPS,
        "withdrawal": WITHDRAWAL_INFO,
    }


def _from_api(data: dict) -> dict:
    payload = data.get("data") or data
    summary_raw = payload.get("summary") or {}
    weekly = payload.get("weekly_trend") or payload.get("earnings_by_week") or {}
    daily = payload.get("daily_trips") or payload.get("trips_by_day") or {}
    wallet = payload.get("wallet") or payload.get("withdrawal") or {}

    withdraw_amount = wallet.get("available_ngn") or wallet.get("balance_ngn") or 94210

    summary = [
        {
            "id": "today",
            "label": "TODAY",
            "value": _fmt_ngn(summary_raw.get("today_ngn")),
            "badge": f"▲ {summary_raw.get('today_trips', 14)} trips",
            "icon": "wallet",
        },
        {
            "id": "week",
            "label": "THIS WEEK",
            "value": _fmt_ngn(summary_raw.get("week_ngn")),
            "badge": f"▲ {summary_raw.get('week_change_pct', 18)}%",
            "icon": "trend",
        },
        {
            "id": "month",
            "label": "THIS MONTH",
            "value": _fmt_ngn(summary_raw.get("month_ngn")),
            "badge": f"▲ {summary_raw.get('month_trips', 382)} trips",
            "icon": "calendar",
        },
        {
            "id": "withdraw",
            "label": "AVAILABLE TO WITHDRAW",
            "value": _fmt_ngn(withdraw_amount),
            "badge": None,
            "icon": "withdraw",
        },
    ]

    weekly_labels = weekly.get("labels") or ["W1", "W2", "W3", "W4"]
    weekly_values = weekly.get("values") or weekly.get("amounts_ngn") or [72000, 91000, 68000, 101400]

    daily_labels = daily.get("labels") or ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    daily_values = daily.get("values") or daily.get("counts") or [12, 15, 11, 18, 22, 34, 28]

    return {
        "summary": summary,
        "weekly_trend": {"labels": weekly_labels, "values": weekly_values},
        "daily_trips": {"labels": daily_labels, "values": daily_values},
        "withdrawal": {
            "amount": _fmt_ngn_decimal(withdraw_amount),
            "amount_raw": float(withdraw_amount or 0),
            "bank_name": wallet.get("bank_name") or "GTBank",
            "account_masked": wallet.get("account_masked") or "**** 8221",
            "provider": wallet.get("provider") or "Instant via Monnify",
        },
    }
