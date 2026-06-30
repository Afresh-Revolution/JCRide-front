(function () {
  "use strict";

  const revenueCanvas = document.getElementById("revenue-chart");
  const tierCanvas = document.getElementById("tier-chart");
  const mapEl = document.getElementById("live-trip-map");
  const revenueSubtitleEl = document.getElementById("revenue-chart-subtitle");
  const revenueEmptyEl = document.getElementById("revenue-chart-empty");

  let revenueChart = null;
  let tierChart = null;
  let liveMap = null;
  let revenueUnit = "raw";

  const chartGreen = "#0a4f2a";
  const chartGreenLight = "rgba(13, 107, 56, 0.15)";
  const NIGERIA_BOUNDS = [[4.2, 2.8], [13.9, 14.6]];

  let liveMapTileLayer = null;

  function isDarkTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function adminTileLayerUrl() {
    return isDarkTheme()
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }

  function chartGridColor() {
    return isDarkTheme() ? "#374151" : "#f3f4f6";
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
        labels: labels.length ? labels : ["—"],
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

  function fetchStats() {
    return fetch("/admin/api/stats")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load stats");
        return res.json();
      })
      .then(renderStats)
      .catch(function () {});
  }

  function fetchRevenue(period) {
    return fetch("/admin/api/revenue?period=" + encodeURIComponent(period))
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load revenue");
        return res.json();
      })
      .then(function (data) {
        buildRevenueChart(data.labels || [], data.values || [], period, data);
      })
      .catch(function () {
        buildRevenueChart([], [], period, { unit: "raw", unit_label: "naira", total_ngn: 0 });
      });
  }

  function fetchTiers() {
    return fetch("/admin/api/ride-tiers")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        buildTierChart(data.tiers || []);
      });
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

  function initLiveMap(tripData) {
    if (!mapEl || typeof L === "undefined") return;

    if (liveMap) {
      liveMap.remove();
      liveMap = null;
    }

    const mapCenter = tripData.map_center || { lat: 9.082, lng: 8.675 };
    const mapZoom = tripData.map_zoom || 6;
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

    const boundsPoints = markers.map(function (m) { return [m.lat, m.lng]; });
    if (route.length >= 2) {
      boundsPoints.push.apply(boundsPoints, route);
    }
    if (tripData.start) boundsPoints.push([tripData.start.lat, tripData.start.lng]);
    if (tripData.end) boundsPoints.push([tripData.end.lat, tripData.end.lng]);
    if (tripData.vehicle_position) {
      boundsPoints.push([tripData.vehicle_position.lat, tripData.vehicle_position.lng]);
    }

    fitMapToNigeria(liveMap, boundsPoints, markers.length);

    const badge = document.getElementById("map-city-badge");
    if (badge) {
      badge.textContent = tripData.label || "Nigeria · Live ops";
    }

    const countEl = document.getElementById("live-trip-count");
    if (countEl && tripData.count !== undefined) {
      countEl.textContent = tripData.count.toLocaleString() + " trips in progress nationwide";
    }
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
