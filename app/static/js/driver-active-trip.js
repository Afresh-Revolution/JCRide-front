(function () {
  "use strict";

  var mapEl = document.getElementById("driver-active-trip-map");
  var mapDataEl = document.getElementById("driver-active-trip-map-data");
  var mapGreen = "#22c55e";
  var mapSurface = null;
  var mapInitPromise = null;
  var pollTimer = null;
  var geoWatchId = null;
  var navRequestId = 0;
  var currentTripData = null;
  var cachedNav = null;
  var cachedTripRoute = null;
  var lastRouteFrom = null;
  var lastRouteFetchTime = 0;
  var lastRouteMode = "";
  var lastRenderedPos = null;
  var liveDriverPos = null;
  var liveDriverPosAt = 0;
  var smoothedPos = null;
  var lastPanPos = null;
  var lastMarkerUpdateAt = 0;
  var lastServerSyncAt = 0;
  var mapInitialized = false;
  var followDriver = true;
  var routeRefreshTimer = null;
  var pollStarted = false;

  var layerRefs = {
    navLine: null,
    tripLine: null,
    vehicle: null,
    start: null,
    end: null,
  };

  var PRE_PICKUP_STATUSES = ["accepted", "driver_assigned", "assigned", "driver_arrived"];
  var TRIP_STARTED_STATUSES = ["in_progress", "started", "on_trip"];
  var ROUTE_COLOR_PICKUP = "#3b82f6";
  var ROUTE_COLOR_TRIP = "#22c55e";
  var MIN_MOVE_M = 30;
  var PAN_MIN_MOVE_M = 120;
  var MAX_JUMP_M = 250;
  var MARKER_UPDATE_MS = 2500;
  var SERVER_SYNC_MS = 15000;
  var ROUTE_REFETCH_M = 200;
  var ROUTE_REFETCH_MS = 120000;
  var ROUTE_REFRESH_DEBOUNCE_MS = 5000;
  var GPS_SMOOTH_ALPHA = 0.28;

  function readMapData() {
    if (!mapDataEl) return null;
    try {
      return JSON.parse(mapDataEl.textContent);
    } catch (err) {
      return null;
    }
  }

  function vehicleHtml() {
    return (
      '<div class="map-marker-vehicle">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">' +
      '<path d="M7 17h10M5 11l1.5-4h11L19 11"/>' +
      '<circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>' +
      "</svg></div>"
    );
  }

  function removeOverlay(overlay) {
    if (!overlay) return;
    if (typeof overlay.setMap === "function") {
      overlay.setMap(null);
    } else if (mapSurface && mapSurface.map && typeof mapSurface.map.removeLayer === "function") {
      try {
        mapSurface.map.removeLayer(overlay);
      } catch (err) {
        /* already removed */
      }
    }
  }

  function setOverlayPosition(overlay, lat, lng) {
    if (!overlay) return;
    if (typeof overlay.setLatLng === "function") {
      overlay.setLatLng([lat, lng]);
      return;
    }
    if (typeof overlay.setPosition === "function") {
      overlay.setPosition({ lat: lat, lng: lng });
      return;
    }
    if (overlay.position != null && typeof overlay.draw === "function") {
      if (window.google && google.maps && google.maps.LatLng) {
        overlay.position = new google.maps.LatLng(lat, lng);
      } else {
        overlay.position = { lat: lat, lng: lng };
      }
      overlay.draw();
    }
  }

  function setPolylineCoords(poly, coords) {
    if (!poly || !coords || coords.length < 2) return;
    if (typeof poly.setLatLngs === "function") {
      poly.setLatLngs(
        coords.map(function (p) {
          return [p.lat, p.lng];
        })
      );
      return;
    }
    if (typeof poly.setPath === "function") {
      poly.setPath(
        coords.map(function (p) {
          return { lat: Number(p.lat), lng: Number(p.lng) };
        })
      );
    }
  }

  function ensureMapSurface() {
    if (mapSurface) return Promise.resolve(mapSurface);
    if (mapInitPromise) return mapInitPromise;
    if (!mapEl || !window.JosRideMaps) {
      return Promise.reject(new Error("Map bootstrap missing"));
    }
    var tripData = readMapData() || {};
    var center = tripData.map_center || tripData.vehicle_position || { lat: 9.8965, lng: 8.8583 };
    var zoom = tripData.map_zoom || 14;
    mapInitPromise = window.JosRideMaps.createSurface(mapEl, {
      center: center,
      zoom: zoom,
      zoomControl: true,
      preferGoogle: true,
    }).then(function (surface) {
      mapSurface = surface;
      mapInitPromise = null;
      if (surface.map && typeof surface.map.addListener === "function") {
        surface.map.addListener("dragstart", function () {
          followDriver = false;
        });
      } else if (surface.map && typeof surface.map.on === "function") {
        surface.map.on("dragstart", function () {
          followDriver = false;
        });
      }
      return surface;
    });
    return mapInitPromise;
  }

  function distanceM(a, b) {
    if (!a || !b) return Infinity;
    var R = 6371000;
    var p = Math.PI / 180;
    var dLat = (b.lat - a.lat) * p;
    var dLng = (b.lng - a.lng) * p;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function movedEnough(a, b, minM) {
    if (!b) return true;
    return distanceM(a, b) >= minM;
  }

  function smoothGps(raw) {
    if (!raw || raw.lat == null || raw.lng == null) return null;

    if (smoothedPos) {
      var jump = distanceM(raw, smoothedPos);
      if (jump > MAX_JUMP_M) {
        return smoothedPos;
      }
      if (raw.accuracy && smoothedPos.accuracy && raw.accuracy > smoothedPos.accuracy * 2.5) {
        return smoothedPos;
      }
      var alpha = GPS_SMOOTH_ALPHA;
      return {
        lat: smoothedPos.lat * (1 - alpha) + raw.lat * alpha,
        lng: smoothedPos.lng * (1 - alpha) + raw.lng * alpha,
        accuracy: raw.accuracy != null ? raw.accuracy : smoothedPos.accuracy,
      };
    }

    return { lat: raw.lat, lng: raw.lng, accuracy: raw.accuracy };
  }

  function shouldRefetchRoute(from, to, tripData) {
    if (!from || !to) return false;
    if (!cachedNav || !layerRefs.navLine) return true;
    var mode = tripData.route_mode || (isPrePickup(tripData) ? "to_pickup" : "to_destination");
    if (mode !== lastRouteMode) return true;
    if (Date.now() - lastRouteFetchTime > ROUTE_REFETCH_MS) return true;
    if (lastRouteFrom && movedEnough(from, lastRouteFrom, ROUTE_REFETCH_M)) return true;
    return false;
  }

  function normalizeRoutePoints(coords) {
    if (!coords || !coords.length) return [];
    return coords
      .map(function (p) {
        if (Array.isArray(p)) {
          return { lat: Number(p[0]), lng: Number(p[1]) };
        }
        return { lat: Number(p.lat), lng: Number(p.lng) };
      })
      .filter(function (p) {
        return !Number.isNaN(p.lat) && !Number.isNaN(p.lng);
      });
  }

  function drawOrUpdateRoute(coords, prePickup) {
    if (!mapSurface) return;
    var points = normalizeRoutePoints(coords);
    if (points.length < 2) return;
    var style = {
      color: prePickup ? ROUTE_COLOR_PICKUP : ROUTE_COLOR_TRIP,
      weight: 6,
      opacity: 0.98,
      dashArray: prePickup ? "10, 8" : null,
      zIndex: 3,
    };
    if (!layerRefs.navLine) {
      layerRefs.navLine = mapSurface.addPolyline(points, style);
    } else {
      setPolylineCoords(layerRefs.navLine, points);
      if (typeof layerRefs.navLine.setStyle === "function") {
        layerRefs.navLine.setStyle(style);
      } else if (typeof layerRefs.navLine.setOptions === "function") {
        layerRefs.navLine.setOptions({
          strokeColor: style.color,
          strokeWeight: style.weight,
          strokeOpacity: style.dashArray ? 0 : style.opacity,
        });
      }
    }
  }

  function drawTripOverview(tripData) {
    if (!mapSurface || !tripData || !tripData.start || !tripData.end) return;
    var overview = normalizeRoutePoints(cachedTripRoute || tripData.route || []);
    if (overview.length < 2) {
      overview = [tripData.start, tripData.end];
    }
    var style = { color: "#86efac", weight: 4, opacity: 0.55, zIndex: 2 };
    if (!layerRefs.tripLine) {
      layerRefs.tripLine = mapSurface.addPolyline(overview, style);
    } else {
      setPolylineCoords(layerRefs.tripLine, overview);
    }
  }

  function ensureStaticMarkers(tripData) {
    if (!mapSurface || !tripData) return;
    var prePickup = isPrePickup(tripData);

    if (tripData.start && !layerRefs.start) {
      layerRefs.start = mapSurface.addDomMarker(
        tripData.start.lat,
        tripData.start.lng,
        prePickup
          ? '<div class="map-marker-start map-marker-start--pickup"></div>'
          : '<div class="map-marker-start"></div>',
        { size: [14, 14], anchor: [7, 7], zIndex: 100, title: "Pickup" }
      );
    }

    if (tripData.end && !layerRefs.end) {
      layerRefs.end = mapSurface.addDomMarker(
        tripData.end.lat,
        tripData.end.lng,
        '<div class="map-marker-end"></div>',
        { size: [16, 16], anchor: [8, 8], zIndex: 100, title: "Destination" }
      );
    }

    if (tripData.vehicle_position && !layerRefs.vehicle) {
      layerRefs.vehicle = mapSurface.addDomMarker(
        tripData.vehicle_position.lat,
        tripData.vehicle_position.lng,
        vehicleHtml(),
        { size: [36, 36], anchor: [18, 18], zIndex: 200, title: "You" }
      );
    }
  }

  function updateVehicleMarker(pos) {
    if (!pos || !mapSurface) return;
    if (!layerRefs.vehicle) {
      layerRefs.vehicle = mapSurface.addDomMarker(pos.lat, pos.lng, vehicleHtml(), {
        size: [36, 36],
        anchor: [18, 18],
        zIndex: 200,
        title: "You",
      });
      return;
    }
    setOverlayPosition(layerRefs.vehicle, pos.lat, pos.lng);
  }

  function fitToRouteOnce(coords, tripData) {
    if (!mapSurface || !followDriver || mapInitialized) return;
    var boundsPoints = normalizeRoutePoints(coords);
    if (tripData && tripData.start) boundsPoints.push(tripData.start);
    if (tripData && tripData.end) boundsPoints.push(tripData.end);
    if (tripData && tripData.vehicle_position) boundsPoints.push(tripData.vehicle_position);
    if (boundsPoints.length > 1) {
      mapSurface.fitBounds(boundsPoints, { padding: 56, maxZoom: 15 });
      mapInitialized = true;
    }
  }

  function updateManeuverFromPosition(pos) {
    if (!pos || !currentTripData) return;
    var target = navTarget(currentTripData);
    if (!target) return;

    var distanceEl = document.getElementById("active-trip-maneuver-distance");
    var etaEl = document.getElementById("active-trip-maneuver-eta");
    var labelEl = document.getElementById("active-trip-maneuver-label");
    var prePickup = isPrePickup(currentTripData);

    if (labelEl) {
      labelEl.textContent = prePickup ? "HEAD TO PICKUP" : "NEXT MANEUVER";
    }

    var distKm = cachedNav
      ? cachedNav.distance_km
      : distanceM(pos, target) / 1000;
    var durationMin = cachedNav
      ? cachedNav.duration_min
      : Math.max(1, Math.round((distKm / 30) * 60));

    if (distanceEl && cachedNav && cachedNav.steps && cachedNav.steps.length) {
      var step = cachedNav.steps[0];
      var stepDist = Math.max(0, Math.round(step.distance || 0));
      distanceEl.textContent = stepDist > 0 ? "in " + stepDist + " m" : "On route";
    } else if (distanceEl) {
      distanceEl.textContent = "in " + Math.max(1, Math.round(distKm * 1000)) + " m";
    }
    if (etaEl) {
      etaEl.textContent =
        "~" +
        durationMin +
        " min · " +
        distKm.toFixed(1) +
        " km" +
        (prePickup ? " to pickup" : " remaining");
      etaEl.hidden = false;
      etaEl.classList.remove("is-hidden");
    }

    updateMetricsDistance(distKm);
  }

  function updateMetricsDistance(distKm) {
    if (distKm == null || isNaN(distKm)) return;
    var distanceEl = document.querySelector('[data-metric="distance"]');
    if (distanceEl) {
      distanceEl.textContent = distKm.toFixed(1) + " km";
    }
  }

  function scheduleRouteRefresh(tripData, force) {
    if (routeRefreshTimer) window.clearTimeout(routeRefreshTimer);
    routeRefreshTimer = window.setTimeout(function () {
      routeRefreshTimer = null;
      refreshNavigation(tripData, !!force);
    }, force ? 0 : ROUTE_REFRESH_DEBOUNCE_MS);
  }

  function onPositionUpdate(pos, syncServer) {
    if (!currentTripData || !pos) return;

    var now = Date.now();
    var prev = lastRenderedPos ? { lat: lastRenderedPos.lat, lng: lastRenderedPos.lng } : null;
    setLiveDriverPos(pos);
    var stable = smoothedPos || liveDriverPos;
    if (!stable) return;

    var moved = movedEnough(stable, prev, MIN_MOVE_M);
    var due = now - lastMarkerUpdateAt >= MARKER_UPDATE_MS;

    if ((moved || !lastRenderedPos) && due) {
      lastRenderedPos = { lat: stable.lat, lng: stable.lng };
      lastMarkerUpdateAt = now;
      updateVehicleMarker(stable);
      updateManeuverFromPosition(stable);

      if (followDriver && mapSurface) {
        if (!mapInitialized) {
          mapSurface.setView(stable.lat, stable.lng, 15);
          mapInitialized = true;
          lastPanPos = { lat: stable.lat, lng: stable.lng };
        } else if (movedEnough(stable, lastPanPos, PAN_MIN_MOVE_M)) {
          mapSurface.setView(stable.lat, stable.lng);
          lastPanPos = { lat: stable.lat, lng: stable.lng };
        }
      }
    }

    if (syncServer && now - lastServerSyncAt >= SERVER_SYNC_MS) {
      lastServerSyncAt = now;
      if (window.DriverRealtime && window.DriverRealtime.sendLocationUpdate(stable)) {
        /* backend receives live coords via WebSocket */
      }
      if (window.DriverApi) {
        DriverApi.post(DriverApi.base + "/location", {
          lat: stable.lat,
          lng: stable.lng,
          accuracy: stable.accuracy,
        }).catch(function () {});
      }
    }

    scheduleRouteRefresh(currentTripData, false);
  }

  function isPrePickup(tripData) {
    if (!tripData) return true;
    if (tripData.picked_up) return false;
    var status = String(tripData.status || "").toLowerCase();
    if (TRIP_STARTED_STATUSES.indexOf(status) >= 0) return false;
    return PRE_PICKUP_STATUSES.indexOf(status) >= 0;
  }

  function readLiveGps() {
    if (liveDriverPos && Date.now() - liveDriverPosAt < 120000) {
      return liveDriverPos;
    }
    if (window.DriverGeolocation) {
      var cached = window.DriverGeolocation.getCached();
      if (cached && cached.lat != null) {
        return { lat: cached.lat, lng: cached.lng, accuracy: cached.accuracy };
      }
    }
    return null;
  }

  function setLiveDriverPos(pos) {
    if (!pos || pos.lat == null || pos.lng == null) return;
    smoothedPos = smoothGps(pos);
    if (!smoothedPos) return;
    liveDriverPos = { lat: smoothedPos.lat, lng: smoothedPos.lng };
    liveDriverPosAt = Date.now();
    if (currentTripData) {
      currentTripData.vehicle_position = liveDriverPos;
    }
  }

  function resolveDriverPosition(tripData) {
    var live = readLiveGps();
    if (live) return live;
    if (tripData && tripData.vehicle_position) return tripData.vehicle_position;
    return null;
  }

  function navTarget(tripData) {
    if (!tripData) return null;
    return isPrePickup(tripData) ? tripData.start : tripData.end;
  }

  function fetchGoogleRoute(from, to) {
    if (!from || !to) return Promise.resolve(null);
    if (!window.JosRideMaps || !window.JosRideMaps.hasGoogle) {
      return Promise.resolve(null);
    }

    return window.JosRideMaps.loadGoogle()
      .then(function () {
        return new Promise(function (resolve) {
          var service = new google.maps.DirectionsService();
          service.route(
            {
              origin: { lat: Number(from.lat), lng: Number(from.lng) },
              destination: { lat: Number(to.lat), lng: Number(to.lng) },
              travelMode: google.maps.TravelMode.DRIVING,
              drivingOptions: {
                departureTime: new Date(),
                trafficModel: google.maps.TrafficModel.BEST_GUESS,
              },
              provideRouteAlternatives: false,
            },
            function (result, status) {
              if (status !== "OK" || !result || !result.routes || !result.routes.length) {
                resolve(null);
                return;
              }
              var route = result.routes[0];
              var path = [];
              if (route.overview_path && route.overview_path.length) {
                route.overview_path.forEach(function (point) {
                  path.push({ lat: point.lat(), lng: point.lng() });
                });
              } else {
                (route.legs || []).forEach(function (legItem) {
                  (legItem.steps || []).forEach(function (stepItem) {
                    (stepItem.path || []).forEach(function (point) {
                      path.push({ lat: point.lat(), lng: point.lng() });
                    });
                  });
                });
              }
              var leg = route.legs && route.legs[0];
              var distanceM = leg && leg.distance ? leg.distance.value : 0;
              var durationSec =
                leg && leg.duration_in_traffic
                  ? leg.duration_in_traffic.value
                  : leg && leg.duration
                    ? leg.duration.value
                    : 0;
              var steps = leg && leg.steps ? leg.steps : [];
              resolve({
                route: path,
                distance_km: distanceM / 1000,
                duration_min: Math.max(1, Math.round(durationSec / 60)),
                steps: steps.map(function (step) {
                  return {
                    name: step.instructions
                      ? String(step.instructions).replace(/<[^>]+>/g, "")
                      : "",
                    distance: step.distance ? step.distance.value : 0,
                    maneuver: {
                      type: step.maneuver || "straight",
                      modifier: "",
                    },
                  };
                }),
                provider: "google",
              });
            }
          );
        });
      })
      .catch(function () {
        return null;
      });
  }

  function fetchOsrmRoute(from, to) {
    if (!from || !to) return Promise.resolve(null);
    var url =
      "https://router.project-osrm.org/route/v1/driving/" +
      encodeURIComponent(from.lng) +
      "," +
      encodeURIComponent(from.lat) +
      ";" +
      encodeURIComponent(to.lng) +
      "," +
      encodeURIComponent(to.lat) +
      "?overview=full&geometries=geojson&steps=true&alternatives=false";
    return fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data.routes || !data.routes.length) return null;
        var route = data.routes[0];
        var coords = (route.geometry.coordinates || []).map(function (pair) {
          return { lat: pair[1], lng: pair[0] };
        });
        var legs = route.legs || [];
        var steps = legs.length && legs[0].steps ? legs[0].steps : [];
        return {
          route: coords,
          distance_km: route.distance / 1000,
          duration_min: Math.max(1, Math.round(route.duration / 60)),
          steps: steps,
          provider: "osrm",
        };
      })
      .catch(function () {
        return null;
      });
  }

  function fetchDrivingRoute(from, to) {
    return fetchGoogleRoute(from, to).then(function (googleRoute) {
      if (googleRoute) return googleRoute;
      return fetchOsrmRoute(from, to);
    });
  }

  function stepInstruction(step) {
    if (!step) return "Continue on route";
    var maneuver = step.maneuver || {};
    var type = maneuver.type || "";
    var modifier = (maneuver.modifier || "").replace(/_/g, " ");
    var name = step.name || step.ref || "";
    if (type === "arrive") {
      return isPrePickup(currentTripData) ? "Arrive at pickup" : "Arrive at destination";
    }
    if (type === "depart") {
      return name ? "Head toward " + name : "Head toward pickup";
    }
    if (modifier) {
      var action = type === "turn" ? "Turn " + modifier : type.replace(/_/g, " ");
      return name ? action + " onto " + name : action;
    }
    return name || "Continue on route";
  }

  function maneuverIconForStep(step) {
    var modifier = step && step.maneuver ? step.maneuver.modifier || "" : "";
    if (modifier.indexOf("left") >= 0) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg>';
    }
    if (modifier.indexOf("right") >= 0) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
    }
    if (step && step.maneuver && step.maneuver.type === "arrive") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10z"/><circle cx="12" cy="11" r="2.5"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
  }

  function updateManeuverCard(tripData, nav) {
    var labelEl = document.getElementById("active-trip-maneuver-label");
    var textEl = document.getElementById("active-trip-maneuver-text");
    var distanceEl = document.getElementById("active-trip-maneuver-distance");
    var etaEl = document.getElementById("active-trip-maneuver-eta");
    var iconEl = document.getElementById("active-trip-maneuver-icon");
    if (!textEl) return;

    var prePickup = isPrePickup(tripData);
    if (labelEl) {
      labelEl.textContent = prePickup ? "HEAD TO PICKUP" : "NEXT MANEUVER";
    }

    var step = nav && nav.steps && nav.steps.length ? nav.steps[0] : null;
    var instruction = step ? stepInstruction(step) : prePickup ? "Routing to rider pickup" : "Routing to destination";
    var distanceM = step ? Math.max(0, Math.round(step.distance || 0)) : 0;

    textEl.textContent = instruction;
    if (distanceEl) {
      distanceEl.textContent = distanceM > 0 ? "in " + distanceM + " m" : "Calculating route…";
    }
    if (etaEl && nav) {
      etaEl.textContent =
        "~" +
        nav.duration_min +
        " min · " +
        nav.distance_km.toFixed(1) +
        " km" +
        (prePickup ? " to pickup" : " remaining");
      etaEl.hidden = false;
      etaEl.classList.remove("is-hidden");
    }
    if (iconEl && step) {
      iconEl.innerHTML = maneuverIconForStep(step);
    }
  }

  function enrichTripMap(tripData) {
    if (!tripData) return null;
    var driver = resolveDriverPosition(tripData);
    if (driver) tripData.vehicle_position = driver;
    if (tripData.status) {
      tripData.picked_up = isPrePickup(tripData) ? false : true;
      tripData.route_mode = isPrePickup(tripData) ? "to_pickup" : "to_destination";
    }
    return tripData;
  }

  function resetMapLayers() {
    removeOverlay(layerRefs.navLine);
    removeOverlay(layerRefs.tripLine);
    removeOverlay(layerRefs.vehicle);
    removeOverlay(layerRefs.start);
    removeOverlay(layerRefs.end);
    if (mapSurface && typeof mapSurface.clearOverlays === "function") {
      mapSurface.clearOverlays();
    }
    layerRefs.navLine = null;
    layerRefs.tripLine = null;
    layerRefs.vehicle = null;
    layerRefs.start = null;
    layerRefs.end = null;
    cachedNav = null;
    lastRouteFrom = null;
    lastRouteFetchTime = 0;
    lastRouteMode = "";
    mapInitialized = false;
  }

  function ensureTripOverviewRoute(tripData) {
    if (!tripData || !tripData.start || !tripData.end) return Promise.resolve(null);
    if (cachedTripRoute && cachedTripRoute.length >= 2) {
      drawTripOverview(tripData);
      return Promise.resolve(cachedTripRoute);
    }
    return fetchDrivingRoute(tripData.start, tripData.end).then(function (nav) {
      if (nav && nav.route && nav.route.length >= 2) {
        cachedTripRoute = nav.route;
      } else {
        cachedTripRoute = [tripData.start, tripData.end];
      }
      drawTripOverview(tripData);
      return cachedTripRoute;
    });
  }

  function refreshNavigation(tripData, forceRoute) {
    if (!tripData) return Promise.resolve();
    return ensureMapSurface().then(function () {
      currentTripData = tripData;
      tripData = enrichTripMap(tripData);

      var from = resolveDriverPosition(tripData);
      var to = navTarget(tripData);
      var prePickup = isPrePickup(tripData);
      var mode = tripData.route_mode || (prePickup ? "to_pickup" : "to_destination");

      ensureStaticMarkers(tripData);
      if (from) updateVehicleMarker(from);
      ensureTripOverviewRoute(tripData);

      var seedRoute = normalizeRoutePoints(tripData.route || []);
      if (seedRoute.length >= 2) {
        drawOrUpdateRoute(seedRoute, prePickup);
      } else if (from && to) {
        drawOrUpdateRoute([from, to], prePickup);
      }

      if (!from || !to) {
        return null;
      }

      if (!forceRoute && !shouldRefetchRoute(from, to, tripData)) {
        return null;
      }

      var requestId = ++navRequestId;
      return fetchDrivingRoute(from, to).then(function (nav) {
        if (requestId !== navRequestId) return;
        if (nav && nav.route && nav.route.length >= 2) {
          cachedNav = nav;
          tripData.route = nav.route;
          lastRouteFrom = { lat: from.lat, lng: from.lng };
          lastRouteFetchTime = Date.now();
          lastRouteMode = mode;
          drawOrUpdateRoute(nav.route, prePickup);
          updateManeuverCard(tripData, nav);
          updateMetricsDistance(nav.distance_km);
          if (!mapInitialized) {
            var fitPoints = (cachedTripRoute || []).concat(nav.route);
            fitToRouteOnce(fitPoints.length >= 2 ? fitPoints : nav.route, tripData);
          }
        } else if (!cachedNav) {
          updateManeuverCard(tripData, null);
        }
        ensureStaticMarkers(tripData);
        if (from) updateVehicleMarker(from);
      });
    });
  }

  function initMap() {
    if (!mapEl) return;

    var tripData = readMapData();
    if (!tripData) return;

    resetMapLayers();
    ensureMapSurface()
      .then(function () {
        var initial = enrichTripMap(readMapData());
        if (initial) {
          currentTripData = initial;
          if (initial.vehicle_position) {
            lastRenderedPos = {
              lat: initial.vehicle_position.lat,
              lng: initial.vehicle_position.lng,
            };
          }
          return refreshNavigation(initial, true);
        }
        return null;
      })
      .then(function () {
        window.setTimeout(function () {
          if (mapSurface) mapSurface.invalidateSize();
        }, 150);
      })
      .catch(function () {
        window.setTimeout(initMap, 250);
      });
  }

  function updateMetrics(metrics) {
    if (!metrics) return;
    var earningsEl = document.querySelector('[data-metric="earnings"]');
    var timeEl = document.querySelector('[data-metric="time"]');
    var speedEl = document.querySelector('[data-metric="speed"]');

    var apiDistance = metrics.distance_left_km;
    if (apiDistance != null && Number(apiDistance) > 0) {
      updateMetricsDistance(Number(apiDistance));
    } else if (cachedNav && cachedNav.distance_km) {
      updateMetricsDistance(cachedNav.distance_km);
    }

    if (earningsEl && metrics.earnings_live) {
      earningsEl.textContent = metrics.earnings_live;
    }
    if (timeEl && metrics.trip_time && metrics.trip_time !== "-") {
      timeEl.textContent = metrics.trip_time;
    } else if (timeEl && cachedNav) {
      timeEl.textContent = cachedNav.duration_min + " min";
    }
    if (speedEl && metrics.speed_kmh != null && Number(metrics.speed_kmh) > 0) {
      speedEl.textContent = metrics.speed_kmh + " km/h";
    }
  }

  function updateTripActions(trip) {
    if (!trip) return;

    var arriveForm = document.querySelector(".active-trip-arrive-form");
    var pickupForm = document.querySelector(".active-trip-pickup-form");
    var completeBtn = document.querySelector(".active-trip-complete-btn");
    var hint = document.querySelector(".active-trip-complete-hint");
    var cancelBtn = document.getElementById("driver-trip-cancel-btn");
    var cancelForm = document.getElementById("driver-trip-cancel-form");

    if (arriveForm) arriveForm.hidden = !trip.can_arrive;
    if (pickupForm) pickupForm.hidden = !trip.can_pick_up;
    if (completeBtn) {
      completeBtn.disabled = !trip.can_complete;
      completeBtn.setAttribute("aria-disabled", trip.can_complete ? "false" : "true");
    }
    if (hint) hint.hidden = !trip.picked_up || !!trip.can_complete;
    if (cancelBtn && cancelForm) {
      var status = String(trip.status || "").toLowerCase();
      var cancellable = ["accepted", "driver_assigned", "driver_arrived"].indexOf(status) >= 0;
      cancelForm.hidden = !cancellable;
      cancelForm.classList.toggle("is-hidden", !cancellable);
      cancelBtn.disabled = !cancellable;
      cancelBtn.setAttribute("aria-hidden", cancellable ? "false" : "true");
    }
    if (window.RideVoiceCall && trip.status) {
      window.RideVoiceCall.setRideStatus(trip.status);
    }
    if (window.RideVoiceCall && trip.rider_phone) {
      window.RideVoiceCall.setPeerPhone(trip.rider_phone);
    }
    if (window.RideVoiceCall && trip.rider_name) {
      window.RideVoiceCall.setPeerLabel(trip.rider_name);
    }
  }

  function readTripConfig() {
    var el = document.getElementById("driver-active-trip-config");
    if (!el) return {};
    try {
      return JSON.parse(el.textContent || "{}");
    } catch (err) {
      return {};
    }
  }

  function initCancel(config) {
    var cancelBtn = document.getElementById("driver-trip-cancel-btn");
    var reasonInput = document.getElementById("driver-trip-cancel-reason");
    var cancelForm = document.getElementById("driver-trip-cancel-form");
    var modal = document.getElementById("driver-cancel-trip-modal");
    if (!cancelBtn || !cancelForm || !modal) return;

    var closeBtn = document.getElementById("driver-cancel-trip-close");
    var backBtn = document.getElementById("driver-cancel-trip-back");
    var confirmBtn = document.getElementById("driver-cancel-trip-confirm");
    var dismissBtn = document.getElementById("driver-cancel-trip-dismiss");
    var formSection = document.getElementById("driver-cancel-trip-form-section");
    var blockedSection = document.getElementById("driver-cancel-trip-blocked");
    var actions = document.getElementById("driver-cancel-trip-actions");
    var blockedActions = document.getElementById("driver-cancel-trip-blocked-actions");
    var otherWrap = document.getElementById("driver-cancel-other-wrap");
    var otherInput = document.getElementById("driver-cancel-other");
    var errorEl = document.getElementById("driver-cancel-trip-error");
    var reasonList = document.getElementById("driver-cancel-reason-list");
    var liveStatus = String(config.rideStatus || "").toLowerCase();

    function currentStatus() {
      if (currentTripData && currentTripData.status) {
        return String(currentTripData.status).toLowerCase();
      }
      return liveStatus;
    }

    function isTripStartedStatus(status) {
      return TRIP_STARTED_STATUSES.indexOf(status) >= 0 || status === "completed" || status === "cancelled";
    }

    function closeModal() {
      if (typeof modal.close === "function") {
        modal.close();
      } else {
        modal.removeAttribute("open");
        modal.hidden = true;
      }
      document.body.classList.remove("driver-cancel-trip-modal-open");
    }

    function showError(message) {
      if (!errorEl) return;
      if (message) {
        errorEl.textContent = message;
        errorEl.hidden = false;
        errorEl.classList.remove("is-hidden");
      } else {
        errorEl.textContent = "";
        errorEl.hidden = true;
        errorEl.classList.add("is-hidden");
      }
    }

    function setBlockedMode(blocked) {
      if (formSection) formSection.hidden = blocked;
      if (blockedSection) blockedSection.hidden = !blocked;
      if (actions) actions.hidden = blocked;
      if (blockedActions) blockedActions.hidden = !blocked;
    }

    function openModal(blocked) {
      showError("");
      setBlockedMode(!!blocked);
      if (typeof modal.showModal === "function") {
        modal.showModal();
      } else {
        modal.setAttribute("open", "open");
        modal.hidden = false;
      }
      document.body.classList.add("driver-cancel-trip-modal-open");
    }

    function selectedReason() {
      if (!reasonList) return "";
      var selected = reasonList.querySelector('input[name="driver_cancel_reason"]:checked');
      if (!selected) return "";
      if (selected.value === "other") {
        return otherInput ? otherInput.value.trim() : "";
      }
      return selected.value;
    }

    if (reasonList) {
      reasonList.querySelectorAll('input[name="driver_cancel_reason"]').forEach(function (input) {
        input.addEventListener("change", function () {
          if (!otherWrap) return;
          var isOther = input.value === "other" && input.checked;
          otherWrap.hidden = !isOther;
          otherWrap.classList.toggle("is-hidden", !isOther);
          if (isOther && otherInput) otherInput.focus();
        });
      });
    }

    cancelBtn.addEventListener("click", function () {
      var status = currentStatus();
      liveStatus = status;
      var blocked = isTripStartedStatus(status);
      if (blocked) {
        cancelForm.hidden = true;
        cancelForm.classList.add("is-hidden");
      }
      openModal(blocked);
    });

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (backBtn) backBtn.addEventListener("click", closeModal);
    if (dismissBtn) dismissBtn.addEventListener("click", closeModal);

    modal.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeModal();
    });

    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal();
    });

    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        if (isTripStartedStatus(currentStatus())) {
          showError("This trip has started and can no longer be cancelled. Only support can cancel it.");
          setBlockedMode(true);
          return;
        }
        var reason = selectedReason();
        if (!reason) {
          showError("Please select a reason or tell us more.");
          return;
        }
        if (reasonInput) reasonInput.value = reason;
        if (window.ButtonLoading) window.ButtonLoading.start(confirmBtn, { text: "Cancelling…" });
        else confirmBtn.disabled = true;
        cancelForm.submit();
      });
    }
  }

  function fetchLiveTrip() {
    return fetch("/driver-portal/api/active-trip-map", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            var message = (data && (data.error || data.message || data.detail)) || "map fetch failed";
            var err = new Error(typeof message === "string" ? message : "map fetch failed");
            err.status = res.status;
            throw err;
          }
          return data;
        });
      })
      .then(function (data) {
        if (!data.trip) {
          // Admin/customer cancel (or completed trip) — leave active trip without re-login.
          if (pollTimer) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
          stopGeoWatch();
          window.location.href = "/driver-portal/ride-requests";
          return;
        }

        if (data.map && data.trip) {
          data.map.status = data.trip.status;
          data.map.picked_up = data.trip.picked_up;
          data.map.route_mode = data.trip.picked_up ? "to_destination" : "to_pickup";
        }

        var forceRoute = false;
        if (data.trip && currentTripData) {
          var prevMode = currentTripData.route_mode || (isPrePickup(currentTripData) ? "to_pickup" : "to_destination");
          var nextMode = data.trip.picked_up ? "to_destination" : "to_pickup";
          forceRoute = prevMode !== nextMode || currentTripData.status !== data.trip.status;
        }

        if (data.trip) {
          updateMetrics(data.trip);
          updateTripActions(data.trip);
          if (!pollStarted) {
            pollStarted = true;
            startPolling(data.trip);
          }
        }

        if (data.map && forceRoute) {
          if (currentTripData) {
            data.map.start = data.map.start || currentTripData.start;
            data.map.end = data.map.end || currentTripData.end;
          }
          if (liveDriverPos) {
            data.map.vehicle_position = { lat: liveDriverPos.lat, lng: liveDriverPos.lng };
          }
          resetMapLayers();
          refreshNavigation(data.map, true);
        }
      })
      .catch(function (err) {
        var message = String((err && err.message) || "").toLowerCase();
        var status = err && err.status;
        if (
          status === 401 ||
          status === 403 ||
          message.indexOf("expired token") >= 0 ||
          message.indexOf("unauthorized") >= 0
        ) {
          window.location.href =
            "/driver-portal/login?message=" +
            encodeURIComponent("Your session expired. Please sign in again.");
          return;
        }
        /* keep embedded map data on other failures */
      });
  }

  function startPolling(trip) {
    if (pollTimer) return;
    // Poll often enough that an admin cancel is noticed without websocket.
    var interval = trip && !trip.picked_up ? 8000 : 10000;
    pollTimer = window.setInterval(fetchLiveTrip, interval);
  }

  function startGeoWatch() {
    if (geoWatchId != null || !navigator.geolocation) return;
    geoWatchId = navigator.geolocation.watchPosition(
      function (position) {
        onPositionUpdate(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
          true
        );
      },
      function () {},
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 }
    );
  }

  function stopGeoWatch() {
    if (geoWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
  }

  function onResize() {
    if (mapSurface) mapSurface.invalidateSize();
  }

  function acquireInitialPosition() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        resolve(readLiveGps());
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (position) {
          var pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setLiveDriverPos(pos);
          resolve(pos);
        },
        function () {
          resolve(readLiveGps());
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  function handleRideRealtimeEvent(event) {
    var detail = (event && event.detail) || {};
    var type = detail.type || "";
    var payload = detail.payload || {};

    if (type === "ride.cancelled") {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      stopGeoWatch();
      // driver-realtime shows overlay + redirects; this is a safety net.
      window.setTimeout(function () {
        if (window.location.pathname.indexOf("/active-trip") >= 0) {
          window.location.href = "/driver-portal/ride-requests";
        }
      }, 2000);
      return;
    }

    if (!currentTripData) return;

    if (type === "ride.driver.arrived") {
      currentTripData.status = payload.status || "driver_arrived";
      currentTripData.picked_up = false;
      updateTripActions(currentTripData);
      refreshNavigation(currentTripData, true);
      return;
    }

    if (type === "ride.started") {
      currentTripData.status = payload.status || "in_progress";
      currentTripData.picked_up = true;
      updateTripActions(currentTripData);
      resetMapLayers();
      refreshNavigation(currentTripData, true);
      return;
    }

    if (type === "ride.updated" || type === "ride.snapshot") {
      if (payload.status) currentTripData.status = payload.status;
      if (payload.picked_up != null) currentTripData.picked_up = payload.picked_up;
      updateTripActions(currentTripData);
      fetchLiveTrip();
    }
  }

  function init() {
    var tripConfig = readTripConfig();
    initCancel(tripConfig);
    if (!mapEl) return;
    initMap();
    acquireInitialPosition().then(function (pos) {
      if (pos && currentTripData) {
        onPositionUpdate(pos, true);
        refreshNavigation(currentTripData, true);
      }
    });
    fetchLiveTrip();
    startGeoWatch();
    window.addEventListener("driver-ride-event", handleRideRealtimeEvent);
    window.addEventListener("resize", onResize);
    window.addEventListener("beforeunload", stopGeoWatch);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
