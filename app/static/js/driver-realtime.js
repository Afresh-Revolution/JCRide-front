(function () {
  "use strict";

  var configEl = document.getElementById("driver-realtime-config");
  if (!configEl) return;

  var config = {};
  try {
    config = JSON.parse(configEl.textContent || "{}");
  } catch (err) {
    return;
  }

  if (!config.wsUrl || !config.token || typeof WebSocket === "undefined") return;

  var socket = null;
  var reconnectTimer = null;
  var redirectTimer = null;
  var overlay = document.getElementById("driver-cancel-overlay");
  var titleEl = document.getElementById("driver-cancel-title");
  var reasonWrap = document.getElementById("driver-cancel-reason-wrap");
  var reasonLabelEl = document.getElementById("driver-cancel-reason-label");
  var reasonEl = document.getElementById("driver-cancel-reason");
  var leadEl = document.getElementById("driver-cancel-lead");
  var statusEl = document.getElementById("driver-cancel-status");
  var dismissBtn = document.getElementById("driver-cancel-dismiss");
  var authFailCount = 0;

  function rideRequestsUrl() {
    return config.rideRequestsUrl || config.dashboardUrl || "/driver-portal/ride-requests";
  }

  function setDriverOpenUi() {
    document.querySelectorAll(".status-banner").forEach(function (banner) {
      banner.classList.add("status-banner--online");
      banner.classList.remove("status-banner--on-trip");
      var title = banner.querySelector(".status-banner__title");
      if (title) {
        title.innerHTML = 'YOU ARE <strong>Open</strong> · accepting rides';
      }
      var sub = banner.querySelector(".status-banner__sub");
      if (sub) sub.textContent = "Ready for new ride requests";
    });
    document.body.classList.remove("driver-on-active-trip");
    document.body.classList.add("driver-open");
    config.activeTripId = null;
  }

  function leaveActiveTrip() {
    if (window.location.pathname.indexOf("/active-trip") >= 0) {
      window.location.href = rideRequestsUrl();
    }
  }

  function showCancelOverlay(payload) {
    if (!overlay) {
      leaveActiveTrip();
      return;
    }
    var booking = payload.booking_id || "this trip";
    var reason = (payload.reason || payload.cancellation_reason || "").trim();
    var byAdmin = payload.actor_type === "admin";
    if (titleEl) {
      titleEl.textContent = byAdmin ? "Ride cancelled by support" : "Ride cancelled by rider";
    }
    if (leadEl) {
      leadEl.textContent =
        payload.driver_message ||
        (byAdmin
          ? "Support cancelled " + booking + ". You are back on the map for new requests."
          : "The rider cancelled " + booking + ". You are back on the map for new requests.");
    }
    if (reasonWrap && reasonEl) {
      if (reason) {
        reasonEl.textContent = reason;
        if (reasonLabelEl) {
          reasonLabelEl.textContent = byAdmin ? "Reason from support" : "Reason from rider";
        }
        reasonWrap.hidden = false;
      } else {
        reasonWrap.hidden = true;
      }
    }
    if (statusEl) {
      statusEl.innerHTML =
        'Your status is now <strong>Open</strong> - you can accept new ride requests.';
    }
    overlay.hidden = false;
    overlay.classList.remove("is-hidden");
    document.body.classList.add("driver-cancel-overlay-open");
    setDriverOpenUi();

    if (redirectTimer) window.clearTimeout(redirectTimer);
    redirectTimer = window.setTimeout(function () {
      hideCancelOverlay(true);
    }, 1800);
  }

  function hideCancelOverlay(forceRedirect) {
    if (redirectTimer) {
      window.clearTimeout(redirectTimer);
      redirectTimer = null;
    }
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.add("is-hidden");
    }
    document.body.classList.remove("driver-cancel-overlay-open");
    if (forceRedirect || window.location.pathname.indexOf("/active-trip") >= 0) {
      window.location.href = rideRequestsUrl();
    }
  }

  if (dismissBtn) {
    dismissBtn.addEventListener("click", function () {
      hideCancelOverlay(true);
    });
  }

  function sendLocationUpdate(pos) {
    if (!socket || socket.readyState !== 1 || !pos || pos.lat == null || pos.lng == null) {
      return false;
    }
    var message =
      window.RideRealtimeEvents && window.RideRealtimeEvents.driverLocationMessage
        ? window.RideRealtimeEvents.driverLocationMessage(pos)
        : {
            type: "driver.location.update",
            payload: {
              lat: pos.lat,
              lng: pos.lng,
              accuracy: pos.accuracy,
            },
          };
    if (!message) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function dispatchTripEvent(type, payload) {
    window.dispatchEvent(
      new CustomEvent("driver-ride-event", {
        detail: { type: type, payload: payload || {} },
      })
    );
  }

  function notifyNewRideRequest(payload) {
    if (window.location.pathname.indexOf("/ride-requests") < 0) return;
    var countEl = document.querySelector(".ride-requests-count");
    if (countEl && payload && payload.booking_id) {
      countEl.textContent = "New request: " + payload.booking_id;
    }
    if (typeof window.fetchRideRequests === "function") {
      window.fetchRideRequests();
    }
  }

  function handleMessage(event) {
    try {
      var message = JSON.parse(event.data);
      var type = message.type || message.event || "";
      var payload = message.payload || message.data || {};

      if (type === "connection.ready") {
        authFailCount = 0;
        if (config.activeTripId && socket && socket.readyState === 1) {
          socket.send(
            JSON.stringify(
              window.RideRealtimeEvents
                ? window.RideRealtimeEvents.subscribeMessage(config.activeTripId)
                : { type: "ride.subscribe", payload: { ride_id: config.activeTripId } }
            )
          );
        }
        return;
      }

      if (
        type === "ride.cancelled" &&
        (payload.actor_type === "customer" || payload.actor_type === "admin")
      ) {
        showCancelOverlay(payload);
        dispatchTripEvent(type, payload);
        return;
      }

      if (type === "driver.availability.open") {
        setDriverOpenUi();
        if (window.location.pathname.indexOf("/active-trip") >= 0) {
          window.location.href = rideRequestsUrl();
        }
        return;
      }

      if (type === "ride.request.new") {
        notifyNewRideRequest(payload);
        return;
      }

      if (type === "ride.request.closed") {
        if (typeof window.fetchRideRequests === "function") {
          window.fetchRideRequests();
        }
        return;
      }

      if (type === "chat.message.new" && window.__driverAppendChatMessage) {
        window.__driverAppendChatMessage(payload);
        return;
      }

      if (
        type === "ride.started" ||
        type === "ride.completed" ||
        type === "ride.driver.arrived" ||
        type === "ride.updated" ||
        type === "ride.snapshot"
      ) {
        dispatchTripEvent(type, payload);
        if (type === "ride.completed" && window.location.pathname.indexOf("/active-trip") >= 0) {
          window.location.href = config.dashboardUrl || "/driver-portal/dashboard";
        }
      }
    } catch (err) {
      /* ignore malformed messages */
    }
  }

  function scheduleReconnect(delayMs) {
    if (reconnectTimer) return;
    reconnectTimer = window.setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, delayMs || 3000);
  }

  function connect() {
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    try {
      socket = new WebSocket(config.wsUrl + "?token=" + encodeURIComponent(config.token));
    } catch (err) {
      scheduleReconnect(5000);
      return;
    }

    socket.addEventListener("open", function () {
      authFailCount = 0;
      if (config.activeTripId) {
        socket.send(
          JSON.stringify(
            window.RideRealtimeEvents
              ? window.RideRealtimeEvents.subscribeMessage(config.activeTripId)
              : { type: "ride.subscribe", payload: { ride_id: config.activeTripId } }
          )
        );
      }
    });

    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", function (event) {
      // 1008 = policy violation / auth failure from backend WS
      if (event && event.code === 1008) {
        authFailCount += 1;
        if (authFailCount >= 3 && window.location.pathname.indexOf("/active-trip") >= 0) {
          // Keep the page usable via HTTP polling; avoid looping forever on a dead token.
          return;
        }
        scheduleReconnect(authFailCount >= 2 ? 8000 : 3000);
        return;
      }
      scheduleReconnect(3000);
    });
    socket.addEventListener("error", function () {
      if (socket) socket.close();
    });
  }

  window.DriverRealtime = {
    sendLocationUpdate: sendLocationUpdate,
    isConnected: function () {
      return !!(socket && socket.readyState === 1);
    },
  };

  connect();
})();
