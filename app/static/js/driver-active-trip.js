(function () {
  "use strict";

  var mapEl = document.getElementById("driver-active-trip-map");
  var mapDataEl = document.getElementById("driver-active-trip-map-data");
  var mapGreen = "#0a4f2a";
  var liveMap = null;
  var liveMapTileLayer = null;
  var mapLayers = [];
  var pollTimer = null;

  function readMapData() {
    if (!mapDataEl) return null;
    try {
      return JSON.parse(mapDataEl.textContent);
    } catch (err) {
      return null;
    }
  }

  function tileLayerUrl() {
    var isDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }

  function bindThemeListener() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      if (liveMapTileLayer) liveMapTileLayer.setUrl(tileLayerUrl());
    };
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
    } else if (mq.addListener) {
      mq.addListener(onChange);
    }
  }

  function createMapIcon(html, size, anchor) {
    return L.divIcon({
      className: "",
      html: html,
      iconSize: size,
      iconAnchor: anchor,
    });
  }

  function clearMapLayers() {
    mapLayers.forEach(function (layer) {
      if (liveMap) liveMap.removeLayer(layer);
    });
    mapLayers = [];
  }

  function renderLiveMap(tripData) {
    if (!liveMap || typeof L === "undefined" || !tripData) return;

    clearMapLayers();

    var mapCenter = tripData.map_center || { lat: 6.435, lng: 3.432 };
    var mapZoom = tripData.map_zoom || 14;
    var route = (tripData.route || []).map(function (p) {
      return [p.lat, p.lng];
    });

    liveMap.setView([mapCenter.lat, mapCenter.lng], mapZoom);

    if (route.length >= 2) {
      var polyline = L.polyline(route, {
        color: mapGreen,
        weight: 5,
        opacity: 0.9,
        dashArray: "12, 10",
        lineCap: "round",
      });
      polyline.addTo(liveMap);
      mapLayers.push(polyline);
    }

    if (tripData.start) {
      var startMarker = L.marker([tripData.start.lat, tripData.start.lng], {
        icon: createMapIcon('<div class="map-marker-start"></div>', [14, 14], [7, 7]),
        zIndexOffset: 100,
      });
      startMarker.addTo(liveMap);
      mapLayers.push(startMarker);
    }

    if (tripData.vehicle_position) {
      var carSvg =
        '<div class="map-marker-vehicle">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">' +
        '<path d="M7 17h10M5 11l1.5-4h11L19 11"/>' +
        '<circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>' +
        "</svg></div>";

      var vehicleMarker = L.marker(
        [tripData.vehicle_position.lat, tripData.vehicle_position.lng],
        {
          icon: createMapIcon(carSvg, [36, 36], [18, 18]),
          zIndexOffset: 200,
        }
      );
      vehicleMarker.addTo(liveMap);
      mapLayers.push(vehicleMarker);
    }

    if (tripData.end) {
      var endMarker = L.marker([tripData.end.lat, tripData.end.lng], {
        icon: createMapIcon('<div class="map-marker-end"></div>', [16, 16], [8, 8]),
        zIndexOffset: 100,
      });
      endMarker.addTo(liveMap);
      mapLayers.push(endMarker);
    }

    var boundsPoints = route.slice();
    if (tripData.start) boundsPoints.push([tripData.start.lat, tripData.start.lng]);
    if (tripData.end) boundsPoints.push([tripData.end.lat, tripData.end.lng]);
    if (tripData.vehicle_position) {
      boundsPoints.push([
        tripData.vehicle_position.lat,
        tripData.vehicle_position.lng,
      ]);
    }

    if (boundsPoints.length > 1) {
      liveMap.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [56, 56],
        maxZoom: 15,
      });
    }
  }

  function initMap() {
    if (!mapEl || typeof L === "undefined") return;

    var tripData = readMapData();
    if (!tripData) return;

    if (liveMap) {
      liveMap.remove();
      liveMap = null;
    }

    var center = tripData.map_center || { lat: 6.435, lng: 3.432 };
    var zoom = tripData.map_zoom || 14;

    liveMap = L.map(mapEl, {
      zoomControl: false,
      attributionControl: false,
    }).setView([center.lat, center.lng], zoom);

    liveMapTileLayer = L.tileLayer(tileLayerUrl(), { maxZoom: 19 }).addTo(liveMap);
    bindThemeListener();
    L.control.zoom({ position: "topright" }).addTo(liveMap);

    renderLiveMap(tripData);

    window.setTimeout(function () {
      if (liveMap) liveMap.invalidateSize();
    }, 150);
  }

  function updateMetrics(metrics) {
    if (!metrics) return;
    var distanceEl = document.querySelector('[data-metric="distance"]');
    var earningsEl = document.querySelector('[data-metric="earnings"]');
    var timeEl = document.querySelector('[data-metric="time"]');
    var speedEl = document.querySelector('[data-metric="speed"]');

    if (distanceEl && metrics.distance_left_km != null) {
      distanceEl.textContent = metrics.distance_left_km + " km";
    }
    if (earningsEl && metrics.earnings_live) {
      earningsEl.textContent = metrics.earnings_live;
    }
    if (timeEl && metrics.trip_time) {
      timeEl.textContent = metrics.trip_time;
    }
    if (speedEl && metrics.speed_kmh != null) {
      speedEl.textContent = metrics.speed_kmh + " km/h";
    }
  }

  function fetchLiveTrip() {
    return fetch("/driver-portal/api/active-trip-map", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("map fetch failed");
        return res.json();
      })
      .then(function (data) {
        if (data.map) {
          renderLiveMap(data.map);
        }
        if (data.trip) {
          updateMetrics(data.trip);
        }
      })
      .catch(function () {
        /* keep embedded map data on failure */
      });
  }

  function startPolling() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(fetchLiveTrip, 30000);
  }

  function onResize() {
    if (liveMap) liveMap.invalidateSize();
  }

  function init() {
    if (!mapEl) return;
    initMap();
    startPolling();
    window.addEventListener("resize", onResize);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
