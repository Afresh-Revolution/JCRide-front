"""Resolve driver active trip from API."""

from __future__ import annotations

from app.services.api_client import ApiError, get_driver_active_ride, get_driver_active_trip_navigation


def _fmt_ngn(amount) -> str:
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0
    return f"₦{value:,.0f}"


def _initials(name: str) -> str:
    parts = (name or "").split()
    return "".join(part[0] for part in parts[:2]).upper() or "R"


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
    driver_lat = payload.get("driver_lat") or payload.get("current_lat")
    driver_lng = payload.get("driver_lng") or payload.get("current_lng")

    route = []
    start = end = vehicle = None
    if pickup_lat is not None and pickup_lng is not None:
        start = {"lat": float(pickup_lat), "lng": float(pickup_lng)}
        route.append(start)
    if driver_lat is not None and driver_lng is not None:
        vehicle = {"lat": float(driver_lat), "lng": float(driver_lng)}
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

    distance_left = payload.get("distance_remaining_km") or payload.get("distance_left_km") or 0
    fare = payload.get("live_fare_ngn") or payload.get("estimated_fare_ngn") or payload.get("final_fare_ngn") or 0
    status = payload.get("status", "in_progress")
    status_label = str(status).replace("_", " ").upper()

    return {
        "id": str(payload.get("id") or payload.get("ride_id") or ""),
        "status": status,
        "status_label": status_label,
        "rider_name": rider_name,
        "rider_initials": _initials(rider_name),
        "rider_tier": str(payload.get("service_tier") or "economy").replace("_", " ").title() + " rider",
        "rating": float(customer.get("rating") or payload.get("rider_rating") or 0),
        "distance_left_km": round(float(distance_left), 1),
        "earnings_live": _fmt_ngn(fare),
        "trip_time": payload.get("elapsed_time") or payload.get("trip_time") or "—",
        "speed_kmh": int(payload.get("speed_kmh") or payload.get("current_speed_kmh") or 0),
        "next_maneuver": payload.get("next_maneuver") or "—",
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
    }


def trip_map_payload(trip: dict) -> dict:
    """Map data shape consumed by active-trip.js."""
    map_data = trip.get("map") or {}
    return {
        "map_center": map_data.get("map_center"),
        "map_zoom": map_data.get("map_zoom", 14),
        "route": map_data.get("route", []),
        "start": map_data.get("start"),
        "end": map_data.get("end"),
        "vehicle_position": map_data.get("vehicle_position"),
        "markers": [],
    }


def resolve_active_trip(token: str | None, session: dict | None = None) -> dict | None:
    if not token:
        return None
    try:
        api_ride = get_driver_active_ride(token)
        nav = None
        try:
            nav = get_driver_active_trip_navigation(token)
        except ApiError:
            pass
        if api_ride:
            trip = api_ride_to_active_trip(api_ride)
            if nav and trip:
                trip["distance_left_km"] = float(nav.get("distance_remaining_km") or trip.get("distance_left_km") or 0)
                trip["earnings_live"] = _fmt_ngn(nav.get("live_fare_ngn") or 0)
                trip["trip_time"] = f"{nav.get('elapsed_minutes', 0)} min"
                trip["speed_kmh"] = int(nav.get("speed_kmh") or trip.get("speed_kmh") or 0)
                trip["next_maneuver"] = nav.get("next_maneuver") or trip.get("next_maneuver")
                trip["next_maneuver_distance_m"] = int(nav.get("next_maneuver_distance_m") or 0)
                if nav.get("driver_lat") is not None:
                    trip.setdefault("map", {})["vehicle_position"] = {
                        "lat": float(nav["driver_lat"]),
                        "lng": float(nav["driver_lng"]),
                    }
            if trip.get("id"):
                return trip
    except ApiError as exc:
        if exc.status_code not in (404, 204):
            return None
    return None
