(function (global) {
  "use strict";

  var cached = null;
  var pending = null;
  var STORAGE_KEY = "jcdriver_location";

  function readStorage() {
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

  function writeStorage(data) {
    if (!data || data.lat == null || data.lng == null) return;
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy,
          source: data.source || "gps",
        })
      );
    } catch (err) {
      /* ignore quota / private mode */
    }
  }

  function readServerSeed() {
    var el = document.getElementById("driver-stored-location");
    if (!el) return null;
    try {
      var data = JSON.parse(el.textContent);
      if (data && data.lat != null && data.lng != null) return data;
    } catch (err) {
      return null;
    }
    return null;
  }

  function hydrateStoredLocation() {
    if (cached && cached.lat != null) return cached;
    var stored = readStorage() || readServerSeed();
    if (!stored) return null;
    cached = {
      lat: stored.lat,
      lng: stored.lng,
      accuracy: stored.accuracy,
      source: stored.source || "session",
    };
    return cached;
  }

  function applyLocation(coords) {
    if (!coords || coords.lat == null || coords.lng == null) return;
    cached = {
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy,
      source: coords.source || "gps",
    };
    writeStorage(cached);

    if (global.DriverApi) {
      global.DriverApi.post(global.DriverApi.base + "/location", {
        lat: cached.lat,
        lng: cached.lng,
        accuracy: cached.accuracy,
      }).catch(function () {});
    }

    var listeners = global.DriverLocationListeners || [];
    listeners.forEach(function (fn) {
      fn(cached);
    });
  }

  function requestPosition(options) {
    var opts = options || {};
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported on this device."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (position) {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            source: "gps",
          });
        },
        function (err) {
          var message = "Unable to get your location.";
          if (err.code === 1) {
            message = "Location permission denied. Allow GPS to go online.";
          } else if (err.code === 3) {
            message = "Location request timed out. Try again.";
          }
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: opts.timeout || 15000,
          maximumAge: opts.maximumAge != null ? opts.maximumAge : 120000,
        }
      );
    });
  }

  function detectAndApply(options) {
    var opts = options || {};
    if (!opts.forceFresh) {
      var stored = hydrateStoredLocation();
      if (stored) {
        return Promise.resolve(stored);
      }
    }
    if (!opts.forceFresh && cached && cached.lat != null) {
      return Promise.resolve(cached);
    }
    if (pending && !opts.forceFresh) return pending;

    pending = requestPosition({
      timeout: opts.timeout || 15000,
      maximumAge: opts.forceFresh ? 0 : 120000,
    })
      .then(function (coords) {
        applyLocation(coords);
        pending = null;
        return cached;
      })
      .catch(function (err) {
        pending = null;
        throw err;
      });

    return pending;
  }

  global.DriverGeolocation = {
    detectAndApply: detectAndApply,
    requestPosition: requestPosition,
    getCached: function () {
      return cached || hydrateStoredLocation();
    },
    onUpdate: function (fn) {
      global.DriverLocationListeners = global.DriverLocationListeners || [];
      global.DriverLocationListeners.push(fn);
      var current = cached || hydrateStoredLocation();
      if (current) fn(current);
    },
  };

  hydrateStoredLocation();

  if (document.body && document.body.getAttribute("data-auto-geolocate") === "true") {
    var schedule = window.requestIdleCallback || function (fn) {
      return window.setTimeout(fn, 250);
    };
    schedule(function () {
      if (cached && cached.lat != null) return;
      detectAndApply({ forceFresh: false, timeout: 12000 }).catch(function () {});
    });
  }
})(window);
