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

  var state = {
    inviteUrl: "",
    shareMessage: "",
  };

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

    if (inviteBtn) {
      fetchReferral();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
