(function () {
  "use strict";

  var POLL_MS = 15000;
  var sosLink = document.getElementById("admin-nav-sos");
  var accidentLink = document.getElementById("admin-nav-accidents");
  if (!sosLink && !accidentLink) return;

  function setNavAlert(link, badge, count, label) {
    if (!link) return;
    var pending = Math.max(0, Number(count) || 0);
    var hasAlert = pending > 0;
    link.classList.toggle("is-alert", hasAlert);
    link.setAttribute("aria-label", hasAlert ? label + " (" + pending + " new)" : label);
    if (!badge) return;
    if (hasAlert) {
      badge.hidden = false;
      badge.setAttribute("aria-hidden", "false");
      badge.textContent = pending > 99 ? "99+" : String(pending);
      badge.classList.toggle("notification-badge--wide", String(badge.textContent).length > 1);
    } else {
      badge.hidden = true;
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "0";
      badge.classList.remove("notification-badge--wide");
    }
  }

  var lastSummary = { sos_pending: 0, accident_pending: 0 };

  function applySummary(data) {
    data = data || {};
    if (typeof data.sos_pending !== "undefined") {
      lastSummary.sos_pending = data.sos_pending;
    }
    if (typeof data.accident_pending !== "undefined") {
      lastSummary.accident_pending = data.accident_pending;
    }
    setNavAlert(
      sosLink,
      document.querySelector('[data-safety-badge="sos"]'),
      lastSummary.sos_pending,
      "SOS Alerts"
    );
    setNavAlert(
      accidentLink,
      document.querySelector('[data-safety-badge="accidents"]'),
      lastSummary.accident_pending,
      "Accidents"
    );
  }

  function refresh() {
    return fetch("/admin/api/safety-alerts/summary", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("summary failed");
        return res.json();
      })
      .then(applySummary)
      .catch(function () {
        /* keep last known state */
      });
  }

  window.AdminSafetyNav = {
    refresh: refresh,
    apply: applySummary,
  };

  window.addEventListener("admin-safety-alerts-changed", function (event) {
    if (event && event.detail) {
      applySummary(event.detail);
      return;
    }
    refresh();
  });

  refresh();
  window.setInterval(refresh, POLL_MS);
})();
