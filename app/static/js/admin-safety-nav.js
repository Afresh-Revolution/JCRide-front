(function () {
  "use strict";

  var POLL_MS = 20000;
  var BADGE_MAP = {
    sos: { key: "sos_pending", label: "SOS Alerts", alert: true },
    accidents: { key: "accident_pending", label: "Accidents", alert: true },
    drivers: { key: "drivers_pending", label: "Drivers", alert: false },
    bike_delivery: { key: "bike_delivery_pending", label: "Bike Delivery", alert: false },
    tricycle: { key: "tricycle_pending", label: "Tricycle", alert: false },
    subscriptions: { key: "subscriptions_pending", label: "Subscriptions", alert: false },
    transactions: { key: "transactions_pending", label: "Transactions", alert: false },
    payments: { key: "payments_pending", label: "Payments", alert: false },
    wallets: { key: "wallets_pending", label: "Wallets", alert: false },
    support: { key: "support_pending", label: "Support", alert: false },
  };

  var lastSummary = {
    sos_pending: 0,
    accident_pending: 0,
    drivers_pending: 0,
    bike_delivery_pending: 0,
    tricycle_pending: 0,
    subscriptions_pending: 0,
    transactions_pending: 0,
    payments_pending: 0,
    wallets_pending: 0,
    support_pending: 0,
  };

  function setNavBadge(navKey, count, label, asAlert) {
    var link =
      document.querySelector('[data-nav-key="' + navKey + '"]') ||
      document.querySelector('[data-safety-nav="' + navKey + '"]');
    var badge =
      document.querySelector('[data-nav-badge="' + navKey + '"]') ||
      document.querySelector('[data-safety-badge="' + navKey + '"]');
    if (!link && !badge) return;

    var pending = Math.max(0, Number(count) || 0);
    var hasCount = pending > 0;

    if (link) {
      if (asAlert) {
        link.classList.toggle("is-alert", hasCount);
      } else {
        link.classList.toggle("has-badge", hasCount);
      }
      link.setAttribute(
        "aria-label",
        hasCount ? label + " (" + pending + " pending)" : label
      );
    }

    if (!badge) return;
    if (hasCount) {
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

  function applySummary(data) {
    data = data || {};
    Object.keys(lastSummary).forEach(function (key) {
      if (typeof data[key] !== "undefined") {
        lastSummary[key] = data[key];
      }
    });

    Object.keys(BADGE_MAP).forEach(function (navKey) {
      var meta = BADGE_MAP[navKey];
      setNavBadge(navKey, lastSummary[meta.key], meta.label, meta.alert);
    });
  }

  function refresh() {
    return fetch("/admin/api/nav-summary", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("summary failed");
        return res.json();
      })
      .then(applySummary)
      .catch(function () {
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

  window.addEventListener("admin-nav-summary-changed", function (event) {
    if (event && event.detail) {
      applySummary(event.detail);
      return;
    }
    refresh();
  });

  refresh();
  window.setInterval(refresh, POLL_MS);
})();
