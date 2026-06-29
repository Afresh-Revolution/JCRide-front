(function () {
  "use strict";

  var mapGreen = "#0a4f2a";
  var areaMapEl = document.getElementById("rider-area-map");
  var areaMapDataEl = document.getElementById("rider-area-map-data");
  var areaMapInstance = null;
  var areaMapLayers = [];

  function readMapConfig() {
    if (!areaMapDataEl) return null;
    try {
      return JSON.parse(areaMapDataEl.textContent);
    } catch (err) {
      return null;
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

  function clearMapLayers() {
    areaMapLayers.forEach(function (layer) {
      if (areaMapInstance) {
        areaMapInstance.removeLayer(layer);
      }
    });
    areaMapLayers = [];
  }

  function offsetDrivers(center, drivers) {
    if (!drivers || !drivers.length || !center) {
      return [];
    }

    var first = drivers[0];
    var baseLat = first.lat;
    var baseLng = first.lng;

    return drivers.map(function (driver) {
      return {
        lat: center.lat + (driver.lat - baseLat),
        lng: center.lng + (driver.lng - baseLng),
      };
    });
  }

  function updateAreaBadge(label, driverCount, usingDeviceLocation) {
    var badge = document.getElementById("rider-area-map-badge");
    if (!badge) return;

    var prefix = usingDeviceLocation ? "Your location" : label;
    badge.textContent = prefix + " · " + driverCount + " drivers within 2 km";
  }

  function renderAreaMap(center, config, usingDeviceLocation) {
    if (!areaMapInstance || typeof L === "undefined") return;

    clearMapLayers();

    var zoom = config.map_zoom || 14;
    var radiusKm = config.radius_km || 2;
    var driverCount = config.driver_count || 12;
    var drivers = offsetDrivers(center, config.drivers || []);

    areaMapInstance.setView([center.lat, center.lng], zoom);

    var userMarker = L.marker([center.lat, center.lng], {
      icon: createDivIcon('<div class="map-marker-user"></div>', [16, 16], [8, 8]),
      zIndexOffset: 300,
    }).bindTooltip(usingDeviceLocation ? "You are here" : config.location_label, {
      direction: "top",
      offset: [0, -8],
    });
    userMarker.addTo(areaMapInstance);
    areaMapLayers.push(userMarker);

    var radiusCircle = L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color: mapGreen,
      weight: 2,
      opacity: 0.35,
      fillColor: mapGreen,
      fillOpacity: 0.08,
      dashArray: "6, 8",
    });
    radiusCircle.addTo(areaMapInstance);
    areaMapLayers.push(radiusCircle);

    drivers.forEach(function (driver) {
      var marker = L.circleMarker([driver.lat, driver.lng], {
        radius: 7,
        color: mapGreen,
        fillColor: "#0d6b38",
        fillOpacity: 0.92,
        weight: 2,
      }).bindTooltip("Driver nearby", { direction: "top", offset: [0, -6] });
      marker.addTo(areaMapInstance);
      areaMapLayers.push(marker);
    });

    var bounds = L.latLngBounds([[center.lat, center.lng]]);
    drivers.forEach(function (driver) {
      bounds.extend([driver.lat, driver.lng]);
    });

    areaMapInstance.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: zoom,
    });

    updateAreaBadge(config.location_label, driverCount, usingDeviceLocation);
  }

  function resolveUserCenter(config, callback) {
    var fallback = config.map_center || { lat: 6.4474, lng: 3.5569 };

    if (!navigator.geolocation) {
      callback(fallback, false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        callback(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          true
        );
      },
      function () {
        callback(fallback, false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 120000,
      }
    );
  }

  function initAreaMap() {
    if (!areaMapEl || typeof L === "undefined") return;

    var config = readMapConfig();
    if (!config) return;

    if (areaMapInstance) {
      areaMapInstance.remove();
      areaMapInstance = null;
    }

    var initialCenter = config.map_center || { lat: 6.4474, lng: 3.5569 };
    var initialZoom = config.map_zoom || 14;

    areaMapInstance = L.map(areaMapEl, {
      zoomControl: false,
      attributionControl: false,
    }).setView([initialCenter.lat, initialCenter.lng], initialZoom);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(areaMapInstance);

    L.control.zoom({ position: "topright" }).addTo(areaMapInstance);

    renderAreaMap(initialCenter, config, false);

    resolveUserCenter(config, function (center, usingDeviceLocation) {
      renderAreaMap(center, config, usingDeviceLocation);
      window.setTimeout(function () {
        if (areaMapInstance) {
          areaMapInstance.invalidateSize();
        }
      }, 120);
    });
  }

  function init() {
    if (areaMapEl) {
      initAreaMap();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
