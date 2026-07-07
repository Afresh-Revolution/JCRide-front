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

  var currentRideStatus = config.rideStatus || "requested";
  var activeRideState = null;
  var pollTimer = null;
  var socket = null;
  var reconnectTimer = null;
  var loadChatMessages = null;
  var appendChatMessage = null;

  var CANCEL_TIERS = {
    requested: "before_accept",
    searching: "before_accept",
    accepted: "after_accept",
    driver_assigned: "after_accept",
    driver_arrived: "on_arrival",
  };

  var DRIVER_READY_STATUSES = [
    "accepted",
    "driver_assigned",
    "driver_arrived",
    "in_progress",
    "completed",
  ];

  function isDriverMatched(status) {
    if (window.RideRealtimeEvents) {
      return window.RideRealtimeEvents.isDriverMatched(status);
    }
    return DRIVER_READY_STATUSES.indexOf(status || "") >= 0;
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

  function showActiveTracking() {
    var finding = document.getElementById("tracking-finding");
    var active = document.getElementById("tracking-active");
    if (!finding || !active) return;

    stopFindingPoll();

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
    return ["requested", "searching", "accepted", "driver_assigned", "driver_arrived"].indexOf(status) >= 0;
  }

  function updateCancelButtonVisibility() {
    var activeCancel = document.getElementById("tracking-cancel-ride");
    var findingCancel = document.getElementById("tracking-cancel-request");
    var show = canCancelStatus(currentRideStatus);
    if (activeCancel) activeCancel.hidden = !show || currentRideStatus === "in_progress";
    if (findingCancel) findingCancel.hidden = !show;
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
    }

    var ratingEl = document.querySelector(".tracking-driver__rating");
    if (ratingEl && (driver.rating_avg != null || driver.rating != null || driver.trips != null)) {
      var rating = driver.rating_avg != null ? driver.rating_avg : driver.rating;
      var trips = driver.completed_trips != null ? driver.completed_trips : driver.trips;
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
    return activeRideState;
  }

  function updateRideUi(ride) {
    if (!ride) return;
    ride = mergeRideState(ride);
    var status = ride.status || "";
    currentRideStatus = status;

    if (ride.id) config.rideId = ride.id;

    if (status === "cancelled") {
      redirectAfterCancel("Ride was cancelled.");
      return;
    }

    if (status === "completed") {
      window.location.href = "/user/dashboard?completed=1";
      return;
    }

    if (isDriverMatched(status)) {
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
    if (ride.driver_location) {
      updateDriverOnMap(ride.driver_location);
    }
    updateCancelButtonVisibility();
  }

  function pollCurrentRide() {
    if (!window.UserApi) return;
    UserApi.request("/user/api/rides/current")
      .then(function (data) {
        if (data && data.ride) updateRideUi(data.ride);
      })
      .catch(function () {});
  }

  function startFindingPoll() {
    stopFindingPoll();
    pollCurrentRide();
    pollTimer = window.setInterval(pollCurrentRide, 2000);
  }

  function handleSocketMessage(message) {
    if (!message || typeof message !== "object") return;
    var type = message.type || message.event || "";

    if (type === "connection.ready" && config.rideId && socket && socket.readyState === 1) {
      socket.send(JSON.stringify(window.RideRealtimeEvents.subscribeMessage(config.rideId)));
      return;
    }

    if (type === "chat.message.new") {
      var chatPayload = message.payload || message.data || {};
      if (appendChatMessage) appendChatMessage(chatPayload);
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
    window.location.href =
      "/user/dashboard?cancelled=1&message=" + encodeURIComponent(message || "Ride cancelled.");
  }

  function cancelRideRequest() {
    var rideId = config.rideId;
    if (!rideId) {
      window.alert("Ride request is still being created. Please try again.");
      return;
    }
    if (!window.confirm("Cancel this ride request? No fee will be charged.")) return;

    UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/cancel", {})
      .then(function (result) {
        redirectAfterCancel(formatCancelRedirectMessage(result));
      })
      .catch(function (err) {
        window.alert(err.message || "Could not cancel ride request.");
      });
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
      var tier = tierForStatus(currentRideStatus);
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
      var tier = tierForStatus(currentRideStatus);
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

      if (confirmBtn) {
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
        })
        .finally(function () {
          if (confirmBtn) {
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

    var params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") {
      sessionStorage.removeItem(STORAGE_KEY);
      if (window.history.replaceState) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    if (!config.showFinding || sessionStorage.getItem(STORAGE_KEY) === "1" || isDriverMatched(currentRideStatus)) {
      showActiveTracking();
    } else {
      startFindingPoll();
    }

    var cancelBtn = document.getElementById("tracking-cancel-request");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        if (["requested", "searching"].indexOf(currentRideStatus) >= 0) {
          cancelRideRequest();
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
  }

  function initTrackingActions() {
    var rideId = config.rideId;
    if (!rideId) return;

    var startBtn = document.getElementById("tracking-start-trip");
    if (startBtn) {
      startBtn.addEventListener("click", function () {
        startBtn.disabled = true;
        UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/start", {})
          .then(function (ride) {
            updateRideUi(ride);
            startBtn.textContent = "Trip started";
          })
          .catch(function (err) {
            alert(err.message || "Could not start trip.");
            startBtn.disabled = false;
          });
      });
    }

    var callBtn = document.getElementById("tracking-call-driver");
    if (callBtn) {
      callBtn.addEventListener("click", function () {
        UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/call", { target: "driver" })
          .then(function (data) {
            if (data.masked_phone) {
              window.location.href = "tel:" + data.masked_phone;
              return;
            }
            alert("Call request sent. Your phone will ring shortly.");
          })
          .catch(function (err) {
            alert(err.message || "Call request failed.");
          });
      });
    }

    var sosBtn = document.getElementById("tracking-sos-btn");
    if (sosBtn) {
      sosBtn.addEventListener("click", function () {
        if (!window.confirm("Send SOS alert to JosRide safety team?")) return;
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
      UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/sos", payload)
        .then(function () {
          alert("SOS alert sent. Help is on the way.");
        })
        .catch(function (err) {
          alert(err.message || "SOS failed.");
        });
    }

    var chatBtn = document.getElementById("tracking-chat-btn");
    var chatPanel = document.getElementById("tracking-chat-panel");
    var chatList = document.getElementById("tracking-chat-list");
    var chatForm = document.getElementById("tracking-chat-form");
    var chatInput = document.getElementById("tracking-chat-input");
    var chatSendBtn = document.getElementById("tracking-chat-send");

    loadChatMessages = function () {
      if (!chatList) return;
      UserApi.request("/user/api/rides/" + encodeURIComponent(rideId) + "/messages")
        .then(function (data) {
          if (window.RideChat) {
            window.RideChat.renderMessages(chatList, (data && data.messages) || [], "customer");
          }
        })
        .catch(function () {});
    };

    appendChatMessage = function (msg) {
      if (window.RideChat && chatList) {
        window.RideChat.appendMessage(chatList, msg, "customer");
      }
    };

    if (chatBtn && chatPanel) {
      chatBtn.addEventListener("click", function () {
        chatPanel.hidden = !chatPanel.hidden;
        if (!chatPanel.hidden) loadChatMessages();
      });
    }

    function sendChatMessage() {
      var text = chatInput ? chatInput.value.trim() : "";
      if (!text) return;
      if (chatSendBtn) chatSendBtn.disabled = true;
      UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/messages", {
        message: text,
      })
        .then(function (msg) {
          if (chatInput) chatInput.value = "";
          appendChatMessage(msg);
        })
        .catch(function (err) {
          alert(err.message || "Could not send message.");
        })
        .finally(function () {
          if (chatSendBtn) chatSendBtn.disabled = false;
        });
    }

    if (chatForm) {
      chatForm.addEventListener("submit", function (event) {
        event.preventDefault();
        sendChatMessage();
      });
    }
    if (chatSendBtn) {
      chatSendBtn.addEventListener("click", function (event) {
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

  function boot() {
    if (!window.UserApi) return;
    initFindingDriver();
    initTrackingActions();
    initShareRide();
  }

  function waitForUserApi(attempt) {
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
