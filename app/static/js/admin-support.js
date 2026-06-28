(function () {
  "use strict";

  const state = { status: "" };
  const listEl = document.getElementById("support-tickets-list");
  const agentsEl = document.getElementById("support-agents-list");
  const slaFirst = document.getElementById("sla-first-reply");
  const slaResolution = document.getElementById("sla-resolution");
  const slaCsat = document.getElementById("sla-csat");
  const toast = document.getElementById("support-toast");
  const filters = document.querySelectorAll(".support-filter");

  function showToast(message, isError) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { toast.hidden = true; }, 4000);
  }

  function apiRequest(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.detail || "Request failed");
        return data;
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function initials(name) {
    const parts = String(name || "?").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0] || "?").slice(0, 2).toUpperCase();
  }

  function statusClass(status) {
    if (status === "resolved" || status === "closed") return "support-status--resolved";
    if (status === "in_review") return "support-status--in_review";
    return "support-status--open";
  }

  function statusLabel(status) {
    if (status === "in_review") return "Open";
    if (status === "closed") return "Resolved";
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function renderTickets(data) {
    const tickets = data.tickets || [];
    if (!listEl) return;
    if (!tickets.length) {
      listEl.innerHTML = '<p class="support-empty">No tickets found.</p>';
      return;
    }
    listEl.innerHTML = tickets.map(function (ticket) {
      const agent = ticket.assigned_agent ? " · agent " + escapeHtml(ticket.assigned_agent.split(" ")[0]) : "";
      return (
        '<article class="support-ticket">' +
          '<div class="support-ticket__avatar" aria-hidden="true">' + escapeHtml(initials(ticket.user_name)) + '</div>' +
          '<div class="support-ticket__content">' +
            '<div class="support-ticket__meta">' +
              '<span class="support-ticket__ref">' + escapeHtml(ticket.reference) + '</span>' +
              '<span class="support-priority support-priority--' + escapeHtml(ticket.priority) + '">' + escapeHtml(ticket.priority) + '</span>' +
            '</div>' +
            '<h3 class="support-ticket__subject">' + escapeHtml(ticket.subject) + '</h3>' +
            '<p class="support-ticket__detail">' + escapeHtml(ticket.user_name) + agent + ' · opened ' + escapeHtml(ticket.opened_ago) + '</p>' +
          '</div>' +
          '<span class="support-status ' + statusClass(ticket.status) + '">' + escapeHtml(statusLabel(ticket.status)) + '</span>' +
        '</article>'
      );
    }).join("");
  }

  function renderSla(data) {
    if (slaFirst) slaFirst.textContent = data.first_reply || "—";
    if (slaResolution) slaResolution.textContent = data.resolution || "—";
    if (slaCsat) slaCsat.textContent = (data.csat_percent != null ? data.csat_percent + "%" : "—");
  }

  function renderAgents(data) {
    const agents = data.agents || [];
    if (!agentsEl) return;
    if (!agents.length) {
      agentsEl.innerHTML = '<li class="support-empty">No agents online.</li>';
      return;
    }
    agentsEl.innerHTML = agents.map(function (agent) {
      return (
        '<li class="support-agent">' +
          '<div class="support-agent__avatar" aria-hidden="true">' + escapeHtml(agent.initials) + '</div>' +
          '<div>' +
            '<span class="support-agent__name">' + escapeHtml(agent.name) + '</span>' +
            '<span class="support-agent__stats">' + agent.open_tickets + ' open · ' + agent.solved_today + ' solved today</span>' +
          '</div>' +
        '</li>'
      );
    }).join("");
  }

  function loadTickets() {
    const params = new URLSearchParams();
    if (state.status) params.set("status", state.status);
    params.set("limit", "20");
    return apiRequest("/admin/api/support/tickets?" + params.toString())
      .then(renderTickets)
      .catch(function (err) {
        if (listEl) listEl.innerHTML = '<p class="support-empty">' + escapeHtml(err.message) + '</p>';
      });
  }

  function loadSidebar() {
    Promise.all([
      apiRequest("/admin/api/support/sla").then(renderSla).catch(function () {}),
      apiRequest("/admin/api/support/agents").then(renderAgents).catch(function () {}),
    ]);
  }

  filters.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filters.forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      state.status = btn.getAttribute("data-status") || "";
      loadTickets();
    });
  });

  loadTickets();
  loadSidebar();
})();
