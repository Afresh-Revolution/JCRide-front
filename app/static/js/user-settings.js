(function () {
  "use strict";

  var THEME_KEY = "josride_user_theme";
  var darkToggle = document.getElementById("settings-dark-mode");

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-user-theme", "dark");
    } else if (theme === "light") {
      root.setAttribute("data-user-theme", "light");
    } else {
      root.removeAttribute("data-user-theme");
    }
  }

  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") {
      applyTheme(saved);
      if (darkToggle) darkToggle.checked = saved === "dark";
      return;
    }
    if (darkToggle && darkToggle.checked) applyTheme("dark");
  }

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

  if (darkToggle) {
    darkToggle.addEventListener("change", function () {
      var theme = darkToggle.checked ? "dark" : "light";
      localStorage.setItem(THEME_KEY, theme);
      applyTheme(theme);
      patchSettings({ dark_mode: darkToggle.checked }).catch(function () {});
    });
  }

  bindToggle(document.getElementById("settings-use-location"), "share_device_location");
  bindToggle(document.getElementById("settings-show-fare-km"), "show_fare_estimate_km");
  bindToggle(document.getElementById("settings-share-analytics"), "share_trip_data_for_analytics");
  bindToggle(document.getElementById("settings-share-name"), "allow_driver_see_name");

  var exportBtn = document.getElementById("settings-export-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
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
        });
    });
  }

  var pauseBtn = document.getElementById("settings-pause-btn");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", function () {
      var days = Number(window.prompt("Pause account for how many days?", "7") || 0);
      if (!days) return;
      var pauseUntil = new Date(Date.now() + days * 86400000).toISOString();
      UserApi.post("/user/api/settings/pause", { pause_until: pauseUntil })
        .then(function () {
          alert("Account paused until " + new Date(pauseUntil).toLocaleString());
        })
        .catch(function (err) {
          alert(err.message || "Could not pause account.");
        });
    });
  }

  var deleteBtn = document.getElementById("settings-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", function () {
      if (!window.confirm("Request permanent account deletion? This cannot be undone.")) return;
      UserApi.post("/user/api/settings/delete-request", {})
        .then(function () {
          alert("Deletion request submitted.");
        })
        .catch(function (err) {
          alert(err.message || "Could not request deletion.");
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

  initTheme();
})();
