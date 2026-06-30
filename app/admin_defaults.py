"""Nationwide admin map and analytics fallbacks when API data is unavailable."""

NIGERIA_CENTER = {"lat": 9.0820, "lng": 8.6753}
NIGERIA_ZOOM = 6

# Major ride hubs across Nigerian states (not limited to one region).
NIGERIA_RIDE_HUBS = [
    {"city": "Lagos", "state": "Lagos", "lat": 6.5244, "lng": 3.3792, "status": "active"},
    {"city": "Abuja", "state": "FCT", "lat": 9.0579, "lng": 7.4951, "status": "active"},
    {"city": "Port Harcourt", "state": "Rivers", "lat": 4.8156, "lng": 7.0498, "status": "active"},
    {"city": "Ibadan", "state": "Oyo", "lat": 7.3775, "lng": 3.9470, "status": "delayed"},
    {"city": "Kano", "state": "Kano", "lat": 12.0022, "lng": 8.5920, "status": "active"},
    {"city": "Enugu", "state": "Enugu", "lat": 6.4584, "lng": 7.5464, "status": "active"},
    {"city": "Benin City", "state": "Edo", "lat": 6.3350, "lng": 5.6037, "status": "active"},
    {"city": "Kaduna", "state": "Kaduna", "lat": 10.5105, "lng": 7.4165, "status": "incident"},
    {"city": "Jos", "state": "Plateau", "lat": 9.8965, "lng": 8.8583, "status": "active"},
    {"city": "Calabar", "state": "Cross River", "lat": 4.9517, "lng": 8.3220, "status": "active"},
    {"city": "Warri", "state": "Delta", "lat": 5.5160, "lng": 5.7500, "status": "active"},
    {"city": "Abeokuta", "state": "Ogun", "lat": 7.1608, "lng": 3.3490, "status": "active"},
    {"city": "Maiduguri", "state": "Borno", "lat": 11.8333, "lng": 13.1500, "status": "delayed"},
    {"city": "Sokoto", "state": "Sokoto", "lat": 13.0059, "lng": 5.2476, "status": "active"},
]

# Relative demand weights per hub (Lagos highest, still nationwide spread).
NATIONWIDE_HEATMAP_ROWS = [
    "Lagos",
    "Abuja",
    "Port Harcourt",
    "Ibadan",
    "Kano",
    "Enugu",
    "Benin City",
    "Kaduna",
    "Jos",
    "Calabar",
    "Warri",
]

NATIONWIDE_HEATMAP_WEIGHTS = [100, 78, 62, 58, 52, 44, 40, 36, 32, 28, 26]


def _legend_counts(markers):
    counts = {"active": 0, "delayed": 0, "incident": 0}
    for marker in markers:
        status = marker.get("status", "active")
        if status in counts:
            counts[status] += 1
    return counts


def _hub_markers():
    return [
        {
            "lat": hub["lat"],
            "lng": hub["lng"],
            "city": f"{hub['city']}, {hub['state']}",
            "status": hub["status"],
        }
        for hub in NIGERIA_RIDE_HUBS
    ]


def build_nationwide_live_map():
    """Live trip map payload spanning multiple states."""
    markers = _hub_markers()
    legend = _legend_counts(markers)
    active_count = legend["active"]

    return {
        "count": active_count,
        "active_count": active_count,
        "label": "Nigeria · Live ops",
        "map_center": dict(NIGERIA_CENTER),
        "map_zoom": NIGERIA_ZOOM,
        "markers": markers,
        "legend": legend,
        "route": [],
        "vehicle_position": None,
        "start": None,
        "end": None,
    }


def build_nationwide_trips_map():
    """Trips page live map payload (same nationwide coverage)."""
    markers = _hub_markers()
    legend = _legend_counts(markers)
    active_count = legend["active"]

    return {
        "active_count": active_count,
        "label": "Nigeria · Live ops",
        "map_center": dict(NIGERIA_CENTER),
        "map_zoom": NIGERIA_ZOOM,
        "markers": markers,
        "legend": legend,
        "route": [],
        "vehicle_position": None,
        "start": None,
        "end": None,
    }


def build_nationwide_demand_heatmap():
    """Demand heatmap rows = cities nationwide, cols = intra-day demand bands."""
    cells = []
    max_value = 0
    for weight in NATIONWIDE_HEATMAP_WEIGHTS:
        row = []
        for band in range(11):
            # Morning rush, midday, evening peaks vary by band index.
            band_factor = 0.35 + 0.65 * abs(5 - band) / 5
            value = max(8, int(weight * band_factor))
            row.append(value)
            max_value = max(max_value, value)
        cells.append(row)

    return {
        "scope": "nigeria",
        "label": "Nigeria · Nationwide demand",
        "rows": list(NATIONWIDE_HEATMAP_ROWS),
        "cols": 11,
        "cells": cells,
        "max_value": max_value,
    }


def ensure_nationwide_live_map(data):
    """Use API payload when it has markers; otherwise fall back nationwide."""
    if not isinstance(data, dict):
        return build_nationwide_live_map()
    markers = data.get("markers") or []
    if not markers:
        fallback = build_nationwide_live_map()
        if data.get("count") is not None:
            fallback["count"] = data["count"]
        return fallback
    if not data.get("map_center"):
        data["map_center"] = dict(NIGERIA_CENTER)
    if not data.get("map_zoom"):
        data["map_zoom"] = NIGERIA_ZOOM
    if not data.get("label"):
        data["label"] = "Nigeria · Live ops"
    return data


def ensure_nationwide_trips_map(data):
    """Use API payload when it has markers; otherwise fall back nationwide."""
    if not isinstance(data, dict):
        return build_nationwide_trips_map()
    markers = data.get("markers") or []
    if not markers:
        return build_nationwide_trips_map()
    if not data.get("map_center"):
        data["map_center"] = dict(NIGERIA_CENTER)
    if not data.get("map_zoom"):
        data["map_zoom"] = NIGERIA_ZOOM
    if not data.get("label"):
        data["label"] = "Nigeria · Live ops"
    return data


def build_empty_admin_stats():
    """Dashboard KPI cards when /admin/dashboard/stats is unavailable."""
    return {
        "total_users": {"value": "0", "trend": "0 this week", "trend_type": "up"},
        "active_drivers": {"value": "0", "trend": "0 online now", "trend_type": "up"},
        "active_trips": {"value": "0", "trend": "Live", "trend_type": "live"},
        "revenue_mtd": {"value": "₦0", "trend": "0.0%", "trend_type": "up-double"},
        "wallet_funds": {"value": "₦0", "trend": None, "trend_type": None},
        "completion_rate": {"value": "0.0%", "trend": "0.0%", "trend_type": "up-double"},
    }


def build_fallback_revenue(period="1Y"):
    """Chart data when revenue analytics endpoint is unavailable."""
    if period == "1M":
        labels = ["W1", "W2", "W3", "W4"]
        values = [2.1, 2.4, 2.8, 3.0]
    elif period == "3M":
        labels = ["Jan", "Feb", "Mar"]
        values = [8.2, 9.1, 10.4]
    elif period == "All":
        labels = ["2022", "2023", "2024", "2025", "2026"]
        values = [42, 58, 74, 91, 108]
    else:
        labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        values = [6.2, 6.8, 7.1, 7.5, 8.0, 8.4, 8.9, 9.2, 9.6, 10.1, 10.5, 11.0]
    return {"labels": labels, "values": values, "period": period}


def build_fallback_ride_tiers():
    """Donut chart tiers when ride-tiers endpoint is unavailable."""
    return {
        "tiers": [
            {"label": "Economy", "value": 62, "color": "#0d6b38"},
            {"label": "Comfort", "value": 28, "color": "#22c55e"},
            {"label": "Premium", "value": 10, "color": "#065f46"},
        ]
    }
