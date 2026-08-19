(function () {
  "use strict";

  var WALLET_VISIBLE_KEY = "josride_wallet_balance_visible";

  function walletBalanceVisible() {
    try {
      return localStorage.getItem(WALLET_VISIBLE_KEY) !== "0";
    } catch (err) {
      return true;
    }
  }

  function applyWalletVisibility() {
    var valueEl = document.getElementById("wallet-balance-value");
    var eyeBtn = document.getElementById("wallet-balance-eye");
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

  var walletEyeBtn = document.getElementById("wallet-balance-eye");
  if (walletEyeBtn) {
    applyWalletVisibility();
    walletEyeBtn.addEventListener("click", function () {
      var next = walletBalanceVisible() ? "0" : "1";
      try {
        localStorage.setItem(WALLET_VISIBLE_KEY, next);
      } catch (err) {}
      applyWalletVisibility();
    });
  }

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
  var sendAmount = 5000;
  var withdrawAmount = 5000;
  var sendAmountInput = document.getElementById("wallet-send-amount-input");
  var withdrawAmountInput = document.getElementById("wallet-withdraw-amount-input");
  var sendPhoneInput = document.getElementById("wallet-send-phone");
  var sendRecipientEl = document.getElementById("wallet-send-recipient");
  var sendLookupTimer = null;
  var sendRecipientReady = false;

  function formatNgn(value) {
    return "₦ " + Number(value || 0).toLocaleString("en-NG");
  }

  function bindQuickAmounts(containerId, displayEl, onChange, initial) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = Number(btn.getAttribute("data-amount") || 0);
        onChange(next);
        container.querySelectorAll("button").forEach(function (other) {
          other.classList.toggle("is-active", other === btn);
        });
        if (displayEl) displayEl.textContent = formatNgn(next);
      });
    });
    if (displayEl) displayEl.textContent = formatNgn(initial);
  }

  document.querySelectorAll("#wallet-quick-amounts button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectedAmount = Number(btn.getAttribute("data-amount") || 0);
      if (amountDisplay) amountDisplay.textContent = formatNgn(selectedAmount);
    });
  });

  bindQuickAmounts(
    "wallet-send-quick-amounts",
    null,
    function (value) {
      sendAmount = value;
      if (sendAmountInput) sendAmountInput.value = String(value);
    },
    sendAmount
  );
  bindQuickAmounts(
    "wallet-withdraw-quick-amounts",
    null,
    function (value) {
      withdrawAmount = value;
      if (withdrawAmountInput) withdrawAmountInput.value = String(value);
    },
    withdrawAmount
  );

  function syncAmountChips(containerId, amount) {
    document.querySelectorAll("#" + containerId + " button").forEach(function (btn) {
      btn.classList.toggle("is-active", Number(btn.getAttribute("data-amount") || 0) === amount);
    });
  }

  if (sendAmountInput) {
    sendAmountInput.addEventListener("input", function () {
      sendAmount = Number(sendAmountInput.value || 0);
      syncAmountChips("wallet-send-quick-amounts", sendAmount);
    });
  }

  if (withdrawAmountInput) {
    withdrawAmountInput.addEventListener("input", function () {
      withdrawAmount = Number(withdrawAmountInput.value || 0);
      syncAmountChips("wallet-withdraw-quick-amounts", withdrawAmount);
    });
  }

  function setSendRecipient(kind, name) {
    if (!sendRecipientEl) return;
    sendRecipientEl.textContent = "";
    if (!kind) {
      sendRecipientEl.hidden = true;
      sendRecipientEl.className = "wallet-recipient-card";
      return;
    }
    sendRecipientEl.hidden = false;
    sendRecipientEl.className = "wallet-recipient-card wallet-recipient-card--" + kind;
    if (kind === "muted") {
      sendRecipientEl.textContent = "Looking up account…";
      return;
    }
    if (kind === "error") {
      sendRecipientEl.textContent = "No JosRide account matches this phone or email.";
      return;
    }
    var label = document.createElement("span");
    label.className = "wallet-recipient-card__label";
    label.textContent = kind === "warn" ? "This is your account" : "Recipient";
    var strong = document.createElement("strong");
    strong.className = "wallet-recipient-card__name";
    strong.textContent = name || "";
    sendRecipientEl.appendChild(label);
    sendRecipientEl.appendChild(strong);
  }

  function isValidSendRecipient(value) {
    var ident = String(value || "").trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ident)) return true;
    return ident.replace(/\D/g, "").length >= 10;
  }

  function lookupSendRecipient() {
    if (!sendPhoneInput || !window.UserApi.get) return;
    var ident = (sendPhoneInput.value || "").trim();
    sendRecipientReady = false;
    if (!isValidSendRecipient(ident)) {
      setSendRecipient("");
      return;
    }
    setSendRecipient("muted");
    window.UserApi.get("/user/api/wallet/send/lookup?q=" + encodeURIComponent(ident))
      .then(function (data) {
        if (data && data.found && data.full_name) {
          sendRecipientReady = !data.is_self;
          setSendRecipient(data.is_self ? "warn" : "ok", data.full_name);
          return;
        }
        setSendRecipient("error");
      })
      .catch(function () {
        setSendRecipient("error");
      });
  }

  if (sendPhoneInput) {
    sendPhoneInput.addEventListener("input", function () {
      clearTimeout(sendLookupTimer);
      sendLookupTimer = setTimeout(lookupSendRecipient, 400);
    });
  }

  function currentAmount() {
    return selectedAmount;
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

  var fundPanel = document.getElementById("wallet-fund-panel");
  var sendPanel = document.getElementById("wallet-send-panel");
  var withdrawPanel = document.getElementById("wallet-withdraw-panel");

  function showPanel(name, opts) {
    if (fundPanel) fundPanel.hidden = name !== "fund";
    if (sendPanel) sendPanel.hidden = name !== "send";
    if (withdrawPanel) withdrawPanel.hidden = name !== "withdraw";
    if (opts && opts.skipUrl) return;
    if (!window.history.replaceState) return;
    var params = new URLSearchParams(window.location.search);
    if (params.get("reference") || params.get("trxref")) return;
    if (name && name !== "fund") params.set("panel", name);
    else params.delete("panel");
    var query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? "?" + query : "") + window.location.hash);
  }

  var fundBtn = document.getElementById("wallet-fund-btn");
  if (fundBtn) {
    fundBtn.addEventListener("click", function () {
      showPanel("fund");
      if (fundPanel && fundPanel.scrollIntoView) {
        fundPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  var sendBtn = document.getElementById("wallet-send-btn");
  if (sendBtn) {
    sendBtn.addEventListener("click", function () {
      showPanel("send");
    });
  }

  var withdrawBtn = document.getElementById("wallet-withdraw-btn");
  if (withdrawBtn) {
    withdrawBtn.addEventListener("click", function () {
      showPanel("withdraw");
    });
  }

  var paystackBtn = document.getElementById("wallet-paystack-btn");
  if (paystackBtn) {
    paystackBtn.addEventListener("click", function () {
      setBusy(paystackBtn, true, "Opening Paystack…");
      UserApi.post("/user/api/wallet/paystack/initialize", {
        amount_ngn: currentAmount(),
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

  var sendSubmit = document.getElementById("wallet-send-submit");
  if (sendSubmit) {
    sendSubmit.addEventListener("click", function () {
      var phone = (document.getElementById("wallet-send-phone").value || "").trim();
      if (!sendAmount || sendAmount < 100) {
        alert("Enter at least ₦100.");
        return;
      }
      if (!isValidSendRecipient(phone)) {
        alert("Enter a valid recipient phone number or email.");
        return;
      }
      if (!sendRecipientReady) {
        alert("Enter a phone number or email linked to a JosRide account.");
        return;
      }
      setBusy(sendSubmit, true, "Sending…");
      UserApi.post("/user/api/wallet/send", {
        amount_ngn: sendAmount,
        recipient: phone,
        recipient_phone: phone,
      })
        .then(function (data) {
          var name = (data && data.recipient_name) || "the recipient";
          alert("₦" + Number(sendAmount).toLocaleString("en-NG") + " sent to " + name + ".");
          window.location.reload();
        })
        .catch(function (err) {
          alert(err.message || "Could not send money.");
        })
        .finally(function () {
          setBusy(sendSubmit, false);
        });
    });
  }

  var withdrawSubmit = document.getElementById("wallet-withdraw-submit");
  if (withdrawSubmit) {
    withdrawSubmit.addEventListener("click", function () {
      var bank = (document.getElementById("wallet-withdraw-bank").value || "").trim();
      var accountNumber = (document.getElementById("wallet-withdraw-account-number").value || "").trim();
      var accountName = (document.getElementById("wallet-withdraw-account-name").value || "").trim();
      if (!withdrawAmount || withdrawAmount < 1000) {
        alert("Minimum withdrawal is ₦1,000.");
        return;
      }
      if (!bank || !accountNumber || !accountName) {
        alert("Fill in all withdrawal fields.");
        return;
      }
      setBusy(withdrawSubmit, true);
      UserApi.post("/user/api/wallet/withdraw", {
        amount_ngn: withdrawAmount,
        bank_name: bank,
        account_number: accountNumber,
        account_name: accountName,
      })
        .then(function () {
          alert("Withdrawal request submitted. Admin will approve before the amount leaves your wallet.");
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

  var manualFundBtn = document.getElementById("wallet-manual-fund-btn");
  if (manualFundBtn) {
    manualFundBtn.addEventListener("click", function () {
      var bank = window.prompt("Bank name used for transfer:");
      var accountName = window.prompt("Account name on transfer:");
      if (!bank || !accountName) return;
      setBusy(manualFundBtn, true);
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
          setBusy(manualFundBtn, false);
        });
    });
  }

  var refreshBtn = document.getElementById("wallet-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      setBusy(refreshBtn, true, "Refreshing…");
      fetchWallet().finally(function () {
        setBusy(refreshBtn, false);
      });
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

  function renderTransactions(items) {
    var list = document.getElementById("wallet-tx-list");
    if (!list) return;
    var rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      list.innerHTML = '<li class="wallet-tx wallet-tx--empty" id="wallet-tx-empty">No transactions yet.</li>';
      return;
    }
    list.innerHTML = rows
      .map(function (tx) {
        var type = tx.type || "debit";
        var icon = type === "credit" ? "↙" : type === "refund" ? "↺" : "↗";
        return (
          '<li class="wallet-tx wallet-tx--' +
          type +
          '">' +
          '<span class="wallet-tx__icon" aria-hidden="true">' +
          icon +
          "</span>" +
          '<div class="wallet-tx__body"><strong>' +
          escapeHtml(tx.title) +
          "</strong><span>" +
          escapeHtml(tx.time) +
          "</span></div>" +
          '<div class="wallet-tx__amount"><strong>' +
          escapeHtml(tx.amount) +
          "</strong><span>" +
          escapeHtml(tx.status) +
          "</span></div></li>"
        );
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function applyWalletSummary(wallet) {
    if (!wallet) return;
    var valueEl = document.getElementById("wallet-balance-value");
    if (valueEl && wallet.balance != null && wallet.balance !== "") {
      valueEl.setAttribute("data-raw", wallet.balance);
      valueEl.textContent = wallet.balance;
    }
    applyWalletVisibility();
    var subEl = document.getElementById("wallet-balance-sub");
    if (subEl && wallet.balance_sub) subEl.textContent = wallet.balance_sub;
    var depositsEl = document.getElementById("wallet-deposits-value");
    if (depositsEl && wallet.total_deposits != null) depositsEl.textContent = wallet.total_deposits;
    var spendingEl = document.getElementById("wallet-spending-value");
    if (spendingEl && wallet.total_spending != null) spendingEl.textContent = wallet.total_spending;
    applyTrend(document.getElementById("wallet-deposits-trend"), wallet.deposits_trend);
    applyTrend(document.getElementById("wallet-spending-trend"), wallet.spending_trend);
  }

  function fetchWallet() {
    return UserApi.get("/user/api/wallet")
      .then(function (data) {
        applyWalletSummary(data.wallet);
        if (data.transactions) renderTransactions(data.transactions);
      })
      .catch(function () {});
  }

  fetchWallet();

  var params = new URLSearchParams(window.location.search);
  var panelParam = String(params.get("panel") || window.location.hash.replace("#", "") || "").toLowerCase();
  if (panelParam === "send" || panelParam === "withdraw" || panelParam === "fund") {
    showPanel(panelParam, { skipUrl: true });
  }
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
