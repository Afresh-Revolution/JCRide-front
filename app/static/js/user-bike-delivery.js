(function () {
  "use strict";

  var form = document.getElementById("bike-delivery-form");
  if (!form) return;

  var pickupInput = document.getElementById("delivery-pickup-input");
  var dropoffInput = document.getElementById("delivery-dropoff-input");
  var pickupLatEl = document.getElementById("delivery-pickup-lat");
  var pickupLngEl = document.getElementById("delivery-pickup-lng");
  var dropoffLatEl = document.getElementById("delivery-dropoff-lat");
  var dropoffLngEl = document.getElementById("delivery-dropoff-lng");

  var distanceEl = document.getElementById("bike-delivery-distance");
  var etaEl = document.getElementById("bike-delivery-eta");
  var fareEl = document.getElementById("bike-delivery-fare");
  var submitBtn = document.getElementById("bike-delivery-submit");

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function pickupCoords() {
    var lat = pickupLatEl && pickupLatEl.value ? Number(pickupLatEl.value) : null;
    var lng = pickupLngEl && pickupLngEl.value ? Number(pickupLngEl.value) : null;
    return lat != null && lng != null && !isNaN(lat) && !isNaN(lng) ? { lat: lat, lng: lng } : null;
  }

  function dropoffCoords() {
    var lat = dropoffLatEl && dropoffLatEl.value ? Number(dropoffLatEl.value) : null;
    var lng = dropoffLngEl && dropoffLngEl.value ? Number(dropoffLngEl.value) : null;
    return lat != null && lng != null && !isNaN(lat) && !isNaN(lng) ? { lat: lat, lng: lng } : null;
  }

  function updateMap() {
    if (!window.RiderRouteMap) return;
    var pickup = pickupInput ? pickupInput.value.trim() : "";
    var dropoff = dropoffInput ? dropoffInput.value.trim() : "";
    if (!pickup || !dropoff) return;
    var p = pickupCoords();
    var d = dropoffCoords();
    var config = window.RiderRouteMap.buildConfig(pickup, dropoff, {
      badge_label: "Pickup - Drop-off · Bike courier",
      vehicle_type: "bike",
    });
    if (p) config.pickup = p;
    if (d) config.dropoff = d;
    if (config.pickup && config.dropoff) {
      config.route = [
        [config.pickup.lat, config.pickup.lng],
        [
          (config.pickup.lat + config.dropoff.lat) / 2 + 0.001,
          (config.pickup.lng + config.dropoff.lng) / 2 + 0.0015,
        ],
        [config.dropoff.lat, config.dropoff.lng],
      ];
      config.vehicle_position = {
        lat: (config.pickup.lat + config.dropoff.lat) / 2 + 0.002,
        lng: (config.pickup.lng + config.dropoff.lng) / 2 - 0.001,
      };
    }
    window.RiderRouteMap.update(config);
  }

  // ── Estimate ─────────────────────────────────────────────────────────────────

  var estimateTimer;

  function fetchEstimate() {
    var pickup = pickupInput ? pickupInput.value.trim() : "";
    var dropoff = dropoffInput ? dropoffInput.value.trim() : "";
    if (!pickup || !dropoff) return;

    var p = pickupCoords();
    var d = dropoffCoords();
    if (!p || !d) return; // need real coords

    var payload = {
      pickup_address: pickup,
      destination_address: dropoff,
      pickup_lat: p.lat,
      pickup_lng: p.lng,
      destination_lat: d.lat,
      destination_lng: d.lng,
    };

    fetch("/user/api/delivery/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.distance_km != null && distanceEl) {
          distanceEl.textContent = parseFloat(data.distance_km).toFixed(1) + " km";
        }
        if (data.estimated_duration_minutes != null && etaEl) {
          etaEl.textContent = data.estimated_duration_minutes + " min";
        }
        var fare = data.estimated_fare_ngn;
        if (fare != null) {
          var formatted = "₦" + Number(fare).toLocaleString("en-NG");
          if (fareEl) fareEl.textContent = formatted;
          if (submitBtn) submitBtn.textContent = "Request bike - " + formatted;
        }
      })
      .catch(function () {});
  }

  function scheduleEstimate() {
    window.clearTimeout(estimateTimer);
    estimateTimer = window.setTimeout(function () {
      updateMap();
      fetchEstimate();
    }, 400);
  }

  // ── Location search ──────────────────────────────────────────────────────────

  function tryGPSPickup() {
    if (!navigator.geolocation || !pickupInput) return;
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        if (pickupLatEl) pickupLatEl.value = lat;
        if (pickupLngEl) pickupLngEl.value = lng;
        // Reverse geocode label via Photon
        var url =
          "https://photon.komoot.io/reverse?lat=" +
          lat +
          "&lon=" +
          lng +
          "&limit=1&lang=en";
        fetch(url)
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var feat = data.features && data.features[0];
            if (!feat) return;
            var p = feat.properties || {};
            var parts = [];
            if (p.name) parts.push(p.name);
            if (p.city && p.city !== p.name) parts.push(p.city);
            if (p.state) parts.push(p.state);
            var label = parts.filter(Boolean).join(", ");
            if (label && pickupInput) {
              pickupInput.value = label;
              pickupInput.dataset.lat = String(lat);
              pickupInput.dataset.lng = String(lng);
            }
          })
          .catch(function () {});
        scheduleEstimate();
      },
      function () {}, // silently ignore permission denial
      { timeout: 6000 }
    );
  }

  if (window.RiderLocationSearch) {
    if (pickupInput) {
      RiderLocationSearch.attach(pickupInput, function (coords) {
        if (pickupLatEl) pickupLatEl.value = coords.lat;
        if (pickupLngEl) pickupLngEl.value = coords.lng;
        scheduleEstimate();
      });
      pickupInput.addEventListener("input", function () {
        if (!pickupInput.dataset.resolved) {
          if (pickupLatEl) pickupLatEl.value = "";
          if (pickupLngEl) pickupLngEl.value = "";
        }
      });
    }

    if (dropoffInput) {
      RiderLocationSearch.attach(dropoffInput, function (coords) {
        if (dropoffLatEl) dropoffLatEl.value = coords.lat;
        if (dropoffLngEl) dropoffLngEl.value = coords.lng;
        scheduleEstimate();
      });
      dropoffInput.addEventListener("input", function () {
        if (!dropoffInput.dataset.resolved) {
          if (dropoffLatEl) dropoffLatEl.value = "";
          if (dropoffLngEl) dropoffLngEl.value = "";
        }
      });
    }
  }

  // Try to pre-fill pickup from GPS on page load
  if (pickupInput && !pickupInput.value.trim()) {
    tryGPSPickup();
  }

  // Initial map render if values already present (e.g. server echoed them back)
  updateMap();
})();
