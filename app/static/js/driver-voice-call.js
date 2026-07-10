(function () {
  "use strict";

  function readConfig() {
    var el = document.getElementById("driver-active-trip-config");
    if (!el) return {};
    try {
      return JSON.parse(el.textContent || "{}");
    } catch (err) {
      return {};
    }
  }

  function initDriverVoiceCall(attempt) {
    attempt = attempt || 0;
    if (!window.RideVoiceCall || !window.DriverApi) {
      if (attempt < 100) {
        window.setTimeout(function () {
          initDriverVoiceCall(attempt + 1);
        }, 50);
      }
      return;
    }

    var config = readConfig();
    var rideId = config.rideId;
    if (!rideId) return;

    var peerEl = document.querySelector(".active-trip-rider__name");
    var peerLabel = peerEl ? peerEl.textContent.trim() : "Rider";
    var callButton = document.getElementById("driver-trip-call-btn");

    RideVoiceCall.init({
      rideId: rideId,
      rideStatus: config.rideStatus || "",
      userId: config.userId || "",
      authToken: config.token || "",
      role: "driver",
      peerLabel: peerLabel,
      apiBase: DriverApi.base + "/rides",
      apiPost: DriverApi.post,
      apiGet: DriverApi.request,
      callButton: callButton,
      onError: function (message) {
        if (window.DriverConfirm) {
          DriverConfirm.alert(message, { title: "Voice call" });
          return;
        }
        window.alert(message);
      },
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initDriverVoiceCall(0);
    });
  } else {
    initDriverVoiceCall(0);
  }
})();
