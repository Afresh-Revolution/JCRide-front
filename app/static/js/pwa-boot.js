(function (global) {
  "use strict";

  var SPLASH_MS = 3000;
  var MIN_SKELETON_MS = 280;
  var SESSION_KEY = "josride-pwa-launched";

  var html = document.documentElement;
  var splash = null;
  var skeleton = null;
  var reloadBtn = null;
  var bootStarted = false;
  var reloadBound = false;

  function isStandalone() {
    return (
      html.classList.contains("is-pwa") ||
      global.matchMedia("(display-mode: standalone)").matches ||
      global.matchMedia("(display-mode: window-controls-overlay)").matches ||
      global.navigator.standalone === true
    );
  }

  function markPwa() {
    if (isStandalone()) {
      html.classList.add("is-pwa");
    }
  }

  function refs() {
    splash = document.getElementById("pwa-splash");
    skeleton = document.getElementById("pwa-skeleton");
    reloadBtn = document.getElementById("pwa-reload-btn");
  }

  function bindReloadButton() {
    if (reloadBound || !reloadBtn || !html.classList.contains("is-pwa")) return;
    reloadBound = true;
    reloadBtn.addEventListener("click", function () {
      if (reloadBtn.disabled) return;
      reloadBtn.classList.add("is-spinning");
      reloadBtn.disabled = true;
      window.setTimeout(function () {
        global.location.reload();
      }, 360);
    });
  }

  function showReloadButton() {
    if (!reloadBtn || !html.classList.contains("is-pwa")) return;
    reloadBtn.hidden = false;
    bindReloadButton();
  }

  function showSkeleton() {
    if (!skeleton) return;
    skeleton.hidden = false;
    skeleton.setAttribute("aria-hidden", "false");
    html.classList.add("pwa-loading");
  }

  function hideSkeleton() {
    if (!skeleton) return;
    skeleton.classList.add("is-hiding");
    window.setTimeout(function () {
      skeleton.hidden = true;
      skeleton.setAttribute("aria-hidden", "true");
      skeleton.classList.remove("is-hiding");
      html.classList.remove("pwa-loading");
      html.classList.add("pwa-ready");
      showReloadButton();
    }, 320);
  }

  function hideSplash(onDone) {
    if (!splash) {
      if (onDone) onDone();
      return;
    }
    splash.classList.add("is-hiding");
    splash.setAttribute("aria-hidden", "true");
    html.classList.remove("pwa-booting");
    window.setTimeout(function () {
      splash.hidden = true;
      if (onDone) onDone();
    }, 460);
  }

  function finishLoading() {
    var started = Date.now();
    function done() {
      var elapsed = Date.now() - started;
      var wait = Math.max(0, MIN_SKELETON_MS - elapsed);
      window.setTimeout(hideSkeleton, wait);
    }

    if (document.readyState === "complete") {
      done();
    } else {
      global.addEventListener("load", done, { once: true });
    }
  }

  function bootWarm() {
    showSkeleton();
    finishLoading();
  }

  function bootCold() {
    html.classList.add("pwa-booting");
    if (splash) {
      splash.hidden = false;
      splash.setAttribute("aria-hidden", "false");
    }

    window.setTimeout(function () {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch (e) {}
      hideSplash(function () {
        showSkeleton();
        finishLoading();
      });
    }, SPLASH_MS);
  }

  function boot() {
    if (bootStarted) return;
    bootStarted = true;
    markPwa();
    refs();

    if (!html.classList.contains("is-pwa")) {
      html.classList.add("pwa-ready");
      return;
    }

    var launched = false;
    try {
      launched = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (e) {}

    if (!launched) {
      bootCold();
    } else {
      bootWarm();
    }
  }

  markPwa();

  if (document.getElementById("pwa-splash")) {
    boot();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.JosRidePWABoot = { boot: boot, isStandalone: isStandalone };
})(window);
