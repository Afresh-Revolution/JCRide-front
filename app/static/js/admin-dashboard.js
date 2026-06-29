(function () {
  "use strict";

  const revenueCanvas = document.getElementById("revenue-chart");
  const tierCanvas = document.getElementById("tier-chart");
  const mapEl = document.getElementById("live-trip-map");

  let revenueChart = null;
  let tierChart = null;
  let liveMap = null;

  const chartGreen = "#0a4f2a";
  const chartGreenLight = "rgba(13, 107, 56, 0.15)";

  function formatRevenue(value, period) {
    if (period === "All") {
      return `₦${value}M`;
    }
    return `₦${value}M`;
  }

  function buildRevenueChart(labels, values, period) {
    if (!revenueCanvas || typeof Chart === "undefined") return;

    const ctx = revenueCanvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, "rgba(13, 107, 56, 0.28)");
    gradient.addColorStop(1, "rgba(13, 107, 56, 0.02)");

    if (revenueChart) {
      revenueChart.destroy();
    }

    revenueChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Revenue",
          data: values,
          borderColor: chartGreen,
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.42,
          pointRadius: 0,
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
                const value = context.parsed.y;
                const unit = period === "All" ? "₦ millions (annual)" : "₦ millions";
                return `${formatRevenue(value, period)} · ${unit}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: "#9ca3af",
              font: { size: 11 },
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "#f3f4f6",
            },
            border: { display: false },
            ticks: {
              color: "#9ca3af",
              font: { size: 11 },
              callback: function (value) {
                return "₦" + value + "M";
              },
            },
          },
        },
      },
    });
  }

  function buildTierChart(tiers) {
    if (!tierCanvas || typeof Chart === "undefined") return;

    const legendEl = document.getElementById("tier-legend");
    if (legendEl) {
      legendEl.innerHTML = tiers.map(function (tier) {
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
        labels: tiers.map(function (t) { return t.label; }),
        datasets: [{
          data: tiers.map(function (t) { return t.value; }),
          backgroundColor: tiers.map(function (t) { return t.color; }),
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

  function fetchRevenue(period) {
    return fetch("/admin/api/revenue?period=" + encodeURIComponent(period))
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load revenue");
        return res.json();
      })
      .then(function (data) {
        buildRevenueChart(data.labels || [], data.values || [], period);
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

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(liveMap);

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

    if (boundsPoints.length > 1) {
      liveMap.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [48, 48],
        maxZoom: markers.length > 1 ? 7 : 14,
      });
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
    fetchRevenue("1Y");
    fetchTiers();
    fetchLiveTrips();

    setInterval(fetchLiveTrips, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
