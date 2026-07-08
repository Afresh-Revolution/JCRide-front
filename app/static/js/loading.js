(function (global) {
  "use strict";

  var SPINNER = '<span class="btn-spinner" aria-hidden="true"></span>';

  function isLoading(el) {
    return !!(el && el.classList && el.classList.contains("is-loading"));
  }

  function start(el, opts) {
    if (!el || isLoading(el)) return el;
    opts = opts || {};

    el.classList.add("is-loading");
    el.setAttribute("aria-busy", "true");

    // Preserve the original markup so we can restore it later.
    el.dataset.loadingHtml = el.innerHTML;

    var label = opts.text || el.getAttribute("data-loading-text") || "";
    var inner = SPINNER;
    if (label) {
      inner += '<span class="btn-loading-label">' + label + "</span>";
    }
    el.innerHTML = '<span class="btn-loading-content">' + inner + "</span>";

    var tag = el.tagName;
    if (tag === "BUTTON" || tag === "INPUT") {
      // Remember whether it was already disabled so we don't wrongly re-enable.
      el.dataset.loadingReenable = el.disabled ? "" : "1";
      el.disabled = true;
    } else {
      el.setAttribute("aria-disabled", "true");
    }
    return el;
  }

  function stop(el) {
    if (!el || !isLoading(el)) return el;

    el.classList.remove("is-loading");
    el.removeAttribute("aria-busy");

    if (typeof el.dataset.loadingHtml === "string") {
      el.innerHTML = el.dataset.loadingHtml;
      delete el.dataset.loadingHtml;
    }

    var tag = el.tagName;
    if (tag === "BUTTON" || tag === "INPUT") {
      if (el.dataset.loadingReenable === "1") {
        el.disabled = false;
      }
      delete el.dataset.loadingReenable;
    } else {
      el.removeAttribute("aria-disabled");
    }
    return el;
  }

  // Wrap a promise so the element shows a loading state until it settles.
  function wrap(el, promise, opts) {
    if (!el) return promise;
    start(el, opts);
    if (promise && typeof promise.then === "function") {
      var done = function () {
        stop(el);
      };
      promise.then(done, done);
    } else {
      stop(el);
    }
    return promise;
  }

  function resolveSubmitButton(form, submitter) {
    if (submitter && (submitter.type === "submit" || submitter.tagName === "BUTTON")) {
      return submitter;
    }
    return form.querySelector(
      'button[type="submit"], input[type="submit"], button:not([type])'
    );
  }

  // Automatically show a loading state on native (non-intercepted) form submits.
  // If a page's own handler calls preventDefault() (e.g. fetch-based forms), it is
  // responsible for its own loading state via ButtonLoading, so we skip those.
  document.addEventListener(
    "submit",
    function (event) {
      if (event.defaultPrevented) return;
      var form = event.target;
      if (!form || form.tagName !== "FORM") return;
      if (form.hasAttribute("data-no-loading")) return;

      var btn = resolveSubmitButton(form, event.submitter);
      if (!btn) return;
      if (btn.hasAttribute("data-no-loading") || isLoading(btn)) return;

      // Native submit navigates away, so no reset is required.
      start(btn);
    },
    false
  );

  global.ButtonLoading = {
    start: start,
    stop: stop,
    wrap: wrap,
    isLoading: isLoading,
  };
})(window);
