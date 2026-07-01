(function () {
  "use strict";

  var toggle = document.getElementById("user-menu-toggle");
  var sidebar = document.getElementById("user-sidebar");
  var backdrop = document.getElementById("user-sidebar-backdrop");
  if (!toggle || !sidebar) return;

  var desktopQuery = window.matchMedia("(min-width: 901px)");
  var lockedScrollY = 0;

  function lockBodyScroll() {
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = "fixed";
    document.body.style.top = "-" + lockedScrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }

  function unlockBodyScroll() {
    if (document.body.style.position !== "fixed") return;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, lockedScrollY);
  }

  function setOpen(open) {
    var isMobile = !desktopQuery.matches;

    if (open && isMobile) {
      lockBodyScroll();
      sidebar.scrollTop = 0;
    } else if (!open) {
      unlockBodyScroll();
    }

    sidebar.classList.toggle("is-open", open);
    if (backdrop) {
      backdrop.classList.toggle("is-visible", open);
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    document.body.classList.toggle("user-nav-open", open);
  }

  toggle.addEventListener("click", function () {
    setOpen(!sidebar.classList.contains("is-open"));
  });

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }

  sidebar.querySelectorAll(".user-nav-item:not(.user-nav-item--soon)").forEach(function (link) {
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
