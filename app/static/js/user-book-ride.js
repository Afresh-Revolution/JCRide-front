(function () {
  "use strict";

  var form = document.getElementById("book-ride-form");
  if (!form || !window.RiderLocationSearch) return;

  var pickupInput = document.getElementById("pickup-input");
  var dropoffInput = document.getElementById("dropoff-input");
  var stopsWrap = document.getElementById("route-stops");
  var addStopBtn = document.getElementById("route-add-stop");
  var tiers = document.getElementById("ride-tiers");
  var requestBtn = document.getElementById("request-ride-btn");
  var estFare = document.getElementById("trip-est-fare");
  var tripDistance = document.getElementById("trip-distance");
  var tripDuration = document.getElementById("trip-duration");
  var nearbyNote = document.getElementById("nearby-drivers-note");
  var pickupLat = document.getElementById("pickup-lat");
  var pickupLng = document.getElementById("pickup-lng");
  var destLat = document.getElementById("destination-lat");
  var destLng = document.getElementById("destination-lng");

  var maxStops = 2;
  var planTimer = null;
  var lastEstimate = null;
  var programmaticPickup = false;
  var STORAGE_KEY = "jcrider_location";

  function readStoredPickup() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.lat != null && data.lng != null) return data;
    } catch (err) {
      return null;
    }
    return null;
  }

  function readSeededPickup() {
    var el = document.getElementById("rider-stored-location");
    if (!el) return null;
    try {
      var data = JSON.parse(el.textContent);
      if (data && data.lat != null && data.lng != null) return data;
    } catch (err) {
      return null;
    }
    return null;
  }

  function isPickupManual() {
    return pickupInput && pickupInput.dataset.pickupManual === "1";
  }

  function markPickupManual() {
    if (!pickupInput || programmaticPickup) return;
    pickupInput.dataset.pickupManual = "1";
    pickupInput.dataset.pickupSource = "";
    pickupInput.closest(".route-input").classList.remove("route-input--gps");
  }

  function applyAutoPickup(result) {
    if (!pickupInput || !result || isPickupManual()) return;

    programmaticPickup = true;
    pickupInput.value = result.label;
    pickupInput.dataset.lat = String(result.lat);
    pickupInput.dataset.lng = String(result.lng);
    pickupInput.dataset.resolved = "1";
    pickupInput.dataset.pickupSource = "gps";
    pickupInput.dataset.pickupManual = "";
    pickupInput.placeholder = "Pickup location";
    syncHiddenCoords("pickup", result);

    var wrap = pickupInput.closest(".route-input");
    if (wrap) wrap.classList.add("route-input--gps");

    programmaticPickup = false;

    fetchNearbyDrivers(result.lat, result.lng).then(function (drivers) {
      if (window.RiderRouteMap) {
        window.RiderRouteMap.update({
          pickup: { lat: result.lat, lng: result.lng },
          dropoff: null,
          route: [],
          drivers: drivers,
          pickup_label: result.label,
          dropoff_label: "",
          badge_label: "Your location",
          map_center: { lat: result.lat, lng: result.lng },
          map_zoom: 15,
        });
      }
      if (nearbyNote) {
        nearbyNote.hidden = false;
        nearbyNote.textContent =
          drivers.length +
          " driver" +
          (drivers.length === 1 ? "" : "s") +
          " available near you";
      }
    });

    schedulePlan();
  }

  function selectedTier() {
    var checked = tiers ? tiers.querySelector('input[type="radio"]:checked') : null;
    return checked ? checked.value : "economy";
  }

  function tierMultiplier(tierId) {
    if (tierId === "comfort") return 1.35;
    if (tierId === "premium") return 1.85;
    return 1;
  }

  function formatNgn(amount) {
    return "₦" + Math.round(amount).toLocaleString("en-NG");
  }

  function syncHiddenCoords(prefix, coords) {
    if (prefix === "pickup") {
      if (pickupLat) pickupLat.value = coords ? coords.lat : "";
      if (pickupLng) pickupLng.value = coords ? coords.lng : "";
    } else if (prefix === "dropoff") {
      if (destLat) destLat.value = coords ? coords.lat : "";
      if (destLng) destLng.value = coords ? coords.lng : "";
    }
  }

  function stopInputs() {
    return stopsWrap ? Array.prototype.slice.call(stopsWrap.querySelectorAll(".route-input input")) : [];
  }

  function collectWaypoints() {
    var points = [];
    var pickup = RiderLocationSearch.readCoords(pickupInput);
    if (pickup) points.push(pickup);
    stopInputs().forEach(function (input) {
      var stop = RiderLocationSearch.readCoords(input);
      if (stop) points.push(stop);
    });
    var dropoff = RiderLocationSearch.readCoords(dropoffInput);
    if (dropoff) points.push(dropoff);
    return points;
  }

  function fetchOsrmRoute(waypoints) {
    if (waypoints.length < 2) return Promise.resolve(null);
    var coordPath = waypoints
      .map(function (p) {
        return encodeURIComponent(p.lng) + "," + encodeURIComponent(p.lat);
      })
      .join(";");
    var url =
      "https://router.project-osrm.org/route/v1/driving/" +
      coordPath +
      "?overview=full&geometries=geojson&steps=false";
    return fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data.routes || !data.routes.length) return null;
        var route = data.routes[0];
        var coords = (route.geometry.coordinates || []).map(function (pair) {
          return [pair[1], pair[0]];
        });
        return {
          distance_km: route.distance / 1000,
          duration_min: Math.max(1, Math.round(route.duration / 60)),
          route: coords,
        };
      })
      .catch(function () {
        return null;
      });
  }

  function fetchNearbyDrivers(lat, lng) {
    if (!window.UserApi) return Promise.resolve([]);
    return UserApi.request(
      "/user/api/nearby-drivers?lat=" +
        encodeURIComponent(lat) +
        "&lng=" +
        encodeURIComponent(lng)
    )
      .then(function (data) {
        return (data.drivers || []).map(function (d) {
          return { lat: d.lat, lng: d.lng };
        });
      })
      .catch(function () {
        return [];
      });
  }

  function updateTierPrices(baseFare, durationMin) {
    if (!tiers || baseFare == null) return;
    tiers.querySelectorAll(".ride-tier").forEach(function (card) {
      var input = card.querySelector('input[type="radio"]');
      if (!input) return;
      var fare = Math.round(baseFare * tierMultiplier(input.value));
      input.setAttribute("data-fare", formatNgn(fare));
      input.setAttribute("data-fare-num", String(fare));
      var fareEl = card.querySelector(".ride-tier__fare-dynamic");
      if (fareEl) fareEl.textContent = formatNgn(fare) + " est.";
      var descEl = card.querySelector(".ride-tier__desc-dynamic");
      if (descEl && durationMin) descEl.textContent = "~" + durationMin + " min trip";
      var etaEl = card.querySelector(".ride-tier__eta");
      if (etaEl) {
        etaEl.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' +
          Math.max(3, Math.round(durationMin / 5)) +
          " min";
      }
    });
    var checked = tiers.querySelector('input[type="radio"]:checked');
    if (checked) updateSelection(checked);
  }

  function updateSelection(input) {
    tiers.querySelectorAll(".ride-tier").forEach(function (card) {
      card.classList.toggle("is-selected", card.contains(input));
    });
    var fare = input.getAttribute("data-fare");
    if (estFare) estFare.textContent = fare;
    if (requestBtn) requestBtn.textContent = "Request ride - " + fare + " est.";
  }

  function refreshSelectedFare() {
    var checked = tiers ? tiers.querySelector('input[type="radio"]:checked') : null;
    if (checked) updateSelection(checked);
  }

  function updateMap(waypoints, routeData, drivers) {
    if (!window.RiderRouteMap || waypoints.length < 2) return;
    var pickup = waypoints[0];
    var dropoff = waypoints[waypoints.length - 1];
    var config = {
      pickup: { lat: pickup.lat, lng: pickup.lng },
      dropoff: { lat: dropoff.lat, lng: dropoff.lng },
      pickup_label: pickup.label,
      dropoff_label: dropoff.label,
      badge_label: waypoints.length > 2 ? "Route with stops" : "Fastest route",
      vehicle_type: "car",
      map_zoom: 13,
      route: routeData && routeData.route ? routeData.route : [],
      use_fastest_route: true,
      drivers: drivers || [],
      stops: waypoints.length > 2 ? waypoints.slice(1, -1) : [],
    };
    window.RiderRouteMap.update(config);
  }

  function updateStats(routeData, estimate) {
    if (routeData) {
      if (tripDistance) tripDistance.textContent = routeData.distance_km.toFixed(1) + " km";
      if (tripDuration) tripDuration.textContent = routeData.duration_min + " min";
    }
    if (estimate && estimate.estimated_fare_ngn != null) {
      updateTierPrices(estimate.estimated_fare_ngn, estimate.estimated_duration_minutes || (routeData && routeData.duration_min));
      refreshSelectedFare();
    }
  }

  function buildEstimatePayload(waypoints) {
    var pickup = waypoints[0];
    var dropoff = waypoints[waypoints.length - 1];
    var stops = [];
    if (waypoints.length > 2) {
      waypoints.slice(1, -1).forEach(function (stop) {
        stops.push({ address: stop.label, lat: stop.lat, lng: stop.lng });
      });
    }
    return {
      pickup_address: pickup.label,
      destination_address: dropoff.label,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      destination_lat: dropoff.lat,
      destination_lng: dropoff.lng,
      service_tier: selectedTier(),
      vehicle_category: "car",
      stops: stops.length ? stops : undefined,
    };
  }

  function planTrip() {
    var waypoints = collectWaypoints();
    if (waypoints.length < 2) {
      if (requestBtn) requestBtn.disabled = true;
      if (nearbyNote) nearbyNote.hidden = true;
      return;
    }

    Promise.all([
      fetchOsrmRoute(waypoints),
      fetchNearbyDrivers(waypoints[0].lat, waypoints[0].lng),
    ]).then(function (results) {
      var routeData = results[0];
      var drivers = results[1];
      updateMap(waypoints, routeData, drivers);

      if (nearbyNote) {
        nearbyNote.hidden = false;
        nearbyNote.textContent =
          drivers.length +
          " driver" +
          (drivers.length === 1 ? "" : "s") +
          " available near pickup";
      }

      if (window.UserApi) {
        var estimatePayload = buildEstimatePayload(waypoints);
        UserApi.post("/user/api/rides/estimate", estimatePayload)
          .then(function (estimate) {
            lastEstimate = estimate;
            updateStats(routeData, estimate);
            if (requestBtn) requestBtn.disabled = false;
          })
          .catch(function () {
            if (routeData) updateStats(routeData, null);
            if (requestBtn) requestBtn.disabled = false;
          });
      } else if (routeData) {
        updateStats(routeData, null);
        if (requestBtn) requestBtn.disabled = true;
      }
    });
  }

  function schedulePlan() {
    window.clearTimeout(planTimer);
    planTimer = window.setTimeout(planTrip, 400);
  }

  function attachField(input, prefix) {
    RiderLocationSearch.attach(input, function (coords) {
      if (prefix === "pickup") {
        markPickupManual();
        syncHiddenCoords("pickup", coords);
        var wrap = input.closest(".route-input");
        if (wrap) wrap.classList.remove("route-input--gps");
      }
      if (prefix === "dropoff") syncHiddenCoords("dropoff", coords);
      schedulePlan();
    });
    input.addEventListener("input", function () {
      if (prefix === "pickup") markPickupManual();
      if (!input.dataset.resolved) schedulePlan();
    });
  }

  function addStopField() {
    if (!stopsWrap || stopInputs().length >= maxStops) return;
    var label = document.createElement("label");
    label.className = "route-input route-input--stop";
    label.innerHTML =
      '<span class="route-input__dot route-input__dot--stop" aria-hidden="true"></span>' +
      '<input type="text" name="stop_address" placeholder="Stop location" autocomplete="off">' +
      '<input type="hidden" name="stop_lat">' +
      '<input type="hidden" name="stop_lng">' +
      '<button type="button" class="route-stop-remove" aria-label="Remove stop">×</button>';
    stopsWrap.appendChild(label);
    var input = label.querySelector('input[name="stop_address"]');
    RiderLocationSearch.attach(input, function (coords) {
      label.querySelector('input[name="stop_lat"]').value = coords.lat;
      label.querySelector('input[name="stop_lng"]').value = coords.lng;
      schedulePlan();
    });
    label.querySelector(".route-stop-remove").addEventListener("click", function () {
      label.remove();
      if (addStopBtn) addStopBtn.disabled = stopInputs().length >= maxStops;
      schedulePlan();
    });
    if (addStopBtn) addStopBtn.disabled = stopInputs().length >= maxStops;
    input.focus();
  }

  attachField(pickupInput, "pickup");
  attachField(dropoffInput, "dropoff");

  var seededPickup = readStoredPickup() || readSeededPickup();
  if (pickupInput && seededPickup && seededPickup.lat != null) {
    applyAutoPickup(seededPickup);
  }

  if (pickupInput) {
    var initialPickup =
      readStoredPickup() ||
      readSeededPickup() ||
      (window.RiderGeolocation && window.RiderGeolocation.getCached());
    pickupInput.placeholder =
      initialPickup && initialPickup.lat != null
        ? "Pickup location"
        : "Detecting your location…";
    if (!initialPickup || initialPickup.lat == null) {
      pickupInput.dataset.pickupSource = "gps";
      pickupInput.closest(".route-input").classList.add("route-input--gps");
    }
  }

  if (addStopBtn) {
    addStopBtn.disabled = false;
    addStopBtn.addEventListener("click", addStopField);
  }

  if (tiers) {
    tiers.querySelectorAll('input[type="radio"]').forEach(function (input) {
      input.addEventListener("change", function () {
        refreshSelectedFare();
      });
    });
    refreshSelectedFare();
  }

  function initPickupLocation() {
    if (!window.RiderGeolocation) {
      var stored = readStoredPickup() || readSeededPickup();
      if (stored) applyAutoPickup(stored);
      return;
    }

    window.RiderGeolocation.onUpdate(function (result) {
      applyAutoPickup(result);
    });

    var cachedPickup =
      window.RiderGeolocation.getCached() ||
      readStoredPickup() ||
      readSeededPickup();
    if (cachedPickup && cachedPickup.lat != null) {
      applyAutoPickup(cachedPickup);
      return;
    }

    window.RiderGeolocation.detectAndApply({ forceFresh: false })
      .then(applyAutoPickup)
      .catch(function () {
        if (pickupInput && !pickupInput.value) {
          pickupInput.placeholder = "Pickup location (allow location access)";
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPickupLocation);
  } else {
    initPickupLocation();
  }

  form.addEventListener("submit", function (event) {
    var waypoints = collectWaypoints();
    if (waypoints.length < 2) {
      event.preventDefault();
      alert("Select pickup and destination from the suggestions.");
    }
  });
})();
