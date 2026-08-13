(function () {
  "use strict";

  const mapEl = document.getElementById("trips-live-map");
  const listEl = document.getElementById("trips-list");
  const activeCountEl = document.getElementById("trips-active-count");
  const badgeEl = document.getElementById("trips-map-badge");
  const legendActiveEl = document.getElementById("legend-active-count");
  const legendDelayedEl = document.getElementById("legend-delayed-count");
  const legendIncidentEl = document.getElementById("legend-incident-count");

  const NIGERIA_CENTER = { lat: 9.082, lng: 8.675 };
  const NIGERIA_ZOOM = 6;
  const NIGERIA_BOUNDS = [
    { lat: 4.2, lng: 2.8 },
    { lat: 13.9, lng: 14.6 },
  ];
  const chartGreen = "#0a4f2a";

  let mapSurface = null;
  let mapInitPromise = null;
  let hasFitBounds = false;
  let currentStatus = "all";

  function toLatLng(point) {
    if (!point) return null;
    if (Array.isArray(point)) {
      return { lat: Number(point[0]), lng: Number(point[1]) };
    }
    return { lat: Number(point.lat), lng: Number(point.lng) };
  }

  function fitMapToNigeria(boundsPoints) {
    if (!mapSurface) return;
    if (boundsPoints.length > 1) {
      mapSurface.fitBounds(boundsPoints.map(toLatLng).filter(Boolean), {
        padding: 48,
        maxZoom: 14,
      });
      return;
    }
    if (boundsPoints.length === 1) {
      const one = toLatLng(boundsPoints[0]);
      if (one) mapSurface.setView(one.lat, one.lng, 13);
      return;
    }
    mapSurface.fitBounds(NIGERIA_BOUNDS, { padding: 24 });
  }

  function markerColors(status) {
    if (status === "delayed") {
      return { color: "#ca8a04", fillColor: "#eab308" };
    }
    if (status === "incident") {
      return { color: "#dc2626", fillColor: "#ef4444" };
    }
    return { color: chartGreen, fillColor: "#0d6b38" };
  }

  function statusClass(status) {
    if (status === "completed") return "trip-card__status--completed";
    if (status === "cancelled") return "trip-card__status--cancelled";
    return "trip-card__status--in-progress";
  }

  function renderTripCard(trip) {
    const cancelBtn = trip.cancellable && trip.id
      ? '<div class="trip-card__actions">' +
        '<button type="button" class="trip-card__cancel" data-ride-id="' + escapeHtml(trip.id) +
        '" data-ride-label="' + escapeHtml(trip.public_id) + '">Cancel ride</button>' +
        "</div>"
      : "";
    return (
      '<article class="trip-card">' +
      '<span class="trip-card__id">' + escapeHtml(trip.public_id) + "</span>" +
      '<span class="trip-card__status ' + statusClass(trip.status) + '">' +
      escapeHtml(trip.status_label) +
      "</span>" +
      '<div class="trip-card__route">' + escapeHtml(trip.route_display) + "</div>" +
      '<div class="trip-card__participants">' + escapeHtml(trip.participants_display) + "</div>" +
      '<div class="trip-card__meta">' + escapeHtml(trip.meta_display) + "</div>" +
      cancelBtn +
      "</article>"
    );
  }

  const cancelModal = {
    overlay: document.getElementById("trip-cancel-modal"),
    ref: document.getElementById("trip-cancel-ref"),
    reasons: document.getElementById("trip-cancel-reasons"),
    input: document.getElementById("trip-cancel-reason"),
    error: document.getElementById("trip-cancel-error"),
    confirm: document.getElementById("trip-cancel-confirm"),
    rideId: null,
    sourceBtn: null,
  };

  function closeCancelModal() {
    if (!cancelModal.overlay) return;
    cancelModal.overlay.hidden = true;
    cancelModal.rideId = null;
    cancelModal.sourceBtn = null;
  }

  function openCancelModal(rideId, rideLabel, buttonEl) {
    if (!cancelModal.overlay) return;
    cancelModal.rideId = rideId;
    cancelModal.sourceBtn = buttonEl || null;
    if (cancelModal.ref) cancelModal.ref.textContent = rideLabel || "this ride";
    if (cancelModal.input) cancelModal.input.value = "";
    if (cancelModal.error) cancelModal.error.hidden = true;
    if (cancelModal.reasons) {
      cancelModal.reasons.querySelectorAll(".trip-cancel-chip").forEach(function (chip) {
        chip.classList.remove("is-active");
      });
    }
    if (cancelModal.confirm) {
      if (window.ButtonLoading) window.ButtonLoading.stop(cancelModal.confirm);
      cancelModal.confirm.disabled = false;
      cancelModal.confirm.textContent = "Cancel ride";
    }
    cancelModal.overlay.hidden = false;
    if (cancelModal.input) cancelModal.input.focus();
  }

  function submitCancelModal() {
    const rideId = cancelModal.rideId;
    if (!rideId) return;
    const reason = cancelModal.input ? cancelModal.input.value.trim() : "";
    if (!reason) {
      if (cancelModal.error) {
        cancelModal.error.textContent = "A cancellation reason is required.";
        cancelModal.error.hidden = false;
      }
      if (cancelModal.input) cancelModal.input.focus();
      return;
    }

    if (cancelModal.confirm) {
      if (window.ButtonLoading) window.ButtonLoading.start(cancelModal.confirm, { text: "Cancelling…" });
      else {
        cancelModal.confirm.disabled = true;
        cancelModal.confirm.textContent = "Cancelling…";
      }
    }
    if (cancelModal.error) cancelModal.error.hidden = true;

    fetch("/admin/api/rides/" + encodeURIComponent(rideId) + "/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.message || "Could not cancel the ride.");
          return data;
        });
      })
      .then(function () {
        closeCancelModal();
        fetchTrips();
        fetchLiveMap();
      })
      .catch(function (err) {
        if (cancelModal.error) {
          cancelModal.error.textContent = err.message || "Could not cancel the ride.";
          cancelModal.error.hidden = false;
        }
        if (cancelModal.confirm) {
          if (window.ButtonLoading) window.ButtonLoading.stop(cancelModal.confirm);
          cancelModal.confirm.disabled = false;
          cancelModal.confirm.textContent = "Cancel ride";
        }
      });
  }

  function bindCancelModal() {
    if (!cancelModal.overlay) return;

    cancelModal.overlay.querySelectorAll("[data-cancel-dismiss]").forEach(function (el) {
      el.addEventListener("click", closeCancelModal);
    });

    cancelModal.overlay.addEventListener("click", function (event) {
      if (event.target === cancelModal.overlay) closeCancelModal();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !cancelModal.overlay.hidden) closeCancelModal();
    });

    if (cancelModal.confirm) {
      cancelModal.confirm.addEventListener("click", submitCancelModal);
    }

    if (cancelModal.reasons) {
      cancelModal.reasons.addEventListener("click", function (event) {
        const chip = event.target.closest(".trip-cancel-chip");
        if (!chip) return;
        cancelModal.reasons.querySelectorAll(".trip-cancel-chip").forEach(function (c) {
          c.classList.remove("is-active");
        });
        chip.classList.add("is-active");
        if (cancelModal.input) {
          cancelModal.input.value = chip.dataset.reason || "";
          cancelModal.input.focus();
        }
        if (cancelModal.error) cancelModal.error.hidden = true;
      });
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const CAR_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">' +
    '<path d="M7 17h10M5 11l1.5-4h11L19 11"/>' +
    '<circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>' +
    "</svg>";

  // Cache real road geometry per pickup→destination pair so we don't re-query on
  // every poll (routes don't change during a trip; only vehicle positions do).
  const OSRM_URL = "https://router.project-osrm.org/route/v1/driving/";
  const roadCache = {};
  const roadPending = {};
  let lastTripData = null;

  function roadKey(a, b) {
    return a.lat.toFixed(5) + "," + a.lng.toFixed(5) + "|" + b.lat.toFixed(5) + "," + b.lng.toFixed(5);
  }

  function requestRoad(pickup, destination) {
    const key = roadKey(pickup, destination);
    if (roadCache[key] || roadPending[key]) return;
    roadPending[key] = true;
    const url =
      OSRM_URL +
      pickup.lng + "," + pickup.lat + ";" + destination.lng + "," + destination.lat +
      "?overview=full&geometries=geojson";

    fetch(url)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        delete roadPending[key];
        if (data && data.routes && data.routes[0] && data.routes[0].geometry) {
          roadCache[key] = data.routes[0].geometry.coordinates.map(function (c) {
            return [c[1], c[0]];
          });
          // Re-render with the resolved road geometry (keeps current pan/zoom).
          if (lastTripData) renderTrips(lastTripData);
        }
      })
      .catch(function () {
        delete roadPending[key];
      });
  }

  function tripsFromData(tripData) {
    // Prefer the rich per-trip payload; fall back to flat markers for older responses.
    if (Array.isArray(tripData.trips) && tripData.trips.length) {
      return tripData.trips;
    }
    return (tripData.markers || []).map(function (m) {
      return {
        booking_id: m.city,
        status: m.status,
        vehicle_position: { lat: m.lat, lng: m.lng },
        pickup: null,
        destination: null,
        route: [],
        pickup_address: m.city,
        destination_address: "",
        driver_name: "",
        rider_name: "",
      };
    });
  }

  function tripTitle(trip) {
    const parts = [];
    if (trip.booking_id) parts.push(trip.booking_id);
    if (trip.pickup_address || trip.destination_address) {
      parts.push((trip.pickup_address || "?") + " → " + (trip.destination_address || "?"));
    }
    const people = [trip.rider_name, trip.driver_name].filter(Boolean).join(" · ");
    if (people) parts.push(people);
    if (trip.delay_minutes) parts.push("Delayed " + trip.delay_minutes + " min");
    return parts.join(" · ");
  }

  function drawTrip(trip, boundsPoints) {
    if (!mapSurface) return;
    const colors = markerColors(trip.status);

    // Route pickup → destination. Prefer real road geometry (OSRM); fall back to a
    // straight dashed line until the road route resolves.
    if (trip.pickup && trip.destination) {
      const key = roadKey(trip.pickup, trip.destination);
      const road = roadCache[key];
      if (road && road.length >= 2) {
        mapSurface.addPolyline(road, {
          color: colors.color,
          weight: 5,
          opacity: 0.9,
        });
        road.forEach(function (pt) { boundsPoints.push(pt); });
      } else {
        const straight = [
          { lat: trip.pickup.lat, lng: trip.pickup.lng },
          { lat: trip.destination.lat, lng: trip.destination.lng },
        ];
        mapSurface.addPolyline(straight, {
          color: colors.color,
          weight: 4,
          opacity: 0.55,
          dashArray: "10, 8",
        });
        straight.forEach(function (pt) { boundsPoints.push(pt); });
        requestRoad(trip.pickup, trip.destination);
      }
    } else if (Array.isArray(trip.route) && trip.route.length >= 2) {
      mapSurface.addPolyline(trip.route, {
        color: colors.color,
        weight: 4,
        opacity: 0.55,
        dashArray: "10, 8",
      });
      trip.route.forEach(function (pt) { boundsPoints.push(pt); });
    }

    if (trip.pickup) {
      mapSurface.addDomMarker(
        trip.pickup.lat,
        trip.pickup.lng,
        '<div class="map-marker-start"></div>',
        { size: [14, 14], anchor: [7, 7], zIndex: 100, title: "Pickup" }
      );
      boundsPoints.push({ lat: trip.pickup.lat, lng: trip.pickup.lng });
    }

    if (trip.destination) {
      mapSurface.addDomMarker(
        trip.destination.lat,
        trip.destination.lng,
        '<div class="map-marker-end"></div>',
        { size: [16, 16], anchor: [8, 8], zIndex: 100, title: "Destination" }
      );
      boundsPoints.push({ lat: trip.destination.lat, lng: trip.destination.lng });
    }

    const pos = trip.vehicle_position;
    if (pos && pos.lat != null && pos.lng != null) {
      const carHtml =
        '<div class="map-marker-vehicle map-marker-vehicle--' + escapeHtml(trip.status || "active") + '">' +
        CAR_SVG +
        "</div>";
      mapSurface.addDomMarker(pos.lat, pos.lng, carHtml, {
        size: [36, 36],
        anchor: [18, 18],
        zIndex: 200,
        title: tripTitle(trip),
      });
      boundsPoints.push({ lat: pos.lat, lng: pos.lng });
    }
  }

  function ensureMap(tripData) {
    if (mapSurface) return Promise.resolve(mapSurface);
    if (mapInitPromise) return mapInitPromise;
    if (!mapEl || !window.JosRideMaps) {
      return Promise.reject(new Error("Map bootstrap missing"));
    }
    const mapCenter = tripData.map_center || NIGERIA_CENTER;
    const mapZoom = tripData.map_zoom || NIGERIA_ZOOM;
    mapInitPromise = window.JosRideMaps.createSurface(mapEl, {
      center: mapCenter,
      zoom: mapZoom,
      zoomControl: true,
      preferGoogle: true,
    }).then(function (surface) {
      mapSurface = surface;
      mapInitPromise = null;
      return surface;
    });
    return mapInitPromise;
  }

  function renderTrips(tripData) {
    if (!mapSurface) return;

    const trips = tripsFromData(tripData);
    mapSurface.clearOverlays();

    const boundsPoints = [];
    trips.forEach(function (trip) {
      drawTrip(trip, boundsPoints);
    });

    // Fit to all rides once on first load; afterwards keep the current view.
    if (!hasFitBounds && boundsPoints.length) {
      fitMapToNigeria(boundsPoints);
      hasFitBounds = true;
    }

    if (activeCountEl) {
      activeCountEl.textContent = (tripData.active_count || 0).toLocaleString();
    }
    if (badgeEl) {
      badgeEl.textContent = tripData.label || "Nigeria · Live ops";
    }
    if (tripData.legend) {
      if (legendActiveEl) legendActiveEl.textContent = (tripData.legend.active || 0).toLocaleString();
      if (legendDelayedEl) legendDelayedEl.textContent = (tripData.legend.delayed || 0).toLocaleString();
      if (legendIncidentEl) legendIncidentEl.textContent = (tripData.legend.incident || 0).toLocaleString();
    }
  }

  function initLiveMap(tripData) {
    if (!mapEl) return;
    lastTripData = tripData;
    ensureMap(tripData)
      .then(function () {
        renderTrips(tripData);
        window.setTimeout(function () {
          if (mapSurface) mapSurface.invalidateSize();
        }, 120);
      })
      .catch(function () {
        window.setTimeout(function () {
          if (!mapSurface) initLiveMap(tripData);
        }, 250);
      });
  }

  function fetchLiveMap() {
    return fetch("/admin/api/trips/map")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load live map");
        return res.json();
      })
      .then(initLiveMap)
      .catch(function () {
        if (activeCountEl) activeCountEl.textContent = "0";
      });
  }

  function fetchTrips(options) {
    if (!listEl) return Promise.resolve();
    const opts = options || {};
    // Only flash the loading placeholder for user-triggered loads (initial load,
    // filter switch, manual reload). Silent auto-refresh keeps the current list.
    if (!opts.silent) {
      listEl.innerHTML = '<p class="trips-list__loading">Loading trips…</p>';
    }

    return fetch("/admin/api/trips?status=" + encodeURIComponent(currentStatus) + "&limit=30")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load trips");
        return res.json();
      })
      .then(function (data) {
        const trips = data.trips || [];
        if (!trips.length) {
          listEl.innerHTML = '<p class="trips-list__empty">No trips found.</p>';
          return;
        }
        listEl.innerHTML = trips.map(renderTripCard).join("");
      })
      .catch(function () {
        // Don't wipe good data on a background refresh failure.
        if (!opts.silent) {
          listEl.innerHTML = '<p class="trips-list__empty">Could not load trips.</p>';
        }
      });
  }

  function bindFilterTabs() {
    const tabs = document.querySelectorAll(".trips-filter-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        currentStatus = tab.dataset.status || "all";
        fetchTrips();
      });
    });
  }

  function bindTripActions() {
    if (!listEl) return;
    listEl.addEventListener("click", function (event) {
      const btn = event.target.closest(".trip-card__cancel");
      if (!btn) return;
      event.preventDefault();
      openCancelModal(btn.dataset.rideId, btn.dataset.rideLabel, btn);
    });
  }

  function bindReloadButton() {
    const reloadBtn = document.getElementById("trips-reload");
    if (!reloadBtn) return;
    reloadBtn.addEventListener("click", function () {
      reloadBtn.classList.add("is-spinning");
      Promise.all([fetchTrips(), fetchLiveMap()]).then(function () {
        reloadBtn.classList.remove("is-spinning");
      });
    });
  }

  function init() {
    bindFilterTabs();
    bindTripActions();
    bindReloadButton();
    bindCancelModal();
    fetchLiveMap();
    fetchTrips();
    // Poll the live map frequently so vehicle positions stay close to real-time.
    setInterval(fetchLiveMap, 10000);
    // Refresh the list quietly every 30s so it never flashes a loading state or
    // wipes the admin's current view; use the Reload button for an on-demand pull.
    setInterval(function () { fetchTrips({ silent: true }); }, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
