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
  var overlay = document.getElementById("driver-cancel-overlay");
  var reasonWrap = document.getElementById("driver-cancel-reason-wrap");
  var reasonEl = document.getElementById("driver-cancel-reason");
  var leadEl = document.getElementById("driver-cancel-lead");
  var statusEl = document.getElementById("driver-cancel-status");
  var dismissBtn = document.getElementById("driver-cancel-dismiss");

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
  }

  function showCancelOverlay(payload) {
    if (!overlay) return;
    var booking = payload.booking_id || "this trip";
    var reason = (payload.reason || "").trim();
    if (leadEl) {
      leadEl.textContent =
        payload.driver_message ||
        "The rider cancelled " + booking + ". You are back on the map for new requests.";
    }
    if (reasonWrap && reasonEl) {
      if (reason) {
        reasonEl.textContent = reason;
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
  }

  function hideCancelOverlay() {
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.add("is-hidden");
    document.body.classList.remove("driver-cancel-overlay-open");
    if (window.location.pathname.indexOf("/active-trip") >= 0) {
      window.location.href = config.rideRequestsUrl || config.dashboardUrl || "/driver-portal/ride-requests";
      return;
    }
  }

  if (dismissBtn) {
    dismissBtn.addEventListener("click", hideCancelOverlay);
  }

  function handleMessage(event) {
    try {
      var message = JSON.parse(event.data);
      var type = message.type;
      var payload = message.payload || {};

      if (type === "ride.cancelled" && payload.actor_type === "customer") {
        showCancelOverlay(payload);
      }
      if (type === "driver.availability.open") {
        setDriverOpenUi();
      }
    } catch (err) {
      /* ignore malformed messages */
    }
  }

  try {
    socket = new WebSocket(config.wsUrl + "?token=" + encodeURIComponent(config.token));
  } catch (err) {
    return;
  }

  socket.addEventListener("open", function () {
    if (config.activeTripId) {
      socket.send(
        JSON.stringify({
          type: "ride.subscribe",
          payload: { ride_id: config.activeTripId },
        })
      );
    }
  });

  socket.addEventListener("message", handleMessage);
})();
