(function () {
  "use strict";

  var SW_URL = "/sw.js";
  var UPDATE_TOAST_ID = "pwa-update-toast";

  function register() {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register(SW_URL, { scope: "/" })
        .then(function (registration) {
          registration.addEventListener("updatefound", function () {
            var installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", function () {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                showUpdateToast(registration);
              }
            });
          });
        })
        .catch(function (err) {
          console.warn("[PWA] Service worker registration failed:", err);
        });
    });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (window.__pwaReloading) return;
      window.__pwaReloading = true;
      window.location.reload();
    });
  }

  function showUpdateToast(registration) {
    if (document.getElementById(UPDATE_TOAST_ID)) return;

    var toast = document.createElement("div");
    toast.id = UPDATE_TOAST_ID;
    toast.className = "pwa-update-toast";
    toast.setAttribute("role", "status");
    toast.innerHTML =
      '<p class="pwa-update-toast__text">A new version of JosRide is ready.</p>' +
      '<button type="button" class="pwa-update-toast__btn" id="pwa-update-btn">Update</button>' +
      '<button type="button" class="pwa-update-toast__dismiss" id="pwa-update-dismiss" aria-label="Dismiss">×</button>';

    document.body.appendChild(toast);
    window.requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });

    document.getElementById("pwa-update-btn").addEventListener("click", function () {
      var waiting = registration.waiting;
      if (waiting) {
        waiting.postMessage({ type: "SKIP_WAITING" });
      } else if (registration.installing) {
        registration.installing.postMessage({ type: "SKIP_WAITING" });
      }
      toast.remove();
    });

    document.getElementById("pwa-update-dismiss").addEventListener("click", function () {
      toast.classList.remove("is-visible");
      window.setTimeout(function () {
        toast.remove();
      }, 280);
    });
  }

  register();
})();
