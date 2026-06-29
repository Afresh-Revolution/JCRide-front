(function () {
  const canvas = document.getElementById("earningsChart");
  if (!canvas || !window.weeklyEarnings || typeof Chart === "undefined") return;

  const { labels, values } = window.weeklyEarnings;

  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: "#0d5c34",
        backgroundColor: "rgba(13, 92, 52, 0.12)",
        fill: true,
        tension: 0.4,
        pointRadius: 0,
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
          ticks: { color: "#9ca3af" },
        },
        y: {
          grid: { color: "#f3f4f6" },
          ticks: {
            color: "#9ca3af",
            callback: (v) => "₦" + (v / 1000) + "k",
          },
        },
      },
    },
  });
})();
