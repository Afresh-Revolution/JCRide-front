(function () {
  "use strict";
  const config = JSON.parse(document.getElementById("owner-config").textContent);
  const message = document.getElementById("owner-message");
  const toggle = document.getElementById("owner-toggle-calls");
  const refresh = document.getElementById("owner-refresh");
  let paused = null, loading = false, changing = false;
  const charts = {};
  const number = value => new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Number(value) || 0);
  const money = value => "NGN " + number(value);
  async function api(url, options) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
    const body = await response.json();
    if (response.status === 401 || response.status === 403) {
      window.location.assign(config.loginUrl);
      throw new Error("Please sign in again.");
    }
    if (!response.ok) throw new Error(body.message || "Could not reach the system. Try again.");
    return body;
  }
  function status(state) {
    paused = state.paused;
    const badge = document.getElementById("owner-call-state");
    badge.textContent = paused ? "Paused" : "Enabled";
    badge.classList.toggle("is-paused", paused);
    document.querySelector(".owner-call-card").classList.toggle("is-paused", paused);
    document.getElementById("owner-call-description").textContent = paused
      ? "In-app calls are paused for everyone. Calling stays off until you enable it."
      : "Riders and drivers can make in-app calls. Pausing also ends current calls.";
    document.getElementById("owner-call-updated").textContent = state.updated_at
      ? "Last changed: " + new Date(state.updated_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) : "";
    toggle.textContent = paused ? "Unpause calling" : "Pause calling";
    toggle.dataset.paused = String(paused);
    toggle.disabled = changing;
  }
  function chart(id, type, labels, datasets) {
    if (!window.Chart) return;
    if (charts[id]) { charts[id].data = { labels, datasets }; charts[id].update(); return; }
    charts[id] = new Chart(document.getElementById(id), { type, data: { labels, datasets },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } },
        ...(type === "doughnut" ? {} : { scales: { y: { beginAtZero: true }, x: { ticks: { maxTicksLimit: 8 } } } }) } });
  }
  function render(data) {
    const s = data.summary, c = data.calls || {}, o = data.operations || {}, trend = data.trend || [];
    const cards = [
      ["Total users", s.total_users], ["Riders", s.total_customers], ["Drivers", s.total_drivers], ["Online drivers", s.active_drivers],
      ["Total trips", s.total_trips], ["Active trips", s.active_trips], ["Today's trips", s.today_trips], ["Completed trips", s.completed_trips],
      ["Cancelled trips", s.cancelled_trips], ["Completion rate", number(s.completion_percent) + "%"],
      ["Trip fares this month", money(s.revenue_mtd)], ["Wallet funds", money(s.wallet_funds)],
      ["Open support tickets", o.open_support_tickets], ["Open SOS alerts", o.open_sos_alerts],
      ["Pending funding requests", o.pending_funding_requests], ["Pending withdrawals", o.pending_withdrawals],
      ["Bike delivery trips", o.bike_delivery_trips], ["Pending driver approvals", s.pending_drivers], ["Total calls", c.total], ["Active calls", c.active], ["Missed calls", c.missed],
    ];
    const grid = document.getElementById("owner-kpis");
    grid.replaceChildren(...cards.map(([label, value]) => {
      const card = document.createElement("article"); card.className = "kpi-card";
      const body = document.createElement("div"); body.className = "kpi-card__body";
      const title = document.createElement("span"); title.className = "kpi-card__label"; title.textContent = label;
      const metric = document.createElement("span"); metric.className = "kpi-card__value"; metric.textContent = typeof value === "string" ? value : number(value);
      body.append(title, metric); card.append(body); return card;
    }));
    grid.setAttribute("aria-busy", "false");
    const labels = trend.map(row => row.date);
    chart("owner-trips-chart", "bar", labels, [
      { label: "Completed", data: trend.map(row => row.completed_trips), backgroundColor: "#0d6b38" },
      { label: "Cancelled", data: trend.map(row => row.cancelled_trips), backgroundColor: "#e5ad56" },
    ]);
    chart("owner-revenue-chart", "line", labels, [{ label: "Trip fares (NGN)", data: trend.map(row => row.total_fare), borderColor: "#0d6b38", backgroundColor: "#e5f1e8", fill: true, tension: 0.25 }]);
    chart("owner-outcomes-chart", "doughnut", ["Completed", "Cancelled", "Active", "Other"], [{ data: [s.completed_trips, s.cancelled_trips, s.active_trips, Math.max(0, s.total_trips - s.completed_trips - s.cancelled_trips - s.active_trips)], backgroundColor: ["#0d6b38", "#e5ad56", "#60a5a5", "#d1d5db"] }]);
    chart("owner-calls-chart", "doughnut", ["Completed", "Missed", "Failed", "Active", "Other"], [{ data: [c.completed, c.missed, c.failed, c.active, Math.max(0, c.total - c.completed - c.missed - c.failed - c.active)], backgroundColor: ["#0d6b38", "#e5ad56", "#b65249", "#60a5a5", "#d1d5db"] }]);
    status(data.call_system);
    document.getElementById("owner-updated").textContent = "Updated " + new Date(data.generated_at).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos" }) + " WAT. Refreshes every 30 seconds.";
  }
  async function load() {
    if (loading || changing) return;
    loading = true; refresh.disabled = true;
    try {
      const data = await api(config.overviewUrl);
      if (!changing) render(data);
      message.classList.remove("is-error"); message.textContent = window.Chart ? "Overview is up to date." : "Numbers are up to date. Charts could not load; refresh to retry.";
    } catch (error) {
      message.textContent = error.message; message.classList.add("is-error");
      paused = null; toggle.disabled = true;
    } finally { loading = false; refresh.disabled = false; }
  }
  toggle.addEventListener("click", async () => {
    if (paused === null || changing || loading) return;
    const next = !paused;
    if (!window.confirm(next ? "Pause in-app calling for everyone and end current calls?" : "Enable in-app calling for riders and drivers?")) return;
    changing = true; toggle.disabled = true; refresh.disabled = true;
    try {
      const result = await api(config.callsUrl, { method: "PUT", headers: { "Content-Type": "application/json", "X-Owner-CSRF": config.csrf }, body: JSON.stringify({ paused: next }) });
      status(result);
      message.classList.remove("is-error"); message.textContent = next ? "Calling paused. Current calls ended: " + number(result.ended_calls) + "." : "Calling is enabled again.";
    } catch (error) {
      paused = null; message.textContent = error.message + " Refresh to confirm the current calling status."; message.classList.add("is-error");
    } finally { changing = false; toggle.disabled = paused === null; refresh.disabled = false; }
  });
  refresh.addEventListener("click", load);
  load(); setInterval(() => { if (!document.hidden) load(); }, 30000);
})();
