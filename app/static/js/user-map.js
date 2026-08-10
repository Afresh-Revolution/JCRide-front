(function () {
  "use strict";

  var mapGreen = "#0a4f2a";
  var areaMapEl = document.getElementById("rider-area-map");
  var areaMapDataEl = document.getElementById("rider-area-map-data");
  var areaSurface = null;
  var initPromise = null;

  function readMapConfig() {
    if (!areaMapDataEl) return null;
    try {
      return JSON.parse(areaMapDataEl.textContent);
    } catch (err) {
      return null;
    }
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
    if (!areaSurface) return;

    areaSurface.clearOverlays();

    var zoom = config.map_zoom || 14;
    var radiusKm = config.radius_km || 2;
    var driverCount = config.driver_count || 12;
    var drivers = config.use_absolute_drivers
      ? config.drivers || []
      : offsetDrivers(center, config.drivers || []);

    areaSurface.setView(center.lat, center.lng, zoom);

    var displayLabel = locationLabel || config.location_label || "Your area";
    areaSurface.addDomMarker(
      center.lat,
      center.lng,
      '<div class="map-marker-user"></div>',
      {
        size: [16, 16],
        anchor: [8, 8],
        title: usingDeviceLocation ? "You are here" : displayLabel,
        zIndex: 300,
      }
    );

    areaSurface.addCircle(center.lat, center.lng, radiusKm * 1000, {
      color: mapGreen,
      weight: 2,
      opacity: 0.35,
      fillColor: mapGreen,
      fillOpacity: 0.08,
      dashArray: "6, 8",
    });

    var boundsPoints = [[center.lat, center.lng]];
    drivers.forEach(function (driver) {
      areaSurface.addCircleMarker(driver.lat, driver.lng, {
        radius: 7,
        color: mapGreen,
        fillColor: "#0d6b38",
        title: "Driver nearby",
      });
      boundsPoints.push([driver.lat, driver.lng]);
    });

    areaSurface.fitBounds(boundsPoints, {
      padding: 40,
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
      var cached = window.RiderGeolocation.getCached();
      if (cached && cached.lat != null) {
        finish({ lat: cached.lat, lng: cached.lng }, true, cached.label);
        return;
      }

      var shouldDetect =
        document.body &&
        document.body.getAttribute("data-auto-geolocate") === "true";

      if (!shouldDetect) {
        finish(fallback, false, config.location_label);
        return;
      }

      window.RiderGeolocation.detectAndApply({ forceFresh: false, timeout: 12000 })
        .then(function (result) {
          finish(
            { lat: result.lat, lng: result.lng },
            true,
            result.label
          );
        })
        .catch(function () {
          finish(fallback, false, config.location_label);
        });
      return;
    }

    var shouldDetectFallback =
      document.body &&
      document.body.getAttribute("data-auto-geolocate") === "true";

    if (!shouldDetectFallback || !navigator.geolocation) {
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

  function ensureSurface(config) {
    if (areaSurface) {
      return Promise.resolve(areaSurface);
    }
    if (initPromise) {
      return initPromise;
    }
    if (!areaMapEl || !window.JosRideMaps) {
      return Promise.reject(new Error("Map bootstrap missing"));
    }

    var initialCenter = config.map_center || { lat: 6.4474, lng: 3.5569 };
    var initialZoom = config.map_zoom || 14;

    initPromise = window.JosRideMaps.createSurface(areaMapEl, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true,
    }).then(function (surface) {
      areaSurface = surface;
      initPromise = null;
      return surface;
    });

    return initPromise;
  }

  function initAreaMap() {
    if (!areaMapEl) return;

    var config = readMapConfig();
    if (!config) return;

    ensureSurface(config)
      .then(function () {
        renderAreaMap(
          config.map_center || { lat: 6.4474, lng: 3.5569 },
          config,
          false,
          config.location_label
        );

        resolveUserCenter(config, function (center, usingDeviceLocation, locationLabel) {
          function drawMap(driverConfig) {
            renderAreaMap(center, driverConfig || config, usingDeviceLocation, locationLabel);
            window.setTimeout(function () {
              if (areaSurface) areaSurface.invalidateSize();
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
      })
      .catch(function () {
        window.setTimeout(function () {
          if (!areaSurface) initAreaMap();
        }, 200);
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
