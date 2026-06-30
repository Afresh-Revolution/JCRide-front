(function () {
  "use strict";

  const mapEl = document.getElementById("trips-live-map");
  const listEl = document.getElementById("trips-list");
  const activeCountEl = document.getElementById("trips-active-count");
  const badgeEl = document.getElementById("trips-map-badge");
  const legendActiveEl = document.getElementById("legend-active-count");
  const legendDelayedEl = document.getElementById("legend-delayed-count");
  const legendIncidentEl = document.getElementById("legend-incident-count");

  const NIGERIA_CENTER = { lat: 9.082, lng: 8.675 };
  const NIGERIA_ZOOM = 6;
  const NIGERIA_BOUNDS = [[4.2, 2.8], [13.9, 14.6]];
  const chartGreen = "#0a4f2a";

  let liveMap = null;
  let liveMapTileLayer = null;
  let currentStatus = "all";

  function isDarkTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function adminTileLayerUrl() {
    return isDarkTheme()
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }

  function bindAdminMapTheme() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = function () {
      if (liveMapTileLayer) liveMapTileLayer.setUrl(adminTileLayerUrl());
    };
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
    } else if (mq.addListener) {
      mq.addListener(onChange);
    }
  }

  function fitMapToNigeria(map, boundsPoints, markerCount) {
    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [48, 48],
        maxZoom: markerCount > 3 ? 7 : 10,
      });
      return;
    }
    map.fitBounds(NIGERIA_BOUNDS, { padding: [24, 24] });
  }

  function createMapIcon(html, size, anchor) {
    return L.divIcon({
      className: "",
      html: html,
      iconSize: size,
      iconAnchor: anchor,
    });
  }

  function markerColors(status) {
    if (status === "delayed") {
      return { color: "#ca8a04", fillColor: "#eab308" };
    }
    if (status === "incident") {
      return { color: "#dc2626", fillColor: "#ef4444" };
    }
    return { color: chartGreen, fillColor: "#0d6b38" };
  }

  function statusClass(status) {
    if (status === "completed") return "trip-card__status--completed";
    if (status === "cancelled") return "trip-card__status--cancelled";
    return "trip-card__status--in-progress";
  }

  function renderTripCard(trip) {
    return (
      '<article class="trip-card">' +
      '<span class="trip-card__id">' + escapeHtml(trip.public_id) + "</span>" +
      '<span class="trip-card__status ' + statusClass(trip.status) + '">' +
      escapeHtml(trip.status_label) +
      "</span>" +
      '<div class="trip-card__route">' + escapeHtml(trip.route_display) + "</div>" +
      '<div class="trip-card__participants">' + escapeHtml(trip.participants_display) + "</div>" +
      '<div class="trip-card__meta">' + escapeHtml(trip.meta_display) + "</div>" +
      "</article>"
    );
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initLiveMap(tripData) {
    if (!mapEl || typeof L === "undefined") return;

    if (liveMap) {
      liveMap.remove();
      liveMap = null;
    }

    const mapCenter = tripData.map_center || NIGERIA_CENTER;
    const mapZoom = tripData.map_zoom || NIGERIA_ZOOM;
    const route = (tripData.route && tripData.route.length)
      ? tripData.route.map(function (p) { return [p.lat, p.lng]; })
      : [];
    const markers = tripData.markers || [];

    liveMap = L.map(mapEl, {
      zoomControl: false,
      attributionControl: false,
    }).setView([mapCenter.lat, mapCenter.lng], mapZoom);

    liveMapTileLayer = L.tileLayer(adminTileLayerUrl(), {
      maxZoom: 19,
    }).addTo(liveMap);

    bindAdminMapTheme();

    L.control.zoom({ position: "topright" }).addTo(liveMap);

    markers.forEach(function (marker) {
      const colors = markerColors(marker.status);
      L.circleMarker([marker.lat, marker.lng], {
        radius: 7,
        color: colors.color,
        fillColor: colors.fillColor,
        fillOpacity: 0.92,
        weight: 2,
      })
        .bindTooltip(marker.city, { direction: "top", offset: [0, -6] })
        .addTo(liveMap);
    });

    if (route.length >= 2) {
      L.polyline(route, {
        color: chartGreen,
        weight: 5,
        opacity: 0.9,
        dashArray: "12, 10",
        lineCap: "round",
      }).addTo(liveMap);
    }

    if (tripData.start) {
      L.marker([tripData.start.lat, tripData.start.lng], {
        icon: createMapIcon('<div class="map-marker-start"></div>', [14, 14], [7, 7]),
        zIndexOffset: 100,
      }).addTo(liveMap);
    }

    if (tripData.vehicle_position) {
      const carSvg =
        '<div class="map-marker-vehicle">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">' +
        '<path d="M7 17h10M5 11l1.5-4h11L19 11"/>' +
        '<circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>' +
        "</svg></div>";

      L.marker([tripData.vehicle_position.lat, tripData.vehicle_position.lng], {
        icon: createMapIcon(carSvg, [36, 36], [18, 18]),
        zIndexOffset: 200,
      }).addTo(liveMap);
    }

    if (tripData.end) {
      L.marker([tripData.end.lat, tripData.end.lng], {
        icon: createMapIcon('<div class="map-marker-end"></div>', [16, 16], [8, 8]),
        zIndexOffset: 100,
      }).addTo(liveMap);
    }

    const boundsPoints = [];
    markers.forEach(function (marker) {
      boundsPoints.push([marker.lat, marker.lng]);
    });
    if (route.length >= 2) {
      boundsPoints.push.apply(boundsPoints, route);
    }
    if (tripData.start) boundsPoints.push([tripData.start.lat, tripData.start.lng]);
    if (tripData.end) boundsPoints.push([tripData.end.lat, tripData.end.lng]);
    if (tripData.vehicle_position) {
      boundsPoints.push([tripData.vehicle_position.lat, tripData.vehicle_position.lng]);
    }

    fitMapToNigeria(liveMap, boundsPoints, markers.length);

    if (activeCountEl) {
      activeCountEl.textContent = (tripData.active_count || 0).toLocaleString();
    }
    if (badgeEl) {
      badgeEl.textContent = tripData.label || "Nigeria · Live ops";
    }
    if (tripData.legend) {
      if (legendActiveEl) legendActiveEl.textContent = (tripData.legend.active || 0).toLocaleString();
      if (legendDelayedEl) legendDelayedEl.textContent = (tripData.legend.delayed || 0).toLocaleString();
      if (legendIncidentEl) legendIncidentEl.textContent = (tripData.legend.incident || 0).toLocaleString();
    }
  }

  function fetchLiveMap() {
    return fetch("/admin/api/trips/map")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load live map");
        return res.json();
      })
      .then(initLiveMap)
      .catch(function () {
        if (activeCountEl) activeCountEl.textContent = "0";
      });
  }

  function fetchTrips() {
    if (!listEl) return Promise.resolve();

    listEl.innerHTML = '<p class="trips-list__loading">Loading trips…</p>';

    return fetch("/admin/api/trips?status=" + encodeURIComponent(currentStatus) + "&limit=30")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load trips");
        return res.json();
      })
      .then(function (data) {
        const trips = data.trips || [];
        if (!trips.length) {
          listEl.innerHTML = '<p class="trips-list__empty">No trips found.</p>';
          return;
        }
        listEl.innerHTML = trips.map(renderTripCard).join("");
      })
      .catch(function () {
        listEl.innerHTML = '<p class="trips-list__empty">Could not load trips.</p>';
      });
  }

  function bindFilterTabs() {
    const tabs = document.querySelectorAll(".trips-filter-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        currentStatus = tab.dataset.status || "all";
        fetchTrips();
      });
    });
  }

  function init() {
    bindFilterTabs();
    fetchLiveMap();
    fetchTrips();
    setInterval(fetchLiveMap, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
