(function () {
  "use strict";

  const ALERT_TOGGLES = [
    { key: "driver_compliance", label: "Driver compliance" },
    { key: "payment_settlements", label: "Payment settlements" },
    { key: "fraud_security", label: "Fraud & security" },
    { key: "system_performance", label: "System performance" },
    { key: "surge_events", label: "Surge events" },
    { key: "support_escalations", label: "Support escalations" },
  ];

  const DELIVERY_TOGGLES = [
    { key: "delivery_in_app", label: "In-app" },
    { key: "delivery_email", label: "Email — ops team" },
    { key: "delivery_slack", label: "Slack #ops-alerts" },
    { key: "delivery_sms_critical", label: "SMS — critical only" },
  ];

  const state = { severity: "" };
  const listEl = document.getElementById("notifications-list");
  const subEl = document.getElementById("notifications-inbox-sub");
  const severitySelect = document.getElementById("notifications-severity-select");
  const markAllBtn = document.getElementById("notifications-mark-all");
  const alertTogglesEl = document.getElementById("notifications-alert-toggles");
  const deliveryTogglesEl = document.getElementById("notifications-delivery-toggles");
  const toast = document.getElementById("notifications-toast");

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

  function iconForType(type) {
    const value = String(type || "").toLowerCase();
    if (value.includes("wallet") || value.includes("settlement") || value.includes("payment")) {
      return { cls: "notification-item__icon--wallet", glyph: "₦" };
    }
    if (value.includes("driver") || value.includes("application")) {
      return { cls: "notification-item__icon--users", glyph: "👥" };
    }
    if (value.includes("security") || value.includes("login") || value.includes("fraud")) {
      return { cls: "notification-item__icon--security", glyph: "🛡" };
    }
    if (value.includes("latency") || value.includes("performance") || value.includes("api")) {
      return { cls: "notification-item__icon--performance", glyph: "📈" };
    }
    if (value.includes("surge")) {
      return { cls: "notification-item__icon--surge", glyph: "⚠" };
    }
    return { cls: "notification-item__icon--default", glyph: "•" };
  }

  function renderList(data) {
    const items = data.notifications || [];
    if (subEl) {
      subEl.textContent = (data.unread_count || 0) + " unread · all severities";
    }
    if (!listEl) return;
    if (!items.length) {
      listEl.innerHTML = '<p class="notifications-empty">No notifications yet.</p>';
      return;
    }
    listEl.innerHTML = items.map(function (item) {
      const icon = iconForType(item.type);
      const unreadClass = item.is_unread ? " is-unread" : "";
      const dot = item.is_unread ? '<span class="notification-item__dot" aria-hidden="true"></span>' : "";
      return (
        '<article class="notification-item' + unreadClass + '">' +
          '<div class="notification-item__icon ' + icon.cls + '" aria-hidden="true">' + icon.glyph + '</div>' +
          '<div>' +
            '<div class="notification-item__title-row">' +
              dot +
              '<h3 class="notification-item__title">' + escapeHtml(item.title) + '</h3>' +
            '</div>' +
            '<p class="notification-item__body">' + escapeHtml(item.body) + '</p>' +
          '</div>' +
          '<time class="notification-item__time">' + escapeHtml(item.time_label) + '</time>' +
        '</article>'
      );
    }).join("");
  }

  function renderToggleGroup(container, items, settings) {
    if (!container) return;
    container.innerHTML = items.map(function (item) {
      const checked = settings[item.key] !== false ? " checked" : "";
      return (
        '<li class="notifications-toggle">' +
          '<span>' + escapeHtml(item.label) + '</span>' +
          '<input type="checkbox" data-key="' + escapeHtml(item.key) + '"' + checked + ' aria-label="' + escapeHtml(item.label) + '">' +
        '</li>'
      );
    }).join("");
    container.querySelectorAll("input[type=checkbox]").forEach(function (input) {
      input.addEventListener("change", saveSettings);
    });
  }

  function loadSettings() {
    return apiRequest("/admin/api/notifications/ops/settings")
      .then(function (settings) {
        renderToggleGroup(alertTogglesEl, ALERT_TOGGLES, settings);
        renderToggleGroup(deliveryTogglesEl, DELIVERY_TOGGLES, settings);
      })
      .catch(function () {});
  }

  function saveSettings() {
    const payload = {};
    document.querySelectorAll(".notifications-toggle input[data-key]").forEach(function (input) {
      payload[input.getAttribute("data-key")] = input.checked;
    });
    apiRequest("/admin/api/notifications/ops/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(function (err) {
      showToast(err.message, true);
    });
  }

  function loadNotifications() {
    const params = new URLSearchParams();
    if (state.severity) params.set("severity", state.severity);
    return apiRequest("/admin/api/notifications/ops?" + params.toString())
      .then(renderList)
      .catch(function (err) {
        if (listEl) listEl.innerHTML = '<p class="notifications-empty">' + escapeHtml(err.message) + '</p>';
      });
  }

  if (severitySelect) {
    severitySelect.addEventListener("change", function () {
      state.severity = severitySelect.value;
      loadNotifications();
    });
  }

  if (markAllBtn) {
    markAllBtn.addEventListener("click", function () {
      apiRequest("/admin/api/notifications/ops/mark-all-read", { method: "POST" })
        .then(function () {
          showToast("All notifications marked as read.");
          loadNotifications();
        })
        .catch(function (err) { showToast(err.message, true); });
    });
  }

  loadNotifications();
  loadSettings();
})();
