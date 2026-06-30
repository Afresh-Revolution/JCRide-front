(function () {
  "use strict";

  var dataEl = document.getElementById("earnings-chart-data");
  if (!dataEl || typeof Chart === "undefined") return;

  var data;
  try {
    data = JSON.parse(dataEl.textContent);
  } catch (err) {
    return;
  }

  var chartGreen = "#0a4f2a";
  var chartGreenLight = "rgba(13, 107, 56, 0.15)";
  var tickColor = "#9ca3af";
  var gridColor = "#f3f4f6";

  var weeklyCanvas = document.getElementById("earnings-weekly-chart");
  var dailyCanvas = document.getElementById("earnings-daily-chart");

  if (weeklyCanvas) {
    new Chart(weeklyCanvas, {
      type: "bar",
      data: {
        labels: data.weekly_trend.labels,
        datasets: [{
          data: data.weekly_trend.values,
          backgroundColor: chartGreen,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 48,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: tickColor },
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              callback: function (v) {
                return "₦" + (v / 1000) + "k";
              },
            },
          },
        },
      },
    });
  }

  if (dailyCanvas) {
    new Chart(dailyCanvas, {
      type: "line",
      data: {
        labels: data.daily_trips.labels,
        datasets: [{
          data: data.daily_trips.values,
          borderColor: chartGreen,
          backgroundColor: chartGreenLight,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: "#fff",
          pointBorderColor: chartGreen,
          pointBorderWidth: 2,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: tickColor },
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: tickColor },
          },
        },
      },
    });
  }
})();
