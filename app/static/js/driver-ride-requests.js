(function () {
  "use strict";

  var POLL_MS = 8000;
  var reloadTimer = null;
  var pollTimer = null;
  var toastTimer = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isRideRequestsPage() {
    return window.location.pathname.indexOf("/ride-requests") >= 0;
  }

  function updateCount(count) {
    var countEl = document.querySelector(".ride-requests-count");
    if (!countEl) return;
    if (!count) {
      countEl.textContent = "No nearby requests right now";
      return;
    }
    countEl.textContent =
      count === 1 ? "1 nearby request waiting for you" : count + " nearby requests waiting for you";
  }

  function renderRequestCard(request) {
    var rating = request.rating != null ? request.rating : "-";
    return (
      '<article class="ride-request-card" data-ride-id="' +
      escapeHtml(request.id) +
      '">' +
      '<div class="ride-request-card__top">' +
      '<div class="ride-request-card__rider">' +
      '<div class="ride-request-card__avatar" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
      "</div>" +
      '<div class="ride-request-card__rider-info">' +
      '<div class="ride-request-card__name-row">' +
      '<span class="ride-request-card__name">' +
      escapeHtml(request.rider_name) +
      "</span>" +
      '<span class="ride-request-card__rating">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ' +
      escapeHtml(rating) +
      "</span>" +
      "</div>" +
      '<div class="ride-request-card__meta">' +
      '<span class="ride-request-card__meta-item">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' +
      escapeHtml(request.distance_km) +
      " km</span>" +
      '<span class="ride-request-card__meta-item">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' +
      escapeHtml(request.duration_min) +
      " min</span>" +
      '<span class="ride-request-card__badge">' +
      escapeHtml(request.pickup_eta) +
      "</span>" +
      "</div></div></div>" +
      '<div class="ride-request-card__earn">' +
      '<span class="ride-request-card__earn-label">YOU EARN</span>' +
      '<span class="ride-request-card__earn-value">' +
      escapeHtml(request.earnings) +
      "</span></div></div>" +
      '<div class="ride-request-card__route">' +
      '<div class="ride-request-card__stop ride-request-card__stop--pickup">' +
      '<span class="ride-request-card__dot ride-request-card__dot--pickup" aria-hidden="true"></span>' +
      "<div><span class=\"ride-request-card__stop-label\">PICKUP</span>" +
      '<span class="ride-request-card__stop-value">' +
      escapeHtml(request.pickup) +
      "</span></div></div>" +
      '<div class="ride-request-card__stop ride-request-card__stop--dest">' +
      '<span class="ride-request-card__dot ride-request-card__dot--dest" aria-hidden="true"></span>' +
      "<div><span class=\"ride-request-card__stop-label\">DESTINATION</span>" +
      '<span class="ride-request-card__stop-value">' +
      escapeHtml(request.destination) +
      "</span></div></div></div>" +
      '<div class="ride-request-card__actions">' +
      '<form method="post" action="/driver-portal/ride-requests/' +
      encodeURIComponent(request.id) +
      '/reject">' +
      '<button type="submit" class="driver-btn driver-btn--outline driver-btn--pill">Reject</button></form>' +
      '<form method="post" action="/driver-portal/ride-requests/' +
      encodeURIComponent(request.id) +
      '/accept">' +
      '<button type="submit" class="driver-btn driver-btn--primary driver-btn--pill">Accept ride</button></form>' +
      "</div></article>"
    );
  }

  function renderRequests(requests) {
    var listEl = document.getElementById("driver-ride-requests-list");
    if (!listEl) return false;

    var items = requests || [];
    updateCount(items.length);

    if (!items.length) {
      listEl.innerHTML =
        '<div class="driver-empty" id="driver-ride-requests-empty">No ride requests right now. Go online to receive trips.</div>';
      return true;
    }

    listEl.innerHTML = items.map(renderRequestCard).join("");
    return true;
  }

  function fetchRequestsFromApi() {
    if (!window.DriverApi) return Promise.resolve(false);
    return DriverApi.rideRequests()
      .then(function (data) {
        var items = (data && data.ui) || [];
        if (isRideRequestsPage()) {
          return renderRequests(items);
        }
        return items;
      })
      .catch(function () {
        return false;
      });
  }

  function showNewRequestToast(payload) {
    if (isRideRequestsPage()) return;
    var existing = document.getElementById("driver-new-request-toast");
    if (existing) existing.remove();
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }

    var toast = document.createElement("a");
    toast.id = "driver-new-request-toast";
    toast.className = "driver-new-request-toast";
    toast.href = "/driver-portal/ride-requests";
    var label = (payload && payload.booking_id) || "New ride request";
    toast.innerHTML =
      "<strong>" +
      escapeHtml(label) +
      '</strong><span>Tap to view and accept</span>';
    document.body.appendChild(toast);

    toastTimer = window.setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      toastTimer = null;
    }, 12000);
  }

  window.fetchRideRequests = function (payload) {
    if (reloadTimer) return;
    reloadTimer = window.setTimeout(function () {
      reloadTimer = null;
      fetchRequestsFromApi().then(function (result) {
        if (result === false && isRideRequestsPage()) {
          window.location.reload();
          return;
        }
        if (!isRideRequestsPage() && payload) {
          showNewRequestToast(payload);
        }
      });
    }, 350);
  };

  function startPolling() {
    if (!isRideRequestsPage() || pollTimer) return;
    pollTimer = window.setInterval(function () {
      fetchRequestsFromApi();
    }, POLL_MS);
  }

  if (isRideRequestsPage()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startPolling);
    } else {
      startPolling();
    }
  }
})();
