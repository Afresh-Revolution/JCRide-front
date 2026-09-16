"""Shape landmark booking API responses for templates."""

from datetime import datetime

WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

STATUS_LABELS = {
    "pending_payment": "Pending approval",
    "active": "Active",
    "paused": "Paused",
    "expired": "Expired",
    "exhausted": "Exhausted",
    "cancelled": "Cancelled",
}

STATUS_BADGE_CLASS = {
    "pending_payment": "is-pending",
    "active": "is-active",
    "paused": "is-paused",
    "expired": "is-expired",
    "exhausted": "is-expired",
    "cancelled": "is-expired",
}

SCHEDULE_LABELS = {
    "every_day": "Every day",
    "weekdays": "Weekdays (Mon–Fri)",
    "custom": "Custom days",
}


def naira(amount) -> str:
    try:
        return f"₦{float(amount):,.0f}"
    except (TypeError, ValueError):
        return "₦0"


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def format_date(value) -> str:
    parsed = _parse_dt(value)
    if not parsed:
        return "—"
    return parsed.strftime("%d %b %Y")


def schedule_label(schedule_type, travel_days=None) -> str:
    if schedule_type == "custom" and travel_days:
        days = sorted(int(d) for d in travel_days)
        return ", ".join(WEEKDAY_LABELS[d] for d in days)
    return SCHEDULE_LABELS.get(schedule_type, "Every day")


def status_label(status: str) -> str:
    return STATUS_LABELS.get(status, status.replace("_", " ").title())


def status_badge_class(status: str) -> str:
    return STATUS_BADGE_CLASS.get(status, "is-pending")


def subscriber_identity(row: dict) -> dict:
    from app.admin_ops_transforms import account_display_name
    person = next((row[key] for key in ("subscriber", "rider", "user") if isinstance(row.get(key), dict)), {})
    user_id = row.get("user_id") or row.get("rider_id") or row.get("subscriber_id") or person.get("id")
    name = row.get("subscriber_name") or row.get("user_name") or row.get("rider_name") or account_display_name(person)
    return {"subscriber_id": user_id, "subscriber_name": name or ""}


def fixed_route_plan_to_ui(plan: dict) -> dict:
    to_km = plan.get("to_km") or 0
    fro_km = plan.get("fro_km") or 0
    to_balance = plan.get("to_balance_km") or 0
    fro_balance = plan.get("fro_balance_km") or 0
    included_trips = plan.get("included_trips") or 0
    travel_days_count = plan.get("travel_days_count") or 0
    # Best-effort "trips used" for a progress bar — derived from the km
    # balance, not a stored counter (detour/partial coverage means this is
    # an estimate, not an exact trip count).
    used_to_legs = max(0, travel_days_count - (to_balance / to_km if to_km else 0))
    used_fro_legs = max(0, travel_days_count - (fro_balance / fro_km if fro_km else 0))
    trips_used = int(round(used_to_legs + used_fro_legs))
    trips_used = min(trips_used, included_trips) if included_trips else 0
    progress_percent = int(round((trips_used / included_trips) * 100)) if included_trips else 0
    return {
        **subscriber_identity(plan),
        "id": plan.get("id"),
        "plan_type": "fixed_route",
        "label": plan.get("label") or f"{plan.get('pickup_address', '')} ↔ {plan.get('destination_address', '')}",
        "pickup_address": plan.get("pickup_address"),
        "destination_address": plan.get("destination_address"),
        "pickup_lat": plan.get("pickup_lat"),
        "pickup_lng": plan.get("pickup_lng"),
        "destination_lat": plan.get("destination_lat"),
        "destination_lng": plan.get("destination_lng"),
        "service_tier": (plan.get("service_tier") or "economy").title(),
        "vehicle_category": plan.get("vehicle_category"),
        "billing_cycle": (plan.get("billing_cycle") or "").title(),
        "schedule_label": schedule_label(plan.get("schedule_type"), plan.get("travel_days")),
        "schedule_type": plan.get("schedule_type"),
        "travel_days": plan.get("travel_days"),
        "included_trips": included_trips,
        "trips_used": trips_used,
        "progress_percent": max(0, min(100, progress_percent)),
        "price_display": naira(plan.get("price_ngn")),
        "status": plan.get("status"),
        "status_label": status_label(plan.get("status", "")),
        "status_badge_class": status_badge_class(plan.get("status", "")),
        "started_at_display": format_date(plan.get("started_at")),
        "expires_at_display": format_date(plan.get("expires_at")),
        "to_balance_km": round(to_balance, 1),
        "fro_balance_km": round(fro_balance, 1),
    }


def km_bundle_subscription_to_ui(sub: dict) -> dict:
    km_total = sub.get("km_total") or 0
    km_remaining = sub.get("km_remaining") or 0
    progress_percent = int(round((km_remaining / km_total) * 100)) if km_total else 0
    return {
        **subscriber_identity(sub),
        "id": sub.get("id"),
        "plan_type": "km_bundle",
        "label": sub.get("pack_name") or f"{km_total:g} KM Pack",
        "km_total": km_total,
        "km_remaining": round(km_remaining, 1),
        "remaining_value_display": naira(sub.get("remaining_value_ngn")),
        "price_display": naira(sub.get("price_paid_ngn")),
        "progress_percent": max(0, min(100, progress_percent)),
        "status": sub.get("status"),
        "status_label": status_label(sub.get("status", "")),
        "status_badge_class": status_badge_class(sub.get("status", "")),
        "started_at_display": format_date(sub.get("started_at")),
    }


def my_plans_to_ui(payload: dict) -> list[dict]:
    fixed_routes = [fixed_route_plan_to_ui(p) for p in payload.get("fixed_route_plans") or []]
    km_bundles = [km_bundle_subscription_to_ui(s) for s in payload.get("km_bundle_subscriptions") or []]
    plans = fixed_routes + km_bundles
    order = {"active": 0, "paused": 1, "pending_payment": 2, "expired": 3, "exhausted": 3, "cancelled": 4}
    plans.sort(key=lambda item: order.get(item["status"], 5))
    return plans


def km_bundle_pack_to_ui(pack: dict) -> dict:
    return {
        "id": pack.get("id"),
        "name": pack.get("name") or f"{pack.get('km_amount', 0):g} KM Pack",
        "km_amount": pack.get("km_amount"),
        "price_ngn": pack.get("price_ngn"),
        "price_display": naira(pack.get("price_ngn")),
        "discount_percent": pack.get("discount_percent") or 0,
        "final_price_ngn": pack.get("final_price_ngn"),
        "final_price_display": naira(pack.get("final_price_ngn")),
        "is_active": pack.get("is_active", True),
    }
