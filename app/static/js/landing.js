(function () {
  "use strict";

  var toggle = document.getElementById("menu-toggle");
  var nav = document.getElementById("landing-nav");
  var header = document.querySelector(".landing-header");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.querySelectorAll(".landing-faq__close").forEach(function (btn) {
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var item = btn.closest(".landing-faq__item");
      if (item) item.removeAttribute("open");
    });
  });

  if (header) {
    window.addEventListener("scroll", function () {
      header.classList.toggle("is-scrolled", window.scrollY > 12);
    }, { passive: true });
  }

  function reveal(el, delay) {
    window.setTimeout(function () {
      el.classList.add("is-visible");
    }, delay || 0);
  }

  if (reduceMotion) {
    document.querySelectorAll(".landing-animate, .landing-animate--child").forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

  document.querySelectorAll(".landing-animate").forEach(function (el) {
    revealObserver.observe(el);
  });

  document.querySelectorAll(
    ".landing-features, .landing-steps, .landing-stats__grid, .landing-testimonials, .landing-cities, .landing-pricing, .landing-audience"
  ).forEach(function (grid) {
    var children = grid.querySelectorAll(".landing-animate--child, .landing-testimonial, .landing-price-card, .landing-city-pill, .landing-audience-card");
    if (!children.length) return;

    var gridObserver = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      children.forEach(function (child, index) {
        reveal(child, index * 75);
      });
      gridObserver.disconnect();
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });

    gridObserver.observe(grid);
  });

  document.querySelectorAll(
    ".landing-partners, .landing-section:not(.landing-animate), .landing-faq__item"
  ).forEach(function (el) {
    if (el.classList.contains("landing-animate")) return;
    el.classList.add("landing-animate");
    revealObserver.observe(el);
  });

  var heroContent = document.querySelector(".landing-hero__content");
  if (heroContent) {
    Array.prototype.slice.call(heroContent.children).forEach(function (child, index) {
      child.classList.add("landing-animate");
      reveal(child, 120 + index * 90);
    });
  }

  var heroVisual = document.querySelector(".landing-hero__visual");
  if (heroVisual) {
    heroVisual.classList.add("landing-animate");
    reveal(heroVisual, 420);
  }

  function isIOSDevice() {
    var ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent || "");
  }

  document.querySelectorAll(".landing-mobile__btn--smart").forEach(function (btn) {
    var androidUrl = (btn.getAttribute("data-store-android") || "").trim();
    var iosUrl = (btn.getAttribute("data-store-ios") || "").trim();
    var preferIos = isIOSDevice();
    var preferAndroid = isAndroidDevice();
    var href = "";
    var platform = "App Store";

    if (preferIos && iosUrl) {
      href = iosUrl;
      platform = "App Store";
    } else if (preferAndroid && androidUrl) {
      href = androidUrl;
      platform = "Google Play";
    } else if (iosUrl) {
      href = iosUrl;
      platform = "App Store";
    } else if (androidUrl) {
      href = androidUrl;
      platform = "Google Play";
    }

    if (!href) return;
    btn.setAttribute("href", href);

    var label = btn.querySelector(".landing-mobile__btn-platform");
    if (label) label.textContent = "Download on " + platform;

    var androidIcon = btn.querySelector(".landing-mobile__btn-icon--android");
    var iosIcon = btn.querySelector(".landing-mobile__btn-icon--ios");
    if (platform === "App Store") {
      if (iosIcon) iosIcon.hidden = false;
      if (androidIcon) androidIcon.hidden = true;
    } else {
      if (androidIcon) androidIcon.hidden = false;
      if (iosIcon) iosIcon.hidden = true;
    }
  });
})();
