(function () {
  "use strict";

  var overlay = document.getElementById("user-confirm-overlay");
  var titleEl = document.getElementById("user-confirm-title");
  var messageEl = document.getElementById("user-confirm-message");
  var confirmBtn = document.getElementById("user-confirm-btn");
  var cancelBtn = document.getElementById("user-confirm-cancel");
  var resolveFn = null;

  function isOpen() {
    return Boolean(overlay && !overlay.hidden);
  }

  function close(confirmed) {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove("user-confirm-open");
    if (resolveFn) {
      var resolve = resolveFn;
      resolveFn = null;
      resolve(Boolean(confirmed));
    }
  }

  function show(options) {
    options = options || {};
    return new Promise(function (resolve) {
      if (!overlay || !titleEl || !messageEl || !confirmBtn) {
        resolve(window.confirm((options.title || "Confirm") + "\n\n" + (options.message || "")));
        return;
      }

      resolveFn = resolve;
      titleEl.textContent = options.title || "Confirm action";
      messageEl.textContent = options.message || "Are you sure?";
      confirmBtn.textContent = options.confirmLabel || "Confirm";
      confirmBtn.className =
        "user-confirm__btn " +
        (options.variant === "danger" ? "user-confirm__btn--danger" : "user-confirm__btn--primary");

      if (cancelBtn) {
        cancelBtn.textContent = options.cancelLabel || "Cancel";
      }

      overlay.hidden = false;
      document.body.classList.add("user-confirm-open");
      confirmBtn.focus();
    });
  }

  function bindEvents() {
    if (!overlay) return;

    overlay.querySelectorAll("[data-user-confirm-cancel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        close(false);
      });
    });

    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        close(true);
      });
    }

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !isOpen()) return;
      e.preventDefault();
      close(false);
    });
  }

  window.UserConfirm = {
    show: show,
    isOpen: isOpen,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindEvents);
  } else {
    bindEvents();
  }
})();
