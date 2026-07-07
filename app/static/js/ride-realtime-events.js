(function (global) {
  "use strict";

  var DRIVER_READY_STATUSES = [
    "accepted",
    "driver_assigned",
    "driver_arrived",
    "in_progress",
    "completed",
  ];

  function normalizeDriver(driver) {
    if (!driver || typeof driver !== "object") return driver;
    return {
      full_name: driver.full_name || driver.name,
      name: driver.full_name || driver.name,
      phone: driver.phone,
      rating_avg: driver.rating_avg != null ? driver.rating_avg : driver.rating,
      rating: driver.rating_avg != null ? driver.rating_avg : driver.rating,
      completed_trips: driver.completed_trips,
      trips: driver.completed_trips,
      vehicle_model: driver.vehicle_model,
      vehicle_color: driver.vehicle_color,
      vehicle_plate: driver.plate_number || driver.vehicle_plate,
      plate_number: driver.plate_number || driver.vehicle_plate,
      id: driver.id,
      user_id: driver.user_id,
    };
  }

  function normalizeRide(raw) {
    if (!raw || typeof raw !== "object") return null;

    var pickup = raw.pickup;
    var destination = raw.destination;
    var driver = raw.driver;
    var driverLocation = raw.driver_location;

    if (pickup && typeof pickup === "object") {
      raw.pickup_address = raw.pickup_address || pickup.address;
      raw.pickup_lat = raw.pickup_lat != null ? raw.pickup_lat : pickup.lat;
      raw.pickup_lng = raw.pickup_lng != null ? raw.pickup_lng : pickup.lng;
    }
    if (destination && typeof destination === "object") {
      raw.destination_address = raw.destination_address || destination.address;
      raw.destination_lat =
        raw.destination_lat != null ? raw.destination_lat : destination.lat;
      raw.destination_lng =
        raw.destination_lng != null ? raw.destination_lng : destination.lng;
    }

    raw.id = raw.id || raw.ride_id;
    raw.status = raw.status || (raw.ride && raw.ride.status);
    raw.driver_id = raw.driver_id || (driver && driver.id);
    if (driver) raw.driver = normalizeDriver(driver);
    if (driverLocation) raw.driver_location = driverLocation;

    return raw;
  }

  function applyRideEvent(state, event) {
    if (!event || typeof event !== "object") return state;
    var type = event.type || event.event || "";
    var payload = event.payload || event.data || {};

    if (type === "ride.snapshot") {
      return normalizeRide({
        id: payload.ride_id,
        booking_id: payload.booking_id,
        status: payload.status,
        driver_id: payload.driver && payload.driver.id,
        driver: payload.driver,
        pickup: payload.pickup,
        destination: payload.destination,
        driver_location: payload.driver_location,
        estimated_fare_ngn: payload.estimated_fare_ngn,
        final_fare_ngn: payload.final_fare_ngn,
      });
    }

    if (type === "ride.driver.accepted" || type === "ride.updated") {
      var merged = normalizeRide({
        ...(state || {}),
        id: payload.ride_id || (state && state.id),
        booking_id: payload.booking_id || (state && state.booking_id),
        status: payload.status || (payload.ride && payload.ride.status) || (state && state.status),
        driver_id:
          payload.driver_id ||
          (payload.driver && payload.driver.id) ||
          (state && state.driver_id),
        driver:
          payload.driver ||
          (payload.ride && payload.ride.driver) ||
          (state && state.driver),
        driver_location:
          payload.driver_location ||
          (payload.ride && payload.ride.driver_location) ||
          (state && state.driver_location),
        estimated_arrival_minutes: payload.estimated_arrival_minutes,
      });
      return merged;
    }

    if (
      type === "ride.cancelled" ||
      type === "ride.started" ||
      type === "ride.completed" ||
      type === "ride.driver.arrived"
    ) {
      if (!state) {
        return normalizeRide({
          id: payload.ride_id,
          status: payload.status,
        });
      }
      return normalizeRide({
        ...state,
        status: payload.status || state.status,
      });
    }

    if (type === "driver.location.updated") {
      if (!state) return state;
      return normalizeRide({
        ...state,
        driver_location: {
          lat: payload.lat,
          lng: payload.lng,
        },
      });
    }

    return state;
  }

  function parseRideMessage(message) {
    if (!message || typeof message !== "object") return null;
    var type = message.type || message.event || "";

    if (type === "ride.snapshot") {
      return applyRideEvent(null, message);
    }
    if (
      type === "ride.driver.accepted" ||
      type === "ride.updated" ||
      type === "ride.cancelled" ||
      type === "ride.started" ||
      type === "ride.completed" ||
      type === "ride.driver.arrived" ||
      type === "driver.location.updated"
    ) {
      return { eventType: type, payload: message.payload || message.data || {} };
    }

    return null;
  }

  function isDriverMatched(status) {
    return DRIVER_READY_STATUSES.indexOf(status || "") >= 0;
  }

  function subscribeMessage(rideId) {
    return {
      type: "ride.subscribe",
      payload: { ride_id: rideId },
    };
  }

  function sendChatMessage(rideId, text) {
    return {
      type: "chat.message.send",
      payload: { ride_id: rideId, message: text },
    };
  }

  function driverLocationMessage(pos) {
    if (!pos || pos.lat == null || pos.lng == null) return null;
    var payload = { lat: pos.lat, lng: pos.lng };
    if (pos.accuracy != null) payload.accuracy = pos.accuracy;
    if (pos.heading != null) payload.heading = pos.heading;
    if (pos.speed != null) payload.speed = pos.speed;
    return {
      type: "driver.location.update",
      payload: payload,
    };
  }

  global.RideRealtimeEvents = {
    applyRideEvent: applyRideEvent,
    normalizeRide: normalizeRide,
    normalizeDriver: normalizeDriver,
    parseRideMessage: parseRideMessage,
    isDriverMatched: isDriverMatched,
    subscribeMessage: subscribeMessage,
    sendChatMessage: sendChatMessage,
    driverLocationMessage: driverLocationMessage,
    DRIVER_READY_STATUSES: DRIVER_READY_STATUSES,
  };
})(window);
