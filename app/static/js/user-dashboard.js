(function () {
  "use strict";

  var panel = document.getElementById("referral-panel");
  var inviteBtn = document.getElementById("referral-invite-btn");
  var shareSection = document.getElementById("referral-share");
  var urlInput = document.getElementById("referral-invite-url");
  var copyBtn = document.getElementById("referral-copy-btn");
  var usesEl = document.getElementById("referral-uses-count");
  var errorEl = document.getElementById("referral-error");
  var titleEl = document.getElementById("referral-title");
  var policyBannerEl = document.getElementById("dashboard-policy-banner");
  var policyFallbackEl = document.getElementById("dashboard-policy-fallback");
  var tripsBodyEl = document.getElementById("dashboard-recent-trips");

  var state = {
    inviteUrl: "",
    shareMessage: "",
  };

  function text(el, value) {
    if (el) el.textContent = value;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function defaultShareMessage(url) {
    return "Join JosRide with my invite link and earn wallet credit: " + url;
  }

  function applyReferralData(data) {
    if (!data || !data.invite_url) {
      showError("Could not load your invite link. Try again.");
      return;
    }

    state.inviteUrl = data.invite_url;
    state.shareMessage = data.share_message || defaultShareMessage(state.inviteUrl);

    if (urlInput) urlInput.value = state.inviteUrl;
    if (titleEl && data.credit_ngn) {
      titleEl.textContent = "Earn ₦" + Math.round(Number(data.credit_ngn)).toLocaleString() + " wallet credit";
    }
    if (usesEl) {
      var count = Number(data.uses_count || 0);
      usesEl.textContent = count === 1 ? "1 friend invited" : count + " friends invited";
      usesEl.hidden = false;
    }
    if (shareSection) shareSection.hidden = false;
    if (inviteBtn) inviteBtn.classList.add("is-hidden");
    showError("");
  }

  function applyTrend(el, trend) {
    if (!el) return;
    if (trend) {
      el.textContent = "▲ " + trend;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function applyStats(stats) {
    if (!stats) return;
    text(document.getElementById("dashboard-wallet-value"), stats.wallet_balance && stats.wallet_balance.value);
    applyTrend(document.getElementById("dashboard-wallet-trend"), stats.wallet_balance && stats.wallet_balance.trend);
    text(document.getElementById("dashboard-trips-value"), stats.total_trips && stats.total_trips.value);
    applyTrend(document.getElementById("dashboard-trips-trend"), stats.total_trips && stats.total_trips.trend);
    text(document.getElementById("dashboard-spending-value"), stats.total_spending && stats.total_spending.value);
    applyTrend(document.getElementById("dashboard-spending-trend"), stats.total_spending && stats.total_spending.trend);
    if (stats.location && stats.location.value && window.RiderGeolocation && !window.RiderGeolocation.getCached()) {
      var sessionSeed = document.getElementById("rider-stored-location");
      if (!sessionSeed) {
        window.RiderGeolocation.applyLocationLabel(stats.location.value, null);
      }
    }
  }

  function renderPolicy(policy) {
    if (!policyBannerEl) return;
    if (policyFallbackEl) policyFallbackEl.hidden = true;
    if (!policy || (!policy.can_unlock && !policy.cancellation_fee_due_ngn)) {
      policyBannerEl.hidden = true;
      policyBannerEl.innerHTML = "";
      return;
    }

    if (policy.status === "suspended" && policy.can_unlock) {
      policyBannerEl.className = "wallet-policy-banner wallet-policy-banner--danger";
      policyBannerEl.innerHTML =
        "<div><strong>Account suspended</strong><p>Pay ₦" +
        Math.round(Number(policy.unlock_fee_ngn || 2000)).toLocaleString() +
        ' from your <a href="/user/wallet">wallet</a> to unlock your account.</p></div>';
      policyBannerEl.hidden = false;
      return;
    }

    if (policy.cancellation_fee_due_ngn) {
      policyBannerEl.className = "wallet-policy-banner wallet-policy-banner--warn";
      policyBannerEl.innerHTML =
        "<div><strong>Cancellation fee due</strong><p>₦" +
        Math.round(Number(policy.cancellation_fee_due_ngn || 0)).toLocaleString() +
        ' outstanding. <a href="/user/wallet">Pay from wallet</a> within 24 hours.</p></div>';
      policyBannerEl.hidden = false;
      return;
    }

    policyBannerEl.hidden = true;
    policyBannerEl.innerHTML = "";
  }

  function renderRecentTrips(trips) {
    if (!tripsBodyEl) return;
    var items = Array.isArray(trips) ? trips : [];
    if (!items.length) {
      tripsBodyEl.innerHTML =
        '<tr id="dashboard-recent-trips-empty"><td colspan="6">No recent trips yet.</td></tr>';
      return;
    }

    tripsBodyEl.innerHTML = items
      .map(function (trip) {
        var status = (trip.status || "Pending").toLowerCase();
        return (
          "<tr>" +
          "<td><span class=\"rider-table__primary\">" + escapeHtml(trip.date) + "</span>" +
          "<span class=\"rider-table__secondary\">· " + escapeHtml(trip.time) + "</span></td>" +
          "<td>" + escapeHtml(trip.pickup) + "</td>" +
          "<td>" + escapeHtml(trip.destination) + "</td>" +
          "<td>" + escapeHtml(trip.distance) + "</td>" +
          "<td>" + escapeHtml(trip.fare) + "</td>" +
          "<td><span class=\"rider-status rider-status--" + escapeHtml(status) + "\">" + escapeHtml(trip.status) + "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function fetchDashboardSummary() {
    if (!window.UserApi) return Promise.resolve();
    return window.UserApi.request("/user/api/dashboard-summary")
      .then(function (data) {
        applyStats(data.stats);
        renderPolicy(data.account_policy);
        renderRecentTrips(data.recent_trips);
        if (data.referral) {
          applyReferralData(data.referral);
        }
      })
      .catch(function () {
        renderRecentTrips([]);
      });
  }

  function fetchReferral() {
    if (inviteBtn) {
      inviteBtn.disabled = true;
      inviteBtn.textContent = "Generating link…";
    }
    showError("");

    return fetch("/user/api/referral", { credentials: "same-origin" })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            throw new Error(data.error || data.message || data.detail || "Failed to load invite link");
          }
          return data;
        });
      })
      .then(function (data) {
        applyReferralData(data);
      })
      .catch(function (err) {
        showError(err.message || "Failed to load invite link");
        if (inviteBtn) {
          inviteBtn.disabled = false;
          inviteBtn.textContent = "Get invite link";
        }
      });
  }

  function copyLink() {
    var text = state.inviteUrl || (urlInput ? urlInput.value : "");
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (copyBtn) {
          var original = copyBtn.innerHTML;
          copyBtn.textContent = "Copied!";
          setTimeout(function () {
            copyBtn.innerHTML = original;
          }, 2000);
        }
      });
      return;
    }
    window.prompt("Copy your invite link:", text);
  }

  function shareText() {
    return state.shareMessage || defaultShareMessage(state.inviteUrl);
  }

  function initShareButtons() {
    var whatsapp = document.getElementById("referral-whatsapp");
    var sms = document.getElementById("referral-sms");
    var email = document.getElementById("referral-email");

    if (whatsapp) {
      whatsapp.addEventListener("click", function (event) {
        event.preventDefault();
        if (!state.inviteUrl) return;
        window.open("https://wa.me/?text=" + encodeURIComponent(shareText()), "_blank", "noopener");
      });
    }
    if (sms) {
      sms.addEventListener("click", function (event) {
        event.preventDefault();
        if (!state.inviteUrl) return;
        window.location.href = "sms:?body=" + encodeURIComponent(shareText());
      });
    }
    if (email) {
      email.addEventListener("click", function (event) {
        event.preventDefault();
        if (!state.inviteUrl) return;
        window.location.href =
          "mailto:?subject=" +
          encodeURIComponent("Join me on JosRide") +
          "&body=" +
          encodeURIComponent(shareText());
      });
    }
  }

  function init() {
    if (copyBtn) copyBtn.addEventListener("click", copyLink);
    initShareButtons();
    var summaryRequest = fetchDashboardSummary();

    if (inviteBtn) {
      inviteBtn.addEventListener("click", fetchReferral);
    }

    if (panel && panel.getAttribute("data-invite-url")) {
      applyReferralData({
        invite_url: panel.getAttribute("data-invite-url"),
        share_message: panel.getAttribute("data-share-message") || "",
        credit_ngn: panel.getAttribute("data-credit-ngn"),
        uses_count: panel.getAttribute("data-uses-count"),
      });
      return;
    }

    summaryRequest.then(function () {
      if (inviteBtn && !state.inviteUrl) {
        fetchReferral();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
