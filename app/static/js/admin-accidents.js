(function () {
  "use strict";

  const state = {
    filter: "all",
    items: [],
  };

  const listEl = document.getElementById("accident-list");
  const refreshBtn = document.getElementById("accident-refresh-btn");
  const toast = document.getElementById("accident-toast");

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
    return "queue-status queue-status--" + String(status || "received").replace(/\s+/g, "_");
  }

  function filteredItems() {
    if (state.filter === "all") return state.items;
    if (state.filter === "resolved") {
      return state.items.filter(function (item) {
        return item.status === "resolved" || item.status === "false_alarm";
      });
    }
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
      listEl.innerHTML = '<p class="sos-list__empty">No accident reports in this view.</p>';
      return;
    }
    listEl.innerHTML = items
      .map(function (item) {
        const cardClass = item.status === "received" ? " sos-card--triggered" : "";
        const rideLabel = item.ride_short && item.ride_short !== "-" ? "Ride " + item.ride_short : "No ride linked";
        const coords =
          item.lat != null && item.lng != null
            ? '<p class="sos-card__coords">' +
              escapeHtml(item.lat) +
              ", " +
              escapeHtml(item.lng) +
              " · " +
              mapsLink(item.lat, item.lng) +
              "</p>"
            : "";
        const phone = item.contact_phone
          ? '<p class="sos-card__coords">Contact: ' + escapeHtml(item.contact_phone) + "</p>"
          : "";
        return (
          '<article class="sos-card' +
          cardClass +
          '" data-accident-id="' +
          escapeHtml(item.id) +
          '">' +
          '<div class="sos-card__main">' +
          '<div class="sos-card__meta">' +
          '<span class="sos-card__ride">' +
          escapeHtml(rideLabel) +
          "</span>" +
          '<span class="' +
          queueStatusClass(item.status) +
          '">' +
          escapeHtml(String(item.status).replace("_", " ")) +
          "</span>" +
          '<span class="sos-card__time">' +
          escapeHtml(formatDate(item.created_at)) +
          "</span>" +
          "</div>" +
          '<p class="sos-card__message"><strong>' +
          escapeHtml((item.severity || "moderate").toUpperCase()) +
          (item.injuries ? " · Injuries reported" : "") +
          "</strong></p>" +
          '<p class="sos-card__message">' +
          escapeHtml(item.description) +
          "</p>" +
          coords +
          phone +
          "</div>" +
          '<div class="sos-card__actions">' +
          '<button type="button" class="queue-btn queue-btn--neutral" data-accident-ack="' +
          escapeHtml(item.id) +
          '"' +
          (item.can_acknowledge ? "" : " disabled") +
          ">Acknowledge</button>" +
          '<button type="button" class="queue-btn queue-btn--approve" data-accident-resolve="' +
          escapeHtml(item.id) +
          '" data-resolve-status="resolved"' +
          (item.can_resolve ? "" : " disabled") +
          ">Resolve</button>" +
          '<button type="button" class="queue-btn queue-btn--reject" data-accident-resolve="' +
          escapeHtml(item.id) +
          '" data-resolve-status="false_alarm"' +
          (item.can_resolve ? "" : " disabled") +
          ">False alarm</button>" +
          "</div></article>"
        );
      })
      .join("");
  }

  function notifySafetyNav(pendingCount) {
    if (window.AdminSafetyNav && typeof window.AdminSafetyNav.refresh === "function") {
      window.AdminSafetyNav.refresh();
      return;
    }
    window.dispatchEvent(
      new CustomEvent("admin-safety-alerts-changed", {
        detail: { accident_pending: pendingCount },
      })
    );
  }

  function loadReports() {
    if (listEl) listEl.innerHTML = '<p class="sos-list__loading">Loading accident reports…</p>';
    return apiRequest("/admin/api/accidents")
      .then(function (data) {
        state.items = data.items || [];
        renderList();
        notifySafetyNav(data.pending_count);
      })
      .catch(function (err) {
        if (listEl) {
          listEl.innerHTML = '<p class="sos-list__empty">' + escapeHtml(err.message) + "</p>";
        }
        showToast(err.message, true);
      });
  }

  function acknowledgeReport(id, button) {
    if (button && window.ButtonLoading) window.ButtonLoading.start(button);
    return apiRequest("/admin/api/accidents/" + encodeURIComponent(id) + "/acknowledge", {
      method: "POST",
    })
      .then(function () {
        showToast("Accident report acknowledged");
        return loadReports();
      })
      .catch(function (err) {
        if (button && window.ButtonLoading) window.ButtonLoading.stop(button);
        showToast(err.message, true);
      });
  }

  function resolveReport(id, status, button) {
    const label = status === "false_alarm" ? "false alarm" : "resolved";
    return window.AdminConfirm.show({
      title: "Resolve accident report",
      message: "Mark this report as " + label + "?",
      confirmLabel: "Confirm",
    }).then(function (confirmed) {
      if (!confirmed) return;
      if (button && window.ButtonLoading) window.ButtonLoading.start(button);
      return apiRequest("/admin/api/accidents/" + encodeURIComponent(id) + "/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status }),
      })
        .then(function () {
          showToast("Report marked " + label);
          return loadReports();
        })
        .catch(function (err) {
          if (button && window.ButtonLoading) window.ButtonLoading.stop(button);
          showToast(err.message, true);
        });
    });
  }

  function initFilters() {
    document.querySelectorAll("[data-accident-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter = btn.getAttribute("data-accident-filter") || "all";
        document.querySelectorAll("[data-accident-filter]").forEach(function (tab) {
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
        const ackId = target.getAttribute("data-accident-ack");
        const resolveId = target.getAttribute("data-accident-resolve");
        const resolveStatus = target.getAttribute("data-resolve-status") || "resolved";
        if (ackId && !target.disabled) acknowledgeReport(ackId, target);
        if (resolveId && !target.disabled) resolveReport(resolveId, resolveStatus, target);
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        var p = loadReports();
        if (window.ButtonLoading) window.ButtonLoading.wrap(refreshBtn, p);
      });
    }
  }

  function init() {
    initFilters();
    initActions();
    loadReports();
    setInterval(loadReports, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
