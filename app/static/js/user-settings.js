(function () {
  "use strict";

  function patchSettings(payload) {
    if (!window.UserApi) return Promise.resolve();
    return UserApi.patch("/user/api/settings", payload);
  }

  function bindToggle(input, field) {
    if (!input) return;
    input.addEventListener("change", function () {
      var payload = {};
      payload[field] = input.checked;
      patchSettings(payload).catch(function () {
        input.checked = !input.checked;
      });
    });
  }

  bindToggle(document.getElementById("settings-use-location"), "share_device_location");
  bindToggle(document.getElementById("settings-show-fare-km"), "show_fare_estimate_km");
  bindToggle(document.getElementById("settings-share-analytics"), "share_trip_data_for_analytics");
  bindToggle(document.getElementById("settings-share-name"), "allow_driver_see_name");

  document.querySelectorAll(".settings-notif-toggle").forEach(function (input) {
    input.addEventListener("change", function () {
      if (!window.UserApi) return;
      UserApi.patch("/user/api/notifications/preferences", {
        group: input.getAttribute("data-group"),
        id: input.getAttribute("data-id"),
        enabled: input.checked,
      }).catch(function () {
        input.checked = !input.checked;
      });
    });
  });

  var passwordForm = document.getElementById("settings-password-form");
  if (passwordForm && window.UserApi) {
    passwordForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var btn = document.getElementById("settings-password-btn");
      var statusEl = document.getElementById("settings-password-status");
      var payload = {
        current_password: passwordForm.current_password.value,
        new_password: passwordForm.new_password.value,
        confirm_password: passwordForm.confirm_password.value,
      };
      if (payload.new_password !== payload.confirm_password) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "New passwords do not match.";
        }
        return;
      }
      withBtn(
        btn,
        UserApi.post("/user/api/auth/change-password", payload)
          .then(function (data) {
            passwordForm.reset();
            if (statusEl) {
              statusEl.hidden = false;
              statusEl.textContent = data.message || "Password updated successfully.";
            }
          })
          .catch(function (err) {
            if (statusEl) {
              statusEl.hidden = false;
              statusEl.textContent = err.message || "Could not update password.";
            } else {
              alert(err.message || "Could not update password.");
            }
          })
      );
    });
  }

  function withBtn(btn, promise) {
    if (btn && window.ButtonLoading) return window.ButtonLoading.wrap(btn, promise);
    return promise;
  }

  var exportBtn = document.getElementById("settings-export-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      withBtn(
        exportBtn,
        UserApi.request("/user/api/settings/data-export")
          .then(function (data) {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            var link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "josride-data-export.json";
            link.click();
            URL.revokeObjectURL(link.href);
          })
          .catch(function (err) {
            alert(err.message || "Export failed.");
          })
      );
    });
  }

  var pauseBtn = document.getElementById("settings-pause-btn");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", function () {
      var days = Number(window.prompt("Pause account for how many days?", "7") || 0);
      if (!days) return;
      var pauseUntil = new Date(Date.now() + days * 86400000).toISOString();
      withBtn(
        pauseBtn,
        UserApi.post("/user/api/settings/pause", { pause_until: pauseUntil })
          .then(function () {
            alert("Account paused until " + new Date(pauseUntil).toLocaleString());
          })
          .catch(function (err) {
            alert(err.message || "Could not pause account.");
          })
      );
    });
  }

  function confirmAction(options) {
    if (window.UserConfirm && typeof UserConfirm.show === "function") {
      return UserConfirm.show(options);
    }
    return Promise.resolve(
      window.confirm((options.title || "Confirm") + "\n\n" + (options.message || ""))
    );
  }

  function readAccountFlags() {
    var el = document.getElementById("settings-account-flags");
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

  var deactivateBtn = document.getElementById("settings-deactivate-btn");
  if (deactivateBtn) {
    deactivateBtn.addEventListener("click", function () {
      blockIfActiveTrip("deactivate").then(function (allowed) {
        if (!allowed) return;
        confirmAction({
          title: "Deactivate account?",
          message:
            "We'll suspend your account so you can't book rides. Contact support if you want it restored later.",
          confirmLabel: "Deactivate",
          variant: "danger",
        }).then(function (confirmed) {
          if (!confirmed) return;
          withBtn(
            deactivateBtn,
            UserApi.post("/user/api/settings/deactivate-request", {})
              .then(function () {
                window.location.href = "/logout";
              })
              .catch(function (err) {
                window.alert(err.message || "Could not deactivate account.");
              })
          );
        });
      });
    });
  }

  if (window.UserApi && "serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then(function (registration) {
        return registration.pushManager.getSubscription();
      })
      .then(function (subscription) {
        if (subscription && subscription.endpoint) {
          return UserApi.post("/user/api/devices/register", {
            device_token: subscription.endpoint,
            platform: "web",
          });
        }
        return null;
      })
      .catch(function () {});
  }

  var copyBtn = document.getElementById("referral-copy-btn");
  var urlInput = document.getElementById("referral-invite-url");
  var referralPanel = document.getElementById("referral-panel");
  if (urlInput && referralPanel) {
    var code = (referralPanel.getAttribute("data-invite-url") || urlInput.value || "").match(
      /[?&]ref=([A-Za-z0-9]+)/i
    );
    var ref = code && code[1] ? code[1].toUpperCase() : "";
    if (!ref) {
      var fromValue = String(urlInput.value || "").match(/[?&]ref=([A-Za-z0-9]+)/i);
      ref = fromValue && fromValue[1] ? fromValue[1].toUpperCase() : "";
    }
    if (ref) urlInput.value = "https://josride.com/register?ref=" + encodeURIComponent(ref);
  }
  if (copyBtn && urlInput) {
    copyBtn.addEventListener("click", function () {
      var text = urlInput.value || "";
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          var original = copyBtn.textContent;
          copyBtn.textContent = "Copied!";
          setTimeout(function () {
            copyBtn.textContent = original || "Copy";
          }, 2000);
        });
        return;
      }
      window.prompt("Copy your invite link:", text);
    });
  }
})();
