(function () {
  "use strict";

  var deleteBtn = document.getElementById("delete-account-btn");
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

  function withBtn(btn, promise) {
    if (btn && window.ButtonLoading) return window.ButtonLoading.wrap(btn, promise);
    return promise;
  }

  deleteBtn.addEventListener("click", function () {
    if (hasActiveTrip() || deleteBtn.disabled) {
      confirmAction({
        title: "Active trip in progress",
        message: "Finish your active trip or delivery before you can delete your account.",
        confirmLabel: "OK",
        variant: "primary",
      });
      return;
    }

    confirmAction({
      title: "Delete account permanently?",
      message:
        "This permanently erases your account, trip history, wallet data, and profile. This cannot be undone.",
      confirmLabel: "Delete everything",
      variant: "danger",
    }).then(function (confirmed) {
      if (!confirmed || !window.UserApi) return;
      withBtn(
        deleteBtn,
        UserApi.post("/user/api/settings/delete-request", {})
          .then(function () {
            window.location.href = "/";
          })
          .catch(function (err) {
            window.alert(err.message || "Could not delete account.");
          })
      );
    });
  });
})();
