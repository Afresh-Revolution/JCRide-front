(function () {
  function loadingText(el) {
    return el.getAttribute("data-loading-text") || "Loading…";
  }

  function activateLoading(el) {
    if (!el || el.classList.contains("is-loading")) return;
    const label = el.getAttribute("aria-label") || el.textContent.trim();
    el.dataset.originalText = label;
    el.classList.add("is-loading");
    el.setAttribute("aria-busy", "true");
    if (el.tagName === "BUTTON") {
      el.disabled = true;
    }
    if (el.classList.contains("auth-loading-link")) {
      el.textContent = loadingText(el);
    }
  }

  document.querySelectorAll(".auth-login__form:not(.auth-signup__resend-form)").forEach((form) => {
    form.addEventListener("submit", (event) => {
      const submitter = event.submitter;
      const button =
        submitter && submitter.type === "submit"
          ? submitter
          : form.querySelector(".auth-login__submit[type='submit']");
      activateLoading(button);
    });
  });

  document.querySelectorAll("#admin-login-form").forEach((form) => {
    form.addEventListener("submit", () => {
      const button = form.querySelector(".admin-btn-submit[type='submit']");
      activateLoading(button);
    });
  });

  document.querySelectorAll(
    ".auth-loading-trigger, a.landing-btn[href*='/register'], a.landing-btn[href*='/portals'], a.landing-link[href*='/portals']"
  ).forEach((el) => {
    if (el.dataset.loadingBound) return;
    el.dataset.loadingBound = "1";
    if (!el.dataset.loadingText) {
      const text = el.textContent.trim().toLowerCase();
      el.dataset.loadingText = text.includes("log in") ? "Opening…" : "Loading…";
    }
    el.addEventListener("click", () => activateLoading(el));
  });
})();
