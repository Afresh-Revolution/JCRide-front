"""Resolve driver active trip from API or local session/mock data."""

from __future__ import annotations

import copy

from app.driver_portal.data import ACTIVE_TRIP, RIDE_REQUESTS
from app.services.api_client import ApiError, get_driver_active_ride


def _fmt_ngn(amount) -> str:
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0
    return f"₦{value:,.0f}"


def _initials(name: str) -> str:
    parts = (name or "").split()
    return "".join(part[0] for part in parts[:2]).upper() or "R"


def _default_map_for_request(request: dict) -> dict:
    """Reuse the Lagos demo route for accepted requests without API coordinates."""
    base = copy.deepcopy(ACTIVE_TRIP["map"])
    return base


def request_to_active_trip(request: dict) -> dict:
    earnings = request.get("earnings", "₦0")
    earnings_num = earnings.replace("₦", "").replace(",", "").strip()
    try:
        live_earnings = float(earnings_num) * 0.79
        earnings_live = _fmt_ngn(live_earnings)
    except ValueError:
        earnings_live = earnings

    return {
        "id": request.get("id", "trip-local"),
        "status": "in_progress",
        "status_label": "TRIP IN PROGRESS",
        "rider_name": request.get("rider_name", "Rider"),
        "rider_initials": request.get("rider_initials") or _initials(request.get("rider_name", "")),
        "rider_tier": request.get("rider_tier", "Rider"),
        "rating": request.get("rating", 5.0),
        "distance_left_km": round(float(request.get("distance_km", 3.2)) * 0.39, 1),
        "earnings_live": earnings_live,
        "trip_time": "12:48",
        "speed_kmh": 38,
        "next_maneuver": "Turn right onto Ozumba Mbadiwe Ave",
        "next_maneuver_distance_m": 320,
        "pickup": request.get("pickup", ""),
        "destination": request.get("destination", ""),
        "rider_phone": request.get("rider_phone", "+2348000000000"),
        "map": _default_map_for_request(request),
    }


def api_ride_to_active_trip(ride: dict) -> dict:
    """Map GET /drivers/rides/active payload to the driver portal view model."""
    if not ride:
        return {}

    payload = ride.get("ride") or ride.get("data") or ride
    if not isinstance(payload, dict):
        return {}

    customer = payload.get("customer") or payload.get("rider") or {}
    rider_name = customer.get("full_name") or payload.get("rider_name") or "Rider"
    pickup_lat = payload.get("pickup_lat")
    pickup_lng = payload.get("pickup_lng")
    dest_lat = payload.get("destination_lat")
    dest_lng = payload.get("destination_lng")
    driver_lat = payload.get("driver_lat")
    driver_lng = payload.get("driver_lng")

    route = []
    start = end = vehicle = None
    if pickup_lat is not None and pickup_lng is not None:
        start = {"lat": float(pickup_lat), "lng": float(pickup_lng)}
        route.append(start)
    if driver_lat is not None and driver_lng is not None:
        vehicle = {"lat": float(driver_lat), "lng": float(driver_lng)}
        route.append(vehicle)
    if dest_lat is not None and dest_lng is not None:
        end = {"lat": float(dest_lat), "lng": float(dest_lng)}
        route.append(end)

    if len(route) < 2:
        route = copy.deepcopy(ACTIVE_TRIP["map"]["route"])
        start = ACTIVE_TRIP["map"]["start"]
        end = ACTIVE_TRIP["map"]["end"]
        vehicle = ACTIVE_TRIP["map"]["vehicle_position"]

    center_lat = sum(p["lat"] for p in route) / len(route)
    center_lng = sum(p["lng"] for p in route) / len(route)

    distance_left = payload.get("distance_remaining_km") or payload.get("distance_left_km")
    if distance_left is None:
        distance_left = 3.2

    fare = payload.get("live_fare_ngn") or payload.get("estimated_fare_ngn") or payload.get("final_fare_ngn")

    return {
        "id": str(payload.get("id") or payload.get("ride_id") or "active"),
        "status": payload.get("status", "in_progress"),
        "status_label": "TRIP IN PROGRESS",
        "rider_name": rider_name,
        "rider_initials": _initials(rider_name),
        "rider_tier": payload.get("service_tier", "Premium rider").replace("_", " ").title() + " rider",
        "rating": float(customer.get("rating") or payload.get("rider_rating") or 4.8),
        "distance_left_km": round(float(distance_left), 1),
        "earnings_live": _fmt_ngn(fare or 2180),
        "trip_time": payload.get("elapsed_time") or payload.get("trip_time") or "12:48",
        "speed_kmh": int(payload.get("speed_kmh") or payload.get("current_speed_kmh") or 38),
        "next_maneuver": payload.get("next_maneuver") or "Turn right onto Ozumba Mbadiwe Ave",
        "next_maneuver_distance_m": int(payload.get("next_maneuver_distance_m") or 320),
        "pickup": payload.get("pickup_address") or payload.get("pickup") or "",
        "destination": payload.get("destination_address") or payload.get("destination") or "",
        "map": {
            "map_center": {"lat": center_lat, "lng": center_lng},
            "map_zoom": 14,
            "route": route,
            "start": start,
            "end": end,
            "vehicle_position": vehicle,
        },
    }


def trip_map_payload(trip: dict) -> dict:
    """Map data shape consumed by active-trip.js (same as admin live map)."""
    map_data = trip.get("map") or ACTIVE_TRIP["map"]
    return {
        "map_center": map_data.get("map_center"),
        "map_zoom": map_data.get("map_zoom", 14),
        "route": map_data.get("route", []),
        "start": map_data.get("start"),
        "end": map_data.get("end"),
        "vehicle_position": map_data.get("vehicle_position"),
        "markers": [],
    }


def resolve_active_trip(token: str | None, session: dict) -> dict | None:
    """Return active trip dict for template, or None if no trip."""
    if token:
        try:
            api_ride = get_driver_active_ride(token)
            if api_ride:
                trip = api_ride_to_active_trip(api_ride)
                if trip:
                    return trip
        except ApiError as exc:
            if exc.status_code not in (404, 204):
                pass

    stored = session.get("active_trip_data")
    if isinstance(stored, dict) and stored.get("id"):
        return stored

    trip_id = session.get("active_trip_id")
    if trip_id:
        for request in RIDE_REQUESTS:
            if request["id"] == trip_id:
                return request_to_active_trip(request)
        if trip_id == ACTIVE_TRIP["id"]:
            return copy.deepcopy(ACTIVE_TRIP)

    return None
