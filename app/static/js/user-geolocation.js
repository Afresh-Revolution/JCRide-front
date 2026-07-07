(function (global) {
  "use strict";

  var cached = null;
  var pending = null;
  var detecting = false;

  function isSkippableName(name) {
    if (!name || typeof name !== "string") return true;
    var trimmed = name.trim();
    if (trimmed.length < 2) return true;
    if (/^(Africa|Europe|Asia|Antarctica|Australia|Oceania|Americas)$/i.test(trimmed)) return true;
    if (/^[A-Za-z]+\/[A-Za-z_+-]+$/.test(trimmed)) return true;
    return false;
  }

  function formatLabel(data) {
    if (!data) return "Current location";
    var parts = [];
    var info = (data.localityInfo && data.localityInfo.informative) || [];

    info.forEach(function (item) {
      if (!item.name || isSkippableName(item.name)) return;
      var desc = (item.description || "").toLowerCase();
      if (desc.indexOf("continent") !== -1 || desc.indexOf("timezone") !== -1) return;
      if (parts.indexOf(item.name) === -1) parts.push(item.name);
    });

    var admin = (data.localityInfo && data.localityInfo.administrative) || [];
    for (var i = admin.length - 1; i >= 0 && parts.length < 4; i--) {
      var name = admin[i].name;
      if (name && !isSkippableName(name) && parts.indexOf(name) === -1) {
        parts.push(name);
      }
    }

    if (data.locality && !isSkippableName(data.locality) && parts.indexOf(data.locality) === -1) {
      parts.unshift(data.locality);
    }
    if (
      data.city &&
      data.city !== data.locality &&
      !isSkippableName(data.city) &&
      parts.indexOf(data.city) === -1
    ) {
      parts.splice(Math.min(1, parts.length), 0, data.city);
    }
    if (data.principalSubdivision && parts.indexOf(data.principalSubdivision) === -1) {
      parts.push(data.principalSubdivision);
    }
    if (!parts.length && data.countryName) parts.push(data.countryName);

    return parts.slice(0, 3).join(", ") || "Current location";
  }

  function formatPhotonLabel(feature) {
    var p = feature.properties || {};
    var parts = [];
    if (p.street) {
      var street = p.street;
      if (p.housenumber) street = p.housenumber + " " + street;
      parts.push(street);
    } else if (p.name) {
      parts.push(p.name);
    }
    if (p.district && parts.indexOf(p.district) === -1) parts.push(p.district);
    if (p.city && parts.indexOf(p.city) === -1) parts.push(p.city);
    if (p.state && parts.indexOf(p.state) === -1) parts.push(p.state);
    if (p.country && parts.indexOf(p.country) === -1 && parts.length < 3) parts.push(p.country);
    return parts.slice(0, 3).join(", ") || null;
  }

  function reverseGeocodePhoton(lat, lng) {
    var url =
      "https://photon.komoot.io/reverse?lon=" +
      encodeURIComponent(lng) +
      "&lat=" +
      encodeURIComponent(lat) +
      "&lang=en";
    return fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var features = data.features || [];
        for (var i = 0; i < features.length; i++) {
          var label = formatPhotonLabel(features[i]);
          if (label) return label;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function reverseGeocodeBigDataCloud(lat, lng) {
    var url =
      "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" +
      encodeURIComponent(lat) +
      "&longitude=" +
      encodeURIComponent(lng) +
      "&localityLanguage=en";
    return fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        return formatLabel(data);
      })
      .catch(function () {
        return null;
      });
  }

  function reverseGeocode(lat, lng) {
    return reverseGeocodePhoton(lat, lng).then(function (photonLabel) {
      if (photonLabel) return photonLabel;
      return reverseGeocodeBigDataCloud(lat, lng);
    });
  }

  function requestPrecisePosition(options) {
    var opts = options || {};
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"));
        return;
      }

      var best = null;
      var settled = false;

      function finish(position) {
        if (settled) return;
        settled = true;
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        resolve(position);
      }

      function fail(error) {
        if (settled) return;
        settled = true;
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        if (best) resolve(best);
        else reject(error);
      }

      var watchId = navigator.geolocation.watchPosition(
        function (position) {
          if (!best || position.coords.accuracy < best.coords.accuracy) {
            best = position;
          }
          if (position.coords.accuracy <= 75) {
            finish(position);
          }
        },
        fail,
        {
          enableHighAccuracy: true,
          timeout: opts.timeout || 20000,
          maximumAge: opts.maximumAge != null ? opts.maximumAge : 0,
        }
      );

      window.setTimeout(function () {
        if (best) finish(best);
        else fail(new Error("Location request timed out"));
      }, opts.timeout || 20000);
    });
  }

  function requestPosition(options) {
    var opts = options || {};
    if (opts.precise !== false) {
      return requestPrecisePosition(opts);
    }
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: opts.timeout || 15000,
        maximumAge: opts.maximumAge != null ? opts.maximumAge : 0,
      });
    });
  }

  function setDetectingLabel() {
    detecting = true;
    var kpi = document.getElementById("rider-location-label");
    if (kpi) kpi.textContent = "Detecting location…";
    var meta = document.getElementById("rider-profile-meta");
    if (meta) {
      var badge = meta.getAttribute("data-badge-suffix") || "";
      meta.textContent = badge ? "Detecting location… · " + badge : "Detecting location…";
    }
  }

  function applyLocationLabel(label, coords) {
    detecting = false;
    cached = {
      label: label,
      lat: coords && coords.lat,
      lng: coords && coords.lng,
      accuracy: coords && coords.accuracy,
    };

    var kpi = document.getElementById("rider-location-label");
    if (kpi) kpi.textContent = label;

    var subtitle = document.getElementById("rider-live-area-subtitle");
    if (subtitle) subtitle.textContent = "Your area · " + label;

    var meta = document.getElementById("rider-profile-meta");
    if (meta) {
      var badge = meta.getAttribute("data-badge-suffix") || "";
      meta.textContent = badge ? label + " · " + badge : label;
    }

    var mapEl = document.getElementById("rider-area-map");
    if (mapEl) mapEl.setAttribute("aria-label", "Live map of drivers near " + label);

    var listeners = global.RiderLocationListeners || [];
    listeners.forEach(function (fn) {
      fn(cached);
    });

    if (global.UserApi) {
      global.UserApi.post("/user/api/location", {
        label: label,
        lat: coords && coords.lat,
        lng: coords && coords.lng,
        accuracy: coords && coords.accuracy,
      }).catch(function () {});
    }
  }

  function detectAndApply(options) {
    var opts = options || {};
    if (!opts.forceFresh && cached && cached.lat != null) {
      return Promise.resolve(cached);
    }
    if (pending && !opts.forceFresh) return pending;

    setDetectingLabel();

    var positionOpts = {
      maximumAge: opts.forceFresh ? 0 : 60000,
      timeout: opts.timeout || 20000,
      precise: true,
    };

    pending = requestPosition(positionOpts)
      .then(function (position) {
        var lat = position.coords.latitude;
        var lng = position.coords.longitude;
        var accuracy = position.coords.accuracy;
        return reverseGeocode(lat, lng).then(function (label) {
          var coords = { lat: lat, lng: lng, accuracy: accuracy };
          var result = {
            label: label || "Current location",
            lat: lat,
            lng: lng,
            accuracy: accuracy,
            source: "gps",
          };
          applyLocationLabel(result.label, coords);
          pending = null;
          return result;
        });
      })
      .catch(function (err) {
        pending = null;
        detecting = false;
        var kpi = document.getElementById("rider-location-label");
        if (kpi && kpi.textContent === "Detecting location…") {
          kpi.textContent = "Location unavailable";
        }
        throw err;
      });

    return pending;
  }

  global.RiderGeolocation = {
    detectAndApply: detectAndApply,
    requestPosition: requestPosition,
    reverseGeocode: reverseGeocode,
    applyLocationLabel: applyLocationLabel,
    getCached: function () {
      return cached;
    },
    onUpdate: function (fn) {
      global.RiderLocationListeners = global.RiderLocationListeners || [];
      global.RiderLocationListeners.push(fn);
      if (cached) fn(cached);
    },
  };

  if (document.body && document.body.getAttribute("data-auto-geolocate") === "true") {
    var schedule = window.requestIdleCallback || function (fn) { return window.setTimeout(fn, 250); };
    schedule(function () {
      detectAndApply({ forceFresh: false, timeout: 12000 }).catch(function () {});
    });
  }
})(window);
