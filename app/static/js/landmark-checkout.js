(function (global) {
  "use strict";

  // Same fetch-based pattern as the wallet's Paystack/manual-transfer buttons
  // (see user-wallet.js): call the backend via AJAX and only navigate once we
  // have a real destination, instead of a plain form POST that can leave the
  // rider stuck if anything in between goes wrong.

  function initLandmarkPayForm(form) {
    if (!form) return;
    var payUrl = form.getAttribute("data-pay-url");
    if (!payUrl) return;

    form.addEventListener("submit", function (event) {
      var submitter = event.submitter;
      var action = submitter && submitter.value;
      if (action !== "pay_paystack") return; // let "Edit plan" / "Manual Bank Transfer" submit normally

      event.preventDefault();
      if (global.ButtonLoading) global.ButtonLoading.start(submitter, { text: "Opening Paystack…" });

      global.UserApi.post(payUrl, { provider: "paystack" })
        .then(function (data) {
          if (data.authorization_url) {
            global.location.href = data.authorization_url;
            return;
          }
          throw new Error("Paystack did not return a checkout link. Please contact support before retrying.");
        })
        .catch(function (err) {
          alert(err.message || "Could not start Paystack payment.");
          if (global.ButtonLoading) global.ButtonLoading.stop(submitter);
        });
    });
  }

  function initLandmarkManualForm(form) {
    if (!form) return;
    var payUrl = form.getAttribute("data-pay-url");
    if (!payUrl) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var submitBtn = form.querySelector('button[type="submit"]');
      var bankName = (form.querySelector('[name="bank_name"]').value || "").trim();
      var accountName = (form.querySelector('[name="account_name"]').value || "").trim();
      if (!bankName || !accountName) {
        alert("Enter the bank name and account name you transferred from.");
        return;
      }

      if (global.ButtonLoading) global.ButtonLoading.start(submitBtn, { text: "Submitting…" });

      var body = new FormData(form);
      body.set("provider", "manual");
      global.fetch(payUrl, { method: "POST", body: body, credentials: "same-origin" })
        .then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok) throw new Error(data.error || "Could not submit receipt.");
            return data;
          });
        })
        .then(function (data) {
          global.location.href = data.pending_url || "/user/plans";
        })
        .catch(function (err) {
          alert(err.message || "Could not submit your transfer details.");
          if (global.ButtonLoading) global.ButtonLoading.stop(submitBtn);
        });
    });
  }

  global.LandmarkCheckout = {
    initPayForm: initLandmarkPayForm,
    initManualForm: initLandmarkManualForm,
  };
})(window);
