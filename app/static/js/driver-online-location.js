(function (global) {
  "use strict";

  var SYNC_MS = 15000;
  var watchId = null;
  var intervalId = null;
  var lastSyncAt = 0;
  var lastCoords = null;
  var started = false;

  function isDriverOnline() {
    if (document.body && document.body.classList.contains("driver-portal")) {
      var app = document.querySelector(".admin-app.driver-open, .admin-app.driver-on-active-trip");
      if (app) return true;
    }
    var checkbox = document.querySelector("#onlineForm input[type='checkbox']");
    if (checkbox) return Boolean(checkbox.checked);
    var banner = document.getElementById("driver-status-banner");
    if (banner && banner.classList.contains("status-banner--online")) return true;
    if (banner && banner.classList.contains("status-banner--on-trip")) return true;
    return false;
  }

  function publish(coords, force) {
    if (!coords || coords.lat == null || coords.lng == null) return;
    var now = Date.now();
    if (!force && now - lastSyncAt < SYNC_MS) return;
    lastSyncAt = now;
    lastCoords = coords;

    if (global.DriverRealtime && typeof global.DriverRealtime.sendLocationUpdate === "function") {
      global.DriverRealtime.sendLocationUpdate(coords);
    }

    if (global.DriverApi && global.DriverApi.base) {
      global.DriverApi.post(global.DriverApi.base + "/location", {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        heading: coords.heading,
        speed: coords.speed,
      }).catch(function () {});
    }
  }

  function onPosition(position) {
    if (!isDriverOnline()) {
      stop();
      return;
    }
    publish({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
    });
  }

  function start() {
    if (started || !navigator.geolocation) return;
    if (!isDriverOnline()) return;
    started = true;

    if (global.DriverGeolocation && typeof global.DriverGeolocation.detectAndApply === "function") {
      global.DriverGeolocation.detectAndApply({ forceFresh: true, timeout: 12000 })
        .then(function (coords) {
          publish(coords, true);
        })
        .catch(function () {});
    }

    watchId = navigator.geolocation.watchPosition(
      onPosition,
      function () {},
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      }
    );

    // Keep publishing even if the watch is throttled by the browser.
    intervalId = global.setInterval(function () {
      if (!started || !isDriverOnline()) return;
      if (lastCoords) {
        publish(lastCoords, true);
        return;
      }
      if (global.DriverGeolocation && typeof global.DriverGeolocation.requestPosition === "function") {
        global.DriverGeolocation.requestPosition({ forceFresh: true, timeout: 10000 })
          .then(function (coords) {
            publish(coords, true);
          })
          .catch(function () {});
      }
    }, SYNC_MS);
  }

  function stop() {
    started = false;
    if (watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (intervalId != null) {
      global.clearInterval(intervalId);
      intervalId = null;
    }
  }

  function boot() {
    if (isDriverOnline()) start();

    // Re-check after soft navigations / late DOM updates.
    global.setTimeout(function () {
      if (isDriverOnline()) start();
      else stop();
    }, 1500);
  }

  global.DriverOnlineLocation = {
    start: start,
    stop: stop,
    isOnline: isDriverOnline,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Best-effort last ping when leaving the tab (browsers cannot track after close).
  global.addEventListener("pagehide", function () {
    if (isDriverOnline() && lastCoords) {
      publish(lastCoords, true);
    }
  });
})(window);
