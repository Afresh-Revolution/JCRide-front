(function () {
  const canvas = document.getElementById("earningsChart");
  if (!canvas || !window.weeklyEarnings || typeof Chart === "undefined") return;

  const { labels, values } = window.weeklyEarnings;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const lineColor = dark ? "#4ade80" : "#0d5c34";
  const fillColor = dark ? "rgba(74, 222, 128, 0.12)" : "rgba(13, 92, 52, 0.12)";
  const tickColor = dark ? "#9ca3af" : "#9ca3af";
  const gridColor = dark ? "#374151" : "#f3f4f6";

  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        backgroundColor: fillColor,
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
          ticks: { color: tickColor },
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            callback: (v) => "₦" + (v / 1000) + "k",
          },
        },
      },
    },
  });
})();
