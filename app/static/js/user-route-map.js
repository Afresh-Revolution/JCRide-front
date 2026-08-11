(function () {
  "use strict";

  var mapGreen = "#0a4f2a";
  var routeMapEl = document.getElementById("rider-route-map");
  var routeMapDataEl = document.getElementById("rider-route-map-data");
  var routeSurface = null;
  var initPromise = null;

  var LOCATION_COORDS = {
    "lekki, lagos": { lat: 6.4474, lng: 3.5569 },
    "victoria island, lagos": { lat: 6.4281, lng: 3.4219 },
    "ikeja, lagos": { lat: 6.6018, lng: 3.3515 },
    "yaba, lagos": { lat: 6.5158, lng: 3.3712 },
    "surulere, lagos": { lat: 6.4969, lng: 3.353 },
    lagos: { lat: 6.5244, lng: 3.3792 },
    abuja: { lat: 9.0579, lng: 7.4951 },
    "port harcourt": { lat: 4.8156, lng: 7.0498 },
    ibadan: { lat: 7.3775, lng: 3.947 },
  };

  var LOCATION_ALIASES = [
    ["lekki", "lekki, lagos"],
    ["victoria island", "victoria island, lagos"],
    ["vi", "victoria island, lagos"],
    ["yaba", "yaba, lagos"],
    ["ikeja", "ikeja, lagos"],
    ["surulere", "surulere, lagos"],
    ["lagos", "lagos"],
    ["abuja", "abuja"],
    ["port harcourt", "port harcourt"],
    ["ibadan", "ibadan"],
  ];

  function resolveCoords(label) {
    var key = (label || "").trim().toLowerCase();
    if (LOCATION_COORDS[key]) {
      return { lat: LOCATION_COORDS[key].lat, lng: LOCATION_COORDS[key].lng };
    }

    var parts = key.split(",");
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (LOCATION_COORDS[part]) {
        return { lat: LOCATION_COORDS[part].lat, lng: LOCATION_COORDS[part].lng };
      }
    }

    for (var j = 0; j < LOCATION_ALIASES.length; j++) {
      if (key.indexOf(LOCATION_ALIASES[j][0]) !== -1) {
        var coordKey = LOCATION_ALIASES[j][1];
        return {
          lat: LOCATION_COORDS[coordKey].lat,
          lng: LOCATION_COORDS[coordKey].lng,
        };
      }
    }

    return { lat: 6.4474, lng: 3.5569 };
  }

  function buildRouteConfig(pickupLabel, dropoffLabel, options) {
    var opts = options || {};
    var pickup = resolveCoords(pickupLabel);
    var dropoff = resolveCoords(dropoffLabel);
    var midRoute = {
      lat: (pickup.lat + dropoff.lat) / 2 + 0.001,
      lng: (pickup.lng + dropoff.lng) / 2 + 0.0015,
    };

    return {
      pickup_label: pickupLabel,
      dropoff_label: dropoffLabel,
      badge_label: opts.badge_label || "Pickup - Drop-off",
      pickup: pickup,
      dropoff: dropoff,
      vehicle_position: {
        lat: (pickup.lat + dropoff.lat) / 2 + 0.002,
        lng: (pickup.lng + dropoff.lng) / 2 - 0.001,
      },
      vehicle_type: opts.vehicle_type || "car",
      map_zoom: 13,
      route: [
        [pickup.lat, pickup.lng],
        [midRoute.lat, midRoute.lng],
        [dropoff.lat, dropoff.lng],
      ],
    };
  }

  function readMapConfig() {
    if (!routeMapDataEl) return null;
    try {
      return JSON.parse(routeMapDataEl.textContent);
    } catch (err) {
      return null;
    }
  }

  function mapHostVisible() {
    if (!routeMapEl) return false;
    if (routeMapEl.closest("[hidden]")) return false;
    return routeMapEl.offsetWidth > 0 && routeMapEl.offsetHeight > 0;
  }

  function vehicleIcon(type) {
    if (type === "bike") {
      return (
        '<div class="map-marker-vehicle">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">' +
        '<circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/>' +
        '<path d="M15 6a1 1 0 0 0-1-1H9l-2 4h11l-2-5Z"/><path d="M8 17.5h8"/>' +
        "</svg></div>"
      );
    }

    return (
      '<div class="map-marker-vehicle">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">' +
      '<path d="M7 17h10M5 11l1.5-4h11L19 11"/>' +
      '<circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>' +
      "</svg></div>"
    );
  }

  function renderRouteMap(config) {
    if (!routeSurface || !config) return;

    routeSurface.clearOverlays();

    var pickup = config.pickup;
    var dropoff = config.dropoff;
    var route = config.route || [];
    var boundsPoints = [];

    if (route.length >= 2) {
      routeSurface.addPolyline(route, {
        color: "#34d399",
        weight: 8,
        opacity: 0.18,
      });
      routeSurface.addPolyline(route, {
        color: mapGreen,
        weight: 5,
        opacity: 0.98,
        dashArray: config.use_fastest_route ? null : "12, 10",
      });
      boundsPoints = boundsPoints.concat(route);
    }

    (config.drivers || []).forEach(function (driver) {
      routeSurface.addCircleMarker(driver.lat, driver.lng, {
        radius: 7,
        color: mapGreen,
        fillColor: "#0d6b38",
        title: "Driver nearby",
      });
      boundsPoints.push([driver.lat, driver.lng]);
    });

    (config.stops || []).forEach(function (stop, index) {
      routeSurface.addDomMarker(
        stop.lat,
        stop.lng,
        '<div class="map-marker-stop">' + (index + 1) + "</div>",
        {
          size: [18, 18],
          anchor: [9, 9],
          title: stop.label || "Stop " + (index + 1),
          zIndex: 90,
        }
      );
      boundsPoints.push([stop.lat, stop.lng]);
    });

    if (pickup) {
      routeSurface.addDomMarker(
        pickup.lat,
        pickup.lng,
        '<div class="map-marker-start"></div>',
        {
          size: [14, 14],
          anchor: [7, 7],
          title: config.pickup_label || "Pickup",
          zIndex: 100,
        }
      );
      boundsPoints.push([pickup.lat, pickup.lng]);
    }

    if (config.vehicle_position && !(config.drivers && config.drivers.length)) {
      var pos = config.vehicle_position;
      routeSurface.addDomMarker(
        pos.lat,
        pos.lng,
        vehicleIcon(config.vehicle_type || "car"),
        {
          size: [36, 36],
          anchor: [18, 18],
          zIndex: 200,
        }
      );
      boundsPoints.push([pos.lat, pos.lng]);
    }

    if (dropoff) {
      routeSurface.addDomMarker(
        dropoff.lat,
        dropoff.lng,
        '<div class="map-marker-end"></div>',
        {
          size: [16, 16],
          anchor: [8, 8],
          title: config.dropoff_label || "Drop-off",
          zIndex: 100,
        }
      );
      boundsPoints.push([dropoff.lat, dropoff.lng]);
    }

    if (boundsPoints.length) {
      routeSurface.fitBounds(boundsPoints, {
        padding: 48,
        maxZoom: config.map_zoom || 13,
      });
    }

    var badge = document.getElementById("rider-route-map-badge");
    if (badge && config.badge_label) {
      badge.textContent = config.badge_label;
    }
  }

  function ensureSurface() {
    if (routeSurface) {
      return Promise.resolve(routeSurface);
    }
    if (initPromise) {
      return initPromise;
    }
    if (!routeMapEl || !window.JosRideMaps) {
      return Promise.reject(new Error("Map bootstrap missing"));
    }

    var config = readMapConfig();
    if (!config) {
      return Promise.reject(new Error("Map config missing"));
    }

    var center = config.map_center || config.pickup || { lat: 6.5244, lng: 3.3792 };
    var zoom = config.map_zoom || 13;

    initPromise = window.JosRideMaps.createSurface(routeMapEl, {
      center: center,
      zoom: zoom,
      zoomControl: true,
    }).then(function (surface) {
      routeSurface = surface;
      initPromise = null;
      return surface;
    });

    return initPromise;
  }

  function initRouteMap() {
    if (!routeMapEl) return;
    if (!mapHostVisible()) return;

    var config = readMapConfig();
    if (!config) return;

    ensureSurface()
      .then(function () {
        renderRouteMap(config);
        window.setTimeout(function () {
          if (routeSurface) routeSurface.invalidateSize();
        }, 120);
      })
      .catch(function () {
        // Leaflet may still be loading via defer; retry shortly.
        window.setTimeout(function () {
          if (!routeSurface && mapHostVisible()) {
            initRouteMap();
          }
        }, 200);
      });
  }

  function refreshMapSize() {
    if (!routeMapEl) return;
    if (!routeSurface) {
      if (mapHostVisible()) {
        initRouteMap();
      }
      return;
    }
    routeSurface.invalidateSize();
    var config = readMapConfig();
    if (config) {
      renderRouteMap(config);
    }
  }

  window.RiderRouteMap = {
    buildConfig: buildRouteConfig,
    init: initRouteMap,
    refresh: refreshMapSize,
    update: function (config) {
      if (!routeMapDataEl) return;
      routeMapDataEl.textContent = JSON.stringify(config);
      if (!routeSurface) {
        initRouteMap();
        return;
      }
      renderRouteMap(config);
    },
  };

  function bootRouteMap() {
    if (!routeMapEl) return;
    if (mapHostVisible()) {
      initRouteMap();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootRouteMap);
  } else {
    bootRouteMap();
  }
})();
