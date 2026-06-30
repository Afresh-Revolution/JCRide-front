(function () {
  "use strict";

  const overlay = document.getElementById("admin-confirm-overlay");
  const titleEl = document.getElementById("admin-confirm-title");
  const messageEl = document.getElementById("admin-confirm-message");
  const confirmBtn = document.getElementById("admin-confirm-btn");
  const cancelBtn = document.getElementById("admin-confirm-cancel");

  let resolveFn = null;
  let scrollLockCount = 0;

  function isOpen() {
    return Boolean(overlay && !overlay.hidden);
  }

  function lockScroll() {
    scrollLockCount += 1;
    if (scrollLockCount === 1) {
      document.body.style.overflow = "hidden";
    }
  }

  function unlockScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.body.style.overflow = "";
    }
  }

  function close(confirmed) {
    if (!overlay) return;
    overlay.hidden = true;
    unlockScroll();
    if (resolveFn) {
      const resolve = resolveFn;
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
        "admin-confirm__btn " +
        (options.variant === "danger" ? "admin-confirm__btn--danger" : "admin-confirm__btn--primary");

      if (cancelBtn) {
        cancelBtn.textContent = options.cancelLabel || "Cancel";
      }

      overlay.hidden = false;
      lockScroll();
      confirmBtn.focus();
    });
  }

  function bindEvents() {
    if (!overlay) return;

    overlay.querySelectorAll("[data-admin-confirm-cancel]").forEach(function (btn) {
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
      if (e.target === overlay) {
        close(false);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !isOpen()) return;
      e.preventDefault();
      close(false);
    });
  }

  window.AdminConfirm = {
    show: show,
    isOpen: isOpen,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindEvents);
  } else {
    bindEvents();
  }
})();
