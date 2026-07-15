(function () {
  "use strict";

  function confirmAction(options) {
    if (window.DriverConfirm && typeof DriverConfirm.show === "function") {
      return DriverConfirm.show(options);
    }
    return Promise.resolve(
      window.confirm((options.title || "Confirm") + "\n\n" + (options.message || ""))
    );
  }

  function readAccountFlags() {
    var el = document.getElementById("driver-settings-account-flags");
    if (!el || !el.textContent) return { hasActiveTrip: false };
    try {
      return JSON.parse(el.textContent) || { hasActiveTrip: false };
    } catch (err) {
      return { hasActiveTrip: false };
    }
  }

  function blockIfActiveTrip(actionLabel) {
    var flags = readAccountFlags();
    if (!flags.hasActiveTrip) return Promise.resolve(true);
    return confirmAction({
      title: "Active trip in progress",
      message:
        "Finish your active trip or delivery before you can " + actionLabel + " your account.",
      confirmLabel: "OK",
      variant: "primary",
    }).then(function () {
      return false;
    });
  }

  function bindConfirmForm(formId, options, actionLabel) {
    var form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener("submit", function (event) {
      if (form.dataset.confirmed === "1") {
        delete form.dataset.confirmed;
        return;
      }

      event.preventDefault();
      blockIfActiveTrip(actionLabel).then(function (allowed) {
        if (!allowed) return;
        confirmAction(options).then(function (confirmed) {
          if (!confirmed) return;
          form.dataset.confirmed = "1";
          if (typeof form.requestSubmit === "function") {
            form.requestSubmit();
          } else {
            form.submit();
          }
        });
      });
    });
  }

  function init() {
    bindConfirmForm(
      "driver-deactivate-form",
      {
        title: "Deactivate account?",
        message:
          "We'll stop your driver account and notify support. Contact support if you want it restored later.",
        confirmLabel: "Deactivate",
        variant: "danger",
      },
      "deactivate"
    );

    bindConfirmForm(
      "driver-delete-form",
      {
        title: "Delete account permanently?",
        message:
          "This permanently erases your account, trip history, wallet data, and profile. This cannot be undone.",
        confirmLabel: "Delete everything",
        variant: "danger",
      },
      "delete"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
