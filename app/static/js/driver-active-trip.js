(function () {
  "use strict";

  var mapEl = document.getElementById("driver-active-trip-map");
  var mapDataEl = document.getElementById("driver-active-trip-map-data");
  var mapGreen = "#0a4f2a";
  var liveMap = null;
  var liveMapTileLayer = null;
  var mapLayers = [];
  var pollTimer = null;
  var geoWatchId = null;
  var navRequestId = 0;
  var lastNavKey = "";
  var currentTripData = null;

  var PRE_PICKUP_STATUSES = ["accepted", "driver_assigned", "assigned", "driver_arrived"];
  var ROUTE_COLOR_PICKUP = "#2563eb";
  var ROUTE_COLOR_TRIP = "#0a4f2a";

  function readMapData() {
    if (!mapDataEl) return null;
    try {
      return JSON.parse(mapDataEl.textContent);
    } catch (err) {
      return null;
    }
  }

  function tileLayerUrl() {
    var isDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }

  function bindThemeListener() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      if (liveMapTileLayer) liveMapTileLayer.setUrl(tileLayerUrl());
    };
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
    } else if (mq.addListener) {
      mq.addListener(onChange);
    }
  }

  function createMapIcon(html, size, anchor) {
    return L.divIcon({
      className: "",
      html: html,
      iconSize: size,
      iconAnchor: anchor,
    });
  }

  function isPrePickup(tripData) {
    if (!tripData) return true;
    if (tripData.picked_up) return false;
    return PRE_PICKUP_STATUSES.indexOf(tripData.status || "") >= 0;
  }

  function resolveDriverPosition(tripData) {
    if (tripData && tripData.vehicle_position) return tripData.vehicle_position;
    if (window.DriverGeolocation) {
      var cached = window.DriverGeolocation.getCached();
      if (cached && cached.lat != null) return { lat: cached.lat, lng: cached.lng };
    }
    return null;
  }

  function navTarget(tripData) {
    if (!tripData) return null;
    return isPrePickup(tripData) ? tripData.start : tripData.end;
  }

  function fetchOsrmRoute(from, to) {
    if (!from || !to) return Promise.resolve(null);
    var url =
      "https://router.project-osrm.org/route/v1/driving/" +
      encodeURIComponent(from.lng) +
      "," +
      encodeURIComponent(from.lat) +
      ";" +
      encodeURIComponent(to.lng) +
      "," +
      encodeURIComponent(to.lat) +
      "?overview=full&geometries=geojson&steps=true&alternatives=false";
    return fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data.routes || !data.routes.length) return null;
        var route = data.routes[0];
        var coords = (route.geometry.coordinates || []).map(function (pair) {
          return { lat: pair[1], lng: pair[0] };
        });
        var legs = route.legs || [];
        var steps = legs.length && legs[0].steps ? legs[0].steps : [];
        return {
          route: coords,
          distance_km: route.distance / 1000,
          duration_min: Math.max(1, Math.round(route.duration / 60)),
          steps: steps,
        };
      })
      .catch(function () {
        return null;
      });
  }

  function stepInstruction(step) {
    if (!step) return "Continue on route";
    var maneuver = step.maneuver || {};
    var type = maneuver.type || "";
    var modifier = (maneuver.modifier || "").replace(/_/g, " ");
    var name = step.name || step.ref || "";
    if (type === "arrive") {
      return isPrePickup(currentTripData) ? "Arrive at pickup" : "Arrive at destination";
    }
    if (type === "depart") {
      return name ? "Head toward " + name : "Head toward pickup";
    }
    if (modifier) {
      var action = type === "turn" ? "Turn " + modifier : type.replace(/_/g, " ");
      return name ? action + " onto " + name : action;
    }
    return name || "Continue on route";
  }

  function maneuverIconForStep(step) {
    var modifier = step && step.maneuver ? step.maneuver.modifier || "" : "";
    if (modifier.indexOf("left") >= 0) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg>';
    }
    if (modifier.indexOf("right") >= 0) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
    }
    if (step && step.maneuver && step.maneuver.type === "arrive") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10z"/><circle cx="12" cy="11" r="2.5"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
  }

  function updateManeuverCard(tripData, nav) {
    var labelEl = document.getElementById("active-trip-maneuver-label");
    var textEl = document.getElementById("active-trip-maneuver-text");
    var distanceEl = document.getElementById("active-trip-maneuver-distance");
    var etaEl = document.getElementById("active-trip-maneuver-eta");
    var iconEl = document.getElementById("active-trip-maneuver-icon");
    if (!textEl) return;

    var prePickup = isPrePickup(tripData);
    if (labelEl) {
      labelEl.textContent = prePickup ? "HEAD TO PICKUP" : "NEXT MANEUVER";
    }

    var step = nav && nav.steps && nav.steps.length ? nav.steps[0] : null;
    var instruction = step ? stepInstruction(step) : prePickup ? "Routing to rider pickup" : "Routing to destination";
    var distanceM = step ? Math.max(0, Math.round(step.distance || 0)) : 0;

    textEl.textContent = instruction;
    if (distanceEl) {
      distanceEl.textContent = distanceM > 0 ? "in " + distanceM + " m" : "Calculating route…";
    }
    if (etaEl && nav) {
      etaEl.textContent =
        "~" +
        nav.duration_min +
        " min · " +
        nav.distance_km.toFixed(1) +
        " km" +
        (prePickup ? " to pickup" : " remaining");
      etaEl.hidden = false;
      etaEl.classList.remove("is-hidden");
    }
    if (iconEl && step) {
      iconEl.innerHTML = maneuverIconForStep(step);
    }
  }

  function enrichTripMap(tripData) {
    if (!tripData) return null;
    var driver = resolveDriverPosition(tripData);
    if (driver) tripData.vehicle_position = driver;
    return tripData;
  }

  function refreshNavigation(tripData) {
    if (!tripData) return Promise.resolve();
    currentTripData = tripData;
    tripData = enrichTripMap(tripData);

    var from = resolveDriverPosition(tripData);
    var to = navTarget(tripData);
    if (!from || !to) {
      renderLiveMap(tripData);
      return Promise.resolve();
    }

    var key =
      (tripData.route_mode || "") +
      ":" +
      from.lat.toFixed(4) +
      "," +
      from.lng.toFixed(4) +
      "->" +
      to.lat.toFixed(4) +
      "," +
      to.lng.toFixed(4);
    if (key === lastNavKey) {
      renderLiveMap(tripData);
      return Promise.resolve();
    }

    var requestId = ++navRequestId;
    return fetchOsrmRoute(from, to).then(function (nav) {
      if (requestId !== navRequestId) return;
      if (nav && nav.route && nav.route.length >= 2) {
        tripData.route = nav.route;
        lastNavKey = key;
        updateManeuverCard(tripData, nav);
      } else {
        updateManeuverCard(tripData, null);
      }
      renderLiveMap(tripData);
    });
  }

  function clearMapLayers() {
    mapLayers.forEach(function (layer) {
      if (liveMap) liveMap.removeLayer(layer);
    });
    mapLayers = [];
  }

  function renderLiveMap(tripData) {
    if (!liveMap || typeof L === "undefined" || !tripData) return;

    clearMapLayers();

    var prePickup = isPrePickup(tripData);
    var routeColor = prePickup ? ROUTE_COLOR_PICKUP : mapGreen;
    var mapCenter = tripData.map_center || { lat: 6.435, lng: 3.432 };
    var mapZoom = tripData.map_zoom || 14;
    var route = (tripData.route || []).map(function (p) {
      return [p.lat, p.lng];
    });

    if (route.length < 2 && tripData.start && tripData.end) {
      route = [[tripData.start.lat, tripData.start.lng], [tripData.end.lat, tripData.end.lng]];
    }

    liveMap.setView([mapCenter.lat, mapCenter.lng], mapZoom);

    if (route.length >= 2) {
      var polyline = L.polyline(route, {
        color: routeColor,
        weight: 5,
        opacity: 0.92,
        dashArray: prePickup ? "10, 8" : null,
        lineCap: "round",
      });
      polyline.addTo(liveMap);
      mapLayers.push(polyline);
    }

    if (tripData.start) {
      var startMarker = L.marker([tripData.start.lat, tripData.start.lng], {
        icon: createMapIcon(
          prePickup
            ? '<div class="map-marker-start map-marker-start--pickup"></div>'
            : '<div class="map-marker-start"></div>',
          [14, 14],
          [7, 7]
        ),
        zIndexOffset: 100,
      });
      startMarker.addTo(liveMap);
      mapLayers.push(startMarker);
    }

    if (tripData.vehicle_position) {
      var carSvg =
        '<div class="map-marker-vehicle">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">' +
        '<path d="M7 17h10M5 11l1.5-4h11L19 11"/>' +
        '<circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>' +
        "</svg></div>";

      var vehicleMarker = L.marker(
        [tripData.vehicle_position.lat, tripData.vehicle_position.lng],
        {
          icon: createMapIcon(carSvg, [36, 36], [18, 18]),
          zIndexOffset: 200,
        }
      );
      vehicleMarker.addTo(liveMap);
      mapLayers.push(vehicleMarker);
    }

    if (tripData.end) {
      var endMarker = L.marker([tripData.end.lat, tripData.end.lng], {
        icon: createMapIcon('<div class="map-marker-end"></div>', [16, 16], [8, 8]),
        zIndexOffset: 100,
      });
      endMarker.addTo(liveMap);
      mapLayers.push(endMarker);
    }

    var boundsPoints = route.slice();
    if (tripData.start) boundsPoints.push([tripData.start.lat, tripData.start.lng]);
    if (tripData.end) boundsPoints.push([tripData.end.lat, tripData.end.lng]);
    if (tripData.vehicle_position) {
      boundsPoints.push([
        tripData.vehicle_position.lat,
        tripData.vehicle_position.lng,
      ]);
    }

    if (boundsPoints.length > 1) {
      liveMap.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [56, 56],
        maxZoom: 15,
      });
    }
  }

  function initMap() {
    if (!mapEl || typeof L === "undefined") return;

    var tripData = readMapData();
    if (!tripData) return;

    if (liveMap) {
      liveMap.remove();
      liveMap = null;
    }

    var center = tripData.map_center || { lat: 6.435, lng: 3.432 };
    var zoom = tripData.map_zoom || 14;

    liveMap = L.map(mapEl, {
      zoomControl: false,
      attributionControl: false,
    }).setView([center.lat, center.lng], zoom);

    liveMapTileLayer = L.tileLayer(tileLayerUrl(), { maxZoom: 19 }).addTo(liveMap);
    bindThemeListener();
    L.control.zoom({ position: "topright" }).addTo(liveMap);

    var initial = enrichTripMap(readMapData());
    if (initial) {
      currentTripData = initial;
      refreshNavigation(initial);
    }

    window.setTimeout(function () {
      if (liveMap) liveMap.invalidateSize();
    }, 150);
  }

  function updateMetrics(metrics) {
    if (!metrics) return;
    var distanceEl = document.querySelector('[data-metric="distance"]');
    var earningsEl = document.querySelector('[data-metric="earnings"]');
    var timeEl = document.querySelector('[data-metric="time"]');
    var speedEl = document.querySelector('[data-metric="speed"]');

    if (distanceEl && metrics.distance_left_km != null) {
      distanceEl.textContent = metrics.distance_left_km + " km";
    }
    if (earningsEl && metrics.earnings_live) {
      earningsEl.textContent = metrics.earnings_live;
    }
    if (timeEl && metrics.trip_time) {
      timeEl.textContent = metrics.trip_time;
    }
    if (speedEl && metrics.speed_kmh != null) {
      speedEl.textContent = metrics.speed_kmh + " km/h";
    }
  }

  function updateTripActions(trip) {
    if (!trip) return;

    var arriveForm = document.querySelector(".active-trip-arrive-form");
    var pickupForm = document.querySelector(".active-trip-pickup-form");
    var completeBtn = document.querySelector(".active-trip-complete-btn");
    var hint = document.querySelector(".active-trip-complete-hint");
    var cancelBtn = document.getElementById("driver-trip-cancel-btn");
    var cancelForm = document.getElementById("driver-trip-cancel-form");

    if (arriveForm) arriveForm.hidden = !trip.can_arrive;
    if (pickupForm) pickupForm.hidden = !trip.can_pick_up;
    if (completeBtn) {
      completeBtn.disabled = !trip.can_complete;
      completeBtn.setAttribute("aria-disabled", trip.can_complete ? "false" : "true");
    }
    if (hint) hint.hidden = !trip.picked_up || !!trip.can_complete;
    if (cancelBtn && cancelForm) {
      var cancellable = ["accepted", "driver_assigned", "driver_arrived"].indexOf(trip.status || "") >= 0;
      cancelForm.hidden = !cancellable;
    }
  }

  function readTripConfig() {
    var el = document.getElementById("driver-active-trip-config");
    if (!el) return {};
    try {
      return JSON.parse(el.textContent || "{}");
    } catch (err) {
      return {};
    }
  }

  function initChat(config) {
    var rideId = config.rideId;
    if (!rideId || !window.DriverApi) return;

    var chatBtn = document.querySelector(".active-trip-comms__btn--chat");
    var chatPanel = document.getElementById("driver-trip-chat-panel");
    var chatList = document.getElementById("driver-trip-chat-list");
    var chatForm = document.getElementById("driver-trip-chat-form");
    var chatInput = document.getElementById("driver-trip-chat-input");
    var chatSendBtn = document.getElementById("driver-trip-chat-send");

    function loadMessages() {
      if (!chatList) return;
      DriverApi.request(DriverApi.base + "/rides/" + encodeURIComponent(rideId) + "/messages")
        .then(function (data) {
          if (window.RideChat) {
            window.RideChat.renderMessages(chatList, (data && data.messages) || [], "driver");
          }
        })
        .catch(function () {});
    }

    function appendMessage(msg) {
      if (window.RideChat && chatList) {
        window.RideChat.appendMessage(chatList, msg, "driver");
      }
    }

    if (chatBtn && chatPanel) {
      chatBtn.addEventListener("click", function () {
        chatPanel.hidden = !chatPanel.hidden;
        if (!chatPanel.hidden) loadMessages();
      });
    }

    function sendMessage() {
      var text = chatInput ? chatInput.value.trim() : "";
      if (!text) return;
      if (chatSendBtn) chatSendBtn.disabled = true;
      DriverApi.post(DriverApi.base + "/rides/" + encodeURIComponent(rideId) + "/messages", {
        message: text,
      })
        .then(function (msg) {
          if (chatInput) chatInput.value = "";
          appendMessage(msg);
          if (chatPanel) chatPanel.hidden = false;
        })
        .catch(function (err) {
          window.alert(err.message || "Could not send message.");
        })
        .finally(function () {
          if (chatSendBtn) chatSendBtn.disabled = false;
        });
    }

    if (chatForm) {
      chatForm.addEventListener("submit", function (event) {
        event.preventDefault();
        sendMessage();
      });
    }

    window.__driverAppendChatMessage = appendMessage;
    loadMessages();
  }

  function initCancel(config) {
    var cancelBtn = document.getElementById("driver-trip-cancel-btn");
    var reasonInput = document.getElementById("driver-trip-cancel-reason");
    var cancelForm = document.getElementById("driver-trip-cancel-form");
    var modal = document.getElementById("driver-cancel-trip-modal");
    if (!cancelBtn || !cancelForm || !modal) return;

    var closeBtn = document.getElementById("driver-cancel-trip-close");
    var backBtn = document.getElementById("driver-cancel-trip-back");
    var confirmBtn = document.getElementById("driver-cancel-trip-confirm");
    var dismissBtn = document.getElementById("driver-cancel-trip-dismiss");
    var formSection = document.getElementById("driver-cancel-trip-form-section");
    var blockedSection = document.getElementById("driver-cancel-trip-blocked");
    var actions = document.getElementById("driver-cancel-trip-actions");
    var blockedActions = document.getElementById("driver-cancel-trip-blocked-actions");
    var otherWrap = document.getElementById("driver-cancel-other-wrap");
    var otherInput = document.getElementById("driver-cancel-other");
    var errorEl = document.getElementById("driver-cancel-trip-error");
    var reasonList = document.getElementById("driver-cancel-reason-list");

    function closeModal() {
      if (typeof modal.close === "function") {
        modal.close();
      } else {
        modal.removeAttribute("open");
        modal.hidden = true;
      }
      document.body.classList.remove("driver-cancel-trip-modal-open");
    }

    function showError(message) {
      if (!errorEl) return;
      if (message) {
        errorEl.textContent = message;
        errorEl.hidden = false;
        errorEl.classList.remove("is-hidden");
      } else {
        errorEl.textContent = "";
        errorEl.hidden = true;
        errorEl.classList.add("is-hidden");
      }
    }

    function setBlockedMode(blocked) {
      if (formSection) formSection.hidden = blocked;
      if (blockedSection) blockedSection.hidden = !blocked;
      if (actions) actions.hidden = blocked;
      if (blockedActions) blockedActions.hidden = !blocked;
    }

    function openModal(blocked) {
      showError("");
      setBlockedMode(!!blocked);
      if (typeof modal.showModal === "function") {
        modal.showModal();
      } else {
        modal.setAttribute("open", "open");
        modal.hidden = false;
      }
      document.body.classList.add("driver-cancel-trip-modal-open");
    }

    function selectedReason() {
      if (!reasonList) return "";
      var selected = reasonList.querySelector('input[name="driver_cancel_reason"]:checked');
      if (!selected) return "";
      if (selected.value === "other") {
        return otherInput ? otherInput.value.trim() : "";
      }
      return selected.value;
    }

    if (reasonList) {
      reasonList.querySelectorAll('input[name="driver_cancel_reason"]').forEach(function (input) {
        input.addEventListener("change", function () {
          if (!otherWrap) return;
          var isOther = input.value === "other" && input.checked;
          otherWrap.hidden = !isOther;
          otherWrap.classList.toggle("is-hidden", !isOther);
          if (isOther && otherInput) otherInput.focus();
        });
      });
    }

    cancelBtn.addEventListener("click", function () {
      var blocked = ["in_progress", "completed", "cancelled"].indexOf(config.rideStatus || "") >= 0;
      openModal(blocked);
    });

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (backBtn) backBtn.addEventListener("click", closeModal);
    if (dismissBtn) dismissBtn.addEventListener("click", closeModal);

    modal.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeModal();
    });

    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal();
    });

    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        var reason = selectedReason();
        if (!reason) {
          showError("Please select a reason or tell us more.");
          return;
        }
        if (reasonInput) reasonInput.value = reason;
        confirmBtn.disabled = true;
        cancelForm.submit();
      });
    }
  }

  function fetchLiveTrip() {
    return fetch("/driver-portal/api/active-trip-map", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("map fetch failed");
        return res.json();
      })
      .then(function (data) {
        if (data.map) {
          if (data.trip) {
            data.map.status = data.trip.status;
            data.map.picked_up = data.trip.picked_up;
            data.map.route_mode = data.trip.picked_up ? "to_destination" : "to_pickup";
          }
          lastNavKey = "";
          refreshNavigation(data.map);
        }
        if (data.trip) {
          updateMetrics(data.trip);
          updateTripActions(data.trip);
          startPolling(data.trip);
        }
      })
      .catch(function () {
        /* keep embedded map data on failure */
      });
  }

  function startPolling(trip) {
    if (pollTimer) window.clearInterval(pollTimer);
    var interval = trip && !trip.picked_up ? 12000 : 30000;
    pollTimer = window.setInterval(fetchLiveTrip, interval);
  }

  function startGeoWatch() {
    if (geoWatchId != null || !navigator.geolocation) return;
    geoWatchId = navigator.geolocation.watchPosition(
      function (position) {
        if (!currentTripData) return;
        currentTripData.vehicle_position = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        if (window.DriverApi) {
          window.DriverApi.post(window.DriverApi.base + "/location", {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }).catch(function () {});
        }
        lastNavKey = "";
        refreshNavigation(currentTripData);
      },
      function () {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }

  function stopGeoWatch() {
    if (geoWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
  }

  function onDriverLocationUpdate(coords) {
    if (!coords || !currentTripData) return;
    currentTripData.vehicle_position = { lat: coords.lat, lng: coords.lng };
    lastNavKey = "";
    refreshNavigation(currentTripData);
  }

  function onResize() {
    if (liveMap) liveMap.invalidateSize();
  }

  function init() {
    if (!mapEl) return;
    var tripConfig = readTripConfig();
    initMap();
    fetchLiveTrip();
    startGeoWatch();
    if (window.DriverGeolocation) {
      window.DriverGeolocation.onUpdate(onDriverLocationUpdate);
      window.DriverGeolocation.detectAndApply({ forceFresh: false }).catch(function () {});
    }
    initChat(tripConfig);
    initCancel(tripConfig);
    window.addEventListener("resize", onResize);
    window.addEventListener("beforeunload", stopGeoWatch);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
