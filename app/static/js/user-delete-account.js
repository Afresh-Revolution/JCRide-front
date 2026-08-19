(function () {
  "use strict";

  var deleteBtn = document.getElementById("delete-account-btn");
  var ackBox = document.getElementById("delete-account-ack");
  var statusEl = document.getElementById("delete-account-status");
  if (!deleteBtn) return;

  function confirmAction(options) {
    if (window.UserConfirm && typeof UserConfirm.show === "function") {
      return UserConfirm.show(options);
    }
    return Promise.resolve(
      window.confirm((options.title || "Confirm") + "\n\n" + (options.message || ""))
    );
  }

  function hasActiveTrip() {
    var el = document.getElementById("delete-account-flags");
    if (!el || !el.textContent) return false;
    try {
      return !!(JSON.parse(el.textContent) || {}).hasActiveTrip;
    } catch (err) {
      return false;
    }
  }

  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.hidden = !message;
  }

  function setEnabled(enabled) {
    deleteBtn.disabled = !enabled;
    deleteBtn.setAttribute("aria-disabled", enabled ? "false" : "true");
  }

  function syncAck() {
    setEnabled(!hasActiveTrip() && !!(ackBox && ackBox.checked));
  }

  function withBtn(btn, promise) {
    if (btn && window.ButtonLoading) return window.ButtonLoading.wrap(btn, promise);
    return promise;
  }

  if (ackBox) {
    ackBox.addEventListener("change", syncAck);
  }
  syncAck();

  deleteBtn.addEventListener("click", function () {
    if (hasActiveTrip()) {
      confirmAction({
        title: "Active trip in progress",
        message: "Finish your active trip or delivery before you can delete your account.",
        confirmLabel: "OK",
        variant: "primary",
      });
      return;
    }
    if (!ackBox || !ackBox.checked) {
      setStatus("Tick the confirmation box first.");
      return;
    }

    confirmAction({
      title: "Delete account permanently?",
      message:
        "This permanently erases your account, trip history, wallet data, and profile. This cannot be undone.",
      confirmLabel: "Delete everything",
      variant: "danger",
    }).then(function (confirmed) {
      if (!confirmed) return;
      if (!window.UserApi) {
        setStatus("Could not reach JosRide. Refresh and try again.");
        return;
      }
      setStatus("");
      withBtn(
        deleteBtn,
        UserApi.post("/user/api/settings/delete-request", {})
          .then(function () {
            window.location.href = "/";
          })
          .catch(function (err) {
            setStatus(err.message || "Could not delete account.");
            syncAck();
          })
      );
    });
  });
})();
