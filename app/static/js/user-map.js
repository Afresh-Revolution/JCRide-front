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

  function tileLayerUrl() {
    var isDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }

  var areaMapTileLayer = null;

  function bindThemeListener() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      if (!areaMapInstance || !areaMapTileLayer) return;
      areaMapTileLayer.setUrl(tileLayerUrl());
    };
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
    } else if (mq.addListener) {
      mq.addListener(onChange);
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

  function updateAreaBadge(label, driverCount, usingDeviceLocation, radiusKm) {
    var badge = document.getElementById("rider-area-map-badge");
    if (!badge) return;

    var radius = radiusKm || 2;
    var prefix = usingDeviceLocation && label ? label : usingDeviceLocation ? "Your location" : label;
    badge.textContent = prefix + " · " + driverCount + " drivers within " + radius + " km";
  }

  function renderAreaMap(center, config, usingDeviceLocation, locationLabel) {
    if (!areaMapInstance || typeof L === "undefined") return;

    clearMapLayers();

    var zoom = config.map_zoom || 14;
    var radiusKm = config.radius_km || 2;
    var driverCount = config.driver_count || 12;
    var drivers = config.use_absolute_drivers
      ? config.drivers || []
      : offsetDrivers(center, config.drivers || []);

    areaMapInstance.setView([center.lat, center.lng], zoom);

    var displayLabel = locationLabel || config.location_label || "Your area";
    var userMarker = L.marker([center.lat, center.lng], {
      icon: createDivIcon('<div class="map-marker-user"></div>', [16, 16], [8, 8]),
      zIndexOffset: 300,
    }).bindTooltip(usingDeviceLocation ? "You are here" : displayLabel, {
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

    updateAreaBadge(displayLabel, driverCount, usingDeviceLocation, radiusKm);
  }

  function resolveUserCenter(config, callback) {
    var fallback = config.map_center || { lat: 6.4474, lng: 3.5569 };

    function finish(center, usingDeviceLocation, locationLabel) {
      callback(center, usingDeviceLocation, locationLabel);
    }

    if (window.RiderGeolocation) {
      window.RiderGeolocation.detectAndApply({ forceFresh: false, timeout: 12000 })
        .then(function (result) {
          finish(
            { lat: result.lat, lng: result.lng },
            true,
            result.label
          );
        })
        .catch(function () {
          if (!navigator.geolocation) {
            finish(fallback, false, config.location_label);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            function (position) {
              finish(
                {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                },
                true,
                config.location_label
              );
            },
            function () {
              finish(fallback, false, config.location_label);
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 120000,
            }
          );
        });
      return;
    }

    if (!navigator.geolocation) {
      finish(fallback, false, config.location_label);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        finish(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          true,
          config.location_label
        );
      },
      function () {
        finish(fallback, false, config.location_label);
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

    areaMapTileLayer = L.tileLayer(tileLayerUrl(), {
      maxZoom: 19,
    }).addTo(areaMapInstance);

    bindThemeListener();

    L.control.zoom({ position: "topright" }).addTo(areaMapInstance);

    renderAreaMap(initialCenter, config, false, config.location_label);

    resolveUserCenter(config, function (center, usingDeviceLocation, locationLabel) {
      function drawMap(driverConfig) {
        renderAreaMap(center, driverConfig || config, usingDeviceLocation, locationLabel);
        window.setTimeout(function () {
          if (areaMapInstance) areaMapInstance.invalidateSize();
        }, 120);
      }

      if (config.live_drivers_api && window.UserApi) {
        UserApi.request(
          "/user/api/nearby-drivers?lat=" +
            encodeURIComponent(center.lat) +
            "&lng=" +
            encodeURIComponent(center.lng)
        )
          .then(function (data) {
            var merged = Object.assign({}, config, {
              driver_count: data.driver_count || 0,
              use_absolute_drivers: true,
              drivers: (data.drivers || []).map(function (d) {
                return { lat: d.lat, lng: d.lng };
              }),
              radius_km: data.radius_km || config.radius_km,
            });
            var subtitle = document.querySelector(".rider-panel--map .rider-panel__subtitle");
            if (subtitle && data.driver_count != null) {
              subtitle.textContent =
                data.driver_count +
                " drivers within " +
                (data.radius_km || 2) +
                " km · Avg pickup " +
                (data.avg_pickup_minutes || 4) +
                " min";
            }
            drawMap(merged);
          })
          .catch(function () {
            drawMap(config);
          });
        return;
      }

      drawMap(config);
    });
  }

  function init() {
    if (areaMapEl) {
      if ("IntersectionObserver" in window) {
        var observer = new IntersectionObserver(function (entries) {
          if (!entries[0] || !entries[0].isIntersecting) return;
          observer.disconnect();
          initAreaMap();
        }, { rootMargin: "200px 0px" });
        observer.observe(areaMapEl);
        return;
      }
      initAreaMap();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
