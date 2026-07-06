"""Resolve driver earnings page data from API."""

from __future__ import annotations

from app.driver_api_transforms import earnings_from_api
from app.services.api_client import (
    ApiError,
    get_driver_earnings,
    get_driver_earnings_transactions,
    get_driver_payout_account,
    get_wallet,
)


def empty_earnings() -> dict:
    return earnings_from_api(
        {
            "today_earnings": 0,
            "weekly_earnings": 0,
            "monthly_earnings": 0,
            "available_balance": 0,
            "completed_trips": 0,
            "graph_data": [],
        }
    )


def resolve_earnings_page(token: str | None) -> tuple[dict, bool]:
    if not token:
        return empty_earnings(), False
    try:
        data = get_driver_earnings(token)
        wallet = None
        payout = None
        try:
            wallet = get_wallet(token)
        except ApiError:
            pass
        try:
            payout = get_driver_payout_account(token)
        except ApiError:
            pass
        return earnings_from_api(data, wallet, payout), True
    except ApiError:
        return empty_earnings(), False


def resolve_earnings_transactions(token: str | None, limit: int = 20) -> tuple[list[dict], bool]:
    if not token:
        return [], False
    try:
        payload = get_driver_earnings_transactions(token, limit=limit)
        rows = []
        for item in payload.get("transactions") or []:
            rows.append(
                {
                    "id": item.get("id"),
                    "label": item.get("description") or item.get("category") or "Earning",
                    "amount": item.get("amount_ngn"),
                    "time": item.get("created_at"),
                    "status": item.get("status"),
                }
            )
        return rows, True
    except ApiError:
        return [], False
