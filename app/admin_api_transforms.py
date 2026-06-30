"""Map JCRide-back admin API payloads to the shapes expected by admin UI templates/JS."""

from __future__ import annotations

from datetime import datetime

from app.admin_defaults import NIGERIA_CENTER, NIGERIA_ZOOM

TIER_COLORS = {
    "economy": "#0d6b38",
    "comfort": "#22c55e",
    "premium": "#065f46",
}
TIER_LABELS = {
    "economy": "Economy",
    "comfort": "Comfort",
    "premium": "Premium",
}

RIDE_STATUS_LABELS = {
    "requested": "Requested",
    "searching": "Searching",
    "accepted": "Accepted",
    "driver_arrived": "Driver arrived",
    "in_progress": "In progress",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "expired": "Expired",
}

ACTIVE_RIDE_STATUSES = {"requested", "searching", "accepted", "driver_arrived", "in_progress"}


def _fmt_ngn(amount: float) -> str:
    return "₦" + f"{float(amount or 0):,.0f}"


def normalize_dashboard_stats(raw: dict, *, wallet_total: float | None = None) -> dict:
    total_users = int(raw.get("total_users") or 0)
    total_customers = int(raw.get("total_customers") or 0)
    total_drivers = int(raw.get("total_drivers") or 0)
    active_drivers = int(raw.get("active_drivers") or 0)
    pending_drivers = int(raw.get("pending_drivers") or 0)
    active_trips = int(raw.get("active_trips") or 0)
    total_trips = int(raw.get("total_trips") or 0)
    completed_trips = int(raw.get("completed_trips") or 0)
    completion = float(raw.get("completion_percent") or 0)
    revenue_mtd = float(raw.get("revenue_mtd") or raw.get("total_revenue_placeholder") or 0)
    wallet = float(
        wallet_total
        if wallet_total is not None
        else raw.get("wallet_funds") or raw.get("wallet_funds_placeholder") or 0
    )

    return {
        "total_users": {
            "value": f"{total_users:,}",
            "trend": f"{total_customers:,} riders · {total_drivers:,} drivers",
            "trend_type": "up",
        },
        "active_drivers": {
            "value": f"{active_drivers:,}",
            "trend": f"{pending_drivers:,} pending approval",
            "trend_type": "up",
        },
        "active_trips": {
            "value": f"{active_trips:,}",
            "trend": "Live now",
            "trend_type": "live",
        },
        "total_trips": {
            "value": f"{total_trips:,}",
            "trend": f"{active_trips:,} active · {completed_trips:,} completed",
            "trend_type": "up",
        },
        "revenue_mtd": {
            "value": _fmt_ngn(revenue_mtd),
            "trend": f"{completion:.1f}% completion rate",
            "trend_type": "up-double",
        },
        "wallet_funds": {
            "value": _fmt_ngn(wallet),
            "trend": None,
            "trend_type": None,
        },
        "completion_rate": {
            "value": f"{completion:.1f}%",
            "trend": f"{completed_trips:,} completed trips",
            "trend_type": "up-double",
        },
    }


def _format_revenue_label(date_value: str, period: str) -> str:
    if not date_value:
        return ""
    try:
        parsed = datetime.fromisoformat(str(date_value).replace("Z", "+00:00"))
    except ValueError:
        return str(date_value)
    if period == "1M":
        return parsed.strftime("%d %b")
    if period == "3M":
        return parsed.strftime("W%U") if period == "3M" else parsed.strftime("%d %b")
    if period == "All":
        return parsed.strftime("%Y")
    return parsed.strftime("%b")


def normalize_revenue(raw, period: str = "1Y") -> dict:
    rows = raw if isinstance(raw, list) else raw.get("data") or raw.get("points") or []
    labels: list[str] = []
    raw_values: list[float] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        labels.append(_format_revenue_label(str(row.get("date") or ""), period))
        raw_values.append(float(row.get("total_fare") or 0))

    total_ngn = sum(raw_values)
    max_val = max(raw_values) if raw_values else 0
    if max_val >= 1_000_000:
        unit, divisor, unit_label = "m", 1_000_000.0, "millions"
    elif max_val >= 10_000:
        unit, divisor, unit_label = "k", 1_000.0, "thousands"
    else:
        unit, divisor, unit_label = "raw", 1.0, "naira"

    if divisor == 1.0:
        values = [round(v) for v in raw_values]
    else:
        values = [round(v / divisor, 2) for v in raw_values]

    return {
        "labels": labels,
        "values": values,
        "period": period,
        "unit": unit,
        "unit_label": unit_label,
        "total_ngn": round(total_ngn, 2),
    }


def normalize_ride_tiers(raw: dict) -> dict:
    tiers = []
    for key, label in TIER_LABELS.items():
        entry = raw.get(key, {}) if isinstance(raw, dict) else {}
        percentage = float(entry.get("percentage") or 0) if isinstance(entry, dict) else 0
        count = int(entry.get("count") or 0) if isinstance(entry, dict) else 0
        if percentage > 0 or count > 0:
            tiers.append(
                {
                    "label": label,
                    "value": percentage,
                    "color": TIER_COLORS[key],
                }
            )
    return {"tiers": tiers}


def _risk_to_marker_status(risk_status: str, delay_minutes: int = 0) -> str:
    if risk_status == "red":
        return "incident"
    if risk_status == "orange" or delay_minutes > 0:
        return "delayed"
    return "active"


def live_trips_to_map(live_trips: list[dict]) -> dict:
    if not live_trips:
        return {
            "count": 0,
            "active_count": 0,
            "label": "No active trips",
            "map_center": dict(NIGERIA_CENTER),
            "map_zoom": NIGERIA_ZOOM,
            "markers": [],
            "legend": {"active": 0, "delayed": 0, "incident": 0},
            "route": [],
            "vehicle_position": None,
            "start": None,
            "end": None,
        }

    markers = []
    legend = {"active": 0, "delayed": 0, "incident": 0}
    lats: list[float] = []
    lngs: list[float] = []

    for trip in live_trips:
        lat = trip.get("driver_lat") or trip.get("pickup_lat")
        lng = trip.get("driver_lng") or trip.get("pickup_lng")
        if lat is None or lng is None:
            continue
        lat_f = float(lat)
        lng_f = float(lng)
        marker_status = _risk_to_marker_status(
            str(trip.get("risk_status") or "green"),
            int(trip.get("delay_minutes") or 0),
        )
        legend[marker_status] = legend.get(marker_status, 0) + 1
        pickup = str(trip.get("pickup_address") or trip.get("booking_id") or "Active trip")
        markers.append(
            {
                "lat": lat_f,
                "lng": lng_f,
                "city": pickup[:48],
                "status": marker_status,
            }
        )
        lats.append(lat_f)
        lngs.append(lng_f)

    map_center = {
        "lat": sum(lats) / len(lats) if lats else NIGERIA_CENTER["lat"],
        "lng": sum(lngs) / len(lngs) if lngs else NIGERIA_CENTER["lng"],
    }
    map_zoom = 11 if len(markers) == 1 else (8 if len(markers) <= 4 else NIGERIA_ZOOM)
    active_count = len(markers)

    first = live_trips[0]
    route = []
    if first.get("pickup_lat") is not None and first.get("destination_lat") is not None:
        route = [
            {"lat": float(first["pickup_lat"]), "lng": float(first["pickup_lng"])},
            {"lat": float(first["destination_lat"]), "lng": float(first["destination_lng"])},
        ]

    vehicle_position = None
    if first.get("driver_lat") is not None and first.get("driver_lng") is not None:
        vehicle_position = {"lat": float(first["driver_lat"]), "lng": float(first["driver_lng"])}

    return {
        "count": active_count,
        "active_count": active_count,
        "label": f"{active_count} active trip{'s' if active_count != 1 else ''}",
        "map_center": map_center,
        "map_zoom": map_zoom,
        "markers": markers,
        "legend": legend,
        "route": route,
        "vehicle_position": vehicle_position,
        "start": route[0] if route else None,
        "end": route[1] if len(route) > 1 else None,
    }


def normalize_admin_trip(ride: dict) -> dict:
    status = str(ride.get("status") or "requested")
    customer = ride.get("customer") or {}
    driver = ride.get("driver") or {}
    customer_name = customer.get("full_name") or "Rider"
    driver_name = driver.get("full_name") or "Unassigned"
    pickup = ride.get("pickup_address") or "Pickup"
    destination = ride.get("destination_address") or "Destination"
    city = ride.get("city") or "—"
    fare = float(ride.get("final_fare_ngn") or ride.get("estimated_fare_ngn") or 0)
    ui_status = status
    if status in ACTIVE_RIDE_STATUSES and status not in {"completed", "cancelled"}:
        ui_status = "active" if status in {"accepted", "driver_arrived", "in_progress"} else status

    return {
        "id": ride.get("id"),
        "public_id": ride.get("booking_id") or ride.get("id"),
        "status": ui_status,
        "status_label": RIDE_STATUS_LABELS.get(status, status.replace("_", " ").title()),
        "route_display": f"{pickup} → {destination}",
        "participants_display": f"{customer_name} · {driver_name}",
        "meta_display": f"{city} · {_fmt_ngn(fare)}",
    }


def normalize_heatmap(raw: dict) -> dict:
    cells = raw.get("cells") or []
    cols = int(raw.get("cols") or (len(cells[0]) if cells else 11))
    city = raw.get("city") or "Lagos"
    row_labels = raw.get("row_labels")
    if not row_labels:
        if isinstance(raw.get("rows"), list):
            row_labels = raw.get("rows")
        else:
            row_labels = [f"Zone {index + 1}" for index in range(len(cells))]
    return {
        "scope": city.lower(),
        "label": f"Demand heatmap · {city}",
        "rows": row_labels,
        "cols": cols,
        "cells": cells,
        "max_value": float(raw.get("max_value") or 0),
    }


def normalize_admin_trips_list(data: dict, *, status_filter: str = "all") -> dict:
    rides = data.get("rides") or []
    if status_filter == "active":
        rides = [ride for ride in rides if str(ride.get("status")) in ACTIVE_RIDE_STATUSES]
    return {
        "trips": [normalize_admin_trip(ride) for ride in rides],
        "total": data.get("total") or len(rides),
        "page": data.get("page") or 1,
        "limit": data.get("limit") or 20,
        "total_pages": data.get("total_pages") or 1,
    }


def normalize_daily_rides(raw: dict) -> dict:
    labels = raw.get("labels") or []
    values = [int(v or 0) for v in (raw.get("values") or [])]
    return {
        "labels": labels,
        "values": values,
        "total": int(raw.get("total") or sum(values)),
    }


def normalize_success_rate(raw: dict) -> dict:
    completed = int(raw.get("completed") or 0)
    cancelled = int(raw.get("cancelled") or 0)
    other = int(raw.get("other") or 0)
    total = int(raw.get("total") or (completed + cancelled + other))
    completion = float(raw.get("completion_percent") or 0)
    if not completion and total:
        completion = round((completed / total) * 100, 1)
    return {
        "completion_percent": completion,
        "completed": completed,
        "cancelled": cancelled,
        "other": other,
        "total": total,
    }


def normalize_growth(raw: dict) -> dict:
    return {
        "labels": raw.get("labels") or [],
        "users": [int(v or 0) for v in (raw.get("users") or [])],
        "drivers": [int(v or 0) for v in (raw.get("drivers") or [])],
    }


def normalize_city_performance(raw) -> dict:
    cities = raw if isinstance(raw, list) else raw.get("cities") or []
    options = []
    for row in cities:
        if not isinstance(row, dict):
            continue
        name = row.get("city")
        if not name:
            continue
        options.append(
            {
                "city": name,
                "total_trips": int(row.get("total_trips") or 0),
                "completed_trips": int(row.get("completed_trips") or 0),
                "active_drivers": int(row.get("active_drivers") or 0),
            }
        )
    options.sort(key=lambda item: item["total_trips"], reverse=True)
    if not options:
        options = [{"city": "Lagos", "total_trips": 0, "completed_trips": 0, "active_drivers": 0}]
    return {"cities": options}
