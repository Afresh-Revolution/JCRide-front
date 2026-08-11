(function () {
  "use strict";

  const revenueCanvas = document.getElementById("revenue-chart");
  const tierCanvas = document.getElementById("tier-chart");
  const mapEl = document.getElementById("live-trip-map");
  const revenueSubtitleEl = document.getElementById("revenue-chart-subtitle");
  const revenueEmptyEl = document.getElementById("revenue-chart-empty");

  let revenueChart = null;
  let tierChart = null;
  let mapSurface = null;
  let mapInitPromise = null;
  let liveHasFitBounds = false;
  let revenueUnit = "raw";

  const chartGreen = "#0a4f2a";
  const chartGreenLight = "rgba(13, 107, 56, 0.15)";
  const NIGERIA_BOUNDS = [
    { lat: 4.2, lng: 2.8 },
    { lat: 13.9, lng: 14.6 },
  ];


  // Real road geometry cache (OSRM) keyed by pickup→destination.
  const OSRM_URL = "https://router.project-osrm.org/route/v1/driving/";
  const roadCache = {};
  const roadPending = {};
  let lastLiveTripData = null;

  function roadKey(a, b) {
    return a.lat.toFixed(5) + "," + a.lng.toFixed(5) + "|" + b.lat.toFixed(5) + "," + b.lng.toFixed(5);
  }

  function requestRoad(pickup, destination) {
    const key = roadKey(pickup, destination);
    if (roadCache[key] || roadPending[key]) return;
    roadPending[key] = true;
    const url =
      OSRM_URL +
      pickup.lng + "," + pickup.lat + ";" + destination.lng + "," + destination.lat +
      "?overview=full&geometries=geojson";
    fetch(url)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        delete roadPending[key];
        if (data && data.routes && data.routes[0] && data.routes[0].geometry) {
          roadCache[key] = data.routes[0].geometry.coordinates.map(function (c) {
            return [c[1], c[0]];
          });
          if (lastLiveTripData) renderLiveTrips(lastLiveTripData);
        }
      })
      .catch(function () { delete roadPending[key]; });
  }

  function isDarkTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function chartGridColor() {
    return isDarkTheme() ? "#374151" : "#f3f4f6";
  }

  function chartTickColor() {
    return isDarkTheme() ? "#9ca3af" : "#6b7280";
  }

  function toLatLng(point) {
    if (!point) return null;
    if (Array.isArray(point)) {
      return { lat: Number(point[0]), lng: Number(point[1]) };
    }
    return { lat: Number(point.lat), lng: Number(point.lng) };
  }

  function fitMapToNigeria(boundsPoints) {
    if (!mapSurface) return;
    if (boundsPoints.length > 1) {
      mapSurface.fitBounds(boundsPoints.map(toLatLng).filter(Boolean), {
        padding: 48,
        maxZoom: 14,
      });
      return;
    }
    if (boundsPoints.length === 1) {
      const one = toLatLng(boundsPoints[0]);
      if (one) mapSurface.setView(one.lat, one.lng, 13);
      return;
    }
    mapSurface.fitBounds(NIGERIA_BOUNDS, { padding: 24 });
  }

  function formatRevenueAxis(value, unit) {
    const amount = Number(value || 0);
    if (unit === "m") return "₦" + amount + "M";
    if (unit === "k") return "₦" + amount + "k";
    return "₦" + amount.toLocaleString();
  }

  function formatRevenueTooltip(value, unit) {
    const amount = Number(value || 0);
    if (unit === "m") return "₦" + amount + "M";
    if (unit === "k") return "₦" + amount + "k";
    return "₦" + amount.toLocaleString();
  }

  function formatRevenueTotal(ngn) {
    return "₦" + Number(ngn || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function buildRevenueChart(labels, values, period, meta) {
    if (!revenueCanvas || typeof Chart === "undefined") return;

    revenueUnit = (meta && meta.unit) || "raw";
    const totalNgn = meta && meta.total_ngn != null ? meta.total_ngn : 0;
    const unitLabel = (meta && meta.unit_label) || "naira";
    const hasData = labels.length > 0 && values.some(function (v) { return Number(v) > 0; });

    if (revenueSubtitleEl) {
      revenueSubtitleEl.textContent =
        "Net revenue (" + unitLabel + ") · " + formatRevenueTotal(totalNgn) + " total";
    }
    if (revenueEmptyEl) {
      revenueEmptyEl.hidden = hasData;
    }
    if (revenueCanvas) {
      revenueCanvas.style.opacity = hasData ? "1" : "0.35";
    }

    const ctx = revenueCanvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, "rgba(13, 107, 56, 0.28)");
    gradient.addColorStop(1, "rgba(13, 107, 56, 0.02)");

    if (revenueChart) {
      revenueChart.destroy();
    }

    const nonZeroCount = values.filter(function (v) { return Number(v) > 0; }).length;
    const showPoints = nonZeroCount > 0 && (nonZeroCount <= 6 || values.length <= 4);
    const pointRadii = showPoints
      ? values.map(function (v) { return Number(v) > 0 ? 5 : 0; })
      : 0;

    revenueChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels.length ? labels : ["-"],
        datasets: [{
          label: "Revenue",
          data: values.length ? values : [0],
          borderColor: chartGreen,
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.42,
          pointRadius: pointRadii,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: chartGreen,
          pointHoverBorderColor: "#fff",
          pointHoverBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "#111827",
            titleFont: { size: 13, weight: "600" },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              title: function (items) {
                return items[0]?.label || "";
              },
              label: function (context) {
                return formatRevenueTooltip(context.parsed.y, revenueUnit);
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: chartTickColor(),
              font: { size: 11 },
              maxRotation: 45,
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: chartGridColor(),
            },
            border: { display: false },
            ticks: {
              color: chartTickColor(),
              font: { size: 11 },
              callback: function (value) {
                return formatRevenueAxis(value, revenueUnit);
              },
            },
          },
        },
      },
    });
  }

  function buildTierChart(tiers) {
    if (!tierCanvas || typeof Chart === "undefined") return;

    const safeTiers = tiers && tiers.length
      ? tiers
      : [{ label: "No rides yet", value: 100, color: "#d1d5db" }];

    const legendEl = document.getElementById("tier-legend");
    if (legendEl) {
      legendEl.innerHTML = safeTiers.map(function (tier) {
        return (
          '<span class="tier-legend__item">' +
          '<span class="tier-legend__dot" style="background:' + tier.color + '"></span>' +
          tier.label +
          "</span>"
        );
      }).join("");
    }

    if (tierChart) {
      tierChart.destroy();
    }

    tierChart = new Chart(tierCanvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: safeTiers.map(function (t) { return t.label; }),
        datasets: [{
          data: safeTiers.map(function (t) { return t.value; }),
          backgroundColor: safeTiers.map(function (t) { return t.color; }),
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#111827",
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: function (context) {
                return context.label + ": " + context.parsed + "%";
              },
            },
          },
        },
      },
    });
  }

  function renderStats(stats) {
    const mapping = [
      ["stat-total-users", stats.total_users],
      ["stat-active-drivers", stats.active_drivers],
      ["stat-active-trips", stats.active_trips],
      ["stat-revenue", stats.revenue_mtd],
      ["stat-wallet", stats.wallet_funds],
      ["stat-completion", stats.completion_rate],
    ];
    mapping.forEach(function (entry) {
      const el = document.getElementById(entry[0]);
      const card = entry[1];
      if (!el || !card) return;
      el.textContent = card.value || "0";
      const trendEl = el.parentElement && el.parentElement.querySelector(".kpi-card__trend");
      if (trendEl && card.trend) {
        const prefix = trendEl.classList.contains("kpi-card__trend--live") ? "" : "▲ ";
        trendEl.innerHTML = prefix + card.trend;
      }
    });
  }

  function parseJsonResponse(res) {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Expected JSON from admin API");
    }
    return res.json();
  }

  function readBootstrapRevenue() {
    const el = document.getElementById("revenue-chart-bootstrap");
    if (!el || !el.textContent) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (err) {
      return null;
    }
  }

  function fetchStats() {
    return fetch("/admin/api/stats")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load stats");
        return parseJsonResponse(res);
      })
      .then(renderStats)
      .catch(function () {});
  }

  function fetchRevenue(period) {
    return fetch("/admin/api/revenue?period=" + encodeURIComponent(period), {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load revenue");
        return parseJsonResponse(res);
      })
      .then(function (data) {
        buildRevenueChart(data.labels || [], data.values || [], period, data);
      })
      .catch(function () {
        buildRevenueChart([], [], period, { unit: "raw", unit_label: "naira", total_ngn: 0 });
      });
  }

  function fetchTiers() {
    return fetch("/admin/api/ride-tiers", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load ride tiers");
        return parseJsonResponse(res);
      })
      .then(function (data) {
        buildTierChart(data.tiers || []);
      })
      .catch(function () {
        buildTierChart([]);
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

  const CAR_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">' +
    '<path d="M7 17h10M5 11l1.5-4h11L19 11"/>' +
    '<circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>' +
    "</svg>";

  function escapeMapHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function liveTripsFromData(tripData) {
    if (Array.isArray(tripData.trips) && tripData.trips.length) {
      return tripData.trips;
    }
    return (tripData.markers || []).map(function (m) {
      return {
        booking_id: m.city,
        status: m.status,
        vehicle_position: { lat: m.lat, lng: m.lng },
        pickup: null,
        destination: null,
      };
    });
  }

  function liveTripTitle(trip) {
    const parts = [];
    if (trip.booking_id) parts.push(trip.booking_id);
    if (trip.pickup_address || trip.destination_address) {
      parts.push((trip.pickup_address || "?") + " → " + (trip.destination_address || "?"));
    }
    const people = [trip.rider_name, trip.driver_name].filter(Boolean).join(" · ");
    if (people) parts.push(people);
    return parts.join(" · ");
  }

  function drawLiveTrip(trip, boundsPoints) {
    if (!mapSurface) return;
    const colors = markerColors(trip.status);

    if (trip.pickup && trip.destination) {
      const key = roadKey(trip.pickup, trip.destination);
      const road = roadCache[key];
      if (road && road.length >= 2) {
        mapSurface.addPolyline(road, {
          color: colors.color, weight: 5, opacity: 0.9,
        });
        road.forEach(function (pt) { boundsPoints.push(pt); });
      } else {
        const straight = [
          { lat: trip.pickup.lat, lng: trip.pickup.lng },
          { lat: trip.destination.lat, lng: trip.destination.lng },
        ];
        mapSurface.addPolyline(straight, {
          color: colors.color, weight: 4, opacity: 0.55, dashArray: "10, 8",
        });
        straight.forEach(function (pt) { boundsPoints.push(pt); });
        requestRoad(trip.pickup, trip.destination);
      }
    }

    if (trip.pickup) {
      mapSurface.addDomMarker(
        trip.pickup.lat,
        trip.pickup.lng,
        '<div class="map-marker-start"></div>',
        { size: [14, 14], anchor: [7, 7], zIndex: 100, title: "Pickup" }
      );
      boundsPoints.push({ lat: trip.pickup.lat, lng: trip.pickup.lng });
    }

    if (trip.destination) {
      mapSurface.addDomMarker(
        trip.destination.lat,
        trip.destination.lng,
        '<div class="map-marker-end"></div>',
        { size: [16, 16], anchor: [8, 8], zIndex: 100, title: "Destination" }
      );
      boundsPoints.push({ lat: trip.destination.lat, lng: trip.destination.lng });
    }

    const pos = trip.vehicle_position;
    if (pos && pos.lat != null && pos.lng != null) {
      const carHtml =
        '<div class="map-marker-vehicle map-marker-vehicle--' + escapeMapHtml(trip.status || "active") + '">' +
        CAR_SVG + "</div>";
      mapSurface.addDomMarker(pos.lat, pos.lng, carHtml, {
        size: [36, 36],
        anchor: [18, 18],
        zIndex: 200,
        title: liveTripTitle(trip),
      });
      boundsPoints.push({ lat: pos.lat, lng: pos.lng });
    }
  }

  function ensureLiveMap(tripData) {
    if (mapSurface) return Promise.resolve(mapSurface);
    if (mapInitPromise) return mapInitPromise;
    if (!mapEl || !window.JosRideMaps) {
      return Promise.reject(new Error("Map bootstrap missing"));
    }
    const mapCenter = tripData.map_center || { lat: 9.082, lng: 8.675 };
    const mapZoom = tripData.map_zoom || 6;
    mapInitPromise = window.JosRideMaps.createSurface(mapEl, {
      center: mapCenter,
      zoom: mapZoom,
      zoomControl: true,
      preferGoogle: true,
    }).then(function (surface) {
      mapSurface = surface;
      mapInitPromise = null;
      return surface;
    });
    return mapInitPromise;
  }

  function renderLiveTrips(tripData) {
    if (!mapSurface) return;
    const trips = liveTripsFromData(tripData);
    mapSurface.clearOverlays();

    const boundsPoints = [];
    trips.forEach(function (trip) {
      drawLiveTrip(trip, boundsPoints);
    });

    if (!liveHasFitBounds && boundsPoints.length) {
      fitMapToNigeria(boundsPoints);
      liveHasFitBounds = true;
    }

    const badge = document.getElementById("map-city-badge");
    if (badge) {
      badge.textContent = tripData.label || "Nigeria · Live ops";
    }
    const countEl = document.getElementById("live-trip-count");
    if (countEl && tripData.count !== undefined) {
      countEl.textContent = tripData.count.toLocaleString() + " trips in progress nationwide";
    }
  }

  function initLiveMap(tripData) {
    if (!mapEl) return;
    lastLiveTripData = tripData;
    ensureLiveMap(tripData)
      .then(function () {
        renderLiveTrips(tripData);
        window.setTimeout(function () {
          if (mapSurface) mapSurface.invalidateSize();
        }, 120);
      })
      .catch(function () {
        window.setTimeout(function () {
          if (!mapSurface) initLiveMap(tripData);
        }, 250);
      });
  }

  function fetchLiveTrips() {
    return fetch("/admin/api/live-trips")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load live trips");
        return res.json();
      })
      .then(initLiveMap);
  }

  function bindPeriodToggle() {
    const buttons = document.querySelectorAll(".period-toggle__btn");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        fetchRevenue(btn.dataset.period);
      });
    });
  }

  function init() {
    const hasDashboard = document.getElementById("revenue-chart") || document.getElementById("live-trip-map");
    if (!hasDashboard) return;

    bindPeriodToggle();
    fetchStats();

    const bootRevenue = readBootstrapRevenue();
    if (bootRevenue) {
      buildRevenueChart(
        bootRevenue.labels || [],
        bootRevenue.values || [],
        bootRevenue.period || "1Y",
        bootRevenue
      );
    } else {
      fetchRevenue("1Y");
    }
    // Refresh from API so period toggles and live totals stay accurate.
    fetchRevenue("1Y");
    fetchTiers();
    fetchLiveTrips();

    setInterval(fetchLiveTrips, 30000);
    setInterval(fetchStats, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
