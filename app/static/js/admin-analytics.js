(function () {
  "use strict";

  const chartGreen = "#0a4f2a";
  const chartGreenLight = "#86efac";
  const tierColors = {
    Economy: "#0d6b38",
    Comfort: "#22c55e",
    Premium: "#065f46",
  };

  const dailyCanvas = document.getElementById("analytics-daily-rides-chart");
  const successCanvas = document.getElementById("analytics-success-chart");
  const tierCanvas = document.getElementById("analytics-tier-chart");
  const growthCanvas = document.getElementById("analytics-growth-chart");
  const successPercentEl = document.getElementById("analytics-success-percent");
  const successFootnoteEl = document.getElementById("analytics-success-footnote");
  const dailyTotalEl = document.getElementById("analytics-daily-total");
  const heatmapEl = document.getElementById("analytics-heatmap");
  const heatmapRowsEl = document.getElementById("analytics-heatmap-rows");
  const heatmapTitleEl = document.getElementById("analytics-heatmap-title");
  const citySelect = document.getElementById("analytics-city-select");
  const citiesBody = document.getElementById("analytics-cities-body");
  const tierLegendEl = document.getElementById("analytics-tier-legend");
  const toast = document.getElementById("analytics-toast");

  let dailyChart = null;
  let successChart = null;
  let tierChart = null;
  let growthChart = null;

  function isDarkTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function chartGridColor() {
    return isDarkTheme() ? "#374151" : "#f3f4f6";
  }

  function chartTrackColor() {
    return isDarkTheme() ? "#374151" : "#e5e7eb";
  }

  function chartTickColor() {
    return isDarkTheme() ? "#9ca3af" : "#6b7280";
  }

  function showToast(message, isError) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { toast.hidden = true; }, 4000);
  }

  function apiRequest(url) {
    return fetch(url).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.detail || "Request failed");
        return data;
      });
    });
  }

  function formatCount(n) {
    return Number(n || 0).toLocaleString();
  }

  function renderSummaryStats(stats) {
    const users = stats.total_users || {};
    const drivers = stats.active_drivers || {};
    const trips = stats.total_trips || stats.active_trips || {};
    const revenue = stats.revenue_mtd || {};
    const completion = stats.completion_rate || {};

    const usersEl = document.getElementById("analytics-kpi-users");
    const usersTrendEl = document.getElementById("analytics-kpi-users-trend");
    const driversEl = document.getElementById("analytics-kpi-drivers");
    const driversTrendEl = document.getElementById("analytics-kpi-drivers-trend");
    const tripsEl = document.getElementById("analytics-kpi-trips");
    const tripsTrendEl = document.getElementById("analytics-kpi-trips-trend");
    const revenueEl = document.getElementById("analytics-kpi-revenue");
    const revenueTrendEl = document.getElementById("analytics-kpi-revenue-trend");

    if (usersEl) usersEl.textContent = users.value || "0";
    if (usersTrendEl) usersTrendEl.textContent = users.trend || "—";
    if (driversEl) driversEl.textContent = drivers.value || "0";
    if (driversTrendEl) driversTrendEl.textContent = drivers.trend || "—";
    if (tripsEl) tripsEl.textContent = trips.value || "0";
    if (tripsTrendEl) tripsTrendEl.textContent = completion.trend || trips.trend || "—";
    if (revenueEl) revenueEl.textContent = revenue.value || "₦0";
    if (revenueTrendEl) revenueTrendEl.textContent = revenue.trend || completion.value || "—";
  }

  function loadSummaryStats() {
    return apiRequest("/admin/api/stats")
      .then(renderSummaryStats)
      .catch(function () {});
  }

  function buildDailyChart(labels, values, total) {
    if (!dailyCanvas || typeof Chart === "undefined") return;
    if (dailyChart) dailyChart.destroy();
    if (dailyTotalEl) {
      dailyTotalEl.textContent = formatCount(total) + " rides in period";
    }
    dailyChart = new Chart(dailyCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: "rgba(134, 239, 172, 0.85)",
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: chartTickColor(), maxRotation: 45 } },
          y: { beginAtZero: true, grid: { color: chartGridColor() }, ticks: { font: { size: 11 }, color: chartTickColor(), precision: 0 } },
        },
      },
    });
  }

  function buildSuccessChart(data) {
    if (!successCanvas || typeof Chart === "undefined") return;
    const completed = Number(data.completed || 0);
    const cancelled = Number(data.cancelled || 0);
    const other = Number(data.other || 0);
    const total = Number(data.total || completed + cancelled + other);
    const percent = total ? (completed / total) * 100 : Number(data.completion_percent || 0);

    if (successPercentEl) successPercentEl.textContent = percent.toFixed(1) + "%";
    if (successFootnoteEl) {
      successFootnoteEl.textContent =
        formatCount(completed) + " completed · " +
        formatCount(cancelled) + " cancelled · " +
        formatCount(other) + " in progress";
    }

    if (successChart) successChart.destroy();
    successChart = new Chart(successCanvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Completed", "Cancelled", "Other"],
        datasets: [{
          data: total ? [completed, cancelled, other] : [0, 0, 1],
          backgroundColor: [chartGreen, "#ef4444", chartTrackColor()],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: { legend: { display: false }, tooltip: { enabled: total > 0 } },
      },
    });
  }

  function buildTierChart(tiers) {
    if (!tierCanvas || typeof Chart === "undefined") return;
    const safeTiers = tiers && tiers.length
      ? tiers
      : [{ label: "No rides yet", value: 100, color: "#d1d5db" }];

    if (tierLegendEl) {
      tierLegendEl.innerHTML = safeTiers.map(function (tier) {
        return (
          '<span class="analytics-tier-legend__item">' +
          '<span class="analytics-tier-legend__dot" style="background:' + (tier.color || tierColors[tier.label] || chartGreen) + '"></span>' +
          escapeHtml(tier.label) + " (" + tier.value + "%)" +
          "</span>"
        );
      }).join("");
    }

    if (tierChart) tierChart.destroy();
    tierChart = new Chart(tierCanvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: safeTiers.map(function (t) { return t.label; }),
        datasets: [{
          data: safeTiers.map(function (t) { return t.value; }),
          backgroundColor: safeTiers.map(function (t) { return t.color || tierColors[t.label] || chartGreen; }),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: { legend: { display: false } },
      },
    });
  }

  function buildGrowthChart(data) {
    if (!growthCanvas || typeof Chart === "undefined") return;
    if (growthChart) growthChart.destroy();
    growthChart = new Chart(growthCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: data.labels || [],
        datasets: [
          {
            label: "Riders",
            data: data.users || [],
            borderColor: chartGreen,
            backgroundColor: "transparent",
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2.5,
          },
          {
            label: "Drivers",
            data: data.drivers || [],
            borderColor: chartGreenLight,
            backgroundColor: "transparent",
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, usePointStyle: true, font: { size: 12 }, color: chartTickColor() },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: chartTickColor() } },
          y: {
            beginAtZero: true,
            grid: { color: chartGridColor() },
            ticks: { color: chartTickColor(), precision: 0 },
          },
        },
      },
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function renderHeatmap(data) {
    if (!heatmapEl) return;
    const cells = data.cells || [];
    const rowLabels = data.rows || [];
    const maxValue = Number(data.max_value || 0);

    if (heatmapTitleEl) {
      heatmapTitleEl.textContent = data.label || "Demand heatmap";
    }

    if (heatmapRowsEl) {
      heatmapRowsEl.innerHTML = "";
      if (rowLabels.length) {
        rowLabels.forEach(function (label) {
          const item = document.createElement("li");
          item.textContent = label;
          heatmapRowsEl.appendChild(item);
        });
        heatmapRowsEl.hidden = false;
      } else {
        heatmapRowsEl.hidden = true;
      }
    }

    heatmapEl.innerHTML = "";
    if (!cells.length) {
      heatmapEl.innerHTML = '<p class="analytics-empty">No ride demand data for this city yet.</p>';
      return;
    }

    heatmapEl.style.gridTemplateColumns = "repeat(" + (data.cols || 11) + ", 1fr)";
    cells.forEach(function (row, rowIndex) {
      row.forEach(function (value, colIndex) {
        const cell = document.createElement("div");
        cell.className = "analytics-heatmap__cell";
        const intensity = maxValue > 0 ? value / maxValue : 0;
        const alpha = 0.08 + intensity * 0.82;
        cell.style.background = "rgba(10, 79, 42, " + alpha.toFixed(2) + ")";
        const zoneLabel = rowLabels[rowIndex] ? rowLabels[rowIndex] + " · " : "";
        cell.title = zoneLabel + "Band " + (colIndex + 1) + ": " + Math.round(value) + " rides";
        heatmapEl.appendChild(cell);
      });
    });
  }

  function renderCitiesTable(data) {
    if (!citiesBody) return;
    const cities = data.cities || [];
    if (!cities.length) {
      citiesBody.innerHTML = '<tr><td colspan="4">No city data yet.</td></tr>';
      return;
    }
    citiesBody.innerHTML = cities.map(function (row) {
      return (
        "<tr>" +
        "<td>" + escapeHtml(row.city) + "</td>" +
        "<td>" + formatCount(row.total_trips) + "</td>" +
        "<td>" + formatCount(row.completed_trips) + "</td>" +
        "<td>" + formatCount(row.active_drivers) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function populateCitySelect(data) {
    if (!citySelect) return;
    const cities = data.cities || [];
    const current = citySelect.value || "Lagos";
    citySelect.innerHTML = cities.map(function (row) {
      return '<option value="' + escapeHtml(row.city) + '">' + escapeHtml(row.city) + "</option>";
    }).join("");
    if (cities.some(function (row) { return row.city === current; })) {
      citySelect.value = current;
    } else if (cities.length) {
      citySelect.value = cities[0].city;
    }
  }

  function loadHeatmap(city) {
    const selected = city || (citySelect ? citySelect.value : "Lagos");
    return apiRequest("/admin/api/analytics/heatmap?city=" + encodeURIComponent(selected))
      .then(renderHeatmap);
  }

  function loadCities() {
    return apiRequest("/admin/api/analytics/cities")
      .then(function (data) {
        renderCitiesTable(data);
        populateCitySelect(data);
        return data;
      });
  }

  function init() {
    loadSummaryStats();

    Promise.all([
      apiRequest("/admin/api/analytics/daily-rides").then(function (data) {
        buildDailyChart(data.labels || [], data.values || [], data.total || 0);
      }),
      apiRequest("/admin/api/analytics/success-rate").then(buildSuccessChart),
      apiRequest("/admin/api/analytics/growth").then(buildGrowthChart),
      apiRequest("/admin/api/analytics/tier-split").then(function (data) {
        buildTierChart(data.tiers || []);
      }),
      loadCities().then(function () {
        return loadHeatmap();
      }),
    ]).catch(function (err) {
      showToast(err.message, true);
    });

    if (citySelect) {
      citySelect.addEventListener("change", function () {
        loadHeatmap(citySelect.value).catch(function (err) {
          showToast(err.message, true);
        });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
