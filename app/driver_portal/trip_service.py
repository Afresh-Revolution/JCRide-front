"""Resolve driver active trip from API."""

from __future__ import annotations

import math
from datetime import UTC, datetime

from app.rating_display import format_public_rating_short
from app.services.api_client import ApiError, get_driver_active_ride, get_driver_profile

DESTINATION_RADIUS_KM = 0.15
ARRIVAL_READY_STATUSES = frozenset({"accepted", "driver_assigned", "assigned"})
PICKUP_READY_STATUSES = frozenset({"driver_arrived"})
TRIP_STARTED_STATUSES = frozenset({"in_progress", "started", "on_trip"})


def _fmt_ngn(amount) -> str:
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0
    return f"₦{value:,.0f}"


def _initials(name: str) -> str:
    parts = (name or "").split()
    return "".join(part[0] for part in parts[:2]).upper() or "R"


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    p = math.pi / 180
    a = (
        0.5
        - math.cos((lat2 - lat1) * p) / 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lng2 - lng1) * p)) / 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def _driver_coords_from_ride(payload: dict, token: str | None = None) -> tuple[float, float] | None:
    driver_loc = payload.get("driver_location")
    if isinstance(driver_loc, dict) and driver_loc.get("lat") is not None and driver_loc.get("lng") is not None:
        return float(driver_loc["lat"]), float(driver_loc["lng"])

    driver = payload.get("driver") or {}
    if driver.get("current_lat") is not None and driver.get("current_lng") is not None:
        return float(driver["current_lat"]), float(driver["current_lng"])

    if payload.get("driver_lat") is not None and payload.get("driver_lng") is not None:
        return float(payload["driver_lat"]), float(payload["driver_lng"])

    if token:
        try:
            profile = get_driver_profile(token)
            if profile.get("current_lat") is not None and profile.get("current_lng") is not None:
                return float(profile["current_lat"]), float(profile["current_lng"])
        except ApiError:
            pass
    return None


def _elapsed_trip_time(payload: dict) -> str:
    started_at = payload.get("started_at")
    if not started_at:
        return "-"
    try:
        if isinstance(started_at, str):
            started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        else:
            started = started_at
        delta = datetime.now(UTC) - started.astimezone(UTC)
        return f"{max(0, int(delta.total_seconds() // 60))} min"
    except (TypeError, ValueError):
        return "-"


def _distance_left_km(payload: dict, vehicle: dict | None, start: dict | None, end: dict | None) -> float:
    status = str(payload.get("status") or "").lower()
    target = end if status in TRIP_STARTED_STATUSES else start
    if vehicle and target:
        try:
            return round(
                _haversine_km(
                    float(vehicle["lat"]),
                    float(vehicle["lng"]),
                    float(target["lat"]),
                    float(target["lng"]),
                ),
                1,
            )
        except (TypeError, ValueError, KeyError):
            pass
    try:
        return round(float(payload.get("distance_km") or payload.get("distance_remaining_km") or 0), 1)
    except (TypeError, ValueError):
        return 0.0


def _vehicle_to_destination_km(trip: dict) -> float | None:
    map_data = trip.get("map") or {}
    vehicle = map_data.get("vehicle_position")
    dest = map_data.get("end")
    if not vehicle or not dest:
        return None
    try:
        return _haversine_km(
            float(vehicle["lat"]),
            float(vehicle["lng"]),
            float(dest["lat"]),
            float(dest["lng"]),
        )
    except (TypeError, ValueError, KeyError):
        return None


def trip_is_picked_up(trip: dict) -> bool:
    status = str(trip.get("status") or "").lower()
    return status in TRIP_STARTED_STATUSES


def trip_can_arrive(trip: dict) -> bool:
    status = str(trip.get("status") or "").lower()
    return status in ARRIVAL_READY_STATUSES


def trip_can_pick_up(trip: dict) -> bool:
    status = str(trip.get("status") or "").lower()
    return status in PICKUP_READY_STATUSES


def trip_at_destination(trip: dict) -> bool:
    if trip.get("at_destination") is True:
        return True
    if not trip_is_picked_up(trip):
        return False
    geo_distance = _vehicle_to_destination_km(trip)
    if geo_distance is not None:
        return geo_distance <= DESTINATION_RADIUS_KM
    try:
        distance_left = float(trip.get("distance_left_km"))
    except (TypeError, ValueError):
        return False
    return distance_left <= DESTINATION_RADIUS_KM


def trip_can_complete(trip: dict) -> bool:
    return trip_is_picked_up(trip) and trip_at_destination(trip)


def enrich_trip_actions(trip: dict) -> dict:
    trip["can_arrive"] = trip_can_arrive(trip)
    trip["picked_up"] = trip_is_picked_up(trip)
    trip["can_pick_up"] = trip_can_pick_up(trip)
    trip["at_destination"] = trip_at_destination(trip)
    trip["can_complete"] = trip_can_complete(trip)
    return trip


def trip_action_flags(trip: dict) -> dict:
    return {
        "status": trip.get("status"),
        "can_arrive": trip.get("can_arrive"),
        "picked_up": trip.get("picked_up"),
        "can_pick_up": trip.get("can_pick_up"),
        "at_destination": trip.get("at_destination"),
        "can_complete": trip.get("can_complete"),
        "distance_left_km": trip.get("distance_left_km"),
    }


def api_ride_to_active_trip(ride: dict, token: str | None = None) -> dict:
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
    driver_coords = _driver_coords_from_ride(payload, token)

    route = []
    start = end = vehicle = None
    if pickup_lat is not None and pickup_lng is not None:
        start = {"lat": float(pickup_lat), "lng": float(pickup_lng)}
        route.append(start)
    if driver_coords:
        vehicle = {"lat": driver_coords[0], "lng": driver_coords[1]}
        if not route or route[-1] != vehicle:
            route.append(vehicle)
    if dest_lat is not None and dest_lng is not None:
        end = {"lat": float(dest_lat), "lng": float(dest_lng)}
        route.append(end)

    center_lat = route[0]["lat"] if route else 6.45
    center_lng = route[0]["lng"] if route else 3.47
    if len(route) > 1:
        center_lat = sum(p["lat"] for p in route) / len(route)
        center_lng = sum(p["lng"] for p in route) / len(route)

    fare = payload.get("live_fare_ngn") or payload.get("estimated_fare_ngn") or payload.get("final_fare_ngn") or 0
    status = payload.get("status", "in_progress")
    status_label = str(status).replace("_", " ").upper()
    distance_left = _distance_left_km(payload, vehicle, start, end)

    return enrich_trip_actions({
        "id": str(payload.get("id") or payload.get("ride_id") or ""),
        "status": status,
        "status_label": status_label,
        "rider_name": rider_name,
        "rider_initials": _initials(rider_name),
        "rider_tier": str(payload.get("service_tier") or "economy").replace("_", " ").title() + " rider",
        "rating": format_public_rating_short(
            customer.get("rating") or customer.get("rating_avg") or payload.get("rider_rating"),
            customer.get("rating_valid_count")
            or customer.get("rating_count")
            or payload.get("rider_rating_count"),
        ),
        "distance_left_km": distance_left,
        "earnings_live": _fmt_ngn(fare),
        "trip_time": _elapsed_trip_time(payload) if trip_is_picked_up({"status": status}) else "-",
        "speed_kmh": int(payload.get("speed_kmh") or payload.get("current_speed_kmh") or 0),
        "next_maneuver": payload.get("next_maneuver") or "-",
        "next_maneuver_distance_m": int(payload.get("next_maneuver_distance_m") or 0),
        "pickup": payload.get("pickup_address") or payload.get("pickup") or "",
        "destination": payload.get("destination_address") or payload.get("destination") or "",
        "rider_phone": customer.get("phone") or payload.get("rider_phone") or "",
        "map": {
            "map_center": {"lat": center_lat, "lng": center_lng},
            "map_zoom": 14,
            "route": route,
            "start": start,
            "end": end,
            "vehicle_position": vehicle,
        },
    })


def trip_map_payload(trip: dict) -> dict:
    """Map data shape consumed by active-trip.js."""
    map_data = trip.get("map") or {}
    picked_up = bool(trip.get("picked_up"))
    return {
        "map_center": map_data.get("map_center"),
        "map_zoom": map_data.get("map_zoom", 14),
        "route": map_data.get("route", []),
        "start": map_data.get("start"),
        "end": map_data.get("end"),
        "vehicle_position": map_data.get("vehicle_position"),
        "status": trip.get("status"),
        "picked_up": picked_up,
        "route_mode": "to_destination" if picked_up else "to_pickup",
        "markers": [],
    }


def _apply_session_driver_location(trip: dict, session: dict | None) -> dict:
    session = session or {}
    sess_lat = session.get("driver_lat")
    sess_lng = session.get("driver_lng")
    if sess_lat is None or sess_lng is None:
        return trip
    trip.setdefault("map", {})["vehicle_position"] = {
        "lat": float(sess_lat),
        "lng": float(sess_lng),
    }
    return trip


def _enrich_distance_left(trip: dict) -> dict:
    try:
        current = float(trip.get("distance_left_km") or 0)
    except (TypeError, ValueError):
        current = 0
    if current > 0:
        return trip
    geo_distance = _vehicle_to_destination_km(trip)
    if geo_distance is not None:
        trip["distance_left_km"] = round(geo_distance, 1)
    return trip


def resolve_active_trip(token: str | None, session: dict | None = None) -> dict | None:
    if not token:
        return None
    try:
        api_ride = get_driver_active_ride(token)
        if api_ride:
            trip = api_ride_to_active_trip(api_ride, token=token)
            if trip.get("id"):
                trip = _apply_session_driver_location(trip, session)
                trip = _enrich_distance_left(trip)
                return enrich_trip_actions(trip)
    except ApiError as exc:
        if exc.status_code in (401, 403):
            raise
        if exc.status_code not in (404, 204):
            return None
    return None
