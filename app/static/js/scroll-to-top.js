(function () {
  "use strict";

  var threshold = 280;
  var button = null;

  function updateVisibility() {
    if (!button) return;
    var show = (window.scrollY || document.documentElement.scrollTop || 0) > threshold;
    button.classList.toggle("is-visible", show);
    button.hidden = !show;
  }

  function init() {
    if (!document.body || document.querySelector(".scroll-to-top")) return;

    button = document.createElement("button");
    button.type = "button";
    button.className = "scroll-to-top";
    button.setAttribute("aria-label", "Scroll to top");
    button.hidden = true;
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="18 15 12 9 6 15"></polyline>' +
      "</svg>";

    button.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    document.body.appendChild(button);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
