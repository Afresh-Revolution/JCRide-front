(function () {
  "use strict";

  if (!window.UserApi) return;

  var configEl = document.getElementById("wallet-api-config");
  if (!configEl) return;

  var config = {};
  try {
    config = JSON.parse(configEl.textContent || "{}");
  } catch (err) {
    return;
  }

  var amountDisplay = document.getElementById("wallet-amount-display");
  var selectedAmount = 20000;

  function currentAmount() {
    return selectedAmount;
  }

  document.querySelectorAll("#wallet-quick-amounts button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectedAmount = Number(btn.getAttribute("data-amount") || 0);
    });
  });

  function selectedMethod() {
    var checked = document.querySelector('#wallet-methods input[name="payment_method"]:checked');
    return checked ? checked.value : "card";
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (window.ButtonLoading) {
      if (busy) window.ButtonLoading.start(button, { text: label || "Processing…" });
      else window.ButtonLoading.stop(button);
      return;
    }
    if (busy) {
      button.disabled = true;
      button.setAttribute("data-original-text", button.textContent);
      button.textContent = label || "Processing…";
      return;
    }
    button.disabled = false;
    button.textContent = button.getAttribute("data-original-text") || button.textContent;
  }

  var paystackBtn = document.getElementById("wallet-paystack-btn");
  if (paystackBtn) {
    paystackBtn.addEventListener("click", function () {
      setBusy(paystackBtn, true, "Opening Paystack…");
      UserApi.post("/user/api/wallet/paystack/initialize", {
        amount_ngn: currentAmount(),
        email: config.email || "",
        callback_url: config.callbackUrl || window.location.href.split("?")[0],
      })
        .then(function (data) {
          if (data.authorization_url) {
            window.location.href = data.authorization_url;
            return;
          }
          throw new Error("Paystack URL not returned.");
        })
        .catch(function (err) {
          alert(err.message || "Could not start Paystack payment.");
        })
        .finally(function () {
          setBusy(paystackBtn, false);
        });
    });
  }

  var withdrawBtn = document.getElementById("wallet-withdraw-btn");
  var withdrawPanel = document.getElementById("wallet-withdraw-panel");
  if (withdrawBtn && withdrawPanel) {
    withdrawBtn.addEventListener("click", function () {
      withdrawPanel.hidden = !withdrawPanel.hidden;
    });

    var withdrawSubmit = document.getElementById("wallet-withdraw-submit");
    if (withdrawSubmit) {
      withdrawSubmit.addEventListener("click", function () {
        var amount = Number(document.getElementById("wallet-withdraw-amount").value || 0);
        var bank = document.getElementById("wallet-withdraw-bank").value.trim();
        var accountNumber = document.getElementById("wallet-withdraw-account-number").value.trim();
        var accountName = document.getElementById("wallet-withdraw-account-name").value.trim();
        if (!amount || !bank || !accountNumber || !accountName) {
          alert("Fill in all withdrawal fields.");
          return;
        }
        setBusy(withdrawSubmit, true);
        UserApi.post("/user/api/wallet/withdraw", {
          amount_ngn: amount,
          bank_name: bank,
          account_number: accountNumber,
          account_name: accountName,
        })
          .then(function () {
            alert("Withdrawal request submitted.");
            window.location.reload();
          })
          .catch(function (err) {
            alert(err.message || "Withdrawal failed.");
          })
          .finally(function () {
            setBusy(withdrawSubmit, false);
          });
      });
    }
  }

  var fundBtn = document.getElementById("wallet-manual-fund-btn");
  if (fundBtn) {
    fundBtn.addEventListener("click", function () {
      var bank = window.prompt("Bank name used for transfer:");
      var accountName = window.prompt("Account name on transfer:");
      if (!bank || !accountName) return;
      setBusy(fundBtn, true);
      UserApi.post("/user/api/wallet/fund-request", {
        amount_ngn: currentAmount(),
        bank_name: bank,
        account_name: accountName,
      })
        .then(function () {
          alert("Funding request submitted. We will credit your wallet after verification.");
        })
        .catch(function (err) {
          alert(err.message || "Funding request failed.");
        })
        .finally(function () {
          setBusy(fundBtn, false);
        });
    });
  }

  var refreshBtn = document.getElementById("wallet-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      window.location.reload();
    });
  }

  var payFeeBtn = document.getElementById("wallet-pay-fee-btn");
  if (payFeeBtn) {
    payFeeBtn.addEventListener("click", function () {
      setBusy(payFeeBtn, true, "Paying…");
      UserApi.post("/user/api/wallet/pay-cancellation-fee", {})
        .then(function () {
          alert("Cancellation fee paid. Thank you.");
          window.location.reload();
        })
        .catch(function (err) {
          alert(err.message || "Could not pay cancellation fee.");
        })
        .finally(function () {
          setBusy(payFeeBtn, false);
        });
    });
  }

  var unlockBtn = document.getElementById("wallet-unlock-btn");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", function () {
      if (!window.confirm("Pay the unlock fee from your wallet to restore your account?")) return;
      setBusy(unlockBtn, true, "Unlocking…");
      UserApi.post("/user/api/wallet/unlock-account", {})
        .then(function () {
          alert("Account unlocked. You can book rides again.");
          window.location.reload();
        })
        .catch(function (err) {
          alert(err.message || "Could not unlock account.");
        })
        .finally(function () {
          setBusy(unlockBtn, false);
        });
    });
  }

  var params = new URLSearchParams(window.location.search);
  var reference = params.get("reference") || params.get("trxref");
  if (reference) {
    UserApi.post("/user/api/wallet/paystack/verify", { reference: reference })
      .then(function () {
        alert("Payment verified. Wallet will update shortly.");
        if (window.history.replaceState) {
          window.history.replaceState({}, "", window.location.pathname);
        }
        window.location.reload();
      })
      .catch(function (err) {
        alert(err.message || "Could not verify payment.");
      });
  }
})();
