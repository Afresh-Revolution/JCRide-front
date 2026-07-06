(function () {

  "use strict";

  var mobileQuery = window.matchMedia("(max-width: 900px)");

  function syncTopbarOffset() {
    var topbar = document.querySelector(".admin-topbar");
    if (!topbar) return;

    var bottom = Math.ceil(topbar.getBoundingClientRect().bottom);
    if (bottom < 1) {
      bottom = Math.ceil(topbar.offsetHeight);
    }

    document.documentElement.style.setProperty("--dash-topbar-offset", bottom + "px");
  }

  function scheduleTopbarOffsetSync() {
    window.requestAnimationFrame(syncTopbarOffset);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleTopbarOffsetSync);
  }

  window.addEventListener("load", scheduleTopbarOffsetSync);
  window.addEventListener("resize", scheduleTopbarOffsetSync);
  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener("change", scheduleTopbarOffsetSync);
  } else if (mobileQuery.addListener) {
    mobileQuery.addListener(scheduleTopbarOffsetSync);
  }

  if (typeof ResizeObserver !== "undefined") {
    var topbar = document.querySelector(".admin-topbar");
    if (topbar) {
      new ResizeObserver(scheduleTopbarOffsetSync).observe(topbar);
    }
  }

  scheduleTopbarOffsetSync();

  var configs = [
    {
      toggleId: "admin-menu-toggle",
      sidebarId: "admin-sidebar",
      backdropId: "admin-sidebar-backdrop",
      bodyClass: "admin-nav-open",
    },
    {
      toggleId: "driver-menu-toggle",
      sidebarId: "driver-sidebar",
      backdropId: "driver-sidebar-backdrop",
      bodyClass: "admin-nav-open",
    },
    {
      toggleId: "user-menu-toggle",
      sidebarId: "user-sidebar",
      backdropId: "user-sidebar-backdrop",
      bodyClass: "admin-nav-open",
    },
  ];

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

  configs.forEach(function (cfg) {
    var toggle = document.getElementById(cfg.toggleId);
    var sidebar = document.getElementById(cfg.sidebarId);
    var backdrop = document.getElementById(cfg.backdropId);
    if (!toggle || !sidebar) return;

    var desktopQuery = window.matchMedia("(min-width: 901px)");

    function setOpen(open) {
      var isMobile = !desktopQuery.matches;

      if (open && isMobile) {
        syncTopbarOffset();
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
      if (cfg.bodyClass) {
        document.body.classList.toggle(cfg.bodyClass, open);
      }
      if (cfg.sidebarId === "user-sidebar") {
        document.body.classList.toggle("user-nav-open", open);
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(!sidebar.classList.contains("is-open"));
    });

    if (backdrop) {
      backdrop.addEventListener("click", function () {
        setOpen(false);
      });
    }

    sidebar.querySelectorAll(".admin-nav-item:not(.admin-nav-item--soon), .admin-sidebar__logout, .driver-sidebar__logout, .admin-sidebar__help-btn").forEach(function (link) {
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
  });
})();
