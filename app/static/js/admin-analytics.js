(function () {
  "use strict";

  const chartGreen = "#0a4f2a";
  const chartGreenLight = "#86efac";
  const dailyCanvas = document.getElementById("analytics-daily-rides-chart");
  const successCanvas = document.getElementById("analytics-success-chart");
  const growthCanvas = document.getElementById("analytics-growth-chart");
  const successPercentEl = document.getElementById("analytics-success-percent");
  const heatmapEl = document.getElementById("analytics-heatmap");
  const toast = document.getElementById("analytics-toast");

  let dailyChart = null;
  let successChart = null;
  let growthChart = null;

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

  function buildDailyChart(labels, values) {
    if (!dailyCanvas || typeof Chart === "undefined") return;
    if (dailyChart) dailyChart.destroy();
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
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  function buildSuccessChart(data) {
    if (!successCanvas || typeof Chart === "undefined") return;
    const percent = Number(data.completion_percent || 0);
    if (successPercentEl) successPercentEl.textContent = percent.toFixed(1) + "%";
    if (successChart) successChart.destroy();
    successChart = new Chart(successCanvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Completed", "Other"],
        datasets: [{
          data: [percent, Math.max(0, 100 - percent)],
          backgroundColor: [chartGreen, "#e5e7eb"],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
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
            label: "Users",
            data: data.users || [],
            borderColor: chartGreen,
            backgroundColor: "transparent",
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2.5,
          },
          {
            label: "Drivers",
            data: data.drivers || [],
            borderColor: chartGreenLight,
            backgroundColor: "transparent",
            tension: 0.35,
            pointRadius: 0,
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
            labels: { boxWidth: 12, usePointStyle: true, font: { size: 12 } },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: "#f3f4f6" } },
        },
      },
    });
  }

  function renderHeatmap(data) {
    if (!heatmapEl) return;
    const cells = data.cells || [];
    const maxValue = Number(data.max_value || 0);
    heatmapEl.innerHTML = "";
    heatmapEl.style.gridTemplateColumns = "repeat(" + (data.cols || 11) + ", 1fr)";
    cells.forEach(function (row) {
      row.forEach(function (value) {
        const cell = document.createElement("div");
        cell.className = "analytics-heatmap__cell";
        const intensity = maxValue > 0 ? value / maxValue : 0;
        const alpha = 0.08 + intensity * 0.82;
        cell.style.background = "rgba(10, 79, 42, " + alpha.toFixed(2) + ")";
        cell.title = String(Math.round(value)) + " rides";
        heatmapEl.appendChild(cell);
      });
    });
  }

  Promise.all([
    apiRequest("/admin/api/analytics/daily-rides").then(function (data) {
      buildDailyChart(data.labels || [], data.values || []);
    }),
    apiRequest("/admin/api/analytics/success-rate").then(buildSuccessChart),
    apiRequest("/admin/api/analytics/growth").then(buildGrowthChart),
    apiRequest("/admin/api/analytics/heatmap?city=Lagos").then(renderHeatmap),
  ]).catch(function (err) {
    showToast(err.message, true);
  });
})();
