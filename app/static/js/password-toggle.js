(function () {
  const FORM_SELECTOR = [
    ".auth-login__form",
    "#admin-login-form",
    "form.form",
    ".auth-form",
  ].join(", ");

  const ICON_SHOW =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

  const ICON_HIDE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function bindPasswordToggle(input) {
    if (!input || input.dataset.passwordToggleBound) return;
    input.dataset.passwordToggleBound = "1";

    const wrap = document.createElement("div");
    wrap.className = "password-toggle-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-toggle-btn";
    button.setAttribute("aria-label", "Show password");
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = ICON_SHOW;

    button.addEventListener("click", () => {
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      button.setAttribute("aria-pressed", isHidden ? "true" : "false");
      button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
      button.innerHTML = isHidden ? ICON_HIDE : ICON_SHOW;
    });

    wrap.appendChild(button);
  }

  function initPasswordToggles(root) {
    root.querySelectorAll(FORM_SELECTOR).forEach((form) => {
      form.querySelectorAll('input[type="password"]').forEach(bindPasswordToggle);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initPasswordToggles(document));
  } else {
    initPasswordToggles(document);
  }
})();
