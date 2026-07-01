(function () {
  "use strict";

  var THEME_KEY = "jcride_user_theme";
  var darkToggle = document.getElementById("settings-dark-mode");

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-user-theme", "dark");
    } else if (theme === "light") {
      root.setAttribute("data-user-theme", "light");
    } else {
      root.removeAttribute("data-user-theme");
    }
  }

  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") {
      applyTheme(saved);
      if (darkToggle) {
        darkToggle.checked = saved === "dark";
      }
      return;
    }
    if (darkToggle && darkToggle.checked) {
      applyTheme("dark");
    }
  }

  if (darkToggle) {
    darkToggle.addEventListener("change", function () {
      var theme = darkToggle.checked ? "dark" : "light";
      localStorage.setItem(THEME_KEY, theme);
      applyTheme(theme);
    });
  }

  initTheme();
})();
