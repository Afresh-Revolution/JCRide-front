"""Placeholder payloads for bike delivery admin UI until backend APIs exist."""

EMPTY_BIKE_DELIVERY_STATS = {
    "active_riders": 0,
    "deliveries_today": 0,
    "avg_pickup_time_min": None,
    "weekly_gmv_ngn": 0,
}

EMPTY_BIKE_DELIVERY_PRICING = {
    "items": [
        {"key": "base_bike_fare", "label": "Base bike fare", "amount_ngn": None},
        {"key": "per_km_bike", "label": "Per km (bike)", "amount_ngn": None},
        {"key": "small_package", "label": "Small package", "amount_ngn": None},
        {"key": "medium_package", "label": "Medium package", "amount_ngn": None},
        {"key": "large_package", "label": "Large package", "amount_ngn": None},
    ],
}

EMPTY_BIKE_DELIVERY_ZONES = {
    "zones": [],
    "stats": {
        "insurance_cover_ngn": None,
        "helmet_compliance_pct": None,
        "on_time_rate_pct": None,
        "cancellation_rate_pct": None,
        "avg_trip_km": None,
        "rider_rating": None,
    },
}

EMPTY_BIKE_DELIVERY_RIDERS = {
    "riders": [],
    "total": 0,
    "page": 1,
    "limit": 20,
    "total_pages": 1,
}

BIKE_DELIVERY_API_UNAVAILABLE = {
    "message": "Bike delivery API is not connected yet.",
}
