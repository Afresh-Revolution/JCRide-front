(function () {
  "use strict";

  var STORAGE_KEY = "jcride_tracking_active";
  var matchTimer = null;

  function encodeShareText(message, url) {
    return encodeURIComponent((message || "Follow my JCRide trip live:") + " " + url);
  }

  function copyText(text, button) {
    if (!text) return;
    var done = function () {
      if (!button) return;
      var originalHtml = button.getAttribute("data-original-html");
      if (!originalHtml) {
        originalHtml = button.innerHTML;
        button.setAttribute("data-original-html", originalHtml);
      }
      button.innerHTML = "Copied!";
      window.setTimeout(function () {
        button.innerHTML = originalHtml;
      }, 1800);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        fallbackCopy(text);
        done();
      });
      return;
    }
    fallbackCopy(text);
    done();
  }

  function fallbackCopy(text) {
    var input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "absolute";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }

  function refreshTrackingMap() {
    if (!window.RiderRouteMap) return;
    if (typeof window.RiderRouteMap.refresh === "function") {
      window.RiderRouteMap.refresh();
      return;
    }
    if (typeof window.RiderRouteMap.init === "function") {
      window.RiderRouteMap.init();
    }
  }

  function showActiveTracking() {
    var finding = document.getElementById("tracking-finding");
    var active = document.getElementById("tracking-active");
    if (!finding || !active) return;

    matchTimer = null;
    finding.classList.add("is-hidden");
    finding.setAttribute("hidden", "");
    active.classList.remove("is-hidden");
    active.removeAttribute("hidden");
    sessionStorage.setItem(STORAGE_KEY, "1");

    refreshTrackingMap();
    window.setTimeout(refreshTrackingMap, 180);
    window.setTimeout(refreshTrackingMap, 480);
  }

  function initFindingDriver() {
    var finding = document.getElementById("tracking-finding");
    var active = document.getElementById("tracking-active");
    if (!finding || !active) return;

    var params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") {
      sessionStorage.removeItem(STORAGE_KEY);
      if (window.history.replaceState) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    if (sessionStorage.getItem(STORAGE_KEY) === "1") {
      finding.classList.add("is-hidden");
      finding.setAttribute("hidden", "");
      active.classList.remove("is-hidden");
      active.removeAttribute("hidden");
      refreshTrackingMap();
      window.setTimeout(refreshTrackingMap, 180);
      return;
    }

    var delay = Number(finding.getAttribute("data-match-delay") || 3200);
    matchTimer = window.setTimeout(showActiveTracking, delay);

    var cancelBtn = document.getElementById("tracking-cancel-request");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        if (matchTimer) {
          window.clearTimeout(matchTimer);
          matchTimer = null;
        }
        sessionStorage.removeItem(STORAGE_KEY);
        window.location.href =
          cancelBtn.getAttribute("data-cancel-url") || "/user/live-tracking/cancel";
      });
    }
  }

  function setTrackingStep(stepIndex) {
    var steps = document.querySelectorAll(".tracking-step");
    steps.forEach(function (step, index) {
      var stepNum = index + 1;
      var dot = step.querySelector(".tracking-step__dot");
      step.classList.remove("is-done", "is-current");
      if (stepNum < stepIndex) {
        step.classList.add("is-done");
        if (dot) {
          dot.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
        }
      } else if (stepNum === stepIndex) {
        step.classList.add("is-current");
        if (dot) dot.textContent = String(stepNum);
      } else if (dot) {
        dot.textContent = String(stepNum);
      }
    });

    document.querySelectorAll(".tracking-step__line").forEach(function (line, index) {
      line.classList.toggle("is-done", index + 1 < stepIndex);
    });
  }

  function initTrackingActions() {
    var simulateBtn = document.getElementById("tracking-simulate-pickup");
    if (!simulateBtn) return;

    simulateBtn.addEventListener("click", function () {
      setTrackingStep(3);
      var status = document.querySelector(".tracking-driver__status");
      if (status) status.textContent = "• TRIP IN PROGRESS";
      simulateBtn.textContent = "Trip started";
      simulateBtn.disabled = true;
    });
  }

  function initShareRide() {
    var copyBtn = document.getElementById("share-copy-link");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var targetId = copyBtn.getAttribute("data-copy-target");
        var input = targetId ? document.getElementById(targetId) : null;
        copyText(input ? input.value : "", copyBtn);
      });
    }

    document.querySelectorAll("[data-share-url]").forEach(function (el) {
      var url = el.getAttribute("data-share-url");
      var message = el.getAttribute("data-share-message") || "Follow my JCRide trip live:";
      var text = encodeShareText(message, url);

      if (el.id === "share-whatsapp") {
        el.href = "https://wa.me/?text=" + text;
        el.target = "_blank";
        el.rel = "noopener noreferrer";
      } else if (el.id === "share-sms") {
        el.href = "sms:?body=" + text;
      } else if (el.id === "share-email") {
        el.href =
          "mailto:?subject=" +
          encodeURIComponent("Follow my JCRide trip") +
          "&body=" +
          text;
      }
    });

    document.querySelectorAll(".share-contact__btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var url = btn.getAttribute("data-share-url");
        var message = btn.getAttribute("data-share-message") || "Follow my JCRide trip live:";
        var phone = (btn.getAttribute("data-share-phone") || "").replace(/\D/g, "");
        var text = encodeShareText(message, url);
        if (phone) {
          window.open("https://wa.me/" + phone + "?text=" + text, "_blank", "noopener,noreferrer");
        } else {
          copyText(message + " " + url, btn);
        }
      });
    });
  }

  initFindingDriver();
  initTrackingActions();
  initShareRide();
})();
