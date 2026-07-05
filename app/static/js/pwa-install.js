(function (global) {
  "use strict";

  var STORAGE = {
    installed: "josride-pwa-installed",
    dismissed: "josride-pwa-install-dismissed",
    iosDismissed: "josride-ios-install-dismissed",
    interaction: "josride-pwa-interaction",
  };

  var deferredPrompt = null;
  var uiBuilt = false;
  var meaningfulInteraction = false;

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  function isStandalone() {
    return (
      global.matchMedia("(display-mode: standalone)").matches ||
      global.matchMedia("(display-mode: window-controls-overlay)").matches ||
      global.navigator.standalone === true
    );
  }

  function isIOS() {
    var ua = global.navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) && !global.MSStream;
  }

  function isAndroid() {
    return /Android/i.test(global.navigator.userAgent || "");
  }

  function isInstalled() {
    return isStandalone() || storageGet(STORAGE.installed) === "1";
  }

  function shouldShowPrompt() {
    if (isInstalled()) return false;
    if (storageGet(STORAGE.dismissed) === "1") return false;
    return true;
  }

  function shouldShowIOS() {
    if (!isIOS()) return false;
    if (isInstalled()) return false;
    if (storageGet(STORAGE.iosDismissed) === "1") return false;
    return true;
  }

  function buildUI() {
    if (uiBuilt || !document.body) return;
    uiBuilt = true;

    var root = document.createElement("div");
    root.id = "pwa-install-root";
    root.innerHTML =
      '<div class="pwa-install-backdrop" id="pwa-install-backdrop" hidden></div>' +
      '<section class="pwa-install-card" id="pwa-install-card" role="dialog" aria-labelledby="pwa-install-title" aria-modal="true" hidden>' +
      '  <button type="button" class="pwa-install-card__close" id="pwa-install-close" aria-label="Dismiss install prompt">×</button>' +
      '  <div class="pwa-install-card__icon" aria-hidden="true">' +
      '    <img src="/static/pwa/icons/icon-192.png" alt="" width="56" height="56">' +
      "  </div>" +
      '  <h2 class="pwa-install-card__title" id="pwa-install-title">Install JosRide</h2>' +
      '  <p class="pwa-install-card__desc">Add JosRide to your home screen for one-tap rides, faster loading, and an app-like experience.</p>' +
      '  <button type="button" class="pwa-install-card__cta" id="pwa-install-cta">Install app</button>' +
      '  <button type="button" class="pwa-install-card__ghost" id="pwa-install-later">Not now</button>' +
      "</section>" +
      '<section class="pwa-ios-sheet" id="pwa-ios-sheet" role="dialog" aria-labelledby="pwa-ios-title" aria-modal="true" hidden>' +
      '  <div class="pwa-ios-sheet__handle" aria-hidden="true"></div>' +
      '  <button type="button" class="pwa-ios-sheet__close" id="pwa-ios-close" aria-label="Dismiss">×</button>' +
      '  <div class="pwa-ios-sheet__header">' +
      '    <img src="/static/pwa/icons/icon-192.png" alt="" width="48" height="48" class="pwa-ios-sheet__logo">' +
      '    <div><h2 id="pwa-ios-title" class="pwa-ios-sheet__title">Install JosRide</h2>' +
      '    <p class="pwa-ios-sheet__subtitle">Add to Home Screen for the best experience</p></div>' +
      "  </div>" +
      '  <ol class="pwa-ios-sheet__steps">' +
      '    <li><span class="pwa-ios-step__num">1</span><span class="pwa-ios-step__body"><strong>Tap Share</strong> <span class="pwa-ios-step__icon" aria-hidden="true">⎙</span> in Safari\'s toolbar</span></li>' +
      '    <li><span class="pwa-ios-step__num">2</span><span class="pwa-ios-step__body"><strong>Add to Home Screen</strong> <span class="pwa-ios-step__icon" aria-hidden="true">⊞</span></span></li>' +
      '    <li><span class="pwa-ios-step__num">3</span><span class="pwa-ios-step__body"><strong>Tap Add</strong> in the top right</span></li>' +
      "  </ol>" +
      '  <div class="pwa-ios-sheet__arrow" aria-hidden="true"></div>' +
      '  <button type="button" class="pwa-ios-sheet__dismiss" id="pwa-ios-dismiss">Got it</button>' +
      "</section>";

    document.body.appendChild(root);

    document.getElementById("pwa-install-close").addEventListener("click", dismissInstallCard);
    document.getElementById("pwa-install-later").addEventListener("click", dismissInstallCard);
    document.getElementById("pwa-install-backdrop").addEventListener("click", dismissInstallCard);
    document.getElementById("pwa-install-cta").addEventListener("click", triggerInstall);

    document.getElementById("pwa-ios-close").addEventListener("click", dismissIOSSheet);
    document.getElementById("pwa-ios-dismiss").addEventListener("click", dismissIOSSheet);
  }

  function showInstallCard() {
    if (!shouldShowPrompt() || !deferredPrompt) return;
    buildUI();
    var card = document.getElementById("pwa-install-card");
    var backdrop = document.getElementById("pwa-install-backdrop");
    if (!card || !backdrop) return;
    backdrop.hidden = false;
    card.hidden = false;
    window.requestAnimationFrame(function () {
      card.classList.add("is-visible");
      backdrop.classList.add("is-visible");
    });
  }

  function hideInstallCard() {
    var card = document.getElementById("pwa-install-card");
    var backdrop = document.getElementById("pwa-install-backdrop");
    if (!card || !backdrop) return;
    card.classList.remove("is-visible");
    backdrop.classList.remove("is-visible");
    window.setTimeout(function () {
      card.hidden = true;
      backdrop.hidden = true;
    }, 320);
  }

  function dismissInstallCard() {
    storageSet(STORAGE.dismissed, "1");
    hideInstallCard();
  }

  function showIOSSheet() {
    if (!shouldShowIOS()) return;
    buildUI();
    var sheet = document.getElementById("pwa-ios-sheet");
    if (!sheet) return;
    sheet.hidden = false;
    window.requestAnimationFrame(function () {
      sheet.classList.add("is-visible");
    });
  }

  function hideIOSSheet() {
    var sheet = document.getElementById("pwa-ios-sheet");
    if (!sheet) return;
    sheet.classList.remove("is-visible");
    window.setTimeout(function () {
      sheet.hidden = true;
    }, 360);
  }

  function dismissIOSSheet() {
    storageSet(STORAGE.iosDismissed, "1");
    hideIOSSheet();
  }

  function triggerInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choice) {
      if (choice.outcome === "accepted") {
        storageSet(STORAGE.installed, "1");
      } else {
        storageSet(STORAGE.dismissed, "1");
      }
      deferredPrompt = null;
      hideInstallCard();
    });
  }

  function onMeaningfulInteraction() {
    if (meaningfulInteraction) return;
    meaningfulInteraction = true;
    storageSet(STORAGE.interaction, "1");

    window.setTimeout(function () {
      if (deferredPrompt && shouldShowPrompt()) {
        showInstallCard();
      } else if (shouldShowIOS()) {
        showIOSSheet();
      }
    }, 800);
  }

  global.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    if (meaningfulInteraction || storageGet(STORAGE.interaction) === "1") {
      onMeaningfulInteraction();
    }
  });

  global.addEventListener("appinstalled", function () {
    storageSet(STORAGE.installed, "1");
    hideInstallCard();
    hideIOSSheet();
    deferredPrompt = null;
  });

  ["click", "scroll", "keydown", "touchstart"].forEach(function (type) {
    document.addEventListener(
      type,
      function () {
        onMeaningfulInteraction();
      },
      { once: true, passive: true }
    );
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildUI);
  } else {
    buildUI();
  }

  if (isStandalone()) {
    storageSet(STORAGE.installed, "1");
  }

  global.JosRidePWA = {
    isStandalone: isStandalone,
    isInstalled: isInstalled,
    showInstall: function () {
      if (deferredPrompt) showInstallCard();
      else if (shouldShowIOS()) showIOSSheet();
    },
  };
})(window);
