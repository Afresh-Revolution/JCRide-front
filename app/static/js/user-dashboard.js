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

  var WALLET_VISIBLE_KEY = "josride_wallet_balance_visible";

  function walletBalanceVisible() {
    try {
      return localStorage.getItem(WALLET_VISIBLE_KEY) !== "0";
    } catch (err) {
      return true;
    }
  }

  function applyWalletVisibility() {
    var valueEl = document.getElementById("dashboard-wallet-value");
    var eyeBtn = document.getElementById("dashboard-wallet-eye");
    if (!valueEl) return;
    var visible = walletBalanceVisible();
    var raw = valueEl.getAttribute("data-raw") || "";
    if (!raw || raw.indexOf("•") !== -1) {
      var current = valueEl.textContent || "";
      if (current && current.indexOf("•") === -1) {
        raw = current;
        valueEl.setAttribute("data-raw", raw);
      }
    }
    valueEl.textContent = visible ? raw : "••••••";
    if (eyeBtn) {
      eyeBtn.setAttribute("aria-label", visible ? "Hide wallet balance" : "Show wallet balance");
      var onIcon = eyeBtn.querySelector(".wallet-balance-card__eye-on");
      var offIcon = eyeBtn.querySelector(".wallet-balance-card__eye-off");
      if (onIcon) onIcon.classList.toggle("is-hidden", !visible);
      if (offIcon) offIcon.classList.toggle("is-hidden", visible);
    }
  }

  var walletEyeBtn = document.getElementById("dashboard-wallet-eye");
  if (walletEyeBtn) {
    var initialValue = document.getElementById("dashboard-wallet-value");
    if (initialValue && !initialValue.getAttribute("data-raw")) {
      initialValue.setAttribute("data-raw", initialValue.textContent || "");
    }
    applyWalletVisibility();
    walletEyeBtn.addEventListener("click", function () {
      var next = walletBalanceVisible() ? "0" : "1";
      try {
        localStorage.setItem(WALLET_VISIBLE_KEY, next);
      } catch (err) {}
      applyWalletVisibility();
    });
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

  function normalizeInviteUrl(url, code) {
    var ref = String(code || "").trim();
    if (!ref) {
      var matches = String(url || "").match(/[?&]ref=([A-Za-z0-9]+)/gi) || [];
      var last = matches[matches.length - 1] || "";
      ref = last.replace(/^.*ref=/i, "");
    }
    if (!ref) return "https://josride.com/register";
    return "https://josride.com/register?ref=" + encodeURIComponent(ref.toUpperCase());
  }

  function applyReferralData(data) {
    if (!data || !data.invite_url) {
      showError("Could not load your invite link. Try again.");
      return;
    }

    var normalizedUrl = normalizeInviteUrl(data.invite_url, data.code);
    state.inviteUrl = normalizedUrl;
    state.shareMessage = defaultShareMessage(normalizedUrl);

    if (urlInput) urlInput.value = state.inviteUrl;
    if (titleEl && data.credit_ngn) {
      titleEl.textContent = "Earn ₦" + Math.round(Number(data.credit_ngn)).toLocaleString() + " wallet credit";
    }
    var conditionEl = document.getElementById("referral-condition");
    if (conditionEl && data.condition_text) {
      conditionEl.textContent = data.condition_text;
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
    var walletValueEl = document.getElementById("dashboard-wallet-value");
    var walletValue = stats.wallet_balance && stats.wallet_balance.value;
    if (walletValueEl && walletValue != null && walletValue !== "") {
      walletValueEl.setAttribute("data-raw", walletValue);
      walletValueEl.textContent = walletValue;
    }
    applyWalletVisibility();
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
        if (data.referral && data.referral.enabled !== false) {
          applyReferralData(data.referral);
        } else if (panel && data.referral && data.referral.enabled === false) {
          panel.hidden = true;
        }
      })
      .catch(function () {});
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
        code: panel.getAttribute("data-code"),
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
