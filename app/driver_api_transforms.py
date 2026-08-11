"""Map JosRide-back driver API payloads to driver portal UI models."""

from __future__ import annotations

from app.rider_api_transforms import faq_from_api, format_relative_time
from app.services.api_client import get_support_faq


def _fmt_ngn(amount) -> str:
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0
    return f"₦{value:,.0f}"


def _initials(name: str) -> str:
    parts = (name or "").split()
    return "".join(part[0] for part in parts[:2]).upper() or "DR"


def _notification_type(n_type: str | None) -> str:
    value = (n_type or "").lower()
    if "payout" in value or "withdraw" in value or "wallet" in value or "earning" in value:
        return "payout"
    if "rating" in value or "tip" in value:
        return "rating"
    if "surge" in value:
        return "surge"
    if "document" in value or "warning" in value or "expir" in value:
        return "warning"
    return "ride"


def driver_notifications_to_ui(notifications: list[dict]) -> list[dict]:
    rows = []
    for item in notifications:
        rows.append(
            {
                "id": item.get("id"),
                "type": _notification_type(item.get("type")),
                "title": item.get("title") or "Notification",
                "body": item.get("body") or "",
                "time": format_relative_time(item.get("created_at")),
                "unread": not bool(item.get("read_at")),
            }
        )
    return rows


def driver_alert_settings_from_api(settings: dict | None, prefs: dict | None) -> list[dict]:
    settings = settings or {}
    prefs = prefs or {}
    return [
        {
            "id": "ride_requests",
            "label": "New ride requests",
            "enabled": bool(settings.get("request_sound", True)),
        },
        {
            "id": "surge",
            "label": "Surge zones nearby",
            "enabled": bool(settings.get("surge_alerts", True)),
        },
        {
            "id": "earnings",
            "label": "Earnings & payouts",
            "enabled": bool(prefs.get("wallet_updates", True)),
        },
        {
            "id": "ratings",
            "label": "Ratings & tips",
            "enabled": bool(prefs.get("ride_updates", True)),
        },
        {
            "id": "documents",
            "label": "Document expiry",
            "enabled": bool(prefs.get("security_alerts", True)),
        },
        {
            "id": "promotions",
            "label": "Promotions for drivers",
            "enabled": bool(prefs.get("promos", False)),
        },
    ]


def driver_channel_settings_from_api(prefs: dict | None) -> list[dict]:
    prefs = prefs or {}
    return [
        {
            "id": "push",
            "label": "Push notifications",
            "enabled": bool(prefs.get("push_enabled", True)),
        },
        {
            "id": "email",
            "label": "Email",
            "enabled": bool(prefs.get("email_enabled", True)),
        },
        {
            "id": "sms",
            "label": "SMS",
            "enabled": bool(prefs.get("sms_enabled", False)),
        },
    ]


def dashboard_from_api(
    data: dict,
    earnings: dict | None = None,
    demand: dict | None = None,
    *,
    is_bike: bool = False,
) -> dict:
    earnings = earnings or {}
    demand = demand or {}
    weekly = data.get("weekly_earnings") or []
    day_labels = []
    day_values = []
    for point in weekly:
        day = point.get("day") or ""
        day_labels.append(day[:3] if day else "")
        day_values.append(float(point.get("amount_ngn") or 0))

    graph = earnings.get("graph_data") or []
    if graph and not any(day_values):
        day_labels = [row.get("day", "")[:3] for row in graph]
        day_values = [float(row.get("amount_ngn") or 0) for row in graph]

    today_earnings = float(earnings.get("today_earnings") or 0)
    rating = float(data.get("rating_avg") or 0)
    completed = int(data.get("completed_trips") or 0)
    online_hours = float(data.get("online_hours") or 0)

    job_label = "deliveries" if is_bike else "trips"
    metrics = [
        {
            "title": "Today's Earnings",
            "value": _fmt_ngn(today_earnings),
            "trend": f"▲ {completed} {job_label} total" if completed else None,
            "icon": "wallet",
        },
        {
            "title": "Completed Deliveries" if is_bike else "Completed Trips",
            "value": str(completed),
            "trend": None,
            "icon": "route",
        },
        {
            "title": "Online Hours",
            "value": f"{online_hours:.1f} h" if online_hours else "-",
            "trend": None,
            "icon": "clock",
        },
        {
            "title": "Rating",
            "value": f"{rating:.2f} / 5" if rating else "-",
            "trend": None,
            "icon": "star",
        },
    ]

    total_week = sum(day_values) if day_values else float(earnings.get("weekly_earnings") or 0)

    demand_zone = demand.get("zone")
    surge_mult = demand.get("surge_multiplier")
    new_requests = int(demand.get("new_requests") or 0)

    return {
        "metrics": metrics,
        "weekly": {
            "total": _fmt_ngn(total_week),
            "trend": None,
            "labels": day_labels or ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "values": day_values or [0, 0, 0, 0, 0, 0, 0],
        },
        "demand": {
            "zone": demand_zone or "Your area",
            "new_requests": new_requests,
        }
        if demand
        else None,
        "online": bool(data.get("is_online")),
        "zone": demand_zone,
        "surge": f"x{surge_mult}" if surge_mult and float(surge_mult) > 1 else None,
        "driver_name": data.get("driver_name") or "",
        "approval_status": str(data.get("approval_status") or "").replace("_", " ").title(),
        "active_ride_id": data.get("active_ride_id"),
        "active_ride_status": data.get("active_ride_status"),
        "active_pickup_address": data.get("active_pickup_address") or "",
        "active_destination_address": data.get("active_destination_address") or "",
        "active_pickup_lat": data.get("active_pickup_lat"),
        "active_pickup_lng": data.get("active_pickup_lng"),
    }


def ride_requests_from_api(requests: list[dict], *, is_bike: bool = False) -> list[dict]:
    rows = []
    for item in requests:
        fare = float(item.get("estimated_fare_ngn") or item.get("driver_earning_ngn") or 0)
        duration = int(item.get("estimated_duration_minutes") or 0)
        distance = float(item.get("distance_km") or 0)
        request_type = str(item.get("request_type") or ("delivery" if is_bike else "ride")).lower()
        is_delivery = is_bike or request_type == "delivery"
        rider_name = (
            item.get("recipient_name")
            or item.get("customer_name")
            or ("Customer" if is_delivery else "Rider")
        )
        package = (item.get("package_details") or item.get("package_notes") or "").strip()
        rows.append(
            {
                "id": str(item.get("ride_id") or item.get("id") or ""),
                "rider_name": rider_name,
                "rider_initials": _initials(rider_name),
                "rating": float(item.get("customer_rating") or 0) or None,
                # Delivery bikes have no economy/comfort/premium type.
                "rider_tier": (
                    ""
                    if is_delivery
                    else str(item.get("service_tier") or "economy").replace("_", " ").title() + " rider"
                ),
                "distance_km": distance,
                "duration_min": duration,
                "pickup_eta": f"~{max(3, duration // 4)} min" if duration else "-",
                "pickup": item.get("pickup_address") or "",
                "destination": item.get("destination_address") or "",
                "earnings": _fmt_ngn(fare),
                "is_delivery": is_delivery,
                "package_details": package,
                "accept_label": "Accept delivery" if is_delivery else "Accept ride",
                "dest_label": "DROPOFF" if is_delivery else "DESTINATION",
            }
        )
    return rows


def earnings_from_api(data: dict, wallet: dict | None = None, payout: dict | None = None) -> dict:
    wallet = wallet or {}
    payout = payout or {}
    withdraw_amount = float(
        data.get("available_balance")
        or wallet.get("balance")
        or wallet.get("balance_ngn")
        or wallet.get("available_balance_ngn")
        or 0
    )
    graph = data.get("graph_data") or []
    day_labels = [row.get("day", "")[:3] for row in graph] if graph else []
    day_values = [float(row.get("amount_ngn") or 0) for row in graph] if graph else []

    summary = [
        {
            "id": "today",
            "label": "TODAY",
            "value": _fmt_ngn(data.get("today_earnings")),
            "badge": f"▲ {data.get('completed_trips', 0)} trips",
            "icon": "wallet",
        },
        {
            "id": "week",
            "label": "THIS WEEK",
            "value": _fmt_ngn(data.get("weekly_earnings")),
            "badge": None,
            "icon": "trend",
        },
        {
            "id": "month",
            "label": "THIS MONTH",
            "value": _fmt_ngn(data.get("monthly_earnings")),
            "badge": None,
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

    return {
        "summary": summary,
        "weekly_trend": {
            "labels": day_labels or ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "values": day_values or [0, 0, 0, 0, 0, 0, 0],
        },
        "daily_trips": {
            "labels": day_labels or ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "values": day_values or [0, 0, 0, 0, 0, 0, 0],
        },
        "withdrawal": {
            "amount": f"₦{withdraw_amount:,.2f}",
            "amount_raw": withdraw_amount,
            "bank_name": payout.get("bank_name") or wallet.get("bank_name") or "",
            "account_masked": payout.get("account_number_masked") or wallet.get("account_masked") or "",
            "provider": wallet.get("provider") or "Instant payout",
            "account_name": payout.get("account_name") or "",
        },
    }


def _vehicle_field(value) -> str:
    text = str(value or "").strip()
    return text


def profile_from_api(data: dict, performance: dict | None = None) -> dict:
    driver = data.get("driver") or data.get("data") or data
    performance = performance or {}
    name = driver.get("full_name") or "Driver"
    since = driver.get("approved_at") or driver.get("created_at") or ""
    if since and "T" in str(since):
        since = str(since).split("T")[0]

    make = _vehicle_field(driver.get("vehicle_make"))
    model = _vehicle_field(driver.get("vehicle_model"))
    color = _vehicle_field(driver.get("vehicle_color"))
    plate = _vehicle_field(driver.get("plate_number"))
    raw_category = _vehicle_field(driver.get("vehicle_category")).lower()
    raw_tier = _vehicle_field(driver.get("service_tier")).lower()
    # Keep empty when unset so bike signups are not silently treated as cars.
    vehicle_category = raw_category
    # Bikes have no public tier type; still keep economy internally if the API set it.
    service_tier = "" if raw_category == "bike" else raw_tier
    make_model = f"{make} {model}".strip()
    vehicle_complete = bool(
        make and model and color and plate and raw_category and (raw_category == "bike" or raw_tier)
    )

    return {
        "name": name,
        "initials": _initials(name),
        "since": str(since) if since else "-",
        "rating": float(driver.get("rating_avg") or performance.get("avg_rating") or 0),
        "trips": int(driver.get("total_completed_trips") or performance.get("total_completed_trips") or 0),
        "acceptance": f"{performance.get('acceptance_rate_pct', 0):.0f}%" if performance else "-",
        "completion": f"{performance.get('completion_rate_pct', 0):.0f}%" if performance else "-",
        "on_time": f"{performance.get('on_time_rate_pct', 0):.0f}%" if performance.get("on_time_rate_pct") is not None else "-",
        "vehicle": {
            "make_model": make_model or "-",
            "make": make,
            "model": model,
            "color": color or "-",
            "plate": plate or "-",
            "category": raw_category.replace("_", " ").title() if raw_category else "-",
            "tier_label": "" if raw_category == "bike" else (raw_tier.replace("_", " ").title() if raw_tier else "-"),
            "vehicle_category": vehicle_category,
            "service_tier": service_tier,
            "is_complete": vehicle_complete,
        },
        "documents": driver.get("documents") or [],
    }


def support_faq_for_driver() -> list[dict]:
    try:
        return faq_from_api(get_support_faq())
    except Exception:
        return []


SUPPORT_CATEGORIES = [
    {"id": "trip", "label": "Trip issue"},
    {"id": "earnings", "label": "Earnings & payout"},
    {"id": "account", "label": "Account & documents"},
    {"id": "safety", "label": "Safety"},
    {"id": "other", "label": "Other"},
]
