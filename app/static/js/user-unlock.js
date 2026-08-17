(function () {
  "use strict";

  var config = {};
  try {
    var raw = document.getElementById("unlock-api-config");
    if (raw) config = JSON.parse(raw.textContent || "{}");
  } catch (err) {
    config = {};
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    button.disabled = Boolean(busy);
    if (label) button.textContent = label;
  }

  var walletBtn = document.getElementById("unlock-wallet-btn");
  if (walletBtn) {
    walletBtn.addEventListener("click", function () {
      setBusy(walletBtn, true, "Paying…");
      UserApi.post("/user/api/wallet/pay-false-alarm-fee", {})
        .then(function () {
          window.location.href = "/user/dashboard";
        })
        .catch(function (err) {
          alert(err.message || "Could not pay from wallet.");
          setBusy(walletBtn, false, "Pay from wallet");
        });
    });
  }

  var paystackBtn = document.getElementById("unlock-paystack-btn");
  if (paystackBtn) {
    paystackBtn.addEventListener("click", function () {
      setBusy(paystackBtn, true, "Opening Paystack…");
      UserApi.post("/user/api/wallet/false-alarm/paystack/initialize", {
        email: config.email || undefined,
        callback_url: config.callbackUrl || undefined,
      })
        .then(function (data) {
          if (data && data.authorization_url) {
            window.location.href = data.authorization_url;
            return;
          }
          throw new Error("Paystack did not return a checkout link.");
        })
        .catch(function (err) {
          alert(err.message || "Could not start Paystack payment.");
          setBusy(paystackBtn, false, paystackBtn.getAttribute("data-label") || "Pay with Paystack");
        });
    });
  }

  var params = new URLSearchParams(window.location.search);
  var reference = params.get("reference") || params.get("trxref");
  if (reference && window.UserApi) {
    UserApi.post("/user/api/wallet/paystack/verify", { reference: reference })
      .then(function () {
        if (window.history.replaceState) {
          window.history.replaceState({}, "", window.location.pathname);
        }
        window.location.href = "/user/dashboard";
      })
      .catch(function (err) {
        alert(err.message || "Could not verify payment.");
      });
  }
})();
