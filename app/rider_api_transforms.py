"""Map JosRide-back rider API payloads to UI shapes expected by user templates."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.rider_defaults import (
    LIVE_AREA,
    LIVE_TRACKING,
    NOTIFICATION_CHANNELS,
    NOTIFICATION_TOPICS,
    PROFILE_DEFAULTS,
    RIDER_STATS,
    SETTINGS_DEFAULTS,
    TRACKING_FINDING,
    WALLET_SUMMARY,
    WALLET_TRANSACTIONS,
    build_live_area_map,
)

CATEGORY_LABELS = {
    "billing": "Billing & payments",
    "trip": "Trip issue",
    "account": "Account access",
    "other": "Other",
}


def format_ngn(amount: float | int | None, *, decimals: bool = False) -> str:
    if amount is None:
        return "₦0"
    if decimals:
        return f"₦{float(amount):,.2f}"
    return f"₦{float(amount):,.0f}"


def infer_city(address: str) -> str:
    lower = (address or "").lower()
    cities = (
        ("port harcourt", "Port Harcourt"),
        ("victoria island", "Lagos"),
        ("lekki", "Lagos"),
        ("lagos", "Lagos"),
        ("abuja", "Abuja"),
        ("ibadan", "Ibadan"),
        ("kano", "Kano"),
        ("enugu", "Enugu"),
        ("jos", "Jos"),
    )
    for needle, label in cities:
        if needle in lower:
            return label
    return "Lagos"


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def format_relative_time(value: str | None) -> str:
    dt = _parse_dt(value)
    if not dt:
        return ""
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = now - dt
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return "Just now"
    if seconds < 3600:
        return f"{seconds // 60} min ago"
    if seconds < 86400:
        return f"{seconds // 3600} h ago"
    if seconds < 172800:
        return "Yesterday"
    return dt.astimezone().strftime("%d %b")


def format_trip_datetime(value: str | None) -> tuple[str, str]:
    dt = _parse_dt(value)
    if not dt:
        return ("", "")
    local = dt.astimezone()
    today = datetime.now().astimezone().date()
    date_label = "Today" if local.date() == today else local.strftime("%a %d %b")
    return (date_label, local.strftime("%H:%M"))


def ride_status_label(status: str | None) -> str:
    mapping = {
        "requested": "requested",
        "searching": "finding driver",
        "driver_assigned": "driver assigned",
        "driver_arrived": "driver arrived",
        "in_progress": "in progress",
        "completed": "completed",
        "cancelled": "cancelled",
    }
    return mapping.get(status or "", status or "unknown")


def ride_to_recent_trip(ride: dict) -> dict:
    date_label, time_label = format_trip_datetime(
        ride.get("completed_at") or ride.get("started_at") or ride.get("requested_at")
    )
    fare = ride.get("final_fare_ngn") or ride.get("estimated_fare_ngn") or 0
    return {
        "date": date_label,
        "time": time_label,
        "pickup": ride.get("pickup_address") or "—",
        "destination": ride.get("destination_address") or "—",
        "distance": f"{ride.get('distance_km', 0):.1f} km",
        "fare": format_ngn(fare),
        "status": ride_status_label(ride.get("status")),
    }


def ride_to_history_trip(ride: dict) -> dict:
    date_label, time_label = format_trip_datetime(
        ride.get("completed_at") or ride.get("requested_at")
    )
    fare = ride.get("final_fare_ngn") or ride.get("estimated_fare_ngn") or 0
    duration = ride.get("actual_duration_minutes") or ride.get("estimated_duration_minutes") or 0
    return {
        "ride_id": ride.get("id"),
        "id": ride.get("booking_id") or ride.get("id") or "—",
        "date": date_label.replace("Today", datetime.now().strftime("%b %d")),
        "time": time_label,
        "pickup": ride.get("pickup_address") or "—",
        "destination": ride.get("destination_address") or "—",
        "distance": f"{ride.get('actual_distance_km') or ride.get('distance_km', 0):.1f} km",
        "duration": f"{duration} min",
        "fare": format_ngn(fare),
        "status": ride_status_label(ride.get("status")),
    }


def build_dashboard_stats(wallet: dict | None, rides: list[dict]) -> dict:
    stats = dict(RIDER_STATS)
    if wallet:
        balance = wallet.get("balance") or 0
        spent = wallet.get("total_spent_on_rides") or 0
        stats["wallet_balance"] = {
            "value": format_ngn(balance),
            "trend": f"{format_ngn(spent)} spent on rides",
        }
        stats["total_spending"] = {
            "value": format_ngn(spent),
            "trend": "From your wallet",
        }
    completed = [r for r in rides if r.get("status") == "completed"]
    stats["total_trips"] = {
        "value": str(len(completed) or len(rides)),
        "trend": f"{len(completed)} completed",
    }
    return stats


def dashboard_stats_from_api(stats: dict | None) -> dict:
    data = dict(RIDER_STATS)
    if not stats:
        return data
    data["wallet_balance"] = {
        "value": format_ngn(stats.get("wallet_balance_ngn", 0)),
        "trend": stats.get("wallet_trend") or data["wallet_balance"]["trend"],
    }
    data["total_trips"] = {
        "value": str(stats.get("completed_trips") or stats.get("total_trips") or 0),
        "trend": stats.get("trips_trend") or data["total_trips"]["trend"],
    }
    data["total_spending"] = {
        "value": format_ngn(stats.get("total_spending_ngn", 0)),
        "trend": stats.get("spending_trend") or data["total_spending"]["trend"],
    }
    if stats.get("location_label"):
        data["location"] = {"value": stats["location_label"]}
    return data


def nearby_drivers_to_map(center: dict, payload: dict | None, location_label: str = "Your area") -> dict:
    from app.rider_defaults import build_live_area_map

    if not payload or not payload.get("drivers"):
        return build_live_area_map(location_label)
    drivers = payload.get("drivers") or []
    return {
        "location_label": location_label,
        "map_center": dict(center),
        "map_zoom": 14,
        "radius_km": payload.get("radius_km", 2),
        "driver_count": payload.get("driver_count", len(drivers)),
        "drivers": [{"lat": d["lat"], "lng": d["lng"]} for d in drivers],
    }


def faq_from_api(payload: dict | None) -> list[dict]:
    if not payload:
        return []
    items = payload.get("items") or []
    return [{"question": i.get("question"), "answer": i.get("answer")} for i in items]


def contacts_to_share_ui(contacts: list[dict]) -> list[dict]:
    rows = []
    for contact in contacts:
        name = contact.get("name") or "Contact"
        parts = name.split()
        initials = "".join(p[0].upper() for p in parts[:2]) or "?"
        rows.append(
            {
                "id": contact.get("id"),
                "name": name,
                "phone": contact.get("phone") or "",
                "initials": initials,
                "trusted": True,
            }
        )
    return rows


def build_wallet_summary(wallet: dict | None) -> dict:
    summary = dict(WALLET_SUMMARY)
    if not wallet:
        return summary
    balance = wallet.get("balance") or 0
    funded = wallet.get("total_funded") or 0
    spent = wallet.get("total_spent_on_rides") or 0
    summary.update(
        {
            "balance": format_ngn(balance, decimals=True),
            "balance_sub": "Available balance",
            "total_deposits": format_ngn(funded),
            "deposits_trend": "Total funded",
            "total_spending": format_ngn(spent),
            "spending_trend": "Ride payments",
        }
    )
    return summary


def wallet_transactions_to_ui(transactions: list[dict]) -> list[dict]:
    rows = []
    for tx in transactions:
        amount = tx.get("amount_ngn") or 0
        tx_type = tx.get("type") or "debit"
        sign = "+" if tx_type == "credit" else "-"
        category = tx.get("category") or ""
        title = tx.get("description") or category.replace("_", " ").title()
        status = (tx.get("status") or "success").capitalize()
        rows.append(
            {
                "type": "refund" if category == "refund" else tx_type,
                "title": title,
                "time": format_relative_time(tx.get("created_at")),
                "amount": f"{sign}{format_ngn(amount)}",
                "status": status,
            }
        )
    return rows


def profile_from_api(profile: dict | None) -> dict:
    data = dict(PROFILE_DEFAULTS)
    if not profile:
        return data
    user = profile.get("user") or profile
    created = _parse_dt(user.get("created_at"))
    extras = profile.get("profile") or {}
    data.update(
        {
            "full_name": user.get("full_name") or data["full_name"],
            "phone": user.get("phone") or data["phone"],
            "email": user.get("email") or data["email"],
            "member_since": created.strftime("%b %Y") if created else data["member_since"],
            "badge": "Verified rider" if user.get("email_verified") else "Rider",
        }
    )
    if extras.get("date_of_birth"):
        dob = extras["date_of_birth"]
        if hasattr(dob, "strftime"):
            data["dob"] = dob.strftime("%d %b %Y")
            data["dob_iso"] = dob.strftime("%Y-%m-%d")
        else:
            data["dob"] = str(dob)
            data["dob_iso"] = str(dob)[:10]
    if extras.get("nin"):
        nin = str(extras["nin"])
        data["nin"] = nin[:3] + "****" + nin[-4:] if len(nin) > 7 else nin
    data["emergency_contact_name"] = extras.get("emergency_contact_name") or ""
    data["emergency_contact_phone"] = extras.get("emergency_contact_phone") or ""
    ec_name = data["emergency_contact_name"]
    ec_phone = data["emergency_contact_phone"]
    if ec_name or ec_phone:
        data["emergency_contact"] = " · ".join(filter(None, [ec_name, ec_phone]))
    locs = profile.get("saved_locations") or []
    data["saved_locations"] = [
        {"label": loc.get("label"), "address": loc.get("address")} for loc in locs
    ]
    data["trusted_contacts"] = profile.get("trusted_contacts") or []
    return data


def settings_from_api(settings: dict | None) -> dict:
    data = dict(SETTINGS_DEFAULTS)
    if not settings:
        return data
    data.update(
        {
            "dark_mode": bool(settings.get("dark_mode")),
            "use_location": bool(settings.get("share_device_location")),
            "show_fare_per_km": bool(settings.get("show_fare_estimate_km")),
            "share_analytics": bool(settings.get("share_trip_data_for_analytics")),
            "share_name_with_driver": bool(settings.get("allow_driver_see_name")),
            "language": settings.get("language") or data["language"],
            "distance_units": "Kilometers (km)"
            if (settings.get("distance_unit") or "km") == "km"
            else "Miles (mi)",
            "timezone": settings.get("timezone") or data["timezone"],
        }
    )
    return data


def notification_kind(n_type: str | None) -> str:
    value = (n_type or "").lower()
    if "wallet" in value or "payment" in value:
        return "wallet"
    if "schedule" in value:
        return "schedule"
    if "security" in value:
        return "security"
    if "promo" in value:
        return "promo"
    return "ride"


def notifications_to_ui(notifications: list[dict]) -> list[dict]:
    rows = []
    for item in notifications:
        rows.append(
            {
                "id": item.get("id"),
                "kind": notification_kind(item.get("type")),
                "title": item.get("title") or "Notification",
                "body": item.get("body") or "",
                "time": format_relative_time(item.get("created_at")),
                "unread": not bool(item.get("read_at")),
            }
        )
    return rows


def notification_channels_from_api(prefs: dict | None) -> list[dict]:
    channels = [dict(row) for row in NOTIFICATION_CHANNELS]
    if not prefs:
        return channels
    mapping = {
        "push": prefs.get("push_enabled"),
        "email": prefs.get("email_enabled"),
        "sms": prefs.get("sms_enabled"),
    }
    for row in channels:
        if row["id"] in mapping and mapping[row["id"]] is not None:
            row["enabled"] = bool(mapping[row["id"]])
    return channels


def notification_topics_from_api(prefs: dict | None) -> list[dict]:
    topics = [dict(row) for row in NOTIFICATION_TOPICS]
    if not prefs:
        return topics
    mapping = {
        "ride_status": prefs.get("ride_updates"),
        "driver_arrival": prefs.get("ride_updates"),
        "receipts": prefs.get("wallet_updates"),
        "promotions": prefs.get("promos"),
        "security": prefs.get("security_alerts"),
    }
    for row in topics:
        if row["id"] in mapping and mapping[row["id"]] is not None:
            row["enabled"] = bool(mapping[row["id"]])
    return topics


def prefs_update_from_ui(group: str, pref_id: str, enabled: bool) -> dict[str, bool]:
    if group == "channels":
        field_map = {"push": "push_enabled", "email": "email_enabled", "sms": "sms_enabled"}
        field = field_map.get(pref_id)
        return {field: enabled} if field else {}
    field_map = {
        "ride_status": "ride_updates",
        "driver_arrival": "ride_updates",
        "receipts": "wallet_updates",
        "promotions": "promos",
        "security": "security_alerts",
    }
    field = field_map.get(pref_id)
    return {field: enabled} if field else {}


def scheduled_ride_to_ui(item: dict) -> dict:
    scheduled_for = _parse_dt(item.get("scheduled_for"))
    when = scheduled_for.astimezone().strftime("%a, %d %b · %I:%M %p") if scheduled_for else "—"
    tier = (item.get("service_tier") or "comfort").capitalize()
    fare = item.get("estimated_fare_ngn") or 0
    return {
        "id": item.get("id"),
        "pickup": item.get("pickup_address") or "—",
        "destination": item.get("destination_address") or "—",
        "datetime": when,
        "class": tier,
        "repeat": "Once",
        "reminder": f"{item.get('reminder_minutes_before', 30)} min before",
        "fare": format_ngn(fare),
    }


def estimate_to_booking_fields(estimate: dict, pickup: str, dropoff: str) -> dict:
    return {
        "pickup": pickup,
        "dropoff": dropoff,
        "distance": f"{estimate.get('distance_km', 0):.1f} km",
        "duration": f"{estimate.get('estimated_duration_minutes', 0)} min",
        "est_fare": format_ngn(estimate.get("estimated_fare_ngn")),
    }


def estimate_to_tiers(estimate: dict, selected_tier: str = "economy") -> list[dict]:
    fare = estimate.get("estimated_fare_ngn") or 0
    duration = estimate.get("estimated_duration_minutes") or 0
    tiers = []
    for tier_id, name, multiplier in (
        ("economy", "Economy", 1.0),
        ("comfort", "Comfort", 1.35),
        ("premium", "Premium", 1.85),
    ):
        tiers.append(
            {
                "id": tier_id,
                "name": name,
                "badge": "Most popular" if tier_id == "economy" else None,
                "description": f"~{duration} min trip",
                "seats": 4,
                "eta": f"{max(3, duration // 5)} min",
                "fare": format_ngn(round(fare * multiplier)),
                "fare_num": round(fare * multiplier),
                "icon": tier_id,
                "selected": tier_id == selected_tier,
            }
        )
    return tiers


def delivery_estimate_to_defaults(estimate: dict, pickup: str, dropoff: str) -> dict:
    fare = estimate.get("estimated_fare_ngn") or 0
    duration = estimate.get("estimated_duration_minutes") or 0
    return {
        "pickup": pickup,
        "dropoff": dropoff,
        "distance": f"{estimate.get('distance_km', 0):.1f} km",
        "eta": f"{duration} min",
        "fare": format_ngn(fare),
        "fare_num": round(fare),
        "pickup_eta": f"{max(4, duration // 4)} min",
    }


def ride_to_active_trip(ride: dict) -> dict:
    fare = ride.get("estimated_fare_ngn") or ride.get("final_fare_ngn") or 0
    return {
        "ride_id": ride.get("id"),
        "booking_id": ride.get("booking_id"),
        "pickup": ride.get("pickup_address") or "",
        "dropoff": ride.get("destination_address") or "",
        "tier": ride.get("service_tier") or "economy",
        "fare": format_ngn(fare),
        "vehicle_type": "bike" if ride.get("vehicle_category") == "bike" else "car",
        "request_type": ride.get("request_type") or "ride",
        "status": ride.get("status"),
    }


def ride_to_tracking(ride: dict | None) -> tuple[dict, dict]:
    tracking = {
        "status_label": "No active trip",
        "pickup": "",
        "destination": "",
        "booking_id": "",
        "tier": "—",
        "fare_estimate": "—",
        "step": 1,
        "driver": {
            "initials": "—",
            "name": "—",
            "rating": "—",
            "trips": "—",
            "plate": "—",
            "vehicle": "—",
            "status": "—",
        },
    }
    finding = {
        "pickup": "",
        "destination": "",
        "fare_estimate": "—",
        "match_delay_ms": 0,
    }
    if not ride:
        return tracking, finding

    driver = ride.get("driver") or {}
    driver_name = driver.get("full_name") or "Your driver"
    initials = "".join(part[0] for part in driver_name.split()[:2]).upper() or "DR"
    fare = ride.get("estimated_fare_ngn") or ride.get("final_fare_ngn") or 0
    status = ride.get("status") or "requested"
    status_labels = {
        "requested": "Finding a driver",
        "searching": "Finding a driver",
        "driver_assigned": "Driver assigned",
        "driver_arrived": "Driver arrived",
        "in_progress": "Trip in progress",
        "completed": "Trip completed",
    }
    tracking.update(
        {
            "status_label": status_labels.get(status, status.replace("_", " ").title()),
            "pickup": ride.get("pickup_address") or tracking["pickup"],
            "destination": ride.get("destination_address") or tracking["destination"],
            "booking_id": ride.get("booking_id") or tracking["booking_id"],
            "tier": (ride.get("service_tier") or "economy").capitalize(),
            "fare_estimate": format_ngn(fare),
            "driver": {
                "initials": initials,
                "name": driver_name,
                "rating": str(driver.get("rating_avg") or "—"),
                "trips": str(driver.get("completed_trips") or "—"),
                "plate": driver.get("vehicle_plate") or "—",
                "vehicle": driver.get("vehicle_model") or "—",
                "status": status_labels.get(status, status).upper(),
            },
        }
    )
    finding.update(
        {
            "pickup": ride.get("pickup_address") or finding["pickup"],
            "destination": ride.get("destination_address") or finding["destination"],
            "fare_estimate": format_ngn(fare),
            "area": infer_city(ride.get("pickup_address") or ""),
        }
    )
    return tracking, finding


def rider_location_from_rides(rides: list[dict]) -> str:
    if rides:
        return infer_city(rides[0].get("pickup_address") or rides[0].get("city") or "")
    return infer_city("")


def live_area_from_location(location: str) -> dict:
    area = dict(LIVE_AREA)
    area["subtitle"] = f"Your area · {location}"
    return area


def live_area_map_for_location(location: str) -> dict:
    return build_live_area_map(location or "Lagos")


def support_ticket_to_ui(ticket: dict) -> dict:
    return {
        "id": ticket.get("id"),
        "subject": ticket.get("subject") or "Support ticket",
        "category": ticket.get("category") or "other",
        "status": (ticket.get("status") or "open").replace("_", " "),
        "priority": ticket.get("priority") or "medium",
        "created_at": format_relative_time(ticket.get("created_at")),
    }


def tracking_step_for_status(status: str | None) -> int:
    mapping = {
        "requested": 1,
        "searching": 1,
        "driver_assigned": 2,
        "driver_arrived": 2,
        "in_progress": 3,
        "completed": 4,
    }
    return mapping.get(status or "", 1)


def support_category_slug(label: str) -> str:
    lower = label.lower()
    if "billing" in lower or "payment" in lower:
        return "billing"
    if "trip" in lower:
        return "trip"
    if "account" in lower:
        return "account"
    return "other"
