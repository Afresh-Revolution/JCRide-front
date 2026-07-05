(function () {
  "use strict";

  if (!window.UserApi) return;

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

  var matchTimer = null;
  var pollTimer = null;
  var socket = null;

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

  function showActiveTracking() {
    var finding = document.getElementById("tracking-finding");
    var active = document.getElementById("tracking-active");
    if (!finding || !active) return;

    if (matchTimer) {
      window.clearTimeout(matchTimer);
      matchTimer = null;
    }

    finding.classList.add("is-hidden");
    finding.setAttribute("hidden", "");
    active.classList.remove("is-hidden");
    active.removeAttribute("hidden");
    sessionStorage.setItem(STORAGE_KEY, "1");

    refreshTrackingMap();
    window.setTimeout(refreshTrackingMap, 180);
    window.setTimeout(refreshTrackingMap, 480);
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

  function updateRideUi(ride) {
    if (!ride) return;
    var status = ride.status || "";
    var driverReady = ["driver_assigned", "driver_arrived", "in_progress", "completed"].indexOf(status) >= 0;
    if (driverReady) showActiveTracking();

    var stepMap = {
      requested: 1,
      searching: 1,
      driver_assigned: 2,
      driver_arrived: 2,
      in_progress: 3,
      completed: 4,
    };
    setTrackingStep(stepMap[status] || 1);

    var statusEl = document.querySelector(".tracking-driver__status");
    if (statusEl) {
      statusEl.textContent = "• " + (status.replace(/_/g, " ").toUpperCase() || "UPDATING");
    }

    var driver = ride.driver || {};
    if (driver.full_name) {
      var nameEl = document.querySelector(".tracking-driver__profile strong");
      if (nameEl) nameEl.textContent = driver.full_name;
    }
  }

  function pollCurrentRide() {
    UserApi.request("/user/api/rides/current")
      .then(function (data) {
        if (data && data.ride) updateRideUi(data.ride);
      })
      .catch(function () {});
  }

  function connectWebSocket() {
    if (!config.wsUrl || !config.token || !config.rideId || typeof WebSocket === "undefined") return;

    try {
      socket = new WebSocket(config.wsUrl + "?token=" + encodeURIComponent(config.token));
    } catch (err) {
      return;
    }

    socket.addEventListener("open", function () {
      socket.send(JSON.stringify({ type: "ride.subscribe", ride_id: config.rideId }));
    });

    socket.addEventListener("message", function (event) {
      try {
        var payload = JSON.parse(event.data);
        if (payload.event === "ride.snapshot" && payload.data) {
          updateRideUi(payload.data);
        }
        if (payload.event === "driver.location.updated") {
          refreshTrackingMap();
        }
      } catch (err) {
        /* ignore malformed messages */
      }
    });
  }

  function initFindingDriver() {
    var finding = document.getElementById("tracking-finding");
    var active = document.getElementById("tracking-active");
    if (!finding || !active) return;

    var params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") {
      sessionStorage.removeItem(STORAGE_KEY);
      if (window.history.replaceState) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    if (config.showFinding === false || sessionStorage.getItem(STORAGE_KEY) === "1") {
      showActiveTracking();
    } else {
      var delay = Number(finding.getAttribute("data-match-delay") || 3200);
      matchTimer = window.setTimeout(showActiveTracking, delay);
      pollTimer = window.setInterval(pollCurrentRide, 4000);
    }

    var cancelBtn = document.getElementById("tracking-cancel-request");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        if (matchTimer) window.clearTimeout(matchTimer);
        if (pollTimer) window.clearInterval(pollTimer);
        sessionStorage.removeItem(STORAGE_KEY);
        window.location.href = cancelBtn.getAttribute("data-cancel-url") || "/user/live-tracking/cancel";
      });
    }

    connectWebSocket();
    pollCurrentRide();
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
    if (chatBtn && chatPanel) {
      chatBtn.addEventListener("click", function () {
        chatPanel.hidden = !chatPanel.hidden;
        if (!chatPanel.hidden) loadMessages();
      });
    }

    function loadMessages() {
      if (!chatList) return;
      UserApi.request("/user/api/rides/" + encodeURIComponent(rideId) + "/messages")
        .then(function (data) {
          var messages = (data && data.messages) || [];
          chatList.innerHTML = messages
            .map(function (msg) {
              return (
                "<li><strong>" +
                (msg.sender_role || "user") +
                ":</strong> " +
                (msg.message || "") +
                "</li>"
              );
            })
            .join("");
        })
        .catch(function () {});
    }

    if (chatForm) {
      chatForm.addEventListener("submit", function (event) {
        event.preventDefault();
        alert("Live chat send uses the ride WebSocket in the mobile app. Messages are loaded from the API.");
        loadMessages();
      });
    }
  }

  initFindingDriver();
  initTrackingActions();
  initShareRide();

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
})();
