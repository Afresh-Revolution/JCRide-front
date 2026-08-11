(function () {
  "use strict";

  var STORAGE_KEY = "josride_tracking_active";
  var configEl = document.getElementById("tracking-api-config");
  var config = {};
  if (configEl) {
    try {
      config = JSON.parse(configEl.textContent || "{}");
    } catch (err) {
      config = {};
    }
  }

  var CANCEL_TIERS = {
    requested: "before_accept",
    searching: "before_accept",
    accepted: "after_accept",
    driver_assigned: "after_accept",
    driver_arrived: "on_arrival",
  };

  var CANCELLABLE_STATUSES = [
    "requested",
    "searching",
    "accepted",
    "driver_assigned",
    "driver_arrived",
  ];

  var DRIVER_READY_STATUSES = [
    "accepted",
    "driver_assigned",
    "driver_arrived",
    "in_progress",
    "completed",
  ];

  var START_TRIP_LABEL = "Start trip";
  var TRIP_STARTED_LABEL = "Trip started";
  var STARTABLE_STATUSES = ["accepted", "driver_arrived"];
  var TRIP_LIVE_STATUSES = ["in_progress", "started", "on_trip"];
  var startTripInFlight = false;
  var chatUnreadCount = 0;
  var openChatPanel = null;
  var chatToastTimer = null;

  function normalizeRideStatus(status) {
    return String(status || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  var currentRideStatus = normalizeRideStatus(config.rideStatus) || "requested";
  var activeRideState = null;
  var pollTimer = null;
  var socket = null;
  var reconnectTimer = null;
  var loadChatMessages = null;
  var appendChatMessage = null;
  var tripHasStarted = TRIP_LIVE_STATUSES.indexOf(currentRideStatus) >= 0;
  var skipDriverMatch = !!config.skipDriverMatch;
  var isDeliveryRide = !!config.isDelivery;
  var previewStatusOverride = skipDriverMatch && !isDriverMatched(currentRideStatus) ? "accepted" : null;

  function isDeliveryJob(ride) {
    if (isDeliveryRide) return true;
    if (!ride) return false;
    var requestType = String(ride.request_type || ride.requestType || "").toLowerCase();
    var vehicle = String(ride.vehicle_category || ride.vehicle_type || ride.vehicleType || "").toLowerCase();
    return requestType === "delivery" || vehicle === "bike";
  }

  function isDriverMatched(status) {
    if (window.RideRealtimeEvents) {
      return window.RideRealtimeEvents.isDriverMatched(normalizeRideStatus(status));
    }
    return DRIVER_READY_STATUSES.indexOf(normalizeRideStatus(status)) >= 0;
  }

  function refreshTrackingMap() {
    if (!window.RiderRouteMap) return;
    if (typeof window.RiderRouteMap.refresh === "function") {
      window.RiderRouteMap.refresh();
      return;
    }
    if (typeof window.RiderRouteMap.init === "function") {
      window.RiderRouteMap.init();
    }
  }

  function readRouteMapConfig() {
    var el = document.getElementById("rider-route-map-data");
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || "{}");
    } catch (err) {
      return null;
    }
  }

  function updateDriverOnMap(location) {
    if (!location || location.lat == null || location.lng == null || !window.RiderRouteMap) return;
    var mapConfig = readRouteMapConfig();
    if (!mapConfig) return;
    mapConfig.vehicle_position = { lat: location.lat, lng: location.lng };
    window.RiderRouteMap.update(mapConfig);
  }

  function stopFindingPoll() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startStatusPoll(intervalMs) {
    stopFindingPoll();
    pollCurrentRide();
    pollTimer = window.setInterval(pollCurrentRide, intervalMs || 4000);
  }

  function showActiveTracking() {
    var finding = document.getElementById("tracking-finding");
    var active = document.getElementById("tracking-active");
    if (!finding || !active) return;

    // Keep a light poll after match so admin/driver cancels still end the trip
    // even if the websocket drops or the token cannot reconnect.
    startStatusPoll(5000);

    finding.classList.add("is-hidden");
    finding.setAttribute("hidden", "");
    active.classList.remove("is-hidden");
    active.removeAttribute("hidden");
    sessionStorage.setItem(STORAGE_KEY, "1");

    refreshTrackingMap();
    window.setTimeout(refreshTrackingMap, 180);
    window.setTimeout(refreshTrackingMap, 480);
    updateCancelButtonVisibility();
  }

  function setTrackingStep(stepIndex) {
    document.querySelectorAll(".tracking-step").forEach(function (step, index) {
      var stepNum = index + 1;
      var dot = step.querySelector(".tracking-step__dot");
      step.classList.remove("is-done", "is-current");
      if (stepNum < stepIndex) {
        step.classList.add("is-done");
        if (dot) {
          dot.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
        }
      } else if (stepNum === stepIndex) {
        step.classList.add("is-current");
        if (dot) dot.textContent = String(stepNum);
      } else if (dot) {
        dot.textContent = String(stepNum);
      }
    });

    document.querySelectorAll(".tracking-step__line").forEach(function (line, index) {
      line.classList.toggle("is-done", index + 1 < stepIndex);
    });
  }

  function canCancelStatus(status) {
    status = normalizeRideStatus(status);
    if (tripHasStarted || isTripLiveStatus(status) || status === "completed" || status === "cancelled") {
      return false;
    }
    return CANCELLABLE_STATUSES.indexOf(status) >= 0;
  }

  function updateCancelButtonVisibility() {
    var activeCancel = document.getElementById("tracking-cancel-ride");
    var findingCancel = document.getElementById("tracking-cancel-request");
    var show = canCancelStatus(currentRideStatus);
    if (activeCancel) {
      activeCancel.hidden = !show;
      activeCancel.classList.toggle("is-hidden", !show);
      activeCancel.setAttribute("aria-hidden", show ? "false" : "true");
    }
    if (findingCancel) {
      findingCancel.hidden = !show;
      findingCancel.classList.toggle("is-hidden", !show);
    }
  }

  function normalizeRideResponse(data) {
    if (!data || typeof data !== "object") return null;
    if (data.ride && typeof data.ride === "object") return data.ride;
    if (data.id || data.ride_id) return data;
    return null;
  }

  function isTripLiveStatus(status) {
    return TRIP_LIVE_STATUSES.indexOf(normalizeRideStatus(status)) >= 0;
  }

  function canRiderStartTrip(status) {
    status = normalizeRideStatus(status);
    if (tripHasStarted || isTripLiveStatus(status) || status === "completed") return false;
    return STARTABLE_STATUSES.indexOf(status) >= 0;
  }

  function setStartTripLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      if (window.ButtonLoading) {
        window.ButtonLoading.start(btn, { text: "Starting…" });
      } else {
        btn.dataset.loadingHtml = btn.innerHTML;
        btn.classList.add("is-loading");
        btn.setAttribute("aria-busy", "true");
        btn.disabled = true;
        btn.innerHTML =
          '<span class="btn-loading-content"><span class="btn-spinner" aria-hidden="true"></span>' +
          '<span class="btn-loading-label">Starting…</span></span>';
      }
      return;
    }

    if (window.ButtonLoading) window.ButtonLoading.stop(btn);
    if (btn.dataset.loadingHtml) {
      btn.innerHTML = btn.dataset.loadingHtml;
      delete btn.dataset.loadingHtml;
    }
    btn.classList.remove("is-loading");
    btn.removeAttribute("aria-busy");
    delete btn.dataset.loadingReenable;
  }

  function markTripStartedUi(btn) {
    tripHasStarted = true;
    startTripInFlight = false;
    currentRideStatus = "in_progress";
    updateCancelButtonVisibility();
    if (!btn) btn = document.getElementById("tracking-start-trip");
    if (!btn) return;
    setStartTripLoading(btn, false);
    btn.classList.add("is-started");
    btn.classList.remove("is-hidden");
    btn.hidden = false;
    btn.removeAttribute("hidden");
    btn.disabled = true;
    btn.textContent = TRIP_STARTED_LABEL;
    window.setTimeout(function () {
      hideStartTripButton(btn);
    }, 1200);
  }

  function hideStartTripButton(btn) {
    if (!btn) btn = document.getElementById("tracking-start-trip");
    if (!btn) return;
    setStartTripLoading(btn, false);
    btn.classList.add("is-hidden");
    btn.hidden = true;
    btn.setAttribute("hidden", "");
    btn.disabled = true;
  }

  function updateStartTripButton(status) {
    var btn = document.getElementById("tracking-start-trip");
    if (!btn) return;

    if (isTripLiveStatus(status) || status === "completed" || tripHasStarted) {
      tripHasStarted = true;
      if (startTripInFlight || btn.classList.contains("is-loading")) {
        markTripStartedUi(btn);
      } else {
        hideStartTripButton(btn);
      }
      return;
    }

    if (startTripInFlight || btn.classList.contains("is-loading")) return;

    if (!isDriverMatched(status)) {
      hideStartTripButton(btn);
      return;
    }

    setStartTripLoading(btn, false);
    btn.classList.remove("is-hidden", "is-started");
    btn.hidden = false;
    btn.removeAttribute("hidden");

    if (canRiderStartTrip(status)) {
      btn.disabled = false;
      btn.textContent = START_TRIP_LABEL;
      return;
    }

    btn.disabled = true;
    btn.textContent = status === "driver_assigned" ? "Waiting for driver…" : "Waiting to start…";
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeTripStops(stops) {
    if (!Array.isArray(stops)) return [];
    return stops
      .map(function (stop) {
        if (!stop || typeof stop !== "object") return null;
        var address = stop.address || stop.label || "";
        if (!address) return null;
        return {
          address: address,
          stop_order: stop.stop_order,
        };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return (a.stop_order || 0) - (b.stop_order || 0);
      });
  }

  function updateTripRoute(ride) {
    var routeEl = document.getElementById("tracking-route");
    if (!routeEl || !ride) return;

    var pickup =
      ride.pickup_address ||
      (ride.pickup && ride.pickup.address) ||
      "";
    var destination =
      ride.destination_address ||
      (ride.destination && ride.destination.address) ||
      "";
    var stops = normalizeTripStops(ride.stops);

    if (!pickup) {
      var pickupEl = routeEl.querySelector('[data-route-part="pickup"] span:last-child');
      if (pickupEl) pickup = pickupEl.textContent.trim();
    }
    if (!destination) {
      var destEl = routeEl.querySelector('[data-route-part="destination"] span:last-child');
      if (destEl) destination = destEl.textContent.trim();
    }

    var html =
      '<div class="tracking-route__row" data-route-part="pickup">' +
      '<span class="route-input__dot route-input__dot--pickup"></span>' +
      "<div><span class=\"tracking-route__label\">PICKUP</span>" +
      "<span>" +
      escapeHtml(pickup) +
      "</span></div></div>";

    stops.forEach(function (stop, index) {
      html +=
        '<div class="tracking-route__line" aria-hidden="true"></div>' +
        '<div class="tracking-route__row" data-route-part="stop">' +
        '<span class="route-input__dot route-input__dot--stop"></span>' +
        "<div><span class=\"tracking-route__label\">" +
        (stops.length > 1 ? "STOP " + (index + 1) : "STOP") +
        "</span><span>" +
        escapeHtml(stop.address) +
        "</span></div></div>";
    });

    html +=
      '<div class="tracking-route__line" aria-hidden="true"></div>' +
      '<div class="tracking-route__row" data-route-part="destination">' +
      '<span class="route-input__dot route-input__dot--dropoff"></span>' +
      "<div><span class=\"tracking-route__label\">DESTINATION</span>" +
      "<span>" +
      escapeHtml(destination) +
      "</span></div></div>";

    routeEl.innerHTML = html;
  }

  function updateDriverPanel(driver, status) {
    var driverName = driver.full_name || driver.name || "";
    if (driverName) {
      var nameEl = document.querySelector(".tracking-driver__profile strong");
      if (nameEl) nameEl.textContent = driverName;
      var avatarEl = document.querySelector(".tracking-driver__avatar");
      if (avatarEl) {
        avatarEl.textContent = driverName
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map(function (part) {
            return part[0];
          })
          .join("")
          .toUpperCase();
      }
      var chatPanelEl = document.getElementById("tracking-chat-panel");
      var chatSubtitleEl = document.getElementById("tracking-chat-subtitle");
      var chatInputEl = document.getElementById("tracking-chat-input");
      if (chatPanelEl) chatPanelEl.setAttribute("data-peer-name", driverName);
      if (chatSubtitleEl) chatSubtitleEl.textContent = driverName;
      if (chatInputEl) chatInputEl.placeholder = "Message " + driverName;
      config.driverName = driverName;
    }

    var ratingEl = document.querySelector(".tracking-driver__rating");
    if (ratingEl && (driver.rating_avg != null || driver.rating != null || driver.trips != null || driver.completed_trips != null)) {
      var rating = driver.rating_avg != null ? driver.rating_avg : driver.rating;
      var trips = driver.completed_trips != null ? driver.completed_trips : driver.trips;
      if (rating == null || rating === "") rating = "—";
      if (trips == null || trips === "") trips = 0;
      ratingEl.innerHTML =
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ' +
        rating +
        " · " +
        trips +
        " trips";
    }

    var plateEl = document.querySelector(".tracking-plate");
    if (plateEl && (driver.vehicle_plate || driver.plate_number)) {
      plateEl.textContent = driver.vehicle_plate || driver.plate_number;
    }
    var vehicleEl = document.querySelector(".tracking-driver__vehicle span:last-child");
    if (vehicleEl && driver.vehicle_model) vehicleEl.textContent = driver.vehicle_model;

    var statusEl = document.querySelector(".tracking-driver__status");
    if (statusEl) {
      statusEl.textContent = "• " + (String(status || "").replace(/_/g, " ").toUpperCase() || "UPDATING");
    }
  }

  function mergeRideState(incoming) {
    if (!incoming) return activeRideState;
    if (window.RideRealtimeEvents) {
      activeRideState = window.RideRealtimeEvents.normalizeRide(
        Object.assign({}, activeRideState || {}, incoming)
      );
    } else {
      activeRideState = Object.assign({}, activeRideState || {}, incoming);
    }
    if (previewStatusOverride) {
      activeRideState.status = previewStatusOverride;
    }
    return activeRideState;
  }

  function syncSimControls(status) {
    var wrap = document.getElementById("tracking-sim-actions");
    if (!wrap || !skipDriverMatch) return;
    status = normalizeRideStatus(status);
    var arrivedBtn = document.getElementById("tracking-sim-arrived");
    var startedBtn = document.getElementById("tracking-sim-started");
    var completedBtn = document.getElementById("tracking-sim-completed");
    var showArrived = status === "accepted" || status === "driver_assigned";
    var showStarted = isDeliveryJob(activeRideState) && status === "driver_arrived";
    var showCompleted = status === "in_progress";
    if (arrivedBtn) arrivedBtn.hidden = !showArrived;
    if (startedBtn) startedBtn.hidden = !showStarted;
    if (completedBtn) completedBtn.hidden = !showCompleted;
    wrap.hidden = !(showArrived || showStarted || showCompleted);
  }

  function setPreviewStatus(status) {
    previewStatusOverride = normalizeRideStatus(status);
    updateRideUi({
      id: activeRideId() || config.rideId || "preview-ride",
      status: previewStatusOverride,
      request_type: isDeliveryJob(activeRideState) ? "delivery" : "ride",
      vehicle_category: isDeliveryJob(activeRideState) ? "bike" : "car",
      driver: (activeRideState && activeRideState.driver) || {
        full_name: isDeliveryJob(null) ? "Preview biker" : "Preview driver",
        name: isDeliveryJob(null) ? "Preview biker" : "Preview driver",
        rating_avg: 4.9,
        completed_trips: 12,
        vehicle_plate: isDeliveryJob(null) ? "BIK-123-XY" : "ABC-123-XY",
        vehicle_model: isDeliveryJob(null) ? "Bike" : "Sedan",
      },
    });
  }

  function updateRideUi(ride) {
    if (!ride) return;
    ride = mergeRideState(ride);
    var status = normalizeRideStatus(ride.status);
    if (previewStatusOverride === "completed") {
      status = "completed";
    } else if (previewStatusOverride && status !== "cancelled") {
      status = previewStatusOverride;
    }
    currentRideStatus = status || currentRideStatus;
    if (isTripLiveStatus(status)) tripHasStarted = true;
    if (isDeliveryJob(ride)) isDeliveryRide = true;

    if (ride.id) config.rideId = ride.id;

    if (status === "cancelled") {
      redirectAfterCancel("Ride was cancelled.");
      return;
    }

    if (status === "completed") {
      window.location.href = "/user/dashboard?completed=1";
      return;
    }

    if (isDriverMatched(status) || skipDriverMatch) {
      showActiveTracking();
    }

    var stepMap = {
      requested: 1,
      searching: 1,
      accepted: 2,
      driver_assigned: 2,
      driver_arrived: 2,
      in_progress: 3,
      completed: 4,
    };
    setTrackingStep(stepMap[status] || 1);

    var driver = ride.driver || {};
    updateDriverPanel(driver, status);
    if (window.RideVoiceCall && (driver.full_name || driver.name)) {
      window.RideVoiceCall.setPeerLabel(driver.full_name || driver.name);
    }
    if (window.RideVoiceCall && (driver.phone || driver.phone_number)) {
      window.RideVoiceCall.setPeerPhone(driver.phone || driver.phone_number);
    }
    if (ride.driver_location) {
      updateDriverOnMap(ride.driver_location);
    }
    updateTripRoute(ride);
    updateCancelButtonVisibility();
    updateStartTripButton(status);
    syncSimControls(status);
    if (window.RideVoiceCall) {
      if (ride.id) window.RideVoiceCall.setRideId(ride.id);
      window.RideVoiceCall.setRideStatus(status);
    }
  }

  function isAuthError(err) {
    var message = String((err && err.message) || "").toLowerCase();
    return (
      message.indexOf("expired token") >= 0 ||
      message.indexOf("invalid or expired") >= 0 ||
      message.indexOf("unauthorized") >= 0 ||
      message.indexOf("401") >= 0
    );
  }

  function pollCurrentRide() {
    if (!window.UserApi) return;
    UserApi.request("/user/api/rides/current")
      .then(function (data) {
        if (data && data.ride) {
          updateRideUi(data.ride);
          return;
        }
        // Only leave tracking once we already had a live ride identity.
        // Avoid bouncing off the finding screen on a transient empty response.
        var hadTrip =
          !!config.rideId ||
          sessionStorage.getItem(STORAGE_KEY) === "1" ||
          isDriverMatched(currentRideStatus);
        if (hadTrip) {
          redirectAfterCancel("Your trip has ended.");
        }
      })
      .catch(function (err) {
        if (isAuthError(err)) {
          stopFindingPoll();
          sessionStorage.removeItem(STORAGE_KEY);
          window.location.href =
            "/auth/rider-login?next=" +
            encodeURIComponent("/user/book-ride") +
            "&message=" +
            encodeURIComponent("Your session expired. Please sign in again to continue.");
        }
      });
  }

  function startFindingPoll() {
    startStatusPoll(2000);
  }

  function handleSocketMessage(message) {
    if (!message || typeof message !== "object") return;
    var type = message.type || message.event || "";

    if (type === "connection.ready" && config.rideId && socket && socket.readyState === 1) {
      socket.send(JSON.stringify(window.RideRealtimeEvents.subscribeMessage(config.rideId)));
      if (window.RideVoiceCall && typeof window.RideVoiceCall.syncActiveCall === "function") {
        window.RideVoiceCall.syncActiveCall();
      }
      return;
    }

    if (type === "chat.message.new") {
      var chatPayload = message.payload || message.data || {};
      if (appendChatMessage) appendChatMessage(chatPayload);
      handleIncomingChatNotification(chatPayload);
      return;
    }

    if (window.RideVoiceCall && window.RideVoiceCall.handleEvent(type, message)) {
      return;
    }

    if (type === "ride.cancelled") {
      var cancelPayload = message.payload || {};
      redirectAfterCancel(cancelPayload.message || "Ride was cancelled.");
      return;
    }

    if (window.RideRealtimeEvents) {
      var next = window.RideRealtimeEvents.applyRideEvent(activeRideState, message);
      if (next) updateRideUi(next);
      if (type === "driver.location.updated") {
        updateDriverOnMap(message.payload || message.data || {});
      }
      return;
    }

    if (type === "driver.location.updated") {
      updateDriverOnMap(message.payload || message.data || {});
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = window.setTimeout(function () {
      reconnectTimer = null;
      connectWebSocket();
      pollCurrentRide();
    }, 3000);
  }

  function connectWebSocket() {
    if (!config.wsUrl || !config.token || !config.rideId || typeof WebSocket === "undefined") return;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;

    try {
      socket = new WebSocket(config.wsUrl + "?token=" + encodeURIComponent(config.token));
    } catch (err) {
      return;
    }

    socket.addEventListener("open", function () {
      socket.send(
        JSON.stringify(
          window.RideRealtimeEvents
            ? window.RideRealtimeEvents.subscribeMessage(config.rideId)
            : { type: "ride.subscribe", payload: { ride_id: config.rideId } }
        )
      );
    });

    socket.addEventListener("message", function (event) {
      try {
        handleSocketMessage(JSON.parse(event.data));
      } catch (err) {
        /* ignore malformed messages */
      }
    });

    socket.addEventListener("close", scheduleReconnect);
    socket.addEventListener("error", function () {
      if (socket) socket.close();
    });
  }

  function formatCancelRedirectMessage(result) {
    var parts = [result.message || "Ride cancelled."];
    if (result.cancellation_tier) parts.push("Tier: " + result.cancellation_tier.replace(/_/g, " "));
    if (result.fee_charged_ngn) parts.push("Fee charged: ₦" + Number(result.fee_charged_ngn).toLocaleString());
    if (result.fee_due_ngn) parts.push("Fee due: ₦" + Number(result.fee_due_ngn).toLocaleString());
    return parts.join(" ");
  }

  function redirectAfterCancel(message) {
    stopFindingPoll();
    sessionStorage.removeItem(STORAGE_KEY);
    var target =
      "/user/book-ride?cancelled=1&message=" +
      encodeURIComponent(message || "Ride cancelled.");
    if (window.UserApi && typeof UserApi.post === "function") {
      UserApi.post("/user/api/rides/clear-active", {})
        .catch(function () {})
        .finally(function () {
          window.location.href = target;
        });
      return;
    }
    window.location.href = target;
  }

  function performCancelRequest(confirmBtn) {
    if (window.ButtonLoading) window.ButtonLoading.start(confirmBtn, { text: "Cancelling…" });

    // Use the server-side cancel route: it resolves the ride from the session
    // (even before config.rideId is populated) and always clears the finding
    // state, so the rider is never left stuck on "Finding your driver…".
    UserApi.post("/user/live-tracking/cancel", {})
      .then(function (result) {
        redirectAfterCancel(formatCancelRedirectMessage(result || {}));
      })
      .catch(function (err) {
        if (window.ButtonLoading) window.ButtonLoading.stop(confirmBtn);
        window.alert(err.message || "Could not cancel ride request.");
      });
  }

  function initCancelRequestModal() {
    var modal = document.getElementById("cancel-request-modal");
    if (!modal) return null;

    var confirmBtn = document.getElementById("cancel-request-confirm");
    var backBtn = document.getElementById("cancel-request-back");
    var closeBtn = document.getElementById("cancel-request-close");

    function closeModal() {
      if (typeof modal.close === "function") {
        modal.close();
      } else {
        modal.removeAttribute("open");
        modal.hidden = true;
      }
      document.body.classList.remove("cancel-ride-modal-open");
    }

    function openModal() {
      if (typeof modal.showModal === "function") {
        modal.showModal();
      } else {
        modal.setAttribute("open", "open");
        modal.hidden = false;
      }
      document.body.classList.add("cancel-ride-modal-open");
    }

    if (backBtn) backBtn.addEventListener("click", closeModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    modal.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeModal();
    });

    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        performCancelRequest(confirmBtn);
      });
    }

    return openModal;
  }

  function initCancelRideModal() {
    var modal = document.getElementById("cancel-ride-modal");
    var form = document.getElementById("cancel-ride-form");
    var lead = document.getElementById("cancel-ride-lead");
    var reasonSection = document.getElementById("cancel-reason-section");
    var feeNotice = document.getElementById("cancel-fee-notice");
    var otherWrap = document.getElementById("cancel-reason-other-wrap");
    var otherInput = document.getElementById("cancel-reason-other");
    var errorEl = document.getElementById("cancel-ride-error");
    var confirmBtn = document.getElementById("cancel-ride-confirm");
    if (!modal || !form) return null;

    function tierForStatus(status) {
      status = normalizeRideStatus(status);
      if (isTripLiveStatus(status) || status === "completed" || status === "cancelled" || tripHasStarted) {
        return "locked";
      }
      return CANCEL_TIERS[status] || "before_accept";
    }

    function resetModal() {
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.classList.add("is-hidden");
        errorEl.textContent = "";
      }
      form.querySelectorAll('input[name="cancel_reason"]').forEach(function (input) {
        input.checked = false;
      });
      if (otherInput) otherInput.value = "";
      if (otherWrap) {
        otherWrap.hidden = true;
        otherWrap.classList.add("is-hidden");
      }
    }

    function openCancelModal() {
      resetModal();
      var status = normalizeRideStatus(currentRideStatus);
      var tier = tierForStatus(status);

      if (tier === "locked" || !canCancelStatus(status)) {
        updateCancelButtonVisibility();
        window.alert("This trip has started and can no longer be cancelled. Contact support if you need help.");
        return;
      }

      if (lead) {
        if (tier === "before_accept") {
          lead.textContent = "Cancel before a driver accepts. No fee will be charged.";
        } else if (tier === "after_accept") {
          lead.textContent =
            "Your driver has accepted. No fee applies, but please tell us why you are cancelling.";
        } else {
          lead.textContent =
            "Your driver has arrived. A ₦" +
            (config.cancellationFeeNgn || 500).toLocaleString() +
            " cancellation fee applies.";
        }
      }
      if (reasonSection) {
        var showReason = tier === "after_accept";
        reasonSection.hidden = !showReason;
        reasonSection.classList.toggle("is-hidden", !showReason);
      }
      if (feeNotice) {
        var showFee = tier === "on_arrival";
        feeNotice.hidden = !showFee;
        feeNotice.classList.toggle("is-hidden", !showFee);
      }
      if (typeof modal.showModal === "function") {
        modal.showModal();
      } else {
        modal.setAttribute("open", "open");
      }
    }

    function closeCancelModal() {
      if (typeof modal.close === "function") {
        modal.close();
      } else {
        modal.removeAttribute("open");
      }
    }

    form.querySelectorAll('input[name="cancel_reason"]').forEach(function (input) {
      input.addEventListener("change", function () {
        if (!otherWrap) return;
        var isOther = input.value === "other" && input.checked;
        otherWrap.hidden = !isOther;
        otherWrap.classList.toggle("is-hidden", !isOther);
      });
    });

    document.getElementById("cancel-ride-close")?.addEventListener("click", closeCancelModal);
    document.getElementById("cancel-ride-back")?.addEventListener("click", closeCancelModal);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = normalizeRideStatus(currentRideStatus);
      var tier = tierForStatus(status);
      if (tier === "locked" || !canCancelStatus(status)) {
        if (errorEl) {
          errorEl.textContent = "This trip has started and can no longer be cancelled.";
          errorEl.hidden = false;
          errorEl.classList.remove("is-hidden");
        }
        updateCancelButtonVisibility();
        return;
      }
      var payload = {};
      if (tier === "after_accept") {
        var selected = form.querySelector('input[name="cancel_reason"]:checked');
        if (!selected) {
          if (errorEl) {
            errorEl.textContent = "Please select a cancellation reason.";
            errorEl.hidden = false;
            errorEl.classList.remove("is-hidden");
          }
          return;
        }
        payload.reason_code = selected.value;
        if (selected.value === "other" && otherInput) {
          payload.reason = otherInput.value.trim();
          if (!payload.reason) {
            if (errorEl) {
              errorEl.textContent = "Please describe your reason.";
              errorEl.hidden = false;
              errorEl.classList.remove("is-hidden");
            }
            return;
          }
        }
      }

      var rideId = config.rideId;
      if (!rideId) {
        if (errorEl) {
          errorEl.textContent = "Ride not found. Refresh the page and try again.";
          errorEl.hidden = false;
          errorEl.classList.remove("is-hidden");
        }
        return;
      }

      if (confirmBtn && window.ButtonLoading) {
        window.ButtonLoading.start(confirmBtn, { text: "Cancelling…" });
      } else if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Cancelling…";
      }

      UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/cancel", payload)
        .then(function (result) {
          closeCancelModal();
          redirectAfterCancel(formatCancelRedirectMessage(result));
        })
        .catch(function (err) {
          if (errorEl) {
            errorEl.textContent =
              err.message ||
              (currentRideStatus === "in_progress"
                ? "This trip can no longer be cancelled."
                : "Could not cancel ride.");
            errorEl.hidden = false;
            errorEl.classList.remove("is-hidden");
          }
          if (confirmBtn && window.ButtonLoading) window.ButtonLoading.stop(confirmBtn);
        })
        .finally(function () {
          if (confirmBtn && !window.ButtonLoading) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Confirm cancellation";
          }
        });
    });

    return openCancelModal;
  }

  function initFindingDriver() {
    var finding = document.getElementById("tracking-finding");
    var active = document.getElementById("tracking-active");
    if (!finding || !active) return;

    var openCancelModal = initCancelRideModal();
    var openCancelRequestModal = initCancelRequestModal();

    var params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") {
      sessionStorage.removeItem(STORAGE_KEY);
      if (window.history.replaceState) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    if (
      skipDriverMatch ||
      !config.showFinding ||
      sessionStorage.getItem(STORAGE_KEY) === "1" ||
      isDriverMatched(currentRideStatus)
    ) {
      if (skipDriverMatch && !isDriverMatched(currentRideStatus)) {
        setPreviewStatus("accepted");
      } else {
        showActiveTracking();
        syncSimControls(currentRideStatus);
      }
    } else {
      startFindingPoll();
    }

    var cancelBtn = document.getElementById("tracking-cancel-request");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        if (["requested", "searching"].indexOf(currentRideStatus) >= 0) {
          if (openCancelRequestModal) openCancelRequestModal();
          else performCancelRequest(cancelBtn);
          return;
        }
        if (openCancelModal) openCancelModal();
      });
    }

    var activeCancel = document.getElementById("tracking-cancel-ride");
    if (activeCancel && openCancelModal) {
      activeCancel.addEventListener("click", function () {
        openCancelModal();
      });
    }

    connectWebSocket();
    updateCancelButtonVisibility();
    updateStartTripButton(currentRideStatus);
  }

  function initVoiceCall() {
    if (!window.RideVoiceCall || !config.rideId || !window.UserApi) return;
    var driverNameEl = document.querySelector(".tracking-driver__profile strong");
    window.RideVoiceCall.init({
      rideId: config.rideId,
      rideStatus: currentRideStatus,
      userId: config.userId || "",
      authToken: config.token || "",
      role: "customer",
      peerLabel: driverNameEl ? driverNameEl.textContent.trim() : "Driver",
      peerPhone: config.driverPhone || "",
      apiBase: "/user/api/rides",
      apiPost: UserApi.post,
      apiGet: UserApi.request,
      callButton: document.getElementById("tracking-call-driver"),
      onError: function (message) {
        window.alert(message || "Call failed.");
      },
    });
  }

  function activeRideId() {
    return config.rideId || (activeRideState && (activeRideState.id || activeRideState.ride_id)) || "";
  }

  function isChatPanelOpen() {
    var chatPanel = document.getElementById("tracking-chat-panel");
    return !!(chatPanel && (!chatPanel.hidden || chatPanel.classList.contains("is-open")));
  }

  function updateChatBadge() {
    var badge = document.getElementById("tracking-chat-badge");
    if (!badge) return;
    if (chatUnreadCount > 0) {
      badge.hidden = false;
      badge.textContent = chatUnreadCount > 9 ? "9+" : String(chatUnreadCount);
      badge.setAttribute("aria-hidden", "false");
    } else {
      badge.hidden = true;
      badge.textContent = "0";
      badge.setAttribute("aria-hidden", "true");
    }
  }

  function hideChatToast() {
    var toast = document.getElementById("tracking-chat-toast");
    if (toast) toast.hidden = true;
    if (chatToastTimer) {
      window.clearTimeout(chatToastTimer);
      chatToastTimer = null;
    }
  }

  function showChatToast(text) {
    var toast = document.getElementById("tracking-chat-toast");
    var textEl = document.getElementById("tracking-chat-toast-text");
    if (!toast || !textEl) return;
    textEl.textContent = text || "Open chat to reply";
    toast.hidden = false;
    if (chatToastTimer) window.clearTimeout(chatToastTimer);
    chatToastTimer = window.setTimeout(hideChatToast, 8000);
  }

  function bumpHeaderNotificationBadge() {
    var btn = document.querySelector(".admin-icon-btn--notifications");
    if (!btn) return;
    var badge = btn.querySelector(".notification-badge, .admin-icon-btn__badge");
    var current = badge ? parseInt(badge.textContent, 10) || 0 : 0;
    var next = current + 1;
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "notification-badge admin-icon-btn__badge";
      btn.appendChild(badge);
    }
    badge.hidden = false;
    badge.textContent = next > 99 ? "99+" : String(next);
    badge.classList.toggle("notification-badge--wide", String(badge.textContent).length > 1);
    btn.classList.add("has-unread");
  }

  function handleIncomingChatNotification(msg) {
    if (!msg) return;
    var role = String(msg.sender_role || msg.role || "").toLowerCase();
    if (role && role !== "driver") return;

    if (isChatPanelOpen()) {
      hideChatToast();
      chatUnreadCount = 0;
      updateChatBadge();
      return;
    }

    chatUnreadCount += 1;
    updateChatBadge();
    bumpHeaderNotificationBadge();
    showChatToast(msg.message || msg.text || "New message");

    try {
      if (navigator.vibrate) navigator.vibrate(40);
    } catch (err) {
      /* ignore */
    }
  }

  function initTrackingActions() {
    var startBtn = document.getElementById("tracking-start-trip");
    if (startBtn) {
      updateStartTripButton(currentRideStatus);
      startBtn.addEventListener("click", function () {
        var rideId = activeRideId();
        if (!rideId) {
          window.alert("Trip is still loading. Try again in a moment.");
          return;
        }
        if (tripHasStarted || isTripLiveStatus(currentRideStatus)) {
          markTripStartedUi(startBtn);
          return;
        }
        if (!canRiderStartTrip(currentRideStatus)) {
          window.alert("Trip can start once your driver has accepted or arrived.");
          return;
        }
        if (startTripInFlight || startBtn.classList.contains("is-loading")) return;

        startTripInFlight = true;
        setStartTripLoading(startBtn, true);

        UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/start", {})
          .then(function (data) {
            var ride = normalizeRideResponse(data);
            if (ride) {
              if (isTripLiveStatus(ride.status) || !ride.status) {
                tripHasStarted = true;
                ride.status = ride.status || "in_progress";
              }
              updateRideUi(ride);
              if (tripHasStarted) markTripStartedUi(startBtn);
              return;
            }
            return pollCurrentRide();
          })
          .catch(function (err) {
            var message = String((err && err.message) || "").toLowerCase();
            if (message.indexOf("cannot be started") >= 0 || message.indexOf("already") >= 0) {
              return UserApi.request("/user/api/rides/current").then(function (current) {
                if (current && current.ride) {
                  updateRideUi(current.ride);
                  if (isTripLiveStatus(current.ride.status)) {
                    markTripStartedUi(startBtn);
                    return;
                  }
                }
                throw err;
              });
            }
            throw err;
          })
          .catch(function (err) {
            startTripInFlight = false;
            setStartTripLoading(startBtn, false);
            updateStartTripButton(currentRideStatus);
            window.alert(err.message || "Could not start trip.");
          })
          .finally(function () {
            if (tripHasStarted || isTripLiveStatus(currentRideStatus)) {
              markTripStartedUi(startBtn);
              return;
            }
            if (startTripInFlight) {
              startTripInFlight = false;
              setStartTripLoading(startBtn, false);
              updateStartTripButton(currentRideStatus);
            }
          });
      });
    }

    initVoiceCall();

    var sosBtn = document.getElementById("tracking-sos-btn");
    if (sosBtn) {
      sosBtn.addEventListener("click", function () {
        var rideId = activeRideId();
        if (!rideId) return;
        if (!window.confirm("Send SOS alert to JosRide safety team?")) return;
        if (window.ButtonLoading) window.ButtonLoading.start(sosBtn, { text: "Sending…" });
        var payload = {};
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(function (pos) {
            payload.lat = pos.coords.latitude;
            payload.lng = pos.coords.longitude;
            sendSos(payload);
          }, function () {
            sendSos(payload);
          });
          return;
        }
        sendSos(payload);
      });
    }

    function sendSos(payload) {
      var rideId = activeRideId();
      if (!rideId) return;
      UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/sos", payload)
        .then(function () {
          if (window.ButtonLoading) window.ButtonLoading.stop(sosBtn);
          alert("SOS alert sent. Help is on the way.");
        })
        .catch(function (err) {
          if (window.ButtonLoading) window.ButtonLoading.stop(sosBtn);
          alert(err.message || "SOS failed.");
        });
    }

    var chatBtn = document.getElementById("tracking-chat-btn");
    var chatPanel = document.getElementById("tracking-chat-panel");
    var chatList = document.getElementById("tracking-chat-list");
    var chatForm = document.getElementById("tracking-chat-form");
    var chatInput = document.getElementById("tracking-chat-input");
    var chatSendBtn = document.getElementById("tracking-chat-send");
    var toastOpen = document.getElementById("tracking-chat-toast-open");
    var toastClose = document.getElementById("tracking-chat-toast-close");

    var chatCloseBtn = document.getElementById("tracking-chat-close");
    var chatSubtitle = document.getElementById("tracking-chat-subtitle");

    function cleanChatName(value) {
      var name = String(value || "").trim();
      if (!name) return "";
      var lower = name.toLowerCase();
      if (
        lower === "driver" ||
        lower === "customer" ||
        lower === "rider" ||
        lower === "user" ||
        lower === "-" ||
        lower === "your driver"
      ) {
        return "";
      }
      return name;
    }

    function chatNames() {
      var selfEl = document.querySelector(".admin-profile__name");
      var driverEl = document.querySelector(".tracking-driver__profile strong");
      var selfName =
        cleanChatName(chatPanel && chatPanel.getAttribute("data-self-name")) ||
        cleanChatName(config.riderName) ||
        cleanChatName(selfEl && selfEl.textContent) ||
        "You";
      var driverName =
        cleanChatName(chatPanel && chatPanel.getAttribute("data-peer-name")) ||
        cleanChatName(driverEl && driverEl.textContent) ||
        cleanChatName(config.driverName) ||
        cleanChatName(chatSubtitle && chatSubtitle.textContent) ||
        "Driver";
      if (window.RideVoiceCall && typeof window.RideVoiceCall.getPeerLabel === "function") {
        driverName = cleanChatName(window.RideVoiceCall.getPeerLabel()) || driverName;
      }
      if (chatSubtitle && driverName) chatSubtitle.textContent = driverName;
      if (chatPanel) {
        chatPanel.setAttribute("data-self-name", selfName);
        chatPanel.setAttribute("data-peer-name", driverName);
      }
      return {
        self: selfName,
        me: selfName,
        rider: selfName,
        customer: selfName,
        driver: driverName,
        peer: driverName,
      };
    }

    loadChatMessages = function () {
      var rideId = activeRideId();
      if (!chatList || !rideId) return;
      UserApi.request("/user/api/rides/" + encodeURIComponent(rideId) + "/messages")
        .then(function (data) {
          if (window.RideChat) {
            window.RideChat.renderMessages(
              chatList,
              (data && data.messages) || [],
              "customer",
              chatNames()
            );
          }
        })
        .catch(function () {});
    };

    appendChatMessage = function (msg) {
      if (!window.RideChat || !chatList || !msg) return false;
      var names = chatNames();
      if (typeof msg === "object") {
        var role = String(msg.sender_role || "").toLowerCase();
        if (!msg.sender_name) {
          if (role === "customer" || role === "rider") msg.sender_name = names.self;
          else if (role === "driver") msg.sender_name = names.driver;
        }
      }
      return window.RideChat.appendMessage(chatList, msg, "customer", names);
    };

    function setReloadBtnHiddenForChat(hidden) {
      var reloadBtn = document.getElementById("pwa-reload-btn");
      if (!reloadBtn) return;
      if (hidden) {
        reloadBtn.classList.add("is-chat-hidden");
        reloadBtn.hidden = true;
        reloadBtn.setAttribute("hidden", "");
        reloadBtn.setAttribute("aria-hidden", "true");
        return;
      }
      reloadBtn.classList.remove("is-chat-hidden");
      reloadBtn.removeAttribute("aria-hidden");
      if (
        document.documentElement.classList.contains("is-pwa") &&
        document.documentElement.classList.contains("pwa-ready")
      ) {
        reloadBtn.hidden = false;
        reloadBtn.removeAttribute("hidden");
      } else {
        reloadBtn.hidden = true;
        reloadBtn.setAttribute("hidden", "");
      }
    }

    openChatPanel = function () {
      if (!chatPanel) return;
      chatPanel.hidden = false;
      chatPanel.removeAttribute("hidden");
      chatPanel.classList.add("is-open");
      document.body.classList.add("rider-trip-chat-open");
      setReloadBtnHiddenForChat(true);
      if (chatBtn) chatBtn.setAttribute("aria-expanded", "true");
      chatUnreadCount = 0;
      updateChatBadge();
      hideChatToast();
      loadChatMessages();
      window.setTimeout(function () {
        if (chatInput) chatInput.focus();
      }, 180);
    };

    function closeChatPanel() {
      if (!chatPanel) return;
      chatPanel.classList.remove("is-open");
      chatPanel.hidden = true;
      chatPanel.setAttribute("hidden", "");
      document.body.classList.remove("rider-trip-chat-open");
      setReloadBtnHiddenForChat(false);
      if (chatBtn) chatBtn.setAttribute("aria-expanded", "false");
    }

    if (chatBtn && chatPanel) {
      chatBtn.addEventListener("click", function () {
        if (chatPanel.hidden) openChatPanel();
        else closeChatPanel();
      });
    }

    if (chatCloseBtn) {
      chatCloseBtn.addEventListener("click", function () {
        closeChatPanel();
      });
    }

    if (toastOpen) {
      toastOpen.addEventListener("click", function () {
        openChatPanel();
      });
    }
    if (toastClose) {
      toastClose.addEventListener("click", function () {
        hideChatToast();
      });
    }

    var chatSending = false;

    function sendChatMessage() {
      var rideId = activeRideId();
      var text = chatInput ? chatInput.value.trim() : "";
      if (!text || !rideId || chatSending) return;
      chatSending = true;
      if (chatSendBtn) chatSendBtn.disabled = true;
      UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/messages", {
        message: text,
      })
        .then(function (msg) {
          if (chatInput) chatInput.value = "";
          // Optimistic append; WebSocket echo is ignored via message-id dedupe.
          if (msg && typeof msg === "object") {
            msg.sender_role = msg.sender_role || "customer";
            msg.sender_name = msg.sender_name || chatNames().self;
          }
          appendChatMessage(msg);
        })
        .catch(function (err) {
          alert(err.message || "Could not send message.");
        })
        .finally(function () {
          chatSending = false;
          if (chatSendBtn) chatSendBtn.disabled = false;
        });
    }

    if (chatForm) {
      chatForm.addEventListener("submit", function (event) {
        event.preventDefault();
        sendChatMessage();
      });
    }
  }

  function initShareRide() {
    var copyBtn = document.getElementById("share-copy-link");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var targetId = copyBtn.getAttribute("data-copy-target");
        var input = targetId ? document.getElementById(targetId) : null;
        var text = input ? input.value : "";
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
        }
      });
    }

    function shareText(url, message) {
      return (message || "Track my JosRide trip:") + " " + (url || "");
    }

    document.querySelectorAll("#share-whatsapp, #share-sms, #share-email").forEach(function (el) {
      el.addEventListener("click", function (event) {
        event.preventDefault();
        var url = el.getAttribute("data-share-url") || "";
        var message = el.getAttribute("data-share-message") || "";
        var text = encodeURIComponent(shareText(url, message));
        if (el.id === "share-whatsapp") {
          window.open("https://wa.me/?text=" + text, "_blank");
        } else if (el.id === "share-sms") {
          window.location.href = "sms:?body=" + text;
        } else {
          window.location.href = "mailto:?subject=My JosRide trip&body=" + text;
        }
      });
    });

    document.querySelectorAll(".share-contact__btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var phone = btn.getAttribute("data-share-phone") || "";
        var url = btn.getAttribute("data-share-url") || "";
        var message = btn.getAttribute("data-share-message") || shareText(url, "");
        if (phone) {
          window.location.href = "sms:" + phone + "?body=" + encodeURIComponent(message);
        }
      });
    });

    var addContact = document.querySelector(".share-contacts-add");
    if (addContact && window.UserApi) {
      addContact.addEventListener("click", function () {
        var name = window.prompt("Contact name:");
        var phone = window.prompt("Phone number:");
        if (!name || !phone) return;
        UserApi.post("/user/api/contacts", { name: name.trim(), phone: phone.trim() })
          .then(function () {
            window.location.reload();
          })
          .catch(function (err) {
            alert(err.message || "Could not add contact.");
          });
      });
    }
  }

  function initDeliverySimulation() {
    if (!skipDriverMatch) return;
    var arrivedBtn = document.getElementById("tracking-sim-arrived");
    var startedBtn = document.getElementById("tracking-sim-started");
    var completedBtn = document.getElementById("tracking-sim-completed");
    if (arrivedBtn) {
      arrivedBtn.addEventListener("click", function () {
        setPreviewStatus("driver_arrived");
      });
    }
    if (startedBtn) {
      startedBtn.addEventListener("click", function () {
        setPreviewStatus("in_progress");
      });
    }
    if (completedBtn) {
      completedBtn.addEventListener("click", function () {
        previewStatusOverride = "completed";
        updateRideUi({
          id: activeRideId() || config.rideId || "preview-ride",
          status: "completed",
        });
      });
    }
    syncSimControls(currentRideStatus);
  }

  function boot() {
    if (!window.UserApi) return;
    initFindingDriver();
    initTrackingActions();
    initDeliverySimulation();
    initShareRide();
  }

  function waitForUserApi(attempt) {
    // Simulation + tracking must not wait on voice-call script.
    if (window.UserApi) {
      boot();
      return;
    }
    if (attempt >= 100) return;
    window.setTimeout(function () {
      waitForUserApi(attempt + 1);
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      waitForUserApi(0);
    });
  } else {
    waitForUserApi(0);
  }
})();
