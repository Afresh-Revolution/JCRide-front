(function () {
  "use strict";

  const overlay = document.getElementById("admin-confirm-overlay");
  const titleEl = document.getElementById("admin-confirm-title");
  const messageEl = document.getElementById("admin-confirm-message");
  const confirmBtn = document.getElementById("admin-confirm-btn");
  const cancelBtn = document.getElementById("admin-confirm-cancel");
  const fieldEl = document.getElementById("admin-confirm-field");
  const inputEl = document.getElementById("admin-confirm-input");
  const inputLabelEl = document.getElementById("admin-confirm-input-label");
  const hintEl = document.getElementById("admin-confirm-hint");

  let resolveFn = null;
  let scrollLockCount = 0;
  let mode = "confirm";

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

  function hideInput() {
    if (fieldEl) fieldEl.hidden = true;
    if (inputEl) inputEl.value = "";
  }

  function close(confirmed) {
    if (!overlay) return;
    const value = inputEl ? inputEl.value : "";
    overlay.hidden = true;
    hideInput();
    unlockScroll();
    if (resolveFn) {
      const resolve = resolveFn;
      resolveFn = null;
      if (mode === "prompt") {
        resolve({ confirmed: Boolean(confirmed), value: value });
      } else {
        resolve(Boolean(confirmed));
      }
    }
    mode = "confirm";
  }

  function applyOptions(options) {
    options = options || {};
    titleEl.textContent = options.title || "Confirm action";
    messageEl.textContent = options.message || "Are you sure?";
    confirmBtn.textContent = options.confirmLabel || "Confirm";
    confirmBtn.className =
      "admin-confirm__btn " +
      (options.variant === "danger" ? "admin-confirm__btn--danger" : "admin-confirm__btn--primary");
    if (cancelBtn) {
      cancelBtn.textContent = options.cancelLabel || "Cancel";
    }
  }

  function show(options) {
    options = options || {};
    return new Promise(function (resolve) {
      if (!overlay || !titleEl || !messageEl || !confirmBtn) {
        resolve(window.confirm((options.title || "Confirm") + "\n\n" + (options.message || "")));
        return;
      }
      mode = "confirm";
      hideInput();
      resolveFn = resolve;
      applyOptions(options);
      overlay.hidden = false;
      lockScroll();
      confirmBtn.focus();
    });
  }

  function promptFee(options) {
    options = options || {};
    return new Promise(function (resolve) {
      if (!overlay || !titleEl || !messageEl || !confirmBtn || !inputEl) {
        const raw = window.prompt(
          (options.message || "Enter violation fee (₦)") + "\nMinimum ₦1,000",
          options.defaultValue != null ? String(options.defaultValue) : "1000"
        );
        resolve({ confirmed: raw != null && raw !== "", value: raw || "" });
        return;
      }
      mode = "prompt";
      resolveFn = resolve;
      applyOptions(options);
      if (inputLabelEl) inputLabelEl.textContent = options.inputLabel || "Violation fee (₦)";
      if (hintEl) hintEl.textContent = options.hint || "Minimum ₦1,000. Charged to the rider wallet, or locks the account until Paystack payment.";
      if (fieldEl) fieldEl.hidden = false;
      inputEl.min = options.min != null ? String(options.min) : "1000";
      inputEl.step = options.step != null ? String(options.step) : "100";
      inputEl.value = options.defaultValue != null ? String(options.defaultValue) : "1000";
      overlay.hidden = false;
      lockScroll();
      inputEl.focus();
      inputEl.select();
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
        if (mode === "prompt" && inputEl) {
          const amount = Number(inputEl.value);
          if (!Number.isFinite(amount) || amount < Number(inputEl.min || 1000)) {
            inputEl.focus();
            return;
          }
        }
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
    promptFee: promptFee,
    isOpen: isOpen,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindEvents);
  } else {
    bindEvents();
  }
})();
