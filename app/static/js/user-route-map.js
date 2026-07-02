(function () {
  "use strict";

  var mapGreen = "#0a4f2a";
  var routeMapEl = document.getElementById("rider-route-map");
  var routeMapDataEl = document.getElementById("rider-route-map-data");
  var routeMapInstance = null;
  var routeMapTileLayer = null;

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
      badge_label: opts.badge_label || "Pickup — Drop-off",
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

  function tileLayerUrl() {
    var root = document.documentElement;
    var manualTheme = root.getAttribute("data-user-theme");
    var isDark =
      manualTheme === "dark" ||
      (!manualTheme &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    return isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }

  function mapHostVisible() {
    if (!routeMapEl) return false;
    if (routeMapEl.closest("[hidden]")) return false;
    return routeMapEl.offsetWidth > 0 && routeMapEl.offsetHeight > 0;
  }

  function bindThemeListener() {
    var onChange = function () {
      if (!routeMapInstance || !routeMapTileLayer) return;
      routeMapTileLayer.setUrl(tileLayerUrl());
    };

    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) {
        mq.addEventListener("change", onChange);
      } else if (mq.addListener) {
        mq.addListener(onChange);
      }
    }

    if (window.MutationObserver) {
      var observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-user-theme"],
      });
    }
  }

  function refreshMapSize() {
    if (!routeMapEl) return;
    if (!routeMapInstance) {
      if (mapHostVisible()) {
        initRouteMap();
      }
      return;
    }
    routeMapInstance.invalidateSize();
    var config = readMapConfig();
    if (config) {
      renderRouteMap(config);
    }
  }

  function createDivIcon(html, size, anchor) {
    return L.divIcon({
      className: "",
      html: html,
      iconSize: size,
      iconAnchor: anchor,
    });
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
    if (!routeMapInstance || typeof L === "undefined" || !config) return;

    routeMapInstance.eachLayer(function (layer) {
      if (layer !== routeMapTileLayer) {
        routeMapInstance.removeLayer(layer);
      }
    });

    var pickup = config.pickup;
    var dropoff = config.dropoff;
    var route = config.route || [];
    var boundsPoints = [];

    if (route.length >= 2) {
      L.polyline(route, {
        color: mapGreen,
        weight: 5,
        opacity: 0.9,
        dashArray: "12, 10",
        lineCap: "round",
      }).addTo(routeMapInstance);
      boundsPoints = boundsPoints.concat(route);
    }

    if (pickup) {
      L.marker([pickup.lat, pickup.lng], {
        icon: createDivIcon(
          '<div class="map-marker-start"></div>',
          [14, 14],
          [7, 7]
        ),
        zIndexOffset: 100,
      })
        .bindTooltip(config.pickup_label || "Pickup", {
          direction: "top",
          offset: [0, -8],
        })
        .addTo(routeMapInstance);
      boundsPoints.push([pickup.lat, pickup.lng]);
    }

    if (config.vehicle_position) {
      var pos = config.vehicle_position;
      L.marker([pos.lat, pos.lng], {
        icon: createDivIcon(
          vehicleIcon(config.vehicle_type || "car"),
          [36, 36],
          [18, 18]
        ),
        zIndexOffset: 200,
      }).addTo(routeMapInstance);
      boundsPoints.push([pos.lat, pos.lng]);
    }

    if (dropoff) {
      L.marker([dropoff.lat, dropoff.lng], {
        icon: createDivIcon(
          '<div class="map-marker-end"></div>',
          [16, 16],
          [8, 8]
        ),
        zIndexOffset: 100,
      })
        .bindTooltip(config.dropoff_label || "Drop-off", {
          direction: "top",
          offset: [0, -8],
        })
        .addTo(routeMapInstance);
      boundsPoints.push([dropoff.lat, dropoff.lng]);
    }

    if (boundsPoints.length) {
      routeMapInstance.fitBounds(boundsPoints, {
        padding: [48, 48],
        maxZoom: config.map_zoom || 13,
      });
    }

    var badge = document.getElementById("rider-route-map-badge");
    if (badge && config.badge_label) {
      badge.textContent = config.badge_label;
    }
  }

  function initRouteMap() {
    if (!routeMapEl || typeof L === "undefined") return;
    if (!mapHostVisible()) return;

    var config = readMapConfig();
    if (!config) return;

    if (routeMapInstance) {
      routeMapInstance.remove();
      routeMapInstance = null;
    }

    var center = config.pickup || { lat: 6.4474, lng: 3.5569 };
    var zoom = config.map_zoom || 13;

    routeMapInstance = L.map(routeMapEl, {
      zoomControl: false,
      attributionControl: false,
    }).setView([center.lat, center.lng], zoom);

    routeMapTileLayer = L.tileLayer(tileLayerUrl(), {
      maxZoom: 19,
    }).addTo(routeMapInstance);

    bindThemeListener();
    L.control.zoom({ position: "topright" }).addTo(routeMapInstance);
    renderRouteMap(config);

    window.setTimeout(function () {
      if (routeMapInstance) {
        routeMapInstance.invalidateSize();
      }
    }, 120);
  }

  window.RiderRouteMap = {
    buildConfig: buildRouteConfig,
    init: initRouteMap,
    refresh: refreshMapSize,
    update: function (config) {
      if (!routeMapDataEl) return;
      routeMapDataEl.textContent = JSON.stringify(config);
      if (!routeMapInstance) {
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
