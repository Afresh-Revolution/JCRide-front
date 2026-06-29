(function () {
  "use strict";

  var toggle = document.getElementById("admin-menu-toggle");
  var sidebar = document.getElementById("admin-sidebar");
  var backdrop = document.getElementById("admin-sidebar-backdrop");
  if (!toggle || !sidebar) return;

  var desktopQuery = window.matchMedia("(min-width: 901px)");

  function setOpen(open) {
    sidebar.classList.toggle("is-open", open);
    if (backdrop) {
      backdrop.classList.toggle("is-visible", open);
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    document.body.classList.toggle("admin-nav-open", open);
  }

  toggle.addEventListener("click", function () {
    setOpen(!sidebar.classList.contains("is-open"));
  });

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }

  sidebar.querySelectorAll(".admin-nav-item").forEach(function (link) {
    link.addEventListener("click", function () {
      setOpen(false);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  desktopQuery.addEventListener("change", function (event) {
    if (event.matches) setOpen(false);
  });
})();
