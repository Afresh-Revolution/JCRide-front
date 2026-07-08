(function () {
  "use strict";

  const state = {
    filter: "all",
    items: [],
  };

  const listEl = document.getElementById("sos-list");
  const refreshBtn = document.getElementById("sos-refresh-btn");
  const toast = document.getElementById("sos-toast");

  function showToast(message, isError) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.hidden = true;
    }, 4000);
  }

  function apiRequest(url, options) {
    return fetch(url, options || {}).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.message || data.detail || "Request failed");
        }
        return data;
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString();
  }

  function queueStatusClass(status) {
    return "queue-status queue-status--" + String(status || "triggered").replace(/\s+/g, "_");
  }

  function filteredItems() {
    if (state.filter === "all") return state.items;
    return state.items.filter(function (item) {
      return item.status === state.filter;
    });
  }

  function mapsLink(lat, lng) {
    if (lat == null || lng == null) return "";
    const url = "https://www.google.com/maps?q=" + encodeURIComponent(lat + "," + lng);
    return '<a href="' + url + '" target="_blank" rel="noopener">View on map</a>';
  }

  function renderList() {
    if (!listEl) return;
    const items = filteredItems();
    if (!items.length) {
      listEl.innerHTML = '<p class="sos-list__empty">No SOS alerts in this view.</p>';
      return;
    }
    listEl.innerHTML = items
      .map(function (item) {
        const cardClass = item.status === "triggered" ? " sos-card--triggered" : "";
        const coords =
          item.lat != null && item.lng != null
            ? '<p class="sos-card__coords">' + escapeHtml(item.lat) + ", " + escapeHtml(item.lng) + " · " + mapsLink(item.lat, item.lng) + "</p>"
            : "";
        return (
          '<article class="sos-card' + cardClass + '" data-sos-id="' + escapeHtml(item.id) + '">' +
          '<div class="sos-card__main">' +
          '<div class="sos-card__meta">' +
          '<span class="sos-card__ride">Ride ' + escapeHtml(item.ride_short) + "</span>" +
          '<span class="' + queueStatusClass(item.status) + '">' + escapeHtml(item.status.replace("_", " ")) + "</span>" +
          '<span class="sos-card__time">' + escapeHtml(formatDate(item.triggered_at)) + "</span>" +
          "</div>" +
          '<p class="sos-card__message">' + escapeHtml(item.message) + "</p>" +
          coords +
          "</div>" +
          '<div class="sos-card__actions">' +
          '<button type="button" class="queue-btn queue-btn--neutral" data-sos-ack="' + escapeHtml(item.id) + '"' + (item.can_acknowledge ? "" : " disabled") + ">Acknowledge</button>" +
          '<button type="button" class="queue-btn queue-btn--approve" data-sos-resolve="' + escapeHtml(item.id) + '" data-resolve-status="resolved"' + (item.can_resolve ? "" : " disabled") + ">Resolve</button>" +
          '<button type="button" class="queue-btn queue-btn--reject" data-sos-resolve="' + escapeHtml(item.id) + '" data-resolve-status="false_alarm"' + (item.can_resolve ? "" : " disabled") + ">False alarm</button>" +
          "</div></article>"
        );
      })
      .join("");
  }

  function loadAlerts() {
    if (listEl) listEl.innerHTML = '<p class="sos-list__loading">Loading SOS alerts…</p>';
    return apiRequest("/admin/api/sos")
      .then(function (data) {
        state.items = data.items || [];
        renderList();
      })
      .catch(function (err) {
        if (listEl) {
          listEl.innerHTML = '<p class="sos-list__empty">' + escapeHtml(err.message) + "</p>";
        }
        showToast(err.message, true);
      });
  }

  function acknowledgeAlert(id, button) {
    if (button && window.ButtonLoading) window.ButtonLoading.start(button);
    return apiRequest("/admin/api/sos/" + encodeURIComponent(id) + "/acknowledge", { method: "POST" })
      .then(function () {
        showToast("SOS acknowledged");
        return loadAlerts();
      })
      .catch(function (err) {
        if (button && window.ButtonLoading) window.ButtonLoading.stop(button);
        showToast(err.message, true);
      });
  }

  function resolveAlert(id, status, button) {
    const label = status === "false_alarm" ? "false alarm" : "resolved";
    return window.AdminConfirm.show({
      title: "Resolve SOS",
      message: "Mark this alert as " + label + "?",
      confirmLabel: "Confirm",
    }).then(function (confirmed) {
      if (!confirmed) return;
      if (button && window.ButtonLoading) window.ButtonLoading.start(button);
      return apiRequest("/admin/api/sos/" + encodeURIComponent(id) + "/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status }),
      })
        .then(function () {
          showToast("SOS marked " + label);
          return loadAlerts();
        })
        .catch(function (err) {
          if (button && window.ButtonLoading) window.ButtonLoading.stop(button);
          showToast(err.message, true);
        });
    });
  }

  function initFilters() {
    document.querySelectorAll("[data-sos-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter = btn.getAttribute("data-sos-filter") || "all";
        document.querySelectorAll("[data-sos-filter]").forEach(function (tab) {
          tab.classList.toggle("is-active", tab === btn);
        });
        renderList();
      });
    });
  }

  function initActions() {
    if (listEl) {
      listEl.addEventListener("click", function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const ackId = target.getAttribute("data-sos-ack");
        const resolveId = target.getAttribute("data-sos-resolve");
        const resolveStatus = target.getAttribute("data-resolve-status") || "resolved";
        if (ackId && !target.disabled) acknowledgeAlert(ackId, target);
        if (resolveId && !target.disabled) resolveAlert(resolveId, resolveStatus, target);
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        var p = loadAlerts();
        if (window.ButtonLoading) window.ButtonLoading.wrap(refreshBtn, p);
      });
    }
  }

  function init() {
    initFilters();
    initActions();
    loadAlerts();
    setInterval(loadAlerts, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
