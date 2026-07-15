"""Map JosRide-back admin API payloads to the shapes expected by admin UI templates/JS."""

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
    total_admins = int(raw.get("total_admins") or 0)
    active_drivers = int(raw.get("active_drivers") or 0)
    pending_drivers = int(raw.get("pending_drivers") or 0)
    active_trips = int(raw.get("active_trips") or 0)
    total_trips = int(raw.get("total_trips") or 0)
    completed_trips = int(raw.get("completed_trips") or 0)
    completion = float(raw.get("completion_percent") or 0)
    revenue_mtd = float(
        raw.get("revenue_mtd")
        or raw.get("total_revenue")
        or raw.get("total_revenue_placeholder")
        or 0
    )
    revenue_change = raw.get("revenue_mtd_change_pct")
    wallet = float(
        wallet_total
        if wallet_total is not None
        else raw.get("wallet_funds") or raw.get("wallet_funds_placeholder") or 0
    )

    breakdown_parts = [f"{total_customers:,} riders", f"{total_drivers:,} drivers"]
    other_users = max(total_users - total_customers - total_drivers - total_admins, 0)
    if total_admins:
        breakdown_parts.append(f"{total_admins:,} admins")
    if other_users:
        breakdown_parts.append(f"{other_users:,} other")
    user_trend = " · ".join(breakdown_parts)

    if revenue_change is not None:
        revenue_trend = f"{revenue_change:+.1f}% vs last month"
        revenue_trend_type = "up-double" if revenue_change >= 0 else "down"
    else:
        revenue_trend = f"{completion:.1f}% completion rate"
        revenue_trend_type = "up-double"

    return {
        "total_users": {
            "value": f"{total_users:,}",
            "trend": user_trend,
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
            "trend": revenue_trend,
            "trend_type": revenue_trend_type,
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
        return parsed.strftime("%d %b")
    if period == "All":
        return parsed.strftime("%b %Y")
    return parsed.strftime("%b")


def normalize_revenue(raw, period: str = "1Y") -> dict:
    if isinstance(raw, list):
        rows = raw
    elif isinstance(raw, dict):
        rows = raw.get("data") or raw.get("points") or raw.get("items") or []
    else:
        rows = []
    labels: list[str] = []
    raw_values: list[float] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        labels.append(
            _format_revenue_label(str(row.get("date") or row.get("bucket") or ""), period)
        )
        raw_values.append(
            float(
                row.get("total_fare")
                or row.get("net_revenue")
                or row.get("revenue")
                or row.get("amount")
                or 0
            )
        )

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


def _coord(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def live_trips_to_map(live_trips: list[dict]) -> dict:
    if not live_trips:
        return {
            "count": 0,
            "active_count": 0,
            "label": "No active trips",
            "map_center": dict(NIGERIA_CENTER),
            "map_zoom": NIGERIA_ZOOM,
            "markers": [],
            "trips": [],
            "legend": {"active": 0, "delayed": 0, "incident": 0},
            "route": [],
            "vehicle_position": None,
            "start": None,
            "end": None,
        }

    markers = []
    trips = []
    legend = {"active": 0, "delayed": 0, "incident": 0}
    lats: list[float] = []
    lngs: list[float] = []

    for trip in live_trips:
        driver_lat = _coord(trip.get("driver_lat"))
        driver_lng = _coord(trip.get("driver_lng"))
        pickup_lat = _coord(trip.get("pickup_lat"))
        pickup_lng = _coord(trip.get("pickup_lng"))
        dest_lat = _coord(trip.get("destination_lat"))
        dest_lng = _coord(trip.get("destination_lng"))

        # Prefer the live driver location; fall back to pickup so every ride is placed.
        marker_lat = driver_lat if driver_lat is not None else pickup_lat
        marker_lng = driver_lng if driver_lng is not None else pickup_lng
        if marker_lat is None or marker_lng is None:
            continue

        marker_status = _risk_to_marker_status(
            str(trip.get("risk_status") or "green"),
            int(trip.get("delay_minutes") or 0),
        )
        legend[marker_status] = legend.get(marker_status, 0) + 1

        booking_id = str(trip.get("booking_id") or trip.get("id") or "Active trip")
        pickup_address = str(trip.get("pickup_address") or "Pickup")
        destination_address = str(trip.get("destination_address") or "Destination")
        driver_name = str(trip.get("driver_name") or trip.get("driver_full_name") or "Driver")
        rider_name = str(
            trip.get("customer_name")
            or trip.get("rider_name")
            or trip.get("customer_full_name")
            or "Rider"
        )
        ride_status = str(trip.get("status") or "in_progress")

        route = []
        if pickup_lat is not None and pickup_lng is not None and dest_lat is not None and dest_lng is not None:
            route = [
                {"lat": pickup_lat, "lng": pickup_lng},
                {"lat": dest_lat, "lng": dest_lng},
            ]

        vehicle_position = (
            {"lat": driver_lat, "lng": driver_lng}
            if driver_lat is not None and driver_lng is not None
            else None
        )

        # Backward-compatible flat marker list.
        markers.append(
            {
                "lat": marker_lat,
                "lng": marker_lng,
                "city": pickup_address[:48],
                "status": marker_status,
            }
        )

        # Rich per-trip payload so the map can draw every ride at its exact location.
        trips.append(
            {
                "id": trip.get("id"),
                "booking_id": booking_id,
                "status": marker_status,
                "ride_status": ride_status,
                "status_label": RIDE_STATUS_LABELS.get(ride_status, ride_status.replace("_", " ").title()),
                "vehicle_position": vehicle_position,
                "pickup": {"lat": pickup_lat, "lng": pickup_lng}
                if pickup_lat is not None and pickup_lng is not None
                else None,
                "destination": {"lat": dest_lat, "lng": dest_lng}
                if dest_lat is not None and dest_lng is not None
                else None,
                "route": route,
                "pickup_address": pickup_address,
                "destination_address": destination_address,
                "driver_name": driver_name,
                "rider_name": rider_name,
                "delay_minutes": int(trip.get("delay_minutes") or 0),
            }
        )

        lats.append(marker_lat)
        lngs.append(marker_lng)

    map_center = {
        "lat": sum(lats) / len(lats) if lats else NIGERIA_CENTER["lat"],
        "lng": sum(lngs) / len(lngs) if lngs else NIGERIA_CENTER["lng"],
    }
    map_zoom = 12 if len(trips) == 1 else (9 if len(trips) <= 4 else NIGERIA_ZOOM)
    active_count = len(trips)

    first_trip = trips[0] if trips else None

    return {
        "count": active_count,
        "active_count": active_count,
        "label": f"{active_count} active trip{'s' if active_count != 1 else ''}",
        "map_center": map_center,
        "map_zoom": map_zoom,
        "markers": markers,
        "trips": trips,
        "legend": legend,
        # Kept for backward compatibility with any cached/older clients.
        "route": first_trip["route"] if first_trip else [],
        "vehicle_position": first_trip["vehicle_position"] if first_trip else None,
        "start": (first_trip["route"][0] if first_trip and first_trip["route"] else None),
        "end": (first_trip["route"][1] if first_trip and len(first_trip["route"]) > 1 else None),
    }


def normalize_admin_trip(ride: dict) -> dict:
    status = str(ride.get("status") or "requested")
    customer = ride.get("customer") or {}
    driver = ride.get("driver") or {}
    customer_name = customer.get("full_name") or "Rider"
    driver_name = driver.get("full_name") or "Unassigned"
    pickup = ride.get("pickup_address") or "Pickup"
    destination = ride.get("destination_address") or "Destination"
    city = ride.get("city") or "-"
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
        "cancellable": status not in {"completed", "cancelled"},
        "driver_name": driver_name,
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


STATUS_FILTER_SETS = {
    "active": ACTIVE_RIDE_STATUSES,
    "completed": {"completed"},
    "cancelled": {"cancelled", "expired"},
}


def normalize_admin_trips_list(data: dict, *, status_filter: str = "all") -> dict:
    rides = data.get("rides") or []
    allowed = STATUS_FILTER_SETS.get(status_filter)
    if allowed is not None:
        rides = [ride for ride in rides if str(ride.get("status")) in allowed]
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
